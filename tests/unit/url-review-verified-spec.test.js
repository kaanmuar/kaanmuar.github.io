const { test, describe } = require("node:test");
const assert = require("node:assert/strict");
const verified = require("../../functions/url-review-verified-spec");
const scripts = require("../../js/qa-review-scripts.js");

function report(extra) {
  return Object.assign({
    id: "r1",
    host: "shop.example.com",
    finalUrl: "https://shop.example.com/",
    status: "complete",
    pages: [{ path: "/", status: 200, title: "Shop", depth: 0, ms: 120, bytes: 4000 }],
    observed: { title: "Shop", description: "A shop", lang: "en", headers: {}, h1: ["Shop"], scripts: 2 },
    cases: [{
      id: "SEC-03",
      layer: "Security",
      title: "CSP is sent",
      why: "No CSP header was seen. The header is present.",
      fw: ["Playwright"],
      path: "/"
    }]
  }, extra || {});
}

describe("url-review-verified-spec (#3481)", () => {
  test("soft preview never gets a badge", () => {
    const pages = [{ path: "/", status: 200, html: "<html lang=\"en\"><body><h1>Hi</h1></body></html>", depth: 0 }];
    assert.equal(verified.verify(report({ softPreview: true }), { pages }), null);
    assert.equal(verified.verify(report(), { pages, softPreview: true }), null);
  });

  test("top Playwright headers case is grounded when the path was crawled", () => {
    const pages = [{ path: "/", status: 200, html: "<html><body></body></html>", depth: 0 }];
    const out = verified.verify(report(), { pages, now: Date.parse("2026-11-16T12:00:00Z") });
    assert.deepEqual(out, {
      caseId: "SEC-03",
      framework: "Playwright",
      at: "2026-11-16T12:00:00.000Z",
      via: "crawl-dom",
      exitCode: 0
    });
  });

  test("count selectors are checked against crawled HTML", () => {
    const item = {
      id: "FN-03",
      layer: "Functional",
      title: "one h1",
      why: "Counted. Exactly one h1.",
      fw: ["Playwright"],
      path: "/",
      check: { kind: "count", path: "/", selector: "h1", op: "eq", n: 1 }
    };
    const pages = [{ path: "/", status: 200, html: "<html><body><h1>Only</h1></body></html>", depth: 0 }];
    const out = verified.verify(report({ cases: [item] }), { pages });
    assert.equal(out.caseId, "FN-03");
    assert.equal(out.exitCode, 0);
  });

  test("missing HTML for a DOM selector fails quietly", () => {
    const item = {
      id: "CT-02",
      layer: "Content",
      title: "canonical",
      why: "Need canonical. One link.",
      fw: ["Playwright"],
      path: "/about",
      check: { kind: "count", path: "/about", selector: 'link[rel="canonical"]', op: "eq", n: 1 }
    };
    const pages = [{ path: "/", status: 200, html: "", depth: 0 }];
    assert.equal(verified.verify(report({ cases: [item] }), { pages }), null);
  });

  test("manual and load cases stay without a badge", () => {
    const pages = [{ path: "/", status: 200, html: "<html></html>", depth: 0 }];
    assert.equal(verified.verify(report({
      cases: [{ id: "AN-01", layer: "Analytics", title: "x", why: "y. z.", fw: ["Playwright"] }]
    }), { pages }), null);
    assert.equal(verified.verify(report({
      cases: [{ id: "LD-01", layer: "Load", title: "x", why: "y. z.", fw: ["JMeter", "Playwright"], check: { kind: "load", path: "/", profile: "baseline" } }]
    }), { pages }), null);
  });

  test("applyToReport sets verifiedPass and never throws into Jarvis", () => {
    const row = report({
      statement: "These cases are proposed from a public analysis. None of them were executed."
    });
    const pages = [{ path: "/", status: 200, html: "<html><body></body></html>", depth: 0 }];
    const out = verified.applyToReport(row, pages, { now: Date.parse("2026-11-16T12:00:00Z") });
    assert.equal(out.exitCode, 0);
    assert.equal(row.verifiedPass.caseId, "SEC-03");
    assert.equal(row.cases[0].verifiedPassing, true);
    assert.match(row.statement, /sample Playwright case was verified against the crawled DOM/);
  });

  test("Playwright snippet header carries the verified line for that case", () => {
    const row = report({
      verifiedPass: { caseId: "SEC-03", framework: "Playwright", at: "2026-11-16T12:00:00.000Z", via: "crawl-dom", exitCode: 0 }
    });
    const snippet = scripts.snippets(row, row.cases[0], ["Playwright"])[0];
    assert.match(snippet.code, /Verified passing: Playwright sample exited 0 against crawled DOM on 2026-11-16/);
    const other = scripts.snippets(row, Object.assign({}, row.cases[0], { id: "SEC-02" }), ["Playwright"])[0];
    assert.doesNotMatch(other.code, /Verified passing:/);
  });

  test("Playwright suite header uses the verified line when the report carries it", () => {
    const row = report({
      verifiedPass: { caseId: "SEC-03", framework: "Playwright", at: "2026-11-16T12:00:00.000Z", via: "crawl-dom", exitCode: 0 }
    });
    const file = scripts.bundle(row, row.cases, ["Playwright"]).files.find((f) => f.path === "playwright/qa-lab.spec.ts");
    assert.match(file.content, /Verified passing: Playwright sample exited 0 against crawled DOM on 2026-11-16/);
    assert.doesNotMatch(file.content, /Proposed from a public analysis\. Review selectors/);
  });
});
