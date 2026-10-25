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
  const credit = { id: "c1", status: "run-credit", deviceId: "d1", frameworks: ["Playwright"], tools: [], pages: 20, depth: 2, compareWith: "abc" };
  assert.deepEqual(core.judgeAttempts([credit], { deviceId: "d1", ip: "" }, Object.assign({ compareWith: "abc" }, request)), { ok: true, consumeId: "c1" });
});

test("a credit bought for a comparison pays for that comparison only", () => {
  const request = { frameworks: ["Playwright"], tools: [], pages: 20, depth: 2 };
  const who = { deviceId: "d1", ip: "" };
  const plain = { id: "p1", status: "run-credit", deviceId: "d1", frameworks: ["Playwright"], tools: [], pages: 20, depth: 2 };
  const tied = Object.assign({}, plain, { id: "t1", compareWith: "abc" });
  assert.equal(core.judgeAttempts([plain], who, Object.assign({ compareWith: "abc" }, request)).code, "payment");
  assert.equal(core.judgeAttempts([tied], who, Object.assign({ compareWith: "def" }, request)).code, "payment");
  const done = { id: "r0", status: "complete", deviceId: "d1" };
  assert.equal(core.judgeAttempts([done, tied], who, request).code, "payment");
  assert.deepEqual(core.judgeAttempts([done, plain, tied], who, request), { ok: true, consumeId: "p1" });
  assert.deepEqual(core.judgeAttempts([plain, tied], who, Object.assign({ compareWith: "abc" }, request)), { ok: true, consumeId: "t1" });
});

test("a competitor run's skipped typing and chat checks are not listed as the asker's alone", () => {
  const finding = (key) => ({ key, verdict: "risk", severity: "medium", title: key, area: "Accessibility" });
  const mine = { host: "a.com", insights: { score: { overall: 70, areas: {} }, findings: compare.ACTIVE_KEYS.map(finding).concat(finding("seo-title")) } };
  const theirs = { host: "b.com", insights: { score: { overall: 80, areas: {} }, findings: [] } };
  const active = compare.compareSites(mine, theirs);
  assert.equal(active.passive, false);
  assert.equal(active.ownOnlyCount, compare.ACTIVE_KEYS.length + 1);
  const passive = compare.compareSites(mine, Object.assign({ limits: { passive: true } }, theirs));
  assert.equal(passive.passive, true);
  assert.deepEqual(passive.ownOnly.map((row) => row.key), ["seo-title"]);
});

test("the browser refuses to type into a field or open the chat on a competitor run", async () => {
  const browser = require("../../functions/url-review-browser");
  assert.equal(browser.passiveJob({ passive: true }), true);
  assert.equal(browser.passiveJob({ passive: "yes" }), false);
  assert.equal(browser.passiveJob(null), false);
  const touched = [];
  const page = new Proxy({}, { get: (target, name) => { touched.push(name); return () => Promise.resolve(null); } });
  await assert.rejects(browser.typeProbe(page, {}, "first", { passive: true }), /Typing into a field was refused: a competitor run is strictly passive/);
  await assert.rejects(browser.openChat(page, [], { passive: true }), /Opening the chat was refused: a competitor run is strictly passive/);
  assert.deepEqual(touched, []);
  const refused = { ok: false, error: "The conversation was refused: a competitor run is strictly passive." };
  assert.deepEqual(await browser.talk({ kind: "chat", proof: "own", passive: true, url: "https://shop.example.com/", turns: [{ id: "hello", text: "Hi" }] }), refused);
  assert.deepEqual(await browser.browse({ kind: "chat", proof: "own", passive: true, url: "https://shop.example.com/", turns: [] }), refused);
});

test("a comparison paid through a credit opens its own report and keeps its base", () => {
  const value = core.validateIntake({ termsAccepted: true, termsVersion: core.TERMS_VERSION, name: "Ana Ruiz", email: "ana@example.org", frameworks: ["Playwright"], url: "https://excalidraw.com/", reasonCode: "compare", compareWith: "abc123" }).value;
  const paid = core.intakeRecord(value, { id: "r1" }, { creditId: "t1" });
  assert.equal(paid.paid, true);
  assert.equal(paid.creditId, "t1");
  assert.equal(paid.compareWith, "abc123");
  assert.equal(core.intakeRecord(value, { id: "r2" }, {}).paid, false);
});

