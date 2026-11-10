// Jarvis Map (#3115): 90-day plan progress, the next-best-action rules, Gemini's cached order and the Ask summary.
const test = require("node:test");
const assert = require("node:assert/strict");
const ga = require("../../functions/jarvis-geo-actions.js");
const GEO = require("../fixtures/jarvis-geo.json");

// Thursday 2026-11-12 12:00 Bogotá: 3.5 days into the plan week.
const NOW = Date.parse("2026-11-12T17:00:00Z");
const OUTREACH = {
  ok: true,
  pipeline: { ok: true, queued: 40, swept: 12, thisWeek: 6, reviewedHosts: 10, reviewedWithLiveReport: 9 },
  instantly: { ok: true, contacted: 400, openTracking: true, rates: { open: 48, reply: 1.2, positive: 0.4 } },
  plan: {
    start: "2026-10-20", end: "2027-01-17", day: 24, length: 90, phase: { name: "First waves", end: "2026-12-06", daysLeft: 24 },
    next: { date: "2026-11-20", label: "Second wave out", daysLeft: 8 },
    deadlines: [{ date: "2026-11-01", label: "Old one", daysLeft: -11 }, { date: "2026-11-15", label: "Instantly renews", daysLeft: 3 }, { date: "2026-12-01", label: "Partner list", daysLeft: 19 }],
    weekly: { prospects: 40, liveReportPct: 80, openPct: 40, replyPct: 3, positivePct: 1 },
    targets: [{ key: "unlocks", label: "Paid unlocks", target: 30, actual: 3 }]
  }
};
const TARGETS = { ok: true, day: 24, length: 90, targets: [
  { key: "unlocks", label: "Paid unlocks", target: 30, actual: 2, status: "behind", expected: 8, perWeek: 3.1, next: [{ label: "Copy one-pager link", copy: "https://qalabreview.com/pdf" }] },
  { key: "calls", label: "Calls", target: 10, actual: 5, status: "on-pace", expected: 2.7, perWeek: 0.5, next: [] },
  { key: "talks", label: "Talks", target: 2, actual: 2, status: "done", expected: 0.5, next: [] }
] };
const CAMPAIGNS = [
  { id: "c2", name: "W1 E-pt Brazil", status: "active", leads: 30, region: "Brazil", lang: "pt" },
  { id: "c9", name: "W2 A-de DACH", status: "draft", leads: 12, region: "Europe", lang: "de", start: "2026-11-17" }
];
const geoDated = () => {
  const g = JSON.parse(JSON.stringify(GEO));
  const br = g.countries.find((r) => r.cc === "BR");
  br.nextDate = { date: "2026-11-15", name: "Proclamação da República", kind: "holiday" };
  br.daysToDate = 2;
  const mx = g.countries.find((r) => r.cc === "MX");
  mx.nextDate = { date: "2026-11-23", name: "Buen Fin", kind: "commerce" };
  mx.daysToDate = 10;
  const ao = g.countries.find((r) => r.cc === "AO");
  ao.nextDate = { date: "2026-11-13", name: "Independence Day", kind: "holiday" };
  ao.daysToDate = 0;
  return g;
};

test("plan progress: this week against the weekly targets and the 90 days against the judged targets, counts only", () => {
  const p = ga.planProgress(OUTREACH, TARGETS, NOW);
  assert.equal(p.day, 24);
  assert.equal(p.weekShare, 50);
  assert.deepEqual(p.phase, { name: "First waves", end: "2026-12-06", daysLeft: 24 });
  assert.equal(p.next.label, "Second wave out");
  assert.deepEqual(p.deadlines.map((d) => d.label), ["Instantly renews", "Partner list"], "past deadlines drop");
  const week = Object.fromEntries(p.week.map((w) => [w.key, [w.actual, w.target, w.status]]));
  assert.deepEqual(week.prospects, [6, 40, "behind"]);
  assert.deepEqual(week.liveReportPct, [90, 80, "on-track"]);
  assert.deepEqual(week.openPct, [48, 40, "ahead"]);
  assert.deepEqual(week.replyPct, [1.2, 3, "behind"]);
  const total = Object.fromEntries(p.total.map((t) => [t.key, t.status]));
  assert.deepEqual(total, { unlocks: "behind", calls: "ahead", talks: "done" });
  assert.equal(p.total[0].perWeek, 3.1);
  assert.equal(p.status, "behind");
  assert.ok(!JSON.stringify(p).includes("qalabreview"), "no links or plan text beyond the labels");
});

