/* Jarvis: the owner-only data the admin Statistics tab cannot read from Firestore rules or the browser.

   Each op returns plain JSON for js/admin-jarvis.js. index.js checks the owner (verifyOperator), caches each op in
   jarvis_cache/<op> for TTL[op], and runs the actions (run a scheduled job, unlist a host, email the briefing).

   health       ops_runs, failures, re-runs, alerts, owner notices, rivals, coupons, captures (server-only collections)
   jobs         Cloud Scheduler jobs: schedule, state, last attempt, last status
   github       CI on main, open bugs by area, PRs merged in the last 7 days, the newest issues
   ga4          sessions, users, views and engagement by content group, country, source and day (property 495572902)
   cloudflare   requests, bytes, cache ratio, threats and uniques for the zone (needs Zone Analytics Read)
   speed        PageSpeed (mobile) for each product page, CrUX history for the origin
   uptime       status, latency and TLS days left for each product page
   brief / ask  Gemini writes the briefing or answers a question from the numbers the page sends */

const PROJECT = "carlosm-interactive-cv";
const PROPERTY = "495572902";
const REPO = "kaanmuar/kaanmuar.github.io";
const ORIGIN = "https://carlosandmunoz.com";
const PAGES = [
  { product: "cv", name: "CV", url: ORIGIN + "/" },
  { product: "studio", name: "QA Studio", url: ORIGIN + "/simulador.html" },
  { product: "lab", name: "QA Lab", url: ORIGIN + "/qa-lab.html" },
  { product: "review", name: "URL Review", url: ORIGIN + "/qa-review.html" },
  { product: "hub", name: "Social hub", url: ORIGIN + "/qa-review-social.html" }
];
const MINUTE = 60 * 1000;
const DAY = 24 * 60 * MINUTE;
const TTL = { health: MINUTE, jobs: MINUTE, github: 5 * MINUTE, ga4: 15 * MINUTE, cloudflare: 15 * MINUTE, speed: 6 * 60 * MINUTE, uptime: 5 * MINUTE };
const SCHEDULER = "https://cloudscheduler.googleapis.com/v1/projects/" + PROJECT + "/locations/us-central1/jobs";
const JOB_PREFIX = "firebase-schedule-";
const METADATA = "http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token";
const GEMINI = "https://generativelanguage.googleapis.com/v1beta/models/";
const MODEL = "gemini-flash-latest";
const core = require("./jarvis-core");
const actions = require("./jarvis-actions");
const jarvisLog = require("./jarvis-log");
const dayRows = require("./jarvis-days");
const ADMIN_URL = ORIGIN + "/admin.html#stats/overview/1";

function rangeDays(value) {
  const days = Number(value);
  return Number.isFinite(days) && days >= 1 && days <= 400 ? Math.round(days) : 30;
}

function isoDay(date) {
  return new Date(date).toISOString().slice(0, 10);
}

function count(map, key, by) {
  const name = String(key || "unknown").slice(0, 80);
  map[name] = (map[name] || 0) + (by || 1);
}

function top(map, limit) {
  return Object.keys(map).map((key) => ({ label: key, value: map[key] })).sort((a, b) => b.value - a.value || a.label.localeCompare(b.label)).slice(0, limit || 12);
}

async function googleToken(fetchImpl, scope) {
  const res = await fetchImpl(METADATA + "?scopes=" + encodeURIComponent(scope), { headers: { "Metadata-Flavor": "Google" }, signal: AbortSignal.timeout(10000) });
  if (!res.ok) throw new Error("No Google token (" + res.status + ")");
  return (await res.json()).access_token;
}

async function readJson(res, label) {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(label + " " + res.status + ": " + String((data.error && (data.error.message || data.error)) || data.message || "no answer").slice(0, 200));
  return data;
}

// Failure causes are stored as { id, label, ... }; older rows may hold a plain string.
function causeLabel(row) {
  const cause = row && row.cause;
  if (cause && typeof cause === "object") return String(cause.label || cause.id || "unknown");
  return String(cause || (row && row.kind) || "unknown");
}

// --- health: server-only Firestore collections -------------------------------------------------------------

const docRows = (snap) => snap.docs.map((doc) => Object.assign({ id: doc.id }, doc.data()));

// ops_runs/<job> is written only by track(): startedAt when a run starts, endedAt when it ends. A held copy reads
// just the jobs that started or ended since its newest stamp, and every job again once an hour.
async function opsRuns(db, state, now) {
  const held = state.extra.opsRuns;
  if (!held || !(now - held.full < dayRows.FULL_MS)) {
    const rows = docRows(await db.collection("ops_runs").get());
    state.extra.opsRuns = { full: now, rows };
    return rows;
  }
  const stamp = (row) => Math.max(Date.parse(row.startedAt) || 0, Date.parse(row.endedAt) || 0);
  const since = new Date(held.rows.reduce((max, row) => Math.max(max, stamp(row)), 0) - dayRows.OVERLAP_MS).toISOString();
  const [started, ended] = await Promise.all(["startedAt", "endedAt"].map((field) => db.collection("ops_runs").where(field, ">=", since).get().then(docRows)));
  const byId = new Map(held.rows.map((row) => [row.id, row]));
  started.concat(ended).forEach((row) => byId.set(row.id, row));
  held.rows = Array.from(byId.values());
  return held.rows;
}

// Failures, alerts, notices, rivals and captures come from the day rollups through a held state (#2101); re-runs
// and coupons change state and are read live.
async function health(db, { days, now }) {
  const from = now - rangeDays(days) * DAY;
  const since = new Date(from).toISOString();
  const read = async (name, field) => {
    try {
      return docRows(await db.collection(name).where(field, ">=", since).limit(2000).get());
    } catch (error) {
      return [];
    }
  };
  const state = await dayRows.loadState(db, "health");
  const [runs, logged, reruns, coupons] = await Promise.all([
    opsRuns(db, state, now).catch(() => []),
    dayRows.rows(db, ["failures", "alerts", "notices", "rivals", "captures"], { from, now, state }).catch(() => ({})),
    read("url_review_reruns", "at"),
    read("url_review_coupons", "createdAt")
  ]);
  await dayRows.saveState(db, "health", state);
  const { failures = [], alerts = [], notices = [], rivals = [], captures = [] } = logged;
  const causes = {}, failedHosts = {}, rerunStatus = {}, alertKinds = {}, noticeStatus = {}, captureKinds = {};
  failures.forEach((row) => { count(causes, causeLabel(row)); count(failedHosts, row.host); });
  reruns.forEach((row) => count(rerunStatus, row.status));
  alerts.forEach((row) => count(alertKinds, row.kind || row.title));
  notices.forEach((row) => count(noticeStatus, row.unlistedAt ? "unlisted" : row.status));
  captures.forEach((row) => count(captureKinds, row.kind));
  const couponUses = coupons.reduce((sum, row) => sum + (Number(row.uses) || 0), 0);
  return {
    jobs: runs.map((row) => ({ job: row.job || row.id, ok: row.ok !== false, startedAt: row.startedAt || "", endedAt: row.endedAt || "", note: String(row.note || "").slice(0, 160), error: String(row.error || "").slice(0, 200) }))
      .sort((a, b) => String(b.endedAt).localeCompare(String(a.endedAt))),
    failures: { total: failures.length, causes: top(causes), hosts: top(failedHosts, 8), latest: failures.sort((a, b) => String(b.at).localeCompare(String(a.at))).slice(0, 8).map((row) => ({ at: row.at, host: row.host, cause: causeLabel(row), message: String((row.error && row.error.message) || "").slice(0, 140) })) },
    reruns: { total: reruns.length, status: top(rerunStatus), held: reruns.filter((row) => row.status === "held").length },
    alerts: { total: alerts.length, kinds: top(alertKinds), latest: alerts.sort((a, b) => String(b.at).localeCompare(String(a.at))).slice(0, 12).map((row) => ({ at: row.at, kind: row.kind, title: String(row.title || "").slice(0, 120), url: row.url || "", priceUsd: row.priceUsd })) },
    notices: { total: notices.length, status: top(noticeStatus), failed: notices.filter((row) => row.status === "pending" && row.lastError && !row.unlistedAt).length },
    rivals: { total: rivals.length },
    coupons: { total: coupons.length, uses: couponUses },
    captures: { total: captures.length, kinds: top(captureKinds) }
  };
}

// --- jobs: Cloud Scheduler ------------------------------------------------------------------------------------

function jobName(full) {
  const short = String(full || "").split("/").pop();
  return short.startsWith(JOB_PREFIX) ? short.slice(JOB_PREFIX.length).replace(/-us-central1$/, "") : short;
}

