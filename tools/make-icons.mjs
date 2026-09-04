import sharp from "sharp";
import { writeFileSync } from "node:fs";

/**
 * Render every app icon from the mark.
 *
 * Kept as a script rather than hand-exported assets so the icons cannot drift
 * from app/Mark.tsx. This includes app/favicon.ico, which for a long time was
 * still the framework's own scaffold icon: nothing generated it, so nothing
 * ever noticed it had not been replaced.
 *
 * Two amounts of padding, because the two jobs are different. A launcher crops
 * a maskable icon to a circle, so the installed-app icon needs room around the
 * mark or the waterline is cut off. A favicon is 16 pixels and never cropped,
 * so padding there is only lost resolution.
 */
const BRAND = "#0b5d53";

const svg = (size, { scale = 0.62, stroke = 3.4, ghost = true } = {}) => `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 48 48">
  <rect width="48" height="48" fill="${BRAND}"/>
  <g transform="translate(24 25) scale(${scale}) translate(-24 -25)">
    <g fill="none" stroke="#ffffff" stroke-width="${stroke}" stroke-linecap="round">
      <path d="M11.5 25.5a17 17 0 0 1 25 0"/>
      <path d="M17 31.5a9.5 9.5 0 0 1 14 0"/>
      <path d="M5 41h38"/>
      ${ghost ? '<path d="M5 45.5h38" opacity="0.42"/>' : ""}
    </g>
    <circle cx="24" cy="36.5" r="2.9" fill="#ffffff"/>
  </g>
</svg>`;

/*
 * Optical sizing, which is the reason an .ico holds several images rather than
 * one scaled. At 16 pixels the mark's stroke lands at under a pixel and the
 * whole thing turns to grey mush, so the small entries are drawn with a heavier
 * stroke and less padding, and the second waterline, which is faint by design,
 * is dropped below 32 where it reads as noise rather than as a line.
 */
const ICO = {
  16: { scale: 1.0, stroke: 5.0, ghost: false },
  32: { scale: 0.92, stroke: 4.0, ghost: true },
  48: { scale: 0.86, stroke: 3.4, ghost: true },
};

for (const size of [192, 512]) {
  const out = `public/icon-${size}.png`;
  await sharp(Buffer.from(svg(size))).png().toFile(out);
  console.log(`wrote ${out}`);
}

// iOS uses neither the manifest icons nor the .ico.
await sharp(Buffer.from(svg(180, { scale: 0.72 }))).png().toFile("app/apple-icon.png");
console.log("wrote app/apple-icon.png");

/*
 * The .ico container, assembled here rather than with a converter.
 *
 * An ICO is a six-byte header, then one sixteen-byte directory entry per size,
 * then the images. Every browser in use reads PNG-compressed entries, so the
 * images are the PNGs sharp already produced and no bitmap encoder is needed.
 */
const sizes = Object.keys(ICO).map(Number);
const images = await Promise.all(
  sizes.map((n) => sharp(Buffer.from(svg(n, ICO[n]))).png().toBuffer()),
);

const header = Buffer.alloc(6);
header.writeUInt16LE(0, 0); // reserved
header.writeUInt16LE(1, 2); // 1 = icon
header.writeUInt16LE(sizes.length, 4);

let offset = 6 + 16 * sizes.length;
const entries = sizes.map((n, i) => {
  const e = Buffer.alloc(16);
  e.writeUInt8(n === 256 ? 0 : n, 0); // width, 0 means 256
  e.writeUInt8(n === 256 ? 0 : n, 1); // height
  e.writeUInt8(0, 2); // palette size, 0 for truecolour
  e.writeUInt8(0, 3); // reserved
  e.writeUInt16LE(1, 4); // colour planes
  e.writeUInt16LE(32, 6); // bits per pixel
  e.writeUInt32LE(images[i].length, 8);
  e.writeUInt32LE(offset, 12);
  offset += images[i].length;
  return e;
});

writeFileSync("app/favicon.ico", Buffer.concat([header, ...entries, ...images]));
console.log(`wrote app/favicon.ico  (${sizes.join(", ")} px)`);

// A source SVG next to them, so the mark exists as an asset and not only as JSX.
writeFileSync("public/mark.svg", svg(48));
console.log("wrote public/mark.svg");
