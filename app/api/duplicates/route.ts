import { NextRequest, NextResponse } from "next/server";
import {
  pendingDuplicates, getReport, updateReport, createIncident,
  linkReportToIncident, audit,
} from "@/lib/db";
import type { Extraction } from "@/lib/schema";
import type { Candidate } from "@/lib/dedup";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Reports the system would not merge on its own, waiting for a human judgement. */
export async function GET() {
  const rows = pendingDuplicates().map((r) => {
    const extraction = r.extraction_json ? (JSON.parse(r.extraction_json) as Extraction) : null;
    const candidates = (r.dedup_json ? JSON.parse(r.dedup_json) : []) as Candidate[];
    return {
      id: r.id,
      created_at: r.created_at,
      raw_text: r.raw_text,
      has_audio: Boolean(r.audio_path),
      has_image: Boolean(r.image_path),
      lat: r.lat,
      lon: r.lon,
      summary: extraction?.english_summary ?? null,
      urgency: extraction?.urgency_indicators ?? [],
      people_affected: extraction?.people_affected ?? null,
      locations: extraction?.locations_mentioned ?? [],
      candidates: candidates.map((c) => ({
        incident_id: c.incident.id,
        incident_summary: c.incident.summary,
        incident_status: c.incident.status,
        similarity: c.similarity,
        distance_m: c.distanceM,
        geo_confirmed: c.geoConfirmed,
        method: c.method,
      })),
    };
  });
  return NextResponse.json({ pending: rows });
}

/**
 * An operator resolves a held report: either it belongs to an existing incident, or
 * it is a genuinely separate emergency. Both outcomes are attributed and audited.
 */
export async function POST(req: NextRequest) {
  let body: { report_id?: string; operator?: string; link_to?: string; separate?: boolean };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "expected JSON" }, { status: 400 });
  }

  const { report_id: rid, operator, link_to, separate } = body;
  if (!rid) return NextResponse.json({ error: "report_id required" }, { status: 400 });
  if (!operator?.trim()) {
    return NextResponse.json(
      { error: "operator is required: duplicate decisions are attributed to a person" },
      { status: 400 },
    );
  }

  const row = getReport(rid);
  if (!row) return NextResponse.json({ error: "report not found" }, { status: 404 });
  if (row.status !== "possible_duplicate") {
    return NextResponse.json({ error: "report is not awaiting duplicate review" }, { status: 409 });
  }

  if (link_to) {
    linkReportToIncident(rid, link_to);
    audit(link_to, `operator:${operator.trim()}`, "duplicate_confirmed", `report=${rid}`);
    return NextResponse.json({ report_id: rid, incident_id: link_to, action: "linked" });
  }

  if (separate) {
    if (!row.extraction_json) {
      return NextResponse.json({ error: "report has no extraction" }, { status: 409 });
    }
    const extraction = JSON.parse(row.extraction_json) as Extraction;
    const incidentId = createIncident(extraction, row.lat, row.lon);
    updateReport(rid, { status: "confirmed", incident_id: incidentId });
    audit(
      incidentId,
      `operator:${operator.trim()}`,
      "duplicate_rejected",
      `report=${rid} judged a separate emergency`,
    );
    return NextResponse.json({ report_id: rid, incident_id: incidentId, action: "separated" });
  }

  return NextResponse.json({ error: "specify link_to or separate" }, { status: 400 });
}