async function jobs(fetchImpl) {
  const bearer = await googleToken(fetchImpl, "https://www.googleapis.com/auth/cloud-platform");
  const data = await readJson(await fetchImpl(SCHEDULER + "?pageSize=200", { headers: { Authorization: "Bearer " + bearer }, signal: AbortSignal.timeout(15000) }), "Scheduler");
  // A job that never ran (a monthly report before its first 1st) carries status code -1 and no attempt time.
  return (data.jobs || []).map((job) => {
    const code = Number(job.status && job.status.code) || 0;
    const ran = !!job.lastAttemptTime;
    return {
      name: jobName(job.name),
      schedule: job.schedule || "",
      timeZone: job.timeZone || "",
      state: job.state || "",
      lastAttempt: job.lastAttemptTime || "",
      nextRun: job.scheduleTime || "",
      ok: !ran || code <= 0,
      error: ran && code > 0 ? String((job.status && job.status.message) || "code " + code).slice(0, 160) : "",
      note: ran ? "" : "not run yet"
    };
  }).sort((a, b) => a.name.localeCompare(b.name));
}

async function runJob(fetchImpl, name) {
  const short = String(name || "");
  if (!/^[A-Za-z][A-Za-z0-9]{2,60}$/.test(short)) throw new Error("Unknown job.");
  const bearer = await googleToken(fetchImpl, "https://www.googleapis.com/auth/cloud-platform");
  const res = await fetchImpl(SCHEDULER + "/" + JOB_PREFIX + short + "-us-central1:run", { method: "POST", headers: { Authorization: "Bearer " + bearer }, signal: AbortSignal.timeout(15000) });
  await readJson(res, "Scheduler");
  return { ran: short, at: new Date().toISOString() };
}

// --- github ---------------------------------------------------------------------------------------------------

/* #2287: CI on main is each active workflow's newest finished run on main that was not cancelled or skipped. Busy main
   cancels most queued runs, so runs (the newest runs of every workflow) can hold none of a workflow's finished ones;
   those workflows are read by id, from since on: one that has not run on main since is not CI on main any more. A run is
   named by its workflow, not its run-name ("Push on main" is CodeQL). */
const usable = (r) => r.status === "completed" && !["cancelled", "skipped"].includes(r.conclusion);

async function mainRuns(get, runs, since) {
  const list = await get("repos/" + REPO + "/actions/workflows?per_page=100").catch(() => null);
  const workflows = ((list && list.workflows) || []).filter((w) => w.state === "active");
  const names = new Map(workflows.map((w) => [w.id, w.name]));
  const newest = new Map();
  (runs.workflow_runs || []).filter(usable).forEach((r) => { const key = r.workflow_id || r.name; if (!newest.has(key)) newest.set(key, r); });
  const more = await Promise.all(workflows.filter((w) => !newest.has(w.id)).map((w) =>
    get("repos/" + REPO + "/actions/workflows/" + w.id + "/runs?branch=main&status=completed&exclude_pull_requests=true&per_page=30&created=" + encodeURIComponent(">=" + since))
      .then((res) => (res.workflow_runs || []).find(usable), () => null)));
  return Array.from(newest.values()).concat(more.filter(Boolean))
    .map((r) => names.has(r.workflow_id) ? Object.assign({}, r, { name: names.get(r.workflow_id) }) : r)
    .sort((a, b) => String(b.created_at || "").localeCompare(String(a.created_at || "")));
}

async function github(fetchImpl, token, { now }) {
  if (!token) return { ok: false, error: "No GitHub token is set." };
  const get = async (path) => readJson(await fetchImpl("https://api.github.com/" + path, {
    headers: { Authorization: "Bearer " + token, Accept: "application/vnd.github+json", "User-Agent": "qa-lab-jarvis", "X-GitHub-Api-Version": "2022-11-28" },
    signal: AbortSignal.timeout(15000)
  }), "GitHub");
  const week = isoDay(now - 7 * DAY);
  const [runs, bugs, merged, recent, prRuns, pulls] = await Promise.all([
    get("repos/" + REPO + "/actions/runs?branch=main&per_page=30"),
    get("search/issues?q=" + encodeURIComponent("repo:" + REPO + " is:issue is:open label:bug") + "&per_page=100"),
    get("search/issues?q=" + encodeURIComponent("repo:" + REPO + " is:pr is:merged merged:>=" + week) + "&per_page=50"),
    get("repos/" + REPO + "/issues?state=all&sort=created&direction=desc&per_page=12"),
    get("repos/" + REPO + "/actions/runs?event=pull_request&per_page=100").catch(() => null),
    get("repos/" + REPO + "/pulls?state=open&per_page=100").catch(() => null)
  ]);
  const byWorkflow = {};
  const ciRuns = await mainRuns(get, runs, week);
  ciRuns.forEach((run) => {
    if (byWorkflow[run.name] || run.status !== "completed" || run.conclusion === "cancelled") return;
    byWorkflow[run.name] = { name: run.name, conclusion: run.conclusion, at: run.updated_at, url: run.html_url, sha: String(run.head_sha || "").slice(0, 7) };
  });
  const workflowName = new Map(ciRuns.map((r) => [r.workflow_id, r.name]));
  const prList = (prRuns && prRuns.workflow_runs) || [];
  const failingIds = Array.from(new Set(prList.filter((r) => FAILED_RUN.includes(r.conclusion)).map((r) => r.workflow_id))).slice(0, 4);
  const prsStale = pulls ? (await Promise.all(failingIds.map(async (id) => {
    const main = await mainRun(githubApi(fetchImpl, token), id).catch(() => null);
    return main && main.conclusion === "success" ? { workflow: workflowName.get(id) || main.name, prs: stalePrs(pulls, prList, id, main.created_at) } : null;
  }))).filter((w) => w && w.prs.length) : [];
  const areas = {};
  (bugs.items || []).forEach((issue) => {
    const area = (issue.labels || []).map((label) => label.name).find((name) => /^area:/.test(name));
    count(areas, area ? area.slice(5) : "none");
  });
  return {
    ok: true,
    ci: Object.values(byWorkflow),
    prsStale,
    openBugs: bugs.total_count || 0,
    bugAreas: top(areas),
    needsAgent: (bugs.items || []).filter((issue) => (issue.labels || []).some((label) => label.name === "needs-agent")).map((issue) => ({ number: issue.number, title: issue.title, url: issue.html_url })),
    merged: { total: merged.total_count || 0, items: (merged.items || []).slice(0, 10).map((pr) => ({ number: pr.number, title: pr.title, url: pr.html_url, at: pr.closed_at })) },
    recent: (recent || []).map((issue) => ({ number: issue.number, title: issue.title, url: issue.html_url, state: issue.state, pr: !!issue.pull_request, at: issue.created_at }))
  };
}

const FAILED_RUN = ["failure", "timed_out", "startup_failure"];
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function githubApi(fetchImpl, token) {
  const headers = { Authorization: "Bearer " + token, Accept: "application/vnd.github+json", "User-Agent": "qa-lab-jarvis", "X-GitHub-Api-Version": "2022-11-28" };
  const call = (method, path, body) => fetchImpl("https://api.github.com/repos/" + REPO + "/" + path, {
    method, headers: body ? Object.assign({ "Content-Type": "application/json" }, headers) : headers, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(15000)
  });
  return { call, get: async (path) => readJson(await call("GET", path), "GitHub") };
}

// A workflow's newest finished run on main that was not cancelled or skipped, as mainRuns picks it for the briefing
// (#2775). Busy main cancels most queued runs, so a list of every workflow's runs often holds none of a given
// workflow's finished ones; Studio render skips most of its issue_comment runs, hence a full page.
async function mainRun(api, workflowId) {
  const runs = await api.get("actions/workflows/" + workflowId + "/runs?branch=main&status=completed&per_page=100");
  return (runs.workflow_runs || []).find(usable) || null;
}

/* #2245: a pull_request run tests refs/pull/<n>/merge as GitHub built it when the run started, so re-running its
   failed jobs after main is fixed tests the old main again. These are the open, non-draft PRs whose newest run of the
   workflow at their current head failed and started before since (main's newest green run of it). runs newest first.
   workflow is the workflow's id, or its name: a run's name is its run-name ("PR #12" is CodeQL, "Studio pull_request"
   is Studio render), so only a workflow without a run-name matches by name. */
function stalePrs(pulls, runs, workflow, since) {
  const ofWorkflow = (r) => (typeof workflow === "number" ? r.workflow_id === workflow : r.name === workflow);
  return (pulls || []).filter((pr) => !pr.draft && pr.head).map((pr) => {
    const run = (runs || []).find((r) => ofWorkflow(r) && r.head_sha === pr.head.sha && r.conclusion !== "cancelled");
    const stale = run && run.status === "completed" && FAILED_RUN.includes(run.conclusion) && since && String(run.created_at) < String(since);
    return stale ? { number: pr.number, title: String(pr.title || "").slice(0, 160), url: pr.html_url, run: run.id } : null;
  }).filter(Boolean);
}

/* Closes and reopens a PR, so GitHub builds a fresh merge with today's main and runs its checks again (#2245). A PR
   that conflicts with main gets no merge and no run, so it is skipped; so is one whose mergeability GitHub has not
   worked out after a second look. Returns { number, refreshed } or { number, skipped }. */
