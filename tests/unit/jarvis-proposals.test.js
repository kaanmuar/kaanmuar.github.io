const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const core = require("../../js/admin-jarvis-core.js");
const proposals = require("../../functions/jarvis-proposals");
const ops = require("../../functions/ops-schedule");

const DAY = 24 * 60 * 60 * 1000;

// A tiny Firestore: collection(name).doc(id).get/set/delete, collection(name).limit(n).get.
function fakeDb(seed) {
  const store = Object.assign({}, seed || {});
  const doc = (name, id) => ({
    get: async () => ({ exists: store[name + "/" + id] !== undefined, data: () => store[name + "/" + id] }),
    set: async (row) => { store[name + "/" + id] = row; },
    delete: async () => { delete store[name + "/" + id]; }
  });
  return {
    store,
    collection: (name) => ({
      doc: (id) => doc(name, id),
      limit: () => ({ get: async () => ({ docs: Object.keys(store).filter((k) => k.startsWith(name + "/")).map((k) => ({ data: () => store[k] })) }) })
    })
  };
}

const external = {
  health: { ok: true, jobs: [], failures: { total: 0 }, reruns: { held: 4 }, notices: { failed: 2 } },
  uptime: { ok: true, pages: [{ product: "review", name: "URL Review", ok: false, status: 503 }], tlsDaysLeft: 60 },
  money: { ok: true, revenue: { usd: 0, count: 0 }, prior: { usd: 40 }, refundsUsd: 0, paypal: { disputesOpen: 1 } },
  safety: { ok: true, checks: [{ key: "spf", name: "SPF", level: "warn", detail: "soft fail" }, { key: "dmarc", name: "DMARC", level: "alert", detail: "missing" }] }
};

test("proposal rules turn briefing lines into proposals ranked by impact, with evidence and the safe action", () => {
  const list = core.proposalRules({ products: {}, external, thresholds: { heldReruns: 1 } });
  const keys = list.map((p) => p.key);
  assert.equal(list[0].impact, 5);
  assert.ok(keys.indexOf("uptime:review") < keys.indexOf("review:held"));
  const held = list.find((p) => p.key === "review:held");
  assert.equal(held.action, "rerun-held");
  assert.equal(held.title, "Re-run the held reviews");
  assert.match(held.evidence[0], /4 re-runs are held/);
  const notices = list.find((p) => p.key === "notices:failed");
  assert.equal(notices.action, "resend-notices");
  assert.match(notices.evidence[0], /2 owner notices failed/);
  const safety = list.find((p) => p.key === "safety");
  assert.equal(safety.title, "Fix 2 failing safety checks");
  assert.equal(safety.evidence.length, 2);
  assert.equal(safety.impact, 5, "an alert in the group raises impact by one");
  assert.equal(list.find((p) => p.key === "uptime:review").title, "Bring URL Review back up");
  assert.ok(list.every((p) => p.evidence.length && p.title && p.impact >= 1 && p.impact <= 5));
});

test("info lines become proposals only where a rule asks for them", () => {
  const list = core.proposalRules({ products: {}, external: { social: { ok: true, failed: 0, sent: 0 }, github: { ok: true, ci: [], openBugs: 3, bugAreas: [], merged: { total: 1 } } } });
  assert.deepEqual(list.map((p) => p.key), ["social:none"]);
});

test("every safe action in the rules is one #1337 knows", () => {
  core.PROPOSAL_RULES.filter((r) => r.action).forEach((r) => assert.ok(core.SAFE_ACTIONS.includes(r.action), r.prefix));
});

test("Done and Dismiss hide a proposal until their date", () => {
  const now = new Date("2026-10-25T12:00:00Z");
  const list = [{ key: "a" }, { key: "b" }, { key: "c" }];
  const saved = [{ key: "a", status: "done", until: "2026-11-01T12:00:00Z" }, { key: "b", status: "dismissed", until: "2026-10-20T00:00:00Z" }];
  assert.deepEqual(core.openProposals(list, saved, now).map((p) => p.key), ["b", "c"]);
});

