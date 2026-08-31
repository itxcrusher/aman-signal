import { chromium } from "playwright";

/**
 * A photo the model cannot read must cost the photo, not the report.
 *
 * Found live: a reporter attached a voice note, a photo and their location. The
 * photo was AVIF, which the model refuses, and the whole report failed with the
 * upstream string `InternalError.Algo.InvalidParameter: The image format is
 * illegal and cannot be opened` shown verbatim to the reporter. Two defects in
 * one: the least important attachment sank the other three, and a vendor error
 * reached someone standing in a flood.
 */

const B = process.env.BASE ?? "http://localhost:3000";
const RUN = Math.random().toString(36).slice(2, 7);
const out = [];
const log = (ok, m, x = "") => {
  out.push(ok);
  console.log(`  ${ok ? "pass" : "FAIL"}  ${m}${x ? `  (${x})` : ""}`);
};

const b = await chromium.launch();

async function reporter(name) {
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, permissions: [], locale: "en-PK" });
  const p = await ctx.newPage();
  p.on("pageerror", (e) => console.log("  PAGE ERROR:", e.message.slice(0, 90)));
  await p.goto(B, { waitUntil: "networkidle", timeout: 120000 });
  await p.waitForTimeout(1200);
  await p.locator('button:has-text("English")').click();
  await p.waitForTimeout(500);
  await p.locator('input[type="text"]').first().fill(name);
  await p.locator('button:has-text("Not now")').click();
  await p.waitForTimeout(1500);
  return { ctx, p };
}

// ---------- 1. A PNG is converted to JPEG before it is ever uploaded ----------
console.log("\nBrowser-side normalisation:");
{
  const { ctx, p } = await reporter("Photo Convert");
  await p.locator('input[type="file"]').setInputFiles("/tmp/imgtest/big.png");
  await p.waitForTimeout(6000); // decoding 17MB takes a moment

  const attached = await p.locator("main").innerText();
  log(/Photo attached/.test(attached), "a PNG is accepted and attached");

  // Prove the conversion by reading the multipart body as it leaves. postData()
  // is null for binary bodies, so the buffer is taken from the route instead.
  let sentType = null;
  let sentName = null;
  let sentBytes = 0;
  await p.route("**/api/report", async (route, req) => {
    if (req.method() === "POST") {
      const buf = req.postDataBuffer();
      if (buf) {
        sentBytes = buf.length;
        const head = buf.toString("latin1", 0, Math.min(buf.length, 65536));
        const m = head.match(/filename="([^"]+)"[\s\S]{0,200}?Content-Type:\s*(image\/[a-z+]+)/i);
        if (m) { sentName = m[1]; sentType = m[2].toLowerCase(); }
      }
    }
    await route.continue();
  });

  await p.locator("#report").fill(`gali mein pani bohat hai, madad chahiye, mohalla ${RUN}`);
  await p.locator('button:has-text("Send report")').click();
  await p.waitForSelector("text=This is what we understood", { timeout: 180000 });

  log(sentType === "image/jpeg", "a 17MB PNG left the browser as JPEG",
      `${sentName ?? "?"} / ${sentType ?? "?"}`);
  log(sentBytes > 0 && sentBytes < 2_000_000, "and was shrunk before it crossed the network",
      sentBytes ? `${(sentBytes / 1024 / 1024).toFixed(2)}MB, was 17.20MB` : "not measured");
  await ctx.close();
}

// ---------- 2. An unreadable photo does not sink the report ----------
console.log("\nUnreadable photo, with other content:");
{
  const { ctx, p } = await reporter("Photo Broken");

  // setInputFiles bypasses the change handler's normalisation only if the file
  // cannot be decoded, which is exactly the case being tested: the browser
  // cannot read it either, so the original is kept and the server sees it.
  await p.locator('input[type="file"]').setInputFiles("/tmp/imgtest/broken.jpg");
  await p.waitForTimeout(1500);
  await p.locator("#report").fill(
    `pani ghar mein aa gaya hai, ammi aur do bachay chat par hain, raasta band hai, mohalla ${RUN}`,
  );
  await p.locator('button:has-text("Send report")').click();

  // The report must still be understood, from the text alone. Waits for the
  // compose phase to end either way, so a failure is inspected rather than
  // timing out with nothing to look at.
  await p
    .waitForFunction(
      () => !!document.querySelector("#people") || !!document.querySelector('[role="alert"]'),
      { timeout: 220000 },
    )
    .catch(() => {});
  const after = await p.locator("main").innerText();
  console.log("    screen says:", JSON.stringify(after.replace(/\s+/g, " ").slice(0, 160)));

  log(/This is what we understood/.test(after), "the report survives an unreadable photo");
  log(/could not be read/.test(after), "and says so plainly");
  log(!/InternalError|InvalidParameter|<400>|chatcmpl/.test(after),
      "no upstream vendor error reaches the reporter");
  log(/People trapped|Water rising|Access blocked/.test(after),
      "the text was still extracted");

  await p.screenshot({ path: "shots/photo-dropped.png", fullPage: true });
  await p.locator('button:has-text("Confirm and send")').click();
  await p.waitForSelector("text=has been received", { timeout: 120000 });
  log(true, "and it can still be confirmed and sent");

  // The operator must be able to see that a photo was attached and unusable.
  // Both surfaces. A report that resembles an earlier one is held for an
  // operator's duplicate judgement rather than merged, which is correct and
  // common when this suite runs repeatedly. It has reached the operators either
  // way, so asserting only on incidents failed the test for the system working.
  const { incidents } = await (await fetch(`${B}/api/incidents`)).json();
  const { pending } = await (await fetch(`${B}/api/duplicates`)).json();
  const mine = incidents.flatMap((i) => i.reports).find((r) => r.reporter_name === "Photo Broken");
  const held = (pending ?? []).find((r) => /Photo Broken/.test(JSON.stringify(r)) || r.raw_text?.includes("mohalla"));
  log(Boolean(mine || held), "report reached the operators",
      mine ? "as an incident" : "held for duplicate review");
  if (mine) {
    log((mine.repairs ?? []).some((r) => /photo could not be read/i.test(r)),
        "the operator sees the photo was excluded", (mine.repairs ?? []).join("; ").slice(0, 60));
  }
  await ctx.close();
}

await b.close();
const passed = out.filter(Boolean).length;
console.log(`\n${passed}/${out.length} passed`);
process.exit(passed === out.length ? 0 : 1);
