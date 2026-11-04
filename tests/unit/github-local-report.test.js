const test = require("node:test");
const assert = require("node:assert/strict");

const r = require("../../scripts/github-local-report.js");

const NOW = new Date("2026-11-03T20:00:00Z");
const NOW_S = NOW.getTime() / 1000;
const ROOT = "/Users/Apple/Documents/GitHub/kaanmuar.github.io";

test("parseWorktrees reads the main checkout, branches, detached and prunable worktrees", () => {
  const out = r.parseWorktrees([
    "worktree " + ROOT, "HEAD aaa", "branch refs/heads/main", "",
    "worktree " + ROOT + "/.worktrees/feat-1-x", "HEAD bbb", "branch refs/heads/feat/1-x", "",
    "worktree " + ROOT + "/.worktrees/deploy", "HEAD ccc", "detached", "",
    "worktree /tmp/gone", "HEAD ddd", "branch refs/heads/old", "prunable gitdir file points to non-existent location", ""
  ].join("\n"));
  assert.equal(out.length, 4);
  assert.deepEqual(out[0], { path: ROOT, head: "aaa", branch: "main", detached: false, bare: false, prunable: false });
  assert.equal(out[1].branch, "feat/1-x");
  assert.equal(out[2].detached, true);
  assert.equal(out[2].branch, "");
  assert.equal(out[3].prunable, true);
  assert.deepEqual(r.parseWorktrees(""), []);
});

test("parseLock: a heartbeat within 30 minutes is alive, older or missing is not", () => {
  const live = r.parseLock("chat=abc\nheartbeat=" + (NOW_S - 60) + "\nprevious=old\n", NOW);
  assert.deepEqual(live, { locked: true, chat: "abc", heartbeat: NOW_S - 60, previous: "old", alive: true });
  assert.equal(r.parseLock("chat=abc\nheartbeat=" + (NOW_S - r.STALE_S) + "\n", NOW).alive, false);
  assert.equal(r.parseLock("chat=abc\n", NOW).alive, false);
  assert.deepEqual(r.parseLock("", NOW), { locked: false, chat: "", heartbeat: null, previous: "", alive: false });
});

test("parseCsv handles quotes, escaped quotes, commas and newlines in fields, CRLF and a BOM", () => {
  const rows = r.parseCsv('\uFEFFa,b,c\r\n1,"two, 2","say ""hi"""\r\n3,"multi\nline",\r\n\r\n');
  assert.deepEqual(rows, [{ a: "1", b: "two, 2", c: 'say "hi"' }, { a: "3", b: "multi\nline", c: "" }]);
  assert.deepEqual(r.parseCsv(""), []);
});

test("usageRows keeps the last 90 days, numbers tickets and leaves open work with a null end", () => {
  const csv = [
    "start_utc,end_utc,ticket,title,chat_id,notes",
    "2026-07-01T00:00:00Z,2026-07-01T01:00:00Z,10,Too old,c0,",
    '2026-11-01T10:00:00Z,2026-11-01T12:00:00Z,2526,"Jarvis, GitHub tab",c1,note',
    "2026-11-03T19:00:00Z,,ops,Board chores,c2,",
    "2026-11-03T19:10:00Z,2026-11-03T19:20:00Z,#334,Hash ticket,c3,"
  ].join("\n");
  assert.deepEqual(r.usageRows(csv, NOW), [
    { start: "2026-11-01T10:00:00Z", end: "2026-11-01T12:00:00Z", ticket: 2526, title: "Jarvis, GitHub tab", chat: "c1" },
    { start: "2026-11-03T19:00:00Z", end: null, ticket: "ops", title: "Board chores", chat: "c2" },
    { start: "2026-11-03T19:10:00Z", end: "2026-11-03T19:20:00Z", ticket: 334, title: "Hash ticket", chat: "c3" }
  ]);
});

