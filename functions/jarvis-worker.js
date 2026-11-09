"use strict";
/* Jarvis's own coding worker (#2956, #2957): code changes without Cursor. Jarvis dispatches .github/workflows/jarvis-worker.yml
   with a task; the run checks out the repo, edits with Gemini CLI, runs the unit tests, pushes a jarvis/<id>-<slug> branch with
   the deploy key and reports back. Jarvis opens the PR with its app token, so CI runs on it like on any other PR.

   dispatch    validates a task, checks the month's AI budget, stores jarvis_worker/<id> and dispatches the workflow
   report      the run's report (op worker-report): proven by the run's GitHub OIDC token, not a shared secret; adds its
               tokens to jarvis_worker_spend/<YYYY-MM> and opens the PR, or comments on the PR it worked on
   verifyOidc  checks a GitHub Actions OIDC token: signature (GitHub's JWKS), issuer, audience, expiry, and that it comes
               from jarvis-worker.yml on main of this repo
   spend       the month's spend against the cap;  candidates  what the hourly pass may hand the worker on its own

   Prices are list prices per million tokens, rounded up so the meter overstates rather than understates; thinking
   tokens bill as output and cached input bills in full. */

const crypto = require("crypto");
const jarvisLog = require("./jarvis-log");

const API = "https://api.github.com";
const REPO = "kaanmuar/kaanmuar.github.io";
const WORKFLOW = "jarvis-worker.yml";
const WORKFLOW_REF = REPO + "/.github/workflows/" + WORKFLOW + "@refs/heads/main";
const OIDC_ISSUER = "https://token.actions.githubusercontent.com";
const OIDC_AUDIENCE = "jarvis-worker";
const COLLECTION = "jarvis_worker";
const SPEND = "jarvis_worker_spend";
const CAP_USD = 40;
const WARN_USD = 20;
const TIERS = ["pro", "flash"];
const STATES = ["queued", "running", "done", "nochange", "failed"];
const PRICES = [[/lite/i, { in: 0.1, out: 0.4 }], [/flash/i, { in: 0.5, out: 3 }], [/pro|.*/i, { in: 2.5, out: 15 }]];
const LABEL = "jarvis";
const DIAG_CATEGORIES = ["code", "test", "config"];
const DIAG_DAYS = 2;

