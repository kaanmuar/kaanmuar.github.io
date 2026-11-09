/* Jarvis > GitHub (#2526): the "github-work" source behind the GitHub tab on the web and in the Android app.

   The main repo runs about 2,500 Actions runs a day across 31 workflows, so live CI numbers read only the last 24 h and
   the charts and ranges read the per-day aggregates that daily() and backfill() keep in jarvis_github_days. The Scrum
   board is read through GraphQL with the carlosandmunoz-hq ("board") token, everything else with the kaanmuar ("repo")
   token. Worktrees, chat usage, Cursor cost and kaanmuar's own rate limit come from the Mac upload
   (jarvis_github_local/latest). Every part is caught on its own; a 403/404 for a permission the app lacks leaves that
   part { ok:false, error, need } and a line in needs[]. */
const core = require("./jarvis-core");

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const TTL = 10 * MINUTE;
const REPO = "kaanmuar/kaanmuar.github.io";
const API = "https://api.github.com/";
const PROJECT = "PVT_kwDOFLbZIM4BokiS";
const COLUMNS = ["Backlog", "Next", "Design", "Dev", "QA", "Stg", "Prod", "Done"];
const WIP = ["Design", "Dev", "QA", "Stg"];
const AGING = ["Dev", "QA", "Stg"];
const EARLY = ["Backlog", "Next", "Dev"];
const DEPLOY_FILES = ["pages.yml", "deploy.yml", "firebase.yml", "firebase-deploy.yml", "release.yml"];
const DEPLOY_NAME = /\b(deploy|firebase|release)\b/i;
const ANDROID = "jarvis-android.yml";
const FAIL = ["failure", "timed_out", "startup_failure"];
const QUIET = ["cancelled", "skipped", "neutral", "stale"];
const CHECK_FAIL = ["failure", "timed_out", "startup_failure", "action_required"];
const PR_STATES = ["clean", "dirty", "behind", "blocked", "unstable"];
const HISTORY_DAYS = 90;
// Cards and issues each drill-down lists (#2807).
const ITEMS = 10;
const LOCAL_STALE = 30 * MINUTE;
const INSTALL = "https://github.com/settings/installations/175836846";
const REPORTER = "Start the Mac GitHub reporter: node scripts/github-local-report.js --install";
const NEED = {
  dependabot_alerts: "Give the qa-lab-agents app Dependabot alerts: read.",
  security_events: "Give the qa-lab-agents app Code scanning alerts: read.",
  secret_scanning_alerts: "Give the qa-lab-agents app Secret scanning alerts: read.",
  deployments: "Give the qa-lab-agents app Deployments: read.",
  organization_projects: "Give the qa-lab-agents app Projects: read on carlosandmunoz-hq."
};
const DORA_RANK = { low: 0, medium: 1, high: 2, elite: 3 };
const DORA_SCORE = { elite: 100, high: 85, medium: 65, low: 40 };

const clean = (error) => String((error && error.message) || error || "failed").slice(0, 200);
const ms = (value) => { const d = core.toDate(value); return d ? d.getTime() : 0; };
const iso = (value) => { const t = ms(value); return t ? new Date(t).toISOString() : ""; };
const isoDay = (t) => new Date(t).toISOString().slice(0, 10);
const stamp = (t) => new Date(t).toISOString().replace(/\.\d{3}Z$/, "Z");
const round = (n, digits = 1) => (Number.isFinite(n) ? Math.round(n * Math.pow(10, digits)) / Math.pow(10, digits) : null);
const pct = (part, whole) => (whole ? round((part / whole) * 100) : null);
const clamp = (n) => Math.max(0, Math.min(100, Math.round(n)));
const sum = (list, pick) => list.reduce((total, row) => total + (Number(pick(row)) || 0), 0);
const labelsOf = (item) => (item.labels || []).map((l) => (typeof l === "string" ? l : l.name)).filter(Boolean);
const byNewest = (a, b) => ms(b.created_at) - ms(a.created_at);
const denied = (error) => !!error && (error.status === 403 || error.status === 404);
const ticketKey = (t) => (/^\d+$/.test(String(t)) ? Number(t) : t === undefined || t === "" ? null : t);

function median(list) {
  const v = list.filter(Number.isFinite).sort((a, b) => a - b);
  if (!v.length) return null;
  const m = Math.floor(v.length / 2);
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
}

function quantile(list, q) {
  const v = list.filter(Number.isFinite).sort((a, b) => a - b);
  return v.length ? v[Math.min(v.length - 1, Math.max(0, Math.ceil(q * v.length) - 1))] : null;
}

function tally(map, key) { const k = String(key || "none").slice(0, 60); map[k] = (map[k] || 0) + 1; return map; }
const listOf = (map) => Object.keys(map).map((label) => ({ label, value: map[label] })).sort((a, b) => b.value - a.value || a.label.localeCompare(b.label));

function dayKeys(now, days) {
  const out = [];
  for (let i = days - 1; i >= 0; i--) out.push(isoDay(now - i * DAY));
  return out;
}

function isoWeek(t) {
  const d = new Date(t);
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const year = d.getUTCFullYear();
  return year + "-W" + String(Math.ceil(((d - Date.UTC(year, 0, 1)) / DAY + 1) / 7)).padStart(2, "0");
}

// The PR body's first #n, else a number that starts a branch segment (feat/2526-x).
function ticketOf(body, branch) {
  const m = /#(\d+)/.exec(body || "") || /(?:^|\/)(\d{2,})(?:-|$)/.exec(branch || "");
  return m ? Number(m[1]) : null;
}

async function mapLimit(list, limit, fn) {
  const out = new Array(list.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(limit, list.length) }, async () => {
    while (next < list.length) { const i = next++; out[i] = await fn(list[i], i); }
  }));
  return out;
}

// --- GitHub client ----------------------------------------------------------------------------------------------

function client(fetchImpl, token) {
  const headers = { Authorization: "Bearer " + token, Accept: "application/vnd.github+json", "User-Agent": "qa-lab-jarvis", "X-GitHub-Api-Version": "2022-11-28" };
  const call = async (path, init) => {
    const res = await fetchImpl(/^https:/.test(path) ? path : API + path, Object.assign({ headers, signal: AbortSignal.timeout(15000) }, init));
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const error = new Error("GitHub " + res.status + ": " + String((data && data.message) || "no answer").slice(0, 200));
      error.status = res.status;
      throw error;
    }
    return data;
  };
  const get = (path) => call(path);
  // Pages of 100 until a short page, `max` pages, or stop(rows) says the rest is out of range.
  const pages = async (path, key, max, stop) => {
    const out = [];
    for (let page = 1; page <= max; page++) {
      const data = await get(path + (path.includes("?") ? "&" : "?") + "page=" + page);
      const rows = (key ? data[key] : data) || [];
      out.push(...rows);
      if (rows.length < 100 || (stop && stop(rows))) break;
    }
    return out;
  };
  const graphql = async (query, variables) => {
    const data = await call("graphql", { method: "POST", headers: Object.assign({ "Content-Type": "application/json" }, headers), body: JSON.stringify({ query, variables: variables || {} }) });
    const errors = data.errors || [];
    if (errors.length && (!data.data || errors.some((e) => e.type === "FORBIDDEN" || e.type === "NOT_FOUND"))) {
      const error = new Error("GitHub GraphQL: " + String(errors[0].message || "error").slice(0, 200));
      if (errors.some((e) => e.type === "FORBIDDEN" || /not accessible/i.test(e.message || ""))) error.status = 403;
      else if (errors.some((e) => e.type === "NOT_FOUND")) error.status = 404;
      throw error;
    }
    return data.data || {};
  };
  return { get, pages, graphql };
}

async function tokenFor(ctx, scope) {
  try { return ctx.github ? (await ctx.github(scope)) || "" : ""; } catch (error) { return ""; }
}

