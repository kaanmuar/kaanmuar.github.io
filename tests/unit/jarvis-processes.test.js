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

// What report() does to the rows, without the store: each event merged in at its time, then pruned.
function play(events) {
  let rows = [];
  events.sort((a, b) => a.t - b.t).forEach((e) => { rows = proc.prune(proc.merge(rows, proc.clean(e.row, e.t)) || rows, e.t); });
  return rows;
}

test("a realistic day stays whole: 30 chats, 200 workflow runs, 150 job runs and the reviews, in about 50 KB (#2890)", () => {
  const start = T0;
  const end = T0 + 24 * HOUR - MIN;
  const at = (i, n) => start + 10 * MIN + Math.floor(i * (end - start - 40 * MIN) / n);
  const events = [];
  const pair = (t, running, done, took) => events.push({ t, row: running }, { t: t + took, row: done });
  for (let i = 0; i < 30; i++) {
    const t = at(i, 30);
    pair(t, { id: "agent:chat-" + i, kind: "agent", name: "Fix the processes panel so it shows a day " + i, state: "running", startedAt: new Date(t).toISOString(), step: "Editing functions/jarvis-processes.js" },
      { id: "agent:chat-" + i, kind: "agent", name: "Fix the processes panel so it shows a day " + i, state: "done", step: "Turn finished" }, 12 * MIN);
  }
  const workflows = ["Pages", "Jarvis Android", "Lint Code Base", "E2E and Visual Tests", "Rebuild stale generated files", "Pre-flight index", "Deploy functions", "Unit tests", "Jarvis parity", "Apple catalog", "Live reports", "Social hub"];
  for (let i = 0; i < 200; i++) {
    const t = at(i, 200);
    const branch = i % 10 === 0 ? "fix/" + (2800 + i) + "-a-long-branch-name" : "main";
    const run = { id: 1000 + i, name: workflows[i % workflows.length], path: ".github/workflows/w" + (i % workflows.length) + ".yml", event: "push", head_branch: branch, workflow_id: i % workflows.length,
      display_title: "The collapsed Live status notification says when a process needs you (#2891) (#2894)", html_url: "https://github.com/kaanmuar/kaanmuar.github.io/actions/runs/" + (1000 + i), run_started_at: new Date(t).toISOString(), run_attempt: 1 };
    const opts = { isDeploy: github.isDeploy };
    pair(t, proc.workflowRow({ action: "in_progress", workflow_run: Object.assign({}, run, { status: "in_progress" }) }, opts),
      proc.workflowRow({ action: "completed", workflow_run: Object.assign({}, run, { status: "completed", conclusion: i % 17 ? "success" : "failure" }) }, opts), 6 * MIN);
  }
  const jobs = Object.keys(proc.JOB_NAMES).concat(["emailDailyReviewReport", "mailCanary", "remindOwnerReplies", "mailboxGraduate", "jarvisIndexPush", "jarvisLogPoll", "ownerReplies", "tiktokBusinessWatch", "diagnoseReviewFailures", "fileReviewFailureBugs", "ensureLiveReportsBatch", "sendReviewNotes", "sendOwnerNotices", "exportFirestoreWeekly", "engagementDailyReport", "jarvisIndexCheck", "dropReviewAuthUser", "jarvisWeeklyStrategy", "noteCvVisit"]);
  for (let i = 0; i < 150; i++) {
    const t = at(i, 150);
    const job = jobs[i % jobs.length];
    pair(t, proc.jobRow(job, "running", { startedAt: new Date(t).toISOString() }), proc.jobRow(job, "done", { startedAt: new Date(t).toISOString(), step: "www.electrofrioni.com (ni) complete, 20 pages read, 3 failures filed, 1 mail sent to the owner" }), 2 * MIN);
  }
  for (let i = 0; i < 25; i++) {
    const t = at(i, 25);
    pair(t, proc.reviewRow("run-" + i, "running", { url: "https://www.example-" + i + ".com/", startedAt: new Date(t).toISOString(), link: "https://carlosandmunoz.com/qa-review.html?report=run-" + i }),
      proc.reviewRow("run-" + i, "done", { url: "https://www.example-" + i + ".com/", step: "41 pages, 7 findings", link: "https://carlosandmunoz.com/qa-review.html?report=run-" + i }), 9 * MIN);
  }
  const rows = play(events);
  const ids = new Set(rows.map((r) => r.id));
  for (let i = 0; i < 30; i++) assert.ok(ids.has("agent:chat-" + i), "chat " + i + " is kept");
  for (let i = 0; i < 25; i++) assert.ok(ids.has("review:run-" + i), "review " + i + " is kept");
  jobs.forEach((job) => assert.ok(ids.has("job:" + job), job + " is kept"));
  const groups = new Set(rows.filter((r) => r.group && r.group.startsWith("gh:")).map((r) => r.group));
  assert.equal(groups.size, workflows.length + 20, "one finished row per workflow on main and per branch");
  const oldest = Math.min(...rows.map((r) => Date.parse(r.endedAt)));
  assert.ok(end - oldest > 23 * HOUR, "the oldest finished row is from the start of the day: " + new Date(oldest).toISOString());
  const bytes = JSON.stringify(proc.view(rows, end)).length;
  assert.ok(bytes < 60 * 1024 && bytes < proc.MAX_BYTES / 4, "a day is " + bytes + " bytes");
  assert.ok(rows.every((r) => r.updatedAt === undefined && r.progress === undefined && (!r.step || r.step.length <= 100)), "finished rows are compact");
});

