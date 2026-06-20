"use strict";
// One-off: rasterize the branded "M" mark into favicon.ico (16+32) and
// apple-icon.png (180, full-bleed for iOS's own mask). Source of truth is the
// same geometry as src/app/icon.svg.
const fs = require("fs");
const path = require("path");
const sharp = require(path.join(__dirname, "..", "app", "node_modules", "sharp"));

const appDir = path.join(__dirname, "..", "app", "src", "app");

const GRAD =
  '<linearGradient id="g" x1="16" y1="0" x2="16" y2="32" gradientUnits="userSpaceOnUse">' +
  '<stop stop-color="#9024a8"/><stop offset="1" stop-color="#5e1571"/></linearGradient>';
const M =
  '<path d="M8.6 23.4V8.6l7.4 8 7.4-8v14.8" stroke="#ffffff" stroke-width="3.3" ' +
  'stroke-linecap="round" stroke-linejoin="round" fill="none"/>';

const faviconSvg = `<svg viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg"><defs>${GRAD}</defs><rect width="32" height="32" rx="7" fill="url(#g)"/>${M}</svg>`;
// Apple touch icon: full-bleed (rx=0) — iOS applies its own rounded mask.
const appleSvg = `<svg viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg"><defs>${GRAD}</defs><rect width="32" height="32" fill="url(#g)"/>${M}</svg>`;

const toPng = (svg, size) => sharp(Buffer.from(svg)).resize(size, size).png().toBuffer();

// Minimal ICO container holding PNG-encoded images (modern .ico).
function pngsToIco(images) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(images.length, 4);
  let offset = 6 + images.length * 16;
  const entries = [];
  for (const { size, buffer } of images) {
    const e = Buffer.alloc(16);
    e.writeUInt8(size >= 256 ? 0 : size, 0);
    e.writeUInt8(size >= 256 ? 0 : size, 1);
    e.writeUInt16LE(1, 4);
    e.writeUInt16LE(32, 6);
    e.writeUInt32LE(buffer.length, 8);
    e.writeUInt32LE(offset, 12);
    offset += buffer.length;
    entries.push(e);
  }
  return Buffer.concat([header, ...entries, ...images.map((i) => i.buffer)]);
}

(async () => {
  fs.writeFileSync(path.join(appDir, "apple-icon.png"), await toPng(appleSvg, 180));
  const ico = pngsToIco([
    { size: 16, buffer: await toPng(faviconSvg, 16) },
    { size: 32, buffer: await toPng(faviconSvg, 32) },
  ]);
  fs.writeFileSync(path.join(appDir, "favicon.ico"), ico);
  console.log("wrote favicon.ico (16+32) + apple-icon.png (180)");
})().catch((e) => { console.error(e); process.exit(1); });
