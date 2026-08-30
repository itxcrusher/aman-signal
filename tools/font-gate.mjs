import { chromium } from "playwright";

/**
 * What does the citizen app cost to load on a bad connection?
 *
 * Written as the gate on making Nastaliq universal. It reports only what it can
 * measure honestly, which turned out to be less than first attempted:
 *
 *  - Bytes are a network fact and do not move between runs. Trustworthy.
 *  - Paint timings under emulated CPU throttling were far too noisy to assert on.
 *    They are printed for context and nothing depends on them.
 *  - An earlier version benchmarked Nastaliq against Naskh shaping cost directly.
 *    It was removed: repeated identical runs swung the ratio from 0.9x to 7.3x,
 *    and a number that unstable looks like evidence without being any.
 *
 * Rendering smoothness therefore remains UNMEASURED. Emulated throttling scales
 * execution uniformly and reproduces neither a weak GPU, thermal limits, memory
 * pressure, nor a real handset's text-shaping path, all of which matter for a
 * script this complex. Only a real low-end phone retires that risk.
 *
 *   node tools/font-gate.mjs [url]
 */

const BASE = process.argv[2] ?? "http://localhost:3100";

// A mid-range Android on a decent mobile connection in a Pakistani city, which is
// the optimistic end of the target. CPU throttled 6x, roughly the gap between a
// development laptop and a budget handset.
const NETWORK = { downloadThroughput: (1.6 * 1024 * 1024) / 8, uploadThroughput: (750 * 1024) / 8, latency: 300 };
const CPU_SLOWDOWN = 6;

// The citizen app's font budget. 400kB is set just above where the app landed
// after Naskh left the citizen path, so a regression that reintroduces a face or
// a weight fails here rather than in someone's hands.
const FONT_BUDGET = 400 * 1024;

const kb = (b) => `${(b / 1024).toFixed(1)}kB`;

const browser = await chromium.launch();
const ctx = await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
  locale: "ur-PK",
  permissions: [],
});
const page = await ctx.newPage();

const cdp = await ctx.newCDPSession(page);
await cdp.send("Network.enable");
await cdp.send("Network.emulateNetworkConditions", { offline: false, ...NETWORK });
await cdp.send("Emulation.setCPUThrottlingRate", { rate: CPU_SLOWDOWN });
// A first run has nothing cached, which is the condition that matters: someone
// installs this during a flood, not before one.
await cdp.send("Network.clearBrowserCache");

const byType = {};
const fonts = [];
page.on("response", async (res) => {
  const url = res.url();
  let size = 0;
  try {
    size = (await res.body()).length;
  } catch {
    return; // served from cache, or no body to read
  }
  const kind = /\.(woff2?|ttf|otf)(\?|$)/i.test(url)
    ? "font"
    : /\.js(\?|$)/i.test(url)
      ? "js"
      : /\.css(\?|$)/i.test(url)
        ? "css"
        : "other";
  byType[kind] = (byType[kind] ?? 0) + size;
  if (kind === "font") fonts.push({ file: url.split("/").pop().slice(0, 44), size });
});

const t0 = Date.now();
await page.goto(BASE, { waitUntil: "load", timeout: 180000 });

const paint = await page.evaluate(
  () =>
    new Promise((resolve) => {
      let cls = 0;
      try {
        new PerformanceObserver((list) => {
          for (const e of list.getEntries()) if (!e.hadRecentInput) cls += e.value;
        }).observe({ type: "layout-shift", buffered: true });
      } catch {
        /* not every build exposes layout-shift */
      }
      setTimeout(() => {
        const nav = performance.getEntriesByType("navigation")[0];
        resolve({
          fcp: performance.getEntriesByName("first-contentful-paint")[0]?.startTime ?? null,
          cls,
          domReady: nav?.domContentLoadedEventEnd ?? null,
        });
      }, 3000);
    }),
);

const wall = Date.now() - t0;
const fontBytes = byType.font ?? 0;
const total = Object.values(byType).reduce((a, b) => a + b, 0);

console.log(`\nCitizen first run, cold cache, ${CPU_SLOWDOWN}x CPU, 1.6Mbps / 300ms\n`);
console.log("  measured, reliable");
for (const [k, v] of Object.entries(byType).sort((a, b) => b[1] - a[1])) {
  console.log(`    ${kb(v).padStart(9)}  ${k}`);
}
console.log(`    ${kb(total).padStart(9)}  total`);
console.log(`\n  font files (${fonts.length})`);
for (const f of fonts.sort((a, b) => b.size - a.size)) console.log(`    ${kb(f.size).padStart(9)}  ${f.file}`);

console.log(`\n  context only, too noisy to assert on`);
console.log(`    first paint  ${paint.fcp ? Math.round(paint.fcp) + "ms" : "n/a"}`);
console.log(`    dom ready    ${paint.domReady ? Math.round(paint.domReady) + "ms" : "n/a"}`);
console.log(`    wall clock   ${wall}ms`);

const checks = [
  [`font payload under ${kb(FONT_BUDGET)}`, fontBytes <= FONT_BUDGET, kb(fontBytes)],
  ["layout shift under 0.1", paint.cls <= 0.1, paint.cls.toFixed(4)],
];
console.log(`\n--- verdict ---`);
for (const [name, ok, val] of checks) console.log(`  ${ok ? "pass" : "FAIL"}  ${name}  (${val})`);

console.log(`\nPayload is measured. Rendering smoothness is NOT, and still needs a real`);
console.log(`low-end handset: emulated throttling does not reproduce a weak GPU, thermal`);
console.log(`limits, or a handset's shaping path.`);

await browser.close();
process.exit(checks.every(([, ok]) => ok) ? 0 : 1);
