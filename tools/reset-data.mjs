/**
 * Clear all reports, incidents and audit history from the local database.
 * Development helper for re-running the demo scenario from a known state.
 *
 * USAGE
 *   node tools/reset-data.mjs
 */
import Database from "better-sqlite3";
import path from "node:path";
import fs from "node:fs";

const dataDir = process.env.AMANSIGNAL_DATA_DIR ?? path.join(process.cwd(), "data");
const dbPath = path.join(dataDir, "amansignal.db");

if (!fs.existsSync(dbPath)) {
  console.log(`No database at ${dbPath}; nothing to reset.`);
  process.exit(0);
}

const db = new Database(dbPath);
const before = {
  reports: db.prepare("SELECT COUNT(*) n FROM reports").get().n,
  incidents: db.prepare("SELECT COUNT(*) n FROM incidents").get().n,
};

for (const table of ["audit", "reports", "incidents"]) {
  db.prepare(`DELETE FROM ${table}`).run();
}

// Uploaded media belongs to the deleted reports; leaving it orphans files on disk.
const mediaDir = path.join(dataDir, "media");
let removed = 0;
if (fs.existsSync(mediaDir)) {
  for (const f of fs.readdirSync(mediaDir)) {
    fs.unlinkSync(path.join(mediaDir, f));
    removed++;
  }
}

console.log(
  `Reset: removed ${before.reports} report(s), ${before.incidents} incident(s), ${removed} media file(s).`,
);
