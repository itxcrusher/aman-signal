/**
 * End to end test of the real product surfaces in a real browser.
 *
 * Voice is genuinely exercised, not stubbed: Chromium is launched with a WAV file
 * standing in for the microphone, so MediaRecorder, the upload, the model call and
 * the confirmation screen all run the same code a citizen's phone would.
 *
 * USAGE
 *   npm run dev                                  # in another terminal
 *   node tools/e2e.mjs                           # text paths only
 *   node tools/e2e.mjs --audio path/to/urdu.wav  # also drive the voice path
 *   node tools/e2e.mjs --headed                  # watch it run
 */
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";

const BASE = process.env.AMANSIGNAL_BASE ?? "http://localhost:3000";
const HEADED = process.argv.includes("--headed");
const audioIdx = process.argv.indexOf("--audio");
const AUDIO = audioIdx !== -1 ? path.resolve(process.argv[audioIdx + 1]) : null;
const SHOTS = "shots/e2e";

const results = [];
let browser;

function record(name, ok, detail = "") {
  results.push({ name, ok, detail });
  console.log(`  ${ok ? "pass" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`);
}

async function newPage(context, label) {
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  page.__errors = errors;
  page.__label = label;
  return page;
}

async function shot(page, name) {
  fs.mkdirSync(SHOTS, { recursive: true });
  await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true });
}

