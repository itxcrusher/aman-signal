import { chromium } from "playwright";

/**
 * The operator board's own language, its district picker, and correcting an
 * incident.
 *
 * The correction is the load-bearing case. An operator edits the INTERPRETATION:
 * the incident is what the board concludes from a set of reports, and correcting
 * it must never touch the reports themselves, which are what people actually
 * said. This checks both halves of that: the correction takes effect, and the
 * evidence underneath is unchanged.
 */

const B = process.env.BASE ?? "http://localhost:3000";
const out = [];
const log = (ok, m, x = "") => {
  out.push(ok);
  console.log(`  ${ok ? "pass" : "FAIL"}  ${m}${x ? `  (${x})` : ""}`);
};

const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 1440, height: 950 } });
const p = await ctx.newPage();
p.on("pageerror", (e) => console.log("  PAGE ERROR:", e.message.slice(0, 100)));

await p.goto(`${B}/ops`, { waitUntil: "networkidle", timeout: 120000 });
await p.waitForTimeout(2000);

// ---------- setup, in Urdu ----------
console.log("\nSetup and language:");
{
  const setup = await p.locator("main").innerText();
  log(/Your name/.test(setup), "setup opens in English by default");

  await p.getByRole("button", { name: "اردو" }).first().click();
  await p.waitForTimeout(600);
  const urdu = await p.locator("main").innerText();
  log(/آپ کا نام/.test(urdu), "the board can run in Urdu");
  log(!/Your name/.test(urdu), "and does not stack both languages");

  await p.getByRole("button", { name: "English" }).first().click();
  await p.waitForTimeout(500);
}

// ---------- district picker ----------
console.log("\nDistrict picker:");
{
  const listedBefore = await p.getByRole("option").count();
  log(listedBefore === 0, "districts are not all dumped on the page", `${listedBefore} visible`);

  await p.getByRole("button", { name: /Search districts/ }).click();
  await p.waitForTimeout(300);
  const opened = await p.getByRole("option").count();
  log(opened > 20, "opening it shows the full list", `${opened} options`);

  await p.locator('input[aria-label^="Search districts"]').fill("toba");
  await p.waitForTimeout(400);
  const filtered = await p.getByRole("option").count();
  log(filtered > 0 && filtered < 5, "typing filters it", `${filtered} match "toba"`);

  await p.getByRole("option", { name: /Toba Tek Singh/ }).first().click();
  await p.waitForTimeout(300);
  log((await p.getByRole("option").count()) === 0, "choosing closes the list");

  await p.locator("#op-name").fill("Ops Test");
  await p.getByRole("button", { name: "Open the board" }).click();
  await p.waitForTimeout(2500);
}

// ---------- the card is scannable, the detail is on demand ----------
console.log("\nBoard density:");
let firstId = null;
{
  const cards = p.locator("li[id^='incident-']");
  const n = await cards.count();
  log(n > 0, "incidents are listed", `${n} in this district`);
  if (n === 0) {
    console.log("  (no incidents to open; skipping detail checks)");
  } else {
    firstId = await cards.first().getAttribute("id");
    const cardText = await cards.first().innerText();
    log(!/audit trail|underlying reports/i.test(cardText),
        "the card does not carry the evidence panel");
    log(/View details/.test(cardText), "it offers the detail instead");
    await p.screenshot({ path: "shots/ops-board.png", fullPage: true });

    await cards.first().getByRole("button", { name: /View details/ }).click();
    await p.waitForSelector('[role="dialog"]', { timeout: 15000 });
    const dlg = await p.locator('[role="dialog"]').innerText();
    log(/underlying reports/i.test(dlg), "the detail carries the evidence");
    log(/audit trail/i.test(dlg), "and the audit trail");
    await p.screenshot({ path: "shots/ops-detail.png" });
  }
}

// ---------- correcting an incident ----------
console.log("\nCorrecting an incident:");
if (firstId) {
  const id = firstId.replace("incident-", "");
  const before = await (await fetch(`${B}/api/incidents`)).json();
  const target = before.incidents.find((i) => i.id === id);
  const reportsBefore = JSON.stringify(target?.reports ?? []);

  await p.getByRole("button", { name: "Edit" }).first().click();
  await p.waitForTimeout(400);

  const NEW_SUMMARY = "Corrected by operator during verification";
  await p.locator('[role="dialog"] textarea').first().fill(NEW_SUMMARY);
  await p.locator("#ppl").fill("11");
  const [saveRes] = await Promise.all([
    p.waitForResponse((r) => r.url().includes("/edit"), { timeout: 20000 }).catch(() => null),
    p.getByRole("button", { name: "Save changes" }).click(),
  ]);
  if (saveRes) {
    console.log("    save responded:", saveRes.status(), (await saveRes.text()).slice(0, 140));
  } else {
    console.log("    save produced no request to /edit");
    console.log("    dialog says:", (await p.locator('[role="dialog"]').innerText()).replace(/\s+/g," ").slice(0,150));
  }
  await p.waitForTimeout(2000);

  const after = await (await fetch(`${B}/api/incidents`)).json();
  const updated = after.incidents.find((i) => i.id === id);

  log(updated?.summary === NEW_SUMMARY, "the correction takes effect", updated?.summary?.slice(0, 40));
  log(Boolean(updated?.corrected), "and is recorded as a human judgement",
      updated?.corrected ? `${updated.corrected.fields.join(",")} by ${updated.corrected.by}` : "not recorded");
  log((updated?.people_claims ?? []).some((c) => c.value === 11), "the corrected count is used");

  // The evidence must be untouched.
  log(JSON.stringify(updated?.reports ?? []) === reportsBefore,
      "the underlying reports are unchanged");
  log((updated?.audit ?? []).some((a) => a.action === "incident_edited"),
      "the edit is in the audit trail");
} else {
  console.log("  (no incident to correct)");
}

await b.close();
const passed = out.filter(Boolean).length;
console.log(`\n${passed}/${out.length} passed`);
process.exit(passed === out.length ? 0 : 1);
