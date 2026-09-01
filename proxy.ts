import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { OPS_COOKIE, FIELD_COOKIE, verifyToken } from "@/lib/ops-auth";

/**
 * Everything an operator can reach is behind the passphrase; everything a
 * person in a flood needs is not.
 *
 * The split is not only about who may change an incident. The operator surface
 * carries reporters' names, phone numbers, the photos they sent and recordings
 * of their voices, and it was reachable by anyone who guessed the path. Reading
 * it is the more damaging of the two things you can do with it, so the read
 * endpoints are gated exactly as firmly as the writes.
 *
 * The citizen side is deliberately open, including submitting a report. A
 * disaster line that asks people to log in before they can call for help is
 * not a disaster line.
 */

/**
 * Two closed surfaces with two different credentials.
 *
 * The control room sees a district: every incident, the duplicate queue, the
 * reports that could not be read, and the recordings behind them. A field crew
 * sees the incidents handed to them and the numbers to call on the way. Giving
 * both the same key would mean the second group holds the first group's access,
 * so they are separated by credential rather than by a role flag that one
 * request could claim.
 */
const GATES = [
  { prefix: "/ops", cookie: OPS_COOKIE, secret: "OPS_PASSPHRASE", login: "/ops/login" },
  { prefix: "/api/incidents", cookie: OPS_COOKIE, secret: "OPS_PASSPHRASE", login: "/ops/login" },
  { prefix: "/api/duplicates", cookie: OPS_COOKIE, secret: "OPS_PASSPHRASE", login: "/ops/login" },
  { prefix: "/api/triage", cookie: OPS_COOKIE, secret: "OPS_PASSPHRASE", login: "/ops/login" },
  // Media is served by report id, and those ids are only ever shown on the
  // board, but "the identifier is hard to guess" is not access control.
  { prefix: "/api/media", cookie: OPS_COOKIE, secret: "OPS_PASSPHRASE", login: "/ops/login" },
  { prefix: "/field", cookie: FIELD_COOKIE, secret: "FIELD_PASSPHRASE", login: "/field/login" },
  { prefix: "/api/field", cookie: FIELD_COOKIE, secret: "FIELD_PASSPHRASE", login: "/field/login" },
];

/** How someone with no session gets one. Gating these would lock everybody out. */
const PUBLIC = ["/ops/login", "/field/login", "/api/ops/session", "/api/field/session"];

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const isApi = pathname.startsWith("/api/");

  if (PUBLIC.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    return NextResponse.next();
  }
  const gate = GATES.find((g) => pathname === g.prefix || pathname.startsWith(`${g.prefix}/`));
  if (!gate) return NextResponse.next();

  const secret = process.env[gate.secret];
  /**
   * No passphrase configured means nobody gets in, rather than everybody.
   *
   * The alternative, treating an unset variable as "no protection wanted", is
   * how a deployment ends up open by accident: the one that forgets to set it
   * is exactly the one nobody is watching. It is loud and it is fixable in a
   * minute, which is what makes it the safe direction to fail in.
   */
  if (!secret) {
    return isApi
      ? NextResponse.json({ error: `access is not configured on this server` }, { status: 503 })
      : new NextResponse(
          `This surface is not configured on this server: ${gate.secret} is unset.`,
          { status: 503, headers: { "content-type": "text/plain; charset=utf-8" } },
        );
  }

  if (await verifyToken(req.cookies.get(gate.cookie)?.value, secret)) {
    return NextResponse.next();
  }

  // An API answers with a status its caller can act on; a page sends the person
  // somewhere they can do something about it.
  if (isApi) {
    return NextResponse.json({ error: "sign-in required" }, { status: 401 });
  }
  const to = req.nextUrl.clone();
  to.pathname = gate.login;
  to.search = "";
  return NextResponse.redirect(to);
}

export const config = {
  // Both the bare path and its children are listed rather than relying on
  // ":path*" matching zero segments, which is the sort of assumption that is
  // wrong quietly and leaves an endpoint open.
  matcher: [
    "/ops",
    "/ops/:path*",
    "/api/incidents",
    "/api/incidents/:path*",
    "/api/duplicates",
    "/api/triage",
    "/api/triage/:path*",
    "/api/media/:path*",
    "/field",
    "/field/:path*",
    "/api/field",
    "/api/field/:path*",
  ],
};
