#!/usr/bin/env node
/* Renders the daily tips series: a feed card, a story, and a 12 s clip per tip, plus captions,
   a seeded random daily schedule, and Buffer CSVs.
   node scripts/tips-studio/build.js [--tips hsts,contrast] [--skip-video] [--start 2026-10-26]
     [--batch tips-2026-10] [--seed 7] [--every 1]
   node scripts/tips-studio/build.js --source runs --start 2026-10-28 --every 4
     renders the real-run scorecards from runs.js, in their listed order, one every 4 days. */

const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");
const { chromium } = require("playwright");
const ROOT = path.resolve(__dirname, "../..");
const FFMPEG = fs.existsSync("/opt/homebrew/bin/ffmpeg") ? "/opt/homebrew/bin/ffmpeg" : "ffmpeg";

function args() {
  const out = {};
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i += 1) {
    const key = argv[i].replace(/^--/, "");
    const next = argv[i + 1];
    if (next === undefined || next.startsWith("--")) out[key] = true;
    else { out[key] = next; i += 1; }
  }
  return out;
}

const opts = args();
const RUNS = opts.source === "runs";
const studio = require(RUNS ? "./runs" : "./tips");
const BATCH = opts.batch || (RUNS ? "runs-2026-10" : "tips-2026-10");
const EVERY = Number(opts.every || 1);
const OUT = path.join(ROOT, "media/social-posts", BATCH);
const IMAGE_BASE = studio.SITE + "/media/social-posts/" + BATCH;
const START = opts.start || "2026-10-26";
const SEED = Number(opts.seed || 7);
const PICK = opts.tips ? String(opts.tips).split(",") : null;
const FPS = 30;
const SECONDS = 12;
const GUIDE_HOST = "carlosandmunoz.com/qa-review-guide.html";

const WINDOWS = {
  linkedin: ["07:30", "11:00"], x: ["08:00", "21:00"], facebook: ["12:00", "19:00"], instagram: ["11:00", "20:00"],
  "instagram-story": ["09:00", "21:00"], tiktok: ["17:00", "22:00"], youtube: ["16:00", "21:00"]
};

