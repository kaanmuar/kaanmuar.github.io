const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const legal = require("../../scripts/build-legal-html");

const html = fs.readFileSync(path.join(__dirname, "..", "..", "qa-review-legal.html"), "utf8");

test("the disclaimers in the HTML are the ones the page script paints", () => {
  assert.equal(legal.build(html), html, "run node scripts/build-legal-html.js");
});

test("each notice carries its heading and text without scripts", () => {
  const notices = Object.fromEntries(legal.painted(html));
  assert.match(notices["local-notice"], /^<h2>Local law\. The operator's domicile<\/h2><p>The operator/);
  assert.match(notices["origin-notice"], /Ley Estatutaria 1581 de 2012/);
  assert.match(notices["site-notice"], /The address did not name a country\./);
  const words = Object.values(notices).join(" ").split(/\s+/).length;
  assert.ok(words > 1000, words + " words");
  Object.entries(notices).forEach(([id, inner]) => assert.ok(html.includes('id="' + id + '">' + inner + "</article>"), id + " is in the HTML"));
});
