import { NextRequest, NextResponse } from "next/server";
import {
  FIELD_COOKIE,
  SESSION_MS,
  issueToken,
  normaliseTeam,
  passphraseMatches,
} from "@/lib/ops-auth";
import { teamsWithWork } from "@/lib/db";

export const runtime = "nodejs";

/**
 * Signing a field team in.
 *
 * The same mechanism as the control room and a different secret, because the
 * two surfaces show different things to different people. A crew signs in on a
 * phone, probably outdoors, probably once at the start of a shift, which is why
 * the session lasts a shift rather than an hour.
 *
 * The team is chosen here, once, and sealed into the signed session. Every
 * field route reads it from there, so a request cannot claim to be a different
 * crew from the one that signed in. Changing team means signing in again.
 *
 * Two calls, because a crew picks their team from the list of teams that have
 * work rather than typing it blind, and that list is only shown to someone who
 * has the passphrase. The first call carries the passphrase alone and gets the
 * list back with no session; the second carries the passphrase and the chosen
 * team and gets the session.
 *
 * What this does not do: every crew shares the passphrase, so anyone who holds
 * it can sign in as any team. Separating teams from each other needs a
 * credential per team, which this deliberately is not.
 */

const WRONG_ANSWER_DELAY_MS = 400;

export async function POST(req: NextRequest) {
  const secret = process.env.FIELD_PASSPHRASE;
  if (!secret) {
    return NextResponse.json(
      { error: "field access is not configured on this server" },
      { status: 503 },
    );
  }

  let body: { passphrase?: string; team?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "expected JSON" }, { status: 400 });
  }

  if (!passphraseMatches(body.passphrase ?? "", secret)) {
    await new Promise((r) => setTimeout(r, WRONG_ANSWER_DELAY_MS));
    return NextResponse.json({ error: "that passphrase is not right" }, { status: 401 });
  }

  const team = normaliseTeam(body.team);
  if (!team) {
    // The passphrase was right; what is missing is which crew this is.
    return NextResponse.json({ needs_team: true, teams: teamsWithWork() });
  }

  const res = NextResponse.json({ ok: true, team });
  res.cookies.set(FIELD_COOKIE, await issueToken(secret, Date.now(), team), {
    httpOnly: true,
    sameSite: "lax",
    secure: req.nextUrl.protocol === "https:",
    path: "/",
    maxAge: Math.floor(SESSION_MS / 1000),
  });
  return res;
}

export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(FIELD_COOKIE, "", { httpOnly: true, path: "/", maxAge: 0 });
  return res;
}
