import { NextRequest, NextResponse } from "next/server";
import { getReport, updateReport, createIncident, audit, backfillLocation } from "@/lib/db";
import { findDuplicate } from "@/lib/dedup";
import { ExtractionSchema } from "@/lib/schema";

export const runtime = "nodejs";

/**
 * A clarification answer resolves the gap that prompted the question, so that gap
 * must stop being reported as missing. Without this the board asks a citizen where
 * they are, receives "Masjid", and still tells the dispatcher the location is
 * unknown, which makes the whole clarification step pointless.
 */
const ANSWERED_GAP: Record<string, RegExp> = {
  location: /locat|address|landmark|area|where|جگہ|پتہ|مقام|نشان/i,
  people_affected: /people|person|affected|how many|trapped count|افراد|تعداد|لوگ/i,
};

function pruneMissing(missing: unknown, field: string): string[] {
  if (!Array.isArray(missing)) return [];
  const pattern = ANSWERED_GAP[field];
  if (!pattern) return missing as string[];
  return (missing as string[]).filter((m) => typeof m === "string" && !pattern.test(m));
}


/**
 * Citizen confirmation. Until this runs, a report is a draft and is not visible to
 * dispatchers. Corrections the citizen makes are recorded as clarification answers,
 * so the operator can see what the AI got wrong and what the human fixed.
 */
export async function POST(req: NextRequest) {
  let body: {
    report_id?: string;
    answers?: { field: string; question: string; answer: string }[];
    corrected?: unknown;
    pin?: { lat?: unknown; lon?: unknown };
    address?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "expected JSON" }, { status: 400 });
  }

  const rid = body.report_id;
  if (!rid) return NextResponse.json({ error: "report_id required" }, { status: 400 });

  const row = getReport(rid);
  if (!row) return NextResponse.json({ error: "report not found" }, { status: 404 });
  if (row.status !== "draft") {
    return NextResponse.json({ error: "report already confirmed" }, { status: 409 });
  }
  if (!row.extraction_json) {
    return NextResponse.json({ error: "report has no extraction to confirm" }, { status: 409 });
  }

  let extraction = JSON.parse(row.extraction_json);

  // A citizen correction replaces the AI's interpretation, but must still satisfy
  // the schema; a malformed correction is rejected rather than stored.
  if (body.corrected !== undefined) {
    const parsed = ExtractionSchema.safeParse(body.corrected);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "corrected extraction failed validation", issues: parsed.error.issues.map((i) => i.message) },
        { status: 400 },
      );
    }
    extraction = parsed.data;
  }

  const answers = Array.isArray(body.answers) ? body.answers.slice(0, 2) : [];
  // Clarification answers are evidence: appended to the location the citizen gave,
  // never silently overwriting what they originally said.
  for (const a of answers) {
    if (a.field === "location" && a.answer?.trim()) {
      extraction.locations_mentioned = [
        ...extraction.locations_mentioned,
        a.answer.trim(),
      ];
      extraction.missing_information = pruneMissing(extraction.missing_information, "location");
    }
    if (a.field === "people_affected" && a.answer?.trim()) {
      const n = parseInt(a.answer.replace(/\D/g, ""), 10);
      if (Number.isFinite(n)) {
        extraction.people_affected = n;
        extraction.missing_information = pruneMissing(
          extraction.missing_information,
          "people_affected",
        );
      }
    }
  }

  // A written address, which for many reporters is the only location they can
  // give: geolocation is unavailable on an insecure origin and denied by plenty
  // of people who grant nothing at install. It is stored as the report's own
  // location_text and added to the places the extraction mentions, so it reaches
  // the operator's board as something a dispatcher can act on rather than sitting
  // in a field nothing reads.
  const address = typeof body.address === "string" ? body.address.trim().slice(0, 500) : "";
  if (address) {
    updateReport(rid, { location_text: address });
    if (!extraction.locations_mentioned.includes(address)) {
      extraction.locations_mentioned = [...extraction.locations_mentioned, address];
    }
    extraction.missing_information = pruneMissing(extraction.missing_information, "location");
  }

  // The citizen may have dragged the pin on the confirmation map. A hand-placed
  // pin on a street-level map beats a 40m urban GPS fix, and it is applied before
  // reconciliation because dedup is distance-sensitive: it has to see the better
  // coordinate, not the one the phone guessed.
  let lat = row.lat;
  let lon = row.lon;
  const pinLat = Number(body.pin?.lat);
  const pinLon = Number(body.pin?.lon);
  if (
    Number.isFinite(pinLat) && Number.isFinite(pinLon) &&
    Math.abs(pinLat) <= 90 && Math.abs(pinLon) <= 180 &&
    (pinLat !== row.lat || pinLon !== row.lon)
  ) {
    lat = pinLat;
    lon = pinLon;
    // The GPS accuracy figure describes the fix, not the correction, so it is
    // dropped rather than left to imply a precision it no longer measures.
    updateReport(rid, { lat, lon, accuracy_m: null, pin_adjusted: 1 });
  }

  // Does this report describe an emergency already known to the operators?
  const decision = await findDuplicate(extraction, lat, lon);
  const answerNote = answers.length ? ` answers=${answers.map((a) => a.field).join(",")}` : "";
  const correctedNote = body.corrected !== undefined ? " corrected=yes" : "";

  if (decision.action === "possible") {
    // Held, not merged and not split. A wrong merge hides an emergency; a wrong
    // split only costs a second look, so the ambiguous case goes to a human.
    updateReport(rid, {
      status: "possible_duplicate",
      extraction_json: JSON.stringify(extraction),
      clarifications_json: JSON.stringify(answers),
      dedup_json: JSON.stringify(decision.candidates),
    });
    // The citizen is told their report was received either way: duplicate review is
    // an operational concern and must never surface as a failure to the reporter.
    return NextResponse.json({
      report_id: rid,
      status: "received",
      review: "possible_duplicate",
      candidates: decision.candidates.length,
    });
  }

  let incidentId: string;
  if (decision.action === "link") {
    incidentId = decision.incidentId;
    updateReport(rid, {
      status: "confirmed",
      incident_id: incidentId,
      extraction_json: JSON.stringify(extraction),
      clarifications_json: JSON.stringify(answers),
      dedup_json: JSON.stringify([decision.candidate]),
    });
    backfillLocation(incidentId);
    audit(
      incidentId,
      "ai",
      "report_linked",
      `report=${rid} similarity=${decision.candidate.similarity} distance=${decision.candidate.distanceM ?? "n/a"}m method=${decision.candidate.method}`,
    );
  } else {
    incidentId = createIncident(extraction, lat, lon);
    updateReport(rid, {
      status: "confirmed",
      incident_id: incidentId,
      extraction_json: JSON.stringify(extraction),
      clarifications_json: JSON.stringify(answers),
      dedup_json: JSON.stringify(decision.candidates),
    });
  }

  audit(incidentId, "citizen", "report_confirmed", `report=${rid}${answerNote}${correctedNote}`);

  return NextResponse.json({
    report_id: rid,
    incident_id: incidentId,
    status: "confirmed",
    linked: decision.action === "link",
  });
}
