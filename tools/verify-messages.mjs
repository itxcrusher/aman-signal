import { authoriseOpsRequests } from "./ops-session.mjs";
import { createIncident } from "./fixture.mjs";

/**
 * The control room can answer the person who reported.
 *
 * Reporting into silence is what people stop doing. A status moving from
 * "received" to "assigned" is information; "a boat is coming from the Ravi road
 * side, stay upstairs" is an answer, and only the second one is worth the risk
 * someone took to send a voice note from a flooded street.
 *
 * What is checked is delivery, not composition: that the message reaches the
 * person's own screen, that it is attributed and recorded, that the room can
 * tell whether it was seen, and that a message which reaches nobody is reported
 * as a failure rather than as a success.
 */

const B = process.env.BASE ?? "http://localhost:3300";
await authoriseOpsRequests(B);

const RUN = Math.random().toString(36).slice(2, 7);
const RID = `message-test-${RUN}`;
const OPERATOR = `Dispatcher ${RUN}`;
const out = [];
const log = (ok, m, x = "") => {
  out.push(ok);
  console.log(`  ${ok ? "pass" : "FAIL"}  ${m}${x ? `  (${x})` : ""}`);
};

console.log("\nA reported incident:");
let incidentId;
{
  const made = await createIncident(B, {
    text: `chhat par phanse hain, pani neeche tak aa gaya hai, ${RUN} street`,
    reporterId: RID,
    name: `Message Test ${RUN}`,
    operator: OPERATOR,
  });
  incidentId = made.incidentId;
  log(
    Boolean(incidentId),
    "becomes an incident an operator can answer",
    made.wasHeld ? "after duplicate review" : incidentId,
  );
}

console.log("\nA message must be attributed and must say something:");
{
  const anon = await fetch(`${B}/api/incidents/${incidentId}/message`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ body: "help is coming" }),
  });
  log(anon.status === 400, "an unattributed message is refused", `${anon.status}`);

  const empty = await fetch(`${B}/api/incidents/${incidentId}/message`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ operator: OPERATOR, body: "   " }),
  });
  log(empty.status === 400, "and so is an empty one", `${empty.status}`);

  const long = await fetch(`${B}/api/incidents/${incidentId}/message`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ operator: OPERATOR, body: "x".repeat(501) }),
  });
  log(long.status === 400, "and one too long to read on a phone", `${long.status}`);
}

console.log("\nIt reaches the person who reported:");
const BODY = `Ek boat Ravi road ki taraf se aa rahi hai. Upar wali manzil par rahein. ${RUN}`;
{
  const res = await fetch(`${B}/api/incidents/${incidentId}/message`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ operator: OPERATOR, body: BODY }),
  });
  const json = await res.json();
  log(res.ok && json.delivered === 1, "the message is delivered", `${res.status}`);

  const mine = await (await fetch(`${B}/api/my-reports?reporter_id=${RID}`)).json();
  const got = (mine.messages ?? []).find((m) => m.body === BODY);
  log(Boolean(got), "and appears on the reporter's own screen", `${mine.messages?.length ?? 0}`);
  log(got?.seen === false, "marked as not yet seen by them");
  log(got?.incident_id === incidentId, "attached to the incident it answers");
}

console.log("\nThe control room can tell whether it landed:");
{
  const { incidents } = await (await fetch(`${B}/api/incidents`)).json();
  const inc = incidents.find((i) => i.id === incidentId);
  const shown = (inc?.messages ?? []).find((m) => m.body === BODY);
  log(Boolean(shown), "the board shows what was already said");
  log(shown?.seen === false, "and that the reporter has not seen it yet");
  log(shown?.actor === `operator:${OPERATOR}`, "attributed to the operator who sent it", shown?.actor);
  log(
    (inc?.audit ?? []).some((a) => a.action === "message_sent"),
    "sending is in the audit trail, like any other decision",
  );

  await fetch(`${B}/api/my-reports/seen`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ reporter_id: RID }),
  });

  const after = await (await fetch(`${B}/api/incidents`)).json();
  const seenNow = after.incidents
    .find((i) => i.id === incidentId)
    ?.messages.find((m) => m.body === BODY);
  log(seenNow?.seen === true, "and once they read it, the board says so");
}

console.log("\nA message that can reach nobody is reported as a failure:");
{
  // A report with no device id has nowhere to deliver to. Reporting that as a
  // success would leave an operator believing they had answered someone.
  const anon = await createIncident(B, {
    text: `koi raabta number nahi diya, ${RUN} anonymous`,
    operator: OPERATOR,
  });
  const res = await fetch(`${B}/api/incidents/${anon.incidentId}/message`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ operator: OPERATOR, body: "anyone there?" }),
  });
  log(res.status === 409, "the operator is told it went nowhere", `${res.status}`);
}

console.log(`\ncleanup reporter id: ${RID}`);
console.log(`${out.filter(Boolean).length}/${out.length} passed`);
process.exit(out.every(Boolean) ? 0 : 1);
