/**
 * Many reviews side by side: which reviews may be saved together, the summary table and its leaders,
 * the frost on reports the account has not paid for, and when the PDF may print.
 *
 *   npm run test:review
 */
const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

const multi = require("../../functions/url-review-multi");

const own = require(path.join(__dirname, "fixtures", "review-wordpress.json"));
const rival = require(path.join(__dirname, "fixtures", "review-excalidraw.json"));

const EMAIL = "ana@example.com";
const row = (id, report, extra) => Object.assign({ id, email: EMAIL, status: "complete", createdAt: "2026-10-2" + id.length + "T10:00:00Z", report }, extra || {});
const records = [
  row("aa11", own, { paid: true }),
  row("bb22", rival, { paid: true }),
  row("cc33", rival),
  row("dd44", own, { status: "stopped" }),
  row("ee55", rival, { email: "someone@example.com" })
];
const paidOnly = (r) => r.paid === true;

test("two to six of the account's own finished reviews can be saved together, in the order picked", () => {
  assert.match(multi.pickProblem(records, EMAIL, ["aa11"]).error, /at least two/);
  assert.match(multi.pickProblem(records, EMAIL, ["aa11", "aa11"]).error, /at least two/);
  assert.match(multi.pickProblem(records, EMAIL, ["aa11", "ee55"]).error, /not saved under this account/);
  assert.match(multi.pickProblem(records, EMAIL, ["aa11", "dd44"]).error, /stopped early/);
  assert.equal(multi.pickProblem(records, EMAIL, ["aa11", "ee55"]).code, "reviewsNotSaved");
  assert.equal(multi.pickProblem(records, EMAIL, ["aa11", "dd44"]).code, "stoppedOne");
  assert.ok(multi.pickProblem(records, EMAIL, ["aa11", "dd44"]).host);
  assert.match(multi.pickProblem(records, EMAIL, ["a1", "b2", "c3", "d4", "e5", "f6", "a7"]).error, /up to 6/);
  const picked = multi.pickProblem(records, EMAIL, ["bb22", "aa11!", "cc33"]);
  assert.deepEqual(picked, { ids: ["bb22", "aa11", "cc33"], hosts: ["excalidraw.com", "wordpress.org", "excalidraw.com"] });
  const saved = multi.savedRecord(" Ana@Example.com ", picked, "review", Date.parse("2026-10-24T12:00:00Z"));
  assert.deepEqual(saved, { email: EMAIL, ids: picked.ids, hosts: picked.hosts, from: "review", createdAt: "2026-10-24T12:00:00.000Z" });
});

test("the summary sets every score and indicator side by side and names the one column that leads it", () => {
  const made = multi.payloadOf("cmp1", { email: EMAIL, ids: ["aa11", "bb22"], hosts: [] }, records, paidOnly);
  const overall = made.summary.rows.find((r) => r.key === "overall");
  assert.deepEqual(overall.values, [own.insights.score.overall, rival.insights.score.overall]);
  assert.deepEqual(overall.leads, [own.insights.score.overall > rival.insights.score.overall ? 0 : 1]);
  ["SEO", "GEO", "Analytics", "Security", "Accessibility", "Performance"].forEach((name) => {
    const line = made.summary.rows.find((r) => r.key === "area:" + name);
    assert.deepEqual(line.values, [own.insights.score.areas[name].score, rival.insights.score.areas[name].score]);
  });
  const open = made.summary.rows.find((r) => r.key === "open");
  assert.equal(open.better, "low");
  assert.equal(made.summary.wins.length, 2);
  assert.equal(made.summary.wins[0] + made.summary.wins[1], made.summary.rows.filter((r) => r.key !== "overall" && r.leads.length === 1).length);
});

test("level lines have no leader", () => {
  const made = multi.payloadOf("cmp1", { email: EMAIL, ids: ["bb22", "cc33"] }, records, () => true);
  made.summary.rows.forEach((line) => assert.deepEqual(line.leads, []));
  assert.deepEqual(made.summary.wins, [0, 0]);
});

test("an unpaid review comes under the frost and keeps the whole comparison unpaid", () => {
  const made = multi.payloadOf("cmp1", { email: EMAIL, ids: ["aa11", "cc33"] }, records, paidOnly);
  assert.equal(made.paid, false);
  assert.deepEqual(made.locked.map((col) => col.id), ["cc33"]);
  assert.equal(made.columns[0].paid, true);
  assert.equal(made.columns[0].report.preview, undefined);
  assert.equal(made.columns[1].paid, false);
  assert.equal(made.columns[1].report.preview, true);
  assert.equal(made.columns[1].report.id, "cc33");
  const fix = rival.insights.findings.find((item) => item.fix && item.fix.split(/\s+/).length > 6);
  const frosted = made.columns[1].report.insights.findings.find((item) => item.key === fix.key);
  assert.notEqual(frosted.fix, fix.fix);
  assert.equal(made.columns[1].report.insights.score.overall, rival.insights.score.overall);
  assert.match(multi.pdfProblem(made, "<html></html>"), /must be paid/);
});

