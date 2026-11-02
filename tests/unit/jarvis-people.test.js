const test = require("node:test");
const assert = require("node:assert/strict");
const people = require("../../functions/jarvis-people");

const NOW = Date.parse("2026-11-10T15:00:00Z");
const DAY = 24 * 60 * 60 * 1000;
const at = (days) => new Date(NOW - days * DAY).toISOString();

const accounts = [
  { id: "ana@ruiz.co", email: "ana@ruiz.co", providers: ["google.com"], profile: { name: "Ana Ruiz", picture: "https://p/a.jpg" }, createdAt: at(20), lastSignInAt: at(1) },
  { id: "leo@uni.edu", email: "leo@uni.edu", providers: ["email"], profile: {}, createdAt: at(3), lastSignInAt: at(3) },
  { id: "playwright@example.com", email: "playwright@example.com", providers: ["email"], profile: {}, createdAt: at(2), lastSignInAt: at(2) }
];
const visits = [
  { email: "ana@ruiz.co", startedAt: at(10), lastAt: at(10), activeMs: 120000, views: 3, pages: ["qa-review.html"] },
  { email: "ana@ruiz.co", startedAt: at(2), lastAt: at(2), activeMs: 60000, views: 2, pages: ["qa-review-account.html"] },
  { email: "ana@ruiz.co", startedAt: at(1), lastAt: at(1), activeMs: 30000, views: 1, pages: ["qa-review.html"] },
  { email: "leo@uni.edu", startedAt: at(3), lastAt: at(3), activeMs: 45000, views: 1, pages: ["qa-review.html"] },
  { email: "playwright@example.com", startedAt: at(2), lastAt: at(2), activeMs: 5000, views: 1, pages: [] }
];
const runs = [
  { email: "ana@ruiz.co", createdAt: at(10), requestedUrl: "https://ana.example/", status: "done", paid: true },
  { email: "ana@ruiz.co", createdAt: at(1), requestedUrl: "https://ana.example/blog", status: "done" },
  { email: "leo@uni.edu", createdAt: at(3), url: "https://uni.edu/", status: "failed" }
];

test("each signed-in person shows their runs, visits, returns and time, newest first", () => {
  const out = people.summarize({ accounts, visits, runs }, { now: NOW, days: 7 });
  assert.deepEqual(out.people.map((p) => p.email), ["ana@ruiz.co", "playwright@example.com", "leo@uni.edu"]);
  const ana = out.people[0];
  assert.equal(ana.name, "Ana Ruiz");
  assert.equal(ana.visits, 3);
  assert.equal(ana.returns, 2);
  assert.equal(ana.days, 3);
  assert.equal(ana.views, 6);
  assert.equal(ana.activeMs, 210000);
  assert.equal(ana.avgVisitMs, 70000);
  assert.equal(ana.runs, 2);
  assert.equal(ana.paid, 1);
  assert.deepEqual(ana.urls.map((u) => u.url), ["https://ana.example/blog", "https://ana.example/"]);
  assert.equal(ana.recent[0].startedAt, at(1));
  assert.equal(ana.lastSeenAt, at(1));
  assert.equal(ana.test, false);
  assert.equal(ana._visits, undefined);
  assert.equal(out.people[2].urls[0].url, "https://uni.edu/");
  assert.equal(out.people[1].test, true);
});

test("the totals keep test accounts apart and count only the range", () => {
  const out = people.summarize({ accounts, visits, runs }, { now: NOW, days: 7 });
  assert.deepEqual(out.totals, { people: 2, active: 2, new: 1, returning: 1, visits: 3, activeMs: 135000, avgVisitMs: 45000, runs: 2 });
  assert.equal(out.testTotals.people, 1);
  assert.equal(out.allTotals.people, 3);
  assert.equal(out.since, "2026-11-01");
});

test("a visit whose account is gone still names its person; a run without a person is left out", () => {
  const out = people.summarize({ accounts: [], visits: [visits[3]], runs: [runs[0]] }, { now: NOW, days: 30 });
  assert.deepEqual(out.people.map((p) => [p.email, p.runs]), [["leo@uni.edu", 0]]);
});
