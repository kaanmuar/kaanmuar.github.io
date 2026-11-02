#!/usr/bin/env node
// The daily fix of the bugs the check of failed URL reviews files (#320), scripts first (#1982). scripts/fix-review-failures.sh runs it
// at 07:30 in a clean clone of main, after fileReviewFailureBugs (07:05) has filed and commented the day's runs.
//   1. A bug with an open PR, or no new runs since the last daily fix comment, is skipped.
//   2. A bug whose new runs the filer's triage marks as all the site's own state gets a comment and stays in Backlog.
//   3. The rest go to one Cursor agent (Auto), which only writes the fix and opens the PR. Over 70% of the Cursor plan, or when Cursor
//      refuses the run, they get the `needs-agent` label instead, which Jarvis raises as an alert, and wait for the next morning.
//   4. For each PR the agent opened, this script waits for CI, merges, deploys the review functions and closes the bug.
//   node scripts/fix-review-failures.js [--dry-run]    --dry-run prints the triage and changes nothing
// Issues and PRs go through REST; only board moves use GraphQL, via scripts/ticket.sh.
const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync, spawnSync } = require("child_process");
const { SITE_REASONS } = require("../functions/url-review-failures");

const ROOT = path.resolve(__dirname, "..");
const R = "repos/kaanmuar/kaanmuar.github.io";
const HOME = os.homedir();
const USAGE = process.env.PREFLIGHT_USAGE || path.join(HOME, "Library/Application Support/Cursor/AgentStores/cursor_agent_stores/u452212433/files/cursor-usage");
const MAIN = process.env.MAIN_CHECKOUT || path.join(HOME, "Documents/GitHub/kaanmuar.github.io");
const FILED = "by the daily check of failed URL reviews";
const MARK = "<!-- daily-fix -->";
const TRIAGE = /<!-- review-triage (\{.*?\}) -->/;
const LABEL = "needs-agent";
const PLAN_LIMIT = 70;
const MODEL = "auto";
const REFUSED = /ActionRequiredError|usage is off|balance is used up/i;
const DEPLOY = ["reviewUrl", "reviewBrowser", "diagnoseReviewFailures", "rerunReviewFailures", "fileReviewFailureBugs"].map((name) => "functions:" + name).join(",");

const plural = (count, word) => count + " " + word + (count === 1 ? "" : "s");
const day = (at) => String(at || "").slice(0, 10);

// The newest daily fix comment settles every run filed before it; the comments the old agent wrote start with "Daily fix agent".
function triage(bug, comments, prs) {
  const pr = (prs || []).find((row) => new RegExp("^[\\w-]+/" + bug.number + "-").test(row.head));
  if (pr) return { action: "skip", why: "PR #" + pr.number + " is open" };
  const entries = [{ at: bug.created_at, body: bug.body || "" }].concat((comments || []).map((row) => ({ at: row.created_at, body: row.body || "" })));
  const since = entries.filter((row) => row.body.includes(MARK) || /^Daily fix agent\b/.test(row.body)).map((row) => row.at).sort().pop() || "";
  const fresh = entries.filter((row) => row.at > since);
  const marks = fresh.map((row) => {
    try { return JSON.parse((row.body.match(TRIAGE) || [])[1]); } catch (error) { return null; }
  }).filter(Boolean);
  // Runs filed before the filer wrote the triage marker are left alone on a bug a daily fix already judged, and are all ours on one it never saw.
  const unmarked = fresh.filter((row) => !TRIAGE.test(row.body)).map((row) => Number((row.body.match(/^(\d+) (?:more )?URL review runs? failed with the cause class/m) || [])[1]) || 0).filter(Boolean);
  if (!marks.length && unmarked.length && !since) {
    const runs = unmarked.reduce((sum, count) => sum + count, 0);
    return { action: "agent", why: "no daily fix has looked at it yet", runs, ours: runs, site: {}, since };
  }
  if (!marks.length) return { action: "skip", why: "no new runs" + (since ? " since " + day(since) : "") + (unmarked.length ? " (" + plural(unmarked.length, "update") + " filed before the triage marker)" : "") };
  const site = {};
  marks.forEach((mark) => Object.entries(mark.site || {}).forEach(([key, count]) => { site[key] = (site[key] || 0) + count; }));
  const runs = marks.reduce((sum, mark) => sum + (Number(mark.runs) || 0), 0);
  const ours = marks.reduce((sum, mark) => sum + (Number(mark.ours) || 0), 0);
  return { action: ours ? "agent" : "site", why: ours ? plural(ours, "run") + " may be ours to fix" : "every new run is the site's own state", runs, ours, site, since };
}

