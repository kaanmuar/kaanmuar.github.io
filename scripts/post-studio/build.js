#!/usr/bin/env node
/* Renders the QA-lab URL Review social kit: stills, carousels, reels, captions, Buffer CSVs.
   node scripts/post-studio/build.js [--langs en,es] [--posts talking,frameworks] [--skip-video]
     [--start 2026-10-19] [--batch launch-2026-10] [--image-base https://...] [--out dir] */

const fs = require("fs");
const path = require("path");
const { execFileSync, spawnSync } = require("child_process");
const { chromium } = require("playwright");
const sharp = require("sharp");
const studio = require("./posts");
const narration = require("../review-demo-lines");

const ROOT = path.resolve(__dirname, "../..");
const DEMOS = path.join(ROOT, "media/url-review-demos");
const FFMPEG = fs.existsSync("/opt/homebrew/bin/ffmpeg") ? "/opt/homebrew/bin/ffmpeg" : "ffmpeg";
const FFPROBE = fs.existsSync("/opt/homebrew/bin/ffprobe") ? "/opt/homebrew/bin/ffprobe" : "ffprobe";

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
const BATCH = opts.batch || "launch-2026-10";
const OUT = path.resolve(ROOT, opts.out || path.join("media/social-posts", BATCH));
const IMAGE_BASE = (opts["image-base"] || studio.SITE + "/media/social-posts/" + BATCH).replace(/\/$/, "");
const LANGS = opts.langs ? String(opts.langs).split(",") : studio.LANGS;
const POSTS = opts.posts ? studio.POSTS.filter((p) => String(opts.posts).split(",").includes(p.id)) : studio.POSTS;
const START = opts.start || "2026-10-19";
const SKIP_VIDEO = Boolean(opts["skip-video"]);

const HOOK = 2.6;
const END = 3.4;
const XFADE = 0.5;
const VOICE_LEAD = 0.45;
const MAX_SPEED = 3.2;
const CLIP = { x: 20, y: 660, w: 1040, h: 585 };
const CAPTION_BAND = { top: 1262, bottom: 1580 };

const CHANNEL_TIMES = { linkedin: "08:30", x: "09:15", instagram: "12:00", facebook: "13:00", tiktok: "18:00", youtube: "18:30", "instagram-reel": "19:00", carousel: "17:00" };

const FRAMEWORK_CASES = {
  Playwright: ["FN-01", "LK-01", "MB-01"], Cypress: ["FM-01", "VIS-01", "FN-01"], Robot: ["CT-01", "I18N-01", "PR-01"], Selenium: ["CMP-01", "LK-01", "RS-01"],
  WebdriverIO: ["A11Y-01", "MB-01", "SEO-01"], Appium: ["MB-01", "FM-01", "MED-01"], JMeter: ["LD-01", "PF-01", "API-01"], Gatling: ["LD-01", "PF-01", "RS-01"]
};
const EXPORT_CASES = ["FN-01", "SEC-01", "A11Y-01"];

function layersFor(lang) { return studio.LAYERS.map((l) => [l[0], l[1], l[2][lang]]); }
function layer(lang, id) { return layersFor(lang).find((l) => l[0] === id); }

function spec(post, lang, extra) {
  const tiles = post.tiles === "frameworks" ? studio.FRAMEWORK_TILES.map((t) => [t[0], t[1][lang]])
    : post.tiles === "exports" ? studio.EXPORT_TILES.map((t) => [t[0], t[1][lang], t[2]]) : [];
  return Object.assign({
    ui: studio.UI[lang], copy: post.copy[lang], art: post.art, layout: post.layout, cards: post.cards, marks: post.marks,
    bars: post.bars, layers: layersFor(lang), tileRows: tiles
  }, extra);
}

function speechFor(post, lang) {
  const [source, key] = post.clip.line;
  if (source === "LINES") return narration.LINES[key][lang];
  if (source === "EXPORTS") return narration.EXPORTS[key][lang];
  if (source === "FRAMEWORKS") return narration.framework(key, lang);
  if (source === "SCOPES") return narration.scope("scope-" + key, lang);
  throw new Error("Unknown narration source " + source);
}

