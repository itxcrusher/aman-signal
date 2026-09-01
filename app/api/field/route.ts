import { NextRequest, NextResponse } from "next/server";
import {
  incidentsForTeam,
  reportsFor,
  teamsWithWork,
  messagesForIncident,
  messagesForTeam,
} from "@/lib/db";
import { buildIncidentView } from "@/lib/incident";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * What one field team has been sent to, and nothing else.
 *
 * Narrower than the operator board on purpose. A crew needs where to go, what
 * they will find when they arrive, whether the road takes a vehicle, and a
 * number to call ahead on. They do not need the district's whole list, the
 * duplicate queue, or every recording sent today, so this returns only
 * incidents assigned to them and only the fields that change what they do.
 *
 * The audit trail is left out for the same reason: it answers "who decided
 * this", which is the control room's question, and would be noise on a phone
 * held in one hand.
 */

export async function GET(req: NextRequest) {
  const team = req.nextUrl.searchParams.get("team")?.trim();

  // Offered as a list so a responder picks their crew instead of typing it,
  // which is the difference between arriving and staring at an empty screen
  // because the assignment said "Boat Team 3" and they typed "boat team 3".
  if (!team) {
    return NextResponse.json({ teams: teamsWithWork(), incidents: [] });
  }

  const incidents = incidentsForTeam(team).map((inc) => {
    const view = buildIncidentView(inc, reportsFor(inc.id));

    /**
     * Road access, stated plainly or stated as disputed.
     *
     * A crew choosing between a boat and a truck is the one decision this field
     * decides outright, so a disagreement between reports is surfaced as a
     * disagreement rather than flattened to whichever report happened to be
     * read last.
     */
    const roadConflict = view.conflicts.find((c) => c.field === "road_access");
    const roadStated = view.extractions
      .map((e) => e.road_access)
      .filter((v) => v && v !== "unknown");

    return {
      id: inc.id,
      status: inc.status,
      summary: inc.summary,
      incident_type: inc.incident_type,
      created_at: inc.created_at,
      updated_at: inc.updated_at,
      assigned_at: inc.assigned_at,
      assigned_by: inc.assigned_by,
      lat: inc.lat,
      lon: inc.lon,
      district: inc.district,
      locations: view.locations,
      urgency: view.urgency,
      vulnerable: view.vulnerable,
      resources: view.resources,
      people_claims: view.peopleClaims,
      road_access: roadConflict
        ? { value: null, disputed: roadConflict.values }
        : { value: roadStated[0] ?? "unknown", disputed: null },
      /** Who to call on the way. The most useful thing on this screen. */
      contacts: view.reports
        .filter((r) => r.reporter_phone)
        .map((r) => ({ name: r.reporter_name, phone: r.reporter_phone })),
      /** What people actually said, in their words, oldest first. */
      said: view.reports
        .filter((r) => r.raw_text)
        .map((r) => ({ at: r.created_at, text: r.raw_text })),
      /**
       * The recordings and photographs, for a crew who can use them better than
       * anyone at a desk. A photograph of the street answers in one glance what
       * the road field only estimates, and hearing the voice tells a responder
       * something about the situation that no transcript carries.
       */
      evidence: view.reports
        .filter((r) => r.audio_path || r.image_path)
        .map((r) => ({
          report_id: r.id,
          has_audio: Boolean(r.audio_path),
          has_image: Boolean(r.image_path),
        })),
      /** What the control room has already told the reporter, so nobody repeats it. */
      /*
       * One row per reporter is stored, because each of them has their own
       * read state. The crew is owed the message, not the bookkeeping: three
       * reporters meant the same sentence printed three times on their card.
       */
      told: [
        ...new Map(
          messagesForIncident(inc.id)
            .filter((m) => !m.to_team)
            .map((m) => [`${m.created_at}|${m.body}`, { at: m.created_at, body: m.body }]),
        ).values(),
      ],
      /** And what the control room has told this crew. */
      orders: messagesForTeam(inc.id, team).map((m) => ({
        at: m.created_at,
        body: m.body,
        actor: m.actor,
        seen: m.seen_at !== null,
      })),
    };
  });

  return NextResponse.json({ team, incidents, teams: teamsWithWork() });
}
