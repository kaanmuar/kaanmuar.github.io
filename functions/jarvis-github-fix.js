"use strict";
/* What Jarvis does about GitHub (#2526), for the github-act, github-diagnose, github-agent and github-local ops, the
   hourly pass (jarvis-actions.js), the countdown (jarvis-countdown.js) and the jarvisGithub job.

   boardSync     moves drifted board items to the column they should be in (board token, Status field)
   updatePr      merges main into a PR branch that is behind (update-branch)
   mergePr       squash-merges a PR that is mergeable, green and labelled jarvis-merge or approved
   revert        opens a revert PR for main's HEAD commit (jarvis/revert-<short>); any older commit needs a fix agent
   deleteBranch  deletes merged branches; never the default branch or one with an open PR
   closeIssue    comments and closes an issue
   orphanTicket  files a request ticket for a PR without one, puts it in Dev and names it on the PR
   diagnose      reads a failed run's first failed job log and asks Gemini for the cause; jarvis_github_diag/<run>
   launchAgent   starts a Cursor cloud agent (CURSOR_API_KEY), only on Carlos's click
   retro         Gemini's weekly GitHub retro from the last 7 day docs; jarvis_github_weekly/<YYYY-Www>
   localIngest   the Mac uploader's report (worktrees, usage, cost, rate) in jarvis_github_local/latest, and the
                 results of the queued worktree removals; localReply lists what is still queued for it

   Each takes ({ fetch, env, db, now, github(scope) -> token, gemini?(prompt, maxTokens) -> text }, args) and returns
   { ok, message, url? } or throws a plain Error. The app lacks contents:write today, so the calls that write refs
   answer with the permission to grant. */

const crypto = require("crypto");

const API = "https://api.github.com";
const REPO = "kaanmuar/kaanmuar.github.io";
const BOARD = { project: "PVT_kwDOFLbZIM4BokiS", status: "PVTSSF_lADOFLbZIM4BokiSzhnEBTE", url: "https://github.com/orgs/carlosandmunoz-hq/projects/1" };
// scripts/ticket.sh's option ids, used when the field cannot be read.
const COLUMNS = { Backlog: "3f4ac4fe", Next: "dc8fb26d", Design: "a8250664", Dev: "698df321", QA: "71ce1b86", Stg: "727e0727", Prod: "060490af", Done: "bebf6b88" };
const MERGE_LABEL = "jarvis-merge";
const TICKET = 2526;
const CATEGORIES = ["flaky", "infra", "code", "test", "config"];
const DIAG_ACTIONS = ["rerun-ci", "gh-agent", "none"];
const LOG_LINES = 150;
const RATE_POINTS = 48;
const QUEUE_ACTIONS = ["remove-worktree", "prune-branches"];
const CURSOR_AGENTS = "https://api.cursor.com/v1/agents";
const NO_CURSOR_KEY = "Add CURSOR_API_KEY to the functions secrets (Cursor Dashboard > API Keys).";