test("plan progress falls back to the plan's own targets, and is null with no plan", () => {
  const p = ga.planProgress(OUTREACH, null, NOW);
  assert.deepEqual(p.total.map((t) => [t.key, t.actual, t.expected, t.status]), [["unlocks", 3, 8, "behind"]]);
  assert.equal(ga.planProgress({ ok: true, plan: { ok: false, error: "No plan uploaded." } }, TARGETS, NOW), null);
  assert.equal(ga.planProgress(null, TARGETS, NOW), null);
  const quiet = ga.planProgress({ ok: true, plan: Object.assign({}, OUTREACH.plan, { weekly: { prospects: 40 } }) }, null, NOW);
  assert.deepEqual(quiet.week.map((w) => w.status), ["no-data"], "no pipeline, no verdict");
});

test("weekly statuses keep a day's grace on counts and judge rates against the target", () => {
  assert.equal(ga.countStatus(0, 40, 0.1), "on-track", "Monday morning is not behind yet");
  assert.equal(ga.countStatus(40, 40, 0.2), "ahead");
  assert.equal(ga.countStatus(5, 40, 0.9), "behind");
  assert.equal(ga.countStatus(null, 40, 0.5), "no-data");
  assert.equal(ga.rateStatus(3.6, 3), "ahead");
  assert.equal(ga.rateStatus(2.8, 3), "on-track");
  assert.equal(ga.rateStatus(2, 3), "behind");
});

test("next actions: holidays soon, bounces, empty queues, the plan, then the rest, each with one Map button", () => {
  const plan = ga.planProgress(OUTREACH, TARGETS, NOW);
  const list = ga.nextActions({ geo: geoDated(), plan, targets: TARGETS, campaigns: CAMPAIGNS });
  const ids = list.map((a) => a.id);
  assert.equal(ids[0], "date-soon:BR:2026-11-15");
  assert.deepEqual(list[0].do, { type: "calendar-pause", label: "Pause that day", cc: "BR", date: "2026-11-15", name: "Proclamação da República" });
  assert.equal(list[0].level, "high");
  assert.ok(!ids.some((id) => id.startsWith("date-soon:AO")), "a silent country's holiday is no action");

  const bounce = list.find((a) => a.kind === "bouncing");
  assert.equal(bounce.title, "Pause W1 E-pt Brazil", "a campaign all in one country needs no country after its name");
  assert.equal(bounce.do.type, "pause");
  assert.equal(bounce.do.id, "c2");
  assert.equal(bounce.do.leads, 30);
  assert.ok(!ids.includes("low-reply:BR"), "the same Pause button shows once");
  assert.match(bounce.why, /0\.6% replies/, "the low-reply reason joins it");

  assert.deepEqual(ids.filter((id) => id.startsWith("no-prospects-left")), ["no-prospects-left:CO", "no-prospects-left:MX", "no-prospects-left:AR", "no-prospects-left:CL"]);
  assert.deepEqual(list.find((a) => a.id === "no-prospects-left:CO").do, { type: "open", label: "Queue prospects", cc: "CO" });

  assert.deepEqual(list.find((a) => a.id === "plan-week:prospects").do, { type: "run", label: "Run the sweep now", job: "sweepReviews" });
  const rates = list.find((a) => a.id === "plan-week:rates");
  assert.equal(rates.cc, "BR", "the reply rates point at the weakest country");
  assert.equal(rates.title, "Lift the reply rates");
  assert.match(rates.why, /^Reply rate 1\.2% against 3%, Positive replies 0\.4% against 1%; Brazil is lowest at 0\.6% replies/);
  assert.deepEqual(list.find((a) => a.id === "target:unlocks").do, { type: "copy", label: "Copy one-pager link", copy: "https://qalabreview.com/pdf" });
  assert.match(list.find((a) => a.id === "target:unlocks").why, /2 of 30 on day 24 of 90, 3\.1 a week from here/);

  const de = list.find((a) => a.id === "no-campaign:DE");
  assert.equal(de.title, "Activate W2 A-de DACH for Germany");
  assert.equal(de.do.type, "activate");
  assert.equal(de.do.start, "2026-11-17");
  assert.equal(list.find((a) => a.id === "no-campaign:GB").do.type, "open", "no draft covers it");

  assert.deepEqual(list.find((a) => a.id === "visitors-no-outreach:JP").do, { type: "target", label: "Make a target", cc: "JP", on: true });
  assert.equal(list.find((a) => a.id === "visitors-no-outreach:IN").do.label, "Queue prospects");

  const confirm = list.find((a) => a.kind === "confirm");
  assert.deepEqual(confirm.do, { type: "confirm", label: "Confirm", host: "teaminternational.com", cc: "US", name: "United States" });
  assert.match(confirm.why, /618 Live Reports wait/);

  const mx = list.find((a) => a.id === "date-ahead:MX:2026-11-23");
  assert.equal(mx.title, "Plan around Buen Fin in Mexico");
  assert.equal(mx.do.type, "open");

  const silent = list.filter((a) => a.kind === "silent");
  assert.deepEqual(silent.map((a) => a.cc), ["BO", "CR"], "Spanish replies best (Spain 5%), so Spanish speakers first");
  assert.match(silent[0].why, /like Spain \(5% replies\); 60 target markets/);

  const order = list.map((a) => ga.ORDER.indexOf(a.kind));
  assert.deepEqual(order, order.slice().sort((a, b) => a - b), "rule order");
  list.forEach((a) => { assert.ok(a.title && a.why && a.do && a.do.type && a.do.label, a.id); });
});