// --- runs ---------------------------------------------------------------------------------------------------------

// The runs API answers at most 1,000 runs per query, so a span is read in 6-hour created= windows.
async function runsBetween(gh, from, to) {
  const windows = [];
  for (let t = from; t < to; t += 6 * HOUR) windows.push([t, Math.min(t + 6 * HOUR, to) - 1000]);
  const lists = await Promise.all(windows.map(([a, b]) => gh.pages("repos/" + REPO + "/actions/runs?per_page=100&created=" + encodeURIComponent(stamp(a) + ".." + stamp(b)), "workflow_runs", 10)));
  const seen = new Map();
  lists.flat().forEach((run) => seen.set(run.id, run));
  return Array.from(seen.values());
}

const done = (run) => run.status === "completed";
const decided = (run) => done(run) && !QUIET.includes(run.conclusion);
const failed = (run) => done(run) && FAIL.includes(run.conclusion);
const green = (run) => done(run) && run.conclusion === "success";
const onMain = (run) => run.head_branch === "main";
const fileOf = (run) => String(run.path || "").split("/").pop();
const isDeploy = (run) => !/pagespeed/i.test((run.name || "") + " " + fileOf(run)) && (DEPLOY_FILES.includes(fileOf(run)) || DEPLOY_NAME.test(run.name || "") || run.name === "Pages");
// Dependabot and CodeQL runs ("dynamic" events) get a new name per update, so workflows group by path, and they
// never make main red: main means its pushes, schedules and dispatches.
const wfKey = (run) => run.path || run.name || "";
const wfName = (run) => (run.event !== "dynamic" ? run.name || "" : /dependabot/i.test(run.path || "") ? "Dependabot updates" : /codeql/i.test(run.path || "") ? "CodeQL" : run.name || "");
const mainCi = (run) => onMain(run) && decided(run) && run.event !== "dynamic";
const conclusionOf = (run) => (done(run) ? run.conclusion || "unknown" : run.status || "queued");
const durS = (run) => (done(run) && run.run_started_at ? Math.max(0, (ms(run.updated_at) - ms(run.run_started_at)) / 1000) : null);
const queueS = (run) => (run.run_started_at ? Math.max(0, (ms(run.run_started_at) - ms(run.created_at)) / 1000) : null);

function latestBy(runs, keyOf) {
  const out = {};
  runs.forEach((r) => { const k = keyOf(r); if (!out[k] || ms(r.created_at) > ms(out[k].created_at)) out[k] = r; });
  return out;
}

// Flaky per workflow and commit: a retried run that ended green, or the same commit both red and green.
function flakyGroups(runs) {
  const groups = new Map();
  runs.filter(done).forEach((run) => {
    const key = run.workflow_id + ":" + run.head_sha;
    const g = groups.get(key) || { name: wfName(run), ok: false, bad: false, retried: false };
    if (green(run)) { g.ok = true; if ((run.run_attempt || 1) > 1) g.retried = true; }
    if (failed(run)) g.bad = true;
    groups.set(key, g);
  });
  return Array.from(groups.values()).map((g) => ({ name: g.name, flaky: g.retried || (g.ok && g.bad) }));
}

// MTTR samples in hours: a workflow's first red run on main to its next green one.
function recoveries(runs) {
  const byWorkflow = {};
  runs.filter(mainCi).sort((a, b) => ms(a.created_at) - ms(b.created_at)).forEach((r) => (byWorkflow[wfKey(r)] = byWorkflow[wfKey(r)] || []).push(r));
  const out = [];
  Object.values(byWorkflow).forEach((list) => {
    let red = null;
    list.forEach((r) => {
      if (failed(r)) red = red || r;
      else if (green(r) && red) { out.push((ms(r.updated_at) - ms(red.updated_at)) / HOUR); red = null; }
    });
  });
  return out;
}

// Main is green when every workflow's newest decided run on main passed; null when nothing ran on main.
function mainGreen(runs) {
  const last = Object.values(latestBy(runs.filter(mainCi), wfKey));
  return last.length ? last.every(green) : null;
}

function runTotals(runs) {
  const settled = runs.filter(decided);
  const main = runs.filter(mainCi);
  const ship = settled.filter((r) => onMain(r) && isDeploy(r));
  const flaky = flakyGroups(runs);
  return {
    runs: runs.length,
    failed: runs.filter(failed).length,
    minutes: Math.round(sum(runs, durS) / 60),
    passRate: pct(settled.filter(green).length, settled.length),
    mainPassRate: pct(main.filter(green).length, main.length),
    mainRuns: main.length,
    mainFailed: main.filter(failed).length,
    mainGreen: mainGreen(runs),
    mttrH: round(median(recoveries(runs)), 2),
    flaky: pct(flaky.filter((f) => f.flaky).length, flaky.length),
    queueMedS: round(median(runs.map(queueS)), 0),
    durMedS: round(median(runs.map(durS)), 0),
    deploys: ship.filter(green).length,
    deploysFailed: ship.filter(failed).length
  };
}

// --- Firestore ----------------------------------------------------------------------------------------------------

async function readDays(db) {
  try {
    const snap = await db.collection("jarvis_github_days").orderBy("day", "desc").limit(HISTORY_DAYS + 2).get();
    return snap.docs.map((d) => d.data()).filter((d) => d && /^\d{4}-\d{2}-\d{2}$/.test(d.day || ""));
  } catch (error) { return []; }
}

async function readDoc(db, name, id) {
  try { const snap = await db.collection(name).doc(id).get(); return snap.exists ? snap.data() : null; } catch (error) { return null; }
}

async function readLatest(db, name, field, n) {
  try { return (await db.collection(name).orderBy(field, "desc").limit(n).get()).docs.map((d) => d.data()); } catch (error) { return []; }
}

const diagOf = (d) => (d ? { cause: d.cause || "", category: d.category || "", fix: d.fix || "", confidence: d.confidence ?? null, action: d.action || "", prompt: d.prompt || "" } : null);

// --- parts --------------------------------------------------------------------------------------------------------

function ciPart(runs, history, diags, now, days, live) {
  const totals = runTotals(runs);
  const flaky = {};
  flakyGroups(runs).forEach((f) => { const w = (flaky[f.name] = flaky[f.name] || { name: f.name, runs: 0, flaky: 0 }); w.runs++; if (f.flaky) w.flaky++; });
  const groups = {};
  runs.forEach((r) => (groups[wfKey(r)] = groups[wfKey(r)] || []).push(r));
  const workflows = Object.keys(groups).map((key) => {
    const list = groups[key].slice().sort(byNewest);
    const settled = list.filter(decided);
    const mainLast = list.find(mainCi);
    return {
      name: wfName(list[0]), path: list[0].path || "", runs: list.length, passRate: pct(settled.filter(green).length, settled.length),
      durMedS: round(median(list.map(durS)), 0), mainRed: !!(mainLast && failed(mainLast)),
      last: { conclusion: conclusionOf(list[0]), at: list[0].updated_at || list[0].created_at, url: list[0].html_url || "" }
    };
  }).sort((a, b) => Number(b.mainRed) - Number(a.mainRed) || (a.passRate ?? 101) - (b.passRate ?? 101) || a.name.localeCompare(b.name));
  const diagByRun = {};
  diags.forEach((d) => { if (d.run !== undefined) diagByRun[String(d.run)] = d; });
  const failing = Object.values(latestBy(runs.filter(decided), (r) => wfKey(r) + "\n" + r.head_branch)).filter(failed).sort(byNewest).slice(0, 30).map((r) => ({
    id: r.id, name: wfName(r), branch: r.head_branch || "", url: r.html_url || "", at: r.updated_at, attempt: r.run_attempt || 1,
    pr: (r.pull_requests && r.pull_requests[0] && r.pull_requests[0].number) || null, sha: String(r.head_sha || "").slice(0, 7),
    event: r.event || "", diag: diagOf(diagByRun[String(r.id)])
  }));
  const today = isoDay(now);
  const todayTotals = runTotals(runs.filter((r) => isoDay(ms(r.created_at)) === today));
  const byDay = {};
  history.forEach((d) => (byDay[d.day] = d));
  byDay[today] = todayTotals;
  const daily = dayKeys(now, days).filter((day) => byDay[day]).map((day) => ({ day, runs: byDay[day].runs || 0, failed: byDay[day].failed || 0, minutes: byDay[day].minutes || 0 }));
  Object.assign(live, { mainGreen: totals.mainGreen, mttr: recoveries(runs), today: todayTotals, day: totals });
  return {
    passRate: totals.passRate, mainPassRate: totals.mainPassRate, runs: totals.runs, failed: totals.failed, minutes: totals.minutes, queueMedS: totals.queueMedS, durMedS: totals.durMedS,
    flaky: { pct: totals.flaky, workflows: Object.values(flaky).filter((w) => w.flaky).map((w) => ({ name: w.name, pct: pct(w.flaky, w.runs), runs: w.runs })).sort((a, b) => b.pct - a.pct || b.runs - a.runs).slice(0, 10) },
    workflows, failing, daily, since: new Date(now - DAY).toISOString()
  };
}

