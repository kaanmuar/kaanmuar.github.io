"use strict";
/* The outside half of Jarvis > Console (#2810), every minute from the jarvisLogPoll job: in the four project repos,
   GitHub Actions runs starting and finishing, new issues and PRs, closes, merges, labels and board moves; and the
   Cloud Functions log: every function's warnings and errors and the jarvis* functions' info lines.

   Cursors live in jarvis_log_state/main; the first pass in a repo only sets them, so the console does not fill with
   the past. GitHub answers 304 to an unchanged ETag, which costs no rate limit, so an idle repo costs nothing. A board
   move is an issue event whose columns only GraphQL tells, in one query per pass that has moves (board token).
   A GitHub webhook would be faster, but the app's webhook URL and secret are set by hand in its settings; a minute
   behind is close enough for a console. */
const jarvisLog = require("./jarvis-log");

const API = "https://api.github.com/";
const LOGGING = "https://logging.googleapis.com/v2/entries:list";
const PROJECT = "carlosm-interactive-cv";
const REPOS = ["kaanmuar/kaanmuar.github.io", "kaanmuar/qa-lab-outreach", "kaanmuar/cursor-quota", "kaanmuar/cursor-quota-releases"];
const KEEP_RUNS = 300;
const KEEP_LOG_IDS = 400;
const LOG_OVERLAP = 3 * 60000;
const LOG_REACH = 15 * 60000;
const PRUNE_EVERY = 3600000;
const FAIL = ["failure", "timed_out", "startup_failure"];
const QUIET = ["cancelled", "skipped", "neutral", "stale"];
const BOARD_EVENTS = ["project_v2_item_status_changed", "added_to_project_v2", "removed_from_project_v2"];
const LOUD_EVENTS = ["closed", "reopened", "merged"];

const clip = (v, n) => String(v === null || v === undefined ? "" : v).replace(/\s+/g, " ").trim().slice(0, n);
const short = (repo) => String(repo).split("/").pop();
const keyOf = (path) => String(path).replace(/[^\w]/g, "_").slice(0, 140);

function took(a, b) {
  const s = Math.max(0, Math.round((Date.parse(b) - Date.parse(a)) / 1000));
  return Number.isFinite(s) ? (s < 60 ? s + "s" : Math.floor(s / 60) + "m" + String(s % 60).padStart(2, "0") + "s") : "";
}

/* Actions runs (newest first, as GitHub lists them) against seen = { "<id>.<attempt>": "r" running | "c" completed }.
   -> { lines, seen }: a new run says it started, a run that completed says how it ended; one that started and ended
   between two passes gets only its end. seen keeps the runs still listed. */
function runLines(repo, runs, seen) {
  const was = seen || {};
  const next = {};
  const lines = [];
  for (const r of (runs || []).slice().reverse()) {
    if (!r || !r.id) continue;
    const key = r.id + "." + (r.run_attempt || 1);
    const done = r.status === "completed";
    next[key] = done ? "c" : "r";
    if (was[key] === "c" || (was[key] === "r" && !done)) continue;
    const name = clip(r.name || r.display_title || "run", 80) + " #" + (r.run_number || r.id) + ((r.run_attempt || 1) > 1 ? " (attempt " + r.run_attempt + ")" : "");
    const where = " on " + clip(r.head_branch || "?", 80) + " (" + clip(r.event || "?", 30) + ")";
    const base = { source: "actions", ref: "run:" + r.id, url: r.html_url };
    if (!done) lines.push(Object.assign(base, { at: r.run_started_at || r.created_at, level: "debug", text: short(repo) + ": " + name + " started" + where }));
    else {
      const c = r.conclusion || "done";
      lines.push(Object.assign(base, { at: r.updated_at, level: FAIL.includes(c) ? "error" : QUIET.includes(c) ? "debug" : "info",
        text: short(repo) + ": " + name + " " + c + (r.run_started_at ? " in " + took(r.run_started_at, r.updated_at) : "") + where }));
    }
  }
  const keys = Object.keys(next);
  return { lines, seen: keys.length > KEEP_RUNS ? keys.slice(-KEEP_RUNS).reduce((m, k) => { m[k] = next[k]; return m; }, {}) : next };
}