function link(lang, channel, post) {
  const page = studio.SITE + studio.PAGES[lang];
  const utm = "utm_source=" + channel + "&utm_medium=social&utm_campaign=url-review-" + post.id + "&utm_content=" + lang;
  return page + (page.includes("?") ? "&" : "?") + utm;
}

function hashtags(post, lang, count) {
  const all = studio.BASE_TAGS[lang].slice(0, 3).concat(post.tags || []);
  return Array.from(new Set(all)).slice(0, count).join(" ");
}

function xLength(text) { return text.replace(/https?:\/\/\S+/g, "x".repeat(23)).length; }

function captions(post, lang) {
  const c = post.copy[lang];
  const ui = studio.UI[lang];
  const bullets = (mark) => c.bullets.map((b) => mark + " " + b).join("\n");
  const out = {};
  out.linkedin = [c.hook, c.body, bullets("→"), ui.included + "\n" + ui.honest, ui.cta + ": " + link(lang, "linkedin", post), hashtags(post, lang, 5)].join("\n\n");
  out.instagram = [c.hook, c.body, bullets("·"), ui.included, ui.cta + ". " + ui.bio, hashtags(post, lang, 5)].join("\n\n");
  out.facebook = [c.hook, c.body, ui.included, ui.cta + ": " + link(lang, "facebook", post)].join("\n\n");
  const xUrl = link(lang, "x", post);
  const xTries = [
    [c.hook, ui.included, xUrl + "\n" + hashtags(post, lang, 2)].join("\n\n"),
    [c.hook, ui.included, xUrl].join("\n\n"),
    [c.hook, xUrl].join("\n\n")
  ];
  out.x = xTries.find((t) => xLength(t) <= 280) || xTries[2];
  out.tiktok = [c.hook, ui.included, ui.cta + ". " + ui.bio, hashtags(post, lang, 5)].join("\n\n");
  let title = c.hook;
  if (title.length > 90) title = title.slice(0, 90).replace(/\s+\S*$/, "") + "…";
  out.youtubeTitle = title + " #Shorts";
  out.youtube = [c.body, ui.included, ui.price, ui.cta + ": " + link(lang, "youtube", post), ui.footnote, hashtags(post, lang, 3)].join("\n\n");
  out.story = ui.cta + " · " + link(lang, "instagram-story", post);
  return out;
}

function addBusinessDays(iso, n) {
  const d = new Date(iso + "T12:00:00Z");
  let left = n;
  while (left > 0) {
    d.setUTCDate(d.getUTCDate() + 1);
    const day = d.getUTCDay();
    if (day !== 0 && day !== 6) left -= 1;
  }
  return d.toISOString().slice(0, 10);
}

