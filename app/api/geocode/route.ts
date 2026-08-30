import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

/**
 * Turn a written address into map candidates, as a SUGGESTION only.
 *
 * Measured against real Pakistani addresses before this was built, because the
 * failure mode decides the whole design:
 *
 *   "Shah Faisal Colony Karachi"              -> correct suburb
 *   "Toba Tek Singh"                          -> correct city
 *   "Gali 4 Mohalla Islampura Toba Tek Singh" -> nothing at all
 *   "Mohalla Islampura"                       -> Jhelum, about 200km wrong
 *
 * City and suburb names resolve well. The street-level detail people actually
 * write either fails or comes back confidently wrong, and OSM has no coverage of
 * most Pakistani informal addressing. A result is therefore never applied on its
 * own: candidates are returned with the full name they matched, the reporter is
 * shown where each one lands, and a coordinate is only taken when a human picks
 * one. Sending a boat 200km wrong is worse than sending it nowhere.
 *
 * The typed address is kept verbatim regardless of what this returns. It is the
 * authoritative human-readable location; this only helps put a pin near it.
 *
 * Server-side rather than from the page, for three reasons: it keeps the
 * reporter's IP off a third-party service, it lets one User-Agent identify the
 * app as Nominatim's usage policy requires, and it is the only place a rate limit
 * can actually be enforced.
 */

const ENDPOINT = "https://nominatim.openstreetmap.org/search";
const UA = "AmanSignal/1.0 (flood incident reporting; contact via repository)";

// Nominatim's public instance asks for at most one request per second. This is a
// process-wide gate, not per-user: exceeding it risks the whole deployment being
// blocked, which would take the feature away from everyone.
let lastCall = 0;
const MIN_GAP_MS = 1100;

// Repeat lookups are common: someone edits one word of an address and searches
// again. A small cache keeps those off the wire entirely.
const cache = new Map<string, { at: number; body: unknown }>();
const CACHE_MS = 10 * 60 * 1000;

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q")?.trim().slice(0, 200);
  if (!q || q.length < 3) {
    return NextResponse.json({ candidates: [] });
  }

  const key = q.toLowerCase();
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_MS) {
    return NextResponse.json(hit.body);
  }

  const wait = MIN_GAP_MS - (Date.now() - lastCall);
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastCall = Date.now();

  const url = `${ENDPOINT}?format=json&limit=4&countrycodes=pk&addressdetails=0&q=${encodeURIComponent(q)}`;

  try {
    const res = await fetch(url, {
      headers: { "User-Agent": UA, "Accept-Language": "ur,en" },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) throw new Error(`nominatim ${res.status}`);
    const raw = (await res.json()) as {
      lat: string;
      lon: string;
      display_name: string;
      type?: string;
    }[];

    const candidates = raw
      .map((r) => ({
        lat: Number(r.lat),
        lon: Number(r.lon),
        // The full matched name, shown to the reporter verbatim. This is what
        // lets someone notice that "Mohalla Islampura" landed in Jhelum.
        label: r.display_name,
        kind: r.type ?? "",
      }))
      .filter((c) => Number.isFinite(c.lat) && Number.isFinite(c.lon));

    const body = { candidates };
    cache.set(key, { at: Date.now(), body });
    return NextResponse.json(body);
  } catch {
    // A lookup failure is not a reporting failure. The written address stands on
    // its own and the report goes through either way, so this stays quiet.
    return NextResponse.json({ candidates: [], unavailable: true });
  }
}
