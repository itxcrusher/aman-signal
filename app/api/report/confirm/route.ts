import { NextRequest, NextResponse } from "next/server";
import { getReport, updateReport, createIncident, audit } from "@/lib/db";
import { ExtractionSchema } from "@/lib/schema";

export const runtime = "nodejs";

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
    }
    if (a.field === "people_affected" && a.answer?.trim()) {
      const n = parseInt(a.answer.replace(/\D/g, ""), 10);
      if (Number.isFinite(n)) extraction.people_affected = n;
    }
  }

  const incidentId = createIncident(extraction, row.lat, row.lon);

  updateReport(rid, {
    status: "confirmed",
    incident_id: incidentId,
    extraction_json: JSON.stringify(extraction),
    clarifications_json: JSON.stringify(answers),
  });

  audit(
    incidentId,
    "citizen",
    "report_confirmed",
    `report=${rid}${answers.length ? ` answers=${answers.map((a) => a.field).join(",")}` : ""}${body.corrected !== undefined ? " corrected=yes" : ""}`,
  );

  return NextResponse.json({ report_id: rid, incident_id: incidentId, status: "confirmed" });
}
