"use strict";
/* Jarvis live processes (#2548): what is running, waiting on Carlos or just finished, for the app, watch and web.

   One small document, jarvis_cache/processes ({ json, at, v }), holds the rows. Every writer changes it in one
   transaction (1 read, 1 write) and then calls jarvisLive.check with the new version, so a step reaches the open
   app at high priority without a snapshot rebuild. The snapshot reads it once per load and serves it as the
   `processes` client section (jarvis-sections.js), whose version is the one computed here.

   Writers:
     job         track() in index.js: every scheduled job; one that runs more than once an hour shows only when it
                 runs past SHOW_AFTER_MS, fails or says what it did
     workflow,   jarvisGithubHook: GitHub's workflow_run webhook (pushes, schedules, dispatches; pull request CI is
     deploy        left out); scheduled workflows are jobs
     cube        cubeRunStart and cubeRunDone on url_review_runs
     desk        jarvisReviewRun: a review Carlos asked for from Jarvis
     review-run  runReview: a customer's URL review
     mac-agent,  the process-report op, signed with the Mac's paired token: the engagement browser
     agent         (scripts/engagement-browser/agent.js) and Cursor chats (.cursor/hooks/jarvis-process.js)
     agent       jarvisGithubAgent when it launches a Cursor cloud agent; the hourly jarvisWatch asks the Cursor API
                 how each one is doing (cloudAgents) */

const crypto = require("crypto");
const sections = require("./jarvis-sections");
const live = require("./jarvis-live");

const KINDS = ["agent", "mac-agent", "workflow", "deploy", "review-run", "desk", "cube", "job"];
const STATES = ["queued", "running", "waiting", "done", "failed", "cancelled"];
const ACTIVE = new Set(["queued", "running", "waiting"]);
const HOUR = 3600000;
// A finished row is shown for a day.
const KEEP_MS = 24 * HOUR;
// An active row with no word for this long has died without saying so; agents may sit idle longer.
const QUIET_MS = { job: 0.75 * HOUR, "review-run": HOUR, desk: HOUR, cube: 2 * HOUR, workflow: 6 * HOUR, deploy: 6 * HOUR, agent: 12 * HOUR, "mac-agent": HOUR };
const MAX_ROWS = 40;
// A job that runs more than once an hour is shown only once it has run this long (or fails, or did something).
const SHOW_AFTER_MS = 20000;
// The kinds the Mac may report through process-report.
const MAC_KINDS = new Set(["agent", "mac-agent"]);

const ref = (db) => db.collection("jarvis_cache").doc("processes");
const iso = (ms) => new Date(ms).toISOString();
const clip = (value, max) => String(value == null ? "" : value).replace(/\s+/g, " ").trim().slice(0, max);

function when(value, fallback) {
  if (value && typeof value.toDate === "function") return value.toDate().toISOString();
  const ms = Date.parse(value || "");
  return Number.isFinite(ms) ? iso(ms) : fallback;
}

const EMPTY = { rows: [], running: 0, waiting: 0, needsYou: 0, at: "" };

/** One row as it is stored; throws when the kind, state or id is missing. */
function clean(input, now) {
  const r = input || {};
  if (!KINDS.includes(r.kind)) throw new Error("Unknown process kind: " + clip(r.kind, 30));
  if (!STATES.includes(r.state)) throw new Error("Unknown process state: " + clip(r.state, 30));
  const id = clip(r.id, 120);
  if (!id) throw new Error("A process needs an id.");
  const row = { id, kind: r.kind, name: clip(r.name, 100) || id, state: r.state };
  const step = clip(r.step, 160);
  if (step) row.step = step;
  const progress = Number(r.progress);
  if (r.progress != null && Number.isFinite(progress)) row.progress = Math.round(Math.min(1, Math.max(0, progress)) * 1000) / 1000;
  const started = when(r.startedAt, "");
  if (started) row.startedAt = started;
  row.updatedAt = iso(now);
  const url = String(r.url || "");
  if (/^https:\/\/\S{4,500}$/.test(url)) row.url = url;
  if (r.needsYou === true && ACTIVE.has(r.state)) row.needsYou = true;
  const group = clip(r.group, 120);
  if (group) row.group = group;
  return row;
}

