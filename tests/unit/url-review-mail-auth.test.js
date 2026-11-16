const test = require("node:test");
const assert = require("node:assert/strict");
const dnsPromises = require("node:dns").promises;

const core = require("../../functions/url-review-core");
const insights = require("../../functions/url-review-insights");
const mailAuth = require("../../functions/url-review-mail-auth");
const { EN, render } = require("../../functions/url-review-findings-en");
const { COPY } = require("../../functions/url-review-findings-copy");
const { txt: RECORDS } = require("./fixtures/mail-auth-records.json");

const URL_ = "https://shop.example.com/";
const HTML = "<!doctype html><html lang=\"en\"><head><title>Example shop for garden tools</title></head><body><main><h1>Garden tools</h1></main></body></html>";

async function withTxt(resolve, run) {
  const saved = dnsPromises.resolveTxt;
  dnsPromises.resolveTxt = resolve;
  try {
    return await run();
  } finally {
    dnsPromises.resolveTxt = saved;
  }
}

const fromFixtures = (asked) => async (name) => {
  if (asked) asked.push(name);
  if (RECORDS[name]) return RECORDS[name].map((row) => [row]);
  throw Object.assign(new Error("ENOTFOUND " + name), { code: "ENOTFOUND" });
};

const read = (domain, asked) => withTxt(fromFixtures(asked), () => mailAuth.readMailAuth(domain));

function review(domain, auth, extra) {
  const spf = (RECORDS[domain] || []).find((row) => /^v=spf1/.test(row)) || "";
  const dmarc = (RECORDS["_dmarc." + domain] || [])[0] || "";
  const dns = Object.assign({ domain, spf, dmarc, mx: ["mx." + domain], nullMx: false, caa: ["letsencrypt.org"], mtaSts: "", tlsRpt: "", bimi: "", unread: [], mailAuth: auth }, extra);
  const page = { url: URL_, path: "/", status: 200, ms: 120, depth: 0, inspect: core.analyzeHtml(HTML, { "content-type": "text/html" }, URL_) };
  return insights.analyze({ pages: [page], extras: { dns } });
}

const finding = (result, key) => result.findings.find((item) => item.key === key);
const row = (result, label) => result.security.headers.find((item) => item.label === label).state;

