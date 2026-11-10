#!/usr/bin/env node
/* Draws the launch mail heroes (#3393) and renders every launch and outreach mail for review.
   node scripts/render-launch-emails.js [outDir] [--gifs] [--pngs]   (both by default)
     --gifs  steps each CSS 3D scene (scripts/launch-email-scenes.js) in Chromium, encodes it with ffmpeg into
             assets/mail/launch/<hero>.gif under 1 MB, and copies the GIFs and an MP4 preview to outDir
     --pngs  renders the three launch designs and the outreach, student and fixable mails at 390 px and 640 px
   outDir defaults to $TMPDIR/launch-emails. Needs ffmpeg and gifsicle; runs outside the Cursor sandbox (playwright-sandbox.js). */
require("./playwright-sandbox");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync } = require("child_process");
const { chromium } = require("playwright");
const { W, H, SCENES } = require("./launch-email-scenes");
const launchMail = require("../functions/launch-mail");

const args = process.argv.slice(2);
const out = path.resolve(args.find((a) => !a.startsWith("--")) || path.join(os.tmpdir(), "launch-emails"));
const both = !args.includes("--gifs") && !args.includes("--pngs");
const ASSETS = path.join(__dirname, "..", "assets", "mail", "launch");
const MAX_BYTES = 1000 * 1000;
// Frames per loop, frames a second, and where the loop starts, so the first frame (all Outlook shows) reads well.
const PLAN = { glass: { frames: 32, fps: 10, start: 0.06 }, night: { frames: 36, fps: 12, start: 0.42 }, editorial: { frames: 36, fps: 12, start: 0.04 } };
const NOW = Date.parse("2026-11-12T12:00:00Z");

fs.mkdirSync(out, { recursive: true });
fs.mkdirSync(ASSETS, { recursive: true });

// Undithered frames keep still areas identical from frame to frame, so the GIF stores only what moves, and
// gifsicle's lossy pass then trims what does move; a light bayer dither is the fallback if banding shows.
function encode(dir, plan, gif, colors, dither) {
  execFileSync("ffmpeg", ["-v", "error", "-y", "-framerate", String(plan.fps), "-i", path.join(dir, "f%03d.png"),
    "-vf", "split[a][b];[a]palettegen=max_colors=" + colors + ":stats_mode=diff[p];[b][p]paletteuse=dither=" + dither + ":diff_mode=rectangle", "-loop", "0", gif]);
}

async function gifs(browser) {
  for (const name of Object.keys(SCENES)) {
    const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
    const plan = PLAN[name];
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "launch-" + name + "-"));
    await page.setContent(SCENES[name](), { waitUntil: "load" });
    for (let i = 0; i < plan.frames; i += 1) {
      await page.evaluate((t) => window.frame(t), (plan.start + i / plan.frames) % 1);
      await page.screenshot({ path: path.join(dir, "f" + String(i).padStart(3, "0") + ".png") });
    }
    const gif = path.join(ASSETS, launchMail.HERO[name]);
    let size = 0;
    for (const [colors, lossy] of [[160, 40], [128, 70], [96, 100], [64, 130]]) {
      encode(dir, plan, gif, colors, "none");
      execFileSync("gifsicle", ["-O3", "--lossy=" + lossy, "-b", gif]);
      size = fs.statSync(gif).size;
      console.log("  " + name + " " + colors + " colours, lossy " + lossy + ": " + Math.round(size / 1024) + " KB");
      if (size <= MAX_BYTES) break;
    }
    if (size > MAX_BYTES) throw new Error(name + " GIF is " + size + " bytes, over 1 MB");
    fs.copyFileSync(gif, path.join(out, launchMail.HERO[name]));
    execFileSync("ffmpeg", ["-v", "error", "-y", "-stream_loop", "3", "-framerate", String(plan.fps), "-i", path.join(dir, "f%03d.png"), "-c:v", "libx264", "-pix_fmt", "yuv420p", "-movflags", "+faststart", path.join(out, name + "-hero.mp4")]);
    fs.rmSync(dir, { recursive: true, force: true });
    console.log(launchMail.HERO[name] + "  " + Math.round(size / 1024) + " KB");
    await page.close();
  }
}

const report = require("../tests/unit/fixtures/review-wordpress.json");
const STOP = "https://us-central1-carlosm-interactive-cv.cloudfunctions.net/reviewUrl/notes/stop?t=preview";
const CODE = "LAUNCH-7QX4M2PB";

function mails() {
  const assetBase = "file://" + ASSETS + "/";
  const list = launchMail.OPTIONS.map((option) => ["launch-" + option, launchMail.launchMail(option, "en", { code: CODE, stopUrl: STOP }, { now: NOW, assetBase })]);
  list.push(["launch-glass-es", launchMail.launchMail("glass", "es", { code: CODE, stopUrl: STOP }, { now: NOW, assetBase })]);
  list.push(["outreach", launchMail.outreachMail("en", { host: "example-bakery.com", name: "Ana", reportUrl: "https://carlosandmunoz.com/qa-review.html?report=r7Kq2mWx9", date: "2026-11-09", count: 14, critical: 1, stopUrl: STOP }, { now: NOW })]);
  list.push(["student-outreach", launchMail.studentOutreachMail("en", { name: "Sam", trialUrl: "https://carlosandmunoz.com/qa-review.html?trial=TRY-AB12CD", stopUrl: STOP }, { now: NOW })]);
  list.push(["fixable-followup", launchMail.fixableMail({ id: "r7Kq2mWx9", lang: "en", email: "ana@example.com", report }, { stopUrl: STOP, now: NOW })]);
  return list;
}

async function pngs(browser) {
  const html = path.join(out, "html");
  fs.mkdirSync(html, { recursive: true });
  for (const [name, mail] of mails()) {
    const file = path.join(html, name + ".html");
    fs.writeFileSync(file, mail.html);
    fs.writeFileSync(path.join(html, name + ".txt"), "Subject: " + mail.subject + "\nPreheader: " + mail.preheader + "\n\n" + mail.text);
    for (const [label, width] of [["phone", 390], ["desktop", 640]]) {
      const page = await browser.newPage({ viewport: { width, height: 900 }, deviceScaleFactor: 2 });
      await page.goto("file://" + file, { waitUntil: "load" });
      await page.screenshot({ path: path.join(out, name + "-" + label + ".png"), fullPage: true });
      await page.close();
    }
    console.log(name + "  " + mail.subject);
  }
}

(async () => {
  const browser = await chromium.launch();
  try {
    if (both || args.includes("--gifs")) await gifs(browser);
    if (both || args.includes("--pngs")) await pngs(browser);
  } finally {
    await browser.close();
  }
  console.log("Saved in " + out);
})().catch((error) => { console.error(error); process.exit(1); });
