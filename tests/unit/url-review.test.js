/**
 * Offline checks for the URL review: scoring, journeys, pricing, address guards,
 * and the automation scripts written for every framework.
 *
 *   npm run test:review
 *
 * Fixtures are trimmed reports from real reads (scripts/review-snapshot.js).
 */
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { stripTypeScriptTypes } = require("node:module");

const core = require("../../functions/url-review-core");
const insights = require("../../functions/url-review-insights");
const scripts = require("../../js/qa-review-scripts.js");

const FIXTURES = ["wordpress", "excalidraw"].map((name) => ({
  name,
  report: JSON.parse(fs.readFileSync(path.join(__dirname, "fixtures", "review-" + name + ".json"), "utf8"))
}));

const URL_ = "https://shop.example.com/";
const HTML = "<!doctype html><html lang=\"en\"><head><title>Example shop for garden tools</title>" +
  "<meta name=\"description\" content=\"Garden tools shipped across Europe, with a two year guarantee and free returns.\">" +
  "<link rel=\"canonical\" href=\"https://shop.example.com/\"><meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">" +
  "</head><body><main><h1>Garden tools</h1><img src=\"a.png\"><a href=\"/about\">About</a></main></body></html>";
const STRONG_HEADERS = {
  "content-type": "text/html",
  "strict-transport-security": "max-age=63072000; includeSubDomains",
  "content-security-policy": "default-src 'self'; frame-ancestors 'none'",
  "x-content-type-options": "nosniff",
  "referrer-policy": "strict-origin-when-cross-origin",
  "permissions-policy": "camera=()"
};

function analyzeOne(headers, robotsText) {
  const page = { url: URL_, path: "/", status: 200, ms: 120, depth: 0, inspect: core.analyzeHtml(HTML, headers, URL_) };
  return insights.analyze({ pages: [page], robotsText: robotsText || "" });
}

function verdict(result, key) {
  const found = result.findings.find((item) => item.key === key);
  return found ? found.verdict : "missing";
}

test.describe("scoring", () => {
  test("every area is scored from 0 to 100", () => {
    const result = analyzeOne(STRONG_HEADERS);
    assert.deepEqual(Object.keys(result.score.areas).sort(), insights.AREAS.slice().sort());
    Object.values(result.score.areas).forEach((area) => {
      assert.ok(area.score >= 0 && area.score <= 100, JSON.stringify(area));
    });
    assert.ok(result.score.overall >= 0 && result.score.overall <= 100);
  });

  test("strong security headers pass and missing ones fail or warn", () => {
    const strong = analyzeOne(STRONG_HEADERS);
    const bare = analyzeOne({ "content-type": "text/html" });
    assert.equal(verdict(strong, "sec-hsts"), "pass");
    assert.equal(verdict(strong, "sec-frame"), "pass");
    assert.equal(verdict(bare, "sec-hsts"), "fail");
    ["sec-frame", "sec-nosniff", "sec-referrer", "sec-permissions"].forEach((key) => assert.equal(verdict(bare, key), "risk", key));
    assert.ok(bare.score.areas.Security.score < strong.score.areas.Security.score);
  });

  test("a robots.txt that shuts out an AI answer crawler fails the GEO crawler check", () => {
    assert.equal(verdict(analyzeOne(STRONG_HEADERS, ""), "geo-crawlers"), "pass");
    assert.equal(verdict(analyzeOne(STRONG_HEADERS, "User-agent: OAI-SearchBot\nDisallow: /\n"), "geo-crawlers"), "fail");
  });

  test("an image without alt text is flagged", () => {
    assert.equal(verdict(analyzeOne(STRONG_HEADERS), "a11y-alt"), "risk");
  });

  test("a decorative image with an empty alt counts as having one", () => {
    const html = "<main><img src=\"a.png\" alt=\"\"><img src=\"b.png\" alt=\"Logo\"><img src=\"c.png\"><img src=\"d.png\" data-alt=\"x\"></main>";
    const face = core.analyzeHtml(html, STRONG_HEADERS, URL_);
    assert.equal(face.images, 4);
    assert.equal(face.missingAlt, 2);
  });

  test("role=\"main\" counts as a main landmark", () => {
    assert.equal(core.analyzeHtml("<div role=\"main\">x</div>", STRONG_HEADERS, URL_).signals.main, true);
    assert.equal(core.analyzeHtml("<div>x</div>", STRONG_HEADERS, URL_).signals.main, false);
  });

  test("a linked page that timed out needs a person and is not scored as broken", () => {
    const inspect = core.analyzeHtml(HTML, STRONG_HEADERS, URL_);
    const home = { url: URL_, path: "/", status: 200, ms: 120, depth: 0, inspect };
    const slow = { url: URL_ + "slow", path: "/slow", status: 0, error: "The page took too long.", depth: 1 };
    const gone = { url: URL_ + "gone", path: "/gone", status: 404, ms: 80, depth: 1 };
    const timedOut = insights.analyze({ pages: [home, slow] });
    assert.equal(verdict(timedOut, "seo-unanswered-links"), "person");
    assert.equal(verdict(timedOut, "seo-broken-links"), "missing");
    assert.equal(timedOut.score.areas.SEO.score, analyzeOne(STRONG_HEADERS).score.areas.SEO.score);
    assert.equal(verdict(insights.analyze({ pages: [home, gone] }), "seo-broken-links"), "fail");
  });

  test("a partly read sitemap does not report pages as missing from it", () => {
    const inspect = core.analyzeHtml(HTML, STRONG_HEADERS, URL_);
    const pages = [{ url: URL_, path: "/", status: 200, ms: 120, depth: 0, inspect }];
    const sitemap = { source: URL_ + "sitemap.xml", status: 200, urls: [URL_ + "other"] };
    const full = insights.analyze({ pages, extras: { sitemap } });
    const partial = insights.analyze({ pages, extras: { sitemap: Object.assign({ partial: true }, sitemap) } });
    assert.equal(verdict(full, "seo-sitemap-missing-pages"), "risk");
    assert.equal(verdict(partial, "seo-sitemap-missing-pages"), "missing");
    assert.equal(verdict(partial, "seo-sitemap"), "pass");
  });

  test("a compressed response is read as HTML even when it was not asked for", () => {
    const zlib = require("node:zlib");
    const html = Buffer.from(HTML);
    assert.equal(core.decodeBody(zlib.gzipSync(html), "gzip"), HTML);
    assert.equal(core.decodeBody(zlib.brotliCompressSync(html), "br"), HTML);
    assert.equal(core.decodeBody(html, undefined), HTML);
    const cut = zlib.gzipSync(Buffer.from(HTML.repeat(40)));
    assert.ok(core.decodeBody(cut.subarray(0, Math.floor(cut.length / 2)), "gzip").startsWith("<!doctype html>"));
  });

  test("the same read scores the same way twice", () => {
    assert.deepEqual(analyzeOne(STRONG_HEADERS).score, analyzeOne(STRONG_HEADERS).score);
  });
});