async function refreshPr(fetchImpl, token, number, { sleep = pause } = {}) {
  if (!token) throw new Error("No GitHub token is set.");
  const api = githubApi(fetchImpl, token);
  const n = Number(number);
  let pr = await api.get("pulls/" + n);
  if (pr.state !== "open") return { number: n, skipped: "not open" };
  if (pr.mergeable === null) {
    await sleep(2000);
    pr = await api.get("pulls/" + n);
  }
  if (pr.mergeable === false) return { number: n, skipped: "conflicts" };
  if (pr.mergeable !== true) return { number: n, skipped: "mergeability unknown" };
  const set = async (state) => {
    const res = await api.call("PATCH", "pulls/" + n, { state });
    if (res.status === 403 || res.status === 404) throw new Error("GitHub refused to " + (state === "open" ? "reopen" : "close") + " #" + n + " (" + res.status + "); the GitHub app needs Pull requests: write.");
    if (!res.ok) throw new Error("GitHub " + res.status + " on " + (state === "open" ? "reopening" : "closing") + " #" + n + ".");
  };
  await set("closed");
  await sleep(1000);
  try { await set("open"); } catch (error) {
    await sleep(3000);
    await set("open").catch(() => { throw new Error("#" + n + " is closed and did not reopen: " + error.message); });
  }
  return { number: n, refreshed: true };
}

/* Refreshes the PRs stalePrs finds for a workflow, one at a time with gap ms between PRs (GitHub asks for spaced
   writes). budget = { left, until, seen } is shared across the workflows of one click: at most left PRs, none started
   after until, and a PR refreshed for one workflow is not refreshed again. */
async function refreshPrs(fetchImpl, token, { workflow, workflowId, since, budget, gap = 3000, sleep = pause }) {
  const api = githubApi(fetchImpl, token);
  // Every event, not only pull_request: CodeQL's PR runs are "dynamic". A PR's head sha keeps main's runs out.
  const [runs, pulls] = await Promise.all([api.get("actions/workflows/" + workflowId + "/runs?per_page=100"), api.get("pulls?state=open&per_page=100")]);
  const out = { refreshed: [], conflicts: [], skipped: [], failed: [], left: [] };
  const b = budget || { left: 20, until: Date.now() + 120000, seen: new Set() };
  for (const pr of stalePrs(pulls, runs.workflow_runs, Number(workflowId), since)) {
    if (b.seen.has(pr.number)) continue;
    if (b.left <= 0 || Date.now() > b.until) { out.left.push(pr.number); continue; }
    if (b.started) await sleep(gap);
    b.started = true;
    b.left -= 1;
    b.seen.add(pr.number);
    try {
      const res = await refreshPr(fetchImpl, token, pr.number, { sleep });
      if (res.refreshed) out.refreshed.push(pr.number);
      else if (res.skipped === "conflicts") out.conflicts.push(pr.number);
      else out.skipped.push(pr.number + " (" + res.skipped + ")");
    } catch (error) {
      out.failed.push(pr.number + ": " + (error.message || String(error)));
    }
  }
  return out;
}

function refreshNote(prs) {
  const nums = (list) => list.map((n) => "#" + n).join(", ");
  return [
    prs.refreshed.length ? "Closed and reopened " + nums(prs.refreshed) + "." : "No PR needed a fresh merge.",
    prs.conflicts.length ? "Skipped for conflicts with main: " + nums(prs.conflicts) + "." : "",
    prs.skipped.length ? "Skipped: #" + prs.skipped.join(", #") + "." : "",
    prs.failed.length ? "Failed: #" + prs.failed.join("; #") : "",
    prs.left.length ? "Left for the next click: " + nums(prs.left) + "." : ""
  ].filter(Boolean).join(" ");
}

/* rerun-ci: when a workflow's newest finished run on main failed, its failed jobs are re-run (a main push run tests its
   own commit). When main is green, the PRs that failed it on the old main are closed and reopened instead (#2245),
   unless prs is false (Jarvis's own runs leave other chats' PRs alone). rerunMain false throws instead of re-running main
   (scripts/refresh-prs.sh). The token needs Actions and Pull requests: write. */
async function rerunCi(fetchImpl, token, workflow, { prs = true, rerunMain = true, budget, gap, sleep } = {}) {
  if (!token) throw new Error("No GitHub token is set.");
  const name = String(workflow || "").slice(0, 120);
  const api = githubApi(fetchImpl, token);
  const wf = ((await api.get("actions/workflows?per_page=100")).workflows || []).find((w) => w.name === name);
  const run = wf ? await mainRun(api, wf.id) : null;
  if (!run) throw new Error("No finished run of " + name + " on main.");
  if (["success", "neutral"].includes(run.conclusion)) {
    if (!prs || run.conclusion !== "success") return { workflow: name, run: run.id, url: run.html_url, already: run.conclusion };
    const out = await refreshPrs(fetchImpl, token, { workflow: name, workflowId: wf.id, since: run.created_at, budget, gap, sleep });
    return { workflow: name, run: run.id, url: run.html_url, prs: out, note: refreshNote(out) };
  }
  if (!rerunMain) throw new Error(name + " is " + run.conclusion + " on main (" + run.html_url + "); fix main before refreshing PRs.");
  const res = await api.call("POST", "actions/runs/" + run.id + "/rerun-failed-jobs");
  if (res.status === 403 || res.status === 404) throw new Error("GitHub refused the re-run (" + res.status + "); the GitHub token needs Actions: write.");
  if (!res.ok) throw new Error("GitHub " + res.status + " on the re-run.");
  return { workflow: name, run: run.id, url: run.html_url };
}

/* #1977: the newest finished run per workflow and branch in the last day, kept when it failed. A pull_request run
   names its PR and main's head (main), which jarvis-actions keys its one refresh on (#2245). */
async function failedRuns(fetchImpl, token, { now }) {
  if (!token) return [];
  const api = githubApi(fetchImpl, token);
  const runs = await api.get("actions/runs?status=completed&per_page=100&created=" + encodeURIComponent(">=" + isoDay(now - DAY)));
  const newest = new Map();
  (runs.workflow_runs || []).forEach((r) => {
    const key = r.name + " " + r.head_branch;
    if (r.conclusion !== "cancelled" && !newest.has(key)) newest.set(key, r);
  });
  const failed = Array.from(newest.values()).filter((r) => ["failure", "timed_out"].includes(r.conclusion));
  const prOf = (r) => r.event === "pull_request" ? Number(((r.pull_requests || [])[0] || {}).number) || 0 : 0;
  const main = failed.some(prOf) ? String(((await api.get("branches/main")).commit || {}).sha || "").slice(0, 7) : "";
  return failed.map((r) => Object.assign(
    { id: r.id, name: r.name, branch: r.head_branch, attempt: r.run_attempt || 1, url: r.html_url, sha: r.head_sha || "", event: r.event || "", path: r.path || "" },
    prOf(r) ? { pr: prOf(r), main } : {}));
}

async function mainSha(fetchImpl, token) {
  if (!token) return "";
  const headers = { Authorization: "Bearer " + token, Accept: "application/vnd.github+json", "User-Agent": "qa-lab-jarvis", "X-GitHub-Api-Version": "2022-11-28" };
  return (await readJson(await fetchImpl("https://api.github.com/repos/" + REPO + "/commits/main", { headers, signal: AbortSignal.timeout(15000) }), "GitHub")).sha || "";
}

// A run that failed on an old commit fails again when re-run, so a workflow main has moved past starts afresh on main.
async function dispatchMain(fetchImpl, token, workflowPath) {
  if (!token) throw new Error("No GitHub token is set.");
  const file = String(workflowPath || "").split("/").pop();
  if (!/^[\w.-]+\.ya?ml$/.test(file)) throw new Error("No workflow file to start: " + String(workflowPath).slice(0, 80));
  const headers = { Authorization: "Bearer " + token, Accept: "application/vnd.github+json", "User-Agent": "qa-lab-jarvis", "X-GitHub-Api-Version": "2022-11-28", "Content-Type": "application/json" };
  const res = await fetchImpl("https://api.github.com/repos/" + REPO + "/actions/workflows/" + file + "/dispatches", { method: "POST", headers, body: JSON.stringify({ ref: "main" }), signal: AbortSignal.timeout(15000) });
  if (res.status === 403 || res.status === 404) throw new Error("GitHub refused to start " + file + " (" + res.status + "); the GitHub token needs Actions: write.");
  if (res.status === 422) throw new Error(file + " cannot be started by hand (it has no workflow_dispatch).");
  if (!res.ok) throw new Error("GitHub " + res.status + " starting " + file + ".");
  return { workflow: file };
}

async function rerunRun(fetchImpl, token, id) {
  if (!token) throw new Error("No GitHub token is set.");
  const headers = { Authorization: "Bearer " + token, Accept: "application/vnd.github+json", "User-Agent": "qa-lab-jarvis", "X-GitHub-Api-Version": "2022-11-28" };
  const res = await fetchImpl("https://api.github.com/repos/" + REPO + "/actions/runs/" + Number(id) + "/rerun-failed-jobs", { method: "POST", headers, signal: AbortSignal.timeout(15000) });
  if (res.status === 403 || res.status === 404) throw new Error("GitHub refused the re-run (" + res.status + "); the GitHub token needs Actions: write.");
  if (!res.ok) throw new Error("GitHub " + res.status + " on the re-run.");
  return { run: Number(id) };
}

