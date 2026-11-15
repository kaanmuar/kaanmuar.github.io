const test = require("node:test");
const assert = require("node:assert/strict");
const gh = require("../../functions/jarvis-github");
const { fakeDb } = require("./fake-jarvis-db");

const NOW = Date.parse("2026-11-03T18:00:00Z");
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const at = (hours) => new Date(NOW - hours * HOUR).toISOString();
const REPO = gh.REPO;

const run = (id, name, wf, branch, conclusion, hoursAgo, extra) => Object.assign({
  id, name, workflow_id: wf, path: ".github/workflows/" + name.toLowerCase().replace(/ /g, "-") + ".yml", head_branch: branch, head_sha: "sha" + id,
  status: "completed", conclusion, run_attempt: 1, event: "push", created_at: at(hoursAgo), run_started_at: at(hoursAgo - 1 / 60), updated_at: at(hoursAgo - 6 / 60),
  html_url: "https://github.com/" + REPO + "/actions/runs/" + id, pull_requests: []
}, extra);

const RUNS = [
  run(1, "CI", 1, "main", "success", 8),
  run(2, "CI", 1, "main", "failure", 6),
  run(3, "CI", 1, "main", "success", 5),
  run(5, "Tests", 2, "feat/2526-x", "success", 4, { head_sha: "shaD" }),
  run(4, "Tests", 2, "feat/2526-x", "failure", 3, { head_sha: "shaD", pull_requests: [{ number: 7 }] }),
  run(6, "Deploy Pages", 3, "main", "success", 2, { run_attempt: 2 }),
  run(7, "Lint", 4, "main", "cancelled", 1)
];

const BOARD = [
  { n: 10, state: "CLOSED", column: "Dev", days: 1 },
  { n: 11, state: "OPEN", column: "Done", days: 1 },
  { n: 12, state: "MERGED", column: "Backlog", days: 2, pr: true },
  { n: 13, state: "OPEN", column: "Dev", days: 10 },
  { n: 14, state: "CLOSED", column: "Done", days: 20 },
  { n: 15, state: "OPEN", column: null, days: 3 }
].map((i) => ({
  updatedAt: at(i.days * 24),
  fieldValueByName: i.column ? { name: i.column, updatedAt: at(i.days * 24) } : null,
  content: { __typename: i.pr ? "PullRequest" : "Issue", number: i.n, title: "Item " + i.n, url: "https://github.com/x/" + i.n, state: i.state, createdAt: at(30 * 24), closedAt: i.state === "CLOSED" ? at(i.days * 24) : null, mergedAt: i.state === "MERGED" ? at(i.days * 24) : null }
}));

const json = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => body });

