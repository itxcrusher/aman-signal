import { chromium } from "playwright";

/**
 * What the citizen page costs on a cheap phone on a bad connection.
 *
 * This is an emulation, not a device. Chrome's CPU throttle slows the main
 * thread by a multiplier and its network emulation shapes bandwidth and
 * latency; neither reproduces a real budget Android's memory pressure, thermal
 * throttling, weaker GPU, or the way a cheap panel renders Nastaliq's overlaps.
 * A number from here is a floor on the problem, not a measurement of it, and
 * saying otherwise would be the same mistake as claiming a UI was checked
 * because its tests passed.
 *
 * What it is good for: catching the difference between "slow" and "unusable",
 * and producing a screenshot of Urdu at 360px that a person can look at.
 *
 *   node tools/measure-lowend.mjs
 *   CPU=6 node tools/measure-lowend.mjs
 */

const B = process.env.BASE ?? "http://localhost:3300";
const CPU = Number(process.env.CPU ?? 6);

/**
 * Roughly a weak 3G connection in a Pakistani small town, which is the network
 * this product assumes rather than the one a demonstration runs on.
 */
const NETWORK = {
  offline: false,
  downloadThroughput: (400 * 1024) / 8,
  uploadThroughput: (400 * 1024) / 8,
  latency: 400,
};

const b = await chromium.launch();
const ctx = await b.newContext({
  viewport: { width: 360, height: 640 },
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
  locale: "ur-PK",
  userAgent:
    "Mozilla/5.0 (Linux; Android 11; Redmi 9A) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Mobile Safari/537.36",
});
const page = await ctx.newPage();
// A throttled main thread blocks long past Playwright's default action timeout,
// so a click that is merely slow otherwise reports as a failure.
page.setDefaultTimeout(180000);

const cdp = await ctx.newCDPSession(page);
await cdp.send("Network.enable");
await cdp.send("Network.emulateNetworkConditions", NETWORK);
await cdp.send("Emulation.setCPUThrottlingRate", { rate: CPU });

let transferred = 0;
page.on("response", async (res) => {
  try {
    const len = Number(res.headers()["content-length"] ?? 0);
    transferred += Number.isFinite(len) ? len : 0;
  } catch {
    /* a response whose size cannot be read is not worth failing over */
  }
});

console.log(`Emulating a low-end Android: CPU ${CPU}x slower, 400kbps, 400ms RTT, 360x640`);
console.log(`Against ${B}\n`);

const started = Date.now();
await page.goto(B, { waitUntil: "load", timeout: 180000 });

const paint = await page.evaluate(() => {
  const entries = performance.getEntriesByType("paint");
  const nav = performance.getEntriesByType("navigation")[0];
  return {
    fcp: entries.find((e) => e.name === "first-contentful-paint")?.startTime ?? null,
    domContentLoaded: nav?.domContentLoadedEventEnd ?? null,
    load: nav?.loadEventEnd ?? null,
  };
});

// The font is the thing under suspicion, so it is timed on its own.
const fonts = await page.evaluate(async () => {
  const t0 = performance.now();
  await document.fonts.ready;
  const loaded = [...document.fonts].map((f) => `${f.family} ${f.status}`);
  return { waitedMs: performance.now() - t0, loaded };
});

console.log("Load:");
console.log(`  first contentful paint   ${paint.fcp === null ? "n/a" : Math.round(paint.fcp) + "ms"}`);
console.log(`  DOM content loaded       ${Math.round(paint.domContentLoaded ?? 0)}ms`);
console.log(`  load event               ${Math.round(paint.load ?? 0)}ms`);
console.log(`  wall clock to load       ${Date.now() - started}ms`);
console.log(`  transferred (declared)   ${Math.round(transferred / 1024)}kB`);
console.log(
  `  fonts settled after load ${Math.round(fonts.waitedMs)}ms  [${fonts.loaded.join(", ")}]`,
);

// ---------- can someone actually use it ----------
console.log("\nUsing it:");
// Each step is timed to its own selector and fails loudly rather than being
// swallowed. A caught timeout here previously produced "145s to a usable form",
// which was two minutes of Playwright waiting for an element that only appears
// two screens later, reported as though it were a measurement.
async function step(label, fn) {
  const t = Date.now();
  try {
    await fn();
    console.log(`  ${label.padEnd(32)}${Date.now() - t}ms`);
  } catch (e) {
    console.log(`  ${label.padEnd(32)}FAILED after ${Date.now() - t}ms`);
    throw e;
  }
}

// Let the throttled page settle before touching it, so the first interaction
// measures the interaction rather than the tail of the load.
await page.waitForTimeout(4000);

await step("choosing Urdu", async () => {
  await page.locator('button:has-text("اردو")').click();
  await page.waitForSelector('input[type="text"]', { timeout: 60000 });
});

await step("typing a name in Urdu", async () => {
  await page.locator('input[type="text"]').first().fill("عائشہ بی بی");
});

await step("reaching the report form", async () => {
  await page.locator('button:has-text("ابھی نہیں"), button:has-text("Not now")').first().click();
  await page.waitForSelector("#report", { timeout: 60000 });
});

await step("typing a full report", async () => {
  await page
    .locator("#report")
    .fill("پانی گھر میں آ گیا ہے، ہم چھت پر ہیں۔ تین لوگ ہیں، ایک بزرگ خاتون بھی ہیں۔");
});

/**
 * Nastaliq's real cost is vertical, not horizontal: the script stacks, so a
 * line box that is fine for Latin clips the descenders and makes the text look
 * broken rather than small. Measured rather than eyeballed.
 */
const type = await page.evaluate(() => {
  const el = document.querySelector("#report");
  if (!el) return null;
  const cs = getComputedStyle(el);
  return {
    fontFamily: cs.fontFamily.split(",")[0],
    fontSize: cs.fontSize,
    lineHeight: cs.lineHeight,
    scrollHeight: el.scrollHeight,
    clientHeight: el.clientHeight,
    overflows: el.scrollHeight > el.clientHeight + 1,
  };
});
console.log("\nUrdu type in the report box:");
console.log(`  face        ${type?.fontFamily}`);
console.log(`  size        ${type?.fontSize}`);
console.log(`  line height ${type?.lineHeight}`);
console.log(`  clipped     ${type?.overflows ? "YES - text is cut off" : "no"}`);

await page.screenshot({ path: "shots/lowend-360.png", fullPage: true });
console.log("\nWritten shots/lowend-360.png - look at it before believing any of the above.");

await b.close();
