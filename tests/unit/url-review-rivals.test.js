const test = require("node:test");
const assert = require("node:assert/strict");

const core = require("../../functions/url-review-core");
const rivals = require("../../functions/url-review-rivals");
const publish = require("../../functions/url-review-publish");
const ops = require("../../functions/ops-schedule");

const AREAS = ["SEO", "GEO", "Analytics", "Security", "Accessibility", "Performance"];

function record(host, overall, extra) {
  const areas = Object.fromEntries(AREAS.map((area, i) => [area, { score: overall - i, fail: 1, risk: 0 }]));
  return Object.assign({
    id: host.replace(/[^a-z]/g, "").padEnd(8, "a"),
    status: "complete",
    createdAt: new Date(Date.now() - 864e5).toISOString(),
    report: {
      id: host.replace(/[^a-z]/g, ""),
      host,
      fetchedAt: new Date().toISOString(),
      status: "complete",
      limits: { pagesRead: 3 },
      pages: [{ status: 200 }],
      insights: { score: { overall, areas, totals: { fail: 2, risk: 1, pass: 20 } }, findings: [] }
    }
  }, extra);
}

test("domains are read from titles and snippets, not file names or sentence breaks", () => {
  assert.deepEqual(rivals.domainsIn("Top Amazon.com rivals: ebay.com, Walmart.com and shop.target.com. See app.js or README.md.It"), ["amazon.com", "ebay.com", "walmart.com", "shop.target.com"]);
  assert.deepEqual(rivals.domainsIn("mail me at a@b.com, competitors.It ends"), []);
});

test("directories, the site itself and its other country domains are left out of the tally", () => {
  const tally = rivals.tallyResults([
    { title: "Top 10 amazon.com competitors", url: "https://www.similarweb.com/website/amazon.com/competitors/", description: "ebay.com, walmart.com, amazon.co.uk, etsy.com" },
    { title: "Walmart vs Amazon", url: "https://corporate.walmart.com/news", description: "Compare with ebay.com" },
    { title: "Amazon alternatives", url: "https://en.wikipedia.org/wiki/Amazon", description: "amazonbusiness.com and aws.com" }
  ], "www.amazon.com", new Map(), core.registrable);
  const scores = Object.fromEntries([...tally.values()].map((row) => [row.host, row.score]));
  assert.deepEqual(scores, { "ebay.com": 4, "walmart.com": 3, "etsy.com": 2, "aws.com": 2 });
});

test("ranked competitors close in size come first, unranked ones only when named often", () => {
  const candidates = [{ host: "giant.com", score: 9 }, { host: "near.com", score: 4 }, { host: "small.com", score: 5 }, { host: "local.com", score: 2 }];
  const ranks = [{ domain: "giant.com", read: true, rank: 5 }, { domain: "near.com", read: true, rank: 2000 }, { domain: "small.com", read: true, rank: null }, { domain: "local.com", read: true, rank: null }];
  const picked = rivals.pickRivals(candidates, ranks, { read: true, rank: 1500 });
  assert.deepEqual(picked.map((row) => row.host), ["near.com", "giant.com", "small.com"]);
});

test("findRivals stops searching once enough competitors are named and checks ranks once", async () => {
  const queries = [];
  const ranked = [];
  const found = await rivals.findRivals("www.shop.co", {
    registrable: core.registrable,
    search: async (query) => {
      queries.push(query);
      return [1, 2, 3, 4, 5, 6].map((n) => ({ title: "Store " + n, url: "https://www.store" + n + ".com/", description: "Like store" + n + ".com" }));
    },
    ranker: async (domains) => { ranked.push(domains); return domains.map((domain, i) => ({ domain, read: true, rank: 1000 + i })); }
  });
  assert.deepEqual(queries, ["shop.co competitors"]);
  assert.equal(ranked.length, 1);
  assert.equal(ranked[0][0], "shop.co");
  assert.equal(found.list.length, rivals.PICK);
  assert.equal(found.ownRank.rank, 1000);
});