// Answers by URL; `deny` lists path fragments that answer 403 (or 404 when the value is 404).
function fakeFetch(deny = {}, runs = RUNS) {
  const calls = [];
  const fn = async (url, init) => {
    calls.push(url);
    const u = new URL(url);
    const path = u.pathname;
    for (const key of Object.keys(deny)) if (path.includes(key)) return json(deny[key], { message: deny[key] === 404 ? "Not Found" : "Resource not accessible by integration" });
    if (path === "/graphql") {
      const body = JSON.parse(init.body);
      if (/ProjectV2/.test(body.query)) return json(200, { data: { node: { items: { pageInfo: { hasNextPage: false, endCursor: null }, nodes: BOARD } } } });
      const data = {};
      (body.query.match(/d\d+_\w+/g) || []).forEach((alias) => (data[alias] = { issueCount: /merged/.test(alias) ? 3 : 1 }));
      return json(200, { data });
    }
    if (path.endsWith("/actions/workflows/jarvis-android.yml/runs")) return json(200, { workflow_runs: [run(90, "Jarvis Android", 9, "main", "success", 30)] });
    if (path.endsWith("/actions/runs")) {
      const page = Number(u.searchParams.get("page") || 1);
      const created = u.searchParams.get("created") || "";
      let rows = runs;
      const range = /^(.+)\.\.(.+)$/.exec(created);
      if (range) rows = rows.filter((r) => Date.parse(r.created_at) >= Date.parse(range[1]) && Date.parse(r.created_at) <= Date.parse(range[2]));
      if (u.searchParams.get("branch")) rows = rows.filter((r) => r.head_branch === u.searchParams.get("branch")).slice(0, 1);
      return json(200, { total_count: rows.length, workflow_runs: page > 1 ? [] : rows });
    }
    if (path.endsWith("/pulls") && u.searchParams.get("state") === "open") return json(200, [{ number: 7, title: "Jarvis GitHub", html_url: "https://github.com/x/pull/7", user: { login: "kaanmuar", type: "User" }, head: { ref: "feat/2526-x", sha: "shaD", repo: { full_name: REPO } }, draft: false, body: "", created_at: at(100), updated_at: at(80), labels: [] }]);
    if (path.endsWith("/pulls") && u.searchParams.get("state") === "closed") return json(200, [{ number: 5, title: "Old", user: { login: "kaanmuar" }, head: { ref: "fix/5-old", repo: { full_name: REPO } }, created_at: at(30), merged_at: at(6), closed_at: at(6), updated_at: at(6) }]);
    if (/\/pulls\/7$/.test(path)) return json(200, { mergeable_state: "dirty", additions: 20, deletions: 5 });
    if (/\/check-runs$/.test(path)) return json(200, { check_runs: [{ id: 1, name: "t", status: "completed", conclusion: "failure" }] });
    if (path === "/installation/repositories") return json(200, { total_count: 2, repositories: [{ full_name: REPO, default_branch: "main", open_issues_count: 9, pushed_at: at(1) }, { full_name: "kaanmuar/qa-lab-outreach", default_branch: "main", open_issues_count: 0 }] });
    if (path === "/search/issues") return json(200, { total_count: 3, items: [{ number: 20, title: "BE: bug", created_at: at(500), html_url: "u", labels: [{ name: "bug" }, { name: "area:jarvis" }], sub_issues_summary: { total: 2, completed: 1 } }] });
    if (path.endsWith("/issues")) return json(200, [{ number: 21, title: "New", created_at: at(10), closed_at: at(2), labels: [{ name: "bug" }] }, { number: 7, pull_request: {}, created_at: at(10) }]);
    if (path.endsWith("/branches")) return json(200, [{ name: "main" }, { name: "feat/2526-x" }, { name: "fix/5-old" }]);
    if (path.includes("/compare/")) return json(200, { ahead_by: 2, behind_by: 3 });
    if (path.endsWith("/commits")) return json(200, [{ commit: { committer: { date: at(20 * 24) } } }]);
    if (path.endsWith("/secret-scanning/alerts")) return json(200, []);
    if (path === "/rate_limit") return json(200, { resources: { core: { used: 100, limit: 5000, reset: 1793750400 } } });
    if (path.endsWith("/releases")) return json(200, [{ tag_name: "v1", published_at: at(5), html_url: "r" }]);
    return json(404, { message: "Not Found " + path });
  };
  fn.calls = calls;
  return fn;
}

const ctx = (fetch, db, extra) => Object.assign({ fetch, db: db || fakeDb(), now: NOW, days: 7, settings: {}, thresholds: {}, github: async (scope) => "t-" + scope }, extra);

test("grade, doraLevel and xpLevel follow the contract bands", () => {
  assert.deepEqual([95, 90, 85, 70, 60, 59, null].map(gh.grade), ["A", "A", "B", "C", "D", "F", null]);
  assert.equal(gh.doraLevel("deployFreq", 2), "elite");
  assert.equal(gh.doraLevel("deployFreq", 0.2), "high");
  assert.equal(gh.doraLevel("deployFreq", 0.01), "low");
  assert.equal(gh.doraLevel("leadTimeH", 5), "elite");
  assert.equal(gh.doraLevel("leadTimeH", 48), "high");
  assert.equal(gh.doraLevel("changeFail", 5), "elite");
  assert.equal(gh.doraLevel("changeFail", 20), "medium");
  assert.equal(gh.doraLevel("changeFail", 40), "low");
  assert.equal(gh.doraLevel("mttrH", 0.5), "elite");
  assert.equal(gh.doraLevel("mttrH", 10), "high");
  assert.equal(gh.doraLevel("mttrH", null), null);
  assert.deepEqual(gh.xpLevel(0), { xp: 0, level: 1, nextAt: 50 });
  assert.deepEqual(gh.xpLevel(49), { xp: 49, level: 1, nextAt: 50 });
  assert.deepEqual(gh.xpLevel(50), { xp: 50, level: 2, nextAt: 200 });
  assert.deepEqual(gh.xpLevel(450), { xp: 450, level: 4, nextAt: 800 });
});

