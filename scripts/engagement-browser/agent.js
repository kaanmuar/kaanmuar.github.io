#!/usr/bin/env node
"use strict";
/*
 * The Mac's browser agent for engagement on X, LinkedIn, Facebook, Instagram, Threads and TikTok (#1991), and in the
 * field on Telegram and Reddit as Carlos's accounts (#2614): topic searches in any language every other run, the
 * channels, groups and subreddits Jarvis names, and groups found for joins, joined within a warmed-up daily cap.
 * Every 30 minutes from 7:00 to 22:00 (Bogotá) launchd starts a real Chrome, minimized, in the agent's own profile,
 * signed in once as our accounts. Each run reads one topic search and one reviewed-site search (#2467: a domain or
 * name from this slot's Live Reports, engagement-mac-sites) per network, sends the posts to Jarvis (which scores
 * them, asks Gemini and plans like the cloud scout; site posts get a report-reply invite), then carries out what
 * Jarvis queued: replies Carlos approved,
 * and in a live run the planned likes, reposts and follows, a human pace apart. Jarvis > Engagement shows what it
 * read, did and needs; functions/engagement-mac.js is the other end.
 * Networks run side by side (#3141): each in its own Chrome profile once clone-profiles copied the signed-in main one,
 * up to --parallel N (ENGAGEMENT_PARALLEL, default 3) Chromes at once, their starts 15 to 45 s apart, each network at
 * the same pace as before. A lock per profile lets a second run (or a login) take only the networks free; a check's
 * hold stays per network. One ingest and one queue per run; logs per network beside agent.log. Without clones every
 * network shares the main profile and runs one after another, as before.
 *
 *   node scripts/engagement-browser/agent.js setup              pair, install the launchd job, sign in, clone profiles
 *   node scripts/engagement-browser/agent.js login [network]    sign in (or clear a check) in that network's Chrome
 *   node scripts/engagement-browser/agent.js check [--read]     who it is signed in as, and what one search reads
 *   node scripts/engagement-browser/agent.js run [--force]      one run now (--force: outside the hours too)
 *   node scripts/engagement-browser/agent.js clone-profiles [network] [--force]   a profile per network from the main one
 *   node scripts/engagement-browser/agent.js import <file>      sessions signed in elsewhere (Playwright cookies JSON)
 *   node scripts/engagement-browser/agent.js restore-sessions [network]   each network's last signed-in cookies back
 *   node scripts/engagement-browser/agent.js pair               a new token for Jarvis (with this Mac's gcloud sign-in)
 *   node scripts/engagement-browser/agent.js install|uninstall|status
 *   any of them: --parallel N   how many Chromes at once (install keeps it for the launchd job)
 *
 * State, the Chrome profiles (chrome, profiles/<network>), kept sessions (sessions/<profile>), locks and logs live in
 * ~/Library/Application Support/QALab/engagement-browser.
 *
 * Open these profiles only through this script. A Chrome started any other way (open -a "Google Chrome" --user-data-dir,
 * a plain chromium launch) cannot read the cookies Playwright's Chrome encrypted and drops every session but Telegram's
 * (#3163). For a check Playwright's Chrome cannot pass, sign in in a throwaway profile and bring the sessions in with
 * import. A check or run that sees networks signed in keeps a copy of the profile's cookies and, on a profile of
 * that network's own, its local storage (Telegram signs in there). A signed-in check that misses looks at the home
 * page once more. A run that still sees one signed out puts that copy back and reads the network again before it
 * tells Jarvis (#3436). Jarvis pushes only when the copy does not hold, and then it asks for a sign-in.
 * restore-sessions does the same put-back on its own.
 */
const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");
const { execFileSync } = require("child_process");

const VERSION = "1.10.0";
const STUCK = " The last kept session did not sign it back in.";
const PROJECT = "carlosm-interactive-cv";
const ENDPOINT = "https://us-central1-" + PROJECT + ".cloudfunctions.net/jarvis";
const LABEL = "com.kaanmuar.engagementbrowser";
const STATE = path.join(os.homedir(), "Library/Application Support/QALab/engagement-browser");
const APP = path.join(STATE, "app");
const PROFILE = path.join(STATE, "chrome");
const PROFILES = path.join(STATE, "profiles");
const CONFIG = path.join(STATE, "config.json");
const LOCKS = path.join(STATE, "locks");
const SESSIONS = path.join(STATE, "sessions");
const NOTE = "DO-NOT-OPEN-IN-CHROME.txt";
const SHOTS = path.join(STATE, "shots");
const LOGS = path.join(STATE, "logs");
const PLIST = path.join(os.homedir(), "Library/LaunchAgents", LABEL + ".plist");
const HOURS = [7, 22];
const MAX_ACTIONS = 10;
const RUN_MS = 25 * 60 * 1000;
const HOLD_MS = 12 * 3600000;
const INBOX_MS = 3600000;
const LOCK_MS = RUN_MS + 5 * 60000;
const STAGGER = [15000, 45000];
const NET_LOG_BYTES = 2 * 1024 * 1024;