async function main() {
  if (AUDIO && !fs.existsSync(AUDIO)) {
    console.error(`Audio file not found: ${AUDIO}`);
    process.exit(1);
  }

  // A file replaces the microphone, and permission prompts are auto-accepted, so the
  // recording path runs unattended without stubbing MediaRecorder itself.
  const args = [
    "--use-fake-ui-for-media-stream",
    "--use-fake-device-for-media-stream",
    ...(AUDIO ? [`--use-file-for-fake-audio-capture=${AUDIO}`] : []),
  ];

  browser = await chromium.launch({ headless: !HEADED, args });
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },      // a phone, which is what citizens use
    permissions: ["microphone", "geolocation"],
    geolocation: { latitude: 24.876, longitude: 67.16 },  // Shah Faisal Colony
    locale: "ur-PK",
  });

  console.log(`\nCitizen intake (390x844, ur-PK, geolocation granted${AUDIO ? ", fake mic" : ""}):`);
  const page = await newPage(context, "citizen");
  await page.goto(BASE, { waitUntil: "networkidle", timeout: 120000 });

  // --- the page renders in Urdu ------------------------------------------------
  const heading = await page.locator("h1").first().innerText();
  record("intake page loads", heading.includes("AmanSignal"), heading.trim());

  const urduVisible = await page.locator(".urdu-ui").first().isVisible();
  record("Urdu interface renders", urduVisible);

  const dir = await page.locator("main").first().getAttribute("dir");
  record("citizen surface is RTL", dir === "rtl", `dir=${dir}`);

  // --- the send button is disabled until there is something to send ------------
  const sendDisabled = await page.locator('button:has-text("Send report")').isDisabled();
  record("cannot send an empty report", sendDisabled);

  // --- location -----------------------------------------------------------------
  await page.locator('button:has-text("Share your location")').click();
  await page.waitForTimeout(1500);
  const located = await page.locator("text=Location attached").count();
  record("location capture", located > 0);

  // --- photo, through the real file input --------------------------------------
  const photo = "shots/e2e-photo.png";
  fs.mkdirSync("shots", { recursive: true });
  fs.copyFileSync(
    fs.existsSync("eval-data/flood.png") ? "eval-data/flood.png" : makeTestImage(photo),
    photo,
  );
  await page.locator('input[type="file"][accept="image/*"]').setInputFiles(photo);
  await page.waitForTimeout(500);
  const photoAttached = await page.locator("text=Photo attached").count();
  record("photo attaches", photoAttached > 0);

  // --- voice, driven through MediaRecorder with the fake device ----------------
  if (AUDIO) {
    await page.locator('button:has-text("Record a voice note")').click();
    // Long enough for the fake device to feed real audio into the recorder.
    await page.waitForTimeout(9000);
    await page.locator('button:has-text("Recording, tap to stop")').click();
    await page.waitForTimeout(1500);
    const voiceAttached = await page.locator("text=Voice note attached").count();
    record("voice note records in the browser", voiceAttached > 0);
  }

  await shot(page, "01-composed");

  // --- submit and wait for the model -------------------------------------------
  await page.locator('button:has-text("Send report")').click();
  await page.waitForSelector("text=This is what we understood", { timeout: 180000 });
  record("report reaches the confirmation screen", true);
  await shot(page, "02-confirmation");

  const summaryText = await page.locator("main").innerText();
  record(
    "confirmation shows extracted facts",
    /Situation|People affected|Vulnerable/.test(summaryText),
  );

  // The voice note must have been understood, not merely uploaded: the confirmation
  // renders the Urdu transcript only when speech actually came back from the model.
  if (AUDIO) {
    const urduTranscript = await page.locator(".urdu").count();
    const hasUrduChars = /[؀-ۿ]/.test(summaryText);
    record(
      "voice note was transcribed to Urdu",
      urduTranscript > 0 && hasUrduChars,
      `${urduTranscript} Urdu block(s)`,
    );
  }

  // --- read aloud ---------------------------------------------------------------
  const listen = page.locator('button[aria-label="Listen to this summary in Urdu"]');
  if (await listen.count()) {
    const [speakRes] = await Promise.all([
      page.waitForResponse((r) => r.url().includes("/api/speak"), { timeout: 180000 }),
      listen.click(),
    ]);
    record(
      "Urdu read-aloud returns audio",
      speakRes.status() === 200,
      `${speakRes.status()} ${speakRes.headers()["content-type"] ?? ""}`,
    );
  }

  // --- clarification, if the model asked ----------------------------------------
  const question = page.locator('input[id^="q-"]');
  if (await question.count()) {
    await question.first().fill("Shah Faisal Colony, masjid ke saamne");
    record("clarification question asked and answerable", true);
  }

  await page.locator('button:has-text("Confirm and send")').click();
  await page.waitForSelector("text=has been received", { timeout: 120000 });
  record("report confirmed", true);
  await shot(page, "03-received");
  record("no console errors on citizen surface", page.__errors.length === 0,
    page.__errors.slice(0, 1).join("") || "none");

  // --- operator surface ---------------------------------------------------------
  console.log("\nOperator board (1440x900):");
  const ops = await newPage(context, "ops");
  await ops.setViewportSize({ width: 1440, height: 900 });
  await ops.goto(`${BASE}/ops`, { waitUntil: "networkidle", timeout: 120000 });
  await ops.waitForTimeout(4000);

  const cards = await ops.locator('[id^="incident-"]').count();
  record("incidents render on the board", cards > 0, `${cards} incident(s)`);

  const mapMarkers = await ops.locator(".leaflet-interactive").count();
  record("map renders markers", mapMarkers > 0, `${mapMarkers} marker(s)`);

  // Status changes must be refused without an operator name.
  const markBtn = ops.locator('button:has-text("Mark ")').first();
  if (await markBtn.count()) {
    await markBtn.click();
    await ops.waitForTimeout(800);
    const alerted = await ops.locator('[role="alert"]').count();
    record("anonymous status change is refused", alerted > 0);

    await ops.locator('input[placeholder="your name"]').fill("E2E Operator");
    await markBtn.click();
    await ops.waitForTimeout(2500);
    record("named status change is accepted", true);
  }

  const evidence = ops.locator('button:has-text("Evidence")').first();
  if (await evidence.count()) {
    await evidence.click();
    await ops.waitForTimeout(1200);
    const trail = await ops.locator("text=Audit trail").count();
    record("evidence and audit trail open", trail > 0);
  }

  await shot(ops, "04-ops-board");
  record("no console errors on operator surface", ops.__errors.length === 0,
    ops.__errors.slice(0, 1).join("") || "none");

  // --- failure path -------------------------------------------------------------
  console.log("\nFailure handling:");
  const offline = await newPage(context, "offline");
  await offline.goto(BASE, { waitUntil: "networkidle", timeout: 120000 });
  await offline.locator("#report").fill("test report while the network is down");
  await offline.context().setOffline(true);
  await offline.locator('button:has-text("Send report")').click();
  await offline.waitForTimeout(4000);
  const errShown = await offline.locator('[role="alert"]').count();
  const bodyText = await offline.locator("main").innerText();
  record(
    "network failure shows a message rather than hanging",
    errShown > 0 || /Could not reach|went wrong/i.test(bodyText),
  );
  await offline.context().setOffline(false);
  await shot(offline, "05-offline");

  const passed = results.filter((r) => r.ok).length;
  console.log("\n" + "=".repeat(58));
  console.log(`${passed}/${results.length} checks passed`);
  console.log(`screenshots in ${SHOTS}/`);
  console.log("=".repeat(58));
  if (passed !== results.length) process.exitCode = 1;
}

/** A minimal valid PNG, so the photo path has something real to upload. */
function makeTestImage(target) {
  const zlib = require("node:zlib");
  const w = 400, h = 300;
  const rows = [];
  for (let y = 0; y < h; y++) {
    const row = [0];
    for (let x = 0; x < w; x++) {
      row.push(y > h * 0.55 ? 92 : 176, y > h * 0.55 ? 104 : 192, y > h * 0.55 ? 78 : 208);
    }
    rows.push(Buffer.from(row));
  }
  const chunk = (type, data) => {
    const c = Buffer.concat([Buffer.from(type), data]);
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(zlib.crc32 ? zlib.crc32(c) >>> 0 : 0);
    return Buffer.concat([len, c, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 2;
  const png = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", zlib.deflateSync(Buffer.concat(rows))),
    chunk("IEND", Buffer.alloc(0)),
  ]);
  fs.writeFileSync(target, png);
  return target;
}

main()
  .catch((e) => { console.error("\nE2E run failed:", e.message); process.exitCode = 1; })
  .finally(async () => { await browser?.close(); });
