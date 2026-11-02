const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const actions = require("../../functions/jarvis-actions");
const jarvis = require("../../functions/jarvis");
const core = require("../../js/admin-jarvis-core.js");
const countdown = require("../../functions/jarvis-countdown");
const pagespeed = require("../../functions/jarvis-pagespeed");
const { fakeDb } = require("./fake-jarvis-db");

// Monday 2026-10-26 10:00 Bogotá is 15:00 UTC.
const MONDAY_10 = Date.parse("2026-10-26T15:00:00Z");
const SUNDAY_10 = Date.parse("2026-10-25T15:00:00Z");
const MONDAY_21 = Date.parse("2026-10-27T02:00:00Z");

const clean = (host) => ({ id: host, data: { status: "held", host, email: "a@" + host, record: { status: "complete", report: { insights: { score: { overall: 72 } } } } } });
const stopped = (host) => ({ id: host, data: { status: "held", host, email: "a@" + host, record: { status: "stopped", report: {} } } });

function fakeOps(over) {
  const calls = { release: [], resend: [], publish: 0 };
  const ops = Object.assign({
    held: async () => [],
    release: async (id, by) => { calls.release.push([id, by]); return { status: "sent", reportId: "r-" + id, mailed: true }; },
    noticesLive: true,
    failedNotices: async () => [],
    noticeBudget: async () => 20,
    resend: async (ref, by) => { calls.resend.push([ref, by]); return { outcome: "sent", email: "owner@" + ref }; },
    hubStale: async () => false,
    publishHub: async () => { calls.publish += 1; return { ran: "refreshSocialHubStats" }; }
  }, over || {});
  return { ops, calls };
}

const DEFAULT_CAPS = { "rerun-held": 10, "resend-notices": 10, "publish-hub": 2, "rerun-job": 3, "rerun-ci": 5, "refresh-stale": 6, "rerun-reviews": 2, "ai-fix": 5, "retry-social": 3, "resume-outreach": 1, "merge-pr": 3 };

test("settings: actions are on with the default caps and confidence 0.8 unless saved otherwise, caps stay within 0-100 and confidence within 0.5-1", () => {
  assert.deepEqual(actions.cleanSettings(), { auto: true, caps: DEFAULT_CAPS, confidence: 0.8, countdownHours: 2 });
  assert.deepEqual(actions.cleanSettings({ auto: false, caps: { "rerun-held": 250, "resend-notices": -3, "publish-hub": "" }, confidence: 2, countdownHours: 100 }),
    { auto: false, caps: Object.assign({}, DEFAULT_CAPS, { "rerun-held": 100, "resend-notices": 0, "publish-hub": 2 }), confidence: 1, countdownHours: 24 });
  assert.equal(actions.cleanSettings({ countdownHours: 0.1 }).countdownHours, 0.25);
  assert.equal(actions.cleanSettings({ countdownHours: "1.6" }).countdownHours, 1.5);
  assert.equal(actions.cleanSettings({ confidence: 0.2 }).confidence, 0.5);
  assert.deepEqual(jarvis.normalizeSettings({}).actions, actions.cleanSettings());
});

test("a held re-run is clean only with a complete report, a score and an asker's address", () => {
  assert.equal(actions.cleanRerun(clean("a.co").data).ok, true);
  assert.match(actions.cleanRerun(stopped("b.co").data).reason, /stopped/);
  assert.match(actions.cleanRerun({ status: "held", email: "x@y.co", record: { status: "complete", report: {} } }).reason, /no score/);
  assert.match(actions.cleanRerun(Object.assign({}, clean("c.co").data, { email: "" })).reason, /no asker/);
  assert.match(actions.cleanRerun(Object.assign({}, clean("d.co").data, { mailError: "boom" })).reason, /mail failed/);
});

