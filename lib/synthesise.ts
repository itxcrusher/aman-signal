import type { Extraction } from "./schema";

/**
 * Rewrite an incident's summary from everything reported about it so far.
 *
 * An incident's summary was written from its first report and never changed
 * again, so a reporter who sent "water at the knee" and later "water at the
 * waist, we are on the roof" left a board still describing the knee. The
 * structured fields underneath already accumulated correctly, because they are
 * derived from every linked report; only the sentence a dispatcher reads first
 * went stale.
 *
 * This is a synthesis of evidence, not a replacement for it. Every report stays
 * exactly as submitted and remains visible in the evidence panel in order,
 * because how a situation changed is often the most operationally useful thing
 * about it. What changes is only the one-line reading at the top.
 *
 * Bounded deliberately. It never invents a development nobody reported, never
 * sums people across reports, and prefers the most recent claim when reports
 * disagree about something that changes over time, while leaving genuine
 * disagreement to the conflict machinery that already surfaces it.
 */

const BASE =
  process.env.DASHSCOPE_BASE_URL ?? "https://dashscope-intl.aliyuncs.com/compatible-mode/v1";
const DEFAULT_MODEL = process.env.DASHSCOPE_MODEL ?? "qwen3.5-omni-flash";

const PROMPT = `You are maintaining the one-line situation summary for a single flood emergency in Pakistan.

You are given every report received about this ONE emergency, oldest first. Later reports are updates from the same or another reporter about the same place.

Write ONE English sentence, at most 40 words, describing the CURRENT situation.

Rules:
- Describe the situation as it now stands. If a later report says the water rose or people moved, the summary reflects that, not the earlier state.
- Never invent anything not present in the reports.
- Never add up people across reports. Five reports of "two trapped" is two people, not ten.
- If reports disagree about something that does not change over time, say the most recent claim plainly and do not editorialise about the disagreement.
- Do not mention report counts, timestamps, or that updates exist.
- Plain factual language. No urgency adjectives, no calls to action.

Reply with the sentence only. No JSON, no quotes, no preamble.`;

export type SynthesisResult = {
  ok: boolean;
  summary?: string;
  error?: string;
  latencyMs: number;
};

/**
 * @param reports oldest first, each the extraction of one report plus its raw text
 */
export async function synthesiseSummary(
  reports: { extraction: Extraction | null; rawText: string | null; at: number }[],
  opts: { model?: string; apiKey?: string; signal?: AbortSignal } = {},
): Promise<SynthesisResult> {
  const started = Date.now();
  const apiKey = opts.apiKey ?? process.env.DASHSCOPE_API_KEY;
  const model = opts.model ?? DEFAULT_MODEL;

  if (!apiKey) return { ok: false, error: "DASHSCOPE_API_KEY is not configured", latencyMs: 0 };

  // One report needs no synthesis: its own summary already is the summary, and a
  // model call to restate it would cost latency and risk drift for nothing.
  if (reports.length < 2) {
    return { ok: false, error: "nothing to synthesise from a single report", latencyMs: 0 };
  }

  const body = reports
    .map((r, i) => {
      const parts = [
        r.extraction?.english_summary?.trim(),
        r.extraction?.transcript_urdu?.trim(),
        r.rawText?.trim(),
      ].filter(Boolean);
      const people = r.extraction?.people_affected;
      const meta = [
        r.extraction?.urgency_indicators?.length
          ? `indicators: ${r.extraction.urgency_indicators.join(", ")}`
          : null,
        typeof people === "number" ? `people affected: ${people}` : null,
        r.extraction?.road_access && r.extraction.road_access !== "unknown"
          ? `road: ${r.extraction.road_access}`
          : null,
      ].filter(Boolean);
      return `Report ${i + 1}${i === 0 ? " (original)" : " (update)"}:\n${parts.join("\n")}${
        meta.length ? `\n${meta.join(" | ")}` : ""
      }`;
    })
    .join("\n\n");

  try {
    const res = await fetch(`${BASE}/chat/completions`, {
      method: "POST",
      signal: opts.signal ?? AbortSignal.timeout(30_000),
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        temperature: 0.1,
        modalities: ["text"],
        messages: [
          { role: "system", content: PROMPT },
          { role: "user", content: body },
        ],
      }),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return {
        ok: false,
        error: `synthesis endpoint returned ${res.status}: ${text.slice(0, 200)}`,
        latencyMs: Date.now() - started,
      };
    }

    const json = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    const raw = json.choices?.[0]?.message?.content?.trim();
    if (!raw) {
      return { ok: false, error: "synthesis returned no text", latencyMs: Date.now() - started };
    }

    // The model is asked for a bare sentence; strip the quoting it sometimes adds
    // anyway, and refuse anything long enough to be a paragraph rather than a
    // summary, since the board renders this in two lines.
    const summary = raw.replace(/^["'`]+|["'`]+$/g, "").split("\n")[0].trim();
    if (!summary || summary.length > 400) {
      return { ok: false, error: "synthesis was not a usable sentence", latencyMs: Date.now() - started };
    }

    return { ok: true, summary, latencyMs: Date.now() - started };
  } catch (err) {
    return { ok: false, error: `synthesis failed: ${(err as Error).message}`, latencyMs: Date.now() - started };
  }
}
