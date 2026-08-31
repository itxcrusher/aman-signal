import { NextRequest, NextResponse } from "next/server";
import {
  getReport,
  insertReport,
  updateReport,
  linkReportToIncident,
  reportsFor,
  setIncidentSynthesis,
  audit,
  id,
} from "@/lib/db";
import { extractReport } from "@/lib/extract";
import { synthesiseSummary } from "@/lib/synthesise";
import { saveUpload } from "@/lib/media";
import type { Extraction } from "@/lib/schema";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * A reporter adding to what they already sent: more text, another voice note,
 * another photo.
 *
 * Deliberately not an edit. A report is evidence of what a person said at a
 * moment, and rewriting it destroys the thing that makes the incident above it
 * defensible: an operator who acted on "two children on the roof" needs that
 * sentence to still exist afterwards, even once the situation has moved on.
 *
 * So an update is a new report carrying the same reporter and the same place,
 * linked directly to the incident the first one belongs to. Both stay visible in
 * the evidence panel in order, which tells a dispatcher more than a corrected
 * single entry: "water at the knee, then at the waist" is exactly the change
 * that decides whether a boat is still enough.
 *
 * What DOES change is the incident's one-line summary, resynthesised from every
 * report once an update arrives. The structured fields already accumulated
 * correctly, being derived from all linked reports; only the sentence a
 * dispatcher reads first went stale. An operator's correction always wins over
 * the resynthesis: a human who has spoken to the reporter knows more than a
 * model reading them.
 */
export async function POST(req: NextRequest) {
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "expected multipart/form-data" }, { status: 400 });
  }

  const reporterId = (form.get("reporter_id") as string | null)?.trim();
  const reportId = (form.get("report_id") as string | null)?.trim();
  const text = (form.get("text") as string | null)?.trim().slice(0, 2000) ?? "";

  if (!reporterId || reporterId.length < 8 || !reportId) {
    return NextResponse.json({ error: "reporter_id and report_id required" }, { status: 400 });
  }

  const original = getReport(reportId);
  // Scoped to the reporter's own device id, so nobody can add to a stranger's
  // report. A missing report and someone else's answer identically, so this
  // cannot be used to discover other people's ids.
  if (!original || original.reporter_id !== reporterId) {
    return NextResponse.json({ error: "report not found" }, { status: 404 });
  }
  if (!original.incident_id) {
    // Still waiting on an operator's duplicate judgement. Attaching now would
    // pre-empt a decision that is deliberately theirs.
    return NextResponse.json({ reason: "not_yet_reviewed" }, { status: 409 });
  }

  let audioPath: string | null = null;
  let imagePath: string | null = null;
  try {
    audioPath = await saveUpload(form.get("audio") as File | null, "audio");
    imagePath = await saveUpload(form.get("image") as File | null, "image");
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 413 });
  }

  if (!text && !audioPath && !imagePath) {
    return NextResponse.json({ error: "an update needs text, a voice note, or a photo" }, { status: 400 });
  }

  const rid = id();
  insertReport({
    id: rid,
    status: "draft",
    raw_text: text || null,
    audio_path: audioPath,
    image_path: imagePath,
    // The place carries over: an update from the same person about the same
    // emergency is at the same place unless they say otherwise, and asking again
    // mid-emergency is friction for no gain.
    lat: original.lat,
    lon: original.lon,
    accuracy_m: original.accuracy_m,
    location_text: original.location_text,
    pin_adjusted: original.pin_adjusted,
    reporter_id: original.reporter_id,
    reporter_name: original.reporter_name,
    reporter_phone: original.reporter_phone,
  });

  let result = await extractReport({
    text: text || null,
    audioPath,
    imagePath,
    locationText: original.location_text,
  });

  // A photo the model refuses costs the photo, not the update.
  let imageDropped = false;
  if (!result.ok && result.reason === "image_rejected" && (text || audioPath)) {
    console.warn(`[followup ${rid}] model rejected the photo, retrying without it`);
    result = await extractReport({
      text: text || null,
      audioPath,
      imagePath: null,
      locationText: original.location_text,
    });
    imageDropped = result.ok;
  }

  if (!result.ok) {
    console.error(`[followup ${rid}] extraction failed (${result.reason}): ${result.error}`);
    // The attachment and text are already stored, so nothing the reporter sent is
    // lost: it reaches the operator as raw evidence even with no structure.
    updateReport(rid, {
      model: result.model,
      latency_ms: result.latencyMs,
      repairs_json: JSON.stringify([`follow-up extraction failed: ${result.error ?? "unknown"}`]),
    });
  } else {
    updateReport(rid, {
      extraction_json: JSON.stringify(result.data),
      repairs_json: JSON.stringify(
        imageDropped
          ? [...result.repairs, "photo could not be read by the model and was excluded"]
          : result.repairs,
      ),
      model: result.model,
      latency_ms: result.latencyMs,
    });
  }

  linkReportToIncident(rid, original.incident_id);
  audit(original.incident_id, "citizen", "report_updated", `follow-up=${rid} to=${reportId}`);

  // Bring the headline in line with everything now known. Failure here is not a
  // failure of the update: the report is already attached and visible, and a
  // stale sentence above accurate evidence is a much smaller problem than losing
  // the evidence.
  let resynthesised = false;
  try {
    const all = reportsFor(original.incident_id);
    const forSynthesis = all.map((r) => ({
      extraction: r.extraction_json ? (JSON.parse(r.extraction_json) as Extraction) : null,
      rawText: r.raw_text,
      at: r.created_at,
    }));
    const syn = await synthesiseSummary(forSynthesis);
    if (syn.ok && syn.summary) {
      resynthesised = setIncidentSynthesis(original.incident_id, syn.summary);
    } else if (syn.error) {
      console.warn(`[followup ${rid}] summary not resynthesised: ${syn.error}`);
    }
  } catch (err) {
    console.warn(`[followup ${rid}] resynthesis threw: ${(err as Error).message}`);
  }

  return NextResponse.json({
    report_id: rid,
    incident_id: original.incident_id,
    extracted: result.ok,
    image_dropped: imageDropped,
    resynthesised,
  });
}