function checkState(checkRuns) {
  const newest = Object.values(checkRuns.reduce((map, c) => { const k = c.name; if (!map[k] || (c.id || 0) > (map[k].id || 0)) map[k] = c; return map; }, {}));
  if (!newest.length) return "pending";
  if (newest.some((c) => CHECK_FAIL.includes(c.conclusion))) return "fail";
  return newest.some((c) => c.status !== "completed") ? "pending" : "pass";
}

const SIZES = [["XS", 10], ["S", 50], ["M", 250], ["L", 1000], ["XL", Infinity]];

async function prsPart(gh, open, closed, now, start, days, live) {
  const detail = {};
  const recent = open.slice().sort((a, b) => ms(b.updated_at) - ms(a.updated_at)).slice(0, 30);
  await mapLimit(recent, 10, async (pr) => {
    const [full, checks] = await Promise.all([
      gh.get("repos/" + REPO + "/pulls/" + pr.number).catch(() => null),
      pr.head && pr.head.sha ? gh.get("repos/" + REPO + "/commits/" + pr.head.sha + "/check-runs?per_page=100").catch(() => null) : null
    ]);
    detail[pr.number] = { full: full || {}, checks: checks ? checkState(checks.check_runs || []) : null };
  });
  const items = open.map((pr) => {
    const x = detail[pr.number] || { full: {}, checks: null };
    const branch = (pr.head && pr.head.ref) || "";
    const mergeState = x.full.mergeable_state === "has_hooks" ? "clean" : x.full.mergeable_state;
    return {
      number: pr.number, title: String(pr.title || "").slice(0, 160), url: pr.html_url || "", author: (pr.user && pr.user.login) || "", bot: !!(pr.user && pr.user.type === "Bot"),
      branch, ageH: round((now - ms(pr.created_at)) / HOUR), updatedH: round((now - ms(pr.updated_at)) / HOUR),
      state: pr.draft ? "draft" : PR_STATES.includes(mergeState) ? mergeState : "unknown", checks: x.checks, ticket: ticketOf(pr.body, branch),
      additions: x.full.additions ?? null, deletions: x.full.deletions ?? null, labels: labelsOf(pr)
    };
  });
  const merged = closed.filter((pr) => pr.merged_at && ms(pr.merged_at) >= start);
  const leads = merged.map((pr) => (ms(pr.merged_at) - ms(pr.created_at)) / HOUR);
  const sizes = {};
  SIZES.forEach(([label]) => (sizes[label] = 0));
  items.filter((i) => i.additions !== null).forEach((i) => { const n = i.additions + (i.deletions || 0); sizes[SIZES.find(([, max]) => n < max)[0]]++; });
  const opened = {};
  const mergedDay = {};
  open.concat(closed).forEach((pr) => { if (ms(pr.created_at) >= start) tally(opened, isoDay(ms(pr.created_at))); });
  merged.forEach((pr) => tally(mergedDay, isoDay(ms(pr.merged_at))));
  Object.assign(live, { leads, mergedToday: mergedDay[isoDay(now)] || 0 });
  return {
    open: items.length, draft: items.filter((i) => i.state === "draft").length,
    mergeReady: items.filter((i) => i.state === "clean" && i.checks === "pass").length,
    conflicts: items.filter((i) => i.state === "dirty").length, behind: items.filter((i) => i.state === "behind").length,
    red: items.filter((i) => i.checks === "fail").length, stale: items.filter((i) => i.updatedH > 72).length,
    orphan: items.filter((i) => !i.ticket && !i.bot).length,
    leadMedH: round(median(leads)), leadP90H: round(quantile(leads, 0.9)), merged: merged.length,
    items: items.sort((a, b) => a.updatedH - b.updatedH), sizes: SIZES.map(([label]) => ({ label, value: sizes[label] })),
    daily: dayKeys(now, days).map((day) => ({ day, opened: opened[day] || 0, merged: mergedDay[day] || 0 }))
  };
}

const BOARD_QUERY = "query($id: ID!, $c: String) { node(id: $id) { ... on ProjectV2 { items(first: 100, after: $c) { pageInfo { hasNextPage endCursor } nodes { updatedAt fieldValueByName(name: \"Status\") { ... on ProjectV2ItemFieldSingleSelectValue { name updatedAt } } content { __typename ... on Issue { number title url state closedAt createdAt labels(first: 5) { nodes { name } } } ... on PullRequest { number title url state mergedAt closedAt createdAt labels(first: 5) { nodes { name } } } } } } } } }";

async function boardItems(gh) {
  const items = [];
  let cursor = null;
  for (let page = 0; page < 30; page++) {
    const data = await gh.graphql(BOARD_QUERY, { id: PROJECT, c: cursor });
    const conn = data.node && data.node.items;
    if (!conn) { const error = new Error("The board token cannot read Project 1."); error.status = 404; throw error; }
    items.push(...(conn.nodes || []));
    if (!conn.pageInfo || !conn.pageInfo.hasNextPage) break;
    cursor = conn.pageInfo.endCursor;
  }
  return items;
}

