// Jarvis Map GA4 visitors (#3282): every country by ISO code with engaged sessions, users and key events, and per day.
const test = require("node:test");
const assert = require("node:assert/strict");
const ga = require("../../functions/jarvis-geo-ga4.js");
const geo = require("../../functions/jarvis-geo.js");

const r = (dims, mets) => ({ dims, mets });

test("one report asks for every country by code with four metrics over the range and the span before", () => {
  const body = ga.countryReport(true);
  assert.deepEqual(body.dimensions, [{ name: "countryId" }, { name: "country" }]);
  assert.deepEqual(body.metrics.map((m) => m.name), ["sessions", "engagedSessions", "totalUsers", "keyEvents"]);
  assert.ok(body.limit >= 250);
  assert.equal(body.dateRanges, undefined);
  assert.deepEqual(ga.countryReport(false).metrics.map((m) => m.name), ["sessions", "engagedSessions", "totalUsers"]);
});

test("rows become one per country, now and before, (not set) kept without a code", () => {
  const rows = ga.countryRows([
    r(["US", "United States", "date_range_0"], [100, 60, 80, 4]), r(["US", "United States", "date_range_1"], [50, 20, 45, 1]),
    r(["CI", "Côte d’Ivoire", "date_range_0"], [3, 2, 3, 0]), r(["TR", "Türkiye", "date_range_1"], [2, 1, 2, 0]),
    r(["(not set)", "(not set)", "date_range_0"], [5, 0, 5, 0])
  ], true);
  assert.deepEqual(rows.map((x) => x.cc), ["US", "", "CI", "TR"]);
  assert.deepEqual(rows[0], { cc: "US", label: "United States", visitors: 100, visitorsPrior: 50, engaged: 60, engagedPrior: 20, users: 80, usersPrior: 45, keyEvents: 4, keyEventsPrior: 1 });
  assert.equal(rows[1].label, "(not set)");
  assert.equal(rows[3].visitors, 0);
  assert.equal(rows[3].visitorsPrior, 2);
  assert.equal(ga.countryRows([r(["US", "United States", "date_range_0"], [9, 4, 8])], false)[0].keyEvents, null);
  // The Traffic tab keeps its top 12 {label, value, prior}, countries with no session now left out.
  assert.deepEqual(ga.top(rows), [{ label: "United States", value: 100, prior: 50 }, { label: "(not set)", value: 5, prior: 0 }, { label: "Côte d’Ivoire", value: 3, prior: 0 }]);
  const many = Array.from({ length: 30 }, (_, n) => ({ cc: "A" + String.fromCharCode(65 + n % 26), label: "C" + n, visitors: 30 - n, visitorsPrior: 0 }));
  assert.equal(ga.top(many).length, 12);
});

test("a property that rejects keyEvents is asked again without it", async () => {
  const bodies = [];
  const run = async (body) => {
    bodies.push(body);
    if (body.metrics.some((m) => m.name === "keyEvents")) throw new Error("GA4 400: Field keyEvents is not a valid metric.");
    return [r(["CO", "Colombia", "date_range_0"], [7, 3, 6])];
  };
  const out = await ga.fetchCountries(run);
  assert.equal(bodies.length, 2);
  assert.equal(out.keyEvents, false);
  assert.equal(out.countryRows[0].keyEvents, null);
  await assert.rejects(ga.fetchCountries(async () => { throw new Error("GA4 403: The caller does not have permission"); }), /403/);
});

