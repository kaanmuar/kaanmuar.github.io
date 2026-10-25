#!/usr/bin/env node
/* Records the product part of a skit: the live URL Review page in the clip's language, a URL typed in, the
   run log streaming, the report filling in, then the finding the skit is about.

     node scripts/skits-studio/record.js friday-release [--langs en,es]

   The page is the deployed one; its Cloud Functions are answered here so nothing runs, nobody signs in, and no
   record is written: the session comes from functions/url-review-auth like the Playwright specs, and the report
   is the bundled sample (a real run) moved to the skit's example host with the skit's finding set.
   Writes media/skits/screen/<skit>-<lang>.mp4 (1000x1580) and .json with the times of each step. */

require("../playwright-sandbox");
const { chromium } = require("playwright");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");
const auth = require("../../functions/url-review-auth");
const sample = require("../../assets/qa-review-sample.json");
const { SKITS, LANGS, pageFor } = require("./skits");

const ROOT = path.resolve(__dirname, "../..");
const OUT = path.join(ROOT, "media/skits/screen");
const FFMPEG = fs.existsSync("/opt/homebrew/bin/ffmpeg") ? "/opt/homebrew/bin/ffmpeg" : "ffmpeg";
const VIEW = { width: 400, height: 632 };
const SCALE = 2.5;
const SIZE = { width: VIEW.width * SCALE, height: VIEW.height * SCALE };
const API = /us-central1-carlosm-interactive-cv\.cloudfunctions\.net\//;
const BLOCKED = /googletagmanager|google-analytics|ipwho\.is/;
const DEVICE = "d".repeat(64);
const TERMS = fs.readFileSync(path.join(ROOT, "js/qa-review.js"), "utf8").match(/TERMS_VERSION = "([^"]+)"/)[1];

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

// The sample run on carlosandmunoz.com, moved to the skit's host, with its broken-links check failing.
function reportFor(skit, lang) {
  const text = JSON.stringify(sample.report).split("carlosandmunoz.com").join(skit.host);
  const report = Object.assign(JSON.parse(text), { id: "5k1t" + skit.id.replace(/[^a-z]/g, "").slice(0, 8), fetchedAt: new Date().toISOString() });
  const finding = report.insights.findings.find((item) => item.key === "seo-broken-links");
  const paths = ["/summer-sale", "/help/returns"].slice(0, skit.broken);
  Object.assign(finding, {
    verdict: "fail", severity: "high", count: paths.length, pages: paths.map((p) => "https://" + skit.host + p),
    title: skit.lang[lang].finding,
    evidence: paths.join(" and ") + " answered 404 Not Found.",
    fix: "Fix or remove the links before the release."
  });
  const seo = report.insights.score.areas.SEO;
  Object.assign(seo, { fail: seo.fail + 1, pass: seo.pass - 1, score: seo.score - 12, grade: "B" });
  report.insights.score.totals.fail += 1;
  report.insights.score.totals.pass -= 1;
  report.insights.score.overall -= 3;
  report.findingId = finding.id;
  report.insights.findings.sort((a, b) => (a.verdict === "fail" ? 0 : 1) - (b.verdict === "fail" ? 0 : 1));
  return report;
}

const LOG = (host) => [
  "Checking the fields, the email domain, and that this is a browser.",
  "Fetching https://" + host + "/ and its robots.txt.",
  "Found 10 linked pages. Opening 3 in a headless browser.",
  "Checking every internal link for its status.",
  "Two links answered 404.",
  "Scoring SEO, GEO, analytics, security, accessibility and performance."
];

