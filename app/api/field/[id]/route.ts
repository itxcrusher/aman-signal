import { NextRequest, NextResponse } from "next/server";
import { setIncidentStatus, audit, incidentsForTeam, markTeamMessagesSeen } from "@/lib/db";

export const runtime = "nodejs";

/**
 * A field team reporting back.
 *
 * Two things, both of which the control room currently learns by phone or not
 * at all: that the crew is moving or done, and what they found when they got
 * there. The second matters more than it looks. "Water receded, family already
 * moved to the school" is the update that stops a second boat being sent, and
 * until now there was nowhere to put it.
 *
 * A team may only touch incidents assigned to them. The check is a query rather
 * than a claim in the request, because a request that says which team it is can
 * say it is any team.
 */

/** What a crew can set. Verification and assignment stay with the control room. */
const FIELD_STATUSES = new Set(["responding", "resolved"]);

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;

  let body: { team?: string; status?: string; note?: string; seen?: boolean };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "expected JSON" }, { status: 400 });
  }

  const team = body.team?.trim();
  if (!team) {
    return NextResponse.json(
      { error: "team is required: every update is recorded against the crew that made it" },
      { status: 400 },
    );
  }

  // Assigned to them, or not theirs to touch.
  const mine = incidentsForTeam(team).some((inc) => inc.id === id);
  if (!mine) {
    return NextResponse.json({ error: "not assigned to this team" }, { status: 404 });
  }

  const actor = `field:${team}`;
  const note = body.note?.trim();
  const status = body.status?.trim();

  // Acknowledging what the room told them. Its own call rather than a side
  // effect of the crew's screen refreshing, so "seen" means somebody looked.
  if (body.seen) {
    return NextResponse.json({ id, seen: markTeamMessagesSeen(id, team) });
  }

  if (!note && !status) {
    return NextResponse.json({ error: "nothing to record" }, { status: 400 });
  }

  if (note) {
    // Recorded before the status change, so the reason reads above the result
    // rather than after it when someone scrolls the trail later.
    audit(id, actor, "field_report", note.slice(0, 2000));
  }

  if (status) {
    if (!FIELD_STATUSES.has(status)) {
      return NextResponse.json(
        { error: "a crew can report responding or resolved; the rest is the control room's" },
        { status: 400 },
      );
    }
    setIncidentStatus(id, status, actor);
  }

  return NextResponse.json({ id, status: status ?? null, noted: Boolean(note) });
}
