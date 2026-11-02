#!/usr/bin/env node
"use strict";
/*
 * The Mac browser agent for Jarvis > Engagement (#1991). launchd runs it every 5 minutes (run.sh install):
 *
 *   1. Sign in on the Mac, pressed in Jarvis (engagement_private/mac_login): opens that network's sign-in in the
 *      agent's own Chrome, on screen, and waits up to 10 minutes for Carlos to sign in as the brand.
 *   2. Carries the scout's plan out on X, LinkedIn, Facebook, Instagram, Threads and TikTok: the same carryOut as
 *      the API poster (functions/engagement-act.js), with clients that click in Chrome (networks.js). A dry run
 *      (Go live off) only logs likes, reposts and follows; approved replies post.
 *   3. Every READ_EVERY reads one search per signed-in network into engagement_inbox/<ISO>; the next cloud scout
 *      run scores it, asks Gemini, plans, and pushes reply drafts like any other network.
 *   4. Checks in at engagement_private/mac: when, which networks are signed in and as whom, errors, what it did.
 *
 * Chrome is Google Chrome with its own profile (STATE/chrome), started in the background with a DevTools port and
 * driven over CDP, so it is not marked as automated and does not keep the focus. A pause in Jarvis stops 2 and 3.
 *
 *   node scripts/engagement-mac/agent.js [--state <dir>]        one pass
 *   node scripts/engagement-mac/agent.js --login <network>      sign in now, on screen
 *   node scripts/engagement-mac/agent.js --probe <network> [q]  read one search and print it (no Firestore)
 */
const fs = require("fs");
const os = require("os");
const path = require("path");
const Module = require("module");
const { execFileSync, execSync } = require("child_process");

const ROOT = path.join(__dirname, "..", "..");
const FN = path.join(ROOT, "functions");
const E = require(path.join(FN, "engagement"));
const Act = require(path.join(FN, "engagement-act"));
const { NETWORKS } = require("./networks");

const PROJECT = "carlosm-interactive-cv";
const READ_EVERY = 30 * 60 * 1000;
const LOGIN_WAIT = 10 * 60 * 1000;
const LOGIN_FRESH = 30 * 60 * 1000;
const PER_RUN = 8;
const GAP = 9000;
const PER_INBOX = 30;
const STATE = path.join(os.homedir(), "Library", "Application Support", "QALab", "engagement-mac");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const jitter = (ms) => sleep(Math.round(ms * (0.7 + Math.random() * 0.8)));
const log = (...a) => console.log(new Date().toISOString(), ...a);

function load(name) {
  const bases = [path.join(ROOT, "index.js"), path.join(FN, "index.js")];
  if (process.env.ENGAGEMENT_MAC_DEPS) bases.unshift(path.join(process.env.ENGAGEMENT_MAC_DEPS, "index.js"));
  for (const base of bases) {
    try { return Module.createRequire(base)(name); } catch (error) { /* next */ }
  }
  throw new Error("Cannot find " + name + ": run npm ci in the repo (run.sh does it).");
}

function firestore() {
  const { Firestore, FieldValue } = load("@google-cloud/firestore");
  const { OAuth2Client } = load("google-auth-library");
  const authClient = new OAuth2Client({ quotaProjectId: PROJECT });
  authClient.setCredentials({ access_token: execSync("gcloud auth print-access-token", { encoding: "utf8" }).trim(), expiry_date: Date.now() + 45 * 60000 });
  return { db: new Firestore({ projectId: PROJECT, authClient }), inc: (n) => FieldValue.increment(n) };
}

// --- Chrome -------------------------------------------------------------------------------------------------------

