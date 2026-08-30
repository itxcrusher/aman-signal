import fs from "node:fs";
import { normaliseExtraction, type Extraction, type NormaliseResult } from "./schema";

/**
 * Qwen-Omni via Alibaba Cloud Model Studio (OpenAI-compatible, Singapore).
 *
 * Measured 2026-08-28 against this endpoint: qwen3.5-omni-flash 12.9% WER / 7.3s
 * median, qwen3.5-omni-plus 10.4% / 10.5s (n=8, FLEURS ur_pk). Flash is the default:
 * intake is interactive and the citizen confirmation step covers the accuracy gap.
 *
 * Omni requires streaming; a non-streamed request is rejected by the API.
 */

const BASE =
  process.env.DASHSCOPE_BASE_URL ??
  "https://dashscope-intl.aliyuncs.com/compatible-mode/v1";

export const DEFAULT_MODEL = process.env.AMANSIGNAL_MODEL ?? "qwen3.5-omni-flash";

const EXTRACT_PROMPT = `You are a disaster-report intake system for flood emergencies in Pakistan.
Interpret the citizen's report and return ONLY a JSON object, no prose, no markdown fence, with these keys:
language_detected (one of: ur, ur-Latn, en, mixed)
transcript_urdu (the report written in Urdu script)
transcript_roman_urdu (the same words in Latin letters, as Pakistanis type on WhatsApp)
english_summary (one or two sentences)
incident_type (one of: flood_entrapment, flood_damage, medical_emergency, blocked_access, other)
urgency_indicators (array, each one of: trapped_people, medical_need, rising_water, blocked_access, no_safe_route, structural_damage)
people_affected (integer, or null if not stated)
vulnerable_people (array, each one of: elderly, children, disabled, pregnant, injured)
road_access (one of: open, partial, blocked, unknown)
resources_required (array, each one of: rescue_boat, medical_team, evacuation, food_water, shelter)
locations_mentioned (array of strings, preserved exactly as the reporter said them, including colloquial descriptions)
missing_information (array of strings: what a dispatcher would still need to ask)

How to write the transcripts:
If the report was SPOKEN, always fill transcript_urdu in Urdu script, whatever script you would otherwise choose. The reporter reads that line back to check you understood them, and most Urdu speakers read Urdu script, not Latin. Fill transcript_roman_urdu with the same words in Latin letters.
If the report was TYPED, transcribe it in the script the reporter used and provide the other form as well where you can.
language_detected describes the language the reporter used, not the script you wrote the transcript in. Urdu spoken aloud is "ur" even when you also render it in Latin letters.
Leave transcript_urdu empty only when the report is genuinely not Urdu at all, for example plain English.

How to treat an attached photo:
Report only what is VISIBLE in it. Water, damage, a blocked road and visible people are all things you may report if you can see them.
Do NOT infer people from an empty scene. If a photo shows a flooded street but no people, do not report trapped_people; say under missing_information that it is unknown whether anyone is trapped.
Do not infer a head count from a photo. people_affected comes from what the reporter states, not from what a picture implies.
If the photo and the written report disagree, report both and note the disagreement in missing_information rather than choosing one.

How to judge road_access, which reporters describe in degrees:
"blocked" means nothing can get through.
"partial" means some traffic still passes but not all, for example a motorcycle or a person on foot can get through but a car or ambulance cannot. Phrases like "motorcycle guzar sakti hai" or "raasta poori tarah band nahi hua" mean partial, NOT blocked.
"open" means normal access.
"unknown" means the report does not say.

Rules you must follow:
Never invent details that are not in the report. If something was not stated, use null or an empty array and name the gap in missing_information.
Use the exact enum values listed above, not free text.
If the report does not describe an emergency, set incident_type to "other" and say so in missing_information.`;

export type ExtractInput = {
  text?: string | null;
  audioPath?: string | null;
  imagePath?: string | null;
  locationText?: string | null;
};

export type ExtractResult = {
  ok: boolean;
  data?: Extraction;
  repairs: string[];
  error?: string;
  raw?: string;
  model: string;
  latencyMs: number;
};

type ContentPart =
  | { type: "text"; text: string }
  | { type: "input_audio"; input_audio: { data: string; format: string } }
  | { type: "image_url"; image_url: { url: string } };

function dataUrl(path: string, mime: string) {
  return `data:${mime};base64,` + fs.readFileSync(path).toString("base64");
}

function audioFormat(path: string) {
  const ext = path.split(".").pop()?.toLowerCase() ?? "wav";
  return ext === "m4a" ? "mp4" : ext;
}

function imageMime(path: string) {
  const ext = path.split(".").pop()?.toLowerCase();
  return ext === "png" ? "image/png" : ext === "webp" ? "image/webp" : "image/jpeg";
}

/** Models sometimes wrap JSON in a fence despite instructions. */
function extractJson(text: string): unknown {
  const t = text.trim();
  const start = t.indexOf("{");
  const end = t.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;
  try {
    return JSON.parse(t.slice(start, end + 1));
  } catch {
    return null;
  }
}