const { NETWORKS, Refused, pause, downloadImage } = require("./networks");
const P = require("./pool");

fs.mkdirSync(LOGS, { recursive: true });
fs.mkdirSync(SHOTS, { recursive: true });

const log = (...a) => console.log(new Date().toISOString(), ...a);
/** A network's log: its lines in agent.log, named, and in logs/<network>.log (the last 2 MB, then .old). */
const netLog = (k) => (...a) => {
  const line = new Date().toISOString() + " [" + NETWORKS[k].name + "] " + a.join(" ");
  console.log(line);
  const file = path.join(LOGS, k + ".log");
  try {
    if (fs.existsSync(file) && fs.statSync(file).size > NET_LOG_BYTES) fs.renameSync(file, file + ".old");
    fs.appendFileSync(file, line + "\n");
  } catch (error) { /* agent.log has it */ }
};
const profileOf = (k) => (fs.existsSync(path.join(PROFILES, k)) ? path.join(PROFILES, k) : PROFILE);
// The main profile keeps the single lock of agents before 1.8, so a run of an older install still keeps this one out.
const lockOf = (profile) => (profile === PROFILE ? path.join(STATE, "lock") : path.join(LOCKS, path.basename(profile)));
const sessionsOf = (profile) => path.join(SESSIONS, profile === PROFILE ? "main" : path.basename(profile));
const names = (nets) => nets.map((k) => NETWORKS[k].name).join(", ");
const stagger = () => STAGGER[0] + Math.random() * (STAGGER[1] - STAGGER[0]);

/** The profile groups of nets whose locks this process took; the rest are logged as busy. owned gets the lock dirs. */
function claim(nets, owned) {
  return P.groups(nets, profileOf).filter((u) => {
    if (P.lock(lockOf(u.profile), LOCK_MS)) { owned.push(lockOf(u.profile)); return true; }
    log(names(u.nets) + ": busy in another run or sign-in; skipped.");
    return false;
  });
}
const release = (owned) => owned.splice(0).forEach(P.unlock);
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