/* New issues and PRs (newest created first) above last, the highest number seen. -> { lines, last }. */
function issueLines(repo, issues, last) {
  const list = (issues || []).filter((i) => i && i.number);
  const top = list.reduce((m, i) => Math.max(m, i.number), Number(last) || 0);
  const lines = list.filter((i) => i.number > (Number(last) || 0)).sort((a, b) => a.number - b.number).map((i) => ({
    source: "github", level: "info", at: i.created_at, ref: short(repo) + "#" + i.number, url: i.html_url,
    text: short(repo) + ": new " + (i.pull_request ? "PR" : "issue") + " #" + i.number + " " + clip(i.title, 160) + (i.user && i.user.login ? " (by " + i.user.login + ")" : "")
  }));
  return { lines, last: top };
}

/* Issue events (newest first) above lastId -> { lines, last, moves }. moves are the board status events whose
   columns statuses ({ node_id: { previousStatus, status } }) names; one it does not know says "moved". */
function eventLines(repo, events, lastId, statuses) {
  const from = Number(lastId) || 0;
  const list = (events || []).filter((e) => e && e.id && e.id > from).sort((a, b) => a.id - b.id);
  const top = (events || []).reduce((m, e) => Math.max(m, Number(e && e.id) || 0), from);
  const lines = list.map((e) => {
    const i = e.issue || {};
    const what = (i.pull_request ? "PR #" : "#") + i.number;
    const title = clip(i.title, 120);
    const by = e.actor && e.actor.login ? " (" + e.actor.login.replace(/\[bot\]$/, "") + ")" : "";
    const base = { at: e.created_at, ref: short(repo) + "#" + i.number, url: i.html_url };
    if (BOARD_EVENTS.includes(e.event)) {
      const s = (statuses || {})[e.node_id];
      const move = e.event === "added_to_project_v2" ? "added to the board" : e.event === "removed_from_project_v2" ? "removed from the board"
        : s ? "moved " + (s.previousStatus ? s.previousStatus + " → " : "to ") + (s.status || "no column") : "moved on the board";
      return Object.assign(base, { source: "board", level: e.event === "project_v2_item_status_changed" ? "info" : "debug", text: short(repo) + ": " + what + " " + move + ": " + title + by });
    }
    const detail = e.event === "labeled" || e.event === "unlabeled" ? " " + clip((e.label || {}).name, 60) : e.event === "assigned" || e.event === "unassigned" ? " " + clip((e.assignee || {}).login, 60) : "";
    return Object.assign(base, { source: "github", level: LOUD_EVENTS.includes(e.event) ? "info" : "debug", text: short(repo) + ": " + what + " " + e.event.replace(/_/g, " ") + detail + ": " + title + by });
  });
  return { lines, last: top, moves: list.filter((e) => e.event === "project_v2_item_status_changed").map((e) => e.node_id).filter(Boolean) };
}

const SEVERITY = { DEFAULT: "info", DEBUG: "debug", INFO: "info", NOTICE: "info", WARNING: "warn", ERROR: "error", CRITICAL: "error", ALERT: "error", EMERGENCY: "error" };

function logMessage(e) {
  if (e.textPayload) return e.textPayload;
  const j = e.jsonPayload || {};
  if (j.message) return j.message;
  const h = e.httpRequest;
  if (h) return (h.status || "") + " " + (h.requestMethod || "") + " " + String(h.requestUrl || "").replace(/\?.*$/, "") + (h.latency ? " " + h.latency : "");
  return JSON.stringify(j).slice(0, 200);
}