test.describe("SPF lookups, all and records (#3089)", () => {
  test("a small business on Google Workspace and Mailchimp stays well under the limit", async () => {
    const auth = await read("panaderia.example.co");
    assert.deepEqual([auth.spfRecords, auth.lookups, auth.complete, auth.all, auth.dmarcRecords], [1, 2, true, "~", 1]);
    const result = review("panaderia.example.co", auth);
    assert.deepEqual(result.findings.filter((item) => /^sec-(spf|dmarc)-/.test(item.key)), []);
    assert.equal(finding(result, "sec-spf").verdict, "pass");
    assert.equal(finding(result, "sec-dmarc").verdict, "pass");
    assert.deepEqual([row(result, "SPF"), row(result, "DMARC")], ["pass", "pass"]);
  });

  test("ten real providers add up to 21 lookups, and the fix names the costliest includes", async () => {
    const asked = [];
    const auth = await read("tienda.example.com", asked);
    assert.equal(auth.lookups, 21);
    assert.equal(auth.complete, true);
    assert.deepEqual(auth.costs.slice(0, 3), [
      { term: "include:mailgun.org", lookups: 5 },
      { term: "include:one.zoho.eu", lookups: 4 },
      { term: "include:sendgrid.net", lookups: 2 }
    ]);
    assert.ok(!asked.some((name) => name.includes("%")), "a macro is never resolved");
    const result = review("tienda.example.com", auth);
    const lookups = finding(result, "sec-spf-lookups");
    assert.deepEqual([lookups.verdict, lookups.severity], ["fail", "high"]);
    assert.match(lookups.evidence, /needs 21 DNS lookups/);
    assert.match(lookups.fix, /most: include:mailgun\.org \(5 lookups\), include:one\.zoho\.eu \(4 lookups\) and include:sendgrid\.net \(2 lookups\)\./);
    assert.equal(finding(result, "sec-spf"), undefined, "a broken SPF record gets no pass");
    assert.equal(row(result, "SPF"), "fail");
  });

  test("two SPF records are an error, whichever one is right", async () => {
    const auth = await read("twice.example.org");
    assert.equal(auth.spfRecords, 2);
    assert.equal(auth.lookups, undefined);
    const result = review("twice.example.org", auth);
    const multiple = finding(result, "sec-spf-multiple");
    assert.deepEqual([multiple.verdict, multiple.severity], ["fail", "high"]);
    assert.match(multiple.title, /publishes 2 SPF records/);
    assert.match(multiple.evidence, /v=spf1 include:_spf\.google\.com ~all \| v=spf1 include:sendgrid\.net -all/);
  });

  test("+all is a fail, ?all and a missing all are risks, ~all and -all pass", async () => {
    const open = review("open.example.net", await read("open.example.net"));
    assert.deepEqual([finding(open, "sec-spf-all").verdict, finding(open, "sec-spf-all").severity], ["fail", "high"]);
    assert.match(finding(open, "sec-spf-all").title, /any server in the world send mail as open\.example\.net/);
    const neutral = review("neutral.example.net", await read("neutral.example.net"));
    assert.deepEqual([finding(neutral, "sec-spf-all").verdict, finding(neutral, "sec-spf-all").severity], ["risk", "medium"]);
    assert.match(finding(neutral, "sec-spf-all").evidence, /ends in \?all/);
    const bare = review("bare.example.net", await read("bare.example.net"));
    assert.match(finding(bare, "sec-spf-all").evidence, /no all term/);
    assert.equal(finding(review("panaderia.example.co", await read("panaderia.example.co")), "sec-spf-all"), undefined);
  });

  test("redirect is followed for the lookup count and for the all at the end", async () => {
    const auth = await read("redirected.example.net");
    assert.deepEqual([auth.lookups, auth.all], [2, "~"]);
    assert.equal(mailAuth.spfTerms("v=spf1 redirect=_spf.google.com").length, 1);
    const ignored = await withTxt((name) => (name === "ignored.example.net" ? Promise.resolve([["v=spf1 include:_spf.google.com redirect=gmail.com -all"]]) : fromFixtures()(name)),
      () => mailAuth.readMailAuth("ignored.example.net"));
    assert.deepEqual([ignored.lookups, ignored.all], [1, "-"], "RFC 7208 6.1: redirect is ignored next to all");
  });

  test("an include that leads to no SPF record breaks SPF", async () => {
    const auth = await read("dead.example.net");
    assert.deepEqual(auth.broken, ["include:spf.oldmailer.example"]);
    const result = review("dead.example.net", auth);
    const broken = finding(result, "sec-spf-include");
    assert.deepEqual([broken.verdict, broken.title], ["fail", "An SPF include points at a domain with no SPF record"]);
    assert.match(broken.evidence, /includes include:spf\.oldmailer\.example, and no single v=spf1 record answers there/);
  });

  test("a DNS failure inside an include is unread, never a broken include", async () => {
    const auth = await withTxt(async (name) => {
      if (name === "sendgrid.net") throw Object.assign(new Error("ESERVFAIL"), { code: "ESERVFAIL" });
      return fromFixtures()(name);
    }, () => mailAuth.readMailAuth("tienda.example.com"));
    assert.deepEqual(auth.broken, []);
    assert.equal(auth.complete, false);
    assert.equal(auth.lookups, 20);
    assert.match(finding(review("tienda.example.com", auth), "sec-spf-lookups").evidence, /needs at least 20 DNS lookups/);
  });

  test("an endless include chain stops at the depth and query caps", async () => {
    let queries = 0;
    const auth = await withTxt(async (name) => {
      queries += 1;
      if (name.startsWith("_dmarc.")) return [];
      return [["v=spf1 include:a" + queries + ".loop.example include:b" + queries + ".loop.example ~all"]];
    }, () => mailAuth.readMailAuth("loop.example"));
    assert.ok(queries <= 40, queries + " queries");
    assert.equal(auth.complete, false);
    assert.ok(auth.lookups > mailAuth.SPF_LIMIT);
  });

  test("a resolver that never answers cannot hold the review past the query timeout", async () => {
    const started = Date.now();
    const auth = await withTxt((name) => (name === "slow.example" ? Promise.resolve([["v=spf1 include:hangs.example ~all"]]) : name.startsWith("_dmarc.") ? Promise.resolve([]) : new Promise(() => {})),
      () => mailAuth.readMailAuth("slow.example"));
    assert.ok(Date.now() - started < 4000);
    assert.deepEqual([auth.lookups, auth.complete, auth.broken], [1, false, []]);
    const stopped = await withTxt(fromFixtures(), () => mailAuth.readMailAuth("tienda.example.com", () => true));
    assert.equal(stopped.spfRecords, null, "a review that ran out of time asks nothing");
  });
});

