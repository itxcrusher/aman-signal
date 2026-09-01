import { NextRequest, NextResponse } from "next/server";
import { sendMessage, getIncident } from "@/lib/db";

export const runtime = "nodejs";

/**
 * The control room answering the person who reported.
 *
 * Until now the loop only closed in one direction. Someone sent a voice note
 * from a flooded street and could watch a status change from "received" to
 * "assigned", which is information but is not an answer. "A boat is coming from
 * the Ravi road side, stay upstairs" is an answer, and it is the thing a person
 * standing in water actually needs to hear.
 *
 * One way, deliberately, because the reply channel already exists and is better
 * than a text box: a follow-up carries voice, a photograph and a location, and
 * a person in an emergency should be answering in whichever of those is easiest
 * rather than typing.
 *
 * Attributed like every other operator action, and audited, because telling
 * someone help is coming is a promise made on behalf of an organisation.
 */

/** Long enough to say what is happening; short enough to be read on a cracked phone. */
const MAX_BODY = 500;

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;

  let body: { operator?: string; body?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "expected JSON" }, { status: 400 });
  }

  const operator = body.operator?.trim();
  if (!operator) {
    return NextResponse.json(
      { error: "operator is required: every message is attributed to a person" },
      { status: 400 },
    );
  }

  const text = body.body?.trim();
  if (!text) {
    return NextResponse.json({ error: "an empty message says nothing" }, { status: 400 });
  }
  if (text.length > MAX_BODY) {
    return NextResponse.json({ error: `keep it under ${MAX_BODY} characters` }, { status: 400 });
  }

  if (!getIncident(id)) {
    return NextResponse.json({ error: "incident not found" }, { status: 404 });
  }

  const delivered = sendMessage(id, text, `operator:${operator}`);
  if (delivered === 0) {
    // Said plainly rather than reported as success. A message with no reachable
    // reporter has not been delivered to anybody, and an operator who believes
    // they have answered someone will not try again by another route.
    return NextResponse.json(
      { error: "nobody who reported this can be messaged: none of the reports carry a device id" },
      { status: 409 },
    );
  }

  return NextResponse.json({ id, delivered });
}
