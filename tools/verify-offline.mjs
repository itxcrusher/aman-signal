import { chromium } from "playwright";

/**
 * A report composed with no network must survive, and send itself later.
 *
 * This is the case the product exists for and did not handle: a flood takes the
 * network with it, someone records a voice note, presses send, and the request
 * fails. Losing it there and asking them to retype is the worst possible answer
 * at the worst possible moment.
 *
 * Checked end to end with the browser genuinely offline, including that the
 * outbox survives the tab closing, since a phone at 4% battery does not stay on
 * the page.
 */

const B = process.env.BASE ?? "http://localhost:3300";
const RUN = Math.random().toString(36).slice(2, 7);
const out = [];
const log = (ok, m, x = "") => {
  out.push(ok);
  console.log(`  ${ok ? "pass" : "FAIL"}  ${m}${x ? `  (${x})` : ""}`);
};

const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, permissions: [], locale: "en-PK" });
const p = await ctx.newPage();
p.on("pageerror", (e) => console.log("  PAGE ERROR:", e.message.slice(0, 100)));

await p.goto(B, { waitUntil: "networkidle", timeout: 120000 });
await p.waitForTimeout(1200);
await p.locator('button:has-text("English")').click();
await p.waitForTimeout(500);
await p.locator('input[type="text"]').first().fill("Offline Test");
await p.locator('button:has-text("Not now")').click();
await p.waitForTimeout(1500);

// ---------- compose with the network gone ----------
console.log("\nComposing with no network:");
{
  await ctx.setOffline(true);
  await p.locator("#report").fill(
    `bijli chali gayi hai aur pani ghar mein aa raha hai, teen log hain, ${RUN} basti`,
  );
  await p.locator('button:has-text("Send report")').click();
  await p.waitForSelector("text=/saved|No internet/i", { timeout: 60000 }).catch(() => {});
  const after = await p.locator("main").innerText();

  log(/Your report has been saved/i.test(after), "the report is kept, not lost");
  log(/as soon as you have signal/i.test(after), "and says what happens next");
  log(!/try again/i.test(after), "it does not ask them to retype it");

  const stored = await p.evaluate(
    () =>
      new Promise((resolve) => {
        const r = indexedDB.open("amansignal", 1);
        r.onsuccess = () => {
          const db = r.result;
          const g = db.transaction("outbox", "readonly").objectStore("outbox").getAll();
          g.onsuccess = () => resolve(g.result.length);
          g.onerror = () => resolve(-1);
        };
        r.onerror = () => resolve(-1);
      }),
  );
  log(stored === 1, "and it is in the outbox on disk", `${stored} queued`);
  await p.screenshot({ path: "shots/offline-queued.png", fullPage: true });
}

// ---------- the outbox survives the tab closing, and drains ----------
//
// Persistence is proven by the send rather than by inspecting storage while
// offline: a page that could not be navigated to has no origin, and IndexedDB is
// denied on about:blank. If the entry had not survived the close, nothing would
// arrive below.
console.log("\nAfter closing the tab and getting signal back:");
{
  await p.close();
  await ctx.setOffline(false);
  const p2 = await ctx.newPage();
  p2.on("pageerror", (e) => console.log("  PAGE ERROR:", e.message.slice(0, 100)));
  await p2.goto(B, { waitUntil: "networkidle", timeout: 90000 });

  // The flush extracts each report, so this waits on a model call rather than a
  // round trip.
  await p2.waitForFunction(
    () =>
      new Promise((resolve) => {
        const r = indexedDB.open("amansignal", 1);
        r.onsuccess = () => {
          const g = r.result.transaction("outbox", "readonly").objectStore("outbox").getAll();
          g.onsuccess = () => resolve(g.result.length === 0);
          g.onerror = () => resolve(false);
        };
        r.onerror = () => resolve(false);
      }),
    { timeout: 90000, polling: 2000 },
  ).catch(() => {});

  const left = await p2.evaluate(
    () =>
      new Promise((resolve) => {
        const r = indexedDB.open("amansignal", 1);
        r.onsuccess = () => {
          const g = r.result.transaction("outbox", "readonly").objectStore("outbox").getAll();
          g.onsuccess = () => resolve(g.result.length);
          g.onerror = () => resolve(-1);
        };
        r.onerror = () => resolve(-1);
      }),
  );
  log(left === 0, "the outbox empties itself once there is signal", `${left} left`);

  const { incidents } = await (await fetch(`${B}/api/incidents`)).json();
  const { pending } = await (await fetch(`${B}/api/duplicates`)).json();
  const asIncident = incidents
    .flatMap((i) => i.reports)
    .find((r) => (r.raw_text ?? "").includes(RUN));
  const asHeld = (pending ?? []).find((r) => (r.raw_text ?? "").includes(RUN));
  log(Boolean(asIncident || asHeld),
      "the report survived the tab closing and reached the operators",
      asIncident ? "as an incident" : "held for duplicate review");

  // Checked unconditionally. A conditional skip here hid a real bug: the column
  // was added to the migrations and the update whitelist but never to the INSERT,
  // so the flag was silently null and the assertion simply did not run.
  const flag = asIncident ? asIncident.queued_offline : asHeld?.queued_offline;
  log(flag === true, "flagged as sent offline, unverified by the reporter", String(flag));
  if (asIncident) {
    const inc = incidents.find((i) => i.reports.some((r) => r.id === asIncident.id));
    log((inc?.audit ?? []).some((a) => a.action === "report_sent_from_outbox"),
        "and the audit says so rather than claiming they confirmed it");
  }
  await p2.screenshot({ path: "shots/offline-drained.png", fullPage: true });
}

await b.close();
console.log(`\n${out.filter(Boolean).length}/${out.length} passed`);
process.exit(out.every(Boolean) ? 0 : 1);
