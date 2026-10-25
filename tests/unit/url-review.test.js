/**
 * Offline checks for the URL review: scoring, journeys, pricing, address guards,
 * and the automation scripts written for every framework.
 *
 *   npm run test:review
 *
 * Fixtures are trimmed reports from real reviews (scripts/review-snapshot.js).
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

  test("Cross-Origin-Opener-Policy passes when it keeps other windows out", () => {
    const find = (headers) => analyzeOne(Object.assign({}, STRONG_HEADERS, headers)).findings.find((item) => item.key === "sec-coop");
    assert.equal(find({}).verdict, "risk");
    assert.equal(find({}).title, "Cross-Origin-Opener-Policy is not sent");
    assert.equal(find({ "cross-origin-opener-policy": "unsafe-none" }).title, "Cross-Origin-Opener-Policy is unsafe-none");
    assert.equal(find({ "cross-origin-opener-policy": "same-origin-allow-popups" }).verdict, "pass");
    assert.equal(find({ "cross-origin-opener-policy": "same-origin; report-to=\"coop\"" }).verdict, "pass");
    const kit = analyzeOne(STRONG_HEADERS).fixkit.headers.find((row) => row.name === "Cross-Origin-Opener-Policy");
    assert.equal(kit.missing, true);
  });

  test("COEP without COOP same-origin fails isolation, and no COEP is only informational", () => {
    const find = (headers) => analyzeOne(Object.assign({}, STRONG_HEADERS, headers)).findings.find((item) => item.key === "sec-isolation");
    const none = find({});
    assert.deepEqual([none.verdict, none.severity, none.title], ["pass", "info", "Cross-origin isolation is not requested"]);
    const half = find({ "cross-origin-embedder-policy": "require-corp", "cross-origin-opener-policy": "same-origin-allow-popups" });
    assert.deepEqual([half.verdict, half.severity], ["fail", "medium"]);
    assert.match(half.evidence, /^COOP: same-origin-allow-popups\. COEP: require-corp\. CORP: absent\./);
    assert.equal(find({ "cross-origin-embedder-policy": "credentialless", "cross-origin-opener-policy": "same-origin" }).title, "The page is cross-origin isolated");
  });

  test("the back/forward cache check counts only blockers on the page's side", () => {
    const run = (backForward) => {
      const page = { url: URL_, path: "/", status: 200, ms: 120, depth: 0, inspect: core.analyzeHtml(HTML, STRONG_HEADERS, URL_) };
      return insights.analyze({ pages: [page], robotsText: "", browser: { ok: true, backForward } }).findings.find((item) => item.key === "pf-bfcache");
    };
    const shell = [{ reason: "BrowsingInstanceNotSwapped", type: "Circumstantial" }, { reason: "BackForwardCacheDisabledForDelegate", type: "Circumstantial" }];
    assert.equal(run({ ran: true, restored: false, isolated: false, reasons: shell }).verdict, "pass");
    const blocked = run({ ran: true, restored: false, isolated: false, reasons: shell.concat([{ reason: "UnloadHandlerExistsInMainFrame", type: "PageSupportNeeded" }, { reason: "SharedWorkerMessage", type: "PageSupportNeeded" }]) });
    assert.deepEqual([blocked.verdict, blocked.severity], ["risk", "low"]);
    assert.match(blocked.evidence, /an unload listener on the page, shared worker message\./);
    assert.match(blocked.fix, /^Listen for pagehide instead of unload\. /);
    assert.equal(run({ ran: false, error: "timed out" }), undefined);
  });

  test("images: oversized, old formats and lazy loading are scored from the browsed pages", () => {
    const run = (start, pages) => {
      const page = { url: URL_, path: "/", status: 200, ms: 120, depth: 0, inspect: core.analyzeHtml(HTML, STRONG_HEADERS, URL_) };
      const findings = insights.analyze({ pages: [page], robotsText: "", browser: { ok: true, start: Object.assign({ finalPath: "/" }, start), pages: pages || [] } }).findings;
      return (key) => findings.find((item) => item.key === key);
    };
    const img = (over) => Object.assign({ src: "https://cdn.example.com/a/hero.jpg", nw: 400, nh: 300, w: 400, h: 300, top: 0, fold: 800, lazy: false, bytes: 40960, mime: "image/webp", lcp: false }, over);
    assert.equal(run({})("pf-img-size"), undefined);
    const clean = run({ images: [img()] });
    ["pf-img-size", "pf-img-format", "pf-img-lazy"].forEach((key) => assert.equal(clean(key).verdict, "pass", key));
    const big = run({ images: [img({ nw: 2400, nh: 1800, bytes: 409600, mime: "image/jpeg" })] }, [{ path: "/about", images: [img({ nw: 2400, nh: 1800, bytes: 409600, mime: "image/jpeg" })] }]);
    assert.deepEqual([big("pf-img-size").verdict, big("pf-img-size").severity], ["risk", "low"]);
    assert.match(big("pf-img-size").evidence, /^hero\.jpg on \/ \(2400×1800 shown at 400×300, 400 KB, about 356 KB to save\)\./);
    assert.deepEqual(big("pf-img-size").pages, ["/", "/about"]);
    assert.match(big("pf-img-format").evidence, /^hero\.jpg on \/ \(JPEG, 400 KB\)\. WebP is about 30% smaller at the same quality, so about 120 KB could be saved\./);
    const heavy = run({ images: [1, 2, 3].map((n) => img({ src: "https://cdn.example.com/" + n + ".png", nw: 4000, nh: 3000, bytes: 1048576, mime: "image/png" })) });
    assert.equal(heavy("pf-img-size").severity, "medium");
    assert.equal(heavy("pf-img-format").severity, "medium");
    const lazyHero = run({ images: [img({ lcp: true, lazy: true })] });
    assert.deepEqual([lazyHero("pf-img-lazy").verdict, lazyHero("pf-img-lazy").severity, lazyHero("pf-img-lazy").title], ["risk", "medium", "The main image waits for lazy loading"]);
    const eager = run({ images: [1, 2, 3, 4].map((n) => img({ src: "https://cdn.example.com/" + n + ".webp", top: 900 + n * 300 })) });
    assert.deepEqual([eager("pf-img-lazy").severity, eager("pf-img-lazy").title], ["low", "4 images below the first screen load straight away"]);
    assert.match(run({ images: [img({ top: 1200 })] })("pf-img-lazy").evidence, /^1 image below the first screen loads straight away, within the limit of 3\./);
    assert.match(run({ images: [img({ src: "https://cdn.example.com/Ben%20Smith.jpg", bytes: 40960, mime: "image/jpeg" })] })("pf-img-format").evidence, /^Ben Smith\.jpg on \//);
  });

  test("imageRows keeps only the images a check can use", () => {
    const { imageRows } = require("../../functions/url-review-browser");
    const log = new Map([["https://x.test/big.jpg", { bytes: 50000, mime: "image/jpeg" }], ["https://x.test/small.png", { bytes: 2000, mime: "image/png" }]]);
    const rows = imageRows([
      { src: "https://x.test/big.jpg", nw: 10, nh: 10, w: 10, h: 10, top: 0, fold: 800, lazy: false },
      { src: "https://x.test/small.png", nw: 10, nh: 10, w: 10, h: 10, top: 0, fold: 800, lazy: false },
      { src: "https://x.test/below.png", nw: 10, nh: 10, w: 10, h: 10, top: 1200, fold: 800, lazy: false },
      { src: "https://x.test/hero.avif", nw: 10, nh: 10, w: 10, h: 10, top: 0, fold: 800, lazy: true }
    ], log, "https://x.test/hero.avif");
    assert.deepEqual(rows.map((row) => row.src.split("/").pop()), ["big.jpg", "below.png", "hero.avif"]);
    assert.equal(rows[0].mime, "image/jpeg");
    assert.equal(rows[2].lcp, true);
  });

  test("external links are collected from the HTML and classified by their answer", () => {
    const html = "<a href=\"https://other.org/a#x\">a</a><a href=\"http://plain.net/\">b</a><a href=\"/about\">c</a><a href=\"https://shop.example.com/x\">d</a><a href=\"mailto:a@b.c\">e</a><a href=\"https://localhost/\">f</a>";
    assert.deepEqual(core.analyzeHtml(html, { "content-type": "text/html" }, URL_).outbound, ["https://other.org/a", "http://plain.net/"]);
    assert.equal(core.siteKey("consent.youtube.com"), core.siteKey("www.youtube.com"));
    assert.equal(core.siteKey("www.shop.example.co.uk"), "example.co.uk");
    const kind = (url, row) => core.outboundKind(url, row);
    assert.equal(kind("https://a.org/x", { status: 200, final: "https://www.a.org/x/" }), "ok");
    assert.equal(kind("https://youtube.com/watch?v=1", { status: 200, final: "https://consent.youtube.com/m?continue=1" }), "ok");
    assert.equal(kind("https://bit.ly/abc", { status: 200, final: "https://elsewhere.com/page" }), "ok");
    assert.equal(kind("https://a.org/old", { status: 200, final: "https://a.org/" }), "moved");
    assert.equal(kind("https://a.org/x", { status: 200, final: "https://parked.example/" }), "moved");
    assert.equal(kind("https://a.org/x", { status: 404, final: "https://a.org/x" }), "broken");
    assert.equal(kind("https://a.org/x", { error: "a host name that does not resolve" }), "broken");
    assert.equal(kind("https://linkedin.com/in/x", { status: 999, final: "https://linkedin.com/in/x" }), "blocked");
  });

  test("external link findings: broken is a medium risk, blocked is not scored, http links are listed", () => {
    const page = { url: URL_, path: "/", status: 200, ms: 120, depth: 0, inspect: core.analyzeHtml(HTML, STRONG_HEADERS, URL_) };
    const run = (outbound) => {
      const findings = insights.analyze({ pages: [page], robotsText: "", extras: { outbound } }).findings;
      return (key) => findings.find((item) => item.key === key);
    };
    assert.equal(run(null)("seo-external-links"), undefined);
    const clean = run({ found: 3, checked: 3, ok: 3, rows: [], http: [], httpCount: 0 });
    assert.equal(clean("seo-external-links").verdict, "pass");
    assert.equal(clean("seo-external-http"), undefined);
    const bad = run({ found: 50, checked: 40, ok: 36, httpCount: 1, http: [{ url: "http://plain.net/", from: ["/"] }], rows: [
      { url: "https://gone.org/x", status: 404, kind: "broken", from: ["/", "/about"] },
      { url: "https://dead.example/", error: "a host name that does not resolve", kind: "broken", from: ["/"] },
      { url: "https://a.org/old", status: 200, final: "https://a.org/", kind: "moved", from: ["/"] },
      { url: "https://linkedin.com/in/x", status: 999, kind: "blocked", from: ["/"] }
    ] });
    assert.deepEqual([bad("seo-external-links").verdict, bad("seo-external-links").severity], ["risk", "medium"]);
    assert.match(bad("seo-external-links").evidence, /^https:\/\/gone\.org\/x answered 404, linked from \/, \/about\. https:\/\/dead\.example\/ gave a host name that does not resolve, linked from \/\. 40 external addresses were checked of 50 found\.$/);
    assert.deepEqual(bad("seo-external-links").pages, ["/", "/about"]);
    assert.deepEqual([bad("seo-external-moved").verdict, bad("seo-external-moved").severity], ["risk", "low"]);
    assert.equal(bad("seo-external-blocked").verdict, "person");
    assert.deepEqual([bad("seo-external-http").verdict, bad("seo-external-http").title], ["risk", "1 external link uses plain http"]);
  });

  test("CrUX history keeps weekly p75 series and turns missing weeks into null", () => {
    const at = (day) => ({ year: 2026, month: day < 100 ? 5 : 10, day: day % 100 });
    const data = { record: { collectionPeriods: [{ firstDate: at(1), lastDate: at(2) }, { firstDate: at(1), lastDate: at(117) }], metrics: {
      largest_contentful_paint: { percentilesTimeseries: { p75s: [1198, null] } },
      cumulative_layout_shift: { percentilesTimeseries: { p75s: ["0.05", "NaN"] } },
      interaction_to_next_paint: { percentilesTimeseries: { p75s: [null, null] } }
    } } };
    assert.deepEqual(core.summarizeCruxHistory(data, "origin"), { scope: "origin", weeks: 2, from: "2026-05-02", to: "2026-10-17", lcp: [1198, null], cls: [0.05, null] });
    assert.equal(core.summarizeCruxHistory({ record: { metrics: {} } }, "page"), null);
  });

  test("CrUX trend: a band drop or a 25% slip outside good is a risk, ending in poor is high, gains are a pass note", () => {
    const page = { url: URL_, path: "/", status: 200, ms: 120, depth: 0, inspect: core.analyzeHtml(HTML, STRONG_HEADERS, URL_) };
    const run = (crux) => {
      const findings = insights.analyze({ pages: [page], robotsText: "", extras: {}, crux }).findings;
      return (key) => findings.find((item) => item.key === key);
    };
    const series = (start, end) => Array.from({ length: 25 }, (_, i) => start + ((end - start) * i) / 24);
    const history = (scope, metrics) => Object.assign({ scope, weeks: 25, from: "2026-05-02", to: "2026-10-17" }, metrics);
    assert.equal(run(null)("pf-trend"), undefined);
    assert.equal(run({ ok: true, phone: history("page", { lcp: [1200, 1300, null] }) })("pf-trend"), undefined);

    const steady = run({ ok: true, phone: history("page", { lcp: series(1200, 1300), inp: series(90, 100), cls: series(0, 0) }) });
    assert.equal(steady("pf-trend").verdict, "pass");
    assert.match(steady("pf-trend").evidence, /from May 2, 2026 to Oct 17, 2026\. Largest Contentful Paint on phones on this page: 1\.2 s to 1\.3 s \(good\) [▁▂▃]+\./);
    assert.equal(steady("pf-trend-better"), undefined);

    const slipped = run({ ok: true, phone: history("origin", { lcp: series(2000, 3200) }), desktop: history("page", { inp: series(220, 300) }) });
    assert.deepEqual([slipped("pf-trend").verdict, slipped("pf-trend").severity, slipped("pf-trend").count], ["risk", "medium", 2]);
    assert.equal(slipped("pf-trend").title, "2 Core Web Vitals got worse for real visitors over six months");
    assert.match(slipped("pf-trend").evidence, /Largest Contentful Paint on phones across the whole site: 2\.1 s to 3\.1 s \(good to needs improvement\)/);
    assert.match(slipped("pf-trend").evidence, /Interaction to Next Paint on desktops on this page: 225 ms to 295 ms \(needs improvement\)/);
    assert.deepEqual(slipped("pf-trend").cases, ["PF-01", "PF-02"]);

    const poor = run({ ok: true, phone: history("page", { cls: series(0.2, 0.4), lcp: series(4000, 2000) }) });
    assert.deepEqual([poor("pf-trend").severity, poor("pf-trend").title], ["high", "Cumulative Layout Shift got worse for real phone visitors over six months"]);
    assert.deepEqual([poor("pf-trend-better").verdict, poor("pf-trend-better").title], ["pass", "Largest Contentful Paint got better for real phone visitors over six months"]);

    const small = run({ ok: true, desktop: history("page", { inp: series(300, 340) }) });
    assert.equal(small("pf-trend").verdict, "pass");
  });

  test("X-Frame-Options ALLOW-FROM without frame-ancestors leaves the page open to framing", () => {
    const result = analyzeOne({ "content-type": "text/html", "x-frame-options": "ALLOW-FROM https://www.gather.town" });
    const found = result.findings.find((item) => item.key === "sec-frame");
    assert.equal(found.verdict, "risk");
    assert.equal(found.title, "Other sites can frame the page");
    assert.match(found.evidence, /^X-Frame-Options: ALLOW-FROM https:\/\/www\.gather\.town was sent, but current browsers ignore ALLOW-FROM/);
    assert.match(found.fix, /frame-ancestors 'self' plus each origin allowed to frame the page/);
    assert.equal(result.security.headers.find((item) => item.label === "Frame protection").state, "risk");
    assert.equal(result.fixkit.headers.find((item) => item.name === "X-Frame-Options").missing, true);
  });

  test("X-Frame-Options ALLOW-FROM with frame-ancestors passes on frame-ancestors", () => {
    const result = analyzeOne({ "content-type": "text/html", "x-frame-options": "allow-from https://partner.example", "content-security-policy": "default-src 'self'; frame-ancestors 'self' https://partner.example" });
    const found = result.findings.find((item) => item.key === "sec-frame");
    assert.equal(found.verdict, "pass");
    assert.equal(found.evidence, "frame-ancestors 'self' https://partner.example. X-Frame-Options: allow-from https://partner.example was sent, but current browsers ignore ALLOW-FROM.");
    assert.equal(result.security.headers.find((item) => item.label === "Frame protection").state, "pass");
  });

  test("X-Frame-Options SAMEORIGIN still limits framing", () => {
    const result = analyzeOne({ "content-type": "text/html", "x-frame-options": "SAMEORIGIN" });
    assert.equal(result.findings.find((item) => item.key === "sec-frame").evidence, "X-Frame-Options: SAMEORIGIN.");
    assert.equal(result.fixkit.headers.find((item) => item.name === "X-Frame-Options").missing, false);
  });

  test("the SEC-04 script takes DENY, SAMEORIGIN or CSP frame-ancestors as the frame policy, not any X-Frame-Options value", () => {
    const check = scripts.checkFor({ id: "SEC-04", path: "/" }, { startPath: "/" });
    const rule = check.rules.find((item) => [].concat(item.name).indexOf("x-frame-options") !== -1);
    assert.deepEqual(rule.name, ["x-frame-options", "content-security-policy"]);
    const passes = (frame, csp) => new RegExp(rule.pattern, "i").test([frame, csp].join(" "));
    assert.ok(passes("SAMEORIGIN", ""));
    assert.ok(passes("deny", ""));
    assert.ok(passes("", "default-src 'self'; frame-ancestors 'self'"));
    assert.ok(!passes("ALLOW-FROM https://www.gather.town", ""));
    assert.ok(!passes("", "default-src 'self'"));
  });

  test("every framework's SEC-04 export reads both frame headers", () => {
    const report = JSON.parse(JSON.stringify(require("../../assets/qa-review-sample.json").report));
    const item = report.cases.find((row) => row.id === "SEC-04");
    const wanted = ["Playwright", "Cypress", "Selenium", "Robot", "WebdriverIO", "CodeceptJS", "Selenide", "TestNG", "Watir", "Cucumber", "Behave", "Reqnroll", "Jest", "Vitest", "Mocha"].filter((fw) => (item.fw || []).indexOf(fw) !== -1);
    assert.ok(wanted.length >= 10);
    scripts.snippets(report, item, wanted).forEach((out) => {
      assert.match(out.code, /x-frame-options/i, out.framework || out.label);
      assert.match(out.code, /content-security-policy/i, out.framework || out.label);
      assert.match(out.code, /frame-ancestors/, out.framework || out.label);
    });
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

  test("Drupal's EU Cookie Compliance and Klaro count as consent tools, and Siteimprove as analytics", () => {
    const gtm = "<script src=\"https://www.googletagmanager.com/gtm.js?id=GTM-M7H54VD\"></script>";
    const consentOf = (html) => core.analyzeHtml(gtm + html, STRONG_HEADERS, URL_).analytics.consent;
    const reviewOf = (html) => insights.analyze({ pages: [{ url: URL_, path: "/", status: 200, ms: 120, depth: 0, inspect: core.analyzeHtml(html, STRONG_HEADERS, URL_) }] });
    const gavi = "<script src=\"/modules/contrib/eu_cookie_compliance/js/eu_cookie_compliance.min.js?v=10\"></script>";
    const drupalSettings = "<script type=\"application/json\" data-drupal-selector=\"drupal-settings-json\">{\"eu_cookie_compliance\":{\"popup_html_info\":\"\\u003Cdiv class=\\u0022eu-cookie-compliance-banner\\u0022\\u003E\"}}</script>";
    const iucn = "<script src=\"/libraries/klaro/dist/klaro-no-translations-no-css.js?tn8y89\" defer id=\"klaro-js\"></script>";
    const wien = "<script src=\"https://siteimproveanalytics.com/js/siteanalyze_6002359.js\"></script>";
    assert.deepEqual(consentOf(gavi), ["EU Cookie Compliance"]);
    assert.deepEqual(consentOf(drupalSettings), ["EU Cookie Compliance"]);
    assert.deepEqual(consentOf("<div id=\"sliding-popup\" class=\"sliding-popup-bottom\"></div>"), ["EU Cookie Compliance"]);
    assert.deepEqual(consentOf(iucn), ["Klaro"]);
    assert.deepEqual(consentOf("<script src=\"/js/klaro.min.js\"></script>"), ["Klaro"]);
    assert.deepEqual(consentOf("<p>Klaro, we use cookies.</p>"), []);
    assert.equal(verdict(reviewOf(gtm), "an-consent"), "risk");
    [[gavi, "EU Cookie Compliance"], [iucn, "Klaro"]].forEach(([html, name]) => {
      const result = reviewOf(gtm + html);
      assert.equal(verdict(result, "an-consent"), "missing", name);
      assert.equal(result.findings.find((item) => item.key === "an-consent-mode").title, name + " is present but Google Consent Mode defaults were not found");
    });
    assert.deepEqual(core.analyzeHtml(wien, STRONG_HEADERS, URL_).analytics.tags, [{ name: "Siteimprove Analytics", ids: ["6002359"] }]);
    ["https://siteimproveanalytics.io/js/siteanalyze_66356571.js", "https://siteimprove.com/js/siteanalyze.js", "/assets/siteanalyze_6002359.js"].forEach((src) => {
      assert.deepEqual(core.analyzeHtml("<script src=\"" + src + "\"></script>", STRONG_HEADERS, URL_).analytics.tags.map((tag) => tag.name), ["Siteimprove Analytics"], src);
    });
    assert.equal(verdict(reviewOf(wien), "an-none"), "missing");
    assert.equal(verdict(reviewOf(wien), "an-inventory"), "pass");
    const browser = require("../../functions/url-review-browser");
    assert.equal(browser.vendorOf("siteimproveanalytics.com"), "Siteimprove Analytics");
    assert.equal(browser.vendorOf("global.siteimproveanalytics.io"), "Siteimprove Analytics");
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

  test("noindex pages a complete sitemap leaves out are private, and need no canonical", () => {
    const inspect = core.analyzeHtml(HTML, STRONG_HEADERS, URL_);
    const hidden = core.analyzeHtml("<!doctype html><html lang=\"en\"><head><title>Account</title><meta name=\"robots\" content=\"noindex, nofollow\"></head><body><h1>Account</h1></body></html>", STRONG_HEADERS, URL_ + "account");
    const pages = [{ url: URL_, path: "/", status: 200, ms: 120, depth: 0, inspect }, { url: URL_ + "account", path: "/account", status: 200, ms: 90, depth: 1, inspect: hidden }];
    const sitemap = { source: URL_ + "sitemap.xml", status: 200, urls: [URL_] };
    const kept = insights.analyze({ pages, extras: { sitemap } });
    assert.equal(verdict(kept, "seo-noindex"), "pass");
    assert.equal(verdict(kept, "seo-canonical-missing"), "missing");
    const listed = insights.analyze({ pages, extras: { sitemap: Object.assign({}, sitemap, { urls: [URL_, URL_ + "account"] }) } });
    assert.equal(verdict(listed, "seo-noindex"), "risk");
    assert.equal(verdict(insights.analyze({ pages, extras: { sitemap: Object.assign({ partial: true }, sitemap) } }), "seo-noindex"), "risk");
    assert.equal(verdict(insights.analyze({ pages }), "seo-noindex"), "risk");
  });

  test("Cloudflare's email protection links are read as mail, not as pages", () => {
    const html = HTML.replace("</body>", "<a href=\"/cdn-cgi/l/email-protection#95fef4f4fbf8e0f4e7d5f2f8f4fcf9bbf6faf8\">Mail</a>" +
      "<span class=\"__cf_email__\" data-cfemail=\"0a6e6f7c4a6f726b677a666f2465786d\">[email&#160;protected]</span></body>");
    const inspect = core.analyzeHtml(html, STRONG_HEADERS, URL_);
    assert.equal(inspect.links.some((href) => href.indexOf("/cdn-cgi/") !== -1), false);
    assert.deepEqual(inspect.mailtos.filter((m) => /kaanmuar|dev@/.test(m)), ["kaanmuar@gmail.com", "dev@example.org"]);
  });

  test("a self-updating tag host is not asked for an integrity hash", async () => {
    const tag = "<script async src=\"https://www.googletagmanager.com/gtag/js?id=G-1\"></script>";
    const run = async (head) => {
      const restore = fakeNetwork({ [URL_]: { status: 200, headers: STRONG_HEADERS, body: HTML.replace("</head>", head + "</head>") } });
      try { return (await core.reviewTarget(URL_, { browse: async () => ({ ok: false }) })).cases.find((item) => item.id === "SEC-14"); } finally { restore(); }
    };
    assert.equal(await run(tag), undefined);
    const mixed = await run(tag + "<script src=\"https://cdn.example.net/lib.js\"></script>");
    assert.match(mixed.why, /^Scripts from cdn\.example\.net load/);
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

// Answers requests from a route table instead of the network, for the readers that follow links.
function fakeNetwork(routes) {
  const { EventEmitter } = require("node:events");
  const dnsPromises = require("node:dns").promises;
  const libs = [require("node:http"), require("node:https")];
  const saved = { lookup: dnsPromises.lookup, requests: libs.map((lib) => lib.request) };
  dnsPromises.lookup = async () => [{ address: "93.184.216.34", family: 4 }];
  libs.forEach((lib) => {
    lib.request = (options, onResponse) => {
      const req = new EventEmitter();
      req.destroy = () => {};
      req.end = () => setImmediate(() => {
        const route = routes[options.protocol + "//" + options.hostname + options.path] || { status: 404 };
        // A route with timeout: true never ends; it sends its body, if any, then the socket times out.
        // With connecting: true as well, the host never accepted the TCP connection.
        if (route.connecting) req.socket = { connecting: true };
        if (route.timeout && !route.body) return req.emit("timeout");
        const res = new EventEmitter();
        Object.assign(res, { statusCode: route.status, headers: route.headers || {}, socket: null });
        onResponse(res);
        if (route.body) res.emit("data", Buffer.isBuffer(route.body) ? route.body : Buffer.from(route.body));
        if (route.timeout) req.emit("timeout");
        else res.emit("end");
      });
      return req;
    };
  });
  return () => {
    dnsPromises.lookup = saved.lookup;
    libs.forEach((lib, index) => { lib.request = saved.requests[index]; });
  };
}

function analyzeHtmlPages(rows, extras) {
  const pages = rows.map((row, index) => Object.assign({ path: new URL(row.url).pathname, status: 200, ms: 120, depth: index ? 1 : 0 }, row, {
    inspect: row.html == null ? null : core.analyzeHtml(row.html, row.headers || STRONG_HEADERS, row.url)
  }));
  return insights.analyze({ pages, extras: extras || {} });
}

test.describe("page paths for the URL Review box (#632)", () => {
  const zlib = require("node:zlib");
  const xml = (urls) => "<?xml version=\"1.0\"?><urlset>" + urls.map((url) => "<url><loc>" + url + "</loc></url>").join("") + "</urlset>";

  test("paths come from the robots.txt sitemap index and its .gz children, shallowest first", async () => {
    const restore = fakeNetwork({
      "https://shop.example.net/robots.txt": { status: 200, headers: { "content-type": "text/plain" }, body: "User-agent: *\nSitemap: https://shop.example.net/index.xml\n" },
      "https://shop.example.net/index.xml": { status: 200, headers: { "content-type": "application/xml" }, body: "<sitemapindex><sitemap><loc>https://shop.example.net/pages.xml.gz</loc></sitemap></sitemapindex>" },
      "https://shop.example.net/pages.xml.gz": { status: 200, headers: { "content-type": "application/x-gzip" }, body: zlib.gzipSync(Buffer.from(xml([
        "https://shop.example.net/",
        "https://shop.example.net/products/blue-mug",
        "https://www.shop.example.net/pricing",
        "https://shop.example.net/checkout",
        "https://shop.example.net/docs/guide.pdf",
        "https://cdn.example.net/elsewhere",
        "https://shop.example.net/caf%C3%A9",
        "https://shop.example.net/checkout"
      ]))) }
    });
    try {
      const result = await core.sitePaths("Shop.Example.net");
      assert.equal(result.host, "shop.example.net");
      assert.deepEqual(result.paths, ["/café", "/pricing", "/checkout", "/products/blue-mug"]);
    } finally {
      restore();
    }
  });

  test("a site without a sitemap gives no paths and no error, and the answer is kept per host", async () => {
    let restore = fakeNetwork({});
    try {
      assert.deepEqual((await core.sitePaths("bare.example.net")).paths, []);
    } finally {
      restore();
    }
    restore = fakeNetwork({ "https://kept.example.net/sitemap.xml": { status: 200, headers: { "content-type": "application/xml" }, body: xml(["https://kept.example.net/about"]) } });
    try {
      assert.deepEqual((await core.sitePaths("kept.example.net")).paths, ["/about"]);
    } finally {
      restore();
    }
    restore = fakeNetwork({});
    try {
      assert.deepEqual((await core.sitePaths("https://kept.example.net/anything")).paths, ["/about"]);
    } finally {
      restore();
    }
  });

  test("private, internal, and malformed hosts are refused before any request", async () => {
    for (const host of ["", "localhost", "printer.local", "metadata.google.internal", "10.0.0.1", "[::1]", "example", "exa mple.com"]) {
      await assert.rejects(core.sitePaths(host), (error) => error.code === "BAD_HOST", host);
    }
  });

  test("paths are capped and sorted by depth, then length", () => {
    const urls = Array.from({ length: 400 }, (_, i) => "https://a.example.net/" + (i % 2 ? "deep/" : "") + "p" + i);
    const paths = core.sitemapPaths(urls, "a.example.net");
    assert.equal(paths.length, 300);
    assert.equal(paths[0], "/p0");
    assert.ok(paths.slice(0, 200).every((path) => !path.startsWith("/deep/")));
  });

  test("code paths like /1a come after readable ones, so a brand sitemap of codes does not crowd them out", () => {
    const codes = Array.from({ length: 400 }, (_, i) => "https://www.shop.example/" + i.toString(36));
    const words = ["/mercado/frutas", "/ofertas", "/niños", "/1800", "/a-1-"].map((path) => "https://www.shop.example" + path);
    const paths = core.sitemapPaths(codes.concat(words), "shop.example");
    assert.deepEqual(paths.slice(0, 3), ["/niños", "/ofertas", "/mercado/frutas"]);
    assert.equal(paths[3], "/0");
  });
});

test.describe("false positives from the real-run series", () => {
  const zlib = require("node:zlib");

  test("a sitemap index whose children are .gz files is decompressed and read", async () => {
    const child = (name) => zlib.gzipSync(Buffer.from("<?xml version=\"1.0\"?><urlset><url><loc>https://docs.example.org/" + name + "/a</loc></url><url><loc>https://docs.example.org/" + name + "/b</loc></url></urlset>"));
    const restore = fakeNetwork({
      "https://docs.example.org/sitemap.xml": { status: 200, headers: { "content-type": "application/xml" }, body: "<sitemapindex><sitemap><loc>https://docs.example.org/sitemaps/en/sitemap.xml.gz</loc></sitemap><sitemap><loc>https://docs.example.org/sitemaps/es/sitemap.xml.gz</loc></sitemap></sitemapindex>" },
      "https://docs.example.org/sitemaps/en/sitemap.xml.gz": { status: 200, headers: { "content-type": "application/x-gzip" }, body: child("en") },
      "https://docs.example.org/sitemaps/es/sitemap.xml.gz": { status: 200, headers: { "content-type": "application/x-gzip" }, body: child("es") }
    });
    try {
      const sitemap = await core.readSitemap("https://docs.example.org", "Sitemap: https://docs.example.org/sitemap.xml\n", () => false);
      assert.deepEqual(sitemap.urls, ["https://docs.example.org/en/a", "https://docs.example.org/en/b", "https://docs.example.org/es/a", "https://docs.example.org/es/b"]);
    } finally {
      restore();
    }
  });

  test("every sitemap robots.txt lists is read, and the read is whole only when all of them answered", async () => {
    const map = (paths) => ({ status: 200, headers: { "content-type": "application/xml" }, body: "<urlset>" + paths.map((p) => "<url><loc>https://docs.example.org/" + p + "</loc></url>").join("") + "</urlset>" });
    const robots = "Sitemap: https://docs.example.org/sitemap.xml\nSitemap: https://docs.example.org/sitemap-social.xml\n";
    let restore = fakeNetwork({ "https://docs.example.org/sitemap.xml": map(["", "a"]), "https://docs.example.org/sitemap-social.xml": map(["a", "social"]) });
    try {
      const both = await core.readSitemap("https://docs.example.org", robots, () => false);
      assert.deepEqual(both.urls, ["https://docs.example.org/", "https://docs.example.org/a", "https://docs.example.org/social"]);
      assert.equal(both.partial, false);
      assert.equal(both.source, "https://docs.example.org/sitemap.xml");
    } finally {
      restore();
    }
    restore = fakeNetwork({ "https://docs.example.org/sitemap.xml": map(["a"]) });
    try {
      const one = await core.readSitemap("https://docs.example.org", robots, () => false);
      assert.deepEqual(one.urls, ["https://docs.example.org/a"]);
      assert.equal(one.partial, true);
    } finally {
      restore();
    }
  });

  test("a sitemap reached by a redirect from /sitemap.xml, or only at /sitemap-index.xml, is found", async () => {
    const urlset = (urls) => "<?xml version=\"1.0\"?><urlset>" + urls.map((url) => "<url><loc>" + url + "</loc></url>").join("") + "</urlset>";
    const xml = { "content-type": "text/xml; charset=UTF-8" };
    // fiscalia.gov.co: /sitemap.xml redirects to a Yoast /sitemap_index.xml, and robots.txt names no sitemap.
    let restore = fakeNetwork({
      "https://www.yoast.example.org/sitemap.xml": { status: 301, headers: { location: "https://www.yoast.example.org/sitemap_index.xml", "content-type": "text/html" } },
      "https://www.yoast.example.org/sitemap_index.xml": { status: 200, headers: xml, body: "<?xml version=\"1.0\"?><?xml-stylesheet type=\"text/xsl\" href=\"/main-sitemap.xsl\"?><sitemapindex><sitemap><loc>https://www.yoast.example.org/page-sitemap.xml</loc></sitemap></sitemapindex>" },
      "https://www.yoast.example.org/page-sitemap.xml": { status: 200, headers: xml, body: urlset(["https://www.yoast.example.org/", "https://www.yoast.example.org/contacto/"]) }
    });
    try {
      const map = await core.readSitemap("https://www.yoast.example.org", "User-agent: *\nDisallow:\n", () => false);
      assert.equal(map.source, "https://www.yoast.example.org/sitemap.xml");
      assert.deepEqual(map.urls, ["https://www.yoast.example.org/", "https://www.yoast.example.org/contacto/"]);
    } finally {
      restore();
    }
    // typescriptlang.org: robots.txt is 404, /sitemap.xml is 404, and /sitemap-index.xml is a valid index.
    restore = fakeNetwork({
      "https://www.ts.example.org/sitemap-index.xml": { status: 200, headers: { "content-type": "application/xml" }, body: "<?xml version=\"1.0\"?><sitemapindex><sitemap><loc>https://www.ts.example.org/sitemap-0.xml</loc></sitemap></sitemapindex>" },
      "https://www.ts.example.org/sitemap-0.xml": { status: 200, headers: { "content-type": "application/xml" }, body: urlset(["https://www.ts.example.org/docs/"]) }
    });
    try {
      const map = await core.readSitemap("https://www.ts.example.org", "", () => false);
      assert.equal(map.source, "https://www.ts.example.org/sitemap-index.xml");
      assert.deepEqual(map.urls, ["https://www.ts.example.org/docs/"]);
    } finally {
      restore();
    }
    // A sitemap named in robots.txt is trusted: the guessed index paths are not requested.
    const asked = [];
    restore = fakeNetwork({ "https://www.ts.example.org/sitemap-index.xml": { status: 200, headers: { "content-type": "application/xml" }, body: urlset(["https://www.ts.example.org/never"]) } });
    const https = require("node:https");
    const request = https.request;
    https.request = (options, onResponse) => { asked.push(options.path); return request(options, onResponse); };
    try {
      const map = await core.readSitemap("https://www.ts.example.org", "Sitemap: https://www.ts.example.org/maps/main.xml\n", () => false);
      assert.deepEqual(map.urls, []);
      assert.deepEqual(asked, ["/maps/main.xml", "/sitemap.xml"]);
    } finally {
      https.request = request;
      restore();
    }
    const missing = insights.analyze({ pages: [{ url: URL_, path: "/", status: 200, ms: 120, depth: 0, inspect: core.analyzeHtml(HTML, STRONG_HEADERS, URL_) }], extras: { sitemap: { status: 404, urls: [] } } });
    assert.equal(missing.findings.find((item) => item.key === "seo-sitemap").evidence, "robots.txt names no sitemap, and /sitemap.xml, /sitemap_index.xml and /sitemap-index.xml returned no URLs.");
  });

  test("gzip bytes without content-encoding decode, and an oversized archive keeps its start", () => {
    const xml = "<?xml version=\"1.0\"?><urlset>" + "<url><loc>https://docs.example.org/page</loc></url>".repeat(300000) + "</urlset>";
    assert.equal(core.decodeBody(zlib.gzipSync(Buffer.from("<urlset></urlset>")), undefined), "<urlset></urlset>");
    const big = core.decodeBody(zlib.gzipSync(Buffer.from(xml)), undefined);
    assert.ok(big.startsWith("<?xml version=\"1.0\"?><urlset><url><loc>"));
    assert.ok(big.length > 600000 && big.length < xml.length);
  });

  test("hidden form controls are not counted as unlabeled, visually hidden ones still are", () => {
    const html = "<form>" +
      "<input type=\"text\" name=\"_hp\" tabindex=\"-1\" aria-hidden=\"true\">" +
      "<input type=\"text\" class=\"d-none\" name=\"survey-token\">" +
      "<select aria-hidden=\"true\" tabindex=\"-1\"></select>" +
      "<input hidden name=\"a\"><input inert name=\"b\"><input style=\"display: none\" name=\"c\">" +
      "<input class=\"sr-only\" name=\"seen-by-screen-readers\">" +
      "<input class=\"hidden md:block\" name=\"shown-on-desktop\">" +
      "</form>";
    assert.equal(core.analyzeHtml(html, STRONG_HEADERS, URL_).unlabeled, 2);
  });

  test("a bare alt attribute is a valid empty alt", () => {
    const html = "<main><img alt src=\"a.png\"><img src=\"b.png\" alt><img src=\"c.png\" title=\"the alt text is missing\"><img src=\"d.png\" data-alt></main>";
    assert.equal(core.analyzeHtml(html, STRONG_HEADERS, URL_).missingAlt, 2);
  });

  test("rate-limited, refused, and bot-checked links are blocked, not broken", () => {
    const result = analyzeHtmlPages([
      { url: URL_, html: HTML },
      { url: URL_ + "start/", status: 429, html: "" },
      { url: URL_ + "community/", status: 403, html: "" },
      { url: URL_ + "busy/", status: 503, retryAfter: true, html: "" },
      { url: URL_ + "?ssa=1&ssb=2", status: 200, challenge: "Radware", html: null },
      { url: URL_ + "gone/", status: 404, html: "" },
      { url: URL_ + "down/", status: 503, html: "" },
      { url: URL_ + "about/", html: HTML },
      { url: URL_ + "contact/", html: HTML }
    ]);
    const broken = result.findings.find((item) => item.key === "seo-broken-links");
    assert.equal(broken.verdict, "fail");
    assert.deepEqual(broken.pages, ["/gone/", "/down/"]);
    const blocked = result.findings.find((item) => item.key === "seo-blocked-links");
    assert.equal(blocked.verdict, "person");
    assert.equal(blocked.count, 4);
    assert.deepEqual(result.warnings, []);
  });

  test("SEO, Security, Analytics, Accessibility and Performance findings and indexability reasons carry a message that renders to their English text (#1297)", () => {
    const { english } = require("../../functions/url-review-findings-en");
    const result = analyzeHtmlPages([
      { url: URL_, html: HTML },
      { url: URL_ + "gone/", status: 404, html: "" },
      { url: URL_ + "busy/", status: 503, retryAfter: true, html: "" },
      { url: URL_ + "about/", html: HTML }
    ]);
    const seo = result.findings.filter((item) => item.area === "SEO");
    assert.ok(seo.length > 3);
    const security = result.findings.filter((item) => item.area === "Security" && !/^sec-leak-/.test(item.key));
    assert.ok(security.length > 3);
    const analytics = result.findings.filter((item) => item.area === "Analytics");
    assert.ok(analytics.length > 1);
    const a11y = result.findings.filter((item) => item.area === "Accessibility" && !/^ax-/.test(item.key));
    assert.ok(a11y.length > 1);
    const performance = result.findings.filter((item) => item.area === "Performance");
    assert.ok(performance.length > 1);
    for (const item of seo.concat(security, analytics, a11y, performance)) {
      assert.ok(item.msg && item.msg.title, item.key + " has no title message");
      for (const part of ["title", "evidence", "fix"]) {
        if (item.msg[part]) assert.equal(english(item.msg[part]), item[part], item.key + "." + part);
      }
    }
    const broken = seo.find((item) => item.key === "seo-broken-links");
    assert.deepEqual(broken.msg.title, { id: "seo-broken-links.title", vars: { n: 1 } });
    const rows = result.seo.indexability;
    assert.ok(rows.length);
    for (const row of rows.filter((one) => one.reasonMsg)) {
      assert.equal(typeof row.reasonMsg === "string" ? row.reasonMsg : english(row.reasonMsg), row.reason, row.path);
    }
    assert.ok(rows.some((row) => row.reasonMsg && row.reasonMsg.id === "reason.indexable"));
  });

  test("a review where most linked pages were blocked is reported as partial", () => {
    const rows = [{ url: URL_, html: HTML }].concat([1, 2, 3, 4].map((n) => ({ url: URL_ + "p" + n, status: 403, html: "" })), [{ url: URL_ + "ok", html: HTML }]);
    const result = analyzeHtmlPages(rows);
    assert.equal(verdict(result, "seo-broken-links"), "missing");
    assert.match(result.warnings[0], /^Partial analysis: 4 of 5 linked pages/);
    assert.ok(result.summary.startsWith(result.warnings[0]));
  });

  test("emails only count when they ride in links into the site's own domain", () => {
    const page = "https://kubernetes.example.com/";
    const links = (hrefs) => core.analyzeHtml("<main>" + hrefs.map((href) => "<a href=\"" + href + "\">x</a>").join("") + "</main>", STRONG_HEADERS, page).piiLinks;
    assert.equal(links(["https://calendar.google.com/calendar/embed?src=calendar%40kubernetes.example.com"]), 0);
    assert.equal(links(["https://qa.debian.org/developer.php?login=someone%40example.de"]), 0);
    assert.equal(links(["/events?cal=abc123%40group.calendar.google.com"]), 0);
    assert.equal(links(["/signup?email=visitor%40example.org", "https://www.kubernetes.example.com/thanks?e=visitor@example.org"]), 2);
  });

  test("plain http that hops through http before https counts as a permanent redirect", async () => {
    const restore = fakeNetwork({
      "http://amnesty.example.org/": { status: 301, headers: { location: "http://amnesty.example.org/en/" } },
      "http://amnesty.example.org/en/": { status: 301, headers: { location: "https://amnesty.example.org/en/" } }
    });
    let check;
    try {
      check = await core.plainHttp("amnesty.example.org", () => false);
    } finally {
      restore();
    }
    assert.deepEqual(check, { status: 301, statuses: [301, 301], location: "https://amnesty.example.org/en/" });
    assert.equal(verdict(analyzeHtmlPages([{ url: URL_, html: HTML }], { httpRedirect: check }), "sec-http"), "pass");
    assert.equal(verdict(analyzeHtmlPages([{ url: URL_, html: HTML }], { httpRedirect: { status: 301, statuses: [301, 302], location: "https://amnesty.example.org/en/" } }), "sec-http"), "risk");
    assert.equal(verdict(analyzeHtmlPages([{ url: URL_, html: HTML }], { httpRedirect: { status: 301, statuses: [301, 200], location: "http://amnesty.example.org/en/" } }), "sec-http"), "fail");
  });

  test("hreflang accepts language-script-region tags and still rejects malformed ones", () => {
    const alternates = (codes) => "<html lang=\"en\"><head><title>Example shop for garden tools</title>" + codes.map((code) => "<link rel=\"alternate\" hreflang=\"" + code + "\" href=\"" + URL_ + (code === "en" ? "" : code + "/") + "\">").join("") + "</head><body><main><h1>Garden tools</h1></main></body></html>";
    assert.equal(verdict(analyzeHtmlPages([{ url: URL_, html: alternates(["en", "zh-Hans-CN", "zh-hant", "es-419", "x-default"]) }]), "seo-hreflang"), "pass");
    const bad = analyzeHtmlPages([{ url: URL_, html: alternates(["en", "zh-hans-cn", "english"]) }]).findings.find((item) => item.key === "seo-hreflang");
    assert.equal(bad.verdict, "risk");
    assert.equal(bad.count, 1);
    assert.match(bad.evidence, /"english"/);
  });

  test("bot-check pages are recognised without flagging the vendors' normal-page snippets", () => {
    assert.equal(core.challengeOf("https://a.example/", {}, "<html><head><title>Just a moment...</title></head></html>"), "Cloudflare");
    assert.equal(core.challengeOf("https://a.example/", { "cf-mitigated": "challenge" }, ""), "Cloudflare");
    assert.equal(core.challengeOf("https://a.example/?ssa=7aeb&ssb=7304&ssc=https%3A%2F%2Fa.example", {}, ""), "Radware");
    assert.equal(core.challengeOf("https://a.example/", {}, "<title>Radware Bot Manager Captcha</title>"), "Radware");
    assert.equal(core.challengeOf("https://a.example/", {}, "<script>var dd={'host':'geo.captcha-delivery.com'}</script>"), "DataDome");
    assert.equal(core.challengeOf("https://a.example/", {}, "<title>Request unsuccessful</title>Incapsula incident ID: 123"), "Imperva");
    const normal = "<title>Shop</title><script src=\"/cdn-cgi/challenge-platform/scripts/jsd/main.js\"></script>" +
      "<script>ssConf(\"cu\", \"validate.perfdrive.com, ssc\");</script><script src=\"/_Incapsula_Resource?SWJIYLWA=x\"></script><script src=\"https://js.datadome.co/tags.js\"></script>";
    assert.equal(core.challengeOf("https://a.example/?page=2", {}, normal), "");
  });

  test("a bot-check start page puts a warning on top, and bot-checked links are not scored", () => {
    const home = analyzeHtmlPages([{ url: URL_, html: "<title>Radware Page</title>", challenge: "Radware" }]);
    assert.match(home.warnings[0], /start page answered with a Radware bot check/);
    assert.ok(home.summary.startsWith(home.warnings[0]));
    const child = analyzeHtmlPages([{ url: URL_, html: HTML }, { url: URL_ + "?ssa=1&ssb=2", challenge: "Radware", html: null }]);
    assert.equal(child.findings.find((item) => item.key === "seo-title-missing").verdict, "pass");
  });

  test("canonical evidence shows the whole URL when the host or scheme changes", () => {
    const page = (url, canonical) => ({ url, html: "<html lang=\"en\"><head><title>MIT education pages</title><link rel=\"canonical\" href=\"" + canonical + "\"></head><body><main><h1>Education</h1></main></body></html>" });
    const result = analyzeHtmlPages([
      page("https://www.mit.example.edu/", "https://www.mit.example.edu/"),
      page("https://www.mit.example.edu/education/", "https://tlecms.mit.example.edu/education"),
      page("https://www.mit.example.edu/research/", "http://www.mit.example.edu/research/"),
      page("https://www.mit.example.edu/news/", "https://www.mit.example.edu/newsroom/")
    ]);
    const away = result.findings.find((item) => item.key === "seo-canonical-away");
    assert.match(away.evidence, /\/education\/ → https:\/\/tlecms\.mit\.example\.edu\/education/);
    assert.match(away.evidence, /\/research\/ → http:\/\/www\.mit\.example\.edu\/research\//);
    assert.match(away.evidence, /\/news\/ → \/newsroom\//);
  });

  test("default ports in sitemap URLs stay on the host, and other hosts are named", () => {
    const pages = [{ url: URL_, html: HTML }];
    const onHost = analyzeHtmlPages(pages, { sitemap: { source: URL_ + "sitemap.xml", status: 200, urls: ["https://shop.example.com:443/", "https://shop.example.com:443/about"] } });
    assert.equal(onHost.seo.sitemap.offHost, 0);
    const offHost = analyzeHtmlPages(pages, { sitemap: { source: URL_ + "sitemap.xml", status: 200, urls: ["https://shop.example.com:443/", "https://assetsdev.example.com:443/a", "https://assetsdev.example.com/b", "https://assets.example.com/c"] } });
    assert.match(offHost.findings.find((item) => item.key === "seo-sitemap-offhost").evidence, /assetsdev\.example\.com \(2\), assets\.example\.com \(1\)/);
  });

  test("a null MX is read as a domain that takes no mail", async () => {
    const dnsPromises = require("node:dns").promises;
    const saved = { mx: dnsPromises.resolveMx, txt: dnsPromises.resolveTxt, caa: dnsPromises.resolveCaa };
    dnsPromises.resolveMx = async () => [{ exchange: "", priority: 0 }];
    dnsPromises.resolveTxt = async (name) => name.startsWith("_dmarc.") ? [["v=DMARC1;p=reject;sp=reject"]] : [["google-site-verification=x"]];
    dnsPromises.resolveCaa = async () => [];
    let facts;
    try {
      facts = await core.dnsFacts("www.sura.example.co");
    } finally {
      Object.assign(dnsPromises, { resolveMx: saved.mx, resolveTxt: saved.txt, resolveCaa: saved.caa });
    }
    assert.equal(facts.nullMx, true);
    assert.deepEqual(facts.mx, []);
    assert.equal(verdict(analyzeHtmlPages([{ url: URL_, html: HTML }], { dns: facts }), "sec-spf"), "pass");
    const noDmarc = analyzeHtmlPages([{ url: URL_, html: HTML }], { dns: Object.assign({}, facts, { dmarc: "" }) });
    const spf = noDmarc.findings.find((item) => item.key === "sec-spf");
    assert.deepEqual([spf.verdict, spf.severity], ["risk", "low"]);
    assert.match(spf.title, /refuses mail/);
    assert.equal(noDmarc.findings.find((item) => item.key === "sec-dmarc").severity, "low");
  });

  test("an order email on a null MX domain cannot receive mail", async () => {
    const dnsPromises = require("node:dns").promises;
    const saved = { mx: dnsPromises.resolveMx, lookup: dnsPromises.lookup };
    dnsPromises.lookup = async () => [{ address: "93.184.216.34", family: 4 }];
    const canReceive = async (exchanges) => {
      dnsPromises.resolveMx = async () => exchanges.map((exchange) => ({ exchange, priority: 0 }));
      return core.emailCanReceive("ana@sura.example.co");
    };
    try {
      assert.equal(await canReceive([""]), false);
      assert.equal(await canReceive(["."]), false);
      assert.equal(await canReceive(["mx.sura.example.co"]), true);
      assert.equal(await canReceive(["", "mx.sura.example.co"]), true);
    } finally {
      Object.assign(dnsPromises, { resolveMx: saved.mx, lookup: saved.lookup });
    }
  });

  test("a DNS lookup that fails is unread, not a missing record", async () => {
    const dnsPromises = require("node:dns").promises;
    const saved = { mx: dnsPromises.resolveMx, txt: dnsPromises.resolveTxt, caa: dnsPromises.resolveCaa };
    const failing = (code) => async () => { throw Object.assign(new Error(code), { code }); };
    const facts = async (txt, caa) => {
      dnsPromises.resolveMx = async () => [{ exchange: "mx.example.org", priority: 10 }];
      dnsPromises.resolveTxt = txt;
      dnsPromises.resolveCaa = caa;
      try {
        return await core.dnsFacts("www.example.org");
      } finally {
        Object.assign(dnsPromises, { resolveMx: saved.mx, resolveTxt: saved.txt, resolveCaa: saved.caa });
      }
    };
    const timedOut = await facts(async (name) => { if (name.startsWith("_dmarc.")) throw Object.assign(new Error("ENODATA"), { code: "ENODATA" }); throw Object.assign(new Error("ETIMEOUT"), { code: "ETIMEOUT" }); }, failing("ESERVFAIL"));
    assert.deepEqual(timedOut.unread, ["spf", "caa", "mta-sts", "tlsrpt", "bimi"]);
    const unsure = analyzeHtmlPages([{ url: URL_, html: HTML }], { dns: timedOut });
    assert.equal(verdict(unsure, "sec-spf"), "missing");
    assert.equal(verdict(unsure, "sec-caa"), "missing");
    assert.equal(verdict(unsure, "sec-dmarc"), "risk");
    assert.equal(unsure.security.headers.find((item) => item.label === "SPF").state, "unknown");
    const absent = await facts(failing("ENODATA"), failing("ENOTFOUND"));
    assert.deepEqual(absent.unread, []);
    const sure = analyzeHtmlPages([{ url: URL_, html: HTML }], { dns: absent });
    assert.equal(verdict(sure, "sec-spf"), "risk");
    assert.equal(verdict(sure, "sec-caa"), "risk");
  });

  test("the GTM noscript frame and hidden frames need no title, visible ones do", () => {
    const html = "<body><noscript><iframe src=\"https://www.googletagmanager.com/ns.html?id=GTM-X\" height=\"0\" width=\"0\" style=\"display:none;visibility:hidden\"></iframe></noscript>" +
      "<iframe src=\"https://track.example/p\" style=\"display:none\"></iframe><iframe src=\"https://www.youtube.com/embed/x\"></iframe><iframe src=\"https://maps.example/\" title=\"Map\"></iframe></body>";
    assert.equal(core.analyzeHtml(html, STRONG_HEADERS, URL_).signals.untitledFrames, 1);
  });

  test("a stray later <html lang> fills a root that has no lang, as browsers do", () => {
    assert.equal(core.analyzeHtml("<!doctype html><html dir=\"ltr\"><head></head><body><html lang=\"es-ES\"><p>Hola</p></body></html>", STRONG_HEADERS, URL_).lang, "es-ES");
    assert.equal(core.analyzeHtml("<html lang=\"\"><body><html lang=\"es-ES\"></body></html>", STRONG_HEADERS, URL_).lang, "");
    assert.equal(core.analyzeHtml("<html><body><!-- <html lang=\"fr\"> --><script>document.write('<html lang=\"de\">')</script></body></html>", STRONG_HEADERS, URL_).lang, "");
  });

  test("a declared language that clearly differs from the text is flagged, short or mixed text is not", () => {
    const spanish = "La Dirección de Impuestos y Aduanas Nacionales es la entidad del Estado que se encarga de los trámites de impuestos para los ciudadanos y las empresas del país, con servicios en línea para todos. ".repeat(12);
    const english = "The service is open for all of the people who live in the city, and you can find the forms on this page with your account. ".repeat(12);
    const page = (lang, text) => "<html lang=\"" + lang + "\"><head><title>Impuestos y aduanas</title></head><body><main><h1>Inicio</h1><p>" + text + "</p></main></body></html>";
    const mismatch = analyzeHtmlPages([{ url: URL_, html: page("en", spanish) }]).findings.find((item) => item.key === "a11y-lang");
    assert.deepEqual([mismatch.verdict, mismatch.severity], ["risk", "medium"]);
    assert.match(mismatch.evidence, /lang="en" \(English\), but its text reads as Spanish/);
    assert.equal(verdict(analyzeHtmlPages([{ url: URL_, html: page("es-CO", spanish) }]), "a11y-lang"), "pass");
    assert.equal(verdict(analyzeHtmlPages([{ url: URL_, html: page("en", english) }]), "a11y-lang"), "pass");
    assert.equal(verdict(analyzeHtmlPages([{ url: URL_, html: page("en", spanish.slice(0, 400)) }]), "a11y-lang"), "pass");
    assert.equal(verdict(analyzeHtmlPages([{ url: URL_, html: page("en", spanish.slice(0, 1200) + english.slice(0, 1200)) }]), "a11y-lang"), "pass");
  });

  test("cookie flags are read per Set-Cookie header and in any case", () => {
    const face = core.analyzeHtml(HTML, Object.assign({}, STRONG_HEADERS, { "set-cookie": ["JSESSIONID=1; Path=/; SECURE; HTTPONLY", "COOKIE_SUPPORT=true; Path=/; HttpOnly", "SERVER_ID=2; path=/; HttpOnly; Secure"] }), URL_);
    assert.deepEqual(face.cookies.map((cookie) => [cookie.name, cookie.secure, cookie.httpOnly]), [["JSESSIONID", true, true], ["COOKIE_SUPPORT", false, true], ["SERVER_ID", true, true]]);
  });
});

test.describe("start page reads", () => {
  const BANK = "https://bank.example.com/";
  const WAF = { status: 403, headers: { "content-type": "text/html" }, body: "<html><head><script>window.gokuProps = {};</script></head><body></body></html>" };
  const review = async (routes, browse) => {
    const restore = fakeNetwork(routes);
    const lines = [];
    try {
      const report = await core.reviewTarget(BANK, { log: (text) => lines.push(text), browse });
      return { report, lines };
    } finally {
      restore();
    }
  };

  test("a refused plain read is built from headless Chrome's rendered page", async () => {
    const jobs = [];
    const browse = async (job) => {
      jobs.push(job);
      return { ok: true, ms: 9000, timing: { load: 2100 }, start: { status: 403, docStatus: 200, finalUrl: BANK, headers: STRONG_HEADERS, html: HTML.replace(/shop\.example\.com/g, "bank.example.com"), htmlCut: false } };
    };
    const { report, lines } = await review({ [BANK]: WAF }, browse);
    assert.equal(jobs.length, 1);
    assert.equal(jobs[0].html, true);
    assert.equal(report.pages[0].status, 200);
    assert.equal(report.pages[0].title, "Example shop for garden tools");
    assert.ok(lines.includes(insights.BROWSER_READ_NOTE));
    assert.ok(report.insights.warnings.includes(insights.BROWSER_READ_NOTE));

    const untagged = await review({ [BANK]: WAF }, async (job) => Object.assign(await browse(job), { untagged: true }));
    assert.ok(untagged.lines.includes(insights.UNTAGGED_READ_NOTE));
    assert.ok(untagged.report.insights.warnings.includes(insights.UNTAGGED_READ_NOTE));
    assert.ok(!untagged.report.insights.warnings.includes(insights.BROWSER_READ_NOTE));
  });

  test("a host that accepts no connection is tried in headless Chrome, then named as down (#411)", async () => {
    const failures = require("../../functions/url-review-failures");
    const jobs = [];
    const lines = [];
    const restore = fakeNetwork({ [BANK]: { timeout: true, connecting: true } });
    try {
      await assert.rejects(core.reviewTarget(BANK, { log: (text) => lines.push(text), browse: async (job) => { jobs.push(job); return { ok: false, error: "net::ERR_CONNECTION_TIMED_OUT at " + BANK }; } }),
        /^Error: The site accepted no connection to the plain request, and headless Chrome could not open it either \(net::ERR_CONNECTION_TIMED_OUT at https:\/\/bank\.example\.com\/\)\.$/);
    } finally {
      restore();
    }
    assert.equal(jobs.length, 1);
    assert.ok(lines.includes("The site accepted no connection to the plain request in 8 s. Waiting for headless Chrome to open the page."));
    const down = failures.causeOf("The site accepted no connection to the plain request, and headless Chrome could not open it either (net::ERR_CONNECTION_TIMED_OUT).");
    assert.deepEqual([down.id, down.label], ["down", "The site accepted no connection"]);
    // A host that accepted the connection and then went quiet is still "took too long".
    await assert.rejects(review({ [BANK]: { timeout: true } }, async () => ({ ok: false, error: "the browser was busy" })), /^Error: The page took too long in the plain request, and headless Chrome could not open it either \(the browser was busy\)\.$/);
  });

  test("when headless Chrome is refused too, the error names the bot protection", async () => {
    const browse = async () => ({ ok: true, start: { status: 403, docStatus: 403, finalUrl: BANK, headers: {}, html: WAF.body } });
    await assert.rejects(review({ [BANK]: WAF }, browse), /^Error: The site's bot protection refused the review \(status 403, an AWS WAF bot check\), in the plain request and in headless Chrome\.$/);
    await assert.rejects(review({ [BANK]: WAF }, async () => ({ ok: false, error: "the browser was busy" })), /refused the plain request \(status 403\), and headless Chrome did not finish \(the browser was busy\)/);
  });

  test("a 403 already loaded in plain Chrome stops the recovery pass instead of running until the caller aborts", async () => {
    const browser = require("../../functions/url-review-browser");
    const failures = require("../../functions/url-review-failures");
    // Re-run Y9z2FMNqPadCNDNWRiwD on americanairlines.com: the plain read was 403, tagged Chrome was 403,
    // and plain Chrome loaded status 403 (28 words, 30 in the raw HTML). Axe-core and the phone visit
    // then kept going until the caller aborted: "The operation was aborted due to timeout".
    const aborted = "The site's bot protection refused the plain read (status 403), and headless Chrome did not finish (The operation was aborted due to timeout).";
    assert.equal(failures.causeOf(aborted).id, "browser");
    const job = { url: BANK, paths: [], html: true };
    assert.equal(browser.stopForRefusal(job, 403), true);
    assert.equal(browser.stopForRefusal(Object.assign({}, job, { html: false }), 403), false);
    assert.equal(browser.stopForRefusal(job, 200), false);
    const block = "<html><head><title>Access Denied</title></head><body><p>Access denied. Reference 18. The request was blocked.</p></body></html>";
    await assert.rejects(review({ [BANK]: { status: 403, headers: { "content-type": "text/html" }, body: block } }, async (seen) => {
      assert.equal(seen.html, true);
      assert.deepEqual(seen.paths, []);
      assert.equal(browser.stopForRefusal(seen, 403), true);
      return { ok: true, untagged: true, timing: { load: 1800 }, start: { status: 403, docStatus: 403, finalUrl: BANK, headers: { "content-type": "text/html" }, html: block } };
    }), /^Error: The site's bot protection refused the review \(status 403\), in the plain request and in headless Chrome\.$/);
  });

  test("a phone visit still running when the budget ends is cut, and the caller waits longer than any budget", async () => {
    const browser = require("../../functions/url-review-browser");
    const fs = require("node:fs");
    const path = require("node:path");
    assert.equal(await browser.withinBudget(Promise.resolve("read"), 50, "The phone visit"), "read");
    let late = null;
    const stalled = new Promise((resolve) => { late = setTimeout(() => resolve("too late"), 1000); });
    const started = Date.now();
    await assert.rejects(browser.withinBudget(stalled, 30, "The phone visit"), /^Error: The phone visit was still running when the browser's budget ran out$/);
    assert.ok(Date.now() - started < 500);
    clearTimeout(late);
    await assert.rejects(browser.withinBudget(Promise.reject(new Error("net::ERR_ABORTED")), 50, "The phone visit"), /net::ERR_ABORTED/);
    // #366: the caller aborted at 100 s while a pass of up to 110 s was still on the phone.
    const index = fs.readFileSync(path.join(__dirname, "../../functions/index.js"), "utf8");
    const wait = Number((index.match(/const BROWSER_WAIT_MS = (\d+);/) || [])[1]);
    const limit = Number((index.match(/exports\.reviewBrowser = [\s\S]*?timeoutSeconds: (\d+)/) || [])[1]) * 1000;
    assert.match(index, /AbortSignal\.timeout\(BROWSER_WAIT_MS\)/);
    assert.ok(wait > browser.BUDGET_MAX_MS + 3000, "wait " + wait);
    assert.ok(wait < limit, "reviewBrowser timeout " + limit);
  });

  test("a redirect to http is named as such, not as a wrong address", async () => {
    await assert.rejects(review({ [BANK]: { status: 301, headers: { location: "http://www.bank.example.com/co" } } }),
      /^Error: The site redirected to http:\/\/www\.bank\.example\.com\/co, an http:\/\/ address, and the same address over https gave no page\. The review only follows https\.$/);
  });

  test("a start page over 2 MB keeps its first 2 MB and says it was cut", async () => {
    const big = HTML.replace("</main>", "<p>" + "garden ".repeat(400000) + "</p></main>");
    const { report, lines } = await review({ [BANK]: { status: 200, headers: STRONG_HEADERS, body: big } });
    assert.equal(report.pages[0].title, "Example shop for garden tools");
    assert.ok(lines.includes(insights.CUT_NOTE));
    assert.ok(report.insights.warnings.includes(insights.CUT_NOTE));
  });

  test("a linked page over 2 MB is analyzed in part instead of failing", async () => {
    const big = HTML.replace("<h1>Garden tools</h1>", "<h1>About us</h1>").replace("</main>", "<p>" + "garden ".repeat(400000) + "</p></main>");
    const { report, lines } = await review({ [BANK]: { status: 200, headers: STRONG_HEADERS, body: HTML }, [BANK + "about"]: { status: 200, headers: STRONG_HEADERS, body: big } });
    const about = report.pages.find((page) => page.path === "/about");
    assert.deepEqual([about.status, about.error], [200, ""]);
    assert.ok(lines.some((line) => /^\/about answered 200 .* It is larger than 2 MB, so its first 2 MB were analyzed\.$/.test(line)));
  });

  test("a start page still arriving at the deadline keeps the part that arrived", async () => {
    const half = HTML.replace("</main></body></html>", "<p>More garden tools are on their way");
    const { report, lines } = await review({ [BANK]: { status: 200, headers: STRONG_HEADERS, body: half, timeout: true } });
    assert.equal(report.pages[0].title, "Example shop for garden tools");
    assert.ok(lines.includes(insights.SLOW_CUT_NOTE));
    assert.ok(report.insights.warnings.includes(insights.SLOW_CUT_NOTE));
    assert.ok(!report.insights.warnings.includes(insights.CUT_NOTE));
  });

  test("a start page that times out before its body is read in headless Chrome", async () => {
    const failures = require("../../functions/url-review-failures");
    const jobs = [];
    const browse = async (job) => {
      jobs.push(job);
      return { ok: true, timing: { load: 11000 }, start: { status: 200, docStatus: 200, finalUrl: BANK, headers: STRONG_HEADERS, html: HTML, htmlCut: false } };
    };
    const { report, lines } = await review({ [BANK]: { timeout: true } }, browse);
    assert.deepEqual([jobs.length, jobs[0].html, jobs[0].url], [1, true, BANK]);
    assert.deepEqual([report.pages[0].status, report.pages[0].title], [200, "Example shop for garden tools"]);
    assert.ok(lines.includes(insights.SLOW_READ_NOTE));
    assert.ok(report.insights.warnings.includes(insights.SLOW_READ_NOTE));
    assert.ok(!report.insights.warnings.includes(insights.BROWSER_READ_NOTE));

    await assert.rejects(review({ [BANK]: { timeout: true } }), /^Error: The page took too long\.$/);
    const hung = await review({ [BANK]: { timeout: true } }, async () => ({ ok: false, error: "net::ERR_HTTP2_PROTOCOL_ERROR" })).catch((error) => error);
    assert.equal(hung.message, "The page took too long in the plain request, and headless Chrome could not open it either (net::ERR_HTTP2_PROTOCOL_ERROR).");
    assert.equal(failures.causeOf(hung.message).id, "timeout");
    const refused = await review({ [BANK]: { timeout: true } }, async () => ({ ok: true, start: { status: 403, docStatus: 403, finalUrl: BANK, headers: {}, html: "<html><body>Access denied</body></html>" } })).catch((error) => error);
    assert.equal(refused.message, "The site's bot protection refused the review (status 403), in headless Chrome, after the plain request took too long.");
    assert.equal(failures.causeOf(refused.message).id, "bot-protection");
  });

  test("a server that leaves out its intermediate certificate is read after fetching it from the AIA address", async () => {
    // Failed run 3ee60f3e464b7756 on www.dollarcity.com (#734): the server sends only its leaf, so Node
    // answered "unable to verify the first certificate" while browsers opened the site.
    const fs = require("node:fs");
    const path = require("node:path");
    const crypto = require("node:crypto");
    const tlsLib = require("node:tls");
    const httpsLib = require("node:https");
    const failures = require("../../functions/url-review-failures");
    const pem = (name) => fs.readFileSync(path.join(__dirname, "fixtures", "tls-chain", name + ".pem"), "utf8");
    const der = (name) => new crypto.X509Certificate(pem(name)).raw;
    const read = async (host, issuer) => {
      const site = "https://" + host + "/";
      const restore = fakeNetwork({
        [site]: { status: 200, headers: STRONG_HEADERS, body: HTML.replace(/shop\.example\.com/g, host) },
        "http://certs.ca.example.org/intermediate.crt": { status: 200, headers: { "content-type": "application/pkix-cert" }, body: der(issuer) }
      });
      const fake = httpsLib.request;
      const savedConnect = tlsLib.connect;
      const cas = [];
      httpsLib.request = (options, onResponse) => {
        if (options.hostname !== host) return fake(options, onResponse);
        cas.push(options.ca ? options.ca.includes(pem("int")) : false);
        if (options.ca && options.ca.includes(pem("int"))) return fake(options, onResponse);
        const { EventEmitter } = require("node:events");
        const req = new EventEmitter();
        req.destroy = () => {};
        req.end = () => setImmediate(() => req.emit("error", Object.assign(new Error("unable to verify the first certificate"), { code: "UNABLE_TO_VERIFY_LEAF_SIGNATURE" })));
        return req;
      };
      tlsLib.connect = (options, onSecure) => {
        const { EventEmitter } = require("node:events");
        const socket = new EventEmitter();
        assert.deepEqual([options.servername, options.port], [host, 443]);
        socket.getPeerCertificate = () => ({ raw: der("leaf") });
        socket.destroy = () => {};
        setImmediate(onSecure);
        return socket;
      };
      const lines = [];
      try {
        const report = await core.reviewTarget(site, { log: (text) => lines.push(text), browse: async () => ({ ok: false }) });
        return { report, lines, cas };
      } finally {
        httpsLib.request = fake;
        tlsLib.connect = savedConnect;
        restore();
      }
    };

    const { report, lines, cas } = await read("chain.example.com", "int");
    assert.deepEqual([report.pages[0].status, report.pages[0].title], [200, "Example shop for garden tools"]);
    assert.deepEqual(cas.slice(0, 2), [false, true]);
    assert.ok(cas.slice(2).every(Boolean), "later requests to the host carry the fetched intermediate");
    assert.ok(lines.includes("The server sent its certificate without the intermediate Review Test Intermediate. Fetched it from http://certs.ca.example.org/intermediate.crt, as browsers do, and verified the chain again."));
    const chain = report.insights.findings.find((item) => item.key === "sec-tls-chain");
    assert.deepEqual([chain.verdict, chain.severity], ["risk", "medium"]);
    assert.match(chain.evidence, /without Review Test Intermediate\. Browsers fetch/);

    const wrong = await read("wrong-issuer.example.com", "other").catch((error) => error);
    assert.equal(wrong.message, "unable to verify the first certificate");
    assert.equal(failures.causeOf(wrong.message).id, "tls");
  });

  test("headless Chrome reads a page whose load event stalls once its document has arrived", async () => {
    // Re-run zyvKsDINcVhGirMeIupU on www.supersociedades.gov.co (#733): the document parses in about 12 s,
    // but an image or script never finishes, so the load event never fires and goto timed out at 20 s.
    const browser = require("../../functions/url-review-browser");
    const html = "<html><body><h1>Superintendencia</h1></body></html>";
    const fakePage = ({ arrives, ready, error }) => {
      const listeners = [];
      const main = {};
      const doc = { request: () => ({ isNavigationRequest: () => true }), frame: () => main, status: () => 200, headers: () => ({ "content-type": "text/html" }), text: async () => html };
      return {
        on: (name, fn) => listeners.push(fn),
        off: (name, fn) => listeners.splice(listeners.indexOf(fn), 1),
        mainFrame: () => main,
        url: () => BANK,
        evaluate: async () => ready,
        waitForNetworkIdle: async () => {},
        goto: async () => {
          if (arrives) listeners.forEach((fn) => fn(doc));
          throw Object.assign(new Error(error === "empty" ? "net::ERR_EMPTY_RESPONSE at " + BANK : "Navigation timeout of 20000 ms exceeded"), { name: error === "empty" ? "Error" : "TimeoutError" });
        }
      };
    };
    const read = await browser.open(fakePage({ arrives: true, ready: true }), BANK);
    assert.deepEqual([read.status, read.docStatus, read.stalled, read.raw, read.finalUrl], [200, 200, true, html, BANK]);
    await assert.rejects(browser.open(fakePage({ arrives: false, ready: true }), BANK), /^TimeoutError: Navigation timeout of 20000 ms exceeded$/);
    await assert.rejects(browser.open(fakePage({ arrives: true, ready: false }), BANK), /Navigation timeout/);
    await assert.rejects(browser.open(fakePage({ arrives: true, ready: true, error: "empty" }), BANK), /ERR_EMPTY_RESPONSE/);
  });

  test("an empty shell start page is crawled from the links headless Chrome rendered", async () => {
    const shell = "<!doctype html><html lang=\"en\"><head><title>Bank app</title></head><body><div id=\"root\"></div><script src=\"/app.js\"></script></body></html>";
    const page = (h1) => HTML.replace("<h1>Garden tools</h1>", "<h1>" + h1 + "</h1>");
    const browse = async (job, log, onStart) => {
      onStart({ status: 200, dom: { links: [BANK + "accounts", BANK + "cards?utm_source=nav", BANK + "#top", "https://other.example.com/x"] } });
      return { ok: false, error: "the browser was busy" };
    };
    const { report, lines } = await review({
      [BANK]: { status: 200, headers: STRONG_HEADERS, body: shell },
      [BANK + "accounts"]: { status: 200, headers: STRONG_HEADERS, body: page("Accounts") },
      [BANK + "cards"]: { status: 200, headers: STRONG_HEADERS, body: page("Cards") }
    }, browse);
    assert.deepEqual(report.pages.slice(0, 3).map((row) => [row.path, row.status]), [["/", 200], ["/accounts", 200], ["/cards", 200]]);
    assert.ok(lines.includes(insights.SHELL_NOTE + " The rendered page adds 2."));
    assert.ok(report.insights.warnings.includes(insights.SHELL_NOTE));

    const plain = await review({ [BANK]: { status: 200, headers: STRONG_HEADERS, body: shell } }, async () => ({ ok: false }));
    assert.ok(plain.lines.includes("Headless Chrome did not return the rendered start page."));
    assert.ok(!plain.report.insights.warnings.includes(insights.SHELL_NOTE));
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

test.describe("mail to the asker", () => {
  const customerMail = require("../../functions/url-review-customer-mail");
  const offers = require("../../functions/url-review-offers");
  const day = 24 * 60 * 60 * 1000;
  const now = Date.parse("2026-10-20T15:00:00Z");
  const ago = (days) => new Date(now - days * day).toISOString();
  const hidden = "is not sent on the start page or any page after it";
  const record = {
    id: "ab12cd34",
    email: "asker@example.com",
    lang: "es",
    status: "complete",
    followUp: true,
    createdAt: ago(3),
    report: {
      host: "example.com",
      counts: { pages: 7, cases: 42 },
      insights: {
        score: { overall: 63, grade: "C", areas: { SEO: { score: 81 }, GEO: { score: 40 }, Analytics: { score: 70 }, Security: { score: 55 }, Accessibility: { score: 90 }, Performance: { score: 30 } } },
        findings: [
          { verdict: "fail", rank: 1, area: "Security", severity: "high", title: "Strict-Transport-Security " + hidden },
          { verdict: "pass", area: "SEO", title: "The page has a title" }
        ]
      }
    }
  };

  test("the report mail keeps the scores open and cuts the rest of each finding on the server", () => {
    const mail = customerMail.reportMail(record, { stopUrl: "https://fn/notes/stop?t=1" });
    assert.equal(mail.lang, "es");
    assert.match(mail.subject, /example\.com/);
    assert.match(mail.subject, /63/);
    assert.match(mail.html, /Seguridad/);
    assert.match(mail.html, /Strict-Transport-Security/);
    assert.ok(!mail.html.includes(hidden) && !mail.text.includes(hidden));
    assert.ok(!mail.html.includes("The page has a title"));
    assert.match(mail.html, /qa-review-es\.html\?report=ab12cd34/);
    assert.match(mail.html, /mailto:qa@carlosandmunoz\.com/);
    assert.match(mail.text, /notes\/stop\?t=1/);
  });

  test("a note waits 48 hours after the last one and ends 30 days after the last run", () => {
    assert.equal(offers.queue([record], now)[0].due, true);
    assert.equal(offers.queue([record, { status: "follow-note", email: record.email, createdAt: ago(1) }], now)[0].held, "The last note was inside 48 hours.");
    assert.equal(offers.queue([Object.assign({}, record, { createdAt: ago(31) })], now)[0].held, "The 30-day return window closed.");
    assert.equal(offers.queue([record, { status: "follow-stop", email: record.email }], now)[0].held, "This address asked to stop.");
  });

  test("the PDF attachment keeps the opening of each line and never the hidden part", () => {
    const pdf = customerMail.reportPdf(record);
    assert.equal(pdf.filename, "qa-lab-example.com-informe-empanado.pdf");
    assert.match(pdf.html, /Strict-Transport-Security/);
    assert.ok(!pdf.html.includes(hidden));
    assert.ok(!pdf.html.includes("The page has a title"));
    assert.match(pdf.html, /qa-review-es\.html\?report=ab12cd34/);
    assert.match(pdf.html, /data:image\/png;base64,/);
    const mail = customerMail.reportMail(record, { stopUrl: "https://fn/notes/stop?t=1", attached: true });
    assert.match(mail.html, /va adjunto en PDF/);
  });

  test("a note opens the last report in the page language it was run in", () => {
    const note = offers.queue([record], now)[0];
    assert.equal(note.reportId, "ab12cd34");
    assert.equal(note.lang, "es");
    const mail = customerMail.noteMail(note, { stopUrl: "https://fn/notes/stop?t=2" });
    assert.match(mail.html, /Abrir el último informe/);
    assert.match(mail.html, /notes\/stop\?t=2/);
  });

  test("notes are scenes, never the price rules, and the next note is a different scene", () => {
    const copy = require("../../functions/url-review-note-copy");
    customerMail.LANGS.forEach((lang) => {
      ["return", "paid", "offer"].forEach((kind) => {
        assert.ok(copy[lang][kind].length >= 5, lang + " " + kind);
        assert.equal(copy[lang][kind].length, copy.en[kind].length, lang + " " + kind);
        copy[lang][kind].forEach((row) => {
          assert.equal(row.length, 3);
          assert.ok(!/%|USD|\d/.test(row.join(" ")), lang + " " + kind + ": " + row[0]);
        });
      });
    });
    const notes = (lang) => ["return", "paid", "offer"].map((kind) => copy[lang][kind].map((row) => row.join(" ")).join(" ")).join(" ");
    assert.match(notes("en"), /The first review looked at/);
    assert.match(notes("es"), /La primera revisión analizó/);
    assert.match(notes("pt"), /A primeira análise examinou/);
    assert.match(notes("de"), /Die erste Prüfung hat einen Ausschnitt von \{host\} angesehen/);
    assert.match(notes("fr"), /La première analyse a parcouru/);
    assert.match(notes("it"), /La prima analisi ha esaminato/);
    ["es", "pt", "fr", "it"].forEach((lang) => assert.ok(!/lectura|leitura|lecture|lettura/i.test(notes(lang)), lang));
    const first = offers.queue([record], now)[0];
    const second = offers.queue([record, { status: "follow-note", email: record.email, createdAt: ago(3) }], now)[0];
    assert.notEqual(first.title, second.title);
  });

  test("every report mail links the account page, the legal page, the retention date and the Live Reports notice", () => {
    customerMail.LANGS.forEach((lang) => {
      const mail = customerMail.reportMail(Object.assign({}, record, { lang, retainUntil: "2027-10-17T15:00:00Z" }), { stopUrl: "https://fn/notes/stop?t=1" });
      [mail.html, mail.text].forEach((body) => {
        assert.match(body, /https:\/\/carlosandmunoz\.com\/qa-review-account\.html/, lang);
        assert.match(body, /https:\/\/carlosandmunoz\.com\/qa-review-legal\.html/, lang);
        assert.match(body, /Carlos A\. Muñoz, Calle 29 # 29-31, Medellín, Colombia \(050016\)/, lang);
        assert.match(body, /2027-10-17/, lang);
        assert.match(body, /Live Report/, lang);
      });
      assert.match(mail.html, /mailto:qa@carlosandmunoz\.com"/, lang);
    });
    const note = customerMail.noteMail(offers.queue([record], now)[0], { stopUrl: "https://fn/notes/stop?t=2" });
    assert.match(note.html, /qa-review-account\.html/);
    assert.ok(!note.text.includes("Live Report"));
  });

  test("a paid or free record is mailed open: full findings, an open PDF, and no unlock wording", () => {
    customerMail.LANGS.forEach((lang) => {
      const open = Object.assign({}, record, { lang, paid: true, free: true });
      const blurred = customerMail.reportMail(Object.assign({}, record, { lang }), { attached: true });
      const mail = customerMail.reportMail(open, { attached: true });
      assert.ok(mail.html.includes(hidden) && mail.text.includes(hidden), lang);
      assert.ok(!mail.text.includes(hidden + " …"), lang);
      assert.notEqual(mail.subject, blurred.subject, lang);
      assert.ok(!mail.text.includes(blurred.text.split("\n").find((row) => row.includes("?report=")).split(":")[0]), lang);
      const pdf = customerMail.reportPdf(open);
      assert.ok(pdf.html.includes(hidden), lang);
      assert.ok(!/data:image\/png;base64,/.test(pdf.html), lang);
      assert.ok(!/frost|blur|empan|embac|verschwommen|flout|sfocat/i.test(pdf.filename), lang + " " + pdf.filename);
    });
    const es = customerMail.reportMail(Object.assign({}, record, { free: true, paid: true }), { attached: true });
    assert.match(es.html, /Abrir el informe completo/);
    assert.match(es.html, /El informe completo va adjunto en PDF/);
    assert.ok(!/Desbloquear|empañad/.test(es.html + es.subject));
    assert.equal(customerMail.reportPdf(Object.assign({}, record, { paid: true })).filename, "qa-lab-example.com-informe.pdf");
  });

  test("a re-run says the earlier review failed on its date and ran again; a stopped run says it stopped", () => {
    const rerun = Object.assign({}, record, { paid: true, free: true, rerunOf: ["f1"], failedAt: "2026-10-19T08:00:00Z" });
    customerMail.LANGS.forEach((lang) => {
      const mail = customerMail.reportMail(Object.assign({}, rerun, { lang }));
      assert.match(mail.text, /2026-10-19/, lang);
      assert.match(mail.subject, /example\.com/, lang);
      assert.ok(!/63/.test(mail.subject), lang);
      const undated = customerMail.reportMail(Object.assign({}, rerun, { lang, failedAt: "" }));
      assert.ok(!undated.text.includes("{date}") && !undated.text.includes("2026-10-19"), lang);
      const stopped = customerMail.reportMail(Object.assign({}, record, { lang, status: "stopped" }));
      const done = customerMail.reportMail(Object.assign({}, record, { lang }));
      assert.notEqual(stopped.text.split("\n")[0], done.text.split("\n")[0], lang);
      assert.ok(!stopped.subject.includes("63"), lang);
    });
    assert.match(customerMail.reportMail(Object.assign({}, rerun, { lang: "en" })).text, /Your earlier review of example\.com failed on 2026-10-19\. It ran again after the cause cleared/);
    assert.match(customerMail.reportMail(Object.assign({}, record, { lang: "en", status: "stopped" })).subject, /stopped before the last page/);
  });

  test("the stop page asks before it stops, so a link scanner cannot stop the notes", () => {
    assert.match(customerMail.stopPage("fr", "ask"), /<form method="post">/);
    assert.match(customerMail.stopPage("fr", "done", "a@b.co"), /a@b\.co/);
    assert.ok(!customerMail.stopPage("en", "gone").includes("<form"));
  });
});

test.describe("pricing", () => {
  const offers = require("../../functions/url-review-offers");
  const fw = (n) => core.FRAMEWORKS.slice(0, n);

  test("the full report is 19 USD for the first framework and 5 USD for each one after it", () => {
    assert.deepEqual([1, 2, 8].map((n) => core.priceFor(fw(n)).usd), [19, 24, 54]);
    assert.deepEqual(core.priceFor(fw(2), ["axe-core"]).discount.map((row) => row.usd), [19, 5, 5]);
    assert.equal(core.priceFor(fw(1), ["axe-core"]).usd, 24);
  });

  test("a later run prices its frameworks the same way and keeps the scope add-ons; the first run's scope leaves frameworks free", () => {
    assert.equal(core.priceForRun({ frameworks: fw(2), pages: 40, depth: 3, billing: "run" }).usd, 24 + 5 + 4);
    assert.equal(core.priceForRun({ frameworks: fw(8), pages: 40, depth: 3, billing: "scope" }).usd, 9);
  });

  test("case exports and signals bought before the flat report keep their ladder", () => {
    assert.deepEqual([1, 2, 3, 4, 5, 6, 7].map(core.centsForIndex), [1900, 1710, 1710, 1615, 1615, 1520, 1520]);
    assert.equal(core.priceForLayers(["Functional", "Content", "Links"]).cents, 1900 + 1710 + 1710);
    assert.equal(core.centsForIndex(40), 1140);
  });

  test("a fix list is 5 USD flat and never discounted", () => {
    assert.deepEqual(core.priceForFixList(), { usd: 5, cents: 500, count: 1, frameworks: [], layers: [] });
    assert.equal(core.chargedUsd({ purpose: "fixlist", priceUsd: 5 }).usd, 5);
    assert.throws(() => core.chargedUsd({ purpose: "fixlist", priceUsd: 4, listUsd: 5 }), /out of range/);
    assert.equal(core.priceMatches(5), true);
    assert.equal(offers.paidPurpose("fixlist"), "fixlist");
    assert.ok(offers.ADDONS.includes("fixlist"));
  });

  test("a fix list bought on a report takes 5 USD off that report's full unlock", () => {
    assert.equal(core.creditFor({ addons: ["fixlist"] }), 500);
    assert.equal(core.creditFor({ addons: ["alerts"] }), 0);
    assert.equal(core.priceForReport(fw(1), [], 500).usd, 14);
    assert.equal(core.priceForReport(fw(3), [], 500).usd, 24);
    assert.equal(core.chargedUsd({ purpose: "report", frameworks: fw(1), priceUsd: 14, creditCents: 500 }).usd, 14);
    assert.throws(() => core.chargedUsd({ purpose: "report", frameworks: fw(1), priceUsd: 14 }), /does not match/);
    assert.throws(() => core.chargedUsd({ purpose: "report", frameworks: fw(1), priceUsd: 9, creditCents: 1000 }), /not a QA-lab credit/);
    assert.equal(core.chargedUsd({ purpose: "report", frameworks: fw(1), priceUsd: 7, listUsd: 14, creditCents: 500 }).usd, 7);
    assert.throws(() => core.chargedUsd({ purpose: "report", frameworks: fw(1), priceUsd: 6.99, listUsd: 14, creditCents: 500 }), /out of range/);
    assert.equal(offers.discountFor(1400, 1, { coupon: { code: "STUDENT", percent: 50 } }).usd, 7);
  });

  test("a signed-in run is 39 USD flat", () => {
    assert.deepEqual(core.priceForCredentials(), { usd: 39, cents: 3900, count: 1, frameworks: [], layers: [] });
    assert.equal(core.chargedUsd({ purpose: "credentials", priceUsd: 39 }).usd, 39);
  });

  test("the 30-day passes are freelancer, team and pro, anchored on the same runs bought one by one", () => {
    assert.deepEqual(offers.MONTHLY_PLANS.map((plan) => [plan.id, plan.usd, plan.days, plan.runs, plan.pages, plan.depth, plan.frameworks, plan.tools]), [
      ["freelancer", 29, 30, 10, 20, 2, 3, false],
      ["team", 79, 30, 25, 100, 5, 8, false],
      ["pro", 189, 30, 60, 100, 5, core.FRAMEWORKS.length, true]
    ]);
    assert.deepEqual(offers.MONTHLY_PLANS.map((plan) => plan.anchorUsd), [290, 25 * (54 + 25), 60 * (19 + 5 * (core.FRAMEWORKS.length - 1) + 25)]);
    assert.ok(offers.MONTHLY_PLANS.every((plan) => plan.history === true));
    assert.equal(offers.planById("nope").id, "freelancer");
    assert.equal(offers.planById("team").id, "team");
  });
});

test.describe("account page file", () => {
  const offers = require("../../functions/url-review-offers");
  const now = Date.parse("2026-10-22T10:00:00Z");
  const report = (host) => ({ host, statement: "The checkout keeps a stale price after a coupon", cases: [{ id: "c1", layer: "UI", title: "Coupon total does not refresh" }], pages: [] });
  const rows = [
    { id: "a", email: "Ana@Example.com", status: "complete", createdAt: "2026-10-01T00:00:00Z", requestedUrl: "https://old.example.com/", report: report("old.example.com") },
    { id: "b", email: "ana@example.com", status: "complete", createdAt: "2026-10-20T00:00:00Z", requestedUrl: "https://new.example.com/", report: report("new.example.com") },
    { id: "c", email: "ana@example.com", status: "payment-due", createdAt: "2026-10-21T00:00:00Z" },
    { id: "d", email: "bo@example.com", status: "complete", createdAt: "2026-10-21T00:00:00Z", report: report("bo.example.com") }
  ];

  test("lists only the signed-in address's finished runs, newest first, with the rest veiled", () => {
    const file = offers.accountFile(rows, " ANA@example.com ", now);
    assert.equal(file.email, "ana@example.com");
    assert.equal(file.open, false);
    assert.deepEqual(file.runs.map((run) => run.id), ["b", "a"]);
    assert.equal(file.runs[0].url, "https://new.");
    assert.notEqual(file.runs[0].cases[0].title, "Coupon total does not refresh");
  });

  test("a 30-day pass opens only the runs made on it, and they stay open after it lapses", () => {
    const onPass = { id: "f", email: "ana@example.com", status: "complete", passId: "p", passPlan: "freelancer", createdAt: "2026-10-21T18:00:00Z", requestedUrl: "https://pass.example.com/", report: report("pass.example.com") };
    for (const grant of [{ paid: true }, { paid: false, localPass: true }]) {
      const withPass = rows.concat([onPass, Object.assign({ id: "p", email: "ana@example.com", status: "monthly-pass", paidUntil: "2026-11-01T00:00:00Z" }, grant)]);
      const file = offers.accountFile(withPass, "ana@example.com", now);
      assert.equal(file.pass, true);
      assert.equal(file.open, false);
      assert.equal(file.charged, grant.paid);
      assert.equal(file.paidUntil, "2026-11-01T00:00:00Z");
      assert.deepEqual(file.runs.map((run) => [run.id, run.open]), [["f", true], ["b", false], ["a", false]]);
      assert.notEqual(file.runs[1].cases[0].title, "Coupon total does not refresh");
      const lapsed = offers.accountFile(withPass, "ana@example.com", Date.parse("2026-11-02T00:00:00Z"));
      assert.equal(lapsed.pass, false);
      assert.deepEqual(lapsed.runs.map((run) => [run.id, run.open]), [["f", true], ["b", false], ["a", false]]);
    }
    assert.equal(offers.accountFile(rows.concat([onPass]), "ana@example.com", now, { freeAccount: true }).runs.every((run) => run.open), true);
  });

  test("a paid or free report opens on its own, and a free-run account opens every report", () => {
    const mixed = rows.concat([{ id: "e", email: "ana@example.com", status: "complete", paid: true, free: true, createdAt: "2026-10-21T12:00:00Z", requestedUrl: "https://free.example.com/", report: report("free.example.com") }]);
    const file = offers.accountFile(mixed, "ana@example.com", now);
    assert.equal(file.open, false);
    assert.equal(file.pass, false);
    assert.deepEqual(file.runs.map((run) => [run.id, run.open]), [["e", true], ["b", false], ["a", false]]);
    assert.equal(file.runs[0].cases[0].title, "Coupon total does not refresh");
    assert.notEqual(file.runs[1].cases[0].title, "Coupon total does not refresh");
    const free = offers.accountFile(rows, "ana@example.com", now, { freeAccount: true });
    assert.equal(free.open, true);
    assert.equal(free.free, true);
    assert.equal(free.pass, false);
    assert.ok(free.runs.every((run) => run.open && run.cases[0].title === "Coupon total does not refresh"));
  });
});

test.describe("a run paid through a credit", () => {
  const offers = require("../../functions/url-review-offers");
  const desk = require("../../functions/url-review-desk");
  const now = Date.parse("2026-10-22T10:00:00Z");
  const value = core.validateIntake({ termsAccepted: true, termsVersion: core.TERMS_VERSION, name: "Ana Ruiz", email: "ana@example.com", reasonCode: "teaching", frameworks: ["Playwright"], url: "https://shop.example.com/" }).value;
  const report = (id, host) => ({ id, host, statement: "The checkout keeps a stale price", cases: [{ id: "c1", layer: "UI", title: "Coupon total does not refresh" }], pages: [] });
  const credit = { id: "k1", status: "run-credit", paid: true, deviceId: "d1", frameworks: ["Playwright"], tools: [], pages: 20, depth: 2, priceUsd: 19, createdAt: "2026-10-21T00:00:00Z" };
  const earlier = Object.assign(core.intakeRecord(value, report("r0", "old.example.com"), { deviceId: "d1" }), { createdAt: "2026-10-20T00:00:00Z" });

  test("opens its own report for its owner, and only that report", () => {
    const decision = core.judgeAttempts([credit, earlier], { deviceId: "d1", ip: "" }, value);
    assert.deepEqual(decision, { ok: true, consumeId: "k1" });
    const run = Object.assign(core.intakeRecord(value, report("r1", "shop.example.com"), { deviceId: "d1", creditId: decision.consumeId }), { createdAt: "2026-10-21T12:00:00Z" });
    assert.equal(run.paid, true);
    assert.equal(run.creditId, "k1");
    const file = offers.accountFile([credit, earlier, run], "ana@example.com", now);
    assert.equal(file.open, false);
    assert.deepEqual(file.runs.map((row) => [row.id, row.open]), [["r1", true], ["r0", false]]);
    assert.equal(file.runs[0].cases[0].title, "Coupon total does not refresh");
    assert.notEqual(file.runs[1].cases[0].title, "Coupon total does not refresh");
  });

  test("a sandbox credit pays only for a test run, and a live credit only for a live one", () => {
    const sandbox = Object.assign({}, credit, { id: "k2", test: true });
    assert.equal(core.judgeAttempts([sandbox, earlier], { deviceId: "d1", ip: "" }, value).consumeId, undefined);
    assert.equal(core.judgeAttempts([sandbox, earlier], { deviceId: "d1", ip: "" }, Object.assign({}, value, { test: true })).consumeId, "k2");
    assert.equal(core.judgeAttempts([credit, earlier], { deviceId: "d1", ip: "" }, Object.assign({}, value, { test: true })).consumeId, undefined);
  });

  test("a credit whose paid run failed and was given back pays for the next run", () => {
    const spent = { id: "u1", status: "run-credit-used", creditId: "k1", deviceId: "d1" };
    assert.equal(core.judgeAttempts([credit, spent, earlier], { deviceId: "d1", ip: "" }, value).consumeId, undefined);
    const returned = Object.assign({}, spent, { status: "run-credit-returned" });
    assert.equal(core.judgeAttempts([credit, returned, earlier], { deviceId: "d1", ip: "" }, value).consumeId, "k1");
  });

  test("the owner alert for a paid credit names the payer, and a returned credit has its own title", () => {
    const note = desk.alertFrom("run-paid", { status: "run-credit", name: "Ana Ruiz", email: "ana@example.com", payerEmail: "ana.pay@example.com", sessionId: "5O190127TN364715T" });
    assert.match(note.detail, /Who: Ana Ruiz/);
    assert.match(note.detail, /PayPal payer: ana\.pay@example\.com/);
    assert.equal(desk.alertFrom("credit-returned", { status: "failed" }).title, "A paid run failed and its credit was given back");
  });

  test("a credit bought but not yet used unlocks nothing", () => {
    const file = offers.accountFile([credit, earlier], "ana@example.com", now);
    assert.deepEqual(file.runs.map((row) => [row.id, row.open]), [["r0", false]]);
    assert.equal(earlier.paid, false);
    assert.equal(earlier.creditId, "");
  });

  test("a normal unpaid run stays blurred", () => {
    const run = core.intakeRecord(value, report("r2", "shop.example.com"), { deviceId: "d1" });
    assert.equal(run.paid, false);
    assert.equal(offers.accountFile([run], "ana@example.com", now).runs[0].open, false);
  });

  test("the desk counts the payment once, through the credit row", () => {
    const run = Object.assign(core.intakeRecord(value, report("r1", "shop.example.com"), { deviceId: "d1", creditId: "k1" }), { createdAt: "2026-10-21T12:00:00Z" });
    const used = { id: "u1", status: "run-credit-used", creditId: "k1", deviceId: "d1", createdAt: "2026-10-21T11:59:00Z" };
    assert.equal(desk.snapshot([credit, used, run], [], [], [], []).tally.paid, 1);
  });
});

test.describe("return price", () => {
  const offers = require("../../functions/url-review-offers");
  const now = Date.parse("2026-10-20T15:00:00Z");
  const ago = (days) => new Date(now - days * 24 * 60 * 60 * 1000).toISOString();

  test("the ladder and a coupon never stack; the better one wins", () => {
    assert.deepEqual(offers.discountFor(1900, 1, { returns: 2 }), { listUsd: 19, usd: 16.15, cents: 1615, percent: 15, source: "return", code: "" });
    const coupon = offers.discountFor(1900, 1, { returns: 1, coupon: { code: "BACK-TEST", percent: 20 } });
    assert.equal(coupon.usd, 15.2);
    assert.equal(coupon.source, "coupon");
    assert.equal(coupon.code, "BACK-TEST");
    assert.equal(offers.discountFor(1900, 1, { returns: 3, coupon: { code: "LOW", percent: 10 } }).source, "return");
    assert.equal(offers.discountFor(1900, 1, {}).percent, 0);
  });

  test("no discount goes under half the list price, and a coupon stops at 50 percent", () => {
    const deal = offers.discountFor(1900, 1, { coupon: { code: "BIG", percent: 90 } });
    assert.equal(deal.usd, 9.5);
    assert.equal(deal.percent, 50);
    assert.equal(offers.discountFor(2400, 2, { coupon: { code: "BIG", percent: 90 } }).usd, 12);
    assert.equal(offers.discountFor(1900, 1, { coupon: { code: "STUDENT", percent: 50 } }).usd, 9.5);
    assert.equal(offers.applyReturn(5400, 8, 3).cents, 4320);
    assert.equal(offers.applyReturn(5400, 8, 3).floorUsd, 27);
  });

  test("a code with perEmail opens once per address, and stays closed when the address is unknown", () => {
    const student = { code: "STUDENT", percent: 50, purposes: ["report"], perEmail: 1 };
    assert.equal(offers.couponOpen(student, "report", "abc", now, 0), true);
    assert.equal(offers.couponOpen(student, "report", "abc", now, 1), false);
    assert.equal(offers.couponOpen(student, "report", "abc", now), false);
    assert.equal(offers.couponOpen(student, "new-run", "", now, 0), false);
    assert.equal(offers.couponOpen({ percent: 15 }, "report", "abc", now), true);
  });

  test("a coupon is open only inside its dates, uses, purposes, and report", () => {
    const coupon = { percent: 15, purposes: ["report", "new-run"], reportId: "abc", maxUses: 1, uses: 0, validUntil: ago(-3) };
    assert.equal(offers.couponOpen(coupon, "report", "abc", now), true);
    assert.equal(offers.couponOpen(coupon, "report", "other", now), false);
    assert.equal(offers.couponOpen(coupon, "new-run", "", now), true);
    assert.equal(offers.couponOpen(coupon, "cases", "abc", now), false);
    assert.equal(offers.couponOpen(Object.assign({}, coupon, { uses: 1 }), "report", "abc", now), false);
    assert.equal(offers.couponOpen(Object.assign({}, coupon, { validUntil: ago(1) }), "report", "abc", now), false);
    assert.equal(offers.cleanCode(" back-7q2m "), "BACK-7Q2M");
    assert.equal(offers.cleanCode("<script>"), "");
  });

  test("a coupon sent with a follow-up note is open 14 days and kept 12 months", () => {
    const coupon = offers.returnCoupon({ percent: 5, reportId: "abc", email: "ana@example.com" }, now);
    assert.equal(coupon.percent, 10);
    assert.equal(coupon.email, "ana@example.com");
    assert.equal(Date.parse(coupon.validUntil) - now, 14 * 86400000);
    assert.equal(coupon.expireAt.getTime() - now, 365 * 86400000);
    assert.equal(offers.couponOpen(coupon, "report", "abc", now), true);
  });

  test("returns count finished runs in the 30 days before", () => {
    const rows = [{ status: "complete", createdAt: ago(2) }, { status: "complete", createdAt: ago(40) }, { status: "blocked", createdAt: ago(1) }];
    assert.equal(offers.returnsBefore(rows, new Date(now).toISOString()), 1);
  });

  test("checkout takes a discounted charge only between the floor and the list price", () => {
    const base = { purpose: "report", frameworks: ["Playwright"], tools: [], listUsd: 19 };
    assert.equal(core.chargedUsd(Object.assign({}, base, { priceUsd: 16.15 })).usd, 16.15);
    assert.equal(core.chargedUsd({ purpose: "report", frameworks: ["Playwright"], tools: [], priceUsd: 19 }).usd, 19);
    assert.throws(() => core.chargedUsd(Object.assign({}, base, { priceUsd: 5 })), /out of range/);
    assert.throws(() => core.chargedUsd(Object.assign({}, base, { priceUsd: 16.15, listUsd: 18 })), /does not match/);
  });

  test("a paid reopen sends a preview with the hidden part of each line replaced, and no fix-kit files", () => {
    const secret = "send max-age=31536000 with includeSubDomains on every response";
    const report = {
      id: "ab12",
      cases: [{ id: "SE-01", title: "Strict-Transport-Security is sent on the start page", why: "The header was missing. " + secret, steps: ["open"] }],
      insights: {
        score: { overall: 63 },
        findings: [{ title: "HSTS", evidence: "Missing on 7 pages. " + secret, fix: "Add it. " + secret }],
        fixkit: { csp: "default-src 'self' https://cdn.example.com", headers: [{ name: "HSTS", missing: true, value: secret }], jsonLd: "{...}" }
      }
    };
    const preview = core.previewReport(report);
    const text = JSON.stringify(preview);
    assert.ok(!text.includes(secret));
    assert.notEqual(preview.insights.fixkit.csp, report.insights.fixkit.csp);
    assert.match(preview.insights.fixkit.csp, /^default-src 'self' /);
    assert.equal(preview.preview, true);
    assert.equal(preview.insights.score.overall, 63);
    assert.match(preview.insights.findings[0].evidence, /^Missing on 7 pages\. /);
    assert.equal(preview.insights.findings[0].evidence.length, report.insights.findings[0].evidence.length);
    assert.equal(preview.cases[0].steps, undefined);
    assert.deepEqual(preview.insights.fixkit.headers, [{ name: "HSTS", missing: true }]);
    assert.equal(preview.insights.fixkit.jsonLd, true);
    assert.ok(report.cases[0].steps, "the stored report is not changed");
  });

  test("the peso quote and the PayPal capture accept a discounted price, and nothing under the floor", () => {
    assert.equal(core.priceMatches(19), true);
    assert.equal(core.priceMatches(16.15), true);
    assert.equal(core.priceMatches(9.5), true);
    assert.equal(core.priceMatches(14), true);
    assert.equal(core.priceMatches(7), true);
    assert.equal(core.priceMatches(6.99), false);
    assert.equal(core.priceMatches(39), true);
    assert.equal(core.priceMatches(500), false);
    const order = (value) => ({ status: "COMPLETED", purchase_units: [{ custom_id: "ab12", payments: { captures: [{ status: "COMPLETED", amount: { value, currency_code: "USD" } }] } }] });
    assert.equal(core.paypalPaid(order("16.15")).paid, true);
    assert.equal(core.paypalPaid(order("16.15")).amount, 16.15);
    assert.equal(core.paypalPaid(order("3.00")).paid, false);
  });

  test("a capture PayPal completed at a price that is not ours still reads as captured, so it is recorded", () => {
    const order = { status: "COMPLETED", purchase_units: [{ custom_id: "ab12", payments: { captures: [{ id: "3C679366HH908993F", status: "COMPLETED", amount: { value: "3.00", currency_code: "USD" } }] } }] };
    const read = core.paypalPaid(order);
    assert.equal(read.paid, false);
    assert.equal(read.captured, true);
    assert.equal(read.captureId, "3C679366HH908993F");
    assert.equal(read.capturedAmount, 3);
    assert.equal(read.pending, false);
    const payer = core.paypalPaid(Object.assign({}, order, { payer: { email_address: " Ana@Example.com ", name: { given_name: "Ana", surname: "Ruiz" } } }));
    assert.deepEqual([payer.payerEmail, payer.payerName], ["ana@example.com", "Ana Ruiz"]);
  });

  test("each PayPal event names the order or capture it is about", () => {
    assert.equal(core.paypalEventIds({ event_type: "CHECKOUT.ORDER.APPROVED", resource: { id: "5O190127TN364715T" } }).orderId, "5O190127TN364715T");
    const captured = core.paypalEventIds({ event_type: "PAYMENT.CAPTURE.COMPLETED", resource: { id: "3C679366HH908993F", supplementary_data: { related_ids: { order_id: "5O190127TN364715T" } } } });
    assert.deepEqual([captured.orderId, captured.captureId], ["5O190127TN364715T", "3C679366HH908993F"]);
    const refund = core.paypalEventIds({ event_type: "PAYMENT.CAPTURE.REFUNDED", resource: { id: "1JU08902781691411", amount: { value: "9.50" }, links: [{ rel: "self", href: "https://api.paypal.com/v2/payments/refunds/1JU08902781691411" }, { rel: "up", href: "https://api.paypal.com/v2/payments/captures/3C679366HH908993F" }] } });
    assert.deepEqual([refund.captureId, refund.refundAmount], ["3C679366HH908993F", 9.5]);
    assert.equal(core.paypalEventIds({ event_type: "PAYMENT.CAPTURE.REFUNDED", resource: { status: "COMPLETED" } }).disputeStatus, "");
    const dispute = core.paypalEventIds({ event_type: "CUSTOMER.DISPUTE.CREATED", resource: { dispute_id: "PP-D-27803", status: "OPEN", disputed_transactions: [{ seller_transaction_id: "3C679366HH908993F" }] } });
    assert.deepEqual([dispute.captureId, dispute.disputeId, dispute.disputeStatus], ["3C679366HH908993F", "PP-D-27803", "OPEN"]);
    assert.equal(core.paypalEventIds({ event_type: "CHECKOUT.ORDER.APPROVED", resource: { id: "../x" } }).orderId, "");
  });

  test("a webhook event without a webhook id or signature headers is refused before PayPal is asked", async () => {
    assert.equal(await core.verifyPayPalWebhook({ webhookId: "" }, { "paypal-transmission-id": "a", "paypal-transmission-sig": "b" }, {}), false);
    assert.equal(await core.verifyPayPalWebhook({ webhookId: "8PT597110X687430LKGECATA" }, {}, {}), false);
  });
});

test.describe("PayPal refunds and disputes", () => {
  const offers = require("../../functions/url-review-offers");
  const mail = require("../../functions/url-review-mail");
  const rows = [
    { id: "credit-ab12", status: "run-credit", paid: true, sessionId: "5O190127TN364715T" },
    { id: "paid-report-r1", status: "paid-report", paid: true, reportId: "r1" },
    { id: "paid-cases-ab12", status: "paid-addon", paid: true, purpose: "cases", reportId: "r1" },
    { id: "r1", status: "complete", paid: true }
  ];

  test("a full refund takes back the credit, the report unlock and the add-on", () => {
    const updates = offers.reversalUpdates(rows, { kind: "refund", at: "2026-10-25T00:00:00Z" });
    assert.deepEqual(updates.find((u) => u.id === "credit-ab12").set.status, "run-credit-refunded");
    assert.equal(updates.find((u) => u.id === "paid-report-r1").set.refunded, true);
    assert.deepEqual(updates.find((u) => u.removeAddon), { id: "r1", removeAddon: "cases" });
    assert.equal(updates.find((u) => u.id === "r1" && u.set).set.paid, false);
  });

  test("a partial refund and a dispute only mark the payment rows and keep access", () => {
    const partial = offers.reversalUpdates(rows, { kind: "partial-refund", refundedUsd: 5 });
    assert.equal(partial.length, 3);
    assert.ok(partial.every((u) => u.set.refundedUsd === 5 && u.set.paid === undefined && u.set.status === undefined));
    const open = offers.reversalUpdates(rows, { kind: "dispute", status: "OPEN", disputeId: "PP-D-1" });
    assert.ok(open.every((u) => u.set.disputed === true));
    assert.ok(offers.reversalUpdates(rows, { kind: "dispute", status: "RESOLVED" }).every((u) => u.set.disputed === false));
  });

  test("refunded money leaves the period revenue", () => {
    const sum = mail.money([
      { status: "paid-report", paid: true, priceUsd: 19 },
      { status: "paid-report", paid: true, priceUsd: 19, refunded: true },
      { status: "paid-addon", paid: true, priceUsd: 19, refundedUsd: 4 },
      { status: "run-credit-refunded", paid: true, priceUsd: 19 }
    ]);
    assert.deepEqual([sum.usd, sum.paidCount], [34, 2]);
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

test.describe("publishing user reviews to Live Reports", () => {
  const publish = require("../../functions/url-review-publish");
  const report = (host, extra) => Object.assign({
    id: "r-" + host, host, fetchedAt: "2026-10-21T10:00:00Z", finalUrl: "https://" + host + "/?token=abc#x",
    limits: { pagesRead: 6 }, pages: [{ url: "https://" + host + "/", status: 200, challenge: "", error: "" }],
    log: ["fetched"], agent: "ua", signature: "sig", cases: [{ id: "c" }],
    observed: { lang: "en", signals: { hreflang: 2 }, cookies: ["sid=1"] },
    insights: { score: { overall: 71, grade: "C", areas: {} }, findings: [{ key: "sec-hsts", verdict: "fail", area: "Security", title: "HSTS is not sent", evidence: "mail me at owner@site.com" }], caseVerdicts: {}, graph: {} }
  }, extra);
  const record = (host, extra, rep) => Object.assign({ createdAt: "2026-10-21T10:00:00Z", status: "complete", name: "Ana", email: "ana@x.com", reason: "client", ip: "1.2.3.4", deviceId: "d1", report: report(host, rep) }, extra);

  test("a complete public review goes out", () => {
    assert.equal(publish.heldReason(record("acme.de"), []), "");
  });

  test("stopped, thin, blocked, shell, own, reserved, and unlisted reviews are held", () => {
    assert.equal(publish.heldReason(record("acme.de", { status: "stopped" }), []), "not-complete");
    assert.equal(publish.heldReason(record("acme.de", {}, { limits: { pagesRead: 1 } }), []), "too-few-pages");
    assert.equal(publish.heldReason(record("acme.de", {}, { limits: { pagesRead: 5, timedOut: true } }), []), "timed-out");
    assert.equal(publish.heldReason(record("acme.de", {}, { pages: [{ status: 403 }] }), []), "start-page-blocked");
    assert.equal(publish.heldReason(record("acme.de", {}, { pages: [{ status: 200, challenge: "cloudflare" }] }), []), "start-page-blocked");
    const shell = report("acme.de");
    shell.insights.findings.push({ key: "geo-js-only", verdict: "fail", area: "GEO", title: "Empty without JavaScript" });
    assert.equal(publish.heldReason(record("acme.de", { report: shell }), []), "javascript-shell");
    assert.equal(publish.heldReason(record("www.carlosandmunoz.com"), []), "own-or-test");
    assert.equal(publish.heldReason(record("example.com"), []), "own-or-test");
    assert.equal(publish.heldReason(record("shop.test"), []), "own-or-test");
    assert.equal(publish.heldReason(record("10.0.0.1"), []), "not-public");
    assert.equal(publish.heldReason(record("blog.acme.de"), ["acme.de"]), "unlisted");
    assert.equal(publish.heldReason(record("acme.de", {}, { insights: { findings: [] } }), []), "no-score");
  });

  test("the desk shows whether each run goes to Live Reports, and why it is held", () => {
    const desk = require("../../functions/url-review-desk");
    assert.deepEqual(desk.liveState(record("acme.de"), []), { listed: true, reason: "", why: "" });
    assert.deepEqual(desk.liveState(record("acme.de"), ["acme.de"]), { listed: false, reason: "unlisted", why: "the owner asked to be left out" });
    assert.equal(desk.liveState({ status: "payment-due" }, []), null);
    const run = desk.snapshot([Object.assign({ id: "a1" }, record("acme.de"))], [], [], [], ["acme.de"]).runs[0];
    assert.equal(run.live.reason, "unlisted");
  });

  test("an asker's opt-out, a test run, and a host Safe Browsing flags are held", () => {
    assert.equal(publish.heldReason(record("acme.de", { unlisted: true }), []), "asker-opted-out");
    assert.equal(publish.heldReason(record("acme.de", { unlisted: false }), []), "");
    assert.equal(publish.heldReason(record("acme.de", { test: true }), []), "test-run");
    const flagged = report("acme.de");
    flagged.insights.findings.push({ key: "sec-safebrowsing", verdict: "fail", area: "Security", title: "Google lists the site as phishing" });
    assert.equal(publish.heldReason(record("acme.de", { report: flagged }), []), "safe-browsing-flagged");
    const clear = report("acme.de");
    clear.insights.findings.push({ key: "sec-safebrowsing", verdict: "pass", area: "Security", title: "Not flagged" });
    assert.equal(publish.heldReason(record("acme.de", { report: clear }), []), "");
    const { reports, held } = publish.selectPublishable([record("a.de", { unlisted: true }), record("b.de")], []);
    assert.deepEqual(reports.map((r) => r.report.host), ["b.de"]);
    assert.deepEqual(held, { "asker-opted-out": 1 });
  });

  test("the public copy carries no requester details or engine internals", () => {
    const { reports } = publish.selectPublishable([record("acme.de")], []);
    const text = JSON.stringify(reports);
    for (const word of ["Ana", "ana@x.com", "client", "1.2.3.4", "d1", "token=abc", "signature", "caseVerdicts", "graph", "\"log\"", "\"agent\"", "sid=1", "\"id\":\"c\""]) {
      assert.ok(!text.includes(word), word + " leaked");
    }
    assert.equal(reports[0].report.finalUrl, "https://acme.de/");
    assert.equal(reports[0].report.limits.pagesRead, 6);
  });

  test("one review per host, the newest, oldest host first", () => {
    const { reports, held } = publish.selectPublishable([
      record("b.de", { createdAt: "2026-10-21T09:00:00Z" }),
      record("a.de", { createdAt: "2026-10-21T08:00:00Z" }),
      record("www.a.de", { createdAt: "2026-10-21T11:00:00Z" }),
      record("c.de", { status: "stopped" })
    ], []);
    assert.deepEqual(reports.map((r) => r.report.host), ["b.de", "www.a.de"]);
    assert.deepEqual(held, { "not-complete": 1 });
  });
});

test("functions/.env.example lists every key the functions read", () => {
  const dir = path.join(__dirname, "../../functions");
  const listed = new Set(fs.readFileSync(path.join(dir, ".env.example"), "utf8").match(/^[A-Z0-9_]+(?==)/gm));
  const runtime = new Set(["GCLOUD_PROJECT", "GCP_PROJECT"]);
  const read = new Set();
  fs.readdirSync(dir).filter((name) => name.endsWith(".js")).forEach((name) => {
    for (const m of fs.readFileSync(path.join(dir, name), "utf8").matchAll(/process\.env\.([A-Z0-9_]+)/g)) read.add(m[1]);
  });
  assert.deepEqual([...read].filter((key) => !listed.has(key) && !runtime.has(key)).sort(), []);
});

test("the intake takes the current terms and the ones just before, and records which", () => {
  const body = (termsVersion) => ({ termsAccepted: true, termsVersion, name: "Ana Ruiz", email: "ana@example.org", reasonCode: "teaching", frameworks: ["Playwright"], url: "https://example.org/" });
  const now = core.validateIntake(body(core.TERMS_VERSION));
  assert.deepEqual(now.errors, []);
  assert.equal(now.value.termsVersion, core.TERMS_VERSION);
  assert.equal(core.validateIntake(body("2026-10-23")).value.termsVersion, "2026-10-23");
  assert.ok(core.validateIntake(body("2026-09-01")).errors.some((e) => e.field === "terms"));
});

test("the review page sends the terms version the server takes as current", () => {
  const page = fs.readFileSync(path.join(__dirname, "../../js/qa-review.js"), "utf8").match(/TERMS_VERSION = "([^"]+)"/)[1];
  assert.equal(page, core.TERMS_VERSION);
});

test("payment rows are kept until January 1 of the sixth year after the payment", () => {
  assert.equal(core.paymentExpireAt("2026-10-22T12:00:00Z").toISOString(), "2032-01-01T00:00:00.000Z");
  assert.equal(core.paymentExpireAt("2026-01-01T00:00:00Z").toISOString(), "2032-01-01T00:00:00.000Z");
  assert.ok(core.paymentExpireAt().getTime() > Date.now() + 5 * 365 * 24 * 60 * 60 * 1000);
});

test("the optional don't-publish box rides from the form to the stored record and a re-run", () => {
  const body = (extra) => Object.assign({ termsAccepted: true, termsVersion: core.TERMS_VERSION, name: "Ana Ruiz", email: "ana@example.org", reasonCode: "teaching", frameworks: ["Playwright"], url: "https://example.org/" }, extra);
  assert.equal(core.validateIntake(body()).value.unlisted, false);
  assert.equal(core.validateIntake(body({ unlisted: "yes" })).value.unlisted, false);
  const value = core.validateIntake(body({ unlisted: true })).value;
  assert.equal(value.unlisted, true);
  assert.equal(core.intakeRecord(value, { id: "r1" }, {}).unlisted, true);
  assert.equal(core.intakeRecord(core.validateIntake(body()).value, { id: "r2" }, {}).unlisted, false);
  assert.equal(require("../../functions/url-review-failures").failureRecord(Object.assign({ kind: "failed", runId: "a1" }, value)).intake.unlisted, true);
});

const failures = require("../../functions/url-review-failures");
// The failure tests are written against the fixes up to #365; a later fix to a cause they use would re-run their example failures.
failures.FIXES.splice(failures.FIXES.findIndex((fix) => fix.ref === "#365") + 1);

test("failure causes are classed from the review's own messages", () => {
  const cases = [
    ["The site's bot protection refused the review (status 403, an AWS WAF bot check), in the plain read and in headless Chrome.", "bot-protection"],
    ["The site answered with a Cloudflare bot check (status 403) instead of the page.", "bot-protection"],
    ["The site's bot protection refused the plain read (status 403), and headless Chrome did not finish (the browser was busy).", "browser"],
    ["The URL returned status 404, in the plain read and in headless Chrome.", "status"],
    ["The URL returned status 403.", "bot-protection"],
    ["The URL returned status 429.", "bot-protection"],
    ["The URL returned status 410.", "status"],
    ["The site redirected to http://lg.com.co/, an http:// address. The review only follows https.", "http-redirect"],
    ["The host name did not resolve.", "dns"],
    ["The page took too long.", "timeout"],
    ["The page redirected too many times.", "redirect-loop"],
    ["The URL did not return an HTML page.", "not-html"],
    ["That address is not a public website.", "input"],
    ["certificate has expired", "tls"],
    ["connect ECONNREFUSED 1.2.3.4:443", "connection"],
    ["Value for argument \"data\" is not a valid Firestore document. Cannot use \"undefined\" as a Firestore value (found in field \"report.cases.`28`.path\").", "save"],
    ["Cannot read properties of undefined (reading 'x')", "unknown"]
  ];
  cases.forEach(([message, id]) => assert.equal(failures.causeOf(message).id, id, message));
  const waf = failures.causeOf(cases[0][0]);
  assert.equal(waf.status, 403);
  assert.equal(waf.vendor, "AWS WAF");
});

test("a failed run keeps its log, error and timings for 90 days", () => {
  const error = new Error("The URL returned status 404.");
  error.status = 422;
  const lines = Array.from({ length: 1600 }, (_, i) => ({ t: i * 10, text: "line " + i + " " + "x".repeat(500) }));
  const record = failures.failureRecord({ kind: "failed", runId: "abc123", url: "https://Shop.example.com/x", name: "Ana", email: "ana@example.com", error, lines, startedAt: 1000, endedAt: 61000, pages: 20, depth: 2, frameworks: ["playwright"] });
  assert.equal(record.kind, "failed");
  assert.equal(record.host, "shop.example.com");
  assert.equal(record.error.message, "The URL returned status 404.");
  assert.equal(record.error.status, 422);
  assert.ok(record.error.stack.length > 0);
  assert.deepEqual({ id: record.cause.id, status: record.cause.status }, { id: "status", status: 404 });
  assert.equal(record.lines.length, failures.MAX_LINES);
  assert.equal(record.linesCut, 100);
  assert.equal(record.lineCount, 1600);
  assert.equal(record.lines[0].text.length, 400);
  assert.equal(record.lines[299].text.slice(0, 9), "line 299 ");
  assert.equal(record.lines[300].text.slice(0, 9), "line 400 ");
  assert.equal(record.timings.ms, 60000);
  assert.equal(record.expireAt.getTime() - 61000, 90 * 86400000);
  assert.equal(record.diagnosedAt, null);
  assert.deepEqual(record.options, { pages: 20, depth: 2, pageLang: "", section: false, frameworks: ["playwright"] });

  const stopped = failures.failureRecord({ kind: "stopped", url: "https://shop.example.com/", lines: [] });
  assert.equal(stopped.error, null);
  assert.equal(stopped.cause, null);
  assert.equal("diagnosedAt" in stopped, false);
});

test("a failed alert with no saved log becomes a failure to diagnose", () => {
  const record = failures.failureFromAlert({ id: "a1", at: "2026-10-21T15:00:00.000Z", kind: "failed", runId: "r1", url: "https://bbva.com.co/", detail: "Who: Ana\nReason: The site's bot protection refused the review (status 403), in the plain read and in headless Chrome.\nStatus: failed" });
  assert.equal(record.runId, "r1");
  assert.equal(record.cause.id, "bot-protection");
  assert.equal(record.fromAlert, "a1");
  assert.deepEqual(record.lines, []);
  assert.equal(record.at, "2026-10-21T15:00:00.000Z");
});

test("the diagnosis says whether a failure's cause has cleared", () => {
  const bot = { cause: failures.causeOf("The site's bot protection refused the review (status 403), in the plain read and in headless Chrome.") };
  const refusedPlain = { dns: { addresses: ["1.2.3.4"] }, plain: { status: 403, challenge: "", html: true, url: "https://bbva.com.co/" } };
  const read = failures.diagnose(bot, Object.assign({}, refusedPlain, { browser: { ok: true, docStatus: 200, untagged: false } }));
  assert.deepEqual([read.now, read.cleared, read.rerun], ["browser-read", true, true]);
  assert.match(read.summary, /^The site's bot protection refused the review\. Cleared: /);
  assert.equal(failures.diagnose(bot, Object.assign({}, refusedPlain, { browser: { ok: true, docStatus: 200, untagged: true } })).now, "browser-untagged");
  const still = failures.diagnose(bot, Object.assign({}, refusedPlain, { browser: { ok: true, docStatus: 403, challenge: "AWS WAF" } }));
  assert.deepEqual([still.now, still.cleared], ["bot-protection", false]);
  assert.match(still.summary, /Still: .*AWS WAF/);
  assert.equal(failures.diagnose(bot, Object.assign({}, refusedPlain, { browser: { ok: false, error: "the browser was busy" } })).now, "browser");
  const missing = { dns: {}, plain: { status: 404, challenge: "", html: true } };
  assert.equal(failures.diagnose(bot, missing).now, "status");
  assert.equal(failures.diagnose(bot, Object.assign({}, missing, { browser: { ok: true, docStatus: 404 } })).now, "status");
  assert.equal(failures.diagnose(bot, { dns: { error: "ENOTFOUND" } }).now, "dns");
  assert.equal(failures.diagnose(bot, { dns: {}, plain: { hops: [], httpRedirect: "http://lg.com.co/" } }).now, "http-redirect");
  assert.equal(failures.diagnose(bot, { dns: {}, plain: { error: "The page took too long." } }).now, "timeout");
  assert.equal(failures.diagnose(bot, { dns: {}, plain: { status: 503, html: true } }).now, "status");
  assert.equal(failures.diagnose(bot, { dns: {}, plain: { status: 200, html: false, contentType: "application/pdf" } }).now, "not-html");
  const fine = failures.diagnose({ cause: failures.causeOf("The page took too long.") }, { dns: {}, plain: { status: 200, html: true } });
  assert.deepEqual([fine.now, fine.cleared, fine.rerun], ["readable", true, true]);
});

test("the daily probe checks the connection after a plain read that timed out, and tries headless Chrome when it opens (#573)", () => {
  const slow = { hops: [], error: "The page took too long.", code: "" };
  const unreachable = { hops: [], error: "The page took too long: the site accepted no connection in 8 s.", code: "" };
  assert.equal(failures.probeNeedsTcp(slow), true);
  assert.equal(failures.probeNeedsTcp(unreachable), true);
  assert.equal(failures.probeNeedsTcp({ hops: [], error: "socket hang up", code: "ECONNRESET" }), true);
  assert.equal(failures.probeNeedsTcp({ hops: [], error: "The host name did not resolve." }), false);
  assert.equal(failures.probeNeedsTcp({ hops: [], error: "certificate has expired", code: "CERT_HAS_EXPIRED" }), false);
  assert.equal(failures.probeNeedsTcp({ hops: [], status: 404, html: true }), false);
  assert.equal(failures.probeNeedsBrowser({ status: 404, html: true }), true);
  assert.equal(failures.probeNeedsBrowser({ status: 200, html: true, challenge: "Imperva" }), true);
  assert.equal(failures.probeNeedsBrowser({ status: 200, html: true }), false);
  assert.equal(failures.probeNeedsBrowser({ hops: [], httpRedirect: "http://lg.com.co/" }), false);
  assert.equal(failures.probeNeedsBrowser(slow, { open: true, ms: 40 }), true);
  assert.equal(failures.probeNeedsBrowser(slow, { open: false, error: "no answer in 6 s" }), false);
  assert.equal(failures.probeNeedsBrowser(slow, { open: null, error: "The host name did not resolve." }), false);
  assert.equal(failures.probeNeedsBrowser(slow), false);
  assert.equal(failures.unreadUrl({ hops: [{ url: "https://uniminuto.edu.co/", status: 301, location: "https://www.uniminuto.edu.co/" }], error: "x" }, "https://uniminuto.edu.co/"), "https://www.uniminuto.edu.co/");
  assert.equal(failures.unreadUrl({ hops: [{ url: "https://hpe.com/", status: 301, location: "/us/en/home.html" }], error: "x" }, "https://hpe.com/"), "https://hpe.com/us/en/home.html");
  assert.equal(failures.unreadUrl(slow, "https://hpe.com/"), "https://hpe.com/");

  // uniminuto.edu.co: no TCP connection on 443 at all.
  const timeout = { cause: failures.causeOf("The page took too long.") };
  const down = failures.diagnose(timeout, { dns: { addresses: ["1.2.3.4"] }, plain: slow, tcp: { open: false, error: "no answer in 6 s", ms: 6000 } });
  assert.deepEqual([down.now, down.site, down.cleared, down.rerun], ["down", true, false, false]);
  assert.equal(down.summary, "The site took too long. Now: The host accepts no connection on port 443 (no answer in 6 s), so the site looks down.");
  // www.hpe.com: TLS completes, HTTP/1.1 hangs, and Chrome is reset with ERR_HTTP2_PROTOCOL_ERROR.
  const silent = failures.diagnose(timeout, { dns: { addresses: ["1.2.3.4"] }, plain: slow, tcp: { open: true, ms: 40 }, browser: { ok: false, error: "net::ERR_HTTP2_PROTOCOL_ERROR at https://www.hpe.com/" } });
  assert.deepEqual([silent.now, silent.site, silent.cleared], ["no-answer", false, false]);
  assert.match(silent.nowLabel, /^The host accepts a connection, but it answers neither the plain read \(The page took too long\.\) nor headless Chrome \(net::ERR_HTTP2_PROTOCOL_ERROR/);
  const chrome = failures.diagnose(timeout, { dns: {}, plain: slow, tcp: { open: true, ms: 40 }, browser: { ok: true, docStatus: 200, words: 900 } });
  assert.deepEqual([chrome.now, chrome.cleared, chrome.rerun, chrome.site], ["browser-unread", true, true, false]);
  const walled = failures.diagnose(timeout, { dns: {}, plain: slow, tcp: { open: true, ms: 40 }, browser: { ok: true, docStatus: 403, challenge: "Akamai" } });
  assert.deepEqual([walled.now, walled.site], ["bot-protection", false]);
  const gone = failures.diagnose(timeout, { dns: {}, plain: slow, tcp: { open: true, ms: 40 }, browser: { ok: true, docStatus: 404 } });
  assert.deepEqual([gone.now, gone.site], ["status", false]);
  const busy = failures.diagnose(timeout, { dns: {}, plain: slow, tcp: { open: true, ms: 40 }, browser: { ok: false, error: "the browser was busy" } });
  assert.deepEqual([busy.now, busy.site], ["timeout", false]);
  assert.match(busy.nowLabel, /, and headless Chrome did not finish \(the browser was busy\)$/);

  const detail = failures.failureDetail(failedAt("2026-10-24T10:00:00Z", { probe: { dns: { addresses: ["1.2.3.4"] }, plain: slow, tcp: { open: false, error: "no answer in 6 s", ms: 6000 } } }));
  assert.deepEqual(detail.probeLines, ["DNS: 1 addresses", "Plain read with the review UA: fails (The page took too long.)", "TCP connection to port 443: does not open (no answer in 6 s)", "Headless Chrome: not tried, as the host accepts no connection"]);
  assert.equal(failures.failureDetail(failedAt("2026-10-24T10:00:00Z", { probe: { dns: {}, plain: slow, tcp: { open: true, ms: 41 }, browser: { ok: false, error: "x" } } })).probeLines[2], "TCP connection to port 443: opens in 41 ms");
});

test("response headers up to 64 KB are read, and past that the read names the limit instead of a parse error (#1097)", async () => {
  const net = require("node:net");
  let size = 0;
  const server = net.createServer((socket) => {
    socket.once("data", () => socket.end("HTTP/1.1 200 OK\r\ncontent-type: text/html\r\nx-pad: " + "a".repeat(size) + "\r\ncontent-length: 15\r\nconnection: close\r\n\r\n<body>hi</body>"));
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const target = new URL("http://127.0.0.1:" + server.address().port + "/");
  try {
    size = 30000;
    const read = await core.requestDirect(target, "127.0.0.1");
    assert.equal(read.status, 200);
    size = core.MAX_HEADER_BYTES + 1000;
    const error = await core.requestDirect(target, "127.0.0.1").then(() => null, (caught) => caught);
    assert.equal(error.code, "HEADERS_TOO_LARGE");
    assert.equal(error.message, "The site's response headers are past the 64 KB the plain request reads.");
    assert.equal(failures.causeOf(error.message).id, "headers");
    assert.equal(failures.causeOf("Parse Error: Header overflow").id, "headers");
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test("a start page six redirects away is read as Chrome reads it, and a longer chain is still a redirect loop (#1177)", async (t) => {
  const routes = {};
  for (let left = 0; left <= core.MAX_REDIRECTS + 1; left += 1) {
    routes["https://portal.example.com/" + left] = left ? { status: 302, headers: { location: "https://portal.example.com/" + (left - 1) } } : { status: 200, headers: { "content-type": "text/html" }, body: HTML };
  }
  t.after(fakeNetwork(routes));
  const read = await core.fetchPublic("https://portal.example.com/6");
  assert.deepEqual([read.status, read.hops, read.url], [200, 6, "https://portal.example.com/0"]);
  const probe = await core.probeRead("https://portal.example.com/6");
  assert.deepEqual([probe.status, probe.hops.length, probe.html], [200, 7, true]);
  const past = "https://portal.example.com/" + (core.MAX_REDIRECTS + 1);
  const error = await core.fetchPublic(past).then(() => null, (caught) => caught);
  assert.equal(error.message, "The page redirected too many times.");
  assert.equal(failures.causeOf(error.message).id, "redirect-loop");
  assert.equal((await core.probeRead(past)).error, "The page redirected too many times.");
});

test("a start page whose host cuts Chrome off for the review tag is loaded again as plain Chrome; a slow one is not (#1180)", () => {
  const { tagCut } = require("../../functions/url-review-browser");
  const start = { url: "https://hpe.com/", paths: [], html: true };
  assert.equal(tagCut(start, new Error("net::ERR_HTTP2_PROTOCOL_ERROR at https://www.hpe.com/")), "net::ERR_HTTP2_PROTOCOL_ERROR");
  assert.equal(tagCut(start, new Error("net::ERR_CONNECTION_RESET at https://hpe.com/")), "net::ERR_CONNECTION_RESET");
  assert.equal(tagCut(start, new Error("net::ERR_EMPTY_RESPONSE at https://hpe.com/")), "net::ERR_EMPTY_RESPONSE");
  assert.equal(tagCut(start, new Error("Navigation timeout of 20000 ms exceeded")), "");
  assert.equal(tagCut(start, new Error("net::ERR_NAME_NOT_RESOLVED at https://hpe.com/")), "");
  assert.equal(tagCut({ url: "https://hpe.com/", paths: [] }, new Error("net::ERR_HTTP2_PROTOCOL_ERROR at https://hpe.com/")), "");
  assert.equal(tagCut(start, null), "");
});

test("an http:// redirect is read over https first, as Chrome does, and fails as an http:// redirect only when https gives no page (#1179)", async (t) => {
  t.after(fakeNetwork({
    "https://garena.example.com/": { status: 302, headers: { location: "http://intl.garena.example.com/" } },
    "https://intl.garena.example.com/": { status: 200, headers: { "content-type": "text/html" }, body: HTML },
    "https://shop.example.com/": { status: 301, headers: { location: "http://old.example.com/" } },
    "https://loop.example.com/": { status: 301, headers: { location: "http://loop.example.com/" } },
    "https://port.example.com/": { status: 301, headers: { location: "http://port.example.com:8080/" } }
  }));
  const lines = [];
  const read = await core.fetchPublic("https://garena.example.com/", null, (line) => lines.push(line));
  assert.deepEqual([read.status, read.url, read.hops], [200, "https://intl.garena.example.com/", 1]);
  assert.ok(lines.includes("The site redirected to http://intl.garena.example.com/, an http:// address. Requesting the same address over https, as Chrome does."));
  const probe = await core.probeRead("https://garena.example.com/");
  assert.deepEqual([probe.status, probe.httpRedirect, probe.html], [200, undefined, true]);
  assert.equal(failures.diagnose({ cause: { id: "http-redirect" } }, { dns: {}, plain: probe }).cleared, true);

  const refused = await core.fetchPublic("https://shop.example.com/").then(() => null, (caught) => caught);
  assert.equal(refused.message, "The site redirected to http://old.example.com/, an http:// address, and the same address over https gave no page. The review only follows https.");
  assert.equal(failures.causeOf(refused.message).id, "http-redirect");
  assert.equal((await core.probeRead("https://shop.example.com/")).httpRedirect, "http://old.example.com/");
  const loop = await core.fetchPublic("https://loop.example.com/").then(() => null, (caught) => caught);
  assert.equal(failures.causeOf(loop.message).id, "http-redirect");
  assert.equal((await core.probeRead("https://loop.example.com/")).httpRedirect, "http://loop.example.com/");
  const port = await core.fetchPublic("https://port.example.com/").then(() => null, (caught) => caught);
  assert.equal(port.message, "The site redirected to http://port.example.com:8080/, an http:// address. The review only follows https.");
});

test("the connection check tells a port that opens from one that refuses", async () => {
  const net = require("node:net");
  const server = net.createServer((socket) => socket.end());
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = server.address().port;
  try {
    const open = await core.tcpOpen("127.0.0.1", port, 2000);
    assert.equal(open.open, true);
    assert.ok(open.ms >= 0);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
  const closed = await core.tcpOpen("127.0.0.1", port, 2000);
  assert.deepEqual([closed.open, closed.error], [false, "ECONNREFUSED"]);
  const refused = await core.tcpCheck("https://localhost/", 2000);
  assert.equal(refused.open, null);
  assert.match(refused.error, /not a public website/);
});

test("down hosts and confirmed 4xx pages stay on the desk without a bug; bot walls and cut-off hosts are still filed (#574 #410 #411 #330)", () => {
  const probed = (at, message, cause, probe, extra) => failedAt(at, Object.assign({
    url: "https://" + cause + ".example.com/",
    host: cause + ".example.com",
    cause: failures.causeOf(message),
    error: { message },
    diagnosis: failures.diagnose({ cause: failures.causeOf(message) }, probe),
    probe,
    lines: []
  }, extra || {}));
  const dns = { addresses: ["1.2.3.4"] };
  const slow = { hops: [], error: "The page took too long." };
  // www.coca-cola.com/co/ is a real 404 and hoe.com a 402, in the plain read and in headless Chrome.
  const missing = probed("2026-10-25T04:55:00Z", "The URL returned status 404, in the plain read and in headless Chrome.", "status",
    { dns, plain: { hops: [], status: 404, html: true, challenge: "" }, browser: { ok: true, untagged: true, docStatus: 404, words: 62 } });
  // globant.com: an Imperva wall for the plain read and for plain Chrome.
  const walled = probed("2026-10-25T05:00:00Z", "The site's bot protection refused the review (status 403, an Imperva bot check), in the plain request and in headless Chrome.", "bot-protection",
    { dns, plain: { hops: [], status: 403, html: true, challenge: "Imperva" }, browser: { ok: true, untagged: true, docStatus: 403, challenge: "Imperva", words: 0 } });
  // uniminuto.edu.co: down for every client.
  const down = probed("2026-10-25T05:05:00Z", "The site accepted no connection to the plain request, and headless Chrome could not open it either (net::ERR_CONNECTION_TIMED_OUT).", "down",
    { dns, plain: { hops: [], error: "The page took too long: the site accepted no connection in 8 s." }, tcp: { open: false, error: "no answer in 6 s", ms: 6000 } });
  // A timeout saved before this change, which the probe now finds down or cutting off Chrome.
  const oldDown = probed("2026-10-25T05:10:00Z", "The page took too long.", "timeout", { dns, plain: slow, tcp: { open: false, error: "ECONNREFUSED", ms: 30 } });
  // Still filed: www.hpe.com accepts the connection and cuts Chrome off, a bot wall, and a timeout whose Chrome did not finish.
  const tarpit = probed("2026-10-25T05:15:00Z", "The page took too long in the plain request, and headless Chrome could not open it either (net::ERR_HTTP2_PROTOCOL_ERROR at https://www.hpe.com/).", "timeout",
    { dns, plain: slow, tcp: { open: true, ms: 40 }, browser: { ok: false, error: "net::ERR_HTTP2_PROTOCOL_ERROR at https://www.hpe.com/" } }, { url: "https://www.hpe.com/", host: "www.hpe.com" });
  const ours = probed("2026-10-25T05:20:00Z", "The page took too long.", "timeout", { dns, plain: slow, tcp: { open: true, ms: 40 }, browser: { ok: false, error: "the browser was busy" } });
  const refusedRerun = { id: "r1", status: "failed", at: "2026-10-25T06:00:00Z", host: "bancodebogota.com", failureIds: ["f9"], trigger: { label: "x" }, error: { message: "The site's bot protection refused the review (status 403), in the plain request and in headless Chrome." }, cause: { id: "bot-protection" }, lines: [] };
  const slowRerun = Object.assign({}, refusedRerun, { id: "r2", host: "slow.example.com", error: { message: "The page took too long in the plain request, and headless Chrome could not open it either (net::ERR_HTTP2_PROTOCOL_ERROR at https://slow.example.com/)." }, cause: { id: "timeout" } });
  const brokenRerun = Object.assign({}, refusedRerun, { id: "r3", host: "busy.example.com", error: { message: "The site's bot protection refused the plain request (status 403), and headless Chrome did not finish (the browser was busy)." }, cause: { id: "browser" } });
  // hoe.com: a 402 in the plain request and in headless Chrome is site-side in a re-run too.
  const goneRerun = Object.assign({}, refusedRerun, { id: "r4", host: "hoe.com", error: { message: "The URL returned status 402, in the plain request and in headless Chrome." }, cause: { id: "status" } });
  const slowGone = Object.assign({}, refusedRerun, { id: "r5", host: "late.example.com", error: { message: "The URL returned status 404, in headless Chrome, after the plain request took too long." }, cause: { id: "status" } });

  [missing, down, oldDown].forEach((row) => assert.equal(row.diagnosis.site, true, row.host));
  [walled, tarpit, ours].forEach((row) => assert.equal(row.diagnosis.site, false, row.host));
  const bugs = failures.bugPlan([missing, walled, down, oldDown, tarpit, ours], [refusedRerun, slowRerun, brokenRerun, goneRerun, slowGone], []);
  assert.deepEqual(bugs.map((bug) => [bug.key, bug.hosts]), [
    ["bot-protection-319", ["bancodebogota.com", "bot-protection.example.com"]],
    ["timeout", ["slow.example.com", "timeout.example.com", "www.hpe.com"]],
    ["browser-365", ["busy.example.com"]],
    ["status", ["late.example.com"]]
  ]);
  const report = failures.periodFailures({ failures: [missing, walled, down, oldDown, tarpit, ours], previous: [], reruns: [], bugs: [], phrase: "yesterday" });
  assert.equal(report.failed, 6);
  assert.deepEqual(report.causes, { status: 1, "bot-protection": 1, down: 1, timeout: 3 });
});

const failedAt = (at, extra) => Object.assign({
  id: "f-" + at,
  kind: "failed",
  at,
  url: "https://bbva.com.co/",
  host: "bbva.com.co",
  name: "Ana",
  email: "ana@example.com",
  cause: { id: "timeout" },
  diagnosedAt: at,
  diagnosis: { cause: "timeout", cleared: true, rerun: true, summary: "The site took too long. Cleared: The plain read gets the page now (status 200)." },
  options: { pages: 10, depth: 1, frameworks: ["playwright"] },
  intake: { lang: "es", reason: "QA" }
}, extra || {});

test("a failed run keeps what the asker sent, so a re-run can rebuild the record", () => {
  const record = failures.failureRecord({ kind: "failed", url: "https://shop.example.com/", lang: "es", reason: "Audit", clientUrl: "https://client.example.com/", followUp: true, deviceId: "abc", error: "x" });
  assert.deepEqual([record.intake.lang, record.intake.reason, record.intake.clientUrl, record.intake.followUp, record.intake.deviceId], ["es", "Audit", "https://client.example.com/", true, "abc"]);
});

test("a failure that has not cleared is probed again daily for a week", () => {
  const now = Date.parse("2026-10-25T11:00:00Z");
  const still = failedAt("2026-10-22T11:00:00Z", { diagnosis: { cause: "bot-protection", cleared: false, rerun: false } });
  assert.equal(failures.recheckDue(still, now), true);
  assert.equal(failures.recheckDue(Object.assign({}, still, { diagnosedAt: "2026-10-25T00:00:00Z" }), now), false);
  assert.equal(failures.recheckDue(Object.assign({}, still, { at: "2026-10-17T11:00:00Z" }), now), false);
  assert.equal(failures.recheckDue(Object.assign({}, still, { rerun: { status: "failed" } }), now), false);
  assert.equal(failures.recheckDue(Object.assign({}, still, { diagnosis: { cause: "input", cleared: false } }), now), false);
  assert.equal(failures.recheckDue(failedAt("2026-10-22T11:00:00Z"), now), false);
  assert.equal(failures.recheckDue(Object.assign({}, still, { diagnosedAt: null }), now), false);
});

test("a failure re-runs when its cause clears or a fix to its cause ships after it", () => {
  assert.equal(failures.rerunTrigger(failedAt("2026-10-22T11:00:00Z")).id, "cleared");
  assert.equal(failures.rerunTrigger(failedAt("2026-10-22T11:00:00Z", { diagnosedAt: null })), null);
  assert.equal(failures.rerunTrigger(failedAt("2026-10-22T11:00:00Z", { diagnosis: { cleared: false, rerun: false } })), null);
  const bot = failedAt("2026-10-21T15:00:00Z", { cause: { id: "bot-protection" }, diagnosis: { cause: "bot-protection", cleared: false, rerun: false } });
  const fix = failures.rerunTrigger(bot);
  assert.deepEqual([fix.id, fix.ref], ["fix", "#319"]);
  assert.match(fix.label, /headless Chrome \(#319, shipped after the failure\)/);
  assert.equal(failures.rerunTrigger(Object.assign({}, bot, { at: "2026-10-21T21:00:00Z" })), null);
  ["held", "sent", "dropped", "skipped"].forEach((status) => assert.equal(failures.rerunTrigger(Object.assign({}, bot, { rerun: { status, at: "2026-10-22T11:30:00Z" } })), null, status));
  assert.equal(failures.rerunTrigger(failedAt("2026-10-22T11:00:00Z", { rerun: { status: "failed", at: "2026-10-23T11:30:00Z", cause: "unknown" } })), null);
  const before = Object.assign({}, bot, { rerun: { status: "failed", at: "2026-10-21T18:00:00Z", cause: "bot-protection" } });
  assert.equal(failures.rerunTrigger(before).id, "fix");
  assert.equal(failures.rerunTrigger(failedAt("2026-10-22T11:00:00Z", { kind: "stopped" })), null);
  const browserFail = failedAt("2026-10-21T22:06:00Z", { url: "https://americanairlines.com/", host: "americanairlines.com", cause: { id: "browser" }, diagnosis: { cause: "browser", cleared: false, rerun: false } });
  assert.deepEqual([failures.rerunTrigger(browserFail).id, failures.rerunTrigger(browserFail).ref], ["fix", "#365"]);
});

test("re-runs are planned once per address and asker, newest first, and skipped when the asker reviewed again", () => {
  const older = failedAt("2026-10-22T09:00:00Z", { options: { pages: 5 } });
  const newer = failedAt("2026-10-22T10:00:00Z");
  const other = failedAt("2026-10-23T10:00:00Z", { url: "https://indriver.com/", host: "indriver.com", email: "leo@example.com" });
  const done = failedAt("2026-10-22T08:00:00Z", { url: "https://tennis.com.co/", host: "tennis.com.co", email: "max@example.com" });
  const idle = failedAt("2026-10-22T08:00:00Z", { url: "https://lg.com.co/", diagnosis: { cleared: false, rerun: false } });
  const reviewed = [
    { email: "max@example.com", createdAt: "2026-10-22T12:00:00Z", status: "complete", report: { host: "www.tennis.com.co" } },
    { email: "ana@example.com", createdAt: "2026-10-22T09:30:00Z", status: "complete", report: { host: "bbva.com.co" } },
    { email: "leo@example.com", createdAt: "2026-10-24T10:00:00Z", status: "failed", report: { host: "indriver.com" } }
  ];
  const plan = failures.rerunPlan([older, newer, other, done, idle], reviewed, 8);
  assert.deepEqual(plan.runs.map((run) => run.host), ["indriver.com", "bbva.com.co"]);
  const bbva = plan.runs[1];
  assert.deepEqual(bbva.failureIds, [newer.id, older.id]);
  assert.deepEqual(bbva.options, newer.options);
  assert.deepEqual(bbva.intake, { lang: "es", reason: "QA" });
  assert.equal(bbva.trigger.id, "cleared");
  assert.equal(plan.skipped.length, 1);
  assert.match(plan.skipped[0].skip, /reviewed tennis\.com\.co again on 2026-10-22/);
  assert.deepEqual(failures.rerunPlan([older, newer, other], [], 1).runs.map((run) => run.host), ["indriver.com"]);
});

test("a re-run is held for the owner, and the report opens without payment once sent", () => {
  const group = failures.rerunPlan([failedAt("2026-10-22T10:00:00Z")], [], 8).runs[0];
  const lines = Array.from({ length: 450 }, (_, i) => ({ t: i, text: "line " + i }));
  const record = { id: "r1", status: "complete", email: "ana@example.com", paid: false, priceUsd: 12, createdAt: "2026-10-23T11:31:00Z", report: { host: "bbva.com.co" } };
  const held = failures.rerunDoc(group, { record, lines, startedAt: 1000, endedAt: 61000 });
  assert.deepEqual([held.status, held.reportId, held.error, held.cause, held.lines.length, held.lines[0].text], ["held", "r1", null, null, 400, "line 50"]);
  assert.deepEqual(held.failureIds, ["f-2026-10-22T10:00:00Z"]);
  assert.equal(held.expireAt.getTime() - 61000, 90 * 86400000);
  assert.deepEqual(failures.rerunMark("x1", held), { at: held.at, id: "x1", status: "held", trigger: "cleared", cause: "", fixes: held.fixes });

  const failed = failures.rerunDoc(group, { error: new Error("The site's bot protection refused the review (status 403), in the plain read and in headless Chrome."), lines: [] });
  assert.deepEqual([failed.status, failed.record, failed.cause.id], ["failed", null, "bot-protection"]);
  assert.equal(failures.rerunMark("x2", failed).cause, "bot-protection");

  const sent = failures.sentRecord(held, "2026-10-23T14:00:00Z");
  assert.deepEqual([sent.id, sent.paid, sent.free, sent.priceUsd, sent.createdAt, sent.rerunAt], ["r1", true, true, 0, "2026-10-23T14:00:00Z", held.at]);
  assert.deepEqual(sent.rerunOf, held.failureIds);
  assert.equal(record.paid, false);

  const mail = failures.rerunMail([Object.assign({}, held, { reportStatus: "stopped" }), failed]);
  assert.equal(mail.subject, "URL review re-runs: 1 held for you, 1 failed again");
  assert.match(mail.body, /Held for you: bbva\.com\.co for Ana <ana@example\.com>\nWhy it ran: The site took too long\. Cleared: /);
  assert.match(mail.body, /Report r1, stopped before the last page/);
  assert.match(mail.body, /Failed again: .*\n.*\nError: The site's bot protection/);
  assert.match(mail.body, /No asker was emailed\./);
});

test("a new cause class opens one bug, from failures the probe still sees and from failed re-runs", () => {
  const stuck = (at, extra) => failedAt(at, Object.assign({
    cause: { id: "timeout", label: "The site took too long" },
    error: { message: "The page took too long. https://shop.example.com/p?token=abc ana@example.com" },
    diagnosis: { cause: "timeout", cleared: false, rerun: false, nowLabel: "The plain read fails: The page took too long." },
    probe: { dns: { addresses: ["1.2.3.4"] }, plain: { hops: [], error: "The page took too long.", code: "ETIMEDOUT" } },
    lines: [{ t: 0, text: "Reading https://shop.example.com/?ref=mail" }, { t: 9, text: "Ana <ana@example.com> and Mia <mia@example.org> asked about Analytics" }]
  }, extra || {}));
  const a = stuck("2026-10-23T10:00:00Z");
  const b = stuck("2026-10-24T10:00:00Z", { url: "https://indriver.com/", host: "indriver.com", lines: [] });
  const cleared = failedAt("2026-10-24T11:00:00Z");
  const dns = stuck("2026-10-24T12:00:00Z", { cause: { id: "dns" } });
  const settled = stuck("2026-10-24T13:00:00Z", { rerun: { status: "held", at: "2026-10-25T11:30:00Z" } });
  const oldBot = stuck("2026-10-21T15:00:00Z", { cause: { id: "bot-protection" } });
  const newBot = stuck("2026-10-22T15:00:00Z", { cause: { id: "bot-protection" }, probe: { dns: { addresses: [] }, plain: { hops: [{ location: "/es" }], status: 403, contentType: "text/html", server: "cloudflare", challenge: "Cloudflare" }, browser: { ok: true, untagged: true, docStatus: 403, challenge: "Cloudflare", words: 12 } } });
  const rerun = { id: "x1", status: "failed", at: "2026-10-22T11:30:00Z", host: "bbva.com.co", failureIds: ["f1", "f2"], trigger: { label: "Sites behind bot protection are read in headless Chrome (#319, shipped after the failure)" }, error: { message: "The site's bot protection refused the review (status 403)." }, cause: { id: "bot-protection" }, lines: [] };
  const held = Object.assign({}, rerun, { id: "x2", status: "held", cause: null });

  const bugs = failures.bugPlan([a, b, cleared, dns, settled, oldBot, newBot], [rerun, held], []);
  assert.deepEqual(bugs.map((bug) => [bug.key, bug.runs]), [["timeout", 2], ["bot-protection-319", 2]]);
  const [timeout, bot] = bugs;
  assert.equal(timeout.title, "BE: URL reviews failed because the site took too long");
  assert.deepEqual(timeout.hosts, ["indriver.com", "bbva.com.co"]);
  assert.match(timeout.body, /^\*\*Kind:\*\* Bug\n\*\*Area:\*\* BE\n\*\*Found while:\*\* #320/);
  assert.match(timeout.body, /2 URL review runs failed with the cause class `timeout` \(The site took too long\) from 2026-10-23 to 2026-10-24, on 2 sites: indriver\.com, bbva\.com\.co\./);
  assert.match(timeout.body, /- 2026-10-24 10:00 UTC, failed run `f-2026-10-24T10:00:00Z` on indriver\.com: /);
  assert.match(timeout.body, /- DNS: 1 addresses\n- Plain read with the review UA: fails \(The page took too long\., ETIMEDOUT\)\n- Headless Chrome: not tried/);
  assert.match(timeout.body, /### Last log lines of `f-2026-10-23T10:00:00Z`\n```\nReading https:\/\/shop\.example\.com\/\?…\n\[asker\] <\[asker\]> and Mia <\[email\]> asked about Analytics\n```/);
  assert.doesNotMatch(timeout.body, /ana@|mia@|token=|Ana /);
  assert.match(timeout.body, /adds a row to `FIXES` in `functions\/url-review-failures\.js` with cause `timeout`/);

  assert.equal(bot.title, "BE: After #319, URL reviews still failed because the site's bot protection refused the review");
  assert.match(bot.body, /#319 \(Sites behind bot protection are read in headless Chrome\) shipped before these runs/);
  assert.match(bot.body, /failed re-run `x1` of 2 failures on bbva\.com\.co: The site's bot protection refused the review \(status 403\)\. Why it ran: /);
  assert.match(bot.body, /status 403, text\/html, server cloudflare, Cloudflare bot check, after 1 redirect\n- Headless Chrome \(untagged\): status 403, Cloudflare bot check, 12 words/);

  assert.deepEqual(failures.bugPlan([a, b, newBot], [rerun], ["timeout"]).map((bug) => bug.key), ["bot-protection-319"]);
  assert.deepEqual(failures.bugPlan([], [], []), []);
  assert.deepEqual(failures.bugPlan([stuck("2026-10-21T10:00:00Z", { cause: { id: "unknown" } })], [], []), []);
  assert.equal(failures.bugPlan([stuck("2026-10-23T10:00:00Z", { cause: { id: "unknown" } })], [], [])[0].title, "BE: After #329, URL reviews still failed for a reason with no class yet");

  const rerunAfterFix = { status: "failed", at: "2026-10-22T11:30:00Z", cause: "bot-protection" };
  const [again] = failures.bugPlan([Object.assign({}, oldBot, { id: "f1", rerun: rerunAfterFix, probe: newBot.probe })], [rerun], []);
  assert.deepEqual([again.key, again.runs, again.firstAt], ["bot-protection-319", 1, rerun.at]);
  assert.doesNotMatch(again.body, /2026-10-21/);
  assert.match(again.body, /### Probe of the latest failure \(bbva\.com\.co\)\n- DNS: 0 addresses/);
});

test("a fix covers an attempt only when the code that ran it had the fix's row, not from its merge time", () => {
  const all = failures.FIXES.map((fix) => fix.cause + " " + fix.ref);
  const before319 = all.filter((key) => key !== "bot-protection #319");
  const record = failures.failureRecord({ kind: "failed", url: "https://bbva.com.co/", error: "x" });
  assert.deepEqual(record.fixes, all);
  assert.equal("fixes" in failures.failureFromAlert({ id: "a1", at: "2026-10-22T10:00:00Z", url: "https://bbva.com.co/", detail: "Reason: x" }), false);

  const bot = (at, extra) => failedAt(at, Object.assign({ cause: { id: "bot-protection" }, diagnosis: { cause: "bot-protection", cleared: false, rerun: false } }, extra || {}));
  assert.deepEqual(failures.rerunTrigger(bot("2026-10-22T10:00:00Z", { fixes: before319 })), { id: "fix", ref: "#319", label: "Sites behind bot protection are read in headless Chrome (#319, shipped after the failure)" });
  assert.equal(failures.rerunTrigger(bot("2026-10-22T10:00:00Z", { fixes: all })), null);
  assert.equal(failures.rerunTrigger(bot("2026-10-21T10:00:00Z", { fixes: all })), null);
  assert.equal(failures.rerunTrigger(bot("2026-10-22T10:00:00Z")), null);
  assert.equal(failures.rerunTrigger(bot("2026-10-21T10:00:00Z")).id, "fix");
  const oldCode = { status: "failed", at: "2026-10-22T11:30:00Z", cause: "bot-protection", fixes: before319 };
  assert.equal(failures.rerunTrigger(bot("2026-10-21T10:00:00Z", { rerun: oldCode })).id, "fix");
  assert.equal(failures.rerunTrigger(bot("2026-10-21T10:00:00Z", { rerun: Object.assign({}, oldCode, { fixes: all }) })), null);

  const group = failures.rerunPlan([failedAt("2026-10-22T10:00:00Z")], [], 8).runs[0];
  const failed = failures.rerunDoc(group, { error: "The site's bot protection refused the review (status 403).", lines: [] });
  assert.deepEqual(failed.fixes, all);
  assert.deepEqual(failures.rerunMark("x1", failed).fixes, all);
  assert.equal("fixes" in failures.rerunMark("x0", { at: "2026-10-22T11:30:00Z", status: "failed" }), false);

  const probe = { dns: { addresses: ["1.2.3.4"] }, plain: { hops: [], status: 403, contentType: "text/html", challenge: "Cloudflare" } };
  const refused = (id, fixes) => ({ id, status: "failed", at: "2026-10-22T11:30:00Z", host: "bbva.com.co", failureIds: [], error: { message: "The site's bot protection refused the review (status 403)." }, cause: { id: "bot-protection" }, lines: [], fixes });
  assert.deepEqual(failures.bugPlan([], [refused("x2", before319)], []), []);
  assert.deepEqual(failures.bugPlan([], [refused("x3", all)], []).map((bug) => bug.key), ["bot-protection-319"]);
  assert.deepEqual(failures.bugPlan([bot("2026-10-22T10:00:00Z", { fixes: all, probe })], [], []).map((bug) => bug.key), ["bot-protection-319"]);
});

test("later runs of a class with an open bug are commented on that bug once (#1184)", () => {
  const stuck = (at, extra) => failedAt(at, Object.assign({
    id: "f-" + at,
    cause: { id: "bot-protection" },
    error: { message: "The site's bot protection refused the review (status 403). ana@example.com" },
    diagnosis: { cause: "bot-protection", cleared: false, rerun: false, nowLabel: "The plain read is refused (status 403)" },
    probe: { dns: { addresses: ["1.2.3.4"] }, plain: { hops: [], status: 403, contentType: "text/html", challenge: "Cloudflare" } },
    lines: [{ t: 0, text: "Reading https://casio.com/?ref=mail" }]
  }, extra || {}));
  const listed = stuck("2026-10-21T21:00:00Z");
  const later = stuck("2026-10-23T10:00:00Z", { url: "https://casio.com/", host: "casio.com" });
  const latest = stuck("2026-10-24T10:00:00Z", { url: "https://ag.org/", host: "ag.org", lines: [] });
  const rerun = { id: "x9", status: "failed", at: "2026-10-25T11:30:00Z", host: "hoka.com", failureIds: [later.id], error: { message: "The site's bot protection refused the review (status 403)." }, cause: { id: "bot-protection" }, lines: [] };
  const timeout = stuck("2026-10-24T09:00:00Z", { cause: { id: "timeout" }, diagnosis: { cause: "timeout", cleared: false, rerun: false } });
  const bug = { key: "bot-protection-319", issue: 330, lastAt: "2026-10-21T21:00:00Z", hosts: ["bbva.com.co"], ids: [listed.id] };

  const [note] = failures.bugFollowUps([listed, later, latest, timeout], [rerun], [bug]);
  assert.deepEqual([note.key, note.issue, note.runs, note.lastAt], ["bot-protection-319", 330, 3, "2026-10-25T11:30:00Z"]);
  assert.deepEqual(note.ids, ["x9", latest.id, later.id]);
  assert.deepEqual(note.hosts, ["hoka.com", "ag.org", "casio.com"]);
  assert.match(note.body, /^3 more URL review runs failed with the cause class `bot-protection` since this bug was last updated \(2026-10-21\), on 3 sites: hoka\.com, ag\.org, casio\.com\.\n\n- 2026-10-25 11:30 UTC, failed re-run `x9` of 1 failure on hoka\.com: /);
  assert.match(note.body, /- 2026-10-23 10:00 UTC, failed run `f-2026-10-23T10:00:00Z` on casio\.com: .* Now: The plain read is refused/);
  assert.match(note.body, /### Probe of the latest failure \(hoka\.com\)\n- DNS: 1 addresses/);
  assert.match(note.body, /### Last log lines of `f-2026-10-23T10:00:00Z`\n```\nReading https:\/\/casio\.com\/\?…\n```/);
  assert.doesNotMatch(note.body, /ana@|2026-10-21 21:00/);

  assert.deepEqual(failures.bugFollowUps([listed, later, latest], [rerun], [Object.assign({}, bug, { ids: [listed.id, later.id, latest.id, "x9"] })]), []);
  assert.deepEqual(failures.bugFollowUps([later], [], [Object.assign({}, bug, { closedAt: "2026-10-24T00:00:00Z" })]), []);
  assert.deepEqual(failures.bugFollowUps([later], [], [Object.assign({}, bug, { issue: null })]), []);
  assert.deepEqual(failures.bugFollowUps([later], [], [Object.assign({}, bug, { key: "bot-protection" })]), []);

  const legacy = Object.assign({}, bug, { ids: undefined, lastAt: "2026-10-23T10:00:00Z" });
  const [seeded] = failures.bugFollowUps([listed, later, latest], [], [legacy]);
  assert.equal(seeded.runs, 1);
  assert.match(seeded.body, /^1 more URL review run failed with the cause class `bot-protection` since this bug was last updated \(2026-10-23\), on 1 site: ag\.org\./);
  assert.deepEqual(seeded.ids.slice().sort(), [listed.id, later.id, latest.id].sort());
  assert.deepEqual(failures.bugPlan([listed, later], [], ["bot-protection-319"]), []);
  assert.deepEqual(failures.bugPlan([listed], [], [])[0].ids, [listed.id]);
});

test("a re-run of a failure that kept no frameworks reviews with the form's default", () => {
  const fromAlert = failedAt("2026-10-22T10:00:00Z", { options: { pages: 0, depth: 0, frameworks: [] } });
  assert.deepEqual(failures.rerunPlan([fromAlert], [], 8).runs[0].options, { pages: 0, depth: 0, frameworks: ["Playwright"] });
  assert.deepEqual(failures.rerunPlan([failedAt("2026-10-22T10:00:00Z", { options: undefined })], [], 8).runs[0].options.frameworks, ["Playwright"]);
});

test("the review desk lists re-runs with their report summary and log", () => {
  const desk = require("../../functions/url-review-desk");
  const group = failures.rerunPlan([failedAt("2026-10-22T10:00:00Z")], [], 8).runs[0];
  const held = failures.rerunDoc(group, { record: { id: "r1", status: "complete", report: { host: "bbva.com.co", counts: { pages: 9, cases: 31 }, alerts: [{ id: "a" }] } }, lines: [{ t: 0, text: "Re-run of a failed review" }] });
  const [row] = desk.rerunRows([Object.assign({ id: "x1" }, held)]);
  assert.deepEqual([row.id, row.status, row.host, row.failures, row.run.pageCount, row.run.caseCount, row.run.signalCount, row.log[0]], ["x1", "held", "bbva.com.co", 1, 9, 31, 1, "Re-run of a failed review"]);
  assert.match(row.why, /^The site took too long\. Cleared/);
  assert.match(desk.PAGE, /id="reruns"/);
  assert.match(desk.PAGE, /\/desk\/rerun/);
});

test("the review reports carry a failure section with causes, sites, re-runs, open bugs and the trend", () => {
  const bot = (at, host) => failedAt(at, { host, url: "https://" + host + "/", cause: { id: "bot-protection" }, diagnosis: { cleared: false, nowLabel: "The plain read is refused (status 403)" } });
  const rows = [
    bot("2026-10-21T19:40:00Z", "bancodebogota.com"),
    bot("2026-10-21T19:41:00Z", "bancodebogota.com"),
    Object.assign(bot("2026-10-21T19:42:00Z", "americanairlines.com"), { rerun: { status: "failed", at: "2026-10-21T22:06:00Z" } }),
    failedAt("2026-10-21T20:00:00Z", { diagnosedAt: null, diagnosis: null }),
    failedAt("2026-10-21T21:00:00Z"),
    { kind: "stopped", at: "2026-10-21T21:30:00Z", host: "shop.example.com" }
  ];
  const section = failures.periodFailures({
    failures: rows,
    previous: [{ kind: "failed", cause: { id: "bot-protection" } }, { kind: "failed", cause: { id: "dns" } }, { kind: "stopped" }],
    reruns: [{ status: "held" }, { status: "failed" }, { status: "failed" }],
    bugs: [
      { key: "bot-protection-319", issue: 330, title: "BE: After #319, URL reviews still failed", cause: "bot-protection", runs: 7, hosts: ["bancodebogota.com", "globant.com"] },
      { key: "browser", issue: 331, title: "BE: URL reviews failed because headless Chrome did not finish", cause: "browser", runs: 1, hosts: ["americanairlines.com"] },
      { key: "timeout", issue: 300, title: "Old", cause: "timeout", runs: 2, closedAt: "2026-10-20T00:00:00Z" },
      { key: "claiming", issue: null }
    ],
    phrase: "previous day",
    deskUrl: "https://desk.example/desk/failures"
  });
  const row = (label) => section.rows.find((item) => item.label === label).value;
  assert.deepEqual([section.failed, section.stopped, section.previous, section.cleared], [5, 1, 2, 1]);
  assert.equal(row("Failed runs"), "5 vs 2 (previous day); 1 stopped by the asker");
  assert.equal(row("Failure causes"), "bot-protection 3 (1 before), timeout 2 (0 before), dns 0 (1 before)");
  assert.equal(row("Diagnosis"), "1 cleared since, 3 still failing, 1 not probed yet");
  assert.equal(row("Failed sites"), "bancodebogota.com 2, bbva.com.co 2, americanairlines.com 1");
  assert.equal(row("Re-runs"), "1 held for you, 0 sent, 0 dropped, 2 failed again");
  assert.equal(row("Failure bugs"), "#331 browser, #330 bot-protection open, 1 closed");
  assert.deepEqual(section.openBugs, [331, 330]);
  assert.match(section.body, /^Failed reviews\n21 Oct, 16:00 · bbva\.com\.co · Ana · timeout · cleared: /);
  assert.match(section.body, /21 Oct, 14:42 · americanairlines\.com · Ana · bot-protection · now: The plain read is refused \(status 403\) · re-run failed again 2026-10-21/);
  assert.match(section.body, /21 Oct, 15:00 · bbva\.com\.co · Ana · timeout · not diagnosed yet/);
  assert.match(section.body, /Open failure bugs\n#331 BE: URL reviews failed because headless Chrome did not finish \(1 run, americanairlines\.com\)\n#330 .* \(7 runs, bancodebogota\.com, globant\.com\)/);
  assert.doesNotMatch(section.body, /#300/);
  assert.match(section.body, /Each run's full log and probe: https:\/\/desk\.example\/desk\/failures$/);

  const quiet = failures.periodFailures({});
  assert.deepEqual(quiet.rows.map((item) => item.value), ["0 vs 0 (previous period); 0 stopped by the asker", "None", "0 cleared since, 0 still failing, 0 not probed yet", "None", "0 held for you, 0 sent, 0 dropped, 0 failed again", "None filed"]);
  assert.match(quiet.body, /^Failed reviews\nNone\n\nOpen failure bugs\nNone$/);
});

test("the failures page lists runs without their log, and opens one with its full log, probe and re-run", () => {
  const desk = require("../../functions/url-review-desk");
  const lines = Array.from({ length: 3 }, (_, i) => ({ t: i * 1500, text: "line " + i }));
  const doc = Object.assign(failedAt("2026-10-21T19:42:00Z", {
    cause: { id: "bot-protection", label: "The site's bot protection refused the review" },
    error: { message: "The URL returned status 403.", stack: ["at read"] },
    diagnosis: { cleared: false, summary: "Still: refused." },
    probe: { dns: { addresses: ["1.2.3.4"] }, plain: { hops: [], status: 403, contentType: "text/html", challenge: "Akamai" }, browser: { ok: false, error: "aborted" } },
    rerun: { id: "x9", status: "failed", at: "2026-10-21T22:06:00Z" },
    lines,
    lineCount: 3,
    timings: { ms: 4200, lastLineMs: 3000 },
    checks: 2
  }));
  const row = failures.failureRow(doc);
  assert.deepEqual([row.kind, row.host, row.cause, row.message, row.now, row.cleared, row.rerun, row.rerunId, row.lineCount, row.ms], ["failed", "bbva.com.co", "bot-protection", "The URL returned status 403.", "Still: refused.", false, "re-run failed again 2026-10-21", "x9", 3, 4200]);
  assert.equal("lines" in row, false);
  assert.equal(failures.failureRow({ kind: "stopped", url: "https://a.example/x" }).cause, "");
  assert.equal(failures.failureRow(failedAt("2026-10-21T10:00:00Z", { diagnosis: { cleared: true, rerun: true } })).rerun, "re-run due");

  const detail = failures.failureDetail(doc, { id: "x9", status: "failed", at: "2026-10-21T22:06:00Z", trigger: { label: "Fix shipped" }, error: { message: "Headless Chrome did not finish." }, lines: [{ t: 5, text: "Re-run" }] });
  assert.deepEqual(detail.lines, lines);
  assert.deepEqual(detail.probeLines, ["DNS: 1 addresses", "Plain read with the review UA: status 403, text/html, Akamai bot check", "Headless Chrome: did not finish (aborted)"]);
  assert.deepEqual([detail.rerunDoc.why, detail.rerunDoc.error, detail.rerunDoc.lines[0].text], ["Fix shipped", "Headless Chrome did not finish.", "Re-run"]);
  assert.equal(failures.failureDetail(doc, null).rerunDoc, null);

  [desk.PAGE, desk.FAILURES_PAGE].forEach((page) => {
    const start = page.indexOf("<script>") + "<script>".length;
    const inline = page.slice(start, page.indexOf("</script>", start));
    assert.doesNotThrow(() => new Function(inline));
    assert.equal(inline.match(/function deskFetch/g).length, 1);
    assert.match(page, /id="desk-gate"/);
  });
  assert.match(desk.PAGE, /deskFetch\("\/desk\/data"\)/);
  assert.match(desk.PAGE, /href="desk\/failures"/);
  assert.match(desk.FAILURES_PAGE, /deskFetch\("\/desk\/failures\/data"\)/);
  assert.match(desk.FAILURES_PAGE, /href="\.\.\/desk"/);
});

test.describe("chat widgets", () => {
  const browser = require("../../functions/url-review-browser");
  const INTERCOM = {
    found: [{ name: "Intercom", ai: false, hosts: ["widget.intercom.io", "js.intercomcdn.com"], requests: 5, bytes: 620 * 1024, ms: 40 }],
    cookies: ["intercom-id-abc", "intercom-device-id-abc"],
    after: { requests: 2, cookies: ["intercom-session-abc"] },
    launcher: { found: true, name: "", known: true, banner: true, covers: [{ label: "Reject all", banner: true }] },
    open: { opened: true, keyboard: true, moved: false, entered: true, trapped: true, exit: "", tabs: 26, privacy: false }
  };
  const browsed = (chat) => ({
    ok: true,
    start: { status: 200, finalPath: "/", requests: 40, vitals: { lcp: 1200, cls: 0, tbt: 0 } },
    consent: { banner: "OneTrust", rejectLabel: "Reject all", rejected: true, before: { vendors: [], cookies: [] }, after: { vendors: [], cookies: [], kept: 0 } },
    chat
  });
  const analyzeWith = (chat) => insights.analyze({ pages: [{ url: URL_, path: "/", status: 200, ms: 120, depth: 0, inspect: core.analyzeHtml(HTML, STRONG_HEADERS, URL_) }], browser: browsed(chat) });
  const finding = (result, key) => result.findings.find((item) => item.key === key) || {};

  test("chat providers and AI model APIs are named from the recorded request hosts", () => {
    const rows = browser.chatsFrom([
      { host: "widget.intercom.io", requests: 3, bytes: 150000 },
      { host: "js.intercomcdn.com", requests: 2, bytes: 200000 },
      { host: "www.google-analytics.com", requests: 4, bytes: 3000 },
      { host: "notintercom.io", requests: 1, bytes: 10 },
      { host: "api.openai.com", requests: 1, bytes: 900 },
      { host: "embed.tawk.to", requests: 1, bytes: 100 }
    ], { "js.intercomcdn.com": 120.4, "cdn.example.com": 500 });
    assert.deepEqual(rows.map((row) => [row.name, row.ai, row.requests, row.bytes, row.ms]), [
      ["Intercom", false, 5, 350000, 120],
      ["OpenAI API", true, 1, 900, 0],
      ["Tawk.to", false, 1, 100, 0]
    ]);
    assert.deepEqual(rows[0].hosts, ["widget.intercom.io", "js.intercomcdn.com"]);
    assert.equal(browser.chatOf("static.zdassets.com").name, "Zendesk Messaging");
    assert.equal(browser.chatOf("js.usemessages.com").name, "HubSpot Chat");
    assert.equal(browser.chatOf("example.com"), null);
    assert.deepEqual(browser.chatsFrom([{ host: "www.example.com", requests: 9 }], {}), []);
  });

  test("the launcher covers a button only when it is on top of it, or hides a fifth of it when that is unknown", () => {
    const box = { x: 322, y: 776, w: 48, h: 48 };
    const rect = (x, y, w, h) => ({ x, y, w, h });
    const covered = browser.coveredBy(box, [
      { label: "Reject all", banner: true, under: true, rect: rect(200, 780, 160, 44) },
      { label: "Accept all", banner: true, under: false, rect: rect(200, 780, 160, 44) },
      { label: "Buy now", banner: false, under: null, rect: rect(300, 790, 60, 40) },
      { label: "Edge", banner: false, under: null, rect: rect(20, 790, 305, 40) },
      { label: "Far away", banner: false, under: true, rect: rect(20, 100, 100, 40) }
    ]);
    assert.deepEqual(covered.map((row) => row.label), ["Reject all", "Buy now"]);
    assert.deepEqual(browser.coveredBy(null, [{ label: "x", under: true, rect: rect(0, 0, 10, 10) }]), []);
  });

  test("a launcher frame that touches only a sliver of a button or carousel card does not cover it", () => {
    const box = { x: 290, y: 748, w: 100, h: 96 };
    const covered = browser.coveredBy(box, [
      { label: "Get started free", banner: false, under: true, rect: { x: 48, y: 685, w: 294, h: 68 } },
      { label: "All your customer data", banner: false, under: true, rect: { x: 56, y: 825, w: 278, h: 300 } },
      { label: "Book a demo", banner: false, under: true, rect: { x: 280, y: 760, w: 90, h: 44 } }
    ]);
    assert.deepEqual(covered.map((row) => row.label), ["Book a demo"]);
  });

  test("CDN and bot-check cookies on a chat host are neither chat nor tracking cookies", async () => {
    const context = { cookies: async () => [
      { name: "__cf_bm", domain: ".hubspot.com" },
      { name: "_cfuvid", domain: ".usemessages.com" },
      { name: "messagesUtk", domain: ".example.com" },
      { name: "intercom-session-abc", domain: ".example.com" },
      { name: "twk_uuid_1", domain: "embed.tawk.to" },
      { name: "AWSALBCORS", domain: "widget.intercom.io" }
    ] };
    const rows = await browser.cookiesOf(context, null, "www.example.com");
    assert.deepEqual(rows.map((row) => [row.name, row.chat, row.tracking]), [
      ["__cf_bm", false, false],
      ["_cfuvid", false, false],
      ["messagesUtk", true, false],
      ["intercom-session-abc", true, false],
      ["twk_uuid_1", true, true],
      ["AWSALBCORS", false, false]
    ]);
  });

  test("a chat that loads before consent, is heavy, covers the banner, has no name and traps focus is reported in each area", () => {
    const result = analyzeWith(INTERCOM);
    assert.deepEqual(["an-chat-consent", "an-chat-reject", "an-chat-privacy", "pf-chat", "a11y-chat-cover", "a11y-chat-name", "a11y-chat-focus", "a11y-chat-trap"].map((key) => [key, finding(result, key).area, finding(result, key).verdict, finding(result, key).severity]), [
      ["an-chat-consent", "Analytics", "risk", "medium"],
      ["an-chat-reject", "Analytics", "risk", "medium"],
      ["an-chat-privacy", "Analytics", "risk", "low"],
      ["pf-chat", "Performance", "risk", "medium"],
      ["a11y-chat-cover", "Accessibility", "fail", "high"],
      ["a11y-chat-name", "Accessibility", "fail", "medium"],
      ["a11y-chat-focus", "Accessibility", "risk", "medium"],
      ["a11y-chat-trap", "Accessibility", "fail", "high"]
    ]);
    assert.match(finding(result, "an-chat-consent").evidence, /OneTrust was showing\. Before any choice, Intercom sent 5 requests and set intercom-id-abc, intercom-device-id-abc\./);
    assert.deepEqual([result.chat.vendors, result.chat.banner, result.chat.cookies, result.chat.states.consent, result.chat.states.trap], [[{ name: "Intercom", ai: false }], true, ["intercom-id-abc", "intercom-device-id-abc"], "risk", "fail"]);
    assert.match(result.fixkit.chatSnippet, /window\.Intercom\("show"\);/);
    assert.match(finding(result, "a11y-chat-cover").evidence, /the Intercom launcher sits over "Reject all" in the cookie banner/);
    assert.match(finding(result, "a11y-chat-trap").evidence, /, 26 presses of Tab kept focus inside it/);
  });

  test("a light, consent-aware chat with a named launcher passes, and a page without chat gets no chat finding", () => {
    const good = analyzeWith({
      found: [{ name: "Crisp", ai: false, hosts: ["client.crisp.chat"], requests: 2, bytes: 40 * 1024, ms: 0 }],
      cookies: [], after: { requests: 0, cookies: [] },
      launcher: { found: true, name: "Open chat", known: true, banner: true, covers: [] },
      open: { opened: true, keyboard: true, moved: true, entered: true, trapped: false, exit: "escape", tabs: 25, privacy: true }
    });
    assert.deepEqual(["an-chat-reject", "an-chat-privacy", "pf-chat", "a11y-chat-cover", "a11y-chat-name", "a11y-chat-trap"].map((key) => verdict(good, key)), ["pass", "pass", "pass", "pass", "pass", "pass"]);
    assert.equal(verdict(good, "an-chat-consent"), "risk");
    assert.equal(verdict(good, "a11y-chat-focus"), "missing");
    const unread = analyzeWith(Object.assign({}, INTERCOM, { launcher: { found: true, known: false, covers: [] }, open: { opened: true, keyboard: true, entered: true, trapped: false, exit: "", tabs: 25, privacy: null } }));
    assert.deepEqual(["a11y-chat-name", "a11y-chat-trap", "an-chat-privacy"].map((key) => verdict(unread, key)), ["missing", "person", "missing"]);
    const none = analyzeWith(undefined);
    assert.equal(none.findings.filter((item) => /chat/.test(item.key)).length, 0);
  });

  test("the review names the chat in the technologies and proposes chat cases only when one loaded", async () => {
    const run = async (chat) => {
      const restore = fakeNetwork({ [URL_]: { status: 200, headers: STRONG_HEADERS, body: HTML } });
      try {
        return await core.reviewTarget(URL_, { browse: async (job) => job.html ? { ok: false } : Object.assign(browsed(chat), { start: { status: 200, finalPath: "/", vitals: {}, dom: { links: [], nav: [], forms: 0, buttons: 0, iframes: 0 } } }) });
      } finally {
        restore();
      }
    };
    const withChat = await run({ found: [{ name: "Intercom", ai: false, hosts: ["widget.intercom.io"], requests: 3, bytes: 1000, ms: 0 }, { name: "Chatbase", ai: true, hosts: ["www.chatbase.co"], requests: 1, bytes: 100, ms: 0 }], cookies: [] });
    assert.deepEqual(withChat.technologies.filter((item) => /Chat|AI/.test(item.group)).map((item) => [item.name, item.group]), [["Intercom", "Chat"], ["Chatbase", "AI chatbot"]]);
    assert.deepEqual(withChat.cases.filter((item) => /^CHAT-/.test(item.id)).map((item) => item.id).sort(), ["CHAT-01", "CHAT-02", "CHAT-03", "CHAT-04"]);
    const without = await run(undefined);
    assert.equal(without.cases.filter((item) => /^CHAT-/.test(item.id)).length, 0);
  });
});

test.describe("fingerprinting, session recording and typed text", () => {
  const browser = require("../../functions/url-review-browser");
  const PRINTER = {
    canvas: [
      { host: "cdn.fp-vendor.com", w: 240, h: 60, chars: 24, colors: 3, type: "image/png" },
      { host: "s.w.org", w: 16, h: 16, chars: 2, colors: 2, type: "image/png" },
      { host: "www.shop.com", w: 300, h: 150, chars: 28, colors: 1, type: "image/png" },
      { host: "tiny.example.net", w: 8, h: 8, chars: 30, colors: 3, type: "image/png" },
      { host: "photos.example.net", w: 800, h: 600, chars: 40, colors: 3, type: "image/jpeg" }
    ],
    fonts: { "cdn.fp-vendor.com": 64, "www.shop.com": 12 },
    webgl: { "ads.adnet.io": 2 },
    audio: [{ host: "cdn.fp-vendor.com", oscillator: true }, { host: "player.music.io", oscillator: false }],
    listen: { "www.shop.com": ["input"], "connect.facebook.net": ["change", "input"] }
  };
  const VENDORS = [
    { name: "Hotjar", loads: 1, hits: 3, denied: 0 },
    { name: "Microsoft Clarity", loads: 1, hits: 0, denied: 0 },
    { name: "Google Analytics", loads: 1, hits: 4, denied: 0 }
  ];
  const TYPED = { field: "Email", sent: [{ host: "www.facebook.com", how: "as a SHA-256 hash", phase: "before" }, { host: "api.shop.com", how: "as typed", phase: "before" }] };
  const browsed = (watch, consent) => ({
    ok: true,
    start: { status: 200, finalPath: "/", requests: 40, vitals: { lcp: 1200, cls: 0, tbt: 0 } },
    consent: consent || { banner: "OneTrust", rejectLabel: "Reject all", rejected: true, before: { vendors: [], cookies: [] }, after: { vendors: [], cookies: [], kept: 0 } },
    watch
  });
  const analyzeWith = (watch, consent) => insights.analyze({ pages: [{ url: URL_, path: "/", status: 200, ms: 120, depth: 0, inspect: core.analyzeHtml(HTML, STRONG_HEADERS, URL_) }], browser: browsed(watch, consent) });
  const finding = (result, key) => result.findings.find((item) => item.key === key) || {};
  const row = (result, key) => [finding(result, key).area, finding(result, key).verdict, finding(result, key).severity];

  test("the classifier keeps only calls that read like fingerprinting, and names recorders and third-party typing capture", () => {
    const out = browser.watchFrom(PRINTER, VENDORS, TYPED, "www.shop.com");
    assert.deepEqual(out.fingerprint, { canvas: ["cdn.fp-vendor.com"], fonts: ["cdn.fp-vendor.com"], webgl: ["ads.adnet.io"], audio: ["cdn.fp-vendor.com"] });
    assert.deepEqual(out.recorders, [{ name: "Hotjar", sent: true }, { name: "Microsoft Clarity", sent: false }]);
    assert.deepEqual(out.listeners, ["connect.facebook.net"]);
    assert.deepEqual(out.typed, { field: "Email", sent: [{ host: "www.facebook.com", how: "as a SHA-256 hash", phase: "before" }] });
    assert.deepEqual(out.guards, []);
    const clean = browser.watchFrom({ canvas: [], fonts: { "www.shop.com": 49 }, webgl: {}, audio: [], listen: {} }, [{ name: "Google Analytics", loads: 1, hits: 2 }], null, "www.shop.com");
    assert.deepEqual(clean.fingerprint, { canvas: [], fonts: [], webgl: [], audio: [] });
    assert.deepEqual([clean.recorders, clean.typed], [[], null]);
    assert.deepEqual(browser.watchFrom({ canvas: [{ host: "challenges.cloudflare.com", w: 300, h: 150, chars: 30, colors: 2 }] }, [], null, "shop.com").guards, ["challenges.cloudflare.com"]);
    assert.deepEqual(browser.watchFrom(null, null, null, "shop.com").fingerprint, { canvas: [], fonts: [], webgl: [], audio: [] });
  });

  test("the test address is matched as typed, hashed, and in Base64", () => {
    const canary = browser.canaryOf();
    const crypto = require("node:crypto");
    assert.match(canary.email, /^qa[0-9a-f]{10}@example\.com$/);
    const forms = Object.fromEntries(canary.forms);
    assert.equal(forms["as typed"], canary.email.split("@")[0]);
    assert.equal(forms["as a SHA-256 hash"], crypto.createHash("sha256").update(canary.email).digest("hex"));
    assert.equal(Buffer.from(forms["in Base64"], "base64").toString(), canary.email);
    assert.equal(typeof browser.watchCalls, "function");
  });

  test("fingerprinting, recording and typing before a choice and after Reject are reported in Analytics and Security", () => {
    const before = browser.watchFrom(PRINTER, VENDORS, TYPED, "www.shop.com");
    const after = browser.watchFrom({ webgl: { "ads.adnet.io": 1 } }, [{ name: "Hotjar", loads: 1, hits: 1 }], { field: "Email", sent: [] }, "www.shop.com");
    const result = analyzeWith({ before, after });
    assert.deepEqual(["an-fingerprint", "an-fingerprint-reject", "an-recording", "an-recording-reject", "sec-typed"].map((key) => row(result, key)), [
      ["Analytics", "fail", "high"],
      ["Analytics", "fail", "high"],
      ["Analytics", "fail", "medium"],
      ["Analytics", "fail", "medium"],
      ["Security", "fail", "high"]
    ]);
    assert.match(finding(result, "an-fingerprint").evidence, /^OneTrust was showing\. Before any choice, cdn\.fp-vendor\.com drew hidden text on a canvas and read it back, measured which fonts are installed, and rendered a silent audio tone; ads\.adnet\.io read the graphics card name\./);
    assert.match(finding(result, "an-fingerprint-reject").evidence, /^After pressing "Reject all" and reloading, ads\.adnet\.io read the graphics card name\.$/);
    assert.match(finding(result, "sec-typed").evidence, /"Email" field and did not submit\. Before any choice it was sent to www\.facebook\.com \(as a SHA-256 hash\)\. The review blocked those requests.* Scripts from connect\.facebook\.net listen to typing/);
  });

  test("a clean page passes, a bot check alone is a low risk, and no banner makes fingerprinting a risk rather than a fail", () => {
    const clean = browser.watchFrom({}, [{ name: "Hotjar", loads: 1, hits: 0 }], { field: "Email", sent: [] }, "www.shop.com");
    const passed = analyzeWith({ before: clean, after: clean });
    assert.deepEqual(["an-fingerprint", "an-recording", "an-recording-reject", "sec-typed"].map((key) => finding(passed, key).verdict), ["pass", "pass", "pass", "pass"]);
    assert.equal(finding(passed, "an-fingerprint-reject").verdict, undefined);
    const guard = browser.watchFrom({ canvas: [{ host: "www.recaptcha.net", w: 300, h: 150, chars: 30, colors: 2 }] }, [], null, "www.shop.com");
    const guarded = analyzeWith({ before: guard, after: guard });
    assert.deepEqual(row(guarded, "an-fingerprint"), ["Analytics", "risk", "low"]);
    assert.deepEqual([finding(guarded, "an-fingerprint-reject").verdict, finding(guarded, "sec-typed").verdict], [undefined, undefined]);
    const open = analyzeWith({ before: browser.watchFrom(PRINTER, [], null, "www.shop.com"), after: null }, { banner: "", rejectLabel: "", rejected: false, before: { vendors: [], cookies: [] }, after: null });
    assert.deepEqual(row(open, "an-fingerprint"), ["Analytics", "risk", "high"]);
    assert.equal(finding(open, "an-fingerprint").title, "Scripts fingerprint the browser on load and no banner asks first");
    assert.equal(analyzeWith(undefined).findings.filter((item) => /fingerprint|recording|typed/.test(item.key)).length, 0);
  });
});

test.describe("legal pages and front-end libraries", () => {
  const libs = require("../../functions/url-review-libraries");
  const { legalLinks } = require("../../functions/url-review-legal");
  const page = (html, url) => ({ url: url || URL_, path: "/", status: 200, ms: 120, depth: 0, inspect: core.analyzeHtml(html, STRONG_HEADERS, url || URL_) });
  const body = (inner, lang) => "<!doctype html><html lang=\"" + (lang || "en") + "\"><head><title>Example</title></head><body><main><h1>Example</h1></main>" + inner + "</body></html>";
  const finding = (result, key) => result.findings.find((item) => item.key === key) || {};

  test("library versions are read from CDN paths, file names, WordPress ?ver=, banners and page globals", () => {
    const named = (url) => libs.fromUrl(url).map((row) => row.name + " " + row.version);
    assert.deepEqual(named("https://code.jquery.com/jquery-1.12.4.min.js"), ["jQuery 1.12.4"]);
    assert.deepEqual(named("https://cdnjs.cloudflare.com/ajax/libs/lodash.js/4.17.15/lodash.min.js"), ["Lodash 4.17.15"]);
    assert.deepEqual(named("https://cdnjs.cloudflare.com/ajax/libs/moment.js/2.18.1/moment.min.js"), ["Moment.js 2.18.1"]);
    assert.deepEqual(named("https://code.jquery.com/ui/1.12.1/jquery-ui.min.js"), ["jQuery UI 1.12.1"]);
    assert.deepEqual(named("https://cdn.jsdelivr.net/npm/vue@2.5.16/dist/vue.min.js"), ["Vue 2.5.16"]);
    assert.deepEqual(named("https://example.com/wp-includes/js/jquery/jquery.min.js?ver=3.7.1"), ["jQuery 3.7.1"]);
    assert.deepEqual(named("https://example.com/js/app.4f9c2.js"), []);
    assert.equal(libs.cleanVersion("3.5.1.min"), "3.5.1");
    assert.equal(libs.cleanVersion("not-a-version"), "");
    const banner = (text) => libs.fromContent(text, "https://example.com/vendor.js").map((row) => row.name + " " + row.version);
    assert.deepEqual(banner("/*! jQuery v3.4.1 | (c) JS Foundation and other contributors | jquery.org/license */\n!function(e,t){}"), ["jQuery 3.4.1"]);
    assert.deepEqual(banner("/*!\n * Bootstrap v4.1.0 (https://getbootstrap.com/)\n */"), ["Bootstrap 4.1.0"]);
    assert.deepEqual(banner("var x = 1;"), []);
    assert.deepEqual(libs.fromGlobals({ jQuery: "1.11.0", Unknown: "1.0", Vue: "<b>" }, "https://example.com/").map((row) => [row.name, row.version, row.via]), [["jQuery", "1.11.0", "global"]]);
    assert.ok(libs.PROBE.includes("fn.jquery") && !/\bnew\s/.test(libs.PROBE));
    assert.equal(libs.atOrAbove("1.10.0", "1.9.2"), true);
    assert.equal(libs.atOrAbove("1.9.0b1", "1.9.0"), false);
    assert.equal(libs.atOrAbove("3.5.0", "3.5.0"), true);
  });

  test("versions are matched against the bundled list with the version that fixes them", () => {
    const rows = libs.assess([
      { name: "jQuery", version: "1.12.4", via: "url", url: "https://code.jquery.com/jquery-1.12.4.min.js" },
      { name: "jQuery", version: "1.12.4.min", via: "banner", url: "https://example.com/other.js" },
      { name: "Bootstrap", version: "3.3.7", via: "banner", url: "https://example.com/bootstrap.js" },
      { name: "jQuery", version: "3.7.1", via: "global", url: "" },
      { name: "Nothing", version: "1.0.0" }
    ]);
    const by = (name, version) => rows.find((row) => row.name === name && row.version === version);
    assert.equal(rows.length, 3);
    assert.ok(by("jQuery", "1.12.4").flaws > 0);
    assert.equal(by("jQuery", "1.12.4").fixed, "3.5.0");
    assert.equal(by("jQuery", "1.12.4").majorJump, true);
    assert.equal(by("jQuery", "1.12.4").url, "https://code.jquery.com/jquery-1.12.4.min.js");
    assert.equal(by("Bootstrap", "3.3.7").ended, true);
    assert.equal(by("Bootstrap", "3.3.7").fixed, "");
    assert.equal(by("jQuery", "3.7.1").flaws, 0);
  });

  test("footer links to the accessibility statement, imprint and privacy notice are found in six languages", () => {
    const cases = [
      ["en", [["/accessibility", "Accessibility statement"], ["/legal-notice", "Legal notice"], ["/privacy", "Privacy policy"]]],
      ["es", [["/accesibilidad", "Declaración de accesibilidad"], ["/aviso-legal", "Aviso legal"], ["/privacidad", "Política de privacidad"]]],
      ["pt", [["/acessibilidade", "Declaração de acessibilidade"], ["/informacao-legal", "Informação legal"], ["/privacidade", "Política de privacidade"]]],
      ["de", [["/barrierefreiheit", "Erklärung zur Barrierefreiheit"], ["/impressum", "Impressum"], ["/datenschutz", "Datenschutzerklärung"]]],
      ["fr", [["/accessibilite", "Accessibilité : partiellement conforme"], ["/mentions-legales", "Mentions légales"], ["/confidentialite", "Politique de confidentialité"]]],
      ["it", [["/accessibilita", "Dichiarazione di accessibilità"], ["/note-legali", "Note legali"], ["/privacy", "Informativa sulla riservatezza"]]]
    ];
    cases.forEach(([lang, links]) => {
      const html = body("<footer>" + links.map(([href, text]) => "<a href=\"" + href + "\">" + text + "</a>").join(" | ") + "</footer>", lang);
      const legal = core.analyzeHtml(html, STRONG_HEADERS, URL_).legal;
      assert.deepEqual(["accessibility", "imprint", "privacy"].map((kind) => legal[kind] && legal[kind].href), links.map(([href]) => "https://shop.example.com" + href), lang);
    });
    const odd = legalLinks([
      { href: "#privacy", text: "Privacy settings" },
      { href: "javascript:void(0)", text: "Datenschutz" },
      { href: "https://accessibe.com/", text: "Accessibility" },
      { href: "/legal/impressum.html", text: "" },
      { href: "/p/datenschutz", text: "" }
    ], URL_);
    assert.equal(odd.accessibility, null);
    assert.equal(odd.imprint.href, "https://shop.example.com/legal/impressum.html");
    assert.equal(odd.privacy.href, "https://shop.example.com/p/datenschutz");
    const about = legalLinks([
      { href: "/support/forum/accessibility/", text: "Accessibility Inquiries concerning accessibility and assistive technology" },
      { href: "/blog/accessibility-tips", text: "Accessibility tips for shops" },
      { href: "/barrierefreiheit?view=", text: "Erklärung zur Barrierefreiheit", label: "Gehen Sie zu Erklärung zur Barrierefreiheit" }
    ], URL_);
    assert.deepEqual(about.accessibility, { href: "https://shop.example.com/barrierefreiheit?view=", text: "Erklärung zur Barrierefreiheit" });
    assert.equal(legalLinks([{ href: "/support/forum/accessibility/", text: "Accessibility Inquiries concerning assistive technology", label: "Accessibility" }], URL_).accessibility, null);
    assert.equal(legalLinks([{ href: "/forum/accessibility/", text: "Accessibility" }], URL_).accessibility, null);
    assert.equal(legalLinks([{ href: "/a11y", text: "", label: "Accessibility" }], URL_).accessibility.text, "Accessibility");
  });

  test("a shop without the statement, a German site without an imprint, and old libraries are reported with evidence and a fix", () => {
    const html = body("<a href=\"/cart\">Warenkorb</a><form action=\"/search\"></form><script src=\"https://code.jquery.com/jquery-1.12.4.min.js\"></script>", "de");
    const result = insights.analyze({ pages: [page(html)] });
    assert.deepEqual(["a11y-statement", "an-imprint", "an-privacy", "sec-libraries"].map((key) => [key, finding(result, key).area, finding(result, key).verdict, finding(result, key).severity]), [
      ["a11y-statement", "Accessibility", "risk", "medium"],
      ["an-imprint", "Analytics", "risk", "medium"],
      ["an-privacy", "Analytics", "risk", "medium"],
      ["sec-libraries", "Security", "risk", "medium"]
    ]);
    assert.match(finding(result, "a11y-statement").evidence, /sells online \(a cart or checkout link\)/);
    assert.match(finding(result, "an-imprint").evidence, /declared German \(lang="de"\)/);
    assert.match(finding(result, "an-privacy").evidence, /has 1 form/);
    const lib = finding(result, "sec-libraries");
    assert.match(lib.title, /^jQuery 1\.12\.4 has known flaws$/);
    assert.match(lib.evidence, /^jQuery 1\.12\.4 \(https:\/\/code\.jquery\.com\/jquery-1\.12\.4\.min\.js\): \d+ known flaws, the worst rated medium, such as CVE-/);
    assert.match(lib.evidence, /Checked against the retire\.js list of \d{4}-\d{2}-\d{2}\.$/);
    assert.match(lib.fix, /^Upgrade jQuery to 3\.5\.0 or later\. A major upgrade changes behavior/);
    assert.equal(lib.effort, "days");
    assert.deepEqual(lib.cases, ["SEC-10"]);
  });

  test("linked legal pages and current libraries pass, a page without a shop leaves the statement to a person", () => {
    const html = body("<footer><a href=\"/accessibility\">Accessibility</a> <a href=\"/privacy\">Privacy</a></footer><script src=\"https://code.jquery.com/jquery-3.7.1.min.js\"></script>");
    const good = insights.analyze({ pages: [page(html)] });
    assert.deepEqual(["a11y-statement", "an-privacy", "sec-libraries"].map((key) => verdict(good, key)), ["pass", "pass", "pass"]);
    assert.equal(verdict(good, "an-imprint"), "missing");
    assert.match(finding(good, "a11y-statement").evidence, /^"Accessibility" on \/ leads to \/accessibility\.$/);
    const plain = insights.analyze({ pages: [page(body("<p>Hello</p>"))] });
    assert.equal(verdict(plain, "a11y-statement"), "person");
    assert.equal(finding(plain, "an-privacy").severity, "low");
    assert.equal(verdict(plain, "sec-libraries"), "missing");
    const rendered = insights.analyze({ pages: [page(body("<p>Hello</p>"))], browser: { ok: true, start: { status: 200, finalPath: "/", dom: { links: [], legal: { privacy: { href: "https://shop.example.com/privacy", text: "Privacy" } } } }, libraries: [{ name: "Bootstrap", version: "3.3.7", via: "banner", url: "https://shop.example.com/js/vendor.js" }] } });
    assert.equal(verdict(rendered, "an-privacy"), "pass");
    assert.match(finding(rendered, "sec-libraries").evidence, /^Bootstrap 3\.3\.7 \(banner of \/js\/vendor\.js\)/);
    assert.match(finding(rendered, "sec-libraries").fix, /^Move Bootstrap off 3\.x, which gets no more fixes\./);
  });

  test("the review proposes the statement, imprint and library cases", async () => {
    const restore = fakeNetwork({ "https://shop.example.de/": { status: 200, headers: STRONG_HEADERS, body: body("<script src=\"https://code.jquery.com/jquery-1.12.4.min.js\"></script>", "de") } });
    try {
      const result = await core.reviewTarget("https://shop.example.de/", { browse: async () => ({ ok: false }) });
      const ids = result.cases.map((item) => item.id);
      assert.ok(["A11Y-06", "PR-04", "SEC-10"].every((id) => ids.includes(id)), ids.join(","));
      assert.match(result.cases.find((item) => item.id === "SEC-10").why, /jQuery 1\.12\.4/);
    } finally {
      restore();
    }
  });

  test("a competitor run hands the passive flag to every browser job and records it", async () => {
    const restore = fakeNetwork({ "https://shop.example.de/": { status: 200, headers: STRONG_HEADERS, body: body("<p>Hallo</p>", "de") } });
    try {
      const jobs = [];
      const lines = [];
      const owner = { reasonCode: "own", email: "ana@shop.example.de" };
      const passive = await core.reviewTarget("https://shop.example.de/", { passive: true, asker: owner, log: (text) => lines.push(text), browse: async (job) => { jobs.push(job); return { ok: false }; } });
      assert.ok(jobs.length >= 1);
      jobs.forEach((job) => assert.equal(job.passive, true));
      assert.ok(!jobs.some((job) => job.kind === "chat"), "a competitor run never starts the chat conversation, even with the owner's proof");
      assert.equal(passive.limits.passive, true);
      assert.ok(lines.some((text) => /competitor run: the browser types into no field and does not open the chat/.test(text)));
      jobs.length = 0;
      const plain = await core.reviewTarget("https://shop.example.de/", { asker: owner, browse: async (job) => { jobs.push(job); return { ok: false }; } });
      jobs.forEach((job) => assert.equal(job.passive, false));
      assert.ok(jobs.some((job) => job.kind === "chat"));
      assert.equal(plain.limits.passive, false);
    } finally {
      restore();
    }
  });

  test("the fix kit lists library upgrades and outlines the legal pages the site does not link", () => {
    const html = body("<a href=\"/cart\">Warenkorb</a><form action=\"/search\"></form><script src=\"https://code.jquery.com/jquery-1.12.4.min.js\"></script>", "de");
    const kit = insights.analyze({ pages: [page(html)] }).fixkit;
    assert.deepEqual(kit.libraries.map((row) => [row.name, row.version, row.fixed]), [["jQuery", "1.12.4", "3.5.0"]]);
    assert.match(kit.privacyNotice, /^# Privacy notice\n/);
    assert.match(kit.imprint, /^# Impressum\n/);
    assert.match(kit.accessibilityStatement, /EN 301 549/);
    const good = insights.analyze({ pages: [page(body("<footer><a href=\"/accessibility\">Accessibility</a> <a href=\"/privacy\">Privacy</a></footer><script src=\"https://code.jquery.com/jquery-3.7.1.min.js\"></script>"))] }).fixkit;
    assert.deepEqual([good.libraries, good.privacyNotice, good.imprint, good.accessibilityStatement], [[], "", "", ""]);
  });

  test("the security tiles carry the library and legal checks", () => {
    const html = body("<a href=\"/cart\">Warenkorb</a><script src=\"https://code.jquery.com/jquery-1.12.4.min.js\"></script>", "de");
    const tiles = insights.analyze({ pages: [page(html)] }).security.headers;
    const tile = (label) => tiles.find((item) => item.label === label);
    assert.deepEqual(["Front-end libraries", "Privacy notice", "Imprint", "Accessibility statement"].map((label) => tile(label).state), ["risk", "risk", "risk", "risk"]);
    const plain = insights.analyze({ pages: [page(body("<p>Hello</p>"))] }).security.headers;
    assert.deepEqual(plain.find((item) => item.label === "Accessibility statement"), { label: "Accessibility statement", state: "unknown", person: true });
    assert.equal(plain.find((item) => item.label === "Imprint"), undefined);
    assert.equal(plain.find((item) => item.label === "Front-end libraries"), undefined);
  });
});

