// Jarvis Map: short-link clicks by visitor country (#3281): the SQL, its answer, the rows, the history days and the need line.
const test = require("node:test");
const assert = require("node:assert/strict");
const clicks = require("../../functions/jarvis-geo-clicks.js");
const geo = require("../../functions/jarvis-geo.js");
const time = require("../../functions/jarvis-geo-time.js");
const outreach = require("../../functions/jarvis-outreach.js");

const NOW = Date.parse("2026-11-10T03:00:00Z");
const H = 3600000;
const hour = (ms) => new Date(ms - (ms % H)).toISOString().replace("T", " ").slice(0, 19);
// An AE JSON answer: hours, countries, kinds and hosts, n as a string like UInt64.
const answer = (rows) => ({ meta: [], data: rows.map(([ago, cc, kind, host, n]) => ({ hour: hour(NOW - ago * H), cc, kind, host, n: String(n) })), rows: rows.length });

test("the query asks for people's clicks by hour, country, kind and host, capped at what AE keeps", () => {
  const sql = clicks.sqlFor(14);
  assert.match(sql, /FROM qalabreview_clicks/);
  assert.match(sql, /INTERVAL '14' DAY/);
  assert.match(sql, /blob6 = ''/);
  assert.match(sql, /SUM\(_sample_interval\)/);
  assert.match(sql, /FORMAT JSON$/);
  assert.match(clicks.sqlFor(730), /INTERVAL '91' DAY/);
});

test("parses the SQL answer: UTC hours, upper-case countries, unknown kinds and odd countries kept apart", () => {
  const rows = clicks.parse(answer([[1, "co", "outreach", "www.UPB.edu.co", 3], [2, "XX", "social", "", 1], [3, "MX", "weird", "", 2], [4, "MX", "channel", "", 0]]));
  assert.equal(rows.length, 3);
  assert.deepEqual(rows[0], { at: Date.parse(hour(NOW - H).replace(" ", "T") + "Z"), cc: "CO", kind: "outreach", host: "upb.edu.co", n: 3 });
  assert.equal(rows[1].cc, "");
  assert.equal(rows[2].kind, "unknown");
  assert.deepEqual(clicks.parse(null), []);
});

test("tallies the range against the span before, by country, kind, host and Bogotá day", () => {
  const rows = clicks.parse(answer([[1, "CO", "outreach", "upb.edu.co", 3], [5, "CO", "social", "", 1], [30, "CO", "outreach", "", 2], [2, "XX", "channel", "", 4], [10, "MX", "channel", "", 1], [60, "MX", "channel", "", 9]]));
  const t = clicks.tally(rows, NOW, 1);
  assert.deepEqual(t.now, { CO: 4, MX: 1 });
  assert.deepEqual(t.prior, { CO: 2 });
  assert.deepEqual(t.kinds.CO, { outreach: 3, social: 1 });
  assert.deepEqual(t.hosts, { "upb.edu.co": 3 });
  assert.equal(t.total, 9);
  assert.equal(t.unknown, 4);
  assert.equal(t.priorTotal, 2);
  assert.equal(t.priorComplete, true);
  assert.equal(t.days["2026-11-09"].CO, 4);
  assert.equal(t.days["2026-11-08"].CO, 2);
  assert.equal(clicks.tally(rows, NOW, 60).priorComplete, false);
});

test("geoRows puts clicks on the visitor's country, prospect clicks on the host's, and clicks light a country", () => {
  const c = Object.assign({ ok: true }, clicks.tally(clicks.parse(answer([[1, "DE", "outreach", "upb.edu.co", 3], [30, "DE", "outreach", "", 1], [2, "FR", "channel", "", 2]])), NOW, 1));
  const out = geo.geoRows({
    targets: ["CO", "FR"],
    queue: { hosts: [{ host: "upb.edu.co", cc: "co" }] },
    clicks: c,
    links: { prospects: [{ host: "upb.edu.co", visits: 2, reviews: 1, paid: 1, usd: 19 }], byVisitor: [{ cc: "DE", visits: 2, reviews: 1, paid: 1, usd: 19 }] }
  });
  const de = out.countries.find((r) => r.cc === "DE");
  const co = out.countries.find((r) => r.cc === "CO");
  const fr = out.countries.find((r) => r.cc === "FR");
  assert.equal(de.clicks, 3);
  assert.equal(de.clicksPrior, 1);
  assert.deepEqual(de.clickKinds, { outreach: 3 });
  assert.deepEqual([de.visitorVisits, de.visitorReviews, de.visitorPaid, de.visitorUsd], [2, 1, 1, 19]);
  assert.equal(de.light, 3);
  assert.equal(co.prospectClicks, 3);
  assert.equal(co.clicks, 0);
  assert.equal(co.usd, 19);
  assert.equal(fr.clicks, 2);
  assert.equal(fr.light, 3);
  assert.ok(fr.gaps.includes("visitors-no-outreach"));
  assert.equal(geo.lightOf({ clicks: 1 }), 3);
  const none = geo.geoRows({ targets: ["CO"] }).countries[0];
  assert.deepEqual(clicks.FIELDS.map((f) => none[f]), [0, 0, 0, 0, 0, 0, 0]);
});

