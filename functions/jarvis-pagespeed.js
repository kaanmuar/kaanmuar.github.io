"use strict";
/* Jarvis and the daily PageSpeed routine (#1978).

   source     Page health: every page's last scores (data/pagespeed/latest.json on main), the routine's runs (runs.json),
              and its PRs with where each stands
   openPr     op pagespeed-pr, called by .github/workflows/pagespeed-daily.yml without a sign-in: it only opens a PR for a
              pagespeed/<kind>-<day> branch the run recorded, so the caller can name nothing else. An older open PR of the
              same kind is closed as superseded.
   tick       hourly, inside jarvisWatch. It opens a PR the workflow could not ask for, then: a safe branch that scored up waits for CI; once CI passes, Jarvis pushes
              "Merging PageSpeed fixes in 2 h" (08:00-20:00 Bogotá) with Cancel and Do it now, and merges when the time comes. Gemini's branches,
              branches that did not score up, red CI and cancelled countdowns wait in Proposals with Merge and Close.
   merge      starts .github/workflows/pagespeed-merge.yml: the app token may not write contents, so the workflow squashes
              the branch onto main with the deploy key and calls op pagespeed-merged, which pushes the result.

   jarvis_countdowns/pagespeed-<pr> = { pr, kind, state: countdown | proposal | merging | merged | failed | cancelled | closed,
   dueAt, reason, url, title, sha, at }. */

const REPO = "kaanmuar/kaanmuar.github.io";
const API = "https://api.github.com/repos/" + REPO;
const RAW = "https://raw.githubusercontent.com/" + REPO + "/main/data/pagespeed/";
const BRANCH = /^pagespeed\/(safe|ai)-(\d{4}-\d{2}-\d{2})$/;
const MERGE_WORKFLOW = "pagespeed-merge.yml";
const DAILY_WORKFLOW = "pagespeed-daily.yml";
const REQUIRED = ["Lint Code", "url-review-unit", "playwright"];
const RED = new Set(["failure", "timed_out", "cancelled", "action_required", "startup_failure", "stale"]);
const HOUR = 3600 * 1000;
// The watch runs hourly, so a countdown that ends 10 minutes short of 2 h merges on the second tick after it starts.
const COUNTDOWN_MS = 2 * HOUR - 10 * 60 * 1000;
const CI_WAIT_MS = 24 * HOUR;
const STALE_MS = 36 * HOUR;
const COLLECTION = "jarvis_countdowns";

const text = (v, n) => String(v === null || v === undefined ? "" : v).replace(/\s+/g, " ").trim().slice(0, n);
const docId = (pr) => "pagespeed-" + Number(pr);
const kindOf = (branch) => (BRANCH.exec(String(branch || "")) || [])[1] || null;
const KIND_NAME = { safe: "safe fixes", ai: "Gemini's fixes" };

function client(fetchImpl, token) {
  const call = async (method, path, body) => {
    const res = await fetchImpl(API + path, {
      method,
      headers: { Authorization: "Bearer " + token, Accept: "application/vnd.github+json", "Content-Type": "application/json", "User-Agent": "jarvis-pagespeed", "X-GitHub-Api-Version": "2022-11-28" },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(20000)
    });
    if (res.status === 204) return {};
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const error = new Error("GitHub " + path.split("?")[0] + " answered " + res.status + ": " + text(data.message, 160));
      error.status = res.status;
      throw error;
    }
    return data;
  };
  return { get: (p) => call("GET", p), post: (p, b) => call("POST", p, b), patch: (p, b) => call("PATCH", p, b) };
}

async function readData(fetchImpl) {
  const get = async (name) => {
    const res = await fetchImpl(RAW + name + "?t=" + Date.now(), { signal: AbortSignal.timeout(15000), headers: { "Cache-Control": "no-cache" } });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error("data/pagespeed/" + name + " answered " + res.status + ".");
    return res.json();
  };
  const [latest, runs] = await Promise.all([get("latest.json"), get("runs.json")]);
  return { latest, runs: (runs && runs.runs) || [] };
}

