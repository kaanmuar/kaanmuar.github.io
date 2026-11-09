const test = require("node:test");
const assert = require("node:assert/strict");

const core = require("../../js/admin-jarvis-core.js");
const jarvis = require("../../functions/jarvis.js");

const NOW = new Date("2026-11-01T15:00:00Z");
const site = (visits, prior, labels, values, extra) => Object.assign({ kpis: [{ label: "Visits", value: visits, prior, delta: "", dir: 0 }], series: { labels, values } }, extra || {});
const grid = (d, h, n) => core.WEEKDAYS.map((_, i) => Array.from({ length: 24 }, (__, j) => (i === d && j === h ? n : 0)));

const PRODUCTS = {
  cv: site(10, 5, ["2026-10-30", "2026-10-31", "2026-11-01"], [2, 3, 5], { heatmap: grid(0, 9, 4), lists: { sources: [{ label: "Direct", value: 6 }, { label: "linkedin (tagged link)", value: 4 }] } }),
  studio: site(4, 4, ["2026-10-31", "2026-11-01"], [1, 3], { heatmap: grid(0, 9, 2), lists: { sources: [{ label: "Direct", value: 4 }] } }),
  review: Object.assign(site(6, 2, ["2026-10-30", "2026-10-31", "2026-11-01"], [1, 2, 3], { heatmap: grid(2, 14, 7), lists: { sources: [{ label: "www.google.com", value: 6 }] } }), { kpis: [{ label: "Opens", value: 6, prior: 2 }] }),
  inbox: site(1, 0, ["2026-11-01"], [1])
};

test("the deck reads readiness, revenue, site visits, alerts and uptime, with honest dashes when a source is missing", () => {
  const external = {
    money: { ok: true, revenue: { usd: 27.5, count: 3 }, prior: { usd: 10 } },
    uptime: { ok: true, pages: [{ ok: true, ms: 200 }, { ok: false, ms: 0 }], history: [{ date: "2026-10-31", checks: 10, up: 10 }, { date: "2026-11-01", checks: 10, up: 9 }] }
  };
  const brief = [{ level: "alert" }, { level: "warn" }, { level: "warn" }, { level: "info" }];
  const d = core.deck(PRODUCTS, external, brief);
  assert.deepEqual(d.map((k) => k.key), ["readiness", "revenue", "visits", "alerts", "uptime"]);
  assert.equal(d[0].value, "50%");
  assert.equal(d[0].alert, true);
  assert.equal(d[1].value, "$27.5");
  assert.equal(d[1].delta, "+175%");
  assert.equal(d[2].value, 20, "CV, Studio and URL Review opens add up; the inbox is not a visit");
  assert.equal(d[3].value, 1);
  assert.equal(d[3].delta, "2 warnings");
  assert.equal(d[4].label, "Uptime, 90 days");
  assert.equal(d[4].value, "95%");
  assert.equal(d[4].delta, "now 50%");
  const bare = core.deck({}, {}, []);
  assert.deepEqual(bare.map((k) => k.value), ["—", "—", "—", 0, "—"]);
  assert.equal(bare[4].label, "Uptime now");
});

test("the trend puts every product with a series on the same dates, a missing day as 0", () => {
  const t = core.trend(PRODUCTS);
  assert.deepEqual(t.labels, ["2026-10-30", "2026-10-31", "2026-11-01"]);
  assert.deepEqual(t.series.map((s) => s.key), ["cv", "studio", "review", "inbox"]);
  assert.deepEqual(t.series[1].values, [0, 1, 3]);
  assert.deepEqual(t.series[3].values, [0, 0, 1]);
  assert.deepEqual(core.trend({}), { labels: [], series: [] });
});

test("traffic mix sums the site heatmaps and merges sources without the tagged-link suffix", () => {
  const m = core.trafficMix(PRODUCTS);
  assert.equal(m.heatmap[0][9], 6);
  assert.equal(m.heatmap[2][14], 7);
  assert.equal(m.total, 13);
  assert.equal(m.peak, "Wed 14:00 (7)");
  assert.deepEqual(m.sources, [{ label: "Direct", value: 10 }, { label: "www.google.com", value: 6 }, { label: "linkedin", value: 4 }]);
});