async function boardPart(gh, ctx, now, start, days) {
  const rows = (await boardItems(gh)).filter((n) => n && n.content && n.content.number).map((n) => {
    const status = n.fieldValueByName || {};
    const c = n.content;
    return { column: status.name || "", since: ms(status.updatedAt || n.updatedAt) || now, type: c.__typename === "PullRequest" ? "pr" : "issue", number: c.number, title: String(c.title || "").slice(0, 160), url: c.url || "", state: c.state || "", closedAt: c.closedAt || "", mergedAt: c.mergedAt || "", createdAt: c.createdAt || "", labels: ((c.labels && c.labels.nodes) || []).map((l) => l && l.name).filter(Boolean) };
  });
  const age = (r) => round((now - r.since) / DAY);
  const brief = (r) => ({ number: r.number, title: r.title, days: age(r), url: r.url, labels: r.labels });
  const names = COLUMNS.concat(Array.from(new Set(rows.map((r) => r.column).filter((c) => c && !COLUMNS.includes(c)))));
  // Oldest first, except Done: its oldest cards are long finished, so it lists the newest.
  const columns = names.map((name) => {
    const list = rows.filter((r) => r.column === name).sort((a, b) => a.since - b.since);
    return { name, count: list.length, ageMedD: round(median(list.map(age))), items: (name === "Done" ? list.slice().reverse() : list).slice(0, ITEMS).map(brief) };
  });
  const finished = (r) => ms(r.closedAt || r.mergedAt) || r.since;
  const doneRows = rows.filter((r) => r.column === "Done");
  const weeks = Math.min(13, Math.max(4, Math.ceil(days / 7)));
  const weekKeys = [];
  for (let i = weeks - 1; i >= 0; i--) weekKeys.push(isoWeek(now - i * 7 * DAY));
  const perWeek = {};
  doneRows.forEach((r) => tally(perWeek, isoWeek(finished(r))));
  const drift = [];
  rows.forEach((r) => {
    const add = (should, why) => drift.push({ number: r.number, title: r.title, column: r.column || "No status", should, why, url: r.url });
    if (!r.column) add("Backlog", "No Status on the board");
    else if (r.type === "issue" && r.state === "CLOSED" && r.column !== "Done") add("Done", "The issue is closed");
    else if (r.type === "pr" && (r.state === "MERGED" || r.state === "CLOSED") && EARLY.includes(r.column)) add("Done", "The PR is " + r.state.toLowerCase());
    else if (r.type === "issue" && r.state === "OPEN" && r.column === "Done") add("Dev", "The issue is open but sits in Done");
  });
  // Approximation (#2526): Projects v2 keeps no move history here, so each item whose Status changed in the range
  // counts as one move into its current column from the column before it in board order.
  const moves = {};
  rows.filter((r) => r.column && r.since >= start).forEach((r) => {
    const i = COLUMNS.indexOf(r.column);
    const key = (i > 0 ? COLUMNS[i - 1] : "New") + "\n" + r.column;
    moves[key] = (moves[key] || 0) + 1;
  });
  return {
    columns, wip: rows.filter((r) => WIP.includes(r.column)).length, wipLimit: Number(ctx.thresholds && ctx.thresholds.githubWip) || 60,
    cycleMedD: round(median(doneRows.filter((r) => finished(r) >= start && ms(r.createdAt)).map((r) => (finished(r) - ms(r.createdAt)) / DAY))),
    throughput: weekKeys.map((week) => ({ week, done: perWeek[week] || 0 })),
    aging: rows.filter((r) => AGING.includes(r.column) && age(r) > 7).sort((a, b) => a.since - b.since).slice(0, 20).map((r) => ({ number: r.number, title: r.title, column: r.column, days: age(r), url: r.url })),
    drift: drift.slice(0, 50),
    flow: Object.keys(moves).map((key) => { const [from, to] = key.split("\n"); return { from, to, count: moves[key] }; })
  };
}

const isBug = (issue) => labelsOf(issue).some((l) => l === "bug" || l === "kind:bug");

async function issuesPart(gh, now, start, days, live) {
  const search = (query, extra) => gh.get("search/issues?q=" + encodeURIComponent("repo:" + REPO + " " + query) + "&per_page=100" + (extra || ""));
  const [list, open, bugs] = await Promise.all([
    gh.pages("repos/" + REPO + "/issues?state=all&since=" + encodeURIComponent(new Date(start).toISOString()) + "&per_page=100", null, 5),
    search("is:issue is:open", "&sort=created&order=asc"),
    search("is:issue is:open label:bug,kind:bug", "&sort=created&order=desc")
  ]);
  const issues = list.filter((i) => !i.pull_request);
  const opened = issues.filter((i) => ms(i.created_at) >= start);
  const closed = issues.filter((i) => i.closed_at && ms(i.closed_at) >= start);
  const brief = (i, at) => ({ number: i.number, title: String(i.title || "").slice(0, 160), days: round((now - ms(at || i.created_at)) / DAY), url: i.html_url || "" });
  const newest = (key) => (a, b) => ms(b[key]) - ms(a[key]);
  const areaOf = (i) => { const area = labelsOf(i).find((l) => l.startsWith("area:")); return area ? area.slice(5) : "none"; };
  const areas = {};
  const areaItems = {};
  (bugs.items || []).forEach((i) => { const area = areaOf(i); tally(areas, area); (areaItems[area] = areaItems[area] || []).push(i); });
  const kinds = {};
  (open.items || []).forEach((i) => { const kind = labelsOf(i).find((l) => l.startsWith("kind:")); tally(kinds, kind ? kind.slice(5) : isBug(i) ? "bug" : "none"); });
  const openedDay = {};
  const closedDay = {};
  opened.forEach((i) => tally(openedDay, isoDay(ms(i.created_at))));
  closed.forEach((i) => tally(closedDay, isoDay(ms(i.closed_at))));
  const all = new Map();
  issues.concat(open.items || []).forEach((i) => all.set(i.number, i));
  const parentIssues = Array.from(all.values()).filter((i) => i.sub_issues_summary && i.sub_issues_summary.total > 0);
  const parents = parentIssues.map((i) => i.sub_issues_summary);
  const today = isoDay(now);
  Object.assign(live, {
    openedBugs: opened.filter(isBug).length, closedBugs: closed.filter(isBug).length,
    closedBugsToday: closed.filter((i) => isBug(i) && isoDay(ms(i.closed_at)) === today).length
  });
  const left = (i) => i.sub_issues_summary.total - i.sub_issues_summary.completed;
  return {
    open: open.total_count || 0, openBugs: bugs.total_count || 0, byKind: listOf(kinds),
    bugsByArea: listOf(areas).map((a) => Object.assign(a, { items: (areaItems[a.label] || []).slice(0, ITEMS).map((i) => brief(i)) })),
    opened: opened.length, closed: closed.length, since: isoDay(start),
    daily: dayKeys(now, days).map((day) => ({ day, opened: openedDay[day] || 0, closed: closedDay[day] || 0 })),
    subIssues: {
      parents: parents.length, done: sum(parents, (s) => s.completed), total: sum(parents, (s) => s.total),
      items: parentIssues.sort((a, b) => left(b) - left(a)).slice(0, ITEMS).map((i) => Object.assign(brief(i), { done: i.sub_issues_summary.completed, total: i.sub_issues_summary.total }))
    },
    lists: {
      open: Array.from(all.values()).filter((i) => !i.closed_at).sort(newest("created_at")).slice(0, ITEMS).map((i) => brief(i)),
      openBugs: (bugs.items || []).slice(0, ITEMS).map((i) => brief(i)),
      opened: opened.slice().sort(newest("created_at")).slice(0, ITEMS).map((i) => brief(i)),
      closed: closed.slice().sort(newest("closed_at")).slice(0, ITEMS).map((i) => brief(i, i.closed_at))
    },
    oldest: (open.items || []).slice(0, ITEMS).map((i) => brief(i))
  };
}

const encodeRef = (name) => String(name).split("/").map(encodeURIComponent).join("/");

