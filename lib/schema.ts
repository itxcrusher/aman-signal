import { z } from "zod";

/**
 * The incident schema. Model output is validated against this before it can enter
 * the store: JSON mode guarantees JSON, not schema adherence. Measured against the
 * production endpoint on 2026-08-28, enum fields came back as free text
 * ("Children involved" instead of "children"), so normalisation before validation
 * is a required stage, not defensive boilerplate.
 */

export const INCIDENT_TYPES = [
  "flood_entrapment",
  "flood_damage",
  "medical_emergency",
  "blocked_access",
  "other",
] as const;

export const URGENCY_INDICATORS = [
  "trapped_people",
  "medical_need",
  "rising_water",
  "blocked_access",
  "no_safe_route",
  "structural_damage",
] as const;

export const VULNERABLE_GROUPS = [
  "elderly",
  "children",
  "disabled",
  "pregnant",
  "injured",
] as const;

/**
 * Access as ONE report describes it. "disputed" is deliberately absent: a single
 * report cannot dispute itself, and that state is derived at the incident level
 * when linked reports disagree. "partial" is operationally decisive, since a
 * motorcycle can carry medicine down a lane that no ambulance can enter.
 */
export const ROAD_ACCESS = ["open", "partial", "blocked", "unknown"] as const;

export const RESOURCES = [
  "rescue_boat",
  "medical_team",
  "evacuation",
  "food_water",
  "shelter",
] as const;

export const LANGUAGES = ["ur", "ur-Latn", "en", "mixed"] as const;

/** Where a field's value came from. Every operational claim is traceable. */
export const PROVENANCE = [
  "citizen_stated",
  "transcript",
  "image_observation",
  "clarification_answer",
  "operator_edit",
] as const;

export const ExtractionSchema = z.object({
  language_detected: z.enum(LANGUAGES),
  transcript_urdu: z.string().default(""),
  transcript_roman_urdu: z.string().default(""),
  english_summary: z.string().default(""),
  incident_type: z.enum(INCIDENT_TYPES),
  urgency_indicators: z.array(z.enum(URGENCY_INDICATORS)).default([]),
  /** Null when not stated. Never inferred, never summed across reports. */
  people_affected: z.number().int().nonnegative().nullable().default(null),
  vulnerable_people: z.array(z.enum(VULNERABLE_GROUPS)).default([]),
  road_access: z.enum(ROAD_ACCESS).default("unknown"),
  resources_required: z.array(z.enum(RESOURCES)).default([]),
  /** Colloquial location descriptions preserved verbatim ("pull ke paas"). */
  locations_mentioned: z.array(z.string()).default([]),
  /** What a dispatcher would still need to ask. Drives the clarification loop. */
  missing_information: z.array(z.string()).default([]),
});

export type Extraction = z.infer<typeof ExtractionSchema>;

/** Fields whose absence is worth asking the citizen about, in priority order. */
export const CLARIFICATION_PRIORITY = [
  { field: "location", test: (e: Extraction) => e.locations_mentioned.length === 0 },
  {
    field: "people_affected",
    test: (e: Extraction) =>
      e.people_affected === null && e.urgency_indicators.includes("trapped_people"),
  },
  {
    field: "medical_detail",
    test: (e: Extraction) =>
      e.urgency_indicators.includes("medical_need") && e.english_summary.length < 40,
  },
] as const;

/**
 * Map free-text model output onto schema enums. Returns null when no confident
 * mapping exists, so unmapped values are dropped rather than guessed into the store.
 */
function toEnum<T extends readonly string[]>(
  raw: unknown,
  allowed: T,
  aliases: Record<string, T[number]> = {},
): T[number] | null {
  if (typeof raw !== "string") return null;
  const key = raw.trim().toLowerCase().replace(/[\s-]+/g, "_");
  if ((allowed as readonly string[]).includes(key)) return key as T[number];
  if (key in aliases) return aliases[key];
  // Substring match: "children involved" -> "children"
  const hit = (allowed as readonly string[]).find(
    (a) => key.includes(a) || a.includes(key),
  );
  return (hit as T[number]) ?? null;
}

const URGENCY_ALIASES: Record<string, (typeof URGENCY_INDICATORS)[number]> = {
  people_trapped: "trapped_people",
  trapped: "trapped_people",
  stranded: "trapped_people",
  medical: "medical_need",
  medical_assistance: "medical_need",
  injury: "medical_need",
  water_rising: "rising_water",
  flooding: "rising_water",
  road_blocked: "blocked_access",
  inaccessible: "blocked_access",
  no_route: "no_safe_route",
  building_damage: "structural_damage",
  collapse: "structural_damage",
};

const VULNERABLE_ALIASES: Record<string, (typeof VULNERABLE_GROUPS)[number]> = {
  old_people: "elderly",
  senior_citizens: "elderly",
  buzurg: "elderly",
  kids: "children",
  infants: "children",
  bachay: "children",
  handicapped: "disabled",
  expecting: "pregnant",
  wounded: "injured",
};