function frontApp() {
  try { return (execFileSync("lsappinfo", ["info", "-only", "bundlepath", execFileSync("lsappinfo", ["front"], { encoding: "utf8" }).trim()], { encoding: "utf8" }).match(/(?:LSBundlePath"?|bundle path)="([^"]+)"/) || [])[1] || ""; }
  catch (error) { return ""; }
}

/** Google Chrome on the agent's profile, over CDP. visible: on screen and in front (sign-in); otherwise off screen, focus handed back. */
async function openChrome(state, visible) {
  const { chromium } = load("playwright-core");
  const profile = path.join(state, "chrome");
  fs.mkdirSync(profile, { recursive: true });
  const portFile = path.join(profile, "DevToolsActivePort");
  const connect = async () => {
    const port = fs.existsSync(portFile) ? fs.readFileSync(portFile, "utf8").split("\n")[0] : "";
    return port ? chromium.connectOverCDP("http://127.0.0.1:" + port, { timeout: 4000 }).catch(() => null) : null;
  };
  let browser = await connect();
  if (!browser) {
    const front = visible ? "" : frontApp();
    try { fs.unlinkSync(portFile); } catch (error) { /* none */ }
    execFileSync("open", (visible ? [] : ["-g"]).concat(["-n", "-a", "Google Chrome", "--args", "--user-data-dir=" + profile, "--remote-debugging-port=0",
      "--no-first-run", "--no-default-browser-check", "--lang=en-US", "--accept-lang=en-US,en", "--window-size=1280,900",
      visible ? "--window-position=80,60" : "--window-position=-3000,-3000", "about:blank"]));
    for (let i = 0; i < 40 && !browser; i += 1) { await sleep(500); browser = await connect(); }
    if (!browser) throw new Error("Chrome did not open its DevTools port.");
    if (front && !/Google Chrome/.test(front)) { try { execFileSync("open", ["-a", front]); } catch (error) { /* stays */ } }
  }
  const context = browser.contexts()[0];
  const page = context.pages()[0] || await context.newPage();
  page.setDefaultTimeout(15000);
  return {
    browser, context, page,
    async cookies() {
      const jar = await context.cookies(Object.values(NETWORKS).map((n) => "https://www." + n.cookie[0] + "/")).catch(() => []);
      return Object.fromEntries(Object.entries(NETWORKS).map(([k, n]) => [k, jar.some((c) => c.domain.endsWith(n.cookie[0]) && c.name === n.cookie[1] && c.value && (c.expires < 0 || c.expires * 1000 > Date.now()))]));
    },
    async close() { const s = await context.newCDPSession(page).catch(() => null); if (s) await s.send("Browser.close").catch(() => null); await browser.close().catch(() => null); }
  };
}

// --- One pass -----------------------------------------------------------------------------------------------------

const privateRef = (db, id) => db.collection("engagement_private").doc(id);

function version() {
  try { return execFileSync("git", ["-C", ROOT, "rev-parse", "--short", "HEAD"], { encoding: "utf8" }).trim(); } catch (error) { return ""; }
}

/** Sign-in on screen: waits for the network's session cookie, then reads who it is. */
async function signIn(state, network, opts) {
  const n = (opts.networks || NETWORKS)[network];
  const chrome = await (opts.open || openChrome)(state, true);
  try {
    await chrome.page.goto((await chrome.cookies())[network] ? n.home : n.login, { waitUntil: "domcontentloaded" }).catch(() => null);
    const end = Date.now() + (opts.wait || LOGIN_WAIT);
    while (Date.now() < end) {
      if ((await chrome.cookies())[network]) { await (opts.sleep || sleep)(4000); return (await n.account(chrome.page).catch(() => "")) || "signed in"; }
      await (opts.sleep || sleep)(5000);
    }
    return "";
  } finally { await chrome.close(); }
}

/**
 * deps: { db, now, inc, state, open (state, visible) => chrome, host, version; networks, sleep and loginWait for tests }. Returns the check-in it wrote.
 */
async function runOnce(deps) {
  const { db, now } = deps;
  const prior = await Act.macStatus(db);
  const conf = E.settings((await db.collection("jarvis_settings").doc("engagement").get()).data() || null);
  const me = {
    at: new Date(now).toISOString(), host: deps.host || os.hostname(), version: deps.version || "", readAt: prior.readAt || "",
    signedIn: Object.assign({}, prior.signedIn || {}), signedInAt: Object.assign({}, prior.signedInAt || {}), errors: {}, acted: {}, read: prior.read || {}, paused: conf.paused, live: conf.live
  };
  const open = deps.open || openChrome;
  const nets = deps.networks || NETWORKS;

  const ask = await privateRef(db, "mac_login").get();
  if (ask.exists) {
    const { network, at } = ask.data();
    await ask.ref.delete();
    if (nets[network] && now - Number(at) < LOGIN_FRESH) {
      log("sign-in", network);
      const who = await signIn(deps.state, network, { open: deps.open, wait: deps.loginWait, networks: nets, sleep: deps.sleep });
      if (who) { me.signedIn[network] = who; me.signedInAt[network] = new Date(Date.now()).toISOString(); }
      else me.errors[network] = "The sign-in was not finished within 10 minutes. Press Sign in on the Mac again.";
    }
  }

  let chrome = null;
  const page = async () => {
    if (chrome) return chrome.page;
    chrome = await open(deps.state, false);
    const jar = await chrome.cookies();
    Object.keys(nets).forEach((k) => {
      if (!jar[k] && me.signedIn[k]) { delete me.signedIn[k]; me.errors[k] = nets[k].name + " signed the Mac out. Press Sign in on the Mac again."; }
      else if (jar[k] && !me.signedIn[k]) me.signedIn[k] = "signed in";
    });
    return chrome.page;
  };

  try {
    if (!conf.paused) {
      const side = {
        networks: Act.BROWSER, perRun: PER_RUN, gap: GAP,
        creds: async () => Object.fromEntries(Object.entries(me.signedIn).filter(([k, v]) => v && Act.BROWSER.includes(k)).map(([k, v]) => [k, { account: v }])),
        open: async (d, network) => {
          const p = await page();
          if (!me.signedIn[network]) throw new Act.ActError(nets[network].name + " is not signed in on the Mac.", true);
          const n = nets[network];
          const act = (a) => (n[a] ? (doc) => n[a](p, doc) : async () => { throw new Act.ActError(n.name + " has no " + a + " here."); });
          return { account: me.signedIn[network], like: act("like"), repost: act("repost"), follow: act("follow"), reply: (doc, text) => n.reply(p, doc, text) };
        },
        noteError: async (x, network, message) => { me.errors[network] = me.errors[network] || String(message).slice(0, 200); },
        clearError: async () => null
      };
      me.acted = await Act.carryOut(Object.assign({ sleep: deps.sleep || jitter }, deps), conf, side);
      log("acted", JSON.stringify(me.acted));

      if (now - (Date.parse(me.readAt) || 0) >= READ_EVERY) {
        await page();
        const slot = Math.floor(now / READ_EVERY);
        const got = { at: me.at, posts: [], read: {}, errors: {} };
        for (const k of Act.BROWSER.filter((x) => me.signedIn[x])) {
          const n = nets[k];
          const q = n.queries[slot % n.queries.length];
          try {
            const posts = (await n.read(chrome.page, q)).slice(0, PER_INBOX).map((p) => Object.assign(p, { text: p.text.slice(0, 1500) }));
            got.posts.push(...posts);
            got.read[k] = posts.length;
          } catch (error) {
            got.errors[k] = String(error.message || error).split("\n")[0].slice(0, 200);
            if (error.fatal) me.errors[k] = got.errors[k];
          }
          await (deps.sleep || jitter)(4000);
        }
        await db.collection("engagement_inbox").doc(me.at).set(got);
        me.readAt = me.at;
        me.read = got.read;
        log("read", JSON.stringify(got.read), JSON.stringify(got.errors));
      }
    }
  } finally {
    if (chrome) await chrome.close();
  }
  if (!chrome) Object.keys(prior.errors || {}).forEach((k) => { if (!(k in me.errors) && me.signedIn[k]) me.errors[k] = prior.errors[k]; });
  await privateRef(db, "mac").set(me);
  return me;
}

// --- CLI ----------------------------------------------------------------------------------------------------------

function locked(state) {
  const file = path.join(state, "agent.lock");
  try {
    const pid = Number(fs.readFileSync(file, "utf8"));
    if (pid && pid !== process.pid) { process.kill(pid, 0); return true; }
  } catch (error) { /* free */ }
  fs.writeFileSync(file, String(process.pid));
  process.on("exit", () => { try { fs.unlinkSync(file); } catch (error) { /* gone */ } });
  return false;
}

async function main(argv) {
  const arg = (name) => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] || "" : null; };
  const state = arg("--state") || STATE;
  fs.mkdirSync(state, { recursive: true });
  const probe = arg("--probe");
  if (probe) {
    const n = NETWORKS[probe];
    if (!n) throw new Error("Networks: " + Object.keys(NETWORKS).join(", "));
    const chrome = await openChrome(state, false);
    const q = argv[argv.indexOf("--probe") + 2];
    try { const posts = await n.read(chrome.page, q && !q.startsWith("--") ? q : n.queries[0]); console.log(JSON.stringify(posts, null, 1)); console.log(posts.length, "posts"); }
    finally { await chrome.close(); }
    return;
  }
  if (locked(state)) { log("another pass is running"); return; }
  const { db, inc } = firestore();
  const login = arg("--login");
  if (login) await privateRef(db, "mac_login").set({ network: login, at: Date.now() });
  const me = await runOnce({ db, inc, now: Date.now(), state, version: version() });
  log("checked in", JSON.stringify({ signedIn: me.signedIn, errors: me.errors }));
}

if (require.main === module) main(process.argv.slice(2)).then(() => process.exit(0), (error) => { console.error(new Date().toISOString(), error && error.stack || error); process.exit(1); });

module.exports = { runOnce, signIn, openChrome, READ_EVERY, PER_RUN };
