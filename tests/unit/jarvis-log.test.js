const test = require("node:test");
const assert = require("node:assert/strict");
const jarvisLog = require("../../functions/jarvis-log");
const poll = require("../../functions/jarvis-log-poll");
const core = require("../../js/admin-jarvis-core");

// A Firestore stand-in with what jarvis_log and jarvis_log_state use: add, doc get/set, batch, where/orderBy/limit.
function logDb() {
  const cols = {};
  const col = (name) => (cols[name] = cols[name] || new Map());
  let n = 0;
  const cmp = { ">=": (a, b) => a >= b, "<": (a, b) => a < b };
  const query = (name, filters, order, max) => ({
    where: (f, op, v) => query(name, filters.concat([[f, op, v]]), order, max),
    orderBy: (f, dir) => query(name, filters, [f, dir], max),
    limit: (m) => query(name, filters, order, m),
    get: async () => {
      let rows = Array.from(col(name).entries()).filter(([, d]) => filters.every(([f, op, v]) => cmp[op](d[f].getTime(), v.getTime())));
      if (order) rows.sort((a, b) => (order[1] === "desc" ? -1 : 1) * (a[1][order[0]] - b[1][order[0]]));
      rows = rows.slice(0, max || rows.length);
      return { docs: rows.map(([id, d]) => ({ id, data: () => Object.assign({}, d), ref: { delete: async () => col(name).delete(id) } })) };
    }
  });
  const db = {
    cols,
    rows: (name) => Array.from(col(name).values()),
    collection: (name) => Object.assign(query(name, [], null, 0), {
      add: async (row) => { col(name).set("a" + ++n, row); },
      doc: (id) => {
        const key = id || "a" + ++n;
        return { id: key, _c: name, get: async () => ({ exists: col(name).has(key), data: () => col(name).get(key) && JSON.parse(JSON.stringify(col(name).get(key))) }), set: async (row) => { col(name).set(key, row); } };
      }
    }),
    batch: () => {
      const ops = [];
      return { set: (ref, row) => ops.push(() => col(ref._c).set(ref.id, row)), delete: (ref) => ops.push(() => ref.delete()), commit: async () => ops.forEach((op) => op()) };
    }
  };
  return db;
}

test("a line keeps its source, level, 300 chars and 7 days; an unknown source or level falls back", () => {
  const now = Date.parse("2026-11-09T04:00:00Z");
  const r = jarvisLog.row({ source: "board", level: "warn", text: "  #2810   moved\nNext → Dev  ", ref: "x#1", url: "https://github.com/x" }, now);
  assert.equal(r.text, "#2810 moved Next → Dev");
  assert.deepEqual([r.source, r.level, r.ref, r.url], ["board", "warn", "x#1", "https://github.com/x"]);
  assert.equal(r.expireAt.getTime() - r.at.getTime(), 7 * 24 * 3600000);
  assert.equal(r.addedAt.getTime(), now);
  const odd = jarvisLog.row({ source: "nope", level: "loud", text: "x".repeat(400), url: "javascript:alert(1)", at: "2026-11-09T03:59:00Z" }, now);
  assert.deepEqual([odd.source, odd.level, odd.text.length, odd.url], ["jarvis", "info", 300, undefined]);
  assert.equal(odd.at.toISOString(), "2026-11-09T03:59:00.000Z");
  assert.equal(jarvisLog.row({ text: "   " }, now), null);
});

test("log and logMany never throw: no db writes nothing, a failing db is swallowed, many lines go in one batch", async () => {
  assert.equal(await jarvisLog.log(null, { text: "nowhere" }), null);
  const broken = { collection: () => ({ add: async () => { throw new Error("quota"); } }) };
  const err = console.error;
  console.error = () => {};
  try { assert.equal(await jarvisLog.log(broken, { text: "lost" }), null); } finally { console.error = err; }
  const db = logDb();
  jarvisLog.use(() => db);
  try {
    await jarvisLog.log(null, { source: "push", text: "alerts push to 1 device" });
    assert.equal(await jarvisLog.logMany(null, [{ text: "a" }, { text: "" }, { source: "gemini", text: "b" }]), 2);
  } finally { jarvisLog.use(null); }
  assert.deepEqual(db.rows("jarvis_log").map((r) => [r.source, r.text]), [["push", "alerts push to 1 device"], ["jarvis", "a"], ["gemini", "b"]]);
});

