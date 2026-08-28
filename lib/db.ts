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
    lat REAL, lon REAL,
    location_text TEXT,
    reporter_contact TEXT,
    extraction_json TEXT,
    repairs_json TEXT,
    provenance_json TEXT,
    clarifications_json TEXT,
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

let _db: Database.Database | null = null;

export function db(): Database.Database {
  if (_db) return _db;
  _db = new Database(path.join(DATA_DIR, "amansignal.db"));
  _db.pragma("journal_mode = WAL");
  for (const s of STATEMENTS) _db.prepare(s).run();
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
  location_text: string | null;
  extraction_json: string | null;
  repairs_json: string | null;
  clarifications_json: string | null;
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
};

export const id = () =>
  Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

export function insertReport(r: Partial<ReportRow> & { id: string; status: string }) {
  db()
    .prepare(
      `INSERT INTO reports (id, created_at, status, incident_id, raw_text, audio_path,
        image_path, lat, lon, location_text, extraction_json, repairs_json,
        clarifications_json, model, latency_ms)
       VALUES (@id, @created_at, @status, @incident_id, @raw_text, @audio_path,
        @image_path, @lat, @lon, @location_text, @extraction_json, @repairs_json,
        @clarifications_json, @model, @latency_ms)`,
    )
    .run({
      created_at: Date.now(),
      incident_id: null,
      raw_text: null,
      audio_path: null,
      image_path: null,
      lat: null,
      lon: null,
      location_text: null,
      extraction_json: null,
      repairs_json: null,
      clarifications_json: null,
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
  "location_text", "extraction_json", "repairs_json", "provenance_json",
  "clarifications_json", "model", "latency_ms",
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
  db()
    .prepare("UPDATE incidents SET status = ?, updated_at = ?, assigned_to = COALESCE(?, assigned_to) WHERE id = ?")
    .run(status, Date.now(), assignedTo ?? null, iid);
  audit(iid, actor, "status_change", status + (assignedTo ? ` -> ${assignedTo}` : ""));
}

export function auditFor(incidentId: string) {
  return db()
    .prepare("SELECT * FROM audit WHERE incident_id = ? ORDER BY at ASC")
    .all(incidentId) as { at: number; actor: string; action: string; detail: string | null }[];
}
