import { NextRequest, NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";
import { extractReport, clarificationQuestions } from "@/lib/extract";
import { insertReport, updateReport, getReport, mediaDir, id } from "@/lib/db";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_BYTES = 12 * 1024 * 1024;
const AUDIO_EXT: Record<string, string> = {
  "audio/webm": "webm", "audio/ogg": "ogg", "audio/mpeg": "mp3",
  "audio/wav": "wav", "audio/x-wav": "wav", "audio/mp4": "m4a",
};
const IMAGE_EXT: Record<string, string> = {
  "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp",
};

async function save(file: File, kind: "audio" | "image"): Promise<string | null> {
  if (!file || file.size === 0) return null;
  if (file.size > MAX_BYTES) throw new Error(`${kind} exceeds ${MAX_BYTES / 1024 / 1024}MB`);
  const table = kind === "audio" ? AUDIO_EXT : IMAGE_EXT;
  const ext = table[file.type] ?? (kind === "audio" ? "webm" : "jpg");
  const name = `${id()}.${ext}`;
  const dest = path.join(mediaDir(), name);
  fs.writeFileSync(dest, Buffer.from(await file.arrayBuffer()));
  return dest;
}

/**
 * Intake. Creates the Report as evidence first, then extracts. The report row
 * exists even if the model call fails, so a citizen's submission is never lost
 * to an inference error.
 */
export async function POST(req: NextRequest) {
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "expected multipart/form-data" }, { status: 400 });
  }

  const text = (form.get("text") as string | null)?.slice(0, 4000) ?? null;
  const locationText = (form.get("location_text") as string | null)?.slice(0, 500) ?? null;
  const latRaw = form.get("lat") as string | null;
  const lonRaw = form.get("lon") as string | null;
  const lat = latRaw ? Number(latRaw) : null;
  const lon = lonRaw ? Number(lonRaw) : null;

  let audioPath: string | null = null;
  let imagePath: string | null = null;
  try {
    audioPath = await save(form.get("audio") as File, "audio");
    imagePath = await save(form.get("image") as File, "image");
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 413 });
  }

  if (!text?.trim() && !audioPath && !imagePath) {
    return NextResponse.json(
      { error: "a report needs text, a voice note, or a photo" },
      { status: 400 },
    );
  }

  const rid = id();
  insertReport({
    id: rid,
    status: "draft",
    raw_text: text,
    audio_path: audioPath,
    image_path: imagePath,
    lat: Number.isFinite(lat) ? lat : null,
    lon: Number.isFinite(lon) ? lon : null,
    location_text: locationText,
  });

  const result = await extractReport({ text, audioPath, imagePath, locationText });

  if (!result.ok) {
    updateReport(rid, {
      model: result.model,
      latency_ms: result.latencyMs,
      repairs_json: JSON.stringify(result.repairs),
    });
    return NextResponse.json(
      { report_id: rid, error: result.error ?? "extraction failed", recoverable: true },
      { status: 502 },
    );
  }

  updateReport(rid, {
    extraction_json: JSON.stringify(result.data),
    repairs_json: JSON.stringify(result.repairs),
    model: result.model,
    latency_ms: result.latencyMs,
  });

  return NextResponse.json({
    report_id: rid,
    extraction: result.data,
    questions: clarificationQuestions(result.data!),
    repairs: result.repairs,
    latency_ms: result.latencyMs,
  });
}

/** Fetch a draft report so the confirmation screen can re-read it. */
export async function GET(req: NextRequest) {
  const rid = req.nextUrl.searchParams.get("id");
  if (!rid) return NextResponse.json({ error: "id required" }, { status: 400 });
  const row = getReport(rid);
  if (!row) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({
    report_id: row.id,
    status: row.status,
    extraction: row.extraction_json ? JSON.parse(row.extraction_json) : null,
  });
}