test.describe("journeys", () => {
  const pages = [
    { path: "/", status: 200 },
    { path: "/sport", status: 200, inspect: { h1: ["Sport"] } },
    { path: "/broken", status: 500 }
  ];

  test("keep lasting navigation and drop placeholders, anchors, dated stories, and broken targets", () => {
    const nav = [
      { text: "Sport", target: "/sport", selector: "a[href=\"/sport\"]", where: "navigation" },
      { text: "…… comments", target: "/world/story", selector: "a[href=\"/world/story#comments\"]", where: "main" },
      { text: "Read more about it", target: "/world/2026/oct/19/story", selector: "a[href=\"/world/2026/oct/19/story\"]", where: "main" },
      { text: "Archive", target: "/2026-10-19/archive", selector: "a[href=\"/2026-10-19/archive\"]", where: "main" },
      { text: "12", target: "/page/12", selector: "a[href=\"/page/12\"]", where: "main" },
      { text: "Broken", target: "/broken", selector: "a[href=\"/broken\"]", where: "navigation" }
    ];
    const steps = core.journeys(pages, { nav });
    assert.deepEqual(steps.map((step) => step.target), ["/sport"]);
    assert.equal(steps[0].h1, "Sport");
  });

  test("propose at most four", () => {
    const nav = ["a", "b", "c", "d", "e", "f"].map((name) => ({ text: "Section " + name, target: "/" + name, selector: "#" + name, where: "navigation" }));
    assert.equal(core.journeys(pages, { nav }).length, 4);
  });
});

test.describe("pricing", () => {
  test("the first framework is 19 USD and later ones step down in pairs", () => {
    assert.deepEqual([1, 2, 3, 4, 5, 6, 7].map(core.centsForIndex), [1900, 1710, 1710, 1615, 1615, 1520, 1520]);
    assert.equal(core.scheduleCents(3), 1900 + 1710 + 1710);
  });

  test("the discount stops at 40 percent", () => {
    assert.equal(core.centsForIndex(14), 1140);
    assert.equal(core.centsForIndex(40), 1140);
  });
});

