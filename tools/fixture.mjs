/**
 * Getting a suite an incident to work with, deterministically.
 *
 * Deduplication is conservative on purpose: a report resembling an existing one
 * is held for an operator rather than merged. That is correct behaviour and it
 * makes a naive fixture flaky, because two runs of the same suite send reports
 * that are semantically near-identical no matter what nonce is buried in them,
 * so the second run's report is held and the suite has no incident to test.
 *
 * Suites used to give up at that point, which meant they silently stopped
 * testing anything the moment they were run twice in a row. This resolves the
 * hold the way an operator would, through the real endpoint, and returns an
 * incident either way.
 */

export async function createIncident(
  B,
  { text, reporterId, name, phone, imagePath, operator = "Fixture" },
) {
  const fd = new FormData();
  fd.set("text", text);
  if (reporterId) fd.set("reporter_id", reporterId);
  if (name) fd.set("reporter_name", name);
  if (phone) fd.set("reporter_phone", phone);
  if (imagePath) {
    const { readFileSync } = await import("node:fs");
    fd.set(
      "image",
      new File([readFileSync(imagePath)], imagePath.split("/").pop(), { type: "image/jpeg" }),
    );
  }

  const posted = await fetch(`${B}/api/report`, { method: "POST", body: fd });
  if (!posted.ok) throw new Error(`report rejected (${posted.status})`);
  const { report_id: reportId } = await posted.json();

  const confirmed = await (
    await fetch(`${B}/api/report/confirm`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ report_id: reportId }),
    })
  ).json();

  if (confirmed.incident_id) {
    return { reportId, incidentId: confirmed.incident_id, wasHeld: false };
  }

  // Held for duplicate review. An operator decides; here the decision is that it
  // is a separate emergency, which is what a fresh test report actually is.
  const resolved = await fetch(`${B}/api/duplicates`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ report_id: reportId, operator, separate: true }),
  });
  if (!resolved.ok) {
    throw new Error(`report was held and could not be resolved (${resolved.status})`);
  }
  const json = await resolved.json();
  const incidentId = json.incident_id ?? json.id ?? null;
  if (!incidentId) throw new Error("resolving the hold returned no incident");
  return { reportId, incidentId, wasHeld: true };
}
