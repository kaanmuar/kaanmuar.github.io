#!/usr/bin/env node
/* Renders the Fusion backdrops the social studios (post, tips, skits, LinkedIn, Reddit, Facebook) draw behind their copy.

     node scripts/fusion/stage.js            # every backdrop into media/fusion-stage/
     node scripts/fusion/stage.js story      # only the names containing "story"

   They are committed stills rather than live canvases: the tips studio renders clips in CI, where
   Chromium has no GPU and the fusion shader would take minutes a frame. subject and zoom follow
   designs/3d/fx.js: subject is where the pyramid sits, in frame heights from the centre (y up). */

const fs = require("fs");
const path = require("path");
const sharp = require("sharp");
const fusion = require("./still");

const OUT = path.join(fusion.ROOT, "media/fusion-stage");

// a, b and c are the same framing at three moments, so a run of posts does not repeat one picture.
const MOMENTS = { a: 6, b: 9.5, c: 13 };
const FRAMES = {
  story: { w: 1080, h: 1920, subject: [0.14, 0.26], zoom: 2.5 },
  portrait: { w: 1080, h: 1350, subject: [0.22, 0.25], zoom: 2.3 },
  landscape: { w: 1600, h: 900, subject: [0.5, 0.2], zoom: 2.1 },
};
const STAGE = {};
for (const [name, frame] of Object.entries(FRAMES)) {
  for (const [k, t] of Object.entries(MOMENTS)) STAGE[name + "-" + k] = Object.assign({ t }, frame);
}
Object.assign(STAGE, {
  // Reddit keeps its copy in the middle third; the pyramid stands in the right third.
  "reddit-banner": { w: 1920, h: 384, subject: [1.45, -0.04], zoom: 1.35, t: 6 },
  // Phones show the middle 1109 px; the pyramid sits right of the copy and leaves the profile picture's corner clear.
  "facebook-cover": { w: 1640, h: 624, subject: [1.06, -0.1], zoom: 1.75, t: 6 },
  // LinkedIn page cover at 2x: the copy runs from x=300 (1x) to the right edge, so the pyramid stands above the page logo, which covers the lower left.
  "linkedin-cover": { w: 2256, h: 382, subject: [-2.25, 0.1], zoom: 1.6, t: 6 },
});

async function main() {
  const only = process.argv[2];
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await fusion.launch();
  for (const [name, spec] of Object.entries(STAGE)) {
    if (only && !name.includes(only)) continue;
    const jpg = await sharp(await fusion.still(browser, spec)).jpeg({ quality: 84, mozjpeg: true }).toBuffer();
    fs.writeFileSync(path.join(OUT, name + ".jpg"), jpg);
    console.log("wrote", path.relative(fusion.ROOT, path.join(OUT, name + ".jpg")), spec.w + "x" + spec.h, Math.round(jpg.length / 1024) + " KB");
  }
  await browser.close();
}

if (require.main === module) main().catch((error) => { console.error(error); process.exit(1); });

module.exports = { STAGE };
