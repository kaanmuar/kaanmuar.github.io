const test = require("node:test");
const assert = require("node:assert/strict");
const countdown = require("../../functions/jarvis-countdown");
const actions = require("../../functions/jarvis-actions");
const mailPush = require("../../functions/jarvis-mail-push");
const { fakeDb } = require("./fake-jarvis-db");

// Monday 2026-10-26 10:00 Bogotá is 15:00 UTC; Bogotá keeps UTC-5.
const H = 3600000;
const MONDAY_10 = Date.parse("2026-10-26T15:00:00Z");
const MONDAY_20 = Date.parse("2026-10-27T01:00:00Z");
const SATURDAY_20 = Date.parse("2026-10-31T01:00:00Z") + 24 * H;
const line = (key, level) => ({ key, level: level || "alert", product: "systems", text: key });
const clean = (host) => ({ id: host, data: { status: "held", host, email: "a@" + host, record: { status: "complete", report: { insights: { score: { overall: 72 } } } } } });

function ops(over) {
  const calls = { jobs: [], ci: [], release: [], resend: [], merged: [], resumed: [], posted: 0, pushes: [], pause: [] };
  const o = Object.assign({
    held: async () => [], release: async (id) => { calls.release.push(id); return { status: "sent" }; },
    noticesLive: true, failedNotices: async () => [], noticeBudget: async () => 20,
    resend: async (ref) => { calls.resend.push(ref); return { outcome: "sent", email: "o@" + ref }; },
    hubStale: async () => false, publishHub: async () => ({}),
    runJob: async (name) => { calls.jobs.push(name); return { ran: name }; },
    rerunCi: async (name) => { calls.ci.push(name); return { run: 41 }; },
    sending: true, pauseOutreach: async () => ({ paused: [] }), dropCache: async () => ({}), fixes: [], gemini: null,
    rerunRun: async (id) => { calls.ci.push(id); return {}; },
    retrySocial: async () => { calls.posted += 1; return { note: "Buffer batch started, Facebook Page queue started." }; },
    resumeMailboxes: async (emails) => { calls.resumed.push(emails); return { resumed: emails, left: [] }; },
    pagespeedMerge: async (n, sha) => { calls.merged.push(["pagespeed", n, sha]); return { message: "Merging #" + n + "; Jarvis pushes the result." }; },
    mergePr: async (n, sha) => { calls.merged.push([n, sha]); return { merged: true, sha: "abc1234ff" }; },
    push: async (msg) => { calls.pushes.push(msg); return { sent: 1 }; }
  }, over || {});
  return { ops: o, calls };
}

const queue = (db, entry, now) => countdown.queue(db, entry, { now: now || MONDAY_10, hours: 2 });

test("each risky action has its kind: email, post, code, outreach, repo; anything else is money and has no action", () => {
  assert.equal(countdown.kindOf("rerun-held"), "email");
  assert.equal(countdown.kindOf("resend-notices"), "email");
  assert.equal(countdown.kindOf("launch-campaign"), "email");
  assert.equal(countdown.kindOf("run-job", "sendOwnerNotices"), "email");
  assert.equal(countdown.kindOf("run-job", "dispatchFacebookQueue"), "post");
  assert.equal(countdown.kindOf("rerun-ci", "Buffer batch"), "post");
  assert.equal(countdown.kindOf("rerun-ci", "Pages"), "code");
  assert.equal(countdown.kindOf("rerun-ci", "Jarvis Android"), "code");
  assert.equal(countdown.kindOf("merge-pr"), "code");
  assert.equal(countdown.kindOf("rerun-job", "sendOwnerNotices"), "email");
  assert.equal(countdown.kindOf("refresh-stale", "ensureLiveReportsBatch"), "post");
  assert.equal(countdown.kindOf("retry-social"), "post");
  assert.equal(countdown.kindOf("resume-outreach"), "outreach");
  assert.equal(countdown.kindOf("gh-revert"), "code");
  assert.equal(countdown.kindOf("gh-merge-pr"), "code");
  assert.equal(countdown.kindOf("gh-delete-branch"), "repo");
  assert.equal(countdown.kindOf("gh-remove-worktree"), "repo");
  assert.equal(countdown.kindOf("payout"), "money");
  assert.deepEqual(Object.keys(countdown.KINDS), ["email", "post", "code", "outreach", "repo", "money"]);
});