test("traffic compare lines the site counter up with GA4 sessions and Cloudflare page views, and says why a source is off", () => {
  const external = { ga4: { ok: true, daily: [{ date: "2026-10-31", sessions: 3 }, { date: "2026-11-01", sessions: 4 }] }, cloudflare: { ok: false, error: "The Cloudflare token needs Zone > Analytics > Read." } };
  const c = core.trafficCompare(PRODUCTS, external);
  assert.deepEqual(c.labels, ["2026-10-30", "2026-10-31", "2026-11-01"]);
  assert.deepEqual(c.series.map((s) => s.key), ["site", "ga4"]);
  assert.deepEqual(c.series[0].values, [3, 6, 11]);
  assert.deepEqual(c.series[1].values, [0, 3, 4]);
  assert.deepEqual(c.totals.map((t) => t.value), [20, 7, null]);
  assert.match(c.totals[2].why, /Zone > Analytics/);
});

test("revenue by product names the URL Review offers and drops zero rows", () => {
  assert.deepEqual(core.revenueByProduct({ ok: true, byPurpose: [{ label: "report", value: 19 }, { label: "credit", value: 8.5 }, { label: "pass", value: 0 }, { label: "mystery", value: 1 }] }),
    [{ label: "Full report", value: 19 }, { label: "Credits", value: 8.5 }, { label: "mystery", value: 1 }]);
  assert.deepEqual(core.revenueByProduct({ ok: false }), []);
});

test("the outreach funnel reads reviewed, notified, replied and paid, and null for a stage whose source is down", () => {
  const f = core.outreachFunnel({ outreach: { ok: true, pipeline: { ok: true, reviews: 40 }, instantly: { ok: true, contacted: 25, replies: 3 }, links: { ok: false, error: "x" } } });
  assert.deepEqual(f.map((s) => [s.label, s.value]), [["Reviewed", 40], ["Notified", 25], ["Replied", 3], ["Paid", null]]);
  assert.equal(core.outreachFunnel({ outreach: { ok: false } }), null);
  assert.equal(core.outreachFunnel({}), null);
});

test("the status matrix has a tile per connection, job and CI workflow", () => {
  const m = core.statusMatrix({
    jobs: { ok: true, jobs: [{ name: "sweepReviews", ok: false, error: "quota" }, { name: "jarvisWatch", ok: true, state: "PAUSED" }] },
    github: { ok: true, ci: [{ name: "CI", conclusion: "success" }, { name: "Pages", conclusion: "failure" }, { name: "Lint", conclusion: null }] }
  });
  assert.equal(m.filter((t) => t.group === "Connections").length, core.CONNECTIONS.length);
  assert.deepEqual(m.filter((t) => t.group === "Jobs").map((t) => t.level), ["alert", "warn"]);
  assert.deepEqual(m.filter((t) => t.group === "CI").map((t) => t.level), ["good", "alert", "off"]);
  assert.equal(m.find((t) => t.name === "Cloud Scheduler").level, "good");
  assert.equal(m.find((t) => t.name === "Cloudflare").level, "off");
  const ran = core.statusMatrix({
    jobs: { ok: true, jobs: [{ name: "sweepReviews", ok: true, state: "ENABLED" }] },
    health: { ok: true, jobs: [{ job: "sweepReviews", ok: false, error: "quota" }, { job: "nightlyDigest", ok: true }] }
  }).filter((t) => t.group === "Jobs");
  assert.deepEqual(ran.map((t) => [t.name, t.level, t.detail]), [["sweepReviews", "alert", "quota"], ["nightlyDigest", "good", "ok"]]);
});

test("the uptime strip covers 90 Bogota days, leaves days without checks empty and weights the total by checks", () => {
  const s = core.uptimeStrip([{ date: "2026-10-31", checks: 5, up: 5 }, { date: "2026-11-01", checks: 15, up: 12 }, { date: "2026-07-01", checks: 5, up: 0 }], NOW);
  assert.equal(s.days.length, 90);
  assert.equal(s.days[89].date, "2026-11-01");
  assert.equal(s.days[89].pct, 80);
  assert.equal(s.days[88].pct, 100);
  assert.equal(s.days[0].pct, null);
  assert.equal(s.pct, 85);
  assert.equal(s.since, "2026-10-31");
  assert.deepEqual(core.uptimeStrip([], NOW).pct, null);
});

