import { chromium } from "playwright";
const B = "http://localhost:3000";
const out = [];
const log = (ok, m, x = "") => { out.push(ok); console.log(`  ${ok ? "pass" : "FAIL"}  ${m}${x ? `  (${x})` : ""}`); };

const b = await chromium.launch();
// No geolocation permission at all: the phone's situation over plain http.
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, permissions: [], locale: "en-PK" });
const p = await ctx.newPage();
p.on("pageerror", (e) => console.log("  PAGE ERROR:", e.message));

await p.goto(B, { waitUntil: "networkidle", timeout: 120000 });
await p.waitForTimeout(1200);
await p.locator('button:has-text("English")').click();
await p.waitForTimeout(500);
await p.locator('input[type="text"]').first().fill("Address Test");
await p.locator('button:has-text("Not now")').click();
await p.waitForTimeout(1500);

await p.locator("#report").fill("pani ghar mein aa gaya hai, ammi aur bachay upar hain, raasta band hai");
await p.locator('button:has-text("Send report")').click();
await p.waitForSelector("text=This is what we understood", { timeout: 180000 });

const review = await p.locator("main").innerText();
log(/No location set yet/.test(review), "honest that no location is known");
log(/Find your city or district/.test(review), "offers a way to find their area");
log(/Write your address/.test(review), "offers a written address");

// Find the area and jump the map to it.
await p.locator("#area").fill("Toba");
await p.waitForTimeout(400);
const match = p.locator('button:has-text("Toba Tek Singh")').first();
log(await match.isVisible(), "district search finds a match without a network call");
await match.click();
await p.waitForTimeout(900);

// Write the address someone would actually give.
const ADDRESS = "Gali 4, Mohalla Islampura, Masjid ke paas";
await p.locator("#address").fill(ADDRESS);
await p.waitForTimeout(300);
log(/Address written/.test(await p.locator("main").innerText()), "address is acknowledged");

await p.screenshot({ path: "shots/addr-confirm.png", fullPage: true });

// A pin is still optional: send without placing one.
await p.locator('button:has-text("Confirm and send")').click();
await p.waitForSelector("text=has been received", { timeout: 120000 });
log(true, "report sends with no coordinates at all");

const res = await fetch(`${B}/api/incidents`);
const { incidents } = await res.json();
const found = incidents.find((i) => (i.locations ?? []).some((l) => l.includes("Islampura")));
log(Boolean(found), "the written address reaches the operator board");
if (found) {
  log(found.locations.includes(ADDRESS), "verbatim, not paraphrased", found.locations.join(" | ").slice(0, 80));
  const r = found.reports.find((x) => x.reporter_name === "Address Test");
  log(Boolean(r), "report is attached to the incident");
  const unknown = r?.extraction?.missing_information ?? [];
  log(!unknown.some((u) => /locat|address/i.test(u)),
      "location no longer reported as unknown", unknown.join("; ").slice(0, 60) || "(none)");
}

await b.close();
const passed = out.filter(Boolean).length;
console.log(`\n${passed}/${out.length} passed`);
