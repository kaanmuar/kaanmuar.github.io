#!/usr/bin/env node
/* Renders the Facebook Page kit for facebook.com/qalaburlreview: the cover photo, checked against the Page copy limits.
     node scripts/facebook-studio/build.js [--batch page-2026-10] */

const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright");
const sharp = require("sharp");

const ROOT = path.resolve(__dirname, "../..");
const argv = process.argv.slice(2);
const batchAt = argv.indexOf("--batch");
const BATCH = batchAt >= 0 && argv[batchAt + 1] ? argv[batchAt + 1] : "page-2026-10";
const OUT = path.join(ROOT, "media/facebook", BATCH);

const MAX_COVER_BYTES = 100 * 1024;
const LIMITS = { name: 75, username: 50, bio: 101, about: 255 };

function checkCopy(page) {
  const errors = [];
  for (const key of Object.keys(LIMITS)) {
    if (page[key].length > LIMITS[key]) errors.push(key + " is " + page[key].length + " characters (max " + LIMITS[key] + ")");
  }
  if (/\breads?\b/i.test(page.bio + " " + page.about)) errors.push("bio or about uses the reading wording; the review analyzes pages");
  return errors;
}

async function main() {
  const page = JSON.parse(fs.readFileSync(path.join(OUT, "page.json"), "utf8"));
  const errors = checkCopy(page);
  if (errors.length) throw new Error(errors.join("\n"));

  const browser = await chromium.launch();
  const tab = await browser.newPage({ viewport: { width: 1640, height: 624 } });
  await tab.goto("file://" + path.join(__dirname, "frame.html"));
  await tab.evaluate(() => document.fonts.ready);
  const png = await tab.locator("#c").screenshot();
  await browser.close();

  /* Facebook recompresses covers over 100 KB, so it stays under that to keep the type sharp. */
  let quality = 92;
  let jpg = await sharp(png).jpeg({ quality, mozjpeg: true }).toBuffer();
  while (jpg.length > MAX_COVER_BYTES && quality > 60) {
    quality -= 4;
    jpg = await sharp(png).jpeg({ quality, mozjpeg: true }).toBuffer();
  }
  fs.writeFileSync(path.join(OUT, "cover.jpg"), jpg);

  console.log("cover.jpg  1640x624  " + Math.round(jpg.length / 1024) + " KB  (quality " + quality + ")");
  for (const key of Object.keys(LIMITS)) console.log(key.padEnd(10) + " " + page[key].length + "/" + LIMITS[key]);
}

main().catch((err) => { console.error(err.message || err); process.exit(1); });
