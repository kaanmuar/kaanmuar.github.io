"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const cyber = require("../../functions/url-review-cyber-passive");
const core = require("../../functions/url-review-core");
const insights = require("../../functions/url-review-insights");
const { english } = require("../../functions/url-review-findings-en");

const PAGE_URL = "https://shop.example.com/";
const BASE_HEADERS = {
  "content-type": "text/html",
  "strict-transport-security": "max-age=63072000; includeSubDomains",
  "x-content-type-options": "nosniff",
  "referrer-policy": "strict-origin-when-cross-origin"
};

function collect(fn) {
  const rows = [];
  fn((area, verdict, severity, key, title, evidence, fix) => rows.push({ area, verdict, severity, key, title, evidence, fix }));
  return rows;
}

function review(html, csp) {
  const headers = Object.assign({}, BASE_HEADERS, csp ? { "content-security-policy": csp } : {});
  const page = { url: PAGE_URL, path: "/", status: 200, ms: 100, depth: 0, inspect: core.analyzeHtml(html, headers, PAGE_URL) };
  return { page, findings: insights.analyze({ pages: [page], robotsText: "" }).findings };
}

const find = (findings, key) => findings.find((item) => item.key === key);

test("evaluateCsp flags shared script hosts, wildcards above them and subdomains", () => {
  const ids = (value) => cyber.evaluateCsp(value).map((item) => item.id + ":" + item.detail);
  assert.deepEqual(ids("script-src 'self' https://ajax.googleapis.com"), ["host:ajax.googleapis.com"]);
  assert.deepEqual(ids("script-src https://*.googleapis.com"), ["host:*.googleapis.com"]);
  assert.deepEqual(ids("script-src https://mysite.github.io"), ["host:mysite.github.io"]);
  assert.deepEqual(ids("default-src 'self' cdn.jsdelivr.net/npm/"), ["host:cdn.jsdelivr.net"]);
  assert.deepEqual(ids("script-src 'self' https://static.example.com"), []);
});

test("evaluateCsp ignores host allowlists when a nonce meets strict-dynamic", () => {
  assert.deepEqual(cyber.evaluateCsp("script-src 'nonce-abcdEFGH12345678' 'strict-dynamic' https://unpkg.com"), []);
  assert.equal(cyber.evaluateCsp("script-src 'nonce-abcdEFGH12345678' https://unpkg.com").some((item) => item.id === "host"), true);
});

test("evaluateCsp flags data and blob sources, unsafe-hashes, plain http and weak nonces", () => {
  const ids = cyber.evaluateCsp("script-src 'self' data: blob: http://cdn.example.com 'unsafe-hashes' 'nonce-ab'").map((item) => item.id);
  ["dataScheme", "plainHttp", "unsafeHashes", "weakNonce"].forEach((id) => assert.ok(ids.includes(id), id));
  assert.deepEqual(cyber.evaluateCsp("script-src 'nonce-QUJDREVGR0hJSktMTU5PUA==' 'self'"), []);
});

test("evaluateCsp uses script-src-elem first, then script-src, then default-src; no policy gives nothing", () => {
  assert.equal(cyber.evaluateCsp("img-src data:").length, 0);
  assert.equal(cyber.evaluateCsp("").length, 0);
  assert.equal(cyber.evaluateCsp("default-src data:").length, 1);
  assert.equal(cyber.evaluateCsp("default-src data:; script-src 'self'").length, 0);
  assert.equal(cyber.evaluateCsp("script-src 'self'; script-src-elem blob:").length, 1);
});

test("evaluatePolicies merges header and meta policies without repeats", () => {
  const issues = cyber.evaluatePolicies(["script-src data:", "script-src data: https://unpkg.com", ""]);
  assert.equal(issues.filter((item) => item.id === "dataScheme").length, 1);
  assert.equal(issues.filter((item) => item.id === "host").length, 1);
});

test("findBackdoored matches the bundled retire.js v6 list and nothing else", () => {
  const hits = cyber.findBackdoored(["https://cdn.polyfill.io/v3/polyfill.min.js?features=fetch", "https://cdn.example.com/app.js", "https://cdnjs.cloudflare.com/polyfill/v3/polyfill.min.js"]);
  assert.equal(hits.length, 1);
  assert.equal(hits[0].name, "polyfill.io");
  assert.equal(hits[0].severity, "high");
  assert.deepEqual(cyber.findBackdoored(["https://x.test/a.js"], { entries: [] }), []);
  const custom = { entries: [{ name: "evil", severity: "high", summary: "s", extractors: ["^https://evil\\.test/", "("] }] };
  assert.equal(cyber.findBackdoored(["https://evil.test/a.js"], custom).length, 1);
});

