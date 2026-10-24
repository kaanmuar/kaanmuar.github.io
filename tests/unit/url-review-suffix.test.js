/**
 * Registrable domains from the bundled Public Suffix List, and the owner checks that use them (#926).
 *
 *   node --test tests/unit/url-review-suffix.test.js
 */
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const suffix = require("../../functions/url-review-suffix");
const core = require("../../functions/url-review-core");
const notice = require("../../functions/url-review-owner-notice");
const contacts = require("../../functions/url-review-owner-contacts");
const browser = require("../../functions/url-review-browser");

test.describe("the registrable domain", () => {
  test("sites under gv.at, gov.ae and other multi-label suffixes are each their own domain", () => {
    assert.equal(core.registrable("finanz.gv.at"), "finanz.gv.at");
    assert.equal(core.registrable("www.oesterreich.gv.at"), "oesterreich.gv.at");
    assert.equal(core.registrable("WWW.Wien.GV.AT."), "wien.gv.at");
    assert.equal(core.registrable("u.ae"), "u.ae");
    assert.equal(core.registrable("www.mofa.gov.ae"), "mofa.gov.ae");
    assert.equal(core.registrable("shop.acme.com.cn"), "acme.com.cn");
    assert.equal(core.registrable("www.uibk.ac.at"), "uibk.ac.at");
  });

  test("co.uk-style suffixes, wildcard rules and their exceptions", () => {
    assert.equal(core.registrable("shop.example.co.uk"), "example.co.uk");
    assert.equal(core.registrable("www.bbc.co.uk"), "bbc.co.uk");
    assert.equal(core.registrable("shop.acme.com.co"), "acme.com.co");
    assert.equal(core.registrable("medellin.unal.edu.co"), "unal.edu.co");
    assert.equal(core.registrable("www.mintic.gov.co"), "mintic.gov.co");
    assert.equal(core.registrable("a.b.foo.ck"), "b.foo.ck");
    assert.equal(core.registrable("www.ck"), "www.ck");
    assert.equal(core.registrable("www.city.kawasaki.jp"), "city.kawasaki.jp");
  });

  test("plain .com, .org and unknown endings keep the last two labels", () => {
    assert.equal(core.registrable("www.example.com"), "example.com");
    assert.equal(core.registrable("a.b.example.com"), "example.com");
    assert.equal(core.registrable("example.com"), "example.com");
    assert.equal(core.registrable("docs.python.org"), "python.org");
    assert.equal(core.registrable("news.example.zz"), "example.zz");
  });

  test("Unicode and punycode spellings of one name are the same domain", () => {
    assert.equal(core.registrable("shop.bücher.de"), "xn--bcher-kva.de");
    assert.equal(core.registrable("shop.xn--bcher-kva.de"), "xn--bcher-kva.de");
    assert.equal(core.registrable("www.example.公司.cn"), "example.xn--55qx5d.cn");
    assert.equal(core.registrable("www.example.xn--55qx5d.cn"), "example.xn--55qx5d.cn");
    assert.equal(core.registrable("www.city.xn--1lqs71d.jp"), "city.xn--1lqs71d.jp");
  });

  test("an IP address, localhost, a public suffix or nothing stays as it is", () => {
    assert.equal(core.registrable("10.0.0.1"), "10.0.0.1");
    assert.equal(core.registrable("192.168.0.1"), "192.168.0.1");
    assert.equal(core.registrable("[2001:db8::1]"), "2001:db8::1");
    assert.equal(core.registrable("localhost"), "localhost");
    assert.equal(core.registrable("app.localhost"), "app.localhost");
    assert.equal(core.registrable("gv.at"), "gv.at");
    assert.equal(core.registrable("co.uk"), "co.uk");
    assert.equal(core.registrable(""), "");
    assert.equal(core.registrable(null), "");
  });

  test("private-section suffixes split sites one party does not control; the registry domain does not", () => {
    assert.equal(core.registrable("blog.someone.github.io"), "someone.github.io");
    assert.equal(core.registrable("foo.eu.org"), "foo.eu.org");
    assert.equal(core.registrable("tax.service.gov.uk"), "tax.service.gov.uk");
    assert.equal(core.registrable("www.gov.uk"), "www.gov.uk");
    assert.equal(core.registryDomain("blog.someone.github.io"), "github.io");
    assert.equal(core.registryDomain("foo.eu.org"), "eu.org");
    assert.equal(core.registryDomain("tax.service.gov.uk"), "service.gov.uk");
    assert.equal(core.registryDomain("finanz.gv.at"), "finanz.gv.at");
    assert.equal(core.registryDomain("www.example.com"), "example.com");
    assert.equal(core.registryDomain("gv.at"), "gv.at");
    assert.equal(core.registryDomain("8.8.8.8"), "8.8.8.8");
  });

  test("the bundled list carries the license, a version and both sections", () => {
    const text = fs.readFileSync(path.join(__dirname, "../../functions/assets/public_suffix_list.dat"), "utf8");
    assert.match(text, /Mozilla Public\n\/\/ License, v\. 2\.0/);
    assert.match(text, /^\/\/ VERSION: \d{4}-\d{2}-\d{2}/m);
    ["BEGIN ICANN", "END ICANN", "BEGIN PRIVATE", "END PRIVATE"].forEach((mark) => assert.ok(text.includes("===" + mark + " DOMAINS==="), mark));
    assert.equal(suffix.suffixRegistrable(text)("gv.at"), "");
    assert.equal(suffix.suffixRegistrable(text)("a.b.github.io"), "github.io");
    assert.equal(suffix.suffixRegistrable(text, true)("a.b.github.io"), "b.github.io");
  });
});