test.describe("domain and mail test cases", () => {
  const cases = [{ id: "SEC-09", layer: "Security" }, { id: "SEC-10", layer: "Security" }, { id: "PR-01", layer: "Privacy" }].map((item, index) => Object.assign({ n: index + 1 }, item));
  const extras = {
    safeBrowsing: { ok: true, url: "https://example.com/", threats: [] },
    domain: { domain: "example.com", read: true, expires: "2027-05-01", daysLeft: 190, locked: false },
    dns: { domain: "example.com", mx: ["mx.example.com"], mtaSts: "", tlsRpt: "v=TLSRPTv1; rua=mailto:t@example.com", unread: [] }
  };

  test("Safe Browsing, renewal and transfer lock, and MTA-STS with TLS-RPT become cases after SEC-10", () => {
    const out = core.domainCases(cases.map((item) => Object.assign({}, item)), extras);
    assert.deepEqual(out.map((item) => [item.n, item.id]), [[1, "SEC-09"], [2, "SEC-10"], [3, "SEC-11"], [4, "SEC-12"], [5, "SEC-13"], [6, "PR-01"]]);
    assert.match(out[3].why, /registered until 2027-05-01, with the transfer lock off/);
    assert.match(out[4].why, /MTA-STS is not published, and TLS-RPT is published/);
    assert.equal(out[2].status, "proposed");
  });

  test("a check that did not answer adds no case", () => {
    const out = core.domainCases(cases.slice(), { dns: { domain: "example.com", mx: [], unread: [] }, domain: { read: false } });
    assert.deepEqual(out.map((item) => item.id), ["SEC-09", "SEC-10", "PR-01"]);
  });
});

