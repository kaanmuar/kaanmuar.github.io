const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const proc = require("../../functions/jarvis-processes");
const sections = require("../../functions/jarvis-sections");
const live = require("../../functions/jarvis-live");
const snapshot = require("../../functions/jarvis-snapshot");
const ops = require("../../functions/ops-schedule");
const github = require("../../functions/jarvis-github");
const jarvis = require("../../functions/jarvis");

const T0 = Date.parse("2026-11-09T05:00:00Z");
const MIN = 60000;
const HOUR = 60 * MIN;

// Firestore stand-in: docs by collection and id, with read and write counts.
function fakeDb(devices) {
  const docs = new Map();
  const stats = { reads: 0, writes: 0 };
  (devices || []).forEach((d) => docs.set("jarvis_devices/" + d.id, d));
  const ref = (c, id) => ({
    get: async () => { stats.reads += 1; const d = docs.get(c + "/" + id); return { exists: !!d, data: () => d && Object.assign({}, d) }; },
    set: async (row) => { stats.writes += 1; docs.set(c + "/" + id, Object.assign({}, row)); }
  });
  return {
    stats,
    doc: (c, id) => docs.get(c + "/" + id),
    collection: (c) => ({
      doc: (id) => ref(c, id),
      get: async () => ({ docs: Array.from(docs.entries()).filter(([k]) => k.startsWith(c + "/")).map(([k, d]) => ({ id: k.slice(c.length + 1), data: () => d })) })
    }),
    runTransaction: async (fn) => fn({ get: (r) => r.get(), set: (r, row) => { r.set(row); } })
  };
}

const PHONE = { id: "p1", token: "token-aaaaaaaaaaaaaaaaaaaa", kinds: {} };

function deps(db, clock) {
  const sent = [];
  const now = clock || { t: T0 };
  return {
    sent, clock: now, db, now: () => now.t, sleep: async (ms) => { now.t += ms; },
    messaging: { sendEachForMulticast: async (msg) => { sent.push(msg); return { responses: msg.tokens.map(() => ({ success: true })), successCount: msg.tokens.length, failureCount: 0 }; } },
    webpush: { generateVAPIDKeys: () => ({ publicKey: "pub", privateKey: "priv" }), sendNotification: async () => null }
  };
}

test.beforeEach(() => live.forget());

test("a step costs one read and one write, and pushes the processes section at high priority with the served version", async () => {
  const db = fakeDb([PHONE]);
  const d = deps(db);
  const out = await proc.report(d, proc.jobRow("sweepReviews", "running", { startedAt: new Date(T0).toISOString() }));
  assert.equal(out.changed, true);
  const kept = db.doc("jarvis_cache", "processes");
  const value = JSON.parse(kept.json);
  assert.equal(value.rows[0].name, "Country sweep");
  assert.equal(value.running, 1);
  assert.equal(kept.v, sections.version("processes", { processes: value }));
  assert.equal(d.sent.length, 1);
  assert.equal(d.sent[0].android.priority, "high");
  assert.equal(d.sent[0].data.sections, "processes");
  assert.equal(JSON.parse(d.sent[0].data.versions).processes, kept.v);
  // The snapshot serves the same version, so a client that fetched it is up to date.
  const read = await proc.read(db);
  const served = sections.serve({ processes: read.value }, { processes: { at: read.at } }, { since: {}, only: ["processes"], days: 1, now: T0 });
  assert.equal(served.versions.processes.v, kept.v);
  assert.equal(served.versions.processes.at, kept.at);
});

test("the same state again writes nothing and pushes nothing", async () => {
  const db = fakeDb([PHONE]);
  const d = deps(db);
  await proc.report(d, proc.cubeRow("r1", { status: "running", host: "example.com", cases: 12, frameworks: ["Playwright"] }));
  const writes = db.stats.writes;
  d.clock.t += 10 * MIN;
  const out = await proc.report(d, proc.cubeRow("r1", { status: "running", host: "example.com", cases: 12, frameworks: ["Playwright"] }));
  assert.equal(out.changed, false);
  assert.equal(db.stats.writes, writes);
  assert.equal(d.sent.length, 1);
});