function csvCell(value) {
  const text = String(value == null ? "" : value);
  return /[",\n\r]/.test(text) ? '"' + text.replace(/"/g, '""') + '"' : text;
}
function writeCsv(file, header, rows) {
  const body = [header].concat(rows).map((r) => r.map(csvCell).join(",")).join("\r\n") + "\r\n";
  fs.writeFileSync(file, body, "utf8");
}

function probe(file) {
  return parseFloat(execFileSync(FFPROBE, ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", file]).toString());
}

function silences(file) {
  const run = spawnSync(FFMPEG, ["-hide_banner", "-i", file, "-af", "silencedetect=noise=-32dB:d=0.16", "-f", "null", "-"], { encoding: "utf8" });
  const text = run.stderr || "";
  const starts = Array.from(text.matchAll(/silence_start: ([\d.]+)/g)).map((m) => parseFloat(m[1]));
  const ends = Array.from(text.matchAll(/silence_end: ([\d.]+)/g)).map((m) => parseFloat(m[1]));
  return starts.map((s, i) => [s, ends[i] === undefined ? probe(file) : ends[i]]);
}

function chunks(speech) {
  const sentences = speech.split(/(?<=[.!?…])\s+/).filter(Boolean);
  const out = [];
  sentences.forEach((sentence) => {
    if (sentence.length <= 64) { out.push(sentence); return; }
    const parts = sentence.split(/(?<=[,;:])\s+/);
    let cur = "";
    parts.forEach((part) => {
      if (cur && (cur + " " + part).length > 64) { out.push(cur); cur = part; }
      else cur = cur ? cur + " " + part : part;
    });
    if (cur) out.push(cur);
  });
  return out;
}

function timeline(speech, wav) {
  const dur = probe(wav);
  const quiet = silences(wav);
  const head = quiet.length && quiet[0][0] <= 0.05 ? quiet[0][1] : 0;
  const tailGap = quiet.find((q) => q[1] >= dur - 0.05 && q[0] > head);
  const tail = tailGap ? tailGap[0] : dur;
  const pieces = chunks(speech);
  const total = pieces.reduce((n, p) => n + p.length, 0);
  const mids = quiet.filter((q) => q[0] > head && q[1] < tail).map((q) => (q[0] + q[1]) / 2);
  const bounds = [head];
  let acc = 0;
  pieces.slice(0, -1).forEach((p) => {
    acc += p.length;
    const ideal = head + (tail - head) * (acc / total);
    const near = mids.reduce((best, m) => Math.abs(m - ideal) < Math.abs(best - ideal) ? m : best, ideal);
    const prev = bounds[bounds.length - 1];
    bounds.push(Math.abs(near - ideal) <= 0.9 && near > prev + 0.4 ? near : Math.max(ideal, prev + 0.4));
  });
  bounds.push(tail + 0.25);
  return { dur, items: pieces.map((text, i) => ({ text, from: bounds[i], to: bounds[i + 1] })) };
}

async function shoot(page, s, file, opts2) {
  const size = s.mode === "caption" ? [1080, 400] : s.size === "landscape" ? [1600, 900] : s.size === "story" || s.size === "video" ? [1080, 1920] : [1080, 1350];
  await page.setViewportSize({ width: size[0], height: size[1] });
  const box = await page.evaluate((x) => window.render(x), s);
  const png = s.mode === "vframe"
    ? await page.screenshot({ clip: { x: 0, y: 0, width: 1080, height: 1920 }, omitBackground: true })
    : await page.locator("#c").screenshot({ omitBackground: s.mode === "caption" });
  if (file.endsWith(".jpg")) await sharp(png).jpeg({ quality: (opts2 && opts2.quality) || 90, mozjpeg: true }).toFile(file);
  else fs.writeFileSync(file, png);
  return box;
}

async function pdfFrom(browser, images, file) {
  const html = "<!doctype html><html><head><style>@page{size:1080px 1350px;margin:0}html,body{margin:0}img{display:block;width:1080px;height:1350px;page-break-after:always}</style></head><body>" +
    images.map((img) => '<img src="' + path.basename(img) + '">').join("") + "</body></html>";
  const tmp = path.join(path.dirname(file), ".pdf-" + path.basename(file, ".pdf") + ".html");
  fs.writeFileSync(tmp, html);
  const page = await browser.newPage();
  await page.goto("file://" + tmp);
  await page.waitForFunction(() => Array.from(document.images).every((i) => i.complete));
  await page.pdf({ path: file, width: "1080px", height: "1350px", printBackground: true });
  await page.close();
  fs.unlinkSync(tmp);
}

function carouselItems(post, lang) {
  if (post.carousel === "frameworks") {
    return studio.FRAMEWORK_TILES.map((t, i) => ({ kind: "framework", index: String(i + 1).padStart(2, "0") + " / 08", name: t[0], tag: t[1][lang], cases: FRAMEWORK_CASES[t[0]].map((id) => layer(lang, id)) }));
  }
  if (post.carousel === "exports") {
    return studio.EXPORT_TILES.map((t, i) => ({ kind: "export", index: String(i + 1).padStart(2, "0") + " / 08", name: t[0], tag: t[1][lang], ext: t[2], cases: EXPORT_CASES.map((id) => layer(lang, id)) }));
  }
  const all = layersFor(lang);
  const items = [];
  for (let i = 0; i < all.length; i += 2) {
    items.push({ kind: "layers", index: String(i + 1).padStart(2, "0") + "–" + String(i + 2).padStart(2, "0") + " / 20", pair: all.slice(i, i + 2) });
  }
  return items;
}

function videoFor(post, lang, voice, files) {
  const speech = speechFor(post, lang);
  const wav = path.join(DEMOS, "voices", post.clip.picture + "__" + lang + "-" + voice + ".wav");
  const picture = path.join(DEMOS, "pictures", post.clip.picture + ".mp4");
  const tl = timeline(speech, wav);
  const main = tl.dur + VOICE_LEAD + 1.0;
  const picDur = probe(picture);
  const speed = Math.min(MAX_SPEED, Math.max(1, picDur / main));
  const total = HOOK + main + END - 2 * XFADE;
  const voiceAt = HOOK - XFADE + VOICE_LEAD;
  const fps = 30;

  const inputs = ["-loop", "1", "-framerate", String(fps), "-t", String(HOOK), "-i", files.hook,
    "-i", picture,
    "-loop", "1", "-framerate", String(fps), "-t", main.toFixed(3), "-i", files.frame];
  files.captions.forEach((cap) => inputs.push("-loop", "1", "-framerate", String(fps), "-t", main.toFixed(3), "-i", cap.file));
  const endIndex = 3 + files.captions.length;
  inputs.push("-loop", "1", "-framerate", String(fps), "-t", String(END), "-i", files.end);
  inputs.push("-i", wav, "-stream_loop", "-1", "-i", path.join(DEMOS, "bed.wav"));
  const voiceIndex = endIndex + 1;
  const bedIndex = endIndex + 2;

  const zoom = (index, dur, label, from, to) =>
    "[" + index + ":v]scale=2160:3840,zoompan=z='" + from + "+" + (to - from) + "*on/" + Math.round(dur * fps) + "':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=1:s=1080x1920:fps=" + fps + ",format=yuv420p,setsar=1,settb=AVTB[" + label + "]";
  const graph = [
    zoom(0, HOOK, "hook", 1.0, 1.07),
    "[1:v]setpts=PTS/" + speed.toFixed(4) + ",fps=" + fps + ",scale=" + CLIP.w + ":" + CLIP.h + ",tpad=stop_mode=clone:stop_duration=" + main.toFixed(3) + ",trim=duration=" + main.toFixed(3) + ",setpts=PTS-STARTPTS[clip]",
    "color=c=0x050c0f:s=1080x1920:r=" + fps + ":d=" + main.toFixed(3) + "[bg]",
    "[bg][clip]overlay=" + CLIP.x + ":" + CLIP.y + "[m0]",
    "[m0][2:v]overlay=0:0[m1]"
  ];
  let last = "m1";
  files.captions.forEach((cap, i) => {
    const from = (VOICE_LEAD + cap.from).toFixed(3);
    const to = (VOICE_LEAD + cap.to).toFixed(3);
    const y = Math.round((CAPTION_BAND.top + CAPTION_BAND.bottom) / 2 - cap.height / 2);
    graph.push("[" + last + "][" + (3 + i) + ":v]overlay=0:" + y + ":enable='between(t," + from + "," + to + ")'[c" + i + "]");
    last = "c" + i;
  });
  graph.push("[" + last + "]format=yuv420p,setsar=1,settb=AVTB[main]");
  graph.push(zoom(endIndex, END, "end", 1.06, 1.0));
  graph.push("[hook][main]xfade=transition=smoothup:duration=" + XFADE + ":offset=" + (HOOK - XFADE).toFixed(3) + "[v1]");
  graph.push("[v1][end]xfade=transition=fade:duration=" + XFADE + ":offset=" + (HOOK + main - 2 * XFADE).toFixed(3) + "[v]");
  const delay = Math.round(voiceAt * 1000);
  graph.push("[" + voiceIndex + ":a]aformat=sample_rates=48000:channel_layouts=stereo,adelay=" + delay + "|" + delay + ",apad[va]");
  graph.push("[" + bedIndex + ":a]aformat=sample_rates=48000:channel_layouts=stereo,volume=0.16,afade=t=in:d=1.2,afade=t=out:st=" + (total - 1.6).toFixed(3) + ":d=1.6[ba]");
  graph.push("[va][ba]amix=inputs=2:duration=first:normalize=0,atrim=0:" + total.toFixed(3) + ",loudnorm=I=-15:TP=-1.5:LRA=11,aresample=48000[a]");

  const run = spawnSync(FFMPEG, ["-y", "-hide_banner", "-loglevel", "error"].concat(inputs, [
    "-filter_complex", graph.join(";"), "-map", "[v]", "-map", "[a]", "-t", total.toFixed(3),
    "-c:v", "libx264", "-preset", "medium", "-crf", "20", "-pix_fmt", "yuv420p", "-r", String(fps),
    "-c:a", "aac", "-b:a", "160k", "-movflags", "+faststart", files.out]), { encoding: "utf8" });
  if (run.status !== 0) throw new Error("ffmpeg failed for " + files.out + "\n" + run.stderr);
  return { total, speed };
}

function community(lang) {
  if (lang !== "en") return;
  const dir = path.join(OUT, "community");
  fs.mkdirSync(dir, { recursive: true });
  const L = layersFor("en");
  const url = (source) => studio.SITE + "/qa-review.html?utm_source=" + source + "&utm_medium=community&utm_campaign=url-review-launch&utm_content=en";
  const list = L.map((l) => "- **" + l[2] + "** (`" + l[0] + "`): " + l[1]).join("\n");

  fs.writeFileSync(path.join(dir, "devto-en.md"), [
    "<!-- Before publishing: DEV does not allow AI-assisted articles that promote your own product (dev.to/guidelines-for-ai-assisted-articles-on-dev). Rewrite this in your own words and keep the closing plug to one or two sentences, or keep the text, add an AI-assistance note, and delete the disclosure paragraph with the link. -->",
    "",
    "---",
    "title: 20 kinds of test cases a public page already tells you about",
    "published: false",
    "description: A checklist for the first read of a page you have never tested, with one example case per kind.",
    "tags: testing, qa, webdev, a11y",
    "---",
    "",
    "Before anyone writes a single automated test, a public page has already told you a lot: what it answers over https, which links it exposes, whether its fields have labels, which headers it sends, how long the document takes to arrive.",
    "",
    "Most first test plans stop at \"the happy path works\". Here is the list I use instead when I read a page for the first time. Each kind has one example case, written the way I would hand it to a team.",
    "",
    list,
    "",
    "## How to use the list",
    "",
    "1. Read the public response first: status, headers, the HTML that arrives before any script runs.",
    "2. Follow the same-host links you can see, a couple of levels deep, and note what each one answers.",
    "3. Keep only the kinds you will actually run. A list nobody runs is worse than a short one.",
    "4. Name the tool for each case (Playwright, Cypress, Robot, Selenium, WebdriverIO, Appium, JMeter, Gatling, axe-core, Lighthouse, k6) so the case is ready to become code.",
    "5. Treat security headers as signals, not proof. A missing header is a question for the owner, not a finding of a break-in.",
    "",
    "## What this list is not",
    "",
    "It is not a certification and not a penetration test. Reading a public page does not sign in, submit forms, or generate load, so anything behind a login or under real traffic still needs its own plan.",
    "",
    "---",
    "",
    "*Disclosure: I built [QA-lab URL Review](" + url("devto") + "), which reads a public https page and proposes these cases for you, named for the framework your team uses. It does not run them. The first review is included (20 pages, 2 links deep); keeping, downloading, or sharing the report starts at 19 USD.*",
    ""
  ].join("\n"));

  fs.writeFileSync(path.join(dir, "reddit-en.md"), [
    "<!-- Both subreddits forbid promoting tools: r/QualityAssurance rule 1 is \"No product advertising\", and r/softwaretesting forbids links to commercial testing tools and names offenders in a pinned thread. These are discussion posts only: no link, no product name. If someone asks what you use, say you built a tool for it, without a link. Re-read the rules before posting; mods change them. -->",
    "",
    "# r/QualityAssurance",
    "",
    "**Title:** What do you check first when you are handed a public page you have never tested?",
    "",
    "I have been writing down the first-read checklist I use on an unfamiliar site, and it ended up as 20 kinds of cases: functional, content, links, forms, accessibility, security headers, privacy, SEO, performance, load, mobile, internationalization, resilience, compatibility, media, analytics, commerce, visual, platform, and API.",
    "",
    "Three examples of how I phrase them:",
    "",
    "- `SEC-01` HTTPS is the only way in",
    "- `A11Y-01` Images expose a text alternative",
    "- `RS-01` A missing path returns a deliberate not-found page",
    "",
    "Which kinds do you always cover, and which ones do you think are noise on a first pass?",
    "",
    "---",
    "",
    "# r/softwaretesting",
    "",
    "**Title:** A 20-kind checklist for the first read of a public web page (feedback welcome)",
    "",
    "Sharing the checklist I start from before writing automation for a site I do not know yet:",
    "",
    list,
    "",
    "What would you add or drop?",
    ""
  ].join("\n"));

  fs.writeFileSync(path.join(dir, "mot-en.md"), [
    "<!-- The Club welcomes tool vendors who say who they are and why they want feedback (club.ministryoftesting.com/guidelines); other self-promotion belongs only in Blogs, Books, Videos & Audio. A new account opening with a product post is the usual removal trigger, so answer a few questions there for a week or two first. -->",
    "",
    "# Ministry of Testing Club: feedback request",
    "",
    "**Category:** Discussions, tags: tools, automation",
    "",
    "**Title:** Feedback wanted: proposing test cases from a public read of a page",
    "",
    "Hi all, I am Carlos, a senior QA and program consultant in Colombia. I built QA-lab URL Review: you paste a public https address, it reads the response and the same-host links (20 pages, 2 links deep on the included review), and it proposes test cases across 20 kinds, named for Playwright, Cypress, Robot, Selenium, WebdriverIO, Appium, JMeter, or Gatling.",
    "",
    "What it deliberately does not do: run the cases, sign in, submit forms, or generate load. Security headers are reported as signals, not proof, and the report is not a certification.",
    "",
    "I would value this community's eye on three things:",
    "",
    "1. Are the 20 kinds the right split, or would you merge or add any?",
    "2. Is a proposed case list useful on its own, or only once it is exported to Jira with Xray, TestRail, Zephyr, or Azure DevOps?",
    "3. Where does a first-read list like this fit in your process: before a release, on an inherited site, or somewhere else?",
    "",
    "Link, if you want to try it on a site you are allowed to review: " + url("ministry-of-testing"),
    "",
    "Thanks for any feedback, including \"this is not useful because…\".",
    ""
  ].join("\n"));
}

function gallery(manifest) {
  const esc = (t) => String(t).replace(/[&<>"]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[ch]));
  const langs = Object.keys(manifest);
  const sections = langs.map((lang) => '<section id="' + lang + '"><h2>' + lang.toUpperCase() + "</h2>" + manifest[lang].map((m) => {
    const media = ['<img src="' + m.portrait + '" alt="">', '<img src="' + m.landscape + '" alt="">', '<img src="' + m.story + '" alt="">']
      .concat(m.reel ? ['<video src="' + m.reel + '" controls preload="none" poster="' + m.reelCover + '"></video>'] : [])
      .concat((m.slides || []).map((s) => '<img src="' + s + '" alt="">')).join("");
    const caps = Object.entries(m.captions).map(([k, v]) => '<details><summary>' + esc(k) + ' <button data-copy>Copy</button></summary><textarea readonly>' + esc(v) + "</textarea></details>").join("");
    return '<article><h3>' + esc(m.id) + "</h3>" + (m.pdf ? '<p><a href="' + m.pdf + '">Carousel PDF for LinkedIn</a></p>' : "") + '<div class="media">' + media + '</div><div class="caps">' + caps + "</div></article>";
  }).join("") + "</section>").join("");
  const nav = langs.map((l) => '<a href="#' + l + '">' + l.toUpperCase() + "</a>").join("");
  fs.writeFileSync(path.join(OUT, "index.html"), '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="robots" content="noindex"><title>QA-lab URL Review social kit</title><style>' +
    "body{margin:0;font:15px/1.5 Inter,system-ui,sans-serif;background:#050c0f;color:#eef6f7}header{position:sticky;top:0;background:#0a1a1fee;padding:14px 24px;display:flex;gap:16px;align-items:center;border-bottom:1px solid #1c3a40;z-index:2}header a{color:#7ef6fb}main{padding:24px}" +
    "article{border:1px solid #1c3a40;border-radius:16px;padding:18px;margin:0 0 24px;background:#0a1a1f}.media{display:flex;gap:10px;overflow-x:auto;padding-bottom:8px}.media img,.media video{height:320px;border-radius:10px;flex:none}" +
    "details{margin:6px 0}summary{cursor:pointer;color:#e2c48a}textarea{width:100%;min-height:140px;background:#050c0f;color:#eef6f7;border:1px solid #1c3a40;border-radius:8px;padding:10px;font:13px/1.45 'Fira Code',monospace}button{margin-left:8px;background:#0d6e76;color:#fff;border:0;border-radius:999px;padding:2px 12px;cursor:pointer}" +
    "</style></head><body><header><strong>QA-lab URL Review · social kit · " + esc(BATCH) + "</strong>" + nav + '<a href="buffer/">Buffer CSVs</a><a href="calendar.csv">calendar.csv</a><a href="community/">Community drafts</a></header><main>' + sections +
    "</main><script>document.addEventListener('click',function(e){var b=e.target.closest('[data-copy]');if(!b)return;e.preventDefault();var t=b.closest('details').querySelector('textarea');navigator.clipboard.writeText(t.value).then(function(){b.textContent='Copied';setTimeout(function(){b.textContent='Copy'},1200)})});</script></body></html>");
}

async function main() {
  fs.mkdirSync(path.join(OUT, "buffer"), { recursive: true });
  const browser = await chromium.launch({ channel: "chromium" });
  const page = await browser.newPage({ deviceScaleFactor: 1 });
  await page.goto("file://" + path.join(__dirname, "frame.html"));
  await page.waitForFunction(() => typeof window.render === "function");

  const manifest = {};
  const calendar = [];
  for (const lang of LANGS) {
    const dir = path.join(OUT, lang);
    const tmp = path.join(OUT, ".work", lang);
    fs.mkdirSync(dir, { recursive: true });
    fs.mkdirSync(tmp, { recursive: true });
    manifest[lang] = [];
    const buffer = { linkedin: [], instagram: [], facebook: [], x: [] };

    for (const post of POSTS) {
      const index = studio.POSTS.indexOf(post);
      const date = addBusinessDays(START, index);
      const base = spec(post, lang, {});
      const rel = (name) => lang + "/" + post.id + "-" + name;
      const file = (name) => path.join(OUT, rel(name));
      const entry = { id: post.id, portrait: rel("portrait.jpg"), landscape: rel("landscape.jpg"), story: rel("story.jpg") };

      await shoot(page, Object.assign({}, base, { mode: "still", size: "portrait" }), file("portrait.jpg"));
      await shoot(page, Object.assign({}, base, { mode: "still", size: "landscape" }), file("landscape.jpg"));
      await shoot(page, Object.assign({}, base, { mode: "still", size: "story" }), file("story.jpg"));

      if (post.carousel) {
        const slides = [];
        const cover = file("carousel-01.jpg");
        await shoot(page, Object.assign({}, base, { mode: "still", size: "slide", swipe: true }), cover);
        slides.push(cover);
        const items = carouselItems(post, lang);
        for (let i = 0; i < items.length; i += 1) {
          const out = file("carousel-" + String(i + 2).padStart(2, "0") + ".jpg");
          await shoot(page, Object.assign({}, base, { mode: "item", size: "slide", item: items[i] }), out);
          slides.push(out);
        }
        const last = file("carousel-" + String(items.length + 2).padStart(2, "0") + ".jpg");
        await shoot(page, Object.assign({}, base, { mode: "end", size: "slide" }), last);
        slides.push(last);
        await pdfFrom(browser, slides, file("carousel.pdf"));
        entry.slides = slides.map((s) => path.relative(OUT, s));
        entry.pdf = rel("carousel.pdf");
      }

      const caps = captions(post, lang);
      entry.captions = caps;
      fs.writeFileSync(file("captions.json"), JSON.stringify(caps, null, 2));

      if (!SKIP_VIDEO) {
        const voice = index % 2 === 0 ? "w" : "m";
        const hookPng = path.join(tmp, post.id + "-hook.png");
        const framePng = path.join(tmp, post.id + "-frame.png");
        const endPng = path.join(tmp, post.id + "-end.png");
        await shoot(page, Object.assign({}, base, { mode: "hook", size: "video" }), hookPng);
        await shoot(page, Object.assign({}, base, { mode: "vframe", size: "video" }), framePng);
        await shoot(page, Object.assign({}, base, { mode: "end", size: "video" }), endPng);
        const wav = path.join(DEMOS, "voices", post.clip.picture + "__" + lang + "-" + voice + ".wav");
        const tl = timeline(speechFor(post, lang), wav);
        const capFiles = [];
        for (let i = 0; i < tl.items.length; i += 1) {
          const capFile = path.join(tmp, post.id + "-cap-" + i + ".png");
          const box = await shoot(page, { mode: "caption", text: tl.items[i].text }, capFile);
          capFiles.push({ file: capFile, from: tl.items[i].from, to: tl.items[i].to, height: box.height });
        }
        const res = videoFor(post, lang, voice, { hook: hookPng, frame: framePng, end: endPng, captions: capFiles, out: file("reel.mp4") });
        await sharp(hookPng).jpeg({ quality: 88, mozjpeg: true }).toFile(file("reel-cover.jpg"));
        entry.reel = rel("reel.mp4");
        entry.reelCover = rel("reel-cover.jpg");
        console.log("  reel", lang, post.id, res.total.toFixed(1) + "s", "clip x" + res.speed.toFixed(2));
      } else if (fs.existsSync(file("reel.mp4"))) {
        entry.reel = rel("reel.mp4");
        entry.reelCover = rel("reel-cover.jpg");
      }

      const img = (name) => IMAGE_BASE + "/" + rel(name);
      buffer.linkedin.push([caps.linkedin, img("portrait.jpg"), "url-review", date + " " + CHANNEL_TIMES.linkedin]);
      buffer.instagram.push([caps.instagram, img("portrait.jpg"), "url-review", date + " " + CHANNEL_TIMES.instagram]);
      buffer.facebook.push([caps.facebook, img("portrait.jpg"), "url-review", date + " " + CHANNEL_TIMES.facebook]);
      buffer.x.push([caps.x, img("landscape.jpg"), "url-review", date + " " + CHANNEL_TIMES.x]);

      const cal = (time, channel, format, asset, how, caption) => calendar.push([date, time, channel, lang, post.id, format, asset, how, caption]);
      cal(CHANNEL_TIMES.linkedin, "LinkedIn", "Image 1080x1350", entry.portrait, "Buffer CSV", "linkedin");
      cal(CHANNEL_TIMES.x, "X", "Image 1600x900", entry.landscape, "Buffer CSV", "x");
      cal(CHANNEL_TIMES.instagram, "Instagram feed", "Image 1080x1350", entry.portrait, "Buffer CSV", "instagram");
      cal(CHANNEL_TIMES.facebook, "Facebook", "Image 1080x1350", entry.portrait, "Buffer CSV", "facebook");
      cal(CHANNEL_TIMES.instagram, "Instagram story", "Image 1080x1920", entry.story, "Buffer composer, add link sticker", "story");
      if (entry.reel) {
        cal(CHANNEL_TIMES.tiktok, "TikTok", "Video 1080x1920", entry.reel, "Buffer composer, upload video", "tiktok");
        cal(CHANNEL_TIMES.youtube, "YouTube Shorts", "Video 1080x1920", entry.reel, "Buffer composer, title from youtubeTitle", "youtube");
        cal(CHANNEL_TIMES["instagram-reel"], "Instagram Reels", "Video 1080x1920", entry.reel, "Buffer composer, cover reel-cover.jpg", "instagram");
      }
      if (entry.pdf) {
        cal(CHANNEL_TIMES.carousel, "LinkedIn", "PDF carousel", entry.pdf, "Buffer composer, attach PDF", "linkedin");
        cal(CHANNEL_TIMES.carousel, "Instagram feed", "Carousel " + entry.slides.length + " slides", entry.slides[0].replace("-01.jpg", "-NN.jpg"), "Buffer composer, add slides in order", "instagram");
      }
      manifest[lang].push(entry);
      console.log("done", lang, post.id);
    }

    Object.entries(buffer).forEach(([channel, rows]) => {
      writeCsv(path.join(OUT, "buffer", "buffer-" + channel + "-" + lang + ".csv"), ["Text", "Image URL", "Tags", "Posting Time"], rows.slice(0, 10));
    });
    community(lang);
  }

  calendar.sort((a, b) => (a[0] + a[1] + a[3]).localeCompare(b[0] + b[1] + b[3]));
  writeCsv(path.join(OUT, "calendar.csv"), ["Date", "Time", "Channel", "Language", "Post", "Format", "Asset", "How", "Caption key"], calendar);
  gallery(manifest);
  fs.rmSync(path.join(OUT, ".work"), { recursive: true, force: true });
  await browser.close();
  console.log("Kit written to " + path.relative(ROOT, OUT));
}

main().catch((err) => { console.error(err); process.exit(1); });
