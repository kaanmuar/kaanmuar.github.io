const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const sections = require("../../functions/jarvis-sections");
const snapshot = require("../../functions/jarvis-snapshot");
const days = require("../../functions/jarvis-days");
const jarvis = require("../../functions/jarvis");
const proposals = require("../../functions/jarvis-proposals");
const countdown = require("../../functions/jarvis-countdown");
const { fakeDb, sum } = require("./fake-firestore");

const MINUTE = 60000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const NOW = Date.parse("2026-11-01T15:00:00Z");
const ts = (ms) => ({ toDate: () => new Date(ms), toMillis: () => ms });

function seed() {
  const data = { site_events: [], url_review_opens: [], url_reviews: [], messages: [], ratings: [], jarvis_proposals: [], jarvis_brief_marks: [], jarvis_countdowns: [], jarvis_ai_proposals: [], url_review_reports: [] };
  for (let m = 1; m < 3 * 24 * 60; m += 30) data.site_events.push({ id: "e" + m, site: ["cv", "lab", "studio", "review"][m % 4], kind: "visit", name: "visit", createdAt: ts(NOW - m * MINUTE) });
  for (let m = 3; m < 3 * 24 * 60; m += 120) data.url_review_opens.push({ id: "o" + m, page: "/qa-review.html", country: "CO", createdAt: ts(NOW - m * MINUTE) });
  for (let h = 1; h < 3 * 24; h += 6) data.url_reviews.push({ id: "r" + h, status: "complete", paid: h % 5 < 1, priceUsd: 9, score: 70, createdAt: new Date(NOW - h * HOUR).toISOString() });
  for (let i = 0; i < 4; i += 1) data.jarvis_brief_marks.push({ id: "b" + i, key: "line-" + i, status: "snoozed", until: new Date(NOW + DAY).toISOString() });
  for (let i = 0; i < 5; i += 1) data.jarvis_countdowns.push({ id: "c" + i, kind: "run-job", status: "done", createdAt: new Date(NOW - i * HOUR).toISOString(), endedAt: new Date(NOW - i * HOUR).toISOString() });
  for (let i = 0; i < 3; i += 1) data.url_review_reports.push({ id: "rep" + i, emailedAt: new Date(NOW - i * DAY).toISOString(), period: "daily", label: "Day " + i, opens: i, reviews: 1, paidUsd: 0 });
  data.jarvis_ai_proposals.push({ id: "ai1", key: "fix:ci", title: "Rerun CI", until: new Date(NOW + 2 * HOUR).toISOString() });
  return data;
}

// External sources as jarvisExternal answers them, each with the cachedAt of its own cache.
const EXTERNAL = {
  jobs: { ok: true, jobs: [{ name: "jarvisWatch", state: "ENABLED" }] },
  github: { ok: true, openBugs: 2 },
  health: { ok: true, failures: 0 },
  pagespeed: { ok: true, score: 91 },
  marketing: { ok: true, posts: 3 },
  people: { ok: true, people: [] },
  money: { ok: true, usd: 120 },
  email: { ok: true, sent: 4 }
};

function src(db, range, now, external) {
  return {
    settings: () => jarvis.readSettings(db),
    products: () => jarvis.dailyProducts(db, { now, days: range }),
    external: async () => external(),
    goals: (settings) => jarvis.goals(db, settings, { now, sum }),
    reports: () => jarvis.mailedReports(db),
    savedProposals: () => proposals.saved(db),
    aiProposals: async () => (await db.collection("jarvis_ai_proposals").where("until", ">", new Date(now).toISOString()).limit(20).get()).docs.map((d) => d.data()),
    aiCandidates: (rows, at) => rows.filter((p) => p.until > new Date(at).toISOString()).map((p) => ({ key: p.key, product: "systems", impact: 3, level: "warn", title: p.title, source: "gemini", evidence: [], tab: "systems" })),
    briefMarks: () => proposals.savedBrief(db),
    countdowns: () => countdown.view(db, now)
  };
}

