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

const CAPS = { "rerun-held": 10, "resend-notices": 10, "publish-hub": 2, "run-job": 6, "rerun-ci": 4, "pause-outreach": 2, "refresh-data": 4, "rerun-reviews": 2, "ai-fix": 3 };

test("settings: actions are on with the default caps and confidence 0.8 unless saved otherwise, within their bounds", () => {
  assert.deepEqual(actions.cleanSettings(), { auto: true, caps: CAPS, confidence: 0.8 });
  const saved = actions.cleanSettings({ auto: false, caps: { "rerun-held": 250, "resend-notices": -3, "publish-hub": "" }, confidence: 0.2 });
  assert.deepEqual(saved, { auto: false, caps: Object.assign({}, CAPS, { "rerun-held": 100, "resend-notices": 0 }), confidence: 0.5 });
  assert.equal(actions.cleanSettings({ confidence: "0.93" }).confidence, 0.93);
  assert.equal(actions.cleanSettings({ confidence: 4 }).confidence, 1);
  assert.deepEqual(jarvis.normalizeSettings({}).actions, actions.cleanSettings());
});

// --- the fixes Jarvis makes on its own (#1977) ---------------------------------------------------------------

const line = (key, level, text) => ({ key, level: level || "alert", product: "systems", text: text || key });

function fixOps(over) {
  const calls = { jobs: [], ci: [], pause: [], drop: [], asked: [] };
  const made = fakeOps(Object.assign({
    runJob: async (name) => { calls.jobs.push(name); return { ran: name }; },
    rerunCi: async (name) => { calls.ci.push(name); return { run: 77 }; },
    sending: true,
    pauseOutreach: async (reason) => { calls.pause.push(reason); return { paused: [{ id: "c1", name: "W1 E-pt Brazil" }] }; },
    dropCache: async (source) => { calls.drop.push(source); return { dropped: source }; },
    fixes: [],
    gemini: null
  }, over || {}));
  return { ops: made.ops, calls: Object.assign(made.calls, calls) };
}

test("the plan reads failed jobs and workflows, outreach trouble and stale sources, and keeps the risky ones apart", () => {
  const plan = actions.fixPlan([
    line("job:rivalSweep"), line("scheduler:rivalSweep"), line("scheduler:sendOwnerNotices"), line("ci:Lint Code Base"), line("ci:Pages"),
    line("outreach:dns:SPF", "warn"), line("outreach:warmup", "warn"), line("mailbox:canary-stale", "warn"), line("connections:down:github", "warn"),
    line("outreach:replies", "info"), line("uptime:cv")
  ]);
  assert.deepEqual(plan.jobs.map((j) => j.target), ["rivalSweep"], "one run per job, whichever source named it");
  assert.deepEqual(plan.ci.map((c) => c.target), ["Lint Code Base"]);
  assert.deepEqual(plan.risky.map((r) => r.action + " " + r.target), ["run-job sendOwnerNotices", "rerun-ci Pages"]);
  assert.deepEqual(plan.outreach.map((o) => o.key), ["outreach:dns:SPF", "outreach:warmup"]);
  assert.deepEqual(plan.stale.map((s) => [s.target, !!s.job]), [["mailCanary", true], ["github", false]]);
  assert.equal(plan.keys.has("uptime:cv"), false, "a line no rule fixes is left for Gemini");
});

test("a failed job and a failed workflow are retried once a day; risky ones wait for a click", async () => {
  const db = fakeDb();
  const { ops, calls } = fixOps();
  const items = [line("scheduler:rivalSweep"), line("ci:Lint Code Base"), line("scheduler:dispatchFacebookQueue")];
  const out = await actions.autoRun({ db, now: MONDAY_10, settings: {}, ops, items, external: {} });
  assert.deepEqual(calls.jobs, ["rivalSweep"]);
  assert.deepEqual(calls.ci, ["Lint Code Base"]);
  assert.deepEqual(out.done.map((r) => [r.action, r.target, r.key]), [["run-job", "rivalSweep", "scheduler:rivalSweep"], ["rerun-ci", "Lint Code Base", "ci:Lint Code Base"]]);
  assert.match(out.waiting.find((w) => w.action === "run-job").reason, /dispatchFacebookQueue mails third parties, posts in public or deploys/);
  const again = await actions.autoRun({ db, now: MONDAY_10 + 3600000, settings: {}, ops, items, external: {} });
  assert.deepEqual(calls.jobs, ["rivalSweep"], "not twice in a day");
  assert.ok(again.waiting.some((w) => /rivalSweep still fails after Jarvis tried once today/.test(w.reason)));
});

