import { chromium } from "playwright";

const BASE = process.env.BASE ?? "http://localhost:3000";
const out = [];
const log = (ok, msg, extra = "") => {
  out.push(ok);
  console.log(`  ${ok ? "pass" : "FAIL"}  ${msg}${extra ? `  (${extra})` : ""}`);
};

const browser = await chromium.launch();

// ---------- 1. Language is asked first, and only one is shown after ----------
console.log("\nLanguage selection:");
let reporterId = null;
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, permissions: [] });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => console.log("    PAGE ERROR:", e.message));
  await page.goto(BASE, { waitUntil: "networkidle", timeout: 120000 });
  await page.waitForTimeout(1200);

  const first = await page.locator("main").innerText();
  log(/اپنی زبان منتخب کریں/.test(first) && /Choose your language/.test(first),
      "language is the first thing asked");
  log(/اردو/.test(first) && /English/.test(first), "both languages offered");

  // Pick English and check the Urdu is gone from the setup screen.
  await page.locator('button:has-text("English")').click();
  await page.waitForTimeout(600);
  const setup = await page.locator("main").innerText();
  log(/Your details/.test(setup), "setup screen follows in the chosen language");
  log(!/آپ کی معلومات/.test(setup), "the other language is not stacked alongside");
  log(/Location and microphone/.test(setup), "permissions explained in English");

  // Switch to Urdu from the header and confirm it swaps rather than adds.
  await page.locator('button:has-text("اردو")').first().click();
  await page.waitForTimeout(500);
  const urdu = await page.locator("main").innerText();
  log(/آپ کی معلومات/.test(urdu), "toggle switches to Urdu");
  log(!/Your details/.test(urdu), "English is replaced, not appended");

  // Back to English for the rest of this run.
  await page.locator('button:has-text("English")').first().click();
  await page.waitForTimeout(400);
  await page.locator('input[type="tel"]').fill("0321 1234567");
  await page.locator('input[type="text"]').first().fill("Flow Test");
  await page.locator('button:has-text("Not now")').click();
  await page.waitForTimeout(1500);

  const app = await page.locator("main").innerText();
  log(/Report an emergency/.test(app), "reaches the app after declining permissions");
  log(!/ہنگامی اطلاع دیں/.test(app), "app chrome is single-language");

  const stored = JSON.parse(await page.evaluate(() => localStorage.getItem("amansignal.profile")));
  reporterId = stored.reporterId;
  log(stored.lang === "en", "chosen language persisted", stored.lang);

  // ---------- 2. Three attachment icons under the text box ----------
  const icons = await page.locator("svg").count();
  log(icons >= 3, "attachment icons rendered under the text area", `${icons} svg`);
  log(await page.getByRole("button", { name: "Voice" }).isVisible(), "mic control present");
  log(await page.locator('label:has-text("Photo")').isVisible(), "photo control present");
  log(await page.getByRole("button", { name: "Location" }).isVisible(), "location control present");
  await page.screenshot({ path: "shots/flow-compose.png", fullPage: true });

  // ---------- 3. The confirmation screen is actually editable ----------
  await page.locator("#report").fill(
    "gali mein pani bohat barh gaya hai, do bachay chat par hain, raasta band hai",
  );
  await page.locator('button:has-text("Send report")').click();
  await page.waitForSelector("text=This is what we understood", { timeout: 180000 });

  const review = await page.locator("main").innerText();
  log(/Correct anything that is wrong/.test(review), "screen offers correction");

  const peopleInput = page.locator("#people");
  log(await peopleInput.count() === 1, "people affected is an input, not static text");
  const before = await peopleInput.inputValue();
  await peopleInput.fill("7");
  log((await peopleInput.inputValue()) === "7", "count can be corrected", `was ${before}`);

  // Toggle a situation chip off, then confirm the pressed state actually changed.
  const chip = page.locator('section:has(#people) button[aria-pressed="true"]').first();
  const chipText = await chip.innerText();
  await chip.click();
  await page.waitForTimeout(300);
  const nowOff = await page
    .locator(`section:has(#people) button:has-text("${chipText}")`)
    .first()
    .getAttribute("aria-pressed");
  log(nowOff === "false", "situation chips toggle", chipText);

  log(await page.locator("#heard").count() === 1, "transcript is editable");
  log(await page.locator('text=Road access').isVisible(), "road access can be corrected");
  await page.screenshot({ path: "shots/flow-review-editable.png", fullPage: true });

  // Place a pin, then send.
  const map = page.locator(".leaflet-container");
  await map.waitFor({ timeout: 20000 });
  const box = await map.boundingBox();
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await page.waitForTimeout(600);
  await page.locator('button:has-text("Confirm and send")').click();
  await page.waitForSelector("text=has been received", { timeout: 120000 });

  // ---------- 4. Two ways forward after sending ----------
  const done = await page.locator("main").innerText();
  log(/View my report/.test(done), "offers to follow the report");
  log(/Send another report/.test(done), "offers to send another");

  await page.locator('button:has-text("Send another report")').click();
  await page.waitForTimeout(600);
  log((await page.locator("#report").inputValue()) === "", "a new report starts empty");

  // ---------- 5. Reporter can say they are safe ----------
  await page.locator('button:has-text("My reports")').click();
  await page.waitForTimeout(2500);
  const mine = await page.locator("main").innerText();
  log(/Received/.test(mine), "their report is listed");
  log(/Are you safe now\?/.test(mine), "reporter is offered the safe signal");

  await page.locator('button:has-text("I am safe now")').click();
  await page.waitForSelector("text=/you are safe/i", { timeout: 60000 });
  const safe = await page.locator("main").innerText();
  log(/You reported that you are safe/.test(safe), "marking safe is recorded");
  log(/undo/i.test(safe), "and is reversible");
  await page.screenshot({ path: "shots/flow-my-reports.png", fullPage: true });

  await ctx.close();
}

