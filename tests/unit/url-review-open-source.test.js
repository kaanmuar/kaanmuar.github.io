const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const { openSource, openRows, summarizePeriod, reportRows } = require("../../functions/url-review-mail.js");
const core = require("../../functions/url-review-core.js");

test("a tagged link names the source even without a referrer", () => {
  assert.equal(openSource({ query: "?utm_source=LinkedIn&utm_medium=social", referrerHost: "" }), "linkedin (tagged link)");
  assert.equal(openSource({ query: "?utm_source=newsletter", referrerHost: "mail.google.com" }), "newsletter (tagged link)");
});

test("links that share a source read apart by campaign", () => {
  const cta = openSource({ query: "?utm_source=linkedin&utm_medium=social&utm_campaign=premium-cta" });
  const carousel = openSource({ query: "?utm_source=linkedin&utm_campaign=Premium-Carousel" });
  assert.equal(cta, "linkedin / premium-cta (tagged link)");
  assert.equal(carousel, "linkedin / premium-carousel (tagged link)");
  const jarvis = require("../../js/admin-jarvis-core.js");
  assert.equal(jarvis.openSource({ query: "?utm_source=linkedin&utm_campaign=Premium-Carousel" }), carousel, "admin Sources must split campaigns the same way");
});

test("the open notification names a tagged source", () => {
  const tagged = openRows({ page: "qa-review.html", query: "?utm_source=linkedin", referrerHost: "" });
  assert.equal(tagged.find((row) => row.label === "Source").value, "linkedin (tagged link)");
  const plain = openRows({ page: "qa-review.html", query: "", referrerHost: "www.google.com" });
  assert.equal(plain.find((row) => row.label === "Source").value, "www.google.com");
  assert.equal(openRows({}).find((row) => row.label === "Source").value, "Direct");
});

test("untagged opens fall back to the referrer, then Direct", () => {
  assert.equal(openSource({ query: "?lang=es", referrerHost: "www.google.com" }), "www.google.com");
  assert.equal(openSource({ query: "" }), "Direct");
  assert.equal(openSource({}), "Direct");
});

test("the period report tallies opens under Sources", () => {
  const summary = summarizePeriod([{ query: "?utm_source=linkedin" }, { query: "?utm_source=linkedin" }, {}], [], [], []);
  assert.deepEqual(summary.referrers, { "linkedin (tagged link)": 2, Direct: 1 });
  assert.equal(reportRows(summary).find((row) => row.label === "Sources").value, "linkedin (tagged link) 2, Direct 1");
});

test("admin buckets review opens with the same rule", () => {
  const jarvis = require("../../js/admin-jarvis-core.js");
  [{ query: "?utm_source=LinkedIn" }, { query: "?lang=es", referrerHost: "www.google.com" }, {}].forEach((row) => {
    assert.equal(jarvis.openSource(row), openSource(row));
  });
  const summary = jarvis.summarizeReview({ opens: [{ query: "?utm_source=LinkedIn", createdAt: new Date() }], reviews: [], alerts: [], reports: [], events: [] }, jarvis.windowFor(7, new Date()));
  assert.ok(summary.lists.sources.some((row) => row.label === "linkedin (tagged link)"));
});

test("a landing keeps only the utm tags and a bare referrer host", () => {
  assert.deepEqual(core.landingSource({ query: "?lang=es&utm_source=LinkedIn&utm_campaign=premium-cta&email=a@b.co", referrerHost: "WWW.LinkedIn.com" }),
    { query: "?utm_source=LinkedIn&utm_campaign=premium-cta", referrerHost: "www.linkedin.com" });
  assert.deepEqual(core.landingSource({ query: "?utm_source=<script>", referrerHost: "evil.com/path" }), { query: "?utm_source=script", referrerHost: "" });
  assert.deepEqual(core.landingSource(null), { query: "", referrerHost: "" });
  assert.deepEqual(core.landingSource("?utm_source=x"), { query: "", referrerHost: "" });
});

test("a review keeps where the asker landed, so it reads under the same source as the open", () => {
  const body = { termsAccepted: true, termsVersion: core.TERMS_VERSION, name: "Ana Ruiz", email: "ana@example.com", reasonCode: "teaching", frameworks: ["Playwright"], url: "https://shop.example.com/" };
  const tagged = core.validateIntake(Object.assign({ landing: { query: "?utm_source=linkedin&utm_medium=social", referrerHost: "" } }, body)).value;
  const record = core.intakeRecord(tagged, { id: "r1", status: "complete" }, {});
  assert.equal(record.query, "?utm_source=linkedin&utm_medium=social");
  assert.equal(openSource(record), "linkedin (tagged link)");
  const referred = core.intakeRecord(core.validateIntake(Object.assign({ landing: { query: "", referrerHost: "www.google.com" } }, body)).value, { id: "r2" }, {});
  assert.equal(openSource(referred), "www.google.com");
  const bare = core.intakeRecord(core.validateIntake(body).value, { id: "r3" }, {});
  assert.equal(bare.query, "");
  assert.equal(openSource(bare), "Direct");
});

test("the period report splits reviews and payments by source", () => {
  const reviews = [
    { id: "r1", email: "ana@example.com", status: "complete", query: "?utm_source=linkedin" },
    { id: "r2", email: "bo@example.com", status: "complete", referrerHost: "www.google.com" },
    { id: "r3", email: "cy@example.com", status: "complete" }
  ];
  const payments = [
    { status: "paid-report", paid: true, reportId: "r1", priceUsd: 19 },
    { status: "run-credit", paid: true, email: "BO@example.com", priceUsd: 19 },
    { status: "paid-report", paid: true, reportId: "old", priceUsd: 19 },
    { status: "paid-report", paid: true, reportId: "r3", priceUsd: 19, test: true },
    { status: "checkout-open", reportId: "r3" }
  ];
  const summary = summarizePeriod([], reviews.concat(payments), [], []);
  assert.deepEqual(summary.reviewSources, { "linkedin (tagged link)": 1, "www.google.com": 1, Direct: 1 });
  assert.deepEqual(summary.paidSources, { "linkedin (tagged link)": 1, "www.google.com": 1, "no review in this period": 1 });
  const rows = reportRows(summary);
  assert.equal(rows.find((row) => row.label === "Reviews by source").value, "Direct 1, linkedin (tagged link) 1, www.google.com 1");
  assert.match(summary.body, /ana@example\.com.*from linkedin \(tagged link\)/);
});

test("the review page sends the visit's first landing with the review", () => {
  const consent = fs.readFileSync(path.join(__dirname, "../../js/qa-review-consent.js"), "utf8");
  assert.match(consent, /landing: landing,/);
  assert.match(consent, /keepLanding\(\);\n {2}noteOpen\(\);/);
  assert.match(consent, /if \(sessionStorage\.getItem\(LANDING_KEY\)\) return;/);
  const page = fs.readFileSync(path.join(__dirname, "../../js/qa-review.js"), "utf8");
  assert.match(page, /landing: window\.QaConsent && QaConsent\.landing \? QaConsent\.landing\(\) : null,/);
});