test.describe("domain health", () => {
  const get = (result, key) => result.findings.find((item) => item.key === key);
  const row = (result, label) => (result.security.headers.find((item) => item.label === label) || {}).state;
  const MAIL = { domain: "example.com", spf: "v=spf1 -all", dmarc: "v=DMARC1; p=reject", mx: ["mx.example.com"], nullMx: false, caa: ["letsencrypt.org"], mtaSts: "", tlsRpt: "", bimi: "", unread: [] };
  const days = (n) => new Date(Date.now() + n * 86400000 + 3600000).toISOString();

  test("the MTA-STS, TLS-RPT and BIMI records are read from DNS", async () => {
    const dnsPromises = require("node:dns").promises;
    const saved = { mx: dnsPromises.resolveMx, txt: dnsPromises.resolveTxt, caa: dnsPromises.resolveCaa };
    const records = {
      "_mta-sts.example.com": [["v=STSv1; id=2026"]],
      "_smtp._tls.example.com": [["v=TLSRPTv1; ", "rua=mailto:tls@example.com"]],
      "default._bimi.example.com": [["v=BIMI1; l=https://example.com/logo.svg"]]
    };
    dnsPromises.resolveMx = async () => [{ exchange: "mx.example.com", priority: 10 }];
    dnsPromises.resolveTxt = async (name) => records[name] || [["v=spf1 -all"]];
    dnsPromises.resolveCaa = async () => [];
    let facts;
    try {
      facts = await core.dnsFacts("www.example.com");
    } finally {
      Object.assign(dnsPromises, { resolveMx: saved.mx, resolveTxt: saved.txt, resolveCaa: saved.caa });
    }
    assert.equal(facts.mtaSts, "v=STSv1; id=2026");
    assert.equal(facts.tlsRpt, "v=TLSRPTv1; rua=mailto:tls@example.com");
    assert.equal(facts.bimi, "v=BIMI1; l=https://example.com/logo.svg");
  });

  test("RDAP gives the expiry, the registrar and the transfer lock", () => {
    const data = {
      status: ["client delete prohibited", "client transfer prohibited"],
      events: [{ eventAction: "registration", eventDate: "2025-07-23T18:20:06Z" }, { eventAction: "expiration", eventDate: days(12) }],
      entities: [{ roles: ["registrar"], vcardArray: ["vcard", [["version", {}, "text", "4.0"], ["fn", {}, "text", "Squarespace Domains II LLC"]]] }]
    };
    const read = core.readRdap(data, "example.com");
    assert.deepEqual([read.read, read.daysLeft, read.registrar, read.locked], [true, 12, "Squarespace Domains II LLC", true]);
    assert.equal(core.readRdap(Object.assign({}, data, { status: ["active", "clientTransferProhibited"] }), "example.com").locked, true);
    assert.equal(core.readRdap(Object.assign({}, data, { status: ["active"] }), "example.com").locked, false);
    const bare = core.readRdap({ events: [] }, "example.de");
    assert.deepEqual([bare.expires, bare.daysLeft, bare.locked], ["", null, null]);
  });

  test("domain facts follow the IANA bootstrap to the registry, and the MTA-STS policy is read without redirects", async () => {
    const restore = fakeNetwork({
      "https://data.iana.org/rdap/dns.json": { status: 200, headers: { "content-type": "application/json" }, body: JSON.stringify({ services: [[["com", "net"], ["https://rdap.verisign.com/com/v1/"]]] }) },
      "https://rdap.verisign.com/com/v1/domain/example.com": { status: 200, headers: { "content-type": "application/rdap+json" }, body: JSON.stringify({ status: ["active"], events: [{ eventAction: "expiration", eventDate: days(400) }] }) },
      "https://mta-sts.example.com/.well-known/mta-sts.txt": { status: 200, headers: { "content-type": "text/plain" }, body: "version: STSv1\nmode: testing\nmx: mx.example.com\nmax_age: 86400\n" },
      "https://mta-sts.example.net/.well-known/mta-sts.txt": { status: 301, headers: { location: "https://www.example.net/mta-sts.txt" } },
      "https://www.example.net/mta-sts.txt": { status: 200, headers: { "content-type": "text/plain" }, body: "version: STSv1\nmode: enforce\n" }
    });
    try {
      const facts = await core.domainFacts("www.example.com");
      assert.deepEqual([facts.read, facts.daysLeft, facts.locked], [true, 400, false]);
      assert.deepEqual(await core.domainFacts("shop.example.org"), { domain: "example.org", read: false, reason: ".org has no RDAP service" });
      assert.deepEqual(await core.mtaStsPolicy("example.com"), { url: "https://mta-sts.example.com/.well-known/mta-sts.txt", status: 200, mode: "testing", maxAge: 86400 });
      assert.match((await core.mtaStsPolicy("example.net")).error, /redirected/);
    } finally {
      restore();
    }
  });

  test("a site on Google's Safe Browsing lists is a critical failure", async () => {
    const savedFetch = global.fetch;
    const asked = [];
    global.fetch = async (url) => {
      asked.push(String(url));
      return { ok: true, json: async () => (/malware/.test(url) ? { threat: { threatTypes: ["MALWARE", "SOCIAL_ENGINEERING"] } } : {}) };
    };
    let listed, clean;
    try {
      listed = await core.webRisk("https://malware.example/", "k");
      clean = await core.webRisk(URL_, "k");
    } finally {
      global.fetch = savedFetch;
    }
    assert.match(asked[0], /^https:\/\/webrisk\.googleapis\.com\/v1\/uris:search\?threatTypes=MALWARE&threatTypes=SOCIAL_ENGINEERING&threatTypes=UNWANTED_SOFTWARE&uri=https%3A%2F%2Fmalware\.example%2F&key=k$/);
    assert.equal(await core.webRisk(URL_, ""), null);
    const bad = analyzeHtmlPages([{ url: URL_, html: HTML }], { safeBrowsing: listed });
    assert.deepEqual([get(bad, "sec-safebrowsing").verdict, get(bad, "sec-safebrowsing").severity], ["fail", "critical"]);
    assert.equal(get(bad, "sec-safebrowsing").title, "Google lists the site as malware and phishing");
    assert.equal(row(bad, "Safe Browsing"), "fail");
    const good = analyzeHtmlPages([{ url: URL_, html: HTML }], { safeBrowsing: clean });
    assert.equal(verdict(good, "sec-safebrowsing"), "pass");
    assert.equal(row(analyzeHtmlPages([{ url: URL_, html: HTML }]), "Safe Browsing"), "unknown");
  });

  test("domain expiry is flagged under 30 days, and a missing transfer lock is a low risk", () => {
    const at = (daysLeft, locked) => analyzeHtmlPages([{ url: URL_, html: HTML }], { domain: { domain: "example.com", read: true, expires: "2026-11-01", daysLeft, registrar: "Example Registrar", status: locked ? ["client transfer prohibited"] : ["active"], locked } });
    const soon = at(20, false);
    assert.deepEqual([get(soon, "sec-domain-expiry").verdict, get(soon, "sec-domain-expiry").severity], ["risk", "medium"]);
    assert.match(get(soon, "sec-domain-expiry").evidence, /^example\.com, held with Example Registrar, is registered until 2026-11-01, according/);
    assert.deepEqual([get(soon, "sec-domain-lock").verdict, get(soon, "sec-domain-lock").severity], ["risk", "low"]);
    assert.equal(get(at(3, true), "sec-domain-expiry").severity, "high");
    assert.deepEqual([get(at(-2, true), "sec-domain-expiry").verdict, get(at(-2, true), "sec-domain-expiry").severity], ["fail", "high"]);
    const fine = at(300, true);
    assert.deepEqual([verdict(fine, "sec-domain-expiry"), verdict(fine, "sec-domain-lock")], ["pass", "pass"]);
    assert.deepEqual([get(fine, "sec-domain-expiry").cases, get(soon, "sec-domain-lock").cases], [["SEC-12"], ["SEC-12"]]);
    assert.equal(row(fine, "Domain expiry"), "pass");
    assert.deepEqual(fine.security.domain, { domain: "example.com", expires: "2026-11-01", daysLeft: 300, registrar: "Example Registrar", locked: true });
    const unread = analyzeHtmlPages([{ url: URL_, html: HTML }], { domain: { domain: "example.de", read: false, reason: ".de has no RDAP service" } });
    assert.deepEqual([verdict(unread, "sec-domain-expiry"), row(unread, "Domain expiry"), unread.security.domain], ["missing", "unknown", null]);
  });

  test("MTA-STS and TLS-RPT are checked only on domains that receive mail", () => {
    const run = (dns) => analyzeHtmlPages([{ url: URL_, html: HTML }], { dns: Object.assign({}, MAIL, dns) });
    const none = run({});
    assert.deepEqual([verdict(none, "sec-mta-sts"), verdict(none, "sec-tlsrpt")], ["risk", "risk"]);
    assert.deepEqual([get(none, "sec-mta-sts").cases, get(none, "sec-tlsrpt").cases], [["SEC-13"], ["SEC-13"]]);
    assert.match(none.fixkit.dns.find((item) => item.name === "_mta-sts.example.com").value, /^v=STSv1; id=\d{10}$/);
    assert.equal(none.fixkit.mtaSts, "version: STSv1\nmode: testing\nmx: mx.example.com\nmax_age: 86400\n");
    assert.deepEqual(none.fixkit.dns.find((item) => item.name === "_smtp._tls.example.com"), { name: "_smtp._tls.example.com", type: "TXT", value: "v=TLSRPTv1; rua=mailto:tlsrpt@example.com" });
    assert.deepEqual([row(none, "MTA-STS"), row(none, "TLS-RPT")], ["risk", "risk"]);
    const testing = run({ mtaSts: "v=STSv1; id=1", tlsRpt: "v=TLSRPTv1; rua=mailto:t@example.com", mtaStsPolicy: { url: "https://mta-sts.example.com/.well-known/mta-sts.txt", status: 200, mode: "testing", maxAge: 86400 } });
    assert.equal(get(testing, "sec-mta-sts").title, "MTA-STS only reports and does not enforce");
    assert.equal(verdict(testing, "sec-tlsrpt"), "pass");
    assert.equal(verdict(run({ mtaSts: "v=STSv1; id=1", mtaStsPolicy: { url: "u", mode: "enforce" } }), "sec-mta-sts"), "pass");
    assert.match(get(run({ mtaSts: "v=STSv1; id=1", mtaStsPolicy: { url: "u", status: 404, error: "status 404" } }), "sec-mta-sts").title, /could not be read/);
    assert.equal(verdict(run({ unread: ["mta-sts"] }), "sec-mta-sts"), "missing");
    const noMail = run({ mx: [], nullMx: true });
    assert.deepEqual([verdict(noMail, "sec-mta-sts"), verdict(noMail, "sec-tlsrpt"), row(noMail, "MTA-STS")], ["missing", "missing", undefined]);
  });

  test("BIMI is a note, not a scored finding, unless it is published", () => {
    const run = (dns) => analyzeHtmlPages([{ url: URL_, html: HTML }], { dns: Object.assign({}, MAIL, dns) });
    const absent = run({});
    assert.equal(verdict(absent, "sec-bimi"), "missing");
    assert.deepEqual(absent.security.bimi, { record: "", eligible: true });
    const published = run({ bimi: "v=BIMI1; l=https://example.com/logo.svg" });
    assert.deepEqual([get(published, "sec-bimi").verdict, get(published, "sec-bimi").severity], ["pass", "info"]);
    assert.equal(run({ unread: ["bimi"] }).security.bimi, null);
  });

  test("the carbon estimate uses the browser's cold load, then Lighthouse, and is not scored", () => {
    const page = [{ url: URL_, html: HTML }];
    const pages = page.map((row) => Object.assign({ path: "/", status: 200, ms: 120, depth: 0 }, row, { inspect: core.analyzeHtml(row.html, STRONG_HEADERS, row.url) }));
    const browser = (bytes) => ({ ok: true, start: { status: 200, finalPath: "/", bytes, dom: { links: [] } } });
    const heavy = insights.analyze({ pages, browser: browser(2000000) });
    assert.deepEqual(heavy.carbon, { bytes: 2000000, grams: 0.296, rating: "E", source: "browser" });
    assert.equal(heavy.carbon.rating, "E");
    const light = insights.analyze({ pages, browser: browser(0), pagespeed: { ok: true, score: 90, lab: {}, bytes: 250000 } });
    assert.deepEqual(light.carbon, { bytes: 250000, grams: 0.037, rating: "A+", source: "lighthouse" });
    assert.equal(insights.analyze({ pages }).carbon, null);
    assert.equal(heavy.score.overall, insights.analyze({ pages, browser: browser(100) }).score.overall);
    assert.equal(core.summarizePageSpeed({ lighthouseResult: { categories: { performance: { score: 0.5 } }, audits: { "total-byte-weight": { numericValue: 1234567 } } } }).bytes, 1234567);
  });

  test("a review with a Web Risk lookup carries Safe Browsing into the report", async () => {
    const restore = fakeNetwork({ [URL_]: { status: 200, headers: STRONG_HEADERS, body: HTML } });
    const asked = [];
    try {
      const report = await core.reviewTarget(URL_, { browse: async () => ({ ok: false }), webrisk: async (url) => { asked.push(url); return { ok: true, url, threats: [] }; } });
      assert.deepEqual(asked, [URL_]);
      assert.equal(verdict(report.insights, "sec-safebrowsing"), "pass");
    } finally {
      restore();
    }
  });
});

