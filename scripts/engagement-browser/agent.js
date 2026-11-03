#!/usr/bin/env node
"use strict";
/*
 * The Mac's browser agent for engagement on X, LinkedIn, Facebook, Instagram, Threads and TikTok (#1991).
 * Every 30 minutes from 7:00 to 22:00 (Bogotá) launchd starts a real Chrome, minimized, in the agent's own profile,
 * signed in once as our accounts. Each run reads one topic search and one reviewed-site search (#2467: a domain or
 * name from this slot's Live Reports, engagement-mac-sites) per network, sends the posts to Jarvis (which scores
 * them, asks Gemini and plans like the cloud scout; site posts get a report-reply invite), then carries out what
 * Jarvis queued: replies Carlos approved,
 * and in a live run the planned likes, reposts and follows, a human pace apart. Jarvis > Engagement shows what it
 * read, did and needs; functions/engagement-mac.js is the other end.
 *
 *   node scripts/engagement-browser/agent.js setup            pair, install the launchd job, open the sign-in window
 *   node scripts/engagement-browser/agent.js login [network]  sign in (or clear a check) in the agent's Chrome
 *   node scripts/engagement-browser/agent.js check [--read]   who it is signed in as, and what one search reads
 *   node scripts/engagement-browser/agent.js run [--force]    one run now (--force: outside the hours too)
 *   node scripts/engagement-browser/agent.js import <file>    sessions signed in elsewhere (Playwright cookies JSON)
 *   node scripts/engagement-browser/agent.js pair             a new token for Jarvis (with this Mac's gcloud sign-in)
 *   node scripts/engagement-browser/agent.js install|uninstall|status
 *
 * State, the Chrome profile and logs live in ~/Library/Application Support/QALab/engagement-browser.
 */
const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");
const { execFileSync } = require("child_process");

const VERSION = "1.2.0";
const PROJECT = "carlosm-interactive-cv";
const ENDPOINT = "https://us-central1-" + PROJECT + ".cloudfunctions.net/jarvis";
const LABEL = "com.kaanmuar.engagementbrowser";
const STATE = path.join(os.homedir(), "Library/Application Support/QALab/engagement-browser");
const APP = path.join(STATE, "app");
const PROFILE = path.join(STATE, "chrome");
const CONFIG = path.join(STATE, "config.json");
const LOCK = path.join(STATE, "lock");
const SHOTS = path.join(STATE, "shots");
const LOGS = path.join(STATE, "logs");
const PLIST = path.join(os.homedir(), "Library/LaunchAgents", LABEL + ".plist");
const HOURS = [7, 22];
const MAX_ACTIONS = 10;
const RUN_MS = 25 * 60 * 1000;
const HOLD_MS = 12 * 3600000;
const INBOX_MS = 3600000;

const { NETWORKS, Refused, pause } = require("./networks");

fs.mkdirSync(LOGS, { recursive: true });
fs.mkdirSync(SHOTS, { recursive: true });

const log = (...a) => console.log(new Date().toISOString(), ...a);
const readConfig = () => { try { return JSON.parse(fs.readFileSync(CONFIG, "utf8")); } catch (error) { return {}; } };
const writeConfig = (c) => { fs.writeFileSync(CONFIG, JSON.stringify(c, null, 2)); fs.chmodSync(CONFIG, 0o600); };
const bogotaHour = () => new Date(Date.now() - 5 * 3600000).getUTCHours();
const pickNets = (arg) => { const want = String(arg || "").split(",").filter(Boolean); return want.length ? want.filter((k) => NETWORKS[k]) : Object.keys(NETWORKS); };

function playwright() {
  for (const name of ["playwright-core", "playwright"]) {
    try { return require(name); } catch (error) { /* the next one */ }
  }
  throw new Error("Playwright is not installed; run: node scripts/engagement-browser/agent.js install");
}

