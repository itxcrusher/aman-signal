import { NextRequest, NextResponse } from "next/server";
import { assignIncident } from "@/lib/db";

export const runtime = "nodejs";

/**
 * Assign a named responding team to an incident.
 *
 * This is a human decision, recorded against the person who made it. The model
 * never assigns: it surfaces urgency indicators and the operator decides who goes.
 * Naming the team is also what lets the reporter be told something better than
 * "received", so this endpoint is what closes the loop back to the citizen.
 */
export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  let body: { team?: string; operator?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "expected JSON" }, { status: 400 });
  }

  const team = body.team?.trim().slice(0, 120);
  const operator = body.operator?.trim();
  if (!team) {
    return NextResponse.json({ error: "team is required" }, { status: 400 });
  }
  if (!operator) {
    return NextResponse.json(
      { error: "operator is required: every assignment is attributed to a person" },
      { status: 400 },
    );
  }

  try {
    assignIncident(id, team, `operator:${operator}`);
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 });
  }
  return NextResponse.json({ id, assigned_to: team, operator });
}