test("mark saves done for 7 days and dismissed for 30, and open brings it back", async () => {
  const db = fakeDb();
  const now = Date.parse("2026-10-25T12:00:00Z");
  const done = await proposals.mark(db, { key: "review:held", status: "done", title: "Re-run" }, "carlos@x", now);
  assert.equal(done.until, "2026-11-01T12:00:00.000Z");
  const gone = await proposals.mark(db, { key: "outreach:mailbox:a@b.co/x", status: "dismissed" }, "carlos@x", now);
  assert.equal(gone.until, "2026-11-24T12:00:00.000Z");
  assert.ok(db.store["jarvis_proposals/outreach:mailbox:a@b.co_x"], "a slash never reaches the document id");
  await proposals.mark(db, { key: "review:held", status: "open" }, "carlos@x", now);
  assert.equal(db.store["jarvis_proposals/review:held"], undefined);
  await assert.rejects(() => proposals.mark(db, { key: "x", status: "later" }, "", now), /done or dismissed/);
});

test("Gemini's ranking keeps the rules' action and evidence, caps new ideas and fills up to three", () => {
  const candidates = [
    { key: "review:held", title: "Re-run the held reviews", impact: 3, level: "warn", evidence: ["4 re-runs are held"], source: "rules", action: "rerun-held", tab: "systems" },
    { key: "inbox:pending", title: "Approve ratings", impact: 2, level: "warn", evidence: ["2 ratings wait"], source: "rules", action: null },
    { key: "social:none", title: "Schedule posts", impact: 2, level: "info", evidence: ["No posts"], source: "rules", action: null }
  ];
  const answer = { proposals: [
    { key: "ai:fix-pricing", title: "Test a lower first-review price", why: "Opens are up but nobody pays.", evidence: ["120 opens, 0 paid"], impact: 4, effort: "hours" },
    { key: "review:held", title: "Re-run the 4 held reviews", evidence: [], impact: 9, effort: "minutes" },
    { key: "ai:second", title: "x", evidence: ["y"], impact: 2 },
    { key: "ai:third", title: "x", evidence: ["y"], impact: 2 },
    { key: "ai:no-evidence", title: "x", evidence: [] },
    { key: "made-up", title: "x", evidence: ["y"] }
  ] };
  const out = proposals.mergeRanked(candidates, answer);
  assert.deepEqual(out.map((p) => p.key), ["ai:fix-pricing", "review:held", "ai:second"]);
  assert.equal(out[0].source, "gemini");
  assert.equal(out[1].action, "rerun-held");
  assert.deepEqual(out[1].evidence, ["4 re-runs are held"]);
  assert.equal(out[1].impact, 5);
  assert.equal(out[1].effort, "minutes");
  assert.ok(!out.some((p) => p.key === "ai:third" || p.key === "made-up" || p.key === "ai:no-evidence"));
  assert.deepEqual(out.map((p) => p.rank), out.map((_, i) => i + 1));
  const thin = proposals.mergeRanked(candidates, { proposals: [{ key: "social:none", evidence: ["No posts"] }] });
  assert.equal(thin.length, 3);
});

test("rank falls back to the rules when Gemini fails or is off, and never shows a hidden one", async () => {
  const candidates = core.proposalRules({ products: {}, external, thresholds: { heldReruns: 1 } });
  const savedRows = [{ key: "review:held", status: "done", until: "2099-01-01T00:00:00Z" }];
  const off = await proposals.rank({ candidates, snapshot: {}, savedRows, gemini: null, now: Date.now() });
  assert.equal(off.gemini, false);
  assert.ok(off.proposals.length <= 5 && off.proposals.length >= 3);
  assert.ok(!off.proposals.some((p) => p.key === "review:held"));
  assert.equal(off.hidden, 1);
  const broken = await proposals.rank({ candidates, snapshot: {}, savedRows, gemini: async () => "not json", now: Date.now() });
  assert.equal(broken.gemini, false);
  assert.match(broken.error, /JSON/);
  let prompt = "";
  const good = await proposals.rank({ candidates, snapshot: { n: 1 }, savedRows, now: Date.now(), gemini: async (p) => { prompt = p; return "```json\n" + JSON.stringify({ proposals: [{ key: "notices:failed", title: "Re-send", evidence: ["2 failed"], impact: 3 }] }) + "\n```"; } });
  assert.equal(good.gemini, true);
  assert.equal(good.proposals[0].key, "notices:failed");
  assert.ok(!prompt.includes("review:held"), "a hidden proposal is not sent to Gemini");
});

test("cleanCandidates keeps only the panel's fields and the known safe actions", () => {
  const [row] = proposals.cleanCandidates([{ key: "k", title: "T", impact: 12, level: "x", evidence: ["a", 2], action: "delete-everything", jobs: ["sweepReviews", "bad name;"], link: "javascript:alert(1)", extra: "drop" }]);
  assert.deepEqual(row, { key: "k", product: "", impact: 5, level: "info", title: "T", evidence: ["a", "2"], source: "rules", action: null, jobs: ["sweepReviews"], tab: null, link: null });
});

