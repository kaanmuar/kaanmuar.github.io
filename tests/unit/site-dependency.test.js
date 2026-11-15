const test = require("node:test");
const assert = require("node:assert/strict");
const SD = require("../../functions/site-dependency");
const prospects = require("../../functions/url-review-prospects");
const peers = require("../../scripts/peer-sectors.json");

test("30+ sectors with unique keys, a reason, known why keys and a priority", () => {
  assert.ok(SD.SECTORS.length >= 30, SD.SECTORS.length + " sectors");
  assert.equal(new Set(SD.SECTORS.map((s) => s.key)).size, SD.SECTORS.length);
  SD.SECTORS.forEach((s) => {
    assert.ok(s.label && s.reason && s.reason.length > 20, s.key);
    assert.ok(s.why.length && s.why.every((w) => SD.WHY[w]), s.key + " why");
    assert.ok(s.priority > 0 && s.priority <= 100, s.key + " priority");
    assert.ok(s.places || s.search, s.key + " has a way to be searched");
    [s.places, s.search].filter(Boolean).forEach((terms) => assert.deepEqual(Object.keys(terms).sort(), ["de", "en", "es", "fr", "it", "pt"], s.key));
  });
});

test("the ticket's sectors are all there", () => {
  const want = ["hotel", "tour-operator", "software-dev", "restaurant", "drinks", "food-brand", "transport", "electronics", "gadgets", "creator", "retail", "supplier",
    "car-rental", "vacation-rental", "equipment-rental", "lender", "bank", "construction", "clinic", "dentist", "lawyer", "realestate", "insurance", "education",
    "ecommerce", "saas", "airline", "event-venue", "gym", "salon", "nonprofit", "gov-supplier", "marketplace", "logistics", "fintech", "crypto", "media", "agency"];
  want.forEach((k) => assert.ok(SD.sectorOf(k), k));
});

test("every peer key is a peer-sectors.json sector, and peer keys map back to their sector", () => {
  const known = new Set(peers.sectors.map((s) => s.key));
  SD.SECTORS.forEach((s) => s.peers.forEach((p) => assert.ok(known.has(p), s.key + " -> " + p)));
  assert.equal(SD.SECTORS.filter((s) => !s.peers.length).map((s) => s.key).join(), "creator");
  assert.equal(SD.matchSector("hotel-chain"), "hotel");
  assert.equal(SD.matchSector("dental-clinic"), "dentist");
  assert.equal(SD.matchSector("crypto-exchange"), "crypto");
  assert.equal(SD.matchSector("Hotel"), "hotel");
  assert.equal(SD.matchSector("plumber"), "");
});

test("ranking, caps, areas and search queries follow the priority and what the site carries", () => {
  const top = SD.ranked().slice(0, 3).map((s) => s.key);
  assert.deepEqual(top, ["ecommerce", "hotel", "saas"]);
  assert.deepEqual([SD.capOf("hotel"), SD.capOf("airline"), SD.capOf("salon"), SD.capOf("nonprofit"), SD.capOf("nope")], [10, 8, 6, 4, 4]);
  assert.deepEqual(SD.areasOf("hotel"), ["Performance", "Accessibility", "Security", "SEO", "GEO"]);
  assert.equal(SD.areasOf("bank")[1], "Accessibility");
  assert.equal(SD.searchOf("creator", "es", "Bogotá"), "creador de contenido tienda oficial Bogotá");
  assert.equal(SD.searchOf("hotel", "de"), "Hotel");
});

test("the Places night searches every mapped sector first, then the local trades, all in six languages", () => {
  const keys = Object.keys(prospects.SEGMENTS);
  const mapped = SD.ranked().filter((s) => s.places).map((s) => s.key);
  assert.deepEqual(keys.slice(0, mapped.length), mapped);
  assert.deepEqual(keys.slice(mapped.length), Object.keys(prospects.LOCAL));
  assert.ok(!keys.includes("creator") && !keys.includes("marketplace"), "sectors Maps does not list are left to web search");
  assert.equal(prospects.depthOf("hotel"), Infinity);
  assert.equal(prospects.depthOf("airline"), 3);
  assert.equal(prospects.depthOf("plumber"), 2);
  assert.equal(prospects.capOf("plumber"), 4);
});

test("a night adds no more than a segment's cap", async () => {
  const many = Array.from({ length: 20 }, (_, i) => ({ id: "p" + i, websiteUri: "https://shop" + i + ".com/", businessStatus: "OPERATIONAL" }));
  let n = 0;
  const out = await prospects.night({ state: { pos: 0 }, known: new Set(), waiting: 0, day: "2026-11-09", search: async () => ({ ok: true, places: many.map((p) => Object.assign({}, p, { websiteUri: p.websiteUri.replace("shop", "s" + (n++) + "-") })) }) });
  const bySector = {};
  out.rows.forEach((r) => { bySector[r.sector] = (bySector[r.sector] || 0) + 1; });
  Object.entries(bySector).forEach(([sector, k]) => assert.ok(k <= prospects.capOf(sector), sector + " " + k));
  assert.equal(bySector.ecommerce, 10);
});
