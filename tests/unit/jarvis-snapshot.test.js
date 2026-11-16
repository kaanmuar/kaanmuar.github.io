const test = require("node:test");
const assert = require("node:assert/strict");
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

// About a production day (#2085): 300 site events, 60 review page opens and 10 reviews, over 16 days.
function seed() {
  const data = { site_events: [], url_review_opens: [], url_reviews: [], messages: [], ratings: [], jarvis_proposals: [], jarvis_brief_marks: [], jarvis_countdowns: [], jarvis_ai_proposals: [], url_review_reports: [] };
  for (let m = 1; m < 16 * 24 * 60; m += 5) data.site_events.push({ id: "e" + m, site: ["cv", "lab", "studio", "review"][m % 4], kind: "visit", name: "visit", createdAt: ts(NOW - m * MINUTE) });
  for (let m = 3; m < 16 * 24 * 60; m += 24) data.url_review_opens.push({ id: "o" + m, page: "/qa-review.html", country: "CO", createdAt: ts(NOW - m * MINUTE) });
  for (let h = 1; h < 16 * 24; h += 2.4) data.url_reviews.push({ id: "r" + h, status: "complete", paid: h % 5 < 1, priceUsd: 9, score: 70, createdAt: new Date(NOW - h * HOUR).toISOString() });
  for (let d = 0; d < 14; d += 1) data.messages.push({ id: "m" + d, kind: "message", email: "fan" + d + "@real.co", createdAt: ts(NOW - d * DAY - HOUR) });
  for (let i = 0; i < 60; i += 1) data.jarvis_proposals.push({ id: "p" + i, key: "old-" + i, status: i % 2 ? "done" : "dismissed", at: new Date(NOW - i * DAY).toISOString(), until: new Date(NOW + (30 - i) * DAY).toISOString() });
  for (let i = 0; i < 30; i += 1) data.jarvis_brief_marks.push({ id: "b" + i, key: "line-" + i, status: "snoozed", until: new Date(NOW + DAY).toISOString() });
  for (let i = 0; i < 40; i += 1) data.jarvis_countdowns.push({ id: "c" + i, kind: "run-job", status: "done", createdAt: new Date(NOW - i * HOUR).toISOString(), endedAt: new Date(NOW - i * HOUR).toISOString() });
  for (let i = 0; i < 20; i += 1) data.url_review_reports.push({ id: "rep" + i, emailedAt: new Date(NOW - i * DAY).toISOString(), period: "daily", label: "Day " + i, opens: i, reviews: 1, paidUsd: 0 });
  data.jarvis_ai_proposals.push({ id: "ai1", key: "fix:ci", title: "Rerun CI", until: new Date(NOW + 2 * HOUR).toISOString() });
  return data;
}

function withSettings(db) {
  db.docs["jarvis_settings/main"] = { goals: [{ product: "review", metric: "reviews", period: "week", target: 50 }, { product: "review", metric: "usd", period: "month", target: 500 }] };
  return db;
}

// What functions/index.js hands jarvis-snapshot.load, with the external sources (their own caches) left out.
function src(db, range, now) {
  return {
    settings: () => jarvis.readSettings(db),
    products: () => jarvis.dailyProducts(db, { now, days: range }),
    external: async () => ({ github: { ok: true, openBugs: 2 } }),
    goals: (settings) => jarvis.goals(db, settings, { now, sum }),
    reports: () => jarvis.mailedReports(db),
    savedProposals: () => proposals.saved(db),
    aiProposals: async () => (await db.collection("jarvis_ai_proposals").where("until", ">", new Date(now).toISOString()).limit(20).get()).docs.map((d) => d.data()),
    aiCandidates: (rows, at) => rows.filter((p) => p.until > new Date(at).toISOString()).map((p) => ({ key: p.key, product: "systems", impact: 3, level: "warn", title: p.title, source: "gemini", evidence: [], tab: "systems" })),
    briefMarks: () => proposals.savedBrief(db),
    countdowns: () => countdown.view(db, now)
  };
}

// The app's background refresh: its range, then 1 day. `before` runs ahead of each range's call.
async function refresh(db, now, range = 7, before = () => null) {
  days._memo.clear();
  db.stats.reads = 0;
  const out = {};
  for (const r of range === 1 ? [1] : [range, 1]) {
    before();
    out[r] = await snapshot.load(db, r, src(db, r, now), now);
  }
  return { out, reads: db.stats.reads };
}

// The same refresh as before #2099: every section of each range built again and the open day read whole.
function rebuild(db, now) {
  return refresh(db, now, 7, () => {
    Object.keys(db.docs).filter((k) => k.startsWith("jarvis_cache/sections-")).forEach((k) => { delete db.docs[k]; });
    Object.keys(db.docs).filter((k) => k.startsWith("jarvis_days/")).forEach((k) => {
      const parts = db.docs[k].parts || {};
      Object.keys(parts).forEach((kind) => { if (parts[kind].open) delete parts[kind]; });
    });
  });
}

const shown = (snap) => JSON.parse(JSON.stringify(Object.assign({}, snap, { cachedAt: "" })));