// ---------- 6. The dashboard onboards, and scopes to a district ----------
console.log("\nOperations dashboard:");
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => console.log("    PAGE ERROR:", e.message));
  await page.goto(`${BASE}/ops`, { waitUntil: "networkidle", timeout: 120000 });
  await page.waitForTimeout(1500);

  const setup = await page.locator("main").innerText();
  log(/Your name/.test(setup), "dashboard asks who is at the desk");
  log(/Your district/.test(setup), "and which district they run");
  log(/Toba Tek Singh/.test(setup), "districts are listed");

  const openBtn = page.locator('button:has-text("Open the board")');
  log(await openBtn.isDisabled(), "cannot open the board unidentified");

  await page.locator("#op-name").fill("Hassaan");
  await page.locator('input[aria-label="Search districts"]').fill("Toba");
  await page.waitForTimeout(400);
  await page.locator('button:has-text("Toba Tek Singh")').first().click();
  log(!(await openBtn.isDisabled()), "enabled once named and placed");
  await openBtn.click();
  await page.waitForTimeout(2500);

  const board = await page.locator("body").innerText();
  log(/Toba Tek Singh control room/.test(board), "header names the control room");
  log(/Hassaan/.test(board), "and who is on the desk");
  log(!/your name/i.test(board), "no empty name box left to trip over");
  await page.screenshot({ path: "shots/flow-ops-board.png", fullPage: true });

  // Switching district must change what this room sees.
  const beforeCount = await page.locator("li[id^='incident-']").count();
  // Exact: "Change" also matches "Change team" on an assigned incident.
  await page.getByRole("button", { name: "Change", exact: true }).click();
  await page.waitForTimeout(600);
  await page.locator('input[aria-label="Search districts"]').fill("Gwadar");
  await page.waitForTimeout(400);
  await page.locator('button:has-text("Gwadar")').first().click();
  await page.locator('button:has-text("Open the board")').click();
  await page.waitForTimeout(2500);

  const afterCount = await page.locator("li[id^='incident-']").count();
  const elsewhere = await page.locator("body").innerText();
  log(afterCount < beforeCount, "another district sees a different board",
      `${beforeCount} -> ${afterCount}`);
  log(/other control room|other districts/.test(elsewhere),
      "and is told the rest belongs to someone else");

  await ctx.close();
}

await browser.close();
const passed = out.filter(Boolean).length;
console.log(`\n${passed}/${out.length} checks passed`);
if (reporterId) console.log(`test reporter id: ${reporterId}`);
process.exit(passed === out.length ? 0 : 1);