test("the ticket comes from the PR body, else from a branch segment", () => {
  assert.equal(gh.ticketOf("Fixes #2526 and #1", "x"), 2526);
  assert.equal(gh.ticketOf("", "feat/2526-jarvis-github"), 2526);
  assert.equal(gh.ticketOf("", "dependabot/npm/foo-1.2.3"), null);
});

test("a source run with mixed 200/403 answers fills needs and degrades only the denied parts", async () => {
  const fetch = fakeFetch({ "/dependabot/alerts": 403, "/code-scanning/alerts": 404, "/deployments": 403 });
  const out = await gh.source(ctx(fetch));
  assert.equal(out.ok, true);
  assert.equal(out.security.dependabot.ok, false);
  assert.equal(out.security.dependabot.need, "dependabot_alerts");
  assert.equal(out.security.codeScanning.need, "security_events");
  assert.equal(out.security.secrets.ok, true);
  assert.equal(out.deploys.ok, true);
  assert.deepEqual(out.deploys.environments, []);
  assert.deepEqual(out.access.wanted.sort(), ["dependabot_alerts", "deployments", "security_events"]);
  assert.ok(out.needs.some((n) => /Dependabot alerts: read/.test(n)));
  assert.ok(out.needs.some((n) => /Deployments: read/.test(n)));
  assert.ok(out.needs.some((n) => /only sees 2 repos/.test(n)));
  assert.ok(out.needs.some((n) => /github-local-report\.js --install/.test(n)));
  assert.equal(out.local, null);
  assert.equal(out.agents.ok, false);
  ["ci", "prs", "board", "issues", "branches", "android"].forEach((name) => assert.equal(out[name].ok, true, name + ": " + out[name].error));
  assert.deepEqual(out.access.repos, [REPO, "kaanmuar/qa-lab-outreach"]);
  assert.equal(out.repos.length, 2);
  assert.equal(out.repos[0].openPrs, 1);
  assert.equal(out.repos[0].openIssues, 8);
  assert.equal(out.budget.app.core.limit, 5000);
  assert.equal(out.score.areas.security.value, 100);
  assert.match(out.score.areas.security.why, /not readable: dependabot, codeScanning/);
  assert.ok(out.score.overall.value > 0);
  assert.equal(out.score.overall.grade, gh.grade(out.score.overall.value));
});

test("CI aggregates the pass rate, flaky runs and the failing list from the last 24 h", async () => {
  const out = await gh.source(ctx(fakeFetch()));
  const ci = out.ci;
  assert.equal(ci.runs, 7);
  assert.equal(ci.failed, 2);
  assert.equal(ci.passRate, 66.7);
  assert.equal(ci.flaky.pct, 33.3);
  assert.deepEqual(ci.flaky.workflows.map((w) => w.name).sort(), ["Deploy Pages", "Tests"]);
  assert.deepEqual(ci.failing.map((f) => [f.id, f.name, f.branch, f.pr]), [[4, "Tests", "feat/2526-x", 7]]);
  assert.equal(ci.workflows.find((w) => w.name === "CI").mainRed, false);
  assert.equal(ci.durMedS, 300);
  assert.equal(out.dora.mttrH.median, 1);
  assert.equal(out.dora.mttrH.level, "high");
  assert.equal(out.deploys.last[0].name, "Deploy Pages");
  assert.equal(out.prs.conflicts, 1);
  assert.equal(out.prs.red, 1);
  assert.equal(out.prs.items[0].ticket, 2526);
  assert.equal(out.prs.items[0].state, "dirty");
  assert.equal(out.prs.merged, 1);
  assert.equal(out.prs.leadMedH, 24);
  assert.deepEqual(out.branches.merged, [{ name: "fix/5-old", pr: 5, days: 0.3 }]);
  assert.equal(out.branches.ahead[0].name, "feat/2526-x");
  assert.equal(out.branches.stale, 1);
  assert.equal(out.issues.openBugs, 3);
  assert.deepEqual([out.issues.subIssues.parents, out.issues.subIssues.done, out.issues.subIssues.total], [1, 1, 2]);
});

