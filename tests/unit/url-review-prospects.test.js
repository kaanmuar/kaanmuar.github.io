const test = require("node:test");
const assert = require("node:assert/strict");
const prospects = require("../../functions/url-review-prospects");
const sweep = require("../../functions/url-review-sweep");

const place = (id, websiteUri, businessStatus = "OPERATIONAL") => ({ id, websiteUri, businessStatus });

test("a lap starts with every market's biggest city in every segment, and every city comes round as deep as a segment's priority", () => {
  const list = prospects.slots();
  const segments = Object.keys(prospects.SEGMENTS);
  assert.deepEqual(list.slice(0, 2), [{ cc: "es", city: "Madrid", sector: "ecommerce" }, { cc: "es", city: "Madrid", sector: "hotel" }]);
  assert.deepEqual(list[segments.length], { cc: "mx", city: "Ciudad de México", sector: "ecommerce" });
  const expected = Object.values(prospects.CITIES).flatMap((cities) => cities.map((_, rank) => segments.filter((s) => rank < prospects.depthOf(s)).length)).reduce((a, b) => a + b, 0);
  assert.equal(list.length, expected);
  assert.ok(list.some((s) => s.city === "Querétaro" && s.sector === "hotel") && !list.some((s) => s.city === "Querétaro" && s.sector === "plumber"), "only high-priority segments reach the fifth city");
  assert.ok(sweep.TIER1.every((cc) => prospects.CITIES[cc] && prospects.CITIES[cc].length >= 3), "every TIER1 market has 3+ cities");
  segments.forEach((s) => assert.deepEqual(Object.keys(prospects.SEGMENTS[s]).sort(), ["de", "en", "es", "fr", "it", "pt"]));
});

test("the search is written in the market's language and limited to its country", () => {
  assert.deepEqual(prospects.request({ cc: "co", city: "Bogotá", sector: "dentist" }), { textQuery: "dentista en Bogotá", languageCode: "es", regionCode: "CO", pageSize: 20 });
  assert.equal(prospects.request({ cc: "br", city: "São Paulo", sector: "plumber" }).textQuery, "encanador em São Paulo");
  assert.equal(prospects.request({ cc: "fr", city: "Paris", sector: "bakery" }).textQuery, "boulangerie à Paris");
  assert.equal(prospects.request({ cc: "us", city: "Miami", sector: "gym" }).textQuery, "gym in Miami");
});

test("only operating places with their own https site become prospects, with the place ID and no profile text", () => {
  const slot = { cc: "co", city: "Bogotá", sector: "dentist" };
  assert.deepEqual(prospects.prospectOf(place("p1", "http://www.sonrisas.com.co/?utm_source=gmb"), slot), { host: "www.sonrisas.com.co", cc: "co", sector: "dentist", source: "places", placeId: "p1" });
  assert.equal(prospects.prospectOf(place("p2", ""), slot), null);
  assert.equal(prospects.prospectOf(place("p3", "https://smile.co", "CLOSED_PERMANENTLY"), slot), null);
  for (const uri of ["https://www.facebook.com/smile", "https://instagram.com/smile", "https://linktr.ee/smile", "https://www.doctoralia.co/x", "https://smile.wixsite.com/home", "https://sites.google.com/view/smile"]) {
    assert.equal(prospects.prospectOf(place("p", uri), slot), null, uri);
  }
});

test("a night runs at most 20 searches, keeps each host once, skips known hosts and moves the cursor", async () => {
  const bodies = [];
  const search = async (body) => {
    bodies.push(body);
    return { ok: true, places: [place("a" + bodies.length, "https://site" + bodies.length + ".com/"), place("dup", "https://www.shared.com/"), place("k", "https://known.com/")] };
  };
  const out = await prospects.night({ state: { pos: 3 }, known: new Set(["www.known.com"]), waiting: 10, day: "2026-11-02", search });
  assert.equal(bodies.length, 20);
  assert.equal(out.calls, 20);
  assert.equal(out.rows.length, 21);
  assert.equal(out.rows.filter((r) => r.host === "www.shared.com").length, 1);
  assert.ok(!out.rows.some((r) => r.host === "known.com"));
  assert.equal(out.state.pos, 23);
  assert.deepEqual(out.state.days["2026-11-02"], { calls: 20, errors: 0, added: 21 });
  assert.equal(bodies[0].textQuery, prospects.request(prospects.slots()[3]).textQuery);
});

test("a night is skipped while two nights of prospects still wait, and stops after three Places errors", async () => {
  let calls = 0;
  const skipped = await prospects.night({ state: {}, known: new Set(), waiting: prospects.BACKLOG, day: "2026-11-02", search: async () => { calls += 1; return { ok: true, places: [] }; } });
  assert.equal(calls, 0);
  assert.deepEqual(skipped.state.last, { day: "2026-11-02", skipped: "backlog", waiting: prospects.BACKLOG });
  const failing = await prospects.night({ state: {}, known: new Set(), waiting: 0, day: "2026-11-02", search: async () => ({ ok: false, error: "status 403" }) });
  assert.equal(failing.calls, 3);
  assert.equal(failing.state.last.error, "status 403");
});

test("the cursor wraps to the next lap at the end of the list", async () => {
  const end = prospects.slots().length - 1;
  const out = await prospects.night({ state: { pos: end, lap: 0 }, known: new Set(), waiting: 0, day: "2026-11-02", search: async () => ({ ok: true, places: [] }) });
  assert.equal(out.state.lap, 1);
  assert.equal(out.state.pos, 19);
});
