import { chromium } from "playwright";

const BASE = "http://localhost:3000";
const out = [];
const log = (ok, msg, extra = "") => {
  out.push(ok);
  console.log(`  ${ok ? "pass" : "FAIL"}  ${msg}${extra ? `  (${extra})` : ""}`);
};

const browser = await chromium.launch();

// ---------- 1. Someone who declines permissions can still report ----------
console.log("\nDeclines permissions, files a typed report:");
{
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    locale: "ur-PK",
    permissions: [], // nothing granted
  });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => console.log("    PAGE ERROR:", e.message));
  await page.goto(BASE, { waitUntil: "networkidle", timeout: 120000 });
  await page.waitForTimeout(1200);

  const first = await page.locator("main").innerText();
  log(/Allow and continue/.test(first), "onboarding shows on first run");
  log(/Not now, I will type my report/.test(first), "declining is offered, not hidden");
  log(/موبائل نمبر|03XX/.test(first), "phone is asked for at setup");

  // Fill the profile, then decline permissions outright.
  await page.locator('input[type="tel"]').fill("0321 1234567");
  await page.locator('input[type="text"]').first().fill("Test Reporter");
  await page.locator('button:has-text("Not now")').click();
  await page.waitForTimeout(1500);

  const app = await page.locator("main").innerText();
  log(!/Allow and continue/.test(app), "declining lets them into the app");
  log(/Report|اطلاع دیں/.test(app), "reporting surface is reachable without permissions");
  log(/My reports|میری اطلاعات/.test(app), "the my-reports tab exists");

  // Phone normalised to E.164 and stored.
  const stored = await page.evaluate(() => localStorage.getItem("amansignal.profile"));
  const prof = JSON.parse(stored ?? "{}");
  log(prof.phone === "+923211234567", "phone normalised to +92", prof.phone);
  log(typeof prof.reporterId === "string" && prof.reporterId.length >= 8,
      "device id generated without an account");

  // File a typed report.
  await page.locator("#report").fill(
    "gali mein pani bohat barh gaya hai, do bachay chat par hain, raasta band hai",
  );
  await page.locator('button:has-text("Send report")').click();
  await page.waitForSelector("text=This is what we understood", { timeout: 180000 });

  const review = await page.locator("main").innerText();
  log(/Tap the map to place your exact location|Drag the pin/.test(review),
      "confirmation screen offers the map");
  log(/No location set yet/.test(review), "honest that no location is set yet");
  log(/Use my location/.test(review), "permission is offered again, in context");

  // Place the pin by tapping the map.
  const map = page.locator(".leaflet-container");
  await map.waitFor({ timeout: 20000 });
  log(await map.isVisible(), "street map rendered");
  const box = await map.boundingBox();
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await page.waitForTimeout(800);

  const afterPin = await page.locator("main").innerText();
  log(/Pin placed by you/.test(afterPin), "tapping the map places the pin");

  await page.screenshot({ path: "shots/new-confirm-with-map.png", fullPage: true });

  await page.locator('button:has-text("Confirm and send")').click();
  await page.waitForSelector("text=received", { timeout: 120000 });
  log(true, "report submitted with a hand-placed pin");

  // Follow it up.
  await page.locator('button:has-text("Follow what happens next")').click();
  await page.waitForTimeout(2500);
  const mine = await page.locator("main").innerText();
  log(/Received/.test(mine), "my-reports shows the report came back");
  log(/Not yet reviewed|Waiting for the control room/.test(mine),
      "state is honest, not dressed up as progress");
  log(/location attached/.test(mine), "the hand-placed pin counts as a location");

  await page.screenshot({ path: "shots/new-my-reports.png", fullPage: true });
  await ctx.close();
}

// ---------- 2. The operator sees who to call, and can hand over ----------
console.log("\nOperator board:");
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => console.log("    PAGE ERROR:", e.message));
  await page.goto(`${BASE}/ops`, { waitUntil: "networkidle", timeout: 120000 });
  await page.waitForTimeout(2500);

  const board = await page.locator("body").innerText();
  log(/pinned/.test(board), "location quality distinguishes a hand-placed pin");

  await page.locator('button:has-text("Evidence")').first().click();
  await page.waitForTimeout(800);
  const evidence = await page.locator("body").innerText();
  log(/Reporter:/.test(evidence), "reporter shown on the evidence panel");
  log(/\+923211234567/.test(evidence), "phone number is there to call");
  log(/pin placed by reporter/.test(evidence), "provenance of the coordinate is recorded");

  // Assign without a name: must refuse.
  await page.locator('button:has-text("Mark verified")').first().click();
  await page.waitForTimeout(600);
  const refused = await page.locator("body").innerText();
  log(/Enter your name first/.test(refused), "anonymous status change refused");

  await page.screenshot({ path: "shots/new-ops-board.png", fullPage: true });
  await ctx.close();
}

await browser.close();
const passed = out.filter(Boolean).length;
console.log(`\n${passed}/${out.length} checks passed`);
process.exit(passed === out.length ? 0 : 1);