const SAME = ["kind", "name", "state", "step", "progress", "url", "needsYou"];

// The rows with `row` put in; null when it changes nothing shown.
function merge(rows, row) {
  const list = rows || [];
  const was = list.find((r) => r.id === row.id);
  if (was && SAME.every((k) => was[k] === row[k])) return null;
  const next = Object.assign({}, row, { startedAt: row.startedAt || (was && was.startedAt) || row.updatedAt });
  if (!ACTIVE.has(next.state)) next.endedAt = (was && !ACTIVE.has(was.state) && was.endedAt) || row.updatedAt;
  return list.filter((r) => r.id !== row.id).concat(next);
}

const rank = (r) => (r.needsYou ? 0 : r.state === "running" ? 1 : r.state === "waiting" ? 2 : r.state === "queued" ? 3 : 4);
const newest = (a, b) => String(b.startedAt || "").localeCompare(String(a.startedAt || ""));
const latest = (a, b) => String(b.endedAt || b.updatedAt || "").localeCompare(String(a.endedAt || a.updatedAt || ""));

/** Old and silent rows out, one finished row per group, active ones first; at most MAX_ROWS. */
function prune(rows, now) {
  const fresh = (rows || []).filter((r) => ACTIVE.has(r.state)
    ? now - Date.parse(r.updatedAt) < KEEP_MS
    : now - Date.parse(r.endedAt || r.updatedAt) < KEEP_MS);
  const settled = fresh.map((r) => {
    if (!ACTIVE.has(r.state) || !(now - Date.parse(r.updatedAt) > (QUIET_MS[r.kind] || HOUR))) return r;
    const crashed = ["job", "review-run", "desk", "cube"].includes(r.kind);
    const out = Object.assign({}, r, { state: crashed ? "failed" : "cancelled", step: "No word since " + r.updatedAt.slice(11, 16) + " UTC" + (crashed ? "; it likely crashed" : ""), endedAt: iso(now) });
    delete out.needsYou;
    return out;
  });
  const active = settled.filter((r) => ACTIVE.has(r.state)).sort((a, b) => rank(a) - rank(b) || newest(a, b));
  const seen = new Set();
  const ended = settled.filter((r) => !ACTIVE.has(r.state)).sort(latest).filter((r) => {
    if (!r.group) return true;
    if (seen.has(r.group)) return false;
    seen.add(r.group);
    return true;
  });
  return active.concat(ended).slice(0, MAX_ROWS);
}

/** The processes field of the snapshot: the rows and their counts. */
function view(rows, now) {
  const count = (test) => rows.filter(test).length;
  return { rows, running: count((r) => r.state === "running"), waiting: count((r) => r.state === "waiting" || r.state === "queued"), needsYou: count((r) => r.needsYou), at: iso(now) };
}

const versionOf = (value) => sections.version("processes", { processes: value });

function parse(snap) {
  const d = snap && snap.exists ? snap.data() || {} : {};
  let value = null;
  try { value = d.json ? JSON.parse(d.json) : null; } catch (error) { value = null; }
  return { value: value || Object.assign({}, EMPTY), at: String(d.at || ""), v: String(d.v || "") };
}

/** The kept section: { value, at, v }. One read. */
async function read(db) {
  return parse(await ref(db).get().catch(() => null));
}

/**
 * Puts one row (or several) in and pushes the processes section when it moved. deps: jarvisLive's
 * { db, messaging, webpush, now(), sleep(ms) }. Nothing is written or pushed when the rows show the same.
 */