// --- briefing rows (#1695) ------------------------------------------------------------------------------------

// The rows a briefing sheet lists: pending ratings, or the messages in range with no answer, test senders left out.
async function briefItems(db, { list, days, now }) {
  const at = (v) => { const d = core.toDate(v); return d ? d.toISOString() : ""; };
  if (list === "ratings") {
    const snap = await db.collection("ratings").where("status", "==", "pending").limit(300).get();
    const rows = snap.docs.map((doc) => Object.assign({ id: doc.id }, doc.data())).filter((r) => !core.isTestEmail(r.email));
    return { list, total: rows.length, rows: rows.sort((a, b) => at(b.createdAt).localeCompare(at(a.createdAt))).slice(0, 50)
      .map((r) => ({ id: r.id, name: String(r.name || "").slice(0, 120), rating: Number(r.rating) || 0, text: String(r.comment || "").slice(0, 600), at: at(r.createdAt) })) };
  }
  if (list === "messages") {
    const snap = await db.collection("messages").where("createdAt", ">=", new Date(now - rangeDays(days) * DAY)).limit(2000).get();
    const rows = snap.docs.map((doc) => Object.assign({ id: doc.id }, doc.data())).filter((m) => m.status !== "rejected" && !m.response && !m.respondedAt && !core.isTestEmail(m.email));
    return { list, total: rows.length, rows: rows.sort((a, b) => at(b.createdAt).localeCompare(at(a.createdAt))).slice(0, 50)
      .map((m) => ({ id: m.id, name: String(m.name || "").slice(0, 120), email: String(m.email || "").slice(0, 160), topic: String(m.topic || "").slice(0, 120), text: String(m.message || "").slice(0, 600), at: at(m.createdAt) })) };
  }
  throw new Error("Unknown list.");
}

const RATING_DECISIONS = { approved: { status: "approved", isAnonymous: false }, "approved-anon": { status: "approved", isAnonymous: true }, rejected: { status: "rejected" } };

// Approve, approve without the name, or reject pending ratings, as Admin > CV Ratings does; at most 50 per call.
async function decideRatings(db, { ids, decision }) {
  const change = RATING_DECISIONS[decision];
  if (!change) throw new Error("Approve or reject the rating.");
  const list = (Array.isArray(ids) ? ids : [ids]).map((id) => String(id || "")).filter((id) => /^[\w-]{1,64}$/.test(id)).slice(0, 50);
  if (!list.length) throw new Error("Which rating?");
  let done = 0;
  for (const id of list) {
    const ref = db.collection("ratings").doc(id);
    const snap = await ref.get();
    if (!snap.exists || (snap.data().status || "pending") !== "pending") continue;
    await ref.update(change);
    done += 1;
  }
  return { decision, done, skipped: list.length - done };
}

// --- ga4 ------------------------------------------------------------------------------------------------------

async function ga4(fetchImpl, { days }) {
  const bearer = await googleToken(fetchImpl, "https://www.googleapis.com/auth/analytics.readonly");
  const span = rangeDays(days);
  const run = async (body) => {
    const data = await readJson(await fetchImpl("https://analyticsdata.googleapis.com/v1beta/properties/" + PROPERTY + ":runReport", {
      method: "POST",
      headers: { Authorization: "Bearer " + bearer, "Content-Type": "application/json" },
      body: JSON.stringify(Object.assign({ dateRanges: [{ startDate: span + "daysAgo", endDate: "today" }, { startDate: (span * 2) + "daysAgo", endDate: (span + 1) + "daysAgo" }] }, body)),
      signal: AbortSignal.timeout(30000)
    }), "GA4");
    return (data.rows || []).map((row) => ({ dims: (row.dimensionValues || []).map((v) => v.value), mets: (row.metricValues || []).map((v) => Number(v.value) || 0) }));
  };
  const metrics = [{ name: "sessions" }, { name: "totalUsers" }, { name: "screenPageViews" }, { name: "engagementRate" }, { name: "averageSessionDuration" }];
  const [groups, countries, sources, daily] = await Promise.all([
    run({ dimensions: [{ name: "contentGroup" }], metrics }),
    run({ dimensions: [{ name: "country" }], metrics: [{ name: "sessions" }], limit: 12, orderBys: [{ metric: { metricName: "sessions" }, desc: true }] }),
    run({ dimensions: [{ name: "sessionSource" }, { name: "sessionMedium" }], metrics: [{ name: "sessions" }], limit: 12, orderBys: [{ metric: { metricName: "sessions" }, desc: true }] }),
    run({ dimensions: [{ name: "date" }], metrics: [{ name: "sessions" }, { name: "totalUsers" }], dateRanges: [{ startDate: span + "daysAgo", endDate: "today" }], orderBys: [{ dimension: { dimensionName: "date" } }] })
  ]);
  // With two date ranges GA4 adds a dateRange dimension last: date_range_0 is now, date_range_1 the prior span.
  const split = (rows) => {
    const out = {};
    rows.forEach((row) => {
      const which = row.dims[row.dims.length - 1] === "date_range_1" ? "prior" : "now";
      const key = row.dims.slice(0, -1).join(" / ") || "(not set)";
      out[key] = out[key] || { now: null, prior: null };
      out[key][which] = row.mets;
    });
    return out;
  };
  const named = split(groups);
  return {
    ok: true,
    groups: Object.keys(named).map((key) => {
      const [sessions, users, views, engagement, duration] = named[key].now || [0, 0, 0, 0, 0];
      const prior = named[key].prior || [0, 0, 0, 0, 0];
      return { group: key, sessions, users, views, engagement: Math.round(engagement * 1000) / 10, duration: Math.round(duration), priorSessions: prior[0], priorUsers: prior[1] };
    }).sort((a, b) => b.sessions - a.sessions),
    countries: Object.entries(split(countries)).map(([label, v]) => ({ label, value: (v.now || [0])[0], prior: (v.prior || [0])[0] })).sort((a, b) => b.value - a.value).slice(0, 12),
    sources: Object.entries(split(sources)).map(([label, v]) => ({ label, value: (v.now || [0])[0], prior: (v.prior || [0])[0] })).sort((a, b) => b.value - a.value).slice(0, 12),
    daily: daily.map((row) => ({ date: row.dims[0].replace(/^(\d{4})(\d{2})(\d{2})$/, "$1-$2-$3"), sessions: row.mets[0], users: row.mets[1] }))
  };
}

// --- cloudflare -----------------------------------------------------------------------------------------------

async function cloudflare(fetchImpl, env, { days, now }) {
  const token = env.CLOUDFLARE_ANALYTICS_TOKEN || env.CLOUDFLARE_API_TOKEN;
  if (!token || !env.CLOUDFLARE_ZONE_ID) return { ok: false, error: "Cloudflare token or zone is not set." };
  const from = isoDay(now - Math.min(rangeDays(days), 30) * DAY);
  const query = `{viewer{zones(filter:{zoneTag:"${env.CLOUDFLARE_ZONE_ID.replace(/[^a-f0-9]/gi, "")}"}){httpRequests1dGroups(limit:60,orderBy:[date_ASC],filter:{date_geq:"${from}"}){dimensions{date} sum{requests bytes cachedRequests threats pageViews} uniq{uniques}}}}}`;
  const data = await readJson(await fetchImpl("https://api.cloudflare.com/client/v4/graphql", {
    method: "POST",
    headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
    body: JSON.stringify({ query }),
    signal: AbortSignal.timeout(15000)
  }), "Cloudflare");
  if (data.errors && data.errors.length) {
    const message = String(data.errors[0].message || "");
    return { ok: false, error: /permission/i.test(message) ? "The Cloudflare token needs Zone > Analytics > Read." : message.slice(0, 200) };
  }
  const zone = (((data.data || {}).viewer || {}).zones || [])[0] || {};
  const daily = (zone.httpRequests1dGroups || []).map((row) => ({ date: row.dimensions.date, requests: row.sum.requests, bytes: row.sum.bytes, cached: row.sum.cachedRequests, threats: row.sum.threats, pageViews: row.sum.pageViews, uniques: row.uniq.uniques }));
  const sum = (key) => daily.reduce((total, row) => total + (Number(row[key]) || 0), 0);
  const requests = sum("requests");
  const out = { ok: true, from, requests, bytes: sum("bytes"), cacheRatio: requests ? Math.round((sum("cached") / requests) * 1000) / 10 : 0, threats: sum("threats"), pageViews: sum("pageViews"), uniques: sum("uniques"), daily };
  return Object.assign(out, await cloudflareBreakdown(fetchImpl, token, env.CLOUDFLARE_ZONE_ID, { from, now }));
}