test.describe("address guards", () => {
  test("private, loopback, link-local, and carrier addresses are refused", () => {
    ["10.0.0.1", "127.0.0.1", "169.254.169.254", "192.168.1.1", "100.64.0.1", "::1", "fd00::1"].forEach((ip) => assert.equal(core.ipBlocked(ip), true, ip));
    assert.equal(core.ipBlocked("8.8.8.8"), false);
  });

  test("internal host names are refused", () => {
    ["localhost", "metadata.google.internal", "printer.local"].forEach((host) => assert.equal(core.hostBlocked(host), true, host));
    assert.equal(core.hostBlocked("example.com"), false);
  });

  test("the mailbox must share the site's registrable domain", () => {
    assert.equal(core.mailboxMatchesHost("qa@shop.example.co.uk", "www.shop.example.co.uk"), true);
    assert.equal(core.mailboxMatchesHost("someone@gmail.com", "example.com"), false);
  });
});

function syntaxError(file, content, dir) {
  const target = path.join(dir, file.replace(/\.ts$/, ".mjs"));
  fs.mkdirSync(path.dirname(target), { recursive: true });
  if (/\.json$/.test(file)) {
    try { JSON.parse(content); return ""; } catch (error) { return error.message; }
  }
  let source = content;
  if (/\.ts$/.test(file)) {
    try { source = stripTypeScriptTypes(content); } catch (error) { return error.message; }
  }
  fs.writeFileSync(target, source);
  let run = null;
  if (/\.m?js$/.test(target)) run = spawnSync(process.execPath, ["--check", target]);
  else if (/\.py$/.test(target)) run = spawnSync("python3", ["-m", "py_compile", target]);
  if (!run || run.error) return "";
  return run.status === 0 ? "" : String(run.stderr).split("\n").slice(0, 3).join(" ");
}

FIXTURES.forEach(({ name, report }) => {
  test.describe("automation scripts for " + name, () => {
    const { files } = scripts.bundle(report, report.cases, core.FRAMEWORKS);
    const byPath = new Map(files.map((file) => [file.path, file.content]));

    test("every framework gets a suite and nothing is empty", () => {
      ["playwright/", "cypress/", "robot/", "selenium/", "webdriverio/", "codeceptjs/", "selenide/", "testng/", "watir/",
        "cucumber/", "behave/", "reqnroll/", "jest/", "vitest/", "mocha/"].forEach((prefix) => {
        assert.ok(files.some((file) => file.path.startsWith(prefix)), prefix + " is missing");
      });
      assert.ok(byPath.has(".github/workflows/qa-lab.yml"));
      files.forEach((file) => assert.ok(file.content && file.content.trim(), file.path + " is empty"));
    });

    test("JavaScript, TypeScript, Python, and JSON files parse", () => {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), "qa-review-scripts-"));
      try {
        const broken = files
          .filter((file) => /\.(m?js|ts|py|json)$/.test(file.path))
          .map((file) => ({ file: file.path, error: syntaxError(file.path, file.content, dir) }))
          .filter((row) => row.error);
        assert.deepEqual(broken, []);
      } finally {
        fs.rmSync(dir, { recursive: true, force: true });
      }
    });

    test("every Cucumber step has a step definition", () => {
      const feature = byPath.get("cucumber/features/qa-lab.feature");
      const steps = byPath.get("cucumber/features/step_definitions/qa_lab.steps.js");
      const patterns = [...steps.matchAll(/(?:Given|When|Then)\(\/(.+?)\/,/g)].map((match) => new RegExp(match[1]));
      assert.ok(patterns.length > 0);
      const lines = feature.split("\n").map((line) => line.trim()).filter((line) => /^(Given|When|Then|And|But) /.test(line)).map((line) => line.replace(/^\S+ /, ""));
      const unmatched = [...new Set(lines.filter((line) => !patterns.some((pattern) => pattern.test(line))))];
      assert.deepEqual(unmatched, []);
    });

    test("the three Gherkin frameworks share one feature file", () => {
      const feature = byPath.get("cucumber/features/qa-lab.feature");
      assert.equal(byPath.get("behave/features/qa_lab.feature"), feature);
      assert.equal(byPath.get("reqnroll/Features/QaLab.feature"), feature);
    });

    test("scripts stay on the reviewed host", () => {
      const playwright = byPath.get("playwright/qa-lab.spec.ts");
      assert.ok(playwright.includes(`const HOST = "${report.host}"`));
    });
  });
});
