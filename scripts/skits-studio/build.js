#!/usr/bin/env node
/* Builds a skit's six-language social batch (#1041) from Gemini (Veo) takes and the product screen recordings.

     node scripts/skits-studio/build.js friday-release --prompts        print each language's Gemini prompt and where its take goes
     node scripts/skits-studio/build.js friday-release [--langs en,es] [--batch skits-friday-release] [--start 2026-10-28]
     node scripts/skits-studio/build.js friday-release --captions-only  rewrite captions.json and calendar.csv only

   Takes: media/skits/raw/<skit>-<lang>.mp4, the Veo video downloaded from gemini.google.com (16:9, about 8 to 10 s).
   Screens: media/skits/screen/<skit>-<lang>.mp4 from scripts/skits-studio/record.js.
   Each clip is 9:16 (1080x1920): the actors set it up, the URL Review window fills in the report, the actors land
   the line, then the end card. The take's longest pause between 2.6 s and 6 s (the typing beat) splits it; its
   speech spans time the captions. The actors keep their own Gemini voices; the launch reels' bed
   (media/url-review-demos/bed.wav) sits under them, louder under the product window, and a clip whose peak is not
   above -30 dB stops the build (.cursor/rules/social-clips.mdc).
   Writes media/social-posts/<batch>/clip/<NN>-<skit>-<lang>.mp4, cover/, story/ and feed/ stills, and captions.json
   (kind skit, written in the clip's language) with calendar.csv for the languages that have a clip. Then plan the
   batch into lane 5: node scripts/social-calendar.js --write --batch <batch>. */

require("../playwright-sandbox");
const { chromium } = require("playwright");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync, execFileSync } = require("child_process");
const { SITE, LANGS, UI, SKITS, promptFor, pageFor } = require("./skits");
const { tagLine } = require("../social-tags");

const ROOT = path.resolve(__dirname, "../..");
const FFMPEG = fs.existsSync("/opt/homebrew/bin/ffmpeg") ? "/opt/homebrew/bin/ffmpeg" : "ffmpeg";
const FFPROBE = FFMPEG.replace(/ffmpeg$/, "ffprobe");
const W = 1080;
const H = 1920;
const FPS = 30;
const PRODUCT = 9;
const WAIT = 1.6;
const END = 2.6;
const ACT_Y = 300;
const SHOT = { width: 1000, height: 1580 };
const WINDOWS = { linkedin: ["07:30", "11:00"], x: ["08:00", "21:00"], facebook: ["12:00", "19:00"], instagram: ["11:00", "20:00"], "instagram-story": ["09:00", "21:00"], tiktok: ["17:00", "22:00"], youtube: ["16:00", "21:00"] };

function args() {
  const out = { _: [] };
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i += 1) {
    if (!argv[i].startsWith("--")) { out._.push(argv[i]); continue; }
    const next = argv[i + 1];
    if (next === undefined || next.startsWith("--")) out[argv[i].slice(2)] = true;
    else { out[argv[i].slice(2)] = next; i += 1; }
  }
  return out;
}

// The bed is not committed; a worktree reads it from the main checkout.
function bedPath() {
  const own = path.join(ROOT, "media/url-review-demos/bed.wav");
  if (fs.existsSync(own)) return own;
  const common = execFileSync("git", ["rev-parse", "--path-format=absolute", "--git-common-dir"], { cwd: ROOT, encoding: "utf8" }).trim();
  return path.join(path.dirname(common), "media/url-review-demos/bed.wav");
}

function ff(argv, what) {
  const run = spawnSync(FFMPEG, ["-y", "-hide_banner", "-loglevel", "error"].concat(argv), { encoding: "utf8" });
  if (run.status !== 0) throw new Error("ffmpeg failed (" + what + "): " + run.stderr.slice(-1500));
}