// What jarvisSnapshotOp hands serve: the loaded snapshot with briefHidden, the mail codes and the devices.
async function full(db, now, { external = () => stamp(EXTERNAL, now), devices } = {}) {
  days._memo.clear();
  const { snap, marks, meta } = await snapshot.load(db, 1, src(db, 1, now, external), now);
  const shown = Object.assign({}, snap, { briefHidden: marks.map((m) => ({ key: m.key, status: m.status })) });
  return { snap: Object.assign(shown, { mailCodes: [{ service: "github", code: "123456", at: new Date(NOW - HOUR).toISOString() }], devices: devices || [{ id: "phone", seenAt: new Date(now).toISOString(), mine: true }] }), meta };
}

const stamp = (external, now) => Object.keys(external).reduce((m, k) => { m[k] = Object.assign({ cachedAt: new Date(now).toISOString() }, external[k]); return m; }, {});

const serve = (got, opts, now) => sections.serve(got.snap, got.meta, Object.assign({ days: 1, now }, opts));
const sinceOf = (answer) => Object.keys(answer.versions).reduce((m, k) => { m[k] = answer.versions[k].v; return m; }, {});
const fresh = () => fakeDb(seed());

test("a request without since gets the full snapshot as before, with a version for every section", async () => {
  const got = await full(fresh(), NOW);
  const answer = serve(got, {}, NOW);
  const { versions, ...rest } = answer;
  assert.deepEqual(rest, got.snap);
  assert.deepEqual(Object.keys(versions), sections.NAMES);
  Object.values(versions).forEach((ver) => {
    assert.match(ver.v, /^[0-9a-f]{12}$/);
    assert.ok(Number.isFinite(Date.parse(ver.at)));
  });
});

test("every snapshot field and snapshot source belongs to a named section", async () => {
  const got = await full(fresh(), NOW);
  const parts = sections.split(got.snap);
  assert.deepEqual(Object.keys(parts.other), [], "give these fields a section in jarvis-sections.js");
  const index = fs.readFileSync(path.join(__dirname, "../../functions/index.js"), "utf8");
  const ops = index.match(/const JARVIS_SNAPSHOT_OPS = \[([^\]]+)\]/)[1].match(/"[\w-]+"/g).map((s) => s.slice(1, -1));
  const named = new Set(Object.values(sections.SECTIONS).flatMap((s) => s.external || []));
  assert.deepEqual(ops.filter((op) => !named.has(op)), [], "give these sources a section in jarvis-sections.js");
});

test("since with the current versions gets no sections back, and costs no reads beyond the snapshot's own", async () => {
  const db = fresh();
  const first = serve(await full(db, NOW), {}, NOW);
  db.stats.reads = 0;
  const later = await full(db, NOW + 2 * MINUTE);
  assert.equal(db.stats.reads, 2);
  const answer = serve(later, { since: sinceOf(first) }, NOW + 2 * MINUTE);
  assert.equal(answer.delta, true);
  assert.equal(answer.days, 1);
  assert.deepEqual(answer.sections, {});
  assert.deepEqual(Object.keys(answer.versions), sections.NAMES);
  assert.equal(answer.cachedAt, later.snap.cachedAt);
});

test("a countdown decision sends back only the approvals section, and applying it gives the full snapshot", async () => {
  const data = seed();
  const db = fakeDb(data);
  const first = serve(await full(db, NOW), {}, NOW);
  data.jarvis_countdowns.push({ id: "c9", kind: "run-job", status: "cancelled", createdAt: new Date(NOW + MINUTE).toISOString(), endedAt: new Date(NOW + MINUTE).toISOString() });
  await snapshot.drop(db, ["countdowns"], NOW + MINUTE);
  const later = await full(db, NOW + 2 * MINUTE, { devices: first.devices });
  const answer = serve(later, { since: sinceOf(first) }, NOW + 2 * MINUTE);
  assert.deepEqual(Object.keys(answer.sections), ["approvals"]);
  assert.equal(answer.sections.approvals.countdowns.recent.length, first.countdowns.recent.length + 1);
  assert.notEqual(answer.versions.approvals.v, first.versions.approvals.v);
  const applied = sections.apply(first, answer);
  assert.deepEqual(JSON.parse(JSON.stringify(applied)), JSON.parse(JSON.stringify(serve(later, {}, NOW + 2 * MINUTE))));
});