test("each head-to-head indicator names a winner the right way round, with a level band", () => {
  const kpi = (key) => compare.KPIS.find((row) => row.key === key);
  assert.equal(compare.winnerOf(kpi("overall"), 80, 70), "own");
  assert.equal(compare.winnerOf(kpi("overall"), 80, 79), "tie");
  assert.equal(compare.winnerOf(kpi("open"), 3, 9), "own");
  assert.equal(compare.winnerOf(kpi("open"), 3, 3), "tie");
  assert.equal(compare.winnerOf(kpi("lcp"), 2000, 2050), "tie");
  assert.equal(compare.winnerOf(kpi("lcp"), 2000, 3400), "own");
  assert.equal(compare.winnerOf(kpi("pagesFound"), 40, 400), "rival");
  assert.equal(compare.winnerOf(kpi("lcp"), null, 3400), "");
});

test("the comparison carries indicators, level areas, mixes, shared problems and a dominance tally", () => {
  const cmp = compare.compareSites(own, rival);
  const byKey = Object.fromEntries(cmp.kpis.map((row) => [row.key, row]));
  assert.equal(byKey.overall.own, own.insights.score.overall);
  assert.equal(byKey.open.own, own.insights.score.totals.fail + own.insights.score.totals.risk);
  assert.equal(byKey.languages.own, own.observed.signals.hreflang);
  assert.ok(!byKey.lighthouse, "an indicator neither report measured is left out");
  cmp.areas.forEach((row) => {
    assert.equal(row.lead, row.own - row.rival);
    assert.equal(row.level, Math.abs(row.lead) < compare.LEVEL_GAP);
  });
  const decided = cmp.areas.length + cmp.kpis.filter((row) => row.key !== "overall" && row.winner).length;
  assert.equal(cmp.dominance.own + cmp.dominance.rival + cmp.dominance.tie, decided);
  assert.deepEqual(cmp.verdicts.own, own.insights.score.totals);
  assert.deepEqual(cmp.severities.own, own.insights.score.severities);
  assert.equal(cmp.sharedList.length, Math.min(cmp.shared, 8));
  const theirs = open(rival);
  cmp.sharedList.forEach((row) => assert.ok(open(own).has(row.key) && theirs.has(row.key)));
  assert.deepEqual(cmp.trail, { own: [], rival: [] });
  assert.equal(cmp.market.own.rank, null);
});

test("both score trails keep the last eight dated reviews in the order given", () => {
  const rows = Array.from({ length: 10 }, (item, index) => ({ at: "2026-0" + (index % 9 + 1) + "-01T10:00:00Z", overall: 50 + index }));
  const cmp = compare.compareSites(own, rival, { trail: { own: rows, rival: [{ at: "2026-10-01T00:00:00Z", overall: 70 }, { at: "", overall: 3 }] } });
  assert.equal(cmp.trail.own.length, 8);
  assert.deepEqual(cmp.trail.own[7], { at: "2026-01-01", overall: 59 });
  assert.deepEqual(cmp.trail.rival, [{ at: "2026-10-01", overall: 70 }]);
});