async function branchesPart(gh, open, closed, local, now) {
  const list = await gh.pages("repos/" + REPO + "/branches?per_page=100", null, 5);
  const names = new Set(list.map((b) => b.name));
  const same = (pr) => !!(pr.head && pr.head.repo && pr.head.repo.full_name === REPO);
  const openBy = {};
  open.forEach((pr) => { if (pr.head && pr.head.ref) openBy[pr.head.ref] = pr.number; });
  const merged = [];
  const seen = new Set();
  closed.filter((pr) => pr.merged_at && same(pr)).sort((a, b) => ms(b.merged_at) - ms(a.merged_at)).forEach((pr) => {
    const ref = pr.head.ref;
    if (ref === "main" || seen.has(ref) || !names.has(ref) || openBy[ref]) return;
    seen.add(ref);
    merged.push({ name: ref, pr: pr.number, days: round((now - ms(pr.merged_at)) / DAY) });
  });
  // The branches API carries no dates, so open PR heads (newest first) come before the rest.
  const heads = open.slice().sort((a, b) => ms(b.updated_at) - ms(a.updated_at)).map((pr) => pr.head && pr.head.ref).filter((ref) => names.has(ref));
  const candidates = Array.from(new Set(heads.concat(list.map((b) => b.name)))).filter((n) => n !== "main" && !seen.has(n)).slice(0, 25);
  const ahead = (await mapLimit(candidates, 8, async (name) => {
    // Page 2 of a compare leaves out the file list; the newest commit date comes from the small commit list.
    const [cmp, commits] = await Promise.all([
      gh.get("repos/" + REPO + "/compare/main..." + encodeRef(name) + "?per_page=1&page=2").catch(() => null),
      gh.get("repos/" + REPO + "/commits?sha=" + encodeURIComponent(name) + "&per_page=1").catch(() => null)
    ]);
    if (!cmp) return null;
    const head = Array.isArray(commits) && commits[0];
    const at = ms(head && head.commit && head.commit.committer && head.commit.committer.date);
    return { name, ahead: cmp.ahead_by || 0, behind: cmp.behind_by || 0, days: at ? round((now - at) / DAY) : null, pr: openBy[name] || null };
  })).filter(Boolean);
  const prOf = (branch) => {
    if (openBy[branch]) return { pr: openBy[branch], prState: "open" };
    const pr = closed.filter((p) => p.head && p.head.ref === branch).sort((a, b) => ms(b.closed_at) - ms(a.closed_at))[0];
    return pr ? { pr: pr.number, prState: pr.merged_at ? "merged" : "closed" } : { pr: null, prState: null };
  };
  const worktrees = ((local && local.worktrees) || []).map((w) => Object.assign({
    path: w.path || "", branch: w.branch || "", ticket: ticketOf("", w.branch), chat: w.chat || "",
    alive: !!w.heartbeat && now - ms(w.heartbeat) < LOCAL_STALE, dirty: w.dirty === null || w.dirty === undefined ? null : !!w.dirty,
    detached: !!w.detached, prunable: !!w.prunable
  }, prOf(w.branch || "")));
  return { total: list.length, stale: ahead.filter((b) => b.days !== null && b.days > 14).length, merged, ahead, worktrees };
}

async function deploysPart(gh, runs, history, now, days, want) {
  const today = isoDay(now);
  const ship = runs.filter((r) => onMain(r) && isDeploy(r) && done(r)).sort(byNewest);
  let last = ship;
  if (!last.length) last = ((await gh.get("repos/" + REPO + "/actions/runs?branch=main&status=completed&per_page=100")).workflow_runs || []).filter(isDeploy).sort(byNewest);
  const byDay = {};
  history.forEach((d) => (byDay[d.day] = { ok: d.deploys || 0, failed: d.deploysFailed || 0 }));
  const todayShip = ship.filter((r) => isoDay(ms(r.created_at)) === today);
  byDay[today] = { ok: todayShip.filter(green).length, failed: todayShip.filter(failed).length };
  let environments = [];
  try {
    const deployments = await gh.get("repos/" + REPO + "/deployments?per_page=30");
    const newest = {};
    (deployments || []).forEach((d) => { if (!newest[d.environment] || ms(d.created_at) > ms(newest[d.environment].created_at)) newest[d.environment] = d; });
    environments = await mapLimit(Object.values(newest).slice(0, 10), 5, async (d) => {
      const statuses = await gh.get("repos/" + REPO + "/deployments/" + d.id + "/statuses?per_page=1").catch(() => []);
      return { name: d.environment, at: d.created_at, state: (statuses[0] && statuses[0].state) || "unknown" };
    });
  } catch (error) { if (denied(error)) want("deployments"); }
  return {
    last: last.slice(0, 10).map((r) => ({ name: r.name, at: r.updated_at, conclusion: conclusionOf(r), url: r.html_url || "", sha: String(r.head_sha || "").slice(0, 7) })),
    daily: dayKeys(now, days).filter((day) => byDay[day]).map((day) => Object.assign({ day }, byDay[day])),
    environments
  };
}

const SECURITY = {
  dependabot: { path: "dependabot/alerts", need: "dependabot_alerts", item: (a) => ({ number: a.number, severity: (a.security_advisory && a.security_advisory.severity) || (a.security_vulnerability && a.security_vulnerability.severity) || "", package: (a.dependency && a.dependency.package && a.dependency.package.name) || "", url: a.html_url || "" }) },
  codeScanning: { path: "code-scanning/alerts", need: "security_events", item: (a) => ({ number: a.number, severity: (a.rule && (a.rule.security_severity_level || a.rule.severity)) || "", rule: (a.rule && (a.rule.description || a.rule.id)) || "", url: a.html_url || "" }) },
  secrets: { path: "secret-scanning/alerts", need: "secret_scanning_alerts", item: (a) => ({ number: a.number, severity: "critical", type: a.secret_type_display_name || a.secret_type || "", url: a.html_url || "" }) }
};

async function securityPart(gh, repoNames, want) {
  const out = {};
  const perRepo = {};
  await Promise.all(Object.keys(SECURITY).map(async (kind) => {
    const spec = SECURITY[kind];
    const read = async (repo) => {
      try { return (await gh.get("repos/" + repo + "/" + spec.path + "?state=open&per_page=100")) || []; }
      catch (error) { if (error.status === 404 && /no analysis/i.test(error.message)) return []; throw error; }
    };
    try {
      if (!gh) throw new Error("No GitHub token is set.");
      const main = await read(REPO);
      const rest = await mapLimit(repoNames.filter((r) => r !== REPO), 5, (repo) => read(repo).catch(() => null));
      const items = [];
      [[REPO, main]].concat(repoNames.filter((r) => r !== REPO).map((r, i) => [r, rest[i]])).forEach(([repo, alerts]) => {
        if (!alerts) return;
        perRepo[repo] = (perRepo[repo] || 0) + alerts.length;
        alerts.forEach((a) => items.push(Object.assign({ repo }, spec.item(a))));
      });
      out[kind] = { ok: true, open: items.length, items: items.slice(0, 50) };
      if (kind === "dependabot") Object.assign(out[kind], { critical: items.filter((i) => i.severity === "critical").length, high: items.filter((i) => i.severity === "high").length });
    } catch (error) {
      out[kind] = { ok: false, error: clean(error) };
      if (denied(error)) { out[kind].need = spec.need; want(spec.need); }
    }
  }));
  return { security: out, perRepo };
}

function resetIso(value) {
  if (value === undefined || value === null || value === "") return "";
  const n = Number(value);
  return Number.isFinite(n) ? new Date(n < 1e12 ? n * 1000 : n).toISOString() : iso(value);
}

const rate = (r) => (r ? { used: Number(r.used) || 0, limit: Number(r.limit) || 0, resetAt: resetIso(r.reset ?? r.resetAt) } : null);

async function budgetPart(gh, local) {
  const app = { core: gh ? await gh.get("rate_limit").then((r) => rate(r.resources && r.resources.core)).catch(() => null) : null };
  const rates = local && local.rate;
  return {
    kaanmuar: rates ? { graphql: rate(rates.graphql), core: rate(rates.core), at: iso(local.at) } : null,
    app,
    hourly: (local && Array.isArray(local.rateHistory) ? local.rateHistory : []).slice(-48).map((h) => ({ hour: h.hour || "", graphql: Number(h.graphql ?? h.used) || 0 }))
  };
}

