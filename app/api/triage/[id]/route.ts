import { NextRequest, NextResponse } from "next/server";
import {
  getReport,
  createIncident,
  linkReportToIncident,
  setIncidentOverride,
  audit,
  updateReport,
} from "@/lib/db";
import {
  ExtractionSchema,
  INCIDENT_TYPES,
  URGENCY_INDICATORS,
  VULNERABLE_GROUPS,
  ROAD_ACCESS,
} from "@/lib/schema";

export const runtime = "nodejs";

/**
 * An operator reading a report the model could not, and entering what it says.
 *
 * This is the one place a human authors an incident from scratch, and it exists
 * because the alternative is losing the report. The model failed; the voice note
 * and the photo are still on disk and still perfectly legible to a person; so a
 * person listens and writes down what they heard.
 *
 * Nothing here is inferred from the failed extraction, because there is no
 * extraction: the operator supplies every field. The audit records them as the
 * author rather than the model, which matters because the system's central
 * claim is that a named human decided, and crediting "ai" for a reading no model
 * produced would be a lie told by the audit trail.
 *
 * The report is not edited. It becomes 'confirmed' and gains an incident, and
 * what the reporter actually sent stays exactly as they sent it.
 */

function pickStrings(input: unknown, allowed: readonly string[]): string[] {
  if (!Array.isArray(input)) return [];
  return input.filter((v): v is string => typeof v === "string" && allowed.includes(v));
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;

  let body: {
    operator?: string;
    summary?: string;
    incident_type?: string;
    urgency_indicators?: unknown;
    vulnerable_people?: unknown;
    people_affected?: unknown;
    road_access?: string;
    /** The operator judged there is no emergency here. */
    dismiss?: boolean;
    reason?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "expected JSON" }, { status: 400 });
  }

  const operator = body.operator?.trim();
  if (!operator) {
    return NextResponse.json(
      { error: "operator is required: every decision is attributed to a person" },
      { status: 400 },
    );
  }
  const actor = `operator:${operator}`;

  const report = getReport(id);
  if (!report) return NextResponse.json({ error: "report not found" }, { status: 404 });
  if (report.status !== "draft") {
    // Two operators opening the same queue is normal; the second must be told
    // rather than allowed to create a duplicate incident for the same report.
    return NextResponse.json(
      { error: "already handled", status: report.status },
      { status: 409 },
    );
  }

  /**
   * Dismissal is recorded, not deleted.
   *
   * A test message or a misdial is not an emergency, but "an operator decided
   * this was nothing" is exactly the decision that has to survive being
   * questioned afterwards, so the report keeps its evidence and gains a reason.
   */
  if (body.dismiss) {
    updateReport(id, {
      status: "dismissed",
      repairs_json: JSON.stringify([
        ...(JSON.parse(report.repairs_json ?? "[]") as string[]),
        `dismissed by ${operator}: ${body.reason?.trim() || "no reason given"}`,
      ]),
    });
    return NextResponse.json({ id, dismissed: true });
  }

  const summary = body.summary?.trim();
  if (!summary) {
    return NextResponse.json(
      { error: "summary is required: this is the reading, and there is no other" },
      { status: 400 },
    );
  }

  const incidentType = INCIDENT_TYPES.includes(body.incident_type as never)
    ? (body.incident_type as string)
    : "other";

  const people =
    typeof body.people_affected === "number" && Number.isInteger(body.people_affected) && body.people_affected >= 0
      ? body.people_affected
      : null;

  // Built through the same schema every model extraction passes, so a
  // hand-entered incident cannot hold a shape the rest of the system rejects.
  const parsed = ExtractionSchema.safeParse({
    language_detected: "mixed",
    transcript_urdu: "",
    transcript_roman_urdu: "",
    english_summary: summary,
    incident_type: incidentType,
    urgency_indicators: pickStrings(body.urgency_indicators, URGENCY_INDICATORS),
    people_affected: people,
    vulnerable_people: pickStrings(body.vulnerable_people, VULNERABLE_GROUPS),
    road_access: ROAD_ACCESS.includes(body.road_access as never) ? body.road_access : "unknown",
    resources_required: [],
    locations_mentioned: report.location_text ? [report.location_text] : [],
    missing_information: [],
  });
  if (!parsed.success) {
    return NextResponse.json({ error: "could not build a valid incident" }, { status: 400 });
  }

  const incidentId = createIncident(parsed.data, report.lat, report.lon, actor);
  linkReportToIncident(id, incidentId);

  /**
   * The reading is stored as an operator override, not just as an incident row.
   *
   * Everything but the summary is derived from the reports' extractions, and
   * this report has none: the model failed, which is why a person is reading it.
   * Without this the operator's count and road assessment were accepted, written
   * nowhere the board reads, and silently lost, which a test caught only because
   * it checked the count came back rather than that the call returned 200.
   *
   * The summary goes in too, which additionally stops a later automatic
   * resynthesis from overwriting a human's reading with the model's, given the
   * model already could not read this at all.
   */
  setIncidentOverride(
    incidentId,
    {
      summary: parsed.data.english_summary,
      urgency_indicators: parsed.data.urgency_indicators,
      people_affected: parsed.data.people_affected,
      vulnerable_people: parsed.data.vulnerable_people,
      road_access: parsed.data.road_access,
    },
    actor,
  );
  audit(
    incidentId,
    actor,
    "incident_read_by_operator",
    `report=${id} could not be read by the model and was entered by hand`,
  );

  return NextResponse.json({ id, incident_id: incidentId });
}
