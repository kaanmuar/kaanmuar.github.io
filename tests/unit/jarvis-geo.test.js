// Jarvis Map tab (#2976): numbers per country from the queue, Live Reports, campaigns, replies, GA4 and short links, and the gaps.
const test = require("node:test");
const assert = require("node:assert/strict");
const geo = require("../../functions/jarvis-geo.js");

const by = (out, cc) => out.countries.find((r) => r.cc === cc);

test("region names map to the countries of the campaign's language", () => {
  assert.deepEqual(geo.regionCountries("Brazil", "pt"), ["BR"]);
  assert.deepEqual(geo.regionCountries("UK", "en"), ["GB"]);
  assert.ok(geo.regionCountries("Americas", "es").includes("MX"));
  assert.ok(!geo.regionCountries("Americas", "es").includes("US"));
  assert.ok(geo.regionCountries("Europe", "es").includes("ES"));
  assert.deepEqual(geo.regionCountries("Mars", "en"), []);
  assert.equal(geo.codeOf("United States"), "US");
  assert.equal(geo.codeOf("Brazil"), "BR");
  assert.equal(geo.codeOf("co"), "CO");
  assert.equal(geo.codeOf("Germany"), "DE");
  assert.equal(geo.nameOf("DE"), "Germany");
  assert.equal(geo.codeOf("United Kingdom"), "GB");
});

test("splits a campaign across its leads' countries, and by prospects when no lead is synced", () => {
  const out = geo.geoRows({
    targets: ["CO", "MX", "BR"],
    queue: { hosts: [{ host: "a.edu.co", cc: "co", sector: "university" }, { host: "b.edu.co", cc: "co", sector: "university" }, { host: "c.mx", cc: "mx", sector: "bank" }, { host: "d.com.br", cc: "br" }], sweptAt: 2 },
    marketing: { campaigns: { rows: [
      { id: "1", name: "W1 B-es Americas", region: "Americas", lang: "es", status: "active", sent: 100, opened: 40, replies: 4, bounced: 2, leads: 10 },
      { id: "2", name: "W1 E-pt Brazil", region: "Brazil", lang: "pt", status: "paused", sent: 60, opened: 30, replies: 0, bounced: 6, leads: 5 }
    ] } },
    sync: { leads: { rows: [{ campaign: "W1 B-es Americas", cc: "co", email: "x@a.edu.co", host: "a.edu.co" }, { campaign: "W1 B-es Americas", cc: "co", email: "y@b.edu.co" }, { campaign: "W1 B-es Americas", cc: "mx", email: "z@c.mx" }, { campaign: "W1 B-es Americas", cc: "mx", email: "w@c.mx" }] },
      replies: [{ from: "Ana <x@a.edu.co>", category: "Interested" }, { from: "q@sub.c.mx", category: "not now" }] }
  });
  const co = by(out, "CO");
  assert.equal(co.sent, 50);
  assert.equal(co.replies, 2);
  assert.equal(co.campaigns, 1);
  assert.equal(co.active, 1);
  assert.equal(co.est, true);
  assert.equal(co.prospects, 2);
  assert.equal(co.swept, 2);
  assert.equal(co.left, 0);
  assert.deepEqual(co.sectors, [{ label: "university", value: 2 }]);
  assert.equal(co.answered, 1);
  assert.equal(co.positive, 1);
  assert.equal(by(out, "MX").answered, 1);
  assert.equal(by(out, "MX").positive, 0);
  const br = by(out, "BR");
  assert.equal(br.sent, 60);
  assert.equal(br.est, false);
  assert.equal(br.active, 0);
  assert.ok(br.gaps.includes("bouncing"));
  assert.ok(co.gaps.includes("no-prospects-left"));
});

test("reads Live Reports, social replies, GA4 visitors and short links per country, and finds the gaps", () => {
  const out = geo.geoRows({
    targets: ["PT", "AO"],
    live: { reports: [{ host: "x.pt", country: "PT", overall: 60 }, { host: "y.pt", country: "pt", overall: 80 }, { host: "z.de", country: "DE", overall: 0 }] },
    engagement: { waiting: [{ report: { host: "x.pt" } }], approved: [{ report: { host: "www.y.pt" } }, { report: null }] },
    ga4: { countries: [{ label: "Japan", value: 30, prior: 10 }, { label: "Portugal", value: 5, prior: 0 }, { label: "(not set)", value: 3 }] },
    links: { prospects: [{ host: "x.pt", visits: 4, reviews: 1, paid: 1, usd: 9 }] }
  });
  const pt = by(out, "PT");
  assert.equal(pt.reviewed, 2);
  assert.equal(pt.score, 70);
  assert.equal(pt.social, 2);
  assert.equal(pt.visitors, 5);
  assert.equal(pt.usd, 9);
  assert.deepEqual(pt.gaps, ["no-campaign"]);
  assert.deepEqual(by(out, "JP").gaps, ["visitors-no-outreach"]);
  assert.equal(by(out, "JP").target, false);
  assert.deepEqual(by(out, "AO").gaps, ["silent"]);
  assert.equal(by(out, "DE").score, null);
  assert.equal(out.gaps[0].kind, "no-campaign");
  assert.deepEqual(out.targets, ["AO", "PT"]);
  assert.equal(out.totals.targets, 2);
});

