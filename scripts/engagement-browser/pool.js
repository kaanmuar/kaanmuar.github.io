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

module.exports = { groups, held, lock, unlock, pool, parallelArg, mergeHeld, cloneSkip, alive, MAX_PARALLEL, DEFAULT_PARALLEL };
