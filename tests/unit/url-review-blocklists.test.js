const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const vm = require("node:vm");
const fs = require("node:fs");

const blocklists = require("../../functions/url-review-blocklists");
const insights = require("../../functions/url-review-insights");
const { EN, english } = require("../../functions/url-review-findings-en");

const IP_ZONES = blocklists.LISTS.filter((list) => list.kind === "ip").map((list) => list.zone);

// A resolver whose answers come from a table: a name maps to addresses, an error code, or "slow" (never answers).
function fakeResolver(table) {
  const asked = [];
  const answer = (name) => {
    if (name in table) return table[name];
    if (/^2\.0\.0\.127\./.test(name) || /^test\./.test(name)) return ["127.0.0.2"];
    return "ENOTFOUND";
  };
  return {
    asked,
    resolve4: (name) => {
      asked.push(name);
      const row = answer(name);
      if (row === "slow") return new Promise(() => {});
      if (Array.isArray(row)) return Promise.resolve(row);
      return Promise.reject(Object.assign(new Error(row), { code: row }));
    }
  };
}

const FACTS = { domain: "example.com", mx: ["mx1.example.com", "mx2.example.com"] };
const HOSTS = { "shop.example.com": ["93.184.216.34"], "mx1.example.com": ["198.51.200.10"], "mx2.example.com": ["203.0.200.20"] };

function run(table, facts) {
  blocklists._health.clear();
  const resolver = fakeResolver(Object.assign({}, HOSTS, table));
  return blocklists.check(facts || FACTS, "shop.example.com", { resolver }).then((result) => ({ result, resolver }));
}

function findings(result) {
  const out = [];
  blocklists.report(result, (area, verdict, severity, key, title, evidence, fix) => out.push({ area, verdict, severity, key, title: english(title), evidence: english(evidence), fix: fix ? english(fix) : "", msg: { title, evidence, fix } }));
  return out;
}

test("query names reverse IPv4 addresses and append domains as they are (RFC 5782)", () => {
  const [spamcop, , , , , , dbl] = blocklists.LISTS;
  assert.equal(blocklists.queryName("198.51.200.10", spamcop), "10.200.51.198.bl.spamcop.net");
  assert.equal(blocklists.queryName("example.com", dbl), "example.com.dbl.nordspam.com");
});

test("a clean domain and its mail and web servers pass, naming every list that answered", async () => {
  const { result, resolver } = await run({});
  assert.deepEqual(result.targets, [
    { ip: "198.51.200.10", hosts: ["mx1.example.com"], web: false },
    { ip: "203.0.200.20", hosts: ["mx2.example.com"], web: false },
    { ip: "93.184.216.34", hosts: [], web: true }
  ]);
  assert.deepEqual(result.read, blocklists.LISTS.map((list) => list.id));
  assert.deepEqual([result.unread, result.listed], [[], []]);
  assert.ok(resolver.asked.includes("example.com.dbl.nordspam.com"));
  assert.ok(resolver.asked.includes("1.0.0.127.bl.spamcop.net") && resolver.asked.includes("invalid.dbl.nordspam.com"), "test points are asked first");
  const [pass] = findings(result);
  assert.deepEqual([pass.key, pass.verdict], ["sec-blocklist", "pass"]);
  assert.equal(pass.evidence, "SpamCop, Barracuda, Mailspike, PSBL, 0spam, NordSpam and NordSpam DBL answered for example.com, the mail server mx1.example.com (198.51.200.10), the mail server mx2.example.com (203.0.200.20) and the web server (93.184.216.34) and list none of them.");
});

test("a listed mail server is a high finding naming each list, its answer, what it does to mail and how to delist", async () => {
  const { result } = await run({ "10.200.51.198.bl.spamcop.net": ["127.0.0.2"], "10.200.51.198.bl.mailspike.net": ["127.0.0.2", "127.0.0.10"] });
  assert.deepEqual(result.listed, [
    { list: "spamcop", target: "198.51.200.10", codes: ["127.0.0.2"] },
    { list: "mailspike", target: "198.51.200.10", codes: ["127.0.0.10", "127.0.0.2"] }
  ]);
  const out = findings(result);
  assert.equal(out.length, 1, "a listing replaces the pass");
  const [hit] = out;
  assert.deepEqual([hit.area, hit.verdict, hit.severity, hit.key], ["Security", "fail", "high", "sec-blocklist-0"]);
  assert.equal(hit.title, "2 spam blocklists list the mail server mx1.example.com (198.51.200.10): SpamCop and Mailspike");
  assert.match(hit.evidence, /^Asked about 198\.51\.200\.10, SpamCop answered 127\.0\.0\.2 and Mailspike answered 127\.0\.0\.10, 127\.0\.0\.2\. Receivers that check SpamCop and Mailspike refuse or junk mail/);
  assert.match(hit.fix, /https:\/\/www\.spamcop\.net\/bl\.shtml\?198\.51\.200\.10/);
  assert.match(hit.fix, /https:\/\/mailspike\.io\/ip_verify/);
  assert.match(hit.fix, /only they can clean a shared server\.$/);
});