/** The run row and its section for a branch, newest first. */
function runFor(runs, branch) {
  const kind = kindOf(branch);
  const row = kind ? (runs || []).find((r) => r[kind] && r[kind].branch === branch) : null;
  return row ? { row, kind, section: row[kind] } : null;
}

const mayMerge = (found) => !!(found && found.kind === "safe" && found.section.verdict && found.section.verdict.up);

function prTitle(found) {
  const pages = new Set((found.section.fixes || []).map((f) => f.page)).size;
  return "PageSpeed: " + KIND_NAME[found.kind] + " on " + pages + " page" + (pages === 1 ? "" : "s") + " (" + BRANCH.exec(found.section.branch)[2] + ")";
}

function prBody(found) {
  const s = found.section;
  const v = s.verdict || {};
  const rows = (s.pages || []).map((p) => "| " + p.file + " | " + ["mobile", "desktop"].map((m) => (p[m] ? p[m].before + " → " + p[m].after : "—")).join(" | ") + " |");
  const fixes = (s.fixes || []).slice(0, 40).map((f) => "- `" + f.page + "` " + f.kind + ": " + f.detail);
  return [
    "Opened by Jarvis's daily PageSpeed routine (#1978)" + (found.row.run ? ", [run](" + found.row.run.url + ")" : "") + ".",
    "",
    mayMerge(found) ? "**Merges itself on a 2-hour countdown once CI passes.** Jarvis pushes first, with Cancel and Do it now."
      : "**Waits for you in Jarvis > Proposals** (" + (found.kind === "ai" ? "Gemini's edits always do" : text(v.reason, 200) || "it did not score up") + "). Merge or Close it there.",
    "",
    "**Local Lighthouse, median of the runs, main → this branch:** " + text(v.reason, 300),
    "",
    rows.length ? "| Page | Mobile | Desktop |\n|---|---|---|\n" + rows.join("\n") : "No page was scored.",
    "",
    "**Fixes**",
    fixes.length ? fixes.join("\n") : "- none",
    s.note ? "\n" + s.note : "",
    (s.fixes || []).length > 40 ? "\n…and " + (s.fixes.length - 40) + " more." : ""
  ].join("\n").slice(0, 60000);
}

async function openPr({ fetchImpl, token, branch }) {
  const b = String(branch || "");
  if (!BRANCH.test(b)) throw new Error("That is not a PageSpeed branch.");
  if (!token) throw new Error("No GitHub token is set, so Jarvis cannot open the PR.");
  const gh = client(fetchImpl, token);
  const found = runFor((await readData(fetchImpl)).runs, b);
  if (!found) throw new Error("No PageSpeed run recorded " + b + ".");
  await gh.get("/branches/" + encodeURIComponent(b));
  const open = await gh.get("/pulls?state=open&per_page=50");
  const same = open.find((p) => p.head && p.head.ref === b);
  if (same) return { pr: same.number, url: same.html_url, already: true };
  const pr = await gh.post("/pulls", { title: prTitle(found), head: b, base: "main", body: prBody(found) });
  await gh.post("/issues/" + pr.number + "/labels", { labels: ["pagespeed", mayMerge(found) ? "auto-merge" : "proposal"] }).catch(() => null);
  const older = open.filter((p) => p.head && kindOf(p.head.ref) === found.kind && p.head.ref !== b);
  for (const p of older) {
    await gh.post("/issues/" + p.number + "/comments", { body: "Superseded by #" + pr.number + " from today's PageSpeed run." }).catch(() => null);
    await gh.patch("/pulls/" + p.number, { state: "closed" }).catch(() => null);
  }
  return { pr: pr.number, url: pr.html_url, kind: found.kind, autoMerge: mayMerge(found), superseded: older.map((p) => p.number) };
}

/** CI on a commit: green when the required checks passed and nothing failed; red when anything failed. */
function ciState(checkRuns) {
  const list = (checkRuns || []).filter((c) => c && c.name);
  const failed = list.filter((c) => c.status === "completed" && RED.has(c.conclusion)).map((c) => c.name);
  if (failed.length) return { state: "red", failed: Array.from(new Set(failed)) };
  const pending = list.some((c) => c.status !== "completed") || REQUIRED.some((n) => !list.some((c) => c.name === n && c.conclusion === "success"));
  return { state: pending ? "pending" : "green", failed: [] };
}