test("the dropdown gets full comparisons once paid, names only before", () => {
  const base = record("base.com", 80);
  const rival = record("rival.com", 70);
  const list = { at: "2026-10-24", ownRank: null, list: [{ host: "rival.com", rank: { read: true, rank: 900 } }, { host: "unseen.com", rank: null }] };
  const paid = rivals.payload(Object.assign({ id: base.id }, base.report), list, [rival, null], true);
  assert.equal(paid.list[0].ready, true);
  assert.equal(paid.list[0].compare.overall.rival, 70);
  assert.equal(paid.list[1].ready, false);
  const preview = rivals.payload(Object.assign({ id: base.id }, base.report), list, [rival, null], false);
  assert.deepEqual(preview.list, [{ host: "rival.com", rank: 900, ready: true }, { host: "unseen.com", rank: null, ready: false }]);
});

test("the newest public review counts; old, held or unlisted ones do not", () => {
  const old = record("rival.com", 60, { createdAt: new Date(Date.now() - 400 * 864e5).toISOString() });
  const held = record("rival.com", 61, { unlisted: true });
  const good = record("rival.com", 62);
  assert.equal(rivals.latestPublic([old, held, good], []).report.insights.score.overall, 62);
  assert.equal(rivals.latestPublic([old, held, good], ["rival.com"]), null);
});

test("the rival sweep takes the newest country-sweep site once and queues its competitors", () => {
  const sweptOld = record("old.com", 70, { source: "sweep", createdAt: "2026-10-20T01:00:00Z" });
  const sweptNew = record("new.com", 70, { source: "sweep", createdAt: "2026-10-23T01:00:00Z" });
  const asked = record("asked.com", 70, { createdAt: "2026-10-24T01:00:00Z" });
  const done = record("done.com", 70, { source: "sweep", rivalsAt: "x", createdAt: "2026-10-24T02:00:00Z" });
  assert.equal(rivals.pickBase([sweptOld, sweptNew, asked, done], {}, []).id, sweptNew.id);
  assert.equal(rivals.pickBase([sweptOld, sweptNew], { tried: [sweptNew.id] }, []).id, sweptOld.id);

  const few = rivals.started({}, sweptNew, { list: [{ host: "one.com" }] }, "2026-10-24");
  assert.equal(few.job, null);
  assert.equal(rivals.doneOn(few, "2026-10-24"), 1);
  const queued = rivals.started({}, sweptNew, { list: [{ host: "one.com", rank: null }, { host: "two.com", rank: null }] }, "2026-10-24");
  assert.deepEqual(queued.job.list.map((row) => row.host), ["one.com", "two.com"]);
  assert.deepEqual(queued.tried, [sweptNew.id]);
  assert.equal(rivals.intake("www.one.com", "new.com", "es").reasonCode, "rivals");
});

test("comparisons for social carry hosts and scores, without unlisted sites", () => {
  const base = record("base.com", 80, { source: "sweep", sweep: { cc: "co" } });
  const summary = rivals.socialSummary(base, [record("a.com", 70), null, record("b.com", 90)], { list: [{ host: "a.com" }, { host: "x.com" }, { host: "b.com" }] });
  assert.deepEqual(summary.rivals.map((row) => [row.host, row.overall]), [["a.com", 70], ["b.com", 90]]);
  assert.equal(summary.cc, "co");
  assert.equal(summary.areas.SEO, 80);
  const shown = publish.publicComparisons([Object.assign({ createdAt: "2026-10-24T03:00:00Z" }, summary)], ["b.com"]);
  assert.deepEqual(shown[0].rivals.map((row) => row.host), ["a.com"]);
  assert.deepEqual(publish.publicComparisons([Object.assign({}, summary, { rivals: [] })], []), []);
  assert.equal(publish.selectPublishable([record("a.com", 70, { source: "rivals" })], []).reports[0].source, "rivals");
});

test("the rival sweep runs after the country sweep starts and before the morning batch", () => {
  assert.match(ops.cron("rivalSweep"), /^7-52\/15 1-5 /);
  assert.equal(ops.budget("rivalsPerDay", {}), 4);
});
