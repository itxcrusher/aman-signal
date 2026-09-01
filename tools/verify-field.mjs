import { authoriseOpsRequests, opsCookie } from "./ops-session.mjs";
import { createIncident } from "./fixture.mjs";

/**
 * The dispatch loop closes.
 *
 * Until this existed, an operator could hand an incident to "Boat Team 3" and
 * Boat Team 3 would never learn of it from this system: the status was true in
 * the database and false in the world. So what is checked here is not that a
 * page renders, but that the assignment reaches the crew, that the crew can
 * only see and touch their own work, and that what they report back arrives.
 *
 * The separation between the two credentials is checked in both directions.
 * A field passphrase that opened the control room would hand every crew the
 * district's reports, names and recordings, which is exactly the exposure the
 * gate was added to prevent.
 */

const B = process.env.BASE ?? "http://localhost:3300";
await authoriseOpsRequests(B);

const RUN = Math.random().toString(36).slice(2, 7);
const TEAM = `Boat Team ${RUN}`;
const RID = `field-test-${RUN}`;
const out = [];
const log = (ok, m, x = "") => {
  out.push(ok);
  console.log(`  ${ok ? "pass" : "FAIL"}  ${m}${x ? `  (${x})` : ""}`);
};

async function fieldCookie() {
  const passphrase = process.env.FIELD_PASSPHRASE;
  if (!passphrase) throw new Error("FIELD_PASSPHRASE is not set");
  const res = await fetch(`${B}/api/field/session`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ passphrase }),
  });
  if (!res.ok) throw new Error(`field sign-in failed (${res.status})`);
  return (res.headers.getSetCookie?.() ?? []).map((c) => c.split(";")[0]).join("; ");
}

// ---------- an incident, assigned to a crew ----------
console.log("\nAn incident is handed to a team:");
let incidentId;
let orderedIncidentId;
{
  const made = await createIncident(B, {
    text: `pani ghar mein ghus gaya hai, chhat par teen log hain, ek boorhi khatoon bhi hai, ${RUN} mohalla`,
    reporterId: RID,
    name: `Field Test ${RUN}`,
    phone: "03001234567",
    operator: `Dispatcher ${RUN}`,
  });
  incidentId = made.incidentId;
  log(
    Boolean(incidentId),
    "a report becomes an incident",
    made.wasHeld ? "after duplicate review" : incidentId,
  );

  const a = await fetch(`${B}/api/incidents/${incidentId}/assign`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ team: TEAM, operator: `Dispatcher ${RUN}` }),
  });
  log(a.ok, "and an operator assigns it to a team", `${a.status}`);
}

// ---------- the two credentials do not open each other's doors ----------
console.log("\nThe control room and the field are separate:");
const FIELD = await fieldCookie();
const OPS = await opsCookie(B);
{
  const noCookie = await fetch(`${B}/api/field?team=${encodeURIComponent(TEAM)}`, {
    headers: {},
  });
  log(noCookie.status === 401, "the field list refuses an anonymous request", `${noCookie.status}`);

  const withOps = await fetch(`${B}/api/field?team=${encodeURIComponent(TEAM)}`, {
    headers: { Cookie: OPS },
  });
  log(withOps.status === 401, "an operator session does not open the field surface", `${withOps.status}`);

  const opsWithField = await fetch(`${B}/api/incidents`, { headers: { Cookie: FIELD } });
  log(
    opsWithField.status === 401,
    "and a field session does not open the control room",
    `${opsWithField.status}`,
  );

  const page = await fetch(`${B}/field`, { redirect: "manual" });
  log(page.status === 307, "the field page sends a stranger to sign in", `${page.status}`);
}

// ---------- the crew sees their work ----------
console.log("\nThe crew sees what they were sent to:");
{
  const res = await fetch(`${B}/api/field?team=${encodeURIComponent(TEAM)}`, {
    headers: { Cookie: FIELD },
  });
  const json = await res.json();
  const mine = (json.incidents ?? []).find((i) => i.id === incidentId);

  log(Boolean(mine), "the assigned incident reaches the team", `${json.incidents?.length ?? 0} shown`);
  log(mine?.status === "assigned", "carrying its status", mine?.status);
  log(
    (mine?.contacts ?? []).some((c) => c.phone === "03001234567"),
    "and a number to call on the way",
  );
  log((mine?.said ?? []).length > 0, "and what the reporter actually said");
  log((json.teams ?? []).includes(TEAM), "the team is offered by name rather than typed blind");

  // Typed on a phone by a different person than the one who assigned it.
  const cased = await fetch(`${B}/api/field?team=${encodeURIComponent(TEAM.toLowerCase())}`, {
    headers: { Cookie: FIELD },
  });
  const casedJson = await cased.json();
  log(
    (casedJson.incidents ?? []).some((i) => i.id === incidentId),
    "the team name matches regardless of how it was capitalised",
  );

  const other = await fetch(`${B}/api/field?team=${encodeURIComponent("Some Other Team")}`, {
    headers: { Cookie: FIELD },
  });
  const otherJson = await other.json();
  log(
    !(otherJson.incidents ?? []).some((i) => i.id === incidentId),
    "and another team does not see it",
  );
}