test("a countdown is queued once a day per action and target, due after the set hours", async () => {
  const db = fakeDb();
  const first = await queue(db, { action: "rerun-ci", target: "Pages", key: "ci:Pages", why: "CI Pages on main is failure." });
  assert.equal(first.row.status, "waiting");
  assert.equal(first.row.dueAt, "2026-10-26T17:00:00.000Z");
  assert.equal(first.row.label, "Re-run failed CI jobs");
  assert.equal(first.row.kind, "code");
  const again = await queue(db, { action: "rerun-ci", target: "Pages" }, MONDAY_10 + H);
  assert.equal(again.row, undefined);
  assert.equal(again.existing.id, first.row.id);
  const half = await countdown.queue(fakeDb(), { action: "rerun-ci", target: "Pages" }, { now: MONDAY_10, hours: 0.5 });
  assert.equal(half.row.dueAt, "2026-10-26T15:30:00.000Z");
});

test("the queued push says when, with Do it now and Cancel on signed buttons", async () => {
  const db = fakeDb();
  const { row } = await queue(db, { action: "rerun-ci", target: "Pages", why: "CI Pages on main is failure." });
  const msg = countdown.queuedMessage(row, 2);
  assert.equal(msg.title, "Doing re-run failed CI jobs in 2 h");
  assert.equal(msg.ref, "countdown:" + row.id);
  assert.equal(msg.tag, "jarvis-countdown-" + row.id);
  assert.deepEqual(msg.actions, [{ act: "now", label: "Do it now" }, { act: "cancel", label: "Cancel" }]);
  assert.deepEqual(mailPush.parseAct(msg.ref, "now"), { type: "countdown", id: row.id, act: "now" });
  assert.deepEqual(mailPush.parseAct(msg.ref, "cancel"), { type: "countdown", id: row.id, act: "cancel" });
  const night = await queue(db, { action: "retry-social", target: "2 failed social posts" }, MONDAY_20);
  assert.equal(countdown.queuedMessage(night.row, 2).title, "Doing retry failed social posts at 08:00 Bogotá", "due at 22:00, a post waits for the morning");
  assert.equal(countdown.queuedMessage(row, 0.5).title, "Doing re-run failed CI jobs in 30 min");
});

test("a due countdown runs, pushes when it starts and with the result, and is logged so the fix is checked", async () => {
  const db = fakeDb();
  const { row } = await queue(db, { action: "rerun-job", target: "ensureLiveReportsBatch @ 2026-10-26T14:00:00Z", payload: { job: "ensureLiveReportsBatch" } });
  const { ops: o, calls } = ops();
  const early = await countdown.runDue({ db, now: MONDAY_10 + H, ops: o });
  assert.equal(early.started.length, 0);
  const due = await countdown.runDue({ db, now: MONDAY_10 + 2 * H + 60000, ops: o });
  assert.deepEqual(calls.jobs, ["ensureLiveReportsBatch"]);
  assert.equal(due.started[0].status, "done");
  assert.equal(db.doc("jarvis_countdowns", row.id).status, "done");
  assert.deepEqual(calls.pushes.map((m) => m.title), ["Doing re-run a failed job now", "Done: re-run a failed job"]);
  assert.ok(calls.pushes.every((m) => m.tag === "jarvis-countdown-" + row.id), "the same notification updates");
  const logged = db.added.find((r) => r._c === "jarvis_actions");
  assert.deepEqual([logged.action, logged.mode, logged.status, logged.by], ["rerun-job", "auto", "done", "jarvis (countdown)"]);
  assert.match(logged.detail, /^After the countdown: Started ensureLiveReportsBatch\./);
  assert.equal(countdown.summary(due), "1 started (1 done), 0 waiting for daytime");
});

