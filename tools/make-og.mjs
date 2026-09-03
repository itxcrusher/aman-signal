/**
 * The link preview.
 *
 * A static PNG rather than a runtime ImageResponse: the card is the same for
 * every URL, so generating it per request would be work done thousands of times
 * to produce one unchanging image. Next serves app/opengraph-image.png
 * automatically once it exists.
 *
 * Rendered from public/logo-stacked.svg, so the preview cannot drift from the
 * logo the app actually shows.
 *
 *   node tools/make-og.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";

const logo = fs.readFileSync("public/logo-stacked.svg", "utf8");
const html = `<!doctype html><meta charset="utf-8"><style>
  * { margin: 0; box-sizing: border-box; }
  body { width: 1200px; height: 630px; background: #0B5D53; color: #F7F4EE;
         font: 400 27px/1.5 ui-sans-serif, system-ui, sans-serif;
         display: flex; flex-direction: column; justify-content: center;
         padding: 0 92px; position: relative; overflow: hidden; }
  /* The mark again, very large and barely there, so the card has a ground
     rather than a colour. */
  .ghost { position: absolute; right: -190px; bottom: -230px; width: 780px;
           color: #F7F4EE; opacity: .07; }
  svg { display: block; }
  .logo { height: 178px; color: #F7F4EE; position: relative; align-self: flex-start; }
  p { margin-top: 42px; max-width: 30ch; font-size: 34px; line-height: 1.35;
      color: #CFE0DB; position: relative; }
  .foot { position: absolute; left: 92px; bottom: 60px; font-size: 21px;
          letter-spacing: .13em; text-transform: uppercase; color: #7FB0A6; }
</style>
<div class="ghost">${logo.replace("<svg", '<svg width="780"')}</div>
${logo.replace('<svg', '<svg class="logo"')}
<p>Urdu-first disaster reporting, built so that a human decides.</p>
<div class="foot">Urdu &middot; Roman Urdu &middot; English</div>`;

const tmp = path.join(process.cwd(), ".og.html");
fs.writeFileSync(tmp, html);
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });
await page.goto("file:///" + tmp.split(path.sep).join("/"));
await page.screenshot({ path: "app/opengraph-image.png" });
await browser.close();
fs.unlinkSync(tmp);
console.log("wrote app/opengraph-image.png");