test("a workflow GitHub already re-ran once is not re-run again", async () => {
  const db = fakeDb();
  const { ops } = fixOps({ rerunCi: async () => ({ run: 9, already: "re-run once" }) });
  const out = await actions.autoRun({ db, now: MONDAY_10, settings: {}, ops, items: [line("ci:E2E and Visual Tests")], external: {} });
  assert.equal(out.done.length, 0);
  assert.match(db.added.find((r) => r.action === "rerun-ci").detail, /Run 9 failed again after one re-run/);
});

test("45 minutes after a fix the line is checked: gone is fixed, still there is handed over", async () => {
  const db = fakeDb();
  const { ops } = fixOps();
  await actions.autoRun({ db, now: MONDAY_10, settings: {}, ops, items: [line("scheduler:rivalSweep"), line("ci:Lint Code Base")], external: {} });
  const soon = await actions.autoRun({ db, now: MONDAY_10 + 20 * 60000, settings: {}, ops, items: [line("ci:Lint Code Base")], external: {} });
  assert.equal(soon.checked.length, 0, "too early to tell");
  const later = await actions.autoRun({ db, now: MONDAY_10 + 50 * 60000, settings: {}, ops, items: [line("ci:Lint Code Base")], external: {} });
  assert.deepEqual(later.checked.map((r) => [r.target, r.status]), [["rivalSweep", "done"], ["Lint Code Base", "failed"]]);
  const push = actions.checkMessage(later);
  assert.equal(push.title, "Still failing after Jarvis's fix: 1 (1 fixed)");
  assert.deepEqual(push.lines, ["Fixed: rivalSweep", "Still failing: Lint Code Base"]);
  const last = await actions.autoRun({ db, now: MONDAY_10 + 110 * 60000, settings: {}, ops, items: [line("ci:Lint Code Base")], external: {} });
  assert.equal(last.checked.length, 0, "each fix is checked once");
  assert.ok(actions.briefLines(await actions.recent(db, 50), MONDAY_10 + 2 * 3600000).includes("Still failing after Jarvis's fix: Lint Code Base."));
  assert.equal(actions.checkMessage({ checked: [] }), null);
});

test("outreach pauses only while a campaign sends, and only what was active", async () => {
  const items = [line("outreach:mailbox:a@x.co", "warn", "Mailbox a@x.co is paused, warm-up off."), line("outreach:dns:DKIM", "warn", "x.co DKIM: missing.")];
  const quiet = fixOps({ sending: false });
  await actions.autoRun({ db: fakeDb(), now: MONDAY_10, settings: {}, ops: quiet.ops, items, external: {} });
  assert.equal(quiet.calls.pause.length, 0);

  const db = fakeDb();
  const live = fixOps();
  const out = await actions.autoRun({ db, now: MONDAY_10, settings: {}, ops: live.ops, items, external: {} });
  assert.deepEqual(live.calls.pause, ["Mailbox a@x.co is paused, warm-up off. x.co DKIM: missing."]);
  assert.match(out.done[0].detail, /^Paused W1 E-pt Brazil\. Mailbox a@x\.co/);

  const none = fixOps({ pauseOutreach: async () => ({ paused: [] }) });
  const nothing = await actions.autoRun({ db: fakeDb(), now: MONDAY_10, settings: {}, ops: none.ops, items, external: {} });
  assert.equal(nothing.done.length, 0, "nothing was active: nothing to log");
});

test("stale data: the canary job runs, a silent source loses its cache, once a day each", async () => {
  const db = fakeDb();
  const { ops, calls } = fixOps();
  const items = [line("mailbox:canary-stale", "warn"), line("connections:down:email", "warn")];
  await actions.autoRun({ db, now: MONDAY_10, settings: {}, ops, items, external: {} });
  await actions.autoRun({ db, now: MONDAY_10 + 3600000, settings: {}, ops, items, external: {} });
  assert.deepEqual(calls.jobs, ["mailCanary"]);
  assert.deepEqual(calls.drop, ["email"]);
});

