import sharp from "sharp";
import { writeFileSync } from "node:fs";

/**
 * Render the app icons from the mark.
 *
 * Kept as a script rather than hand-exported assets so the icons cannot drift
 * from app/Mark.tsx. A maskable icon is cropped to a circle by the launcher, so
 * the mark sits on a filled brand ground with generous padding rather than on
 * transparency, which would be clipped into nothing.
 */
const BRAND = "#0b5d53";

const svg = (size) => `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 48 48">
  <rect width="48" height="48" fill="${BRAND}"/>
  <g transform="translate(24 25) scale(0.62) translate(-24 -25)">
    <g fill="none" stroke="#ffffff" stroke-width="3.4" stroke-linecap="round">
      <path d="M11.5 25.5a17 17 0 0 1 25 0"/>
      <path d="M17 31.5a9.5 9.5 0 0 1 14 0"/>
      <path d="M5 41h38"/>
      <path d="M5 45.5h38" opacity="0.42"/>
    </g>
    <circle cx="24" cy="36.5" r="2.9" fill="#ffffff"/>
  </g>
</svg>`;

for (const size of [192, 512]) {
  const out = `public/icon-${size}.png`;
  await sharp(Buffer.from(svg(size))).png().toFile(out);
  console.log(`wrote ${out}`);
}

// A source SVG next to them, so the mark exists as an asset and not only as JSX.
writeFileSync("public/mark.svg", svg(48));
console.log("wrote public/mark.svg");
