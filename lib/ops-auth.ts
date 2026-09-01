/**
 * Who is allowed to open the operator board.
 *
 * A shared passphrase, not accounts. The board is used by a control room whose
 * members are already known to each other and to whoever runs it, and the thing
 * that has to be true before a demo or a pilot is that a stranger with the URL
 * cannot read a flood victim's phone number or listen to their voice note. Per
 * person accounts are the right answer for a deployment with more than one
 * organisation in it, and this is deliberately not that.
 *
 * The passphrase does not identify anyone, so it does not replace the operator
 * name recorded against every decision. It decides who gets in; the name still
 * decides who is answerable, and the board still asks for it.
 *
 * The token is a signed expiry rather than a stored session, because it is
 * verified in the proxy, which runs before the application and cannot be
 * expected to reach the database. Signing means a cookie cannot be forged
 * without the passphrase, and carrying the expiry inside the signature means an
 * old one cannot be replayed.
 */

const ENCODER = new TextEncoder();

/** Eight hours: longer than a shift, short enough that a shared laptop forgets. */
export const SESSION_MS = 8 * 60 * 60 * 1000;

export const OPS_COOKIE = "amansignal_ops";

/**
 * The field teams' own credential, deliberately not the control room's.
 *
 * A boat crew needs the incidents handed to them, with the address and the
 * reporter's number so they can call ahead. They do not need the district's
 * whole board, the duplicate queue, or the recordings of everyone who has
 * reported anything today. Sharing one passphrase would hand them all of it,
 * so the surfaces are separated by what they can reach rather than by a role
 * flag on one session.
 */
export const FIELD_COOKIE = "amansignal_field";

async function key(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    ENCODER.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
}

function hex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function issueToken(secret: string, now = Date.now()): Promise<string> {
  const exp = now + SESSION_MS;
  const sig = await crypto.subtle.sign("HMAC", await key(secret), ENCODER.encode(String(exp)));
  return `${exp}.${hex(sig)}`;
}

/**
 * Compared in constant time. The difference matters little for a value an
 * attacker cannot see, and costs nothing to get right.
 */
function sameString(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function verifyToken(
  token: string | undefined,
  secret: string,
  now = Date.now(),
): Promise<boolean> {
  if (!token) return false;
  const [expRaw, sig] = token.split(".");
  const exp = Number(expRaw);
  if (!Number.isFinite(exp) || !sig || exp <= now) return false;
  const expected = await crypto.subtle.sign("HMAC", await key(secret), ENCODER.encode(expRaw));
  return sameString(sig, hex(expected));
}

export function passphraseMatches(given: string, expected: string): boolean {
  return Boolean(expected) && sameString(given, expected);
}
