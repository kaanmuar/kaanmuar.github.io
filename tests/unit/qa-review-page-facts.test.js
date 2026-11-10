const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const reviewPromise = require("../../functions/url-review-promise.js");
const fixOffers = require("../../functions/url-review-fix-offers.js");

const ROOT = path.join(__dirname, "../..");
const PAGES = ["qa-review.html", "qa-review-es.html", "qa-review-pt.html", "qa-review-de.html", "qa-review-fr.html", "qa-review-it.html"];
const read = (file) => fs.readFileSync(path.join(ROOT, file), "utf8");
const facts = (file) => {
  const html = read(file);
  const a = html.indexOf('<details class="card service-facts" id="service-facts">');
  return html.slice(a, html.indexOf("</details>", a));
};

test("the splash and the page promise the report within the server's deadline (#3324)", () => {
  assert.equal(Number(read("js/qa-review.js").match(/const PROMISE_HOURS = (\d+);/)[1]), reviewPromise.PROMISE_DEADLINE_H);
  const copy = read("js/qa-review-report-copy.js");
  ["inconMail", "inconMailNone", "inconStatus"].forEach((key) => {
    const lines = copy.match(new RegExp(key + ': "[^"]*"', "g"));
    assert.equal(lines.length, 6, key);
    lines.forEach((line) => assert.match(line, /\{hours\}/, line));
  });
  PAGES.forEach((file) => {
    const box = facts(file);
    assert.equal((box.match(/<span data-promise-hours>(\d+)<\/span>/g) || []).length, 2, file);
    assert.ok(box.includes("<span data-promise-hours>" + reviewPromise.PROMISE_DEADLINE_H + "</span>"), file);
    assert.match(box, new RegExp(reviewPromise.APOLOGY_PERCENT + "\\s?%"), file);
    assert.ok(box.includes(String(reviewPromise.COUPON_DAYS)), file);
  });
});

test("every review page lists each fix package at the price and working days the checkout charges (#3326)", () => {
  PAGES.forEach((file) => {
    const box = facts(file);
    fixOffers.PACKAGES.forEach((pack) => {
      assert.match(box, new RegExp("US\\$" + pack.usd + " \\([^)]*\\b" + pack.days + "\\b"), file + " " + pack.id);
    });
    assert.match(box, /PayPal/, file);
  });
});

test("pending sources stay off the review pages until they are live (#3291, #3124, #3310)", () => {
  PAGES.forEach((file) => {
    const box = facts(file);
    ["PhishStats", "URLhaus", "Wordfence", "Spamhaus", "Barracuda"].forEach((name) => assert.ok(!box.includes(name), file + " " + name));
  });
});