test("the log op answers newest first with a cursor, reads only what came since it, and filters by source, level and words", async () => {
  const db = logDb();
  const t0 = Date.parse("2026-11-09T04:00:00Z");
  const put = (i, source, level, text) => db.collection("jarvis_log").doc("d" + i).set(Object.assign(jarvisLog.row({ source, level, text }, t0 + i * 1000)));
  await put(1, "actions", "debug", "E2E #1 started on main");
  await put(2, "gemini", "info", "Gemini ok in 900 ms: briefing");
  await put(3, "function", "error", "jarvisWatch failed: boom");
  const all = await jarvisLog.read(db, {});
  assert.deepEqual(all.entries.map((e) => e.id), ["d3", "d2", "d1"]);
  assert.equal(all.cursor, new Date(t0 + 3000).toISOString());
  assert.equal(all.entries[0].expireAt, undefined);
  assert.deepEqual(all.sources, core.LOG_SOURCES);
  await put(4, "board", "info", "#2810 moved Next → Dev");
  const since = await jarvisLog.read(db, { since: all.cursor });
  assert.deepEqual(since.entries.map((e) => e.id), ["d4", "d3"]);
  assert.deepEqual((await jarvisLog.read(db, { sources: ["gemini", "board"] })).entries.map((e) => e.id), ["d4", "d2"]);
  assert.deepEqual((await jarvisLog.read(db, { sources: "function" })).entries.map((e) => e.id), ["d3"]);
  assert.deepEqual((await jarvisLog.read(db, { level: "info" })).entries.map((e) => e.id), ["d4", "d3", "d2"]);
  assert.deepEqual((await jarvisLog.read(db, { q: "GEMINI briefing" })).entries.map((e) => e.id), ["d2"]);
  assert.deepEqual((await jarvisLog.read(db, { limit: 1 })).entries.map((e) => e.id), ["d4"]);
  assert.equal(jarvisLog.LIMIT, 300);
});

test("prune deletes the lines past 7 days, the TTL policy's fallback", async () => {
  const db = logDb();
  const now = Date.parse("2026-11-09T04:00:00Z");
  await db.collection("jarvis_log").doc("old").set(jarvisLog.row({ text: "old" }, now - 8 * 864e5));
  await db.collection("jarvis_log").doc("new").set(jarvisLog.row({ text: "new" }, now - 6 * 864e5));
  assert.equal(await jarvisLog.prune(db, now), 1);
  assert.deepEqual(db.rows("jarvis_log").map((r) => r.text), ["new"]);
});

test("Actions runs: a new run says it started, a finished one how it ended; seen runs say nothing again", () => {
  const run = (id, status, conclusion, extra) => Object.assign({ id, run_number: id, run_attempt: 1, name: "E2E", head_branch: "main", event: "push", status, conclusion, html_url: "https://github.com/r/" + id,
    created_at: "2026-11-09T04:00:00Z", run_started_at: "2026-11-09T04:00:00Z", updated_at: "2026-11-09T04:07:02Z" }, extra || {});
  const a = poll.runLines("kaanmuar/kaanmuar.github.io", [run(2, "in_progress"), run(1, "completed", "success")], {});
  assert.deepEqual(a.lines.map((l) => [l.level, l.text]), [
    ["info", "kaanmuar.github.io: E2E #1 success in 7m02s on main (push)"],
    ["debug", "kaanmuar.github.io: E2E #2 started on main (push)"]
  ]);
  assert.deepEqual(a.seen, { "1.1": "c", "2.1": "r" });
  const b = poll.runLines("kaanmuar/kaanmuar.github.io", [run(3, "queued"), run(2, "completed", "failure"), run(1, "completed", "success")], a.seen);
  assert.deepEqual(b.lines.map((l) => [l.source, l.level, l.ref, l.text]), [
    ["actions", "error", "run:2", "kaanmuar.github.io: E2E #2 failure in 7m02s on main (push)"],
    ["actions", "debug", "run:3", "kaanmuar.github.io: E2E #3 started on main (push)"]
  ]);
  const again = poll.runLines("kaanmuar/kaanmuar.github.io", [run(2, "completed", "failure", { run_attempt: 2, status: "in_progress", conclusion: null })], b.seen);
  assert.deepEqual(again.lines.map((l) => l.text), ["kaanmuar.github.io: E2E #2 (attempt 2) started on main (push)"]);
  assert.equal(poll.runLines("r/x", [run(4, "completed", "cancelled")], {}).lines[0].level, "debug");
});