function siteComment(result, today) {
  const reasons = Object.entries(result.site).map(([key, count]) => plural(count, "run") + " " + (SITE_REASONS[key] || key)).join(", ");
  const one = result.runs === 1;
  return "Daily fix, " + today + ": " + (one ? "the new run" : "the " + result.runs + " new runs") + (result.since ? " since " + day(result.since) : "")
    + (one ? " is" : " are all") + " the site's own state (" + reasons + "), so our code cannot fix " + (one ? "it" : "them")
    + ". The bug stays in Backlog; no agent ran.\n\n" + MARK;
}

// A cache from an ended billing cycle, or older than two days, is unknown: the agent starts, and a refused run is held back after all.
function planPercent(cache, now) {
  const data = (cache && cache.data) || {};
  const pct = data.individualUsage && data.individualUsage.plan && data.individualUsage.plan.totalPercentUsed;
  const at = Number(cache && cache.at) || 0;
  const written = at < 1e12 ? at * 1000 : at;
  if (typeof pct !== "number" || Date.parse(data.billingCycleEnd) <= now || written < now - 2 * 86400000) return null;
  return pct;
}

function agentPrompt(queue, pack) {
  return [
    "You run unattended on the owner's Mac for the daily fix of failed URL reviews (#320, #1982). Nobody will answer questions: decide, act, and finish. The repo is kaanmuar/kaanmuar.github.io and this checkout is a clean `main`.",
    "A script already triaged the open failure bugs and commented on the ones that are only the site's own state. After you, it waits for CI, merges, deploys the review functions, closes the bug, moves the board and writes the work log. Your part is the code.",
    "",
    "Bugs whose newest runs may be ours to fix:",
    ...queue.map((row) => "- #" + row.bug.number + " " + row.bug.title + " (" + plural(row.ours, "run") + " of " + row.runs + " since " + (day(row.since) || "it was filed") + ")"),
    "",
    "For each bug:",
    "1. Read it and its comments since the last daily fix comment: `gh api " + R + "/issues/<n>` and `gh api " + R + "/issues/<n>/comments`. The runs marked \"Site's own state\" are settled; look at the others, with `functions/url-review-failures.js` and the review code it calls.",
    "2. If those runs are the site's own state after all (a real error page, a site that refuses every client, a broken certificate), comment on the bug through REST with the evidence and why our code cannot fix it, and end the comment with the line `" + MARK + "`. Change nothing else.",
    "3. If our code can fix it, make one PR per cause class, on a branch named `fix/<n>-<short-slug>` off `main` (the script finds the PR by that name):",
    "   - Change the review code and its tests in `tests/unit/` only. `npm ci`, then `npm run test:review` must pass.",
    "   - Push and open the PR through REST: `gh api " + R + "/pulls -f title=... -f head=<branch> -f base=main -f body=...`, with \"Bug #<n>, from the daily check of failed URL reviews (#320).\" in the body.",
    "   - Then add a row to `FIXES` in `functions/url-review-failures.js` with that cause, `at` set to now (UTC), `ref` the new PR's number and a plain label, so the failed runs it covers are re-run. Commit and push it to the same branch.",
    "4. Do not watch CI, merge, deploy, close or move the bug, or write the work log.",
    "5. Log any other bug or slip you find as its own issue tied to #320, per `.cursor/rules/scrum-board.mdc`, through REST.",
    "6. End with one line per bug: `#<n>: PR #<pr>` or `#<n>: commented`.",
    pack ? "\n" + pack : ""
  ].join("\n");
}