// --- pushes ----------------------------------------------------------------------------------------------------

function clock(ms) {
  return new Date(ms).toLocaleTimeString("en-GB", { timeZone: "America/Bogota", hour: "2-digit", minute: "2-digit" });
}

// A countdown starts only while Carlos is awake to cancel it: 08:00-20:00 Bogotá.
function daytime(ms) {
  const hour = Number(new Date(ms).toLocaleString("en-GB", { timeZone: "America/Bogota", hour: "2-digit", hour12: false }));
  return hour >= 8 && hour < 20;
}

function countdownMessage(doc) {
  return {
    kind: "alerts", tab: "systems", tag: "jarvis-pagespeed-" + doc.pr,
    title: "Merging PageSpeed fixes in 2 h",
    body: text("#" + doc.pr + " goes to production at " + clock(Date.parse(doc.dueAt)) + " Bogotá. " + doc.reason, 220),
    lines: [text(doc.title, 120)], url: doc.url,
    ref: "countdown:" + docId(doc.pr),
    actions: [{ act: "cancel", label: "Cancel" }, { act: "now", label: "Do it now" }]
  };
}

function proposalMessage(doc) {
  return {
    kind: "alerts", tab: "overview", tag: "jarvis-pagespeed-" + doc.pr,
    title: "PageSpeed fixes wait for you: #" + doc.pr,
    body: text(doc.reason, 220), lines: [text(doc.title, 120)], url: doc.url,
    ref: "pagespeed:" + doc.pr,
    actions: [{ act: "merge", label: "Merge" }, { act: "close", label: "Close" }]
  };
}

function startMessage(doc) {
  return { kind: "alerts", tab: "systems", tag: "jarvis-pagespeed-" + doc.pr, title: "Merging PageSpeed fixes #" + doc.pr + " now", body: text(doc.title, 200), url: doc.url };
}

function resultMessage(doc, ok, detail) {
  return {
    kind: "alerts", tab: "systems", tag: "jarvis-pagespeed-" + doc.pr,
    title: ok ? "Merged PageSpeed fixes #" + doc.pr : "Could not merge PageSpeed fixes #" + doc.pr,
    body: text(ok ? (doc.reason || doc.title) : detail + " It waits in Proposals.", 220), url: doc.url
  };
}

// --- the hourly tick -------------------------------------------------------------------------------------------