test("a pull_request run on refs/pull/<n>/head names PR n, though GitHub lists no pull_requests for it", async () => {
  const out = await gh.source(ctx(fakeFetch({}, RUNS.concat([run(8, "CodeQL", 5, "refs/pull/2822/head", "failure", 1)]))));
  assert.equal(out.ci.failing.find((f) => f.id === 8).pr, 2822);
});

test("an unreadable PR list is read once more, then the PR part says so instead of a spread TypeError", async () => {
  const flaky = (bad) => {
    const base = fakeFetch();
    let left = bad;
    return async (url, init) => {
      const u = new URL(url);
      if (u.pathname.endsWith("/pulls") && u.searchParams.get("state") === "open" && left-- > 0) return { ok: true, status: 200, json: async () => { throw new SyntaxError("Unexpected end of JSON input"); } };
      return base(url, init);
    };
  };
  const once = await gh.source(ctx(flaky(1)));
  assert.deepEqual([once.prs.ok, once.prs.open], [true, 1]);
  const twice = await gh.source(ctx(flaky(2)));
  assert.equal(twice.prs.ok, false);
  assert.match(twice.prs.error, /GitHub sent no list for repos\/kaanmuar\/kaanmuar\.github\.io\/pulls \(page 1\)/);
});

test("a diagnosis in jarvis_github_diag is attached to its failing run", async () => {
  const db = fakeDb([{ _c: "jarvis_github_diag", run: 4, workflow: "Tests", cause: "a flaky selector", category: "test", fix: "wait for it", confidence: 0.8, action: "gh-agent", prompt: "Fix it", at: at(1) }]);
  const out = await gh.source(ctx(fakeFetch(), db));
  assert.equal(out.ci.failing[0].diag.cause, "a flaky selector");
  assert.equal(out.ai.diagnoses[0].run, 4);
  assert.equal(out.ai.retro, null);
});

test("each flaky workflow carries its newest failure, its failed run links and its failures page (#2808)", async () => {
  const db = fakeDb([{ _c: "jarvis_github_diag", run: 4, workflow: "Tests", cause: "a race in the fixture", category: "flaky", action: "rerun-ci", at: at(1) }]);
  const out = await gh.source(ctx(fakeFetch(), db));
  const tests = out.ci.flaky.workflows.find((w) => w.name === "Tests");
  assert.equal(tests.newest.id, 4);
  assert.equal(tests.newest.failed, true);
  assert.equal(tests.newest.pr, 7);
  assert.equal(tests.newest.diag.cause, "a race in the fixture");
  assert.equal(tests.failures, 1);
  assert.deepEqual(tests.links, ["https://github.com/" + REPO + "/actions/runs/4"]);
  assert.equal(tests.url, "https://github.com/" + REPO + "/actions/workflows/tests.yml?query=is%3Afailure");
  const pages = out.ci.flaky.workflows.find((w) => w.name === "Deploy Pages");
  assert.deepEqual([pages.newest.id, pages.newest.failed, pages.newest.attempt], [6, false, 2]);
});