test("the web search asks Brave first, falls back to Tavily, and is off without a key", async (t) => {
  const asked = [];
  let brave = { status: 200, body: { web: { results: [{ title: "Postob&#xF3;n <strong>S.A.</strong>", url: "https://directorio.example/p", description: "Escribe a <strong>servicio@postobon.com</strong> &#x27;hoy&#x27;" }] } } };
  t.mock.method(global, "fetch", async (url, init) => {
    asked.push({ host: new URL(url).hostname, init });
    const reply = new URL(url).hostname === "api.search.brave.com" ? brave
      : { status: 200, body: { results: [{ title: "Tavily row", url: "https://otro.example/", content: "ventas@postobon.com" }] } };
    return { ok: reply.status === 200, status: reply.status, json: async () => reply.body };
  });
  assert.deepEqual(await core.webSearch("\"@postobon.com\"", {}), []);
  assert.equal(asked.length, 0);

  const keys = { BRAVE_SEARCH_KEY: "b", TAVILY_API_KEY: "t" };
  const first = await core.webSearch("\"@postobon.com\"", keys);
  assert.deepEqual(asked.map((row) => row.host), ["api.search.brave.com"]);
  assert.equal(asked[0].init.headers["x-subscription-token"], "b");
  assert.equal(first[0].url, "https://directorio.example/p");
  assert.equal(first[0].description, "Escribe a servicio@postobon.com 'hoy'");
  assert.doesNotMatch(first[0].title, /<|&/);

  brave = { status: 429, body: {} };
  const second = await core.webSearch("\"@postobon.com\"", keys);
  assert.deepEqual(asked.slice(1).map((row) => row.host), ["api.search.brave.com", "api.tavily.com"]);
  assert.equal(asked[2].init.headers.authorization, "Bearer t");
  assert.deepEqual(second.map((row) => row.url), ["https://otro.example/"]);
});

