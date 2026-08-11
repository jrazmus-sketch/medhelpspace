#!/usr/bin/env node
// Rasterises the e-mail footer's social glyphs to PNG.
//
// WHY PNG AND NOT SVG: Gmail and Outlook strip inline <svg> and reject data:
// URIs, so an e-mail icon has to be a real raster image at an absolute URL. The
// site footer keeps using inline SVG (landing-footer.tsx) — same glyphs, two
// renderings, which is why they live here together and are generated rather than
// hand-drawn twice.
//
// Output is 60×60 for a 20×20 display box (3× for retina), matching the existing
// instagram-icon-email.png byte-for-byte in size and treatment.
//
// Run:  node scripts/build-social-email-icons.js
// Then commit the PNGs under app/public/brand/.

const fs = require("node:fs");
const path = require("node:path");
const sharp = require(path.join(__dirname, "..", "app", "node_modules", "sharp"));

const OUT_DIR = path.join(__dirname, "..", "app", "public", "brand");
const SIZE = 60;
// Brand purple, light mode. Same value the footer's links use.
const COLOR = "#7a1d91";

// Stroke-style glyphs on a 24-unit grid — the lucide idiom the site footer's
// InstagramIcon already follows, so all three read as one set.
const GLYPHS = {
  "youtube-icon-email.png": `
    <path d="M2.5 17a24.12 24.12 0 0 1 0-10 2 2 0 0 1 1.4-1.4 49.56 49.56 0 0 1 16.2 0A2 2 0 0 1 21.5 7a24.12 24.12 0 0 1 0 10 2 2 0 0 1-1.4 1.4 49.55 49.55 0 0 1-16.2 0A2 2 0 0 1 2.5 17"/>
    <path d="m10 15 5-3-5-3z"/>`,
  // TikTok is a brand mark with no lucide equivalent; this is the widely used
  // single-stroke reduction — note head, stem, and flag.
  "tiktok-icon-email.png": `
    <path d="M9 12a4 4 0 1 0 4 4V4a5 5 0 0 0 5 5"/>`,
};

function svgFor(body) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 24 24"
    fill="none" stroke="${COLOR}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;
}

(async () => {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  for (const [file, body] of Object.entries(GLYPHS)) {
    const out = path.join(OUT_DIR, file);
    await sharp(Buffer.from(svgFor(body))).png({ compressionLevel: 9 }).toFile(out);
    const b = fs.readFileSync(out);
    console.log(`${file}  ${b.readUInt32BE(16)}×${b.readUInt32BE(20)}  ${b.length} bytes`);
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