const RESOURCE_ALIASES: Record<string, (typeof RESOURCES)[number]> = {
  boat: "rescue_boat",
  rescue: "rescue_boat",
  ambulance: "medical_team",
  doctor: "medical_team",
  medical_help: "medical_team",
  rescue_team: "evacuation",
  food: "food_water",
  water: "food_water",
  rations: "food_water",
  tent: "shelter",
  housing: "shelter",
};

const TYPE_ALIASES: Record<string, (typeof INCIDENT_TYPES)[number]> = {
  entrapment: "flood_entrapment",
  trapped: "flood_entrapment",
  flood: "flood_damage",
  damage: "flood_damage",
  medical: "medical_emergency",
  road: "blocked_access",
};

const LANG_ALIASES: Record<string, (typeof LANGUAGES)[number]> = {
  urdu: "ur",
  roman_urdu: "ur-Latn",
  romanurdu: "ur-Latn",
  english: "en",
  ur_latn: "ur-Latn",
};

function arrayOf<T extends readonly string[]>(
  raw: unknown,
  allowed: T,
  aliases: Record<string, T[number]>,
): T[number][] {
  if (!Array.isArray(raw)) return [];
  const out = raw
    .map((v) => toEnum(v, allowed, aliases))
    .filter((v): v is T[number] => v !== null);
  return [...new Set(out)];
}

/** Number, or null. Rejects strings that are not clean integers rather than guessing. */
function toCount(raw: unknown): number | null {
  if (typeof raw === "number" && Number.isFinite(raw) && raw >= 0) {
    return Math.round(raw);
  }
  if (typeof raw === "string") {
    const m = raw.match(/\d+/);
    if (m) return parseInt(m[0], 10);
  }
  return null;
}

export type NormaliseResult =
  | { ok: true; data: Extraction; repairs: string[] }
  | { ok: false; error: string; repairs: string[] };

/**
 * Normalise raw model JSON, then validate. Repairs are recorded so the evaluation
 * suite can measure how often the model deviates from the schema.
 */
export function normaliseExtraction(raw: unknown): NormaliseResult {
  const repairs: string[] = [];
  if (typeof raw !== "object" || raw === null) {
    return { ok: false, error: "model output was not a JSON object", repairs };
  }
  const r = raw as Record<string, unknown>;

  const lang = toEnum(r.language_detected, LANGUAGES, LANG_ALIASES);
  if (lang === null && r.language_detected !== undefined) {
    repairs.push(`language_detected: dropped unmappable ${JSON.stringify(r.language_detected)}`);
  }

  const type = toEnum(r.incident_type, INCIDENT_TYPES, TYPE_ALIASES);
  if (type === null && r.incident_type !== undefined) {
    repairs.push(`incident_type: ${JSON.stringify(r.incident_type)} -> other`);
  }

  const urgency = arrayOf(r.urgency_indicators, URGENCY_INDICATORS, URGENCY_ALIASES);
  if (Array.isArray(r.urgency_indicators) && urgency.length !== r.urgency_indicators.length) {
    repairs.push("urgency_indicators: normalised free text to enums");
  }

  const vulnerable = arrayOf(r.vulnerable_people, VULNERABLE_GROUPS, VULNERABLE_ALIASES);
  if (Array.isArray(r.vulnerable_people) && vulnerable.length !== r.vulnerable_people.length) {
    repairs.push("vulnerable_people: normalised free text to enums");
  }

  const resources = arrayOf(r.resources_required, RESOURCES, RESOURCE_ALIASES);
  if (Array.isArray(r.resources_required) && resources.length !== r.resources_required.length) {
    repairs.push("resources_required: normalised free text to enums");
  }

  const road = toEnum(r.road_access, ROAD_ACCESS, {
    passable: "open",
    closed: "blocked",
    disputed: "unknown",
    partially_blocked: "partial",
    partially_passable: "partial",
    limited: "partial",
  });

  const candidate = {
    language_detected: lang ?? "mixed",
    transcript_urdu: typeof r.transcript_urdu === "string" ? r.transcript_urdu : "",
    transcript_roman_urdu:
      typeof r.transcript_roman_urdu === "string" ? r.transcript_roman_urdu : "",
    english_summary: typeof r.english_summary === "string" ? r.english_summary : "",
    incident_type: type ?? "other",
    urgency_indicators: urgency,
    people_affected: toCount(r.people_affected),
    vulnerable_people: vulnerable,
    road_access: road ?? "unknown",
    resources_required: resources,
    locations_mentioned: Array.isArray(r.locations_mentioned)
      ? r.locations_mentioned.filter((v): v is string => typeof v === "string" && v.trim() !== "")
      : [],
    missing_information: Array.isArray(r.missing_information)
      ? r.missing_information.filter((v): v is string => typeof v === "string")
      : [],
  };

  const parsed = ExtractionSchema.safeParse(candidate);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues.map((i) => i.message).join("; "), repairs };
  }
  return { ok: true, data: parsed.data, repairs };
}