async function launch(minimized) {
  const ctx = await playwright().chromium.launchPersistentContext(PROFILE, {
    channel: "chrome", headless: false, viewport: null, locale: "en-US", timezoneId: "America/Bogota",
    ignoreDefaultArgs: ["--enable-automation"],
    args: ["--disable-blink-features=AutomationControlled", "--disable-background-timer-throttling", "--disable-renderer-backgrounding", "--disable-backgrounding-occluded-windows", "--window-size=1280,900"]
  });
  const page = ctx.pages()[0] || await ctx.newPage();
  if (minimized) {
    const cdp = await ctx.newCDPSession(page);
    const { windowId } = await cdp.send("Browser.getWindowForTarget");
    await cdp.send("Browser.setWindowBounds", { windowId, bounds: { windowState: "minimized" } }).catch(() => null);
  }
  return { ctx, page };
}

async function api(op, body) {
  const c = readConfig();
  if (!c.token) throw new Error("Not paired: node scripts/engagement-browser/agent.js pair");
  const res = await fetch(c.endpoint || ENDPOINT, {
    method: "POST", headers: { "Content-Type": "application/json", "x-mac-token": c.token }, body: JSON.stringify(Object.assign({ op }, body || {})), signal: AbortSignal.timeout(150000)
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.ok === false) throw new Error(op + ": " + (data.error || "Jarvis answered " + res.status));
  return data;
}

async function shot(page, name) {
  const file = path.join(SHOTS, name + "-" + new Date().toISOString().replace(/[:.]/g, "-") + ".png");
  await page.screenshot({ path: file }).catch(() => null);
  const old = fs.readdirSync(SHOTS).sort().reverse().slice(30);
  old.forEach((f) => fs.rmSync(path.join(SHOTS, f), { force: true }));
  return file;
}

/** { who, why }: who is the account the agent acts as, or "" with why it will not act there. */
async function signedIn(page, k) {
  const net = NETWORKS[k];
  await page.goto(net.home, { waitUntil: "domcontentloaded", timeout: 45000 }).catch(() => null);
  await pause(2000, 4000);
  let who = "";
  try { who = await net.signedIn(page); } catch (error) { return { who: "", why: String(error.message || error).slice(0, 180) }; }
  if (!who) return { who: "", why: "Not signed in in the agent's Chrome." };
  if (net.account && who.toLowerCase().replace(/^@/, "") !== net.account) return { who: "", why: "Signed in as " + who + ", not our @" + net.account + "." };
  return { who, why: "" };
}

// --- pair ----------------------------------------------------------------------------------------------------------

async function pair() {
  const token = crypto.randomBytes(32).toString("hex");
  const access = execFileSync("gcloud", ["auth", "print-access-token"], { encoding: "utf8" }).trim();
  const doc = "https://firestore.googleapis.com/v1/projects/" + PROJECT + "/databases/(default)/documents/engagement_private/mac";
  const res = await fetch(doc + "?updateMask.fieldPaths=tokenHash&updateMask.fieldPaths=pairedAt", {
    method: "PATCH", headers: { Authorization: "Bearer " + access, "Content-Type": "application/json", "x-goog-user-project": PROJECT },
    body: JSON.stringify({ fields: { tokenHash: { stringValue: crypto.createHash("sha256").update(token).digest("hex") }, pairedAt: { stringValue: new Date().toISOString() } } })
  });
  if (!res.ok) throw new Error("Firestore answered " + res.status + ": " + (await res.text()).slice(0, 300) + "\nSign in with: gcloud auth login");
  writeConfig(Object.assign(readConfig(), { token, endpoint: ENDPOINT, pairedAt: new Date().toISOString() }));
  log("Paired: Jarvis now takes this Mac's runs.");
}

// --- login and check -------------------------------------------------------------------------------------------------

async function login(nets) {
  const { ctx, page } = await launch(false);
  await page.goto(NETWORKS[nets[0]].home, { waitUntil: "domcontentloaded" }).catch(() => null);
  for (const k of nets.slice(1)) await (await ctx.newPage()).goto(NETWORKS[k].home, { waitUntil: "domcontentloaded" }).catch(() => null);
  console.log("\nSign in on each tab (" + nets.map((k) => NETWORKS[k].name).join(", ") + ") with our brand accounts, clear any check, then quit Chrome (Cmd+Q).\n");
  await new Promise((r) => ctx.on("close", r));
  const c = readConfig();
  c.blocked = Object.fromEntries(Object.entries(c.blocked || {}).filter(([k]) => !nets.includes(k)));
  writeConfig(c);
  await check(nets, false);
}

async function check(nets, read) {
  const { ctx, page } = await launch(true);
  try {
    for (const k of nets) {
      const { who, why } = await signedIn(page, k);
      let line = NETWORKS[k].name.padEnd(10) + (who ? "signed in as " + who : "NOT ready: " + why);
      if (who && read) {
        const posts = await NETWORKS[k].read(page, NETWORKS[k].queries[0]).catch((error) => ({ error: error.message }));
        line += posts.error ? "; read failed: " + posts.error : "; read " + posts.length + " posts for \"" + NETWORKS[k].queries[0] + "\"";
        if (posts.error || !posts.length) line += " (screenshot " + await shot(page, k) + ")";
        if (NETWORKS[k].inbox) {
          const got = await NETWORKS[k].inbox(page).catch((error) => ({ error: error.message }));
          line += got.error ? "; notifications failed: " + got.error : "; " + got.length + " replies and mentions of us (" + got.filter((x) => !x.liked).length + " not liked, " + got.filter((x) => x.on && x.ours).length + " of " + got.filter((x) => x.on).length + " on our posts quote what we said)";
        }
      }
      console.log(line);
    }
  } finally { await ctx.close(); }
}

/** Sessions signed in elsewhere on this Mac (Playwright cookies as JSON), only for the agent's networks. */
async function importCookies(file) {
  const hosts = /(^|\.)(x\.com|twitter\.com|linkedin\.com|facebook\.com|instagram\.com|threads\.com|threads\.net|tiktok\.com)$/;
  const list = JSON.parse(fs.readFileSync(file, "utf8")).filter((c) => hosts.test(String(c.domain || "").replace(/^\./, "")));
  const { ctx } = await launch(true);
  try { await ctx.addCookies(list); } finally { await ctx.close(); }
  log("Imported " + list.length + " cookies for " + [...new Set(list.map((c) => c.domain.replace(/^\.|^www\./g, "")))].join(", "));
}

// --- run ---------------------------------------------------------------------------------------------------------------

async function act(page, task) {
  const net = NETWORKS[task.network];
  if (!net || !net[task.action]) return { ok: false, error: NETWORKS[task.network] ? net.name + " takes no " + task.action + " here." : "Unknown network." };
  try {
    if (task.action === "reply" && net.replied) {
      const had = await net.replied(page, task);
      if (had) return { ok: false, already: true, url: had.url || "" };
    }
    return Object.assign({ ok: true }, await net[task.action](page, task));
  }
  catch (error) {
    const file = await shot(page, task.network + "-" + task.action);
    return { ok: false, retry: error instanceof Refused, error: String(error.message || error).slice(0, 180), shot: file };
  }
}

async function run(opts) {
  const h = bogotaHour();
  if (!opts.force && (h < HOURS[0] || h >= HOURS[1])) { log("Outside " + HOURS.join(":00 to ") + ":00 Bogotá; nothing to do."); return; }
  try { fs.mkdirSync(LOCK); } catch (error) {
    if (Date.now() - fs.statSync(LOCK).mtimeMs < RUN_MS + 5 * 60000) { log("Another run is still going."); return; }
    fs.rmSync(LOCK, { recursive: true, force: true });
    fs.mkdirSync(LOCK);
  }
  const timer = setTimeout(() => { log("The run took too long; stopping."); fs.rmSync(LOCK, { recursive: true, force: true }); process.exit(2); }, RUN_MS);
  if (!opts.force) await pause(0, 4 * 60000);
  const c = readConfig();
  const now = Date.now();
  c.blocked = Object.fromEntries(Object.entries(c.blocked || {}).filter(([, until]) => Date.parse(until) > now));
  const slot = Math.floor(now / 1800000);
  const sites = await api("engagement-mac-sites").then((r) => r.queries || [], (error) => { log(error.message); return []; });
  const { ctx, page } = await launch(true);
  const seen = { posts: [], reports: [], comments: [], errors: {}, signedIn: {}, accounts: {} };
  try {
    const nets = pickNets(opts.only).sort(() => Math.random() - 0.5);
    for (const [i, k] of nets.entries()) {
      const net = NETWORKS[k];
      if (c.blocked[k]) { seen.errors[k] = "Held until " + c.blocked[k] + " after a check."; seen.signedIn[k] = true; continue; }
      const { who, why } = await signedIn(page, k);
      seen.signedIn[k] = !!who;
      if (!who) { seen.errors[k] = why; continue; }
      seen.accounts[k] = who;
      const q = net.queries[(slot + i * 3) % net.queries.length];
      try {
        const posts = await net.read(page, q);
        seen.posts.push(...posts);
        log(net.name + ": read " + posts.length + " for \"" + q + "\"");
        if (!posts.length) seen.errors[k] = "Read nothing for \"" + q + "\"; the page may have changed (agent.js check --read).";
      } catch (error) {
        if (error instanceof Refused) c.blocked[k] = new Date(Date.now() + HOLD_MS).toISOString();
        seen.errors[k] = String(error.message || error).slice(0, 180);
        log(net.name + ": " + seen.errors[k] + " (" + await shot(page, k) + ")");
      }
      if (sites.length && !c.blocked[k]) {
        const sq = sites[(slot + i) % sites.length];
        await pause(3000, 9000);
        try {
          const posts = await net.read(page, sq);
          seen.reports.push(...posts.map((p) => Object.assign(p, { query: sq })));
          log(net.name + ": read " + posts.length + " for the reviewed site \"" + sq + "\"");
        } catch (error) {
          if (error instanceof Refused) c.blocked[k] = new Date(Date.now() + HOLD_MS).toISOString();
          log(net.name + " site search: " + String(error.message || error).slice(0, 180));
        }
      }
      if (net.inbox && !c.blocked[k] && now - Date.parse((c.inboxAt || {})[k] || 0) > INBOX_MS) {
        await pause(3000, 9000);
        try {
          const got = await net.inbox(page);
          seen.comments.push(...got);
          c.inboxAt = Object.assign({}, c.inboxAt, { [k]: new Date().toISOString() });
          log(net.name + ": " + got.length + " replies and mentions of us in the notifications");
        } catch (error) {
          if (error instanceof Refused) c.blocked[k] = new Date(Date.now() + HOLD_MS).toISOString();
          log(net.name + " notifications: " + String(error.message || error).slice(0, 180));
        }
      }
      await pause(3000, 9000);
    }
    const took = await api("engagement-mac-ingest", Object.assign({}, seen, { blocked: c.blocked, agent: VERSION }));
    log("Jarvis took " + took.read + " posts: " + took.fresh + " new, " + took.engaged + " to engage, " + took.drafted + " replies drafted" + (took.aiError ? "; Gemini: " + took.aiError : "")
      + (took.chained ? "; " + took.chained + " new comments on our posts and replies" : "")
      + (took.reports && took.reports.read ? "; reviewed sites: " + took.reports.read + " read, " + took.reports.matched + " name one, " + took.reports.drafted + " invites drafted" : ""));

    const ready = Object.keys(seen.signedIn).filter((k) => seen.signedIn[k] && !c.blocked[k]);
    const q = await api("engagement-mac-queue", { networks: ready });
    if (q.paused) log("Engagement is paused in Jarvis.");
    const tasks = q.tasks.filter((t) => t.action === "reply").concat(q.tasks.filter((t) => t.action !== "reply").sort(() => Math.random() - 0.5)).slice(0, MAX_ACTIONS);
    log("Queue: " + q.tasks.length + " tasks" + (q.live ? "" : " (dry run: only approved replies)") + (q.dry ? ", " + q.dry + " logged as dry" : "") + (q.missed ? ", " + q.missed + " missed" : ""));
    for (const t of tasks) {
      if (c.blocked[t.network]) { await api("engagement-mac-result", { key: t.key, action: t.action, ok: false, retry: true, error: "Held after a check." }); continue; }
      const r = await act(page, t);
      if (r.retry) c.blocked[t.network] = new Date(Date.now() + HOLD_MS).toISOString();
      await api("engagement-mac-result", { key: t.key, action: t.action, ok: r.ok, url: r.url || "", reaction: r.reaction || "", retry: !!r.retry, already: !!r.already, error: r.error || "" }).catch((error) => log(error.message));
      log(NETWORKS[t.network].name + " " + t.action + " " + t.url + ": " + (r.ok ? "done" + (r.reaction ? " (" + r.reaction + ")" : "") : r.already ? "we had already replied (" + r.url + "), not sent" : r.error + (r.shot ? " (" + r.shot + ")" : "")));
      await pause(25000, 70000);
    }
  } finally {
    writeConfig(Object.assign(readConfig(), { blocked: c.blocked, inboxAt: c.inboxAt || {}, lastRun: new Date().toISOString() }));
    await ctx.close().catch(() => null);
    clearTimeout(timer);
    fs.rmSync(LOCK, { recursive: true, force: true });
  }
}

// --- install -----------------------------------------------------------------------------------------------------------

function install() {
  fs.mkdirSync(APP, { recursive: true });
  ["agent.js", "networks.js"].forEach((f) => fs.copyFileSync(path.join(__dirname, f), path.join(APP, f)));
  const pw = (() => { try { return require("playwright/package.json").version; } catch (error) { return "1.63.0"; } })();
  fs.writeFileSync(path.join(APP, "package.json"), JSON.stringify({ name: "engagement-browser", private: true, dependencies: { "playwright-core": pw } }, null, 2));
  execFileSync("npm", ["install", "--omit=dev", "--no-audit", "--no-fund", "--silent"], { cwd: APP, stdio: "inherit" });
  fs.mkdirSync(path.dirname(PLIST), { recursive: true });
  fs.writeFileSync(PLIST, `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>${LABEL}</string>
  <key>ProgramArguments</key><array><string>${process.execPath}</string><string>${path.join(APP, "agent.js")}</string><string>run</string></array>
  <key>StartInterval</key><integer>1800</integer>
  <key>EnvironmentVariables</key><dict><key>PATH</key><string>/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin</string></dict>
  <key>StandardOutPath</key><string>${path.join(LOGS, "agent.log")}</string>
  <key>StandardErrorPath</key><string>${path.join(LOGS, "agent.log")}</string>
</dict>
</plist>
`);
  const uid = process.getuid();
  try { execFileSync("launchctl", ["bootout", "gui/" + uid + "/" + LABEL], { stdio: "ignore" }); } catch (error) { /* not loaded */ }
  execFileSync("launchctl", ["bootstrap", "gui/" + uid, PLIST]);
  log("Installed " + LABEL + ": every 30 minutes, " + HOURS.join(":00 to ") + ":00 Bogotá; logs in " + path.join(LOGS, "agent.log"));
}

function uninstall() {
  try { execFileSync("launchctl", ["bootout", "gui/" + process.getuid() + "/" + LABEL], { stdio: "ignore" }); } catch (error) { /* not loaded */ }
  fs.rmSync(PLIST, { force: true });
  log("Uninstalled " + LABEL + "; the Chrome profile stays in " + PROFILE);
}

function status() {
  const c = readConfig();
  let loaded = false;
  try { execFileSync("launchctl", ["print", "gui/" + process.getuid() + "/" + LABEL], { stdio: "ignore" }); loaded = true; } catch (error) { loaded = false; }
  console.log("paired:    " + (c.token ? "yes, " + c.pairedAt : "no"));
  console.log("launchd:   " + (loaded ? "loaded (every 30 minutes)" : "not installed"));
  console.log("last run:  " + (c.lastRun || "never"));
  console.log("held:      " + (Object.entries(c.blocked || {}).map(([k, u]) => k + " until " + u).join(", ") || "none"));
  console.log("log:       " + path.join(LOGS, "agent.log"));
}

async function main() {
  const [cmd, ...rest] = process.argv.slice(2);
  const flag = (f) => rest.includes(f);
  const arg = rest.find((a) => !a.startsWith("--"));
  if (cmd === "pair") return pair();
  if (cmd === "login") return login(pickNets(arg));
  if (cmd === "check") return check(pickNets(arg), flag("--read"));
  if (cmd === "import") return importCookies(arg);
  if (cmd === "run") return run({ force: flag("--force"), only: arg });
  if (cmd === "install") return install();
  if (cmd === "uninstall") return uninstall();
  if (cmd === "status") return status();
  if (cmd === "setup") { if (!readConfig().token) await pair(); install(); return login(Object.keys(NETWORKS)); }
  console.log(fs.readFileSync(__filename, "utf8").split("\n").slice(2, 20).join("\n"));
  return null;
}

main().catch((error) => { log(String((error && error.stack) || error)); process.exitCode = 1; });