test("at night email and posts wait for 08:00-21:00 Bogotá; code runs right away", async () => {
  const db = fakeDb();
  const mail = (await queue(db, { action: "run-job", target: "sendReviewNotes" }, MONDAY_20)).row;
  const post = (await queue(db, { action: "rerun-ci", target: "Buffer batch" }, MONDAY_20)).row;
  const code = (await queue(db, { action: "rerun-ci", target: "Pages" }, MONDAY_20)).row;
  const { ops: o, calls } = ops();
  const night = await countdown.runDue({ db, now: MONDAY_20 + 2 * H + 60000, ops: o });
  assert.deepEqual(calls.ci, ["Pages"]);
  assert.deepEqual(night.held.sort(), [mail.id, post.id].sort());
  assert.equal(db.doc("jarvis_countdowns", mail.id).hold, "Email and posts wait for 08:00-21:00 Bogotá.");
  assert.equal(db.doc("jarvis_countdowns", code.id).status, "done");
  await countdown.runDue({ db, now: Date.parse("2026-10-27T13:05:00Z"), ops: o });
  assert.deepEqual(calls.jobs, ["sendReviewNotes"]);
  assert.deepEqual(calls.ci, ["Pages", "Buffer batch"]);
});

test("Do it now skips the daytime wait but not the owner-notice hours; Cancel drops it and frees the cap", async () => {
  const db = fakeDb();
  const post = (await queue(db, { action: "retry-social", target: "2 failed social posts" }, MONDAY_20)).row;
  const { ops: o, calls } = ops();
  const now = await countdown.decide(db, { id: post.id, act: "now" }, { ops: o, now: MONDAY_20 + 10 * 60000, by: "carlos@x.co" });
  assert.equal(calls.posted, 1);
  assert.match(now.message, /^Done: Buffer batch started/);
  assert.equal(db.doc("jarvis_countdowns", post.id).decidedBy, "carlos@x.co");
  assert.match(db.added.find((r) => r.action === "retry-social").by, /Do it now by carlos@x\.co/);
  await assert.rejects(countdown.decide(db, { id: post.id, act: "now" }, { ops: o, now: MONDAY_20, by: "carlos@x.co" }), /already done/);

  const notices = (await queue(db, { action: "resend-notices", target: "1 failed owner notice", payload: { items: [{ id: "x.co" }] } }, SATURDAY_20)).row;
  await assert.rejects(countdown.decide(db, { id: notices.id, act: "now" }, { ops: o, now: SATURDAY_20, by: "carlos@x.co" }), /Monday to Saturday/);
  assert.equal(db.doc("jarvis_countdowns", notices.id).status, "waiting");

  const ci = (await queue(db, { action: "rerun-ci", target: "Facebook Page", count: 1 })).row;
  assert.equal(countdown.queued(await countdown.open(db), "rerun-ci", "2026-10-26"), 1);
  const out = await countdown.decide(db, { id: ci.id, act: "cancel" }, { ops: o, now: MONDAY_10 + H, by: "carlos@x.co" });
  assert.equal(out.message, "Cancelled: re-run failed CI jobs.");
  assert.equal(countdown.queued(await countdown.open(db), "rerun-ci", "2026-10-26"), 0, "a cancelled countdown gives its slot back");
  assert.deepEqual(calls.ci, []);
  const log = db.added.find((r) => r.action === "rerun-ci" && r.status === "skipped");
  assert.deepEqual([log.mode, log.by, log.detail], ["click", "carlos@x.co", "Countdown cancelled."]);
  await assert.rejects(countdown.decide(db, { id: ci.id, act: "maybe" }, { ops: o, now: MONDAY_10, by: "c" }), /Do it now or Cancel only/);
});

test("a countdown Carlos cancelled is not queued again that day; Jarvis says it waits for him", async () => {
  const db = fakeDb();
  const { ops: o, calls } = ops({ failedCi: async () => [{ id: 7, name: "Facebook Page", branch: "main", attempt: 1 }] });
  const first = await actions.autoRun({ db, now: MONDAY_10, settings: {}, ops: o });
  assert.deepEqual(first.queued.map((r) => [r.action, r.target, r.kind, r.payload.run]), [["rerun-ci", "Facebook Page #7", "post", 7]]);
  await countdown.cancel(db, first.queued[0].id, { now: MONDAY_10 + 600000, by: "carlos@x.co" });
  const next = await actions.autoRun({ db, now: MONDAY_10 + H, settings: {}, ops: o });
  assert.equal(next.queued.length, 0);
  assert.deepEqual(calls.ci, []);

  const social = ops({ socialFailed: async () => 2 });
  const db2 = fakeDb();
  const queued = await actions.autoRun({ db: db2, now: MONDAY_10, settings: {}, ops: social.ops });
  await countdown.cancel(db2, queued.queued[0].id, { now: MONDAY_10 + 600000, by: "carlos@x.co" });
  const after = await actions.autoRun({ db: db2, now: MONDAY_10 + H, settings: {}, ops: social.ops });
  assert.equal(after.queued.length, 0);
  assert.match(after.waiting[0].reason, /2 failed social posts: you cancelled its countdown; it runs on a click\./);
});