test("saturation warns while a few prospects are left, and dates follow the calendar's warn and remind days", () => {
  const g = geoDated();
  const pe = g.countries.find((r) => r.cc === "PE");
  Object.assign(pe, { prospects: 20, swept: 17, left: 3 });
  const list = ga.nextActions({ geo: g, dates: { warnDays: 7, remindDays: 1 } });
  const sat = list.find((a) => a.id === "saturation:PE");
  assert.match(sat.why, /85% of 20 prospects swept, 3 left while W1 B-es Americas sends/);
  assert.ok(list.some((a) => a.id === "date-ahead:BR:2026-11-15"), "two days out is no longer soon with a one-day reminder");
  assert.ok(!list.some((a) => a.id.startsWith("date-ahead:MX")), "ten days out is past a seven-day warning");
});

test("Gemini's order and line apply only to the same rule set while fresh; otherwise the rules' order and no line", () => {
  const list = ga.nextActions({ geo: geoDated(), campaigns: CAMPAIGNS });
  const rules = ga.applyAi(list, null, NOW);
  assert.equal(rules.ranked, "rules");
  assert.equal(rules.line, "");
  assert.equal(rules.rows.length, ga.SHOWN);
  assert.equal(rules.total, list.length);
  const shown = rules.rows.map((a) => a.id);
  const ai = { at: new Date(NOW - 3600e3).toISOString(), hash: rules.hash, order: [shown[3], shown[0]], line: "Pause Brazil first: 8% bounced." };
  const ranked = ga.applyAi(list, ai, NOW);
  assert.equal(ranked.ranked, "gemini");
  assert.equal(ranked.line, "Pause Brazil first: 8% bounced.");
  assert.deepEqual(ranked.rows.map((a) => a.id).slice(0, 3), [shown[3], shown[0], shown[1]]);
  assert.equal(ga.applyAi(list, Object.assign({}, ai, { hash: "other" }), NOW).ranked, "rules");
  assert.equal(ga.applyAi(list, Object.assign({}, ai, { at: new Date(NOW - 40 * 3600e3).toISOString() }), NOW).ranked, "rules");
});

test("Gemini's answer keeps known ids once, adds the ones it left out, and fails when it keeps none", () => {
  const rows = [{ id: "a" }, { id: "b" }, { id: "c" }];
  assert.deepEqual(ga.parseAi('```json\n{"order":["c","x","c","a"],"line":"**Do c** now"}\n```', rows), { order: ["c", "a", "b"], line: "Do c now" });
  assert.throws(() => ga.parseAi('{"order":["x"]}', rows), /kept none/);
  assert.throws(() => ga.parseAi("no json", rows), /JSON/);
  const prompt = ga.aiPrompt([{ id: "low-reply:BR", kind: "low-reply", title: "t", why: "w" }, { id: "date-soon:BR:x", kind: "date-soon", title: "t2", why: "w2" }], null);
  assert.ok(prompt.indexOf("date-soon:BR:x") < prompt.indexOf("low-reply:BR"), "the prompt lists them in rule order");
  assert.match(prompt, /JSON only/);
});