test("flags a reply rate under half the average once a country has sent enough", () => {
  const out = geo.geoRows({
    targets: ["US"],
    marketing: { campaigns: { rows: [
      { name: "W1 A-en US", region: "US", lang: "en", sent: 200, replies: 20 },
      { name: "W1 E-en UK", region: "UK", lang: "en", sent: 200, replies: 2 }
    ] } }
  });
  assert.equal(out.totals.avgReply, 5.5);
  assert.ok(by(out, "GB").gaps.includes("low-reply"));
  assert.ok(!by(out, "US").gaps.includes("low-reply"));
});

test("lights each country by the furthest step any channel reached (#2988)", () => {
  assert.deepEqual(geo.LIGHTS, ["Dark", "Spark", "Ember", "Lit", "Bright", "Blazing"]);
  assert.equal(geo.lightOf({}), 0);
  assert.equal(geo.lightOf({ prospects: 3 }), 1);
  assert.equal(geo.lightOf({ reviewed: 1 }), 1);
  assert.equal(geo.lightOf({ prospects: 3, sent: 10 }), 2);
  assert.equal(geo.lightOf({ social: 1 }), 2);
  assert.equal(geo.lightOf({ social: 1, socialApproved: 1 }), 3);
  assert.equal(geo.lightOf({ visitors: 30 }), 3);
  assert.equal(geo.lightOf({ sent: 10, opened: 2 }), 3);
  assert.equal(geo.lightOf({ answered: 1 }), 4);
  assert.equal(geo.lightOf({ sent: 10, replies: 1 }), 4);
  assert.equal(geo.lightOf({ usd: 9 }), 5);
  assert.equal(geo.lightOf({ replies: 2, interested: 1 }), 5);

  const out = geo.geoRows({
    targets: ["PT", "AO", "CO"],
    queue: { hosts: [{ host: "a.edu.co", cc: "co" }], sweptAt: 0 },
    engagement: { waiting: [{ report: { host: "a.edu.co" } }], approved: [{ report: { host: "x.pt" } }] },
    live: { reports: [{ host: "x.pt", country: "PT", overall: 60 }] },
    ga4: { countries: [{ label: "Japan", value: 30 }] }
  });
  assert.equal(by(out, "AO").light, 0);
  assert.equal(by(out, "CO").light, 2);
  assert.equal(by(out, "CO").socialApproved, 0);
  assert.equal(by(out, "PT").light, 3);
  assert.equal(by(out, "PT").socialApproved, 1);
  assert.equal(by(out, "JP").light, 3);
  assert.deepEqual(out.totals.byLight, [1, 0, 1, 2, 0, 0]);
});

test("defaults the target markets to every country speaking one of the six languages", () => {
  const out = geo.geoRows({});
  ["ES", "BR", "DE", "FR", "IT", "US", "MX"].forEach((cc) => assert.ok(out.targets.includes(cc), cc));
  assert.equal(out.totals.countries, 0);
  assert.equal(out.countries.length, geo.DEFAULT_TARGETS.length);
});

// #3009: the Live Report countries the finder was unsure of, and Carlos's answers in jarvis_settings/live_report_countries.
const queueDoc = () => ({
  items: [
    { host: "a.com", country: "us", scope: "country", confidence: 0.6, reports: 1, evidence: ["phone +1", "RDAP registrant in US", "hosted in US", "fourth"] },
    { host: "b.com", country: "", scope: "worldwide", confidence: 0.7, reports: 4, evidence: [] },
    { host: "c.com", country: "", scope: "unknown", confidence: 0, reports: 1 },
    { host: "d.com", country: "CO", scope: "country", confidence: 0.8, reports: 1 },
    { host: "e.com", country: "ES", scope: "country", confidence: 0.9, reports: 9 },
    { host: "f.com", country: "XX", scope: "country", confidence: 0.5, reports: 1 }
  ],
  decisions: { "e.com": { country: "ES", scope: "country" } },
  skipped: { "f.com": "2026-11-08T00:00:00Z" }
});

test("the confirm queue leaves out decided and skipped sites and puts the most reports, then the surest, first", () => {
  const live = { reports: [{ id: "u-a-com", host: "www.a.com", country: "" }, { id: "u-d-com", host: "d.com", country: "CO" }] };
  const q = geo.confirmQueue(queueDoc(), live);
  assert.deepEqual(q.rows.map((r) => r.host), ["b.com", "d.com", "a.com", "c.com"]);
  assert.equal(q.total, 4);
  assert.equal(q.decided, 1);
  const [b, d, a, c] = q.rows;
  assert.deepEqual([b.cc, b.name], ["WW", "Worldwide"]);
  assert.deepEqual([a.cc, a.name, a.confidence], ["US", "United States", 0.6]);
  assert.equal(a.url, "https://carlosandmunoz.com/qa-review.html?report=u-a-com");
  assert.equal(a.evidence.length, 3);
  assert.equal(d.url, "", "a card that already has a country is not the one to fix");
  assert.deepEqual([c.cc, c.name], ["", ""]);
  assert.equal(geo.confirmQueue(queueDoc(), null, 2).rows.length, 2);
  assert.deepEqual(geo.confirmQueue(null, null), { rows: [], total: 0, decided: 0 });
});

