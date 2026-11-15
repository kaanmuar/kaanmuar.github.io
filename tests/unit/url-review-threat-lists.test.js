const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const lists = require("../../functions/url-review-threat-lists");
const { render } = require("../../functions/url-review-findings-en");
const publish = require("../../functions/url-review-publish");
const { analyze } = require("../../functions/url-review-insights");
const core = require("../../functions/url-review-core");

const NOW = Date.parse("2026-11-09T12:00:00Z");
const URL_ = "https://shop.example.com/";
const ACCOUNT = "acc123";
const KEYS = { URLHAUS_AUTH_KEY: "uh", PHISHSTATS_KEY: "psk_x", CLOUDFLARE_URLSCAN_TOKEN: "cf", CLOUDFLARE_ACCOUNT_ID: ACCOUNT };

const json = (body, status = 200) => ({ ok: status >= 200 && status < 300, status, json: async () => body });

// A fake fetch answering each source from a table; every call is recorded.
function apis(answers) {
  const calls = [];
  const fetch = async (url, init) => {
    calls.push({ url: String(url), init: init || {} });
    for (const [match, answer] of answers) if (match.test(String(url))) return typeof answer === "function" ? answer(String(url), init || {}) : answer;
    throw new Error("unexpected " + url);
  };
  return { fetch, calls };
}

const clean = [
  [/urlhaus-api/, json({ query_status: "no_results" })],
  [/phishstats/, json([])],
  [/urlscanner\/v2\/search/, json({ results: [{ task: { uuid: "s1", success: true }, page: { url: URL_ }, verdicts: { malicious: false } }] })],
  [/urlscanner\/v2\/result\/s1/, json({ task: { uuid: "s1", url: URL_, time: "2026-11-09T10:00:00Z", reportURL: "https://radar.cloudflare.com/scan/s1" }, verdicts: { overall: { malicious: false, categories: [] } } })]
];

const run = (fetch, env, extra) => {
  lists._cache.clear();
  const notes = [];
  return lists.check(URL_, Object.assign({ env, fetch, now: NOW, note: (line) => notes.push(line), pause: async () => {} }, extra)).then((result) => ({ result, notes }));
};

test("no list is asked, and the log says why, while no source has its secret (#3083)", async () => {
  const { fetch, calls } = apis([]);
  const { result, notes } = await run(fetch, {});
  assert.equal(result, null);
  assert.equal(calls.length, 0);
  assert.match(notes[0], /URLHAUS_AUTH_KEY, PHISHSTATS_KEY and CLOUDFLARE_URLSCAN_TOKEN are not set/);
});

test("a source without its secret is skipped while the others answer; the account id is needed too (#3083)", async () => {
  const { fetch, calls } = apis(clean);
  const { result, notes } = await run(fetch, { URLHAUS_AUTH_KEY: "uh", CLOUDFLARE_URLSCAN_TOKEN: "cf" });
  assert.deepEqual(result.sources.map((row) => [row.source, row.ok, row.skipped || ""]), [["urlhaus", true, ""], ["phishstats", false, "PHISHSTATS_KEY"], ["cloudflare", false, "CLOUDFLARE_ACCOUNT_ID"]]);
  assert.ok(calls.every((call) => /urlhaus/.test(call.url)));
  assert.ok(notes.includes("PhishStats was not asked: PHISHSTATS_KEY is not set."));
});

