#!/usr/bin/env node
/*
 * The Mac's part of the rescue of failed URL reviews (#3080). From Google's network most bot walls refuse every reader,
 * while this Mac's home connection reads the same sites, so the cloud queues those rescues (url_review_rescues with
 * status mac-wanted, functions/url-review-rescue.js) and this script reviews each one here, with the review's own code:
 *
 *   mac-plain           the review as the cloud runs it, from this connection, with this Mac's Chrome for the browser pass
 *   mac-chrome-headers  the same, with a person's Chrome headers on the plain requests
 *   mac-chrome-window   the same, and a Chrome window, launched with nothing attached so the challenge sees a person's
 *                       browser, clears the start page before the review reads it; the window is minimized (off-screen on
 *                       a retry) and never takes focus
 *
 * An asker's report is held on the review desk like any re-run, a sweep's is saved as swept (with no owner notice), and
 * the step that worked is kept in url_review_read_hints. Firestore is read and written with this Mac's gcloud sign-in.
 *
 *   node scripts/review-rescue.js             takes up to MAC_PROMISED_PER_HOUR promised rescues, then MAC_PER_RUN others
 *   node scripts/review-rescue.js --promised  the hourly run: only the promised ones, silent when there are none
 *   node scripts/review-rescue.js --dry       lists them and the step each would start with
 *   node scripts/review-rescue.js <url>    runs the ladder on one address and saves nothing
 *
 * scripts/fix-review-failures.sh runs it every day after the fix pass.
 */
require("./playwright-sandbox");
const { execFileSync } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");

process.env.CHROME_PATH = process.env.CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const core = require("../functions/url-review-core");
const failures = require("../functions/url-review-failures");
const rescue = require("../functions/url-review-rescue");
const sweep = require("../functions/url-review-sweep");
const browserPass = require("../functions/url-review-browser");

const PROJECT = "carlosm-interactive-cv";
const BASE = "https://firestore.googleapis.com/v1/projects/" + PROJECT + "/databases/(default)/documents";
const REVIEW_MS = 300000;
const WINDOW_WAIT_MS = 20000;
const WINDOW_MORE_MS = 15000;
const CHALLENGE = /just a moment|un momento|checking your browser|attention required|challenge-platform|captcha-delivery|px-captcha|_incapsula_resource/i;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const clip = (value, max) => String(value == null ? "" : value).replace(/\s+/g, " ").trim().slice(0, max);

let token = "";
const signIn = () => { token = execFileSync("gcloud", ["auth", "print-access-token"]).toString().trim(); };

async function call(method, where, body) {
  const res = await fetch(BASE + where, {
    method,
    headers: { Authorization: "Bearer " + token, "Content-Type": "application/json", "x-goog-user-project": PROJECT },
    body: body ? JSON.stringify(body) : undefined
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 404 && method === "GET") return null;
  if (!res.ok) throw new Error("Firestore " + method + " " + where.split("?")[0] + " answered " + res.status + ": " + clip(data.error && data.error.message, 200));
  return data;
}

function encode(value) {
  if (value === null || value === undefined || (typeof value === "number" && !isFinite(value))) return { nullValue: null };
  if (value instanceof Date) return { timestampValue: value.toISOString() };
  if (typeof value === "boolean") return { booleanValue: value };
  if (typeof value === "number") return Number.isSafeInteger(value) ? { integerValue: String(value) } : { doubleValue: value };
  if (typeof value === "string") return { stringValue: value };
  if (Array.isArray(value)) return { arrayValue: { values: value.filter((item) => item !== undefined).map(encode) } };
  return { mapValue: { fields: fieldsOf(value) } };
}
const fieldsOf = (obj) => Object.fromEntries(Object.entries(obj || {}).filter(([, value]) => value !== undefined).map(([key, value]) => [key, encode(value)]));

function decode(value) {
  if (!value) return null;
  if ("stringValue" in value) return value.stringValue;
  if ("integerValue" in value) return Number(value.integerValue);
  if ("doubleValue" in value) return value.doubleValue;
  if ("booleanValue" in value) return value.booleanValue;
  if ("timestampValue" in value) return value.timestampValue;
  if ("arrayValue" in value) return (value.arrayValue.values || []).map(decode);
  if ("mapValue" in value) return Object.fromEntries(Object.entries(value.mapValue.fields || {}).map(([key, item]) => [key, decode(item)]));
  return null;
}
const docOf = (doc) => Object.assign({ id: doc.name.split("/").pop() }, decode({ mapValue: { fields: doc.fields || {} } }));

async function queued(limit) {
  const rows = await call("POST", ":runQuery", { structuredQuery: {
    from: [{ collectionId: "url_review_rescues" }],
    where: { fieldFilter: { field: { fieldPath: "status" }, op: "EQUAL", value: { stringValue: "mac-wanted" } } },
    limit
  } });
  return rows.filter((row) => row.document).map((row) => docOf(row.document));
}
const read = async (where) => { const doc = await call("GET", "/" + where); return doc ? docOf(doc) : null; };
const write = (where, obj) => call("PATCH", "/" + where, { fields: fieldsOf(obj) });
const update = (where, obj) => call("PATCH", "/" + where + "?" + Object.keys(obj).map((key) => "updateMask.fieldPaths=" + encodeURIComponent(key)).join("&"), { fields: fieldsOf(obj) });
const add = async (collection, obj) => (await call("POST", "/" + collection, { fields: fieldsOf(obj) })).name.split("/").pop();

// One call on Chrome's browser-level DevTools socket, which attaches to no page, so the challenge never sees it.
function devtools(socketUrl, method, params) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(socketUrl);
    const timer = setTimeout(() => { ws.close(); reject(new Error(method + " got no answer")); }, 10000);
    ws.addEventListener("open", () => ws.send(JSON.stringify({ id: 1, method, params })));
    ws.addEventListener("message", (event) => {
      const msg = JSON.parse(event.data);
      if (msg.id !== 1) return;
      clearTimeout(timer);
      ws.close();
      if (msg.error) reject(new Error(method + ": " + msg.error.message));
      else resolve(msg.result);
    });
    ws.addEventListener("error", () => { clearTimeout(timer); reject(new Error(method + " could not reach Chrome")); });
  });
}

