import { NextRequest, NextResponse } from "next/server";
import { setIncidentOverride, clearIncidentOverride, type IncidentOverride } from "@/lib/db";
import {
  URGENCY_INDICATORS,
  VULNERABLE_GROUPS,
  ROAD_ACCESS,
  INCIDENT_TYPES,
} from "@/lib/schema";

export const runtime = "nodejs";

/**
 * An operator correcting an incident.
 *
 * This edits the INTERPRETATION, never the evidence. The incident is what the
 * board concludes from a set of reports; the reports are what people actually
 * said, and an operator deciding the model misread someone does not change what
 * that person said. So a correction is stored as an override layered over the
 * derived values, the reports underneath stay byte-for-byte as submitted, and
 * clearing the override restores the derivation exactly.
 *
 * Attributed like every other operator action. An anonymous correction would be
 * worse than no correction: the whole claim of this system is that a human
 * decided, and a human who cannot be named has not decided anything.
 */

function pickStrings(input: unknown, allowed: readonly string[]): string[] | undefined {
  if (!Array.isArray(input)) return undefined;
  return input.filter((v): v is string => typeof v === "string" && allowed.includes(v));
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  let body: { operator?: string; patch?: Record<string, unknown>; clear?: boolean };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "expected JSON" }, { status: 400 });
  }

  const operator = body.operator?.trim();
  if (!operator) {
    return NextResponse.json(
      { error: "operator is required: every correction is attributed to a person" },
      { status: 400 },
    );
  }
  const actor = `operator:${operator}`;

  if (body.clear) {
    const ok = clearIncidentOverride(id, actor);
    if (!ok) return NextResponse.json({ error: "incident not found" }, { status: 404 });
    return NextResponse.json({ id, cleared: true });
  }

  const raw = body.patch ?? {};
  const patch: IncidentOverride = {};

  // Every field is validated against the same vocabularies the extractor uses.
  // An operator is trusted to judge, not to invent enum values the rest of the
  // board cannot render.
  if (typeof raw.summary === "string") {
    const s = raw.summary.trim().slice(0, 1000);
    if (s) patch.summary = s;
  }
  if (typeof raw.incident_type === "string" && (INCIDENT_TYPES as readonly string[]).includes(raw.incident_type)) {
    patch.incident_type = raw.incident_type;
  }
  const urgency = pickStrings(raw.urgency_indicators, URGENCY_INDICATORS);
  if (urgency) patch.urgency_indicators = urgency;

  const vulnerable = pickStrings(raw.vulnerable_people, VULNERABLE_GROUPS);
  if (vulnerable) patch.vulnerable_people = vulnerable;

  if (typeof raw.road_access === "string" && (ROAD_ACCESS as readonly string[]).includes(raw.road_access)) {
    patch.road_access = raw.road_access;
  }
  if ("people_affected" in raw) {
    const n = raw.people_affected;
    if (n === null) patch.people_affected = null;
    else if (typeof n === "number" && Number.isFinite(n) && n >= 0 && n < 100000) {
      patch.people_affected = Math.round(n);
    }
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "nothing valid to change" }, { status: 400 });
  }

  const ok = setIncidentOverride(id, patch, actor);
  if (!ok) return NextResponse.json({ error: "incident not found" }, { status: 404 });

  return NextResponse.json({ id, changed: Object.keys(patch) });
}