function agentsPart(local, now, start) {
  if (!local) throw new Error("The Mac GitHub reporter has not uploaded yet.");
  const costs = {};
  ((local.cost && local.cost.tickets) || []).forEach((t) => (costs[String(t.ticket)] = Number(t.costUsd) || 0));
  const tickets = {};
  const daily = {};
  (Array.isArray(local.usage) ? local.usage : []).forEach((row) => {
    const begin = ms(row.start);
    const from = Math.max(begin, start);
    const to = row.end ? ms(row.end) : now;
    if (!begin || to <= from) return;
    const key = String(row.ticket ?? "none");
    const t = (tickets[key] = tickets[key] || { ticket: ticketKey(row.ticket), title: row.title || "", hours: 0, chats: new Set(), costUsd: costs[key] ?? null });
    t.hours += (to - from) / HOUR;
    if (row.chat) t.chats.add(row.chat);
    if (!t.title && row.title) t.title = row.title;
    for (let at = from; at < to;) {
      const end = Math.min(to, Date.parse(isoDay(at) + "T00:00:00Z") + DAY);
      const d = (daily[isoDay(at)] = daily[isoDay(at)] || { hours: 0, tickets: new Set() });
      d.hours += (end - at) / HOUR;
      d.tickets.add(key);
      at = end;
    }
  });
  const cost = local.cost || null;
  return {
    tickets: Object.values(tickets).map((t) => ({ ticket: t.ticket, title: t.title, hours: round(t.hours), chats: t.chats.size, costUsd: t.costUsd })).sort((a, b) => b.hours - a.hours).slice(0, 30),
    open: (Array.isArray(local.usage) ? local.usage : []).filter((r) => !r.end && ms(r.start)).map((r) => ({ ticket: ticketKey(r.ticket), title: r.title || "", since: iso(r.start) })),
    daily: Object.keys(daily).sort().map((day) => ({ day, hours: round(daily[day].hours), tickets: daily[day].tickets.size })),
    cost: cost ? { cycleStart: cost.cycleStart || "", onDemandUsd: Number(cost.onDemandUsd) || 0, limitUsd: Number(cost.limitUsd) || 0 } : null
  };
}

async function androidPart(gh, start) {
  const [runs, releases] = await Promise.all([
    gh.get("repos/" + REPO + "/actions/workflows/" + ANDROID + "/runs?per_page=30"),
    gh.get("repos/" + REPO + "/releases?per_page=20").catch(() => [])
  ]);
  const list = runs.workflow_runs || [];
  const inRange = list.filter((r) => ms(r.created_at) >= start);
  const last = list.filter(done).sort(byNewest)[0];
  return {
    releases: (releases || []).map((r) => ({ tag: r.tag_name || "", at: r.published_at || r.created_at || "", url: r.html_url || "" })),
    last: last ? { conclusion: conclusionOf(last), at: last.updated_at, url: last.html_url || "" } : null,
    builds: inRange.length, failed: inRange.filter(failed).length
  };
}

// Only the repos jarvis_settings/main github.repos names (core.GITHUB_REPOS when unset), in that order (#2807).
async function reposPart(gh, installed, openMain, missing, shown) {
  const byName = new Map((installed.repositories || []).map((r) => [r.full_name, r]));
  shown.filter((name) => !byName.has(name)).forEach((repo) => missing.push({ repo, why: "In the GitHub repo settings, but the qa-lab-agents app cannot see it." }));
  return mapLimit(shown.filter((name) => byName.has(name)).map((name) => byName.get(name)), 5, async (r) => {
    const branch = r.default_branch || "main";
    const note = (error) => { if (denied(error)) missing.push({ repo: r.full_name, why: clean(error) }); return null; };
    const [runs, pulls] = await Promise.all([
      gh.get("repos/" + r.full_name + "/actions/runs?branch=" + encodeURIComponent(branch) + "&per_page=1").catch(note),
      r.full_name === REPO && openMain ? openMain : gh.get("repos/" + r.full_name + "/pulls?state=open&per_page=100").catch(() => null)
    ]);
    const run = runs && runs.workflow_runs && runs.workflow_runs[0];
    const openPrs = Array.isArray(pulls) ? pulls.length : null;
    return {
      name: r.full_name, private: !!r.private, pushedAt: r.pushed_at || "", openIssues: Math.max(0, (r.open_issues_count || 0) - (openPrs || 0)), openPrs,
      defaultBranch: branch, ci: run ? { conclusion: conclusionOf(run), at: run.updated_at, url: run.html_url || "" } : null, security: null, language: r.language || ""
    };
  });
}

// --- levels and score ---------------------------------------------------------------------------------------------

function grade(value) {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return null;
  const v = Number(value);
  return v >= 90 ? "A" : v >= 80 ? "B" : v >= 70 ? "C" : v >= 60 ? "D" : "F";
}

// DORA report bands: deployFreq per day, leadTimeH and mttrH in hours, changeFail in percent.
function doraLevel(metric, value) {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return null;
  const v = Number(value);
  if (metric === "deployFreq") return v >= 1 ? "elite" : v >= 1 / 7 ? "high" : v >= 1 / 30 ? "medium" : "low";
  if (metric === "leadTimeH") return v < 24 ? "elite" : v < 168 ? "high" : v < 720 ? "medium" : "low";
  if (metric === "changeFail") return v <= 5 ? "elite" : v <= 15 ? "high" : v <= 30 ? "medium" : "low";
  if (metric === "mttrH") return v < 1 ? "elite" : v < 24 ? "high" : v < 168 ? "medium" : "low";
  return null;
}

function xpLevel(xp) {
  const points = Math.max(0, Math.floor(Number(xp) || 0));
  const level = Math.floor(Math.sqrt(points / 50)) + 1;
  return { xp: points, level, nextAt: 50 * level * level };
}

function doraOf(history, live, now, days) {
  const today = isoDay(now);
  const keys = new Set(dayKeys(now, days));
  const past = history.filter((d) => keys.has(d.day) && d.day !== today);
  // Until day docs exist, the live last 24 h stand for the range.
  const recent = (past.length ? live.today : live.day) || {};
  const ok = sum(past, (d) => d.deploys) + (recent.deploys || 0);
  const bad = sum(past, (d) => d.deploysFailed) + (recent.deploysFailed || 0);
  const covered = past.length ? past.length + (now - Date.parse(today + "T00:00:00Z")) / DAY : 1;
  const perDay = live.day || past.length ? round(ok / covered, 2) : null;
  const leadH = round(median(live.leads || []));
  const fail = pct(bad, ok + bad);
  const mttr = round(median(past.map((d) => d.mttrH).filter(Number.isFinite).concat(live.mttr || [])), 2);
  const out = {
    deployFreq: { perDay, level: doraLevel("deployFreq", perDay) },
    leadTimeH: { median: leadH, level: doraLevel("leadTimeH", leadH) },
    changeFail: { pct: fail, level: doraLevel("changeFail", fail) },
    mttrH: { median: mttr, level: doraLevel("mttrH", mttr) }
  };
  const ranks = Object.values(out).map((m) => DORA_RANK[m.level]).filter((r) => r !== undefined);
  out.level = ranks.length ? Object.keys(DORA_RANK)[Math.round(ranks.reduce((a, b) => a + b, 0) / ranks.length)] : null;
  return out;
}

function streaksOf(history, live, out, now) {
  const byDay = {};
  history.forEach((d) => (byDay[d.day] = d));
  const back = (test, countToday) => {
    let n = countToday ? 1 : 0;
    for (let i = 1; i <= HISTORY_DAYS; i++) { const d = byDay[isoDay(now - i * DAY)]; if (!d || !test(d)) break; n++; }
    return n;
  };
  // A red main ends the green streak now; a day without a merge yet does not end the merge streak until it is over.
  const greenMainDays = live.mainGreen === false ? 0 : back((d) => d.mainGreen === true, live.mainGreen === true);
  const mergeDays = back((d) => (d.merged || 0) > 0, (live.mergedToday || 0) > 0);
  const today = isoDay(now);
  const past = history.filter((d) => d.day !== today);
  const xp = 10 * (sum(past, (d) => d.merged) + (live.mergedToday || 0)) + 5 * (sum(past, (d) => d.closedBugs) + (live.closedBugsToday || 0)) + 3 * (past.filter((d) => d.mainGreen === true).length + (live.mainGreen ? 1 : 0));
  const badges = [];
  if (greenMainDays >= 7) badges.push("Green main week");
  if (mergeDays >= 5) badges.push("Merge streak " + mergeDays);
  if (out.dora && out.dora.deployFreq.level === "elite") badges.push("Elite deploys");
  if (out.board && out.board.ok && !out.board.drift.length) badges.push("Board in sync");
  if ((live.closedBugs || 0) >= 10) badges.push("Bug squasher");
  if (out.branches && out.branches.ok && !out.branches.merged.length) badges.push("Clean branches");
  if (out.prs && out.prs.ok && out.prs.open && !out.prs.red && !out.prs.conflicts) badges.push("All PRs green");
  return Object.assign({ greenMainDays, mergeDays }, xpLevel(xp), { badges });
}