test("security counts each kind by severity, repo and ecosystem, ages the open alerts, trends opened against fixed per week, links the Dependabot bump PR and breaks the score down (#2808)", async () => {
  const base = fakeFetch();
  const dep = (n, sev, pkg, eco, manifest, days, extra) => Object.assign({ number: n, state: "open", created_at: at(days * 24), html_url: "https://github.com/" + REPO + "/security/dependabot/" + n,
    dependency: { package: { name: pkg, ecosystem: eco }, manifest_path: manifest }, security_advisory: { severity: sev, summary: pkg + " is vulnerable" },
    security_vulnerability: { severity: sev, first_patched_version: { identifier: "2.0.0" }, vulnerable_version_range: "< 2.0.0" } }, extra);
  const asked = [];
  const fetch = async (url, init) => {
    const u = new URL(url);
    const state = u.searchParams.get("state");
    if (/alerts$/.test(u.pathname)) asked.push(u.pathname.split("/").slice(2, 4).join("/") + " " + state);
    if (u.pathname === "/repos/" + REPO + "/dependabot/alerts") return json(200, state === "open"
      ? [dep(2, "low", "left-pad", "npm", "package.json", 20), dep(1, "critical", "axios", "npm", "functions/package.json", 3), dep(3, "medium", "okhttp", "maven", "android/app/build.gradle", 10)]
      : [dep(9, "high", "lodash", "npm", "package.json", 12, { state: "fixed", fixed_at: at(24) }), dep(10, "low", "x", "npm", "package.json", 30, { state: "dismissed", dismissed_at: at(48) })]);
    if (u.pathname === "/repos/kaanmuar/qa-lab-outreach/dependabot/alerts") return json(200, state === "open" ? [dep(4, "high", "requests", "pip", "requirements.txt", 5)] : []);
    if (u.pathname === "/repos/" + REPO + "/code-scanning/alerts") return json(200, state === "open"
      ? [{ number: 7, state: "open", created_at: at(48), html_url: "cs7", rule: { severity: "warning", description: "Unused variable" }, tool: { name: "CodeQL" }, most_recent_instance: { location: { path: "js/app.js" } } }] : []);
    if (u.pathname.endsWith("/code-scanning/alerts")) return json(404, { message: "no analysis found" });
    if (u.pathname === "/repos/" + REPO + "/pulls" && state === "open") return json(200, (await (await base(url, init)).json()).concat([{ number: 8, title: "Bump axios from 1.6.0 to 2.0.0 in /functions", html_url: "https://github.com/x/pull/8",
      user: { login: "dependabot[bot]", type: "Bot" }, head: { ref: "dependabot/npm_and_yarn/functions/axios-2.0.0", sha: "s8", repo: { full_name: REPO } }, draft: false, body: "", created_at: at(5), updated_at: at(4), labels: [] }]));
    return base(url, init);
  };
  const out = await gh.source(ctx(fetch));
  const d = out.security.dependabot;
  assert.equal(d.open, 4);
  assert.deepEqual(d.bySeverity, { critical: 1, high: 1, medium: 1, low: 1 });
  assert.deepEqual(d.byRepo, [{ label: REPO, value: 3 }, { label: "kaanmuar/qa-lab-outreach", value: 1 }]);
  assert.deepEqual(d.byEcosystem, [{ label: "npm", value: 2 }, { label: "maven", value: 1 }, { label: "pip", value: 1 }]);
  assert.deepEqual(d.items.map((i) => i.package), ["axios", "requests", "okhttp", "left-pad"]);
  assert.deepEqual([d.items[0].patched, d.items[0].manifest, d.items[0].pr.number], ["2.0.0", "functions/package.json", 8]);
  assert.equal(d.items[1].pr, undefined);
  assert.deepEqual([d.oldestD, d.medianD], [20, 7.5]);
  const cs = out.security.codeScanning;
  assert.deepEqual([cs.open, cs.items[0].severity, cs.items[0].path, cs.items[0].tool], [1, "medium", "js/app.js", "CodeQL"]);
  assert.ok(asked.includes("kaanmuar/kaanmuar.github.io fixed,dismissed,auto_dismissed"));
  assert.ok(asked.includes("kaanmuar/kaanmuar.github.io dismissed"));
  const weeks = out.security.weeks;
  assert.equal(weeks.length, 8);
  assert.equal(weeks[7].week, "2026-W45");
  assert.deepEqual([weeks[7].fixed, weeks[6].dismissed], [1, 1]);
  assert.equal(weeks.reduce((n, w) => n + w.opened, 0), 7);
  const sec = out.score.areas.security;
  assert.equal(sec.value, 25);
  assert.deepEqual(sec.parts.map((p) => [p.label, p.count, p.penalty]), [["Dependabot critical", 1, 40], ["Dependabot high", 1, 20], ["Dependabot medium", 1, 5], ["Dependabot low", 1, 5], ["Code scanning medium", 1, 5]]);
  assert.equal(out.repos.find((r) => r.name === REPO).security.open, 3 + 1);
});

test("board drift flags closed issues outside Done, open issues in Done, merged PRs in early columns and items with no Status", async () => {
  const out = await gh.source(ctx(fakeFetch()));
  const board = out.board;
  const drift = Object.fromEntries(board.drift.map((d) => [d.number, d.should]));
  assert.deepEqual(drift, { 10: "Done", 11: "Dev", 12: "Done", 15: "Backlog" });
  assert.deepEqual(board.aging.map((a) => a.number), [13]);
  assert.equal(board.wip, 2);
  assert.equal(board.wipLimit, 60);
  assert.equal(board.columns.find((c) => c.name === "Dev").count, 2);
  const flow = out.flow.map((f) => f.from + ">" + f.to + ":" + f.count).sort();
  assert.deepEqual(flow, ["Design>Dev:1", "New>Backlog:1", "Prod>Done:1"]);
  assert.equal(board.flow, undefined);
});