test("a changed source sends back only its section, with external holding just that section's sources", async () => {
  const db = fresh();
  const first = serve(await full(db, NOW), {}, NOW);
  await snapshot.drop(db, ["external"], NOW + MINUTE);
  const changed = Object.assign({}, EXTERNAL, { jobs: { ok: true, jobs: [{ name: "jarvisWatch", state: "RUNNING" }] } });
  const later = await full(db, NOW + 2 * MINUTE, { external: () => stamp(changed, NOW + 2 * MINUTE) });
  const answer = serve(later, { since: sinceOf(first) }, NOW + 2 * MINUTE);
  assert.ok(answer.sections.systems, "systems changed");
  const external = answer.sections.systems.external;
  assert.deepEqual(Object.keys(external).filter((k) => external[k] !== null).sort(), ["github", "health", "jobs"]);
  assert.equal(external["github-work"], null, "a source the section names but does not have goes as null");
  ["processes", "pagespeed", "marketing", "people", "money", "mail", "products", "settings", "goals", "reports", "devices"].forEach((name) => assert.ok(!answer.sections[name], name + " unchanged"));
  assert.equal(answer.versions.systems.at, new Date(NOW + 2 * MINUTE).toISOString());
  const applied = sections.apply(first, answer);
  assert.equal(applied.external.jobs.jobs[0].state, "RUNNING");
  assert.equal(applied.external.money.usd, 120);
});

test("a source fetched again with the same answer keeps its version", async () => {
  const db = fresh();
  const first = serve(await full(db, NOW), {}, NOW);
  await snapshot.drop(db, ["external"], NOW + MINUTE);
  const later = await full(db, NOW + 2 * MINUTE, { external: () => stamp(EXTERNAL, NOW + 2 * MINUTE) });
  assert.notEqual(later.snap.external.jobs.cachedAt, first.external.jobs.cachedAt);
  const answer = serve(later, { since: sinceOf(first) }, NOW + 2 * MINUTE);
  assert.ok(!answer.sections.processes && !answer.sections.systems, Object.keys(answer.sections).join());
  assert.equal(answer.versions.processes.v, first.versions.processes.v);
});

test("a rebuild with the same data moves no version, and applying the delta still gives the full snapshot (#2819, #2818)", async () => {
  const db = fresh();
  const first = serve(await full(db, NOW), {}, NOW);
  const at = NOW + 6 * MINUTE;
  await snapshot.drop(db, ["products", "external"], NOW + MINUTE);
  const later = await full(db, at, { devices: first.devices, external: () => stamp(EXTERNAL, at) });
  assert.notEqual(later.snap.window.end, first.window.end);
  assert.notEqual(later.snap.connections.find((c) => c.key === "jobs").at, first.connections.find((c) => c.key === "jobs").at);
  const answer = serve(later, { since: sinceOf(first) }, at);
  ["products", "briefing", "processes", "systems"].forEach((name) => assert.ok(!answer.sections[name], name + " kept its version"));
  assert.equal(answer.checked.jobs, new Date(at).toISOString());
  const applied = sections.apply(first, answer);
  assert.equal(applied.external.jobs.cachedAt, new Date(at).toISOString(), "the checked time is the new fetch's");
  assert.equal(applied.connections.find((c) => c.key === "jobs").at, new Date(at).toISOString());
  assert.deepEqual(JSON.parse(JSON.stringify(applied)), JSON.parse(JSON.stringify(serve(later, {}, at))));
});