test.describe("a mailbox on the site's domain", () => {
  test("a mailbox on one gv.at site is not on another", () => {
    assert.equal(core.mailboxMatchesHost("a@finanz.gv.at", "www.oesterreich.gv.at"), false);
    assert.equal(core.mailboxMatchesHost("a@finanz.gv.at", "finanz.gv.at"), true);
    assert.equal(core.mailboxMatchesHost("a@finanz.gv.at", "www.finanz.gv.at"), true);
    assert.equal(core.mailboxMatchesHost("a@mail.finanz.gv.at", "service.finanz.gv.at"), true);
    assert.equal(core.mailboxMatchesHost("a@mofa.gov.ae", "www.moi.gov.ae"), false);
    assert.equal(core.mailboxMatchesHost("a@gv.at", "finanz.gv.at"), false);
    assert.equal(core.mailboxMatchesHost("a@finanz.gv.at", "gv.at"), false);
  });

  test("co.uk-style suffixes, plain .com, private suffixes and IDN", () => {
    assert.equal(core.mailboxMatchesHost("qa@shop.example.co.uk", "www.shop.example.co.uk"), true);
    assert.equal(core.mailboxMatchesHost("qa@other.co.uk", "www.example.co.uk"), false);
    assert.equal(core.mailboxMatchesHost("qa@example.com", "shop.example.com"), true);
    assert.equal(core.mailboxMatchesHost("someone@gmail.com", "example.com"), false);
    assert.equal(core.mailboxMatchesHost("qa@notexample.com", "example.com"), false);
    assert.equal(core.mailboxMatchesHost("me@foo.eu.org", "bar.eu.org"), false);
    assert.equal(core.mailboxMatchesHost("me@someone.github.io", "other.github.io"), false);
    assert.equal(core.mailboxMatchesHost("info@xn--bcher-kva.de", "www.bücher.de"), true);
    assert.equal(core.mailboxMatchesHost("info@xn--bcher-kva.de", "www.buecher.de"), false);
  });

  test("IP hosts, localhost and empty values never match another host", () => {
    assert.equal(core.mailboxMatchesHost("a@0.1", "10.0.0.1"), false);
    assert.equal(core.mailboxMatchesHost("a@example.com", "93.184.216.34"), false);
    assert.equal(core.mailboxMatchesHost("a@example.localhost", "localhost"), false);
    assert.equal(core.mailboxMatchesHost("a@example.com", ""), false);
    assert.equal(core.mailboxMatchesHost("", "example.com"), false);
    assert.equal(core.mailboxMatchesHost("example.com", "example.com"), false);
  });
});