function duration(file) {
  return parseFloat(spawnSync(FFPROBE, ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", file], { encoding: "utf8" }).stdout) || 0;
}

// Speech spans: the stretches between pauses of at least 0.25 s below -32 dB.
function speech(file) {
  const log = spawnSync(FFMPEG, ["-hide_banner", "-i", file, "-af", "silencedetect=n=-32dB:d=0.25", "-f", "null", "-"], { encoding: "utf8" }).stderr;
  const length = duration(file);
  const quiet = [];
  let open = null;
  log.split("\n").forEach((line) => {
    const s = line.match(/silence_start: ([\d.]+)/);
    const e = line.match(/silence_end: ([\d.]+)/);
    if (s) open = parseFloat(s[1]);
    if (e) { quiet.push([open || 0, parseFloat(e[1])]); open = null; }
  });
  if (open !== null) quiet.push([open, length]);
  const spans = [];
  let at = 0;
  quiet.forEach(([a, b]) => { if (a - at > 0.12) spans.push([at, a]); at = b; });
  if (length - at > 0.12) spans.push([at, length]);
  return { length, quiet, spans };
}

// Setup [0, a], payoff [b, end]; captions for the two setup lines and the payoff line.
function timeline(take, t) {
  const { length, quiet, spans } = speech(take);
  let cutA;
  let cutB;
  if (t.cut) [cutA, cutB] = t.cut;
  else {
    const beat = quiet.filter(([a]) => a >= 2.6 && a <= 6).sort((x, y) => (y[1] - y[0]) - (x[1] - x[0]))[0];
    if (!beat) throw new Error("no pause between 2.6 s and 6 s in " + take + "; set cut in skits.js");
    cutA = Math.min(beat[0] + 0.35, beat[1]);
    cutB = Math.max(beat[1] - 0.25, cutA);
  }
  const setup = spans.filter(([a]) => a < cutA).map(([a, b]) => [a, Math.min(b, cutA)]);
  const payoff = spans.filter(([, b]) => b > cutB).map(([a, b]) => [Math.max(a, cutB), b]);
  if (!setup.length || !payoff.length) throw new Error("no speech on one side of the cut in " + take);
  // The setup's two lines split at its widest gap.
  let split = 1;
  let widest = -1;
  for (let i = 1; i < setup.length; i += 1) if (setup[i][0] - setup[i - 1][1] > widest) { widest = setup[i][0] - setup[i - 1][1]; split = i; }
  const one = setup.length > 1 ? [setup[0][0], setup[split - 1][1]] : [setup[0][0], (setup[0][0] + setup[0][1]) / 2];
  const two = setup.length > 1 ? [setup[split][0], setup[setup.length - 1][1]] : [one[1], setup[0][1]];
  const words = t.lines[2].split(/\s+/).length;
  const three = [payoff[0][0], Math.min(length, payoff[0][0] + Math.max(2.4, words * 0.42))];
  const end = Math.min(length, payoff[payoff.length - 1][1] + 0.7);
  return { length, cutA, cutB, end, caps: [one, two, three] };
}

async function layer(page, kind, data, file) {
  await page.setViewportSize({ width: data.size[0], height: data.size[1] });
  await page.evaluate(([k, d]) => window.paint(k, d), [kind, data]);
  await page.evaluate(() => Promise.all([...document.images].map((img) => img.complete ? null : new Promise((r) => { img.onload = img.onerror = r; }))));
  await page.waitForTimeout(80);
  await page.locator("#c").screenshot({ path: file, omitBackground: /\.png$/.test(file), type: /\.png$/.test(file) ? "png" : "jpeg", quality: /\.png$/.test(file) ? undefined : 90 });
}

function peak(file) {
  const log = spawnSync(FFMPEG, ["-hide_banner", "-i", file, "-af", "volumedetect", "-vn", "-f", "null", "-"], { encoding: "utf8" }).stderr;
  return parseFloat((log.match(/max_volume: (-?[\d.]+) dB/) || [])[1]);
}

async function render(page, skit, lang, slug, out) {
  const t = skit.lang[lang];
  const ui = UI[lang];
  const take = path.join(ROOT, "media/skits/raw", skit.id + "-" + lang + ".mp4");
  const screen = path.join(ROOT, "media/skits/screen", skit.id + "-" + lang + ".mp4");
  const marks = JSON.parse(fs.readFileSync(screen.replace(/\.mp4$/, ".json"), "utf8"));
  const tl = timeline(take, t);
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "skit-"));
  const at = (name) => path.join(tmp, name);

  // Actors: the take's crop at full width under the scene tag; captions under them; the window below.
  const [cx, cy, cw, ch] = t.crop || [0, 0, 1, 1];
  const probe = spawnSync(FFPROBE, ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height", "-of", "csv=p=0", take], { encoding: "utf8" }).stdout.trim().split(",").map(Number);
  const crop = [Math.round(probe[0] * cw / 2) * 2, Math.round(probe[1] * ch / 2) * 2, Math.round(probe[0] * cx), Math.round(probe[1] * cy)];
  const actH = Math.round(W * crop[1] / crop[0] / 2) * 2;
  const capAt = ACT_Y + actH + 34;
  const winA = { x: 60, y: capAt + 200, w: 960, h: H - 70 - (capAt + 200) };
  const winP = { x: 40, y: 150, w: SHOT.width, h: SHOT.height + 60 };
  const size = [W, H];
  await layer(page, "bg", { size }, at("bg.png"));
  await layer(page, "chrome", { size, ui, tag: t.scene, tagAt: ACT_Y - 108 }, at("chrome-a.png"));
  await layer(page, "chrome", { size, ui }, at("chrome-p.png"));
  await layer(page, "window", { size, ui, win: winA, host: skit.host }, at("win-a.png"));
  await layer(page, "window", { size, ui, win: winP, host: skit.host }, at("win-p.png"));
  for (let i = 0; i < 3; i += 1) await layer(page, "cap", { size, text: t.lines[i], at: capAt }, at("cap" + i + ".png"));
  await layer(page, "cap", { size, text: t.found, at: winP.y + winP.h + 18, found: true }, at("found.png"));
  await layer(page, "end", { size, ui, url: pageFor(lang).replace(/^https:\/\//, "") }, at("end.png"));

  const vcrop = "crop=" + crop.join(":") + ",scale=" + W + ":" + actH + ",setsar=1,fps=" + FPS;
  const contentH = winA.h - 60;
  // The URL field and the highlighted finding both sit about a fifth of the way down the recording.
  const shotStill = (seek, name) => ff(["-ss", String(seek), "-i", screen, "-frames:v", "1", "-vf", "scale=" + winA.w + ":-2,crop=" + winA.w + ":" + contentH + ":0:'min(ih-" + contentH + ",ih*0.2)'", at(name)], name);
  shotStill(Math.max(0, marks.type - 0.1), "shot-a.png");
  shotStill(Math.max(0, marks.end - 0.1), "shot-b.png");

  const actors = (from, to, shot, caps, file) => {
    const d = (to - from).toFixed(3);
    const inputs = ["-loop", "1", "-t", d, "-i", at("bg.png"), "-ss", from.toFixed(3), "-t", d, "-i", take, "-loop", "1", "-i", at(shot), "-loop", "1", "-i", at("win-a.png"), "-loop", "1", "-i", at("chrome-a.png")];
    caps.forEach((c) => inputs.push("-loop", "1", "-i", at("cap" + c.i + ".png")));
    let graph = "[1:v]" + vcrop + "[act];[0:v][act]overlay=0:" + ACT_Y + "[v1];[v1][2:v]overlay=" + winA.x + ":" + (winA.y + 60) + "[v2];[v2][3:v]overlay=0:0[v3];[v3][4:v]overlay=0:0[v4]";
    caps.forEach((c, k) => { graph += ";[v" + (4 + k) + "][" + (5 + k) + ":v]overlay=0:0:enable='between(t," + (c.a - from).toFixed(2) + "," + (c.b - from).toFixed(2) + ")'[v" + (5 + k) + "]"; });
    graph += ";[v" + (4 + caps.length) + "]format=yuv420p[v];[1:a]aformat=sample_rates=48000:channel_layouts=stereo,afade=t=in:d=0.05,afade=t=out:st=" + (to - from - 0.08).toFixed(3) + ":d=0.08[a]";
    ff(inputs.concat(["-filter_complex", graph, "-map", "[v]", "-map", "[a]", "-t", d, "-r", String(FPS), "-c:v", "libx264", "-crf", "18", "-preset", "medium", "-c:a", "pcm_s16le", file]), path.basename(file));
  };
  const caps = tl.caps.map(([a, b], i) => ({ i, a, b: b + 0.15 }));
  actors(0, tl.cutA, "shot-a.png", caps.slice(0, 2).map((c) => Object.assign({}, c, { b: Math.min(c.b, tl.cutA) })), at("seg1.mov"));
  actors(tl.cutB, tl.end, "shot-b.png", caps.slice(2).map((c) => Object.assign({}, c, { b: Math.min(c.b, tl.end) })), at("seg3.mov"));

  // The product over the blurred room: the URL typed at its own pace, the wait for the run squeezed into WAIT
  // seconds, and the report given the rest of PRODUCT.
  const shotFrom = Math.max(0, marks.type - 0.3);
  const typed = Math.min(2.4, marks.submit - shotFrom);
  const pieces = [[shotFrom, marks.submit, typed], [marks.submit, marks.report, WAIT], [marks.report, marks.end, PRODUCT - typed - WAIT]];
  const shot = "[1:v]split=3[q0][q1][q2];" + pieces.map(([a, b, d], i) => "[q" + i + "]trim=" + (a - shotFrom).toFixed(3) + ":" + (b - shotFrom).toFixed(3) + ",setpts=(PTS-STARTPTS)*" + (d / (b - a)).toFixed(4) + "[r" + i + "]").join(";") +
    ";[r0][r1][r2]concat=n=3:v=1:a=0,fps=" + FPS + ",scale=" + SHOT.width + ":" + SHOT.height + "[shot];";
  ff(["-ss", tl.cutA.toFixed(3), "-i", take, "-ss", shotFrom.toFixed(3), "-i", screen, "-loop", "1", "-i", at("win-p.png"), "-loop", "1", "-i", at("chrome-p.png"), "-loop", "1", "-i", at("found.png"),
    "-f", "lavfi", "-t", String(PRODUCT), "-i", "anullsrc=r=48000:cl=stereo",
    "-filter_complex",
    "[0:v]trim=end_frame=1,loop=-1:1:0,setpts=N/" + FPS + "/TB,scale=" + W + ":" + H + ":force_original_aspect_ratio=increase,crop=" + W + ":" + H + ",boxblur=40:2,eq=brightness=-0.18:saturation=0.8,fps=" + FPS + "[room];" +
    shot +
    "[room][shot]overlay=" + winP.x + ":" + (winP.y + 60) + ":eof_action=repeat[p1];[p1][2:v]overlay=0:0[p2];[p2][3:v]overlay=0:0[p3];" +
    "[p3][4:v]overlay=0:0:enable='gte(t," + (PRODUCT - 3).toFixed(2) + ")',format=yuv420p[v]",
    "-map", "[v]", "-map", "5:a", "-t", String(PRODUCT), "-r", String(FPS), "-c:v", "libx264", "-crf", "18", "-preset", "medium", "-c:a", "pcm_s16le", at("seg2.mov")], "product");
  ff(["-loop", "1", "-t", String(END), "-i", at("end.png"), "-f", "lavfi", "-t", String(END), "-i", "anullsrc=r=48000:cl=stereo",
    "-vf", "fade=t=in:d=0.35,format=yuv420p", "-r", String(FPS), "-c:v", "libx264", "-crf", "18", "-c:a", "pcm_s16le", at("seg4.mov")], "end card");

  // Bed: 0.16 under the actors, up to 0.5 under the product, fading out over the end card.
  const d1 = tl.cutA;
  const d2 = d1 + PRODUCT;
  const total = d2 + (tl.end - tl.cutB) + END;
  const vol = "0.16+0.34*clip((t-" + (d1 - 0.2).toFixed(2) + ")/0.5,0,1)*clip((" + (d2 + 0.2).toFixed(2) + "-t)/0.5,0,1)";
  const file = path.join(out, "clip", slug + ".mp4");
  ff(["-i", at("seg1.mov"), "-i", at("seg2.mov"), "-i", at("seg3.mov"), "-i", at("seg4.mov"), "-stream_loop", "-1", "-i", bedPath(),
    "-filter_complex",
    "[0:v][0:a][1:v][1:a][2:v][2:a][3:v][3:a]concat=n=4:v=1:a=1[v][dia];" +
    "[4:a]aformat=sample_rates=48000:channel_layouts=stereo,atrim=0:" + total.toFixed(3) + ",volume='" + vol + "':eval=frame,afade=t=in:d=0.8,afade=t=out:st=" + (total - 1.8).toFixed(3) + ":d=1.8[bed];" +
    "[dia][bed]amix=inputs=2:duration=first:normalize=0,loudnorm=I=-15:TP=-1.5:LRA=11,aresample=48000[a]",
    "-map", "[v]", "-map", "[a]", "-t", total.toFixed(3), "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "20", "-preset", "medium", "-movflags", "+faststart", "-c:a", "aac", "-b:a", "160k", file], "clip");
  const loud = peak(file);
  if (!(loud > -30)) throw new Error(slug + " is silent (peak " + loud + " dB); never post a muted clip");

  // Stills: the payoff frame (the thumbs-up) under the title, for the feed and the story; the cover is its first frame.
  const frame = at("frame.jpg");
  ff(["-ss", Math.min(tl.end - 0.3, tl.cutB + 2.4).toFixed(3), "-i", take, "-frames:v", "1", "-vf", "crop=" + crop.join(":"), "-q:v", "2", frame], "still frame");
  const image = "data:image/jpeg;base64," + fs.readFileSync(frame).toString("base64");
  const still = { image, title: t.title, play: ui.play, ui, ratio: crop[1] / crop[0] };
  await layer(page, "still", Object.assign({ size: [1080, 1350] }, still), path.join(out, "feed", slug + ".jpg"));
  await layer(page, "still", Object.assign({ size: [1080, 1920] }, still), path.join(out, "story", slug + ".jpg"));
  ff(["-i", file, "-frames:v", "1", "-q:v", "3", path.join(out, "cover", slug + ".jpg")], "cover");
  fs.rmSync(tmp, { recursive: true, force: true });
  return { seconds: Math.round(total * 10) / 10, peak: loud, cut: [tl.cutA, tl.cutB].map((n) => Math.round(n * 100) / 100) };
}

function hhmm(min) { return String(Math.floor(min / 60)).padStart(2, "0") + ":" + String(min % 60).padStart(2, "0"); }
function minutes(s) { const [h, m] = s.split(":").map(Number); return h * 60 + m; }
function addDays(day, n) { const d = new Date(day + "T12:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }

function captionsFor(skit, lang, slug, date) {
  const t = skit.lang[lang];
  const ui = UI[lang];
  const post = { id: slug, cat: skit.cat, tags: skit.tags, lang };
  const link = (net) => pageFor(lang) + "?utm_source=" + net + "&utm_medium=social&utm_campaign=skits&utm_content=" + slug;
  const tags = (net) => tagLine(post, net, lang);
  return {
    date, cat: skit.cat, title: t.title, alt: t.alt, lang, voice: "gemini", textLang: lang, kind: "skit",
    linkedin: t.title + "\n\n" + t.body + "\n\n" + t.cta + ": " + link("linkedin") + "\n\n" + tags("linkedin"),
    x: t.title + "\n\n" + link("x") + "\n" + tags("x"),
    instagram: t.title + "\n\n" + t.body + "\n\n" + ui.bio + "\n\n" + tags("instagram"),
    facebook: t.title + "\n\n" + t.body + "\n\n" + link("facebook") + "\n\n" + tags("facebook"),
    tiktok: t.title + " " + t.cta + ". " + tags("tiktok"),
    youtubeTitle: (t.title.length > 88 ? t.title.slice(0, 87).replace(/\s+\S*$/, "") + "…" : t.title) + " #Shorts",
    youtube: t.body + "\n\n" + t.cta + ": " + link("youtube") + "\n\n" + tags("youtube")
  };
}

// The first calendar: a language a day from --start; scripts/social-calendar.js --write --batch then moves each post
// into a free lane 5 slot.
function writeBatch(skit, out, start) {
  const capFile = path.join(out, "captions.json");
  const old = fs.existsSync(capFile) ? JSON.parse(fs.readFileSync(capFile, "utf8")) : {};
  const captions = {};
  const rows = [];
  LANGS.forEach((lang, index) => {
    const slug = String(index + 1).padStart(2, "0") + "-" + skit.id + "-" + lang;
    if (!fs.existsSync(path.join(out, "feed", slug + ".jpg"))) return;
    const date = (old[slug] && old[slug].date) || addDays(start, index);
    captions[slug] = captionsFor(skit, lang, slug, date);
    Object.entries(WINDOWS).forEach(([channel, [a, b]]) => {
      const video = ["tiktok", "youtube"].includes(channel);
      rows.push([date, hhmm(Math.round((minutes(a) + (minutes(b) - minutes(a)) / 2) / 5) * 5), channel, slug,
        video ? "clip/" + slug + ".mp4" : channel === "instagram-story" ? "story/" + slug + ".jpg" : "feed/" + slug + ".jpg"].join(","));
    });
  });
  rows.sort();
  fs.writeFileSync(capFile, JSON.stringify(captions, null, 2) + "\n");
  fs.writeFileSync(path.join(out, "calendar.csv"), ["Date,Time,Channel,Post,Asset"].concat(rows).join("\n") + "\n");
  console.log("wrote", Object.keys(captions).length, "posts to", path.relative(ROOT, out));
}

(async () => {
  const opts = args();
  const skit = SKITS.find((s) => s.id === opts._[0]);
  if (!skit) throw new Error("name a skit: " + SKITS.map((s) => s.id).join(", "));
  const langs = opts.langs ? String(opts.langs).split(",") : LANGS;
  if (opts.prompts) {
    langs.forEach((lang) => {
      const take = "media/skits/raw/" + skit.id + "-" + lang + ".mp4";
      console.log("\n=== " + lang + (fs.existsSync(path.join(ROOT, take)) ? " (have it)" : "") + " -> " + take + "\n" + promptFor(skit, lang));
    });
    return;
  }
  const batch = opts.batch || "skits-" + skit.id;
  const out = path.join(ROOT, "media/social-posts", batch);
  const start = opts.start || addDays(new Date(Date.now() - 5 * 3600e3).toISOString().slice(0, 10), 2);
  if (!opts["captions-only"]) {
    ["clip", "cover", "story", "feed"].forEach((dir) => fs.mkdirSync(path.join(out, dir), { recursive: true }));
    const browser = await chromium.launch();
    const page = await browser.newPage({ deviceScaleFactor: 1 });
    await page.goto("file://" + path.join(__dirname, "frame.html"));
    await page.evaluate(() => document.fonts.ready);
    for (const lang of langs) {
      const index = LANGS.indexOf(lang);
      const slug = String(index + 1).padStart(2, "0") + "-" + skit.id + "-" + lang;
      if (!fs.existsSync(path.join(ROOT, "media/skits/raw", skit.id + "-" + lang + ".mp4"))) { console.log("no take yet:", lang); continue; }
      const done = await render(page, skit, lang, slug, out);
      console.log("rendered", slug, JSON.stringify(done));
    }
    await browser.close();
  }
  writeBatch(skit, out, start);
})().catch((error) => { console.error(error); process.exit(1); });
