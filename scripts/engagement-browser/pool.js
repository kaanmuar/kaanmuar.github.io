"use strict";
/*
 * The browser agent's scheduling (#3141). A network runs in its own Chrome profile once `agent.js clone-profiles` made
 * one, else in the shared main profile; a lock per profile keeps two runs (or a run and a login) out of one profile,
 * since Chrome cannot open a profile twice; and a pool runs up to N profiles at once, their starts a human pace apart.
 */
const fs = require("fs");
const path = require("path");

const MAX_PARALLEL = 8;
const DEFAULT_PARALLEL = 3;

/** Networks grouped by the profile they run in, in the order given: [{ profile, nets }]. */
function groups(nets, profileOf) {
  const out = new Map();
  nets.forEach((k) => { const p = profileOf(k); out.set(p, (out.get(p) || []).concat(k)); });
  return [...out].map(([profile, list]) => ({ profile, nets: list }));
}

const alive = (pid) => {
  try { process.kill(pid, 0); return true; } catch (error) { return error.code === "EPERM"; }
};

/** Whether the lock dir is held: by a live process when it names one, else for staleMs after it was taken. */
function held(dir, staleMs, now) {
  let stat;
  try { stat = fs.statSync(dir); } catch (error) { return false; }
  const pid = Number((() => { try { return fs.readFileSync(path.join(dir, "pid"), "utf8"); } catch (error) { return ""; } })());
  if (pid > 0) return alive(pid);
  return (now || Date.now()) - stat.mtimeMs < staleMs;
}

