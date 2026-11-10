const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const { PACKAGES } = require("../../functions/url-review-fix-offers.js");

const ROOT = path.join(__dirname, "../..");
const BASE = "https://carlosandmunoz.com/";
const LANGS = ["en", "es", "pt", "de", "fr", "it"];
const TYPES = ["WebApplication", "Organization", "Service", "BreadcrumbList", "FAQPage"];
const read = (file) => fs.readFileSync(path.join(ROOT, file), "utf8");
const pageOf = (lang) => (lang === "en" ? "qa-review.html" : `qa-review-${lang}.html`);

function graph(html) {
  const blocks = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)];
  assert.equal(blocks.length, 1, "one JSON-LD block");
  return JSON.parse(blocks[0][1])["@graph"];
}

const meta = (html, attr, name) => {
  const m = html.match(new RegExp(`<meta ${attr}="${name}" content="([^"]*)">`));
  return m ? m[1] : null;
};

for (const lang of LANGS) {
  const page = pageOf(lang);
  const html = read(page);
  const nodes = graph(html);

  test(`${page}: the structured data parses and uses known schema.org types`, () => {
    nodes.forEach((node) => assert.ok(TYPES.includes(node["@type"]), node["@type"]));
    assert.deepEqual(nodes.map((n) => n["@type"]).sort(), TYPES.slice().sort());
  });

  test(`${page}: the fix packages' offers carry the prices and scope the report page sells`, () => {
    const service = nodes.find((n) => n["@type"] === "Service");
    assert.equal(service["@id"], BASE + page + "#fixes");
    assert.equal(service.url, BASE + page);
    assert.equal(service.provider["@id"], BASE + "qa-review.html#organization");
    const agg = service.offers;
    assert.equal(agg["@type"], "AggregateOffer");
    assert.equal(agg.priceCurrency, "USD");
    assert.equal(agg.offerCount, PACKAGES.length);
    assert.equal(agg.lowPrice, String(Math.min(...PACKAGES.map((p) => p.usd))));
    assert.equal(agg.highPrice, String(Math.max(...PACKAGES.map((p) => p.usd))));
    assert.deepEqual(agg.offers.map((o) => o.sku), PACKAGES.map((p) => p.id));
    agg.offers.forEach((offer, i) => {
      const p = PACKAGES[i];
      assert.equal(offer["@type"], "Offer");
      assert.equal(offer.price, String(p.usd), p.id);
      assert.equal(offer.priceCurrency, "USD");
      assert.equal(offer.name, p.name[lang]);
      assert.equal(offer.description, p.what[lang]);
      assert.equal(offer.availability, "https://schema.org/InStock");
      assert.deepEqual(offer.deliveryLeadTime, { "@type": "QuantitativeValue", value: p.days, unitCode: "DAY" });
    });
  });

  test(`${page}: the FAQ answers are complete and the package answer names every price`, () => {
    const faq = nodes.find((n) => n["@type"] === "FAQPage");
    assert.equal(faq.url, BASE + page + "#service-facts");
    assert.equal(faq.mainEntity.length, 12);
    faq.mainEntity.forEach((q) => {
      assert.equal(q["@type"], "Question");
      assert.ok(q.name.trim());
      assert.equal(q.acceptedAnswer["@type"], "Answer");
      assert.ok(q.acceptedAnswer.text.trim());
    });
    const packs = faq.mainEntity.filter((q) => /PayPal/.test(q.acceptedAnswer.text));
    assert.equal(packs.length, 1);
    PACKAGES.forEach((p) => {
      assert.ok(packs[0].acceptedAnswer.text.includes(p.name[lang]), p.name[lang]);
      assert.match(packs[0].acceptedAnswer.text, new RegExp(`\\b${p.usd}\\b`), p.id);
    });
    assert.ok(faq.mainEntity.some((q) => /\b48\b/.test(q.acceptedAnswer.text) && /\b20\s?%/.test(q.acceptedAnswer.text)));
  });

  test(`${page}: canonical, hreflang and share tags point at this language's page`, () => {
    assert.ok(html.includes(`<link rel="canonical" href="${BASE + page}">`));
    assert.ok(html.includes(`<link rel="alternate" hreflang="x-default" href="${BASE}qa-review.html">`));
    LANGS.forEach((code) => assert.ok(html.includes(`<link rel="alternate" hreflang="${code}" href="${BASE + pageOf(code)}">`), code));
    assert.equal(meta(html, "property", "og:url"), BASE + page);
    const description = meta(html, "name", "description");
    assert.ok(description && description.length <= 190, `meta description is ${description && description.length} characters`);
    ["og:description"].forEach((name) => assert.match(meta(html, "property", name), /Web Risk/));
    assert.match(meta(html, "name", "twitter:description"), /69/);
  });
}

const EVENTS = ["qa_review_inconclusive", "qa_review_apology_shown", "qa_review_apology_copy", "qa_review_fix_open",
  "qa_review_fix_way", "qa_review_fix_request", "qa_review_fix_checkout", "qa_review_fix_paid", "qa_review_fix_recheck"];

test("every stored analytics event is allowed by the site_events rule", () => {
  const kinds = read("js/site-analytics.js").match(/const KINDS = \{([\s\S]*?)\n    \};/)[1];
  const names = [...kinds.matchAll(/^\s*(\w+): '(\w+)'/gm)].map((m) => m[1]);
  const rule = read("firestore.rules").match(/match \/site_events\/\{id\} \{([\s\S]*?)\n    \}/)[1];
  names.forEach((name) => assert.ok(rule.includes(`'${name}'`), name));
  EVENTS.forEach((name) => assert.ok(names.includes(name), name));
});

test("the promise, apology and fix events are sent from the review pages", () => {
  const sources = ["js/qa-review.js", "js/qa-review-fix.js", "qa-review-pay.html"].map(read).join("\n");
  EVENTS.forEach((name) => assert.ok(sources.includes(`"${name}"`), name));
  const fix = read("js/qa-review-fix.js");
  const ways = fix.match(/const WAYS = (\{[^}]*\})/)[1];
  assert.deepEqual([...new Set(Object.values(Function(`return ${ways}`)()))].sort(), ["call", "package", "quote", "self"]);
});