test("URLhaus is asked for the host and its registrable domain with the Auth-Key, and only active addresses count (#3083)", async () => {
  const { fetch, calls } = apis([
    [/urlhaus-api/, (url, init) => json(/host=shop\.example\.com/.test(init.body)
      ? { query_status: "ok", urlhaus_reference: "https://urlhaus.abuse.ch/host/shop.example.com/", urls: [
        { url: "http://shop.example.com/wp-content/x.exe", url_status: "online", date_added: "2026-11-02 08:00:00 UTC" },
        { url: "http://shop.example.com/old.zip", url_status: "offline", date_added: "2025-01-01 08:00:00 UTC" }] }
      : { query_status: "no_results" })],
    [/phishstats/, json([])],
    ...clean.slice(2)
  ]);
  const { result, notes } = await run(fetch, KEYS);
  const asked = calls.filter((call) => /urlhaus/.test(call.url));
  assert.deepEqual(asked.map((call) => [call.init.method, call.init.headers["Auth-Key"], call.init.body]), [["POST", "uh", "host=shop.example.com"], ["POST", "uh", "host=example.com"]]);
  const row = result.sources[0];
  assert.deepEqual([row.listed, row.count, row.offline, row.since, row.urls, row.delist], [true, 1, 1, "2026-11-02", ["http://shop.example.com/wp-content/x.exe"], "https://urlhaus.abuse.ch/host/shop.example.com/"]);
  assert.ok(notes.includes("URLhaus lists 1 active malware address on shop.example.com, the first added 2026-11-02."));
});

test("URLhaus with only offline addresses is not a listing (#3083)", async () => {
  const { fetch } = apis([[/urlhaus-api/, json({ query_status: "ok", urls: [{ url: "http://shop.example.com/a", url_status: "offline" }] })], ...clean.slice(1)]);
  const { result, notes } = await run(fetch, KEYS);
  assert.equal(result.sources[0].listed, false);
  assert.ok(notes.some((line) => /no active malware address on shop\.example\.com; 2 older ones are offline/.test(line)));
});

test("PhishStats counts recent, high-score entries for the host only, with the psk_ key (#3083)", async () => {
  const { fetch, calls } = apis([
    clean[0],
    [/phishstats/, json([
      { url: "https://shop.example.com/login/secure", score: 7.5, date: "2026-11-05T09:00:00.000Z", host: "shop.example.com" },
      { url: "https://shop.example.com/old", score: 9, date: "2025-01-01T09:00:00.000Z", host: "shop.example.com" },
      { url: "https://shop.example.com/low", score: 2, date: "2026-11-06T09:00:00.000Z", host: "shop.example.com" }])],
    ...clean.slice(2)
  ]);
  const { result } = await run(fetch, KEYS);
  const call = calls.find((item) => /phishstats/.test(item.url));
  assert.equal(call.init.headers["X-API-Key"], "psk_x");
  assert.equal(decodeURIComponent(new URL(call.url).searchParams.get("_where")), "(host,eq,shop.example.com)~or(host,eq,example.com)");
  const row = result.sources[1];
  assert.deepEqual([row.listed, row.count, row.older, row.last, row.score], [true, 1, 2, "2026-11-05", 7.5]);
});

test("Cloudflare reads a malicious scan of the host from the last day instead of scanning again (#3083)", async () => {
  const { fetch, calls } = apis([
    ...clean.slice(0, 2),
    [/urlscanner\/v2\/search/, json({ results: [
      { task: { uuid: "other", success: true }, page: { url: "https://shop.example.com.evil.test/" }, verdicts: { malicious: true } },
      { task: { uuid: "s0", success: true }, page: { url: URL_ }, verdicts: { malicious: false } },
      { task: { uuid: "s2", success: true }, page: { url: URL_ + "pay" }, verdicts: { malicious: true } }] })],
    [/urlscanner\/v2\/result\/s2/, json({ task: { uuid: "s2", url: URL_ + "pay", time: "2026-11-09T08:00:00Z", reportURL: "https://radar.cloudflare.com/scan/s2" },
      verdicts: { overall: { malicious: true, categories: [{ id: 1, name: "Phishing" }] } }, meta: { processors: { phishing: { data: ["Microsoft"] } } } })]
  ]);
  const { result } = await run(fetch, KEYS);
  const search = calls.find((call) => /search/.test(call.url));
  assert.equal(search.init.headers.Authorization, "Bearer cf");
  assert.match(search.url, new RegExp("/accounts/" + ACCOUNT + "/urlscanner/v2/search"));
  assert.equal(new URL(search.url).searchParams.get("q"), "page.domain:\"shop.example.com\" AND date:>now-1d");
  assert.ok(!calls.some((call) => /\/scan$/.test(call.url)), "no new scan");
  const row = result.sources[2];
  assert.deepEqual([row.listed, row.url, row.date, row.categories, row.delist], [true, URL_ + "pay", "2026-11-09", ["Phishing", "Microsoft"], "https://radar.cloudflare.com/domains/feedback/example.com"]);
});

