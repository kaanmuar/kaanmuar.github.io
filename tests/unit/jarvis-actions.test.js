const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const actions = require("../../functions/jarvis-actions");
const jarvis = require("../../functions/jarvis");
const core = require("../../js/admin-jarvis-core.js");

// Monday 2026-10-26 10:00 Bogotá is 15:00 UTC.
const MONDAY_10 = Date.parse("2026-10-26T15:00:00Z");
const SUNDAY_10 = Date.parse("2026-10-25T15:00:00Z");
const MONDAY_21 = Date.parse("2026-10-27T02:00:00Z");

function fakeDb(rows) {
  const added = rows || [];
  return {
    added,
    collection: (name) => ({
      add: async (row) => { added.push(Object.assign({ _c: name }, row)); },
      where: (field, op, value) => ({ limit: () => ({ get: async () => ({ docs: added.filter((r) => r._c === name && r[field] === value).map((r) => ({ data: () => r })) }) }) }),
      orderBy: () => ({ limit: (n) => ({ get: async () => ({ docs: added.filter((r) => r._c === name).slice().sort((a, b) => b.at.localeCompare(a.at)).slice(0, n).map((r) => ({ data: () => Object.assign({}, r) })) }) }) })
    })
  };
}

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

test("settings: actions are on with caps 10, 10 and 2 unless saved otherwise, and caps stay within 0-100", () => {
  assert.deepEqual(actions.cleanSettings(), { auto: true, caps: { "rerun-held": 10, "resend-notices": 10, "publish-hub": 2 } });
  assert.deepEqual(actions.cleanSettings({ auto: false, caps: { "rerun-held": 250, "resend-notices": -3, "publish-hub": "" } }), { auto: false, caps: { "rerun-held": 100, "resend-notices": 0, "publish-hub": 2 } });
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

test("the hourly pass sends clean held re-runs up to the cap and logs the rest as waiting", async () => {
  const db = fakeDb();
  const { ops, calls } = fakeOps({ held: async () => [clean("a.co"), stopped("b.co"), clean("c.co"), clean("d.co")] });
  const out = await actions.autoRun({ db, now: MONDAY_10, settings: { actions: { caps: { "rerun-held": 2 } } }, ops });
  assert.deepEqual(calls.release, [["a.co", "jarvis"], ["c.co", "jarvis"]]);
  assert.equal(out.done.length, 2);
  assert.deepEqual(out.waiting.map((w) => [w.count, w.reason]), [[1, "Over today's cap of 2."], [1, "Not clean: the report stopped."]]);
  const again = await actions.autoRun({ db, now: MONDAY_10 + 3600000, settings: { actions: { caps: { "rerun-held": 2 } } }, ops });
  assert.equal(again.done.length, 0, "the cap counts what was already sent today");
  assert.equal(db.added.filter((r) => r.status === "waiting").length, 2, "a wait is logged once a day per reason");
  assert.ok(db.added.every((r) => r.day === "2026-10-26" && r.mode === "auto"));
});

test("failed notices wait outside the hours, and inside them stay within the notice budget", async () => {
  const notices = async () => ["x.co", "y.co", "z.co"].map((d) => ({ id: d, ref: d, data: { domain: d } }));
  const sunday = fakeOps({ failedNotices: notices });
  const off = await actions.autoRun({ db: fakeDb(), now: SUNDAY_10, settings: {}, ops: sunday.ops });
  assert.equal(sunday.calls.resend.length, 0);
  assert.match(off.waiting[0].reason, /Outside Monday-Saturday/);

  const monday = fakeOps({ failedNotices: notices, noticeBudget: async () => 2 });
  const on = await actions.autoRun({ db: fakeDb(), now: MONDAY_10, settings: {}, ops: monday.ops });
  assert.deepEqual(monday.calls.resend, [["x.co", "jarvis"], ["y.co", "jarvis"]]);
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
  const { ops } = fakeOps({ held: async () => [clean("a.co")], release: async () => { throw new Error("Firestore down"); }, hubStale: async () => true });
  const out = await actions.autoRun({ db, now: MONDAY_10, settings: {}, ops });
  assert.equal(db.added.find((r) => r.action === "rerun-held").status, "failed");
  assert.equal(out.done[0].action, "publish-hub");
});

test("summary, push and the briefing lines say what Jarvis did and what waits", async () => {
  const db = fakeDb();
  const { ops } = fakeOps({ held: async () => [clean("a.co"), stopped("b.co")], hubStale: async () => true });
  const out = await actions.autoRun({ db, now: MONDAY_10, settings: {}, ops });
  assert.equal(actions.summary(out), "send held re-runs 1, publish the social hub 1; 1 waiting for a click");
  const push = actions.pushMessage(out);
  assert.equal(push.title, "Jarvis acted: 2 actions");
  assert.equal(push.tab, "systems");
  assert.equal(push.kind, "alerts");
  assert.equal(actions.pushMessage({ done: [] }), null);
  const lines = actions.briefLines(await actions.recent(db, 50), MONDAY_10 + 3600000);
  assert.deepEqual(lines, [
    "Jarvis did: send held re-runs x1.",
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