// Countries, status codes and content types over the range; the top paths only for the last 24 hours (plan limit).
async function cloudflareBreakdown(fetchImpl, token, zone, { from, now }) {
  const tag = String(zone).replace(/[^a-f0-9]/gi, "");
  const since = new Date(now - DAY).toISOString().replace(/\.\d+Z$/, "Z");
  const until = new Date(now).toISOString().replace(/\.\d+Z$/, "Z");
  const query = `{viewer{zones(filter:{zoneTag:"${tag}"}){maps:httpRequests1dGroups(limit:60,filter:{date_geq:"${from}"}){sum{countryMap{clientCountryName requests threats} responseStatusMap{edgeResponseStatus requests} contentTypeMap{edgeResponseContentTypeName requests}}} paths:httpRequestsAdaptiveGroups(limit:15,orderBy:[count_DESC],filter:{datetime_geq:"${since}",datetime_leq:"${until}",requestSource:"eyeball"}){count dimensions{clientRequestPath}}}}}`;
  try {
    const data = await readJson(await fetchImpl("https://api.cloudflare.com/client/v4/graphql", {
      method: "POST",
      headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
      body: JSON.stringify({ query }),
      signal: AbortSignal.timeout(15000)
    }), "Cloudflare");
    if (data.errors && data.errors.length) return { breakdownError: String(data.errors[0].message || "").slice(0, 160) };
    const zoneData = (((data.data || {}).viewer || {}).zones || [])[0] || {};
    const countries = {}, threatsBy = {}, statuses = {}, types = {};
    (zoneData.maps || []).forEach((row) => {
      (row.sum.countryMap || []).forEach((c) => { count(countries, c.clientCountryName, c.requests); if (c.threats) count(threatsBy, c.clientCountryName, c.threats); });
      (row.sum.responseStatusMap || []).forEach((s) => count(statuses, String(s.edgeResponseStatus), s.requests));
      (row.sum.contentTypeMap || []).forEach((s) => count(types, s.edgeResponseContentTypeName, s.requests));
    });
    return {
      countries: top(countries, 15), threatCountries: top(threatsBy, 10), statuses: top(statuses, 12), contentTypes: top(types, 10),
      paths: (zoneData.paths || []).map((row) => ({ label: row.dimensions.clientRequestPath, value: row.count }))
    };
  } catch (error) {
    return { breakdownError: String(error.message || error).slice(0, 160) };
  }
}

// --- speed: PageSpeed + CrUX ----------------------------------------------------------------------------------

async function speed(core, env) {
  const key = env.PAGESPEED_KEY;
  if (!key) return { ok: false, error: "PAGESPEED_KEY is not set." };
  const pages = await Promise.all(PAGES.map(async (page) => {
    try {
      const result = await core.pageSpeed(page.url, key);
      if (!result || !result.ok) return Object.assign({}, page, { ok: false, error: (result && result.error) || "no answer" });
      const field = result.field || {};
      return Object.assign({}, page, { ok: true, score: result.score, lab: result.lab, field: { scope: field.scope || "", overall: field.overall || "", lcp: field.lcp || null, inp: field.inp || null, cls: field.cls || null } });
    } catch (error) {
      return Object.assign({}, page, { ok: false, error: String(error.message || error).slice(0, 160) });
    }
  }));
  let crux = null;
  try {
    crux = await core.cruxHistory(ORIGIN + "/", env.CRUX_KEY || key);
  } catch (error) {
    crux = { ok: false, error: String(error.message || error).slice(0, 160) };
  }
  return { ok: true, pages, crux };
}

// --- uptime + TLS ---------------------------------------------------------------------------------------------

function tlsDaysLeft(host, now) {
  return new Promise((resolve) => {
    const socket = require("tls").connect({ host, port: 443, servername: host, timeout: 8000 }, () => {
      const cert = socket.getPeerCertificate();
      socket.end();
      resolve(cert && cert.valid_to ? Math.floor((new Date(cert.valid_to).getTime() - now) / DAY) : null);
    });
    socket.on("error", () => resolve(null));
    socket.on("timeout", () => { socket.destroy(); resolve(null); });
  });
}

async function uptime(fetchImpl, { now, tls }) {
  const pages = await Promise.all(PAGES.map(async (page) => {
    const started = Date.now();
    try {
      const res = await fetchImpl(page.url, { redirect: "follow", signal: AbortSignal.timeout(15000), headers: { "User-Agent": "qa-lab-jarvis" } });
      const body = await res.text();
      return Object.assign({}, page, { status: res.status, ms: Date.now() - started, bytes: body.length, ok: res.ok });
    } catch (error) {
      return Object.assign({}, page, { status: 0, ms: Date.now() - started, ok: false, error: String(error.message || error).slice(0, 120) });
    }
  }));
  const daysLeft = await (tls || tlsDaysLeft)("carlosandmunoz.com", now);
  return { ok: true, pages, tlsDaysLeft: daysLeft };
}

// The hourly watch counts each page check per Bogota day in jarvis_uptime (#2139), for the 90-day strip.
function uptimeTally(up, now) {
  const pages = (up && up.ok !== false && Array.isArray(up.pages)) ? up.pages : [];
  return { date: core.zoneParts(new Date(now)).day, checks: pages.length, up: pages.filter((p) => p.ok).length };
}

async function uptimeLog(db, up, now, increment) {
  const t = uptimeTally(up, now);
  if (!t.checks) return t;
  await db.collection("jarvis_uptime").doc(t.date).set({ date: t.date, checks: increment(t.checks), up: increment(t.up), at: new Date(now).toISOString() }, { merge: true });
  return t;
}

async function uptimeHistory(db, now) {
  const from = core.zoneParts(new Date(now - 90 * DAY)).day;
  const snap = await db.collection("jarvis_uptime").where("date", ">=", from).limit(120).get();
  return snap.docs.map((d) => d.data()).map((r) => ({ date: r.date, checks: Number(r.checks) || 0, up: Number(r.up) || 0 })).sort((a, b) => (a.date < b.date ? -1 : 1));
}

// --- brief / ask: Gemini --------------------------------------------------------------------------------------

const VOICE = "You are Jarvis, the analyst for Carlos's sites: the CV (carlosandmunoz.com), QA Studio (a test-sprint simulator), "
  + "QA Lab (a regression lab), QA-lab URL Review (paid website reviews), the Social hub, and the systems behind them. "
  + "Use only the numbers in the JSON you get. Plain English, short sentences, no hype, no markdown tables. "
  + "Name the product, the number and the comparison. Say when a number is too small to mean anything.";

async function gemini(fetchImpl, env, prompt, maxTokens) {
  if (!env.GEMINI_API_KEY) throw new Error("GEMINI_API_KEY is not set.");
  const started = Date.now();
  const what = String(prompt || "").replace(/\s+/g, " ").slice(0, 120);
  try {
    const text = await geminiCall(fetchImpl, env, prompt, maxTokens);
    await jarvisLog.log(null, { source: "gemini", level: "info", text: "Gemini ok in " + (Date.now() - started) + " ms, " + text.length + " chars: " + what });
    return text;
  } catch (error) {
    await jarvisLog.log(null, { source: "gemini", level: "error", text: "Gemini failed in " + (Date.now() - started) + " ms: " + String(error.message || error).slice(0, 140) + " · " + what });
    throw error;
  }
}

async function geminiCall(fetchImpl, env, prompt, maxTokens) {
  const res = await fetchImpl(GEMINI + (env.GEMINI_MODEL || MODEL) + ":generateContent", {
    method: "POST",
    headers: { "x-goog-api-key": env.GEMINI_API_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: VOICE }] },
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.3, maxOutputTokens: maxTokens || 1200, thinkingConfig: { thinkingLevel: "low" } }
    }),
    signal: AbortSignal.timeout(60000)
  });
  const data = await readJson(res, "Gemini");
  const candidate = (data.candidates || [])[0] || {};
  const text = ((candidate.content || {}).parts || []).map((part) => part.text || "").join("").trim();
  if (!text) throw new Error("Gemini sent no text (" + (candidate.finishReason || "unknown") + ").");
  return text;
}

function snapshotText(snapshot) {
  const text = JSON.stringify(snapshot || {});
  return text.length > 60000 ? text.slice(0, 60000) : text;
}

async function brief(fetchImpl, env, snapshot) {
  const text = await gemini(fetchImpl, env, "Write the briefing for these numbers: three to six short paragraphs or bullet lines, most important first: "
    + "what moved, what needs action today, what is healthy. End with one line that starts with 'Next:' and names the single best next action.\n\n" + snapshotText(snapshot));
  return { text };
}

// --- voice (#1418): answers in the phone's language, spoken with a Cloud Text-to-Speech voice ----------------------

const TTS = "https://texttospeech.googleapis.com/v1/text:synthesize";
const VOICE_LOCALE = { en: "en-US", es: "es-ES", pt: "pt-BR", de: "de-DE", fr: "fr-FR", it: "it-IT" };
const VOICE_NAME = "Chirp3-HD-Charon";
/** #1674: the voices the app and the web offer; the first of each language is its default. */
const VOICES = [
  { name: "en-GB-Chirp3-HD-Orus", lang: "en", label: "Orus, British" },
  { name: "en-US-Chirp3-HD-Charon", lang: "en", label: "Charon, American" },
  { name: "es-US-Chirp3-HD-Algenib", lang: "es", label: "Algenib, Latin American" },
  { name: "es-ES-Chirp3-HD-Charon", lang: "es", label: "Charon, Spain" }
];
const VOICE_RATE = { min: 0.75, max: 1.25, default: 0.95 };