test("a review deleted after saving stays named, and the PDF prints only a paid comparison of a sane size", () => {
  const made = multi.payloadOf("cmp1", { email: EMAIL, ids: ["aa11", "bb22", "ff99"], hosts: ["wordpress.org", "excalidraw.com", "gone.example"] }, records, paidOnly);
  assert.deepEqual(made.columns[2], { id: "ff99", host: "gone.example", missing: true, paid: true });
  assert.equal(made.paid, true);
  assert.equal(made.summary.rows[0].values[2], null);
  assert.equal(multi.pdfProblem(made, "<html></html>"), "");
  assert.match(multi.pdfProblem(made, ""), /too large/);
  assert.match(multi.pdfProblem(made, "x".repeat(multi.PDF_HTML_MAX + 1)), /too large/);
  assert.match(multi.pdfName(Object.assign({}, made, { at: "2026-10-24T12:00:00Z" })), /^qa-review-comparison-wordpress\.org-vs-excalidraw\.com-2026-10-24\.pdf$/);
});

test("the account lists only its own comparisons, newest first", () => {
  const docs = [
    { id: "x1", email: EMAIL, ids: ["aa11", "bb22"], hosts: ["a", "b"], createdAt: "2026-10-20T00:00:00Z" },
    { id: "x2", email: "other@example.com", ids: ["aa11", "bb22"], hosts: ["a", "b"], createdAt: "2026-10-22T00:00:00Z" },
    { id: "x3", email: EMAIL, ids: ["bb22", "cc33"], hosts: ["b", "c"], createdAt: "2026-10-21T00:00:00Z", from: "review" }
  ];
  assert.deepEqual(multi.listOf(docs, EMAIL).map((line) => [line.id, line.from]), [["x3", "review"], ["x1", "account"]]);
});

test("the title names a site by its og:site_name when that is more than its host, and finds its icon (#1507)", () => {
  const named = { insights: { previews: { google: { site: "  Colegio   Montessori ", icon: "https://montessori.edu.co/img/icon.png" } } } };
  assert.deepEqual(multi.faceOf(named, "montessori.edu.co"), { name: "Colegio Montessori", icon: "https://montessori.edu.co/img/icon.png" });
  const plain = { insights: { previews: { google: { site: "ciedi.edu.co", icon: "" } } } };
  assert.deepEqual(multi.faceOf(plain, "ciedi.edu.co"), { name: "", icon: "https://ciedi.edu.co/favicon.ico" });
  assert.equal(multi.faceOf({ insights: { previews: { google: { icon: "http://a.example/i.png" } } } }, "a.example").icon, "https://a.example/favicon.ico");
  assert.equal(multi.faceOf({ insights: { previews: { google: { icon: 'https://a.example/"><script>' } } } }, "a.example").icon, "https://a.example/favicon.ico");
  assert.deepEqual(multi.faceOf({}, "b.example"), { name: "", icon: "https://b.example/favicon.ico" });
});

test("the PDF gets each logo the server read as a data URL, and loses the ones it could not read (#1507)", () => {
  const html = '<h2><img class="multi-logo" data-logo="0"><span>A</span><img class="multi-logo" data-logo="1"><img class="multi-logo" data-logo="2"></h2>';
  const filled = multi.withLogos(html, ["data:image/png;base64,iVBORw0KGgo=", "", 'data:image/png;base64,x" onerror="alert(1)']);
  assert.equal(filled, '<h2><img class="multi-logo" src="data:image/png;base64,iVBORw0KGgo=" alt=""><span>A</span></h2>');
});

test("a logo is only read from a public https address (#1507)", async () => {
  const core = require("../../functions/url-review-core");
  for (const url of ["http://example.com/favicon.ico", "https://127.0.0.1/favicon.ico", "https://localhost/favicon.ico", "https://10.0.0.1/x.png", "not a url"]) {
    assert.equal(await core.iconData(url), "", url);
  }
});

test("a tagline, a generic page word or the host itself is not a site's name (#1535, #1536)", () => {
  const name = (site, host) => multi.faceOf({ insights: { previews: { google: { site } } } }, host).name;
  assert.equal(name("Carlos A. Muñoz — Interactive CV", "carlosandmunoz.com"), "Carlos A. Muñoz");
  assert.equal(name("Sauce Labs | Cross Browser Testing", "saucelabs.com"), "Sauce Labs");
  assert.equal(name("BrowserStack", "www.browserstack.com"), "BrowserStack");
  assert.equal(name("Wal-Mart", "walmart.com"), "Wal-Mart");
  assert.equal(name("AI-driven E2E automation with code-like flexibility for your most resilient test", "www.testim.io"), "");
  assert.equal(name("testmuai.com", "www.testmuai.com"), "");
  assert.equal(name("Inicio", "colegio.edu.co"), "");
  assert.equal(name("Home", "example.com"), "");
});
