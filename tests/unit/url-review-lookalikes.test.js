const test = require("node:test");
const assert = require("node:assert/strict");
const url = require("node:url");

const lookalikes = require("../../functions/url-review-lookalikes");
const { say, english } = require("../../functions/url-review-findings-en");

const domains = (site) => new Set(lookalikes.permutations(site).map((item) => item.domain));

test("the generator builds each kind of lookalike of the registrable name (#3084)", () => {
  const list = domains("example.com");
  const expected = {
    tld: "example.net",
    word: "example-login.com",
    omission: "exmple.com",
    repetition: "exxample.com",
    transposition: "xeample.com",
    replacement: "rxample.com",
    homoglyph: "examp1e.com",
    hyphenation: "ex-ample.com",
    "vowel-swap": "exomple.com",
    various: "wwwexample.com",
    bitsquatting: "exaeple.com",
    insertion: "exsample.com",
    addition: "examplea.com"
  };
  const kinds = new Map(lookalikes.permutations("example.com").map((item) => [item.domain, item.fuzzer]));
  for (const [fuzzer, domain] of Object.entries(expected)) assert.equal(kinds.get(domain), fuzzer, domain);
  assert.ok(list.has(url.domainToASCII("exаmple.com")), "a Cyrillic а is asked as its punycode name");
  assert.ok(list.has("exarnple.com"), "m read as rn");
  assert.equal(list.size, lookalikes.permutations("example.com").length, "no lookalike is asked twice");
  assert.ok(!list.has("example.com"), "the site itself is not a lookalike");
  for (const domain of list) assert.match(domain.split(".")[0], /^(xn--)?[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/, domain);
});

test("the likeliest tricks come first, so the cap drops insertions and additions (#3084)", () => {
  const kinds = lookalikes.permutations("carlosandmunoz.com").map((item) => item.fuzzer);
  assert.equal(kinds[0], "tld");
  assert.ok(kinds.lastIndexOf("omission") < kinds.indexOf("insertion"));
  assert.equal(kinds[kinds.length - 1], "addition");
  assert.ok(kinds.length > lookalikes.LIMITS.candidates, "a long name makes more lookalikes than one review asks");
});

test("a multi-label public suffix keeps its ending and swaps it whole (#3084)", () => {
  const list = domains("example.co.uk");
  assert.ok(list.has("exmple.co.uk"));
  assert.ok(list.has("example.com"));
  assert.ok(!Array.from(list).some((domain) => /\.co\.uk\.|^co\.uk/.test(domain)));
});

const NX = { status: 3, answers: [] };
const CLIENT_NS = ["ns1.host.example.", "ns2.host.example."];

// A fake resolver: every name is NXDOMAIN except those in records.
function resolver(records, asked) {
  return async (name, type) => {
    if (asked) asked.push(name + " " + type);
    const row = records[name];
    if (!row) return NX;
    if (row === "servfail") return { status: 2, answers: [] };
    return { status: 0, answers: row[type] || [] };
  };
}

const RECORDS = {
  "example.com": { NS: CLIENT_NS },
  "examp1e.com": { A: ["203.0.113.5"], MX: ["10 mx.examp1e.com."] },
  "example-login.com": { A: ["203.0.113.6"] },
  "exmple.com": { A: ["127.0.0.1"], MX: ["0 localhost."], NS: ["ns1.sedoparking.com."] },
  "example.net": { A: ["203.0.113.7"], NS: CLIENT_NS },
  "example.org": { A: ["203.0.113.8"] },
  "exampel.com": { MX: ["10 mail.provider.example."] },
  "example.de": { A: ["203.0.113.9"] },
  "example.fr": { A: ["203.0.113.10"] },
  "exanple.com": { A: ["203.0.113.11"] },
  "examples.com": { A: ["203.0.113.12"], NS: ["ns1.sedoparking.com."] },
  "exammple.com": "servfail"
};

const HOME = "<html><head><title>Example Shop – Home</title><link rel=\"alternate\" hreflang=\"de\" href=\"https://www.example.de/\"></head><body>Shop</body></html>";

const PAGES = {
  "https://examp1e.com/": { status: 200, url: "https://examp1e.com/login", body: "<title>Sign in</title><form><input type=\"password\" name=\"pw\"></form>" },
  "https://example-login.com/": { status: 200, url: "https://example-login.com/", body: "<title>Welcome</title>" },
  "https://example.net/": { status: 200, url: "https://example.net/", body: "<title>Example Shop – Home</title>" },
  "https://example.org/": { status: 200, url: "https://www.example.com/", body: "<title>Example Shop – Home</title>" },
  "https://example.de/": { status: 200, url: "https://www.example.de/", body: "<title>Example Laden</title>" },
  "https://example.fr/": { status: 200, url: "https://www.example.fr/", body: "<title>Example Boutique</title><a href=\"https://www.example.com/\">International</a>" },
  "https://examples.com/": { status: 200, url: "https://examples.com/", body: "<title>examples.com</title>Buy this domain" }
};

function deps(extra) {
  return Object.assign({
    doh: resolver(RECORDS),
    home: HOME,
    fetchPage: async (address) => PAGES[address] || { error: "connect ECONNREFUSED" },
    fetchHttp: async () => ({ error: "connect ECONNREFUSED" }),
    webrisk: async (address) => ({ ok: true, threats: address === "https://example-login.com/" ? ["SOCIAL_ENGINEERING"] : [] }),
    rdap: async (domain) => (domain === "exampel.com" ? { read: true, registered: "2026-10-30" } : { read: false })
  }, extra);
}

test("only lookalikes with a website or mail and no tie to the site are kept, worst first (#3084)", async () => {
  const result = await lookalikes.find("www.example.com", deps());
  assert.equal(result.domain, "example.com");
  assert.equal(result.tried, 279);
  assert.equal(result.checked, 278, "the SERVFAIL is unread");
  assert.equal(result.partial, false);
  assert.deepEqual(result.rows.map((row) => row.domain), ["example-login.com", "examp1e.com", "exampel.com", "examples.com"]);
  const [flagged, login, mail, parked] = result.rows;
  assert.deepEqual(flagged.flagged, ["SOCIAL_ENGINEERING"]);
  assert.equal(login.login, true);
  assert.equal(login.mx, true);
  assert.deepEqual([mail.web, mail.mx, mail.registered], [false, true, "2026-10-30"]);
  assert.equal(parked.parked, true);
  assert.equal(result.found, 4);
});

test("sinkholes, shared nameservers, redirects home and sister sites are not reported (#3084)", async () => {
  const kept = new Set((await lookalikes.find("example.com", deps())).rows.map((row) => row.domain));
  assert.ok(!kept.has("exmple.com"), "127.0.0.1 and MX 0 localhost are a parking sinkhole");
  assert.ok(!kept.has("example.net"), "the same nameservers as the site is a defensive registration");
  assert.ok(!kept.has("example.org"), "it redirects to the site");
  assert.ok(!kept.has("example.de"), "the site links to it");
  assert.ok(!kept.has("example.fr"), "a same-name site that links back is a sister site");
  assert.ok(!kept.has("exanple.com"), "an address with no web server and no mail");
});

test("a lookalike that redirects home over plain http is the owner's (#3084)", async () => {
  const result = await lookalikes.find("example.com", deps({ fetchHttp: async (domain) => (domain === "exanple.com" ? { status: 301, location: "https://example.com/" } : domain === "examp1e.com" ? { status: 200 } : { error: "refused" }) }));
  assert.ok(!result.rows.some((row) => row.domain === "exanple.com"));
  assert.ok(result.rows.some((row) => row.domain === "examp1e.com"));
});

test("a lookalike held at a brand-protection registrar is a defensive registration (#3084)", async () => {
  const result = await lookalikes.find("example.com", deps({ rdap: async (domain) => (domain === "exampel.com" ? { read: true, registered: "2009-01-01", registrar: "MarkMonitor Inc." } : { read: false }) }));
  assert.ok(!result.rows.some((row) => row.domain === "exampel.com"));
  assert.equal(result.found, 3);
});

test("a Web Risk flag outweighs a link back to the site (#3084)", async () => {
  const pages = Object.assign({}, PAGES, { "https://example.fr/": PAGES["https://example.fr/"] });
  const result = await lookalikes.find("example.com", deps({
    fetchPage: async (address) => pages[address] || { error: "refused" },
    webrisk: async (address) => ({ ok: true, threats: address === "https://example.fr/" ? ["MALWARE"] : [] })
  }));
  assert.equal(result.rows[0].domain, "example.fr");
});

test("a resolver that never answers ends the check at its time budget, marked partial (#3084)", async () => {
  const started = Date.now();
  const result = await lookalikes.find("example.com", { doh: () => new Promise(() => {}) }, { budgetMs: 300, queryMs: 50, concurrency: 8 });
  assert.ok(Date.now() - started < 1500, "took " + (Date.now() - started) + " ms");
  assert.equal(result.partial, true);
  assert.equal(result.rows.length, 0);
});

test("the number of questions stays within the caps (#3084)", async () => {
  const asked = [];
  await lookalikes.find("example.com", deps({ doh: resolver(RECORDS, asked) }), { candidates: 50 });
  const aQuestions = asked.filter((line) => / A$/.test(line));
  assert.equal(aQuestions.length, 50);
  assert.ok(asked.length <= 50 + 1 + lookalikes.LIMITS.registered * 3);
});

test("domains that cannot be fuzzed sensibly are skipped (#3084)", async () => {
  const none = { doh: async () => { throw new Error("asked"); } };
  assert.match((await lookalikes.find("someone.github.io", none)).skipped, /shared hosting/);
  assert.match((await lookalikes.find("abc.com", none)).skipped, /too short/);
  assert.match((await lookalikes.find("203.0.113.1", none)).skipped, /not a registered domain/);
});

function findingsOf(result) {
  const found = [];
  lookalikes.checks(result, (area, verdict, severity, key, title, evidence, fix, opts) => found.push({ area, verdict, severity, key, title: english(title), evidence: english(evidence), fix: fix ? english(fix) : "", opts }), say);
  return found;
}

test("the finding is high for phishing, medium for mail and info otherwise, in plain words (#3084)", async () => {
  const result = await lookalikes.find("example.com", deps());
  const [high] = findingsOf(result);
  assert.deepEqual([high.key, high.verdict, high.severity], ["sec-lookalike", "fail", "high"]);
  assert.equal(high.title, "2 lookalikes of your domain look like phishing");
  assert.match(high.evidence, /^example-login\.com \(Google lists it for phishing, has a website\), examp1e\.com \(asks for a password, receives mail\), exampel\.com \(receives mail, registered 2026-10-30\), examples\.com \(parked\)\. Of 278 misspellings/);
  assert.match(high.evidence, /4 are registered with a website or a mail server\. A lookalike with a mail server/);
  assert.match(high.fix, /registrar and host .* p=reject/);

  const mailOnly = { domain: "example.com", tried: 400, checked: 400, found: 1, rows: [{ domain: "exampel.com", web: false, mx: true, parked: false, login: false, clone: false, registered: "" }] };
  const [medium] = findingsOf(mailOnly);
  assert.deepEqual([medium.verdict, medium.severity, medium.title], ["risk", "medium", "A lookalike of your domain can receive mail"]);
  assert.match(medium.evidence, /, 1 is registered with/);

  const webOnly = { domain: "example.com", tried: 400, checked: 400, found: 12, rows: [{ domain: url.domainToASCII("exаmple.com"), shown: "exаmple.com", web: true, mx: false, parked: false, login: false, clone: false, registered: "" }] };
  const [info] = findingsOf(webOnly);
  assert.deepEqual([info.verdict, info.severity, info.title], ["risk", "info", "12 lookalikes of your domain are registered"]);
  assert.match(info.evidence, /^exаmple\.com \(has a website, written xn--[a-z0-9-]+\.com in DNS\) and 11 more\./);
  assert.match(info.fix, /^Check who owns them/);
});

test("no lookalike passes only when the whole list was asked (#3084)", () => {
  const [pass] = findingsOf({ domain: "example.com", tried: 400, checked: 400, found: 0, rows: [] });
  assert.deepEqual([pass.verdict, pass.title], ["pass", "No lookalike of your domain has a website or a mail server"]);
  assert.match(pass.evidence, /^400 misspellings/);
  assert.deepEqual(findingsOf({ domain: "example.com", tried: 400, checked: 100, found: 0, partial: true, rows: [] }), []);
  assert.deepEqual(findingsOf({ domain: "x.github.io", skipped: "shared" }), []);
  assert.deepEqual(findingsOf(null), []);
});