/** The catalog voice asked for when it speaks the answer's language, else that language's default, else Charon. */
function voiceFor(code, asked) {
  const pick = VOICES.find((v) => v.name === asked && v.lang === code) || VOICES.find((v) => v.lang === code);
  if (pick) return { languageCode: pick.name.slice(0, 5), name: pick.name };
  const locale = VOICE_LOCALE[code] || code;
  return { languageCode: locale, name: locale + "-" + VOICE_NAME };
}

function voiceRate(rate) {
  const r = Number(rate);
  return Number.isFinite(r) && r > 0 ? Math.min(VOICE_RATE.max, Math.max(VOICE_RATE.min, r)) : VOICE_RATE.default;
}

function langCode(lang) {
  const code = String(lang || "").toLowerCase().split(/[-_]/)[0];
  return /^[a-z]{2,3}$/.test(code) ? code : "en";
}

function languageName(code) {
  try { return new Intl.DisplayNames(["en"], { type: "language" }).of(code) || "English"; } catch (error) { return "English"; }
}

async function ask(fetchImpl, env, question, snapshot, opts) {
  const q = String(question || "").trim().slice(0, 500);
  if (!q) throw new Error("Ask a question.");
  const o = opts || {};
  const code = langCode(o.lang);
  const how = o.spoken
    ? "Answer in at most four short spoken sentences: plain text, no markdown, no lists, numbers said the way a person would say them."
    : core.askHint(o.device) || "Answer in at most six sentences from these numbers.";
  const language = code === "en" ? "" : " Answer in " + languageName(code) + ".";
  const text = await gemini(fetchImpl, env, "Question: " + q + "\n\n" + how + language + " If the numbers cannot answer it, say which number is missing.\n\n" + snapshotText(snapshot), 800);
  return { text, lang: code };
}