// ---------- the crew reports back ----------
console.log("\nThe crew reports back, and the control room learns of it:");
{
  const wrongTeam = await fetch(`${B}/api/field/${incidentId}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: FIELD },
    body: JSON.stringify({ team: "Some Other Team", status: "responding" }),
  });
  log(wrongTeam.status === 404, "a team cannot touch work that is not theirs", `${wrongTeam.status}`);

  const moving = await fetch(`${B}/api/field/${incidentId}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: FIELD },
    body: JSON.stringify({ team: TEAM, status: "responding" }),
  });
  log(moving.ok, "the crew can say they are on the way", `${moving.status}`);

  const note = `water is at waist height, second boat needed, ${RUN}`;
  const noted = await fetch(`${B}/api/field/${incidentId}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: FIELD },
    body: JSON.stringify({ team: TEAM, note }),
  });
  log(noted.ok, "and say what they found", `${noted.status}`);

  const bad = await fetch(`${B}/api/field/${incidentId}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: FIELD },
    body: JSON.stringify({ team: TEAM, status: "verified" }),
  });
  log(bad.status === 400, "but cannot verify: that is the control room's call", `${bad.status}`);

  const { incidents } = await (await fetch(`${B}/api/incidents`)).json();
  const inc = incidents.find((i) => i.id === incidentId);
  log(inc?.status === "responding", "the board shows the crew is moving", inc?.status);
  log(
    (inc?.audit ?? []).some((a) => a.action === "field_report" && (a.detail ?? "").includes(RUN)),
    "and what they found is in the record, attributed to the crew",
  );
  log(
    (inc?.audit ?? []).some((a) => a.actor === `field:${TEAM}`),
    "named as the team, not as an anonymous update",
  );
}

