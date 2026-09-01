/**
 * The shapes the operator board reads from /api/incidents.
 *
 * Lifted out of the page so the detail panel and the board agree on them rather
 * than each keeping a copy that drifts.
 */

export type Report = {
  id: string;
  created_at: number;
  status: string;
  raw_text: string | null;
  has_audio: boolean;
  has_image: boolean;
  pin_adjusted: boolean;
  reporter_name: string | null;
  reporter_phone: string | null;
  citizen_safe: boolean;
  /** Composed with no network; the reporter never confirmed the extraction. */
  queued_offline: boolean;
  latency_ms: number | null;
  model: string | null;
  repairs: string[];
  clarifications: { field: string; question: string; answer: string }[];
  extraction: {
    transcript_urdu: string;
    transcript_roman_urdu: string;
    english_summary: string;
    missing_information: string[];
  } | null;
};

export type Incident = {
  id: string;
  status: string;
  incident_type: string;
  summary: string | null;
  created_at: number;
  assigned_to: string | null;
  district: string | null;
  assigned_at: number | null;
  assigned_by: string | null;
  lat: number | null;
  lon: number | null;
  urgency: { indicator: string; sources: number }[];
  vulnerable: string[];
  resources: string[];
  people_claims: { value: number; sources: number }[];
  conflicts: { field: string; values: string[]; sources: number }[];
  /** Which fields an operator corrected, and who. Null when nothing was edited. */
  corrected: { fields: string[]; by: string; at: number } | null;
  quality: {
    locationQuality: "pinned" | "gps" | "landmark" | "missing";
    completeness: { present: number; total: number };
    distinctReports: number;
    citizenConfirmed: number;
    unresolvedConflicts: number;
  };
  locations: string[];
  signal: number;
  audit: { at: number; actor: string; action: string; detail: string | null }[];
  /** What the control room has told the reporter, and whether they have seen it. */
  messages: {
    at: number;
    body: string;
    actor: string;
    seen: boolean;
    to_team: string | null;
    /** How many people it went to, and how many have read it. */
    recipients: number;
    seenBy: number;
  }[];
  reports: Report[];
};

/** What an operator may correct. Interpretation only; never evidence. */
export type EditPatch = {
  summary?: string;
  urgency_indicators?: string[];
  people_affected?: number | null;
  vulnerable_people?: string[];
  road_access?: string;
};
