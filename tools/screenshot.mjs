import { chromium } from "playwright";

const url = process.argv[2] ?? "http://localhost:3000/ops";
const out = process.argv[3] ?? "shot.png";
const width = Number(process.argv[4] ?? 1440);
const height = Number(process.argv[5] ?? 900);

const browser = await chromium.launch();
const page = await browser.newPage();
// setViewportSize is the real CSS viewport; --window-size is the OS window and lies.
await page.setViewportSize({ width, height });

const errors = [];
page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
page.on("pageerror", (e) => errors.push(String(e)));

await page.goto(url, { waitUntil: "networkidle", timeout: 120000 });
// Give tiles and markers a moment to paint.
await page.waitForTimeout(4000);

await page.screenshot({ path: out, fullPage: true });

const stats = await page.evaluate(() => ({
  markers: document.querySelectorAll(".leaflet-interactive").length,
  tiles: document.querySelectorAll(".leaflet-tile-loaded").length,
  mapPresent: Boolean(document.querySelector(".leaflet-container")),
  incidents: document.querySelectorAll('[id^="incident-"]').length,
}));

console.log("saved", out);
console.log("map present:", stats.mapPresent, "| markers:", stats.markers, "| tiles loaded:", stats.tiles, "| incident cards:", stats.incidents);
if (errors.length) console.log("console errors:\n  " + errors.slice(0, 5).join("\n  "));
else console.log("no console errors");

await browser.close();
