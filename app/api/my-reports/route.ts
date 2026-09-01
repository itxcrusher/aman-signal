import { NextRequest, NextResponse } from "next/server";
import { reportsByReporter, messagesForReporter } from "@/lib/db";
import type { Extraction } from "@/lib/schema";

export const runtime = "nodejs";

/**
 * What became of the reports this device sent.
 *
 * Reporting into a void is the most demoralising part of any reporting system:
 * someone describes an emergency and then has no idea whether anyone saw it. This
 * closes that loop without requiring an account.
 *
 * The reporter id is a random device-scoped identifier, not a credential. It is
 * unguessable in practice but confers no authority: it returns only that device's
 * own submissions, never operator data, and is never used to authorise an action.
 */
export async function GET(req: NextRequest) {
  const reporterId = req.nextUrl.searchParams.get("reporter_id")?.trim();
  if (!reporterId || reporterId.length < 8) {
    return NextResponse.json({ error: "reporter_id required" }, { status: 400 });
  }

  const rows = reportsByReporter(reporterId);

  /**
   * What the control room has said back to them.
   *
   * Returned alongside the reports rather than on a separate screen, because a
   * message about an emergency is not correspondence to be checked later. It
   * belongs next to the report it answers, where someone looking to see whether
   * anyone is coming will actually find it.
   */
  const messages = messagesForReporter(reporterId).map((m) => ({
    id: m.id,
    at: m.created_at,
    body: m.body,
    incident_id: m.incident_id,
    seen: m.seen_at !== null,
  }));

  return NextResponse.json({
    messages,
    reports: rows.map((r) => {
      const e: Extraction | null = r.extraction_json ? JSON.parse(r.extraction_json) : null;
      return {
        id: r.id,
        created_at: r.created_at,
        // The citizen's own view of state, in their terms rather than the
        // operational vocabulary: a draft they abandoned is "not sent", and a
        // report held for duplicate review is simply "received", because
        // reconciliation is our problem and never theirs to worry about.
        state:
          r.status === "draft"
            ? "not_sent"
            : r.incident_id
              ? "received"
              : "received",
        summary: e?.english_summary ?? null,
        // Their own words back, which reads as recognition rather than as a
        // machine paraphrase of an emergency they just lived through.
        summary_urdu: e?.transcript_urdu || null,
        urgency: e?.urgency_indicators ?? [],
        had_voice: Boolean(r.audio_path),
        had_photo: Boolean(r.image_path),
        located: r.lat !== null && r.lon !== null,
        // What the operators have done with it. Null until they act, which is
        // shown honestly as "not yet reviewed" rather than dressed up.
        incident_status: r.incident_status,
        assigned_to: r.incident_assigned_to,
        safe: r.citizen_safe === 1,
      };
    }),
  });
}