// Where the window opens. Carlos never sees it and it never takes focus: LaunchServices starts Chrome in the background with no
// window, and the page opens in a background window. Cloudflare cleared every time off-screen, but only some of the time
// in a window minimized from the start (#3080), so minimized goes first and off-screen is the retry.
const PLACES = {
  minimized: { windowState: "minimized", left: 0, top: 0, width: 1280, height: 800 },
  "off-screen": { windowState: "normal", left: -3000, top: -3000, width: 1280, height: 800 }
};
// A background window is not throttled, so the challenge's timers run as in a window in front.
const AWAKE = ["--disable-background-timer-throttling", "--disable-backgrounding-occluded-windows", "--disable-renderer-backgrounding"];

// A Chrome started with nothing attached, so the challenge runs in a person's browser; the review attaches once it has had
// its time. Returns a browser pass result shaped like the cloud's start page, or null.
async function windowRead(url, say, place) {
  const puppeteer = require(require.resolve("puppeteer-core", { paths: [path.join(__dirname, "../functions")] }));
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "review-rescue-"));
  const port = 9500 + Math.floor(Math.random() * 400);
  let browser = null;
  try {
    execFileSync("open", ["-g", "-n", "-a", path.resolve(process.env.CHROME_PATH, "../../.."), "--args", "--user-data-dir=" + dir, "--remote-debugging-port=" + port,
      "--no-first-run", "--no-default-browser-check", "--no-startup-window"].concat(AWAKE));
    let version = null;
    for (let tries = 0; tries < 60 && !version; tries += 1) {
      await sleep(250);
      version = await fetch("http://127.0.0.1:" + port + "/json/version").then((res) => res.json()).catch(() => null);
    }
    if (!version) throw new Error("Chrome did not open its DevTools port");
    await devtools(version.webSocketDebuggerUrl, "Target.createTarget", Object.assign({ url, newWindow: true, background: true }, PLACES[place]));
    say("Opened " + url + " in a Chrome window " + place + ", with nothing attached; waiting " + WINDOW_WAIT_MS / 1000 + " s for any challenge to clear.");
    await sleep(WINDOW_WAIT_MS);
    browser = await puppeteer.connect({ browserURL: "http://127.0.0.1:" + port, defaultViewport: null });
    const page = (await browser.pages()).find((tab) => /^https?:/.test(tab.url())) || (await browser.pages())[0];
    const until = Date.now() + WINDOW_MORE_MS;
    let html = await page.content().catch(() => "");
    while (CHALLENGE.test(((await page.title().catch(() => "")) + " " + html).slice(0, 8000)) && Date.now() < until) {
      await sleep(1500);
      html = await page.content().catch(() => html);
    }
    const docStatus = await page.evaluate(() => { const nav = performance.getEntriesByType("navigation")[0]; return nav ? nav.responseStatus || 0 : 0; }).catch(() => 0);
    const finalUrl = page.url();
    const text = await page.evaluate(() => document.body ? document.body.innerText : "").catch(() => "");
    const h1 = await page.evaluate(() => { const node = document.querySelector("h1"); return node ? node.innerText : ""; }).catch(() => "");
    const challenge = core.challengeOf(finalUrl, {}, html);
    say("The " + place + " Chrome window has " + finalUrl + " at status " + (docStatus || "unknown") + (challenge ? ", still behind " + challenge : "") + ".");
    if (!html || docStatus >= 400 || challenge) return null;
    const renderedWords = browserPass.words(text);
    const rawWords = browserPass.words(browserPass.htmlText(html));
    return {
      ok: true,
      untagged: true,
      engine: "Chrome window (" + place + ")",
      pages: [],
      start: {
        url, finalUrl, finalPath: new URL(finalUrl).pathname, status: docStatus || 200, docStatus: docStatus || 200, headers: {},
        html: html.slice(0, 2000000), htmlCut: html.length > 2000000, renderedWords, rawWords,
        share: renderedWords ? Math.min(100, Math.round((rawWords / renderedWords) * 100)) : 100,
        h1: clip(h1, 120), vitals: { lcp: 0, cls: 0, tbt: 0, fcp: 0 }, requests: 0, hosts: 0, bytes: html.length
      }
    };
  } catch (error) {
    say("The Chrome window could not be read: " + clip(error && error.message, 160));
    return null;
  } finally {
    if (browser) await browser.disconnect().catch(() => {});
    try { execFileSync("pkill", ["-f", "user-data-dir=" + dir]); } catch (error) { /* Chrome already quit */ }
    setTimeout(() => fs.rmSync(dir, { recursive: true, force: true }), 3000).unref();
  }
}