test.describe("the owner check end to end", () => {
  const intake = (email, url) => core.validateIntake({ termsAccepted: true, termsVersion: core.TERMS_VERSION, name: "Ana Ruiz", email, reasonCode: "own", frameworks: ["Playwright"], url });
  const emailError = (result) => result.errors.some((error) => error.field === "email");

  test("the intake refuses \"I own this site\" from a mailbox on a sibling site", () => {
    assert.equal(emailError(intake("ana@finanz.gv.at", "https://www.oesterreich.gv.at/")), true);
    assert.equal(emailError(intake("ana@foo.eu.org", "https://bar.eu.org/")), true);
    assert.equal(emailError(intake("ana@other.co.uk", "https://shop.example.co.uk/")), true);
    assert.equal(emailError(intake("ana@finanz.gv.at", "https://www.finanz.gv.at/")), false);
    assert.equal(emailError(intake("ana@example.com", "https://shop.example.com/")), false);
  });

  test("ownerProof grants \"own\" only for the mailbox's own site", () => {
    assert.equal(core.ownerProof({ reasonCode: "own", email: "ana@finanz.gv.at" }, "www.oesterreich.gv.at"), "");
    assert.equal(core.ownerProof({ reasonCode: "own", email: "ana@finanz.gv.at" }, "www.finanz.gv.at"), "own");
    assert.equal(core.ownerProof({ reasonCode: "own", email: "ana@moi.gov.ae" }, "mofa.gov.ae"), "");
    assert.equal(core.ownerProof({ reasonCode: "own", email: "ana@example.com" }, "shop.example.com"), "own");
  });

  test("proveOwner reads TXT records on the host and its own domain, never the public suffix", async () => {
    const asked = [];
    const deps = (records) => ({
      resolveTxt: async (name) => { asked.push(name); if (!records[name]) throw new Error("ENODATA"); return records[name]; },
      fetchHome: async () => ""
    });
    const asker = { reasonCode: "own", email: "ana@finanz.gv.at", siteToken: () => "a".repeat(32) };
    const planted = { "gv.at": [["qa-lab-verify=" + "a".repeat(32)]] };
    assert.deepEqual(await core.proveOwner(asker, "www.oesterreich.gv.at", deps(planted)), { kind: "", how: "", checked: false });
    assert.deepEqual(asked, ["oesterreich.gv.at"]);
    asked.length = 0;
    await core.proveOwner(asker, "portal.oesterreich.gv.at", deps(planted));
    assert.deepEqual(asked, ["portal.oesterreich.gv.at", "oesterreich.gv.at"]);
    const own = { "oesterreich.gv.at": [["qa-lab-verify=" + "a".repeat(32)]] };
    assert.deepEqual(await core.proveOwner(asker, "www.oesterreich.gv.at", deps(own)), { kind: "site", how: "dns", checked: true });
    assert.deepEqual(await core.proveOwner(asker, "www.finanz.gv.at", deps({})), { kind: "own", how: "", checked: false });
  });

  test("owner notices and contact searches keep only mailboxes on the site's own domain", async () => {
    assert.equal(notice.domainOf("www.finanz.gv.at"), "finanz.gv.at");
    const ranked = notice.rankContacts([
      { email: "info@finanz.gv.at", source: "page" },
      { email: "info@oesterreich.gv.at", source: "page" },
      { email: "dmarc@oesterreich.gv.at", source: "dmarc" }
    ], "www.finanz.gv.at");
    assert.deepEqual(ranked.map((row) => [row.email, row.onDomain]), [["info@finanz.gv.at", true], ["info@oesterreich.gv.at", false]]);
    const found = await contacts.discover({ host: "www.finanz.gv.at", contacts: {} }, {
      fetchPage: async () => ({ status: 404 }),
      analyze: core.analyzeHtml,
      github: async () => null,
      search: async () => [{ title: "Kontakt", url: "https://directory.example/", description: "post@finanz.gv.at, post@oesterreich.gv.at, post@gv.at" }],
      emailsInText: core.emailsInText,
      registrable: core.registrable
    });
    assert.deepEqual(found.map((row) => row.email), ["post@finanz.gv.at"]);
  });

  test("a listener on a sibling gv.at site counts as another site", () => {
    const out = browser.watchFrom({ listen: { "www.finanz.gv.at": 1, "cdn.finanz.gv.at": 1, "www.oesterreich.gv.at": 1 } }, [], null, "www.finanz.gv.at");
    assert.deepEqual(out.listeners, ["www.oesterreich.gv.at"]);
  });
});