const text = (value, max) => String(value === null || value === undefined ? "" : value).replace(/\s+/g, " ").trim().slice(0, max);
const block = (value, max) => String(value === null || value === undefined ? "" : value).slice(0, max);
const iso = (value) => { const t = Date.parse(value); return Number.isFinite(t) ? new Date(t).toISOString() : ""; };
const num = (value) => (value !== null && value !== undefined && value !== "" && Number.isFinite(Number(value)) ? Number(value) : null);
const repoOf = (args) => {
  const r = String((args && args.repo) || REPO);
  if (!/^[\w.-]+\/[\w.-]+$/.test(r)) throw new Error("That is not a repository (owner/name).");
  return r;
};
const numberOf = (args) => {
  const n = Number(String((args && (args.number || args.pr || args.target)) || "").replace(/^#/, ""));
  if (!Number.isInteger(n) || n <= 0) throw new Error("Which number?");
  return n;
};

let statusOptions = null;

async function call(ctx, path, { method, body, scope, accept } = {}) {
  const token = await ctx.github(scope || "repo");
  if (!token) throw new Error("No GitHub token is set (GITHUB_APP_ID with GITHUB_APP_PRIVATE_KEY), so Jarvis cannot reach GitHub.");
  const res = await ctx.fetch(API + path, {
    method: method || "GET",
    headers: Object.assign({ Authorization: "Bearer " + token, Accept: accept || "application/vnd.github+json", "User-Agent": "qa-lab-jarvis", "X-GitHub-Api-Version": "2022-11-28" },
      body === undefined ? {} : { "Content-Type": "application/json" }),
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  const data = res.status === 204 ? {} : await res.json().catch(() => ({}));
  if (!res.ok || (data && Array.isArray(data.errors) && data.errors.length && path === "/graphql")) {
    const error = new Error("GitHub " + path.split("?")[0] + " answered " + res.status + ": " + text((data && (data.message || JSON.stringify(data.errors))) || "", 240));
    error.status = res.status;
    throw error;
  }
  return data;
}

// A 403 for a write the app has no permission for, as the grant Carlos has to make.
function need(error, permission, what) {
  if (error && (error.status === 403 || error.status === 404) && /not accessible|permission|Not Found/i.test(error.message)) {
    const out = new Error("Give the qa-lab-agents app " + permission + " so Jarvis can " + what + ".");
    out.need = permission;
    return out;
  }
  return error;
}

const gql = (ctx, query, variables) => call(ctx, "/graphql", { method: "POST", body: { query, variables }, scope: "board" });

async function columnIds(ctx) {
  if (statusOptions) return statusOptions;
  try {
    const out = await gql(ctx, "query($f:ID!){node(id:$f){... on ProjectV2SingleSelectField{options{id name}}}}", { f: BOARD.status });
    const opts = ((out.data || {}).node || {}).options || [];
    if (opts.length) statusOptions = opts.reduce((m, o) => { m[o.name] = o.id; return m; }, {});
  } catch (error) { /* the known ids below */ }
  return statusOptions || COLUMNS;
}

function columnName(ids, name) {
  const want = String(name || "").toLowerCase();
  return Object.keys(ids).find((k) => k.toLowerCase() === want) || "";
}

async function boardItem(ctx, repo, number, item) {
  if (/^PVTI_/.test(String(item || ""))) return item;
  const issue = await call(ctx, "/repos/" + repo + "/issues/" + number);
  const added = await gql(ctx, "mutation($p:ID!,$c:ID!){addProjectV2ItemById(input:{projectId:$p,contentId:$c}){item{id}}}", { p: BOARD.project, c: issue.node_id });
  const id = (((added.data || {}).addProjectV2ItemById || {}).item || {}).id;
  if (!id) throw new Error("#" + number + " is not on the board.");
  return id;
}

async function setColumn(ctx, itemId, optionId) {
  await gql(ctx, "mutation($p:ID!,$i:ID!,$f:ID!,$o:String!){updateProjectV2ItemFieldValue(input:{projectId:$p,itemId:$i,fieldId:$f,value:{singleSelectOptionId:$o}}){projectV2Item{id}}}",
    { p: BOARD.project, i: itemId, f: BOARD.status, o: optionId });
}

/* args.items = [{ number, should, item? }] (the source's board.drift rows), or one { number, should }. */
async function boardSync(ctx, args) {
  const a = args || {};
  const repo = repoOf(a);
  const items = (Array.isArray(a.items) ? a.items : [a]).filter((d) => d && d.number && d.should).slice(0, 20);
  if (!items.length) throw new Error("Nothing drifted to move.");
  const ids = await columnIds(ctx);
  const moved = [];
  const left = [];
  for (const d of items) {
    const col = columnName(ids, d.should);
    if (!col) { left.push("#" + d.number + ": no column " + text(d.should, 20)); continue; }
    try {
      await setColumn(ctx, await boardItem(ctx, repo, Number(d.number), d.item), ids[col]);
      moved.push("#" + d.number + " to " + col);
    } catch (error) { left.push("#" + d.number + ": " + text(error.message, 120)); }
  }
  if (!moved.length) throw new Error("Nothing moved: " + left.join("; "));
  return { ok: true, message: "Moved " + moved.join(", ") + (left.length ? "; left " + left.join("; ") : "") + ".", moved, left, url: BOARD.url };
}

async function updatePr(ctx, args) {
  const repo = repoOf(args);
  const n = numberOf(args);
  try { await call(ctx, "/repos/" + repo + "/pulls/" + n + "/update-branch", { method: "PUT", body: {} }); } catch (error) { throw need(error, "Contents: write", "update PR branches"); }
  return { ok: true, message: "Merging main into #" + n + ".", url: "https://github.com/" + repo + "/pull/" + n };
}

// Why a PR may not be merged, or "".
async function mergeBlock(ctx, repo, pr) {
  if (pr.state !== "open") return pr.merged ? "already merged" : "closed";
  if (pr.draft) return "a draft";
  if (pr.mergeable_state !== "clean") return "not mergeable (" + (pr.mergeable_state || "unknown") + ")";
  const labelled = (pr.labels || []).some((l) => l.name === MERGE_LABEL);
  if (!labelled) {
    const reviews = await call(ctx, "/repos/" + repo + "/pulls/" + pr.number + "/reviews?per_page=100").catch(() => []);
    if (!(Array.isArray(reviews) ? reviews : []).some((r) => r.state === "APPROVED")) return "neither approved nor labelled " + MERGE_LABEL;
  }
  const checks = (await call(ctx, "/repos/" + repo + "/commits/" + pr.head.sha + "/check-runs?per_page=100")).check_runs || [];
  const red = checks.filter((c) => c.status !== "completed" || !["success", "skipped", "neutral"].includes(c.conclusion));
  if (!checks.length) return "without checks";
  return red.length ? red.length + " check" + (red.length === 1 ? "" : "s") + " not green (" + red[0].name + ")" : "";
}

async function mergePr(ctx, args) {
  const repo = repoOf(args);
  const n = numberOf(args);
  const pr = await call(ctx, "/repos/" + repo + "/pulls/" + n);
  const why = await mergeBlock(ctx, repo, pr);
  if (why) return { ok: false, message: "#" + n + " is " + why + "; not merged.", url: pr.html_url };
  if (args.sha && pr.head.sha !== args.sha) return { ok: false, message: "#" + n + " got new commits since Jarvis checked it; not merged.", url: pr.html_url };
  const out = await call(ctx, "/repos/" + repo + "/pulls/" + n + "/merge", { method: "PUT", body: { merge_method: "squash", sha: pr.head.sha } });
  return { ok: true, message: "Merged #" + n + " at " + String(out.sha || pr.head.sha).slice(0, 7) + ".", url: pr.html_url };
}

/* Only main's HEAD can be reverted exactly from the API: a new commit with HEAD's parent's tree on top of HEAD. */
async function revert(ctx, args) {
  const a = args || {};
  const repo = repoOf(a);
  const sha = String(a.sha || a.target || "").toLowerCase();
  if (!/^[0-9a-f]{7,40}$/.test(sha)) throw new Error("Which commit?");
  const info = await call(ctx, "/repos/" + repo);
  const base = info.default_branch || "main";
  const head = (await call(ctx, "/repos/" + repo + "/branches/" + encodeURIComponent(base))).commit || {};
  if (!String(head.sha || "").startsWith(sha)) return { ok: false, message: sha.slice(0, 7) + " is not " + base + "'s HEAD any more, so Jarvis cannot revert it exactly; use a fix agent." };
  const commit = await call(ctx, "/repos/" + repo + "/git/commits/" + head.sha);
  const parent = (commit.parents || [])[0];
  if (!parent) throw new Error(head.sha.slice(0, 7) + " has no parent.");
  if ((commit.parents || []).length > 1) return { ok: false, message: head.sha.slice(0, 7) + " is a merge commit; use a fix agent." };
  const tree = (await call(ctx, "/repos/" + repo + "/git/commits/" + parent.sha)).tree.sha;
  const title = text(String(commit.message || "").split("\n")[0], 200);
  const short = head.sha.slice(0, 7);
  const branch = "jarvis/revert-" + short;
  const ticket = (/#(\d+)/.exec(title) || [])[1];
  try {
    const made = await call(ctx, "/repos/" + repo + "/git/commits", { method: "POST", body: { message: "Revert \"" + title + "\"\n\nThis reverts commit " + head.sha + ".", tree, parents: [head.sha] } });
    await call(ctx, "/repos/" + repo + "/git/refs", { method: "POST", body: { ref: "refs/heads/" + branch, sha: made.sha } });
  } catch (error) { throw need(error, "Contents: write", "open revert branches"); }
  const pr = await call(ctx, "/repos/" + repo + "/pulls", { method: "POST", body: {
    title: ("Revert " + title).slice(0, 250), head: branch, base,
    body: "Main went red after " + head.sha + " (" + (text(a.why, 300) || "CI failed on main") + "), so Jarvis opened this exact revert (#" + TICKET + ")."
      + (ticket ? "\n\nTicket: #" + ticket : "") + "\n\nMerge it to get main green, then fix forward."
  } });
  return { ok: true, message: "Opened revert PR #" + pr.number + " for " + short + ".", url: pr.html_url, number: pr.number };
}

async function deleteBranch(ctx, args) {
  const a = args || {};
  const repo = repoOf(a);
  const names = (Array.isArray(a.branches) ? a.branches : [a.branch || a.target]).map((b) => String(b && b.name ? b.name : b || "").trim()).filter(Boolean).slice(0, 30);
  if (!names.length) throw new Error("Which branch?");
  const info = await call(ctx, "/repos/" + repo);
  const owner = repo.split("/")[0];
  const deleted = [];
  const left = [];
  for (const name of names) {
    if (name === "main" || name === "master" || name === info.default_branch || !/^[\w./-]+$/.test(name)) { left.push(name + ": never deleted"); continue; }
    const open = await call(ctx, "/repos/" + repo + "/pulls?state=open&head=" + encodeURIComponent(owner + ":" + name) + "&per_page=1").catch(() => null);
    if (!Array.isArray(open)) { left.push(name + ": could not check its PRs"); continue; }
    if (open.length) { left.push(name + ": PR #" + open[0].number + " is open"); continue; }
    try {
      await call(ctx, "/repos/" + repo + "/git/refs/heads/" + name.split("/").map(encodeURIComponent).join("/"), { method: "DELETE" });
      deleted.push(name);
    } catch (error) {
      const e = need(error, "Contents: write", "delete merged branches");
      if (e.need) throw e;
      left.push(name + ": " + text(e.message, 100));
    }
  }
  if (!deleted.length) return { ok: false, message: "No branch deleted: " + left.join("; ") + ".", deleted, left };
  return { ok: true, message: "Deleted " + deleted.length + " merged branch" + (deleted.length === 1 ? "" : "es") + " (" + deleted.slice(0, 4).join(", ") + (deleted.length > 4 ? " and more" : "") + ")" + (left.length ? "; left " + left.join("; ") : "") + ".", deleted, left };
}

async function closeIssue(ctx, args) {
  const a = args || {};
  const repo = repoOf(a);
  const n = numberOf(a);
  const comment = text(a.comment, 1000) || "Closed by Jarvis (#" + TICKET + ").";
  await call(ctx, "/repos/" + repo + "/issues/" + n + "/comments", { method: "POST", body: { body: comment } });
  const out = await call(ctx, "/repos/" + repo + "/issues/" + n, { method: "PATCH", body: { state: "closed", state_reason: a.reason === "not_planned" ? "not_planned" : "completed" } });
  return { ok: true, message: "Closed #" + n + ".", url: out.html_url };
}

// The area label of a PR's ticket: its own area:* label, else the one its branch or title hints at, else jarvis.
function areaOf(pr) {
  const own = (pr.labels || []).map((l) => l.name).find((n) => /^area:/.test(n));
  if (own) return own;
  const hay = ((pr.head || {}).ref || "") + " " + (pr.title || "");
  const hint = [["android", /android|apk/i], ["ci", /\bci\b|workflow/i], ["design", /design|logo|icon|style|css/i], ["be", /function|backend|firestore|\bbe\b/i], ["fe", /page|html|\bfe\b|ui\b/i]].find(([, re]) => re.test(hay));
  return "area:" + (hint ? hint[0] : "jarvis");
}

async function orphanTicket(ctx, args) {
  const a = args || {};
  const repo = repoOf(a);
  const n = numberOf(a);
  const pr = await call(ctx, "/repos/" + repo + "/pulls/" + n);
  if (pr.state !== "open") return { ok: false, message: "#" + n + " is " + (pr.merged ? "merged" : "closed") + "; no ticket filed.", url: pr.html_url };
  const title = text(String(pr.title || "PR #" + n).replace(/^\w+(\([^)]*\))?!?:\s*/, ""), 200);
  const area = areaOf(pr);
  const issue = await call(ctx, "/repos/" + repo + "/issues", { method: "POST", body: {
    title, labels: ["kind:request", area],
    body: "Filed by Jarvis for " + pr.html_url + ", which named no ticket (#" + TICKET + ").\n\n" + block(String(pr.body || "").trim(), 3000)
  } });
  let board = "";
  try {
    const ids = await columnIds(ctx);
    await setColumn(ctx, await boardItem(ctx, repo, issue.number), ids[columnName(ids, "Dev")] || COLUMNS.Dev);
  } catch (error) { board = "; not put on the board: " + text(error.message, 120); }
  await call(ctx, "/repos/" + repo + "/issues/" + n + "/comments", { method: "POST", body: { body: "Ticket: #" + issue.number } });
  return { ok: true, message: "Filed #" + issue.number + " (" + area + ") for PR #" + n + board + ".", url: issue.html_url, number: issue.number };
}

// The part of a job log around its first error, timestamps dropped, at most LOG_LINES lines.
function logExcerpt(raw) {
  const lines = String(raw || "").split(/\r?\n/).map((l) => l.replace(/^\d{4}-\d\d-\d\dT[\d:.]+Z\s?/, ""));
  const at = lines.findIndex((l) => /##\[error\]|\bError\b/.test(l));
  const from = at < 0 ? Math.max(0, lines.length - LOG_LINES) : Math.max(0, at - 100);
  return lines.slice(from, from + LOG_LINES).join("\n").slice(-14000);
}

function diagPrompt(run, job, excerpt) {
  return [
    "A GitHub Actions run failed. Find the cause from the log excerpt and say what fixes it.",
    "Repository " + run.repo + ", workflow \"" + run.name + "\", branch " + run.branch + ", event " + run.event + ", attempt " + run.attempt + ", commit " + String(run.sha).slice(0, 12) + ".",
    "Failed job \"" + job.name + "\"; failed steps: " + (job.steps || []).filter((s) => s.conclusion === "failure").map((s) => s.name).join(", "),
    "Log excerpt:\n" + excerpt,
    "Answer only strict JSON: {\"cause\": one sentence, \"category\": \"flaky\"|\"infra\"|\"code\"|\"test\"|\"config\", \"fix\": one or two sentences, "
      + "\"confidence\": 0-1, \"action\": \"rerun-ci\" for flaky or infra, \"gh-agent\" when code must change, else \"none\", "
      + "\"prompt\": for code, test or config a ready-to-run prompt for a Cursor coding agent working in this repository on branch " + run.branch
      + " (what failed, the files and lines the log names, what to change, how to check it), else \"\"}."
  ].join("\n");
}

function parseDiag(raw) {
  const s = String(raw || "").replace(/^```(?:json)?\s*|\s*```$/g, "").trim();
  const from = s.indexOf("{");
  const to = s.lastIndexOf("}");
  let d;
  try { d = JSON.parse(from >= 0 && to > from ? s.slice(from, to + 1) : s); } catch (error) { throw new Error("Gemini's diagnosis was not JSON."); }
  if (!d || typeof d !== "object" || !text(d.cause, 10)) throw new Error("Gemini's diagnosis named no cause.");
  const category = CATEGORIES.includes(d.category) ? d.category : "code";
  const action = DIAG_ACTIONS.includes(d.action) ? d.action : ["flaky", "infra"].includes(category) ? "rerun-ci" : "gh-agent";
  return {
    cause: text(d.cause, 400), category, fix: text(d.fix, 600), confidence: Math.max(0, Math.min(1, Number(d.confidence) || 0)),
    action, prompt: ["code", "test", "config"].includes(category) ? block(String(d.prompt || "").trim(), 4000) : ""
  };
}

async function diagnose(ctx, args) {
  const a = args || {};
  const repo = repoOf(a);
  const id = Number(a.run || a.target);
  if (!Number.isInteger(id) || id <= 0) throw new Error("Which run?");
  if (!ctx.gemini) throw new Error("GEMINI_API_KEY is not set.");
  const run = await call(ctx, "/repos/" + repo + "/actions/runs/" + id);
  const jobs = (await call(ctx, "/repos/" + repo + "/actions/runs/" + id + "/jobs?filter=latest&per_page=100")).jobs || [];
  const job = jobs.find((j) => ["failure", "timed_out", "startup_failure"].includes(j.conclusion));
  if (!job) return { ok: false, message: "Run " + id + " has no failed job to read." };
  let excerpt = "";
  try {
    const token = await ctx.github("repo");
    const res = await ctx.fetch(API + "/repos/" + repo + "/actions/jobs/" + job.id + "/logs", { headers: { Authorization: "Bearer " + token, Accept: "application/vnd.github+json", "User-Agent": "qa-lab-jarvis", "X-GitHub-Api-Version": "2022-11-28" }, redirect: "follow" });
    if (res.ok) excerpt = logExcerpt(await res.text());
  } catch (error) { excerpt = ""; }
  const facts = { repo, name: run.name, branch: run.head_branch, event: run.event, attempt: run.run_attempt, sha: run.head_sha };
  const diag = parseDiag(await ctx.gemini(diagPrompt(facts, job, excerpt || "(the log could not be read)"), 1400));
  const row = Object.assign({ run: id, repo, workflow: text(run.name, 120), branch: text(run.head_branch, 200), sha: text(run.head_sha, 40), url: text(run.html_url, 300),
    job: text(job.name, 120), jobUrl: text(job.html_url, 300) }, diag, { at: new Date(ctx.now || Date.now()).toISOString() });
  await ctx.db.collection("jarvis_github_diag").doc(String(id)).set(row);
  return { ok: true, message: row.workflow + ": " + row.cause, diag: row, url: row.url };
}

async function launchAgent(ctx, args) {
  const a = args || {};
  const key = String((ctx.env || {}).CURSOR_API_KEY || "");
  if (!key) throw new Error(NO_CURSOR_KEY);
  const repo = repoOf(a);
  const prompt = block(String(a.prompt || "").trim(), 20000);
  if (prompt.length < 20) throw new Error("The agent needs a prompt.");
  const url = "https://github.com/" + repo;
  const pr = Number(String(a.pr || "").replace(/^#/, ""));
  const repos = [pr > 0 ? { url, prUrl: url + "/pull/" + pr } : { url, startingRef: text(a.branch, 200) || "main" }];
  const res = await ctx.fetch(CURSOR_AGENTS, {
    method: "POST",
    headers: { Authorization: "Bearer " + key, "Content-Type": "application/json" },
    body: JSON.stringify({ name: text(a.name, 80) || "Jarvis fix" + (pr > 0 ? " #" + pr : ""), prompt: { text: prompt }, repos, autoCreatePR: true })
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error("Cursor refused the agent (" + res.status + "): " + text(data.message || data.error || "", 200));
  const agent = data.agent || data;
  const id = String(agent.id || "");
  return { ok: true, id, message: "Started Cursor agent " + (id || "") + ".", url: agent.url || (agent.target && agent.target.url) || (id ? "https://cursor.com/agents?id=" + encodeURIComponent(id) : "https://cursor.com/agents") };
}

// The ISO week in Bogotá (UTC-5 all year), so Sunday evening is still that week.
function isoWeek(t) {
  const d = new Date(t - 5 * 3600000);
  const day = (d.getUTCDay() + 6) % 7;
  const thursday = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - day + 3));
  const first = new Date(Date.UTC(thursday.getUTCFullYear(), 0, 4));
  const week = 1 + Math.round(((thursday - first) / 86400000 - 3 + ((first.getUTCDay() + 6) % 7)) / 7);
  return thursday.getUTCFullYear() + "-W" + String(week).padStart(2, "0");
}

/* args.summary: the source's compact numbers now (jarvis.js githubAsk). */
async function retro(ctx, args) {
  if (!ctx.gemini) throw new Error("GEMINI_API_KEY is not set.");
  const now = ctx.now || Date.now();
  const days = [];
  for (let i = 7; i >= 1; i -= 1) {
    const day = new Date(now - i * 86400000).toISOString().slice(0, 10);
    const snap = await ctx.db.collection("jarvis_github_days").doc(day).get().catch(() => null);
    if (snap && snap.exists) days.push(snap.data());
  }
  const week = isoWeek(now);
  const out = await ctx.gemini([
    "Write Carlos's weekly GitHub retro for " + week + ": what shipped, CI health and flakiness, PR flow, the board, risks, and the three things to change next week.",
    "Plain text, short paragraphs, under 250 words. Use only these numbers.",
    "Last 7 days (one row a day): " + JSON.stringify(days).slice(0, 8000),
    "Now: " + JSON.stringify((args && args.summary) || {}).slice(0, 8000)
  ].join("\n"), 1400);
  const row = { week, text: block(String(out || "").trim(), 6000), days: days.length, at: new Date(now).toISOString() };
  await ctx.db.collection("jarvis_github_weekly").doc(week).set(row);
  return { ok: true, week, text: row.text, message: "Weekly GitHub retro for " + week + "." };
}

const when = (v) => (typeof v === "number" ? (v > 0 ? new Date(v < 1e12 ? v * 1000 : v).toISOString() : "") : iso(v));
const flag = (v) => (v === null || v === undefined ? null : !!v);

function cleanRate(r) {
  if (!r || typeof r !== "object") return null;
  return { used: num(r.used), limit: num(r.limit), reset: when(r.reset) };
}

// Marks the queue items the Mac ran; returns how many it found.
async function markResults(db, results, now) {
  let marked = 0;
  for (const r of (Array.isArray(results) ? results : []).slice(0, 50)) {
    const id = String((r && r.id) || "").replace(/[^a-f0-9]/g, "").slice(0, 24);
    if (!id) continue;
    try {
      await db.collection("jarvis_github_local_queue").doc(id).update({ status: r.status === "done" ? "done" : "failed", result: text(r.result, 300), doneAt: new Date(now).toISOString() });
      marked += 1;
    } catch (error) { /* gone or never queued */ }
  }
  return marked;
}

/* The Mac uploader's report (scripts/github-local-report.js); rateHistory keeps one graphql point an hour. A
   resultsOnly post, sent right after the Mac runs queued items, only marks them and leaves the report alone. */
async function localIngest(db, body, now) {
  const b = body || {};
  if (b.resultsOnly) return Object.assign({ ok: true, marked: await markResults(db, b.results, now) }, await localReply(db));
  const ref = db.collection("jarvis_github_local").doc("latest");
  const prev = await ref.get().catch(() => null);
  const history = ((prev && prev.exists && prev.data().rateHistory) || []).filter((p) => p && p.hour);
  const rate = { graphql: cleanRate((b.rate || {}).graphql), core: cleanRate((b.rate || {}).core) };
  const hour = new Date(now).toISOString().slice(0, 13) + ":00:00.000Z";
  const rateHistory = !rate.graphql || rate.graphql.used === null ? history.slice(-RATE_POINTS)
    : history.filter((p) => p.hour !== hour).concat([{ hour, graphql: rate.graphql.used, limit: rate.graphql.limit }]).sort((x, y) => x.hour.localeCompare(y.hour)).slice(-RATE_POINTS);
  const list = (v, n) => (Array.isArray(v) ? v : []).slice(0, n);
  const c = b.cost || {};
  const row = {
    at: new Date(now).toISOString(), clientAt: iso(b.at), host: text(b.host, 80), root: text(b.root, 300),
    errors: list(b.errors, 10).map((e) => text(e, 200)).filter(Boolean),
    worktrees: list(b.worktrees, 80).filter((w) => w && typeof w === "object").map((w) => ({ path: text(w.path, 300), branch: text(w.branch, 200), head: text(w.head, 40),
      detached: !!w.detached, prunable: !!w.prunable, locked: !!w.locked, chat: text(w.chat, 80), heartbeat: when(w.heartbeat), alive: !!w.alive,
      dirty: typeof w.dirty === "number" ? w.dirty > 0 : flag(w.dirty) })).filter((w) => w.path),
    usage: list(b.usage, 500).filter((u) => u && typeof u === "object").map((u) => ({ start: iso(u.start), end: iso(u.end), ticket: text(u.ticket, 20), title: text(u.title, 160), chat: text(u.chat, 80) })).filter((u) => u.start),
    cost: { cycleStart: iso(c.cycleStart), onDemandUsd: num(c.onDemandUsd), limitUsd: num(c.limitUsd), eventsFile: text(c.eventsFile, 120),
      tickets: list(c.tickets, 300).map((t) => ({ ticket: text(t && t.ticket, 20), costUsd: num(t && t.costUsd) })).filter((t) => t.ticket) },
    rate, rateHistory
  };
  await ref.set(row);
  return Object.assign({ ok: true, marked: await markResults(db, b.results, now) }, await localReply(db));
}

async function localReply(db) {
  const snap = await db.collection("jarvis_github_local_queue").where("status", "==", "queued").limit(20).get().catch(() => null);
  return { ok: true, queue: snap ? snap.docs.map((doc) => doc.data()).filter((d) => d.id).map((d) => ({ id: d.id, action: d.action, target: d.target })) : [] };
}

/* For the Mac uploader: one queued job per action and target; one already done or failed is not queued again. */
async function queueLocal(db, action, target, now) {
  if (!QUEUE_ACTIONS.includes(action)) throw new Error("The Mac cannot do " + action + ".");
  const t = text(target, 300);
  if (action === "remove-worktree" && !/(^|\/)\.worktrees\/[\w.-]+$/.test(t) && !/^[\w.-]+$/.test(t)) throw new Error("Only a worktree under .worktrees/ can be removed.");
  const id = crypto.createHash("sha1").update(action + "|" + t).digest("hex").slice(0, 24);
  const ref = db.collection("jarvis_github_local_queue").doc(id);
  try {
    await ref.create({ id, action, target: t, status: "queued", result: "", at: new Date(now).toISOString(), doneAt: "" });
    return { ok: true, id, message: "Queued for the Mac: " + action + " " + t + "." };
  } catch (error) {
    const snap = await ref.get().catch(() => null);
    const d = snap && snap.exists ? snap.data() : null;
    if (!d) throw error;
    return { ok: d.status !== "failed", id, message: action + " " + t + " is already " + d.status + (d.result ? ": " + d.result : "") + "." };
  }
}

/* github-act's one argument shape, from the web ({items}, {branches}, {path, branch}, {pr}, target = the button's label),
   the app ({target: "all" | "merged" | <branch> | <worktree path> | <number>, dir}), a proposal (target = its key's tail)
   and the countdown (its payload). Named fields win over target. -> { number, numbers, items, branches, sha, path, dir }
   plus the rest; a list left null means every item the github-work source has for the action. */
function actArgs(action, body) {
  const b = Object.assign({}, body || {});
  const t = b.target === undefined || b.target === null ? "" : String(b.target).trim();
  const wide = !t || t === "all" || t === "merged";
  const n = (v) => { const x = Number(String(v === undefined || v === null ? "" : v).trim().replace(/^#/, "")); return Number.isInteger(x) && x > 0 ? x : 0; };
  const one = n(b.number) || n(b.pr) || n(b.issue) || (wide ? 0 : n(t));
  const out = Object.assign(b, { number: one || null });
  if (action === "gh-board-sync") {
    const items = (Array.isArray(b.items) ? b.items : []).filter((d) => d && n(d.number) && d.should).map((d) => ({ number: n(d.number), should: String(d.should), item: d.item || undefined }));
    out.items = items.length ? items : one && b.should ? [{ number: one, should: String(b.should), item: b.item || undefined }] : null;
  } else if (action === "gh-update-pr" || action === "gh-orphan-ticket") {
    const list = (Array.isArray(b.numbers) ? b.numbers : []).map(n).filter(Boolean);
    out.numbers = list.length ? list : one ? [one] : null;
  } else if (action === "gh-delete-branch") {
    const named = (v) => String(v && v.name ? v.name : v || "").trim();
    const list = (Array.isArray(b.branches) ? b.branches : []).map(named).filter(Boolean);
    const single = named(b.branch) || (!wide && /^[\w./-]+$/.test(t) ? t : "");
    out.branches = list.length ? list : single ? [single] : null;
  } else if (action === "gh-revert") {
    const sha = String(b.sha || (/^[0-9a-f]{7,40}$/i.test(t) ? t : "")).toLowerCase();
    out.sha = sha || null;
  } else if (action === "gh-remove-worktree") {
    const path = String(b.path || (t.includes("/") ? t : "")).trim();
    const dir = String(b.dir || (path ? path.split("/").pop() : !wide && /^[\w.-]+$/.test(t) ? t : "")).trim();
    Object.assign(out, { path: path || null, dir: dir || null });
  }
  return out;
}

module.exports = {
  REPO, BOARD, COLUMNS, MERGE_LABEL, NO_CURSOR_KEY, CATEGORIES, boardSync, updatePr, mergePr, revert, deleteBranch, closeIssue, orphanTicket,
  diagnose, launchAgent, retro, localIngest, localReply, queueLocal, actArgs, logExcerpt, parseDiag, diagPrompt, isoWeek, areaOf,
  _reset: () => { statusOptions = null; }
};
