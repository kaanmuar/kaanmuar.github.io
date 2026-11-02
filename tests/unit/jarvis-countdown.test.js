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
    postNow: async () => { calls.posted += 1; return { note: "Buffer batch started, Facebook Page queue started." }; },
    resumeOutreach: async (list) => { calls.resumed.push(list.map((c) => c.id)); return { resumed: list }; },
    mergePr: async (n, sha) => { calls.merged.push([n, sha]); return { merged: true, sha: "abc1234ff" }; },
    push: async (msg) => { calls.pushes.push(msg); return { sent: 1 }; }
  }, over || {});
  return { ops: o, calls };
}

const queue = (db, entry, now) => countdown.queue(db, entry, { now: now || MONDAY_10, hours: 2 });

test("each risky action has its kind: email, post, code, outreach; anything else is money and has no action", () => {
  assert.equal(countdown.kindOf("rerun-held"), "email");
  assert.equal(countdown.kindOf("resend-notices"), "email");
  assert.equal(countdown.kindOf("run-job", "sendOwnerNotices"), "email");
  assert.equal(countdown.kindOf("run-job", "dispatchFacebookQueue"), "post");
  assert.equal(countdown.kindOf("rerun-ci", "Buffer batch"), "post");
  assert.equal(countdown.kindOf("rerun-ci", "Pages"), "code");
  assert.equal(countdown.kindOf("rerun-ci", "Jarvis Android"), "code");
  assert.equal(countdown.kindOf("merge-pr"), "code");
  assert.equal(countdown.kindOf("post-now"), "post");
  assert.equal(countdown.kindOf("resume-outreach"), "outreach");
  assert.equal(countdown.kindOf("payout"), "money");
  assert.deepEqual(Object.keys(countdown.KINDS), ["email", "post", "code", "outreach", "money"]);
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
  assert.equal(msg.title, "Doing re-run failed ci jobs in 2 h");
  assert.equal(msg.ref, "countdown:" + row.id);
  assert.equal(msg.tag, "jarvis-countdown-" + row.id);
  assert.deepEqual(msg.actions, [{ act: "now", label: "Do it now" }, { act: "cancel", label: "Cancel" }]);
  assert.deepEqual(mailPush.parseAct(msg.ref, "now"), { type: "countdown", id: row.id, act: "now" });
  assert.deepEqual(mailPush.parseAct(msg.ref, "cancel"), { type: "countdown", id: row.id, act: "cancel" });
  const night = await queue(db, { action: "post-now", target: "queues" }, MONDAY_20);
  assert.equal(countdown.queuedMessage(night.row, 2).title, "Doing post the queues now at 08:00 Bogotá", "due at 22:00, a post waits for the morning");
  assert.equal(countdown.queuedMessage(row, 0.5).title, "Doing re-run failed ci jobs in 30 min");
});

test("a due countdown runs, pushes when it starts and with the result, and is logged so the fix is checked", async () => {
  const db = fakeDb();
  const { row } = await queue(db, { action: "run-job", target: "ensureLiveReportsBatch", key: "scheduler:ensureLiveReportsBatch" });
  const { ops: o, calls } = ops();
  const early = await countdown.runDue({ db, now: MONDAY_10 + H, ops: o });
  assert.equal(early.started.length, 0);
  const due = await countdown.runDue({ db, now: MONDAY_10 + 2 * H + 60000, ops: o });
  assert.deepEqual(calls.jobs, ["ensureLiveReportsBatch"]);
  assert.equal(due.started[0].status, "done");
  assert.equal(db.doc("jarvis_countdowns", row.id).status, "done");
  assert.deepEqual(calls.pushes.map((m) => m.title), ["Doing run a job again now", "Done: run a job again"]);
  assert.ok(calls.pushes.every((m) => m.tag === "jarvis-countdown-" + row.id), "the same notification updates");
  const logged = db.added.find((r) => r._c === "jarvis_actions");
  assert.deepEqual([logged.action, logged.mode, logged.status, logged.key, logged.by], ["run-job", "auto", "done", "scheduler:ensureLiveReportsBatch", "jarvis (countdown)"]);
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
  const post = (await queue(db, { action: "post-now", target: "queues" }, MONDAY_20)).row;
  const { ops: o, calls } = ops();
  const now = await countdown.decide(db, { id: post.id, act: "now" }, { ops: o, now: MONDAY_20 + 10 * 60000, by: "carlos@x.co" });
  assert.equal(calls.posted, 1);
  assert.match(now.message, /^Done: Buffer batch started/);
  assert.equal(db.doc("jarvis_countdowns", post.id).decidedBy, "carlos@x.co");
  assert.match(db.added.find((r) => r.action === "post-now").by, /Do it now by carlos@x\.co/);
  await assert.rejects(countdown.decide(db, { id: post.id, act: "now" }, { ops: o, now: MONDAY_20, by: "carlos@x.co" }), /already done/);

  const notices = (await queue(db, { action: "resend-notices", target: "1 failed owner notice", payload: { items: [{ id: "x.co" }] } }, SATURDAY_20)).row;
  await assert.rejects(countdown.decide(db, { id: notices.id, act: "now" }, { ops: o, now: SATURDAY_20, by: "carlos@x.co" }), /Monday to Saturday/);
  assert.equal(db.doc("jarvis_countdowns", notices.id).status, "waiting");

  const ci = (await queue(db, { action: "rerun-ci", target: "Facebook Page", count: 1 })).row;
  assert.equal(countdown.queued(await countdown.open(db), "rerun-ci", "2026-10-26"), 1);
  const out = await countdown.decide(db, { id: ci.id, act: "cancel" }, { ops: o, now: MONDAY_10 + H, by: "carlos@x.co" });
  assert.equal(out.message, "Cancelled: re-run failed ci jobs.");
  assert.equal(countdown.queued(await countdown.open(db), "rerun-ci", "2026-10-26"), 0, "a cancelled countdown gives its slot back");
  assert.deepEqual(calls.ci, []);
  const log = db.added.find((r) => r.action === "rerun-ci" && r.status === "skipped");
  assert.deepEqual([log.mode, log.by, log.detail], ["click", "carlos@x.co", "Countdown cancelled."]);
  await assert.rejects(countdown.decide(db, { id: ci.id, act: "maybe" }, { ops: o, now: MONDAY_10, by: "c" }), /Do it now or Cancel only/);
});