function fakeDb(data) {
  const doc = { data: data ? JSON.parse(JSON.stringify(data)) : null, writes: [] };
  const ref = { path: "jarvis_settings/live_report_countries" };
  const merge = (to, from) => { Object.entries(from).forEach(([k, v]) => { to[k] = v && typeof v === "object" && !Array.isArray(v) ? merge(Object.assign({}, to[k]), v) : v; }); return to; };
  return {
    doc,
    collection: (c) => ({ doc: (id) => { assert.equal(c + "/" + id, ref.path); return ref; } }),
    runTransaction: async (fn) => fn({
      get: async () => ({ exists: !!doc.data, data: () => doc.data }),
      set: (r, patch, opts) => { assert.equal(r, ref); assert.deepEqual(opts, { merge: true }); doc.writes.push(patch); doc.data = merge(doc.data || {}, patch); }
    })
  };
}

test("confirming a country removes the site from the queue and records Carlos's decision for the daily job", async () => {
  const db = fakeDb(queueDoc());
  const out = await geo.confirmCountry(db, { host: "https://www.A.com/", cc: "mx" }, Date.parse("2026-11-09T12:00:00Z"));
  assert.deepEqual(out, { ok: true, host: "a.com", cc: "MX", name: "Mexico", skipped: false, left: 5 });
  assert.ok(!db.doc.data.items.some((x) => x.host === "a.com"));
  assert.deepEqual(db.doc.data.decisions["a.com"], { country: "MX", scope: "country", at: "2026-11-09T12:00:00.000Z" });
  assert.deepEqual(db.doc.data.decisions["e.com"], { country: "ES", scope: "country" }, "other decisions stay");

  await geo.confirmCountry(db, { host: "b.com", cc: "ww" });
  assert.deepEqual([db.doc.data.decisions["b.com"].country, db.doc.data.decisions["b.com"].scope], ["", "worldwide"]);

  const skip = await geo.confirmCountry(db, { host: "c.com", skip: true, cc: "ZZ" });
  assert.equal(skip.skipped, true);
  assert.ok(db.doc.data.skipped["c.com"]);
  assert.equal(db.doc.data.decisions["c.com"], undefined);

  const again = await geo.confirmCountry(db, { host: "a.com", cc: "CO" });
  assert.equal(again.cc, "CO", "a decided site can still be changed");
  assert.equal(db.doc.data.decisions["a.com"].country, "CO");
});

test("the confirm op refuses a bad host, a country that is not one, and a site that is not waiting", async () => {
  const db = fakeDb(queueDoc());
  for (const body of [{ host: "", cc: "CO" }, { host: "not a host", cc: "CO" }, { host: "javascript:alert(1)", cc: "CO" }, { host: "localhost", cc: "CO" }]) {
    await assert.rejects(geo.confirmCountry(db, body), /host/, JSON.stringify(body));
  }
  for (const cc of ["", "C", "COL", "XX", "UK", "EU", "XA", "AQ", "1A"]) {
    await assert.rejects(geo.confirmCountry(db, { host: "d.com", cc }), /two-letter country/, cc);
  }
  await assert.rejects(geo.confirmCountry(db, { host: "zzz.com", cc: "CO" }), /not waiting/);
  const decidedOnly = fakeDb({ items: [], decisions: { "g.com": { country: "CO", scope: "country" } } });
  await assert.rejects(geo.confirmCountry(decidedOnly, { host: "g.com", skip: true }), /not waiting/, "a decided site is not skipped");
  await assert.rejects(geo.confirmCountry(fakeDb(null), { host: "d.com", cc: "CO" }), /not waiting/);
  assert.equal(db.doc.writes.length, 0);
});

test("the geo source carries the confirm queue and its counts", async () => {
  const snap = (data) => ({ exists: !!data, data: () => data });
  const docs = { "jarvis_settings/live_report_countries": queueDoc() };
  const db = { collection: (c) => ({ doc: (id) => ({ get: async () => snap(docs[c + "/" + id] || null) }) }) };
  const out = await geo.geo({ db, days: 7, fetch: async () => ({ json: async () => ({ reports: [] }) }) });
  assert.equal(out.ok, true);
  assert.deepEqual(out.confirm.map((r) => r.host), ["b.com", "d.com", "a.com", "c.com"]);
  assert.equal(out.totals.confirm, 4);
  assert.equal(out.totals.confirmed, 1);
});
