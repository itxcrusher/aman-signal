/**
 * Adding to a report that already belongs to an incident.
 *
 * Driven through the API rather than the UI because the browser suites cannot
 * reliably reach this state: they reuse similar text, so their reports land in
 * the duplicate queue and never acquire the incident a follow-up needs. Distinct
 * content here creates its own incident, which is the only way to exercise the
 * success path deterministically.
 *
 * Also checks the ownership boundary: a follow-up is scoped to the reporter's
 * own device id, so a stranger cannot add to somebody else's report.
 */

const B = "http://localhost:3000";
const RID = "followup-test-" + Math.random().toString(36).slice(2, 10);
const out = [];
const log = (ok, m, x = "") => { out.push(ok); console.log(`  ${ok ? "pass" : "FAIL"}  ${m}${x ? `  (${x})` : ""}`); };

// Deliberately unlike any other test text, so this creates its own incident
// rather than landing in the duplicate queue.
const fd = new FormData();
fd.set("text", "aag lag gayi hai godown mein, dhuan bohat hai, teen mazdoor andar phanse hain, Sialkot cantt ke paas");
fd.set("reporter_id", RID);
fd.set("reporter_name", "Followup Test");
const r1 = await (await fetch(`${B}/api/report`, { method: "POST", body: fd })).json();
log(Boolean(r1.report_id), "a distinct report is accepted", r1.report_id);

const c = await (await fetch(`${B}/api/report/confirm`, {
  method: "POST", headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ report_id: r1.report_id }),
})).json();
log(Boolean(c.incident_id), "and gets its own incident", c.incident_id ?? c.review ?? "none");

if (c.incident_id) {
  const f = await fetch(`${B}/api/my-reports/followup`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ reporter_id: RID, report_id: r1.report_id, text: "aag phail rahi hai, ab char log andar hain" }),
  });
  const fj = await f.json();
  log(f.ok, "a follow-up is accepted", f.status + " " + JSON.stringify(fj).slice(0, 80));
  log(fj.incident_id === c.incident_id, "and attaches to the same incident");

  const { incidents } = await (await fetch(`${B}/api/incidents`)).json();
  const inc = incidents.find((i) => i.id === c.incident_id);
  log((inc?.reports ?? []).length === 2, "both messages are evidence, in order", `${inc?.reports.length} reports`);
  log((inc?.reports ?? []).some((x) => /char log/.test(x.raw_text ?? "")), "the update is readable by the operator");
  log((inc?.audit ?? []).some((a) => a.action === "report_updated"), "and recorded in the audit trail");

  // Someone else's device id must not be able to add to this report.
  const bad = await fetch(`${B}/api/my-reports/followup`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ reporter_id: "not-the-owner-1234", report_id: r1.report_id, text: "x" }),
  });
  log(bad.status === 404, "a stranger cannot add to it", `HTTP ${bad.status}`);
}

console.log(`\n${out.filter(Boolean).length}/${out.length} passed`);
console.log("cleanup id:", RID);
