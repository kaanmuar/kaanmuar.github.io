const test = require("node:test");
const assert = require("node:assert");
const stats = require("../../functions/social-hub-stats");

const NOW = Date.parse("2026-10-24T12:00:00Z");
const DAY = 24 * 60 * 60 * 1000;

test("post pages and hub pages are told apart", () => {
  assert.strictEqual(stats.postIdFromPath("/social/auto-2026-10-22/01-u-uber-com.html"), "auto-2026-10-22/01-u-uber-com");
  assert.strictEqual(stats.postIdFromPath("/social/tips/03-alt-text.html?utm_source=x"), "tips/03-alt-text");
  assert.strictEqual(stats.postIdFromPath("/qa-review-social-es.html"), "");
});

test("copy and share labels carry the network and the post", () => {
  assert.deepStrictEqual(stats.readLabel("hub_share", "x:auto-2026-10-22/01-u-uber-com"), { id: "auto-2026-10-22/01-u-uber-com", network: "x" });
  assert.deepStrictEqual(stats.readLabel("post_copy", "linkedin"), { id: "", network: "linkedin" });
  assert.deepStrictEqual(stats.readLabel("hub_open", "tips/03-alt-text"), { id: "tips/03-alt-text", network: "" });
});

test("site events and GA4 views fold into per-post numbers and a public ranking", () => {
  const ga = {
    pages: [
      { dims: ["/social/a.html", "date_range_0"], mets: [40, 30] },
      { dims: ["/social/a.html", "date_range_1"], mets: [10, 8] },
      { dims: ["/qa-review-social-es.html", "date_range_0"], mets: [100, 70] },
      { dims: ["/qa-review-social-es.html", "date_range_1"], mets: [20, 15] }
    ],
    sources: [{ dims: ["linkedin", "social", "social-hub-promo"], mets: [12] }],
    events: [{ dims: ["hub_open"], mets: [3] }, { dims: ["post_share"], mets: [7] }]
  };
  const events = [
    { name: "hub_view", label: "es", at: NOW - DAY },
    { name: "hub_view", label: "en", at: NOW - 10 * DAY },
    { name: "post_view", label: "a", at: NOW - DAY },
    { name: "post_view", label: "b", at: NOW - 2 * DAY },
    { name: "hub_share", label: "x:b", at: NOW - DAY },
    { name: "hub_share", label: "x:b", at: NOW - DAY },
    { name: "post_copy", label: "linkedin:b", at: NOW - DAY },
    { name: "hub_open", label: "c", at: NOW - 20 * DAY },
    { name: "hub_filter", label: "tips", at: NOW - DAY }
  ];
  const { stats: out, trends } = stats.summarize({ ga, events, now: NOW });
  const byId = Object.fromEntries(out.posts.map((row) => [row.id, row]));

  assert.deepStrictEqual([byId.a.views, byId.a.views7, byId.a.gaViews, byId.a.gaViews7, byId.a.gaUsers, byId.a.score], [1, 1, 40, 10, 30, 10]);
  assert.deepStrictEqual([byId.b.views, byId.b.shares, byId.b.copies, byId.b.score], [1, 2, 1, 10]);
  assert.strictEqual(byId.c.opens, 1);
  assert.strictEqual(byId.c.score, 0, "older than a week does not count towards Trending");
  assert.deepStrictEqual(out.networks, { copy: { linkedin: 1 }, share: { x: 2 } });
  assert.deepStrictEqual(out.hubPages, [
    { lang: "es", views: 1, views7: 1, gaViews: 100, gaViews7: 20 },
    { lang: "en", views: 1, views7: 0, gaViews: 0, gaViews7: 0 }
  ]);
  assert.deepStrictEqual(out.totals, { hubViews: 2, postViews: 2, postViews7: 2, gaViews: 140, interactions: 4 });
  assert.deepStrictEqual(out.daily, [{ date: "2026-10-14", views: 1 }, { date: "2026-10-22", views: 1 }, { date: "2026-10-23", views: 2 }]);
  assert.strictEqual(out.sources[0].campaign, "social-hub-promo");
  assert.deepStrictEqual(trends.ids, ["a", "b"], "a tie goes to the more viewed post, then by id");
});

test("without GA4 the ranking still comes from site events", () => {
  const { stats: out, trends } = stats.summarize({ ga: null, events: [{ name: "post_play", label: "z", at: NOW }], now: NOW });
  assert.strictEqual(out.ga.ok, false);
  assert.deepStrictEqual(trends.ids, ["z"]);
});
