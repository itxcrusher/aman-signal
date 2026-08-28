import type { Extraction } from "./schema";
import type { ReportRow, IncidentRow } from "./db";

/**
 * Derives what an operator needs to see about an incident: the urgency indicators
 * behind it, how good the underlying data is, and where reports disagree.
 *
 * Deliberately not a single confidence score. LLM self-reported confidence is not
 * calibrated well enough to carry that authority, and one number hides the thing
 * a dispatcher actually needs to know: WHICH part is uncertain.
 */

export type Conflict = {
  field: string;
  values: string[];
  sources: number;
};

export type IncidentView = {
  incident: IncidentRow;
  reports: ReportRow[];
  extractions: Extraction[];
  /** Union of urgency indicators across reports, with how many reports back each. */
  urgency: { indicator: string; sources: number }[];
  vulnerable: string[];
  resources: string[];
  /** Never a sum. Distinct claims, with their source counts. */
  peopleClaims: { value: number; sources: number }[];
  conflicts: Conflict[];
  quality: {
    locationQuality: "gps" | "landmark" | "missing";
    completeness: { present: number; total: number };
    distinctReports: number;
    citizenConfirmed: number;
    unresolvedConflicts: number;
  };
  locations: string[];
};

const OPERATIONAL_FIELDS: (keyof Extraction)[] = [
  "incident_type",
  "urgency_indicators",
  "people_affected",
  "vulnerable_people",
  "road_access",
  "resources_required",
  "locations_mentioned",
  "english_summary",
];

function isPresent(e: Extraction, f: keyof Extraction): boolean {
  const v = e[f];
  if (v === null || v === undefined) return false;
  if (Array.isArray(v)) return v.length > 0;
  if (typeof v === "string") return v.trim() !== "";
  return true;
}

function countBy<T>(items: T[]): Map<T, number> {
  const m = new Map<T, number>();
  for (const i of items) m.set(i, (m.get(i) ?? 0) + 1);
  return m;
}

export function buildIncidentView(incident: IncidentRow, reports: ReportRow[]): IncidentView {
  const extractions: Extraction[] = reports
    .map((r) => (r.extraction_json ? (JSON.parse(r.extraction_json) as Extraction) : null))
    .filter((e): e is Extraction => e !== null);

  const urgencyCounts = countBy(extractions.flatMap((e) => e.urgency_indicators));
  const urgency = [...urgencyCounts.entries()]
    .map(([indicator, sources]) => ({ indicator, sources }))
    .sort((a, b) => b.sources - a.sources);

  const vulnerable = [...new Set(extractions.flatMap((e) => e.vulnerable_people))];
  const resources = [...new Set(extractions.flatMap((e) => e.resources_required))];
  const locations = [...new Set(extractions.flatMap((e) => e.locations_mentioned))];

  // People counts are NEVER summed. Five reports of "2 trapped" is evidence about
  // one group of two, not ten people. Distinct claims are shown with their support.
  const peopleCounts = countBy(
    extractions.map((e) => e.people_affected).filter((v): v is number => v !== null),
  );
  const peopleClaims = [...peopleCounts.entries()]
    .map(([value, sources]) => ({ value, sources }))
    .sort((a, b) => b.sources - a.sources);

  const conflicts: Conflict[] = [];

  // Road access is the field reports most often disagree on, and the disagreement
  // is operationally meaningful: it decides whether a vehicle can be sent.
  const roadValues = countBy(
    extractions.map((e) => e.road_access).filter((v) => v !== "unknown"),
  );
  if (roadValues.size > 1) {
    conflicts.push({
      field: "road_access",
      values: [...roadValues.keys()],
      sources: [...roadValues.values()].reduce((a, b) => a + b, 0),
    });
  }

  if (peopleClaims.length > 1) {
    conflicts.push({
      field: "people_affected",
      values: peopleClaims.map((p) => String(p.value)),
      sources: peopleClaims.reduce((a, b) => a + b.sources, 0),
    });
  }

  const withGps = reports.some((r) => r.lat !== null && r.lon !== null);
  const locationQuality: IncidentView["quality"]["locationQuality"] = withGps
    ? "gps"
    : locations.length > 0
      ? "landmark"
      : "missing";

  // Completeness is measured on the best-populated report, not averaged: one
  // complete report is more useful than three half-complete ones.
  const present = extractions.length
    ? Math.max(...extractions.map((e) => OPERATIONAL_FIELDS.filter((f) => isPresent(e, f)).length))
    : 0;

  return {
    incident,
    reports,
    extractions,
    urgency,
    vulnerable,
    resources,
    peopleClaims,
    conflicts,
    locations,
    quality: {
      locationQuality,
      completeness: { present, total: OPERATIONAL_FIELDS.length },
      distinctReports: reports.length,
      citizenConfirmed: reports.filter((r) => r.status === "confirmed").length,
      unresolvedConflicts: conflicts.length,
    },
  };
}

/**
 * Ordering hint for the board. This ranks by how many urgency signals are present
 * and how well corroborated they are; it does NOT decide response priority, and the
 * UI must never present it as such. The operator sorts and decides.
 */
export function signalStrength(v: IncidentView): number {
  const weights: Record<string, number> = {
    trapped_people: 5,
    medical_need: 4,
    no_safe_route: 3,
    rising_water: 3,
    structural_damage: 2,
    blocked_access: 1,
  };
  const base = v.urgency.reduce(
    (sum, u) => sum + (weights[u.indicator] ?? 1) * Math.min(u.sources, 3),
    0,
  );
  const vulnerableBoost = v.vulnerable.length * 2;
  return base + vulnerableBoost;
}

export const STATUS_FLOW = ["new", "verified", "assigned", "responding", "resolved"] as const;
export type Status = (typeof STATUS_FLOW)[number];

export const LABEL: Record<string, string> = {
  trapped_people: "People trapped",
  medical_need: "Medical need",
  rising_water: "Water rising",
  blocked_access: "Access blocked",
  no_safe_route: "No safe route",
  structural_damage: "Structural damage",
  elderly: "Elderly",
  children: "Children",
  disabled: "Disabled",
  pregnant: "Pregnant",
  injured: "Injured",
  rescue_boat: "Rescue boat",
  medical_team: "Medical team",
  evacuation: "Evacuation",
  food_water: "Food and water",
  shelter: "Shelter",
  flood_entrapment: "Flood entrapment",
  flood_damage: "Flood damage",
  medical_emergency: "Medical emergency",
  blocked_access_type: "Blocked access",
  other: "Other",
};
