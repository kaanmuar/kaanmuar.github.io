const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const core = require("../../functions/url-review-core");
const sample = require("../../assets/qa-review-sample.json");

const ROOT = path.join(__dirname, "..", "..");

// The sample report shows its top case in full (#2098), so it has to be a real run of the current engine (#2114).
test("the sample's cases are ranked by risk, and its top case is a P1 or P2 that fails or is at risk", () => {
  const cases = sample.report.cases;
  assert.ok(cases.length > 0);
  cases.forEach((item) => {
    assert.equal(typeof item.risk, "number", item.id + " has a risk");
    assert.match(item.priority || "", /^P[1-4]$/, item.id + " has a priority");
  });
  cases.slice(1).forEach((item, index) => assert.ok(cases[index].risk >= item.risk, cases[index].id + " ranks above " + item.id));
  const top = cases[0];
  assert.match(top.priority, /^P[12]$/, top.id + " is a P1 or P2");
  assert.ok(top.verdict === "fail" || top.verdict === "risk", top.id + " fails or is at risk");
  assert.deepEqual(sample.frameworks, core.FRAMEWORKS);
});

// The page shows the sample's search icon and screenshots as images, so they are inlined: tests stay off the network (#2955).
test("each language's sample carries its search icon and screenshots inline", () => {
  ["", ".es", ".pt", ".de", ".fr", ".it"].forEach((lang) => {
    const file = "assets/qa-review-sample" + lang + ".json";
    const report = JSON.parse(fs.readFileSync(path.join(ROOT, file), "utf8")).report;
    const images = [report.insights.previews.google.icon].concat(Object.values(report.browser.shots || {}));
    images.forEach((src) => assert.match(src, /^data:image\/(png|jpeg|gif|webp|svg\+xml|x-icon|vnd\.microsoft\.icon);base64,/, file + " inlines " + String(src).slice(0, 80)));
  });
});

test("the review page, its languages and the guide name the site the sample reviewed", () => {
  const host = sample.report.host.replace(/^www\./, "");
  ["qa-review.html", "qa-review-de.html", "qa-review-es.html", "qa-review-fr.html", "qa-review-it.html", "qa-review-pt.html"].forEach((page) => {
    const line = fs.readFileSync(path.join(ROOT, page), "utf8").match(/<p class="sample-line"[^]*?<\/p>/);
    assert.ok(line && line[0].includes(host), page + " names " + host + " beside the sample button");
  });
  assert.ok(fs.readFileSync(path.join(ROOT, "qa-review-guide.html"), "utf8").includes(host), "the guide names " + host);
});
