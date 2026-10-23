/**
 * A competitor next to the asker's review: the side-by-side scores, the problems only one site has,
 * who may compare, and the second-review price.
 *
 *   npm run test:review
 */
const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

const compare = require("../../functions/url-review-compare");
const core = require("../../functions/url-review-core");
const offers = require("../../functions/url-review-offers");

const own = require(path.join(__dirname, "fixtures", "review-wordpress.json"));
const rival = require(path.join(__dirname, "fixtures", "review-excalidraw.json"));
const open = (report) => new Set(report.insights.findings.filter((f) => f.verdict === "fail" || f.verdict === "risk").map((f) => f.key));

test("the six area scores and the overall sit side by side", () => {
  const cmp = compare.compareSites(own, rival);
  assert.equal(cmp.ownHost, "wordpress.org");
  assert.equal(cmp.rivalHost, "excalidraw.com");
  assert.equal(cmp.ownId, own.id);
  assert.deepEqual(cmp.overall, { own: own.insights.score.overall, rival: rival.insights.score.overall });
  assert.deepEqual(cmp.areas.map((row) => row.area), ["SEO", "GEO", "Analytics", "Security", "Accessibility", "Performance"]);
  cmp.areas.forEach((row) => {
    assert.equal(row.own, own.insights.score.areas[row.area].score);
    assert.equal(row.rival, rival.insights.score.areas[row.area].score);
  });
});

test("only open problems one site has and the other does not are listed, worst first", () => {
  const cmp = compare.compareSites(own, rival);
  const mine = open(own);
  const theirs = open(rival);
  const ownOnly = [...mine].filter((key) => !theirs.has(key));
  const rivalOnly = [...theirs].filter((key) => !mine.has(key));
  assert.equal(cmp.ownOnlyCount, ownOnly.length);
  assert.equal(cmp.rivalOnlyCount, rivalOnly.length);
  assert.equal(cmp.shared, [...mine].filter((key) => theirs.has(key)).length);
  assert.ok(cmp.ownOnly.length <= compare.LIST_MAX && cmp.rivalOnly.length <= compare.LIST_MAX);
  cmp.ownOnly.forEach((row) => assert.ok(mine.has(row.key) && !theirs.has(row.key)));
  cmp.rivalOnly.forEach((row) => assert.ok(theirs.has(row.key) && !mine.has(row.key)));
  const rank = { critical: 4, high: 3, medium: 2, low: 1, info: 0 };
  cmp.rivalOnly.forEach((row, index) => {
    if (index) assert.ok(rank[cmp.rivalOnly[index - 1].severity] >= rank[row.severity]);
  });
  cmp.ownOnly.concat(cmp.rivalOnly).forEach((row) => assert.deepEqual(Object.keys(row).sort(), ["area", "key", "severity", "title", "verdict"]));
});

test("a passed check is not a problem, and a report without scores gives no comparison", () => {
  const passOnly = { host: "a.com", insights: { score: { overall: 90, areas: {} }, findings: [{ key: "x", verdict: "pass", title: "Fine" }] } };
  const failing = { host: "b.com", insights: { score: { overall: 40, areas: {} }, findings: [{ key: "x", verdict: "fail", severity: "high", title: "Broken" }] } };
  const cmp = compare.compareSites(passOnly, failing);
  assert.equal(cmp.ownOnlyCount, 0);
  assert.deepEqual(cmp.rivalOnly.map((row) => row.key), ["x"]);
  assert.equal(cmp.areas[0].own, null);
  assert.equal(compare.compareSites({ host: "a.com" }, failing), null);
  assert.equal(compare.compareSites(passOnly, null), null);
});

test("only the account that ran a finished review of another site can compare it", () => {
  const base = { email: "ana@example.org", status: "complete", report: own };
  assert.equal(compare.baseProblem(base, "Ana@Example.org", "https://excalidraw.com/"), "");
  assert.match(compare.baseProblem(null, "ana@example.org", "https://excalidraw.com/"), /not saved/);
  assert.match(compare.baseProblem({ email: "ana@example.org", report: { host: "a.com" } }, "ana@example.org", "https://b.com/"), /not saved/);
  assert.match(compare.baseProblem(base, "eve@example.org", "https://excalidraw.com/"), /Only the account/);
  assert.match(compare.baseProblem(base, "", "https://excalidraw.com/"), /Only the account/);
  assert.match(compare.baseProblem(Object.assign({}, base, { status: "stopped" }), "ana@example.org", "https://excalidraw.com/"), /stopped/);
  assert.match(compare.baseProblem(base, "ana@example.org", "https://www.wordpress.org/news"), /same site/);
  assert.equal(compare.sameSite("WWW.Example.com.", "example.com"), true);
  assert.equal(compare.sameSite("shop.example.com", "example.com"), false);
  assert.equal(compare.sameSite("", ""), false);
});

test("the comparison reason needs a base report, and only that reason carries one", () => {
  const body = (extra) => Object.assign({ termsAccepted: true, termsVersion: core.TERMS_VERSION, name: "Ana Ruiz", email: "ana@example.org", frameworks: ["Playwright"], url: "https://excalidraw.com/" }, extra);
  const bare = core.validateIntake(body({ reasonCode: "compare" }));
  assert.ok(bare.errors.some((e) => e.field === "reason"));
  const ok = core.validateIntake(body({ reasonCode: "compare", compareWith: "ABCDEF0123456789zz" }));
  assert.deepEqual(ok.errors, []);
  assert.equal(ok.value.compareWith, "0123456789");
  assert.equal(ok.value.ownership, "");
  assert.equal(core.intakeRecord(ok.value, { id: "r1" }, {}).compareWith, "0123456789");
  const other = core.validateIntake(body({ reasonCode: "teaching", compareWith: "abc123" }));
  assert.equal(other.value.compareWith, "");
  assert.equal(core.intakeRecord(other.value, { id: "r2" }, {}).compareWith, "");
});

test("a comparison is priced as a second review even on a device with no finished run", () => {
  const request = { frameworks: ["Playwright"], tools: [], pages: 20, depth: 2 };
  assert.deepEqual(core.judgeAttempts([], { deviceId: "d1", ip: "1.1.1.1" }, request), { ok: true });
  const due = core.judgeAttempts([], { deviceId: "d1", ip: "1.1.1.1" }, Object.assign({ compareWith: "abc" }, request));
  assert.equal(due.ok, false);
  assert.equal(due.code, "payment");
  assert.equal(due.billing, "run");
  assert.equal(due.priceUsd, 19);
  assert.match(due.message, /second review/);
  const credit = { id: "c1", status: "run-credit", deviceId: "d1", frameworks: ["Playwright"], tools: [], pages: 20, depth: 2 };
  assert.deepEqual(core.judgeAttempts([credit], { deviceId: "d1", ip: "" }, Object.assign({ compareWith: "abc" }, request)), { ok: true, consumeId: "c1" });
});

test("a comparison stands at least on the first return step and climbs the ladder from there", () => {
  assert.equal(offers.discountFor(1900, 1, { returns: 0 }).percent, 0);
  assert.deepEqual(offers.discountFor(1900, 1, { returns: 0, compare: true }), { listUsd: 19, usd: 17.1, cents: 1710, percent: 10, source: "return", code: "" });
  assert.equal(offers.discountFor(1900, 1, { returns: 2, compare: true }).percent, 15);
  assert.equal(offers.discountFor(1900, 1, { returns: 0, compare: true, coupon: { code: "BIG", percent: 30 } }).source, "coupon");
});