test("a run keeps its start, gains an end, and running and needs-you rows come first", async () => {
  const db = fakeDb();
  const d = deps(db);
  await proc.report(d, { id: "agent:a", kind: "agent", name: "Fix the tile", state: "running" });
  d.clock.t += 5 * MIN;
  await proc.report(d, { id: "agent:a", kind: "agent", name: "Fix the tile", state: "done", step: "Turn finished" });
  d.clock.t += MIN;
  await proc.report(d, [{ id: "mac:engagement", kind: "mac-agent", name: "Engagement browser", state: "waiting", needsYou: true, step: "Sign in to LinkedIn" }, proc.jobRow("opsWatchdog", "running")]);
  const { value } = await proc.read(db);
  assert.deepEqual(value.rows.map((r) => r.id), ["mac:engagement", "job:opsWatchdog", "agent:a"]);
  const a = value.rows[2];
  assert.equal(a.startedAt, new Date(T0).toISOString());
  assert.equal(a.endedAt, new Date(T0 + 5 * MIN).toISOString());
  assert.deepEqual([value.running, value.waiting, value.needsYou], [1, 1, 1]);
});

test("finished rows leave after a day, a silent job is settled as crashed, and one finished run is kept per workflow", async () => {
  const now = T0 + 30 * HOUR;
  const rows = [
    { id: "job:old", kind: "job", name: "old", state: "done", startedAt: new Date(T0).toISOString(), updatedAt: new Date(T0).toISOString(), endedAt: new Date(T0).toISOString() },
    { id: "job:stuck", kind: "job", name: "stuck", state: "running", startedAt: new Date(now - 2 * HOUR).toISOString(), updatedAt: new Date(now - 2 * HOUR).toISOString() },
    { id: "gh:1", kind: "workflow", name: "CI", state: "done", group: "gh:ci:main", updatedAt: new Date(now - 3 * HOUR).toISOString(), endedAt: new Date(now - 3 * HOUR).toISOString() },
    { id: "gh:2", kind: "workflow", name: "CI", state: "failed", group: "gh:ci:main", updatedAt: new Date(now - HOUR).toISOString(), endedAt: new Date(now - HOUR).toISOString() }
  ];
  const out = proc.prune(rows, now);
  assert.deepEqual(out.map((r) => r.id), ["job:stuck", "gh:2"]);
  assert.equal(out[0].state, "failed");
  assert.match(out[0].step, /likely crashed/);
});

test("rows are cleaned: unknown kinds and states refused, URLs only https, progress kept between 0 and 1", () => {
  assert.throws(() => proc.clean({ id: "x", kind: "nope", state: "running" }, T0), /kind/);
  assert.throws(() => proc.clean({ id: "x", kind: "job", state: "maybe" }, T0), /state/);
  const row = proc.clean({ id: "x", kind: "cube", state: "running", progress: 1.7, url: "javascript:alert(1)", needsYou: true }, T0);
  assert.equal(row.progress, 1);
  assert.equal(row.url, undefined);
  assert.equal(row.needsYou, true);
  assert.equal(proc.clean({ id: "x", kind: "cube", state: "done", needsYou: true }, T0).needsYou, undefined);
});

test("a job that runs more than once an hour is frequent; a daily one is not", () => {
  assert.equal(proc.frequent(ops.cron("outreachSweep")), true);
  assert.equal(proc.frequent(ops.cron("jarvisWatch")), true);
  assert.equal(proc.frequent(ops.cron("sweepReviews")), true);
  assert.equal(proc.frequent(ops.cron("opsWatchdog")), false);
  assert.equal(proc.frequent(ops.cron("jarvisDailyBriefing")), false);
});

const RUN = { id: 99, name: "Pages", path: ".github/workflows/pages.yml", event: "push", status: "in_progress", head_branch: "main", display_title: "Fix the tile", html_url: "https://github.com/kaanmuar/kaanmuar.github.io/actions/runs/99", run_started_at: "2026-11-09T04:59:00Z", workflow_id: 7, run_attempt: 1 };