test("each board column lists its cards for the drill-down: oldest first, Done newest first", async () => {
  const out = await gh.source(ctx(fakeFetch()));
  const items = (name) => out.board.columns.find((c) => c.name === name).items;
  assert.deepEqual(items("Dev").map((i) => [i.number, i.days]), [[13, 10], [10, 1]]);
  assert.deepEqual(items("Done").map((i) => i.number), [11, 14]);
  assert.deepEqual(Object.keys(items("Dev")[0]).sort(), ["days", "labels", "number", "title", "url"]);
  assert.deepEqual(items("QA"), []);
});

test("issues carry a list per indicator and bugs per area for the drill-downs", async () => {
  const out = await gh.source(ctx(fakeFetch()));
  const iss = out.issues;
  assert.equal(iss.since, "2026-10-27");
  assert.deepEqual(iss.bugsByArea.map((a) => [a.label, a.value, a.items.map((i) => i.number)]), [["jarvis", 1, [20]]]);
  assert.deepEqual(iss.lists.openBugs.map((i) => i.number), [20]);
  assert.deepEqual(iss.lists.opened.map((i) => i.number), [21]);
  assert.deepEqual(iss.lists.closed.map((i) => [i.number, i.days]), [[21, 0.1]]);
  assert.deepEqual(iss.lists.open.map((i) => i.number), [20]);
  assert.deepEqual(iss.subIssues.items.map((i) => [i.number, i.done, i.total]), [[20, 1, 2]]);
  assert.deepEqual(iss.oldest.map((i) => i.number), [20]);
});

test("repos show only the configured list, in its order, and flag configured repos the app cannot see", async () => {
  const fallback = await gh.source(ctx(fakeFetch()));
  assert.deepEqual(fallback.access.shown, ["kaanmuar/kaanmuar.github.io", "kaanmuar/qa-lab-outreach", "kaanmuar/cursor-quota", "kaanmuar/cursor-quota-releases"]);
  const out = await gh.source(ctx(fakeFetch(), null, { settings: { github: { repos: ["kaanmuar/qa-lab-outreach", "https://github.com/kaanmuar/kaanmuar.github.io", "kaanmuar/gone", "not a repo"] } } }));
  assert.deepEqual(out.repos.map((r) => r.name), ["kaanmuar/qa-lab-outreach", REPO]);
  assert.deepEqual(out.access.shown, ["kaanmuar/qa-lab-outreach", REPO, "kaanmuar/gone"]);
  assert.ok(out.access.missing.some((m) => m.repo === "kaanmuar/gone"));
});

test("with no tokens every GitHub part says so and the source still answers", async () => {
  const out = await gh.source(ctx(fakeFetch(), null, { github: async () => "" }));
  ["ci", "prs", "board", "issues", "branches", "deploys", "android"].forEach((name) => assert.deepEqual(out[name], { ok: false, error: "No GitHub token is set." }));
  assert.equal(out.security.dependabot.ok, false);
  assert.deepEqual(out.repos, []);
  assert.equal(out.score.overall.value, null);
  assert.ok(out.needs.some((n) => /kaanmuar repos/.test(n)));
});

test("daily() writes today's and yesterday's day docs with run totals, search counts and the snapshot fields", async () => {
  const db = fakeDb();
  const snapshot = { prs: { ok: true, open: 4 }, issues: { ok: true, openBugs: 2 }, board: { ok: true, wip: 6 }, score: { overall: { value: 81 } } };
  const res = await gh.daily(ctx(fakeFetch(), db, { snapshot }));
  assert.deepEqual(res, { ok: true, days: ["2026-11-02", "2026-11-03"] });
  const today = db.doc("jarvis_github_days", "2026-11-03");
  assert.equal(today.runs, 7);
  assert.equal(today.failed, 2);
  assert.equal(today.passRate, 66.7);
  assert.equal(today.deploys, 1);
  assert.equal(today.merged, 3);
  assert.equal(today.closedBugs, 1);
  assert.equal(today.mainGreen, true);
  assert.equal(today.mttrH, 1);
  assert.deepEqual([today.openPrs, today.openBugs, today.wip, today.score], [4, 2, 6, 81]);
  const yesterday = db.doc("jarvis_github_days", "2026-11-02");
  assert.equal(yesterday.runs, 0);
  assert.equal(yesterday.openPrs, undefined);
});