export async function extractReport(
  input: ExtractInput,
  opts: { model?: string; apiKey?: string; signal?: AbortSignal } = {},
): Promise<ExtractResult> {
  const model = opts.model ?? DEFAULT_MODEL;
  const apiKey = opts.apiKey ?? process.env.DASHSCOPE_API_KEY;
  const started = Date.now();

  if (!apiKey) {
    return { ok: false, repairs: [], error: "DASHSCOPE_API_KEY is not configured", model, latencyMs: 0 };
  }

  const content: ContentPart[] = [];
  if (input.audioPath) {
    content.push({
      type: "input_audio",
      input_audio: {
        data: dataUrl(input.audioPath, ""),
        format: audioFormat(input.audioPath),
      },
    });
  }
  if (input.imagePath) {
    content.push({ type: "image_url", image_url: { url: dataUrl(input.imagePath, imageMime(input.imagePath)) } });
  }

  const written = [
    input.text?.trim() ? `Reporter wrote: ${input.text.trim()}` : null,
    input.locationText?.trim() ? `Reporter described the location as: ${input.locationText.trim()}` : null,
  ].filter(Boolean);

  content.push({
    type: "text",
    text: EXTRACT_PROMPT + (written.length ? `\n\n${written.join("\n")}` : ""),
  });

  let raw = "";
  try {
    const res = await fetch(`${BASE}/chat/completions`, {
      method: "POST",
      signal: opts.signal,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        stream: true,
        temperature: 0.1,
        modalities: ["text"],
        messages: [{ role: "user", content }],
      }),
    });

    if (!res.ok || !res.body) {
      const body = await res.text().catch(() => "");
      return {
        ok: false,
        repairs: [],
        error: `model endpoint returned ${res.status}: ${body.slice(0, 300)}`,
        model,
        latencyMs: Date.now() - started,
      };
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
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
          const chunk = JSON.parse(payload);
          const delta = chunk?.choices?.[0]?.delta?.content;
          if (typeof delta === "string") raw += delta;
        } catch {
          // A partial SSE frame; the next read completes it.
        }
      }
    }
  } catch (err) {
    return {
      ok: false,
      repairs: [],
      error: `model call failed: ${(err as Error).message}`,
      model,
      latencyMs: Date.now() - started,
    };
  }

  const latencyMs = Date.now() - started;
  const parsed = extractJson(raw);
  if (parsed === null) {
    return { ok: false, repairs: [], error: "model output was not parseable JSON", raw, model, latencyMs };
  }

  const norm: NormaliseResult = normaliseExtraction(parsed);
  if (!norm.ok) {
    return { ok: false, repairs: norm.repairs, error: norm.error, raw, model, latencyMs };
  }
  return { ok: true, data: norm.data, repairs: norm.repairs, raw, model, latencyMs };
}

/** Does the model's own missing_information list mention this concern? */
function flaggedMissing(e: Extraction, ...terms: string[]): boolean {
  const hay = e.missing_information.join(" ").toLowerCase();
  return terms.some((t) => hay.includes(t));
}

/**
 * A location string is only useful to a dispatcher if it can be found. "hamare ghar"
 * ("our house") is a non-answer that still populates the array, so presence alone is
 * not the test; the model's own gap report is the better signal.
 */
const VAGUE_LOCATION = /^(hamare?|mere?|humara|apna|our|my)\s+(ghar|home|house|area|mohalla|gaon|village)$|^(ghar|home|house|yahan|here|upar|neeche|andar|bahar)$/i;

function hasUsableLocation(e: Extraction): boolean {
  const usable = e.locations_mentioned.filter((l) => !VAGUE_LOCATION.test(l.trim()));
  if (usable.length === 0) return false;
  return !flaggedMissing(e, "location", "address", "landmark", "area", "coordinates");
}

/**
 * The one or two highest-value gaps worth asking the citizen about.
 * Nothing is asked when the report is not an emergency: the schema mismatch is the
 * finding, and interrogating someone about a non-emergency wastes their time.
 */
export function clarificationQuestions(
  e: Extraction,
  opts: { hasCoordinates?: boolean } = {},
): { field: string; ur: string; en: string }[] {
  const qs: { field: string; ur: string; en: string }[] = [];
  if (e.incident_type === "other" && e.urgency_indicators.length === 0) return qs;

  // Location is deliberately NOT asked here. The confirmation screen carries a
  // dedicated address field directly above these questions, so a landmark
  // question underneath it asks twice for the same thing and reads as though the
  // answer just given was not read. The two questions available are worth more
  // spent on what nothing else collects.
  if (e.people_affected === null && e.urgency_indicators.includes("trapped_people")) {
    qs.push({
      field: "people_affected",
      ur: "کتنے افراد پھنسے ہوئے ہیں؟",
      en: "How many people are trapped?",
    });
  }
  if (qs.length < 2 && e.urgency_indicators.includes("medical_need") && e.english_summary.length < 40) {
    qs.push({
      field: "medical_detail",
      ur: "طبی مدد کس لیے درکار ہے؟ مختصر بتائیں۔",
      en: "What is the medical help needed for? Briefly.",
    });
  }
  return qs.slice(0, 2);
}
