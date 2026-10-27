#!/usr/bin/env node
/* Renders the Reddit profile kit for u/qalaburlreview: the banner, checked against the profile copy limits.
     node scripts/reddit-studio/build.js [--batch profile-2026-10] */

const fs = require("fs");
const path = require("path");
require("../playwright-sandbox");
const { chromium } = require("playwright");
const sharp = require("sharp");

const ROOT = path.resolve(__dirname, "../..");
const argv = process.argv.slice(2);
const batchAt = argv.indexOf("--batch");
const BATCH = batchAt >= 0 && argv[batchAt + 1] ? argv[batchAt + 1] : "profile-2026-10";
const OUT = path.join(ROOT, "media/reddit", BATCH);

const MAX_BANNER_BYTES = 500 * 1024;
const LIMITS = { displayName: 30, about: 200 };
const MAX_LINKS = 5;

function checkCopy(profile) {
  const errors = [];
  for (const key of Object.keys(LIMITS)) {
    if (profile[key].length > LIMITS[key]) errors.push(key + " is " + profile[key].length + " characters (max " + LIMITS[key] + ")");
  }
  if (/\breads?\b/i.test(profile.about)) errors.push("about uses the reading wording; the review analyzes pages");
  if (profile.links.length > MAX_LINKS) errors.push(profile.links.length + " social links (max " + MAX_LINKS + ")");
  const site = profile.links.map((link) => new URL(link.url)).find((url) => url.hostname === "carlosandmunoz.com");
  if (!site || site.searchParams.get("utm_source") !== "reddit") errors.push("the site link is missing utm_source=reddit");
  return errors;
}

async function main() {
  const profile = JSON.parse(fs.readFileSync(path.join(OUT, "profile.json"), "utf8"));
  const errors = checkCopy(profile);
  if (errors.length) throw new Error(errors.join("\n"));

  const browser = await chromium.launch();
  const tab = await browser.newPage({ viewport: { width: 1920, height: 384 } });
  await tab.goto("file://" + path.join(__dirname, "frame.html"));
  await tab.evaluate(() => document.fonts.ready);
  const png = await tab.locator("#c").screenshot();
  await browser.close();

  let quality = 92;
  let jpg = await sharp(png).jpeg({ quality, mozjpeg: true }).toBuffer();
  while (jpg.length > MAX_BANNER_BYTES && quality > 60) {
    quality -= 4;
    jpg = await sharp(png).jpeg({ quality, mozjpeg: true }).toBuffer();
  }
  fs.writeFileSync(path.join(OUT, "banner.jpg"), jpg);

  console.log("banner.jpg  1920x384  " + Math.round(jpg.length / 1024) + " KB  (quality " + quality + ")");
  for (const key of Object.keys(LIMITS)) console.log(key.padEnd(12) + " " + profile[key].length + "/" + LIMITS[key]);
  console.log("links".padEnd(12) + " " + profile.links.length + "/" + MAX_LINKS);
}

main().catch((err) => { console.error(err.message || err); process.exit(1); });