test("a background refresh 30 minutes later reads a small part of what a full rebuild reads", async () => {
  const data = seed();
  const warm = withSettings(fakeDb(data));
  const cold = withSettings(fakeDb(data));
  await refresh(warm, NOW);
  await refresh(cold, NOW);
  for (let m = 2; m < 30; m += 5) data.site_events.push({ id: "n" + m, site: "cv", kind: "visit", name: "visit", createdAt: ts(NOW + m * MINUTE) });
  data.url_review_opens.push({ id: "n-open", page: "/qa-review.html", createdAt: ts(NOW + 20 * MINUTE) });
  const later = NOW + 30 * MINUTE;
  const before = await rebuild(cold, later);
  const after = await refresh(warm, later);
  console.log("refresh reads, 7 days and 1 day: " + before.reads + " rebuilt, " + after.reads + " with the open day and sections kept");
  assert.ok(after.reads * 3 < before.reads, after.reads + " vs " + before.reads);
  assert.deepEqual(shown(after.out[7].snap), shown(before.out[7].snap));
  assert.deepEqual(shown(after.out[1].snap), shown(before.out[1].snap));
  assert.equal(after.out[1].snap.products.cv.kpis[0].value, before.out[1].snap.products.cv.kpis[0].value);
  assert.equal(after.out[7].snap.reports.length, 12);
  assert.ok(after.out[1].snap.feed.length && after.out[1].snap.socialHeat.length);
});

test("inside the products TTL a snapshot is two document reads", async () => {
  const db = withSettings(fakeDb(seed()));
  await refresh(db, NOW, 1);
  const again = await refresh(db, NOW + 2 * MINUTE, 1);
  assert.equal(again.reads, 2);
  assert.equal(again.out[1].snap.cachedAt, new Date(NOW).toISOString());
  assert.equal(again.out[1].marks.length, 30);
});

test("a section is built from the same values whether built now or kept", async () => {
  const db = withSettings(fakeDb(seed()));
  const fresh = (await refresh(db, NOW, 1)).out[1];
  const kept = (await refresh(db, NOW + MINUTE, 1)).out[1];
  assert.deepEqual(shown(kept.snap), shown(fresh.snap));
  assert.deepEqual(kept.meta, fresh.meta);
  assert.ok(Object.values(fresh.meta).every((m) => /^[0-9a-f]{12}$/.test(m.v)));
});

test("a write drops its section in every range, and only that section is read again", async () => {
  const data = seed();
  const db = withSettings(fakeDb(data));
  await refresh(db, NOW);
  data.jarvis_proposals.push({ id: "fresh", key: "fix:ci", status: "dismissed", at: new Date(NOW).toISOString(), until: new Date(NOW + 30 * DAY).toISOString() });
  const stale = await refresh(db, NOW + MINUTE);
  assert.ok(stale.out[7].snap.proposals.some((p) => p.key === "fix:ci"), "kept until dropped");
  await snapshot.drop(db, ["proposals"], NOW + MINUTE);
  const { out, reads } = await refresh(db, NOW + 2 * MINUTE);
  assert.ok(!out[7].snap.proposals.some((p) => p.key === "fix:ci") && !out[1].snap.proposals.some((p) => p.key === "fix:ci"));
  // the range's and the shared section documents for each range, and the saved proposals (61) and the AI one once
  assert.equal(reads, 2 * 2 + data.jarvis_proposals.length + 1);
});

test("a build that started before a write and saved after it is still stale", async () => {
  const db = withSettings(fakeDb(seed()));
  await refresh(db, NOW, 1);
  await snapshot.drop(db, ["marks"], NOW + 3 * MINUTE);
  const late = await snapshot.load(db, 1, src(db, 1, NOW + 2 * MINUTE), NOW + 2 * MINUTE);
  assert.equal(late.meta.marks.at, new Date(NOW + 2 * MINUTE).toISOString());
  db.stats.queries = [];
  await snapshot.load(db, 1, src(db, 1, NOW + 4 * MINUTE), NOW + 4 * MINUTE);
  assert.ok(db.stats.queries.includes("jarvis_brief_marks"));
});

test("a settings save rebuilds settings and the goals built from them", async () => {
  const db = withSettings(fakeDb(seed()));
  const first = (await refresh(db, NOW, 1)).out[1];
  assert.equal(first.snap.goals.length, 2);
  db.docs["jarvis_settings/main"] = { goals: [{ product: "review", metric: "reviews", period: "week", target: 50 }] };
  await snapshot.drop(db, ["settings", "external"], NOW + MINUTE);
  const next = (await refresh(db, NOW + 2 * MINUTE, 1)).out[1];
  assert.equal(next.snap.goals.length, 1);
  assert.equal(next.snap.settings.goals.length, 1);
  assert.equal(next.meta.products.at, first.meta.products.at);
});

test("an AI proposal kept in the snapshot leaves it when it expires", async () => {
  const db = withSettings(fakeDb(seed()));
  const first = (await refresh(db, NOW, 1)).out[1];
  assert.ok(first.snap.proposals.some((p) => p.key === "fix:ci"));
  const later = (await refresh(db, NOW + 3 * HOUR, 1)).out[1];
  assert.equal(later.meta.proposals.at, first.meta.proposals.at);
  assert.ok(!later.snap.proposals.some((p) => p.key === "fix:ci"));
});
