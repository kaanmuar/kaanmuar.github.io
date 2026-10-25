const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const LANGS = ["en", "es", "pt", "de", "fr", "it"];
const AREAS = ["SEO", "GEO", "Analytics", "Security", "Accessibility", "Performance"];
const copySource = fs.readFileSync(path.join(__dirname, "../../js/qa-review-compare-copy.js"), "utf8");
const reviewSource = fs.readFileSync(path.join(__dirname, "../../js/qa-review.js"), "utf8");

function copyFor(lang) {
  const sandbox = { window: {}, document: { documentElement: { lang } } };
  vm.runInNewContext(copySource, sandbox);
  return sandbox.window.QAReviewCompareCopy;
}

test("every page language has its own area notes, area counts and verdict labels (#1120)", () => {
  const en = copyFor("en");
  for (const lang of LANGS) {
    const cc = copyFor(lang);
    const counts = cc.t("areaCounts", { fail: 11, risk: 22, pass: 33 });
    for (const n of ["11", "22", "33"]) assert.ok(counts.includes(n), lang + ": " + counts);
    assert.ok(!/[{}]/.test(counts), lang + ": " + counts);
    for (const name of AREAS) assert.ok(cc.areaNote(name), lang + " " + name);
    if (lang === "en") continue;
    assert.notEqual(counts, en.t("areaCounts", { fail: 11, risk: 22, pass: 33 }), lang);
    for (const name of AREAS) assert.notEqual(cc.areaNote(name), en.areaNote(name), lang + " " + name);
    for (const key of ["fail", "risk", "pass", "person"]) assert.notEqual(cc.verdict(key), en.verdict(key), lang + " " + key);
  }
});

test("the report's area chips take their words from the copy, not from English literals (#1120)", () => {
  assert.ok(!/" fail · "|" at risk · "|" pass — "/.test(reviewSource));
  assert.ok(!reviewSource.includes("Indexing, sitemap, titles, structured data"));
  assert.ok(!/VERDICT_LABEL = \{ fail: "/.test(reviewSource));
});