test("issues, PRs and their events: new numbers, closes and merges, and board moves with their columns", () => {
  const issue = (number, pr) => Object.assign({ number, title: "T" + number, html_url: "https://github.com/i/" + number, created_at: "2026-11-09T04:00:00Z", user: { login: "kaanmuar" } }, pr ? { pull_request: {} } : {});
  const i = poll.issueLines("kaanmuar/cursor-quota", [issue(12, true), issue(11), issue(10)], 10);
  assert.deepEqual(i.lines.map((l) => l.text), ["cursor-quota: new issue #11 T11 (by kaanmuar)", "cursor-quota: new PR #12 T12 (by kaanmuar)"]);
  assert.equal(i.last, 12);
  const ev = (id, event, number, extra) => Object.assign({ id, event, node_id: "N" + id, created_at: "2026-11-09T04:01:00Z", actor: { login: "qa-lab-agents[bot]" }, issue: issue(number, number === 12) }, extra || {});
  const events = [ev(105, "labeled", 11, { label: { name: "area:jarvis" } }), ev(104, "merged", 12), ev(103, "project_v2_item_status_changed", 11), ev(102, "project_v2_item_status_changed", 10), ev(100, "closed", 9)];
  const e = poll.eventLines("kaanmuar/kaanmuar.github.io", events, 101, { N103: { previousStatus: "Next", status: "Dev" } });
  assert.deepEqual(e.lines.map((l) => [l.source, l.level, l.text]), [
    ["board", "info", "kaanmuar.github.io: #10 moved on the board: T10 (qa-lab-agents)"],
    ["board", "info", "kaanmuar.github.io: #11 moved Next → Dev: T11 (qa-lab-agents)"],
    ["github", "info", "kaanmuar.github.io: PR #12 merged: T12 (qa-lab-agents)"],
    ["github", "debug", "kaanmuar.github.io: #11 labeled area:jarvis: T11 (qa-lab-agents)"]
  ]);
  assert.equal(e.last, 105);
  assert.deepEqual(e.moves, ["N102", "N103"]);
});

test("Cloud Logging entries: severity to level, the function's name, a link to the entry, and no entry twice", () => {
  const entries = [
    { insertId: "a", timestamp: "2026-11-09T04:00:01Z", severity: "ERROR", resource: { labels: { function_name: "jarvisWatch" } }, textPayload: "Jarvis actions failed: boom" },
    { insertId: "b", timestamp: "2026-11-09T04:00:02Z", severity: "WARNING", resource: { labels: { service_name: "outreachsweep" } }, httpRequest: { status: 429, requestMethod: "POST", requestUrl: "https://x.run.app/?k=1", latency: "0.2s" } },
    { insertId: "c", timestamp: "2026-11-09T04:00:03Z", severity: "INFO", resource: { labels: { function_name: "jarvisGithub" } }, jsonPayload: { message: "diagnosed 2" } }
  ];
  const out = poll.logLines(entries, ["c"]);
  assert.deepEqual(out.lines.map((l) => [l.source, l.level, l.text]), [["function", "error", "jarvisWatch: Jarvis actions failed: boom"], ["function", "warn", "outreachsweep: 429 POST https://x.run.app/ 0.2s"]]);
  assert.match(out.lines[0].url, /^https:\/\/console\.cloud\.google\.com\/logs\/query;query=insertId%3D%22a%22/);
  assert.deepEqual(out.seen, ["c", "a", "b"]);
  assert.match(poll.logFilter("2026-11-09T04:00:00Z"), /severity>=WARNING\).*function_name=~"\^jarvis" AND resource\.labels\.function_name!="jarvisLogPoll" AND severity>=INFO/);
  const crash = poll.logLines([{ insertId: "d", timestamp: "2026-11-09T04:00:04Z", severity: "DEBUG", resource: { labels: { function_name: "jarvis" } }, textPayload: "Function execution took 60002 ms, finished with status: 'timeout'" },
    { insertId: "e", timestamp: "2026-11-09T04:00:05Z", severity: "DEBUG", resource: { labels: { function_name: "jarvis" } }, textPayload: "Function execution took 40 ms, finished with status code: 503" }], []);
  assert.deepEqual(crash.lines.map((l) => l.level), ["error", "error"]);
});