test("visitor rows count link opens, reviews and paid unlocks by the visitor's own country", () => {
  const ctx = { now: NOW, days: 7 };
  const iso = (ago) => new Date(NOW - ago * H).toISOString();
  const q = "utm_source=qalabreview&utm_campaign=outreach&utm_content=upb.edu.co";
  const opens = [{ createdAt: iso(1), country: "DE", query: q }, { createdAt: iso(2), country: "DE", query: "utm_source=google" }, { createdAt: iso(400), country: "DE", query: q }];
  const reviews = [
    { id: "r1", createdAt: iso(2), country: "DE", query: q, status: "complete", email: "a@x.de" },
    { id: "r2", createdAt: iso(2), country: "FR", query: q, status: "complete", test: true },
    { id: "p1", createdAt: iso(1), status: "paid-report", paid: true, priceUsd: 19, reportId: "r1" },
    { id: "p2", createdAt: iso(1), status: "paid-report", paid: true, priceUsd: 9, email: "a@x.de", country: "AT" },
    { id: "p3", createdAt: iso(1), status: "paid-report", paid: true, priceUsd: 5, refunded: true, reportId: "r1" }
  ];
  const rows = clicks.visitorRows(opens, reviews, ctx, { linkTags: outreach.linkTags, revenue: new Set(["paid-report"]), toMs: (v) => Date.parse(v) });
  assert.deepEqual(rows, [{ cc: "AT", visits: 0, reviews: 0, paid: 1, usd: 9 }, { cc: "DE", visits: 1, reviews: 1, paid: 1, usd: 19 }].sort((a, b) => b.usd - a.usd));
});

test("the reader asks Cloudflare with the analytics token and turns a missing permission into a need", async () => {
  const env = { CLOUDFLARE_ANALYTICS_TOKEN: "t", CLOUDFLARE_ACCOUNT_ID: "87f5134bc5f1df712e4e3de0880e37c0" };
  const calls = [];
  const ok = async (url, opts) => { calls.push({ url, opts }); return { ok: true, status: 200, text: async () => JSON.stringify(answer([[1, "CO", "outreach", "", 2]])) }; };
  const out = await clicks.read({ fetch: ok, env, now: NOW, days: 1 });
  assert.equal(out.ok, true);
  assert.deepEqual(out.now, { CO: 2 });
  assert.equal(calls[0].url, "https://api.cloudflare.com/client/v4/accounts/87f5134bc5f1df712e4e3de0880e37c0/analytics_engine/sql");
  assert.equal(calls[0].opts.headers.Authorization, "Bearer t");
  assert.match(calls[0].opts.body, /INTERVAL '2' DAY/);
  const denied = async () => ({ ok: false, status: 200, text: async () => '{"success":false,"errors":[{"code":10000,"message":"Authentication error"}]}' });
  assert.equal((await clicks.read({ fetch: denied, env, now: NOW, days: 1 })).need, clicks.NEED);
  assert.equal((await clicks.read({ fetch: ok, env: {}, now: NOW, days: 1 })).need, clicks.NEED);
  const empty = async () => ({ ok: false, status: 422, text: async () => "unknown table: qalabreview_clicks" });
  const none = await clicks.read({ fetch: empty, env, now: NOW, days: 1 });
  assert.equal(none.ok, true);
  assert.equal(none.total, 0);
  const broke = async () => { throw new Error("socket hang up"); };
  assert.match((await clicks.read({ fetch: broke, env, now: NOW, days: 1 })).error, /socket hang up/);
});

test("the history keeps each day's clicks as k from the first day with one, and the ranges read them", async () => {
  const store = {};
  const col = { doc: (id) => ({ id }) };
  const db = { batch: () => { const ops = []; return { set: (r, d) => ops.push([r.id, d]), commit: async () => ops.forEach(([id, d]) => { store[id] = d; }) }; } };
  const ago = (days) => days * 24;
  const rows = answer([[ago(3), "CO", "outreach", "", 2], [ago(1), "MX", "channel", "", 1]]);
  const note = await clicks.recordDays({ db, now: NOW, clicks: async () => ({ ok: true, rows: clicks.parse(rows) }) }, col, "2026-11-09");
  assert.match(note, /click days/);
  const days = Object.keys(store).sort();
  assert.equal(days[days.length - 1], "2026-11-09");
  assert.ok(days.every((d) => store[d].k));
  assert.equal(Object.values(store).reduce((s, d) => s + (d.k.CO || 0), 0), 2);
  assert.match(await clicks.recordDays({ db, now: NOW, clicks: async () => ({ ok: false, need: clicks.NEED }) }, col, "2026-11-09"), /no Account Analytics token/);

  const docs = days.map((d) => ({ day: d, k: store[d].k }));
  const sum = time.summarize(docs, "2026-11-09");
  assert.ok(sum.fields.includes("clicks"));
  assert.equal(sum.ranges[7].c.CO.clicks[0], 2);
  assert.equal(sum.ranges[7].c.MX.clicks[0], 1);
});

test("Ask gets the countries with the most clicks next to their prospect numbers", () => {
  const a = clicks.ask({ ok: true, totals: { clicks: 5, clicksPrior: 2, clicksUnknown: 1 }, countries: [{ cc: "DE", clicks: 3, clicksPrior: 1, visitorReviews: 1, visitorPaid: 1, visitorUsd: 19, prospectClicks: 0, reviews: 0, usd: 0 }, { cc: "CO", clicks: 0 }] });
  assert.equal(a.clicks, 5);
  assert.equal(a.byVisitorCountry.length, 1);
  assert.match(a.byVisitorCountry[0], /^DE: 3 clicks \(before 1\), 1 reviews, 1 paid, \$19/);
  assert.equal(clicks.ask(null), null);
});