function ciPrompt(bug, pr, failed) {
  return [
    "You run unattended on the owner's Mac for the daily fix of failed URL reviews (#320, #1982). CI failed on PR #" + pr.number + " (branch `" + pr.head + "`), the fix for bug #" + bug.number + ".",
    "Check out that branch, fix what failed, run `npm ci` and `npm run test:review`, and push to the same branch. Do not merge, deploy or close anything. What failed:",
    "```", failed.slice(-6000), "```"
  ].join("\n");
}

// --- side effects -----------------------------------------------------------------------------------------------

const run = (cmd, args, opts) => execFileSync(cmd, args, Object.assign({ cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], maxBuffer: 64 << 20 }, opts)).trim();
const api = (args) => run("gh", ["api"].concat(args));
const lines = (out) => out.split("\n").filter(Boolean).map((line) => JSON.parse(line));

function openBugs() {
  return lines(api(["--paginate", R + "/issues?state=open&labels=bug,area:be&per_page=100", "-q",
    ".[] | select(.pull_request == null) | {number, title, body, created_at, labels: [.labels[].name]} | tojson"]))
    .filter((bug) => String(bug.body || "").includes(FILED));
}

const commentsOf = (n) => lines(api(["--paginate", R + "/issues/" + n + "/comments?per_page=100", "-q", ".[] | {created_at, body} | tojson"]));
const openPrs = () => lines(api(["--paginate", R + "/pulls?state=open&per_page=100", "-q", ".[] | {number, head: .head.ref, sha: .head.sha} | tojson"]));
const comment = (n, body) => api([R + "/issues/" + n + "/comments", "-f", "body=" + body, "--silent"]);

function label(bug, on) {
  const has = bug.labels.includes(LABEL);
  if (on && !has) api([R + "/issues/" + bug.number + "/labels", "-f", "labels[]=" + LABEL, "--silent"]);
  if (!on && has) api(["-X", "DELETE", R + "/issues/" + bug.number + "/labels/" + LABEL, "--silent"]);
}

