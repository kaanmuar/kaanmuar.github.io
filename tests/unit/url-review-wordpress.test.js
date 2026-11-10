const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const zlib = require("node:zlib");
const wp = require("../../functions/url-review-wordpress");
const { english } = require("../../functions/url-review-findings-en");

const PAGE = fs.readFileSync(path.join(__dirname, "../fixtures/wordpress-page.html"), "utf8");
const FEED = fs.readFileSync(path.join(__dirname, "../fixtures/wordfence-feed-sample.json"), "utf8");

function indexOf(text, size) {
  const build = wp.indexer();
  const split = wp.feedSplitter(build.add);
  for (let i = 0; i < text.length; i += size) split(text.slice(i, i + size));
  return build.done("2026-11-09");
}

const FILES = {
  "https://clinic.example/wp-content/themes/astra/style.css": { status: 200, html: false, body: "/*\nTheme Name: Astra\nAuthor: Brainstorm Force\nVersion: 4.6.4\n*/\nbody{}" },
  "https://clinic.example/wp-content/plugins/contact-form-7/readme.txt": { status: 200, html: false, body: "=== Contact Form 7 ===\nRequires at least: 6.2\nStable tag: 5.3.1\nLicense: GPLv2\n" },
  "https://clinic.example/wp-content/plugins/elementor/readme.txt": { status: 404, html: true, body: "<!doctype html><title>Not found</title>" },
  "https://clinic.example/wp-content/plugins/wp-rocket/readme.txt": { status: 200, html: false, body: "Stable tag: 3.15.2\n" }
};

async function checked(read) {
  const pages = [{ url: "https://clinic.example/", inspect: { wordpress: wp.fromHtml(PAGE, "https://clinic.example/") } }];
  return wp.check(pages, { read, index: async () => indexOf(FEED, 997) });
}

test("a WordPress page gives its core version and the plugin and theme folders its own files load (#3086)", () => {
  const found = wp.fromHtml(PAGE, "https://clinic.example/");
  assert.equal(found.core, "6.4.1");
  assert.equal(found.via, "generator");
  assert.deepEqual(found.plugins, [
    { slug: "contact-form-7", ver: "5.3.1" },
    { slug: "elementor", ver: "3.6.1" },
    { slug: "cookie-notice", ver: "6.4.1" },
    { slug: "wp-rocket", ver: "" }
  ]);
  assert.deepEqual(found.themes, [{ slug: "astra", ver: "4.6.4" }]);
  assert.equal(wp.fromHtml("<html><body>Hello</body></html>", "https://plain.example/"), null);
  const noGenerator = wp.fromHtml(PAGE.replace(/<meta name="generator"[^>]*>/, ""), "https://clinic.example/");
  assert.deepEqual([noGenerator.core, noGenerator.via], ["6.4.1", "asset"]);
  const gutenberg = wp.fromHtml('<link rel="stylesheet" href="/wp-includes/css/dist/block-library/style.min.css?ver=17.1.0">', "https://g.example/");
  assert.equal(gutenberg, null);
});

test("readme.txt and style.css headers give the installed version (#3086)", () => {
  assert.equal(wp.stableTag("=== X ===\nStable tag: 2.4.1\n"), "2.4.1");
  assert.equal(wp.stableTag("Stable tag: trunk\n"), "");
  assert.equal(wp.themeVersion("/*\n * Theme Name: Child\n * Version: 1.0.3\n */"), "1.0.3");
  assert.equal(wp.themeVersion("body{}"), "");
});

test("the feed splits into records across any chunk size, and informational notes are left out (#3086)", () => {
  for (const size of [1, 7, 64, 4096, FEED.length]) {
    const index = indexOf(FEED, size);
    assert.equal(index.count, 5, "chunk size " + size);
    assert.deepEqual(Object.keys(index.plugin).sort(), ["contact-form-7", "elementor"]);
    assert.deepEqual(Object.keys(index.theme), ["astra"]);
    assert.equal(index.core.wordpress.v[0][0].length, 2);
  }
  const index = indexOf(FEED, 50);
  assert.equal(index.plugin["contact-form-7"].n, "Contact Form 7");
  assert.equal(index.plugin["contact-form-7"].v[1][5], "Contact Form 7 <= 5.9.1 - Reflected Cross-Site Scripting via \"active-tab\" {param}");
  assert.match(index.terms, /wordfence-intelligence-terms/);
});