/** Takes the lock dir for this process; a crashed run's lock is taken over. False while another holds it. */
function lock(dir, staleMs, now) {
  fs.mkdirSync(path.dirname(dir), { recursive: true });
  for (let i = 0; i < 2; i += 1) {
    try {
      fs.mkdirSync(dir);
      fs.writeFileSync(path.join(dir, "pid"), String(process.pid));
      return true;
    } catch (error) {
      if (error.code !== "EEXIST" || held(dir, staleMs, now)) return false;
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }
  return false;
}

const unlock = (dir) => fs.rmSync(dir, { recursive: true, force: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * fn(item, i) for every item, at most n at once; each start waits stagger() ms after the one before. Never rejects:
 * [{ ok, value } | { ok: false, error }] in the items' order.
 */
async function pool(items, n, fn, opts) {
  const o = opts || {};
  const wait = o.sleep || sleep;
  const out = new Array(items.length);
  let next = 0;
  let gate = Promise.resolve();
  const worker = async () => {
    while (next < items.length) {
      const i = next;
      next += 1;
      const turn = gate;
      let open;
      gate = new Promise((r) => { open = r; });
      await turn;
      if (i > 0 && o.stagger) await wait(o.stagger());
      open();
      try { out[i] = { ok: true, value: await fn(items[i], i) }; } catch (error) { out[i] = { ok: false, error }; }
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(n, items.length)) }, worker));
  return out;
}

/** How many at once: --parallel N or --parallel=N, else the env variable (ENGAGEMENT_PARALLEL), else 3; and the other args. */
function parallelArg(args, env, name) {
  const rest = [];
  let n = Number((env || {})[name || "ENGAGEMENT_PARALLEL"]) || DEFAULT_PARALLEL;
  for (let i = 0; i < args.length; i += 1) {
    const m = /^--parallel(?:=(.*))?$/.exec(args[i]);
    if (!m) { rest.push(args[i]); continue; }
    const v = m[1] !== undefined ? m[1] : args[(i += 1)];
    n = Number(v) || n;
  }
  return { n: Math.max(1, Math.min(MAX_PARALLEL, Math.floor(n))), rest };
}

/** The holds and inbox times to save: other runs' networks as the file has them now, this run's as it left them. */
function mergeHeld(stored, mine, owned) {
  const take = (from, keep) => Object.fromEntries(Object.entries(from || {}).filter(([k]) => keep(k)));
  const ours = (k) => owned.includes(k);
  return {
    blocked: Object.assign(take(stored.blocked, (k) => !ours(k)), take(mine.blocked, ours)),
    inboxAt: Object.assign(take(stored.inboxAt, (k) => !ours(k)), take(mine.inboxAt, ours))
  };
}

// Caches, crash reports and Chrome's own open-profile locks; the rest (cookies, local storage, IndexedDB) is copied.
const SKIP = new Set(["Cache", "Code Cache", "GPUCache", "DawnCache", "DawnGraphiteCache", "DawnWebGPUCache", "GrShaderCache", "GraphiteDawnCache",
  "ShaderCache", "CacheStorage", "ScriptCache", "component_crx_cache", "Crashpad", "BrowserMetrics", "optimization_guide_model_store", "Safe Browsing"]);

/** Whether a path inside the main profile (relative to it) stays out of a clone. */
function cloneSkip(rel) {
  const parts = String(rel).split(path.sep).filter(Boolean);
  return parts.some((p) => SKIP.has(p) || /^Singleton/.test(p) || /^BrowserMetrics/.test(p));
}

// --- kept sessions (#3163) ---------------------------------------------------------------------------------------------
// A Chrome outside Playwright on a profile cannot read the agent's cookies (Playwright's mock keychain key) and drops
// every session, so each profile's cookie store is copied while its networks read signed in, for restore-sessions.
// Telegram's sign-in lives in local storage, not cookies (#3436), so those stores are copied too and put back only
// into a profile of that network's own.
const STORES = ["Local Storage", "IndexedDB", "Session Storage"];

const SESSION_GAP = 6 * 3600000;
const SESSION_KEEP = 8;
const HOSTS = {
  x: ["x.com", "twitter.com"], linkedin: ["linkedin.com"], facebook: ["facebook.com"], instagram: ["instagram.com"],
  threads: ["threads.com", "threads.net"], tiktok: ["tiktok.com"], reddit: ["reddit.com"], telegram: ["telegram.org"]
};

/** Whether a cookie's domain belongs to network k (or, with no k, to any of the agent's networks). */
function cookieOf(domain, k) {
  const d = String(domain || "").replace(/^\./, "").toLowerCase();
  return (k ? HOSTS[k] || [] : Object.values(HOSTS).flat()).some((h) => d === h || d.endsWith("." + h));
}

/** A profile's kept copies under dir, newest first: [{ dir, at, nets }]. */
function sessionCopies(dir) {
  let list = [];
  try { list = fs.readdirSync(dir); } catch (error) { return []; }
  return list.map((n) => {
    try { return Object.assign({ dir: path.join(dir, n) }, JSON.parse(fs.readFileSync(path.join(dir, n, "nets.json"), "utf8"))); } catch (error) { return null; }
  }).filter((c) => c && Array.isArray(c.nets)).sort((a, b) => String(b.at).localeCompare(String(a.at)));
}

/** The newest SESSION_KEEP copies stay, and each network's newest copy however old. */
function pruneSessions(dir, keep) {
  const seen = new Set();
  sessionCopies(dir).forEach((c, i) => {
    const only = c.nets.filter((k) => !seen.has(k));
    c.nets.forEach((k) => seen.add(k));
    if (i >= (keep || SESSION_KEEP) && !only.length) fs.rmSync(c.dir, { recursive: true, force: true });
  });
}

/**
 * Copies a closed profile's cookie store into dir/<time> with the networks just seen signed in there; at most one copy
 * per gapMs unless more networks are signed in than in the newest. The copy's dir, or "" when none was made.
 */
function saveSessions(profile, dir, nets, now, gapMs) {
  const t = now || Date.now();
  const src = path.join(profile, "Default", "Cookies");
  const last = sessionCopies(dir)[0];
  if (!nets.length || !fs.existsSync(src)) return "";
  if (last && t - Date.parse(last.at) < (gapMs || SESSION_GAP) && nets.every((k) => last.nets.includes(k))) return "";
  const at = new Date(t).toISOString();
  const out = path.join(dir, at.replace(/[:.]/g, "-"));
  fs.mkdirSync(out, { recursive: true });
  ["Default/Cookies", "Default/Cookies-journal", "Local State"].forEach((f) => {
    if (fs.existsSync(path.join(profile, f))) fs.copyFileSync(path.join(profile, f), path.join(out, path.basename(f)));
  });
  STORES.forEach((name) => {
    const src = path.join(profile, "Default", name);
    if (fs.existsSync(src)) fs.cpSync(src, path.join(out, name), { recursive: true });
  });
  fs.writeFileSync(path.join(out, "nets.json"), JSON.stringify({ at, nets }));
  pruneSessions(dir);
  return out;
}

/** The newest copy in which network k read signed in, or null. */
const sessionFor = (dir, k) => sessionCopies(dir).find((c) => c.nets.includes(k)) || null;

/** Networks that read signed out and still have a kept copy (`has(k)`). A run puts those back before it reports them. */
function restoreList(signedIn, has) {
  return Object.keys(signedIn || {}).filter((k) => signedIn[k] === false && has(k));
}

/** Puts a copy's Local Storage, IndexedDB and Session Storage into a profile. How many stores it put back. */
function putStores(profile, copyDir) {
  let n = 0;
  STORES.forEach((name) => {
    const src = path.join(copyDir, name);
    if (!fs.existsSync(src)) return;
    const to = path.join(profile, "Default", name);
    fs.rmSync(to, { recursive: true, force: true });
    fs.cpSync(src, to, { recursive: true });
    n += 1;
  });
  return n;
}

module.exports = { groups, held, lock, unlock, pool, parallelArg, mergeHeld, cloneSkip, alive, cookieOf, sessionCopies, saveSessions, pruneSessions, sessionFor, restoreList, putStores, HOSTS, MAX_PARALLEL, DEFAULT_PARALLEL, SESSION_GAP, SESSION_KEEP };
