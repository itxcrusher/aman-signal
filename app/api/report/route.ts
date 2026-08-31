import { NextRequest, NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";
import { extractReport, clarificationQuestions } from "@/lib/extract";
import { insertReport, updateReport, getReport, getReportByClientKey, id } from "@/lib/db";
import { saveUpload } from "@/lib/media";

export const runtime = "nodejs";
export const maxDuration = 60;

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
  const accRaw = form.get("accuracy") as string | null;
  // Identity without an account. The device-scoped id lets someone see their own
  // reports later; the phone number lets an operator call back, which is the most
  // useful thing they can do. Neither is required, because a report from someone
  // who filled nothing in is still a report.
  // Sent from the outbox after connectivity returned, rather than composed live.
  const queuedOffline = form.get("queued_offline") === "1";
  const clientKey = (form.get("client_key") as string | null)?.trim().slice(0, 64) || null;

  /**
   * A repeat of a send whose response the phone never saw.
   *
   * Returned rather than re-extracted: the report is already here, the media is
   * already on disk, and running the model again would spend a second call and
   * risk a different reading of the same recording. What the caller needs is the
   * id, so that it can finish confirming the report it already sent.
   */
  if (clientKey) {
    const existing = getReportByClientKey(clientKey);
    if (existing) {
      const prior = existing.extraction_json
        ? (JSON.parse(existing.extraction_json) as unknown)
        : null;
      return NextResponse.json({
        report_id: existing.id,
        extraction: prior,
        questions: [],
        repairs: existing.repairs_json ? JSON.parse(existing.repairs_json) : [],
        image_dropped: false,
        latency_ms: existing.latency_ms,
        resumed: true,
      });
    }
  }
  const reporterId = (form.get("reporter_id") as string | null)?.trim().slice(0, 64) || null;
  const reporterName = (form.get("reporter_name") as string | null)?.trim().slice(0, 120) || null;
  const reporterPhone = (form.get("reporter_phone") as string | null)?.replace(/[^\d+ -]/g, "").trim().slice(0, 20) || null;
  const lat = latRaw ? Number(latRaw) : null;
  const lon = lonRaw ? Number(lonRaw) : null;
  const accuracy = accRaw ? Number(accRaw) : null;

  let audioPath: string | null = null;
  let imagePath: string | null = null;
  try {
    audioPath = await saveUpload(form.get("audio") as File | null, "audio");
    imagePath = await saveUpload(form.get("image") as File | null, "image");
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
    accuracy_m: accuracy !== null && Number.isFinite(accuracy) ? accuracy : null,
    location_text: locationText,
    reporter_id: reporterId,
    reporter_name: reporterName,
    reporter_phone: reporterPhone,
    queued_offline: queuedOffline ? 1 : 0,
    client_key: clientKey,
  });

  let result = await extractReport({ text, audioPath, imagePath, locationText });

  /**
   * A photo the model refuses must not cost the rest of the report.
   *
   * Phones write formats the model does not accept: HEIC by default on iPhones,
   * increasingly AVIF on Android, and anything at all for an image saved from a
   * browser. Previously one such file failed the whole call, so a reporter who
   * had recorded a voice note, written a description and attached their location
   * lost all three because of the attachment. The photo is the least important
   * of the four and is the only one dropped.
   *
   * Only retried when something else was actually sent. A report that was only a
   * photo has nothing left to extract, and retrying would produce a confident
   * empty incident, which is worse than an honest failure.
   */
  const hadOtherContent = Boolean(text?.trim() || audioPath);
  let imageDropped = false;
  if (!result.ok && result.reason === "image_rejected" && hadOtherContent) {
    console.warn(`[report ${rid}] model rejected the photo, retrying without it: ${result.error}`);
    result = await extractReport({ text, audioPath, imagePath: null, locationText });
    imageDropped = result.ok;
  }

  if (!result.ok) {
    // The upstream text is diagnostic and stays server-side. Sending
    // "InternalError.Algo.InvalidParameter" to someone standing in a flood tells
    // them nothing they can act on; the client gets a reason it can translate.
    console.error(`[report ${rid}] extraction failed (${result.reason ?? "unknown"}): ${result.error}`);
    updateReport(rid, {
      model: result.model,
      latency_ms: result.latencyMs,
      repairs_json: JSON.stringify([...result.repairs, `failed: ${result.error ?? "unknown"}`]),
    });
    return NextResponse.json(
      { report_id: rid, reason: result.reason ?? "upstream", recoverable: true },
      { status: 502 },
    );
  }

  // Recorded as a repair so the operator's evidence panel shows that a photo was
  // attached and could not be read, rather than silently showing no photo.
  const repairs = imageDropped
    ? [...result.repairs, "photo could not be read by the model and was excluded"]
    : result.repairs;

  updateReport(rid, {
    extraction_json: JSON.stringify(result.data),
    repairs_json: JSON.stringify(repairs),
    model: result.model,
    latency_ms: result.latencyMs,
  });

  return NextResponse.json({
    report_id: rid,
    extraction: result.data,
    questions: clarificationQuestions(result.data!, {
      hasCoordinates: Number.isFinite(lat) && Number.isFinite(lon),
    }),
    repairs,
    image_dropped: imageDropped,
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