test("costFrom reads cents from quota-cache.json and prefers the personal on-demand limit", () => {
  const quota = { data: { billingCycleStart: "2026-11-01T00:00:00.000Z", individualUsage: { onDemand: { used: 12345, limit: 100000 } }, teamUsage: { onDemand: { used: 0, limit: 0 } } } };
  assert.deepEqual(r.costFrom(quota), { cycleStart: "2026-11-01T00:00:00.000Z", onDemandUsd: 123.45, limitUsd: 1000 });
  const noLimit = { data: { billingCycleStart: "2026-11-01T00:00:00.000Z", individualUsage: { onDemand: { used: 0, limit: null } }, teamUsage: { onDemand: { used: 0, limit: 0 } } } };
  assert.deepEqual(r.costFrom(noLimit), { cycleStart: "2026-11-01T00:00:00.000Z", onDemandUsd: 0, limitUsd: null });
  assert.deepEqual(r.costFrom(null), { cycleStart: null, onDemandUsd: null, limitUsd: null });
});

test("ticketCosts sums the events inside each work span per ticket; open rows count 12 hours, rows without a ticket none", () => {
  const events = ['Date,Kind,Cost', '"2026-11-01T10:30:00Z","On-Demand","0.50"', '"2026-11-01T11:00:00Z","Included","1.25"', '"2026-11-01T13:00:00Z","On-Demand","9"', '"2026-11-03T19:30:00Z","On-Demand","0.10"'].join("\n");
  const usage = [
    { start: "2026-11-01T10:00:00Z", end: "2026-11-01T12:00:00Z", ticket: 2526 },
    { start: "2026-11-03T19:00:00Z", end: null, ticket: "ops" },
    { start: "2026-10-31T00:00:00Z", end: null, ticket: 7 },
    { start: "2026-11-01T00:00:00Z", end: "2026-11-02T00:00:00Z", ticket: "" }
  ];
  assert.deepEqual(r.ticketCosts(events, usage, NOW), [{ ticket: 2526, costUsd: 1.75 }, { ticket: "ops", costUsd: 0.1 }]);
});

test("rateFrom maps gh api rate_limit with ISO reset times", () => {
  const gh = { resources: { core: { limit: 5000, used: 38, remaining: 4962, reset: 1793755702 }, graphql: { limit: 5000, used: 0, remaining: 5000, reset: 1793758208 } } };
  assert.deepEqual(r.rateFrom(gh), {
    graphql: { used: 0, limit: 5000, reset: new Date(1793758208000).toISOString() },
    core: { used: 38, limit: 5000, reset: new Date(1793755702000).toISOString() }
  });
  assert.deepEqual(r.rateFrom({}), { graphql: null, core: null });
});

test("safeToRemove only allows a clean, unlocked worktree under .worktrees", () => {
  const wt = { path: ROOT + "/.worktrees/feat-1-x", branch: "feat/1-x", dirty: false, alive: false, chat: "" };
  assert.equal(r.safeToRemove({ target: wt.path }, wt, ROOT).ok, true);
  assert.equal(r.safeToRemove({ target: "feat-1-x" }, wt, ROOT).ok, true);
  assert.match(r.safeToRemove({ target: ROOT }, Object.assign({}, wt, { path: ROOT }), ROOT).why, /Not a worktree/);
  assert.match(r.safeToRemove({ target: ROOT + "/.worktrees/../scripts" }, wt, ROOT).why, /Not a worktree/);
  assert.match(r.safeToRemove({ target: ROOT + "/.worktrees" }, wt, ROOT).why, /Not a worktree/);
  assert.match(r.safeToRemove({ target: ROOT + "/.worktrees/a/b" }, wt, ROOT).why, /Not a worktree/);
  assert.match(r.safeToRemove({ target: "" }, wt, ROOT).why, /Not a worktree/);
  assert.match(r.safeToRemove({ target: wt.path }, null, ROOT).why, /No such worktree/);
  assert.match(r.safeToRemove({ target: wt.path }, Object.assign({}, wt, { alive: true, chat: "c9" }), ROOT).why, /c9 still works/);
  assert.match(r.safeToRemove({ target: wt.path }, Object.assign({}, wt, { dirty: true }), ROOT).why, /uncommitted/);
  assert.match(r.safeToRemove({ target: wt.path }, Object.assign({}, wt, { dirty: null }), ROOT).why, /did not answer/);
});