test("past the byte budget the oldest finished rows go and every active row stays", () => {
  const now = T0 + 23 * HOUR;
  const big = (i, state) => ({ id: "agent:" + i, kind: "agent", name: "A".repeat(100), state, step: "S".repeat(160), url: "https://example.com/" + "u".repeat(400), startedAt: new Date(now - HOUR).toISOString(), updatedAt: new Date(now - (i % 60) * MIN).toISOString(), endedAt: state === "done" ? new Date(T0 + i * 20000).toISOString() : undefined });
  const rows = [];
  for (let i = 0; i < 3000; i++) rows.push(big(i, i < 20 ? "running" : "done"));
  const out = proc.prune(rows, now);
  assert.ok(JSON.stringify(out).length <= proc.MAX_BYTES);
  assert.equal(out.filter((r) => r.state === "running").length, 20);
  const kept = out.filter((r) => r.state === "done");
  assert.ok(kept.length > 100 && kept.length < 2980);
  assert.equal(kept[0].id, "agent:2999", "the newest finished row first");
  assert.equal(kept[kept.length - 1].id, "agent:" + (3000 - kept.length), "the oldest ones went");
});

test("a job that ends again with the same outcome moves its end time; the same report twice still writes nothing", async () => {
  const db = fakeDb();
  const d = deps(db);
  const run = (t) => [proc.jobRow("jarvisCountdowns", "done", { startedAt: new Date(t).toISOString(), step: "0 started (0 done), 0 waiting for daytime" })];
  await proc.report(d, run(T0));
  d.clock.t += 10 * MIN;
  assert.equal((await proc.report(d, run(T0))).changed, false);
  assert.equal((await proc.report(d, run(d.clock.t))).changed, true);
  const row = (await proc.read(db)).value.rows[0];
  assert.equal(row.endedAt, new Date(d.clock.t).toISOString());
  const long = { id: "job:x", kind: "job", name: "x", state: "done", step: "w ".repeat(120), startedAt: new Date(T0).toISOString() };
  await proc.report(d, long);
  assert.equal((await proc.report(d, long)).changed, false, "a long outcome is clipped the same way both times");
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
  const scan = Object.assign({}, RUN, { name: "PR #2906", event: "dynamic", path: "dynamic/github-code-scanning/codeql", head_branch: "refs/pull/2906/head" });
  assert.equal(proc.workflowRow({ action: "completed", workflow_run: scan }, opts), null, "code scanning of a PR is PR CI");
  assert.equal(proc.workflowRow({ action: "completed", workflow_run: Object.assign({}, scan, { name: "Push on main", head_branch: "main" }) }, opts), null);
  const gate = proc.workflowRow({ action: "in_progress", workflow_run: Object.assign({}, RUN, { status: "waiting" }) }, opts);
  assert.deepEqual([gate.state, gate.needsYou], ["waiting", true]);
});