test("risky jobs and workflows go on the countdown; the rest still run at once", async () => {
  const db = fakeDb();
  const { ops: o, calls } = ops({
    failedJobs: async () => [{ job: "sendOwnerNotices", endedAt: "2026-10-26T14:00:00Z", error: "SMTP" }, { job: "fetchTraffic", endedAt: "2026-10-26T14:00:00Z", error: "timeout" }],
    failedCi: async () => [{ id: 8, name: "Pages", branch: "main", attempt: 1 }, { id: 9, name: "Lint Code", branch: "pagespeed/safe-2026-11-02", attempt: 1 }]
  });
  const out = await actions.autoRun({ db, now: MONDAY_10, settings: {}, ops: o });
  assert.deepEqual(calls.jobs, ["fetchTraffic"]);
  assert.deepEqual(calls.ci, [9]);
  assert.deepEqual(out.queued.map((r) => [r.action, r.kind, r.payload.job || r.payload.run]), [["rerun-job", "email", "sendOwnerNotices"], ["rerun-ci", "code", 8]]);
  await countdown.runDue({ db, now: Date.parse("2026-10-26T17:05:00Z"), ops: o });
  assert.deepEqual(calls.jobs, ["fetchTraffic", "sendOwnerNotices"]);
  assert.deepEqual(calls.ci, [9, 8]);
  const again = await actions.autoRun({ db, now: MONDAY_10 + 3 * H, settings: {}, ops: o });
  assert.equal(again.queued.length, 0, "a failure that already ran on the countdown is not queued again");
});

