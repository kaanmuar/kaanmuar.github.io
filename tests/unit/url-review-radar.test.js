const test = require("node:test");
const assert = require("node:assert/strict");
const radar = require("../../functions/url-review-radar");

const top = (field, name, rows) => ({
  result: {
    top_0: rows.map(([cc, value], i) => ({ [field]: cc, [name]: cc, value: String(value), rank: i + 1 })),
    meta: { lastUpdated: "2026-11-19T21:15:00Z", normalization: "PERCENTAGE" }
  }
});

function fakeFetch(failing) {
  return async (url) => {
    const path = String(url).replace("https://api.cloudflare.com/client/v4/radar/attacks/", "");
    if (failing && path.startsWith(failing)) return { ok: false, status: 500, json: async () => ({}) };
    if (path.startsWith("layer3/top/locations/origin")) return { ok: true, json: async () => top("originCountryAlpha2", "originCountryName", [["US", 15.5], ["BR", 14.9], ["XX1", 3]]) };
    if (path.startsWith("layer3/top/locations/target")) return { ok: true, json: async () => top("targetCountryAlpha2", "targetCountryName", [["US", 60.1], ["HK", 41]]) };
    if (path.startsWith("layer7/top/locations/origin")) return { ok: true, json: async () => top("originCountryAlpha2", "originCountryName", [["US", 19.9], ["CN", 11.9]]) };
    return { ok: true, json: async () => top("targetCountryAlpha2", "targetCountryName", [["US", 57.4]]) };
  };
}

test('Radar top lists keep only real two-letter countries, rounded shares and ranks (#3935)', () => {
  const rows = radar.parseRadarTop(top("originCountryAlpha2", "originCountryName", [["us", 15.519592], ["XX1", 3], ["BR", 14.95]]), "originCountryAlpha2", "originCountryName");
  assert.deepEqual(rows.map((r) => [r.cc, r.share, r.rank]), [["US", 15.52, 1], ["BR", 14.95, 3]]);
  assert.deepEqual(radar.parseRadarTop({}, "originCountryAlpha2", "originCountryName"), []);
});

test('refreshing Radar stores the four lists with the licence line, and the Jarvis summary keeps only what the panel shows (#3935)', async () => {
  const saved = [];
  const storage = { bucket: () => ({ file: () => ({ save: async (buf) => saved.push(buf) }) }) };
  const out = await radar.refreshRadar({ token: "t", fetch: fakeFetch(), storage, bucket: "b", now: Date.parse("2026-11-19T21:20:00Z") });
  assert.equal(out.ok, true);
  assert.equal(out.asOf, "2026-11-19T21:15:00Z");
  assert.deepEqual(out.failed, []);
  assert.equal(saved.length, 1);
  const bundle = JSON.parse(require("zlib").gunzipSync(saved[0]).toString("utf8"));
  assert.match(bundle.attribution, /CC BY-NC 4\.0/);
  assert.equal(bundle.window, "24 h");
  const summary = radar.radarSummary(bundle);
  assert.equal(summary.layer3Origin[0].cc, "US");
  assert.equal(summary.layer7Target[0].cc, "US");
  assert.equal(summary.layer3Target.length, 2);
});

test('one failed Radar list is named and the others still show; every list failing is an error, not a blank panel (#3935)', async () => {
  const one = await radar.fetchRadarNow({ token: "t", fetch: fakeFetch("layer7/top/locations/origin") });
  assert.equal(one.ok, true);
  assert.deepEqual(one.failed, ["layer7Origin"]);
  assert.equal(one.parts.layer3Origin.rows.length, 2);
  const none = await radar.fetchRadarNow({ token: "t", fetch: async () => ({ ok: false, status: 401 }) });
  assert.equal(none.ok, false);
  assert.equal((await radar.fetchRadarNow({ token: "", fetch: fakeFetch() })).ok, false);
});

test('the Jarvis checks summary carries the Radar lists for the internal panel, and nothing else (#3935)', () => {
  const ops = require("../../functions/jarvis-review-ops");
  const bundle = { asOf: "2026-11-19T21:15:00Z", window: "24 h", attribution: radar.RADAR_ATTRIBUTION, layer3Origin: [{ cc: "US", name: "United States", share: 15.5, rank: 1 }], layer3Target: [], layer7Origin: [], layer7Target: [], failed: [] };
  const out = ops.checksSummary({ reviews: [], webrisk: {}, threat: {}, wordfence: null, threatFeeds: null, threats: undefined, globalMap: undefined, mapRanges: undefined, threatReviews: [], radar: bundle }, { now: Date.parse("2026-11-19T21:20:00Z"), days: 7 });
  assert.equal(out.radar.layer3Origin[0].cc, "US");
  assert.match(out.radar.attribution, /Personal internal use only/);
  const without = ops.checksSummary({ reviews: [], webrisk: {}, threat: {}, wordfence: null, threatFeeds: null, threats: undefined, globalMap: undefined, mapRanges: undefined, threatReviews: [], radar: null }, { now: Date.parse("2026-11-19T21:20:00Z"), days: 7 });
  assert.equal(without.radar, undefined);
});