test("backfill() writes only missing days, newest first, up to the limit", async () => {
  const db = fakeDb();
  await db.collection("jarvis_github_days").doc("2026-11-02").set({ day: "2026-11-02", runs: 1 });
  const res = await gh.backfill(ctx(fakeFetch(), db, { limit: 2 }));
  assert.deepEqual(res.days, ["2026-11-01", "2026-10-31"]);
  assert.equal(res.left, 87);
  assert.equal(db.doc("jarvis_github_days", "2026-11-02").runs, 1);
  assert.equal(db.doc("jarvis_github_days", "2026-11-01").day, "2026-11-01");
});

test("history keeps the day docs in range, oldest first, and streaks read them", async () => {
  const db = fakeDb();
  for (let i = 1; i <= 3; i++) {
    const day = new Date(NOW - i * DAY).toISOString().slice(0, 10);
    await db.collection("jarvis_github_days").doc(day).set({ day, runs: 100, passRate: 90, merged: 2, mainGreen: true, closedBugs: 1 });
  }
  await db.collection("jarvis_github_days").doc("2026-09-01").set({ day: "2026-09-01", runs: 1 });
  const out = await gh.source(ctx(fakeFetch(), db));
  assert.deepEqual(out.history.map((h) => h.day), ["2026-10-31", "2026-11-01", "2026-11-02"]);
  assert.equal(out.streaks.greenMainDays, 4);
  assert.equal(out.streaks.mergeDays, 4);
  assert.equal(out.streaks.xp, 10 * (6 + 1) + 5 * (3 + 1) + 3 * (3 + 1));
  assert.equal(out.streaks.level, gh.xpLevel(out.streaks.xp).level);
});

test("the Mac report as github-local-report.js builds it goes through localIngest and comes back out of the source", async () => {
  const fix = require("../../functions/jarvis-github-fix");
  const mac = require("../../scripts/github-local-report");
  const core = require("../../js/admin-jarvis-core.js");
  const db = fakeDb();
  const nowS = Math.floor(NOW / 1000);
  const tree = (dir, branch, lock, dirty) => Object.assign({ path: "/Users/Apple/repo/.worktrees/" + dir, branch, head: "abc", detached: false, prunable: false, dirty }, mac.parseLock(lock, NOW));
  const queued = await fix.queueLocal(db, "remove-worktree", "fix-5-old", NOW - HOUR);
  const payload = {
    worktrees: [
      tree("fix-5-old", "fix/5-old", "chat=c1\nheartbeat=" + (nowS - 7200) + "\n", false),
      tree("feat-2526-x", "feat/2526-x", "chat=c2\nheartbeat=" + (nowS - 60) + "\n", true),
      tree("gone", "", "", null)
    ],
    usage: mac.usageRows("start_utc,end_utc,ticket,title,chat_id\n" + at(3) + ",," + "2526,Jarvis GitHub,c2\n" + at(30) + "," + at(28) + ",#2480,Old,c1\n", NOW),
    cost: Object.assign(mac.costFrom({ data: { billingCycleStart: "2026-10-20T00:00:00Z", individualUsage: { onDemand: { used: 1250 } } } }), { tickets: [{ ticket: 2526, costUsd: 3.2 }], eventsFile: "usage-events-2026-11-03.csv" }),
    rate: mac.rateFrom({ resources: { graphql: { used: 1200, limit: 5000, reset: nowS + 1800 }, core: { used: 30, limit: 5000, reset: nowS + 1800 } } }),
    results: [{ id: queued.id, status: "failed", result: "Chat c1 still works there." }],
    host: "carlos-mac", at: new Date(NOW).toISOString(), root: "/Users/Apple/repo", errors: ["tickets: no usage-events CSV"]
  };
  assert.deepEqual([payload.usage[0].end, payload.usage[0].ticket, payload.cost.limitUsd], [null, 2526, null]);
  const ingested = await fix.localIngest(db, payload, NOW);
  assert.deepEqual([ingested.marked, ingested.queue], [1, []]);
  assert.equal(db.doc("jarvis_github_local_queue", queued.id).status, "failed");
  const saved = db.doc("jarvis_github_local", "latest");
  assert.deepEqual(saved.worktrees.map((w) => [w.heartbeat, w.alive, w.dirty]), [[new Date((nowS - 7200) * 1000).toISOString(), false, false], [new Date((nowS - 60) * 1000).toISOString(), true, true], ["", false, null]]);
  assert.deepEqual([saved.cost.limitUsd, saved.cost.onDemandUsd, saved.cost.eventsFile, saved.root, saved.errors.length], [null, 12.5, "usage-events-2026-11-03.csv", "/Users/Apple/repo", 1]);
  assert.equal(saved.rate.graphql.reset, new Date((nowS + 1800) * 1000).toISOString());

  const out = await gh.source(ctx(fakeFetch(), db));
  assert.deepEqual(out.local, { at: new Date(NOW).toISOString(), ageMin: 0 });
  assert.ok(!out.needs.some((n) => /github-local-report/.test(n)));
  assert.deepEqual(out.branches.worktrees.map((w) => [w.branch, w.alive, w.dirty, w.prState]), [["fix/5-old", false, false, "merged"], ["feat/2526-x", true, true, "open"], ["", false, null, null]]);
  assert.deepEqual(core.githubTargets(out).worktrees.map((w) => w.dir), ["fix-5-old"]);
  const t = out.agents.tickets.find((x) => x.ticket === 2526);
  assert.deepEqual([t.costUsd, t.chats, out.agents.open.map((o) => o.ticket)], [3.2, 1, [2526]]);
  assert.deepEqual(out.agents.cost, { cycleStart: "2026-10-20T00:00:00.000Z", onDemandUsd: 12.5, limitUsd: 0 });
  assert.deepEqual([out.budget.kaanmuar.graphql.used, out.budget.kaanmuar.graphql.limit, out.budget.hourly], [1200, 5000, [{ hour: "2026-11-03T18:00:00.000Z", graphql: 1200 }]]);
});