test("the poller seeds on its first pass, then logs what is new, uses ETags and names board moves in one GraphQL call", async () => {
  const db = logDb();
  const t0 = Date.parse("2026-11-09T04:00:00Z");
  const gh = { runs: [{ id: 1, run_number: 1, name: "E2E", status: "completed", conclusion: "success", head_branch: "main", event: "push", html_url: "https://github.com/r/1", updated_at: "2026-11-09T03:59:00Z" }],
    issues: [{ number: 50, title: "Old", html_url: "https://github.com/i/50" }], events: [{ id: 900, event: "closed", issue: { number: 50, title: "Old" } }] };
  const calls = [];
  const res = (status, body, etag) => ({ status, ok: status < 300, headers: { get: (k) => (k === "etag" ? etag || "" : "") }, json: async () => body });
  const fetch = async (url, opts) => {
    calls.push([url.replace(/\?.*$/, ""), (opts.headers || {})["If-None-Match"] || ""]);
    if (url.includes("logging.googleapis.com")) return res(200, { entries: gh.logs || [] });
    if (url.endsWith("/graphql")) return res(200, { data: { nodes: [{ id: "MOVE", previousStatus: "Next", status: "Dev" }] } });
    const repo = url.split("/repos/")[1].split("/").slice(0, 2).join("/");
    const main = repo === "kaanmuar/kaanmuar.github.io";
    const kind = url.includes("/actions/runs") ? "runs" : url.includes("/issues/events") ? "events" : "issues";
    const etag = main ? kind + "-" + JSON.stringify(gh[kind]).length : kind + "-empty";
    if ((opts.headers || {})["If-None-Match"] === etag) return res(304, null);
    const body = !main ? (kind === "runs" ? { workflow_runs: [] } : []) : kind === "runs" ? { workflow_runs: gh.runs } : gh[kind];
    return res(200, body, etag);
  };
  const ctx = (now) => ({ fetch, db, now, token: async () => "tok", googleToken: async () => "g" });
  assert.equal(await poll.poll(ctx(t0)), "0 lines");
  const state = db.rows("jarvis_log_state")[0];
  assert.equal(state.repos.kaanmuar_kaanmuar_github_io.issue, 50);
  assert.equal(state.repos.kaanmuar_kaanmuar_github_io.event, 900);
  gh.runs.unshift({ id: 2, run_number: 2, name: "Pages", status: "in_progress", head_branch: "main", event: "push", html_url: "https://github.com/r/2", run_started_at: "2026-11-09T04:00:30Z" });
  gh.issues.unshift({ number: 51, title: "New one", html_url: "https://github.com/i/51", pull_request: {}, user: { login: "kaanmuar" } });
  gh.logs = [{ insertId: "L1", timestamp: "2026-11-09T04:01:30Z", severity: "ERROR", resource: { labels: { function_name: "jarvisWatch" } }, textPayload: "boom" }];
  gh.events.unshift({ id: 901, event: "project_v2_item_status_changed", node_id: "MOVE", issue: { number: 51, title: "New one", pull_request: {} } });
  calls.length = 0;
  const note = await poll.poll(ctx(t0 + 60000));
  assert.equal(note, "4 lines");
  assert.deepEqual(db.rows("jarvis_log").map((r) => [r.source, r.text]).sort(), [
    ["actions", "kaanmuar.github.io: Pages #2 started on main (push)"],
    ["board", "kaanmuar.github.io: PR #51 moved Next → Dev: New one"],
    ["function", "jarvisWatch: boom"],
    ["github", "kaanmuar.github.io: new PR #51 New one (by kaanmuar)"]
  ]);
  assert.ok(calls.filter(([u]) => u.includes("qa-lab-outreach")).every(([, tag]) => tag), "an unchanged repo is asked with its ETag");
  assert.equal(calls.filter(([u]) => u.endsWith("/graphql")).length, 1);
});