test("owner notices go out Monday to Saturday between 08:00 and 19:00 Bogotá", () => {
  assert.equal(actions.noticeHours(MONDAY_10), true);
  assert.equal(actions.noticeHours(SUNDAY_10), false);
  assert.equal(actions.noticeHours(MONDAY_21), false);
  assert.equal(actions.noticeHours(Date.parse("2026-10-31T23:30:00Z")), true, "Saturday 18:30");
});

test("the hourly pass puts clean held re-runs on the countdown up to the cap and logs the rest as waiting", async () => {
  const db = fakeDb();
  const { ops, calls } = fakeOps({ held: async () => [clean("a.co"), stopped("b.co"), clean("c.co"), clean("d.co")] });
  const out = await actions.autoRun({ db, now: MONDAY_10, settings: { actions: { caps: { "rerun-held": 2 } } }, ops });
  assert.deepEqual(calls.release, [], "third-party email waits for the countdown");
  assert.deepEqual(out.queued.map((r) => [r.action, r.kind, r.count, r.payload.items.map((i) => i.id)]), [["rerun-held", "email", 2, ["a.co", "c.co"]]]);
  assert.deepEqual(out.waiting.map((w) => [w.count, w.reason]), [[1, "Over today's cap of 2."], [1, "Not clean: the report stopped."]]);
  const again = await actions.autoRun({ db, now: MONDAY_10 + 3600000, settings: { actions: { caps: { "rerun-held": 2 } } }, ops });
  assert.equal(again.queued.length, 0, "the cap counts what is already on the countdown");
  assert.equal(db.added.filter((r) => r.status === "waiting").length, 2, "a wait is logged once a day per reason");
  assert.ok(db.added.every((r) => r.day === "2026-10-26" && r.mode === "auto"));
  await countdown.runDue({ db, now: MONDAY_10 + 2 * 3600000, ops });
  assert.deepEqual(calls.release, [["a.co", "jarvis"], ["c.co", "jarvis"]]);
});

test("failed notices go on the countdown within the notice budget, and wait for the notice hours", async () => {
  const notices = async () => ["x.co", "y.co", "z.co"].map((d) => ({ id: d, ref: d, data: { domain: d } }));
  const sunday = fakeOps({ failedNotices: notices });
  const db = fakeDb();
  const off = await actions.autoRun({ db, now: SUNDAY_10, settings: {}, ops: sunday.ops });
  assert.equal(sunday.calls.resend.length, 0);
  assert.equal(off.queued[0].action, "resend-notices");
  const held = await countdown.runDue({ db, now: SUNDAY_10 + 3 * 3600000, ops: sunday.ops });
  assert.deepEqual(held.held, [off.queued[0].id], "Sunday: it waits for Monday 08:00");

  const monday = fakeOps({ failedNotices: notices, noticeBudget: async () => 2 });
  const on = await actions.autoRun({ db: fakeDb(), now: MONDAY_10, settings: {}, ops: monday.ops });
  assert.deepEqual(on.queued[0].payload.items.map((i) => i.id), ["x.co", "y.co"]);
  assert.deepEqual(on.waiting, [{ action: "resend-notices", count: 1, reason: "Today's owner-notice budget is used." }]);

  const dark = fakeOps({ failedNotices: notices, noticesLive: false });
  await actions.autoRun({ db: fakeDb(), now: MONDAY_10, settings: {}, ops: dark.ops });
  assert.equal(dark.calls.resend.length, 0, "nothing goes out while OWNER_NOTICES_LIVE is off");
});

test("a stale hub is published at most twice a day, and the master switch stops everything", async () => {
  const db = fakeDb();
  const { ops, calls } = fakeOps({ hubStale: async () => true, held: async () => [clean("a.co")] });
  for (let i = 0; i < 3; i++) await actions.autoRun({ db, now: MONDAY_10 + i * 3600000, settings: {}, ops });
  assert.equal(calls.publish, 2);
  assert.ok(db.added.some((r) => r.action === "publish-hub" && r.status === "waiting"));
  const quiet = fakeOps({ hubStale: async () => true, held: async () => [clean("a.co")] });
  const out = await actions.autoRun({ db: fakeDb(), now: MONDAY_10, settings: { actions: { auto: false } }, ops: quiet.ops });
  assert.equal(out.off, true);
  assert.equal(quiet.calls.publish + quiet.calls.release.length, 0);
});

