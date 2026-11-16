/**
 * Full Stack bundles + Agency CI helpers (#3482).
 */
const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const core = require("../../functions/url-review-core");
const agency = require("../../functions/url-review-agency");
const crypto = require("crypto");

describe("Full Stack bundles (#3482)", () => {
  it("prices Starter at $29 under à-la-carte $34", () => {
    const priced = core.priceForBundle("starter");
    assert.equal(priced.usd, 29);
    assert.equal(priced.listUsd, 34);
    assert.deepEqual(priced.frameworks, ["Playwright", "k6"]);
    assert.deepEqual(priced.tools, ["axe-core", "Lighthouse"]);
    assert.equal(core.chargedUsd({ purpose: "report", bundle: "starter", frameworks: priced.frameworks, tools: priced.tools, priceUsd: 29 }).usd, 29);
  });

  it("prices Complete at $99 under à-la-carte $149", () => {
    const priced = core.priceForBundle("complete");
    assert.equal(priced.usd, 99);
    assert.equal(priced.listUsd, 149);
    assert.equal(priced.frameworks.length, core.FRAMEWORKS.length);
    assert.equal(priced.tools.length, core.SPECIALIST_TOOLS.length);
    assert.equal(core.priceMatches(99), true);
    assert.equal(core.chargedUsd({ purpose: "report", bundle: "complete", priceUsd: 99 }).usd, 99);
  });

  it("adds scope on a new-run bundle quote", () => {
    const priced = core.priceForRun({ bundle: "starter", pages: 40, depth: 2, billing: "run" });
    assert.equal(priced.bundle, "starter");
    assert.equal(priced.usd, 34);
    assert.equal(priced.pageUsd, 5);
  });

  it("names the bundle on the receipt line", () => {
    assert.match(core.productName("report", [], { bundle: "starter" }), /Starter Full Stack/);
    assert.match(core.productName("new-run", [], { bundle: "complete", pages: 20, depth: 2 }), /Complete Full Stack/);
  });
});

describe("Agency branding + CI HMAC (#3482)", () => {
  it("keeps a Report by QA-lab byline on branded PDFs", () => {
    const brand = agency.pdfBrand({ companyName: "North Agency", logoDataUrl: "data:image/png;base64,aaaa" });
    assert.equal(brand.companyName, "North Agency");
    assert.equal(brand.byline, "Report by QA-lab URL Review");
  });

  it("mirrors PDF co-brand defaults on live reports (#3494)", () => {
    const brand = agency.liveBrand({ companyName: "North Agency", logoDataUrl: "data:image/png;base64,aaaa" });
    assert.equal(brand.companyName, "North Agency");
    assert.equal(brand.logoDataUrl, "data:image/png;base64,aaaa");
    assert.equal(brand.eyebrow, "North Agency");
    assert.equal(brand.byline, "Report by QA-lab URL Review");
    assert.equal(agency.liveBrand(null), null);
  });

  it("gates agency features on Team and Pro", () => {
    assert.equal(agency.agencyEligible({ plan: "freelancer" }), false);
    assert.equal(agency.agencyEligible({ plan: "team" }), true);
    assert.equal(agency.agencyEligible({ plan: "pro" }), true);
  });

  it("verifies a per-pack HMAC signature", () => {
    const made = agency.newWebhookSecret();
    const raw = Buffer.from(JSON.stringify({ url: "https://example.com" }));
    const header = "sha256=" + crypto.createHmac("sha256", made.secret).update(raw).digest("hex");
    assert.equal(agency.verifyCiRequest({ agencyCi: made }, raw, { "x-qa-lab-signature": header }), true);
    assert.equal(agency.verifyCiRequest({ agencyCi: made }, raw, { "x-qa-lab-signature": "sha256=deadbeef" }), false);
  });
});