/* deps = { fetchImpl, token, db, now, push(msg), log(entry) }. Returns a one-line summary for the watch's note. */
async function tick(deps) {
  const { fetchImpl, token, db, now } = deps;
  if (!token) return "pagespeed: no GitHub token";
  const gh = client(fetchImpl, token);
  const [all, data] = await Promise.all([gh.get("/pulls?state=all&per_page=50"), readData(fetchImpl)]);
  const notes = [];
  const last = data.runs[0];
  if (last && now - Date.parse(last.at) < STALE_MS) {
    for (const kind of ["safe", "ai"]) {
      const b = last[kind] && last[kind].branch;
      if (!b || all.some((p) => p.head && p.head.ref === b)) continue;
      const out = await openPr({ fetchImpl, token, branch: b }).catch((error) => ({ error: error.message }));
      notes.push(out.error ? b + ": " + out.error : "opened #" + out.pr);
      if (out.pr && !out.already) all.unshift(await gh.get("/pulls/" + out.pr));
      (out.superseded || []).forEach((n) => { const p = all.find((x) => x.number === n); if (p) p.state = "closed"; });
    }
  }
  const prs = all.filter((p) => p.state === "open" && p.head && BRANCH.test(p.head.ref));
  for (const pr of prs) {
    const ref = db.collection(COLLECTION).doc(docId(pr.number));
    const doc = (await ref.get()).data() || null;
    const stuck = doc && doc.state === "merging" && now - Date.parse(doc.at) > 2 * HOUR;
    if (doc && doc.state !== "countdown" && !stuck) continue;
    const found = runFor(data.runs, pr.head.ref);
    const base = { pr: pr.number, kind: kindOf(pr.head.ref), url: pr.html_url, title: text(pr.title, 160), sha: pr.head.sha };
    const toProposal = async (reason) => {
      const row = Object.assign(base, { state: "proposal", reason: text(reason, 300), at: new Date(now).toISOString() });
      await ref.set(row);
      await gh.post("/issues/" + pr.number + "/labels", { labels: ["proposal"] }).catch(() => null);
      await deps.push(proposalMessage(row));
      notes.push("#" + pr.number + " to proposals");
    };
    if (stuck) { await toProposal("The merge workflow did not report back."); continue; }
    if (!mayMerge(found)) {
      await toProposal(found ? (found.kind === "ai" ? "Gemini's edits always wait for you. " : "") + text(found.section.verdict && found.section.verdict.reason, 200) : "No run recorded this branch.");
      continue;
    }
    const ci = ciState((await gh.get("/commits/" + pr.head.sha + "/check-runs?per_page=100")).check_runs);
    if (ci.state === "red") { await toProposal("CI failed: " + ci.failed.join(", ") + "."); continue; }
    if (ci.state === "pending") {
      if (now - Date.parse(pr.created_at) > CI_WAIT_MS) await toProposal("CI has not passed in 24 hours.");
      else notes.push("#" + pr.number + " waits for CI");
      continue;
    }
    if (!doc && !daytime(now)) { notes.push("#" + pr.number + " waits for 08:00 Bogotá"); continue; }
    if (!doc) {
      const row = Object.assign(base, { state: "countdown", reason: text(found.section.verdict.reason, 300), dueAt: new Date(now + COUNTDOWN_MS).toISOString(), at: new Date(now).toISOString() });
      await ref.set(row);
      await deps.push(countdownMessage(row));
      notes.push("#" + pr.number + " countdown started");
      continue;
    }
    if (doc.sha !== pr.head.sha) {
      await toProposal("The branch changed during the countdown.");
      continue;
    }
    if (now >= Date.parse(doc.dueAt)) {
      const out = await merge(Object.assign({}, deps, { pr: pr.number, by: "jarvis" }));
      notes.push("#" + pr.number + " " + out.message);
    }
  }
  return "pagespeed: " + prs.length + " open PR" + (prs.length === 1 ? "" : "s") + (notes.length ? ", " + notes.join(", ") : "");
}

// --- merge, close, and the buttons -----------------------------------------------------------------------------

/* Starts the merge workflow for a PageSpeed PR. by "jarvis" (the countdown ran out) or the owner (a click). */
async function merge(deps) {
  const { fetchImpl, token, db, now, pr, by } = deps;
  if (!token) throw new Error("No GitHub token is set, so Jarvis cannot start the merge.");
  const gh = client(fetchImpl, token);
  const p = await gh.get("/pulls/" + Number(pr));
  if (p.state !== "open" || !BRANCH.test((p.head || {}).ref)) throw new Error("#" + pr + " is not an open PageSpeed PR.");
  const ref = db.collection(COLLECTION).doc(docId(pr));
  const was = (await ref.get()).data() || {};
  if (was.state === "merging" && now - Date.parse(was.at) < HOUR) return { message: "Already merging." };
  const row = Object.assign({}, was, { pr: p.number, kind: kindOf(p.head.ref), url: p.html_url, title: text(p.title, 160), sha: p.head.sha, state: "merging", by: text(by, 120), at: new Date(now).toISOString() });
  await ref.set(row);
  await deps.push(startMessage(row));
  await gh.post("/actions/workflows/" + MERGE_WORKFLOW + "/dispatches", { ref: "main", inputs: { pr: String(p.number), by: text(by, 60) || "jarvis" } });
  return { message: "Merging #" + p.number + "; Jarvis pushes the result." };
}