test("a listed web server and a listed domain each get their own finding", async () => {
  const { result } = await run({ "34.216.184.93.psbl.surriel.com": ["127.0.0.2"], "example.com.dbl.nordspam.com": ["127.0.0.2"] });
  const out = findings(result);
  assert.deepEqual(out.map((item) => item.key), ["sec-blocklist-0", "sec-blocklist-1"]);
  const web = out.find((item) => /web server/.test(item.title));
  assert.equal(web.title, "The PSBL spam blocklist lists the web server (93.184.216.34)");
  assert.match(web.fix, /remove 93\.184\.216\.34 yourself at https:\/\/psbl\.org\/remove/);
  const domain = out.find((item) => /example\.com$/.test(item.title));
  assert.equal(domain.title, "The NordSpam DBL spam blocklist lists example.com");
  assert.match(domain.evidence, /carries the domain in its sender address or its links/);
  assert.doesNotMatch(domain.fix, /shared server/);
});

test("refusals and bogus answers are unread, never listed (#3087)", async () => {
  const { result } = await run({
    "10.200.51.198.bl.spamcop.net": ["127.255.255.254"],
    "10.200.51.198.bl.mailspike.net": ["92.242.132.24"],
    "10.200.51.198.psbl.surriel.com": ["127.0.0.1"],
    "10.200.51.198.bl.0spam.org": "EREFUSED"
  });
  assert.deepEqual(result.listed, []);
  assert.deepEqual(result.unread, ["spamcop", "mailspike", "psbl", "0spam"]);
  const [pass] = findings(result);
  assert.equal(pass.verdict, "pass");
  assert.match(pass.evidence, /^Barracuda, NordSpam and NordSpam DBL answered for .* SpamCop, Mailspike, PSBL and 0spam did not answer, so they were not read\.$/);
});

test("a list that fails its test points is not asked about the site at all", async () => {
  const { result, resolver } = await run({
    "2.0.0.127.b.barracudacentral.org": "ENOTFOUND",
    "1.0.0.127.bl.spamcop.net": ["127.0.0.2"],
    "2.0.0.127.bl.mailspike.net": ["127.255.255.254"],
    "34.216.184.93.b.barracudacentral.org": ["127.0.0.2"]
  });
  assert.deepEqual(result.unread, ["spamcop", "barracuda", "mailspike"]);
  assert.deepEqual(result.listed, []);
  assert.ok(!resolver.asked.some((name) => /^(10\.200\.51\.198|34\.216\.184\.93)\.(bl\.spamcop\.net|b\.barracudacentral\.org|bl\.mailspike\.net)$/.test(name)));
});

test("a lost query is asked once more before the list counts as unread", async () => {
  let tries = 0;
  blocklists._health.clear();
  const base = fakeResolver(HOSTS);
  const resolver = { resolve4: (name) => name === "10.200.51.198.bl.spamcop.net" && tries++ === 0 ? Promise.reject(Object.assign(new Error("x"), { code: "ECONNREFUSED" })) : base.resolve4(name) };
  const result = await blocklists.check(FACTS, "shop.example.com", { resolver });
  assert.equal(tries, 2);
  assert.ok(result.read.includes("spamcop"));
});

test("a list that never answers is unread, and the whole check ends by its deadline", { timeout: 15000 }, async () => {
  const started = Date.now();
  const { result } = await run({ "10.200.51.198.psbl.surriel.com": "slow" });
  assert.ok(Date.now() - started < 9000);
  assert.ok(result.unread.includes("psbl"));
  assert.ok(result.read.includes("spamcop"));
  const stuck = await run({ "mx1.example.com": "slow", "mx2.example.com": "slow", "shop.example.com": "slow" });
  assert.deepEqual(stuck.result.targets, []);
  assert.deepEqual(stuck.result.read, ["nordspam-dbl"]);
});