test("the registrable domain keeps government, education and organization suffixes apart", () => {
  assert.equal(core.registrable("unal.edu.co"), "unal.edu.co");
  assert.equal(core.registrable("medellin.unal.edu.co"), "unal.edu.co");
  assert.equal(core.registrable("www.mintic.gov.co"), "mintic.gov.co");
  assert.equal(core.registrable("www.gov.uk"), "www.gov.uk");
  assert.equal(core.registrable("tax.service.gov.uk"), "tax.service.gov.uk");
  assert.equal(core.registrable("shop.acme.com.co"), "acme.com.co");
  assert.equal(core.registrable("docs.python.org"), "python.org");
});

test("mentions come from search results on other sites only", () => {
  const rows = [
    { title: "Acme opens a new office", url: "https://news.example/acme" },
    { title: "Acme home", url: "https://www.acme.co/" },
    { title: "No link", url: "javascript:void(0)" }
  ];
  assert.deepEqual(core.parseMentions(rows, "acme.co").map((row) => [row.href, row.tone]), [["https://news.example/acme", "Favorable"]]);
});

test("a review can ask for a language and stay under the start path", () => {
  const body = (extra) => Object.assign({
    termsAccepted: true,
    termsVersion: core.TERMS_VERSION,
    name: "Ana Ruiz",
    email: "ana@example.org",
    reasonCode: "teaching",
    frameworks: ["Playwright"],
    url: "https://example.org/docs/guide"
  }, extra);
  const site = core.validateIntake(body()).value;
  assert.equal(site.pageLang, "");
  assert.equal(site.section, false);
  const es = core.validateIntake(body({ pageLang: "es", section: true })).value;
  assert.equal(es.pageLang, "es");
  assert.equal(es.section, true);
  const ignored = core.validateIntake(body({ pageLang: "english", section: "yes" })).value;
  assert.equal(ignored.pageLang, "");
  assert.equal(ignored.section, false);
  assert.equal(core.sectionPrefix("https://example.org/docs/guide"), "/docs/guide");
  assert.equal(core.sectionPrefix("https://example.org/docs/"), "/docs");
  assert.equal(core.sectionPrefix("https://example.org/"), "");
  assert.equal(core.underSection("https://example.org/docs/guide/install", "/docs/guide"), true);
  assert.equal(core.underSection("https://example.org/docs", "/docs/guide"), false);
  assert.equal(core.underSection("https://example.org/about", ""), true);
  assert.deepEqual(core.sitemapCandidates([
    "https://example.org/docs/guide",
    "https://example.org/docs/guide/install",
    "https://example.org/about",
    "https://other.example/docs/guide/x",
    "https://example.org/docs/guide/file.pdf",
    "https://example.org/docs/guide/next"
  ], "https://example.org/docs/guide", "/docs/guide", 10, ["https://example.org/docs/guide"]), [
    "https://example.org/docs/guide/install",
    "https://example.org/docs/guide/next"
  ]);
  const found = core.pagesFound([
    { url: "https://example.org/", requested: "https://example.org/", inspect: { links: ["https://example.org/a", "https://example.org/b", "https://example.org/report.pdf"] } },
    { url: "https://example.org/a/", requested: "https://example.org/a", inspect: { links: ["https://example.org/c", "https://example.org/"] } },
    { url: "https://example.org/b", requested: "https://example.org/b", error: "timeout", inspect: null }
  ], ["https://example.org/rendered"], { urls: ["https://example.org/c", "https://example.org/d", "https://other.example/e", "https://example.org/sitemap-2.xml"], partial: true }, "https://example.org/", "");
  assert.deepEqual(found, { count: 6, partial: true });
  assert.equal(core.pagesFound([{ url: "https://example.org/docs/guide", inspect: { links: ["https://example.org/docs/guide/x", "https://example.org/about"] } }], null, { urls: [] }, "https://example.org/docs/guide", "/docs/guide").count, 2);
  const record = core.intakeRecord(es, { id: "r", status: "complete" }, {});
  assert.equal(record.pageLang, "es");
  assert.equal(record.section, true);
  const failed = require("../../functions/url-review-failures").failureRecord({
    kind: "failed", url: "https://example.org/docs", pageLang: "es", section: true, error: "x"
  });
  assert.equal(failed.options.pageLang, "es");
  assert.equal(failed.options.section, true);
  assert.equal(failed.intake.section, true);
});