// ---------- and closing it ----------
console.log("\nAnd when the crew is done:");
{
  const done = await fetch(`${B}/api/field/${incidentId}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: FIELD },
    body: JSON.stringify({ team: TEAM, status: "resolved" }),
  });
  log(done.ok, "they can close it", `${done.status}`);

  const { incidents } = await (await fetch(`${B}/api/incidents`)).json();
  log(
    incidents.find((i) => i.id === incidentId)?.status === "resolved",
    "and the control room sees it closed",
  );

  // Resolved work stays visible briefly, so a crew can see the update registered.
  const res = await fetch(`${B}/api/field?team=${encodeURIComponent(TEAM)}`, {
    headers: { Cookie: FIELD },
  });
  const json = await res.json();
  log(
    (json.incidents ?? []).some((i) => i.id === incidentId),
    "it does not vanish from their screen the moment they close it",
  );
}

// ---------- evidence a crew can actually open ----------
//
// A photograph of the water line answers in one glance what the road field only
// estimates, so a crew should be able to see it. What they must not be able to
// do is walk every recording in the district: all crews share one passphrase,
// so passing the gate cannot be the whole answer, and the route checks the
// incident is assigned to the team that asked.
console.log("\nEvidence, for the crew it belongs to and nobody else:");
{
  const withPhoto = await createIncident(B, {
    text: `chhat tak pani aa gaya, ghar ke bahar khade hain, ${RUN} gali`,
    reporterId: `${RID}-photo`,
    name: `Field Photo ${RUN}`,
    phone: "03009998877",
    imagePath: "/tmp/imgtest/flood.jpg",
    operator: `Dispatcher ${RUN}`,
  });
  await fetch(`${B}/api/incidents/${withPhoto.incidentId}/assign`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ team: TEAM, operator: `Dispatcher ${RUN}` }),
  });

  const list = await (
    await fetch(`${B}/api/field?team=${encodeURIComponent(TEAM)}`, { headers: { Cookie: FIELD } })
  ).json();
  const mine = (list.incidents ?? []).find((i) => i.id === withPhoto.incidentId);
  log((mine?.evidence ?? []).some((e) => e.has_image), "the crew is told a photograph exists");

  const rid = mine?.evidence?.[0]?.report_id;
  const ok = await fetch(`${B}/api/media/${rid}?kind=image&team=${encodeURIComponent(TEAM)}`, {
    headers: { Cookie: FIELD },
  });
  log(ok.ok, "and can open it", `${ok.status}`);

  const noTeam = await fetch(`${B}/api/media/${rid}?kind=image`, { headers: { Cookie: FIELD } });
  log(noTeam.status === 400, "a crew that does not say who they are is refused", `${noTeam.status}`);

  const wrongTeam = await fetch(
    `${B}/api/media/${rid}?kind=image&team=${encodeURIComponent("Some Other Team")}`,
    { headers: { Cookie: FIELD } },
  );
  log(
    wrongTeam.status === 404,
    "and naming a team the incident is not assigned to gets nothing",
    `${wrongTeam.status}`,
  );

  // An explicitly empty Cookie, because the suite's own wrapper attaches the
  // operator cookie to any /api/media call that does not set one, and an
  // "anonymous" request that quietly carries a credential tests nothing.
  const anon = await fetch(`${B}/api/media/${rid}?kind=image&team=${encodeURIComponent(TEAM)}`, {
    headers: { Cookie: "" },
  });
  log(anon.status === 401, "an anonymous request is still refused outright", `${anon.status}`);

  // The operator path must not have been narrowed by any of this.
  const asOps = await fetch(`${B}/api/media/${rid}?kind=image`, { headers: { Cookie: OPS } });
  log(asOps.ok, "an operator still fetches evidence without naming a team", `${asOps.status}`);

  // Keep this incident for the ordering checks below.
  orderedIncidentId = withPhoto.incidentId;
}

// ---------- the room can talk to the crew ----------
//
// The last direction that was missing. A room could hand a crew an incident and
// then had no way to say "the second boat is coming from the north, wait at the
// bridge" except by telephone, which is the channel this system exists to stop
// being the only one.
console.log("\nThe control room instructs the crew:");
{
  const ORDER = `Doosri kashti shumal ki taraf se aa rahi hai. Pul par intezar karein. ${RUN}`;

  const sent = await fetch(`${B}/api/incidents/${orderedIncidentId}/message`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ operator: `Dispatcher ${RUN}`, body: ORDER, to: "team" }),
  });
  log(sent.ok, "an order is accepted", `${sent.status}`);

  const list = await (
    await fetch(`${B}/api/field?team=${encodeURIComponent(TEAM)}`, { headers: { Cookie: FIELD } })
  ).json();
  const mine = (list.incidents ?? []).find((i) => i.id === orderedIncidentId);
  log((mine?.orders ?? []).some((o) => o.body === ORDER), "and reaches the crew's screen");
  log(mine?.orders?.[0]?.seen === false, "not yet acknowledged");

  // An order must not land on a frightened person's phone.
  const reporter = await (
    await fetch(`${B}/api/my-reports?reporter_id=${RID}-photo`)
  ).json();
  log(
    !(reporter.messages ?? []).some((m) => m.body === ORDER),
    "and does NOT appear on the reporter's screen, which is a different audience",
  );

  const ack = await fetch(`${B}/api/field/${orderedIncidentId}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: FIELD },
    body: JSON.stringify({ team: TEAM, seen: true }),
  });
  log(ack.ok, "the crew acknowledges it", `${ack.status}`);

  const { incidents } = await (await fetch(`${B}/api/incidents`)).json();
  const inc = incidents.find((i) => i.id === orderedIncidentId);
  const order = (inc?.messages ?? []).find((m) => m.body === ORDER);
  log(order?.to_team === TEAM, "the board records who it was for", order?.to_team);
  log(order?.seen === true, "and that the crew read it");
  log(
    (inc?.audit ?? []).some((a) => a.action === "team_message_sent"),
    "sending it is in the audit trail",
  );
}

console.log("\nAn order needs a crew to send it to:");
{
  const unassigned = await createIncident(B, {
    text: `koi team abhi tak nahi bheji gayi, ${RUN} nakabil`,
    reporterId: `${RID}-noteam`,
    operator: `Dispatcher ${RUN}`,
  });
  const res = await fetch(`${B}/api/incidents/${unassigned.incidentId}/message`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ operator: `Dispatcher ${RUN}`, body: "go now", to: "team" }),
  });
  log(res.status === 409, "an order to an unassigned incident is refused", `${res.status}`);
}

console.log(`\ncleanup reporter id: ${RID}`);
console.log(`${out.filter(Boolean).length}/${out.length} passed`);
process.exit(out.every(Boolean) ? 0 : 1);