test("market presence weighs the Tranco rank and the public signals that could be read", () => {
  const market = require("../../functions/url-review-market");
  const ranks = market.readRanks({ ranks: [{ date: "2026-10-23", rank: 254 }, { date: "2026-10-01", rank: 300 }, { date: "bad", rank: 1 }] }, "hubspot.com");
  assert.deepEqual(ranks, { domain: "hubspot.com", read: true, rank: 254, ranks: [{ date: "2026-10-01", rank: 300 }, { date: "2026-10-23", rank: 254 }], change: 46 });
  assert.deepEqual(market.readRanks({ ranks: [] }, "tiny.example"), { domain: "tiny.example", read: true, rank: null, ranks: [], change: null });
  assert.equal(market.rankPart(1), 1);
  assert.equal(market.rankPart(1000), 0.5);
  assert.equal(market.rankPart(null), 0);
  const big = { limits: { pagesFound: 10000 }, pagespeed: { field: { scope: "origin" } }, mentions: [1, 2, 3, 4], observed: { signals: { hreflang: 31 }, socialLinks: [1, 2, 3, 4, 5], registered: "2006-10-24" } };
  const now = Date.parse("2026-10-24T00:00:00Z");
  const top = market.presence(big, { read: true, rank: 1, ranks: [] }, now);
  assert.equal(top.score, 100);
  assert.equal(top.signals.find((row) => row.key === "age").value, 20);
  const unread = market.presence({ limits: { pagesFound: 10000 } }, { read: false }, now);
  assert.equal(unread.score, 100, "only pages found was read, so it carries the whole score");
  assert.equal(unread.signals.find((row) => row.key === "rank").points, null);
  assert.equal(market.presence({}, null, now).score, null);
  const view = market.marketView(big, { limits: { pagesFound: 10000 } }, { own: { read: true, rank: 1000 }, rival: { read: true, rank: null } }, now);
  assert.equal(view.own.rank, 1000);
  assert.equal(view.share, Math.round(view.own.score / (view.own.score + view.rival.score) * 100));
});

test("Tranco is asked one domain at a time and a refusal is not read as a rank", async () => {
  const market = require("../../functions/url-review-market");
  const asked = [];
  const fetcher = async (url) => {
    asked.push(url);
    if (/refused/.test(url)) return { ok: false, json: async () => ({}) };
    return { ok: true, json: async () => ({ ranks: [{ date: "2026-10-23", rank: 12 }] }) };
  };
  const [one, two, bad] = await market.trancoRanks(["one-" + Date.now() + ".com", "two-" + Date.now() + ".com", "refused.com"], fetcher, 0);
  assert.equal(one.rank, 12);
  assert.equal(two.rank, 12);
  assert.deepEqual(bad, { domain: "refused.com", read: false });
  assert.equal(asked.length, 3);
  assert.ok(asked.every((url) => url.startsWith(market.TRANCO_API)));
  assert.deepEqual(await market.trancoRank("not a domain", fetcher), { domain: "not a domain", read: false });
});

test("the domain's registration date is read from RDAP", () => {
  const facts = core.readRdap({ events: [{ eventAction: "registration", eventDate: "1995-08-14T04:00:00Z" }, { eventAction: "expiration", eventDate: "2030-08-13T04:00:00Z" }] }, "example.com");
  assert.equal(facts.registered, "1995-08-14");
  assert.equal(facts.expires, "2030-08-13");
  assert.equal(core.readRdap({ events: [] }, "example.com").registered, "");
});

test("a comparison stands at least on the first return step and climbs the ladder from there", () => {
  assert.equal(offers.discountFor(1900, 1, { returns: 0 }).percent, 0);
  assert.deepEqual(offers.discountFor(1900, 1, { returns: 0, compare: true }), { listUsd: 19, usd: 17.1, cents: 1710, percent: 10, source: "return", code: "" });
  assert.equal(offers.discountFor(1900, 1, { returns: 2, compare: true }).percent, 15);
  assert.equal(offers.discountFor(1900, 1, { returns: 0, compare: true, coupon: { code: "BIG", percent: 30 } }).source, "coupon");
});

