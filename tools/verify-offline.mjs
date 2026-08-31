import { authoriseOpsRequests } from "./ops-session.mjs";

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

// The operator endpoints are behind the control-room passphrase.
await authoriseOpsRequests(B);
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

// ---------- a failed confirmation must not lose the report ----------
//
// Sending is two calls: the upload, then the confirmation that turns a draft
// into something an operator can see. This previously ignored whether the
// second succeeded and deleted the phone's copy regardless, so a confirmation
// that failed left the server holding an invisible draft and the reporter
// holding nothing. It was the only path in the app that could lose a report
// outright, and this suite passed the whole time because it only ever drove the
// case where both calls worked.
console.log("\nWhen the server accepts the upload but the confirmation fails:");
{
  const RUN2 = Math.random().toString(36).slice(2, 7);
  const ctx2 = await b.newContext({
    viewport: { width: 390, height: 844 },
    permissions: [],
    locale: "en-PK",
  });
  const p3 = await ctx2.newPage();
  p3.on("pageerror", (e) => console.log("  PAGE ERROR:", e.message.slice(0, 100)));

  await p3.goto(B, { waitUntil: "networkidle", timeout: 120000 });
  await p3.waitForTimeout(1200);
  await p3.locator('button:has-text("English")').click();
  await p3.waitForTimeout(500);
  await p3.locator('input[type="text"]').first().fill("Confirm Failure Test");
  await p3.locator('button:has-text("Not now")').click();
  await p3.waitForTimeout(1500);

  await ctx2.setOffline(true);
  await p3.locator("#report").fill(`pani bohat tez aa raha hai, ${RUN2} mohalla, madad chahiye`);
  await p3.locator('button:has-text("Send report")').click();
  await p3.waitForSelector("text=/saved|No internet/i", { timeout: 60000 }).catch(() => {});

  // Back online, but the confirmation call is broken.
  let confirmAttempts = 0;
  await ctx2.route("**/api/report/confirm", async (route) => {
    confirmAttempts++;
    await route.fulfill({
      status: 500,
      contentType: "application/json",
      body: '{"error":"down"}',
    });
  });
  await ctx2.setOffline(false);
  await p3.reload({ waitUntil: "networkidle", timeout: 90000 });
  // Long enough for the upload and its extraction to finish and the confirm to fail.
  await p3.waitForTimeout(50000);

  const held = await p3.evaluate(
    () =>
      new Promise((resolve) => {
        const r = indexedDB.open("amansignal", 1);
        r.onsuccess = () => {
          const g = r.result.transaction("outbox", "readonly").objectStore("outbox").getAll();
          g.onsuccess = () => resolve(g.result);
          g.onerror = () => resolve([]);
        };
        r.onerror = () => resolve([]);
      }),
  );
  log(confirmAttempts > 0, "the confirmation was genuinely attempted", `${confirmAttempts} attempts`);
  log(held.length === 1, "the report is still on the phone, not deleted", `${held.length} queued`);
  log(
    Boolean(held[0]?.serverReportId),
    "and it remembers the id the server gave it, so a retry resumes rather than restarts",
    held[0]?.serverReportId ?? "none",
  );

  // Now let it through. The retry must finish the report already uploaded
  // rather than send a second copy of it.
  console.log("\nAnd when the confirmation works on the next attempt:");
  await ctx2.unroute("**/api/report/confirm");
  await p3.reload({ waitUntil: "networkidle", timeout: 90000 });
  await p3
    .waitForFunction(
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
    )
    .catch(() => {});

  const drained = await p3.evaluate(
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
  log(drained === 0, "the report finally sends", `${drained} left`);

  /**
   * Counted from the reporter's own record rather than the operator's.
   *
   * The board only lists reports that were confirmed, so counting there passed
   * while a failed attempt sat behind it as an orphaned draft: uploaded, never
   * confirmed, listed nowhere, indistinguishable from the report having worked.
   * The reporter's view is the only surface that sees every attempt, which makes
   * it the only place this can be asked honestly.
   */
  const reporterId = await p3.evaluate(() => {
    try {
      return JSON.parse(localStorage.getItem("amansignal.profile") ?? "{}").reporterId ?? null;
    } catch {
      return null;
    }
  });
  log(Boolean(reporterId), "the reporter has an id to check against", reporterId ?? "none");

  // This browser context is fresh, so every report under this reporter id
  // belongs to this one test and can be counted without a nonce.
  const mine = await (await fetch(`${B}/api/my-reports?reporter_id=${reporterId}`)).json();
  const all = mine.reports ?? [];
  log(all.length === 1, "exactly one report exists, not one per attempt", `${all.length} reports`);
  log(
    !all.some((r) => r.state === "not_sent"),
    "and no half-sent attempt is left behind as a draft nobody will ever read",
    all.map((r) => r.state).join(",") || "none",
  );

  await ctx2.close();
}

await b.close();
console.log(`
${out.filter(Boolean).length}/${out.length} passed`);
process.exit(out.every(Boolean) ? 0 : 1);
