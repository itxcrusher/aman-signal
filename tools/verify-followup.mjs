import fs from "node:fs";

/**
 * Adding to a report that already belongs to an incident, and what that does to
 * the incident above it.
 *
 * Driven through the API rather than a browser because the UI suites cannot
 * reliably reach this state: they reuse similar text, so their reports land in
 * the duplicate queue and never acquire the incident a follow-up needs. Distinct
 * content here creates its own incident, which is the only deterministic way to
 * exercise the success path.
 *
 * Four things are checked, and the last is the one with a rule attached: an
 * operator's correction must survive a later resynthesis. Overwriting it would
 * be the worst kind of bug, invisible and indistinguishable from the operator's
 * own edit having failed to save.
 */

const B = process.env.BASE ?? "http://localhost:3000";
const RID = "followup-test-" + Math.random().toString(36).slice(2, 10);
const NONCE = Math.random().toString(36).slice(2, 7);
const out = [];
const log = (ok, m, x = "") => {
  out.push(ok);
  console.log(`  ${ok ? "pass" : "FAIL"}  ${m}${x ? `  (${x})` : ""}`);
};

function filePart(path, type) {
  return new File([fs.readFileSync(path)], path.split("/").pop(), { type });
}

// ---------- an original report, with a photo ----------
console.log("\nOriginal report:");
const fd = new FormData();
fd.set(
  "text",
  `aag lag gayi hai godown mein, dhuan bohat hai, do mazdoor andar phanse hain, ${NONCE} chowk ke paas`,
);
fd.set("reporter_id", RID);
fd.set("reporter_name", "Followup Test");
fd.set("image", filePart("/tmp/imgtest/flood.jpg", "image/jpeg"));

const r1 = await (await fetch(`${B}/api/report`, { method: "POST", body: fd })).json();
log(Boolean(r1.report_id), "accepted with a photo", r1.report_id);

const c = await (
  await fetch(`${B}/api/report/confirm`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ report_id: r1.report_id }),
  })
).json();
log(Boolean(c.incident_id), "gets its own incident", c.incident_id ?? c.review ?? "none");

if (!c.incident_id) {
  console.log("\n(held for duplicate review; cannot exercise follow-ups)");
  process.exit(1);
}

// ---------- the evidence is actually served ----------
console.log("\nEvidence is served, not just described:");
{
  const img = await fetch(`${B}/api/media/${r1.report_id}?kind=image`);
  log(img.ok, "the photo can be fetched", `HTTP ${img.status} ${img.headers.get("content-type")}`);
  const bytes = (await img.arrayBuffer()).byteLength;
  log(bytes > 1000, "and has real content", `${bytes} bytes`);

  const missing = await fetch(`${B}/api/media/${r1.report_id}?kind=audio`);
  log(missing.status === 404, "an absent attachment 404s rather than erroring");

  const bad = await fetch(`${B}/api/media/does-not-exist?kind=image`);
  log(bad.status === 404, "an unknown report 404s");
}

// ---------- a follow-up carrying a voice note and a photo ----------
console.log("\nFollow-up with attachments:");
const before = await (await fetch(`${B}/api/incidents`)).json();
const originalSummary = before.incidents.find((i) => i.id === c.incident_id)?.summary ?? "";

{
  const f = new FormData();
  f.set("reporter_id", RID);
  f.set("report_id", r1.report_id);
  f.set("text", "aag phail gayi hai, ab chaar log andar hain aur chhat gir rahi hai");
  f.set("image", filePart("/tmp/imgtest/flood.png", "image/png"));

  const res = await fetch(`${B}/api/my-reports/followup`, { method: "POST", body: f });
  const j = await res.json();
  log(res.ok, "an update with a photo is accepted", `HTTP ${res.status}`);
  log(j.incident_id === c.incident_id, "and attaches to the same incident");

  const withPhoto = await fetch(`${B}/api/media/${j.report_id}?kind=image`);
  log(withPhoto.ok, "the update's own photo is served too", `HTTP ${withPhoto.status}`);

  const { incidents } = await (await fetch(`${B}/api/incidents`)).json();
  const inc = incidents.find((i) => i.id === c.incident_id);
  log((inc?.reports ?? []).length === 2, "both messages are evidence, in order", `${inc?.reports.length} reports`);
  log((inc?.reports ?? []).every((x) => x.has_image), "each keeps its own attachment");

  // ---------- the headline follows the evidence ----------
  log(
    Boolean(inc?.summary) && inc.summary !== originalSummary,
    "the incident summary is rewritten from all reports",
  );
  console.log(`      was: ${originalSummary.slice(0, 70)}`);
  console.log(`      now: ${(inc?.summary ?? "").slice(0, 70)}`);
  log(/four|4|chaar/i.test(inc?.summary ?? ""), "and reflects what the update said",
      "expects the newer count");
  log((inc?.audit ?? []).some((a) => a.action === "summary_resynthesised"),
      "recorded as a machine action in the audit trail");
}

// ---------- an operator's correction outranks the machine ----------
console.log("\nAn operator's correction survives a later update:");
{
  const CORRECTED = "Operator confirmed by phone: four workers, roof partially collapsed";
  await fetch(`${B}/api/incidents/${c.incident_id}/edit`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ operator: "Verify Bot", patch: { summary: CORRECTED } }),
  });

  const f = new FormData();
  f.set("reporter_id", RID);
  f.set("report_id", r1.report_id);
  f.set("text", "ambulance aa gayi hai, do log bahar nikal liye gaye hain");
  const res = await fetch(`${B}/api/my-reports/followup`, { method: "POST", body: f });
  const j = await res.json();
  log(res.ok, "a further update is still accepted");
  log(j.resynthesised === false, "and does not resynthesise over the correction");

  const { incidents } = await (await fetch(`${B}/api/incidents`)).json();
  const inc = incidents.find((i) => i.id === c.incident_id);
  log(inc?.summary === CORRECTED, "the operator's words are still there", (inc?.summary ?? "").slice(0, 50));
  log((inc?.reports ?? []).length === 3, "while the new evidence is still attached", `${inc?.reports.length} reports`);
}

// ---------- ownership ----------
console.log("\nOwnership:");
{
  const f = new FormData();
  f.set("reporter_id", "not-the-owner-1234");
  f.set("report_id", r1.report_id);
  f.set("text", "x");
  const bad = await fetch(`${B}/api/my-reports/followup`, { method: "POST", body: f });
  log(bad.status === 404, "a stranger cannot add to someone else's report", `HTTP ${bad.status}`);
}

console.log(`\n${out.filter(Boolean).length}/${out.length} passed`);
console.log("cleanup reporter id:", RID);
process.exit(out.every(Boolean) ? 0 : 1);