test("version ranges match with their bounds, and the fix is the first patched version above the one installed (#3086)", () => {
  const index = indexOf(FEED, 4096);
  assert.equal(wp.match(index, "plugin", "elementor", "3.5.9").vulns, 0);
  assert.equal(wp.match(index, "plugin", "elementor", "3.6.0").vulns, 1);
  assert.equal(wp.match(index, "plugin", "elementor", "3.6.3").vulns, 0);
  assert.equal(wp.match(index, "plugin", "unknown-plugin", "1.0"), null);
  const core = wp.match(index, "core", "wordpress", "6.3.1");
  assert.deepEqual([core.vulns, core.fixed, core.score], [1, "6.3.3", 8.1]);
  const form = wp.match(index, "plugin", "contact-form-7", "5.3.1");
  assert.deepEqual([form.vulns, form.fixed, form.score, form.cves], [2, "5.9.2", 10, ["CVE-2020-35489", "CVE-2024-2242"]]);
  assert.equal(form.summary, "Unrestricted File Upload");
  const theme = wp.match(index, "theme", "astra", "4.6.4");
  assert.deepEqual([theme.unpatched, theme.fixed], [true, ""]);
});

test("the review reads up to 15 headers through its own fetch and drops a ?ver= WordPress appended (#3086)", async () => {
  const asked = [];
  const result = await checked(async (url) => {
    asked.push(url);
    if (/cookie-notice/.test(url)) return null;
    return FILES[url] || { status: 404, html: true, body: "" };
  });
  assert.equal(asked.length, 5);
  const by = Object.fromEntries(result.components.map((row) => [row.slug, row]));
  assert.deepEqual([by.wordpress.version, by.wordpress.via, by.wordpress.fixed], ["6.4.1", "generator", "6.4.2"]);
  assert.deepEqual([by.astra.version, by.astra.via, by.astra.unpatched], ["4.6.4", "style", true]);
  assert.deepEqual([by["contact-form-7"].version, by["contact-form-7"].via], ["5.3.1", "readme"]);
  assert.deepEqual([by.elementor.version, by.elementor.via, by.elementor.fixed], ["3.6.1", "asset", "3.6.3"]);
  assert.deepEqual([by["cookie-notice"].version, by["cookie-notice"].vulns], ["", undefined]);
  assert.deepEqual([by["wp-rocket"].version, by["wp-rocket"].vulns], ["3.15.2", 0]);
  assert.deepEqual(result.feed, { fetched: "2026-11-09", count: 5 });
  assert.match(wp.note(result), /WordPress 6\.4\.1: 5 plugins and themes seen, 5 with a version, 4 with known vulnerabilities/);

  const many = Array.from({ length: 30 }, (_, i) => ({ slug: "plugin-" + i, ver: "1.0." + i }));
  const reads = [];
  await wp.check([{ url: "https://big.example/", inspect: { wordpress: { core: "", via: "", plugins: many, themes: [] } } }], { read: async (url) => { reads.push(url); return null; }, index: async () => null });
  assert.equal(reads.length, 15);
});

test("the finding lists each component with CVE, CVSS and fixed version, worst CVSS first (#3086)", async () => {
  const result = await checked(async (url) => FILES[url] || null);
  const findings = [];
  wp.checks(result, (area, verdict, severity, key, title, evidence, fix, opts) => findings.push({ area, verdict, severity, key, title, evidence, fix, opts }));
  assert.equal(findings.length, 1);
  const [f] = findings;
  assert.deepEqual([f.area, f.verdict, f.severity, f.key, f.opts.count], ["Security", "fail", "high", "sec-wordpress", 4]);
  assert.equal(english(f.title), "4 WordPress components have known vulnerabilities");
  const text = english(f.evidence);
  assert.match(text, /^Contact Form 7 5\.3\.1 \(plugin\): 2 known vulnerabilities, the worst CVSS 10\.0 \(critical\), CVE-2020-35489, CVE-2024-2242, fixed in 5\.9\.2\. Unrestricted File Upload\./);
  assert.match(text, /Elementor Website Builder 3\.6\.1 \(plugin\): 1 known vulnerability, the worst CVSS 9\.9 \(critical\), CVE-2022-1329, fixed in 3\.6\.3\./);
  assert.match(text, /WordPress 6\.4\.1 \(core\): 1 known vulnerability, the worst CVSS 8\.1 \(high\), fixed in 6\.4\.2\./);
  assert.match(text, /Astra 4\.6\.4 \(theme\): 1 known vulnerability, the worst CVSS 6\.4 \(medium\), with no fixed version yet\./);
  assert.match(text, /checked against the Wordfence Intelligence feed of 2026-11-09 \(vulnerability data copyright Defiant Inc\.\)\.$/);
  assert.match(english(f.fix), /^Update Contact Form 7 to 5\.9\.2 or later; update Elementor Website Builder to 3\.6\.3 or later; update WordPress to 6\.4\.2 or later; remove or replace Astra, which has no fixed version\. Back up/);

  const es = require("../../functions/url-review-findings-copy").forLang("es");
  assert.equal(es.line(f.title, ""), "4 componentes de WordPress tienen vulnerabilidades conocidas");
  assert.match(es.line(f.evidence, ""), /2 vulnerabilidades conocidas, la más grave con CVSS 10\.0 \(crítica\)/);
});

