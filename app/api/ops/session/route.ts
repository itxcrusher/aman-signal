import { NextRequest, NextResponse } from "next/server";
import { OPS_COOKIE, SESSION_MS, issueToken, passphraseMatches } from "@/lib/ops-auth";

export const runtime = "nodejs";

/**
 * Signing in to the operator board, and signing out of it.
 *
 * Deliberately outside the proxy's protected list: it is how someone who has no
 * cookie gets one, and gating it would leave nobody able to reach it.
 */

/** Wrong attempts are slowed a little. Not a defence, just not an invitation. */
const WRONG_ANSWER_DELAY_MS = 400;

export async function POST(req: NextRequest) {
  const secret = process.env.OPS_PASSPHRASE;
  if (!secret) {
    return NextResponse.json(
      { error: "operator access is not configured on this server" },
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
  res.cookies.set(OPS_COOKIE, await issueToken(secret), {
    httpOnly: true,
    sameSite: "lax",
    // Only over TLS when the request itself arrived over TLS, so a local build
    // served over http still works rather than silently refusing to keep anyone
    // signed in.
    secure: req.nextUrl.protocol === "https:",
    path: "/",
    maxAge: Math.floor(SESSION_MS / 1000),
  });
  return res;
}

export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(OPS_COOKIE, "", { httpOnly: true, path: "/", maxAge: 0 });
  return res;
}