test("a run's late in_progress does not reopen it; a re-run and a new Cursor turn do", async () => {
  const db = fakeDb();
  const d = deps(db);
  const opts = { isDeploy: github.isDeploy };
  const done = Object.assign({}, RUN, { status: "completed", conclusion: "success" });
  await proc.report(d, proc.workflowRow({ action: "completed", workflow_run: done }, opts));
  d.clock.t += MIN;
  assert.equal((await proc.report(d, proc.workflowRow({ action: "in_progress", workflow_run: RUN }, opts))).changed, false);
  const rerun = Object.assign({}, RUN, { run_attempt: 2, run_started_at: "2026-11-09T05:10:00Z" });
  await proc.report(d, proc.workflowRow({ action: "in_progress", workflow_run: rerun }, opts));
  assert.equal((await proc.read(db)).value.rows[0].state, "running");
  await proc.report(d, { id: "agent:c", kind: "agent", name: "Chat", state: "done" });
  d.clock.t += MIN;
  await proc.report(d, { id: "agent:c", kind: "agent", name: "Chat", state: "running", startedAt: new Date(d.clock.t).toISOString() });
  assert.equal((await proc.read(db)).value.rows.find((r) => r.id === "agent:c").state, "running");
});

test("runs that finished without their webhook are settled from the Actions list", async () => {
  const db = fakeDb();
  const d = deps(db);
  const opts = { isDeploy: github.isDeploy };
  await proc.report(d, proc.workflowRow({ action: "in_progress", workflow_run: RUN }, opts));
  assert.equal(await proc.settleRuns(d, [RUN], opts), "runs: none finished");
  d.clock.t += 5 * MIN;
  const note = await proc.settleRuns(d, [Object.assign({}, RUN, { status: "completed", conclusion: "failure" }), Object.assign({}, RUN, { id: 5, status: "completed", conclusion: "success" })], opts);
  assert.equal(note, "runs: 1 settled");
  const { value } = await proc.read(db);
  assert.deepEqual(value.rows.map((r) => [r.id, r.state]), [["gh:99", "failed"]]);
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

test("the Cursor hook installs as a user hook beside the others, once, and uninstalls cleanly", () => {
  const hook = require("../../.cursor/hooks/jarvis-process.js");
  const dir = fs.mkdtempSync(path.join(require("node:os").tmpdir(), "cursor-hooks-"));
  fs.writeFileSync(path.join(dir, "hooks.json"), JSON.stringify({ version: 1, hooks: { stop: [{ command: "./hooks/cursor-quota.sh", timeout: 5 }] } }));
  hook.install(dir);
  hook.install(dir);
  const config = JSON.parse(fs.readFileSync(path.join(dir, "hooks.json"), "utf8"));
  assert.deepEqual(config.hooks.stop.map((h) => h.command), ["./hooks/cursor-quota.sh", "node ./hooks/jarvis-process.js stop"]);
  assert.deepEqual(config.hooks.beforeSubmitPrompt.map((h) => h.command), ["node ./hooks/jarvis-process.js beforeSubmitPrompt"]);
  assert.ok(fs.existsSync(path.join(dir, "hooks", "jarvis-process.js")));
  hook.install(dir, true);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(dir, "hooks.json"), "utf8")).hooks, { stop: [{ command: "./hooks/cursor-quota.sh", timeout: 5 }] });
  assert.equal(fs.existsSync(path.join(dir, "hooks", "jarvis-process.js")), false);
  const project = JSON.parse(fs.readFileSync(path.join(__dirname, "../../.cursor/hooks.json"), "utf8"));
  assert.doesNotMatch(JSON.stringify(project), /jarvis-process/, "a chat opened on a worktree does not send twice");
  fs.rmSync(dir, { recursive: true, force: true });
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
  assert.doesNotMatch(html, /data-proc-all/, "no All button for a few finished rows");
  const day = { rows: Array.from({ length: 20 }, (_, i) => ({ id: "job:" + i, kind: "job", name: "Job " + i, state: "done", endedAt: new Date(now - i * HOUR).toISOString() })) };
  const few = P.processesHtml(day, now, esc);
  assert.equal((few.match(/class="jv-proc /g) || []).length, P.RECENT, "eight finished rows, as in the app");
  assert.match(few, /data-proc-all>All 20</);
  const all = P.processesHtml(day, now, esc, { all: true });
  assert.equal((all.match(/class="jv-proc /g) || []).length, 20);
  assert.match(all, /data-proc-all>Fewer</);

  const src = fs.readFileSync(path.join(__dirname, "../../js/admin-jarvis.js"), "utf8");
  assert.ok(src.includes("split(',').includes('processes') && await loadProcesses()"), "a processes push fetches only processes");
  assert.ok(src.includes("call('processes')"));
  assert.ok(src.includes("Proc.tick(root, Date.now())"), "the clocks tick every second");
  assert.ok(src.includes("${processesPanel(false)}${briefPanel('systems')}"), "Systems leads with Processes");
});