test.describe("DMARC reporting, subdomains and pct (#3089)", () => {
  test("GitHub, PayPal and Shopify publish complete records and get no new finding", async () => {
    for (const domain of ["github.com", "paypal.com", "shopify.com"]) {
      const result = review(domain, { spfRecords: 1, dmarcRecords: 1 });
      assert.deepEqual(result.findings.filter((item) => /^sec-dmarc-/.test(item.key)).map((item) => item.key), [], domain);
      assert.equal(finding(result, "sec-dmarc").verdict, "pass", domain);
      assert.equal(mailAuth.dmarcRepair(RECORDS["_dmarc." + domain][0], domain), "", domain);
    }
  });

  test("p=reject with sp=none, pct=25 and no rua names all three gaps, and is not read as p=none", async () => {
    const result = review("tienda.example.com", await read("tienda.example.com"));
    assert.equal(finding(result, "sec-dmarc").verdict, "pass");
    const sp = finding(result, "sec-dmarc-sp");
    assert.deepEqual([sp.verdict, sp.severity], ["risk", "medium"]);
    assert.match(sp.evidence, /p=reject, but sp=none .* billing\.tienda\.example\.com/);
    assert.match(sp.fix, /subdomains follow p=reject/);
    const pct = finding(result, "sec-dmarc-pct");
    assert.match(pct.title, /only 25% of forged mail/);
    assert.match(pct.evidence, /reject 25% .* only quarantine the rest/);
    assert.match(finding(result, "sec-dmarc-rua").fix, /rua=mailto:dmarc@tienda\.example\.com/);
    assert.equal(row(result, "DMARC"), "pass");
    const kit = result.fixkit.dns.find((item) => item.name === "_dmarc.tienda.example.com");
    assert.equal(kit.value, "v=DMARC1; p=reject; rua=mailto:dmarc@tienda.example.com");
  });

  test("p=none with sp=reject still only monitors, and BIMI is not eligible", () => {
    const result = review("watch.example.net", { spfRecords: 1, dmarcRecords: 1 }, { dmarc: "v=DMARC1; p=none; sp=reject; rua=mailto:d@watch.example.net", bimi: "v=BIMI1; l=https://watch.example.net/logo.svg" });
    assert.equal(finding(result, "sec-dmarc").title, "DMARC only monitors");
    assert.equal(finding(result, "sec-dmarc-sp"), undefined, "sp=none only matters next to an enforced p");
    assert.equal(result.security.bimi.eligible, false);
    assert.equal(row(result, "DMARC"), "risk");
  });

  test("p=quarantine with pct below 100 delivers the rest", () => {
    const result = review("q.example.net", { spfRecords: 1, dmarcRecords: 1 }, { dmarc: "v=DMARC1; p=quarantine; pct=50; rua=mailto:d@q.example.net" });
    assert.match(finding(result, "sec-dmarc-pct").evidence, /quarantine 50% .* deliver the rest as usual/);
    assert.equal(finding(result, "sec-dmarc-rua"), undefined);
  });

  test("two DMARC records are an error, and the first one earns no pass", async () => {
    const result = review("twice.example.org", await read("twice.example.org"), { dmarc: "v=DMARC1; p=reject; rua=mailto:b@twice.example.org" });
    assert.deepEqual([finding(result, "sec-dmarc-multiple").verdict, finding(result, "sec-dmarc-multiple").severity], ["fail", "high"]);
    assert.equal(finding(result, "sec-dmarc"), undefined);
    assert.equal(row(result, "DMARC"), "fail");
  });

  test("a DMARC record that was not read gets no finding", () => {
    const result = review("unread.example.net", { spfRecords: 1, dmarcRecords: null }, { dmarc: "", unread: ["dmarc"] });
    assert.deepEqual(result.findings.filter((item) => /^sec-dmarc/.test(item.key)), []);
  });
});

