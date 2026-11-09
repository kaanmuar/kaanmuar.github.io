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
   active      tasks still queued or running: the hourly pass starts one task at a time (#3064)
   route       the model a task starts on (#2958);  view  the spend meter and the last tasks, for the worker op
   gate        sorts a PR's files into destructive, visible and safe (#2959): safe PRs are labelled jarvis-merge and merge on
               green after the countdown; visible and destructive ones wait for Carlos's Approve with the run's screenshots
   mergeCheck  the gate again on the PR's current files before any merge (jarvis-github-fix.js mergeBlock), and drops a
               diagnosis PR whose workflow is green again on main (#3071)
   decide      Carlos's Approve or Reject from the web Jarvis or the app (op worker-decide)

   Prices are list prices per million tokens, rounded up so the meter overstates rather than understates; thinking
   tokens bill as output and cached input bills in full. The month warns once at WARN_USD and stops the worker at
   CAP_USD; past it, fixes go to a Cursor agent on tap. */

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
const FLASH_CATEGORIES = ["test", "config"];
const STATES = ["queued", "running", "done", "nochange", "failed"];
const PRICES = [[/lite/i, { in: 0.1, out: 0.4 }], [/flash/i, { in: 0.5, out: 3 }], [/pro|.*/i, { in: 2.5, out: 15 }]];
const LABEL = "jarvis";
const DIAG_CATEGORIES = ["code", "test", "config"];
const DIAG_DAYS = 2;
// A run is cut off at 75 minutes (jarvis-worker.yml), so a queued or running row older than this never reported.
const ACTIVE_MS = 2 * 3600000;
const REASONS = ["quota"];
const FINAL = ["done", "nochange", "failed", "dropped", "rejected"];
const MERGE_LABEL = "jarvis-merge";
const GATE_LABEL = "jarvis-gate";
const GATES = ["destructive", "visible", "safe"];
const SHOTS = 8;
const SHOT_B64 = 600000;
const SAFE = [/^tests\//, /\.(test|spec)\.[cm]?js$/, /\.md$/i, /^\.cursor\//];
// What a bad merge cannot take back: deploys, data rules, dependencies, the domain.
const DESTRUCTIVE_PATHS = [/^\.github\/workflows\//, /^(firebase\.json|\.firebaserc|firestore\.rules|firestore\.indexes\.json|storage\.rules|database\.rules\.json|CNAME)$/, /(^|\/)package(-lock)?\.json$/, /(^|\/)\.env/];
// Money, secrets and accounts, in code only: pages such as qa-review-pay.html are visible, not destructive.
const DESTRUCTIVE_CODE = /(^|[/._-])(secrets?|credentials?|stripe|billing|payments?|payouts?|invoices?|refunds?|accounts?|auth|purge|wipe)([/._-]|$)/i;
// Added lines that delete stored data or rewrite history.
const DESTRUCTIVE_LINES = /\.doc\([^)]*\)\.delete\(|\.recursiveDelete\(|\.deleteFiles?\(|\b(batch|tx)\.delete\(|method:\s*["']DELETE|-X\s*DELETE|\brm\s+-r|push\s+(-f\b|--force)|\bDROP\s+TABLE\b|deleteUsers?\(/i;
const CODE = /\.(js|mjs|cjs|ts|py|sh|kt|rules)$/;
// What a visitor, a recipient or Carlos sees: pages, styles, front-end scripts, images, translations, the app, and what writes them.
const VISIBLE = [/\.(html?|css|svg|png|jpe?g|webp|gif|avif|ico|woff2?|ttf)$/i, /^(js|css|images|img|fonts|assets|social|locales|i18n|lang)\//, /^android\//,
  /^scripts\/build-/, /^scripts\/[\w-]+-studio\//, /(^|\/)(templates?|emails?)\//i, /^functions\/[\w-]*(email|mail|notice|copy|i18n)[\w-]*\.js$/i];

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
  return { month, usd, runs: Number(d.runs) || 0, input: Number(d.input) || 0, output: Number(d.output) || 0, cap: CAP_USD, warn: WARN_USD, over: usd >= CAP_USD, warned: usd >= WARN_USD,
    level: usd >= CAP_USD ? "over" : usd >= WARN_USD ? "warn" : "ok", left: round(Math.max(0, CAP_USD - usd)) };
}

// Worker tasks still queued or running: the hourly pass starts none while one is (#3064).
async function active(db, now) {
  const since = new Date(now - ACTIVE_MS).toISOString();
  const snap = await db.collection(COLLECTION).orderBy("at", "desc").limit(20).get();
  return snap.docs.map((doc) => doc.data()).filter((d) => (d.state === "queued" || d.state === "running") && String(d.at || "") >= since).length;
}

/* The tier the task asks for; else Flash for test and config fixes, Pro for code. A failed Flash run is tried again once
   on Pro (report); a failed Pro run waits for a Cursor agent on tap. */
function route(task) {
  const t = task || {};
  if (TIERS.includes(t.tier)) return t.tier;
  return FLASH_CATEGORIES.includes(t.category) ? "flash" : "pro";
}

// The threshold a run's cost carried the month over: "cap", "warn" or null.
function crossed(before, after) {
  if (before < CAP_USD && after >= CAP_USD) return "cap";
  if (before < WARN_USD && after >= WARN_USD) return "warn";
  return null;
}

function budgetMessage(level, usd) {
  if (level !== "cap" && level !== "warn") return null;
  const of = "$" + Number(usd || 0).toFixed(2) + " of $" + CAP_USD + " this month";
  return level === "cap"
    ? { kind: "alerts", title: "Jarvis's worker stopped: AI budget used", body: of + ". It takes no more tasks until next month; fixes go to a Cursor agent on tap.", tab: "products:github", tag: "jarvis-worker-budget" }
    : { kind: "alerts", title: "Jarvis's AI spend passed $" + WARN_USD, body: of + ". The worker stops at $" + CAP_USD + ".", tab: "products:github", tag: "jarvis-worker-budget" };
}

/* A task's gate for the web Jarvis and the app; waiting when its PR needs Carlos's Approve or Reject. */
function gateView(d) {
  const g = d.gate;
  if (!g || !GATES.includes(g.level)) return null;
  return { level: g.level, destructive: g.destructive || [], visible: g.visible || [], safe: Number(g.safe) || 0, shots: g.shots || [], note: g.note || "",
    decision: g.decision || null, by: g.by || null, stale: !!g.stale, waiting: d.state === "done" && g.level !== "safe" && !g.decision };
}

/* The worker op: the month's spend and the last 20 tasks with what a row needs to hand a failed one to Cursor. */
async function view(db, now) {
  const [budget, snap] = await Promise.all([spend(db, now), db.collection(COLLECTION).orderBy("at", "desc").limit(20).get()]);
  const tasks = snap.docs.map((doc) => {
    const d = doc.data();
    const stuck = (d.state === "failed" || d.state === "nochange") && !d.escalatedTo;
    return { id: d.id, title: d.title, state: d.state, by: d.by, tier: d.tier, at: d.at, updatedAt: d.updatedAt, usd: round(Number(d.usd) || 0), pr: d.prNumber || null,
      url: d.prUrl || d.runUrl || null, runUrl: d.runUrl || null, error: d.error || d.dropped || "", reason: d.reason || null, escalatedFrom: d.escalatedFrom || null, escalatedTo: d.escalatedTo || null,
      gate: gateView(d), cursor: stuck ? { prompt: block(d.prompt, 4000), branch: d.pr ? undefined : d.branch || "main", pr: d.pr || undefined, name: "Jarvis fix: " + text(d.title, 60) } : null };
  });
  return { spend: budget, tasks };
}

/* task: { prompt, title?, tier?, category?, branch?, pr?, issue?, key?, by?, escalatedFrom? } -> { ok, id, message, url }. Throws over the cap. */
async function dispatch(ctx, task) {
  const t = task || {};
  const prompt = block(t.prompt, 20000).trim();
  const issue = int(t.issue);
  if (prompt.length < 20 && !issue) throw new Error("Give the worker a task of at least 20 characters, or an issue.");
  const pr = int(t.pr);
  const branch = text(t.branch, 200) || "main";
  if (!/^[\w./-]+$/.test(branch) || branch.includes("..")) throw new Error("That is not a branch name.");
  const tier = route(t);
  const title = text(t.title || t.name, 90) || (issue ? "Fix #" + issue : pr ? "Work on PR #" + pr : text(prompt, 60));
  const now = ctx.now || Date.now();
  const budget = await spend(ctx.db, now);
  if (budget.over) throw new Error("Jarvis's AI budget for " + budget.month + " is used ($" + budget.usd.toFixed(2) + " of $" + CAP_USD + "). Raise the cap or use a Cursor agent.");
  const id = "w" + now.toString(36) + crypto.randomBytes(3).toString("hex");
  const row = { id, state: "queued", title, prompt, tier, branch, pr: pr || null, issue: issue || null, key: text(t.key, 160) || null, by: text(t.by, 80) || "jarvis",
    escalatedFrom: text(t.escalatedFrom, 40) || null, at: new Date(now).toISOString(), updatedAt: new Date(now).toISOString() };
  await ctx.db.collection(COLLECTION).doc(id).set(row);
  try {
    await gh(ctx, "/repos/" + REPO + "/actions/workflows/" + WORKFLOW + "/dispatches", { method: "POST",
      body: { ref: "main", inputs: { id, title, tier, branch, pr: pr ? String(pr) : "", issue: issue ? String(issue) : "", prompt } } });
  } catch (error) {
    await ctx.db.collection(COLLECTION).doc(id).set({ state: "failed", error: text(error.message, 300), updatedAt: new Date(now).toISOString() }, { merge: true });
    throw new Error(error.status === 403 ? "Give the qa-lab-agents app Actions: write so Jarvis can start its worker." : error.message);
  }
  const url = "https://github.com/" + REPO + "/actions/workflows/" + WORKFLOW;
  await jarvisLog.log(null, { source: "github", level: "info", ref: "worker:" + id, url, text: "Started Jarvis's worker (" + tier + (row.escalatedFrom ? ", after Flash failed" : "") + "): " + title + "." });
  return { ok: true, id, tier, url, message: "Jarvis's worker started on " + (tier === "flash" ? "Flash" : "Pro") + ": " + title + ". It opens a PR when the tests pass." };
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

function destructiveWhy(file, f) {
  if (f && f.status === "removed") return "deleted";
  if (DESTRUCTIVE_PATHS.some((re) => re.test(file))) return "deploys, data rules or dependencies";
  if (!CODE.test(file) || SAFE.some((re) => re.test(file))) return "";
  if (DESTRUCTIVE_CODE.test(file)) return "money, secrets or accounts";
  const hit = String((f && f.patch) || "").split("\n").find((l) => l.startsWith("+") && !l.startsWith("+++") && DESTRUCTIVE_LINES.test(l));
  return hit ? "deletes data: " + text(hit.slice(1), 120) : "";
}

/** A PR's files ([{ filename, status, patch? }] from GitHub, or paths) -> { level, destructive: [{ file, why }], visible: [file], safe: [file] }.
    The PR's level is its worst file: destructive never merges on its own, visible waits for Carlos's Approve, safe merges on green. */
function gate(files) {
  const out = { level: "safe", destructive: [], visible: [], safe: [] };
  for (const f of (Array.isArray(files) ? files : []).slice(0, 300)) {
    const file = text(typeof f === "string" ? f : f && f.filename, 200);
    if (!file) continue;
    const why = destructiveWhy(file, typeof f === "string" ? null : f);
    if (why) out.destructive.push({ file, why });
    else if (!SAFE.some((re) => re.test(file)) && VISIBLE.some((re) => re.test(file))) out.visible.push(file);
    else out.safe.push(file);
  }
  out.level = out.destructive.length ? "destructive" : out.visible.length ? "visible" : "safe";
  return out;
}

const prFiles = (ctx, n) => gh(ctx, "/repos/" + REPO + "/pulls/" + n + "/files?per_page=100");

/* The run's JPEG screenshots ([{ page, before?, after? }] in base64) -> [{ page, before?, after? }] as download URLs in storage. */
async function saveShots(ctx, id, shots) {
  if (!ctx.store) return [];
  const out = [];
  for (const [i, s] of (Array.isArray(shots) ? shots : []).slice(0, SHOTS).entries()) {
    const page = text(s && s.page, 120);
    if (!page) continue;
    const row = { page };
    for (const side of ["before", "after"]) {
      const b64 = typeof s[side] === "string" ? s[side] : "";
      if (!b64 || b64.length > SHOT_B64) continue;
      const buf = Buffer.from(b64, "base64");
      if (buf[0] !== 0xff || buf[1] !== 0xd8) continue;
      row[side] = await ctx.store("jarvis-worker/" + id + "/" + i + "-" + side + ".jpg", buf, "image/jpeg").catch(() => null);
    }
    if (row.before || row.after) out.push(row);
  }
  return out;
}

function gateComment(g, shots, note) {
  const list = (files) => files.slice(0, 20).map((f) => "`" + f + "`").join(", ") + (files.length > 20 ? " and " + (files.length - 20) + " more" : "");
  const head = g.level === "safe" ? "**Jarvis's gate: safe.** Tests, docs or internal code only, so Jarvis merges it once CI is green and the countdown ends (labelled " + MERGE_LABEL + ")."
    : g.level === "visible" ? "**Jarvis's gate: visible.** It changes what people see, so it waits for Carlos's Approve in Jarvis before it merges."
    : "**Jarvis's gate: destructive.** Jarvis never merges this on its own; it merges only after Carlos approves it in Jarvis.";
  const table = shots.length ? "\n\n| Page | Before | After |\n| --- | --- | --- |\n" + shots.map((s) => "| `" + s.page + "` | " + (s.before ? "![before](" + s.before + ")" : "new") + " | " + (s.after ? "![after](" + s.after + ")" : "gone") + " |").join("\n") : "";
  return [head + " (#2959)",
    g.destructive.length ? "\n**Destructive**\n" + g.destructive.slice(0, 20).map((d) => "- `" + d.file + "`: " + d.why).join("\n") : "",
    g.visible.length ? "\n**Visible:** " + list(g.visible) : "",
    note ? "\n" + text(note, 300) : ""].filter(Boolean).join("\n") + table;
}

/* A done report on a jarvis/* PR: the gate from the PR's files on GitHub (the run's own list when GitHub does not answer),
   the run's screenshots, the labels and a comment. A new push clears an earlier decision. */
async function gatePr(ctx, id, n, sha, b) {
  let g;
  try { g = gate(await prFiles(ctx, n)); } catch (error) { g = gate(b.files); }
  const shots = await saveShots(ctx, id, b.shots);
  const add = g.level === "safe" ? MERGE_LABEL : GATE_LABEL;
  await gh(ctx, "/repos/" + REPO + "/issues/" + n + "/labels", { method: "POST", body: { labels: [LABEL, add] } }).catch(() => null);
  await gh(ctx, "/repos/" + REPO + "/issues/" + n + "/labels/" + (add === MERGE_LABEL ? GATE_LABEL : MERGE_LABEL), { method: "DELETE" }).catch(() => null);
  await gh(ctx, "/repos/" + REPO + "/issues/" + n + "/comments", { method: "POST", body: { body: gateComment(g, shots, b.shotNote) } }).catch(() => null);
  return { level: g.level, destructive: g.destructive.slice(0, 40), visible: g.visible.slice(0, 40), safe: g.safe.length, shots, note: text(b.shotNote, 300),
    sha: text(sha, 40) || null, decision: null, at: new Date(ctx.now || Date.now()).toISOString() };
}

/** The push for a PR that waits for Carlos, or null. */
function gateMessage(out) {
  if (!out || !out.pr || !out.gate || out.gate === "safe") return null;
  const shots = Number(out.shots) || 0;
  return { kind: "alerts", title: "Jarvis's PR #" + out.pr + " waits for your Approve", tab: "products:github", tag: "jarvis-worker-gate-" + out.pr,
    body: (out.gate === "destructive" ? "It touches destructive files" : "It changes what people see") + (shots ? "; " + shots + " screenshot" + (shots === 1 ? "" : "s") + " to compare" : "") + ". Approve or Reject in Jarvis > GitHub." };
}

/* A diagnosis task on main whose workflow has a newer completed run on main that passed -> why it is not needed any more, or "".
   The PR is not merged, so that run passed without it (#3071). */
async function healed(ctx, row) {
  const run = Number((/^gh:diag:(\d+)$/.exec(String(row.key || "")) || [])[1]) || 0;
  if (!run || row.pr) return "";
  const snap = await ctx.db.collection("jarvis_github_diag").doc(String(run)).get().catch(() => null);
  const d = snap && snap.exists ? snap.data() : null;
  if (!d || !d.workflow || d.pr || (d.branch && d.branch !== "main")) return "";
  const runs = (await gh(ctx, "/repos/" + REPO + "/actions/runs?branch=main&status=completed&exclude_pull_requests=true&per_page=50")).workflow_runs || [];
  const newest = runs.find((r) => r.name === d.workflow && Number(r.id) > run);
  return newest && newest.conclusion === "success" ? d.workflow + " is green again on main (run " + newest.id + ") without this PR" : "";
}

async function drop(ctx, row, n, why) {
  const now = ctx.now || Date.now();
  await gh(ctx, "/repos/" + REPO + "/issues/" + n + "/comments", { method: "POST", body: { body: "Jarvis dropped this PR: " + why + ". The failure it fixed no longer happens on main, so merging it would only add risk (#3071)." } });
  await gh(ctx, "/repos/" + REPO + "/pulls/" + n, { method: "PATCH", body: { state: "closed" } });
  await ctx.db.collection(COLLECTION).doc(row.id).set({ state: "dropped", dropped: text(why, 300), updatedAt: new Date(now).toISOString() }, { merge: true });
  await jarvisLog.log(null, { source: "github", level: "info", ref: "worker:" + row.id, url: "https://github.com/" + REPO + "/pull/" + n, text: "Jarvis dropped PR #" + n + " (" + row.title + "): " + why + "." });
}

// The task that opened PR n: a later task that pushed to it has the same prNumber and its own pr.
async function taskOfPr(db, n) {
  const snap = await db.collection(COLLECTION).where("prNumber", "==", Number(n)).limit(10).get().catch(() => ({ docs: [] }));
  return snap.docs.map((doc) => doc.data()).find((d) => !d.pr) || null;
}

/** Before Jarvis merges an open PR (mergeBlock) -> { why, dropped?, gate? }. A jarvis/* PR from the worker is dropped when its
    diagnosis is healed, and otherwise passes only when its current files are safe or Carlos approved its current commit. */
async function mergeCheck(ctx, pr) {
  if (!ctx.db || !/^jarvis\//.test(String((pr.head || {}).ref || ""))) return { why: "" };
  const row = await taskOfPr(ctx.db, pr.number);
  if (!row) return { why: "" };
  const heal = await healed(ctx, row).catch(() => "");
  if (heal) {
    await drop(ctx, row, pr.number, heal);
    return { why: "dropped: " + heal, dropped: heal };
  }
  const live = gate(await prFiles(ctx, pr.number));
  if (live.level === "safe") return { why: "", gate: "safe" };
  const g = row.gate || {};
  if (g.decision === "approved" && g.approvedSha === pr.head.sha) return { why: "", gate: "approved" };
  if (g.decision === "approved") return { why: "changed since Carlos approved it" };
  const files = (live.level === "destructive" ? live.destructive.map((d) => d.file) : live.visible).slice(0, 3).join(", ");
  return { why: "waiting for Carlos's Approve (" + live.level + ": " + files + ")" };
}

/* body: { id, decision: "approve" | "reject", why? } -> { ok, message, url }. Approve binds to the PR's current commit, the one
   the screenshots show, and labels it jarvis-merge so it merges on green; Reject closes the PR. */
async function decide(ctx, body, by) {
  const b = body || {};
  const now = ctx.now || Date.now();
  const id = text(b.id, 40);
  const decision = b.decision === "approve" ? "approve" : b.decision === "reject" ? "reject" : "";
  if (!decision) throw new Error("Approve or Reject?");
  const ref = ctx.db.collection(COLLECTION).doc(id);
  const snap = id ? await ref.get() : null;
  if (!snap || !snap.exists) throw new Error("No worker task " + id + ".");
  const row = snap.data();
  const n = Number(row.prNumber) || 0;
  if (!n || row.pr) throw new Error("Task " + id + " has no PR of its own.");
  const url = "https://github.com/" + REPO + "/pull/" + n;
  const pr = await gh(ctx, "/repos/" + REPO + "/pulls/" + n);
  if (pr.state !== "open") throw new Error("#" + n + " is " + (pr.merged ? "already merged" : "closed") + ".");
  const who = text(by, 80) || "Carlos";
  const g = row.gate || {};
  if (decision === "reject") {
    const why = text(b.why, 300);
    await gh(ctx, "/repos/" + REPO + "/issues/" + n + "/comments", { method: "POST", body: { body: who + " rejected this in Jarvis" + (why ? ": " + why : "") + ". Closed (#2959)." } });
    await gh(ctx, "/repos/" + REPO + "/pulls/" + n, { method: "PATCH", body: { state: "closed" } });
    await ref.set({ state: "rejected", gate: Object.assign({}, g, { decision: "rejected", by: who, decidedAt: new Date(now).toISOString(), why }), updatedAt: new Date(now).toISOString() }, { merge: true });
    await jarvisLog.log(null, { source: "github", level: "info", ref: "worker:" + id, url, text: who + " rejected Jarvis's PR #" + n + " (" + row.title + ")" + (why ? ": " + why : "") + "." });
    return { ok: true, message: "Closed #" + n + ".", url };
  }
  const heal = await healed(ctx, row).catch(() => "");
  if (heal) {
    await drop(ctx, row, n, heal);
    return { ok: false, message: "Dropped #" + n + " instead: " + heal + ".", url };
  }
  if (g.sha && g.sha !== pr.head.sha) {
    await ref.set({ gate: Object.assign({}, g, { sha: pr.head.sha, stale: true }), updatedAt: new Date(now).toISOString() }, { merge: true });
    return { ok: false, stale: true, message: "#" + n + " got new commits since the screenshots. Look at the PR, then Approve again to approve " + pr.head.sha.slice(0, 7) + ".", url };
  }
  await gh(ctx, "/repos/" + REPO + "/issues/" + n + "/labels", { method: "POST", body: { labels: [MERGE_LABEL] } });
  await gh(ctx, "/repos/" + REPO + "/issues/" + n + "/labels/" + GATE_LABEL, { method: "DELETE" }).catch(() => null);
  await gh(ctx, "/repos/" + REPO + "/issues/" + n + "/comments", { method: "POST", body: { body: who + " approved this in Jarvis at " + pr.head.sha.slice(0, 7) + ". Jarvis merges it once CI is green and the countdown ends; a new commit needs a new Approve (#2959)." } });
  await ref.set({ gate: Object.assign({}, g, { decision: "approved", approvedSha: pr.head.sha, stale: false, by: who, decidedAt: new Date(now).toISOString() }), updatedAt: new Date(now).toISOString() }, { merge: true });
  await jarvisLog.log(null, { source: "github", level: "info", ref: "worker:" + id, url, text: who + " approved Jarvis's PR #" + n + " (" + row.title + "); it merges on green." });
  return { ok: true, message: "Approved #" + n + "; it merges once CI is green and the countdown ends.", url };
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
  if (FINAL.includes(row.state)) return { ok: true, state: row.state, pr: row.prNumber || null, url: row.prUrl || null, already: true };
  const state = STATES.includes(b.state) ? b.state : "failed";
  const runUrl = "https://github.com/" + REPO + "/actions/runs/" + run;
  const c = cost(b.models);
  const reason = state === "failed" && REASONS.includes(b.reason) ? b.reason : null;
  const patch = { state, run, runUrl, updatedAt: new Date(now).toISOString(), summary: block(b.summary, 4000), tests: text(b.tests, 80), error: text(b.error, 600), reason,
    files: (Array.isArray(b.files) ? b.files : []).slice(0, 100).map((f) => text(f, 200)), usd: round((Number(row.usd) || 0) + c.usd),
    input: (Number(row.input) || 0) + c.input, output: (Number(row.output) || 0) + c.output };
  let budget = null;
  if (c.usd > 0 || c.input > 0) {
    const month = ctx.db.collection(SPEND).doc(monthOf(now));
    await ctx.db.runTransaction(async (tx) => {
      const m = await tx.get(month);
      const d = m.exists ? m.data() : {};
      const before = Number(d.usd) || 0, after = round(before + c.usd);
      budget = { usd: after, crossed: crossed(before, after) };
      tx.set(month, Object.assign({ usd: after, input: (Number(d.input) || 0) + c.input, output: (Number(d.output) || 0) + c.output,
        runs: (Number(d.runs) || 0) + (state === "running" ? 0 : 1), updatedAt: new Date(now).toISOString() },
        budget.crossed ? { [budget.crossed + "At"]: new Date(now).toISOString() } : {}), { merge: true });
    });
  }
  let out = Object.assign({ ok: true, state }, budget && budget.crossed ? { crossed: budget.crossed, monthUsd: budget.usd } : {});
  if (state === "failed" && row.tier === "flash" && !row.escalatedTo) {
    try {
      const next = await dispatch(Object.assign({}, ctx, { now }), { prompt: row.prompt, title: row.title, tier: "pro", branch: row.branch, pr: row.pr, issue: row.issue, key: row.key, by: row.by, escalatedFrom: id });
      patch.escalatedTo = next.id;
      out.escalated = next.id;
    } catch (error) { patch.escalateError = text(error.message, 300); }
  }
  if (state === "done") {
    const branch = text(b.branch, 200);
    if (row.pr) {
      await gh(ctx, "/repos/" + REPO + "/issues/" + row.pr + "/comments", { method: "POST", body: { body: "Jarvis's worker pushed to this PR ([run](" + runUrl + ")).\n\n" + block(b.summary, 4000) } });
      Object.assign(patch, { prNumber: row.pr, prUrl: "https://github.com/" + REPO + "/pull/" + row.pr });
      // A push to a worker PR gates it again: new files and screenshots, and Carlos's earlier decision no longer holds.
      const opener = /^jarvis\//.test(row.branch || branch) ? await taskOfPr(ctx.db, row.pr) : null;
      if (opener && opener.state === "done") {
        const p = await gh(ctx, "/repos/" + REPO + "/pulls/" + row.pr).catch(() => ({}));
        const g = await gatePr(Object.assign({}, ctx, { now }), id, row.pr, (p.head || {}).sha, b);
        await ctx.db.collection(COLLECTION).doc(opener.id).set({ gate: g, updatedAt: new Date(now).toISOString() }, { merge: true });
        out = Object.assign(out, { gate: g.level, shots: g.shots.length });
      }
    } else {
      if (!/^jarvis\/[\w.-]+$/.test(branch)) throw new Error("The worker pushes jarvis/* branches only.");
      const open = await gh(ctx, "/repos/" + REPO + "/pulls?state=open&head=" + REPO.split("/")[0] + ":" + encodeURIComponent(branch));
      const pr = (open || [])[0] || await gh(ctx, "/repos/" + REPO + "/pulls", { method: "POST", body: { title: "Jarvis: " + row.title, head: branch, base: "main", body: prBody(row, b, c, runUrl) } });
      patch.gate = await gatePr(Object.assign({}, ctx, { now }), id, pr.number, (pr.head || {}).sha, b);
      Object.assign(patch, { branch, prNumber: pr.number, prUrl: pr.html_url });
      out = Object.assign(out, { gate: patch.gate.level, shots: patch.gate.shots.length });
    }
    out = Object.assign(out, { pr: patch.prNumber, url: patch.prUrl });
  }
  await ref.set(patch, { merge: true });
  if (state !== "running") {
    const then = patch.escalatedTo ? "; trying again on Pro" : state === "failed" || state === "nochange" ? "; hand it to a Cursor agent from the GitHub tab" : "";
    const gated = patch.gate ? (patch.gate.level === "safe" ? ", safe, so it merges on green" : ", " + patch.gate.level + ", so it waits for your Approve") : "";
    const said = state === "done" ? "opened " + (patch.prUrl ? "PR #" + patch.prNumber : "its PR") + gated : state === "nochange" ? "found nothing to change"
      : reason === "quota" ? "stopped on Gemini's request quota, not on the code" : "failed: " + (patch.error || "no reason given");
    await jarvisLog.log(null, { source: "github", level: state === "failed" ? "warn" : "info", ref: "worker:" + id, url: patch.prUrl || runUrl,
      text: "Jarvis's worker " + said + " (" + row.title + ", " + row.tier + ", $" + patch.usd.toFixed(2) + ")" + then + "." });
  }
  if (out.crossed) {
    await jarvisLog.log(null, { source: "github", level: "warn", ref: "worker:budget", url: "https://github.com/" + REPO + "/actions/workflows/" + WORKFLOW,
      text: budgetMessage(out.crossed, out.monthUsd).title + ": " + budgetMessage(out.crossed, out.monthUsd).body });
  }
  return out;
}

/* What the hourly pass may hand the worker on its own -> [{ target, task }]: code, test or config diagnoses from the last
   two days at or over the confidence bar, and URL review bugs the Cursor fix agent left waiting (needs-agent).
   failing: the workflows whose newest run on main in the last day failed; a diagnosis on main of any other workflow is
   already fixed or not run lately, so it is left out (#2958). Without the list, every diagnosis counts. */
async function candidates(db, { now, confidence, github, failing }) {
  const stillFailing = Array.isArray(failing) ? new Set(failing) : null;
  const out = [];
  const since = new Date(now - DIAG_DAYS * 864e5).toISOString();
  const diags = await db.collection("jarvis_github_diag").orderBy("at", "desc").limit(30).get().catch(() => ({ docs: [] }));
  for (const doc of diags.docs || []) {
    const d = doc.data();
    if (String(d.at || "") < since || !DIAG_CATEGORIES.includes(d.category) || !(Number(d.confidence) >= confidence) || !text(d.prompt, 20) || (d.repo && d.repo !== REPO)) continue;
    // A chat may still be pushing to another PR's branch; on its own the worker only touches main and its own branches.
    const own = /^jarvis\//.test(String(d.branch || ""));
    if (d.pr ? !own : d.branch && d.branch !== "main") continue;
    if (!d.pr && stillFailing && !stillFailing.has(d.workflow)) continue;
    out.push({ target: "run " + d.run, why: text(d.workflow, 80) + " failed: " + text(d.cause, 160),
      task: { prompt: d.prompt, title: "Fix " + text(d.workflow, 60) + " (run " + d.run + ")", branch: "main", pr: d.pr || undefined, category: d.category, key: "gh:diag:" + d.run, by: "jarvis (diagnosis)" } });
  }
  for (const bug of ((github || {}).needsAgent || []).slice(0, 10)) {
    out.push({ target: "#" + bug.number, why: "URL review bug left for the fix agent: " + text(bug.title, 160),
      task: { issue: bug.number, title: "Fix #" + bug.number + " " + text(bug.title, 60), key: "issue:" + bug.number, by: "jarvis (needs-agent)",
        prompt: "Fix GitHub issue #" + bug.number + " (" + text(bug.title, 200) + "), a failure the daily check of URL reviews filed. Find the root cause, fix it, add a test that fails without the fix, and add a row to FIXES in functions/url-review-failures.js naming the cause." } });
  }
  return out;
}

module.exports = { REPO, WORKFLOW, WORKFLOW_REF, OIDC_AUDIENCE, COLLECTION, SPEND, CAP_USD, WARN_USD, LABEL, MERGE_LABEL, GATE_LABEL, priceOf, cost, slug, monthOf, spend, active, route, crossed, budgetMessage, view,
  dispatch, verifyOidc, report, candidates, gate, gateMessage, healed, mergeCheck, decide,
  _reset: () => { jwks = { at: 0, keys: [] }; } };
