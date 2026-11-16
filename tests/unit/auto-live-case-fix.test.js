const test = require("node:test");
const assert = require("node:assert/strict");
const publish = require("../../functions/url-review-publish");
const { copyFor, playwrightCarouselLines } = require("../../scripts/auto-live-reports");

test("publicReport keeps slim cases for top fail/risk findings (#3550)", () => {
  const report = {
    id: "r1",
    host: "example.com",
    finalUrl: "https://example.com/",
    cases: [
      { id: "A11Y-01", title: "Buttons have names", why: "Icon buttons need names.", path: "/", layer: "Accessibility", fw: ["Playwright"], secret: true },
      { id: "SEO-01", title: "Title present", why: "ok", path: "/", layer: "SEO", fw: ["Playwright"] }
    ],
    insights: {
      score: { overall: 50, areas: {} },
      findings: [
        { key: "a11y-name", verdict: "fail", area: "Accessibility", severity: "high", rank: 1, title: "Buttons lack names", cases: ["A11Y-01"], evidence: "e", fix: "f" },
        { key: "seo-title", verdict: "pass", area: "SEO", severity: "info", rank: 2, title: "Title ok", cases: ["SEO-01"] }
      ]
    }
  };
  const out = publish.publicReport(report);
  assert.deepEqual(out.insights.findings[0].cases, ["A11Y-01"]);
  assert.equal(out.cases.length, 1);
  assert.equal(out.cases[0].id, "A11Y-01");
  assert.equal(out.cases[0].secret, undefined);
});

test("copyFor prefers case id + Playwright lines when the publishable case is present (#3550)", () => {
  const report = {
    host: "example.com",
    finalUrl: "https://example.com/",
    cases: [{ id: "FN-05", title: "Buttons on example.com have an accessible name", why: "12 buttons were counted. Empty buttons would fail.", path: "/", layer: "Functional", fw: ["Playwright", "Cypress"] }],
    insights: {
      score: { overall: 53, areas: { SEO: { score: 53 }, Accessibility: { score: 14 } } },
      findings: [
        { key: "a11y-name", verdict: "fail", area: "Accessibility", rank: 1, title: "Buttons lack discernible names", cases: ["FN-05"], fix: "Add aria-label text." },
        { key: "sec-hsts", verdict: "pass", area: "Security", rank: 2, title: "HSTS is set" }
      ]
    }
  };
  const copy = copyFor(report, []);
  assert.equal(copy.caseId, "FN-05");
  assert.match(copy.fixLines[0], /FN-05/);
});

test("playwrightCarouselLines keeps a short case header when code has no expect lines", () => {
  const lines = playwrightCarouselLines("SEC-02", "import { test } from '@playwright/test';\ntest('x', async () => {});", { title: "HSTS" });
  assert.match(lines[0], /^\/\/ SEC-02/);
  assert.ok(lines.length >= 2);
});
