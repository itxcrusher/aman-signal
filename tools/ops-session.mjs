/**
 * Signing the verification suites in to the operator board.
 *
 * The board is behind a passphrase, which the suites have to hold too: a test
 * that could still read incidents without one would be proof that the gate does
 * not work rather than that the feature does.
 *
 * Done by wrapping fetch rather than by threading an options object through
 * every call, so that adding an operator endpoint to a suite cannot silently
 * produce a test that authenticates by accident of being written a certain way.
 */

const OPS_PATHS = ["/api/incidents", "/api/duplicates", "/api/triage", "/api/media"];

export async function opsCookie(base) {
  const passphrase = process.env.OPS_PASSPHRASE;
  if (!passphrase) {
    throw new Error(
      "OPS_PASSPHRASE is not set. The operator board is gated, so the suites need it too.",
    );
  }
  const res = await fetch(`${base}/api/ops/session`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ passphrase }),
  });
  if (!res.ok) throw new Error(`could not sign in to /ops (${res.status})`);
  const raw = res.headers.getSetCookie?.() ?? [];
  const cookie = raw.map((c) => c.split(";")[0]).join("; ");
  if (!cookie) throw new Error("sign-in returned no cookie");
  return cookie;
}

/**
 * Attach the operator cookie to this process's calls to operator endpoints.
 *
 * Scoped to those paths on purpose. The citizen endpoints must keep working
 * with no credential at all, and a blanket wrapper would hide it the day that
 * stopped being true.
 */
export async function authoriseOpsRequests(base) {
  const cookie = await opsCookie(base);
  const original = globalThis.fetch;
  globalThis.fetch = (input, init = {}) => {
    const url = typeof input === "string" ? input : (input?.url ?? "");
    if (OPS_PATHS.some((p) => url.includes(p))) {
      init = { ...init, headers: { ...(init.headers ?? {}), Cookie: cookie } };
    }
    return original(input, init);
  };
  return cookie;
}

/** The same cookie, in the form a Playwright context wants. */
export async function opsCookieFor(base, cookie) {
  const value = (cookie ?? (await opsCookie(base))).split("=");
  const url = new URL(base);
  return [
    {
      name: value[0],
      value: value.slice(1).join("="),
      domain: url.hostname,
      path: "/",
      httpOnly: true,
      secure: url.protocol === "https:",
      sameSite: "Lax",
    },
  ];
}