test("workflow runs: deploys, scheduled jobs and the rest; pull request CI and requested events are left out", () => {
  const opts = { isDeploy: github.isDeploy, jobFiles: ["open-social.yml"] };
  const deploy = proc.workflowRow({ action: "in_progress", workflow_run: RUN }, opts);
  assert.equal(deploy.kind, "deploy");
  assert.equal(deploy.state, "running");
  assert.equal(deploy.id, "gh:99");
  assert.equal(proc.workflowRow({ action: "completed", workflow_run: Object.assign({}, RUN, { status: "completed", conclusion: "failure" }) }, opts).state, "failed");
  assert.equal(proc.workflowRow({ action: "completed", workflow_run: Object.assign({}, RUN, { name: "Open social", path: ".github/workflows/open-social.yml", event: "schedule", status: "completed", conclusion: "success" }) }, opts).kind, "job");
  const ci = proc.workflowRow({ action: "in_progress", workflow_run: Object.assign({}, RUN, { name: "CI", path: ".github/workflows/ci.yml", head_branch: "feat/x" }) }, opts);
  assert.equal(ci.kind, "workflow");
  assert.equal(ci.name, "CI · feat/x");
  assert.equal(proc.workflowRow({ action: "in_progress", workflow_run: Object.assign({}, RUN, { event: "pull_request" }) }, opts), null);
  assert.equal(proc.workflowRow({ action: "requested", workflow_run: RUN }, opts), null);
  const gate = proc.workflowRow({ action: "in_progress", workflow_run: Object.assign({}, RUN, { status: "waiting" }) }, opts);
  assert.deepEqual([gate.state, gate.needsYou], ["waiting", true]);
});

test("the webhook signature is GitHub's sha256 HMAC over the raw body", () => {
  const raw = Buffer.from(JSON.stringify({ action: "completed" }));
  const sig = "sha256=" + crypto.createHmac("sha256", "s3cret").update(raw).digest("hex");
  assert.equal(proc.signed("s3cret", raw, sig), true);
  assert.equal(proc.signed("other", raw, sig), false);
  assert.equal(proc.signed("s3cret", raw, ""), false);
  assert.equal(proc.signed("", raw, sig), false);
});

test("the Mac reports only agents, under its own ids", () => {
  const rows = proc.macRows({ rows: [{ id: "abc", kind: "agent", state: "running" }, { id: "x", kind: "deploy", state: "running" }, { id: "mac:engagement", kind: "mac-agent", state: "done" }] });
  assert.deepEqual(rows.map((r) => r.id), ["agent:abc", "mac:engagement"]);
});

test("cloud agents Jarvis started are moved by the hourly watch from Cursor's answer", async () => {
  const db = fakeDb();
  const d = deps(db);
  await proc.report(d, proc.cloudAgentRow("bc-1", "running", { name: "Jarvis fix: PR #12" }));
  const fetch = async (url) => ({ ok: true, json: async () => ({ id: "bc-1", status: url.endsWith("bc-1") ? "FINISHED" : "RUNNING", summary: "Opened PR #13" }) });
  const note = await proc.cloudAgents(d, { fetch, key: "k" });
  assert.match(note, /1 active, 1 moved/);
  const { value } = await proc.read(db);
  assert.deepEqual([value.rows[0].state, value.rows[0].step], ["done", "Opened PR #13"]);
});

test("the snapshot carries the processes doc as its own section, and Ask sees it", async () => {
  const db = fakeDb();
  await proc.report(deps(db), proc.deskRow("d1", "running", { url: "https://www.example.com/x", step: "Reading the site" }));
  const value = (await proc.read(db)).value;
  const ask = jarvis.askSnapshot({ processes: value }, 1);
  assert.match(ask.processes[0], /desk Your review: example.com: running/);
  const index = fs.readFileSync(path.join(__dirname, "../../functions/index.js"), "utf8");
  assert.match(index, /processes: \(\) => jarvisProcesses\.read\(db\)/, "jarvisLoadSnapshot reads the processes doc");
  assert.deepEqual(sections.SECTIONS.processes, { fields: ["processes"], from: ["processes"] });
  assert.equal(typeof snapshot.load, "function");
});

