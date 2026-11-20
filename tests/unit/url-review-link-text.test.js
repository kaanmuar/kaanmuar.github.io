const test = require("node:test");
const assert = require("node:assert/strict");
const linkText = require("../../functions/url-review-link-text");
const { english } = require("../../functions/url-review-findings-en");

const FIXTURE = `<html><body>
<a href="/a">Read more</a>
<a href="/b">READ MORE »</a>
<a href="/c" class="x">Click&nbsp;here</a>
<a href="/pricing">Pricing guide</a>
<a href="/d" aria-label="Read the shipping policy">Read more</a>
<a href="/e"><img src="e.png" alt="Leer más"></a>
<a href="/f" aria-hidden="true">here</a>
<a name="anchor">more</a>
<a href="/g"><svg><title>Cart</title></svg></a>
<a href="/h">Más información</a>
<a href="/i"><span>En savoir plus</span> <script>var a = "<b>";</script></a>
</body></html>`;

function run(html) {
  const rows = [];
  const add = (...args) => rows.push(args);
  const report = linkText.analyze(html);
  linkText.findings(report, add);
  return { report, rows };
}

test("isGeneric matches the six review languages and ignores punctuation, case and accents", () => {
  ["Read more »", "click here...", "HIER KLICKEN", "Más información", "En savoir plus", "Leggi di più", "Saiba mais", "Leia  mais"].forEach((name) => assert.equal(linkText.isGeneric(name), true, name));
  ["Pricing guide", "Read the shipping policy", "Contact", "Leer más sobre envíos", ""].forEach((name) => assert.equal(linkText.isGeneric(name), false, name));
});

test("analyze counts only links named by nothing more than a generic phrase", () => {
  const { report } = run(FIXTURE);
  // /a, /b, /c, /e (alt), /h, /i are generic. aria-label wins for /d; aria-hidden, no-href and svg-title links drop out or pass.
  assert.equal(report.generic, 6);
  assert.equal(report.total, 9);
  const more = report.names.find((row) => row.text === "Read more");
  assert.deepEqual({ count: more.count, targets: more.targets }, { count: 2, targets: 2 });
});

test("findings flags generic link text as a low risk with English evidence", () => {
  const { rows } = run(FIXTURE);
  assert.equal(rows.length, 1);
  const [area, status, severity, id, title, evidence, fix] = rows[0];
  assert.deepEqual([area, status, severity, id], ["Accessibility", "risk", "low", "a11y-linktext"]);
  assert.match(english(title), /read more/);
  assert.match(english(evidence), /^6 of 9 links/);
  assert.match(english(evidence), /“Read more” \(2×, going to 2 different pages\)/);
  assert.match(english(fix), /destination/);
});

test("a generic name that points at three or more pages is a medium risk", () => {
  const html = '<a href="/1">more</a><a href="/2">more</a><a href="/3">more</a><a href="/4">Contact us</a>';
  const { rows } = run(html);
  assert.equal(rows[0][2], "medium");
});

test("findings passes when three or more links are all descriptive, and stays silent on too few", () => {
  const good = '<a href="/1">Pricing</a><a href="/2">About the team</a><a href="/3"><img alt="Home" src="h.png"></a>';
  const { rows } = run(good);
  assert.equal(rows.length, 1);
  assert.equal(rows[0][1], "pass");
  assert.equal(run('<a href="/1">more</a><a href="/2">Pricing</a>').rows.length, 0);
  assert.equal(run("").rows.length, 0);
});

test("a link named by aria-labelledby is not judged, and hostile input stays fast", () => {
  const { report } = run('<a href="/1" aria-labelledby="t">more</a><a href="/2">Pricing</a><a href="/3">Docs</a><a href="/4">Blog</a>');
  assert.equal(report.generic, 0);
  const hostile = "<a ".repeat(100000) + 'href="' + "x".repeat(200000);
  const started = Date.now();
  linkText.analyze(hostile);
  linkText.analyze("<a href=x>" + "<img ".repeat(50000));
  assert.ok(Date.now() - started < 2000);
});
