import { NextRequest, NextResponse } from "next/server";
import { getReport, insertReport, updateReport, linkReportToIncident, audit, id } from "@/lib/db";
import { extractReport } from "@/lib/extract";

export const runtime = "nodejs";

/**
 * A reporter adding to what they already sent.
 *
 * Deliberately not an edit. A report is evidence of what a person said at a
 * moment, and rewriting it destroys the one thing that makes the incident above
 * it defensible: an operator who acted on "two children on the roof" needs that
 * sentence to still exist afterwards, even if the situation has since changed.
 *
 * So an update is a new report, carrying the same reporter and the same place,
 * linked directly to the incident the first one belongs to. Both are visible in
 * the evidence panel in order, which is more useful to a dispatcher than a
 * corrected single entry: "water was at the knee, now at the waist" is exactly
 * the kind of change that decides whether a boat is still enough.
 *
 * Linked directly rather than run through deduplication, because the reporter
 * has told us which emergency this belongs to. Guessing would be worse than
 * asking, and they have already answered.
 */
export async function POST(req: NextRequest) {
  let body: { reporter_id?: string; report_id?: string; text?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "expected JSON" }, { status: 400 });
  }

  const reporterId = body.reporter_id?.trim();
  const reportId = body.report_id?.trim();
  const text = body.text?.trim().slice(0, 2000);

  if (!reporterId || reporterId.length < 8 || !reportId) {
    return NextResponse.json({ error: "reporter_id and report_id required" }, { status: 400 });
  }
  if (!text) {
    return NextResponse.json({ error: "an update needs some text" }, { status: 400 });
  }

  const original = getReport(reportId);
  // Scoped to the reporter's own device id, so nobody can add to a stranger's
  // report. A missing report and someone else's answer the same way, so this
  // cannot be used to discover other people's ids.
  if (!original || original.reporter_id !== reporterId) {
    return NextResponse.json({ error: "report not found" }, { status: 404 });
  }
  if (!original.incident_id) {
    // Still waiting on an operator's duplicate judgement. Attaching now would
    // pre-empt a decision that is deliberately theirs to make.
    return NextResponse.json({ reason: "not_yet_reviewed" }, { status: 409 });
  }

  const rid = id();
  insertReport({
    id: rid,
    status: "draft",
    raw_text: text,
    // The place carries over: an update from the same person about the same
    // emergency is at the same place unless they say otherwise, and asking again
    // during an emergency is friction for no gain.
    lat: original.lat,
    lon: original.lon,
    accuracy_m: original.accuracy_m,
    location_text: original.location_text,
    pin_adjusted: original.pin_adjusted,
    reporter_id: original.reporter_id,
    reporter_name: original.reporter_name,
    reporter_phone: original.reporter_phone,
  });

  const result = await extractReport({
    text,
    locationText: original.location_text,
  });

  if (!result.ok) {
    console.error(`[followup ${rid}] extraction failed (${result.reason}): ${result.error}`);
    // The text is already stored, so nothing the reporter wrote is lost. It
    // reaches the operator as raw text even with no structured extraction.
    updateReport(rid, {
      model: result.model,
      latency_ms: result.latencyMs,
      repairs_json: JSON.stringify([`follow-up extraction failed: ${result.error ?? "unknown"}`]),
    });
  } else {
    updateReport(rid, {
      extraction_json: JSON.stringify(result.data),
      repairs_json: JSON.stringify(result.repairs),
      model: result.model,
      latency_ms: result.latencyMs,
    });
  }

  linkReportToIncident(rid, original.incident_id);
  audit(original.incident_id, "citizen", "report_updated", `follow-up=${rid} to=${reportId}`);

  return NextResponse.json({
    report_id: rid,
    incident_id: original.incident_id,
    extracted: result.ok,
  });
}
