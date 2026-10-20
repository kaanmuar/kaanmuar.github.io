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

  test("a read where most linked pages were blocked is reported as partial", () => {
    const rows = [{ url: URL_, html: HTML }].concat([1, 2, 3, 4].map((n) => ({ url: URL_ + "p" + n, status: 403, html: "" })), [{ url: URL_ + "ok", html: HTML }]);
    const result = analyzeHtmlPages(rows);
    assert.equal(verdict(result, "seo-broken-links"), "missing");
    assert.match(result.warnings[0], /^Partial read: 4 of 5 linked pages/);
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
