import Database from "better-sqlite3";
import path from "node:path";
import fs from "node:fs";
import type { Extraction } from "./schema";
import { districtFor } from "./districts";

/**
 * Reports are immutable evidence. Incidents are the operational interpretation.
 * A report is never edited after confirmation and never destructively merged;
 * reconciliation happens at the incident layer, with links back to every report.
 */

const DATA_DIR = process.env.AMANSIGNAL_DATA_DIR ?? path.join(process.cwd(), "data");
fs.mkdirSync(DATA_DIR, { recursive: true });
fs.mkdirSync(path.join(DATA_DIR, "media"), { recursive: true });

const STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS reports (
    id TEXT PRIMARY KEY,
    created_at INTEGER NOT NULL,
    status TEXT NOT NULL,
    incident_id TEXT,
    raw_text TEXT,
    audio_path TEXT,
    image_path TEXT,
    lat REAL, lon REAL, accuracy_m REAL,
    location_text TEXT,
    reporter_contact TEXT,
    extraction_json TEXT,
    repairs_json TEXT,
    provenance_json TEXT,
    clarifications_json TEXT,
    dedup_json TEXT,
    model TEXT,
    latency_ms INTEGER
  )`,
  `CREATE TABLE IF NOT EXISTS incidents (
    id TEXT PRIMARY KEY,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    status TEXT NOT NULL,
    incident_type TEXT NOT NULL,
    lat REAL, lon REAL,
    summary TEXT,
    assigned_to TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS audit (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    at INTEGER NOT NULL,
    incident_id TEXT NOT NULL,
    actor TEXT NOT NULL,
    action TEXT NOT NULL,
    detail TEXT
  )`,
  `CREATE INDEX IF NOT EXISTS idx_reports_incident ON reports(incident_id)`,
  `CREATE INDEX IF NOT EXISTS idx_incidents_status ON incidents(status)`,
];

/**
 * Additive migrations. SQLite has no "ADD COLUMN IF NOT EXISTS", so every column
 * added after the first release is declared here and checked against the live
 * table. Table and column names are internal constants, never user input.
 */
const MIGRATIONS: Record<string, Record<string, string>> = {
  reports: {
    dedup_json: "TEXT",
    accuracy_m: "REAL",
    // Identity without accounts: a device-scoped id lets someone see their own
    // reports without a login, and a phone number lets an operator call back,
    // which is the single most useful action available to them.
    reporter_id: "TEXT",
    reporter_name: "TEXT",
    reporter_phone: "TEXT",
    // Whether the citizen moved the pin off the GPS fix. A hand-placed pin in a
    // dense street is usually better than a 40m fix, and dedup needs to know.
    pin_adjusted: "INTEGER",
    // The reporter saying the danger has passed. It is recorded as their claim,
    // never as a resolution: only an operator closes an incident, because someone
    // may be safe while their neighbours are not.
    citizen_safe: "INTEGER",
    citizen_safe_at: "INTEGER",
    // Composed with no network and sent later. Such a report never passed the
    // confirmation screen, because that needs a model call the reporter was
    // offline for, so the board must show it as unverified by the person who
    // sent it rather than implying they checked it.
    queued_offline: "INTEGER",
    // An id the phone generates before it uploads, so a retry after a lost
    // response can be recognised as the same report rather than becoming a
    // second one. Only queued reports carry it; a live submission has a
    // response to rely on and never retries blind.
    client_key: "TEXT",
  },
  incidents: {
    assigned_at: "INTEGER",
    assigned_by: "TEXT",
    // Which control room owns this. Relief is run district by district, so a
    // national list of everything in the country is worse than useless to the
    // person staffing one room.
    district: "TEXT",
    // An operator's corrections, layered over the values derived from reports.
    // Stored here rather than written back into the reports because reports are
    // evidence: a citizen said what they said, and an operator deciding the
    // model misread it does not change what was said. The derivation stays
    // intact underneath, so removing the override restores it exactly.
    override_json: "TEXT",
  },
};

const POST_MIGRATION = [
  `CREATE INDEX IF NOT EXISTS idx_reports_reporter ON reports(reporter_id)`,
];

let _db: Database.Database | null = null;

export function db(): Database.Database {
  if (_db) return _db;
  _db = new Database(path.join(DATA_DIR, "amansignal.db"));
  _db.pragma("journal_mode = WAL");
  for (const s of STATEMENTS) _db.prepare(s).run();
  for (const [table, columns] of Object.entries(MIGRATIONS)) {
    const have = new Set(
      (_db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]).map((c) => c.name),
    );
    for (const [name, type] of Object.entries(columns)) {
      if (!have.has(name)) _db.prepare(`ALTER TABLE ${table} ADD COLUMN ${name} ${type}`).run();
    }
  }
  for (const s of POST_MIGRATION) _db.prepare(s).run();
  return _db;
}

export const mediaDir = () => path.join(DATA_DIR, "media");

export type ReportRow = {
  id: string;
  created_at: number;
  status: string;
  incident_id: string | null;
  raw_text: string | null;
  audio_path: string | null;
  image_path: string | null;
  lat: number | null;
  lon: number | null;
  accuracy_m: number | null;
  location_text: string | null;
  reporter_id: string | null;
  reporter_name: string | null;
  reporter_phone: string | null;
  pin_adjusted: number | null;
  citizen_safe: number | null;
  citizen_safe_at: number | null;
  queued_offline: number | null;
  client_key: string | null;
  extraction_json: string | null;
  repairs_json: string | null;
  clarifications_json: string | null;
  dedup_json: string | null;
  model: string | null;
  latency_ms: number | null;
};

export type IncidentRow = {
  id: string;
  created_at: number;
  updated_at: number;
  status: string;
  incident_type: string;
  lat: number | null;
  lon: number | null;
  summary: string | null;
  assigned_to: string | null;
  assigned_at: number | null;
  assigned_by: string | null;
  district: string | null;
  override_json: string | null;
};

/**
 * What an operator may correct on an incident.
 *
 * Every field here is interpretation: a judgement about what the reports mean.
 * Nothing that is evidence appears in this list, so there is no way to edit what
 * a reporter actually said, only what the board concludes from it.
 */
export type IncidentOverride = {
  summary?: string;
  incident_type?: string;
  urgency_indicators?: string[];
  people_affected?: number | null;
  vulnerable_people?: string[];
  road_access?: string;
  /** Set on save so the board can show the correction as a human judgement. */
  edited_by?: string;
  edited_at?: number;
};

export const id = () =>
  Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

export function insertReport(r: Partial<ReportRow> & { id: string; status: string }) {
  db()
    .prepare(
      `INSERT INTO reports (id, created_at, status, incident_id, raw_text, audio_path,
        image_path, lat, lon, accuracy_m, location_text, reporter_id, reporter_name,
        reporter_phone, pin_adjusted, queued_offline, client_key, extraction_json, repairs_json,
        clarifications_json, dedup_json, model, latency_ms)
       VALUES (@id, @created_at, @status, @incident_id, @raw_text, @audio_path,
        @image_path, @lat, @lon, @accuracy_m, @location_text, @reporter_id, @reporter_name,
        @reporter_phone, @pin_adjusted, @queued_offline, @client_key, @extraction_json, @repairs_json,
        @clarifications_json, @dedup_json, @model, @latency_ms)`,
    )
    .run({
      created_at: Date.now(),
      incident_id: null,
      raw_text: null,
      audio_path: null,
      image_path: null,
      lat: null,
      lon: null,
      accuracy_m: null,
      location_text: null,
      reporter_id: null,
      reporter_name: null,
      reporter_phone: null,
      pin_adjusted: null,
      queued_offline: null,
      client_key: null,
      extraction_json: null,
      repairs_json: null,
      clarifications_json: null,
      dedup_json: null,
      model: null,
      latency_ms: null,
      ...r,
    });
}

/**
 * Find a report by the key the phone generated for it.
 *
 * This is what makes a queued send safe to repeat. A phone that uploads a report
 * and never sees the response cannot know whether it arrived, and the honest
 * choices are to send again or to give up on it; sending again is right, and
 * this is what stops that costing a duplicate incident and an orphaned draft
 * that no operator would ever be shown.
 */
export function getReportByClientKey(key: string): ReportRow | undefined {
  return db().prepare("SELECT * FROM reports WHERE client_key = ?").get(key) as
    | ReportRow
    | undefined;
}

export function getReport(rid: string): ReportRow | undefined {
  return db().prepare("SELECT * FROM reports WHERE id = ?").get(rid) as ReportRow | undefined;
}

/** Field names are whitelisted against the table to keep interpolation safe. */
const REPORT_FIELDS = new Set([
  "status", "incident_id", "raw_text", "audio_path", "image_path", "lat", "lon",
  "accuracy_m", "location_text", "pin_adjusted", "queued_offline", "client_key", "extraction_json", "repairs_json", "provenance_json",
  "clarifications_json", "dedup_json", "model", "latency_ms",
]);

export function updateReport(rid: string, fields: Record<string, unknown>) {
  const keys = Object.keys(fields).filter((k) => REPORT_FIELDS.has(k));
  if (!keys.length) return;
  const set = keys.map((k) => `${k} = @${k}`).join(", ");
  const payload: Record<string, unknown> = { id: rid };
  for (const k of keys) payload[k] = fields[k];
  db().prepare(`UPDATE reports SET ${set} WHERE id = @id`).run(payload);
}

export function audit(
  incidentId: string,
  actor: string,
  action: string,
  detail?: string,
) {
  db()
    .prepare("INSERT INTO audit (at, incident_id, actor, action, detail) VALUES (?,?,?,?,?)")
    .run(Date.now(), incidentId, actor, action, detail ?? null);
}

export function createIncident(
  e: Extraction,
  lat: number | null,
  lon: number | null,
  /**
   * Who did the interpreting. Normally the model, but an operator reading a
   * report the model could not parse is authoring that reading themselves, and
   * the audit trail must not credit a machine for a human's judgement.
   */
  actor = "ai",
) {
  const iid = id();
  const now = Date.now();
  const district = districtFor(lat, lon);
  db()
    .prepare(
      `INSERT INTO incidents (id, created_at, updated_at, status, incident_type, lat, lon, summary, assigned_to, district)
       VALUES (?,?,?,?,?,?,?,?,NULL,?)`,
    )
    .run(iid, now, now, "new", e.incident_type, lat, lon, e.english_summary, district);
  audit(iid, actor, "incident_created", `type=${e.incident_type}${district ? ` district=${district}` : ""}`);
  return iid;
}

export function listIncidents(): IncidentRow[] {
  return db()
    .prepare("SELECT * FROM incidents ORDER BY created_at DESC")
    .all() as IncidentRow[];
}

/** Reports held for an operator's duplicate judgement. */
export function pendingDuplicates(): ReportRow[] {
  return db()
    .prepare("SELECT * FROM reports WHERE status = 'possible_duplicate' ORDER BY created_at DESC")
    .all() as ReportRow[];
}

/**
 * Reports the model could not read, which no other surface would ever show.
 *
 * A failed extraction leaves the report at 'draft' with its audio and photo
 * already saved. Every operator view queries incidents, and a draft has none, so
 * until this existed those reports were written to disk and seen by nobody: a
 * voice note recorded in a flood, kept perfectly, and invisible. The evidence is
 * intact and a person can read it, so the answer is to put it in front of one
 * rather than to discard it.
 *
 * Only failures, never ordinary drafts. A report awaiting its confirmation
 * screen is mid-flow and belongs to the reporter; showing those would fill the
 * board with reports nobody has finished writing.
 *
 * Oldest first: here, unlike the incident board, waiting time is the whole
 * measure of urgency, because nothing has been read yet.
 */
export function unreadableReports(): ReportRow[] {
  return db()
    .prepare(
      `SELECT * FROM reports
       WHERE status = 'draft' AND repairs_json LIKE '%"failed:%'
       ORDER BY created_at ASC`,
    )
    .all() as ReportRow[];
}

export function linkReportToIncident(rid: string, incidentId: string) {
  db()
    .prepare("UPDATE reports SET incident_id = ?, status = 'confirmed' WHERE id = ?")
    .run(incidentId, rid);
  db().prepare("UPDATE incidents SET updated_at = ? WHERE id = ?").run(Date.now(), incidentId);
  backfillLocation(incidentId);
}

/**
 * Give an incident coordinates and a district once any of its reports has them.
 *
 * The first report to arrive often has no location: someone typing in a hurry, or
 * a phone that never got a fix. A later report about the same emergency may be
 * precisely placed, and without this the incident would stay unplaced and unowned
 * forever, invisible on the map and belonging to no control room.
 */
export function backfillLocation(incidentId: string) {
  const inc = db()
    .prepare("SELECT lat, lon, district FROM incidents WHERE id = ?")
    .get(incidentId) as { lat: number | null; lon: number | null; district: string | null } | undefined;
  if (!inc) return;
  if (inc.lat !== null && inc.lon !== null && inc.district) return;

  const placed = db()
    .prepare(
      `SELECT lat, lon FROM reports
        WHERE incident_id = ? AND lat IS NOT NULL AND lon IS NOT NULL
        ORDER BY pin_adjusted DESC, created_at ASC LIMIT 1`,
    )
    .get(incidentId) as { lat: number; lon: number } | undefined;
  if (!placed) return;

  const lat = inc.lat ?? placed.lat;
  const lon = inc.lon ?? placed.lon;
  db()
    .prepare("UPDATE incidents SET lat = ?, lon = ?, district = COALESCE(district, ?) WHERE id = ?")
    .run(lat, lon, districtFor(lat, lon), incidentId);
}

export function reportsFor(incidentId: string): ReportRow[] {
  return db()
    .prepare("SELECT * FROM reports WHERE incident_id = ? ORDER BY created_at ASC")
    .all(incidentId) as ReportRow[];
}

const INCIDENT_STATUSES = new Set([
  "new", "verified", "assigned", "responding", "resolved",
]);

/** Status transitions are human-only; the actor is always recorded. */
export function setIncidentStatus(
  iid: string,
  status: string,
  actor: string,
  assignedTo?: string,
) {
  if (!INCIDENT_STATUSES.has(status)) throw new Error(`invalid status: ${status}`);
  const now = Date.now();
  db()
    .prepare(
      `UPDATE incidents SET status = ?, updated_at = ?,
        assigned_to = COALESCE(?, assigned_to),
        assigned_at = CASE WHEN ? IS NULL THEN assigned_at ELSE ? END,
        assigned_by = CASE WHEN ? IS NULL THEN assigned_by ELSE ? END
       WHERE id = ?`,
    )
    .run(status, now, assignedTo ?? null, assignedTo ?? null, now, assignedTo ?? null, actor, iid);
  audit(iid, actor, "status_change", status + (assignedTo ? ` -> ${assignedTo}` : ""));
}

/**
 * A reporter marking themselves safe.
 *
 * This is a claim by the person, not a resolution of the incident. It never closes
 * anything: they may be out of the water while the people next door are not, and
 * only an operator can decide an incident is over. Its value is that a dispatcher
 * learns a team can go elsewhere, which is worth a great deal during a flood.
 *
 * Scoped to the reporter's own device id, so nobody can mark a stranger safe.
 */
export function setCitizenSafe(reportId: string, reporterId: string, safe: boolean): boolean {
  const now = Date.now();
  const res = db()
    .prepare(
      `UPDATE reports SET citizen_safe = ?, citizen_safe_at = ?
        WHERE id = ? AND reporter_id = ?`,
    )
    .run(safe ? 1 : 0, safe ? now : null, reportId, reporterId);
  if (res.changes === 0) return false;
  const row = getReport(reportId);
  if (row?.incident_id) {
    audit(
      row.incident_id,
      "citizen",
      safe ? "reported_safe" : "safe_withdrawn",
      `report=${reportId}`,
    );
    db().prepare("UPDATE incidents SET updated_at = ? WHERE id = ?").run(now, row.incident_id);
  }
  return true;
}

export type MyReportRow = ReportRow & {
  incident_status: string | null;
  incident_assigned_to: string | null;
  incident_type: string | null;
};

/**
 * A citizen's own reports. Identity here is a device-scoped id, not an account:
 * enough to show someone what became of what they sent, without asking them to
 * remember a password during a flood. It grants no operator access and is never
 * used for authorisation, only for showing a reporter their own submissions.
 */
export function reportsByReporter(reporterId: string): MyReportRow[] {
  return db()
    .prepare(
      `SELECT r.*, i.status AS incident_status, i.assigned_to AS incident_assigned_to,
              i.incident_type AS incident_type
         FROM reports r LEFT JOIN incidents i ON i.id = r.incident_id
        WHERE r.reporter_id = ?
        ORDER BY r.created_at DESC LIMIT 50`,
    )
    .all(reporterId) as MyReportRow[];
}

/**
 * Assignment is a human act and is recorded with the name of whoever performed
 * it. Naming the responding team is what lets a reporter be told something more
 * useful than "received": it is the difference between a void and an answer.
 */
export function assignIncident(iid: string, team: string, actor: string) {
  const now = Date.now();
  const res = db()
    .prepare(
      `UPDATE incidents SET assigned_to = ?, assigned_at = ?, assigned_by = ?, updated_at = ?,
        status = CASE WHEN status IN ('new', 'verified') THEN 'assigned' ELSE status END
       WHERE id = ?`,
    )
    .run(team, now, actor, now, iid);
  if (res.changes === 0) throw new Error("incident not found");
  audit(iid, actor, "assigned", `team=${team}`);
}

/**
 * Record an operator's correction to an incident.
 *
 * Merged over any previous override rather than replacing it, so two operators
 * correcting different fields do not undo each other. The audit line names the
 * fields touched, not their values: the values are visible on the incident, and
 * an audit trail that restates them is unreadable at the length these grow to.
 */
export function setIncidentOverride(
  iid: string,
  patch: IncidentOverride,
  actor: string,
): boolean {
  const row = db().prepare("SELECT override_json FROM incidents WHERE id = ?").get(iid) as
    | { override_json: string | null }
    | undefined;
  if (!row) return false;

  let existing: IncidentOverride = {};
  try {
    existing = row.override_json ? (JSON.parse(row.override_json) as IncidentOverride) : {};
  } catch {
    // A malformed override is discarded rather than blocking the correction.
    existing = {};
  }

  const now = Date.now();
  const merged: IncidentOverride = { ...existing, ...patch, edited_by: actor, edited_at: now };
  const touched = Object.keys(patch).filter((k) => k !== "edited_by" && k !== "edited_at");

  db()
    .prepare("UPDATE incidents SET override_json = ?, updated_at = ? WHERE id = ?")
    .run(JSON.stringify(merged), now, iid);

  // Summary edits also update the column the board and the map read directly.
  if (typeof patch.summary === "string") {
    db().prepare("UPDATE incidents SET summary = ? WHERE id = ?").run(patch.summary, iid);
  }
  if (typeof patch.incident_type === "string") {
    db().prepare("UPDATE incidents SET incident_type = ? WHERE id = ?").run(patch.incident_type, iid);
  }

  audit(iid, actor, "incident_edited", touched.length ? `fields=${touched.join(",")}` : "no fields");
  return true;
}

/**
 * Replace an incident's headline with one synthesised from all its reports.
 *
 * Refuses when an operator has corrected the summary themselves. A human who has
 * spoken to the reporter knows more than a model reading them, and silently
 * overwriting that correction the next time an update arrived would be the
 * worst kind of bug: invisible, and it would look like the operator's own edit
 * had simply not saved.
 *
 * Attributed to the machine in the audit trail, because that is what it is.
 */
export function setIncidentSynthesis(iid: string, summary: string): boolean {
  const row = db().prepare("SELECT override_json FROM incidents WHERE id = ?").get(iid) as
    | { override_json: string | null }
    | undefined;
  if (!row) return false;

  try {
    const o = row.override_json ? (JSON.parse(row.override_json) as { summary?: unknown }) : {};
    if (typeof o.summary === "string" && o.summary.trim()) return false;
  } catch {
    // A malformed override is not a correction worth protecting.
  }

  db()
    .prepare("UPDATE incidents SET summary = ?, updated_at = ? WHERE id = ?")
    .run(summary, Date.now(), iid);
  audit(iid, "ai", "summary_resynthesised", "rewritten from all linked reports");
  return true;
}

/** Drop an operator's corrections and fall back to what the reports derive. */
export function clearIncidentOverride(iid: string, actor: string): boolean {
  const res = db()
    .prepare("UPDATE incidents SET override_json = NULL, updated_at = ? WHERE id = ?")
    .run(Date.now(), iid);
  if (res.changes === 0) return false;
  audit(iid, actor, "incident_edit_cleared", "reverted to values derived from reports");
  return true;
}

export function auditFor(incidentId: string) {
  return db()
    .prepare("SELECT * FROM audit WHERE incident_id = ? ORDER BY at ASC")
    .all(incidentId) as { at: number; actor: string; action: string; detail: string | null }[];
}
