"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const carbon = require("../../functions/url-review-carbon");
const headOrder = require("../../functions/url-review-head-order");
const har = require("../../functions/url-review-har");
const graph = require("../../functions/url-review-page-graph");
const insights = require("../../functions/url-review-insights");
const core = require("../../functions/url-review-core");
const { english } = require("../../functions/url-review-findings-en");

const collect = () => {
  const rows = [];
  const add = (area, verdict, severity, key, title, evidence, fix) => rows.push({ area, verdict, severity, key, title: english(title), evidence: english(evidence), fix: fix ? english(fix) : "" });
  return { rows, add };
};

// ---- carbon

test("carbon.estimate applies the Sustainable Web Design v4 formula and rates the result", () => {
  assert.deepEqual(carbon.estimate(2000000, "browser"), { bytes: 2000000, grams: 0.296, rating: "E", source: "browser" });
  assert.deepEqual(carbon.estimate(250000, "lighthouse"), { bytes: 250000, grams: 0.037, rating: "A+", source: "lighthouse" });
  assert.equal(carbon.estimate(0, "browser"), null);
  assert.equal(carbon.estimate(undefined, "browser"), null);
});

test("carbon.findings adds one unscored Performance finding, with advice only for a heavy page", () => {
  const light = collect();
  assert.equal(carbon.findings(carbon.estimate(250000, "browser"), light.add).rating, "A+");
  assert.equal(light.rows.length, 1);
  assert.equal(light.rows[0].verdict, "pass");
  assert.equal(light.rows[0].fix, "");
  assert.match(light.rows[0].evidence, /250 kB transferred on the browser's cold load/);
  assert.match(light.rows[0].evidence, /0\.37 kg CO₂e|0\.37 kg/);
  const heavy = collect();
  carbon.findings(carbon.estimate(2000000, "lighthouse"), heavy.add);
  assert.equal(heavy.rows[0].verdict, "pass");
  assert.equal(heavy.rows[0].severity, "info");
  assert.match(heavy.rows[0].title, /about 0\.296 g CO₂e \(rating E\)/);
  assert.match(heavy.rows[0].evidence, /in the Lighthouse run/);
  assert.match(heavy.rows[0].fix, /Brotli/);
  assert.equal(carbon.findings(null, heavy.add), null);
  assert.equal(heavy.rows.length, 1);
});

// ---- head order

const GOOD_HEAD = '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Acme</title>'
  + '<link rel="preconnect" href="https://fonts.gstatic.com"><script async src="/a.js"></script><script src="/b.js"></script>'
  + '<link rel="stylesheet" href="/s.css"><link rel="preload" href="/f.woff2" as="font"><script defer src="/c.js"></script>'
  + '<link rel="prefetch" href="/next"><link rel="canonical" href="https://acme.test/"></head><body><script src="/ignored-after-head.js"></script></body></html>';

test("headOrder.classify gives each head element capo's class", () => {
  const kind = (name, attrs, body) => headOrder.classify(name, " " + attrs, body || "");
  assert.equal(kind("meta", 'charset="utf-8"'), "meta");
  assert.equal(kind("meta", 'name="viewport" content="x"'), "meta");
  assert.equal(kind("meta", 'http-equiv="content-security-policy" content="x"'), "meta");
  assert.equal(kind("meta", 'name="description" content="x"'), "other");
  assert.equal(kind("title", ""), "meta");
  assert.equal(kind("link", 'rel="preconnect" href="x"'), "preconnect");
  assert.equal(kind("link", 'rel="stylesheet" href="x"'), "syncStyles");
  assert.equal(kind("link", 'rel="modulepreload" href="x"'), "preload");
  assert.equal(kind("link", 'rel="dns-prefetch" href="x"'), "prefetch");
  assert.equal(kind("link", 'rel="icon" href="x"'), "other");
  assert.equal(kind("style", "", "@import url(a.css);"), "importStyles");
  assert.equal(kind("style", "", "a{}"), "syncStyles");
  assert.equal(kind("script", 'src="x" async'), "asyncScript");
  assert.equal(kind("script", 'src="x" defer'), "deferScript");
  assert.equal(kind("script", 'type="module" src="x"'), "deferScript");
  assert.equal(kind("script", 'src="x"'), "syncScript");
  assert.equal(kind("script", "", "var a=1"), "syncScript");
  assert.equal(kind("script", 'type="application/ld+json"', "{}"), "other");
});

test("headOrder.analyze scores a well-ordered head 100 and stops at the body", () => {
  const report = headOrder.analyze(GOOD_HEAD);
  assert.equal(report.inversions, 0);
  assert.equal(report.score, 100);
  assert.equal(report.total, 11);
  assert.deepEqual(report.moves, []);
});

test("headOrder.analyze names the misplaced elements and drafts the ordered head", () => {
  const html = '<html><head><script src="/b.js?token=abc"></script><link rel="preconnect" href="https://cdn.test/?k=1"><title>T</title><meta charset="utf-8"><style>a{color:red}</style></head><body>';
  const report = headOrder.analyze(html, { detail: true });
  assert.ok(report.score < 60);
  assert.ok(report.inversions >= 4);
  assert.deepEqual(report.moves[0], { early: "syncScript", late: "preconnect" });
  assert.deepEqual(report.ordered.map((row) => row.kind), ["meta", "meta", "preconnect", "syncScript", "syncStyles"]);
  assert.equal(report.ordered[0].snippet, "<title>…</title>");
  assert.equal(report.ordered[1].snippet, '<meta charset="utf-8">');
  assert.ok(report.ordered.every((row) => !/token=|k=1/.test(row.snippet)), "query strings are never kept");
  const moved = report.ordered.find((row) => row.kind === "syncScript");
  assert.deepEqual([moved.from, moved.to], [1, 4]);
  assert.equal(headOrder.analyze(html).ordered, undefined);
});

test("headOrder.findings is a pass when ordered, a low risk with the fix when not, and silent on tiny heads", () => {
  const good = collect();
  headOrder.findings(headOrder.analyze(GOOD_HEAD), good.add);
  assert.equal(good.rows[0].verdict, "pass");
  assert.match(good.rows[0].title, /good order/);
  const bad = collect();
  headOrder.findings(headOrder.analyze("<head><script src=a.js></script><meta charset=utf-8><link rel=preconnect href=https://x.test></head>"), bad.add);
  assert.equal(bad.rows[0].verdict, "risk");
  assert.equal(bad.rows[0].severity, "low");
  assert.match(bad.rows[0].evidence, /the title, charset or viewport comes after a blocking script/);
  assert.match(bad.rows[0].fix, /Capo\.js/);
  const tiny = collect();
  assert.equal(headOrder.findings(headOrder.analyze("<head><title>x</title></head>"), tiny.add), null);
  assert.equal(tiny.rows.length, 0);
});

// ---- HAR waterfall

function replay(log, requests) {
  requests.forEach((r) => {
    log.request({ requestId: r.id, request: { url: r.url, method: "GET" }, type: r.type, timestamp: r.at, wallTime: 1700000000 + r.at, initiator: r.from ? { type: "script", url: r.from } : { type: "parser" }, redirectResponse: r.redirect });
    log.response({ requestId: r.id, timestamp: r.at + 0.05, response: { status: 200, mimeType: r.mime || "text/html", protocol: "h2", timing: { sendEnd: 1, receiveHeadersEnd: r.wait || 40 } } });
    if (r.fail) log.failed({ requestId: r.id, timestamp: r.at + r.dur });
    else log.finished({ requestId: r.id, timestamp: r.at + r.dur, encodedDataLength: r.bytes || 1000 });
  });
}

test("har log keeps one row per request, strips queries and ignores non-http addresses", () => {
  const log = har.createLog();
  replay(log, [
    { id: "1", url: "https://acme.test/?session=secret#x", type: "Document", at: 10, dur: 0.2, bytes: 5000 },
    { id: "2", url: "data:image/png;base64,AAAA", type: "Image", at: 10.3, dur: 0.01 },
    { id: "3", url: "https://acme.test/a.css?v=3", type: "Stylesheet", at: 10.25, dur: 0.1, bytes: 800, mime: "text/css" },
    { id: "4", url: "https://cdn.test/x.js", type: "Script", at: 10.3, dur: 0.1, fail: true }
  ]);
  const rows = log.entries();
  assert.deepEqual(rows.map((row) => row.url), ["https://acme.test/", "https://acme.test/a.css", "https://cdn.test/x.js"]);
  assert.equal(rows[0].startMs, 0);
  assert.equal(rows[0].totalMs, 200);
  assert.equal(rows[0].bytes, 5000);
  assert.equal(rows[0].waitMs, 39);
  assert.equal(rows[1].startMs, 250);
  assert.equal(rows[2].failed, true);
  assert.ok(log.startedAt().startsWith("2023-11-14T"));
});

test("har log closes a redirected request and caps its rows", () => {
  const log = har.createLog(3);
  log.request({ requestId: "r", request: { url: "http://acme.test/", method: "GET" }, type: "Document", timestamp: 1, wallTime: 1700000000, initiator: { type: "other" } });
  log.request({ requestId: "r", request: { url: "https://acme.test/", method: "GET" }, type: "Document", timestamp: 1.1, redirectResponse: { status: 301 }, initiator: { type: "other" } });
  log.finished({ requestId: "r", timestamp: 1.3, encodedDataLength: 10 });
  for (let i = 0; i < 6; i++) replay(log, [{ id: "x" + i, url: "https://acme.test/" + i, type: "Image", at: 2 + i, dur: 0.1 }]);
  const rows = log.entries();
  assert.equal(rows.length, 3);
  assert.equal(rows[0].status, 301);
  assert.equal(rows[1].url, "https://acme.test/");
});

test("har.toHar writes a HAR 1.2 file with no headers or cookies", () => {
  const log = har.createLog();
  replay(log, [{ id: "1", url: "https://acme.test/", type: "Document", at: 5, dur: 0.3, bytes: 4000 }]);
  const file = har.toHar(log.entries(), { startedAt: "2026-11-19T12:00:00.000Z", title: "Acme" });
  assert.equal(file.log.version, "1.2");
  assert.equal(file.log.pages[0].title, "Acme");
  const entry = file.log.entries[0];
  assert.equal(entry.startedDateTime, "2026-11-19T12:00:00.000Z");
  assert.equal(entry.time, 300);
  assert.equal(entry.response.content.size, 4000);
  assert.deepEqual(entry.request.headers, []);
  assert.deepEqual(entry.response.cookies, []);
  assert.equal(entry._resourceType, "Document");
});

const ROW = (over) => Object.assign({ method: "GET", type: "Script", from: "", status: 200, mime: "", protocol: "h2", startMs: 0, waitMs: 20, totalMs: 100, bytes: 1000, failed: false }, over);

test("har.summarize finds the slowest request, the largest one and the longest chain", () => {
  const rows = [
    ROW({ url: "https://acme.test/", type: "Document", totalMs: 300 }),
    ROW({ url: "https://acme.test/a.js", from: "https://acme.test/", startMs: 300, totalMs: 100 }),
    ROW({ url: "https://acme.test/b.js", from: "https://acme.test/a.js", startMs: 400, totalMs: 100, bytes: 90000 }),
    ROW({ url: "https://cdn.test/c.js", from: "https://acme.test/b.js", startMs: 500, totalMs: 2500 }),
    ROW({ url: "https://cdn.test/d.json", type: "Fetch", from: "https://cdn.test/c.js", startMs: 3000, totalMs: 50 }),
    ROW({ url: "https://cdn.test/stream", type: "EventSource", startMs: 100, totalMs: 9000 })
  ];
  const summary = har.summarize(rows);
  assert.equal(summary.count, 6);
  assert.equal(summary.endMs, 9100);
  assert.deepEqual(summary.slowest, { path: "/c.js", ms: 2500, type: "Script" });
  assert.deepEqual(summary.largest, { path: "/b.js", bytes: 90000 });
  assert.deepEqual(summary.chain, { depth: 5, end: "/d.json" });
  assert.equal(har.summarize([]), null);
});

test("har.summarize survives an initiator cycle", () => {
  const summary = har.summarize([ROW({ url: "https://a.test/1", from: "https://a.test/2" }), ROW({ url: "https://a.test/2", from: "https://a.test/1" })]);
  assert.ok(summary.chain.depth <= 2);
});

test("har.findings flags a long chain or a slow request and passes a quick load", () => {
  const fast = collect();
  har.findings([1, 2, 3, 4, 5].map((i) => ROW({ url: "https://acme.test/" + i, startMs: i * 10 })), fast.add);
  assert.equal(fast.rows[0].verdict, "pass");
  assert.match(fast.rows[0].evidence, /^5 requests finished in 0\.2 s/);
  const slow = collect();
  const rows = [
    ROW({ url: "https://acme.test/", type: "Document" }),
    ROW({ url: "https://acme.test/a.js", from: "https://acme.test/" }),
    ROW({ url: "https://acme.test/b.js", from: "https://acme.test/a.js" }),
    ROW({ url: "https://acme.test/c.js", from: "https://acme.test/b.js" }),
    ROW({ url: "https://acme.test/d.js", from: "https://acme.test/c.js", totalMs: 2400 })
  ];
  har.findings(rows, slow.add);
  assert.equal(slow.rows[0].verdict, "risk");
  assert.match(slow.rows[0].title, /a chain of 5 requests that each wait for the one before and a request that took 2400 ms/);
  assert.match(slow.rows[0].evidence, /longest chain has 5 requests and ends at \/d\.js/);
  const few = collect();
  har.findings(rows.slice(0, 2), few.add);
  assert.equal(few.rows.length, 0);
});

// ---- page graph

const WORDS = (seed, n) => Array.from({ length: n }, (_, i) => "w" + seed + "x" + ((i * 7 + seed) % 97)).join(" ");

test("minhash compares text by shingles and ignores short pages", () => {
  const a = WORDS(1, 300);
  const sig = graph.minhash(a);
  assert.equal(sig.length, 512);
  assert.equal(graph.minhash(a), sig);
  assert.equal(graph.similarity(sig, graph.minhash(a + " one more closing sentence here")) > 0.9, true);
  assert.ok(graph.similarity(sig, graph.minhash(WORDS(2, 300))) < 0.2);
  assert.equal(graph.minhash("too short to compare"), "");
  assert.equal(graph.similarity("", sig), 0);
});

test("duplicateGroups joins pages whose text is alike and leaves the others", () => {
  const body = WORDS(5, 400);
  const rows = [
    { path: "/a", sig: graph.minhash(body) },
    { path: "/b", sig: graph.minhash(body.replace("w5x", "w5y") + " tail") },
    { path: "/c", sig: graph.minhash(body) },
    { path: "/d", sig: graph.minhash(WORDS(9, 400)) },
    { path: "/e", sig: "" }
  ];
  const groups = graph.duplicateGroups(rows);
  assert.equal(groups.length, 1);
  assert.ok(groups[0].includes("/a") && groups[0].includes("/c"));
  assert.ok(!groups[0].includes("/d") && !groups[0].includes("/e"));
});

test("pageRank ranks the most linked page first, sums to 1 and counts inbound links", () => {
  const rows = [
    { key: "h", path: "/", links: ["a", "b", "c"] },
    { key: "a", path: "/a", links: ["h", "c"] },
    { key: "b", path: "/b", links: ["c"] },
    { key: "c", path: "/c", links: [] },
    { key: "d", path: "/d", links: ["c", "ghost", "d"] }
  ];
  const ranked = graph.pageRank(rows);
  const total = ranked.reduce((sum, row) => sum + row.rank, 0);
  assert.ok(Math.abs(total - 1) < 1e-9);
  const best = ranked.slice().sort((x, y) => y.rank - x.rank)[0];
  assert.equal(best.path, "/c");
  assert.equal(best.inbound, 4);
  assert.equal(ranked.find((row) => row.path === "/d").inbound, 0);
  assert.deepEqual(graph.pageRank([]), []);
});

test("page graph findings: weakly linked pages and near-duplicates", () => {
  const body = WORDS(3, 300);
  const rows = [
    { key: "h", path: "/", links: ["a", "b", "c", "d", "e"], sig: graph.minhash(WORDS(11, 300)) },
    { key: "a", path: "/a", links: ["h"], sig: graph.minhash(body) },
    { key: "b", path: "/b", links: ["h"], sig: graph.minhash(body) },
    { key: "c", path: "/c", links: ["h"], sig: graph.minhash(WORDS(12, 300)) },
    { key: "d", path: "/d", links: ["h"], sig: graph.minhash(WORDS(13, 300)) },
    { key: "e", path: "/e", links: ["h"], sig: graph.minhash(WORDS(14, 300)) }
  ];
  const found = collect();
  const report = graph.findings(rows, found.add);
  assert.equal(report.weak.length, 5);
  const rank = found.rows.find((row) => row.key === "seo-page-rank");
  assert.equal(rank.verdict, "risk");
  assert.match(rank.title, /^5 pages are linked from only one other page/);
  const dup = found.rows.find((row) => row.key === "seo-near-duplicates");
  assert.equal(dup.verdict, "risk");
  assert.match(dup.title, /^1 group of near-duplicate pages/);
  assert.match(dup.evidence, /\/a ≈ \/b/);

  const meshed = rows.map((row, i) => Object.assign({}, row, { links: rows.map((other) => other.key).filter((key) => key !== row.key), sig: graph.minhash(WORDS(20 + i, 300)) }));
  const clean = collect();
  graph.findings(meshed, clean.add);
  assert.deepEqual(clean.rows.map((row) => row.verdict), ["pass", "pass"]);
  const small = collect();
  assert.equal(graph.findings(rows.slice(0, 3), small.add), null);
});

// ---- wiring

const pageOf = (path, inspectOver, extra) => Object.assign({
  url: "https://acme.test" + path, path, status: 200, ms: 100, depth: path === "/" ? 0 : 1,
  inspect: Object.assign({ title: "T" + path, description: "D", links: [], bytes: 1000, seo: {}, social: {}, headers: {}, h1: [], libraries: [], schema: { items: [] } }, inspectOver)
}, extra || {});

test("insights.analyze runs the carbon, head-order, waterfall and page-graph checks and reports them", () => {
  const head = headOrder.analyze("<head><script src=a.js></script><meta charset=utf-8><link rel=preconnect href=https://x.test><title>t</title></head>", { detail: true });
  const home = pageOf("/", { headOrder: head, minhash: graph.minhash(WORDS(1, 200)), links: ["https://acme.test/a", "https://acme.test/b", "https://acme.test/c", "https://acme.test/d"] });
  const others = ["a", "b", "c", "d"].map((slug, i) => pageOf("/" + slug, { links: ["https://acme.test/"], minhash: graph.minhash(i < 2 ? WORDS(7, 200) : WORDS(30 + i, 200)) }));
  const waterfall = [
    ROW({ url: "https://acme.test/", type: "Document", totalMs: 200 }),
    ROW({ url: "https://acme.test/a.js", from: "https://acme.test/", startMs: 200 }),
    ROW({ url: "https://acme.test/b.js", from: "https://acme.test/a.js", startMs: 300 }),
    ROW({ url: "https://acme.test/c.js", from: "https://acme.test/b.js", startMs: 400 }),
    ROW({ url: "https://acme.test/d.js", from: "https://acme.test/c.js", startMs: 500, totalMs: 3000 })
  ];
  const result = insights.analyze({
    pages: [home].concat(others),
    browser: { ok: true, start: { status: 200, finalPath: "/", bytes: 3000000, dom: { links: [] }, waterfall } }
  });
  const byKey = (key) => result.findings.find((item) => item.key === key);
  assert.equal(byKey("perf-carbon").area, "Performance");
  assert.equal(byKey("perf-carbon").verdict, "pass");
  assert.match(byKey("perf-carbon").title, /rating F/);
  assert.equal(byKey("perf-head-order").verdict, "risk");
  assert.equal(byKey("perf-waterfall").verdict, "risk");
  assert.equal(byKey("seo-page-rank").verdict, "risk");
  assert.equal(byKey("seo-near-duplicates").verdict, "risk");
  assert.ok(byKey("perf-head-order").msg.title, "the title is a message the page can translate");
  assert.equal(result.headOrder.ordered.length, 4);
  assert.equal(result.waterfall.chain.depth, 5);
  assert.equal(result.pageGraph.groups.length, 1);
  assert.ok(result.findings.filter((item) => item.verdict === "risk").every((item) => item.rank > 0));
});

test("insights.analyze adds no new finding when the data was not collected", () => {
  const result = insights.analyze({ pages: [pageOf("/")] });
  ["perf-carbon", "perf-head-order", "perf-waterfall", "seo-page-rank", "seo-near-duplicates"].forEach((key) => {
    assert.equal(result.findings.some((item) => item.key === key), false, key);
  });
  assert.equal(result.headOrder, null);
  assert.equal(result.waterfall, null);
  assert.equal(result.pageGraph, null);
});

test("core.analyzeHtml stores the head-order summary and a text fingerprint on each page it reads", () => {
  const text = WORDS(4, 200);
  const html = "<html><head><script src=/a.js></script><meta charset=utf-8><title>T</title></head><body><p>" + text + "</p></body></html>";
  const read = core.analyzeHtml(html, {}, "https://acme.test/");
  assert.equal(read.headOrder.total, 3);
  assert.ok(read.headOrder.inversions > 0);
  assert.equal(read.headOrder.ordered, undefined);
  assert.equal(read.minhash, graph.minhash(text));
  assert.equal(core.analyzeHtml("<html><head><title>T</title></head><body>short</body></html>", {}, "https://acme.test/").minhash, "");
});

// ---- copy in every language

const ROOT = path.join(__dirname, "../..");
const KEY_START = /^(perf-carbon|perf-head-order|perf-waterfall|seo-page-rank|seo-near-duplicates)\./;

function dictionary(text) {
  const out = {};
  // Biome writes functions/ with single quotes (#3577), so a key or text may be in either quote.
  const quoted = String.raw`(?:"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')`;
  const read = (literal) => new Function("return " + literal)();
  for (const match of text.matchAll(new RegExp("^\\s+(" + quoted + "):\\s+(" + quoted + "),?$", "gm"))) out[read(match[1])] = read(match[2]);
  return out;
}

test("every new finding has English text and a translation in es, pt, de, fr and it with the same slots", () => {
  const en = Object.fromEntries(Object.entries(dictionary(fs.readFileSync(path.join(ROOT, "functions/url-review-findings-en.js"), "utf8"))).filter(([key]) => KEY_START.test(key)));
  assert.ok(Object.keys(en).length >= 40);
  const slots = (text) => (text.match(/\{\w+\}/g) || []).sort().join(",");
  const source = fs.readFileSync(path.join(ROOT, "js/qa-review-findings-copy.js"), "utf8");
  const lines = source.split("\n");
  const blocks = {};
  let lang = null;
  lines.forEach((line) => {
    const head = line.match(/^ {4}([a-z]{2}): \{$/);
    if (head) { lang = head[1]; blocks[lang] = []; return; }
    if (/^ {4}\},?$/.test(line)) lang = null;
    if (lang) blocks[lang].push(line);
  });
  for (const code of ["es", "pt", "de", "fr", "it"]) {
    const book = dictionary(blocks[code].join("\n"));
    for (const [key, text] of Object.entries(en)) {
      assert.ok(book[key], code + " is missing " + key);
      assert.equal(slots(book[key]), slots(text), code + " " + key + " slots");
      assert.notEqual(book[key], text, code + " " + key + " is still English");
    }
  }
});