test("auditSri finds weak hashes, a missing crossorigin and stylesheets without a hash", () => {
  const audit = cyber.auditSri([
    { kind: "script", host: "a.cdn.test", integrity: "sha384-abc", hasCrossorigin: true },
    { kind: "script", host: "weak.cdn.test", integrity: "sha1-abc", hasCrossorigin: true },
    { kind: "script", host: "nocors.cdn.test", integrity: "sha256-abc sha512-def", hasCrossorigin: false },
    { kind: "style", host: "styles.cdn.test", integrity: "", hasCrossorigin: false },
    { kind: "style", host: "fonts.googleapis.com", integrity: "", hasCrossorigin: false },
    { kind: "script", host: "plain.cdn.test", integrity: "", hasCrossorigin: false }
  ]);
  assert.deepEqual(audit.weak, ["weak.cdn.test"]);
  assert.deepEqual(audit.noCors, ["nocors.cdn.test"]);
  assert.deepEqual(audit.styleMissing, ["styles.cdn.test"]);
});

test("mergeSri joins per-page audits without repeats", () => {
  const merged = cyber.mergeSri([{ weak: ["a"], noCors: [], styleMissing: ["s"] }, { weak: ["a", "b"] }, null]);
  assert.deepEqual(merged.weak, ["a", "b"]);
  assert.deepEqual(merged.styleMissing, ["s"]);
});

test("findings add rows only when something is wrong, and every row has English copy", () => {
  const clean = collect((add) => cyber.findings({ csp: ["script-src 'self'"], read: [] }, add));
  assert.deepEqual(clean, []);
  const rows = collect((add) => cyber.findings({
    csp: ["script-src 'self' data: https://unpkg.com"],
    read: [{ inspect: { scriptUrls: ["https://cdn.polyfill.io/v3/polyfill.min.js"], sri: { audit: { weak: ["w.test"], noCors: ["n.test"], styleMissing: ["s.test"] } } } }]
  }, add));
  assert.deepEqual(rows.map((row) => row.key), ["sec-csp-bypass", "sec-backdoored", "sec-sri-gaps"]);
  rows.forEach((row) => {
    assert.ok(english(row.title).length > 5);
    assert.ok(english(row.evidence).length > 5);
    assert.ok(english(row.fix).length > 5);
  });
  assert.equal(rows[0].severity, "medium");
  assert.equal(rows[1].verdict, "fail");
  assert.match(english(rows[1].evidence), /polyfill\.io/);
});

test("analyzeHtml records script addresses and an SRI audit for cross-origin tags", () => {
  const html = '<!doctype html><html><head><title>t</title>' +
    '<script src="/local.js"></script>' +
    '<script src="https://cdn.polyfill.io/v3/polyfill.min.js"></script>' +
    '<script src="https://cdn.example.com/a.js" integrity="sha1-xyz" crossorigin="anonymous"></script>' +
    '<script src="https://cdn.example.com/b.js" integrity="sha384-xyz"></script>' +
    '<link rel="stylesheet" href="https://styles.example.com/s.css">' +
    '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter">' +
    '<link rel="stylesheet" href="/site.css"></head><body></body></html>';
  const inspect = core.analyzeHtml(html, BASE_HEADERS, PAGE_URL);
  assert.ok(inspect.scriptUrls.includes("https://cdn.polyfill.io/v3/polyfill.min.js"));
  assert.ok(inspect.scriptUrls.includes("https://shop.example.com/local.js"));
  assert.deepEqual(inspect.sri.audit.weak, ["cdn.example.com"]);
  assert.deepEqual(inspect.sri.audit.noCors, ["cdn.example.com"]);
  assert.deepEqual(inspect.sri.audit.styleMissing, ["styles.example.com"]);
});

test("insights report the three checks on a page that trips them", () => {
  const html = '<!doctype html><html><head><title>t</title>' +
    '<script src="https://cdn.polyfill.io/v3/polyfill.min.js"></script>' +
    '<script src="https://cdn.example.com/b.js" integrity="sha384-xyz"></script>' +
    '</head><body></body></html>';
  const { findings } = review(html, "script-src 'self' https://ajax.googleapis.com data:");
  const bypass = find(findings, "sec-csp-bypass");
  assert.equal(bypass.verdict, "risk");
  assert.match(bypass.evidence, /ajax\.googleapis\.com/);
  assert.equal(find(findings, "sec-backdoored").verdict, "fail");
  assert.match(find(findings, "sec-sri-gaps").evidence, /cdn\.example\.com/);
});

test("insights stay quiet on a page with a strict policy and clean tags", () => {
  const html = '<!doctype html><html><head><title>t</title>' +
    '<script src="https://cdn.example.com/b.js" integrity="sha384-xyz" crossorigin="anonymous"></script>' +
    '</head><body></body></html>';
  const { findings } = review(html, "default-src 'self'; script-src 'nonce-QUJDREVGR0hJSktMTU5PUA==' 'strict-dynamic'; object-src 'none'; base-uri 'none'");
  ["sec-csp-bypass", "sec-backdoored", "sec-sri-gaps"].forEach((key) => assert.equal(find(findings, key), undefined, key));
});