test("at most four addresses are checked, private ones never, and nothing to check gives null", async () => {
  const many = { domain: "example.com", mx: ["a.example.com", "b.example.com", "c.example.com", "d.example.com"] };
  const { result, resolver } = await run({
    "a.example.com": ["198.51.200.1", "198.51.200.2", "198.51.200.3"],
    "b.example.com": ["10.0.0.5", "198.51.200.4"],
    "c.example.com": ["198.51.200.5"],
    "d.example.com": ["198.51.200.6"]
  }, many);
  assert.deepEqual(result.targets.map((row) => row.ip), ["198.51.200.1", "198.51.200.2", "198.51.200.4", "93.184.216.34"]);
  assert.ok(!resolver.asked.includes("d.example.com"), "only the first three MX hosts are resolved");
  assert.ok(!resolver.asked.some((name) => name.startsWith("5.0.0.10.")));
  for (const zone of IP_ZONES) assert.equal(resolver.asked.filter((name) => name.endsWith("." + zone) && !/^[12]\.0\.0\.127\./.test(name)).length, 4, zone);
  blocklists._health.clear();
  assert.equal(await blocklists.check({ domain: "", mx: [] }, "shop.example.com", { resolver: fakeResolver({ "shop.example.com": "ENOTFOUND" }) }), null);
  assert.equal(await blocklists.check(null, "shop.example.com"), null);
});

test("test-point results are kept between reviews", async () => {
  await run({});
  const resolver = fakeResolver(HOSTS);
  await blocklists.check(FACTS, "shop.example.com", { resolver });
  assert.ok(!resolver.asked.some((name) => /^[12]\.0\.0\.127\.|^(test|invalid)\./.test(name)));
});

test("nothing read gives no finding, and the review log names what answered", async () => {
  assert.deepEqual(findings(null), []);
  assert.deepEqual(findings({ domain: "example.com", targets: [], read: [], unread: ["nordspam-dbl"], listed: [] }), []);
  const { result } = await run({ "10.200.51.198.bl.spamcop.net": ["127.0.0.2"], "2.0.0.127.bl.0spam.org": "ESERVFAIL" });
  assert.equal(blocklists.note(result), "Spam blocklists: SpamCop, Barracuda, Mailspike, PSBL, NordSpam, NordSpam DBL answered; 0spam not read; listed: 198.51.200.10 on SpamCop.");
  assert.equal(blocklists.note(null), "The spam blocklists could not be read.");
});

test("the report shows blocklist findings from the DNS extras", async () => {
  const { result } = await run({ "20.200.0.203.b.barracudacentral.org": ["127.0.0.2"] });
  const html = "<!doctype html><html lang=\"en\"><head><title>Shop</title></head><body><h1>Shop</h1></body></html>";
  const pages = [{ url: "https://shop.example.com/", path: "/", status: 200, ms: 100, depth: 0, inspect: require("../../functions/url-review-core").analyzeHtml(html, {}, "https://shop.example.com/") }];
  const report = insights.analyze({ pages, extras: { dns: Object.assign({ domain: "example.com", mx: FACTS.mx, unread: [], caa: [] }, { blocklists: result }) } });
  const hit = report.findings.find((item) => item.key === "sec-blocklist-0");
  assert.equal(hit.title, "The Barracuda spam blocklist lists the mail server mx2.example.com (203.0.200.20)");
  assert.equal(english(hit.msg.fix), hit.fix);
});

function copyOf() {
  const source = fs.readFileSync(path.join(__dirname, "../../js/qa-review-findings-copy.js"), "utf8").replace("const book = ", "window.__COPY = COPY; const book = ");
  const sandbox = { window: {}, document: { documentElement: { lang: "en" }, querySelectorAll: () => [], getElementById: () => null, addEventListener() {} }, location: { search: "", pathname: "/" }, URLSearchParams };
  sandbox.window.addEventListener = () => {};
  vm.runInNewContext(source, sandbox);
  return sandbox.window.__COPY;
}

test("every blocklist line is written in all six languages with the same slots", () => {
  const copy = copyOf();
  const slots = (text) => (text.match(/\{\w+\}/g) || []).sort().join(" ");
  const ids = Object.keys(EN).filter((id) => id.startsWith("sec-blocklist."));
  assert.ok(ids.length > 15);
  for (const list of blocklists.LISTS) assert.ok(EN["sec-blocklist.fix." + list.id], "no delisting steps for " + list.id);
  for (const lang of ["es", "pt", "de", "fr", "it"]) {
    for (const id of ids) {
      assert.ok(copy[lang][id], lang + " lacks " + id);
      assert.equal(slots(copy[lang][id]), slots(EN[id]), lang + " " + id);
    }
  }
});