test("a failed action is logged as failed and does not stop the pass", async () => {
  const db = fakeDb();
  const { ops } = fakeOps({ hubStale: async () => true, failedJobs: async () => [{ job: "sweepDaily", endedAt: "2026-10-26T14:00:00Z", error: "x" }], runJob: async () => { throw new Error("Scheduler down"); } });
  const out = await actions.autoRun({ db, now: MONDAY_10, settings: {}, ops });
  assert.equal(db.added.find((r) => r.action === "rerun-job").status, "failed");
  assert.equal(out.done[0].action, "publish-hub");
});

test("summary, push and the briefing lines say what Jarvis did, what is on the countdown and what waits", async () => {
  const db = fakeDb();
  const { ops } = fakeOps({ held: async () => [clean("a.co"), stopped("b.co")], hubStale: async () => true });
  const out = await actions.autoRun({ db, now: MONDAY_10, settings: {}, ops });
  assert.equal(actions.summary(out), "publish the social hub 1; 1 on the countdown; 1 waiting for a click");
  const push = actions.pushMessage(out);
  assert.equal(push.title, "Jarvis acted: 1 action");
  assert.equal(push.tab, "systems");
  assert.equal(push.kind, "alerts");
  assert.equal(actions.pushMessage({ done: [] }), null);
  const lines = actions.briefLines(await actions.recent(db, 50), MONDAY_10 + 3600000);
  assert.deepEqual(lines, [
    "Jarvis did: publish the social hub x1.",
    "Waiting for your click: send held re-runs (1). Not clean: the report stopped."
  ]);
});

test("failing-job proposals carry the job names for Run again", () => {
  const list = core.proposalRules({ products: {}, external: { health: { ok: true, jobs: [{ job: "sweepReviews", ok: false, error: "quota" }, { job: "rivalSweep", ok: false }], failures: { total: 0 }, reruns: { held: 0 } } } });
  assert.deepEqual(list.find((p) => p.key === "job").jobs, ["sweepReviews", "rivalSweep"]);
});