test.describe("DKIM keys at the common selectors (#3409)", () => {
  const crypto = require("node:crypto");
  const watchCases = require("../../functions/url-review-watch");
  const watch = require("../../js/qa-review-watch.js");
  const rsa = (bits) => crypto.generateKeyPairSync("rsa", { modulusLength: bits }).publicKey.export({ type: "spki", format: "der" }).toString("base64");
  const KEY_2048 = rsa(2048);
  const KEY_1024 = rsa(1024);
  const KEY_512 = rsa(512);
  const GOOGLE_MX = ["aspmx.l.google.com", "alt1.aspmx.l.google.com"];

  // Each name answers the listed TXT rows; every other name is NXDOMAIN.
  const zone = (rows, asked) => async (name) => {
    if (asked) asked.push(name);
    if (rows[name]) return rows[name].map((row) => [row]);
    throw Object.assign(new Error("ENOTFOUND " + name), { code: "ENOTFOUND" });
  };
  const dkim = (domain, rows, hints, asked) => withTxt(zone(rows, asked), () => mailAuth.readDkim(domain, hints || {}));
  const keys = (result) => result.findings.filter((item) => /^sec-dkim/.test(item.key));
  const reviewDkim = (domain, found, extra) => review(domain, { spfRecords: 1, dmarcRecords: 1 }, Object.assign({ dkim: found }, extra));

  test("a Google Workspace domain asks the google selector first and passes with its 2048-bit key", async () => {
    const asked = [];
    // A wildcard TXT answers every name; its SPF row is not a DKIM key.
    const found = await dkim("panaderia.example.co", { "google._domainkey.panaderia.example.co": ["v=DKIM1; k=rsa; p=" + KEY_2048.slice(0, 200) + " " + KEY_2048.slice(200)], "selector1._domainkey.panaderia.example.co": ["v=spf1 -all"] },
      { mx: GOOGLE_MX, spf: "v=spf1 include:_spf.google.com ~all" }, asked);
    assert.equal(asked[0], "google._domainkey.panaderia.example.co");
    assert.equal(found.provider, "Google Workspace");
    assert.equal(found.probed, mailAuth.DKIM_SELECTORS.length);
    assert.deepEqual(found.keys, [{ selector: "google", type: "rsa", bits: 2048 }]);
    const result = reviewDkim("panaderia.example.co", found, { mx: GOOGLE_MX });
    assert.deepEqual(keys(result).map((item) => [item.key, item.verdict]), [["sec-dkim", "pass"]]);
    assert.match(finding(result, "sec-dkim").evidence, /google\._domainkey\.panaderia\.example\.co \(RSA, 2048-bit\)/);
    assert.equal(row(result, "DKIM"), "pass");
  });

  test("Microsoft 365 by MX, then by SPF, puts selector1 and selector2 first", () => {
    assert.deepEqual(mailAuth.mailProvider(["example-com.mail.protection.outlook.com"], "").selectors, ["selector1", "selector2"]);
    assert.equal(mailAuth.mailProvider(["mx1.filter.example.net"], "v=spf1 include:spf.protection.outlook.com -all").name, "Microsoft 365");
    assert.equal(mailAuth.mailProvider(["mx.example.net"], "v=spf1 mx -all"), null);
  });

  test("a revoked key alone breaks DKIM; next to a live key it only retires a selector", async () => {
    const only = await dkim("old.example.org", { "selector1._domainkey.old.example.org": ["v=DKIM1; k=rsa; p="] });
    assert.deepEqual(only.keys, [{ selector: "selector1", type: "rsa", revoked: true }]);
    let result = reviewDkim("old.example.org", only);
    assert.deepEqual(keys(result).map((item) => [item.key, item.verdict, item.severity]), [["sec-dkim-revoked", "risk", "medium"]]);
    assert.match(finding(result, "sec-dkim-revoked").evidence, /selector1\._domainkey\.old\.example\.org has an empty p= tag/);
    assert.equal(row(result, "DKIM"), "risk");
    const both = await dkim("old.example.org", { "selector1._domainkey.old.example.org": ["v=DKIM1; p="], "selector2._domainkey.old.example.org": ["v=DKIM1; k=rsa; p=" + KEY_2048] });
    result = reviewDkim("old.example.org", both);
    assert.deepEqual(keys(result).map((item) => [item.key, item.severity]), [["sec-dkim-revoked", "low"], ["sec-dkim", "info"]]);
    assert.deepEqual(mailAuth.dkimSelectors(both), ["selector2"], "the retest skips a revoked selector");
  });

  test("an RSA key below 1024 bits fails, 1024 bits is advice to move to 2048", async () => {
    const found = await dkim("legacy.example.net", { "k1._domainkey.legacy.example.net": ["k=rsa; p=" + KEY_512], "s1._domainkey.legacy.example.net": ["v=DKIM1; k=rsa; p=" + KEY_1024], "s2._domainkey.legacy.example.net": ["v=DKIM1; k=ed25519; p=11qYAYKxCrfVS/7TyWQHOg7hcvPapiMlrwIaaPcHURo="] });
    assert.deepEqual(found.keys.map((key) => [key.selector, key.type, key.bits]), [["k1", "rsa", 512], ["s1", "rsa", 1024], ["s2", "ed25519", null]]);
    const result = reviewDkim("legacy.example.net", found);
    const weak = finding(result, "sec-dkim-weak");
    assert.deepEqual([weak.verdict, weak.severity], ["fail", "high"]);
    assert.match(weak.evidence, /k1\._domainkey\.legacy\.example\.net \(RSA, 512-bit\)/);
    const short = finding(result, "sec-dkim-short");
    assert.deepEqual([short.verdict, short.severity], ["risk", "low"]);
    assert.match(short.fix, /2048-bit/);
    assert.equal(finding(result, "sec-dkim"), undefined, "a key receivers reject earns no pass");
    assert.equal(row(result, "DKIM"), "fail");
  });

  test("no key at the common selectors is an info line for a person, never a failure", async () => {
    const found = await dkim("custom.example.com", {}, { mx: GOOGLE_MX });
    assert.deepEqual([found.keys, found.unread], [[], 0]);
    let result = reviewDkim("custom.example.com", found, { mx: GOOGLE_MX });
    const none = finding(result, "sec-dkim-none");
    assert.deepEqual([none.verdict, none.severity], ["person", "info"]);
    assert.match(none.evidence, /through Google Workspace, whose DKIM selector is google/);
    assert.match(none.evidence, /custom selector/);
    assert.equal(row(result, "DKIM"), "unknown");
    result = reviewDkim("custom.example.com", Object.assign({}, found, { provider: "" }));
    assert.match(finding(result, "sec-dkim-none").evidence, new RegExp("None of the " + mailAuth.DKIM_SELECTORS.length + " selectors"));
    assert.equal(watchCases.build(keys(result), { dns: { domain: "custom.example.com" } }, { host: "custom.example.com" }), null, "an info line opens no retest");
  });

  test("a domain without MX gets no DKIM finding or summary row, and an unanswered lookup says nothing", async () => {
    const found = await dkim("static.example.com", {});
    let result = reviewDkim("static.example.com", found, { mx: [], nullMx: true });
    assert.deepEqual(keys(result), []);
    assert.equal(result.security.headers.find((item) => item.label === "DKIM"), undefined);
    const silent = await withTxt(() => new Promise(() => {}), () => mailAuth.readDkim("slow.example.com", {}));
    assert.equal(silent.unread, silent.probed);
    result = reviewDkim("slow.example.com", silent);
    assert.deepEqual(keys(result), []);
  });

  test("the mail retest checks the selectors the review found, unless DKIM_SELECTORS names others", async () => {
    const found = await dkim("shop.example.com", { "google._domainkey.shop.example.com": ["v=DKIM1; k=rsa; p=" + KEY_1024] }, { mx: GOOGLE_MX });
    const result = reviewDkim("shop.example.com", found, { mx: GOOGLE_MX });
    const built = watchCases.build(result.findings, { dns: { domain: "example.com", mailAuth: { spfRecords: 1 }, dkim: found } }, { host: "shop.example.com" });
    const mail = built.cases.find((item) => item.kind === "mail");
    assert.ok(mail.keys.includes("sec-dkim-short"));
    assert.deepEqual(mail.data.dkimSelectors, ["google"]);
    const files = new Map(watch.files({ id: "rep1", host: "shop.example.com", finalUrl: "https://shop.example.com/", cases: [], watch: built }).map((file) => [file.path, file.content]));
    assert.ok(files.get("dig/qa-lab-dns.sh").includes("SELECTORS=\"${DKIM_SELECTORS:-google}\""));
    assert.ok(files.get("checkdmarc/check_mail.py").includes("FOUND_SELECTORS = \"google\""));
    assert.ok(files.get("checkdmarc/check_mail.py").includes("os.environ.get(\"DKIM_SELECTORS\") or FOUND_SELECTORS"));
  });
});

test("every new finding reads in all six languages with the same slots", () => {
  const ids = Object.keys(EN).filter((id) => /^sec-(spf|dmarc|dkim)[-.]/.test(id));
  assert.ok(ids.length >= 30, ids.length + " ids");
  const slots = (text) => (String(text).match(/\{\w+\}/g) || []).sort().join(",");
  for (const lang of ["es", "pt", "de", "fr", "it"]) {
    for (const id of ids) {
      assert.ok(COPY[lang][id], lang + " lacks " + id);
      assert.equal(slots(COPY[lang][id]), slots(EN[id]), lang + " " + id);
    }
    const message = { id: "sec-spf-lookups.fix", vars: { list: { items: [{ id: "sec-spf-lookups.cost", vars: { term: "include:mailgun.org", n: 5 } }], more: 0 } } };
    assert.ok(render(COPY[lang], message), lang);
  }
});
