import { chromium } from "playwright";

/**
 * The path taken by a reporter whose browser will not give up a location: denied,
 * unavailable, or on an insecure origin, which covers every phone reaching this
 * over plain http. That reporter has to be able to complete a report anyway.
 */

const B = process.env.BASE ?? "http://localhost:3000";
const out = [];
const log = (ok, m, x = "") => {
  out.push(ok);
  console.log(`  ${ok ? "pass" : "FAIL"}  ${m}${x ? `  (${x})` : ""}`);
};

const b = await chromium.launch();

async function newReporter(name) {
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, permissions: [], locale: "en-PK" });
  const p = await ctx.newPage();
  p.on("pageerror", (e) => console.log("  PAGE ERROR:", e.message));
  await p.goto(B, { waitUntil: "networkidle", timeout: 120000 });
  await p.waitForTimeout(1200);
  await p.locator('button:has-text("English")').click();
  await p.waitForTimeout(500);
  await p.locator('input[type="text"]').first().fill(name);
  await p.locator('button:has-text("Not now")').click();
  await p.waitForTimeout(1500);
  return { ctx, p };
}

async function toReview(p, text) {
  await p.locator("#report").fill(text);
  await p.locator('button:has-text("Send report")').click();
  await p.waitForSelector("text=This is what we understood", { timeout: 180000 });
}

// ---------- 1. An address that geocoding resolves ----------
console.log("\nNo location permission, address that resolves:");
{
  const { ctx, p } = await newReporter("Address Test");
  await toReview(p, "pani ghar mein aa gaya hai, ammi aur bachay upar hain, raasta band hai");

  const review = await p.locator("main").innerText();
  log(/No location set yet/.test(review), "honest that no location is known");
  log(/Write your address/.test(review), "the written address leads");
  log(!/Find your city or district/.test(review), "no district search to learn first");
  log(!/nearest landmark|Where are you right now/.test(review),
      "no landmark question duplicating the address field");

  // The address field must sit above the map when there is no fix.
  const addrY = (await p.locator("#address").boundingBox()).y;
  const mapY = (await p.locator(".leaflet-container").boundingBox()).y;
  log(addrY < mapY, "address comes before the map without a fix", `${Math.round(addrY)} < ${Math.round(mapY)}`);

  const ADDRESS = "Shah Faisal Colony Karachi";
  await p.locator("#address").fill(ADDRESS);
  await p.locator('button:has-text("Find on map")').click();
  await p.waitForSelector("text=Is one of these right", { timeout: 30000 });

  const suggested = await p.locator("main").innerText();
  log(/Automatic search can be wrong/.test(suggested), "warns the match may be wrong");
  log(/شاہ فیصل|Shah Faisal/i.test(suggested), "shows the full name it matched");

  // Nothing is placed until a human picks one.
  log(/No location set yet/.test(suggested) || /Address given/.test(suggested),
      "no coordinate taken before a human chooses");

  await p.locator('button:has-text("کالونی"), button:has-text("Colony")').first().click();
  await p.waitForTimeout(1200);
  log(/Pin placed from your address/.test(await p.locator("main").innerText()),
      "choosing a candidate places the pin");

  await p.screenshot({ path: "shots/nogps-geocoded.png", fullPage: true });
  await p.locator('button:has-text("Confirm and send")').click();
  await p.waitForSelector("text=has been received", { timeout: 120000 });

  // Checked against both surfaces. A report that resembles an earlier one is
  // held for an operator's duplicate judgement rather than merged, which is
  // correct and happens constantly when this suite is run more than once. It has
  // still reached the operators, so asserting only on incidents made the test
  // fail for the system behaving properly.
  const { incidents } = await (await fetch(`${B}/api/incidents`)).json();
  const { pending } = await (await fetch(`${B}/api/duplicates`)).json();
  const inIncident = incidents.find((i) => (i.locations ?? []).some((l) => l.includes("Shah Faisal")));
  const inQueue = (pending ?? []).find((r) => (r.locations ?? []).some((l) => l.includes("Shah Faisal")));
  const found = inIncident ?? null;
  log(Boolean(inIncident || inQueue), "the written address reaches the operators",
      inIncident ? "as an incident" : "held for duplicate review");
  if (found) {
    log(found.locations.includes(ADDRESS), "verbatim, not the geocoder's paraphrase");
    log(found.lat !== null && found.lon !== null, "and the chosen coordinate came with it",
        found.lat ? `${found.lat.toFixed(3)},${found.lon.toFixed(3)}` : "none");
  }
  await ctx.close();
}

// ---------- 2. An address geocoding cannot find ----------
console.log("\nAddress the geocoder cannot resolve:");
{
  const { ctx, p } = await newReporter("Unfindable Test");
  await toReview(p, "hamare gali mein pani bohat hai, madad chahiye");

  await p.locator("#address").fill("Gali 4 Mohalla Islampura Toba Tek Singh");
  await p.locator('button:has-text("Find on map")').click();
  await p.waitForSelector("text=not found on the map", { timeout: 30000 });

  const after = await p.locator("main").innerText();
  log(/not found on the map/.test(after), "says plainly that it was not found");
  log(/still reaches the team/.test(after), "and that the report is not lost");
  log(/Address given, no map pin/.test(after), "status credits the address they gave");

  await p.locator('button:has-text("Confirm and send")').click();
  await p.waitForSelector("text=has been received", { timeout: 120000 });
  log(true, "sends with an address and no coordinate at all");

  const { incidents } = await (await fetch(`${B}/api/incidents`)).json();
  const found = incidents.find((i) => (i.locations ?? []).some((l) => l.includes("Islampura")));
  log(Boolean(found), "the unresolvable address still reaches the board");
  await ctx.close();
}

await b.close();
const passed = out.filter(Boolean).length;
console.log(`\n${passed}/${out.length} passed`);
process.exit(passed === out.length ? 0 : 1);