async function report(deps, input) {
  const now = deps.now();
  const rows = [].concat(input || []).map((r) => clean(r, now));
  if (!rows.length) return { changed: false };
  const out = await deps.db.runTransaction(async (tx) => {
    const kept = parse(await tx.get(ref(deps.db)));
    let next = kept.value.rows || [];
    let changed = false;
    rows.forEach((row) => {
      const merged = merge(next, row);
      if (merged) { next = merged; changed = true; }
    });
    if (!changed) return null;
    const value = view(prune(next, now), now);
    const json = JSON.stringify(value);
    const v = versionOf(value);
    tx.set(ref(deps.db), { json, at: value.at, v });
    return { v, at: value.at };
  });
  if (!out) return { changed: false };
  const pushed = await live.check(deps, live.DAYS, { processes: out })
    .catch((error) => ({ pushed: false, reason: String((error && error.message) || error).slice(0, 120) }));
  return { changed: true, v: out.v, pushed };
}

// --- rows from each source -------------------------------------------------------------------------------------

const JOB_NAMES = {
  opsWatchdog: "Daily system review", sweepReviews: "Country sweep", outreachSweep: "Outreach sweep", rivalSweep: "Rival sweep",
  placesProspects: "Places prospects", engagementScout: "Engagement scout", ownerTags: "Owner tags", jarvisWatch: "Jarvis watch",
  jarvisGithub: "Jarvis GitHub", jarvisCountdowns: "Jarvis countdowns", jarvisDailyBriefing: "Daily briefing", jarvisEveningDigest: "Evening digest",
  rerunReviewFailures: "Re-run failed reviews", refreshSocialHubStats: "Social hub stats", dispatchFacebookQueue: "Facebook queue"
};

/** True for a cron that fires more than once an hour or every hour. */
function frequent(cron) {
  const [minute, hour] = String(cron || "").split(/\s+/);
  return hour === "*" || /[*,/-]/.test(minute || "");
}

function jobRow(job, state, extra) {
  const e = extra || {};
  return { id: "job:" + job, kind: "job", name: JOB_NAMES[job] || job, state, step: e.step, startedAt: e.startedAt, group: "job:" + job };
}

// Pull request CI and comment bots are left out: they are many, and the GitHub tab shows them.
const SKIP_EVENTS = new Set(["pull_request", "pull_request_target", "pull_request_review", "pull_request_review_comment", "issue_comment", "merge_group"]);
const SKIP_NAMES = /dependabot|copilot|codeql|automatic dependency/i;
const FAILED = new Set(["failure", "timed_out", "startup_failure"]);

/** A workflow_run webhook as a row, or null when it is one of those left out. isDeploy and jobFiles from the callers. */
function workflowRow(body, { isDeploy, jobFiles } = {}) {
  const run = (body && body.workflow_run) || null;
  if (!run || !run.id || body.action === "requested") return null;
  if (SKIP_EVENTS.has(run.event) || SKIP_NAMES.test(run.name || "")) return null;
  const file = String(run.path || "").split("/").pop();
  const deploy = isDeploy ? isDeploy(run) : false;
  const kind = deploy ? "deploy" : run.event === "schedule" || (jobFiles || []).includes(file) ? "job" : "workflow";
  let state = "running";
  let needsYou = false;
  if (run.status === "completed") {
    const c = run.conclusion;
    state = c === "success" || c === "neutral" ? "done" : FAILED.has(c) ? "failed" : c === "action_required" ? "waiting" : "cancelled";
    needsYou = c === "action_required";
  } else if (run.status === "waiting") { state = "waiting"; needsYou = true; }
  else if (run.status !== "in_progress") state = "queued";
  const branch = String(run.head_branch || "");
  return {
    id: "gh:" + run.id, kind, state, needsYou,
    name: clip(run.name || file, 70) + (branch && branch !== "main" ? " · " + clip(branch, 40) : ""),
    step: clip(run.display_title, 120) + (run.run_attempt > 1 ? " (attempt " + run.run_attempt + ")" : ""),
    startedAt: run.run_started_at || run.created_at, url: run.html_url, group: "gh:" + (run.workflow_id || file) + ":" + branch
  };
}

/** GitHub's X-Hub-Signature-256 over the raw body. */
function signed(secret, raw, header) {
  if (!secret || !raw || !header) return false;
  const want = Buffer.from("sha256=" + crypto.createHmac("sha256", secret).update(raw).digest("hex"));
  const got = Buffer.from(String(header));
  return want.length === got.length && crypto.timingSafeEqual(want, got);
}