test("the product list carries the site products and outreach, marketing, the map, engagement and GitHub from their sources", () => {
  const list = core.productList(PRODUCTS, {
    outreach: { ok: true, pipeline: { ok: true, reviews: 4, queued: 9, daily: [{ date: "2026-11-01", reviews: 4 }] }, instantly: { ok: false } },
    social: { ok: true, sent: 5, failed: 1, daily: [{ date: "2026-11-01", posts: 5 }] },
    geo: { ok: true, totals: { countries: 12, missing: 3, replies: 7 } },
    engagement: { ok: true, daily: [{ day: "2026-11-01", read: 9 }], report: { totals: { read: 9, candidates: 2, drafted: 1 } } }
  });
  assert.deepEqual(list.map((p) => p.key), ["inbox", "cv", "studio", "review", "outreach", "marketing", "geo", "engagement", "github"]);
  assert.deepEqual(list.find((p) => p.key === "geo").kpis.map((k) => [k.label, k.value]), [["Countries active", 12], ["Targets missing", 3], ["Replies", 7]]);
  assert.deepEqual(core.productList({}, {}).find((p) => p.key === "geo").kpis, []);
  assert.deepEqual(list.find((p) => p.key === "github").kpis, []);
  assert.deepEqual(list.find((p) => p.key === "outreach").kpis.map((k) => k.label), ["Reviewed", "Queued"]);
  assert.equal(list.find((p) => p.key === "marketing").kpis[1].alert, true);
  assert.deepEqual(list.find((p) => p.key === "engagement").series, { labels: ["2026-11-01"], values: [9] });
});

test("wide() bundles the deck and charts for the snapshot", () => {
  const w = core.wide({ products: PRODUCTS, external: {}, briefing: [], now: NOW });
  assert.deepEqual(Object.keys(w), ["deck", "trend", "products", "traffic", "revenue", "funnel", "matrix", "uptime"]);
  assert.equal(w.traffic.compare.series.length, 1);
  assert.equal(w.funnel, null);
  assert.equal(w.uptime.days.length, 90);
});

test("the hourly uptime tally counts page checks per Bogota day and logs them as increments", async () => {
  const up = { ok: true, pages: [{ ok: true }, { ok: true }, { ok: false }] };
  assert.deepEqual(jarvis.uptimeTally(up, Date.parse("2026-11-02T03:00:00Z")), { date: "2026-11-01", checks: 3, up: 2 });
  assert.deepEqual(jarvis.uptimeTally({ ok: false }, NOW.getTime()), { date: "2026-11-01", checks: 0, up: 0 });
  const writes = [];
  const db = { collection: (name) => ({ doc: (id) => ({ set: async (data, opts) => writes.push({ name, id, data, opts }) }) }) };
  await jarvis.uptimeLog(db, up, NOW.getTime(), (n) => ({ inc: n }));
  assert.deepEqual(writes, [{ name: "jarvis_uptime", id: "2026-11-01", data: { date: "2026-11-01", checks: { inc: 3 }, up: { inc: 2 }, at: NOW.toISOString() }, opts: { merge: true } }]);
  await jarvis.uptimeLog(db, { ok: false }, NOW.getTime(), (n) => n);
  assert.equal(writes.length, 1, "a failed ping round logs nothing rather than a day of zeros");
});

test("uptime history reads the last 90 days of tallies in date order", async () => {
  let asked;
  const docs = [{ date: "2026-11-01", checks: 24, up: 24 }, { date: "2026-10-31", checks: "24", up: 23 }];
  const db = { collection: () => ({ where: (f, op, v) => { asked = [f, op, v]; return { limit: () => ({ get: async () => ({ docs: docs.map((d) => ({ data: () => d })) }) }) }; } }) };
  const h = await jarvis.uptimeHistory(db, NOW.getTime());
  assert.deepEqual(asked, ["date", ">=", "2026-08-03"]);
  assert.deepEqual(h, [{ date: "2026-10-31", checks: 24, up: 23 }, { date: "2026-11-01", checks: 24, up: 24 }]);
});