async function record(browser, skit, lang) {
  const store = auth.memoryStore();
  const started = await auth.startEmail(store, { email: "ana@example.com", deviceKey: DEVICE, ip: "1.1.1.1" });
  const signed = await auth.finishEmail(store, { id: started.id, code: started.code, deviceKey: DEVICE });
  const report = reportFor(skit, lang);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "skit-screen-"));
  const context = await browser.newContext({ viewport: VIEW, deviceScaleFactor: SCALE, colorScheme: "light", isMobile: true, hasTouch: true });
  // A visitor who picked the page's language: the language pages translate the form only after that choice.
  await context.addInitScript(({ terms, session, device, lang }) => {
    try {
      localStorage.setItem("cv-preferred-lang", lang);
      if (lang !== "en") localStorage.setItem("site-translate", "picked");
      sessionStorage.setItem("qa-review-terms", terms);
      localStorage.setItem("hasSeenReviewTour", "true");
      localStorage.setItem("qa-review-analytics", "necessary");
      localStorage.setItem("qa-review-session", JSON.stringify({ session, email: "ana@example.com", provider: "email" }));
      localStorage.setItem("qa-review-device-key", JSON.stringify(device));
    } catch (error) { /* storage is optional */ }
  }, { terms: TERMS, session: signed.session, device: DEVICE, lang });
  await context.route(BLOCKED, (route) => route.abort());
  await context.route(API, async (route) => {
    const req = route.request();
    const pathname = new URL(req.url()).pathname.replace(/^\/review(Url|Run)/, "");
    const cors = { "access-control-allow-origin": req.headers().origin || "*", "access-control-allow-credentials": "true", "access-control-allow-headers": "content-type" };
    if (req.method() === "OPTIONS") return route.fulfill({ status: 204, headers: Object.assign({ "access-control-allow-methods": "GET,POST" }, cors) });
    const body = req.postData() ? JSON.parse(req.postData()) : {};
    const json = (data, status = 200) => route.fulfill({ status, contentType: "application/json", headers: cors, body: JSON.stringify(data) });
    if (pathname === "/auth/session") {
      const checked = await auth.checkSession(store, Object.assign({}, body, { deviceKey: DEVICE }));
      return json(checked, checked.ok ? 200 : checked.status);
    }
    if (pathname === "/auth/providers") return json({ providers: [{ id: "email" }] });
    if (pathname === "/review") {
      await new Promise((r) => setTimeout(r, 2600));
      const lines = LOG(skit.host).map((text) => ({ type: "log", text })).concat({ type: "done", report, frameworks: sample.frameworks, paid: true });
      return route.fulfill({ status: 200, contentType: "application/x-ndjson", headers: cors, body: lines.map((l) => JSON.stringify(l)).join("\n") + "\n" });
    }
    return json({ items: [] });
  });

  const page = await context.newPage();
  await page.goto(pageFor(lang), { waitUntil: "load" });
  await page.waitForFunction(() => window.ReviewAuth && window.ReviewAuth.signedIn(), null, { timeout: 20000 });
  // The language pages translate the form through Google Translate after load.
  if (lang !== "en") await page.waitForFunction(() => /translated-/.test(document.documentElement.className), null, { timeout: 20000 }).catch(() => console.warn(lang + ": the page did not translate"));
  await page.waitForTimeout(lang === "en" ? 0 : 1200);
  await page.addStyleTag({ content: ".goog-te-spinner-pos, #goog-gt-tt, .goog-te-balloon-frame, [class^='VIpgJd-ZVi9od'] { display: none !important; }" });
  // Playwright's own video is drawn at CSS pixels; the screencast sends device pixels.
  const cdp = await context.newCDPSession(page);
  const frames = [];
  cdp.on("Page.screencastFrame", ({ data, sessionId }) => {
    const file = path.join(dir, String(frames.length).padStart(5, "0") + ".jpg");
    fs.writeFileSync(file, Buffer.from(data, "base64"));
    frames.push({ file, at: Date.now() / 1000 });
    cdp.send("Page.screencastFrameAck", { sessionId }).catch(() => {});
  });
  await cdp.send("Page.startScreencast", { format: "jpeg", quality: 92, maxWidth: SIZE.width, maxHeight: SIZE.height });
  const t0 = Date.now() / 1000;
  const marks = {};
  const mark = (name) => { marks[name] = Date.now() / 1000 - t0; };
  await page.evaluate(() => {
    const set = (id, v) => { const el = document.getElementById(id); el.value = v; el.dispatchEvent(new Event("input", { bubbles: true })); };
    set("name", "Ana");
    set("email", "ana@example.com");
    const own = document.querySelector('input[name="reasonCode"][value="own"]');
    if (own) { own.checked = true; own.dispatchEvent(new Event("change", { bubbles: true })); }
  });
  const url = page.locator("#url");
  await url.scrollIntoViewIfNeeded();
  await page.evaluate(() => window.scrollBy(0, -140));
  await page.waitForTimeout(700);
  mark("type");
  await url.click();
  await url.pressSequentially(skit.host, { delay: 85 });
  await page.waitForTimeout(400);
  mark("submit");
  await page.locator("#review-btn").scrollIntoViewIfNeeded();
  await page.locator("#review-btn").click();
  await page.locator("#run-log").scrollIntoViewIfNeeded().catch(() => {});
  await page.waitForFunction(() => /\S/.test((document.getElementById("share-link") || {}).textContent || ""), null, { timeout: 30000 });
  mark("report");
  await page.waitForTimeout(300);
  const dash = page.locator("#dashboard, .dashboard, #report").first();
  await dash.scrollIntoViewIfNeeded().catch(() => {});
  await page.waitForTimeout(1600);
  mark("scores");
  const finding = page.locator(".finding", { has: page.locator(".id", { hasText: new RegExp("^" + report.findingId + "$") }) }).first();
  // The report scrolls inside #dash-overlay, and the checks list folds after its first cards, so the skit taps
  // the finding's area chip (its fails come first) and eases the overlay until the card sits mid-screen.
  const ease = (selector, at) => page.locator(selector).first().evaluate((el, at) => new Promise((done) => {
    const box = document.getElementById("dash-overlay") || document.scrollingElement;
    const from = box.scrollTop;
    const to = from + el.getBoundingClientRect().top - innerHeight * at;
    const start = performance.now();
    const step = (now) => {
      const k = Math.min(1, (now - start) / 900);
      box.scrollTop = from + (to - from) * (1 - Math.pow(1 - k, 3));
      if (k < 1) requestAnimationFrame(step); else done();
    };
    requestAnimationFrame(step);
  }), at);
  await ease("#finding-filters", 0.3);
  await page.waitForTimeout(300);
  await page.locator('#finding-filters button[data-area="' + skit.area + '"]').first().click();
  await page.waitForTimeout(500);
  await finding.evaluate((el) => el.setAttribute("data-skit", "1"));
  await ease(".finding[data-skit]", 0.28);
  await page.waitForTimeout(200);
  await finding.evaluate((el) => { el.style.outline = "4px solid #e5484d"; el.style.outlineOffset = "4px"; el.style.borderRadius = "12px"; });
  mark("finding");
  await page.waitForTimeout(2200);
  mark("end");
  await cdp.send("Page.stopScreencast");
  await context.close();
  if (frames.length < 10) throw new Error("the screencast sent " + frames.length + " frames");
  // Frames come only when the page repaints: each 30 fps tick shows the last frame that had arrived.
  const seq = path.join(dir, "seq");
  fs.mkdirSync(seq);
  for (let k = 0, i = 0; k < Math.round(marks.end * 30); k += 1) {
    while (i + 1 < frames.length && frames[i + 1].at - t0 <= k / 30) i += 1;
    fs.linkSync(frames[i].file, path.join(seq, String(k).padStart(5, "0") + ".jpg"));
  }
  fs.mkdirSync(OUT, { recursive: true });
  const file = path.join(OUT, skit.id + "-" + lang + ".mp4");
  const run = spawnSync(FFMPEG, ["-y", "-loglevel", "error", "-framerate", "30", "-i", path.join(seq, "%05d.jpg"),
    "-vf", "scale=" + SIZE.width + ":" + SIZE.height + ":force_original_aspect_ratio=decrease,pad=" + SIZE.width + ":" + SIZE.height + ":(ow-iw)/2:0:white",
    "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "18", file]);
  if (run.status !== 0) throw new Error("ffmpeg failed: " + run.stderr);
  fs.writeFileSync(file.replace(/\.mp4$/, ".json"), JSON.stringify(marks, null, 1));
  fs.rmSync(dir, { recursive: true, force: true });
  console.log("recorded", path.relative(ROOT, file), JSON.stringify(marks));
}

(async () => {
  const opts = args();
  const skit = SKITS.find((s) => s.id === opts._[0]);
  if (!skit) throw new Error("name a skit: " + SKITS.map((s) => s.id).join(", "));
  const langs = opts.langs ? String(opts.langs).split(",") : LANGS;
  const browser = await chromium.launch();
  for (const lang of langs) await record(browser, skit, lang);
  await browser.close();
})().catch((error) => { console.error(error); process.exit(1); });
