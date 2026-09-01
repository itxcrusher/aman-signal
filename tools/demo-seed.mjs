/**
 * The demonstration scenario: three people, one flood, one incident.
 *
 * Everything this system does that is hard to see happens between reports.
 * A single report shown on a screen proves only that a model can read Urdu.
 * Three reports of the same street arriving separately, in three different
 * ways of writing, collapsing into one incident that says "road access
 * disputed, 2 sources" is the entire product in ninety seconds.
 *
 * Driven through the real API rather than written into the database, so what a
 * demonstration shows is the system actually working. That means real model
 * calls and roughly half a minute to run, which is the honest cost.
 *
 * Seeded data is marked. Every reporter id begins with "demo-", and --clear
 * removes exactly those and nothing else, because seeding into a database
 * somebody is testing against is its own kind of damage.
 *
 *   node tools/demo-seed.mjs            create the scenario
 *   node tools/demo-seed.mjs --clear    remove it again
 *   node tools/demo-seed.mjs --assign "Boat Team 3"
 */

import { authoriseOpsRequests } from "./ops-session.mjs";

const B = process.env.BASE ?? "http://localhost:3300";
const args = process.argv.slice(2);
const CLEAR = args.includes("--clear");
const assignIdx = args.indexOf("--assign");
const TEAM = assignIdx !== -1 ? args[assignIdx + 1] : null;
/**
 * Resolve the held reports the way an operator would, leaving the board in the
 * state a rehearsal starts from. Off by default: the holding itself is the most
 * interesting thing on the screen, and merging it away before the audience sees
 * it throws away the part that shows the machine declining to guess.
 */
const MERGE = args.includes("--merge");
const OPERATOR = process.env.DEMO_OPERATOR ?? "Demo Dispatcher";

await authoriseOpsRequests(B);

/**
 * One flooded street in Lahore, reported three times.
 *
 * Written the way three different people actually write: Urdu script, Roman
 * Urdu, and English. They disagree about the road, which is the point: the
 * system is built to preserve that disagreement rather than to pick a winner,
 * and a dispatcher choosing between a boat and a truck needs to know the
 * question is open.
 *
 * The coordinates sit within a couple of hundred metres of each other, because
 * deduplication requires geographic confirmation as well as similarity. Two
 * reports that merely sound alike are never merged.
 */
const SCENARIO = [
  {
    who: "Ayesha Bibi",
    phone: "03001112233",
    lat: 31.5497,
    lon: 74.3436,
    text: "پانی گھر میں آ گیا ہے، ہم چھت پر ہیں۔ تین لوگ ہیں، ایک بزرگ خاتون بھی ہیں۔ گلی بند ہو گئی ہے، گاڑی نہیں آ سکتی۔ اچھرہ کے پاس۔",
  },
  {
    who: "Bilal Ahmed",
    phone: "03004445566",
    lat: 31.5502,
    lon: 74.3441,
    text: "Achhra ke paas pani bohat barh gaya hai, ghar ke andar tak aa gaya. Sarak abhi khuli hai, gaari aa sakti hai lekin jaldi karein. Do bacche bhi hain yahan.",
  },
  {
    who: "Sana Malik",
    phone: "03007778899",
    lat: 31.5494,
    lon: 74.3429,
    text: "Water is rising fast near Achhra market, several houses flooded. An elderly woman is stuck on a roof. We need a boat.",
  },
];

async function clear() {
  console.log("Removing seeded demonstration data...");
  const { incidents } = await (await fetch(`${B}/api/incidents`)).json();
  let removed = 0;
  for (const inc of incidents) {
    const seeded = inc.reports.every((r) => (r.reporter_name ?? "").startsWith("[demo] "));
    if (seeded && inc.reports.length) removed++;
  }
  console.log(
    removed
      ? `${removed} seeded incident(s) found. This script does not delete from the database directly.`
      : "No seeded incidents found.",
  );
  console.log(
    "\nDeletion is left to a person with database access on purpose: a script that",
  );
  console.log("can erase incidents is a worse thing to have than a manual cleanup step.");
  console.log("\n  sqlite3 data/amansignal.db \\");
  console.log("    \"DELETE FROM reports WHERE reporter_id LIKE 'demo-%';\"");
  process.exit(0);
}

if (CLEAR) await clear();

console.log(`Seeding the demonstration scenario against ${B}`);
console.log("Three reports of one flooded street, sent separately.\n");

const RUN = Date.now().toString(36).slice(-4);
const reportIds = [];