test("every scheduled job goes through track, so each one reports to Processes", () => {
  const index = fs.readFileSync(path.join(__dirname, "../../functions/index.js"), "utf8");
  const body = index.slice(index.indexOf("async function track("), index.indexOf("// A v1 schedule from the ops table"));
  assert.match(body, /jarvisProcesses\.jobRow\(job, "running"/);
  assert.match(body, /jarvisProcesses\.jobRow\(job, ok \? "done" : "failed"/);
});

test("the Cursor hook: a prompt runs, an answer ending in a question waits on Carlos, others finish", () => {
  const hook = require("../../.cursor/hooks/jarvis-process.js");
  const input = { workspace_roots: ["/Users/Apple/Documents/GitHub/kaanmuar.github.io/.worktrees/feat-2548-jarvis-live-processes"], prompt: "Do #2548" };
  const a = hook.step("beforeSubmitPrompt", input, {});
  assert.deepEqual([a.row.state, a.row.name], ["running", "feat-2548-jarvis-live-processes"]);
  const b = hook.step("afterAgentResponse", { text: "Done.\n\nShould I deploy it now?" }, a.kept);
  const c = hook.step("stop", { status: "completed" }, b.kept);
  assert.deepEqual([c.row.state, c.row.needsYou], ["waiting", true]);
  const d = hook.step("stop", { status: "completed" }, hook.step("afterAgentResponse", { text: "Merged in #12." }, a.kept).kept);
  assert.equal(d.row.state, "done");
  assert.equal(hook.step("stop", { status: "aborted" }, a.kept).row.state, "cancelled");
  assert.equal(hook.nameOf({ workspace_roots: ["/tmp/x"] }, "## Fix the **tile**\nmore"), "Fix the tile");
});

test("web panel: running first with a ticking clock, needs-you rows get an Open link, the push redraws only this panel", async () => {
  const P = await import("../../js/admin-jarvis-processes.js");
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  const now = Date.parse("2026-11-09T05:12:05Z");
  const p = { rows: [
    { id: "mac:engagement", kind: "mac-agent", name: "Engagement browser", state: "waiting", needsYou: true, step: "Sign in to LinkedIn", url: "https://carlosandmunoz.com/admin.html#stats", startedAt: "2026-11-09T05:00:00Z" },
    { id: "gh:1", kind: "deploy", name: "Pages <main>", state: "running", progress: 0.4, startedAt: "2026-11-09T05:00:00Z" },
    { id: "job:opsWatchdog", kind: "job", name: "Daily system review", state: "done", startedAt: "2026-11-09T04:00:00Z", endedAt: "2026-11-09T04:03:12Z" },
  ] };
  assert.equal(P.summary(p), "1 running · 1 needs you");
  assert.equal(P.summary({ rows: [] }), "");
  assert.equal(P.elapsed(42000), "42s");
  assert.equal(P.elapsed(3 * 3600e3 + 4 * 60e3), "3h 04m");
  const html = P.processesHtml(p, now, esc);
  assert.match(html, /1 running · 1 needs you/);
  assert.match(html, /class="jv-proc is-needs"[\s\S]*jv-proc-open" href="https:\/\/carlosandmunoz.com/);
  assert.match(html, /Pages &lt;main&gt;/, "names are escaped");
  assert.match(html, /data-proc-since="2026-11-09T05:00:00Z">12m 05s</);
  assert.match(html, /Last 24 hours[\s\S]*Daily system review[\s\S]*took 3m 12s[\s\S]*1h 08m ago/);
  assert.match(html, /width:40%/);
  assert.equal(P.processesHtml({ rows: [p.rows[2]] }, now, esc, { compact: true }), "", "Overview hides the panel when nothing runs");
  assert.doesNotMatch(P.processesHtml(p, now, esc, { compact: true }), /Last 24 hours/);

  const src = fs.readFileSync(path.join(__dirname, "../../js/admin-jarvis.js"), "utf8");
  assert.ok(src.includes("split(',').includes('processes') && await loadProcesses()"), "a processes push fetches only processes");
  assert.ok(src.includes("call('processes')"));
  assert.ok(src.includes("Proc.tick(root, Date.now())"), "the clocks tick every second");
  assert.ok(src.includes("${processesPanel(false)}${briefPanel('systems')}"), "Systems leads with Processes");
});
