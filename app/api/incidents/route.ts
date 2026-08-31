import { NextResponse } from "next/server";
import { listIncidents, reportsFor, auditFor } from "@/lib/db";
import { buildIncidentView, signalStrength } from "@/lib/incident";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const views = listIncidents().map((inc) => {
    const view = buildIncidentView(inc, reportsFor(inc.id));
    return {
      id: inc.id,
      status: inc.status,
      incident_type: inc.incident_type,
      summary: inc.summary,
      created_at: inc.created_at,
      assigned_to: inc.assigned_to,
      district: inc.district,
      assigned_at: inc.assigned_at,
      assigned_by: inc.assigned_by,
      lat: inc.lat,
      lon: inc.lon,
      urgency: view.urgency,
      vulnerable: view.vulnerable,
      resources: view.resources,
      people_claims: view.peopleClaims,
      conflicts: view.conflicts,
      corrected: view.corrected,
      quality: view.quality,
      locations: view.locations,
      signal: signalStrength(view),
      audit: auditFor(inc.id),
      reports: view.reports.map((r, i) => ({
        id: r.id,
        created_at: r.created_at,
        status: r.status,
        raw_text: r.raw_text,
        has_audio: Boolean(r.audio_path),
        has_image: Boolean(r.image_path),
        lat: r.lat,
        lon: r.lon,
        pin_adjusted: r.pin_adjusted === 1,
        // Who to call. The most actionable field on the board: a dispatcher with a
        // phone number can settle in one call what a map cannot.
        reporter_name: r.reporter_name,
        reporter_phone: r.reporter_phone,
        citizen_safe: r.citizen_safe === 1,
        latency_ms: r.latency_ms,
        model: r.model,
        repairs: r.repairs_json ? JSON.parse(r.repairs_json) : [],
        clarifications: r.clarifications_json ? JSON.parse(r.clarifications_json) : [],
        extraction: view.extractions[i] ?? null,
      })),
    };
  });

  // Sorted by signal strength as a starting view. This is a hint for scanning, not
  // a response order; the operator decides what is worked first.
  views.sort((a, b) => b.signal - a.signal);
  return NextResponse.json({ incidents: views });
}
