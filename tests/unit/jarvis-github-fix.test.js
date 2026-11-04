const test = require("node:test");
const assert = require("node:assert/strict");
const fix = require("../../functions/jarvis-github-fix");
const actions = require("../../functions/jarvis-actions");
const countdown = require("../../functions/jarvis-countdown");
const core = require("../../js/admin-jarvis-core.js");
const { fakeDb } = require("./fake-jarvis-db");

const R = "/repos/kaanmuar/kaanmuar.github.io";
const NOW = Date.parse("2026-11-02T15:00:00Z");
const res = (body, status) => ({ ok: (status || 200) < 400, status: status || 200, json: async () => body, text: async () => (typeof body === "string" ? body : JSON.stringify(body)) });

// routes: [[method, path or RegExp, (url, body) -> body | status(body, code)]]; every call lands in calls.
const status = (body, code) => ({ status: code, body, statusMarker: true });
function fakeFetch(routes) {
  const calls = [];
  const fetchImpl = async (url, init) => {
    const method = (init && init.method) || "GET";
    const body = init && init.body ? JSON.parse(init.body) : null;
    calls.push({ method, url, body });
    const path = String(url).replace("https://api.github.com", "");
    const hit = routes.find(([m, p]) => m === method && (p instanceof RegExp ? p.test(path) : p === path));
    if (!hit) return res({ message: "Not Found" }, 404);
    const out = hit[2](url, body);
    return out && out.statusMarker ? res(out.body, out.status) : res(out);
  };
  return { fetchImpl, calls };
}

const ctxOf = (f, extra) => Object.assign({ fetch: f.fetchImpl, env: {}, db: fakeDb(), now: NOW, github: async () => "tok" }, extra || {});