test("index.js runs the actions in jarvisWatch, logs clicked ops and shares the desk's release", () => {
  const index = fs.readFileSync(path.join(__dirname, "../../functions/index.js"), "utf8");
  assert.match(index, /exports\.jarvisWatch = scheduled\([^]*?jarvisAutoActions\(\)/);
  assert.match(index, /op === "action-run"/);
  assert.match(index, /op === "actions"/);
  assert.match(index, /const out = await releaseHeldRerun\(id, req\.body && req\.body\.send === true, operator\);/);
  assert.match(index, /release: \(id, by\) => releaseHeldRerun\(id, true, by\)/);
  assert.match(index, /JARVIS_LOGGED\[op\]/);
});

// --- #1977: the new automatic actions -------------------------------------------------------------------------

function autoOps(over) {
  const calls = { jobs: [], reruns: [], ci: [], paused: [], pauses: {}, asked: 0, saved: [] };
  const { ops } = fakeOps(Object.assign({
    runJob: async (job) => { calls.jobs.push(job); return { ran: job }; },
    failedJobs: async () => [],
    overdueJobs: async () => [],
    failedCi: async () => [],
    rerunRun: async (id) => { calls.reruns.push(id); return { run: id }; },
    rerunCi: async (w) => { calls.ci.push(w); return { workflow: w }; },
    reviewFix: async () => null,
    pauseMailbox: async (email) => { calls.paused.push(email); },
    setPause: async (email, row) => { if (row) calls.pauses[email] = row; else delete calls.pauses[email]; }
  }, over || {}));
  return { ops, calls };
}

test("a failed job is re-run once per failed run, and an overdue job once a day", async () => {
  const db = fakeDb();
  const { ops, calls } = autoOps({
    failedJobs: async () => [{ job: "sweepDaily", endedAt: "2026-10-26T14:00:00Z", error: "boom" }],
    overdueJobs: async () => [{ job: "sweepDaily", why: "late" }, { job: "socialDigest", why: "last ended 2026-10-24" }]
  });
  const first = await actions.autoRun({ db, now: MONDAY_10, settings: {}, ops });
  assert.deepEqual(calls.jobs, ["sweepDaily", "socialDigest"]);
  assert.deepEqual(first.done.map((r) => r.action), ["rerun-job", "refresh-stale"]);
  await actions.autoRun({ db, now: MONDAY_10 + 3600000, settings: {}, ops });
  assert.deepEqual(calls.jobs, ["sweepDaily", "socialDigest"]);
});

test("failed CI is re-run once, only on main or a Jarvis branch and only on its first attempt", async () => {
  const db = fakeDb();
  const { ops, calls } = autoOps({ failedCi: async () => [
    { id: 1, name: "Tests", branch: "main", attempt: 1 }, { id: 2, name: "Tests", branch: "fix/123-other-chat", attempt: 1 },
    { id: 3, name: "Lint", branch: "main", attempt: 2 }, { id: 4, name: "Lint Code", branch: "pagespeed/safe-2026-10-26", attempt: 1 },
    { id: 5, name: "playwright", branch: "pagespeed/ai-2026-10-26", attempt: 1 }, { id: 6, name: "Tests", branch: "jarvis/fix-cache", attempt: 1 },
    { id: 7, name: "Tests", branch: "feat/1978-pagespeed-daily", attempt: 1 }, { id: 8, name: "Tests", branch: "fix/jarvis/oops", attempt: 1 }
  ] });
  await actions.autoRun({ db, now: MONDAY_10, settings: {}, ops });
  await actions.autoRun({ db, now: MONDAY_10 + 3600000, settings: {}, ops });
  assert.deepEqual(calls.reruns, [1, 4, 5, 6]);
});

test("every branch the PageSpeed routine creates is one Jarvis re-runs CI on", () => {
  for (const kind of ["safe", "ai"]) {
    const branch = "pagespeed/" + kind + "-2026-11-02";
    assert.ok(pagespeed.BRANCH.test(branch));
    assert.ok(actions.JARVIS_BRANCH.test(branch), branch);
  }
  const workflow = fs.readFileSync(path.join(__dirname, "../../.github/workflows/pagespeed-daily.yml"), "utf8");
  assert.match(workflow, /--branch "pagespeed\/\$\{\{ matrix\.kind \}\}-\$\(date -u \+%F\)"/);
  assert.ok(!actions.JARVIS_BRANCH.test("feat/1977-jarvis-countdown"), "another chat's branch");
});

test("rerunReviewFailures starts when a fix is newer than its last run, once per fix", async () => {
  const db = fakeDb();
  let fix = { fixAt: "2026-10-26T12:00:00.000Z", ref: "#1999", lastRun: "2026-10-26T06:30:00.000Z" };
  const { ops, calls } = autoOps({ reviewFix: async () => fix });
  await actions.autoRun({ db, now: MONDAY_10, settings: {}, ops });
  await actions.autoRun({ db, now: MONDAY_10 + 3600000, settings: {}, ops });
  assert.deepEqual(calls.jobs, ["rerunReviewFailures"]);
  fix = Object.assign({}, fix, { lastRun: "2026-10-27T06:30:00.000Z" });
  await actions.autoRun({ db: fakeDb(), now: MONDAY_10, settings: {}, ops });
  assert.deepEqual(calls.jobs, ["rerunReviewFailures"]);
});

test("Pause outreach pauses the sick mailboxes, else every active one on the domain, never one Jarvis already paused (#1977)", () => {
  const box = (email, extra) => Object.assign({ email, status: "active", warmup: "on", score: 95 }, extra);
  const o = { domain: "qalabreview.com", failing: [], warmupMin: 80, pauses: [{ email: "c@qalabreview.com" }],
    mailboxes: [box("a@qalabreview.com", { score: 60 }), box("b@qalabreview.com"), box("c@qalabreview.com", { warmup: "off" }), box("d@other.com"), box("e@qalabreview.com", { status: "paused" })] };
  assert.deepEqual(actions.pauseTargets(o), [{ email: "a@qalabreview.com", why: "warm-up score 60 under 80" }]);
  const bounces = Object.assign({}, o, { mailboxes: o.mailboxes.filter((m) => m.email !== "a@qalabreview.com") });
  assert.deepEqual(actions.pauseTargets(bounces).map((m) => m.email), ["b@qalabreview.com"], "no sick one: the domain's active mailboxes");
  assert.deepEqual(actions.pauseTargets(null), []);
});

test("a mailbox problem is its domain's DNS, an error, warm-up off or a low score", () => {
  const o = { domain: "qalabreview.com", failing: [], warmupMin: 80 };
  const ok = { email: "a@qalabreview.com", status: "active", warmup: "on", score: 95 };
  assert.equal(actions.mailboxProblem(ok, o), "");
  assert.match(actions.mailboxProblem(ok, Object.assign({}, o, { failing: ["DKIM"] })), /DNS on qalabreview.com fails: DKIM/);
  assert.equal(actions.mailboxProblem(Object.assign({}, ok, { email: "a@other.com" }), Object.assign({}, o, { failing: ["DKIM"] })), "");
  assert.match(actions.mailboxProblem(Object.assign({}, ok, { warmup: "off" }), o), /warm-up off/);
  assert.match(actions.mailboxProblem(Object.assign({}, ok, { score: 60 }), o), /score 60 under 80/);
});

test("outreach: only the failing domain's active mailboxes pause; resuming goes on the countdown after two healthy checks", async () => {
  const db = fakeDb();
  let failing = ["SPF"];
  const boxes = [{ email: "a@qalabreview.com", status: "active", warmup: "on", score: 90 }, { email: "b@elsewhere.com", status: "active", warmup: "on", score: 90 }];
  const { ops, calls } = autoOps({ outreach: async () => ({ domain: "qalabreview.com", failing, warmupMin: 80, mailboxes: boxes, pauses: Object.values(calls.pauses) }) });
  const first = await actions.autoRun({ db, now: MONDAY_10, settings: {}, ops });
  assert.deepEqual(calls.paused, ["a@qalabreview.com"]);
  assert.equal(first.done[0].action, "pause-outreach");
  boxes[0].status = "paused";
  failing = [];
  await actions.autoRun({ db, now: MONDAY_10 + 3600000, settings: {}, ops });
  assert.equal(calls.pauses["a@qalabreview.com"].passes, 1);
  const third = await actions.autoRun({ db, now: MONDAY_10 + 7200000, settings: {}, ops });
  assert.equal(calls.pauses["a@qalabreview.com"].passes, 2);
  assert.deepEqual(third.queued.map((r) => [r.action, r.kind, r.payload.emails]), [["resume-outreach", "outreach", ["a@qalabreview.com"]]]);
  assert.deepEqual(calls.paused, ["a@qalabreview.com"]);
});

test("failed social posts go on the countdown as a public post", async () => {
  const { ops } = autoOps({ socialFailed: async () => 2 });
  const out = await actions.autoRun({ db: fakeDb(), now: MONDAY_10, settings: {}, ops });
  assert.deepEqual(out.queued.map((r) => [r.action, r.target, r.kind]), [["retry-social", "2 failed social posts", "post"]]);
});

test("a confident AI pick that mails, posts or deploys goes on the countdown with its confidence", async () => {
  const { ops, calls } = autoOps({
    alerts: async () => [{ key: "mail:owner-queue", level: "alert", text: "Owner notices stuck" }],
    catalog: async () => ({ jobs: ["sendOwnerNotices"], workflows: [] }),
    ask: async () => JSON.stringify([{ key: "mail:owner-queue", action: "run-job", args: { job: "sendOwnerNotices" }, confidence: 0.92, title: "Send notices", why: "The queue is stuck." }])
  });
  const out = await actions.autoRun({ db: fakeDb(), now: MONDAY_10, settings: {}, ops });
  assert.deepEqual(calls.jobs, []);
  assert.deepEqual(out.queued.map((r) => [r.action, r.by, r.confidence, r.kind, r.payload.target]), [["ai-fix", "gemini", 0.92, "email", "sendOwnerNotices"]]);
});

test("the AI picks only from the catalog; confident picks run, the rest become proposals, and one alert set is asked once a day", async () => {
  const db = fakeDb();
  const alerts = [{ key: "job:sweepDaily", level: "warn", text: "handled by rerun-job" }, { key: "uptime:down", level: "alert", text: "Site down" }, { key: "money:refund", level: "warn", text: "Refund" }, { key: "goal:x", level: "info", text: "fyi" }];
  let prompt = "";
  const { ops, calls } = autoOps({
    failedJobs: async () => [{ job: "sweepDaily", endedAt: "2026-10-26T14:00:00Z", error: "boom" }],
    alerts: async () => alerts,
    catalog: async () => ({ jobs: ["uptimeCheck", "sweepDaily"], workflows: ["Tests"] }),
    ask: async (p) => { calls.asked += 1; prompt = p; return "```json\n" + JSON.stringify([
      { key: "uptime:down", action: "run-job", args: { job: "uptimeCheck" }, confidence: 0.9, title: "Check uptime", why: "The check is stale." },
      { key: "money:refund", action: "refund", args: {}, confidence: 0.99, title: "Refund the order", why: "Refunds wait for a click." },
      { key: "made:up", action: "publish-hub", args: {}, confidence: 1, title: "x", why: "y" }
    ]) + "\n```"; },
    saveProposals: async (rows) => { calls.saved.push(...rows); }
  });
  const out = await actions.autoRun({ db, now: MONDAY_10, settings: {}, ops });
  assert.doesNotMatch(prompt, /job:sweepDaily|goal:x/);
  assert.deepEqual(calls.jobs, ["sweepDaily", "uptimeCheck"]);
  assert.ok(out.done.some((r) => r.action === "ai-fix" && r.target === "run-job uptimeCheck"));
  assert.deepEqual(calls.saved.map((p) => [p.key, p.reason]), [["money:refund", "not in the catalog"]]);
  await actions.autoRun({ db, now: MONDAY_10 + 3600000, settings: {}, ops });
  assert.equal(calls.asked, 1);
});

test("an AI pick under the confidence setting is kept as a proposal", async () => {
  const { ops, calls } = autoOps({
    alerts: async () => [{ key: "uptime:down", level: "alert", text: "Site down" }],
    catalog: async () => ({ jobs: ["uptimeCheck"], workflows: [] }),
    ask: async () => JSON.stringify([{ key: "uptime:down", action: "run-job", args: { job: "uptimeCheck" }, confidence: 0.85, title: "Check uptime", why: "Stale." }]),
    saveProposals: async (rows) => { calls.saved.push(...rows); }
  });
  await actions.autoRun({ db: fakeDb(), now: MONDAY_10, settings: { actions: { confidence: 0.9 } }, ops });
  assert.deepEqual(calls.jobs, []);
  assert.match(calls.saved[0].reason, /confidence 0.85 under 0.9/);
});