function cacheDb() {
  const docs = {};
  return { docs, collection: (c) => ({ doc: (id) => ({
    get: async () => ({ exists: !!docs[c + "/" + id], data: () => docs[c + "/" + id] }),
    set: async (row) => { docs[c + "/" + id] = JSON.parse(JSON.stringify(row)); }
  }) }) };
}

test("the hourly refresh asks Gemini once per rule set and day, retries a failure after three hours, and skips without a key", async () => {
  const db = cacheDb();
  const list = ga.nextActions({ geo: geoDated(), campaigns: CAMPAIGNS });
  const geo = { ok: true, actions: ga.applyAi(list, null, NOW), plan: null };
  const first = geo.actions.rows[2].id;
  let asked = 0;
  const gemini = async (prompt) => { asked++; assert.match(prompt, /next actions/); return JSON.stringify({ order: [first], line: "Start with the third." }); };
  const out = await ga.refresh({ db, now: NOW, gemini }, geo);
  assert.deepEqual([out.saved, asked], [true, 1]);
  const kept = db.docs["jarvis_cache/" + ga.AI_DOC];
  assert.equal(kept.hash, geo.actions.hash);
  assert.equal(kept.order[0], first);
  assert.equal(kept.order.length, geo.actions.rows.length);
  assert.equal((await ga.refresh({ db, now: NOW + 3600e3, gemini }, geo)).note, "fresh");
  assert.equal(asked, 1);
  assert.equal(ga.applyAi(list, kept, NOW + 3600e3).rows[0].id, first);

  await ga.refresh({ db, now: NOW + 23 * 3600e3, gemini }, geo);
  assert.equal(asked, 2, "a day on, it asks again");

  const changed = { ok: true, actions: ga.applyAi(list.slice(1), null, NOW), plan: null };
  const failing = async () => { asked++; throw new Error("Gemini 429: quota"); };
  const failed = await ga.refresh({ db, now: NOW + 24 * 3600e3, gemini: failing }, changed);
  assert.match(failed.note, /rules order \(Gemini 429/);
  assert.equal(ga.applyAi(list.slice(1), db.docs["jarvis_cache/" + ga.AI_DOC], NOW + 24 * 3600e3).ranked, "rules");
  assert.equal((await ga.refresh({ db, now: NOW + 25 * 3600e3, gemini: failing }, changed)).note, "fresh");
  await ga.refresh({ db, now: NOW + 28 * 3600e3, gemini: failing }, changed);
  assert.equal(asked, 4, "a failure is tried again after three hours");
  assert.equal((await ga.refresh({ db: cacheDb(), now: NOW, gemini: null }, geo)).note, "no Gemini key");
  assert.equal((await ga.refresh({ db, now: NOW, gemini }, { ok: false })).saved, false);
});

test("attach adds the plan and the actions to the geo answer from the peers it already read", async () => {
  const db = cacheDb();
  const out = geoDated();
  const ctx = { db, now: NOW, peer: async (op) => (op === "targets" ? TARGETS : null) };
  await ga.attach(ctx, out, { outreach: OUTREACH, marketing: { campaigns: { ok: true, rows: CAMPAIGNS } }, calendar: { settings: { warnDays: 14, remindDays: 3 } }, confirm: GEO.confirm });
  assert.equal(out.plan.status, "behind");
  assert.equal(out.actions.ranked, "rules");
  assert.equal(out.actions.rows[0].id, "date-soon:BR:2026-11-15");
  assert.ok(out.actions.rows.some((a) => a.id === "target:unlocks"));
  assert.ok(JSON.stringify(out.actions).length < 9000, "compact enough for the snapshot");
});

test("Ask gets the plan and the next actions in a few lines", () => {
  const out = geoDated();
  out.plan = ga.planProgress(OUTREACH, TARGETS, NOW);
  out.actions = ga.applyAi(ga.nextActions({ geo: out, plan: out.plan, targets: TARGETS, campaigns: CAMPAIGNS }), null, NOW);
  const a = ga.askOf(out);
  assert.equal(a.plan.status, "behind");
  assert.equal(a.plan.next, "Second wave out in 8 days");
  assert.ok(a.plan.thisWeek.includes("Prospects reviewed: 6 of 40, behind"));
  assert.ok(a.plan.toDate.includes("Paid unlocks: 2 of 30, behind"));
  assert.equal(a.nextActions.length, 8);
  assert.match(a.nextActions[0], /^Pause Brazil's campaigns for Proclamação da República: /);
  assert.equal(ga.askOf({ ok: false }), null);
  assert.equal(ga.askOf(null), null);
});