function localBrowse(windowed) {
  return async (job, log) => {
    const got = await browserPass.browse(job, log).catch((error) => ({ ok: false, error: clip(error && error.message, 120) }));
    if (!windowed || !job.html) return got;
    const start = got && got.ok && got.start;
    if (start && start.html && start.docStatus < 400 && !core.challengeOf(start.finalUrl || job.url, start.headers || {}, start.html)) return got;
    const say = (text) => log && log(text);
    return (await windowRead(job.url, say, "minimized")) || (await windowRead(job.url, say, "off-screen")) || got;
  };
}

let speedKey = null;
function pagespeedKey() {
  if (speedKey !== null) return speedKey;
  try { speedKey = execFileSync("gcloud", ["secrets", "versions", "access", "latest", "--secret=PAGESPEED_KEY", "--project=" + PROJECT], { stdio: ["ignore", "pipe", "ignore"] }).toString().trim(); } catch (error) { speedKey = ""; }
  return speedKey;
}

async function review(group, step, log) {
  const options = group.options || {};
  const started = Date.now();
  const key = pagespeedKey();
  const target = group.source === "sweep" ? sweep.intake(group.sweep) : null;
  const report = await core.reviewTarget(target ? target.url : group.url, {
    log,
    stopped: () => Date.now() - started > REVIEW_MS,
    maxPages: options.pages || undefined,
    maxDepth: options.depth || undefined,
    pageLang: options.pageLang || "",
    section: options.section === true,
    passive: !!(group.intake && group.intake.reasonCode === "compare"),
    mentions: target ? false : undefined,
    readAs: step === "mac-plain" ? "" : "chrome",
    browse: localBrowse(step === "mac-chrome-window"),
    pagespeed: key ? (url) => core.pageSpeed(url, key) : undefined,
    crux: key ? (url) => core.cruxHistory(url, key) : undefined
  });
  if (target) return Object.assign(core.intakeRecord(target, report, { country: String(group.sweep.cc || "").toUpperCase() }), { source: "sweep", sweep: group.sweep });
  return core.intakeRecord(Object.assign({}, group.intake, {
    url: group.url, name: group.name, email: group.email, frameworks: options.frameworks || [], pages: options.pages, depth: options.depth,
    pageLang: options.pageLang || "", section: options.section === true
  }), report, { deviceId: (group.intake || {}).deviceId });
}

// The steps for this address, cheapest first: the plain read decides where to start, and the window is the last one.
async function steps(url, hint) {
  if (hint && rescue.MAC_STEPS[hint.step]) return Array.from(new Set([hint.step, "mac-chrome-window"]));
  if (rescue.readable(await core.probeRead(url))) return ["mac-plain"];
  if (rescue.readable(await core.probeRead(url, { readAs: "chrome" }))) return ["mac-chrome-headers", "mac-chrome-window"];
  return ["mac-chrome-window"];
}

async function attempt(group, hint, say) {
  const lines = [];
  const startedAt = Date.now();
  const log = (text) => { if (lines.length < 5000) lines.push({ t: Date.now() - startedAt, text: clip(text, 400) }); };
  log("Rescue from Carlos's Mac on a home connection (#3080) of a failed review of " + group.url + ".");
  let record = null;
  let error = null;
  let used = "";
  for (const step of await steps(group.url, hint)) {
    used = step;
    log("Step " + step + ": " + rescue.MAC_STEPS[step] + ".");
    say("  " + step);
    try {
      record = await review(group, step, log);
      error = null;
      break;
    } catch (caught) {
      error = caught;
      log("Step " + step + " failed: " + clip(caught && caught.message, 300));
    }
  }
  return { record, error, lines, startedAt, endedAt: Date.now(), step: used };
}

