import Database from "better-sqlite3";
import path from "node:path";
import fs from "node:fs";
import type { Extraction } from "./schema";

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
  },
  incidents: {
    assigned_at: "INTEGER",
    assigned_by: "TEXT",
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
};

export const id = () =>
  Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

export function insertReport(r: Partial<ReportRow> & { id: string; status: string }) {
  db()
    .prepare(
      `INSERT INTO reports (id, created_at, status, incident_id, raw_text, audio_path,
        image_path, lat, lon, accuracy_m, location_text, reporter_id, reporter_name,
        reporter_phone, pin_adjusted, extraction_json, repairs_json,
        clarifications_json, dedup_json, model, latency_ms)
       VALUES (@id, @created_at, @status, @incident_id, @raw_text, @audio_path,
        @image_path, @lat, @lon, @accuracy_m, @location_text, @reporter_id, @reporter_name,
        @reporter_phone, @pin_adjusted, @extraction_json, @repairs_json,
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
      extraction_json: null,
      repairs_json: null,
      clarifications_json: null,
      dedup_json: null,
      model: null,
      latency_ms: null,
      ...r,
    });
}

export function getReport(rid: string): ReportRow | undefined {
  return db().prepare("SELECT * FROM reports WHERE id = ?").get(rid) as ReportRow | undefined;
}

/** Field names are whitelisted against the table to keep interpolation safe. */
const REPORT_FIELDS = new Set([
  "status", "incident_id", "raw_text", "audio_path", "image_path", "lat", "lon",
  "accuracy_m", "location_text", "pin_adjusted", "extraction_json", "repairs_json", "provenance_json",
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

export function createIncident(e: Extraction, lat: number | null, lon: number | null) {
  const iid = id();
  const now = Date.now();
  db()
    .prepare(
      `INSERT INTO incidents (id, created_at, updated_at, status, incident_type, lat, lon, summary, assigned_to)
       VALUES (?,?,?,?,?,?,?,?,NULL)`,
    )
    .run(iid, now, now, "new", e.incident_type, lat, lon, e.english_summary);
  audit(iid, "ai", "incident_created", `type=${e.incident_type}`);
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

export function linkReportToIncident(rid: string, incidentId: string) {
  db()
    .prepare("UPDATE reports SET incident_id = ?, status = 'confirmed' WHERE id = ?")
    .run(incidentId, rid);
  db().prepare("UPDATE incidents SET updated_at = ? WHERE id = ?").run(Date.now(), incidentId);
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

export function auditFor(incidentId: string) {
  return db()
    .prepare("SELECT * FROM audit WHERE incident_id = ? ORDER BY at ASC")
    .all(incidentId) as { at: number; actor: string; action: string; detail: string | null }[];
}