test("Cloudflare submits a public scan when none is recent, polls it, and reports pending past the wait (#3083)", async () => {
  let polls = 0;
  const pending = [
    ...clean.slice(0, 2),
    [/urlscanner\/v2\/search/, json({ results: [] })],
    [/urlscanner\/v2\/scan$/, json({ uuid: "new1" })],
    [/urlscanner\/v2\/result\/new1/, () => { polls += 1; return json({ errors: [] }, 404); }]
  ];
  let clock = NOW;
  const realNow = Date.now;
  Date.now = () => clock;
  try {
    const { fetch, calls } = apis(pending);
    const { result, notes } = await run(fetch, KEYS, { wait: 25000, pause: async (ms) => { clock += ms; } });
    const scan = calls.find((call) => /\/scan$/.test(call.url));
    assert.deepEqual(JSON.parse(scan.init.body), { url: URL_, visibility: "Public" });
    assert.equal(polls, 3);
    assert.deepEqual([result.sources[2].pending, result.sources[2].report], [true, "https://radar.cloudflare.com/scan/new1"]);
    assert.ok(notes.includes("Cloudflare's URL Scanner had not finished its scan in time; the result will be at https://radar.cloudflare.com/scan/new1."));

    // The next review of the host polls the same scan instead of submitting another.
    const done = apis([...clean.slice(0, 2), [/urlscanner\/v2\/result\/new1/, json({ task: { uuid: "new1", url: URL_, time: "2026-11-09T12:01:00Z" }, verdicts: { overall: { malicious: false } } })]]);
    lists._cache.forEach((value, key) => { if (!/pending/.test(key)) lists._cache.delete(key); });
    const again = await lists.check(URL_, { env: KEYS, fetch: done.fetch, now: NOW, pause: async (ms) => { clock += ms; } });
    assert.ok(!done.calls.some((call) => /search|\/scan$/.test(call.url)));
    assert.deepEqual([again.sources[2].pending, again.sources[2].listed], [undefined, false]);
  } finally {
    Date.now = realNow;
  }
});

test("the public scan gets only scheme, host and path; the origin alone when a path segment looks like a token (#3345)", () => {
  const cases = [
    ["https://shop.example.com/cart?session=abc123&token=xyz#pay", "https://shop.example.com/cart"],
    ["https://user:secret@shop.example.com/a/b/", "https://shop.example.com/a/b/"],
    ["http://Shop.Example.com:8080/x?y=1", "http://shop.example.com:8080/x"],
    ["https://shop.example.com", "https://shop.example.com/"],
    ["https://shop.example.com/reset/" + "aB3_-".repeat(7) + "Zz/confirm?x=1", "https://shop.example.com/"],
    ["https://shop.example.com/share/" + "a".repeat(32), "https://shop.example.com/"],
    ["https://shop.example.com/blog/" + "a".repeat(31), "https://shop.example.com/blog/" + "a".repeat(31)],
    ["https://shop.example.com/docs/" + "a".repeat(20) + ".pdf" + "b".repeat(20), "https://shop.example.com/docs/" + "a".repeat(20) + ".pdf" + "b".repeat(20)],
    ["ftp://shop.example.com/file", ""],
    ["not a url", ""],
    ["", ""]
  ];
  for (const [input, expected] of cases) assert.equal(lists.scanTarget(input), expected, input);
});