async function launch(minimized, profile) {
  const dir = profile || PROFILE;
  if (chromeHas(dir)) throw new Error("A Chrome outside the agent has " + dir + " open; quit it. Such a Chrome drops the agent's sessions (#3163).");
  if (fs.existsSync(dir) && !fs.existsSync(path.join(dir, NOTE))) {
    fs.writeFileSync(path.join(dir, NOTE), "The engagement agent's profile. Open it only with scripts/engagement-browser/agent.js (login, check, run).\n"
      + "A Chrome started any other way cannot read the agent's cookies and drops every session (#3163).\n");
  }
  const ctx = await playwright().chromium.launchPersistentContext(dir, {
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

// The run's state in Jarvis's live Processes (#2548); a failed report never stops the run.
const STARTED = new Date().toISOString();
const report = (state, step, needsYou) => api("process-report", { row: { id: "engagement", kind: "mac-agent", name: "Engagement browser", state, step, needsYou: !!needsYou, startedAt: STARTED, url: "https://carlosandmunoz.com/admin.html#stats/engagement/1" } })
  .catch((error) => log("Processes: " + error.message));

async function shot(page, name) {
  const file = path.join(SHOTS, name + "-" + new Date().toISOString().replace(/[:.]/g, "-") + ".png");
  await page.screenshot({ path: file }).catch(() => null);
  const old = fs.readdirSync(SHOTS).sort().reverse().slice(30);
  old.forEach((f) => fs.rmSync(path.join(SHOTS, f), { force: true }));
  return file;
}

/** One look at who is signed in. A slow home page reads as signed out, so the caller looks twice before it believes that. */
async function signedInOnce(page, k) {
  const net = NETWORKS[k];
  await page.goto(net.home, { waitUntil: "domcontentloaded", timeout: 45000 }).catch(() => null);
  await pause(2000, 4000);
  let who = "";
  try { who = await net.signedIn(page); } catch (error) { return { who: "", why: String(error.message || error).slice(0, 180) }; }
  if (!who) return { who: "", why: "Not signed in in the agent's Chrome." };
  if (net.account && who.toLowerCase().replace(/^@/, "") !== net.account) return { who: "", why: "Signed in as " + who + ", not our @" + net.account + "." };
  return { who, why: "" };
}

/** { who, why }: who is the account the agent acts as, or "" with why it will not act there. */
async function signedIn(page, k) {
  const first = await signedInOnce(page, k);
  if (first.who || first.why !== "Not signed in in the agent's Chrome.") return first;
  log(NETWORKS[k].name + ": the signed-in check missed; opening home once more.");
  return signedInOnce(page, k);
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

// One Chrome window per profile, each with its networks' tabs; the check after waits until every window is closed.
async function login(nets, parallel) {
  const owned = [];
  const units = claim(nets, owned);
  const signed = units.flatMap((u) => u.nets);
  try {
    const windows = await Promise.all(units.map(async (u) => {
      const { ctx, page } = await launch(false, u.profile);
      await page.goto(NETWORKS[u.nets[0]].home, { waitUntil: "domcontentloaded" }).catch(() => null);
      for (const k of u.nets.slice(1)) await (await ctx.newPage()).goto(NETWORKS[k].home, { waitUntil: "domcontentloaded" }).catch(() => null);
      return { closed: new Promise((r) => ctx.on("close", r)) };
    }));
    if (units.length) console.log("\nSign in on each tab (" + names(signed) + ") with our brand accounts, clear any check, then quit "
      + (units.length > 1 ? "each of the " + units.length + " Chrome windows" : "Chrome") + " (Cmd+Q).\n");
    await Promise.all(windows.map((w) => w.closed));
  } finally { release(owned); }
  const c = readConfig();
  c.blocked = Object.fromEntries(Object.entries(c.blocked || {}).filter(([k]) => !signed.includes(k)));
  writeConfig(c);
  if (signed.length) await check(signed, false, parallel);
}

async function check(nets, read, parallel) {
  const owned = [];
  const lines = {};
  try {
    const units = claim(nets, owned);
    const got = await P.pool(units, parallel || 1, async (u) => {
      const { ctx, page } = await launch(true, u.profile);
      const signed = [];
      try {
        for (const k of u.nets) {
          const r = await checkOne(page, k, read);
          lines[k] = r.line;
          if (r.who) signed.push(k);
        }
      } finally { await ctx.close(); }
      keepSessions(u.profile, signed);
    });
    got.forEach((r, i) => { if (!r.ok) units[i].nets.forEach((k) => { lines[k] = lines[k] || NETWORKS[k].name.padEnd(10) + "NOT ready: Chrome failed on " + units[i].profile + ": " + String(r.error.message || r.error).slice(0, 160); }); });
  } finally { release(owned); }
  nets.forEach((k) => console.log(lines[k] || NETWORKS[k].name.padEnd(10) + "busy in another run or sign-in"));
}

async function checkOne(page, k, read) {
  const { who, why } = await signedIn(page, k);
  let line = NETWORKS[k].name.padEnd(10) + (who ? "signed in as " + who : "NOT ready: " + why);
  if (who && read) {
    const sample = NETWORKS[k].sample || NETWORKS[k].queries[0];
    const posts = await NETWORKS[k].read(page, sample).catch((error) => ({ error: error.message }));
    line += posts.error ? "; read failed: " + posts.error : "; read " + posts.length + " posts for \"" + sample + "\"";
    if (posts.error || !posts.length) line += " (screenshot " + await shot(page, k) + ")";
    if (NETWORKS[k].groups) {
      const groups = await NETWORKS[k].groups(page, "test automation").catch((error) => ({ error: error.message }));
      line += groups.error ? "; group search failed: " + groups.error : "; " + groups.length + " groups for \"test automation\"";
    }
    if (NETWORKS[k].inbox) {
      const got = await NETWORKS[k].inbox(page).catch((error) => ({ error: error.message }));
      line += got.error ? "; notifications failed: " + got.error : "; " + got.length + " comments and replies to us (" + got.filter((x) => !x.liked).length + " not liked, " + got.filter((x) => x.on && x.ours).length + " of " + got.filter((x) => x.on).length + " on our posts quote what we said)";
    }
  }
  return { line, who };
}

/** A copy of a closed profile's cookies for the networks just seen signed in there; a failed copy never stops the caller. */
function keepSessions(profile, signed) {
  if (chromeHas(profile)) return;
  try {
    const out = P.saveSessions(profile, sessionsOf(profile), signed);
    if (out) log("Kept the sessions of " + names(signed) + " in " + out);
  } catch (error) { log("Keeping sessions: " + String(error.message || error).slice(0, 160)); }
}

/** One kept copy's cookies for network k, read by Playwright so they can be added to another profile. */
async function cookiesFrom(copy, k) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "qalab-sessions-"));
  try {
    fs.mkdirSync(path.join(tmp, "Default"));
    ["Cookies", "Cookies-journal"].filter((f) => fs.existsSync(path.join(copy.dir, f))).forEach((f) => fs.copyFileSync(path.join(copy.dir, f), path.join(tmp, "Default", f)));
    if (fs.existsSync(path.join(copy.dir, "Local State"))) fs.copyFileSync(path.join(copy.dir, "Local State"), path.join(tmp, "Local State"));
    const { ctx } = await launch(true, tmp);
    try { return (await ctx.cookies()).filter((c) => P.cookieOf(c.domain, k)); } finally { await ctx.close(); }
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
}

/** Each named network's newest kept cookies back into its profile. The caller holds the profile locks. Networks that got cookies. */
async function putSessions(units, nets) {
  const back = [];
  for (const u of units) {
    const want = u.nets.filter((k) => nets.includes(k));
    if (!want.length) continue;
    if (chromeHas(u.profile)) { want.forEach((k) => log(NETWORKS[k].name + ": its Chrome is open, so the kept session stays where it is.")); continue; }
    const list = [];
    for (const k of want) {
      const copy = P.sessionFor(sessionsOf(u.profile), k);
      if (!copy) { log(NETWORKS[k].name + ": no kept session; sign in: node scripts/engagement-browser/agent.js login " + k); continue; }
      const got = await cookiesFrom(copy, k);
      list.push(...got);
      log(NETWORKS[k].name + ": " + got.length + " cookies from " + copy.at);
      let stores = 0;
      if (path.basename(u.profile) === k) stores = P.putStores(u.profile, copy.dir);
      if (stores) log(NETWORKS[k].name + ": put " + stores + " stores back from " + copy.at);
      if (got.length || stores) back.push(k);
    }
    if (!list.length) continue;
    const { ctx } = await launch(true, u.profile);
    try { await ctx.addCookies(list); } finally { await ctx.close(); }
  }
  return back;
}

/** Each network's newest kept cookies back into its profile through Playwright, so other networks keep theirs. */
async function restoreSessions(nets, parallel) {
  const owned = [];
  let back = [];
  try { back = await putSessions(claim(nets, owned), nets); } finally { release(owned); }
  if (back.length) await check(back, false, parallel);
}

/** Sessions signed in elsewhere on this Mac (Playwright cookies as JSON), only for the agent's networks, into every profile. */
async function importCookies(file) {
  const list = JSON.parse(fs.readFileSync(file, "utf8")).filter((c) => P.cookieOf(c.domain));
  const owned = [];
  try {
    for (const u of claim(Object.keys(NETWORKS), owned)) {
      const { ctx } = await launch(true, u.profile);
      try { await ctx.addCookies(list); } finally { await ctx.close(); }
    }
  } finally { release(owned); }
  log("Imported " + list.length + " cookies for " + [...new Set(list.map((c) => c.domain.replace(/^\.|^www\./g, "")))].join(", "));
}

/** Chrome itself has the profile open (its SingletonLock names a live process), as after a manual launch. */
function chromeHas(profile) {
  try { return P.alive(Number(fs.readlinkSync(path.join(profile, "SingletonLock")).split("-").pop())); } catch (error) { return false; }
}

// A copied profile stays signed in: Playwright's Chrome encrypts cookies with the same key in every profile on this
// Mac. Caches stay out (see pool.js). A network whose check says NOT ready signs in once: agent.js login <network>.
async function cloneProfiles(nets, force, parallel) {
  if (!fs.existsSync(PROFILE)) throw new Error("No main profile yet: node scripts/engagement-browser/agent.js login");
  const owned = [];
  try {
    if (P.lock(lockOf(PROFILE), LOCK_MS)) owned.push(lockOf(PROFILE));
    if (!owned.length || chromeHas(PROFILE)) throw new Error("The main profile is open in a run or in Chrome; quit it or try after the run.");
    for (const k of nets) {
      const dir = path.join(PROFILES, k);
      if (fs.existsSync(dir) && !force) { log(NETWORKS[k].name + ": has its own profile already (--force copies it again)."); continue; }
      if (!P.lock(lockOf(dir), LOCK_MS)) { log(NETWORKS[k].name + ": its profile is in a run or sign-in; skipped."); continue; }
      try {
        if (chromeHas(dir)) { log(NETWORKS[k].name + ": Chrome has its profile open; skipped."); continue; }
        fs.rmSync(dir, { recursive: true, force: true });
        fs.cpSync(PROFILE, dir, { recursive: true, filter: (src) => !P.cloneSkip(path.relative(PROFILE, src)) });
        log(NETWORKS[k].name + ": copied the main profile to " + dir);
      } finally { P.unlock(lockOf(dir)); }
    }
  } finally { release(owned); }
  await check(nets, false, parallel);
  console.log("\nWhere one says NOT ready: node scripts/engagement-browser/agent.js login <network>");
}

// --- run ---------------------------------------------------------------------------------------------------------------

/** A report reply's card (#2466) as a PNG file the reply box can take, or "" when it has none. */
function cardFile(task) {
  if (!task.card || !task.card.png) return "";
  const file = path.join(os.tmpdir(), "qalab-report-card-" + task.key + ".png");
  fs.writeFileSync(file, Buffer.from(task.card.png, "base64"));
  return file;
}

// A comment task (#2452) runs the network's likeComment or replyComment; where a comment is a post (X, Threads) the
// post's own action and already-replied check serve. A comment's answered state came with it from the notifications.
// An owner-tags comment (more, #2633) skips that check: it goes under our own post, beside our earlier comment. An
// owner reply (latest, #2638) first finds the owner's newest post since task.since on their profile (task.url).
async function act(page, task) {
  const net = NETWORKS[task.network];
  const fn = task.chain && net && net[task.action + "Comment"] ? task.action + "Comment" : task.action;
  if (!net || !net[fn]) return { ok: false, error: NETWORKS[task.network] ? net.name + " takes no " + task.action + " here." : "Unknown network." };
  if (task.latest && !net.latest) return { ok: false, error: net.name + " cannot find an account's latest post here." };
  try {
    let t = task;
    let target = null;
    if (task.latest) {
      target = await net.latest(page, task, Date.parse(task.since) || Date.now() - 30 * 86400000);
      if (!target) return { ok: false, none: true, error: "No post of theirs since " + String(task.since || "").slice(0, 10) + " on their profile." };
      t = Object.assign({}, task, target);
    }
    if (fn === "reply" && net.replied && !t.more) {
      const had = await net.replied(page, t);
      if (had) return { ok: false, already: true, url: had.url || "", target };
    }
    return Object.assign({ ok: true, target }, await net[fn](page, t));
  }
  catch (error) {
    const file = await shot(page, task.network + "-" + task.action);
    return { ok: false, retry: error instanceof Refused, error: String(error.message || error).slice(0, 180), shot: file };
  }
}

async function run(opts) {
  const h = bogotaHour();
  if (!opts.force && (h < HOURS[0] || h >= HOURS[1])) { log("Outside " + HOURS.join(":00 to ") + ":00 Bogotá; nothing to do."); return; }
  const owned = [];
  const timer = setTimeout(() => { log("The run took too long; stopping."); release(owned); process.exit(2); }, RUN_MS);
  if (!opts.force) await pause(0, 4 * 60000);
  const nets = pickNets(opts.only).sort(() => Math.random() - 0.5);
  const units = claim(nets, owned);
  if (!units.length) { log("Another run has every network."); clearTimeout(timer); return; }
  const mine = units.flatMap((u) => u.nets);
  const c = readConfig();
  const now = Date.now();
  c.blocked = Object.fromEntries(Object.entries(c.blocked || {}).filter(([, until]) => Date.parse(until) > now));
  const slot = Math.floor(now / 1800000);
  const plan = await api("engagement-mac-sites").catch((error) => { log(error.message); return {}; });
  if (plan.error) log("Reviewed sites: " + plan.error);
  const sites = plan.queries || [];
  const topics = plan.topics || [];
  // Every other run a network searches its topics in another language (#2614); the rest in English.
  const topic = (net, i) => (slot % 2 && topics.length ? topics[(Math.floor(slot / 2) + i * 7) % topics.length] : { q: net.queries[(slot + i * 3) % net.queries.length], lang: "en" });
  const place = (k, i) => {
    const pool = ((plan.groups || {})[k] || []).map((g) => g.q).concat(NETWORKS[k].places || []);
    return pool.length ? pool[(slot + i) % pool.length] : "";
  };
  const seen = { posts: [], reports: [], comments: [], groups: [], errors: {}, signedIn: {}, accounts: {} };
  let done = 0;
  // One network's reads in its profile's page; i is its place in this run's shuffled order, as before.
  const readNet = async (page, k, i) => {
    const net = NETWORKS[k];
    const log = netLog(k);
    const { who, why } = await signedIn(page, k);
    seen.signedIn[k] = !!who;
    if (!who) { seen.errors[k] = why; log(why); return; }
    seen.accounts[k] = who;
    const t = topic(net, i);
    const reads = [net.placesOnly ? "" : t.q, net.places ? place(k, i) : ""].filter(Boolean);
    for (const q of reads) {
      if (c.blocked[k]) break;
      try {
        const posts = await net.read(page, q);
        seen.posts.push(...posts);
        log(net.name + ": read " + posts.length + " for \"" + q + "\"");
        if (!posts.length && q === reads[0]) seen.errors[k] = "Read nothing for \"" + q + "\"; the page may have changed (agent.js check --read).";
      } catch (error) {
        if (error instanceof Refused) c.blocked[k] = new Date(Date.now() + HOLD_MS).toISOString();
        seen.errors[k] = String(error.message || error).slice(0, 180);
        log(net.name + ": " + seen.errors[k] + " (" + await shot(page, k) + ")");
      }
      if (q !== reads[reads.length - 1]) await pause(3000, 9000);
    }
    if (net.groups && !c.blocked[k]) {
      await pause(3000, 9000);
      try {
        const groups = await net.groups(page, t.q);
        seen.groups.push(...groups.map((g) => Object.assign({}, g, { query: t.q, lang: g.lang || t.lang })));
        log(net.name + ": " + groups.length + " groups for \"" + t.q + "\"");
      } catch (error) {
        if (error instanceof Refused) c.blocked[k] = new Date(Date.now() + HOLD_MS).toISOString();
        log(net.name + " group search: " + String(error.message || error).slice(0, 180));
      }
    }
    if (sites.length && !c.blocked[k] && !net.placesOnly) {
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
        log(net.name + ": " + got.length + " comments and replies to us in the notifications");
      } catch (error) {
        if (error instanceof Refused) c.blocked[k] = new Date(Date.now() + HOLD_MS).toISOString();
        log(net.name + " notifications: " + String(error.message || error).slice(0, 180));
      }
    }
    await pause(3000, 9000);
  };
  // One queued task in its network's page, then that network's human pause before its next.
  const actOne = async (page, t) => {
    const log = netLog(t.network);
    if (c.blocked[t.network]) { await api("engagement-mac-result", { key: t.key, action: t.action, ok: false, retry: true, error: "Held after a check." }); return; }
    const card = cardFile(t);
    const img = await downloadImage(t);
    const r = await act(page, Object.assign({}, t, card ? { cardFile: card, alt: t.card.alt } : {}, img.file ? { imageFile: img.file } : {}, img.error ? { imageError: img.error } : {}));
    if (card) fs.rmSync(card, { force: true });
    if (img.file) fs.rmSync(img.file, { force: true });
    if (t.card || t.cardError) Object.assign(r, { card: r.card || "text", cardError: r.cardError || t.cardError || "" });
    if (r.retry) c.blocked[t.network] = new Date(Date.now() + HOLD_MS).toISOString();
    if (r.ok) done += 1;
    await api("engagement-mac-result", { key: t.key, action: t.action, ok: r.ok, url: r.url || "", reaction: r.reaction || "", retry: !!r.retry, already: !!r.already, members: r.members || 0, pending: !!r.pending, rules: r.rules || "", error: r.error || "", card: r.card || "", cardError: r.cardError || "",
      target: r.target || null, none: !!r.none, mentions: r.mentions || [], extras: r.extras || null }).catch((error) => log(error.message));
    const linked = ((r.mentions || []).length ? ", mentions " + r.mentions.filter((m) => m.linked).length + " linked of " + r.mentions.length : "")
      + (r.extras ? ", " + Object.entries(r.extras).map(([k, v]) => k + " " + v).join(", ") : "");
    log(NETWORKS[t.network].name + " " + t.action + " " + ((r.target || {}).url || t.url) + ": " + (r.ok && t.action === "join" ? (r.already ? "already in it" : "joined") + (r.members ? " (" + r.members + " members)" : "") : r.ok ? "done" + (r.reaction ? " (" + r.reaction + ")" : "") + linked + (r.card ? ", card " + r.card + (r.cardError ? " (" + r.cardError + ")" : "") : "") : r.already ? "we had already replied (" + r.url + "), not sent" : r.error + (r.shot ? " (" + r.shot + ")" : "")));
    await pause(25000, 70000);
  };
  // fn(page, k) for each of a profile's networks in one minimized Chrome; a Chrome that fails costs only its networks.
  const inProfiles = (list, fn, onFail) => P.pool(list, opts.parallel, async (u) => {
    const { ctx, page } = await launch(true, u.profile);
    try { for (const k of u.nets) await fn(page, k); } finally { await ctx.close().catch(() => null); }
  }, { stagger }).then((got) => got.forEach((r, j) => {
    if (r.ok) return;
    const why = "Chrome failed on its profile: " + String(r.error.message || r.error).slice(0, 150);
    list[j].nets.forEach((k) => { netLog(k)(why); onFail(k, why); });
  }));
  try {
    await report("running", "Reading " + mine.length + " networks in " + Math.min(opts.parallel, units.length) + " Chromes");
    const order = Object.fromEntries(nets.map((k, i) => [k, i]));
    mine.filter((k) => c.blocked[k]).forEach((k) => { seen.errors[k] = "Held until " + c.blocked[k] + " after a check."; seen.signedIn[k] = true; });
    const toRead = units.map((u) => ({ profile: u.profile, nets: u.nets.filter((k) => !c.blocked[k]) })).filter((u) => u.nets.length);
    await inProfiles(toRead, (page, k) => readNet(page, k, order[k]), (k, why) => { seen.errors[k] = seen.errors[k] || why; });
    const triedRestore = P.restoreList(seen.signedIn, (k) => {
      const u = units.find((x) => x.nets.includes(k));
      return !!(u && P.sessionFor(sessionsOf(u.profile), k));
    });
    if (triedRestore.length) {
      log("Signed out of " + names(triedRestore) + "; putting the last kept sessions back.");
      const back = await putSessions(units, triedRestore);
      const again = units.map((u) => ({ profile: u.profile, nets: u.nets.filter((k) => back.includes(k)) })).filter((u) => u.nets.length);
      await inProfiles(again, async (page, k) => {
        await readNet(page, k, order[k]);
        if (seen.signedIn[k]) netLog(k)(NETWORKS[k].name + ": signed back in from its kept session.");
      }, (k, why) => { seen.errors[k] = why; seen.signedIn[k] = false; });
      triedRestore.filter((k) => !seen.signedIn[k]).forEach((k) => {
        if (!/did not sign it back/.test(seen.errors[k] || "")) seen.errors[k] = (seen.errors[k] || "Not signed in in the agent's Chrome.") + STUCK;
      });
    }
    const took = await api("engagement-mac-ingest", Object.assign({}, seen, { blocked: c.blocked, agent: VERSION, triedRestore }));
    log("Jarvis took " + took.read + " posts: " + took.fresh + " new, " + took.engaged + " to engage, " + took.drafted + " replies drafted" + (took.aiError ? "; Gemini: " + took.aiError : "")
      + (took.chained ? "; " + took.chained + " new comments on our posts and replies" : "")
      + (took.groups && took.groups.groups ? "; groups: " + took.groups.groups + " in our field, " + took.groups.found + " new" : "")
      + (took.students && (took.students.drafted || took.students.invited || took.students.communities) ? "; students: " + took.students.communities + " communities, " + took.students.drafted + " posts to comment, " + took.students.invited + " invites drafted" : "")
      + (took.reports && took.reports.read ? "; reviewed sites: " + took.reports.read + " read, " + took.reports.matched + " name one, " + took.reports.drafted + " invites drafted" : ""));

    const ready = Object.keys(seen.signedIn).filter((k) => seen.signedIn[k] && !c.blocked[k]);
    const q = await api("engagement-mac-queue", { networks: ready });
    if (q.paused) log("Engagement is paused in Jarvis.");
    const tasks = q.tasks.filter((t) => t.action === "reply").concat(q.tasks.filter((t) => t.action !== "reply").sort(() => Math.random() - 0.5)).slice(0, MAX_ACTIONS);
    log("Queue: " + q.tasks.length + " tasks" + (q.live ? "" : " (dry run: only approved replies)") + (q.dry ? ", " + q.dry + " logged as dry" : "") + (q.missed ? ", " + q.missed + " missed" : ""));
    if (tasks.length) await report("running", "Read " + took.read + " posts; acting on " + tasks.length + " tasks");
    const byNet = {};
    tasks.forEach((t) => { byNet[t.network] = (byNet[t.network] || []).concat(t); });
    const toAct = units.map((u) => ({ profile: u.profile, nets: u.nets.filter((k) => byNet[k]) })).filter((u) => u.nets.length);
    await inProfiles(toAct, async (page, k) => { for (const t of byNet[k]) await actOne(page, t); }, (k, why) => byNet[k].forEach((t) => api("engagement-mac-result", { key: t.key, action: t.action, ok: false, retry: true, error: why }).catch((error) => log(error.message))));
    const out = Object.keys(seen.signedIn).filter((k) => !seen.signedIn[k]);
    const ask = out.length ? (out.some((k) => triedRestore.includes(k)) ? "Signed out of " + names(out) + " after the kept session; sign in with agent.js login. " : "Sign in to " + names(out) + " in the agent's Chrome (agent.js login). ") : "";
    await report(out.length ? "waiting" : "done", ask + "Read " + took.read + " posts, did " + done + " tasks", out.length > 0);
  } catch (error) {
    await report("failed", String(error.message || error).slice(0, 150));
    throw error;
  } finally {
    units.forEach((u) => keepSessions(u.profile, u.nets.filter((k) => seen.accounts[k])));
    const stored = readConfig();
    writeConfig(Object.assign(stored, P.mergeHeld(stored, c, mine), { lastRun: new Date().toISOString() }));
    clearTimeout(timer);
    release(owned);
  }
}

// --- install -----------------------------------------------------------------------------------------------------------

function install(parallel) {
  fs.mkdirSync(APP, { recursive: true });
  fs.readdirSync(__dirname).filter((f) => f.endsWith(".js")).forEach((f) => fs.copyFileSync(path.join(__dirname, f), path.join(APP, f)));
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
  <key>EnvironmentVariables</key><dict><key>PATH</key><string>/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin</string><key>ENGAGEMENT_PARALLEL</key><string>${parallel}</string></dict>
  <key>StandardOutPath</key><string>${path.join(LOGS, "agent.log")}</string>
  <key>StandardErrorPath</key><string>${path.join(LOGS, "agent.log")}</string>
</dict>
</plist>
`);
  const uid = process.getuid();
  try { execFileSync("launchctl", ["bootout", "gui/" + uid + "/" + LABEL], { stdio: "ignore" }); } catch (error) { /* not loaded */ }
  execFileSync("launchctl", ["bootstrap", "gui/" + uid, PLIST]);
  log("Installed " + LABEL + ": every 30 minutes, " + HOURS.join(":00 to ") + ":00 Bogotá, up to " + parallel + " Chromes at once; logs in " + path.join(LOGS, "agent.log"));
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
  const own = Object.keys(NETWORKS).filter((k) => profileOf(k) !== PROFILE);
  console.log("profiles:  " + (own.length ? "own for " + names(own) : "none of their own") + (own.length < Object.keys(NETWORKS).length ? "; main for " + names(Object.keys(NETWORKS).filter((k) => !own.includes(k))) : ""));
  const busy = Object.keys(NETWORKS).filter((k) => P.held(lockOf(profileOf(k)), LOCK_MS));
  console.log("busy now:  " + (busy.length ? names(busy) : "none"));
  console.log("log:       " + path.join(LOGS, "agent.log") + " (and <network>.log)");
}

async function main() {
  const { n: parallel, rest: args } = P.parallelArg(process.argv.slice(2), process.env);
  const [cmd, ...rest] = args;
  const flag = (f) => rest.includes(f);
  const arg = rest.find((a) => !a.startsWith("--"));
  if (cmd === "pair") return pair();
  if (cmd === "login") return login(pickNets(arg), parallel);
  if (cmd === "check") return check(pickNets(arg), flag("--read"), parallel);
  if (cmd === "import") return importCookies(arg);
  if (cmd === "restore-sessions") return restoreSessions(pickNets(arg), parallel);
  if (cmd === "run") return run({ force: flag("--force"), only: arg, parallel });
  if (cmd === "clone-profiles") return cloneProfiles(pickNets(arg), flag("--force"), parallel);
  if (cmd === "install") return install(parallel);
  if (cmd === "uninstall") return uninstall();
  if (cmd === "status") return status();
  if (cmd === "setup") {
    if (!readConfig().token) await pair();
    install(parallel);
    await login(Object.keys(NETWORKS), parallel);
    return cloneProfiles(Object.keys(NETWORKS), false, parallel);
  }
  const src = fs.readFileSync(__filename, "utf8").split("\n");
  console.log(src.slice(2, src.indexOf(" */") + 1).join("\n"));
  return null;
}

main().catch((error) => { log(String((error && error.stack) || error)); process.exitCode = 1; });