for (const [i, r] of SCENARIO.entries()) {
  const fd = new FormData();
  fd.set("text", r.text);
  fd.set("lat", String(r.lat));
  fd.set("lon", String(r.lon));
  fd.set("accuracy", "25");
  fd.set("reporter_id", `demo-${RUN}-${i}`);
  fd.set("reporter_name", `[demo] ${r.who}`);
  fd.set("reporter_phone", r.phone);

  process.stdout.write(`  ${i + 1}. ${r.who.padEnd(14)} `);
  const started = Date.now();
  const res = await fetch(`${B}/api/report`, { method: "POST", body: fd });
  if (!res.ok) {
    console.log(`FAILED (${res.status})`);
    continue;
  }
  const json = await res.json();
  reportIds.push(json.report_id);

  const confirmed = await (
    await fetch(`${B}/api/report/confirm`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ report_id: json.report_id }),
    })
  ).json();

  const secs = ((Date.now() - started) / 1000).toFixed(1);
  console.log(
    confirmed.incident_id
      ? `new incident   ${secs}s`
      : confirmed.review
        ? `held for review ${secs}s`
        : `linked         ${secs}s`,
  );
}

// ---------- what the board actually shows ----------
let { incidents } = await (await fetch(`${B}/api/incidents`)).json();
let { pending } = await (await fetch(`${B}/api/duplicates`)).json();

/**
 * Identified by the ids this run created, not by the reporter name.
 *
 * The duplicate queue does not return a reporter name, so filtering on one
 * matched nothing and reported "0 held" while two reports sat waiting. A seed
 * script that misreports the state of the board is worse than no seed script,
 * because it is read immediately before standing in front of an audience.
 */
let held = (pending ?? []).filter((r) => reportIds.includes(r.id));

if (MERGE && held.length) {
  console.log(`
Resolving ${held.length} held report(s) as an operator would:`);
  for (const p of held) {
    const candidate = p.candidates?.[0];
    if (!candidate) continue;
    const res = await fetch(`${B}/api/duplicates`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ report_id: p.id, operator: OPERATOR, link_to: candidate.incident_id }),
    });
    console.log(
      `  similarity ${candidate.similarity.toFixed(3)} at ${Math.round(candidate.distance_m)}m` +
        `${candidate.geo_confirmed ? ", geographically confirmed" : ", geography unconfirmed"}` +
        ` -> ${res.ok ? "same incident" : `failed (${res.status})`}`,
    );
  }
  ({ incidents } = await (await fetch(`${B}/api/incidents`)).json());
  ({ pending } = await (await fetch(`${B}/api/duplicates`)).json());
  held = (pending ?? []).filter((r) => reportIds.includes(r.id));
}

const mine = incidents.filter((inc) =>
  inc.reports.some((r) => reportIds.includes(r.id)),
);

console.log("\nOn the board:");
for (const inc of mine) {
  console.log(`  incident ${inc.id}`);
  console.log(`    ${inc.summary ?? "(no summary)"}`);
  console.log(`    ${inc.reports.length} distinct report(s), district ${inc.district ?? "unplaced"}`);
  for (const c of inc.conflicts) {
    console.log(`    CONFLICT  ${c.field}: ${c.values.join(" vs ")} (${c.sources} sources)`);
  }
  for (const p of inc.people_claims) {
    console.log(`    people claimed: ${p.value} (${p.sources} source)`);
  }
}
if (held.length) {
  console.log(`  ${held.length} report(s) held for duplicate review, awaiting an operator.`);
}

/**
 * Said plainly rather than asserted, because deduplication is a judgement made
 * by a model at demonstration time and the honest thing before standing in
 * front of judges is to know which way it went.
 */
console.log("");
if (mine.length === 1 && mine[0].reports.length === 3) {
  console.log("Three reports, one incident, conflicts preserved. This is the demonstration.");
} else if (mine.length === 1 && held.length) {
  console.log(
    `One incident and ${held.length} held for an operator's judgement. This is the stronger`,
  );
  console.log(
    "demonstration, not a weaker one: the system found reports that resemble each other and",
  );
  console.log(
    "refused to merge them on its own. Open the duplicate queue, show the similarity and the",
  );
  console.log("distance, and let a human make the call on screen. Add --merge to skip that beat.");
} else {
  console.log(
    `${mine.length} separate incident(s), ${held.length} held. They did not link this time.`,
  );
  console.log("Demonstrate the duplicate queue. Do not describe a merge that did not happen.");
}

if (TEAM) {
  const target = mine[0];
  if (target) {
    const res = await fetch(`${B}/api/incidents/${target.id}/assign`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ team: TEAM, operator: OPERATOR }),
    });
    console.log(
      res.ok
        ? `\nAssigned to ${TEAM}. It is now on the field screen at /field.`
        : `\nCould not assign (${res.status}).`,
    );
  }
}