function scoreOf(out, live) {
  const area = (value, why) => (value === null || value === undefined ? null : { value: clamp(value), grade: grade(clamp(value)), why });
  const ok = (name) => out[name] && out[name].ok;
  const areas = {};
  // Each penalty is capped so one bad signal cannot zero an area on its own.
  const cap = (max, n) => Math.min(max, Math.max(0, n));
  const share = (n, of) => (of ? n / of : 0);
  if (ok("ci") && out.ci.passRate !== null) {
    const base = out.ci.mainPassRate ?? out.ci.passRate;
    const flaky = out.ci.flaky.pct || 0;
    const red = out.ci.workflows.filter((w) => w.mainRed).length;
    areas.ci = area(base - cap(15, flaky * 3) - cap(20, red * 4), base + "% pass on main, " + flaky + "% flaky, " + red + (red === 1 ? " workflow" : " workflows") + " red on main");
  }
  if (ok("prs")) {
    const p = out.prs;
    areas.prs = area(100 - cap(30, 60 * share(p.conflicts, p.open)) - cap(25, 50 * share(p.red, p.open)) - cap(15, 30 * share(p.stale, p.open)) - cap(10, 20 * share(p.orphan, p.open)) - cap(10, 20 * share(p.behind, p.open)),
      p.conflicts + " conflicts, " + p.red + " red, " + p.stale + " stale, " + p.orphan + " without a ticket, " + p.behind + " behind of " + p.open + " open");
  }
  if (ok("board")) {
    const b = out.board;
    const items = sum(b.columns, (c) => c.count);
    const driftPct = 100 * share(b.drift.length, items);
    areas.board = area(100 - cap(25, driftPct * 2) - cap(20, 50 * share(b.aging.length, b.wip)) - cap(20, 20 * share(Math.max(0, b.wip - b.wipLimit), b.wipLimit)),
      b.drift.length + " of " + items + " drifted, " + b.aging.length + " aging, WIP " + b.wip + "/" + b.wipLimit);
  }
  if (ok("issues")) {
    const i = out.issues;
    const keepUp = i.opened ? Math.min(1, i.closed / i.opened) : 1;
    areas.issues = area(100 - cap(30, 60 * (1 - keepUp)) - cap(25, 30 * share(i.openBugs, i.open)),
      i.closed + " closed for " + i.opened + " opened in range, " + i.openBugs + " of " + i.open + " open issues are bugs");
  }
  if (ok("branches")) areas.branches = area(100 - 2 * out.branches.merged.length - 3 * out.branches.stale, out.branches.merged.length + " merged but not deleted, " + out.branches.stale + " stale");
  if (out.dora && out.dora.level) areas.deploys = area(DORA_SCORE[out.dora.level], "DORA " + out.dora.level + ": " + out.dora.deployFreq.perDay + " deploys a day, " + (out.dora.changeFail.pct ?? 0) + "% change fail");
  const sec = out.security || {};
  if (Object.values(sec).some((s) => s && s.ok)) {
    const d = sec.dependabot && sec.dependabot.ok ? sec.dependabot : { open: 0, critical: 0, high: 0 };
    const code = sec.codeScanning && sec.codeScanning.ok ? sec.codeScanning.open : 0;
    const secrets = sec.secrets && sec.secrets.ok ? sec.secrets.open : 0;
    const unread = Object.keys(SECURITY).filter((k) => !(sec[k] && sec[k].ok));
    areas.security = area(100 - 40 * d.critical - 20 * d.high - 50 * secrets - 5 * (d.open - d.critical - d.high) - 5 * code,
      d.critical + " critical, " + d.high + " high, " + secrets + " secrets, " + code + " code scanning" + (unread.length ? "; not readable: " + unread.join(", ") : ""));
  }
  const budget = out.budget || {};
  const g = budget.kaanmuar && budget.kaanmuar.graphql;
  const c = budget.app && budget.app.core;
  const left = g && g.limit ? pct(g.limit - g.used, g.limit) : c && c.limit ? pct(c.limit - c.used, c.limit) : null;
  if (left !== null) areas.budget = area(left, left + "% of the " + (g && g.limit ? "kaanmuar GraphQL" : "app REST") + " budget left");
  if (ok("agents") && ok("branches")) {
    const trees = out.branches.worktrees;
    const mergedTrees = trees.filter((w) => w.prState === "merged").length;
    const idle = Math.max(0, trees.length - out.agents.open.length);
    areas.agents = area(100 - 10 * mergedTrees - 5 * idle, out.agents.open.length + " open chats, " + trees.length + " worktrees, " + mergedTrees + " merged");
  }
  const values = Object.values(areas).filter(Boolean).map((a) => a.value);
  const overall = values.length ? Math.round(values.reduce((a, b) => a + b, 0) / values.length) : null;
  ["ci", "prs", "board", "issues", "branches", "deploys", "security", "budget", "agents"].forEach((k) => { if (!areas[k]) areas[k] = null; });
  return { overall: { value: overall, grade: grade(overall) }, areas };
}

// --- source -------------------------------------------------------------------------------------------------------

