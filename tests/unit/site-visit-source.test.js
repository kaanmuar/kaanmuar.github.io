const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const { openSource } = require("../../functions/url-review-mail.js");
const { visitSource, visitRows, reportBody } = require("../../functions/site-report-mail.js");

test("a site visit uses the same source rule as a review open", () => {
  const rows = [
    { query: "?utm_source=LinkedIn&utm_medium=social", referrerHost: "" },
    { query: "?utm_source=newsletter", referrerHost: "mail.google.com" },
    { query: "?lang=es", referrerHost: "www.google.com" },
    { query: "", referrerHost: "" },
    {}
  ];
  rows.forEach((row) => assert.equal(visitSource(row), openSource(row)));
});

test("visit lines name a tagged review visit", () => {
  const visit = { kind: "visit", site: "review", page: "qa-review.html", query: "?utm_source=linkedin", referrerHost: "" };
  assert.equal(visitRows(visit).find((row) => row.label === "Referrer").value, "linkedin (tagged link)");
  const body = reportBody([visit]);
  assert.match(body, /linkedin \(tagged link\)/);
  assert.equal(reportBody([{ kind: "visit", site: "review", page: "qa-review.html" }]).includes("Direct"), true);
});

test("the site report tally and the stored visit keep the page query", () => {
  const index = fs.readFileSync(path.join(__dirname, "../../functions/index.js"), "utf8");
  assert.match(index, /bump\(referrers, siteReport\.visitSource\(row\)\)/);
  assert.match(index, /kind: "visit",[\s\S]*?query: query,/);
  const rules = fs.readFileSync(path.join(__dirname, "../../firestore.rules"), "utf8");
  assert.match(rules, /'referrerHost', 'query'/);
  assert.match(rules, /!\('query' in request\.resource\.data\)/);
  assert.match(rules, /query\.matches\(/);
});

test("a visit stores the page query without sign-in tokens", () => {
  const source = fs.readFileSync(path.join(__dirname, "../../js/site-analytics.js"), "utf8");
  const match = source.match(/function pageQuery\(\) \{[\s\S]*?\n    \}/);
  assert.ok(match, "pageQuery is missing");
  const pageQuery = new Function("root", match[0] + "\nreturn pageQuery();");
  assert.equal(pageQuery({ location: { search: "?signin=abc&key=secret&utm_source=linkedin&utm_medium=social" } }), "?utm_source=linkedin&utm_medium=social");
  assert.equal(pageQuery({ location: { search: "?report=r1&state=s1" } }), "");
  assert.equal(pageQuery({ location: { search: "" } }), "");
  assert.match(source, /if \(kind === 'visit'\) row\.query = pageQuery\(\)/);
});

test("admin site visits use the same source rule", () => {
  const html = fs.readFileSync(path.join(__dirname, "../../admin.html"), "utf8");
  assert.match(html, /siteBump\(referrers, reviewOpenSource\(row\)\)/);
  const source = html.match(/function reviewOpenSource\(row\) \{[\s\S]*?\n {4}\}/);
  const reviewOpenSource = new Function(source[0] + "\nreturn reviewOpenSource;")();
  const row = { query: "?utm_source=linkedin", referrerHost: "" };
  assert.equal(reviewOpenSource(row), visitSource(row));
});
