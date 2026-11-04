#!/usr/bin/env node
"use strict";
/*
 * The Mac's GitHub reporter for Jarvis > GitHub (#2526). Every 5 minutes launchd runs it: it uploads the local
 * worktrees and their chat locks, the work log, Cursor cost, kaanmuar's API budget and the results of the last
 * queued actions to the jarvis op `github-local`, then runs what Jarvis queued (remove a merged worktree, never
 * with --force; prune branches). It signs with the engagement agent's pairing token (scripts/engagement-browser).
 *
 *   node scripts/github-local-report.js              one run now
 *   node scripts/github-local-report.js --dry-run    print the payload; no upload, no actions
 *   node scripts/github-local-report.js --install    launchd job every 5 minutes (logs in ~/Library/Logs)
 *   node scripts/github-local-report.js --uninstall
 */
const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync } = require("child_process");

const REPO = "kaanmuar/kaanmuar.github.io";
const DEFAULT_ROOT = "/Users/Apple/Documents/GitHub/kaanmuar.github.io";
const ENDPOINT = "https://us-central1-carlosm-interactive-cv.cloudfunctions.net/jarvis";
const PAIR_CONFIG = path.join(os.homedir(), "Library/Application Support/QALab/engagement-browser/config.json");
const USAGE_DIR = path.join(os.homedir(), "Library/Application Support/Cursor/AgentStores/cursor_agent_stores/u452212433/files/cursor-usage");
const RESULTS = path.join(os.homedir(), ".config/qa-lab/github-local-results.json");
const LABEL = "com.carlosandmunoz.github-local";
const PLIST = path.join(os.homedir(), "Library/LaunchAgents", LABEL + ".plist");
const LOG = path.join(os.homedir(), "Library/Logs/github-local-report.log");
const APP = path.join(os.homedir(), "Library/Application Support/QALab/github-local");
const STALE_S = 1800;
const DAY = 86400000;
const KEEP_DAYS = 90;