test("boardSync moves each drifted item to the column it should be in, with the Status option ids read once", async () => {
  fix._reset();
  const moves = [];
  const f = fakeFetch([
    ["GET", R + "/issues/5", () => ({ node_id: "I_5" })],
    ["POST", "/graphql", (url, body) => {
      if (/options/.test(body.query)) return { data: { node: { options: [{ id: "opt-dev", name: "Dev" }, { id: "opt-qa", name: "QA" }] } } };
      if (/addProjectV2ItemById/.test(body.query)) return { data: { addProjectV2ItemById: { item: { id: "PVTI_" + body.variables.c } } } };
      moves.push(body.variables);
      return { data: { updateProjectV2ItemFieldValue: { projectV2Item: { id: body.variables.i } } } };
    }]
  ]);
  const out = await fix.boardSync(ctxOf(f), { items: [{ number: 5, should: "QA" }, { number: 6, should: "Dev", item: "PVTI_known" }, { number: 7, should: "Nowhere" }] });
  assert.equal(out.ok, true);
  assert.deepEqual(moves.map((m) => [m.i, m.o]), [["PVTI_I_5", "opt-qa"], ["PVTI_known", "opt-dev"]]);
  assert.match(out.message, /#5 to QA, #6 to Dev; left #7: no column Nowhere/);
  assert.equal(f.calls.filter((c) => c.body && /options/.test(c.body.query)).length, 1);
  await assert.rejects(fix.boardSync(ctxOf(f), { items: [] }), /Nothing drifted/);
});

test("revert refuses a commit that is not main's HEAD and opens an exact revert PR for HEAD", async () => {
  const head = "b".repeat(40);
  const f = fakeFetch([
    ["GET", R, () => ({ default_branch: "main" })],
    ["GET", R + "/branches/main", () => ({ commit: { sha: head } })],
    ["GET", R + "/git/commits/" + head, () => ({ sha: head, message: "Speed up the hub (#2400)\n\nbody", parents: [{ sha: "p".repeat(40) }] })],
    ["GET", R + "/git/commits/" + "p".repeat(40), () => ({ tree: { sha: "tree-parent" } })],
    ["POST", R + "/git/commits", () => ({ sha: "c".repeat(40) })],
    ["POST", R + "/git/refs", () => ({ ref: "refs/heads/jarvis/revert-bbbbbbb" })],
    ["POST", R + "/pulls", () => ({ number: 901, html_url: "https://github.com/kaanmuar/kaanmuar.github.io/pull/901" })]
  ]);
  const no = await fix.revert(ctxOf(f), { sha: "aaaaaaa" });
  assert.equal(no.ok, false);
  assert.match(no.message, /not main's HEAD.*use a fix agent/);
  assert.equal(f.calls.filter((c) => c.method !== "GET").length, 0);

  const yes = await fix.revert(ctxOf(f), { sha: head.slice(0, 7), why: "Unit tests failed" });
  assert.equal(yes.ok, true);
  const commit = f.calls.find((c) => c.method === "POST" && c.url.endsWith("/git/commits")).body;
  assert.deepEqual([commit.tree, commit.parents], ["tree-parent", [head]]);
  const pr = f.calls.find((c) => c.url.endsWith("/pulls")).body;
  assert.equal(pr.head, "jarvis/revert-bbbbbbb");
  assert.match(pr.title, /^Revert Speed up the hub/);
  assert.match(pr.body, /#2526/);
  assert.match(pr.body, /Ticket: #2400/);
});

test("deleteBranch never deletes main or a branch with an open PR, and asks for Contents: write on a 403", async () => {
  const f = fakeFetch([
    ["GET", R, () => ({ default_branch: "main" })],
    ["GET", /\/pulls\?state=open&head=kaanmuar%3Afix%2Fopen/, () => [{ number: 12 }]],
    ["GET", /\/pulls\?state=open&head=/, () => []],
    ["DELETE", R + "/git/refs/heads/fix/merged", () => status({}, 204)]
  ]);
  const main = await fix.deleteBranch(ctxOf(f), { branch: "main" });
  assert.equal(main.ok, false);
  assert.match(main.message, /main: never deleted/);
  const out = await fix.deleteBranch(ctxOf(f), { branches: ["main", "fix/open", "fix/merged"] });
  assert.deepEqual(out.deleted, ["fix/merged"]);
  assert.match(out.message, /fix\/open: PR #12 is open/);
  assert.equal(f.calls.filter((c) => c.method === "DELETE").length, 1);

  const denied = fakeFetch([
    ["GET", R, () => ({ default_branch: "main" })],
    ["GET", /\/pulls\?/, () => []],
    ["DELETE", /git\/refs/, () => status({ message: "Resource not accessible by integration" }, 403)]
  ]);
  await assert.rejects(fix.deleteBranch(ctxOf(denied), { branch: "fix/merged" }), /Contents: write/);
});

test("diagnose reads the first failed job's log around its error, parses Gemini's JSON and stores it by run", async () => {
  const log = Array.from({ length: 400 }, (_, i) => "2026-11-02T14:00:00.0000000Z line " + i).concat(["2026-11-02T14:01:00.0000000Z ##[error] expected 3 to equal 4 at tests/unit/hub.test.js:42"]).join("\n");
  const f = fakeFetch([
    ["GET", R + "/actions/runs/77", () => ({ id: 77, name: "Unit tests", head_branch: "feat/x", head_sha: "abc1234def", event: "pull_request", run_attempt: 1, html_url: "https://github.com/run/77" })],
    ["GET", R + "/actions/runs/77/jobs?filter=latest&per_page=100", () => ({ jobs: [{ id: 5, name: "lint", conclusion: "success" }, { id: 9, name: "unit", conclusion: "failure", html_url: "https://github.com/job/9", steps: [{ name: "npm test", conclusion: "failure" }] }] })],
    ["GET", R + "/actions/jobs/9/logs", () => log]
  ]);
  let prompt = "";
  const gemini = async (p) => { prompt = p; return "```json\n{\"cause\":\"hub.test.js expects 3 cards but the hub renders 4.\",\"category\":\"test\",\"fix\":\"Update the expectation.\",\"confidence\":0.9,\"action\":\"gh-agent\",\"prompt\":\"Fix tests/unit/hub.test.js:42 ...\"}\n```"; };
  const ctx = ctxOf(f, { gemini });
  const out = await fix.diagnose(ctx, { run: 77 });
  assert.equal(out.ok, true);
  assert.match(prompt, /##\[error\] expected 3 to equal 4/);
  assert.doesNotMatch(prompt, /line 10\n/);
  assert.doesNotMatch(prompt, /2026-11-02T14/);
  const saved = ctx.db.doc("jarvis_github_diag", "77");
  assert.deepEqual([saved.workflow, saved.branch, saved.category, saved.action, saved.confidence, saved.job], ["Unit tests", "feat/x", "test", "gh-agent", 0.9, "unit"]);
  assert.match(saved.prompt, /hub\.test\.js:42/);
  assert.throws(() => fix.parseDiag("no json here"), /not JSON/);
  assert.deepEqual([fix.parseDiag("{\"cause\":\"Runner lost.\",\"category\":\"weird\",\"action\":\"x\",\"confidence\":7}").category, fix.parseDiag("{\"cause\":\"Runner lost.\",\"category\":\"infra\"}").action], ["code", "rerun-ci"]);
  assert.equal(fix.parseDiag("{\"cause\":\"Runner lost.\",\"category\":\"infra\",\"prompt\":\"x\"}").prompt, "");
});

test("launchAgent without CURSOR_API_KEY says where to get it, and with it starts an agent on the branch or the PR", async () => {
  const f = fakeFetch([]);
  await assert.rejects(fix.launchAgent(ctxOf(f), { prompt: "Fix the failing hub test in tests/unit/hub.test.js." }), (e) => e.message === fix.NO_CURSOR_KEY && /Cursor Dashboard > API Keys/.test(e.message));
  const sent = [];
  const cursor = async (url, init) => { sent.push({ url, body: JSON.parse(init.body), auth: init.headers.Authorization }); return res({ id: "bc-1", url: "https://cursor.com/agents/bc-1" }); };
  const ctx = ctxOf({ fetchImpl: cursor }, { env: { CURSOR_API_KEY: "key_1" } });
  const out = await fix.launchAgent(ctx, { prompt: "Fix the failing hub test in tests/unit/hub.test.js.", branch: "feat/x" });
  assert.deepEqual([out.ok, out.id, out.url], [true, "bc-1", "https://cursor.com/agents/bc-1"]);
  assert.equal(sent[0].url, "https://api.cursor.com/v1/agents");
  assert.equal(sent[0].auth, "Bearer key_1");
  assert.deepEqual(sent[0].body.repos, [{ url: "https://github.com/kaanmuar/kaanmuar.github.io", startingRef: "feat/x" }]);
  assert.deepEqual([sent[0].body.prompt.text.slice(0, 7), sent[0].body.autoCreatePR], ["Fix the", true]);
  await fix.launchAgent(ctx, { prompt: "Resolve the conflicts in this PR, keep both sides.", pr: 44 });
  assert.deepEqual(sent[1].body.repos, [{ url: "https://github.com/kaanmuar/kaanmuar.github.io", prUrl: "https://github.com/kaanmuar/kaanmuar.github.io/pull/44" }]);
});

test("localIngest keeps a clean copy of the Mac's report, one GraphQL point an hour, and marks the queued jobs it ran", async () => {
  const db = fakeDb();
  const q = await fix.queueLocal(db, "remove-worktree", "/Users/Apple/repo/.worktrees/fix-1", NOW);
  assert.equal(q.ok, true);
  assert.equal((await fix.queueLocal(db, "remove-worktree", "/Users/Apple/repo/.worktrees/fix-1", NOW)).id, q.id);
  await assert.rejects(fix.queueLocal(db, "remove-worktree", "/Users/Apple/repo", NOW), /under \.worktrees/);
  assert.deepEqual((await fix.localReply(db)).queue, [{ id: q.id, action: "remove-worktree", target: "/Users/Apple/repo/.worktrees/fix-1" }]);

  const body = {
    host: "carlos-mac", at: "2026-11-02T14:59:00Z",
    worktrees: [{ path: "/Users/Apple/repo/.worktrees/fix-1", branch: "fix/1", head: "abc", locked: true, chat: "c1", heartbeat: "2026-11-02T14:58:00Z", dirty: 2, extra: "x" }, { branch: "no-path" }],
    usage: [{ start: "2026-11-02T13:00:00Z", end: "", ticket: "#2526", title: "Jarvis GitHub", chat: "c1" }],
    cost: { cycleStart: "2026-10-20", onDemandUsd: "12.5", limitUsd: 100, tickets: [{ ticket: "#2526", costUsd: 3.2 }] },
    rate: { graphql: { used: 1200, limit: 5000, reset: 1793631600 }, core: { used: 30, limit: 5000 } }
  };
  const first = await fix.localIngest(db, body, NOW);
  assert.deepEqual(first.queue.map((x) => x.id), [q.id]);
  const second = await fix.localIngest(db, Object.assign({}, body, { rate: { graphql: { used: 1500, limit: 5000 } }, results: [{ id: q.id, status: "done", result: "removed" }] }), NOW + 60000);
  assert.deepEqual([second.marked, second.queue], [1, []]);
  assert.equal(db.doc("jarvis_github_local_queue", q.id).status, "done");
  const latest = db.doc("jarvis_github_local", "latest");
  assert.equal(latest.worktrees.length, 1);
  assert.equal(latest.worktrees[0].extra, undefined);
  assert.deepEqual([latest.worktrees[0].dirty, latest.cost.onDemandUsd, latest.at], [true, 12.5, new Date(NOW + 60000).toISOString()]);
  assert.deepEqual(latest.rateHistory, [{ hour: "2026-11-02T15:00:00.000Z", graphql: 1500, limit: 5000 }]);
  await fix.localIngest(db, Object.assign({}, body, { rate: { graphql: { used: 200, limit: 5000 } } }), NOW + 3600000);
  assert.deepEqual(db.doc("jarvis_github_local", "latest").rateHistory.map((p) => p.graphql), [1500, 200]);
});

const WORK = {
  ok: true, needs: ["Give the qa-lab-agents app Dependabot alerts: read"], local: null,
  ci: {
    failing: [
      { id: 77, name: "Unit tests", branch: "feat/x", url: "u77", at: "2026-11-02T14:00:00Z", attempt: 1, pr: 13, sha: "abc1234", event: "pull_request", diag: { cause: "hub.test.js expects 3 cards.", category: "test", fix: "", confidence: 0.9, action: "gh-agent", prompt: "Fix it" } },
      { id: 78, name: "Deploy", branch: "main", url: "u78", at: "2026-11-02T14:30:00Z", attempt: 2, pr: null, sha: "def5678", event: "push", diag: null }
    ],
    flaky: { pct: 6, workflows: [{ name: "Smoke", pct: 22, runs: 18 }, { name: "Rare", pct: 50, runs: 2 }] }
  },
  prs: { items: [
    { number: 12, title: "Add the hub cards", author: "carlos", state: "clean", checks: "pass", ticket: null, updatedH: 5 },
    { number: 13, title: "Hub layout", author: "carlos", state: "behind", checks: "pass", ticket: 2400, updatedH: 30 },
    { number: 14, title: "Bump deps", author: "dependabot[bot]", bot: true, state: "dirty", checks: "fail", ticket: null, updatedH: 100 },
    { number: 15, title: "Draft", author: "carlos", state: "draft", checks: "pending", ticket: null, updatedH: 1 }
  ] },
  board: { wip: 18, wipLimit: 15, drift: [{ number: 5, title: "T5", column: "Dev", should: "QA", why: "its PR is open and green", url: "i5" }], aging: [{ number: 6, title: "T6", column: "QA", days: 9, url: "i6" }] },
  branches: { merged: [{ name: "fix/old", pr: 3, days: 4 }, { name: "fix/held", pr: 4, days: 1 }],
    worktrees: [{ path: "/r/.worktrees/fix-1", branch: "fix/1", alive: false, dirty: false, prState: "merged" }, { path: "/r/.worktrees/fix-held", branch: "fix/held", alive: true, dirty: false, prState: "merged" }] },
  security: { dependabot: { ok: true, open: 3, critical: 1, high: 1 }, codeScanning: { ok: false }, secrets: { ok: true, open: 0 } },
  budget: { kaanmuar: { graphql: { used: 4900, limit: 5000 } } },
  score: { overall: { value: 72, grade: "C" } },
  history: [{ day: "2026-11-01", score: 85 }, { day: "2026-11-02", score: 72 }]
};

test("briefing: the GitHub tab's lines come from external['github-work'], and their proposals carry the gh-* action and target", () => {
  const items = core.briefing({ products: {}, external: { "github-work": WORK } });
  const gh = items.filter((i) => i.product === "github");
  const by = (k) => gh.find((i) => i.key === k);
  ["gh:main-broken:def5678", "gh:security:dependabot", "gh:budget"].forEach((k) => assert.equal((by(k) || {}).level, "alert", k));
  ["gh:flaky:Smoke", "gh:diag:77", "gh:orphan-pr:12", "gh:drift:5", "gh:aging:6", "gh:wip", "gh:pr-conflict:14", "gh:pr-stale:14", "gh:needs:uploader", "gh:needs:give-the-qa-lab-agents-app-dependabot-alerts-read"]
    .forEach((k) => assert.equal((by(k) || {}).level, "warn", k));
  ["gh:pr-green:12", "gh:pr-behind:13", "gh:branch-merged", "gh:worktree-merged:fix-1", "gh:score"].forEach((k) => assert.equal((by(k) || {}).level, "info", k));
  assert.equal(by("gh:flaky:Rare"), undefined);
  assert.equal(by("gh:orphan-pr:14"), undefined);
  assert.equal(by("gh:worktree-merged:fix-held"), undefined);
  assert.match(by("gh:branch-merged").text, /1 merged branch is still on GitHub, such as fix\/old/);
  assert.equal(core.PRODUCTS.find((p) => p.key === "github").short, "GH");
  assert.deepEqual(jarvis().watchItems({ "github-work": WORK }).filter((i) => i.product === "github").map((i) => i.key).sort(), ["gh:budget", "gh:main-broken:def5678", "gh:security:dependabot"]);

  const proposals = core.proposalRules({ external: { "github-work": WORK } }, items);
  const run = (k) => core.proposalRun(proposals.find((p) => p.key === k));
  assert.deepEqual(run("gh:pr-green:12"), { action: "gh-merge-pr", key: "gh:pr-green:12", label: "Merge #12", target: "12" });
  assert.deepEqual(run("gh:main-broken:def5678"), { action: "gh-revert", key: "gh:main-broken:def5678", label: "Open a revert PR", target: "def5678" });
  assert.deepEqual(run("gh:drift"), { action: "gh-board-sync", key: "gh:drift", label: "Sync the board" });
  assert.equal(run("gh:diag:77").action, "gh-agent");
  assert.deepEqual(run("gh:flaky:Smoke"), { action: "rerun-ci", workflows: ["Smoke"], label: "Re-run Smoke" });
  assert.equal(proposals.find((p) => p.key === "gh:pr-green:12").tab, "github");
  const detail = core.briefDetail(by("gh:diag:77"), { external: { "github-work": WORK } });
  assert.ok(detail.facts.some((f) => f.label === "Cause"));
  assert.deepEqual(detail.actions[0], { id: "gh-agent", label: "Launch a fix agent", key: "gh:diag:77", target: "77" });
});

const jarvis = () => require("../../functions/jarvis");

function fakeOps(over) {
  const acted = [];
  const ops = Object.assign({
    held: async () => [], noticesLive: false, failedNotices: async () => [], noticeBudget: async () => 0, hubStale: async () => false, publishHub: async () => null,
    githubWork: async () => WORK,
    githubAct: async (action, args) => { acted.push([action, args]); return { detail: "did " + action }; }
  }, over || {});
  return { ops, acted };
}

test("the hourly pass syncs the board and files orphan tickets at once, queues the risky GitHub fixes, and never launches agents", async () => {
  const db = fakeDb();
  const { ops, acted } = fakeOps();
  const out = await actions.autoRun({ db, now: NOW, settings: {}, ops });
  assert.deepEqual(acted.map((a) => a[0]), ["gh-board-sync", "gh-orphan-ticket"]);
  assert.deepEqual(acted[0][1], { number: 5, should: "QA", item: undefined });
  assert.deepEqual(out.queued.map((r) => [r.action, r.target, r.kind]).sort(), [
    ["gh-delete-branch", "1 merged branch", "repo"], ["gh-remove-worktree", "fix-1", "repo"], ["gh-revert", "def5678", "code"], ["gh-update-pr", "#13", "repo"]
  ]);
  assert.ok(!acted.some((a) => a[0] === "gh-agent") && !out.queued.some((r) => r.action === "gh-agent"));
  assert.deepEqual(out.queued.find((r) => r.action === "gh-delete-branch").payload, { branches: ["fix/old"] });
  const msg = actions.pushMessage(out);
  assert.equal(msg.tab, "github");
  assert.match(msg.title, /^Jarvis fixed: 2 GitHub issues/);

  const again = await actions.autoRun({ db, now: NOW + 3600000, settings: {}, ops });
  assert.equal(acted.length, 2);
  assert.equal(again.queued.length, 0);

  const row = out.queued.find((r) => r.action === "gh-remove-worktree");
  const ran = await countdown.execute(row, ops, NOW);
  assert.deepEqual(acted[2], ["gh-remove-worktree", { path: "/r/.worktrees/fix-1", target: "fix-1" }]);
  assert.equal(ran.detail, "did gh-remove-worktree");
  assert.equal(countdown.resultMessage(Object.assign({}, row, { status: "done", result: "ok" })).title, "Jarvis fixed: remove the merged worktree");
});

test("a Gemini pick of a GitHub action runs only with an argument from the catalog, and the risky ones go on the countdown", () => {
  const catalog = { jobs: [], workflows: [], github: { drift: [5], behind: [13], merged: ["fix/old"] } };
  assert.equal(actions.pickOk({ action: "gh-board-sync", args: { number: 5 } }, catalog), true);
  assert.equal(actions.pickOk({ action: "gh-board-sync", args: { number: 9 } }, catalog), false);
  assert.equal(actions.pickOk({ action: "gh-delete-branch", args: { branch: "main" } }, catalog), false);
  assert.equal(actions.pickOk({ action: "gh-agent", args: {} }, catalog), false);
  assert.equal(actions.risky("gh-update-pr"), true);
  assert.equal(actions.risky("gh-board-sync"), false);
  assert.ok(Object.keys(actions.AI_CATALOG).includes("gh-revert"));
});

test("actArgs reads the web's and the app's github-act shapes the same way", () => {
  const pick = (action, body) => { const a = fix.actArgs(action, body); return { number: a.number, numbers: a.numbers, items: a.items, branches: a.branches, sha: a.sha, path: a.path, dir: a.dir }; };
  const keep = (o, keys) => keys.reduce((m, k) => { m[k] = o[k]; return m; }, {});
  // Web: named fields, target = the button's label.
  assert.deepEqual(pick("gh-board-sync", { items: [{ number: 12, should: "Done" }, { number: "#13", should: "QA" }, { number: 0, should: "Dev" }], target: "2 drifted cards" }).items,
    [{ number: 12, should: "Done", item: undefined }, { number: 13, should: "QA", item: undefined }]);
  assert.deepEqual(pick("gh-delete-branch", { branches: ["fix/1", { name: "fix/2" }], target: "2 merged branches" }).branches, ["fix/1", "fix/2"]);
  assert.equal(pick("gh-delete-branch", { branches: [], target: "0 merged branches" }).branches, null);
  assert.deepEqual(keep(pick("gh-remove-worktree", { path: "/Users/Apple/repo/.worktrees/fix-1", branch: "fix/1", target: "fix-1" }), ["path", "dir"]), { path: "/Users/Apple/repo/.worktrees/fix-1", dir: "fix-1" });
  assert.equal(pick("gh-merge-pr", { pr: 2511, target: "#2511" }).number, 2511);
  assert.deepEqual(pick("gh-update-pr", { pr: 2511, target: "#2511" }).numbers, [2511]);
  // App: everything in target.
  assert.deepEqual(keep(pick("gh-board-sync", { target: "all" }), ["items", "number"]), { items: null, number: null });
  assert.deepEqual(pick("gh-delete-branch", { target: "merged", branches: ["fix/1"] }).branches, ["fix/1"]);
  assert.equal(pick("gh-delete-branch", { target: "merged" }).branches, null);
  assert.deepEqual(pick("gh-delete-branch", { target: "fix/9-old" }).branches, ["fix/9-old"]);
  assert.deepEqual(keep(pick("gh-remove-worktree", { target: "/Users/Apple/repo/.worktrees/fix-1", dir: "fix-1" }), ["path", "dir"]), { path: "/Users/Apple/repo/.worktrees/fix-1", dir: "fix-1" });
  assert.equal(pick("gh-merge-pr", { target: 2511 }).number, 2511);
  assert.deepEqual(pick("gh-update-pr", { target: "2511" }).numbers, [2511]);
  // A proposal's key tail and the countdown's payload.
  assert.deepEqual(keep(pick("gh-board-sync", { key: "gh:drift:12", target: "12" }), ["items", "number"]), { items: null, number: 12 });
  assert.deepEqual(keep(pick("gh-remove-worktree", { target: "fix-1" }), ["path", "dir"]), { path: null, dir: "fix-1" });
  assert.deepEqual(pick("gh-update-pr", { numbers: [3, 4], target: "#3 and #4" }).numbers, [3, 4]);
  assert.equal(pick("gh-revert", { target: "ABC1234" }).sha, "abc1234");
  assert.equal(pick("gh-revert", { sha: "def5678", why: "red", target: "def5678" }).sha, "def5678");
  assert.equal(pick("gh-update-pr", { target: "all" }).numbers, null);
});

test("a resultsOnly post marks the queue at once and leaves the last report alone", async () => {
  const db = fakeDb();
  await fix.localIngest(db, { host: "mac", worktrees: [{ path: "/r/.worktrees/a", branch: "a", dirty: false }] }, NOW);
  const q = await fix.queueLocal(db, "remove-worktree", "/r/.worktrees/a", NOW);
  const out = await fix.localIngest(db, { resultsOnly: true, results: [{ id: q.id, status: "done", result: "Removed /r/.worktrees/a." }] }, NOW + 1000);
  assert.deepEqual([out.marked, out.queue], [1, []]);
  assert.equal(db.doc("jarvis_github_local_queue", q.id).status, "done");
  assert.deepEqual([db.doc("jarvis_github_local", "latest").worktrees.length, db.doc("jarvis_github_local", "latest").at], [1, new Date(NOW).toISOString()]);
});

test("the tablet's product list carries a GitHub row from github-work", () => {
  const row = core.wide({ products: {}, external: { "github-work": { ok: true, score: { overall: { value: 82, grade: "B" } }, ci: { passRate: 91 }, prs: { open: 4 }, issues: { openBugs: 2 },
    history: [{ day: "2026-11-01", score: 80 }, { day: "2026-11-02", score: null }, { day: "2026-11-03", score: 82 }] } }, briefing: [], now: new Date(NOW) }).products.find((p) => p.key === "github");
  assert.deepEqual(row.kpis.map((k) => [k.label, k.value]), [["Score", "82 B"], ["CI pass rate", "91%"], ["Open PRs", 4], ["Open bugs", 2]]);
  assert.deepEqual(row.series, { labels: ["2026-11-01", "2026-11-03"], values: [80, 82] });
});