test.describe("cases built from evidence and ranked by risk", () => {
  const caseRank = require("../../functions/url-review-cases");
  const SITE = "https://garden.example.com/";
  const page = (title, inner, head) => "<!doctype html><html lang=\"en\"><head>" + (title ? "<title>" + title + "</title>" : "") + (head || "<meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">") + "</head><body><main>" + inner + "</main></body></html>";
  const routes = {
    [SITE]: { status: 200, headers: STRONG_HEADERS, body: page("Garden tools", "<h1>Garden tools</h1><img src=\"a.png\"><a href=\"/about\">About</a> <a href=\"/login\">Sign in</a>") },
    "https://garden.example.com/about": { status: 200, headers: STRONG_HEADERS, body: page("", "<h1>About</h1><img src=\"b.png\"><img src=\"c.png\">") },
    "https://garden.example.com/login": { status: 200, headers: STRONG_HEADERS, body: page("Sign in", "<h1>Sign in</h1><form><input name=\"user\"><input type=\"password\" name=\"pw\"></form>", "<meta name=\"viewport\" content=\"width=device-width, user-scalable=no\">") }
  };
  const browser = {
    ok: true,
    start: { status: 200, finalPath: "/", requests: 40, vitals: { lcp: 1200, cls: 0, tbt: 0 }, dom: { links: [], nav: [], forms: 0, buttons: 0, iframes: 0 } },
    consent: { banner: "", rejected: false, before: { vendors: [], cookies: [] }, after: null },
    axe: { ran: true, version: "4.10.0", pages: [
      { path: "/", violations: [{ id: "color-contrast", impact: "serious", help: "Elements must meet minimum color contrast ratio thresholds", nodes: 6, targets: [".hero p", ".footer a"] }, { id: "link-name", impact: "serious", help: "Links must have discernible text", nodes: 2, targets: ["a.social-x"] }] },
      { path: "/about", violations: [{ id: "link-name", impact: "serious", help: "Links must have discernible text", nodes: 1, targets: ["a.icon"] }] }
    ] },
    mobile: { width: 390, overflow: 120, offenders: ["table.prices"] }
  };
  const review = async () => {
    const restore = fakeNetwork(routes);
    try {
      return await core.reviewTarget(SITE, { browse: async (job) => job.html ? { ok: false } : browser });
    } finally {
      restore();
    }
  };

  test("a PageSpeed answer reaches the report", async () => {
    const restore = fakeNetwork(routes);
    try {
      const pagespeed = async () => ({ ok: true, score: 77, lab: {}, bytes: 250000 });
      const result = await core.reviewTarget(SITE, { browse: async (job) => job.html ? { ok: false } : browser, pagespeed });
      assert.equal(result.pagespeed && result.pagespeed.score, 77);
    } finally {
      restore();
    }
  });

  test("cases name the host and paths, span every page, and drop the retired duplicates", async () => {
    const result = await review();
    const byId = (id) => result.cases.find((item) => item.id === id);
    const ids = result.cases.map((item) => item.id);
    ["I18N-01", "VIS-02", "SEO-01", "A11Y-03", "FM-02", "LK-02", "RS-02", "LD-02", "LD-03", "LK-04"].forEach((id) => assert.ok(!ids.includes(id), id + " is retired"));
    assert.equal(new Set(ids).size, ids.length, "ids are unique");
    assert.match(byId("FN-01").title, /^garden\.example\.com answers over https$/);
    assert.match(byId("FM-03").title, /garden\.example\.com\/login/);
    assert.equal(byId("FM-03").path, "/login");
    assert.equal(byId("FM-01").path, "/login");
    assert.match(byId("A11Y-01").why, /3 images without alt across garden\.example\.com, garden\.example\.com\/about, most on garden\.example\.com\/about\./);
    assert.equal(byId("A11Y-07").check.kind, "count");
    assert.match(byId("FN-07").why, /garden\.example\.com\/about/);
    assert.ok(result.cases.every((item) => !/the start page|the reviewed URL/i.test(item.title)), "titles name the site");
  });

  test("axe rules, the phone overflow and open findings become ranked cases", async () => {
    const result = await review();
    const byId = (id) => result.cases.find((item) => item.id === id);
    const ids = result.cases.map((item) => item.id);
    const axe = result.cases.filter((item) => /^AXE-/.test(item.id));
    assert.deepEqual(axe.map((item) => [item.title, item.pages, item.verdict]), [["Links must have discernible text on garden.example.com", ["/", "/about"], "fail"]]);
    assert.match(byId("A11Y-04").why, /color-contrast \(serious\).*\.hero p/);
    assert.equal(byId("A11Y-04").verdict, "fail");
    assert.match(byId("MB-01").why, /Seen on garden\.example\.com: At 390 px the page is 120 px wider than the screen\. Widest elements: table\.prices\./);
    assert.ok(!ids.some((id) => /^RT-/.test(id) && /discernible text/.test(byId(id).title)), "the axe finding joins its AXE case");
    assert.equal(byId("FN-02").verdict, undefined, "a missing title on /about does not fail the start page's title case");
    assert.deepEqual([byId("FN-20").title, byId("FN-20").verdict, byId("FN-20").severity], ["garden.example.com/about has no title", "fail", "medium"]);
    assert.deepEqual(byId("MB-01").selectors, ["table.prices"]);
    assert.ok(result.cases.every((item) => /^P[1-4]$/.test(item.priority) && item.risk >= 0 && item.risk <= 100));
    const risks = result.cases.map((item) => item.risk);
    assert.deepEqual(risks, risks.slice().sort((a, b) => b - a), "ranked by risk");
    assert.deepEqual(result.cases.map((item) => item.n), result.cases.map((item, index) => index + 1));
    const first = result.cases.findIndex((item) => item.verdict === "fail");
    const proposed = result.cases.findIndex((item) => !item.verdict);
    assert.ok(first < proposed, "evidence ranks above guesses");
    assert.deepEqual(result.counts.byLayer, caseRank.countLayers(result.cases));
    assert.equal(Object.values(result.counts.byLayer).reduce((a, b) => a + b, 0), result.cases.length);
  });

  test("an open finding with no case becomes a retest, and a pass keeps its verdict", () => {
    const cases = [{ id: "SEC-03", layer: "Security", title: "x", why: "y", fw: ["Playwright"] }, { id: "FN-04", layer: "Functional", title: "x", why: "y", fw: ["Playwright"] }];
    const findings = [
      { id: "F-01", key: "pf-console", area: "Performance", verdict: "fail", severity: "high", title: "3 JavaScript errors on load", evidence: "TypeError: x is undefined on /.", fix: "Fix the error", pages: ["/"], rank: 1 },
      { id: "F-02", key: "a11y-lang", area: "Accessibility", verdict: "pass", severity: "info", title: "Language set", evidence: "", cases: ["I18N-01"] },
      { id: "F-03", key: "sec-csp", area: "Security", verdict: "risk", severity: "medium", title: "No CSP", evidence: "content-security-policy was absent.", cases: ["SEC-03"], pages: ["/", "/a"] }
    ];
    const out = caseRank.refine(cases, { findings, origin: "https://shop.example.com" });
    const byId = (id) => out.find((item) => item.id === id);
    assert.equal(out[0].id, "RT-01");
    assert.match(out[0].title, /^Retest on shop\.example\.com: 3 JavaScript errors on load$/);
    assert.equal(out[0].priority, "P1");
    assert.equal(byId("FN-04").verdict, "pass");
    assert.equal(byId("SEC-03").verdict, "risk");
    assert.match(byId("SEC-03").why, /Seen on shop\.example\.com: content-security-policy was absent\./);
    assert.deepEqual(byId("SEC-03").pages, ["/", "/a"]);
    assert.equal(byId("SEC-03").path, "/");
  });

  test("refined cases carry no undefined field, so the report can be saved to Firestore", () => {
    const cases = [{ id: "A11Y-01", layer: "Accessibility", title: "x", why: "y", fw: ["Playwright"], path: undefined, pages: [] }];
    const findings = [{ id: "F-01", key: "x-none", area: "Performance", verdict: "risk", severity: "low", title: "Slow", evidence: "Slow.", rank: 1 }];
    const out = caseRank.refine(cases, { findings, origin: "https://shop.example.com" });
    const holes = out.flatMap((item) => Object.keys(item).filter((key) => item[key] === undefined).map((key) => item.id + "." + key));
    assert.deepEqual(holes, []);
  });

  test("a case's own check and path drive its script", () => {
    const report = { finalUrl: "https://shop.example.com/", host: "shop.example.com", pages: [{ path: "/", status: 200 }], cases: [
      { id: "A11Y-07", layer: "Accessibility", title: "Pinch zoom is allowed", why: "Blocked. Expected none.", fw: ["Playwright"], path: "/login", check: { kind: "count", path: "/login", selector: "meta[name=\"viewport\"][content*=\"user-scalable=no\" i]", op: "eq", n: 0 } },
      { id: "A11Y-01", layer: "Accessibility", title: "Images", why: "Missing. Expected none.", fw: ["Playwright"], path: "/about" }
    ] };
    const { files } = scripts.bundle(report, report.cases, ["Playwright"]);
    const text = files.map((file) => file.content || file.text || "").join("\n");
    assert.match(text, /\/login/);
    assert.match(text, /user-scalable=no/);
    assert.match(text, /\/about/);
    assert.doesNotMatch(text, /test\.fixme\("A11Y-07/);
  });

  test("the fix kit does not tell a site Cloudflare already fronts to put Cloudflare in front", () => {
    const readme = (technologies) => {
      const report = { url: "https://example.com/", cases: [], technologies, insights: { fixkit: { hosting: "GitHub Pages", headers: [{ name: "X-Frame-Options", value: "DENY" }] } } };
      return scripts.bundle(report, [], ["Playwright"]).files.find((file) => file.path === "fix-kit/README.md").content;
    };
    const proxied = readme([{ name: "Cloudflare" }]);
    assert.match(proxied, /Transform Rule/);
    assert.doesNotMatch(proxied, /Put a CDN|in front and use/);
    assert.match(readme([]), /Put a CDN such as Cloudflare in front/);
  });

  test("the preview frosts every section, and leaves ids, addresses, dates and short labels as they are", () => {
    const secret = "the admin panel answers on port 8443 without a password";
    const report = {
      id: "ab12",
      host: "example.com",
      finalUrl: "https://example.com/start?ref=a",
      fetchedAt: "2026-10-24T16:00:00.000Z",
      statement: "Twelve pages were read. Then " + secret + ".",
      observed: { title: "Home", description: "A shop for coffee. Also " + secret + "." },
      log: [{ at: "16:00:01", text: "Opened the start page. Saw " + secret + "." }],
      pages: [{ path: "/admin", status: 200, title: "Admin" }],
      insights: { findings: [{ id: "SEC-02", area: "Security", verdict: "fail", title: "HSTS is not sent", evidence: "Missing. " + secret }], geo: { note: "Read by four crawlers. " + secret } }
    };
    const preview = core.previewReport(report);
    assert.ok(!JSON.stringify(preview).includes(secret));
    assert.match(preview.statement, /^Twelve pages were read\. /);
    assert.equal(preview.statement.length, report.statement.length);
    assert.match(preview.statement, /^Twelve pages were read\. \u2060\w+ \u2060/, "each hidden word starts with the mark the page blurs from");
    assert.match(preview.log[0].text, /^Opened the start page\. /);
    assert.match(preview.insights.geo.note, /^Read by four crawlers\. /);
    assert.deepEqual([preview.id, preview.host, preview.finalUrl, preview.fetchedAt, preview.log[0].at, preview.pages[0].path, preview.observed.title],
      [report.id, report.host, report.finalUrl, report.fetchedAt, report.log[0].at, report.pages[0].path, report.observed.title]);
    assert.deepEqual([preview.insights.findings[0].area, preview.insights.findings[0].verdict, preview.insights.findings[0].title], ["Security", "fail", "HSTS is not sent"]);
    assert.deepEqual(core.previewReport(preview).statement, preview.statement, "frosting twice gives the same copy");
    assert.equal(report.statement.includes(secret), true, "the stored report is not changed");
  });

  test("the preview keeps the priority and drops the selectors and checks", () => {
    const preview = core.previewReport({ cases: [{ id: "MB-01", title: "Layout holds", why: "Wider. Pushed out.", priority: "P2", risk: 30, pages: ["/"], selectors: ["table.prices"], check: { kind: "viewport" } }] });
    assert.deepEqual([preview.cases[0].priority, preview.cases[0].risk, preview.cases[0].selectors, preview.cases[0].check], ["P2", 30, undefined, undefined]);
  });

  test("the preview leaves out the asker's comparison", () => {
    const report = { host: "rival.example", compare: { ownId: "abc123", own: { host: "asker.example" }, ownOnly: ["4 pages have no title"] } };
    const preview = core.previewReport(report);
    assert.equal(preview.compare, undefined);
    assert.ok(!JSON.stringify(preview).includes("asker.example"));
    assert.ok(report.compare, "the stored report is not changed");
  });
});

test("links sent as POST or to sign-out routes are not opened as pages", () => {
  assert.equal(core.actionLink('<a href="/auth/google" data-method="post" rel="nofollow">'), true);
  assert.equal(core.actionLink('<a href="/logout" data-method="DELETE">'), true);
  assert.equal(core.actionLink('<a href="/auth/github" rel="nofollow">'), true);
  assert.equal(core.actionLink('<a href="/about" data-method="get">'), false);
  assert.equal(core.actionLink('<a href="/login" rel="nofollow">'), false);
  assert.equal(core.actionLink('<a href="/authors/kim" rel="nofollow">'), false);
  assert.equal(core.actionLink('<a href="/auth/google">'), false);
});

test("a TXT read that times out is asked once more before it is left unread", async () => {
  const dnsPromises = require("node:dns").promises;
  const saved = { mx: dnsPromises.resolveMx, txt: dnsPromises.resolveTxt, caa: dnsPromises.resolveCaa };
  const asked = {};
  dnsPromises.resolveMx = async () => [{ exchange: "mx.example.org", priority: 10 }];
  dnsPromises.resolveCaa = async () => [];
  dnsPromises.resolveTxt = async (name) => {
    asked[name] = (asked[name] || 0) + 1;
    if (name === "example.org" && asked[name] === 1) throw Object.assign(new Error("ETIMEOUT"), { code: "ETIMEOUT" });
    if (name === "_dmarc.example.org") throw Object.assign(new Error("ESERVFAIL"), { code: "ESERVFAIL" });
    return name === "example.org" ? [["v=spf1 -all"]] : [];
  };
  let facts;
  try {
    facts = await core.dnsFacts("www.example.org");
  } finally {
    Object.assign(dnsPromises, { resolveMx: saved.mx, resolveTxt: saved.txt, resolveCaa: saved.caa });
  }
  assert.equal(facts.spf, "v=spf1 -all");
  assert.deepEqual(facts.unread, ["dmarc"]);
  assert.deepEqual([asked["example.org"], asked["_dmarc.example.org"]], [2, 1]);
});

test("PayPal returns the payer to the payment page in the language they paid from", () => {
  assert.equal(core.payPage("es"), "qa-review-pay-es.html");
  assert.equal(core.payPage("DE"), "qa-review-pay-de.html");
  assert.equal(core.payPage("en"), "qa-review-pay.html");
  assert.equal(core.payPage("ja"), "qa-review-pay.html");
  assert.equal(core.payPage("../x"), "qa-review-pay.html");
  assert.equal(core.payPage(undefined), "qa-review-pay.html");
});

test("technologies come from the site's own markup, not from words, prose attributes, JSON-LD or links to other sites", () => {
  const names = (html) => core.analyzeHtml(html, { "content-type": "text/html" }, "https://www.example.com/").technologies.map((item) => item.name);
  const prose = "<html><head><meta name=\"description\" content=\"We left Wix for a static site\"><script type=\"application/ld+json\">{\"description\":\"Shopify alternative\"}</script></head><body>" +
    "<p>Compare Squarespace, Webflow and Joomla.</p><img src=\"/a.png\" alt=\"Built with Svelte\">" +
    "<a href=\"https://www.cancilleria.gov.co/sites/default/files/decreto.pdf\">Decree</a><a href=\"https://wordpress.org/wp-content/x\">WP</a><a href=\"/case-study/from-squarespace-to-drupal\">Case</a>" +
    "<script>const note = 'The domain moved because of Squarespace.'; const legal = { es: \"Ver <a href=\\\"https://x.gov.co/sites/default/files/d.pdf\\\">el decreto</a>\" };</script></body></html>";
  assert.deepEqual(names(prose).filter((name) => /Wix|Shopify|Squarespace|Webflow|Joomla|Svelte|Drupal|WordPress/.test(name)), []);
  const own = "<html><head><meta name=\"generator\" content=\"WordPress 6.6\"><!-- This is Squarespace. --><script>Shopify.theme = {\"name\":\"Dawn\"};</script></head><body>" +
    "<a href=\"/sites/default/files/menu.pdf\">Menu</a><a href=\"https://shop.example.com/wp-content/a.pdf\">A</a></body></html>";
  assert.deepEqual(names(own).filter((name) => /Shopify|Squarespace|Drupal|WordPress/.test(name)).sort(), ["Drupal", "Shopify", "Squarespace", "WordPress"]);
});