const log = (...a) => console.log(new Date().toISOString(), ...a);
const run = (cmd, args, opts) => execFileSync(cmd, args, Object.assign({ encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], maxBuffer: 32 << 20 }, opts));
const readJson = (file, fallback) => { try { return JSON.parse(fs.readFileSync(file, "utf8")); } catch (error) { return fallback; } };
const iso = (s) => (s ? new Date(Number(s) * 1000).toISOString() : null);
const cents = (n) => (typeof n === "number" ? Math.round(n) / 100 : null);
const ticketOf = (t) => { const s = String(t || "").trim(); return /^#?\d+$/.test(s) ? Number(s.replace("#", "")) : s; };
const OPEN_SPAN = 12 * 3600000;

// --- pure ------------------------------------------------------------------------------------------------------------

/** `git worktree list --porcelain` -> [{ path, head, branch, detached, bare, prunable }]. */
function parseWorktrees(porcelain) {
  const out = [];
  let cur = null;
  for (const line of String(porcelain || "").split("\n")) {
    if (line.startsWith("worktree ")) { cur = { path: line.slice(9), head: "", branch: "", detached: false, bare: false, prunable: false }; out.push(cur); continue; }
    if (!cur) continue;
    if (line.startsWith("HEAD ")) cur.head = line.slice(5);
    else if (line.startsWith("branch ")) cur.branch = line.slice(7).replace(/^refs\/heads\//, "");
    else if (line === "detached") cur.detached = true;
    else if (line === "bare") cur.bare = true;
    else if (line.startsWith("prunable")) cur.prunable = true;
  }
  return out;
}

/** A chat-lock file (scripts/worktree-lock.sh) -> { locked, chat, heartbeat (epoch s), previous, alive }. */
function parseLock(text, now) {
  const get = (k) => { const m = String(text || "").match(new RegExp("^" + k + "=(.*)$", "m")); return m ? m[1].trim() : ""; };
  const chat = get("chat");
  const heartbeat = Number(get("heartbeat")) || 0;
  const nowS = Math.floor((now instanceof Date ? now.getTime() : now || Date.now()) / 1000);
  return { locked: !!chat, chat, heartbeat: heartbeat || null, previous: get("previous"), alive: !!chat && heartbeat > 0 && nowS - heartbeat < STALE_S };
}

/** RFC 4180 CSV (quoted fields, "" escapes, newlines inside quotes) -> rows keyed by the header. */
function parseCsv(text) {
  const rows = [];
  let row = [], field = "", quoted = false;
  const s = String(text || "").replace(/^\uFEFF/, "");
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (quoted) {
      if (c === '"' && s[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && s[i + 1] === "\n") i++;
      row.push(field); rows.push(row); row = []; field = "";
    } else field += c;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  const [head, ...body] = rows;
  if (!head) return [];
  return body.filter((r) => r.some((v) => v !== "")).map((r) => Object.fromEntries(head.map((h, i) => [h.trim(), r[i] === undefined ? "" : r[i]])));
}

/** work-log.csv -> [{ start, end, ticket, title, chat }] for work started in the last 90 days; end is null while open. */
function usageRows(csvText, now) {
  const cutoff = (now instanceof Date ? now.getTime() : now || Date.now()) - KEEP_DAYS * DAY;
  return parseCsv(csvText)
    .filter((r) => r.start_utc && Date.parse(r.start_utc) >= cutoff)
    .map((r) => ({ start: r.start_utc, end: r.end_utc || null, ticket: ticketOf(r.ticket), title: r.title || "", chat: r.chat_id || "" }));
}

/** quota-cache.json (cents, as quota.py reads it) -> { cycleStart, onDemandUsd, limitUsd }. */
function costFrom(quotaJson) {
  const d = (quotaJson && quotaJson.data) || {};
  const mine = (d.individualUsage && d.individualUsage.onDemand) || {};
  const team = (d.teamUsage && d.teamUsage.onDemand) || {};
  const pick = (k) => (typeof mine[k] === "number" && mine[k] > 0 ? mine[k] : typeof team[k] === "number" && team[k] > 0 ? team[k] : null);
  const used = (mine.used || 0) + (team.used || 0);
  return { cycleStart: d.billingCycleStart || null, onDemandUsd: d.individualUsage || d.teamUsage ? cents(used) : null, limitUsd: cents(pick("limit")) };
}

/** Cursor's usage-events CSV joined to the work log as report.py does: each event inside a work row's span counts for its ticket. */
function ticketCosts(eventsCsv, usage, now) {
  const events = parseCsv(eventsCsv).map((e) => ({ at: Date.parse(e.Date), cost: Number(e.Cost) || 0 })).filter((e) => e.at && e.cost);
  events.sort((a, b) => a.at - b.at);
  const end = now instanceof Date ? now.getTime() : now || Date.now();
  const totals = new Map();
  for (const w of usage) {
    if (w.ticket === "") continue;
    // A row never closed would otherwise claim every later event.
    const from = Date.parse(w.start), to = w.end ? Date.parse(w.end) : Math.min(end, from + OPEN_SPAN);
    let sum = 0;
    for (const e of events) { if (e.at > to) break; if (e.at >= from) sum += e.cost; }
    if (sum) totals.set(w.ticket, (totals.get(w.ticket) || 0) + sum);
  }
  return [...totals].map(([ticket, cost]) => ({ ticket, costUsd: Math.round(cost * 100) / 100 })).sort((a, b) => b.costUsd - a.costUsd);
}

/** `gh api rate_limit` -> { graphql:{used,limit,reset}, core:{...} }, reset as an ISO time. */
function rateFrom(ghJson) {
  const r = (ghJson && ghJson.resources) || {};
  const one = (x) => (x ? { used: x.used, limit: x.limit, reset: iso(x.reset) } : null);
  return { graphql: one(r.graphql), core: one(r.core) };
}

/** May Jarvis's remove-worktree item remove this worktree? { ok, why, path }. Never the main checkout, a live chat's or a dirty one. */
function safeToRemove(item, worktree, root) {
  const base = path.join(root, ".worktrees");
  const target = item && item.target ? (path.isAbsolute(item.target) ? path.resolve(item.target) : path.resolve(base, item.target)) : "";
  const rel = path.relative(base, target);
  if (!target || !rel || rel.startsWith("..") || path.isAbsolute(rel) || rel.includes(path.sep)) return { ok: false, why: "Not a worktree under " + base + ".", path: target };
  if (!worktree || path.resolve(worktree.path) !== target) return { ok: false, why: "No such worktree.", path: target };
  if (worktree.alive) return { ok: false, why: "Chat " + worktree.chat + " still works there.", path: target };
  if (worktree.dirty !== false) return { ok: false, why: worktree.dirty ? "It has uncommitted changes." : "Its git status did not answer.", path: target };
  return { ok: true, why: "", path: target };
}

// --- collect ---------------------------------------------------------------------------------------------------------

function repoRoot() {
  if (process.env.GITHUB_LOCAL_REPO) return process.env.GITHUB_LOCAL_REPO;
  try { return path.dirname(run("git", ["-C", __dirname, "rev-parse", "--path-format=absolute", "--git-common-dir"]).trim()); } catch (error) { return DEFAULT_ROOT; }
}

function gitDirOf(wtPath, root) {
  try {
    const dotGit = path.join(wtPath, ".git");
    if (fs.statSync(dotGit).isDirectory()) return dotGit;
    const m = fs.readFileSync(dotGit, "utf8").match(/^gitdir:\s*(.+)$/m);
    return m ? path.resolve(wtPath, m[1].trim()) : null;
  } catch (error) { return path.resolve(root) === path.resolve(wtPath) ? path.join(root, ".git") : null; }
}

function worktrees(root, now) {
  return parseWorktrees(run("git", ["-C", root, "worktree", "list", "--porcelain"])).filter((w) => !w.bare).map((w) => {
    let dirty = null;
    if (!w.prunable) { try { dirty = run("git", ["-C", w.path, "status", "--porcelain"], { timeout: 5000 }).trim() !== ""; } catch (error) { dirty = null; } }
    const gd = gitDirOf(w.path, root);
    const lock = parseLock(gd ? (() => { try { return fs.readFileSync(path.join(gd, "chat-lock"), "utf8"); } catch (error) { return ""; } })() : "", now);
    return { path: w.path, branch: w.branch, head: w.head, detached: w.detached, prunable: w.prunable, dirty, locked: lock.locked, chat: lock.chat, heartbeat: lock.heartbeat, alive: lock.alive };
  });
}

function newestEvents() {
  const dir = path.join(os.homedir(), "Downloads");
  try {
    const files = fs.readdirSync(dir).filter((f) => /^usage-events-.*\.csv$/.test(f)).map((f) => path.join(dir, f));
    return files.sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs)[0] || null;
  } catch (error) { return null; }
}

function collect(root, now) {
  const errors = [];
  const safe = (name, fn, fallback) => { try { return fn(); } catch (error) { errors.push(name + ": " + String(error.message || error).split("\n")[0].slice(0, 200)); return fallback; } };
  const wts = safe("worktrees", () => worktrees(root, now), []);
  const usage = safe("usage", () => usageRows(fs.readFileSync(path.join(USAGE_DIR, "work-log.csv"), "utf8"), now), []);
  const cost = safe("cost", () => costFrom(JSON.parse(fs.readFileSync(path.join(USAGE_DIR, "quota-cache.json"), "utf8"))), { cycleStart: null, onDemandUsd: null, limitUsd: null });
  const events = newestEvents();
  cost.tickets = events ? safe("tickets", () => ticketCosts(fs.readFileSync(events, "utf8"), usage, now), []) : [];
  cost.eventsFile = events ? path.basename(events) : null;
  const rate = safe("rate", () => rateFrom(JSON.parse(run("gh", ["api", "rate_limit"], { timeout: 20000 }))), { graphql: null, core: null });
  return { worktrees: wts, usage, cost, rate, results: readJson(RESULTS, []), host: os.hostname(), at: now.toISOString(), root, errors };
}

// --- act -------------------------------------------------------------------------------------------------------------

function prMerged(branch) {
  const prs = JSON.parse(run("gh", ["api", "repos/" + REPO + "/pulls?state=closed&per_page=10&head=kaanmuar:" + encodeURIComponent(branch)], { timeout: 20000 }));
  return prs.find((p) => p.merged_at) || null;
}

function act(item, payload) {
  const root = payload.root;
  if (item.action === "prune-branches") {
    run("git", ["-C", root, "worktree", "prune"]);
    run("git", ["-C", root, "fetch", "--prune", "--quiet"], { timeout: 120000 });
    return "Pruned worktrees and fetched with --prune.";
  }
  if (item.action === "remove-worktree") {
    const base = path.join(root, ".worktrees");
    const want = item.target ? (path.isAbsolute(item.target) ? path.resolve(item.target) : path.resolve(base, item.target)) : "";
    const wt = payload.worktrees.find((w) => path.resolve(w.path) === want);
    const check = safeToRemove(item, wt, root);
    if (!check.ok) throw new Error(check.why);
    run("git", ["-C", root, "worktree", "remove", check.path]);
    if (!wt.branch) return "Removed " + check.path + " (detached, no branch to delete).";
    const pr = prMerged(wt.branch);
    if (!pr) return "Removed " + check.path + "; kept branch " + wt.branch + " (no merged PR).";
    run("git", ["-C", root, "branch", "-D", wt.branch]);
    return "Removed " + check.path + " and branch " + wt.branch + " (PR #" + pr.number + " merged).";
  }
  throw new Error("Unknown action " + item.action + ".");
}

// --- main ------------------------------------------------------------------------------------------------------------

async function report(dry) {
  const root = repoRoot();
  const payload = collect(root, new Date());
  if (dry) {
    console.log(JSON.stringify(payload, null, 2));
    return;
  }
  const pair = readJson(PAIR_CONFIG, {});
  if (!pair.token) {
    console.error("Not paired with Jarvis. Pair this Mac first: node scripts/engagement-browser/agent.js pair");
    process.exit(1);
  }
  const post = async (body) => {
    const res = await fetch(pair.endpoint || ENDPOINT, {
      method: "POST", headers: { "Content-Type": "application/json", "x-mac-token": pair.token },
      body: JSON.stringify(Object.assign({ op: "github-local" }, body)), signal: AbortSignal.timeout(60000)
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.ok === false) throw new Error("github-local: " + (data.error || "Jarvis answered " + res.status));
    return data;
  };
  const data = await post(payload);
  const sent = new Set(payload.results.map((r) => r.id));
  const done = [];
  for (const item of data.queue || []) {
    if (sent.has(item.id)) continue;
    try { done.push({ id: item.id, status: "done", result: act(item, payload) }); } catch (error) { done.push({ id: item.id, status: "failed", result: String(error.stderr || error.message || error).trim().split("\n")[0].slice(0, 300) }); }
    log(item.action + " " + (item.target || "") + ": " + done[done.length - 1].status + ", " + done[done.length - 1].result);
  }
  // Jarvis marks them at once; ones it did not get go up with the next report.
  const reported = done.length ? await post({ resultsOnly: true, results: done }).then(() => true).catch((error) => { log(String(error.message || error)); return false; }) : true;
  const left = readJson(RESULTS, []).filter((r) => !sent.has(r.id)).concat(reported ? [] : done);
  fs.mkdirSync(path.dirname(RESULTS), { recursive: true });
  fs.writeFileSync(RESULTS, JSON.stringify(left, null, 2));
  log("Uploaded " + payload.worktrees.length + " worktrees, " + payload.usage.length + " work rows, " + payload.cost.tickets.length + " ticket costs; queue " + (data.queue || []).length + (payload.errors.length ? "; " + payload.errors.join("; ") : ""));
}

function install() {
  fs.mkdirSync(APP, { recursive: true });
  const script = path.join(APP, "github-local-report.js");
  fs.copyFileSync(__filename, script);
  const root = repoRoot();
  const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  fs.mkdirSync(path.dirname(PLIST), { recursive: true });
  fs.mkdirSync(path.dirname(LOG), { recursive: true });
  fs.writeFileSync(PLIST, `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>${LABEL}</string>
  <key>ProgramArguments</key><array><string>${esc(process.execPath)}</string><string>${esc(script)}</string></array>
  <key>EnvironmentVariables</key><dict>
    <key>GITHUB_LOCAL_REPO</key><string>${esc(root)}</string>
    <key>PATH</key><string>/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin</string>
  </dict>
  <key>StartInterval</key><integer>300</integer>
  <key>RunAtLoad</key><true/>
  <key>StandardOutPath</key><string>${esc(LOG)}</string>
  <key>StandardErrorPath</key><string>${esc(LOG)}</string>
</dict>
</plist>
`);
  const domain = "gui/" + process.getuid();
  try { run("launchctl", ["bootout", domain + "/" + LABEL]); } catch (error) { /* not loaded */ }
  run("launchctl", ["bootstrap", domain, PLIST]);
  console.log("Installed " + PLIST + " (every 5 minutes, repo " + root + "); log: " + LOG);
}

function uninstall() {
  try { run("launchctl", ["bootout", "gui/" + process.getuid() + "/" + LABEL]); } catch (error) { /* not loaded */ }
  fs.rmSync(PLIST, { force: true });
  console.log("Removed " + PLIST);
}

async function main(argv) {
  if (argv.includes("--install")) return install();
  if (argv.includes("--uninstall")) return uninstall();
  return report(argv.includes("--dry-run"));
}

if (require.main === module) {
  main(process.argv.slice(2)).catch((error) => { log(String(error.message || error)); process.exit(1); });
}

module.exports = { parseWorktrees, parseLock, parseCsv, usageRows, costFrom, ticketCosts, rateFrom, safeToRemove, STALE_S };