test("a pass when every checked version is clean, and nothing without the stored feed (#3086)", () => {
  const clean = { components: [{ type: "plugin", slug: "akismet", name: "Akismet", version: "5.3", via: "readme", vulns: 0 }], feed: { fetched: "2026-11-09", count: 5 } };
  const findings = [];
  const add = (area, verdict, severity, key, title, evidence) => findings.push({ verdict, key, title: english(title), evidence: english(evidence) });
  wp.checks(clean, add);
  assert.deepEqual(findings, [{ verdict: "pass", key: "sec-wordpress", title: "WordPress plugins and themes have no known vulnerability", evidence: "Akismet 5.3, checked against the Wordfence Intelligence feed of 2026-11-09 (vulnerability data copyright Defiant Inc.)." }]);
  findings.length = 0;
  wp.checks({ components: clean.components.map((row) => ({ type: row.type, slug: row.slug, version: row.version })), feed: null }, add);
  wp.checks(null, add);
  assert.deepEqual(findings, []);
});

function fakeStorage(state) {
  const file = {
    exists: async () => [!!state.body],
    getMetadata: async () => [{ updated: state.updated }],
    download: async () => [state.body],
    save: async (body, opts) => { state.body = body; state.saved = opts; }
  };
  return { bucket: (name) => { state.bucket = name; return { file: (name2) => { state.path = name2; return file; } }; } };
}

function feedResponse(text, status) {
  const bytes = Buffer.from(text, "utf8");
  return { status: status || 200, ok: !status || status === 200, body: (async function* () { for (let i = 0; i < bytes.length; i += 333) yield bytes.subarray(i, i + 333); })() };
}

test("the daily job skips without a key, with a fresh index or on 429, and stores the gzipped index otherwise (#3086)", async () => {
  const state = {};
  let calls = 0;
  const fetchFeed = async (url, init) => { calls += 1; state.url = url; state.auth = init.headers.authorization; return feedResponse(FEED); };
  assert.deepEqual(await wp.refreshFeed({ storage: fakeStorage(state), fetch: fetchFeed }), { skipped: "no key" });
  assert.equal(calls, 0);

  const now = Date.parse("2026-11-09T22:45:00Z");
  const out = await wp.refreshFeed({ key: "k1", storage: fakeStorage(state), fetch: fetchFeed, now, minRecords: 1 });
  assert.deepEqual([out.count, out.slugs, calls], [5, 3, 1]);
  assert.equal(state.url, wp.FEED_URL);
  assert.equal(state.auth, "Bearer k1");
  assert.equal(state.path, wp.INDEX_PATH);
  const stored = JSON.parse(zlib.gunzipSync(state.body).toString("utf8"));
  assert.equal(stored.fetched, "2026-11-09");
  assert.equal(stored.plugin.elementor.v[0][3], "CVE-2022-1329");

  state.updated = new Date(now - 3 * 3600000).toISOString();
  assert.equal((await wp.refreshFeed({ key: "k1", storage: fakeStorage(state), fetch: fetchFeed, now })).skipped, "fresh");
  assert.equal(calls, 1);

  state.updated = new Date(now - 30 * 3600000).toISOString();
  assert.equal((await wp.refreshFeed({ key: "k1", storage: fakeStorage(state), fetch: async () => feedResponse("", 429), now })).skipped, "rate limited");
  const before = state.body;
  await assert.rejects(wp.refreshFeed({ key: "k1", storage: fakeStorage(state), fetch: async () => feedResponse(FEED), now }), /only 5 records/);
  assert.equal(state.body, before);

  const index = await wp.loadIndex(fakeStorage(state));
  assert.equal(index.count, 5);
});
