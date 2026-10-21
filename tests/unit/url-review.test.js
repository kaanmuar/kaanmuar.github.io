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
        const res = new EventEmitter();
        Object.assign(res, { statusCode: route.status, headers: route.headers || {}, socket: null });
        onResponse(res);
        if (route.body) res.emit("data", Buffer.isBuffer(route.body) ? route.body : Buffer.from(route.body));
        res.emit("end");
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
    assert.deepEqual(timedOut.unread, ["spf", "caa"]);
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

  test("when headless Chrome is refused too, the error names the bot protection", async () => {
    const browse = async () => ({ ok: true, start: { status: 403, docStatus: 403, finalUrl: BANK, headers: {}, html: WAF.body } });
    await assert.rejects(review({ [BANK]: WAF }, browse), /^Error: The site's bot protection refused the review \(status 403, an AWS WAF bot check\), in the plain read and in headless Chrome\.$/);
    await assert.rejects(review({ [BANK]: WAF }, async () => ({ ok: false, error: "the browser was busy" })), /refused the plain read \(status 403\), and headless Chrome did not finish \(the browser was busy\)/);
  });

  test("a redirect to http is named as such, not as a wrong address", async () => {
    await assert.rejects(review({ [BANK]: { status: 301, headers: { location: "http://www.bank.example.com/co" } } }),
      /^Error: The site redirected to http:\/\/www\.bank\.example\.com\/co, an http:\/\/ address\. The review only follows https\.$/);
  });

  test("a start page over 2 MB keeps its first 2 MB and says it was cut", async () => {
    const big = HTML.replace("</main>", "<p>" + "garden ".repeat(400000) + "</p></main>");
    const { report, lines } = await review({ [BANK]: { status: 200, headers: STRONG_HEADERS, body: big } });
    assert.equal(report.pages[0].title, "Example shop for garden tools");
    assert.ok(lines.includes(insights.CUT_NOTE));
    assert.ok(report.insights.warnings.includes(insights.CUT_NOTE));
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
    const first = offers.queue([record], now)[0];
    const second = offers.queue([record, { status: "follow-note", email: record.email, createdAt: ago(3) }], now)[0];
    assert.notEqual(first.title, second.title);
  });

  test("the stop page asks before it stops, so a link scanner cannot stop the notes", () => {
    assert.match(customerMail.stopPage("fr", "ask"), /<form method="post">/);
    assert.match(customerMail.stopPage("fr", "done", "a@b.co"), /a@b\.co/);
    assert.ok(!customerMail.stopPage("en", "gone").includes("<form"));
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

  test("no discount goes under 9.50 USD a selection", () => {
    const deal = offers.discountFor(1900, 1, { coupon: { code: "BIG", percent: 90 } });
    assert.equal(deal.usd, 9.5);
    assert.equal(deal.percent, 50);
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
    assert.equal(core.priceMatches(9.49), false);
    assert.equal(core.priceMatches(500), false);
    const order = (value) => ({ status: "COMPLETED", purchase_units: [{ custom_id: "ab12", payments: { captures: [{ status: "COMPLETED", amount: { value, currency_code: "USD" } }] } }] });
    assert.equal(core.paypalPaid(order("16.15")).paid, true);
    assert.equal(core.paypalPaid(order("16.15")).amount, 16.15);
    assert.equal(core.paypalPaid(order("3.00")).paid, false);
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

test("the intake takes the current terms and the ones just before, and records which", () => {
  const body = (termsVersion) => ({ termsAccepted: true, termsVersion, name: "Ana Ruiz", email: "ana@example.org", reasonCode: "teaching", frameworks: ["Playwright"], url: "https://example.org/" });
  const now = core.validateIntake(body(core.TERMS_VERSION));
  assert.deepEqual(now.errors, []);
  assert.equal(now.value.termsVersion, core.TERMS_VERSION);
  assert.equal(core.validateIntake(body("2026-10-20")).value.termsVersion, "2026-10-20");
  assert.ok(core.validateIntake(body("2026-09-01")).errors.some((e) => e.field === "terms"));
});

const failures = require("../../functions/url-review-failures");

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
  assert.deepEqual(record.options, { pages: 20, depth: 2, frameworks: ["playwright"] });

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
  assert.deepEqual(failures.rerunMark("x1", held), { at: held.at, id: "x1", status: "held", trigger: "cleared", cause: "" });

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
  assert.deepEqual(failures.bugPlan([Object.assign({}, oldBot, { rerun: rerunAfterFix })], [rerun], []).map((bug) => [bug.key, bug.runs]), [["bot-protection-319", 2]]);
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
