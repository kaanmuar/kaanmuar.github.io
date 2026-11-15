// Country of origin for Live Reports (#2980): the address, page facts and their weighing, and the final call.
const test = require("node:test");
const assert = require("node:assert/strict");
const c = require("../../scripts/live-report-countries.js");
const live = require("../../scripts/build-live-reports.js");

const page = (html, url) => c.pageFacts(html, url || "https://acme.com/", false);

test("a ccTLD names the country; generic-use ccTLDs and a bare .co do not", () => {
  assert.equal(c.tldCountry("www.tcd.ie"), "IE");
  assert.equal(c.tldCountry("bbc.co.uk"), "GB");
  assert.equal(c.tldCountry("site.be"), "BE");
  for (const host of ["startup.io", "brand.co", "tool.ai", "about.me", "news.tv", "radio.fm", "bit.ly", "game.gg"]) assert.equal(c.tldCountry(host), "", host);
  assert.equal(c.tldSignals("brand.co")[0].w, 0.1);
});

test("second-level and official suffixes are sure; .edu needs more evidence", () => {
  assert.equal(c.tldCountry("tienda.com.co"), "CO");
  assert.equal(c.tldCountry("unal.edu.co"), "CO");
  assert.equal(c.tldCountry("sat.gob.mx"), "MX");
  assert.equal(c.tldCountry("ox.ac.uk"), "GB");
  assert.equal(c.tldCountry("loja.com.br"), "BR");
  assert.equal(c.tldSignals("x.gov.co")[0].w, 0.97);
  assert.equal(c.tldCountry("usa.gov"), "US");
  assert.equal(c.tldCountry("uniminuto.edu"), "");
  assert.equal(c.tldSignals("uniminuto.edu")[0].country, "US");
});

test("a country subdomain of a generic site counts, a language subdomain does not", () => {
  assert.deepEqual(c.tldSignals("co.computrabajo.com").map((s) => [s.kind, s.country]), [["subdomain", "CO"]]);
  assert.deepEqual(c.tldSignals("es.wikipedia.org"), []);
});

test("phone country codes, NANP area codes and toll-free numbers", () => {
  assert.equal(c.phoneCountry("+57 601 555 1234").country, "CO");
  assert.equal(c.phoneCountry("+52 55 5555 5555").country, "MX");
  assert.equal(c.phoneCountry("+34 911 23 45 67").country, "ES");
  assert.equal(c.phoneCountry("+353 1 234 5678").country, "IE");
  assert.equal(c.phoneCountry("+1 416 555 0000").country, "CA");
  assert.equal(c.phoneCountry("+1 809 555 0000").country, "DO");
  assert.equal(c.phoneCountry("+1 212 555 0000").country, "US");
  assert.deepEqual(c.phoneCountry("tel:+18005551212"), { country: "US", tollFree: true });
  assert.equal(c.phoneCountry("0034 911 234 567").country, "ES");
  assert.equal(c.phoneCountry("601 555 1234"), null);
});

test("JSON-LD addressCountry, as a code, a name or a Country node", () => {
  const ld = (v) => '<script type="application/ld+json">' + JSON.stringify(v) + "</script>";
  assert.deepEqual(page(ld({ "@type": "Organization", address: { addressCountry: "CO" } })).addressCountries, ["CO"]);
  assert.deepEqual(page(ld({ "@graph": [{ address: { addressCountry: "España" } }] })).addressCountries, ["ES"]);
  assert.deepEqual(page(ld({ address: { addressCountry: { "@type": "Country", name: "Ireland" } } })).addressCountries, ["IE"]);
  assert.deepEqual(page(ld({ address: { addressCountry: "UK" } })).addressCountries, ["GB"]);
  assert.deepEqual(page('<script type="application/ld+json">{ broken</script>').addressCountries, []);
});

test("hreflang: one region is a signal, many regions mark a multinational", () => {
  const alt = (tags) => tags.map((t) => '<link rel="alternate" hreflang="' + t + '" href="/' + t + '">').join("");
  const one = c.pageSignals(page(alt(["es-CO", "x-default"])));
  assert.deepEqual(one.map((s) => [s.kind, s.country, s.w]), [["locale", "CO", 0.35]]);
  const many = { home: page(alt(["en-US", "en-GB", "de-DE", "fr-FR", "es-MX"])) };
  const s = c.score("brand.com", many);
  assert.equal(s.worldwide, true);
  assert.ok(s.confidence < c.AUTO);
});

test("CMS default locales weigh little; specific ones more", () => {
  const w = (lang) => c.pageSignals(page('<html lang="' + lang + '"><body></body></html>')).find((s) => s.kind === "locale").w;
  assert.equal(w("en-US"), 0.15);
  assert.equal(w("es-ES"), 0.2);
  assert.equal(w("es-CO"), 0.4);
});

test("tax numbers, company registers and VAT prefixes in the footer", () => {
  const foot = (text) => page("<body><main>x</main><footer>" + text + "</footer></body>").taxIds.map((t) => t.country);
  assert.deepEqual(foot("Acme S.A.S. NIT 900.123.456-7"), ["CO"]);
  assert.deepEqual(foot("CNPJ 12.345.678/0001-90"), ["BR"]);
  assert.deepEqual(foot("Acme GmbH · USt-IdNr.: DE123456789"), ["DE"]);
  assert.deepEqual(foot("Registered in England and Wales, company no. 01234567"), ["GB"]);
  assert.deepEqual(foot("VAT: IE 1234567T"), ["IE"]);
  assert.deepEqual(foot("Partita IVA 01234567890"), ["IT"]);
  assert.deepEqual(foot("All rights reserved"), []);
});