async function close(deps) {
  const { fetchImpl, token, db, now, pr, by } = deps;
  const gh = client(fetchImpl, token);
  const p = await gh.get("/pulls/" + Number(pr));
  if (!BRANCH.test((p.head || {}).ref)) throw new Error("#" + pr + " is not a PageSpeed PR.");
  if (p.state === "open") {
    await gh.post("/issues/" + p.number + "/comments", { body: "Closed from Jarvis by " + text(by, 80) + "." }).catch(() => null);
    await gh.patch("/pulls/" + p.number, { state: "closed" });
  }
  await db.collection(COLLECTION).doc(docId(pr)).set({ pr: p.number, kind: kindOf(p.head.ref), url: p.html_url, title: text(p.title, 160), state: "closed", by: text(by, 120), at: new Date(now).toISOString() }, { merge: true });
  await deps.log({ action: "pagespeed-close", mode: "click", status: "done", target: "#" + p.number, detail: "Closed." });
  return { message: "Closed #" + p.number + "." };
}

/* Starts the daily run now, from a briefing line when the last one failed or is late. */
async function run(deps) {
  if (!deps.token) throw new Error("No GitHub token is set, so Jarvis cannot start the run.");
  await client(deps.fetchImpl, deps.token).post("/actions/workflows/" + DAILY_WORKFLOW + "/dispatches", { ref: "main" });
  return { message: "Started the daily PageSpeed run; it takes about two hours." };
}

/* A countdown button: Cancel sends the PR to Proposals, Do it now merges at once. */
async function countdownAct(deps, id, act) {
  const pr = Number(String(id).replace(/^pagespeed-/, ""));
  if (!pr) throw new Error("That button no longer works.");
  const ref = deps.db.collection(COLLECTION).doc(docId(pr));
  const doc = (await ref.get()).data();
  if (!doc || doc.state !== "countdown") throw new Error(doc ? "#" + pr + " is no longer counting down (" + doc.state + ")." : "That countdown is gone.");
  if (act === "now") return merge(Object.assign({}, deps, { pr }));
  await ref.set(Object.assign({}, doc, { state: "cancelled", reason: "You cancelled the countdown.", by: text(deps.by, 120), at: new Date(deps.now).toISOString() }));
  if (deps.token) await client(deps.fetchImpl, deps.token).post("/issues/" + pr + "/labels", { labels: ["proposal"] }).catch(() => null);
  await deps.log({ action: "pagespeed-merge", mode: "click", status: "skipped", target: "#" + pr, detail: "Countdown cancelled." });
  return { message: "Cancelled. #" + pr + " waits in Proposals." };
}

/* op pagespeed-merged: the merge workflow's last step, while its run is still going. Everything is read from GitHub,
   so the caller proves nothing: merged means the PR is closed and main has its squash commit "(#pr)"; failed means a
   step of that run failed. */
async function merged(deps, { pr, run }) {
  const { fetchImpl, token, db, now } = deps;
  if (!token) throw new Error("No GitHub token is set.");
  const n = Number(pr);
  const gh = client(fetchImpl, token);
  const r = await gh.get("/actions/runs/" + Number(run));
  if (!String(r.path || "").endsWith("/" + MERGE_WORKFLOW) || !new RegExp("#" + n + "$").test(r.display_title || "")) throw new Error("That is not a PageSpeed merge run.");
  const [p, commits, jobs] = await Promise.all([gh.get("/pulls/" + n), gh.get("/commits?sha=main&per_page=30"), gh.get("/actions/runs/" + r.id + "/jobs")]);
  const commit = commits.find((c) => new RegExp("\\(#" + n + "\\)$", "m").test(((c.commit || {}).message || "").split("\n")[0]));
  const failedStep = (jobs.jobs || []).flatMap((j) => j.steps || []).find((s) => s.conclusion === "failure");
  const ok = p.state === "closed" && !!commit;
  if (!ok && !failedStep) throw new Error("The merge run has not finished.");
  const reason = ok ? "" : "The merge run failed at \"" + failedStep.name + "\".";
  const ref = db.collection(COLLECTION).doc(docId(n));
  const doc = await db.runTransaction(async (tx) => {
    const d = (await tx.get(ref)).data() || { pr: n, url: p.html_url, title: text(p.title, 160) };
    if (d.state === "merged" || (d.state === "failed" && d.run === r.id)) return null;
    const next = Object.assign({}, d, { state: ok ? "merged" : "failed", run: r.id, commit: ok ? commit.sha : null, reason: ok ? d.reason || "" : reason, at: new Date(now).toISOString() });
    tx.set(ref, next);
    return next;
  });
  if (!doc) return { pushed: false };
  await deps.push(resultMessage(doc, ok, reason));
  await deps.log({ action: "pagespeed-merge", mode: doc.by && doc.by !== "jarvis" ? "click" : "auto", status: ok ? "done" : "failed", target: "#" + n, detail: ok ? "Merged into main as " + commit.sha.slice(0, 7) + "." : reason });
  return { pushed: true, merged: ok };
}