function rng(seed) {
  let s = seed >>> 0;
  return () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

function order(tips, rand) {
  const pool = tips.slice();
  for (let i = pool.length - 1; i > 0; i -= 1) { const j = Math.floor(rand() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
  const out = [];
  while (pool.length) {
    const prev = out[out.length - 1];
    const at = pool.findIndex((t) => !prev || t.cat !== prev.cat);
    out.push(pool.splice(at === -1 ? 0 : at, 1)[0]);
  }
  return out;
}

function minutes(hhmm) { const [h, m] = hhmm.split(":").map(Number); return h * 60 + m; }
function hhmm(min) { return String(Math.floor(min / 60)).padStart(2, "0") + ":" + String(min % 60).padStart(2, "0"); }
function day(start, offset) { const d = new Date(start + "T12:00:00Z"); d.setUTCDate(d.getUTCDate() + offset); return d.toISOString().slice(0, 10); }
function randomTime(window, rand) { const a = minutes(window[0]); const b = minutes(window[1]); return hhmm(Math.round((a + rand() * (b - a)) / 5) * 5); }
function csvCell(v) { return '"' + String(v).replace(/"/g, '""') + '"'; }

async function renderStill(page, tip, fmt, index, total, file) {
  const size = fmt === "feed" ? { width: 1080, height: 1350 } : { width: 1080, height: 1920 };
  await page.setViewportSize(size);
  await page.evaluate(([t, c, f, i, n, h]) => window.paint(t, c, f, i, n, h), [tip, studio.CATS[tip.cat], fmt, index, total, GUIDE_HOST]);
  await page.waitForTimeout(150);
  await page.locator("#c").screenshot({ path: file, type: "jpeg", quality: 92 });
}

async function renderClip(page, tip, index, total, file, cover) {
  await page.setViewportSize({ width: 1080, height: 1920 });
  await page.evaluate(([t, c, i, n, h]) => window.paint(t, c, "clip", i, n, h), [tip, studio.CATS[tip.cat], index, total, GUIDE_HOST]);
  const tmp = fs.mkdtempSync(path.join(require("os").tmpdir(), "tip-"));
  const frames = FPS * SECONDS;
  for (let f = 0; f < frames; f += 1) {
    await page.evaluate((s) => window.seek(s), f / FPS);
    await page.locator("#c").screenshot({ path: path.join(tmp, String(f).padStart(4, "0") + ".jpg"), type: "jpeg", quality: 90 });
  }
  fs.copyFileSync(path.join(tmp, String(Math.round(FPS * 7.5)).padStart(4, "0") + ".jpg"), cover);
  const run = spawnSync(FFMPEG, ["-y", "-loglevel", "error", "-framerate", String(FPS), "-i", path.join(tmp, "%04d.jpg"),
    "-f", "lavfi", "-i", "anullsrc=channel_layout=stereo:sample_rate=44100", "-shortest",
    "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "20", "-preset", "medium", "-movflags", "+faststart", "-c:a", "aac", "-b:a", "96k", file]);
  fs.rmSync(tmp, { recursive: true, force: true });
  if (run.status !== 0) throw new Error("ffmpeg failed for " + tip.id + ": " + run.stderr);
}

(async () => {
  const rand = rng(SEED);
  const all = RUNS ? studio.TIPS.slice() : order(studio.TIPS, rand);
  const total = all.length;
  const tips = PICK ? all.filter((t) => PICK.includes(t.id)) : all;
  for (const dir of ["feed", "story", "clip", "cover"]) fs.mkdirSync(path.join(OUT, dir), { recursive: true });

  const browser = await chromium.launch();
  const page = await browser.newPage({ deviceScaleFactor: 1 });
  await page.goto("file://" + path.join(__dirname, "frame.html"));
  await page.evaluate(() => document.fonts.ready);

  for (const tip of tips) {
    const index = all.indexOf(tip);
    const slug = String(index + 1).padStart(2, "0") + "-" + tip.id;
    await renderStill(page, tip, "feed", index, total, path.join(OUT, "feed", slug + ".jpg"));
    await renderStill(page, tip, "story", index, total, path.join(OUT, "story", slug + ".jpg"));
    if (!opts["skip-video"]) await renderClip(page, tip, index, total, path.join(OUT, "clip", slug + ".mp4"), path.join(OUT, "cover", slug + ".jpg"));
    console.log("rendered", slug);
  }
  await browser.close();

  const rows = [];
  const captions = {};
  all.forEach((tip, index) => {
    const slug = String(index + 1).padStart(2, "0") + "-" + tip.id;
    const date = day(START, index * EVERY);
    const cap = studio.captions(tip, index, total);
    captions[slug] = Object.assign({ date, cat: tip.cat, title: studio.plainTitle(tip) }, cap);
    for (const channel of Object.keys(WINDOWS)) {
      const video = ["tiktok", "youtube"].includes(channel);
      rows.push({ date, time: randomTime(WINDOWS[channel], rand), channel, slug,
        asset: video ? "clip/" + slug + ".mp4" : channel === "instagram-story" ? "story/" + slug + ".jpg" : "feed/" + slug + ".jpg",
        text: channel === "youtube" ? cap.youtubeTitle : channel === "instagram-story" ? "" : cap[channel] });
    }
  });
  rows.sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
  fs.writeFileSync(path.join(OUT, "captions.json"), JSON.stringify(captions, null, 2));
  fs.writeFileSync(path.join(OUT, "calendar.csv"), ["Date,Time,Channel,Post,Asset"].concat(rows.map((r) => [r.date, r.time, r.channel, r.slug, r.asset].join(","))).join("\n") + "\n");

  fs.mkdirSync(path.join(OUT, "buffer"), { recursive: true });
  for (const channel of ["linkedin", "x", "facebook", "instagram"]) {
    const lines = ["Text,Image URL,Tags,Posting Time"].concat(rows.filter((r) => r.channel === channel).map((r) =>
      [csvCell(r.text), csvCell(IMAGE_BASE + "/" + r.asset), csvCell(RUNS ? "real-runs" : "tips"), csvCell(r.date + " " + r.time)].join(",")));
    fs.writeFileSync(path.join(OUT, "buffer", "buffer-" + channel + ".csv"), lines.join("\n") + "\n");
  }
  console.log("wrote", Object.keys(captions).length, "captions,", rows.length, "calendar rows to", path.relative(ROOT, OUT));
})().catch((err) => { console.error(err); process.exit(1); });