/* Cloud Logging entries (oldest first) -> { lines, seen }: seen keeps the insertIds already logged, since each pass
   reads a few minutes back for entries that arrived late. */
function logLines(entries, seen) {
  const ids = new Set(seen || []);
  const lines = [];
  for (const e of entries || []) {
    if (!e || !e.insertId || ids.has(e.insertId)) continue;
    ids.add(e.insertId);
    const labels = (e.resource || {}).labels || {};
    const fn = labels.function_name || labels.service_name || "function";
    const q = 'insertId="' + e.insertId + '"';
    const bad = new RegExp(FINISHED_BAD).test(e.textPayload || "");
    lines.push({ source: "function", level: bad ? "error" : SEVERITY[e.severity] || "info", at: e.timestamp, ref: "log:" + fn,
      url: "https://console.cloud.google.com/logs/query;query=" + encodeURIComponent(q) + ";cursorTimestamp=" + encodeURIComponent(e.timestamp || "") + "?project=" + PROJECT,
      text: fn + ": " + clip(logMessage(e), 280) });
  }
  return { lines, seen: Array.from(ids).slice(-KEEP_LOG_IDS) };
}

// A gen1 function's crash, timeout or 5xx only shows in its DEBUG "Function execution took ..." line.
const FINISHED_BAD = "finished with status( code)?: (5[0-9][0-9]|'(error|crash|timeout|connection error)')";

function logFilter(from) {
  return 'timestamp>="' + from + '" AND ((resource.type=("cloud_function" OR "cloud_run_revision") AND severity>=WARNING)'
    + ' OR (resource.type="cloud_function" AND resource.labels.function_name=~"^jarvis" AND resource.labels.function_name!="jarvisLogPoll" AND severity>=INFO)'
    + ' OR (resource.type="cloud_function" AND textPayload=~"' + FINISHED_BAD + '"))';
}

async function ghGet(ctx, token, path, state) {
  const k = keyOf(path);
  const headers = { Authorization: "Bearer " + token, Accept: "application/vnd.github+json", "User-Agent": "qa-lab-jarvis", "X-GitHub-Api-Version": "2022-11-28" };
  if (state.etags[k]) headers["If-None-Match"] = state.etags[k];
  const res = await ctx.fetch(API + path, { headers, signal: AbortSignal.timeout(15000) });
  if (res.status === 304) return null;
  if (!res.ok) throw new Error("GitHub " + path.split("?")[0] + " answered " + res.status);
  const tag = res.headers && res.headers.get ? res.headers.get("etag") : "";
  if (tag) state.etags[k] = tag;
  return res.json();
}

async function boardStatuses(ctx, ids) {
  if (!ids.length) return {};
  const token = await ctx.token("board").catch(() => "");
  if (!token) return {};
  const res = await ctx.fetch(API + "graphql", {
    method: "POST", headers: { Authorization: "Bearer " + token, "Content-Type": "application/json", "User-Agent": "qa-lab-jarvis" }, signal: AbortSignal.timeout(15000),
    body: JSON.stringify({ query: "query($ids:[ID!]!){nodes(ids:$ids){... on ProjectV2ItemStatusChangedEvent{id previousStatus status}}}", variables: { ids: ids.slice(0, 100) } })
  });
  const data = await res.json().catch(() => ({}));
  return ((data.data || {}).nodes || []).filter((n) => n && n.id).reduce((m, n) => { m[n.id] = n; return m; }, {});
}

