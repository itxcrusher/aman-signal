/**
 * The operator board is closed; the reporting line is open.
 *
 * Both halves matter equally and fail in opposite directions. A board anyone can
 * open exposes reporters' names, phone numbers, photographs and recordings of
 * their voices to whoever guesses the path. A reporting page that asks for a
 * credential is not a disaster line at all.
 *
 * Run against a server started with OPS_PASSPHRASE set, which is the only
 * configuration this is meaningful in: without one the board refuses everybody,
 * which is checked separately below by reasoning about the 503, not asserted
 * here.
 */

import { opsCookie } from "./ops-session.mjs";

const B = process.env.BASE ?? "http://localhost:3300";
const out = [];
const log = (ok, m, x = "") => {
  out.push(ok);
  console.log(`  ${ok ? "pass" : "FAIL"}  ${m}${x ? `  (${x})` : ""}`);
};

const status = async (path, headers = {}) =>
  (await fetch(`${B}${path}`, { headers, redirect: "manual" })).status;

console.log("\nWithout a session, the operator surface is closed:");
{
  log((await status("/ops")) === 307, "the board sends you to sign in", `${await status("/ops")}`);
  for (const p of ["/api/incidents", "/api/duplicates", "/api/triage", "/api/media/anything"]) {
    log((await status(p)) === 401, `${p} refuses`, `${await status(p)}`);
  }
}

console.log("\nAnd the reporting line is open to anyone, as it must be:");
{
  for (const p of ["/", "/api/health", "/ops/login"]) {
    log((await status(p)) === 200, `${p} is reachable with no credential`, `${await status(p)}`);
  }
  // The one that would be easiest to gate by accident, and the most damaging to.
  const res = await fetch(`${B}/api/my-reports?reporter_id=verify-auth-probe-id`);
  log(res.status === 200, "a reporter can still see their own reports", `${res.status}`);
}

console.log("\nA passphrase is required, and checked:");
{
  const wrong = await fetch(`${B}/api/ops/session`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ passphrase: "not-the-passphrase" }),
  });
  log(wrong.status === 401, "the wrong passphrase is refused", `${wrong.status}`);

  const cookie = await opsCookie(B);
  log(Boolean(cookie), "the right one returns a session");
  log(
    (await status("/api/incidents", { Cookie: cookie })) === 200,
    "which opens the board",
  );

  // A cookie is only worth having if it cannot be written by hand.
  const forged = await status("/api/incidents", {
    Cookie: `${cookie.split("=")[0]}=99999999999999.${"0".repeat(64)}`,
  });
  log(forged === 401, "a forged one, with a far-future expiry, is refused", `${forged}`);

  const expired = await status("/api/incidents", {
    Cookie: `${cookie.split("=")[0]}=1.${"0".repeat(64)}`,
  });
  log(expired === 401, "and an expired one is refused", `${expired}`);
}

console.log("\nSigning out ends the session:");
{
  const cookie = await opsCookie(B);
  const res = await fetch(`${B}/api/ops/session`, {
    method: "DELETE",
    headers: { Cookie: cookie },
  });
  log(res.ok, "sign-out is accepted", `${res.status}`);
  const cleared = res.headers.getSetCookie?.() ?? [];
  log(
    cleared.some((c) => /Max-Age=0/i.test(c)),
    "and the cookie is cleared rather than left to expire on its own",
  );
}

console.log(`\n${out.filter(Boolean).length}/${out.length} passed`);
process.exit(out.every(Boolean) ? 0 : 1);
