import { NextResponse } from "next/server";
import { unreadableReports } from "@/lib/db";

/**
 * Reports the model could not read, waiting for a person to read them instead.
 *
 * Deliberately a separate endpoint from /api/incidents rather than a flag on it.
 * These are not incidents: nothing has been interpreted, so there is no summary,
 * no type and no urgency to show. Mixing them into the board would mean either
 * inventing those fields or rendering half-empty cards among real ones, and the
 * distinction the operator needs is exactly the one that would be lost.
 */
export async function GET() {
  const rows = unreadableReports();
  return NextResponse.json({
    reports: rows.map((r) => ({
      id: r.id,
      created_at: r.created_at,
      /** What they typed, if anything. Often the only readable thing here. */
      raw_text: r.raw_text,
      has_audio: Boolean(r.audio_path),
      has_image: Boolean(r.image_path),
      location_text: r.location_text,
      lat: r.lat,
      lon: r.lon,
      reporter_name: r.reporter_name,
      reporter_phone: r.reporter_phone,
      queued_offline: r.queued_offline === 1,
      /** Why it failed, so an operator can tell a bad photo from a dead upstream. */
      failure: (JSON.parse(r.repairs_json ?? "[]") as string[]).find((x) =>
        x.startsWith("failed:"),
      ) ?? null,
    })),
  });
}