async function repoPass(ctx, token, repo, st, state) {
  const first = !st.seeded;
  const [runs, issues, events] = await Promise.all([
    ghGet(ctx, token, "repos/" + repo + "/actions/runs?per_page=100", state),
    ghGet(ctx, token, "repos/" + repo + "/issues?state=all&sort=created&direction=desc&per_page=30", state),
    ghGet(ctx, token, "repos/" + repo + "/issues/events?per_page=100", state)
  ]);
  const lines = [];
  if (runs) { const r = runLines(repo, runs.workflow_runs, st.runs); st.runs = r.seen; if (!first) lines.push(...r.lines); }
  if (runs && ctx.onRuns) await ctx.onRuns(repo, runs.workflow_runs || []).catch((error) => console.error("Runs hand-off failed:", error));
  if (issues) { const r = issueLines(repo, issues, st.issue); st.issue = r.last; if (!first) lines.push(...r.lines); }
  if (events) {
    const pre = eventLines(repo, events, st.event, {});
    const named = first || !pre.moves.length ? pre : eventLines(repo, events, st.event, await boardStatuses(ctx, pre.moves).catch(() => ({})));
    st.event = named.last;
    if (!first) lines.push(...named.lines);
  }
  st.seeded = true;
  return lines;
}

async function logsPass(ctx, state) {
  const now = ctx.now;
  const cursor = Date.parse(state.logs.cursor || "") || now - 2 * 60000;
  const from = new Date(Math.max(cursor - LOG_OVERLAP, now - LOG_REACH)).toISOString();
  const bearer = await ctx.googleToken();
  const res = await ctx.fetch(LOGGING, {
    method: "POST", headers: { Authorization: "Bearer " + bearer, "Content-Type": "application/json" }, signal: AbortSignal.timeout(20000),
    body: JSON.stringify({ resourceNames: ["projects/" + PROJECT], filter: logFilter(from), orderBy: "timestamp asc", pageSize: 300 })
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error("Cloud Logging answered " + res.status + ": " + clip((data.error || {}).message, 160));
  const entries = data.entries || [];
  const out = logLines(entries, state.logs.seen);
  state.logs = { cursor: entries.length ? entries[entries.length - 1].timestamp : state.logs.cursor || new Date(now).toISOString(), seen: out.seen };
  return out.lines;
}

/* One pass. ctx = { fetch, db, now, token(scope) -> GitHub app token, googleToken() -> bearer, repos?,
   onRuns(repo, runs)? when a repo's runs list changed }. -> note. */
async function poll(ctx) {
  const ref = ctx.db.collection("jarvis_log_state").doc("main");
  const snap = await ref.get();
  const state = Object.assign({ repos: {}, logs: {}, etags: {}, prunedAt: 0 }, snap.exists ? snap.data() : {});
  const lines = [];
  const notes = [];
  const token = await ctx.token("repo").catch(() => "");
  if (!token) notes.push("no GitHub token");
  else for (const repo of ctx.repos || REPOS) {
    const k = keyOf(repo);
    const st = Object.assign({ runs: {}, issue: 0, event: 0, seeded: false }, state.repos[k] || {});
    try { lines.push(...(await repoPass(ctx, token, repo, st, state))); } catch (error) {
      notes.push(short(repo) + ": " + clip(error.message, 100));
      Object.keys(state.etags).filter((e) => e.startsWith(keyOf("repos/" + repo))).forEach((e) => { delete state.etags[e]; });
    }
    state.repos[k] = st;
  }
  try { lines.push(...(await logsPass(ctx, state))); } catch (error) { notes.push("logs: " + clip(error.message, 120)); }
  if (notes.length) lines.push({ source: "jarvis", level: "warn", text: "Console poller: " + notes.join("; ") });
  const written = await jarvisLog.logMany(ctx.db, lines);
  let pruned = 0;
  if (ctx.now - (Number(state.prunedAt) || 0) >= PRUNE_EVERY) {
    pruned = await jarvisLog.prune(ctx.db, ctx.now).catch(() => 0);
    state.prunedAt = ctx.now;
  }
  await ref.set(state);
  return written + " lines" + (pruned ? ", " + pruned + " old ones deleted" : "") + (notes.length ? "; " + notes.join("; ") : "");
}

module.exports = { REPOS, PROJECT, runLines, issueLines, eventLines, logLines, logFilter, poll };