async function source(ctx) {
  const now = ctx.now || Date.now();
  const days = Math.max(1, Math.min(HISTORY_DAYS, Number(ctx.days) || 7));
  const start = now - days * DAY;
  const shown = core.githubRepos(ctx.settings && ctx.settings.github && ctx.settings.github.repos);
  const out = { ok: true, at: new Date(now).toISOString(), days, needs: [], access: { repos: [], missing: [], wanted: [], shown } };
  const wanted = new Set();
  const want = (permission) => { if (wanted.has(permission)) return; wanted.add(permission); out.needs.push(NEED[permission]); };
  const live = {};
  const part = async (name, run, permission) => {
    try { out[name] = Object.assign({ ok: true }, await run()); } catch (error) {
      out[name] = { ok: false, error: clean(error) };
      if (permission && denied(error)) { out[name].need = permission; want(permission); }
    }
  };
  const [repoToken, boardToken] = await Promise.all([tokenFor(ctx, "repo"), tokenFor(ctx, "board")]);
  const gh = repoToken ? client(ctx.fetch, repoToken) : null;
  const boardGh = boardToken ? client(ctx.fetch, boardToken) : null;
  if (!gh) out.needs.push("GitHub: the qa-lab-agents app gave no token for the kaanmuar repos; check its secrets and installation.");
  if (!boardGh) out.needs.push("GitHub: the qa-lab-agents app gave no token for the carlosandmunoz-hq board; check its org installation.");
  const repo = () => { if (!gh) throw new Error("No GitHub token is set."); return gh; };
  const once = (fn) => { let p = null; return () => (p = p || fn()); };
  const data = {
    runs: once(async () => runsBetween(repo(), now - DAY, now)),
    open: once(async () => repo().pages("repos/" + REPO + "/pulls?state=open&per_page=100", null, 3)),
    closed: once(async () => repo().pages("repos/" + REPO + "/pulls?state=closed&sort=updated&direction=desc&per_page=100", null, 3, (rows) => ms(rows[rows.length - 1].updated_at) < start)),
    installed: once(async () => repo().get("installation/repositories?per_page=100")),
    days: once(() => readDays(ctx.db)),
    local: once(() => readDoc(ctx.db, "jarvis_github_local", "latest")),
    diag: once(() => readLatest(ctx.db, "jarvis_github_diag", "at", 20)),
    weekly: once(() => readLatest(ctx.db, "jarvis_github_weekly", "week", 1))
  };
  const repoNames = once(async () => {
    try { return Array.from(new Set([REPO].concat(((await data.installed()).repositories || []).map((r) => r.full_name)))).slice(0, 30); } catch (error) { return [REPO]; }
  });
  let perRepoSecurity = {};
  await Promise.all([
    part("ci", async () => ciPart(await data.runs(), await data.days(), await data.diag(), now, days, live)),
    part("prs", async () => prsPart(repo(), await data.open(), await data.closed(), now, start, days, live)),
    part("board", async () => { if (!boardGh) throw new Error("No GitHub token is set."); return boardPart(boardGh, ctx, now, start, days); }, "organization_projects"),
    part("issues", async () => issuesPart(repo(), now, start, days, live)),
    part("branches", async () => branchesPart(repo(), await data.open(), await data.closed(), await data.local(), now)),
    part("deploys", async () => deploysPart(repo(), await data.runs(), await data.days(), now, days, want)),
    part("android", async () => androidPart(repo(), start)),
    part("budget", async () => budgetPart(gh, await data.local())),
    part("agents", async () => agentsPart(await data.local(), now, start)),
    (async () => { const s = await securityPart(gh, await repoNames(), want); out.security = s.security; perRepoSecurity = s.perRepo; })(),
    (async () => {
      try {
        const installed = await data.installed();
        out.repos = await reposPart(gh, installed, await data.open().catch(() => null), out.access.missing, shown);
        out.access.repos = (installed.repositories || []).map((r) => r.full_name);
        const total = installed.total_count ?? out.access.repos.length;
        if (total < 3) out.needs.push("The qa-lab-agents app only sees " + total + " repos; set the kaanmuar installation to All repositories at " + INSTALL + ".");
      } catch (error) { out.repos = []; }
    })(),
    (async () => {
      const [diags, weekly] = await Promise.all([data.diag(), data.weekly()]);
      const w = weekly[0];
      out.ai = {
        diagnoses: diags.map((d) => Object.assign({ run: d.run ?? null, workflow: d.workflow || "" }, diagOf(d), { at: iso(d.at) })),
        retro: w ? { week: w.week || "", text: w.text || "", at: iso(w.at) } : null
      };
    })()
  ]);
  (out.repos || []).forEach((r) => { if (perRepoSecurity[r.name] !== undefined) r.security = { open: perRepoSecurity[r.name] }; });
  const local = await data.local();
  const localAt = local ? ms(local.at) : 0;
  out.local = localAt ? { at: new Date(localAt).toISOString(), ageMin: Math.round((now - localAt) / MINUTE) } : null;
  if (!localAt || now - localAt > LOCAL_STALE) out.needs.push(REPORTER);
  const history = await data.days();
  const keys = new Set(dayKeys(now, days));
  out.history = history.filter((d) => keys.has(d.day)).sort((a, b) => a.day.localeCompare(b.day)).map((d) => ({
    day: d.day, passRate: d.passRate ?? null, runs: d.runs ?? null, failed: d.failed ?? null, merged: d.merged ?? null, opened: d.opened ?? null,
    closed: d.closed ?? null, openPrs: d.openPrs ?? null, openBugs: d.openBugs ?? null, wip: d.wip ?? null, score: d.score ?? null
  }));
  out.flow = (out.board && out.board.flow) || [];
  if (out.board) delete out.board.flow;
  out.dora = doraOf(history, live, now, days);
  out.streaks = streaksOf(history, live, out, now);
  out.score = scoreOf(out, live);
  out.access.wanted = Array.from(wanted);
  return out;
}

// --- daily aggregates ---------------------------------------------------------------------------------------------

// Search counts for many days in one GraphQL call; the REST search API allows only 30 queries a minute.
async function dayCounts(gh, days) {
  const q = (text) => JSON.stringify("repo:" + REPO + " " + text);
  const fields = { merged: "is:pr is:merged merged:", prsOpened: "is:pr created:", opened: "is:issue created:", closed: "is:issue closed:", closedBugs: "is:issue label:bug,kind:bug closed:" };
  const parts = [];
  days.forEach((day, i) => Object.keys(fields).forEach((f) => parts.push("d" + i + "_" + f + ": search(type: ISSUE, first: 1, query: " + q(fields[f] + day) + ") { issueCount }")));
  const data = await gh.graphql("query { " + parts.join(" ") + " }");
  return days.map((day, i) => {
    const row = {};
    Object.keys(fields).forEach((f) => { const hit = data["d" + i + "_" + f]; if (hit) row[f] = hit.issueCount || 0; });
    return row;
  });
}

function snapshotFields(snap) {
  const row = {};
  if (!snap) return row;
  if (snap.prs && snap.prs.ok) row.openPrs = snap.prs.open;
  if (snap.issues && snap.issues.ok) row.openBugs = snap.issues.openBugs;
  if (snap.board && snap.board.ok) row.wip = snap.board.wip;
  if (snap.score && snap.score.overall && snap.score.overall.value !== null) row.score = snap.score.overall.value;
  return row;
}

async function writeDays(ctx, gh, days, now, snap) {
  const counts = await dayCounts(gh, days).catch(() => days.map(() => ({})));
  const today = isoDay(now);
  for (let i = 0; i < days.length; i++) {
    const from = Date.parse(days[i] + "T00:00:00Z");
    const runs = await runsBetween(gh, from, Math.min(from + DAY, now));
    const row = Object.assign({ day: days[i] }, runTotals(runs), counts[i], days[i] === today ? snapshotFields(snap) : {}, { at: new Date(now).toISOString() });
    await ctx.db.collection("jarvis_github_days").doc(days[i]).set(row, { merge: true });
  }
  return days;
}

async function repoClient(ctx) {
  const token = await tokenFor(ctx, "repo");
  if (!token) throw new Error("No GitHub token is set.");
  return client(ctx.fetch, token);
}

// Today's and yesterday's day docs. ctx.snapshot (a github-work answer) fills openPrs, openBugs, wip and score for
// today; without it the source runs once for a 1-day range.
async function daily(ctx) {
  const now = ctx.now || Date.now();
  const gh = await repoClient(ctx);
  const snap = ctx.snapshot || await source(Object.assign({}, ctx, { now, days: 1, settings: ctx.settings || {}, thresholds: ctx.thresholds || {} })).catch(() => null);
  const days = await writeDays(ctx, gh, [isoDay(now - DAY), isoDay(now)], now, snap);
  return { ok: true, days };
}

// Up to `limit` missing day docs of the last 90 days, newest first.
async function backfill(ctx) {
  const now = ctx.now || Date.now();
  const limit = Math.max(0, Number(ctx.limit ?? 10) || 0);
  const have = new Set((await readDays(ctx.db)).map((d) => d.day));
  const missing = [];
  for (let i = 1; i <= HISTORY_DAYS && missing.length < limit; i++) { const day = isoDay(now - i * DAY); if (!have.has(day)) missing.push(day); }
  if (!missing.length) return { ok: true, days: [], left: 0 };
  const gh = await repoClient(ctx);
  const days = await writeDays(ctx, gh, missing, now, null);
  let left = 0;
  for (let i = 1; i <= HISTORY_DAYS; i++) { const day = isoDay(now - i * DAY); if (!have.has(day) && !days.includes(day)) left++; }
  return { ok: true, days, left };
}

module.exports = { source, daily, backfill, grade, doraLevel, xpLevel, REPO, TTL, runTotals, ticketOf, checkState };