test("a field or source a section no longer has is dropped on apply; an answer that is not a delta is not applied", () => {
  const kept = { cachedAt: "2026-11-01T15:00:00.000Z", briefHidden: [{ key: "a" }], briefing: [], external: { jobs: { ok: true }, money: { ok: true } }, versions: { briefing: { v: "1" } } };
  const answer = { delta: true, days: 1, cachedAt: kept.cachedAt, versions: { briefing: { v: "2" }, processes: { v: "3" } }, sections: { briefing: { briefing: [{ key: "b" }], briefHidden: null }, processes: { external: { jobs: null } } } };
  const applied = sections.apply(kept, answer);
  assert.ok(!("briefHidden" in applied));
  assert.deepEqual(applied.external, { money: { ok: true } });
  assert.deepEqual(applied.versions, { briefing: { v: "2" }, processes: { v: "3" } });
  assert.equal(sections.apply(kept, { ok: true, products: {} }), null);
  assert.equal(sections.apply(null, answer), null);
  assert.equal(sections.apply(kept, { delta: true, sections: {} }), null, "no versions");
});

test("only limits the sections returned and versioned; unknown names are ignored", async () => {
  const got = await full(fresh(), NOW);
  const answer = serve(got, { since: {}, only: ["processes", "nope"] }, NOW);
  assert.deepEqual(Object.keys(answer.sections), ["processes"]);
  assert.deepEqual(Object.keys(answer.versions), ["processes"]);
  assert.deepEqual(Object.keys(serve(got, { since: {}, only: ["nope"] }, NOW).sections), sections.NAMES);
  assert.deepEqual([...sections.wanted(undefined)], sections.NAMES);
});

test("since {} gets every section; since that is not an object gets the full snapshot", async () => {
  const got = await full(fresh(), NOW);
  const all = serve(got, { since: {} }, NOW);
  assert.deepEqual(Object.keys(all.sections), sections.NAMES);
  assert.ok(serve(got, { since: ["products"] }, NOW).products);
  assert.ok(serve(got, { since: "abc" }, NOW).products);
});

test("the caller's own device stamp does not move the devices version; another device's does", async () => {
  const db = fresh();
  const first = serve(await full(db, NOW), {}, NOW);
  const same = serve(await full(db, NOW + MINUTE), { since: sinceOf(first) }, NOW + MINUTE);
  assert.ok(!same.sections.devices);
  const other = serve(await full(db, NOW + MINUTE, { devices: [{ id: "phone", seenAt: new Date(NOW + MINUTE).toISOString(), mine: true }, { id: "watch", seenAt: new Date(NOW).toISOString(), mine: false }] }), { since: sinceOf(first) }, NOW + MINUTE);
  assert.ok(other.sections.devices);
});

test("mail and devices are read live, so their version time is the request's", async () => {
  const got = await full(fresh(), NOW);
  const answer = serve(got, {}, NOW + 5 * MINUTE);
  assert.equal(answer.versions.mail.at, new Date(NOW + 5 * MINUTE).toISOString());
  assert.equal(answer.versions.devices.at, new Date(NOW + 5 * MINUTE).toISOString());
  assert.equal(answer.versions.reports.at, got.meta.reports.at);
});

test("changed names the sections whose version moved", () => {
  assert.deepEqual(sections.changed({ a: { v: "1" }, b: { v: "2" } }, { a: { v: "1" }, b: { v: "3" }, c: { v: "4" } }), ["b", "c"]);
  assert.deepEqual(sections.changed(null, { a: { v: "1" } }), ["a"]);
});

test("the snapshot op serves through jarvis-sections and skips the reads only leaves out", () => {
  const index = fs.readFileSync(path.join(__dirname, "../../functions/index.js"), "utf8");
  assert.match(index, /op === "snapshot"\) out = await jarvisSnapshotOp\(days, body, now\)/);
  const op = index.slice(index.indexOf("async function jarvisSnapshotOp("), index.indexOf("async function jarvisHeld("));
  assert.match(op, /want\.has\("mail"\) \? mailCodeRows\(\)/);
  assert.match(op, /want\.has\("devices"\) \? jarvisDevice\.list\(/);
  assert.match(op, /jarvisSections\.serve\(/);
});