test("reviews a fix covers re-run an hour after its merge, when it is newer than the last re-run", async () => {
  const fixes = [{ cause: "timeout", at: "2026-10-26T13:30:00Z", ref: "#2001" }, { cause: "tls", at: "2026-10-24T12:13:00Z", ref: "#736" }];
  const external = (last) => ({ jobs: { ok: true, jobs: [{ name: "rerunReviewFailures", lastAttempt: last }] } });
  const run = async (now, last) => { const f = fixOps({ fixes }); await actions.autoRun({ db: fakeDb(), now, settings: {}, ops: f.ops, items: [], external: external(last) }); return f.calls.jobs; };
  assert.deepEqual(await run(MONDAY_10, "2026-10-26T11:00:00Z"), ["rerunReviewFailures"]);
  assert.deepEqual(await run(Date.parse("2026-10-26T14:00:00Z"), "2026-10-26T11:00:00Z"), [], "merged half an hour ago: the deploy may not be out");
  assert.deepEqual(await run(MONDAY_10, "2026-10-26T14:45:00Z"), [], "already re-run since");
  assert.deepEqual(await run(MONDAY_10, ""), [], "no last run read");
});

test("Gemini picks fixes from the catalog; Jarvis runs the sure ones and asks once per set of lines", async () => {
  const external = { jobs: { ok: true, jobs: [{ name: "rivalSweep" }, { name: "sendOwnerNotices" }] }, github: { ok: true, ci: [{ name: "Pages", conclusion: "failure" }, { name: "Lint Code Base", conclusion: "failure" }] }, uptime: { ok: true } };
  assert.deepEqual(actions.aiCatalog(external), { "run-job": ["rivalSweep"], "rerun-ci": ["Lint Code Base"], "refresh-data": ["jobs", "github", "uptime", "mailCanary"] });
  const items = [line("platform:failures", "warn"), line("safety:robots", "warn"), line("uptime:cv")];
  const answer = JSON.stringify({ fixes: [
    { key: "platform:failures", action: "run-job", target: "rivalSweep", confidence: 0.86, why: "Its runs fail." },
    { key: "uptime:cv", action: "refresh-data", target: "uptime", confidence: 0.4, why: "Maybe a cached outage." },
    { key: "safety:robots", action: "run-job", target: "sendOwnerNotices", confidence: 0.99, why: "Not allowed." },
    { key: "made:up", action: "run-job", target: "rivalSweep", confidence: 1, why: "No such line." }
  ] });
  const db = fakeDb();
  const { ops, calls } = fixOps({ gemini: async (prompt) => { calls.asked.push(prompt); return "```json\n" + answer + "\n```"; } });
  const out = await actions.autoRun({ db, now: MONDAY_10, settings: {}, ops, items, external });
  assert.deepEqual(calls.jobs, ["rivalSweep"]);
  assert.deepEqual(out.done.map((r) => [r.action, r.target, r.key, r.detail]), [["ai-fix", "run-job:rivalSweep", "platform:failures", "Its runs fail. (confidence 0.86)."]]);
  assert.match(db.added.find((r) => r.status === "skipped").detail, /3 lines: 1 sure, 1 under 0\.8 \(refresh-data uptime at 0\.4\)/);
  await actions.autoRun({ db, now: MONDAY_10 + 3600000, settings: {}, ops, items, external });
  assert.equal(calls.asked.length, 1, "the same lines are not asked about twice in a day");
  const strict = fixOps({ gemini: async () => answer });
  await actions.autoRun({ db: fakeDb(), now: MONDAY_10, settings: { actions: { confidence: 0.9 } }, ops: strict.ops, items, external });
  assert.deepEqual(strict.calls.jobs, [], "under the saved confidence");
  const broken = fixOps({ gemini: async () => "no json" });
  const failed = await actions.autoRun({ db: fakeDb(), now: MONDAY_10, settings: {}, ops: broken.ops, items, external });
  assert.equal(failed.done.length, 0);
});

test("without the briefing lines nothing new runs and nothing is checked", async () => {
  const { ops, calls } = fixOps();
  const out = await actions.autoRun({ db: fakeDb(), now: MONDAY_10, settings: {}, ops, items: null, external: null });
  assert.deepEqual([calls.jobs, calls.ci, out.checked], [[], [], []]);
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
  assert.match(index, /jarvisActions\.autoRun\(\{ db, now, settings, ops, items, external \}\)/);
  assert.match(index, /jarvis\.rerunCi\(fetch, await githubApp\.token\(\), workflow, \{ once: true \}\)/);
  assert.match(fs.readFileSync(path.join(__dirname, "../../functions/secrets.js"), "utf8"), /jarvisWatch: list\(MAIL, JARVIS_SOURCES, BROWSER, GEMINI\)/);
});