test("a base review lists only the comparisons its owner ran from it, newest first", () => {
  const cmp = compare.compareSites(Object.assign({}, own, { id: "ab12" }), rival);
  const row = (id, at, extra) => Object.assign({ id, email: "ana@example.com", createdAt: at, compareWith: "ab12", report: Object.assign({}, rival, { id, compare: cmp }) }, extra);
  const rows = [
    row("c1", "2026-10-20T10:00:00Z"),
    row("c2", "2026-10-24T10:00:00Z"),
    row("c3", "2026-10-22T10:00:00Z", { email: "eve@example.com" }),
    row("c4", "2026-10-23T10:00:00Z", { compareWith: "ff99" }),
    { id: "c5", email: "ana@example.com", compareWith: "ab12", report: Object.assign({}, rival, { id: "c5" }) }
  ];
  const lines = compare.comparisonsOf(rows, "ab12", "Ana@Example.com");
  assert.deepEqual(lines.map((line) => line.id), ["c2", "c1"]);
  assert.deepEqual(lines[0], { id: "c2", at: "2026-10-24T10:00:00Z", baseId: "ab12", ownHost: own.host, rivalHost: rival.host, own: cmp.overall.own, rival: cmp.overall.rival, dominance: cmp.dominance });
  assert.deepEqual(compare.comparisonsOf(rows, "ab12", ""), []);
  assert.deepEqual(compare.comparisonsOf(rows, "", "ana@example.com"), []);
});

test("the account file names the base review of each comparison run", () => {
  const base = { id: "ab12", email: "ana@example.com", createdAt: "2026-10-19T10:00:00Z", report: Object.assign({}, own, { id: "ab12" }) };
  const cmp = compare.compareSites(base.report, rival);
  const run = { id: "cd34", email: "ana@example.com", createdAt: "2026-10-24T10:00:00Z", compareWith: "ab12", report: Object.assign({}, rival, { id: "cd34", compare: cmp }) };
  const file = offers.accountFile([base, run], "ana@example.com", Date.parse("2026-10-24T12:00:00Z"));
  assert.equal(file.runs.find((item) => item.id === "ab12").compare, null);
  assert.deepEqual(file.runs.find((item) => item.id === "cd34").compare, { id: "cd34", at: run.createdAt, baseId: "ab12", ownHost: own.host, rivalHost: rival.host, own: cmp.overall.own, rival: cmp.overall.rival, dominance: cmp.dominance });
});

test("saved reviews of one account are compared with the first one, and only when each opens in full", () => {
  const row = (id, report, extra) => Object.assign({ id, email: "Ana@Example.com", status: "complete", createdAt: "2026-10-2" + id.length + "T10:00:00Z", report }, extra);
  const records = [
    row("aa01", own),
    row("bb02", rival),
    row("cc03", rival, { status: "stopped" }),
    row("dd04", rival),
    row("ee05", Object.assign({}, own, { host: "www." + own.host })),
    row("ff06", rival, { email: "bob@example.com" })
  ];
  const shut = new Set(["dd04"]);
  const made = compare.savedComparison(records, "ana@example.com", ["aa01", "bb02", "cc03", "dd04", "ee05", "ff06"], (item) => !shut.has(item.id));
  assert.deepEqual(made.base, { id: "aa01", host: own.host, at: records[0].createdAt });
  assert.equal(made.list.length, compare.SAVED_MAX - 1, "the base and four others at most");
  assert.deepEqual(made.list[0].compare, compare.compareSites(Object.assign({}, own, { id: "aa01" }), rival));
  assert.equal(made.list[1].stopped, true);
  assert.equal(made.list[2].locked, true);
  assert.equal(made.list[2].compare, undefined, "a shut report is never compared");
  assert.equal(made.list[3].same, true);

  assert.match(compare.savedComparison(records, "ana@example.com", ["aa01"], () => true).error, /at least two/);
  assert.match(compare.savedComparison(records, "ana@example.com", ["ff06", "aa01"], () => true).error, /not saved under this account/);
  assert.match(compare.savedComparison(records, "ana@example.com", ["cc03", "aa01"], () => true).error, /stopped early/);
  assert.equal(compare.savedComparison(records, "ana@example.com", ["ff06", "aa01"], () => true).code, "reviewNotSaved");
  assert.equal(compare.savedComparison(records, "ana@example.com", ["cc03", "aa01"], () => true).code, "stoppedBase");
  const locked = compare.savedComparison(records, "ana@example.com", ["dd04", "aa01"], (item) => !shut.has(item.id));
  assert.equal(locked.locked, "dd04");
  assert.match(locked.error, /Unlock it/);
});

require("./url-review-rivals.test");