const CUBE_STATES = { queued: "queued", running: "running", done: "done", failed: "failed" };

function cubeRow(id, run, link) {
  const r = run || {};
  const s = r.summary || {};
  const step = r.status === "done" ? [(s.passed || 0) + " passed", (s.failed || 0) + " failed"].concat(s.flaky ? [s.flaky + " flaky"] : []).join(", ")
    : r.status === "failed" ? clip(r.error || "The runner stopped.", 160)
    : (r.cases || 0) + " cases · " + [].concat(r.frameworks || []).join(", ");
  return { id: "cube:" + id, kind: "cube", name: "Cube run: " + (r.host || r.reviewId || id), state: CUBE_STATES[r.status] || "queued", step, startedAt: r.startedAt || r.at, url: link };
}

function hostOf(url) {
  try { return new URL(String(url)).hostname.replace(/^www\./, ""); } catch (error) { return clip(url, 60); }
}

function deskRow(id, state, { url, step, startedAt, link } = {}) {
  return { id: "desk:" + id, kind: "desk", name: "Your review: " + hostOf(url), state, step, startedAt, url: link };
}

function reviewRow(runId, state, { url, step, startedAt, link } = {}) {
  return { id: "review:" + runId, kind: "review-run", name: "URL review: " + hostOf(url), state, step, startedAt, url: link };
}

function cloudAgentRow(id, state, { name, url, step } = {}) {
  return { id: "agent:cloud-" + id, kind: "agent", name: name || "Cursor cloud agent", state, step, url };
}

const CURSOR_AGENT = "https://api.cursor.com/v1/agents/";
const CLOUD_STATES = { CREATING: "queued", PENDING: "queued", RUNNING: "running", FINISHED: "done", COMPLETED: "done", ERROR: "failed", FAILED: "failed", EXPIRED: "cancelled", CANCELLED: "cancelled", STOPPED: "cancelled" };

/** The hourly watch asks Cursor how the cloud agents Jarvis started are doing; one read when none is running. */
async function cloudAgents(deps, { fetch, key }) {
  if (!key) return "cloud agents: no key";
  const active = ((await read(deps.db)).value.rows || []).filter((r) => r.id.startsWith("agent:cloud-") && ACTIVE.has(r.state));
  const rows = (await Promise.all(active.map(async (r) => {
    const res = await fetch(CURSOR_AGENT + encodeURIComponent(r.id.slice(12)), { headers: { Authorization: "Bearer " + key } }).catch(() => null);
    const data = res && res.ok ? await res.json().catch(() => ({})) : null;
    const agent = (data && (data.agent || data)) || {};
    const state = CLOUD_STATES[String(agent.status || "").toUpperCase()];
    return state && state !== r.state ? Object.assign({}, r, { state, step: clip(agent.summary || r.step, 160) }) : null;
  }))).filter(Boolean);
  if (rows.length) await report(deps, rows);
  return "cloud agents " + active.length + " active, " + rows.length + " moved";
}

/** The process-report op's rows from the Mac: agents only, at most 10 at a time. */
function macRows(body) {
  const list = Array.isArray(body && body.rows) ? body.rows : body && body.row ? [body.row] : [];
  return list.slice(0, 10).filter((r) => r && MAC_KINDS.has(r.kind)).map((r) => Object.assign({}, r, { id: (r.kind === "agent" ? "agent:" : "mac:") + clip(String(r.id || "").replace(/^(agent|mac):/, ""), 100) }));
}

module.exports = { KINDS, STATES, ACTIVE, KEEP_MS, QUIET_MS, MAX_ROWS, SHOW_AFTER_MS, EMPTY, clean, merge, prune, view, versionOf, parse, read, report, frequent, jobRow, workflowRow, signed, cubeRow, deskRow, reviewRow, cloudAgentRow, cloudAgents, macRows, hostOf, JOB_NAMES };
