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
 * old one cannot be replayed. A field session also carries its team inside the
 * signature, chosen once at sign-in.
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

function hex(buf: ArrayBuffer | Uint8Array): string {
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * A session token: an expiry, optionally who the session is for, and a
 * signature over both.
 *
 * The subject is what fixes a field crew to one team. It is carried inside the
 * signed part, so it cannot be changed without the passphrase, and a request
 * has no way to say it is a different team from the one it signed in as. It is
 * hex-encoded UTF-8, because team names are typed by people and may be in Urdu,
 * and hex never contains the dot that separates the parts.
 */
export async function issueToken(
  secret: string,
  now = Date.now(),
  subject?: string,
): Promise<string> {
  const exp = now + SESSION_MS;
  const payload = subject ? `${exp}.${hex(ENCODER.encode(subject))}` : String(exp);
  const sig = await crypto.subtle.sign("HMAC", await key(secret), ENCODER.encode(payload));
  return `${payload}.${hex(sig)}`;
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

/** The token's subject when its signature and expiry hold; undefined when they do not. */
async function readToken(
  token: string | undefined,
  secret: string,
  now: number,
): Promise<{ subject: string | null } | undefined> {
  if (!token || !secret) return undefined;
  const parts = token.split(".");
  if (parts.length !== 2 && parts.length !== 3) return undefined;
  const sig = parts[parts.length - 1];
  const payload = parts.slice(0, -1).join(".");
  const exp = Number(parts[0]);
  if (!Number.isFinite(exp) || !sig || exp <= now) return undefined;
  const expected = await crypto.subtle.sign("HMAC", await key(secret), ENCODER.encode(payload));
  if (!sameString(sig, hex(expected))) return undefined;
  if (parts.length === 2) return { subject: null };
  const subjectHex = parts[1];
  if (!/^(?:[0-9a-f]{2})+$/.test(subjectHex)) return undefined;
  const bytes = new Uint8Array(subjectHex.match(/../g)!.map((b) => parseInt(b, 16)));
  return { subject: new TextDecoder().decode(bytes) };
}

export async function verifyToken(
  token: string | undefined,
  secret: string,
  now = Date.now(),
): Promise<boolean> {
  return (await readToken(token, secret, now)) !== undefined;
}

/**
 * The team a field session was signed in as, or null.
 *
 * Null for no session, an expired or forged one, and a session issued before
 * sessions carried a team. Every field route takes the team from here and from
 * nowhere else: not from the query string, not from the body.
 */
export async function fieldTeam(token: string | undefined, now = Date.now()): Promise<string | null> {
  const read = await readToken(token, process.env.FIELD_PASSPHRASE ?? "", now);
  return read?.subject?.trim() || null;
}

/**
 * A team name as given at sign-in: trimmed and bounded, and otherwise exactly
 * as written, because it is matched against the name an operator typed at
 * assignment (case-insensitively, on the trimmed value). The bound is the same
 * one assignment applies, so every assignable name can be signed in as.
 */
export function normaliseTeam(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const name = raw.trim().slice(0, 120);
  return name || null;
}

export function passphraseMatches(given: string, expected: string): boolean {
  return Boolean(expected) && sameString(given, expected);
}
