const test = require("node:test");
const assert = require("node:assert/strict");
const local = require("../../functions/jarvis-local");
const core = require("../../functions/url-review-core");

const NOW = Date.parse("2026-11-10T15:00:00Z");
const DAY = 24 * 60 * 60 * 1000;
const at = (days) => new Date(NOW - days * DAY).toISOString();
const day = (days) => at(days).slice(0, 10);

const reviews = [
  { id: "a", createdAt: at(1), report: { host: "speed-plumbing.com" }, sweep: { host: "speed-plumbing.com", outreach: true }, source: "sweep",
    local: { profile: true, issues: [{ key: "local-hours", verdict: "risk", severity: "medium" }, { key: "local-utm", verdict: "risk", severity: "low" }] } },
  { id: "b", createdAt: at(2), report: { host: "smile.dental" }, local: { profile: true, issues: [{ key: "local-website", verdict: "fail", severity: "high" }, { key: "local-utm", verdict: "risk", severity: "low" }] } },
  { id: "c", createdAt: at(3), requestedUrl: "https://bakery.example/", local: { profile: false, issues: [{ key: "local-profile", verdict: "risk", severity: "low" }] } },
  { id: "d", createdAt: at(3), report: { host: "clean.example" }, local: { profile: true, issues: [] } },
  { id: "e", createdAt: at(4), report: { host: "saas.example" }, local: null },
  { id: "t", createdAt: at(1), test: true, report: { host: "test.example" }, local: { profile: true, issues: [{ key: "local-hours", verdict: "risk" }] } },
  { id: "old", createdAt: at(20), report: { host: "old.example" }, local: { profile: true, issues: [{ key: "local-hours", verdict: "risk" }] } }
];
const usage = [
  { day: day(0), calls: 3, ok: 3 },
  { day: day(1), calls: 5, ok: 4, errors: 1, lastError: "status 429", lastErrorAt: at(1) },
  { day: day(20), calls: 50, ok: 50 }
];

test("the totals count the local sites in range and leave tests and older runs out", () => {
  const out = local.summarize({ reviews, usage }, { now: NOW, days: 7 });
  assert.equal(out.ok, true);
  assert.deepEqual(out.totals, { reviews: 5, local: 4, profiles: 3, noProfile: 1, withIssues: 3, failing: 1, outreach: 1, calls: 8, errors: 1, callsToday: 3 });
  assert.deepEqual(out.lastError, { at: at(1), error: "status 429" });
});

test("the issues are ranked by how many sites have them, with the failing ones counted", () => {
  const out = local.summarize({ reviews, usage }, { now: NOW, days: 7 });
  assert.deepEqual(out.issues, [
    { key: "local-utm", count: 2, fail: 0 },
    { key: "local-website", count: 1, fail: 1 },
    { key: "local-hours", count: 1, fail: 0 },
    { key: "local-profile", count: 1, fail: 0 }
  ]);
});

test("each site lists its host, worst result and issues, newest first", () => {
  const { sites } = local.summarize({ reviews, usage }, { now: NOW, days: 7 });
  assert.deepEqual(sites.map((s) => [s.host, s.worst, s.outreach]), [
    ["speed-plumbing.com", "risk", true],
    ["smile.dental", "fail", false],
    ["bakery.example", "risk", false],
    ["clean.example", "", false]
  ]);
  assert.deepEqual(sites[0].issues.map((i) => i.key), ["local-hours", "local-utm"]);
});

test("a review keeps only the Local finding keys and verdicts, never the profile text", () => {
  const report = { insights: { findings: [
    { key: "local-profile", verdict: "pass", severity: "info", evidence: "https://www.google.com/maps/place/?q=place_id:abc" },
    { key: "local-hours", verdict: "risk", severity: "medium", evidence: "Wednesday differs" },
    { key: "local-nap", verdict: "pass", severity: "info" },
    { key: "meta-title", verdict: "risk", severity: "low" }
  ] } };
  assert.deepEqual(core.localSummary(report), { profile: true, issues: [{ key: "local-hours", verdict: "risk", severity: "medium" }] });
  assert.equal(core.localSummary({ insights: { findings: [{ key: "meta-title", verdict: "risk" }] } }), null);
  assert.equal(core.intakeRecord({ frameworks: ["Playwright"] }, Object.assign({ id: "r1" }, report), {}).local.profile, true);
});