test("the daily email lists proposals with impact, effort and evidence", () => {
  const lines = proposals.mailLines([{ title: "Re-run the held reviews", impact: 3, effort: "minutes", why: "They are paid.", evidence: ["4 held"] }]);
  assert.equal(lines[0], "1. Re-run the held reviews (impact 3/5, minutes)\n   They are paid.\n   - 4 held");
});

test("four weeks end at today's UTC midnight, oldest first", () => {
  const weeks = proposals.weekWindows(Date.parse("2026-10-26T00:00:00Z"));
  assert.deepEqual(weeks.map((w) => [w.from, w.to]), [["2026-09-28", "2026-10-04"], ["2026-10-05", "2026-10-11"], ["2026-10-12", "2026-10-18"], ["2026-10-19", "2026-10-25"]]);
  assert.equal(weeks[3].end - weeks[3].start, 7 * DAY);
});

test("history rebuilds past weeks, keeps point numbers from saved snapshots and saves this week", async () => {
  const now = Date.parse("2026-10-26T00:00:00Z");
  const weeks = proposals.weekWindows(now);
  const db = fakeDb({ "jarvis_weekly/2026-10-11": { values: { "ops.readiness": 80, "github.bugs": 12 } } });
  const daily = [{ date: "2026-10-05", usd: 10 }, { date: "2026-10-20", usd: 5 }, { date: "2026-10-25", usd: 7.5 }];
  const hist = await proposals.history({
    db, weeks, now,
    count: async (goal, start) => (goal.product === "cv" ? start.getUTCDate() : 0),
    sources: { money: { ok: true, daily }, email: { ok: false }, social: { ok: true, daily: [] }, search: null },
    ga4: async () => [[10, 8], [20, 15], null, [40, 30]],
    point: { readiness: 90, openBugs: 10, braveTop20: 3, outreachWeek: 5 }
  });
  const row = (key) => hist.rows.find((r) => r.key === key);
  assert.deepEqual(row("money.usd").values, [0, 10, 0, 12.5]);
  assert.deepEqual(row("cv.visits").values, [28, 5, 12, 19]);
  assert.deepEqual(row("ga4.sessions").values, [10, 20, null, 40]);
  assert.deepEqual(row("email.processed").values, [null, null, null, null]);
  assert.deepEqual(row("ops.readiness").values, [null, 80, null, 90]);
  assert.equal(row("cv.visits").change, "+58%");
  assert.equal(db.store["jarvis_weekly/2026-10-25"].values["github.bugs"], 10);
  assert.equal(hist.weeks.length, 4);
});

test("the weekly email puts the four weeks side by side with the proposals and Gemini's plan", () => {
  const hist = { weeks: [{ from: "2026-09-28", to: "2026-10-04" }, { from: "2026-10-05", to: "2026-10-11" }, { from: "2026-10-12", to: "2026-10-18" }, { from: "2026-10-19", to: "2026-10-25" }], rows: [{ key: "cv.visits", label: "CV visits", values: [1, 2, null, 4], change: null }] };
  const mail = proposals.weeklyMail({ hist, proposals: [{ title: "Re-run the held reviews", impact: 3, evidence: ["4 held"] }], aiText: "Next week: ship it." });
  assert.equal(mail.subject, "Jarvis weekly strategy, Sep 28 to Oct 25: Re-run the held reviews");
  assert.equal(mail.rows[0].value, "Sep 28 · Oct 5 · Oct 12 · Oct 19");
  assert.equal(mail.rows[1].value, "1 · 2 · — · 4");
  assert.match(mail.body, /^Next week: ship it\.\n\nProposals, by impact:\n1\. Re-run the held reviews/);
  assert.match(proposals.strategyPrompt(hist, []), /Next week:/);
});

test("the weekly strategy runs Sunday 19:00 Bogotá and the settings keep a weekly switch", () => {
  assert.equal(ops.cron("jarvisWeeklyStrategy"), "0 19 * * 0");
  const index = fs.readFileSync(path.join(__dirname, "../../functions/index.js"), "utf8");
  assert.match(index, /exports\.jarvisWeeklyStrategy = scheduled\(/);
  assert.match(index, /op === "proposals"/);
  assert.match(index, /op === "proposal-mark"/);
  const jarvis = require("../../functions/jarvis");
  assert.equal(jarvis.normalizeSettings({}).mail.weekly, true);
  assert.equal(jarvis.normalizeSettings({ mail: { weekly: false } }).mail.weekly, false);
});