test("per-day rows by date and code; unknown countries and empty days left out", async () => {
  const body = ga.dailyReport("2026-11-01", "2026-11-08", true);
  assert.deepEqual(body.dateRanges, [{ startDate: "2026-11-01", endDate: "2026-11-08" }]);
  assert.deepEqual(body.dimensions.map((d) => d.name), ["date", "countryId"]);
  const days = await ga.fetchDays(async () => [
    r(["20261108", "CO"], [7, 5, 6, 1]), r(["20261108", "(not set)"], [3, 0, 3, 0]), r(["20261107", "US"], [0, 0, 0, 0]), r(["20261107", "MX"], [2, 1, 2, 0])
  ], "2026-11-01", "2026-11-08");
  assert.deepEqual(days, { "2026-11-08": { CO: [7, 5, 6, 1] }, "2026-11-07": { MX: [2, 1, 2, 0] } });
  assert.deepEqual(ga.dailyOf([r(["20261108", "CO"], [7, 5, 6])], false), { "2026-11-08": { CO: [7, 5, 6, null] } });
});

test("geo rows take every country from countryRows, with engagement rate and the visitors gap", () => {
  const countryRows = [
    { cc: "US", label: "United States", visitors: 900, visitorsPrior: 400, engaged: 300, engagedPrior: 100, users: 800, usersPrior: 350, keyEvents: 6, keyEventsPrior: 2 },
    { cc: "JP", label: "Japan", visitors: 40, visitorsPrior: 10, engaged: 30, engagedPrior: 5, users: 35, usersPrior: 9, keyEvents: 1, keyEventsPrior: 0 },
    { cc: "", label: "(not set)", visitors: 5, visitorsPrior: 0, engaged: 0, engagedPrior: 0, users: 5, usersPrior: 0, keyEvents: 0, keyEventsPrior: 0 }
  ];
  const out = geo.geoRows({ targets: ["US", "MX"], ga4: { countryRows, keyEvents: true, countries: ga.top(countryRows) } });
  const by = (cc) => out.countries.find((x) => x.cc === cc);
  assert.equal(by("JP").visitors, 40);
  assert.equal(by("JP").visitorsPrior, 10);
  assert.equal(by("JP").engaged, 30);
  assert.equal(by("JP").keyEvents, 1);
  assert.equal(by("JP").engagementRate, 75);
  assert.equal(by("US").engagementRate, 33.3);
  assert.deepEqual(by("JP").gaps, ["visitors-no-outreach"]);
  assert.equal(by("JP").light, 3);
  assert.equal(by("MX").visitors, 0);
  assert.equal(by("MX").engaged, 0);
  assert.equal(by("MX").keyEvents, 0);
  assert.equal(by("MX").engagementRate, null);
  assert.equal(out.gaps.find((g) => g.kind === "visitors-no-outreach").cc, "US");
  // Without key events from the property, rows carry null rather than 0.
  const none = geo.geoRows({ targets: ["MX"], ga4: { countryRows: countryRows.map((x) => Object.assign({}, x, { keyEvents: null, keyEventsPrior: null })), keyEvents: false } });
  assert.equal(none.countries.find((x) => x.cc === "JP").keyEvents, null);
  assert.equal(none.countries.find((x) => x.cc === "MX").keyEvents, null);
});

test("an older cached op with only the top-12 names still fills visitors", () => {
  const out = geo.geoRows({ targets: [], ga4: { countries: [{ label: "Türkiye", value: 9, prior: 4 }, { label: "Côte d’Ivoire", value: 2, prior: 0 }, { label: "(not set)", value: 3 }] } });
  const tr = out.countries.find((x) => x.cc === "TR");
  assert.equal(tr.visitors, 9);
  assert.equal(tr.engaged, 0);
  assert.equal(out.countries.find((x) => x.cc === "CI").visitors, 2);
});

test("the Map says when GA4 counts no key events", () => {
  assert.deepEqual(ga.needs({ countryRows: [{ cc: "US", visitors: 9, keyEvents: 1 }], keyEvents: true }), []);
  assert.match(ga.needs({ countryRows: [{ cc: "US", visitors: 9, keyEvents: 0, keyEventsPrior: 0 }], keyEvents: true })[0], /no key events/);
  assert.match(ga.needs({ countryRows: [], keyEvents: false })[0], /rejects key events/);
  assert.deepEqual(ga.needs({ countries: [] }), []);
});