async function rescueOne(row, say) {
  const group = row.group || {};
  const marks = await Promise.all((group.failureIds || []).map((id) => read("url_review_failures/" + id)));
  const now = Date.now();
  const item = { key: row.key, group, prior: row, promised: !!row.promised };
  if (marks.some((doc) => doc && doc.rerun && doc.rerun.status && doc.rerun.status !== "failed")) {
    const doc = rescue.rescueDoc(item, { status: "settled", attempts: [rescue.attemptRow("mac", null, "A re-run settled the failure before the Mac took it", now)] }, now);
    await write("url_review_rescues/" + row.id, doc);
    return "settled by a re-run";
  }
  const hintPath = "url_review_read_hints/" + rescue.hintId(group.host);
  const hint = await read(hintPath);
  say(group.host + " (" + (group.source || "ask") + ")");
  const run = await attempt(group, hint, say);
  const doc = failures.rerunDoc(Object.assign({}, group, { trigger: rescue.trigger("mac", run.step) }), run);
  doc.rescue = { by: "mac", step: run.step };
  const rerunId = await add("url_review_reruns", doc);
  if (run.record && group.source === "sweep") await write("url_reviews/" + run.record.id, run.record);
  const mark = failures.rerunMark(rerunId, doc);
  const ok = !!run.record;
  const macRuns = (row.attempts || []).filter((one) => one.strategy === "mac" && one.ok === false).length + (ok ? 0 : 1);
  const pass = {
    status: ok ? "rescued" : !row.promised && macRuns >= rescue.MAC_TRIES ? "exhausted" : "trying",
    strategy: ok ? "mac" : "",
    rerunId: ok ? rerunId : "",
    attempts: [rescue.attemptRow("mac", ok, ok ? "Report " + doc.reportId : (doc.error && doc.error.message) || "The review failed.", Date.now(), run.step)]
  };
  const saved = rescue.rescueDoc(item, pass, Date.now());
  await write("url_review_rescues/" + row.id, saved);
  await Promise.all((group.failureIds || []).map((id) => update("url_review_failures/" + id, { rerun: mark, rescue: rescue.rescueMark(row.id, saved) })));
  if (ok) await write(hintPath, rescue.hintDoc(hint, "mac", run.step, group.url, Date.now()));
  return ok ? "rescued with " + run.step + ", re-run " + rerunId : "failed again (" + clip(doc.error && doc.error.message, 160) + ")";
}

async function main() {
  const arg = process.argv[2] || "";
  if (/^https:\/\//.test(arg)) {
    const run = await attempt({ url: arg, host: new URL(arg).hostname, options: { pages: 20, depth: 2, frameworks: ["Playwright"] }, intake: {} }, null, console.log);
    if (process.env.RESCUE_LOG) fs.writeFileSync(process.env.RESCUE_LOG, run.lines.map((line) => line.t + " " + line.text).join("\n"));
    run.lines.slice(-12).forEach((line) => console.log("  " + line.text));
    console.log(run.record ? "Read with " + run.step + ": report " + run.record.id + ", " + ((run.record.report || {}).pages || []).length + " pages." : "Failed with " + run.step + ": " + clip(run.error && run.error.message, 300));
    return;
  }
  const promisedOnly = process.argv.includes("--promised");
  const dry = process.argv.includes("--dry");
  signIn();
  const waiting = await queued(200);
  const promised = waiting.filter((row) => row.promised).slice(0, rescue.MAC_PROMISED_PER_HOUR);
  const rows = promised.concat(promisedOnly ? [] : waiting.filter((row) => !row.promised).slice(0, rescue.MAC_PER_RUN));
  if (promisedOnly && !rows.length) return;
  console.log(new Date().toISOString() + " " + rows.length + " rescues wait for the Mac (" + promised.length + " promised).");
  for (const row of rows) {
    if (dry) {
      console.log("- " + (row.group || {}).url + ": would start with " + (await steps((row.group || {}).url, await read("url_review_read_hints/" + rescue.hintId(row.host))))[0]);
      continue;
    }
    try {
      signIn();
      console.log("  -> " + await rescueOne(row, console.log));
    } catch (error) {
      console.error("Rescue of " + row.url + " stopped: " + clip(error && error.message, 300));
    }
  }
}

main().then(() => process.exit(0), (error) => {
  console.error(error);
  process.exit(1);
});