/** Markdown and list marks read badly aloud. */
function speakable(text) {
  return String(text || "")
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/^[\s>*#-]+/gm, "")
    .replace(/[*_`#]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 2400);
}

async function speak(fetchImpl, text, lang, opts) {
  const input = speakable(text);
  if (!input) throw new Error("Nothing to say.");
  const o = opts || {};
  const code = langCode(lang);
  const voice = voiceFor(code, o.voice);
  const rate = voiceRate(o.rate);
  const bearer = await googleToken(fetchImpl, "https://www.googleapis.com/auth/cloud-platform");
  const call = (v, audioConfig) => fetchImpl(TTS, {
    method: "POST",
    headers: { Authorization: "Bearer " + bearer, "Content-Type": "application/json" },
    body: JSON.stringify({ input: { text: input }, voice: v, audioConfig: Object.assign({ audioEncoding: "MP3" }, audioConfig) }),
    signal: AbortSignal.timeout(30000)
  });
  let used = voice.name;
  let res = await call(voice, { speakingRate: rate });
  if (!res.ok) res = await call(voice, {});
  if (!res.ok) { used = null; res = await call({ languageCode: voice.languageCode, ssmlGender: "MALE" }, {}); }
  const data = await readJson(res, "Text-to-Speech");
  if (!data.audioContent) throw new Error("Text-to-Speech sent no audio.");
  return { audio: data.audioContent, format: "mp3", lang: code, voice: used, rate };
}

function briefingMail(snapshot, text) {
  const products = (snapshot && snapshot.products) || {};
  const rows = Object.keys(products).slice(0, 12).map((key) => {
    const p = products[key] || {};
    const kpis = (p.kpis || []).slice(0, 4).map((k) => k.label + " " + k.value + (k.delta ? " (" + k.delta + ")" : "")).join(" · ");
    return { label: p.name || key, value: kpis || "no data" };
  });
  return { subject: "Jarvis briefing: " + String((snapshot && snapshot.range) || "") , rows, body: String(text || "").slice(0, 8000) };
}


// --- settings: goals, thresholds, mail switches (jarvis_settings/main) -----------------------------------------

// The emails Jarvis also pushes are off by default and wait for the evening digest (#1672); a switch brings one back.
const MOVED_MAIL = ["messages", "ratings", "siteDaily", "siteQuarter", "reviewDaily", "reviewQuarter", "reruns", "reviewOpened", "comparisons", "reviewEvents", "ops", "ownerReplies", "ownerRemind"];
const MAIL_DEFAULTS = Object.assign({ daily: false, gemini: true, watch: false, weekly: true, digest: true }, Object.fromEntries(MOVED_MAIL.map((key) => [key, false])));
// Settings saved before the digest kept daily and watch on; those two read as the new defaults until saved again.
const MAIL_VERSION = 2;

function normalizeSettings(data) {
  const d = data || {};
  const mail = Object.assign({}, MAIL_DEFAULTS);
  const kept = d.mailVersion === MAIL_VERSION ? Object.keys(MAIL_DEFAULTS) : Object.keys(MAIL_DEFAULTS).filter((key) => key !== "daily" && key !== "watch");
  kept.forEach((key) => { if (d.mail && typeof d.mail[key] === "boolean") mail[key] = d.mail[key]; });
  const searchQueries = Array.from(new Set((Array.isArray(d.searchQueries) ? d.searchQueries : []).map((q) => String(q || "").replace(/\s+/g, " ").trim().slice(0, 80)).filter(Boolean))).slice(0, 8);
  const github = { repos: core.githubRepos(d.github && d.github.repos) };
  return { goals: core.cleanGoals(d.goals), thresholds: core.thresholds(d.thresholds), mail, mailVersion: MAIL_VERSION, searchQueries, github, actions: actions.cleanSettings(d.actions), layout: core.cleanLayout(d.layout), updatedAt: String(d.updatedAt || "") };
}

async function readSettings(db) {
  const snap = await db.collection("jarvis_settings").doc("main").get().catch(() => null);
  return normalizeSettings(snap && snap.exists ? snap.data() : {});
}

async function saveSettings(db, input, by) {
  const layout = input && input.layout !== undefined ? input.layout : (await readSettings(db)).layout;
  const clean = normalizeSettings(Object.assign({}, input, { mailVersion: MAIL_VERSION, layout }));
  const doc = { goals: clean.goals, thresholds: clean.thresholds, mail: clean.mail, mailVersion: MAIL_VERSION, searchQueries: clean.searchQueries, github: clean.github, actions: clean.actions, layout: clean.layout, updatedAt: new Date().toISOString(), by: String(by || "") };
  await db.collection("jarvis_settings").doc("main").set(doc);
  return normalizeSettings(doc);
}

// One tab's section layout (#2809) from the web or the app: the other tabs and the rest of the settings stay. A tab set to null is back to the default.
async function saveLayout(db, patch, by) {
  const tabs = Object.keys(patch && typeof patch === "object" && !Array.isArray(patch) ? patch : {}).filter((tab) => core.LAYOUT_TABS.includes(tab));
  if (!tabs.length) throw new Error("No Jarvis tab in the layout.");
  const ref = db.collection("jarvis_settings").doc("main");
  const snap = await ref.get();
  const data = snap && snap.exists ? snap.data() : {};
  const layout = core.cleanLayout(data.layout);
  tabs.forEach((tab) => {
    const one = core.cleanLayout({ [tab]: patch[tab] })[tab];
    if (one) layout[tab] = one; else delete layout[tab];
  });
  const doc = Object.assign({}, data, { layout, layoutAt: new Date().toISOString(), layoutBy: String(by || "") });
  await ref.set(doc);
  return normalizeSettings(doc);
}

// --- goals: count and sum aggregations, a few reads each --------------------------------------------------------

const SITE_KINDS = { visits: "visit", exports: "export", runs: "run" };

async function goalValue(db, goal, start, end, sum) {
  const total = async (q) => (await q.count().get()).data().count;
  const between = (q, iso) => q.where("createdAt", ">=", iso ? start.toISOString() : start).where("createdAt", "<", iso ? end.toISOString() : end);
  if (SITE_KINDS[goal.metric] && ["cv", "studio", "lab"].includes(goal.product)) {
    return total(between(db.collection("site_events").where("site", "==", goal.product).where("kind", "==", SITE_KINDS[goal.metric])));
  }
  if (goal.product === "review") {
    if (goal.metric === "opens") return total(between(db.collection("url_review_opens")));
    if (goal.metric === "reviews") return total(between(db.collection("url_reviews"), true));
    const paid = between(db.collection("url_reviews").where("paid", "==", true), true);
    if (goal.metric === "paid") return total(paid);
    const snap = await paid.aggregate({ usd: sum("priceUsd") }).get();
    return Math.round((Number(snap.data().usd) || 0) * 100) / 100;
  }
  if (goal.product === "inbox") return total(between(db.collection(goal.metric === "ratings" ? "ratings" : "messages")));
  throw new Error("No such goal.");
}

async function goals(db, settings, { now, sum }) {
  const at = new Date(now);
  const list = (settings || {}).goals || [];
  return Promise.all(list.map(async (goal) => {
    const w = core.periodWindow(goal.period, at);
    try {
      return core.goalProgress(goal, await goalValue(db, goal, w.start, w.end, sum), at);
    } catch (error) {
      return Object.assign(core.goalProgress(goal, 0, at), { error: String(error.message || error).slice(0, 160) });
    }
  }));
}

// --- daily briefing: the last 24 hours against the 24 before, with the same rules as the page --------------------

// Pending ratings outside the range only add to the pending count: a count() probe, and a re-read when it moves.
async function pendingRatings(db, now) {
  const pending = db.collection("ratings").where("status", "==", "pending");
  const ref = db.collection("jarvis_cache").doc("pending-ratings");
  const [total, saved] = await Promise.all([
    pending.count().get().then((snap) => snap.data().count),
    ref.get().then((snap) => (snap.exists ? snap.data() : null)).catch(() => null)
  ]);
  if (saved && saved.total === total && now - Date.parse(saved.at) < 6 * 60 * MINUTE) return saved.kept;
  const snap = await pending.select("email").get();
  const kept = snap.docs.filter((doc) => !core.isTestEmail((doc.data() || {}).email)).length;
  await ref.set({ total, kept, at: new Date(now).toISOString() }).catch(() => null);
  return kept;
}

async function dailyProducts(db, { now, days = 1 }) {
  const end = new Date(now);
  const start = new Date(now - days * DAY);
  const priorStart = new Date(now - 2 * days * DAY);
  const window = { start, end, days, prior: { start: priorStart, end: start } };
  const rows = async (q) => (await q.limit(20000).get()).docs.map((doc) => Object.assign({ id: doc.id }, doc.data()));
  const since = (name) => db.collection(name).where("createdAt", ">=", priorStart);
  const [{ events, opens, reviews }, messages, ratings, pending, hubSnap] = await Promise.all([
    dayRows.rows(db, ["events", "opens", "reviews"], { from: priorStart.getTime(), now }),
    rows(since("messages")), rows(since("ratings")),
    pendingRatings(db, now),
    db.collection("socialHubStats").doc("latest").get().catch(() => null)
  ]);
  const inside = (row) => { const when = core.toDate(row.createdAt); return !!when && when >= start; };
  const now1 = events.filter(inside);
  const was = events.filter((row) => !inside(row));
  const keep = (email) => !core.isTestEmail(email);
  const pendingCount = pending + ratings.filter((row) => !row.status && keep(row.email)).length;
  const products = {
    inbox: core.summarizeInbox(messages, ratings, window, window.prior, keep, pendingCount),
    cv: core.summarizeSite("cv", now1, was, window),
    studio: core.summarizeSite("studio", now1, was, window),
    lab: core.summarizeSite("lab", now1, was, window),
    review: core.summarizeReview({ opens: opens.filter(inside), reviews: reviews.filter(inside), events: now1, prior: { opens: opens.filter((row) => !inside(row)).length, reviews: reviews.filter((row) => !inside(row)).length } }, window),
    hub: core.summarizeHub(hubSnap && hubSnap.exists ? hubSnap.data() : null, now1, window, was)
  };
  const nowOpens = opens.filter(inside), nowReviews = reviews.filter(inside);
  return { window, products, outreachVisits: core.outreachVisits(now1), feed: core.feed({ events: now1, opens: nowOpens, reviews: nowReviews }), socialHeat: core.socialHeat(now1) };
}

// The Mailed reports panel: the newest period reports sent to the owner.
async function mailedReports(db) {
  const snap = await db.collection("url_review_reports").orderBy("emailedAt", "desc").limit(12).get();
  return snap.docs.map((doc) => { const d = doc.data() || {}; return { id: doc.id, period: d.period || "", label: d.label || "", opens: d.opens || 0, reviews: d.reviews || 0, paidUsd: d.paidUsd || 0 }; });
}

// The page's snapshot() for Gemini and the briefing mail, built from the server snapshot the Android app reads.
function askSnapshot(snap, days) {
  const s = snap || {};
  const e = s.external || {};
  const products = Object.keys(s.products || {}).reduce((out, key) => {
    const p = s.products[key] || {};
    out[key] = { name: (core.PRODUCTS.find((row) => row.key === key) || {}).name || key, kpis: (p.kpis || []).map((k) => ({ label: k.label, value: k.value, delta: k.delta })),
      top: Object.keys(p.lists || {}).reduce((m, list) => { m[list] = (p.lists[list] || []).slice(0, 5); return m; }, {}) };
    return out;
  }, {});
  const ok = (x) => x && x.ok !== false;
  return {
    range: days === 1 ? "last 24 hours" : "last " + days + " days", generatedAt: new Date().toISOString(), products,
    briefing: (s.briefing || []).map((b) => "[" + b.level + "] " + b.text),
    external: {
      readiness: core.readiness(e),
      jobs: e.jobs && e.jobs.jobs ? e.jobs.jobs.map((j) => ({ name: j.name, ok: j.ok, last: j.lastAttempt })) : null,
      ci: e.github && e.github.ci, openBugs: e.github && e.github.openBugs, merged: e.github && e.github.merged && e.github.merged.total,
      failures: e.health && e.health.failures && { total: e.health.failures.total, causes: e.health.failures.causes },
      speed: e.speed && e.speed.pages && e.speed.pages.map((x) => ({ page: x.name, score: x.score })),
      uptime: e.uptime && e.uptime.pages && e.uptime.pages.map((x) => ({ page: x.name, status: x.status, ms: x.ms })),
      ga4: e.ga4 && e.ga4.groups,
      cloudflare: ok(e.cloudflare) ? { requests: e.cloudflare.requests, threats: e.cloudflare.threats, cacheRatio: e.cloudflare.cacheRatio, statuses: e.cloudflare.statuses, paths: (e.cloudflare.paths || []).slice(0, 8) } : null,
      money: ok(e.money) ? { revenue: e.money.revenue, prior: e.money.prior, refundsUsd: e.money.refundsUsd, disputesOpen: e.money.paypal && e.money.paypal.disputesOpen } : null,
      email: ok(e.email) ? { totals: e.email.totals, rates: e.email.rates } : null,
      mailbox: ok(e.mailbox) ? { totals: e.mailbox.totals, smtp: e.mailbox.smtp, canary: e.mailbox.canary && e.mailbox.canary.state, problems: (e.mailbox.problems || []).slice(0, 5).map((m) => m.alias + "@ " + m.outcome + ": " + m.reason) } : null,
      addresses: ok(e.addresses) ? { counts: e.addresses.counts, issues: (e.addresses.issues || []).slice(0, 8).map((i) => i.text + (i.by === "jarvis" ? " (Jarvis fixes it)" : "")) } : null,
      search: ok(e.search) ? { brave: e.search.brave && e.search.brave.queries, console: e.search.console && e.search.console.ok ? { clicks: e.search.console.clicks, impressions: e.search.console.impressions, position: e.search.console.position, queries: (e.search.console.queries || []).slice(0, 8) } : null } : null,
      social: ok(e.social) ? { sent: e.social.sent, failed: e.social.failed, channels: e.social.channels, youtubeViews: e.social.youtube && e.social.youtube.views, telegramMembers: e.social.telegram ? { now: e.social.telegram.members, change: e.social.telegram.change } : null, redditMembers: e.social.reddit ? { now: e.social.reddit.members, change: e.social.reddit.change } : null, postNumbers: (e.social.queue || []).filter((c) => c.numbers && Object.keys(c.numbers).length).map((c) => Object.assign({ channel: c.name, sent: c.sent }, c.numbers)) } : null,
      safety: ok(e.safety) && e.safety.checks ? e.safety.checks.map((c) => c.level + ": " + c.name + " " + c.detail) : null,
      platform: ok(e.platform) ? { functions: e.platform.functions && { executions: e.platform.functions.executions, failures: e.platform.functions.failures, byFunction: e.platform.functions.byFunction }, gemini: e.platform.gemini, firestore: e.platform.firestore, users: e.platform.users } : null,
      outreach: outreachAsk(e.outreach, s.outreachVisits),
      targets: targetsAsk(e.targets),
      engagement: engagementAsk(e.engagement),
      signedInPeople: ok(e.people) ? e.people.totals : null,
      googleMapsLocal: ok(e.local) && e.local.totals ? { totals: e.local.totals, issues: e.local.issues, lastError: e.local.lastError } : null,
      github: githubAsk(e["github-work"]),
      waiting: core.connections(e).filter((c) => c.needs.length).map((c) => c.name + ": " + c.needs.join(" "))
    },
    // Live processes (#2548): what runs now, waits on Carlos or ended in the last day.
    processes: ((s.processes || {}).rows || []).slice(0, 20).map((r) => r.kind + " " + r.name + ": " + r.state + (r.needsYou ? " (needs you)" : "") + (r.step ? " · " + r.step : "") + " · since " + (r.startedAt || ""))
  };
}

// The github-work source (#2526) in a few hundred tokens, so Ask can answer GitHub questions; retro reads it too.
function githubAsk(g) {
  if (!g || g.ok === false) return null;
  const ci = g.ci || {};
  const prs = g.prs || {};
  const sec = g.security || {};
  const pick = (o, keys) => (o ? keys.reduce((m, k) => { if (o[k] !== undefined) m[k] = o[k]; return m; }, {}) : null);
  return {
    score: g.score && { overall: g.score.overall, areas: Object.keys(g.score.areas || {}).reduce((m, k) => { m[k] = g.score.areas[k].grade + " " + g.score.areas[k].value; return m; }, {}) },
    dora: g.dora, streaks: pick(g.streaks, ["greenMainDays", "mergeDays", "xp", "level"]),
    ci: pick(ci, ["passRate", "runs", "failed", "minutes", "queueMedS", "durMedS"]),
    flaky: ci.flaky && { pct: ci.flaky.pct, workflows: (ci.flaky.workflows || []).slice(0, 5) },
    failing: (ci.failing || []).slice(0, 5).map((r) => ({ workflow: r.name, branch: r.branch, at: r.at, attempt: r.attempt, cause: r.diag ? r.diag.cause : null, category: r.diag ? r.diag.category : null })),
    prs: pick(prs, ["open", "draft", "mergeReady", "conflicts", "behind", "red", "stale", "orphan", "leadMedH", "leadP90H", "merged"]),
    board: g.board && { columns: (g.board.columns || []).map((c) => c.name + " " + c.count), wip: g.board.wip, wipLimit: g.board.wipLimit, cycleMedD: g.board.cycleMedD, drift: (g.board.drift || []).length },
    issues: pick(g.issues, ["open", "openBugs", "opened", "closed"]),
    security: { dependabot: pick(sec.dependabot, ["open", "critical", "high"]), codeScanning: pick(sec.codeScanning, ["open"]), secrets: pick(sec.secrets, ["open"]) },
    budget: g.budget && g.budget.kaanmuar ? { graphql: g.budget.kaanmuar.graphql, core: g.budget.kaanmuar.core } : null,
    branches: pick(g.branches, ["total", "stale"]), needs: (g.needs || []).slice(0, 5), retro: g.ai && g.ai.retro ? String(g.ai.retro.text || "").slice(0, 600) : null
  };
}

// Same shape as the page's snapshot().external.engagement.
function engagementAsk(g) {
  if (!g || !g.ok || !g.report) return null;
  return {
    paused: g.paused, live: g.live, accounts: (g.accounts || []).map((a) => ({ network: a.network, connected: a.connected, account: a.account, error: a.error })),
    totals: g.report.totals, approvalRate: g.report.approvalRate, topics: g.report.topics, tags: (g.report.tags || []).slice(0, 10), networks: g.report.networks,
    waiting: (g.waiting || []).length, topPosts: (g.posts || []).slice(0, 5).map((d) => d.network + ": " + (d.title || String(d.text || "").slice(0, 100)) + " (score " + d.score + ")"),
    reportReplies: Object.assign({ waiting: (g.waiting || []).filter((d) => d.campaign === "report-reply").length }, g.report.invites),
    ownerTags: ownerTagsAsk(g.ownerTags)
  };
}

// Owner tags (#2633, #2660) for Ask: the state, the last run, accounts by status, suggestions waiting for Carlos, and posts per network in the last 7 days.
function ownerTagsAsk(o) {
  if (!o) return null;
  const comments = o.comments || [];
  const failed = comments.filter((c) => c.status === "failed");
  return {
    state: o.settings ? (o.settings.paused ? "paused" : o.settings.live ? "live" : "dry run") : null, last: o.last && Object.assign({}, o.last, { sample: undefined }), accounts: o.accounts,
    waiting: (o.accounts || {}).suggested || 0, postedLast7Days: o.week || {}, queued: comments.filter((c) => c.status === "approved").length,
    failed: failed.length, lastError: failed.length ? failed[0].network + ": " + String(failed[0].error || "").slice(0, 160) : null
  };
}

// Same shape as the page's snapshot().external.targets: the 90-day targets as Jarvis judged them.
function targetsAsk(tg) {
  if (!tg || !tg.ok) return null;
  return { day: tg.day, length: tg.length, targets: (tg.targets || []).map((t) => ({ label: t.label, actual: t.actual, target: t.target, status: t.status, perWeek: t.perWeek, how: t.how })) };
}

// Same shape as the page's snapshot().external.outreach.
function outreachAsk(ou, visits) {
  if (!ou || !ou.ok) return null;
  const pipe = ou.pipeline && ou.pipeline.ok ? ou.pipeline : null;
  const mail = ou.instantly && ou.instantly.ok ? ou.instantly : null;
  const plan = ou.plan && ou.plan.ok !== false ? ou.plan : null;
  const links = ou.links && ou.links.ok ? ou.links : null;
  return {
    pipeline: pipe ? { queued: pipe.queued, swept: pipe.swept, reviews: pipe.reviews, thisWeek: pipe.thisWeek, withLiveReport: pipe.withLiveReport, bySegment: pipe.bySegment } : null,
    instantly: mail ? { campaigns: mail.status, sent: mail.sent, rates: mail.rates, replies: mail.replies, interested: mail.interested, meetings: mail.meetings, warmup: (mail.accounts || []).map((a) => a.score) } : null,
    plan: plan ? { day: plan.day, length: plan.length, phase: plan.phase, next: plan.next, weekly: plan.weekly, targets: plan.targets } : null,
    visits: visits ? visits.total : 0,
    links: links ? { live: links.live, visits: links.visits, reviews: links.reviews, paid: links.paid, usd: links.usd, byCampaign: links.byCampaign, topProspects: (links.prospects || []).slice(0, 10),
      reportReplies: links.social ? { visits: links.social.visits, reviews: links.social.reviews, paid: links.social.paid, usd: links.social.usd, networks: links.social.networks, topPosts: (links.social.posts || []).slice(0, 10) } : null } : null
  };
}

function compact(products) {
  return Object.keys(products).reduce((out, key) => {
    const p = products[key];
    out[key] = { name: (core.PRODUCTS.find((row) => row.key === key) || {}).name || key, kpis: (p.kpis || []).map((k) => ({ label: k.label, value: k.value, prior: k.prior, delta: k.delta })) };
    return out;
  }, {});
}

const LEVEL_MARK = { alert: "ALERT", warn: "WARN", good: "GOOD", info: "INFO" };

function dailyMail({ products, items, goalRows, aiText, dateLabel }) {
  const counts = items.reduce((m, row) => { m[row.level] = (m[row.level] || 0) + 1; return m; }, {});
  const rows = Object.keys(products).map((key) => {
    const p = products[key];
    const value = (p.kpis || []).slice(0, 4).map((k) => k.label + " " + k.value + (k.delta ? " (" + k.delta + ")" : "")).join(" · ");
    return { label: (core.PRODUCTS.find((row) => row.key === key) || {}).name || key, value: value || "no data" };
  });
  goalRows.forEach((g) => rows.push({ label: "Goal", value: g.label + ": " + g.value + " of " + g.target + " (" + g.pct + "%, " + g.status.replace("-", " ") + ")" }));
  const lines = items.map((row) => LEVEL_MARK[row.level] + "  " + row.text);
  const body = (aiText ? aiText.trim() + "\n\n" : "") + (lines.length ? lines.join("\n") : "Nothing needs you today.");
  const head = (counts.alert ? counts.alert + " alert" + (counts.alert > 1 ? "s" : "") : "") + (counts.alert && counts.warn ? ", " : "") + (counts.warn ? counts.warn + " warning" + (counts.warn > 1 ? "s" : "") : "");
  return { subject: "Jarvis daily briefing, " + dateLabel + (head ? ": " + head : ": all clear"), intro: "Your last 24 hours across the CV, QA Studio, QA Lab, URL Review, the Social hub and the systems behind them.", rows, body: body.slice(0, 12000) };
}

// --- watch: alerts only, once a day per issue -------------------------------------------------------------------

function watchItems(external, thresholds) {
  return core.briefing({ products: {}, external, thresholds }).filter((row) => row.level === "alert");
}

async function unsentToday(db, items, { now }) {
  const day = core.zoneParts(new Date(now)).day;
  const ref = db.collection("jarvis_watch").doc(day);
  const snap = await ref.get().catch(() => null);
  const sent = (snap && snap.exists && snap.data().sent) || {};
  const fresh = items.filter((row) => !sent[row.key]);
  return { day, ref, sent, fresh };
}

module.exports = { PAGES, TTL, ADMIN_URL, rangeDays, askSnapshot, githubAsk, ownerTagsAsk, causeLabel, health, jobs, jobName, runJob, github, rerunCi, stalePrs, refreshPr, refreshPrs, refreshNote, failedRuns, rerunRun, mainSha, dispatchMain, briefItems, decideRatings, ga4, cloudflare, speed, uptime, uptimeTally, uptimeLog, uptimeHistory, tlsDaysLeft, brief, ask, speak, speakable, langCode, VOICES, voiceFor, voiceRate, briefingMail, top,
  MAIL_DEFAULTS, MOVED_MAIL, normalizeSettings, readSettings, saveSettings, saveLayout, goalValue, goals, dailyProducts, mailedReports, compact, dailyMail, watchItems, unsentToday, gemini, googleToken };
