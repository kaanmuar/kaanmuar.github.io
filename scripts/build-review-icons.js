#!/usr/bin/env node
/* Render the QA-lab URL Review icons every review page points at (#1794), so no review page shows the CV's CM icon.

     node scripts/build-review-icons.js

   Tab sizes (16, 32 and favicon.ico) come from the small glyph, assets/qa-review-mark.svg, which stays legible there.
   The rest come from the full Fusion icon, assets/qa-review-mark-full.svg. The apple-touch and maskable icons are
   full-bleed tiles because the platform cuts its own shape; the maskable one keeps the art inside the 80% safe circle.
   qa-review.webmanifest lists them. The CV keeps its own icons (scripts/build-share-images.js). */

const fs = require("fs");
const path = require("path");
require("./playwright-sandbox");
const { chromium } = require("playwright");

const ROOT = path.resolve(__dirname, "..");
const NIGHT = "#071116";
const read = (file) => fs.readFileSync(path.join(ROOT, file), "utf8");

// The full icon with square corners and no rim, for platforms that apply their own mask.
function bleed(svg) {
  return svg.replace(/<clipPath id="tile"><rect width="512" height="512" rx="120"\/><\/clipPath>/, '<clipPath id="tile"><rect width="512" height="512"/></clipPath>')
    .replace(/\s*<rect x="4" y="4" width="504" height="504" rx="116"[^>]*\/>/, "");
}

// The bleed art shrunk into the maskable safe zone, its edge feathered into the night background.
function maskable(svg) {
  const art = bleed(svg);
  const body = art.slice(art.indexOf('<g clip-path="url(#tile)">'), art.lastIndexOf("</svg>"));
  const defs = art.slice(0, art.indexOf("</defs>"));
  return `${defs}<filter id="feather" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="16"/></filter>
		<mask id="soft"><rect x="70" y="70" width="372" height="372" rx="60" fill="#fff" filter="url(#feather)"/></mask>
	</defs>
	<rect width="512" height="512" fill="url(#bg)"/>
	<rect width="512" height="512" fill="url(#glowT)"/>
	<rect width="512" height="512" fill="url(#glowV)"/>
	<g mask="url(#soft)"><g transform="translate(256 256) scale(.78) translate(-256 -256)">${body}</g></g>
</svg>`;
}

function page(svg, size, background) {
  const src = "data:image/svg+xml;base64," + Buffer.from(svg).toString("base64");
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>* { margin: 0; } html, body { width: ${size}px; height: ${size}px; background: ${background || "transparent"}; } img { display: block; width: ${size}px; height: ${size}px; }</style></head><body><img src="${src}" alt=""></body></html>`;
}

const SMALL = read("assets/qa-review-mark.svg");
const FULL = read("assets/qa-review-mark-full.svg");

const ICONS = [
  ["assets/qa-review-icon-16.png", SMALL, 16],
  ["assets/qa-review-icon-32.png", SMALL, 32],
  ["assets/qa-review-apple-touch-icon.png", bleed(FULL), 180, NIGHT],
  ["assets/qa-review-app-icon-192.png", FULL, 192],
  ["assets/qa-review-app-icon-512.png", FULL, 512],
  ["assets/qa-review-app-icon-maskable-512.png", maskable(FULL), 512, NIGHT]
];

const MANIFEST = {
  name: "QA-lab URL Review",
  short_name: "URL Review",
  description: "Bring one public address. QA-lab URL Review shows what tracks visitors before consent, what fails WCAG 2.2 AA, which security headers are missing, and how search and AI answer engines read the page.",
  id: "/qa-review.html",
  start_url: "/qa-review.html",
  scope: "/",
  display: "standalone",
  background_color: NIGHT,
  theme_color: NIGHT,
  lang: "en",
  icons: [
    { src: "/assets/qa-review-mark-full.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
    { src: "/assets/qa-review-app-icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
    { src: "/assets/qa-review-app-icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
    { src: "/assets/qa-review-app-icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" }
  ]
};

function ico(pngs) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(pngs.length, 4);
  let offset = 6 + 16 * pngs.length;
  const entries = pngs.map(([size, data]) => {
    const entry = Buffer.alloc(16);
    entry.writeUInt8(size, 0);
    entry.writeUInt8(size, 1);
    entry.writeUInt16LE(1, 4);
    entry.writeUInt16LE(32, 6);
    entry.writeUInt32LE(data.length, 8);
    entry.writeUInt32LE(offset, 12);
    offset += data.length;
    return entry;
  });
  return Buffer.concat([header, ...entries, ...pngs.map(([, data]) => data)]);
}

async function main() {
  const browser = await chromium.launch();
  const tab = await browser.newPage({ deviceScaleFactor: 1 });
  async function shoot(svg, size, background) {
    await tab.setViewportSize({ width: size, height: size });
    await tab.setContent(page(svg, size, background), { waitUntil: "load" });
    await tab.evaluate(() => document.querySelector("img").decode());
    return tab.screenshot({ type: "png", clip: { x: 0, y: 0, width: size, height: size }, omitBackground: !background });
  }
  const sharp = require("sharp");
  for (const [out, svg, size, background] of ICONS) {
    const shot = await shoot(svg, size, background);
    const buffer = size > 32 ? await sharp(shot).png({ palette: true, quality: 90, compressionLevel: 9 }).toBuffer() : shot;
    fs.writeFileSync(path.join(ROOT, out), buffer);
    console.log("wrote", out, buffer.length, "bytes");
  }
  const pngs = [];
  for (const size of [16, 32, 48]) pngs.push([size, await shoot(SMALL, size)]);
  fs.writeFileSync(path.join(ROOT, "assets/qa-review-favicon.ico"), ico(pngs));
  console.log("wrote assets/qa-review-favicon.ico");
  fs.writeFileSync(path.join(ROOT, "qa-review.webmanifest"), JSON.stringify(MANIFEST, null, 2) + "\n");
  console.log("wrote qa-review.webmanifest");
  await browser.close();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