test("a countdown Carlos cancelled is not queued again that day; Jarvis says it waits for him", async () => {
  const db = fakeDb();
  const { ops: o } = ops();
  const items = [line("ci:Facebook Page")];
  const first = await actions.autoRun({ db, now: MONDAY_10, settings: {}, ops: o, items, external: {} });
  await countdown.cancel(db, first.queued[0].id, { now: MONDAY_10 + 600000, by: "carlos@x.co" });
  const next = await actions.autoRun({ db, now: MONDAY_10 + H, settings: {}, ops: o, items, external: {} });
  assert.equal(next.queued.length, 0);
  assert.match(next.waiting[0].reason, /Facebook Page: you cancelled its countdown today; it runs on a click\./);
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

test("outreach Jarvis paused resumes on the countdown after two clear passes, and trouble coming back cancels it", async () => {
  const db = fakeDb();
  let pause = { paused: [{ id: "c1", name: "W1 E-pt Brazil" }], at: "2026-10-26T09:00:00.000Z", clear: 0 };
  const { ops: o, calls } = ops({ outreachPause: async () => pause, setOutreachPause: async (patch) => { pause = Object.assign({}, pause, patch); } });
  const one = await actions.autoRun({ db, now: MONDAY_10, settings: {}, ops: o, items: [], external: {} });
  assert.equal(pause.clear, 1);
  assert.equal(one.queued.length, 0);
  const two = await actions.autoRun({ db, now: MONDAY_10 + H, settings: {}, ops: o, items: [], external: {} });
  assert.deepEqual(two.queued.map((r) => [r.action, r.kind, r.payload.campaigns.map((c) => c.id)]), [["resume-outreach", "outreach", ["c1"]]]);
  assert.match(two.queued[0].why, /resumes W1 E-pt Brazil/);
  await actions.autoRun({ db, now: MONDAY_10 + 2 * H, settings: {}, ops: Object.assign({}, o, { sending: false }), items: [line("outreach:warmup", "warn")], external: {} });
  assert.equal(pause.clear, 0);
  assert.equal(db.doc("jarvis_countdowns", two.queued[0].id).status, "cancelled");
  assert.match(db.doc("jarvis_countdowns", two.queued[0].id).result, /trouble came back/);

  const db2 = fakeDb();
  pause = { paused: [{ id: "c1", name: "W1" }], at: "x", clear: 1 };
  const queued = await actions.autoRun({ db: db2, now: MONDAY_10, settings: {}, ops: o, items: [], external: {} });
  await countdown.runDue({ db: db2, now: MONDAY_10 + 2 * H, ops: o });
  assert.deepEqual(calls.resumed, [["c1"]]);
  assert.equal(db2.doc("jarvis_countdowns", queued.queued[0].id).result, "Resumed W1.");
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

test("a failed run is pushed and logged as failed; one stuck running is closed; money has no action", async () => {
  const db = fakeDb();
  const { ops: o, calls } = ops({ rerunCi: async () => ({ run: 9, already: "re-run once" }) });
  const ci = (await queue(db, { action: "rerun-ci", target: "Pages" })).row;
  const money = (await queue(db, { action: "payout", target: "PayPal", kind: "money" })).row;
  await countdown.runDue({ db, now: MONDAY_10 + 2 * H, ops: o });
  assert.equal(db.doc("jarvis_countdowns", ci.id).status, "failed");
  assert.equal(calls.pushes.find((m) => m.title.startsWith("Failed")).title, "Failed: re-run failed ci jobs");
  assert.match(db.doc("jarvis_countdowns", money.id).result, /no action for this yet/);
  const stuck = (await queue(db, { action: "rerun-ci", target: "Jarvis Android" })).row;
  await db.collection("jarvis_countdowns").doc(stuck.id).update({ status: "running", startedAt: new Date(MONDAY_10).toISOString() });
  const out = await countdown.runDue({ db, now: MONDAY_10 + H, ops: o });
  assert.deepEqual(out.stuck, [stuck.id]);
  assert.equal(db.doc("jarvis_countdowns", stuck.id).status, "failed");
});

test("the view lists what waits with its start time and what ended in the last day", async () => {
  const db = fakeDb();
  const post = (await queue(db, { action: "post-now", target: "queues" }, MONDAY_20)).row;
  const ci = (await queue(db, { action: "rerun-ci", target: "Pages" }, MONDAY_20)).row;
  await countdown.cancel(db, ci.id, { now: MONDAY_20 + 60000, by: "carlos@x.co" });
  const v = await countdown.view(db, MONDAY_20 + H);
  assert.deepEqual(v.pending.map((r) => [r.id, r.runsAt, r.kindLabel]), [[post.id, "2026-10-27T13:00:00.000Z", "public post"]]);
  assert.deepEqual(v.recent.map((r) => [r.id, r.status, r.decidedBy]), [[ci.id, "cancelled", "carlos@x.co"]]);
  assert.equal(v.pending[0].expireAt, undefined);
});