function logRow(start, ticket, title, chat, notes) {
  const cell = (value) => /[",\n]/.test(value) ? '"' + String(value).replace(/"/g, '""') + '"' : String(value);
  const row = [start.toISOString().replace(/\.\d+Z$/, "Z"), new Date().toISOString().replace(/\.\d+Z$/, "Z"), ticket, title, chat, notes].map(cell).join(",");
  try { fs.appendFileSync(path.join(USAGE, "work-log.csv"), row + "\n"); } catch (error) { console.log("Work log not written: " + error.message); }
}

function preflightPack(prompt) {
  try { return run("node", [".cursor/hooks/preflight.js", "plan", prompt], { timeout: 30000, env: Object.assign({}, process.env, { PREFLIGHT_MODEL: MODEL }) }); } catch (error) { return ""; }
}

function agent(prompt) {
  const out = spawnSync("cursor-agent", ["-p", "--force", "--trust", "--model", MODEL, "--workspace", ROOT, "--output-format", "text", prompt],
    { cwd: ROOT, encoding: "utf8", timeout: 90 * 60000, maxBuffer: 64 << 20 });
  const text = (out.stdout || "") + (out.stderr || "");
  console.log(text.trim() || "(the agent printed nothing)");
  return text;
}

function ciWait(pr) {
  try { return { ok: true, out: run("scripts/ci-wait.sh", [String(pr)], { timeout: 75 * 60000 }) }; } catch (error) { return { ok: false, out: String(error.stdout || error.message) }; }
}

function deploy() {
  for (const file of ["functions/.env", "functions/.secret.local"]) {
    const from = path.join(MAIN, file);
    if (fs.existsSync(from) && !fs.existsSync(path.join(ROOT, file))) fs.symlinkSync(from, path.join(ROOT, file));
  }
  run("npm", ["ci", "--prefix", "functions", "--no-audit", "--no-fund"], { timeout: 15 * 60000 });
  run("npx", ["-y", "firebase-tools", "deploy", "--only", DEPLOY], { timeout: 30 * 60000 });
}

function ship(item, pr, budgetOk) {
  const n = item.bug.number;
  try { run("scripts/ticket.sh", ["move", String(n), "dev"]); } catch (error) { console.log("#" + n + ": not moved to Dev: " + error.message); }
  let ci = ciWait(pr.number);
  if (!ci.ok && budgetOk()) {
    agent(ciPrompt(item.bug, pr, ci.out));
    ci = ciWait(pr.number);
  }
  if (!ci.ok) {
    const body = "Daily fix: CI still fails on #" + pr.number + " after one retry, so it is left open for a person.\n\n```\n" + ci.out.slice(-3000) + "\n```";
    comment(pr.number, body);
    comment(n, body);
    return "PR #" + pr.number + " left open: CI fails";
  }
  try {
    api(["-X", "PUT", R + "/pulls/" + pr.number + "/merge", "-f", "merge_method=squash", "--silent"]);
  } catch (error) {
    comment(n, "Daily fix: CI passed on #" + pr.number + ", but it could not be merged (" + String(error.stderr || error.message).trim().slice(0, 300) + "). Left open.");
    return "PR #" + pr.number + " not merged";
  }
  try { api(["-X", "DELETE", R + "/git/refs/heads/" + pr.head, "--silent"]); } catch (error) {}
  run("git", ["fetch", "-q", "origin"]);
  run("git", ["checkout", "-q", "-B", "main", "origin/main"]);
  try {
    deploy();
  } catch (error) {
    comment(n, "Daily fix: #" + pr.number + " is merged, but the deploy failed, so the bug stays open. Deploy from the repo root with `npx -y firebase-tools deploy --only " + DEPLOY + "`.\n\n```\n" + String(error.stderr || error.stdout || error.message).slice(-2000) + "\n```");
    return "PR #" + pr.number + " merged, deploy failed";
  }
  run("scripts/ticket.sh", ["done", String(n), String(pr.number)]);
  return "fixed in #" + pr.number + ", merged and deployed";
}

function main() {
  const dry = process.argv.includes("--dry-run");
  const today = new Date().toISOString().slice(0, 10);
  const prs = openPrs();
  const plan = openBugs().map((bug) => Object.assign({ bug }, triage(bug, commentsOf(bug.number), prs)));
  plan.forEach((row) => console.log("#" + row.bug.number + " " + row.action + ": " + row.why));
  if (dry) return;

  for (const row of plan.filter((item) => item.action === "site")) {
    const start = new Date();
    comment(row.bug.number, siteComment(row, today));
    label(row.bug, false);
    logRow(start, row.bug.number, row.bug.title, "daily-fix-script", "site's own state: " + plural(row.runs, "run") + ", commented; no agent");
  }

  const queue = plan.filter((item) => item.action === "agent");
  if (!queue.length) return console.log("No bug needs an agent today.");
  const budgetOk = () => {
    let cache = null;
    try { cache = JSON.parse(fs.readFileSync(path.join(USAGE, "quota-cache.json"), "utf8")); } catch (error) {}
    const pct = planPercent(cache, Date.now());
    return pct == null || pct < PLAN_LIMIT;
  };
  const defer = (why) => {
    queue.forEach((row) => label(row.bug, true));
    console.log("Agent held back (" + why + "): " + queue.map((row) => "#" + row.bug.number).join(", ") + " labelled " + LABEL + ".");
  };
  if (!budgetOk()) return defer("the Cursor plan is past " + PLAN_LIMIT + "%");

  const start = new Date();
  const prompt = agentPrompt(queue, "");
  const said = agent(agentPrompt(queue, preflightPack(prompt)));
  if (REFUSED.test(said)) return defer("Cursor refused the run");
  const after = openPrs();
  for (const row of queue) {
    label(row.bug, false);
    const pr = after.find((item) => new RegExp("^[\\w-]+/" + row.bug.number + "-").test(item.head));
    const note = pr ? ship(row, pr, budgetOk) : "no PR; see the agent's comment";
    console.log("#" + row.bug.number + ": " + note);
    logRow(start, row.bug.number, row.bug.title, "daily-fix-agent", note);
  }
}

if (require.main === module) main();
module.exports = { triage, siteComment, planPercent, agentPrompt, MARK };
