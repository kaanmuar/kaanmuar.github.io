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
  const jarvis = require("../../js/admin-jarvis-core.js");
  const row = { query: "?utm_source=linkedin", referrerHost: "" };
  assert.equal(jarvis.openSource(row), visitSource(row));
});

test("a tagged visit reaches site_events with its query and a server time", async () => {
  const vm = require("vm");
  const source = fs.readFileSync(path.join(__dirname, "../../js/site-analytics.js"), "utf8")
    .replace(/import\('https:\/\/www\.gstatic\.com\/firebasejs\/[^']+\/(firebase-[a-z]+)\.js'\)/g, "loadFirebase('$1')");
  const added = [];
  const firestore = {
    getFirestore: () => "db",
    collection: (db, name) => name,
    serverTimestamp: () => "server-time",
    addDoc: async (collection, row) => added.push({ collection, row })
  };
  const app = { getApps: () => [], initializeApp: () => ({}) };
  const store = {};
  const window = {
    location: { hostname: "carlosandmunoz.com", pathname: "/qa-review.html", search: "?utm_source=linkedin&signin=abc", href: "" },
    history: { replaceState() {} },
    innerWidth: 1280
  };
  window.top = window;
  window.self = window;
  const context = {
    window,
    document: { referrer: "", title: "QA-lab URL Review", documentElement: { lang: "en" }, addEventListener() {} },
    navigator: { webdriver: false, languages: ["en"] },
    sessionStorage: { getItem: (key) => store[key] || null, setItem: (key, value) => { store[key] = value; } },
    loadFirebase: async (name) => (name === "firebase-app" ? app : firestore),
    URL, URLSearchParams, Intl
  };
  vm.runInNewContext(source, context);
  window.SiteAnalytics.bind("review");
  assert.doesNotThrow(() => window.SiteAnalytics.noteVisit());
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(added.length, 1);
  assert.equal(added[0].collection, "site_events");
  assert.equal(added[0].row.kind, "visit");
  assert.equal(added[0].row.query, "?utm_source=linkedin");
  assert.equal(added[0].row.createdAt, "server-time");
});