test("a country name counts in an address, not in running text or after 'New'", () => {
  assert.deepEqual(c.countryNames("Calle 10 # 5-20, Bogotá, Colombia"), ["CO"]);
  assert.deepEqual(c.countryNames("28001 Madrid España"), ["ES"]);
  assert.deepEqual(c.countryNames("We ship to Colombia and Peru"), []);
  assert.deepEqual(c.countryNames("Santa Fe, New Mexico"), []);
  assert.deepEqual(c.countryNames("Sydney, New South Wales"), []);
});

test("agreeing signals pass the threshold; a lone language does not", () => {
  const html = '<html lang="es-CO"><head><script type="application/ld+json">{"address":{"addressCountry":"CO"}}</script></head>' +
    '<body><footer><a href="tel:+576015551234">Llámanos</a> NIT 900.123.456-7, Bogotá, Colombia</footer></body></html>';
  const sure = c.score("acme.com", { home: page(html) });
  assert.equal(sure.country, "CO");
  assert.ok(sure.confidence >= c.AUTO);
  const weak = c.score("acme.com", { home: page('<html lang="es"><body>Hola</body></html>') });
  assert.ok(weak.confidence < c.AUTO);
  assert.ok(c.score("acme.ie", { home: page('<html lang="en"><body></body></html>') }).confidence >= c.AUTO, ".ie with English");
});

test("disagreement lowers confidence below the threshold", () => {
  const html = '<html><head><script type="application/ld+json">{"address":{"addressCountry":"US"}}</script></head><body><footer><a href="tel:+34911234567">x</a> CIF B12345678</footer></body></html>';
  const s = c.score("acme.com", { home: page(html) });
  assert.ok(s.secondSupport > 0.5);
  assert.ok(s.confidence < c.AUTO);
});

test("a homepage that sends the visitor to a country version is a multinational, and its page says nothing", () => {
  const home = Object.assign(page('<html lang="es-CO"><body><footer>NIT 900.123.456-7, Bogotá, Colombia</footer></body></html>', "https://www.brand.com/co/"), { finalUrl: "https://www.brand.com/co/" });
  const s = c.score("brand.com", { home });
  assert.equal(s.worldwide, true);
  assert.equal(s.confidence, 0);
  assert.equal(c.score("brand.com", { home: Object.assign({}, home, { finalUrl: "https://www.brand.com/es-co/" }) }).worldwide, true);
  assert.equal(c.score("brand.com", { home: Object.assign({}, home, { finalUrl: "https://co.brand.com/" }) }).worldwide, true);
  const plain = c.score("brand.com", { home: Object.assign({}, home, { finalUrl: "https://www.brand.com/es/" }) });
  assert.deepEqual([plain.worldwide, plain.country], [false, "CO"]);
});

test("hosting is a tie-breaker only, and CDN hosting counts for nothing", () => {
  const base = { home: page("<html><body></body></html>") };
  assert.equal(c.score("acme.com", Object.assign({ ip: { country: "DE", org: "Hetzner Online" } }, base)).confidence, 0);
  const s = c.score("acme.com", Object.assign({ ip: { country: "NL", org: "Some Host BV" } }, base));
  assert.deepEqual([s.country, s.confidence], ["NL", 0.1]);
});

test("Gemini decides disagreements: agreeing raises confidence, a guess without evidence stays queued", () => {
  const s = { country: "CO", confidence: 0.7, support: { CO: 0.8 }, worldwide: false, signals: [{ kind: "phone", country: "CO", w: 0.55, label: "phone +57" }] };
  const agree = c.decide(s, { scope: "country", country: "CO", confidence: 0.9, reason: "Colombian bank" });
  assert.equal(agree.decidedBy, "gemini");
  assert.ok(agree.confidence >= c.AUTO);
  const guess = c.decide(s, { scope: "country", country: "MX", confidence: 0.95, reason: "guess" });
  assert.ok(guess.confidence < c.AUTO);
  const world = c.decide(Object.assign({}, s, { worldwide: true }), { scope: "worldwide", country: "", confidence: 0.95, reason: "global platform" });
  assert.deepEqual([world.scope, world.country], ["worldwide", ""]);
  assert.ok(world.confidence >= c.AUTO);
  assert.deepEqual(c.decide(s, { scope: "unknown" }).decidedBy, "signals");
});

test("setCountry places a published card: flag, region, place and region tags", () => {
  const card = { id: "u-x", host: "x.com", city: "", country: "", region: "Global", flag: "🌐", tags: [{ g: "scope", k: "requested" }, { g: "place", k: "global", t: "Global" }] };
  const item = live.setCountry({ card, detail: JSON.parse(JSON.stringify(card)) }, "IE");
  for (const target of [item.card, item.detail]) {
    assert.deepEqual([target.country, target.region, target.flag], ["IE", "Europe", "🇮🇪"]);
    assert.deepEqual(target.tags.filter((t) => t.g === "place" || t.g === "region").map((t) => t.k), ["IE", "Europe"]);
  }
});

test("every region code is an ISO country the flag and filters can show", () => {
  assert.ok(Object.keys(live.REGIONS).length > 230);
  assert.equal(live.REGIONS.IE, "Europe");
  assert.equal(live.REGIONS.GT, "Latin America");
});

test("Firestore values round-trip", () => {
  const v = { items: [{ host: "a.com", confidence: 0.5, reports: 2, evidence: ["x"] }], ok: true };
  assert.deepEqual(c.fromValue(c.toValue(v)), v);
});