const text = (value, max) => String(value === null || value === undefined ? "" : value).replace(/\s+/g, " ").trim().slice(0, max);
const block = (value, max) => String(value === null || value === undefined ? "" : value).slice(0, max);
const int = (value) => { const n = Number(String(value === undefined || value === null ? "" : value).replace(/^#/, "")); return Number.isInteger(n) && n > 0 ? n : 0; };
const monthOf = (now) => new Date(now).toISOString().slice(0, 7);
const round = (usd) => Math.round(usd * 10000) / 10000;
const slug = (value) => text(value, 80).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "task";

function priceOf(model) {
  const m = String(model || "");
  return PRICES.find(([re]) => re.test(m))[1];
}

/** [{ model, input, output }] -> { usd, input, output } at the rounded-up list prices. */
function cost(models) {
  let usd = 0, input = 0, output = 0;
  for (const row of Array.isArray(models) ? models : []) {
    const i = Math.max(0, Number(row && row.input) || 0), o = Math.max(0, Number(row && row.output) || 0);
    const p = priceOf(row && row.model);
    usd += (i * p.in + o * p.out) / 1e6;
    input += i; output += o;
  }
  return { usd: round(usd), input, output };
}

async function gh(ctx, path, { method, body } = {}) {
  const token = await ctx.github("repo");
  if (!token) throw new Error("No GitHub token is set (GITHUB_APP_ID with GITHUB_APP_PRIVATE_KEY), so Jarvis cannot reach GitHub.");
  const res = await ctx.fetch(API + path, {
    method: method || "GET",
    headers: Object.assign({ Authorization: "Bearer " + token, Accept: "application/vnd.github+json", "User-Agent": "qa-lab-jarvis", "X-GitHub-Api-Version": "2022-11-28" },
      body === undefined ? {} : { "Content-Type": "application/json" }),
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  const data = res.status === 204 ? {} : await res.json().catch(() => ({}));
  if (!res.ok) {
    const error = new Error("GitHub " + path.split("?")[0] + " answered " + res.status + ": " + text(data && data.message, 240));
    error.status = res.status;
    throw error;
  }
  return data;
}

async function spend(db, now) {
  const month = monthOf(now);
  const snap = await db.collection(SPEND).doc(month).get();
  const d = snap.exists ? snap.data() : {};
  const usd = round(Number(d.usd) || 0);
  return { month, usd, runs: Number(d.runs) || 0, input: Number(d.input) || 0, output: Number(d.output) || 0, cap: CAP_USD, warn: WARN_USD, over: usd >= CAP_USD, warned: usd >= WARN_USD };
}

/* task: { prompt, title?, tier?, branch?, pr?, issue?, key?, by? } -> { ok, id, message, url }. Throws over the cap. */
async function dispatch(ctx, task) {
  const t = task || {};
  const prompt = block(t.prompt, 20000).trim();
  const issue = int(t.issue);
  if (prompt.length < 20 && !issue) throw new Error("Give the worker a task of at least 20 characters, or an issue.");
  const pr = int(t.pr);
  const branch = text(t.branch, 200) || "main";
  if (!/^[\w./-]+$/.test(branch) || branch.includes("..")) throw new Error("That is not a branch name.");
  const tier = TIERS.includes(t.tier) ? t.tier : "pro";
  const title = text(t.title || t.name, 90) || (issue ? "Fix #" + issue : pr ? "Work on PR #" + pr : text(prompt, 60));
  const now = ctx.now || Date.now();
  const budget = await spend(ctx.db, now);
  if (budget.over) throw new Error("Jarvis's AI budget for " + budget.month + " is used ($" + budget.usd.toFixed(2) + " of $" + CAP_USD + "). Raise the cap or use a Cursor agent.");
  const id = "w" + now.toString(36) + crypto.randomBytes(3).toString("hex");
  const row = { id, state: "queued", title, prompt, tier, branch, pr: pr || null, issue: issue || null, key: text(t.key, 160) || null, by: text(t.by, 80) || "jarvis",
    at: new Date(now).toISOString(), updatedAt: new Date(now).toISOString() };
  await ctx.db.collection(COLLECTION).doc(id).set(row);
  try {
    await gh(ctx, "/repos/" + REPO + "/actions/workflows/" + WORKFLOW + "/dispatches", { method: "POST",
      body: { ref: "main", inputs: { id, title, tier, branch, pr: pr ? String(pr) : "", issue: issue ? String(issue) : "", prompt } } });
  } catch (error) {
    await ctx.db.collection(COLLECTION).doc(id).set({ state: "failed", error: text(error.message, 300), updatedAt: new Date(now).toISOString() }, { merge: true });
    throw new Error(error.status === 403 ? "Give the qa-lab-agents app Actions: write so Jarvis can start its worker." : error.message);
  }
  const url = "https://github.com/" + REPO + "/actions/workflows/" + WORKFLOW;
  await jarvisLog.log(null, { source: "github", level: "info", ref: "worker:" + id, url, text: "Started Jarvis's worker (" + tier + "): " + title + "." });
  return { ok: true, id, url, message: "Jarvis's worker started: " + title + ". It opens a PR when the tests pass." };
}

let jwks = { at: 0, keys: [] };

async function signingKey(fetchImpl, kid, now) {
  const find = () => jwks.keys.find((k) => k.kid === kid);
  if (!find() || now - jwks.at > 3600000) {
    const res = await fetchImpl(OIDC_ISSUER + "/.well-known/jwks", { signal: AbortSignal.timeout(10000) });
    if (!res.ok) throw new Error("GitHub's OIDC keys answered " + res.status + ".");
    jwks = { at: now, keys: ((await res.json()) || {}).keys || [] };
  }
  const jwk = find();
  if (!jwk) throw new Error("The token names a key GitHub does not publish.");
  return crypto.createPublicKey({ key: jwk, format: "jwk" });
}

/** A GitHub Actions OIDC token from jarvis-worker.yml on main -> its claims; throws with status 403 otherwise. */
async function verifyOidc(fetchImpl, token, now) {
  const deny = (why) => Object.assign(new Error(why), { status: 403 });
  const parts = String(token || "").split(".");
  if (parts.length !== 3) throw deny("Send the run's OIDC token.");
  let header, claims;
  try {
    header = JSON.parse(Buffer.from(parts[0], "base64url").toString("utf8"));
    claims = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
  } catch (error) { throw deny("The OIDC token is not readable."); }
  if (header.alg !== "RS256") throw deny("The OIDC token is not RS256.");
  const key = await signingKey(fetchImpl, header.kid, now);
  if (!crypto.verify("RSA-SHA256", Buffer.from(parts[0] + "." + parts[1]), key, Buffer.from(parts[2], "base64url"))) throw deny("The OIDC token's signature does not match.");
  const secs = Math.floor(now / 1000);
  if (claims.iss !== OIDC_ISSUER) throw deny("The OIDC token is not GitHub's.");
  if ((Array.isArray(claims.aud) ? claims.aud : [claims.aud]).indexOf(OIDC_AUDIENCE) < 0) throw deny("The OIDC token is not for Jarvis's worker.");
  if (!(Number(claims.exp) > secs - 60) || Number(claims.nbf || 0) > secs + 60) throw deny("The OIDC token expired.");
  if (claims.repository !== REPO || claims.workflow_ref !== WORKFLOW_REF) throw deny("Only " + WORKFLOW + " on main may report to Jarvis.");
  return claims;
}

function prBody(row, r, c, runUrl) {
  const files = (Array.isArray(r.files) ? r.files : []).slice(0, 40).map((f) => "- `" + text(f, 160) + "`");
  return [
    "Opened by Jarvis's worker (#2957, parent #2956)" + (runUrl ? ", [run](" + runUrl + ")" : "") + ". Task `" + row.id + "`, started by " + row.by + (row.key ? " for `" + row.key + "`" : "") + ".",
    row.issue ? "\nFixes #" + row.issue + "." : "",
    "",
    "**Task**",
    "> " + block(row.prompt, 1500).replace(/\n/g, "\n> "),
    "",
    "**What the worker says it did**",
    block(r.summary, 4000) || "(no summary)",
    "",
    "**Unit tests:** " + (r.tests === "pass" ? "passed in the run" : text(r.tests, 80) || "not run"),
    "**Model and cost:** " + (r.models || []).map((m) => text(m.model, 40)).filter(Boolean).join(", ") + ", about $" + c.usd.toFixed(2) + " (" + c.input + " tokens in, " + c.output + " out)",
    "",
    files.length ? "**Files**\n" + files.join("\n") : ""
  ].join("\n").slice(0, 60000);
}

/* body: { id, state, branch?, summary?, files?, tests?, models? [{ model, input, output }], error? }, token: the run's OIDC
   token -> { ok, state, pr?, url? }. The first report binds the task to its run; a report from another run is refused. */
async function report(ctx, body, token) {
  const now = ctx.now || Date.now();
  const claims = await verifyOidc(ctx.fetch, token, now);
  const b = body || {};
  const id = text(b.id, 40);
  const ref = ctx.db.collection(COLLECTION).doc(id);
  const snap = id ? await ref.get() : null;
  if (!snap || !snap.exists) throw Object.assign(new Error("No worker task " + id + "."), { status: 404 });
  const row = snap.data();
  const run = String(claims.run_id || "");
  if (row.run && row.run !== run) throw Object.assign(new Error("Task " + id + " belongs to another run."), { status: 403 });
  if (["done", "nochange", "failed"].includes(row.state)) return { ok: true, state: row.state, pr: row.prNumber || null, url: row.prUrl || null, already: true };
  const state = STATES.includes(b.state) ? b.state : "failed";
  const runUrl = "https://github.com/" + REPO + "/actions/runs/" + run;
  const c = cost(b.models);
  const patch = { state, run, runUrl, updatedAt: new Date(now).toISOString(), summary: block(b.summary, 4000), tests: text(b.tests, 80), error: text(b.error, 600),
    files: (Array.isArray(b.files) ? b.files : []).slice(0, 100).map((f) => text(f, 200)), usd: round((Number(row.usd) || 0) + c.usd),
    input: (Number(row.input) || 0) + c.input, output: (Number(row.output) || 0) + c.output };
  if (c.usd > 0 || c.input > 0) {
    const month = ctx.db.collection(SPEND).doc(monthOf(now));
    await ctx.db.runTransaction(async (tx) => {
      const m = await tx.get(month);
      const d = m.exists ? m.data() : {};
      tx.set(month, { usd: round((Number(d.usd) || 0) + c.usd), input: (Number(d.input) || 0) + c.input, output: (Number(d.output) || 0) + c.output,
        runs: (Number(d.runs) || 0) + (state === "running" ? 0 : 1), updatedAt: new Date(now).toISOString() }, { merge: true });
    });
  }
  let out = { ok: true, state };
  if (state === "done") {
    const branch = text(b.branch, 200);
    if (row.pr) {
      await gh(ctx, "/repos/" + REPO + "/issues/" + row.pr + "/comments", { method: "POST", body: { body: "Jarvis's worker pushed to this PR ([run](" + runUrl + ")).\n\n" + block(b.summary, 4000) } });
      Object.assign(patch, { prNumber: row.pr, prUrl: "https://github.com/" + REPO + "/pull/" + row.pr });
    } else {
      if (!/^jarvis\/[\w.-]+$/.test(branch)) throw new Error("The worker pushes jarvis/* branches only.");
      const open = await gh(ctx, "/repos/" + REPO + "/pulls?state=open&head=" + REPO.split("/")[0] + ":" + encodeURIComponent(branch));
      const pr = (open || [])[0] || await gh(ctx, "/repos/" + REPO + "/pulls", { method: "POST", body: { title: "Jarvis: " + row.title, head: branch, base: "main", body: prBody(row, b, c, runUrl) } });
      await gh(ctx, "/repos/" + REPO + "/issues/" + pr.number + "/labels", { method: "POST", body: { labels: [LABEL] } }).catch(() => null);
      Object.assign(patch, { branch, prNumber: pr.number, prUrl: pr.html_url });
    }
    out = Object.assign(out, { pr: patch.prNumber, url: patch.prUrl });
  }
  await ref.set(patch, { merge: true });
  if (state !== "running") {
    const said = state === "done" ? "opened " + (patch.prUrl ? "PR #" + patch.prNumber : "its PR") : state === "nochange" ? "found nothing to change" : "failed: " + (patch.error || "no reason given");
    await jarvisLog.log(null, { source: "github", level: state === "failed" ? "warn" : "info", ref: "worker:" + id, url: patch.prUrl || runUrl,
      text: "Jarvis's worker " + said + " (" + row.title + ", $" + patch.usd.toFixed(2) + ")." });
  }
  return out;
}

/* What the hourly pass may hand the worker on its own -> [{ target, task }]: code, test or config diagnoses from the last
   two days at or over the confidence bar, and URL review bugs the Cursor fix agent left waiting (needs-agent). */
async function candidates(db, { now, confidence, github }) {
  const out = [];
  const since = new Date(now - DIAG_DAYS * 864e5).toISOString();
  const diags = await db.collection("jarvis_github_diag").orderBy("at", "desc").limit(30).get().catch(() => ({ docs: [] }));
  for (const doc of diags.docs || []) {
    const d = doc.data();
    if (String(d.at || "") < since || !DIAG_CATEGORIES.includes(d.category) || !(Number(d.confidence) >= confidence) || !text(d.prompt, 20) || (d.repo && d.repo !== REPO)) continue;
    // A chat may still be pushing to another PR's branch; on its own the worker only touches main and its own branches.
    const own = /^jarvis\//.test(String(d.branch || ""));
    if (d.pr ? !own : d.branch && d.branch !== "main") continue;
    out.push({ target: "run " + d.run, why: text(d.workflow, 80) + " failed: " + text(d.cause, 160),
      task: { prompt: d.prompt, title: "Fix " + text(d.workflow, 60) + " (run " + d.run + ")", branch: "main", pr: d.pr || undefined, key: "gh:diag:" + d.run, by: "jarvis (diagnosis)" } });
  }
  for (const bug of ((github || {}).needsAgent || []).slice(0, 10)) {
    out.push({ target: "#" + bug.number, why: "URL review bug left for the fix agent: " + text(bug.title, 160),
      task: { issue: bug.number, title: "Fix #" + bug.number + " " + text(bug.title, 60), key: "issue:" + bug.number, by: "jarvis (needs-agent)",
        prompt: "Fix GitHub issue #" + bug.number + " (" + text(bug.title, 200) + "), a failure the daily check of URL reviews filed. Find the root cause, fix it, add a test that fails without the fix, and add a row to FIXES in functions/url-review-failures.js naming the cause." } });
  }
  return out;
}

module.exports = { REPO, WORKFLOW, WORKFLOW_REF, OIDC_AUDIENCE, COLLECTION, SPEND, CAP_USD, WARN_USD, LABEL, priceOf, cost, slug, monthOf, spend, dispatch, verifyOidc, report, candidates,
  _reset: () => { jwks = { at: 0, keys: [] }; } };
