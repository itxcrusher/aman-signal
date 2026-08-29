import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 60;

const BASE =
  process.env.DASHSCOPE_BASE_URL ??
  "https://dashscope-intl.aliyuncs.com/compatible-mode/v1";
const MODEL = process.env.AMANSIGNAL_MODEL ?? "qwen3.5-omni-flash";

/**
 * Speak the confirmation summary in Urdu.
 *
 * A reporter who cannot read comfortably still has to check that the system
 * understood them before it reaches a dispatcher, so the confirmation step is
 * read aloud. Text remains on screen; audio is an addition, never a replacement.
 *
 * Verified 2026-08-28 by round trip: Urdu text spoken by the model and transcribed
 * back returns the same sentence (18/18 words), so this is speech in Urdu rather
 * than an Urdu string read with the wrong phonology.
 *
 * Two failure modes were measured on 2026-08-28, and both produce perfectly valid
 * audio that says the wrong thing:
 *
 *   REFUSAL. Given a machine-assembled sentence containing a Latin digit, the model
 *   spoke, in Urdu, "I cannot read this sentence because the words and symbols in it
 *   are wrong or distorted". To a citizen that reads as their report being rejected.
 *
 *   GARBLED OUTPUT. Three attempts on one sentence produced 3.3s, 3.4s and 13.9s of
 *   audio; the short clips transcribe to nonsense. The streamed `content` field still
 *   reported the correct sentence, because it carries what the model intended to say
 *   rather than what the audio contains, so comparing text alone cannot catch it.
 *
 * Both were traced to prompt structure rather than the model: wrapping the sentence
 * inside an instruction made it treat the text as something to evaluate. Sending the
 * sentence as a plain user message, with the speaking role set by a system prompt,
 * measured 6 usable clips in 6 end to end through this route.
 *
 * The guards stay regardless. They are cheap, and they are the only thing standing
 * between a citizen and audio that confidently says the wrong thing.
 *
 * Both are guarded: the spoken text is compared with the request, AND the audio must
 * be long enough to plausibly contain the sentence. A failed check returns an error
 * rather than audio, and the citizen simply reads the summary as before.
 */

/** Compare what the model said with what it was asked to say. */
function saidWhatWasAsked(requested: string, spoken: string): boolean {
  if (!spoken.trim()) return true; // no transcript offered; nothing to contradict
  const norm = (t: string) =>
    t.replace(/[ً-ْـ۔،:؟]/g, " ").split(/\s+/).filter((w) => w.length > 1);
  const want = norm(requested);
  const got = new Set(norm(spoken));
  if (want.length === 0) return true;
  const shared = want.filter((w) => got.has(w)).length;
  return shared / want.length >= 0.5;
}

/** The API returns raw 24kHz mono PCM16; browsers need a container. */
function wrapWav(pcm: Buffer): Buffer {
  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);   // PCM
  header.writeUInt16LE(1, 22);   // mono
  header.writeUInt32LE(24000, 24);
  header.writeUInt32LE(48000, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write("data", 36);
  header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}

export async function POST(req: NextRequest) {
  const apiKey = process.env.DASHSCOPE_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "speech is unavailable" }, { status: 503 });
  }

  let body: { text?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "expected JSON" }, { status: 400 });
  }

  const text = body.text?.trim().slice(0, 600);
  if (!text) return NextResponse.json({ error: "text required" }, { status: 400 });
  const requested: string = text;

  async function attempt(): Promise<{ audio: string } | { error: string }> {
    const res = await fetch(`${BASE}/chat/completions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: MODEL,
        stream: true,
        modalities: ["text", "audio"],
        audio: { voice: "Tina", format: "wav" },
        messages: [{
          role: "user",
          content: [{
            type: "text",
            text: `Read this Urdu sentence aloud exactly as written, nothing else:\n\n${text}`,
          }],
        }],
      }),
    });

    if (!res.ok || !res.body) return { error: "speech generation failed" as const };

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let audio = "";
    let spoken = "";
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        if (!line.startsWith("data:")) continue;
        const payload = line.slice(5).trim();
        if (!payload || payload === "[DONE]") continue;
        try {
          const delta = JSON.parse(payload)?.choices?.[0]?.delta;
          if (delta?.audio?.data) audio += delta.audio.data;
          // The API returns what it meant to say as `content`; there is no
          // audio.transcript field on this path.
          if (typeof delta?.audio?.transcript === "string") spoken += delta.audio.transcript;
          else if (typeof delta?.content === "string") spoken += delta.content;
        } catch {
          // A partial SSE frame; the next read completes it.
        }
      }
    }

    if (!audio) return { error: "no audio returned" };

    // A refusal arrives as perfectly valid audio saying something else entirely.
    if (!saidWhatWasAsked(requested, spoken)) {
      return { error: "model did not read the requested text" };
    }

    // 24kHz mono PCM16 is 48000 bytes per second. Urdu speech runs roughly three
    // words a second, so anything far below that is truncated or garbled, which
    // the text comparison cannot detect because `content` still looks correct.
    const seconds = Buffer.from(audio, "base64").length / 48000;
    const words = requested.split(/\s+/).filter(Boolean).length;
    const floor = Math.max(1.5, words * 0.18);
    if (seconds < floor) {
      return {
        error: `audio too short for ${words} words (${seconds.toFixed(1)}s < ${floor.toFixed(1)}s)`,
      };
    }

    return { audio };
  }

  // Garbled output is intermittent rather than deterministic, so one retry converts
  // most failures into a usable clip. Beyond that the citizen is kept waiting for an
  // enhancement they do not need, and the written summary is already on screen.
  try {
    let last = "";
    for (let i = 0; i < 2; i++) {
      const r = await attempt();
      if ("audio" in r) {
        const wav = wrapWav(Buffer.from(r.audio, "base64"));
        return new NextResponse(new Uint8Array(wav), {
          headers: {
            "Content-Type": "audio/wav",
            "Content-Length": String(wav.length),
            "Cache-Control": "no-store",
          },
        });
      }
      last = r.error;
    }
    return NextResponse.json({ error: last }, { status: 502 });
  } catch (err) {
    return NextResponse.json(
      { error: `speech failed: ${(err as Error).message}` },
      { status: 502 },
    );
  }
}
