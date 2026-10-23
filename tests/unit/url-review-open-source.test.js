const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const { openSource, summarizePeriod, reportRows } = require("../../functions/url-review-mail.js");

test("a tagged link names the source even without a referrer", () => {
  assert.equal(openSource({ query: "?utm_source=LinkedIn&utm_medium=social", referrerHost: "" }), "linkedin (tagged link)");
  assert.equal(openSource({ query: "?utm_source=newsletter", referrerHost: "mail.google.com" }), "newsletter (tagged link)");
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
  const html = fs.readFileSync(path.join(__dirname, "../../admin.html"), "utf8");
  const source = html.match(/function reviewOpenSource\(row\) \{[\s\S]*?\n {4}\}/);
  assert.ok(source, "reviewOpenSource is missing from admin.html");
  const reviewOpenSource = new Function(source[0] + "\nreturn reviewOpenSource;")();
  [{ query: "?utm_source=LinkedIn" }, { query: "?lang=es", referrerHost: "www.google.com" }, {}].forEach((row) => {
    assert.equal(reviewOpenSource(row), openSource(row));
  });
  assert.match(html, /<h3>Sources<\/h3><div id="review-referrers"/);
});