test("PageSpeed runs are not deploys, Pages is, and Dependabot runs never make main red", async () => {
  const extra = RUNS.concat([
    run(8, "PageSpeed daily", 5, "main", "failure", 1.5, { path: ".github/workflows/pagespeed-daily.yml" }),
    run(9, "Merge PageSpeed PR", 6, "main", "failure", 1.4, { path: ".github/workflows/pagespeed-merge.yml" }),
    run(10, "Pages", 7, "main", "success", 1.3, { path: ".github/workflows/pages.yml" }),
    run(11, "npm_and_yarn in /. for glob - Update #1", 8, "main", "failure", 1.2, { event: "dynamic", path: "dynamic/dependabot/dependabot-updates" }),
    run(12, "npm_and_yarn in /. for uuid - Update #2", 8, "main", "failure", 1.1, { event: "dynamic", path: "dynamic/dependabot/dependabot-updates" })
  ]);
  const totals = gh.runTotals(extra);
  assert.equal(totals.deploys, 2);
  assert.equal(totals.deploysFailed, 0);
  const out = await gh.source(ctx(fakeFetch({}, extra)));
  const red = out.ci.workflows.filter((w) => w.mainRed).map((w) => w.name).sort();
  assert.deepEqual(red, ["Merge PageSpeed PR", "PageSpeed daily"]);
  assert.equal(out.ci.workflows.filter((w) => w.name === "Dependabot updates").length, 1);
  assert.equal(out.ci.failing.filter((f) => f.name === "Dependabot updates").length, 1);
  assert.match(out.score.areas.ci.why, /2 workflows red on main/);
  assert.equal(out.dora.changeFail.pct, 0);
  assert.equal(out.dora.deployFreq.perDay, 2);
});

test("scores cap each penalty so a busy repo lands in C-D, not 0", async () => {
  const out = await gh.source(ctx(fakeFetch()));
  for (const name of ["ci", "board", "issues"]) assert.ok(out.score.areas[name].value >= 40, name + " " + JSON.stringify(out.score.areas[name]));
  // The only open PR is conflicted, red and stale: every capped penalty hits and the area still keeps 30.
  assert.equal(out.score.areas.prs.value, 100 - 30 - 25 - 15);
});
