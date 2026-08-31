import { authoriseOpsRequests } from "./ops-session.mjs";

/**
 * A report the model cannot read must still reach a human.
 *
 * This is the failure the system was silently worst at. When extraction failed,
 * the report was written to disk with its audio and photo intact and left at
 * 'draft', and every operator surface queries incidents, so nobody could ever
 * see it. The evidence was kept perfectly and shown to no one.
 *
 * Driven against the real API rather than the browser, because the thing under
 * test is what happens after the model refuses, and the browser path normalises
 * images specifically to stop that happening. The trigger here is a corrupt
 * upload; the invariant being checked is broader than any one trigger, namely
 * that an extraction failure of any cause ends up in front of a person.
 */

const B = process.env.BASE ?? "http://localhost:3300";

// The operator endpoints are behind the control-room passphrase.
await authoriseOpsRequests(B);
const RUN = Math.random().toString(36).slice(2, 7);
const out = [];
const created = [];
const log = (ok, m, x = "") => {
  out.push(ok);
  console.log(`  ${ok ? "pass" : "FAIL"}  ${m}${x ? `  (${x})` : ""}`);
};

/** Bytes that are not an image, offered as one. The model will refuse it. */
function unreadableUpload() {
  const fd = new FormData();
  fd.set("image", new File([new Uint8Array([0xff, 0xd8, 0x00, 0x01, 0x02, 0x03])], "broken.jpg", {
    type: "image/jpeg",
  }));
  fd.set("reporter_id", `triage-test-${RUN}`);
  fd.set("reporter_name", `Triage Test ${RUN}`);
  return fd;
}

console.log("\nA report the model could not read:");
let rid;
{
  const res = await fetch(`${B}/api/report`, { method: "POST", body: unreadableUpload() });
  const json = await res.json().catch(() => ({}));
  rid = json.report_id;
  created.push(rid);

  log(res.status === 502, "the reporter is told it failed rather than shown a false success", `${res.status}`);
  log(Boolean(rid), "and the report was still written before the model was called", rid ?? "no id");
  log(json.recoverable === true, "marked recoverable, so the client may offer a retry");
}

console.log("\nIt reaches an operator instead of disappearing:");
{
  const { reports } = await (await fetch(`${B}/api/triage`)).json();
  const mine = reports.find((r) => r.id === rid);
  log(Boolean(mine), "it appears in the queue for manual reading", `${reports.length} waiting`);
  log(Boolean(mine?.failure), "with why the model refused it", mine?.failure?.slice(0, 40) ?? "none");
  log(mine?.has_image === true, "and the evidence is still attached");

  // The point of the queue is that a person can open what the model could not.
  const media = await fetch(`${B}/api/media/${rid}?kind=image`);
  log(media.ok, "the operator can actually retrieve that evidence", `${media.status}`);

  const { incidents } = await (await fetch(`${B}/api/incidents`)).json();
  log(
    !incidents.some((i) => i.reports.some((r) => r.id === rid)),
    "and it is NOT on the incident board, because nothing has been interpreted yet",
  );
}

console.log("\nAn operator reads it and enters what it says:");
let incidentId;
{
  const res = await fetch(`${B}/api/triage/${rid}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      operator: `Reviewer ${RUN}`,
      summary: `Water entering houses near the ${RUN} bridge, read by hand from the photo`,
      incident_type: "flood",
      urgency_indicators: ["rising_water"],
      people_affected: 4,
      road_access: "blocked",
    }),
  });
  const json = await res.json();
  incidentId = json.incident_id;
  log(res.ok && Boolean(incidentId), "an incident is created from their reading", `${res.status}`);

  const { incidents } = await (await fetch(`${B}/api/incidents`)).json();
  const inc = incidents.find((i) => i.id === incidentId);
  log(Boolean(inc), "which is now on the board");
  log((inc?.summary ?? "").includes(RUN), "carrying what the operator wrote, not an invention");
  log(
    (inc?.people_claims ?? []).some((c) => c.value === 4),
    "and the count they entered, attributed as a claim like any other",
  );

  // The audit trail must not credit a machine for a human's reading.
  const authored = (inc?.audit ?? []).find((a) => a.action === "incident_created");
  log(
    authored?.actor?.startsWith("operator:"),
    "the audit names the operator as the author, not the AI",
    authored?.actor ?? "none",
  );
  log(
    (inc?.audit ?? []).some((a) => a.action === "incident_read_by_operator"),
    "and records that the model could not read it",
  );
}

console.log("\nOnce handled it leaves the queue, and cannot be handled twice:");
{
  const { reports } = await (await fetch(`${B}/api/triage`)).json();
  log(!reports.some((r) => r.id === rid), "it is gone from the manual queue");

  const again = await fetch(`${B}/api/triage/${rid}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ operator: "Second Operator", summary: "duplicate attempt" }),
  });
  log(again.status === 409, "a second operator is told it is already handled", `${again.status}`);
}

console.log("\nA report that is not an emergency is recorded, not deleted:");
{
  const res = await fetch(`${B}/api/report`, { method: "POST", body: unreadableUpload() });
  const rid2 = (await res.json()).report_id;
  created.push(rid2);

  const dis = await fetch(`${B}/api/triage/${rid2}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ operator: `Reviewer ${RUN}`, dismiss: true, reason: "blank test upload" }),
  });
  log(dis.ok, "an operator can dismiss it", `${dis.status}`);

  const { reports } = await (await fetch(`${B}/api/triage`)).json();
  log(!reports.some((r) => r.id === rid2), "it leaves the queue");

  const { incidents } = await (await fetch(`${B}/api/incidents`)).json();
  log(
    !incidents.some((i) => i.reports.some((r) => r.id === rid2)),
    "and does not become an incident",
  );

  const media = await fetch(`${B}/api/media/${rid2}?kind=image`);
  log(media.ok, "but the evidence is still there if the decision is questioned", `${media.status}`);
}

console.log("\nAttribution is required, as everywhere else:");
{
  const res = await fetch(`${B}/api/report`, { method: "POST", body: unreadableUpload() });
  const rid3 = (await res.json()).report_id;
  created.push(rid3);

  const anon = await fetch(`${B}/api/triage/${rid3}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ summary: "no name given" }),
  });
  log(anon.status === 400, "an unattributed reading is refused", `${anon.status}`);

  const empty = await fetch(`${B}/api/triage/${rid3}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ operator: "Someone", summary: "   " }),
  });
  log(empty.status === 400, "and so is an empty reading, which would assert nothing", `${empty.status}`);
}

console.log(`\ncleanup ids: ${created.join(",")}${incidentId ? ` incident:${incidentId}` : ""}`);
console.log(`${out.filter(Boolean).length}/${out.length} passed`);
process.exit(out.every(Boolean) ? 0 : 1);
