#!/usr/bin/env node
/* Renders the Reddit profile kit for u/qalaburlreview: the banner, checked against the profile copy limits.
     node scripts/reddit-studio/build.js [--batch profile-2026-10] */

const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright");
const sharp = require("sharp");

const ROOT = path.resolve(__dirname, "../..");
const argv = process.argv.slice(2);
const batchAt = argv.indexOf("--batch");
const BATCH = batchAt >= 0 && argv[batchAt + 1] ? argv[batchAt + 1] : "profile-2026-10";
const OUT = path.join(ROOT, "media/reddit", BATCH);

const MAX_BANNER_BYTES = 500 * 1024;
const LIMITS = { displayName: 30, about: 200, links: 5 };

function checkCopy(profile) {
  const errors = [];
  if (profile.displayName.length > LIMITS.displayName) errors.push("displayName is " + profile.displayName.length + " characters (max " + LIMITS.displayName + ")");
  if (profile.about.length > LIMITS.about) errors.push("about is " + profile.about.length + " characters (max " + LIMITS.about + ")");
  if (profile.links.length > LIMITS.links) errors.push(profile.links.length + " links (max " + LIMITS.links + ")");
  if (/\breads?\b/i.test(profile.about)) errors.push("about uses the reading wording; the review analyzes pages");
  return errors;
}

async function main() {
  const profile = JSON.parse(fs.readFileSync(path.join(OUT, "profile.json"), "utf8"));
  const errors = checkCopy(profile);
  if (errors.length) throw new Error(errors.join("\n"));

  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1920, height: 384 } });
  await page.goto("file://" + path.join(__dirname, "frame.html"));
  await page.evaluate(() => document.fonts.ready);
  const png = await page.locator("#c").screenshot();
  await browser.close();

  const out = path.join(OUT, "banner.jpg");
  let quality = 90;
  let jpg = await sharp(png).jpeg({ quality, mozjpeg: true }).toBuffer();
  while (jpg.length > MAX_BANNER_BYTES && quality > 50) {
    quality -= 5;
    jpg = await sharp(png).jpeg({ quality, mozjpeg: true }).toBuffer();
  }
  if (jpg.length > MAX_BANNER_BYTES) throw new Error("banner is " + jpg.length + " bytes even at quality " + quality);
  fs.writeFileSync(out, jpg);

  console.log("banner.jpg  1920x384  " + Math.round(jpg.length / 1024) + " KB  (quality " + quality + ")");
  console.log("about       " + profile.about.length + "/" + LIMITS.about);
  console.log("displayName " + profile.displayName.length + "/" + LIMITS.displayName);
  console.log("links       " + profile.links.length + "/" + LIMITS.links);
}

main().catch((err) => { console.error(err.message || err); process.exit(1); });