test("a URL with credentials, query and fragment is searched by host and submitted without them (#3345)", async () => {
  const { fetch, calls } = apis([
    ...clean.slice(0, 2),
    [/urlscanner\/v2\/search/, json({ results: [] })],
    [/urlscanner\/v2\/scan$/, json({ uuid: "new2" })],
    [/urlscanner\/v2\/result\/new2/, json({ task: { uuid: "new2", url: "https://shop.example.com/account", time: "2026-11-09T12:01:00Z" }, verdicts: { overall: { malicious: false } } })]
  ]);
  lists._cache.clear();
  await lists.check("https://me:pw@shop.example.com/account?token=s3cret&email=a%40b.co#top", { env: KEYS, fetch, now: NOW, pause: async () => {} });
  const search = calls.find((call) => /search/.test(call.url));
  assert.equal(new URL(search.url).searchParams.get("q"), "page.domain:\"shop.example.com\" AND date:>now-1d");
  const scan = calls.find((call) => /\/scan$/.test(call.url));
  assert.deepEqual(JSON.parse(scan.init.body), { url: "https://shop.example.com/account", visibility: "Public" });
  assert.ok(!calls.some((call) => /s3cret|a%40b|me:pw|#top/.test(call.url + (call.init.body || ""))), "nothing private leaves");
});

test("answers are cached per host for six hours; errors are logged and not cached (#3083)", async () => {
  const { fetch, calls } = apis([[/urlhaus-api/, json({}, 401)], ...clean.slice(1)]);
  const first = await run(fetch, KEYS);
  assert.deepEqual([first.result.sources[0].ok, first.result.sources[0].error], [false, "status 401"]);
  assert.ok(first.notes.includes("URLhaus could not be read (status 401)."));
  const count = calls.length;
  await lists.check(URL_, { env: KEYS, fetch, now: NOW, pause: async () => {} });
  assert.deepEqual(calls.slice(count).map((call) => new URL(call.url).hostname), ["urlhaus-api.abuse.ch"], "only the failed source is asked again");
});

test("a stop request ends the Cloudflare wait at once (#3083)", async () => {
  const { fetch } = apis([...clean.slice(0, 2), [/search/, json({ results: [] })], [/\/scan$/, json({ uuid: "u" })], [/result\/u/, json({}, 404)]]);
  const { result } = await run(fetch, KEYS, { stop: () => true });
  assert.equal(result.sources[2].pending, true);
});

function listedResult() {
  return {
    host: "shop.example.com",
    sources: [
      { source: "urlhaus", ok: true, listed: true, host: "shop.example.com", count: 2, since: "2026-11-02", urls: ["http://shop.example.com/a.exe", "http://shop.example.com/b.exe"], delist: "https://urlhaus.abuse.ch/host/shop.example.com/" },
      { source: "phishstats", ok: true, listed: false, host: "shop.example.com", count: 0, urls: [] },
      { source: "cloudflare", ok: true, listed: true, host: "shop.example.com", url: URL_, date: "2026-11-09", categories: ["Phishing"], report: "https://radar.cloudflare.com/scan/s2", delist: "https://radar.cloudflare.com/domains/feedback/example.com" }
    ]
  };
}

function findingsOf(result) {
  const out = [];
  lists.addFindings(result, (area, verdict, severity, key, title, evidence, fix, opts) => out.push({ area, verdict, severity, key, title, evidence, fix, opts }));
  return out;
}

test("a listing is one critical Security finding naming each list, its date and its review link (#3083)", () => {
  const [finding, more] = findingsOf(listedResult());
  assert.equal(more, undefined);
  assert.deepEqual([finding.area, finding.verdict, finding.severity, finding.key], ["Security", "fail", "critical", "sec-threatlists"]);
  const en = (message) => render(require("../../functions/url-review-findings-en").EN, message);
  assert.equal(en(finding.title), "URLhaus and Cloudflare URL Scanner list the site as phishing or malware");
  assert.match(en(finding.evidence), /^URLhaus \(abuse\.ch\) lists 2 addresses on shop\.example\.com as serving malware, the first added 2026-11-02: http:\/\/shop\.example\.com\/a\.exe, http:\/\/shop\.example\.com\/b\.exe\. Cloudflare's URL Scanner judged https:\/\/shop\.example\.com\/ malicious on 2026-11-09 \(Phishing\)\. Scan report: https:\/\/radar\.cloudflare\.com\/scan\/s2\. Quad9/);
  assert.match(en(finding.fix), /URLhaus marks each address offline once it stops serving malware \(https:\/\/urlhaus\.abuse\.ch\/host\/shop\.example\.com\/\); Cloudflare: request a review on Radar \(https:\/\/radar\.cloudflare\.com\/domains\/feedback\/example\.com\)\.$/);
});

test("clean answers make a pass naming the lists read, with a pending Cloudflare scan noted (#3083)", () => {
  const result = { host: "shop.example.com", sources: [
    { source: "urlhaus", ok: true, listed: false },
    { source: "phishstats", ok: false, skipped: "PHISHSTATS_KEY", listed: false },
    { source: "cloudflare", ok: true, pending: true, listed: false, report: "https://radar.cloudflare.com/scan/new1" }] };
  const [finding] = findingsOf(result);
  const en = (message) => render(require("../../functions/url-review-findings-en").EN, message);
  assert.deepEqual([finding.verdict, finding.key, en(finding.title)], ["pass", "sec-threatlists", "URLhaus does not list the site as phishing or malware"]);
  assert.equal(en(finding.evidence), "URLhaus has no current phishing or malware entry for shop.example.com. Cloudflare's URL Scanner had not finished its scan when the report was written; its result will be at https://radar.cloudflare.com/scan/new1.");
  assert.deepEqual(findingsOf({ host: "x.com", sources: [{ source: "cloudflare", ok: true, pending: true }, { source: "urlhaus", ok: false, error: "status 500" }] }), []);
  assert.deepEqual(findingsOf(null), []);
});

test("the finding reads in every review language (#3083)", () => {
  const source = fs.readFileSync(path.join(__dirname, "../../js/qa-review-findings-copy.js"), "utf8").replace("const book = ", "window.__COPY = COPY; const book = ");
  const sandbox = { window: { addEventListener() {} }, document: { documentElement: { lang: "en" }, querySelectorAll: () => [], getElementById: () => null, addEventListener() {} }, location: { search: "", pathname: "/" } };
  vm.runInNewContext(source, sandbox);
  const copy = sandbox.window.__COPY;
  const pass = { host: "a.com", sources: [{ source: "urlhaus", ok: true, listed: false }, { source: "cloudflare", ok: true, pending: true, report: "https://radar.cloudflare.com/scan/x" }] };
  const phish = { host: "a.com", sources: [{ source: "phishstats", ok: true, listed: true, host: "a.com", count: 1, last: "2026-11-05", score: 8, urls: ["https://a.com/x"], delist: "https://phishstats.info/" },
    { source: "cloudflare", ok: true, listed: true, host: "a.com", url: "https://a.com/", date: "2026-11-09", categories: [], report: "r", delist: "d" }] };
  for (const lang of ["es", "pt", "de", "fr", "it"]) {
    for (const finding of [...findingsOf(listedResult()), ...findingsOf(pass), ...findingsOf(phish)]) {
      for (const field of ["title", "evidence", "fix"]) {
        if (!finding[field]) continue;
        const text = render(copy[lang], finding[field]);
        assert.ok(text && !/\{\w+\}/.test(text), lang + " " + field + ": " + text);
      }
    }
  }
});

test("insights add the finding from extras, and a listing holds the report off Live Reports (#3083)", () => {
  const html = "<!doctype html><html lang=\"en\"><head><title>Shop</title></head><body><h1>Shop</h1></body></html>";
  const page = { url: URL_, path: "/", status: 200, ms: 120, depth: 0, inspect: core.analyzeHtml(html, {}, URL_) };
  const insights = analyze({ pages: [page], extras: { threatLists: listedResult() } });
  const finding = insights.findings.find((item) => item.key === "sec-threatlists");
  assert.deepEqual([finding.verdict, finding.severity], ["fail", "critical"]);
  assert.equal(publish.heldReason({ status: "complete", report: { host: "shop.example.com", status: "complete", insights: { score: { overall: 80, areas: {} }, findings: [finding] } } }, []), "threat-listed");
});
