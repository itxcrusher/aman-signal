/**
 * Seed the demo scenario by driving the real HTTP API, so extraction, clarification,
 * deduplication and conflict detection all run live rather than being faked.
 *
 * The scenario: one flooded street reported by three different people in three
 * different ways, plus an unrelated emergency nearby that must NOT be merged into it.
 *
 * USAGE
 *   npm run dev                       # in another terminal
 *   node tools/seed-demo.mjs          # add the scenario
 *   node tools/seed-demo.mjs --reset  # clear all data first
 */
import { execFileSync } from "node:child_process";

const BASE = process.env.AMANSIGNAL_BASE ?? "http://localhost:3000";
const RESET = process.argv.includes("--reset");

// One flooded street. Coordinates within the 500m gate of each other.
const SCENE = { lat: 24.8607, lon: 67.0011 };
const NEXT_DOOR = { lat: 24.8610, lon: 67.0015 };
const DOWN_THE_ROAD = { lat: 24.8604, lon: 67.0006 };
// Far enough away to be a genuinely separate emergency.
const ELSEWHERE = { lat: 24.83, lon: 67.13 };

const REPORTS = [
  {
    label: "1. First caller, Urdu, road blocked",
    text: "Hamari gali mein pani bohat barh gaya hai. Meri ammi buzurg hain aur do chotay bachay chat par phansay hue hain. Neeche paani bohat hai, gaari ya ambulance andar nahi aa sakti. Shah Faisal Colony, masjid ke saamne.",
    pos: SCENE,
    answer: "Shah Faisal Colony, masjid ke saamne",
  },
  {
    label: "2. Neighbour, different words, SAME street",
    text: "Yahan Shah Faisal Colony mein poori street doob chuki hai, log apne gharon ki chaton par baithe hain aur koi neeche nahi utar sakta. Buzurg log bhi hain.",
    pos: NEXT_DOOR,
    answer: "Shah Faisal Colony",
  },
  {
    // The conflict: this caller says a motorcycle can still get through.
    label: "3. Third caller, CONTRADICTS road access",
    text: "Shah Faisal Colony mein pani to hai lekin motorcycle abhi bhi guzar sakti hai, raasta poori tarah band nahi hua. Log chaton par hain aur unhe khana chahiye.",
    pos: DOWN_THE_ROAD,
    answer: "Shah Faisal Colony",
    // A different count from the first caller: real reporters disagree.
    people: "5",
  },
  {
    label: "4. Unrelated emergency, far away (must NOT merge)",
    text: "Korangi mein mere walid ko saans lene mein takleef ho rahi hai, unko oxygen chahiye, hospital ka raasta pani ki wajah se band hai.",
    pos: ELSEWHERE,
    answer: "Korangi, Sector 31",
  },
];

async function submit({ text, pos }) {
  const fd = new FormData();
  fd.set("text", text);
  fd.set("lat", String(pos.lat));
  fd.set("lon", String(pos.lon));
  const r = await fetch(`${BASE}/api/report`, { method: "POST", body: fd });
  const j = await r.json();
  if (!r.ok) throw new Error(j.error ?? `submit failed (${r.status})`);
  return j;
}

async function confirm(reportId, questions, answer, peopleAnswer = "3") {
  const answers = (questions ?? []).map((q) => ({
    field: q.field,
    question: q.en,
    answer: q.field === "location" ? answer : peopleAnswer,
  }));
  const r = await fetch(`${BASE}/api/report/confirm`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ report_id: reportId, answers }),
  });
  const j = await r.json();
  if (!r.ok) throw new Error(j.error ?? `confirm failed (${r.status})`);
  return j;
}

async function main() {
  try {
    await fetch(`${BASE}/api/incidents`, { cache: "no-store" });
  } catch {
    console.error(`Cannot reach ${BASE}. Start the dev server first: npm run dev`);
    process.exit(1);
  }

  if (RESET) {
    execFileSync(process.execPath, ["tools/reset-data.mjs"], { stdio: "inherit" });
  }

  for (const r of REPORTS) {
    process.stdout.write(`${r.label}\n`);
    const sub = await submit(r);
    const res = await confirm(sub.report_id, sub.questions, r.answer, r.people ?? "3");
    const outcome =
      res.review === "possible_duplicate"
        ? `held for operator review (${res.candidates} candidate(s))`
        : res.linked
          ? `LINKED into incident ${res.incident_id}`
          : `new incident ${res.incident_id}`;
    console.log(`   extraction ${sub.latency_ms}ms, ${sub.questions?.length ?? 0} question(s) -> ${outcome}`);
  }

  const board = await (await fetch(`${BASE}/api/incidents`, { cache: "no-store" })).json();
  console.log(`\n${board.incidents.length} incident(s) on the board:`);
  for (const i of board.incidents) {
    console.log(`  [${i.status}] ${i.summary}`);
    console.log(
      `     reports=${i.quality.distinctReports} location=${i.quality.locationQuality} conflicts=${i.conflicts.length}`,
    );
    for (const c of i.conflicts) {
      console.log(`     CONFLICT ${c.field}: ${c.values.join(" vs ")} (${c.sources} reports)`);
    }
  }
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
