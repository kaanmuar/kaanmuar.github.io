const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { stripTypeScriptTypes } = require("node:module");
const core = require("../../functions/url-review-core");
const legal = require("../../functions/url-review-legal");
const scripts = require("../../js/qa-review-scripts");
const sample = require("../../assets/qa-review-sample.json");

const ROOT = path.join(__dirname, "..", "..");
const STUB = /test\.fixme|it\.skip|test\.skip|xScenario|@Disabled|enabled = false|pytest\.mark\.skip|\[Tags\]\s+manual|, skip: |@manual|A person runs this case/;

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

function syntaxError(file, content, dir) {
  const target = path.join(dir, file.replace(/\.ts$/, ".mjs"));
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, /\.ts$/.test(file) ? stripTypeScriptTypes(content) : content);
  const run = /\.m?js$/.test(target) ? spawnSync(process.execPath, ["--check", target]) : spawnSync("python3", ["-m", "py_compile", target]);
  if (run.error) return "";
  return run.status === 0 ? "" : String(run.stderr).split("\n").slice(0, 3).join(" ");
}

test("no P1 or P2 case in the sample gets a stub script in any of its frameworks (#2183, #2275)", () => {
  const report = sample.report;
  const ctx = scripts.context(report);
  const top = report.cases.filter((item) => /^P[12]$/.test(item.priority));
  assert.ok(top.length > 0);
  top.forEach((item) => {
    assert.notEqual(scripts.checkFor(item, ctx).kind, "manual", item.id + " has a check");
    scripts.snippets(report, item, item.fw).forEach(({ framework, code }) => assert.doesNotMatch(code, STUB, item.id + " in " + framework));
  });
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "qa-review-sample-"));
  try {
    const broken = scripts.bundle(report, top, core.FRAMEWORKS).files
      .filter((file) => /\.(m?js|ts|py)$/.test(file.path))
      .map((file) => ({ file: file.path, error: syntaxError(file.path, file.content, dir) }))
      .filter((row) => row.error);
    assert.deepEqual(broken, []);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("retest cases rerun the finding they came from, and SEC-10, FN-08 and A11Y-06 assert what the review observed (#2275)", () => {
  const report = sample.report;
  const ctx = scripts.context(report);
  const check = (id) => scripts.checkFor(report.cases.find((item) => item.id === id), ctx);
  const domain = report.insights.security.domain.domain;

  assert.deepEqual(check("RT-01"), { kind: "probe", probe: "image-format", paths: ["/", "/products"], args: [] });
  assert.deepEqual(check("RT-02"), { kind: "probe", probe: "image-size", paths: ["/", "/products"], args: [] });
  assert.deepEqual(check("RT-04"), { kind: "text", url: "https://dns.google/resolve?name=" + domain + "&type=TXT", pattern: "v=spf1", match: true });
  assert.deepEqual(check("RT-05"), { kind: "text", url: "https://dns.google/resolve?name=_dmarc." + domain + "&type=TXT", pattern: "v=DMARC1", match: true });

  const libraries = check("SEC-10");
  assert.equal(libraries.probe, "library-versions");
  assert.deepEqual(libraries.args, report.browser.libraries.map((lib) => lib.via + " " + lib.version + " " + lib.url + " " + lib.name));

  const titles = check("FN-08");
  assert.equal(titles.probe, "distinct-titles");
  ["/category_products/1", "/category_products/4"].forEach((page) => assert.ok(titles.args.includes(page), "FN-08 rereads " + page));

  assert.equal(check("A11Y-06").probe, "accessibility-statement");
  const code = scripts.snippets(report, report.cases.find((item) => item.id === "A11Y-06"), ["Playwright"])[0].code;
  [legal.LEGAL.accessibility.text, legal.LEGAL.accessibility.href, legal.LEGAL.accessibility.away, legal.OVERLAY]
    .forEach((rule) => assert.ok(code.includes(JSON.stringify(rule.source)), "the probe reads statement links as the review does: " + rule.source.slice(0, 40)));
});

test("a DMARC policy left at p=none is retested for quarantine or reject, and a retest of a case-backed finding reruns that case (#2275)", () => {
  const ctx = { startPath: "/", paths: ["/"], domain: "shop.example.com", findings: {
    "F-01": { key: "sec-dmarc", evidence: "", title: "sec-dmarc.monitor.title", cases: [] },
    "F-02": { key: "sec-hsts", evidence: "", title: "", cases: ["SEC-02"] }
  } };
  assert.match(scripts.checkFor({ id: "RT-01", finding: "F-01" }, ctx).pattern, /p=\(quarantine\|reject\)/);
  assert.deepEqual(scripts.checkFor({ id: "RT-02", finding: "F-02", path: "/" }, ctx), { kind: "headers", path: "/", rules: [{ name: "strict-transport-security" }] });
  assert.equal(scripts.checkFor({ id: "RT-03", finding: "F-09" }, ctx).kind, "manual");
});