test("failed social posts are retried on the countdown, once per failed count, inside the cap", async () => {
  const db = fakeDb();
  let failed = 2;
  const { ops: o, calls } = ops({ socialFailed: async () => failed });
  const one = await actions.autoRun({ db, now: MONDAY_10, settings: {}, ops: o });
  assert.deepEqual(one.queued.map((r) => [r.action, r.target, r.kind]), [["retry-social", "2 failed social posts", "post"]]);
  assert.equal((await actions.autoRun({ db, now: MONDAY_10 + H, settings: {}, ops: o })).queued.length, 0, "one at a time");
  await countdown.runDue({ db, now: MONDAY_10 + 2 * H, ops: o });
  assert.equal(calls.posted, 1);
  assert.equal((await actions.autoRun({ db, now: MONDAY_10 + 3 * H, settings: {}, ops: o })).queued.length, 0, "the same failures are not retried twice");
  failed = 3;
  assert.equal((await actions.autoRun({ db, now: MONDAY_10 + 4 * H, settings: {}, ops: o })).queued.length, 1);
  const capped = await actions.autoRun({ db: fakeDb(), now: MONDAY_10, settings: { actions: { caps: { "retry-social": 0 } } }, ops: o });
  assert.match(capped.waiting[0].reason, /Over today's cap of 0/);
});

test("the countdown checks the action's rules again when it runs: clean re-runs only, inside the notice budget", async () => {
  const db = fakeDb();
  const stale = { id: "b.co", data: Object.assign({}, clean("b.co").data, { mailError: "boom" }) };
  const { ops: o, calls } = ops({ held: async () => [clean("a.co"), stale], failedNotices: async () => ["x.co", "y.co"].map((d) => ({ id: d, ref: d, data: { domain: d } })), noticeBudget: async () => 1 });
  const held = (await queue(db, { action: "rerun-held", target: "3 held re-runs", count: 3, payload: { items: [{ id: "a.co" }, { id: "b.co" }, { id: "gone.co" }] } })).row;
  const notices = (await queue(db, { action: "resend-notices", target: "2 failed owner notices", count: 2, payload: { items: [{ id: "x.co" }, { id: "y.co" }] } })).row;
  await countdown.runDue({ db, now: MONDAY_10 + 2 * H, ops: o });
  assert.deepEqual(calls.release, ["a.co"]);
  assert.equal(db.doc("jarvis_countdowns", held.id).result, "Sent 1 of 3 to the askers; left: b.co: the last mail failed.");
  assert.deepEqual(calls.resend, ["x.co"]);
  assert.equal(db.doc("jarvis_countdowns", notices.id).result, "Sent 1 of 2; today's notice budget ran out.");
});

test("a mailbox Jarvis paused resumes on the countdown after two healthy checks, and trouble coming back cancels it", async () => {
  const db = fakeDb();
  const email = "ana@qalabreview.com";
  const pauses = new Map([[email, { email, domain: "qalabreview.com", reason: "warm-up off", pausedAt: "2026-10-26T09:00:00.000Z", passes: 0 }]]);
  let box = { email, status: "paused", warmup: "on", score: 98 };
  const { ops: o, calls } = ops({
    outreach: async () => ({ domain: "qalabreview.com", failing: [], warmupMin: 80, mailboxes: [box], pauses: Array.from(pauses.values()) }),
    pauseMailbox: async () => ({}), setPause: async (e, row) => { if (row) pauses.set(e, row); else pauses.delete(e); }
  });
  const one = await actions.autoRun({ db, now: MONDAY_10, settings: {}, ops: o });
  assert.equal(pauses.get(email).passes, 1);
  assert.equal(one.queued.length, 0);
  const two = await actions.autoRun({ db, now: MONDAY_10 + H, settings: {}, ops: o });
  assert.deepEqual(two.queued.map((r) => [r.action, r.kind, r.payload.emails]), [["resume-outreach", "outreach", [email]]]);
  assert.match(two.queued[0].why, /Healthy for 2 hourly checks in a row \(paused for warm-up off\)/);
  assert.equal((await actions.autoRun({ db, now: MONDAY_10 + H + 60000, settings: {}, ops: o })).queued.length, 0, "a waiting resume is not queued twice");
  box = Object.assign({}, box, { warmup: "off" });
  await actions.autoRun({ db, now: MONDAY_10 + 2 * H, settings: {}, ops: o });
  assert.equal(pauses.get(email).passes, 0);
  assert.equal(db.doc("jarvis_countdowns", two.queued[0].id).status, "cancelled");
  assert.match(db.doc("jarvis_countdowns", two.queued[0].id).result, /trouble came back/);

  box = Object.assign({}, box, { warmup: "on" });
  await actions.autoRun({ db, now: MONDAY_10 + 3 * H, settings: {}, ops: o });
  const again = await actions.autoRun({ db, now: MONDAY_10 + 4 * H, settings: {}, ops: o });
  assert.equal(again.queued.length, 1, "a new healthy streak gets a new countdown");
  await countdown.runDue({ db, now: MONDAY_10 + 6 * H, ops: o });
  assert.deepEqual(calls.resumed, [[email]]);
  assert.equal(db.doc("jarvis_countdowns", again.queued[0].id).result, "Resumed " + email + ".");
});

test("a safe PageSpeed PR merges through its workflow from the countdown", async () => {
  const db = fakeDb();
  const { ops: o, calls } = ops();
  const { row } = await queue(db, { action: "merge-pr", kind: "code", target: "#2210", label: "Merge PageSpeed fixes #2210", payload: { number: 2210, sha: "fe12", pagespeed: true } }, MONDAY_20);
  assert.equal(countdown.queuedMessage(row, 2).title, "Doing merge PageSpeed fixes #2210 in 2 h");
  await countdown.runDue({ db, now: MONDAY_20 + 2 * H, ops: o });
  assert.deepEqual(calls.merged, [["pagespeed", 2210, "fe12"]], "code runs at night");
  assert.equal(db.doc("jarvis_countdowns", row.id).result, "Merging #2210; Jarvis pushes the result.");
});

test("a held Pages re-run starts on main's newest commit when main moved during the countdown, else re-runs the run", async () => {
  const db = fakeDb();
  let head = "afacf24a3";
  const dispatched = [];
  const { ops: o, calls } = ops({ mainSha: async () => head, dispatch: async (path) => { dispatched.push(path); return {}; } });
  const payload = { run: 42475710098, name: "Pages", sha: "afacf24a3", path: ".github/workflows/pages.yml" };
  const same = (await queue(db, { action: "rerun-ci", target: "Pages #42475710098", payload }, MONDAY_20)).row;
  await countdown.runDue({ db, now: MONDAY_20 + 2 * H, ops: o });
  assert.deepEqual([calls.ci, dispatched], [[42475710098], []]);
  assert.equal(db.doc("jarvis_countdowns", same.id).result, "Re-running the failed jobs of run 42475710098.");

  head = "4b9538af2";
  const moved = (await queue(db, { action: "rerun-ci", target: "Pages #42475710099", payload: Object.assign({}, payload, { run: 42475710099 }) }, MONDAY_20 + 3 * H)).row;
  await countdown.runDue({ db, now: MONDAY_20 + 5 * H, ops: o });
  assert.deepEqual([calls.ci, dispatched], [[42475710098], [".github/workflows/pages.yml"]]);
  assert.equal(db.doc("jarvis_countdowns", moved.id).result, "Main moved past the failed commit during the countdown, so Pages started on main's newest commit.");
});

test("a green PR labelled jarvis-merge is merged after the countdown, at the commit it was green on", async () => {
  const db = fakeDb();
  const { ops: o, calls } = ops({ mergeCandidates: async () => [{ number: 2003, sha: "abc1234ff00", title: "Jarvis fixes failed jobs", url: "https://github.com/x/pull/2003" }] });
  const out = await actions.autoRun({ db, now: MONDAY_10, settings: {}, ops: o, items: null, external: null });
  assert.deepEqual(out.queued.map((r) => [r.action, r.target, r.kind, r.payload.number]), [["merge-pr", "#2003", "code", 2003]]);
  assert.match(out.queued[0].why, /Jarvis fixes failed jobs \(green, labelled jarvis-merge\)/);
  const again = await actions.autoRun({ db, now: MONDAY_10 + H, settings: {}, ops: o, items: null, external: null });
  assert.equal(again.queued.length, 0, "the same commit is queued once");
  await countdown.runDue({ db, now: MONDAY_20 + 3 * H, ops: o });
  assert.deepEqual(calls.merged, [[2003, "abc1234ff00"]], "code reaching production runs at night");
  assert.equal(db.doc("jarvis_countdowns", out.queued[0].id).result, "Merged #2003 at abc1234.");

  const broken = ops({ mergeCandidates: async () => { throw new Error("GitHub 403"); } });
  const db2 = fakeDb();
  await actions.autoRun({ db: db2, now: MONDAY_10, settings: {}, ops: broken.ops, items: null, external: null });
  await actions.autoRun({ db: db2, now: MONDAY_10 + H, settings: {}, ops: broken.ops, items: null, external: null });
  assert.equal(db2.added.filter((r) => r.action === "merge-pr" && r.status === "failed").length, 1, "a GitHub error is logged once a day");
});

test("a safe worker PR says why it merges; a dropped one is logged and its merge countdown cancelled (#2959, #3071)", async () => {
  const db = fakeDb();
  let prs = [{ number: 3100, sha: "sha1", title: "Jarvis: Fix CI", url: "u", gate: "safe" }];
  const { ops: o } = ops({ mergeCandidates: async () => prs });
  const out = await actions.autoRun({ db, now: MONDAY_10, settings: {}, ops: o, items: null, external: null });
  assert.match(out.queued[0].why, /Jarvis: Fix CI \(green; Jarvis's worker touched only safe files\)/);
  prs = [{ number: 3100, title: "Jarvis: Fix CI", url: "u", dropped: "Pages is green again on main (run 955) without this PR" }];
  const next = await actions.autoRun({ db, now: MONDAY_10 + H, settings: {}, ops: o, items: null, external: null });
  assert.deepEqual(next.done.map((r) => [r.action, r.target]), [["worker-drop", "#3100"]]);
  assert.equal(db.doc("jarvis_countdowns", out.queued[0].id).status, "cancelled");
  assert.equal(next.queued.length, 0);
});

test("a draft campaign with leads is launched after the countdown, one per campaign; one Carlos cancelled stays a draft", async () => {
  const db = fakeDb();
  const launched = [];
  const drafts = [{ id: "c1", name: "W1 F-es Americas", start: "2026-11-10", leads: 3 }, { id: "c2", name: "W1 F-en US", start: "2026-11-10", leads: 1 }];
  const { ops: o } = ops({
    launchReady: async () => drafts,
    launchCampaigns: async (ids) => { launched.push(...ids); return { launched: ids.map((id) => drafts.find((d) => d.id === id).name), left: [] }; }
  });
  const out = await actions.autoRun({ db, now: MONDAY_10, settings: {}, ops: o });
  assert.deepEqual(out.queued.map((r) => [r.action, r.target, r.kind]), [["launch-campaign", "W1 F-es Americas", "email"], ["launch-campaign", "W1 F-en US", "email"]]);
  assert.match(out.queued[0].why, /A draft with 3 leads that starts 2026-11-10/);
  assert.equal(out.queued[0].label, "Launch a draft campaign");
  assert.equal((await actions.autoRun({ db, now: MONDAY_10 + H / 2, settings: {}, ops: o })).queued.length, 0, "a waiting launch is not queued twice");
  await countdown.cancel(db, out.queued[1].id, { now: MONDAY_10 + H, by: "carlos@x.co" });
  const later = await actions.autoRun({ db, now: MONDAY_10 + H, settings: {}, ops: o });
  assert.equal(later.queued.length, 0);
  assert.match(later.waiting[0].reason, /W1 F-en US: you cancelled its countdown; activate it in Jarvis > Marketing/);
  await countdown.runDue({ db, now: MONDAY_10 + 2 * H, ops: o });
  assert.deepEqual(launched, ["c1"]);
  assert.equal(db.doc("jarvis_countdowns", out.queued[0].id).result, "Launched W1 F-es Americas.");

  const none = ops({ launchCampaigns: async () => ({ launched: [], left: ["W1 F-es Americas: already active"] }) });
  const db2 = fakeDb();
  const { row } = await queue(db2, { action: "launch-campaign", target: "W1 F-es Americas", payload: { items: [{ id: "c1" }] } });
  await countdown.runDue({ db: db2, now: MONDAY_10 + 2 * H, ops: none.ops });
  assert.equal(db2.doc("jarvis_countdowns", row.id).status, "failed");
  assert.match(db2.doc("jarvis_countdowns", row.id).result, /Nothing launched: W1 F-es Americas: already active/);
});

test("a failed run is pushed and logged as failed; one stuck running is closed; money has no action", async () => {
  const db = fakeDb();
  const { ops: o, calls } = ops({ rerunCi: async () => ({ run: 9, already: "re-run once" }) });
  const ci = (await queue(db, { action: "rerun-ci", target: "Pages" })).row;
  const money = (await queue(db, { action: "payout", target: "PayPal", kind: "money" })).row;
  await countdown.runDue({ db, now: MONDAY_10 + 2 * H, ops: o });
  assert.equal(db.doc("jarvis_countdowns", ci.id).status, "failed");
  assert.equal(calls.pushes.find((m) => m.title.startsWith("Failed")).title, "Failed: re-run failed CI jobs");
  assert.match(db.doc("jarvis_countdowns", money.id).result, /no action for this yet/);
  const stuck = (await queue(db, { action: "rerun-ci", target: "Jarvis Android" })).row;
  await db.collection("jarvis_countdowns").doc(stuck.id).update({ status: "running", startedAt: new Date(MONDAY_10).toISOString() });
  const out = await countdown.runDue({ db, now: MONDAY_10 + H, ops: o });
  assert.deepEqual(out.stuck, [stuck.id]);
  assert.equal(db.doc("jarvis_countdowns", stuck.id).status, "failed");
});

test("the view lists what waits with its start time and what ended in the last day", async () => {
  const db = fakeDb();
  const post = (await queue(db, { action: "retry-social", target: "2 failed social posts" }, MONDAY_20)).row;
  const ci = (await queue(db, { action: "rerun-ci", target: "Pages" }, MONDAY_20)).row;
  await countdown.cancel(db, ci.id, { now: MONDAY_20 + 60000, by: "carlos@x.co" });
  const v = await countdown.view(db, MONDAY_20 + H);
  assert.deepEqual(v.pending.map((r) => [r.id, r.runsAt, r.kindLabel]), [[post.id, "2026-10-27T13:00:00.000Z", "public post"]]);
  assert.deepEqual(v.recent.map((r) => [r.id, r.status, r.decidedBy]), [[ci.id, "cancelled", "carlos@x.co"]]);
  assert.equal(v.pending[0].expireAt, undefined);
});
