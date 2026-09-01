import { NextRequest, NextResponse } from "next/server";
import { FIELD_COOKIE, SESSION_MS, issueToken, passphraseMatches } from "@/lib/ops-auth";

export const runtime = "nodejs";

/**
 * Signing a field team in.
 *
 * The same mechanism as the control room and a different secret, because the
 * two surfaces show different things to different people. A crew signs in on a
 * phone, probably outdoors, probably once at the start of a shift, which is why
 * the session lasts a shift rather than an hour.
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

  let body: { passphrase?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "expected JSON" }, { status: 400 });
  }

  if (!passphraseMatches(body.passphrase ?? "", secret)) {
    await new Promise((r) => setTimeout(r, WRONG_ANSWER_DELAY_MS));
    return NextResponse.json({ error: "that passphrase is not right" }, { status: 401 });
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set(FIELD_COOKIE, await issueToken(secret), {
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