// --- Page health ---------------------------------------------------------------------------------------------

const STAGES = { countdown: "countdown", merging: "merging", merged: "merged", proposal: "proposal", cancelled: "proposal", failed: "proposal", closed: "closed" };

/* The pagespeed source: ctx = { fetch, db, now, github() -> token }. */
async function source(ctx) {
  const now = ctx.now || Date.now();
  const { latest, runs } = await readData(ctx.fetch);
  if (!latest && !runs.length) return { ok: true, empty: true, pages: [], runs: [], prs: [], needs: [], note: "The daily PageSpeed run has not recorded anything yet." };
  const token = ctx.github ? await ctx.github() : "";
  let prs = [];
  const needs = [];
  if (token) {
    const list = await client(ctx.fetch, token).get("/pulls?state=all&per_page=40").catch(() => []);
    prs = list.filter((p) => p.head && BRANCH.test(p.head.ref)).slice(0, 12);
  } else needs.push("A GitHub token for the PageSpeed PRs");
  const docs = await Promise.all(prs.map((p) => ctx.db.collection(COLLECTION).doc(docId(p.number)).get().then((s) => s.data() || null).catch(() => null)));
  const pages = (latest && latest.pages) || [];
  const scored = pages.filter((p) => Number.isFinite((p.mobile || {}).score) || Number.isFinite((p.desktop || {}).score));
  const lowOf = (p) => Math.min(...["mobile", "desktop"].map((m) => (Number.isFinite((p[m] || {}).score) ? p[m].score : 101)));
  const th = (latest && latest.threshold) || 90;
  const last = runs[0] || null;
  const brief = (s) => (s ? { branch: s.branch, fixes: (s.fixes || []).length, pages: (s.pages || []).length, verdict: s.verdict, note: s.note || "", error: s.error || "" } : null);
  return {
    ok: true, at: latest ? latest.at : null, threshold: th,
    stale: !last || now - Date.parse(last.at) > STALE_MS, lastStatus: last ? last.status : null, lastError: last ? last.error : "",
    counts: { pages: pages.length, scored: scored.length, below: scored.filter((p) => lowOf(p) < th).length, under50: scored.filter((p) => lowOf(p) < 50).length },
    avg: last ? last.avg : null,
    pages: pages.map((p) => ({ url: p.url, file: p.file, sitemap: p.sitemap, mobile: p.mobile, desktop: p.desktop, fails: p.fails })),
    cache: (latest && latest.cache) || [],
    runs: runs.slice(0, 14).map((r) => ({ at: r.at, status: r.status, error: r.error, run: r.run, pages: r.pages, scored: r.scored, below: r.below, avg: r.avg, safe: brief(r.safe), ai: brief(r.ai) })),
    prs: prs.map((p, i) => {
      const d = docs[i] || {};
      const state = p.merged_at ? "merged" : p.state === "closed" ? (["merged", "merging"].includes(d.state) ? "merged" : "closed") : STAGES[d.state] || "waiting";
      return { number: p.number, url: p.html_url, title: text(p.title, 160), kind: kindOf(p.head.ref), branch: p.head.ref, open: p.state === "open", stage: state, dueAt: d.state === "countdown" ? d.dueAt : null, reason: text(d.reason, 300), at: p.created_at };
    }),
    needs
  };
}

module.exports = { REPO, BRANCH, daytime, REQUIRED, COUNTDOWN_MS, STALE_MS, COLLECTION, docId, kindOf, client, readData, runFor, mayMerge, prTitle, prBody, openPr, ciState, countdownMessage, proposalMessage, startMessage, resultMessage, tick, merge, close, run, countdownAct, merged, source };
