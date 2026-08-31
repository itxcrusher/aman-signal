import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { OPS_COOKIE, verifyToken } from "@/lib/ops-auth";

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

const PROTECTED = [
  "/ops",
  "/api/incidents",
  "/api/duplicates",
  "/api/triage",
  // Media is served by report id, and those ids are only ever shown on the
  // board, but "the identifier is hard to guess" is not access control.
  "/api/media",
];

const PUBLIC_WITHIN_OPS = ["/ops/login"];

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const isApi = pathname.startsWith("/api/");

  if (PUBLIC_WITHIN_OPS.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    return NextResponse.next();
  }
  if (!PROTECTED.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    return NextResponse.next();
  }

  const secret = process.env.OPS_PASSPHRASE;
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
      ? NextResponse.json({ error: "operator access is not configured on this server" }, { status: 503 })
      : new NextResponse(
          "The operator board is not configured on this server: OPS_PASSPHRASE is unset.",
          { status: 503, headers: { "content-type": "text/plain; charset=utf-8" } },
        );
  }

  if (await verifyToken(req.cookies.get(OPS_COOKIE)?.value, secret)) {
    return NextResponse.next();
  }

  // An API answers with a status its caller can act on; a page sends the person
  // somewhere they can do something about it.
  if (isApi) {
    return NextResponse.json({ error: "operator sign-in required" }, { status: 401 });
  }
  const to = req.nextUrl.clone();
  to.pathname = "/ops/login";
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
  ],
};
