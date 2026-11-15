/**
 * Signs of a hacked site: spam in search results, cloaking for Googlebot, and hidden spam links (#3088).
 *
 *   node --test tests/unit/url-review-hack-signs.test.js
 */
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const hack = require("../../functions/url-review-hack-signs");
const { english } = require("../../functions/url-review-findings-en");
const findingsCopy = require("../../functions/url-review-findings-copy");

const fixture = (name) => fs.readFileSync(path.join(__dirname, "fixtures", "hack-signs", name), "utf8");
const CLEAN = fixture("clean.html");
const CLOAKED = fixture("cloaked-bot.html");
const HOME = "https://www.harborbakery.example/";
const page = (body, url) => ({ url: url || HOME, status: 200, headers: {}, body });

function collect(signs) {
  const rows = [];
  hack.findings(signs, (area, verdict, severity, key, title, evidence, fix, opts) => rows.push({ area, verdict, severity, key, title, evidence, fix, opts: opts || {} }));
  return rows;
}

test.describe("spam phrases", () => {
  test("finds the phrases spammers use", () => {
    assert.deepEqual(hack.spamTerms("Buy cheap Viagra online, fast shipping"), ["buy cheap viagra"]);
    assert.ok(hack.spamTerms("Slot Gacor Maxwin hari ini").length);
    assert.ok(hack.spamTerms("Best online casino with 200 free spins").length);
    assert.ok(hack.spamTerms("Replica Rolex watches from $99").length);
    assert.ok(hack.spamTerms("Payday loans with no credit check").length);
    assert.ok(hack.spamTerms("ルイヴィトン スーパーコピー 激安通販").length);
  });

  test("does not count a topic word on its own", () => {
    assert.deepEqual(hack.spamTerms("Pfizer's Viagra patent expires; the old casino on Front Street becomes a market; our loan calculator; crypto news"), []);
    assert.deepEqual(hack.spamTerms("We offer a free consultation and online booking."), []);
  });

  test("Japanese text counts on a site in another language, not on a Japanese one", () => {
    const title = "ナイキ エアジョーダン 激安 通販 送料無料 セール";
    assert.equal(hack.spamTerms(title).length, 1);
    assert.deepEqual(hack.spamTerms(title, ["japanese"]), []);
    assert.deepEqual(hack.spamTerms("Language: 日本語"), []);
  });

  test("leaves out the site's own topics", () => {
    assert.deepEqual(hack.spamTerms("Buy Cialis online with a prescription", ["pharma"]), []);
    assert.ok(hack.spamTerms("Buy Cialis online, slot gacor", ["pharma"]).length);
  });
});

test.describe("the site's own topics", () => {
  test("come from schema types, the title, description and h1", () => {
    assert.deepEqual(hack.siteTopics({ title: "Green Cross", types: ["Pharmacy"] }), ["pharma"]);
    assert.deepEqual(hack.siteTopics({ title: "Royal Casino & Sportsbook" }), ["gambling"]);
    assert.deepEqual(hack.siteTopics({ title: "QuickCash", types: ["LoanOrCredit"] }), ["lending"]);
    assert.deepEqual(hack.siteTopics({ title: "Harbor Bakery", description: "Fresh bread", h1: ["Harbor Bakery"], lang: "en" }), []);
    assert.deepEqual(hack.siteTopics({ title: "東京ベーカリー", lang: "ja" }), ["japanese"]);
  });
});

test.describe("search results", () => {
  const rows = [
    { title: "Buy Cialis Online Cheap - Harbor Bakery", url: "https://www.harborbakery.example/?p=buy-cialis-online", description: "Generic cialis without prescription" },
    { title: "Slot gacor terpercaya", url: "https://shop.harborbakery.example/slot-gacor/", description: "" },
    { title: "Our sourdough", url: "https://www.harborbakery.example/sourdough", description: "Bread baked daily" },
    { title: "Buy Viagra online", url: "https://elsewhere.example/viagra", description: "" }
  ];

  test("keep pages on the domain that carry spam phrases", () => {
    const found = hack.spamResults(rows, "harborbakery.example", []);
    assert.deepEqual(found.map((row) => row.url), ["https://www.harborbakery.example/?p=buy-cialis-online", "https://shop.harborbakery.example/slot-gacor/"]);
  });

  test("leave out the site's own topic", () => {
    assert.deepEqual(hack.spamResults(rows, "harborbakery.example", ["pharma"]).map((row) => row.url), ["https://shop.harborbakery.example/slot-gacor/"]);
  });

  test("the query names the domain and spam words", () => {
    assert.match(hack.spamQuery("harborbakery.example"), /^site:harborbakery\.example viagra OR .*"slot gacor".* OR 激安$/);
  });
});

test.describe("Googlebot against a phone browser", () => {
  test("a cloaked copy with hidden spam links is spam, with the phrases that differed", () => {
    const out = hack.compare(page(CLEAN), page(CLOAKED));
    assert.equal(out.verdict, "spam");
    assert.ok(out.terms.includes("buy cheap viagra"), out.terms.join(", "));
    assert.ok(out.terms.some((term) => /slot gacor/.test(term)));
  });

  test("the same page is the same, also with an A/B test's changed sentence", () => {
    assert.equal(hack.compare(page(CLEAN), page(CLEAN)).verdict, "same");
    const variant = CLEAN.replace("Order a birthday cake two days ahead", "Pre-order your celebration cake 48 hours ahead");
    assert.equal(hack.compare(page(CLEAN), page(variant)).verdict, "same");
  });

  test("prerendering for bots that keeps the title is not a difference", () => {
    const shell = "<!doctype html><html><head><title>Harbor Bakery | Fresh bread in Portland</title></head><body><div id=\"root\"></div></body></html>";
    assert.equal(hack.compare(page(shell), page(CLEAN)).verdict, "same");
  });

  test("a Japanese keyword hack of the title and text is spam on an English site", () => {
    const japanese = CLEAN.replace(/<title>[^<]*<\/title>/, "<title>ナイキ エアジョーダン 激安 通販 送料無料 セール</title>");
    const out = hack.compare(page(CLEAN), page(japanese));
    assert.equal(out.verdict, "spam");
    assert.equal(hack.compare(page(CLEAN), page(japanese), { skip: ["japanese"] }).verdict, "same");
  });

  test("another title and text without spam, a robots change, or another site differ", () => {
    const other = "<!doctype html><html><head><title>Welcome</title></head><body><p>Completely different landing words appear here for crawlers only, nothing alike.</p></body></html>";
    assert.deepEqual(hack.compare(page(CLEAN), page(other)).fields, ["content"]);
    const noindex = CLEAN.replace("index, follow", "noindex");
    assert.deepEqual(hack.compare(page(CLEAN), page(noindex)).fields, ["robots"]);
    assert.deepEqual(hack.compare(page(CLEAN), page(CLEAN, "https://landing.example.net/")).fields, ["address"]);
  });

  test("five new link hosts only for Googlebot differ", () => {
    const links = ["a", "b", "c", "d", "e"].map((name) => "<a href=\"https://" + name + "-partner.example/\">partner</a>").join("");
    const out = hack.compare(page(CLEAN), page(CLEAN.replace("</main>", links + "</main>")));
    assert.deepEqual(out.fields, ["links"]);
    assert.equal(out.newHosts.length, 5);
  });
});

test.describe("spam links in the HTML", () => {
  test("links hidden off-screen are hidden spam links", () => {
    const rows = hack.spamLinks(CLOAKED, HOME, []);
    assert.equal(rows.length, 3);
    assert.ok(rows.every((row) => row.hidden));
    assert.equal(rows[0].href, "https://pills-direct.example.net/viagra");
  });

  test("a hidden block inside a visible one is found", () => {
    const html = "<div class=\"wrap\"><p>Hello</p><span style=\"display: none\"><a href=\"https://x.example/\">cheap jerseys</a></span></div>";
    assert.deepEqual(hack.spamLinks(html, HOME, []).map((row) => row.hidden), [true]);
  });

  test("a hidden block with spam text and no link is hidden spam text", () => {
    const html = "<p style=\"font-size:0px;\">best online casino bonus no deposit</p>";
    const rows = hack.spamLinks(html, HOME, []);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].href, "");
    assert.ok(rows[0].hidden);
  });

  test("a visible spam link is not hidden, and a hidden mobile menu is not spam", () => {
    assert.deepEqual(hack.spamLinks(CLEAN, HOME, []), []);
    const rows = hack.spamLinks("<footer><a href=\"https://x.example/\">Payday loans online</a></footer>", HOME, []);
    assert.deepEqual(rows.map((row) => row.hidden), [false]);
    assert.deepEqual(hack.spamLinks("<footer><a href=\"https://x.example/\">Payday loans online</a></footer>", HOME, ["lending"]), []);
  });

  test("small but readable text is not hidden", () => {
    assert.deepEqual(hack.spamLinks("<p style=\"font-size:0.8em\"><a href=\"https://x.example/\">replica rolex</a></p>", HOME, []).map((row) => row.hidden), [false]);
  });
});

test.describe("look()", () => {
  const site = { title: "Harbor Bakery | Fresh bread in Portland", description: "", h1: ["Harbor Bakery"], lang: "en", types: [] };

  test("compares each page as Googlebot and as a phone browser, and searches once", async () => {
    const asked = [];
    const queries = [];
    const signs = await hack.look({
      url: HOME,
      html: CLEAN,
      site,
      paths: [HOME + "menu", HOME + "about", HOME + "contact"],
      fetch: async (url, agent) => {
        asked.push([url, agent === hack.GOOGLEBOT ? "bot" : agent === hack.BROWSER ? "browser" : "?"]);
        if (url.endsWith("about") && agent === hack.GOOGLEBOT) return { url, status: 403, headers: {}, body: "Forbidden" };
        return page(agent === hack.GOOGLEBOT && url === HOME ? CLOAKED : CLEAN, url);
      },
      search: async (query) => {
        queries.push(query);
        return [{ title: "Cheap Replica Rolex", url: HOME + "replica-rolex-watches", description: "" }];
      }
    });
    assert.equal(asked.length, 6, "the start page and two more, twice each");
    assert.equal(queries.length, 1);
    assert.match(queries[0], /^site:harborbakery\.example /);
    assert.deepEqual(signs.pages.map((row) => row.verdict), ["spam", "same", "blocked"]);
    assert.equal(signs.search.rows.length, 1);
    assert.deepEqual(signs.links, []);
    assert.deepEqual(signs.linksRead, ["/", "/menu", "/about"], "a page that refused Googlebot is still read as the browser got it");
    assert.match(hack.line(signs), /refused the Googlebot user agent/);

    const rows = collect(signs);
    const byKey = Object.fromEntries(rows.map((row) => [row.key, row]));
    assert.equal(byKey["sec-cloaking"].verdict, "fail");
    assert.equal(byKey["sec-cloaking"].severity, "high");
    assert.deepEqual(byKey["sec-cloaking"].opts.pages, ["/"]);
    assert.match(english(byKey["sec-cloaking"].evidence), /\/ \(“buy cheap viagra”, “slot gacor”, “replica rolex”\)/);
    assert.equal(byKey["sec-seo-spam"].verdict, "risk", "one search result is a risk to check, not a fail");
    assert.equal(byKey["sec-spam-links"].verdict, "pass");
  });

  test("never waits past its budget, and skips the search when it is off", async () => {
    const started = Date.now();
    const signs = await hack.look({ url: HOME, html: CLEAN, site, fetch: () => new Promise(() => {}), budgetMs: 50 });
    assert.ok(Date.now() - started < 1000);
    assert.equal(signs.pages, null);
    assert.equal(signs.search, null);
    assert.deepEqual(collect(signs).map((row) => row.key + ":" + row.verdict), ["sec-spam-links:pass"]);
  });

  test("a clean site passes all three checks", async () => {
    const signs = await hack.look({ url: HOME, html: CLEAN, site, fetch: async (url) => page(CLEAN, url), search: async () => [] });
    assert.deepEqual(collect(signs).map((row) => row.key + ":" + row.verdict), ["sec-seo-spam:pass", "sec-cloaking:pass", "sec-spam-links:pass"]);
  });

  test("a site about the topic is not flagged for its own pages", async () => {
    const pharmacy = { title: "Green Cross Pharmacy", description: "", h1: [], lang: "en", types: ["Pharmacy"] };
    const signs = await hack.look({
      url: HOME, html: "<a href=\"/cialis\">Buy Cialis online</a>", site: pharmacy, fetch: async (url) => page(CLEAN, url),
      search: async () => [{ title: "Buy Cialis online", url: HOME + "cialis", description: "Generic cialis without prescription" }]
    });
    assert.deepEqual(collect(signs).map((row) => row.key + ":" + row.verdict), ["sec-seo-spam:pass", "sec-cloaking:pass", "sec-spam-links:pass"]);
  });
});

test("every finding renders in English and in each page language", async () => {
  const signs = await hack.look({
    url: HOME, html: CLOAKED, site: { title: "Harbor Bakery" },
    fetch: async (url, agent) => page(agent === hack.GOOGLEBOT ? CLOAKED.replace(/<title>[^<]*<\/title>/, "<title>Welcome</title>").replace(/<main>[\s\S]*<\/main>/, "<main>Other words</main>") : CLEAN, url),
    search: async () => [{ title: "Slot gacor", url: HOME + "a", description: "" }, { title: "Togel online", url: HOME + "b", description: "" }, { title: "Replica Rolex", url: HOME + "c", description: "" }]
  });
  const rows = collect(signs);
  assert.deepEqual(rows.map((row) => row.key + ":" + row.verdict), ["sec-seo-spam:fail", "sec-cloaking:fail", "sec-spam-links:fail"]);
  for (const lang of ["es", "pt", "de", "fr", "it"]) {
    const book = findingsCopy.forLang(lang);
    for (const row of rows) for (const field of ["title", "evidence", "fix"]) {
      if (!row[field]) continue;
      const text = book.line(row[field], english(row[field]));
      assert.notEqual(text, english(row[field]), lang + " " + row.key + " " + field);
      assert.ok(!/\{\w+\}/.test(text), lang + " " + text);
    }
  }
  const differs = collect({ domain: "harborbakery.example", links: [], pages: [{ path: "/", verdict: "differs", fields: ["content", "links"], titles: { browser: "Harbor Bakery", bot: "Welcome" }, newHosts: ["a.example", "b.example"] }] });
  assert.equal(english(differs[0].evidence), "Each page was requested as Googlebot and as a phone browser at the same moment. On these pages Googlebot's copy differed from the visitors' copy: / (the title, “Harbor Bakery” for visitors and “Welcome” for Googlebot, and most of the text and links to sites visitors do not see, such as a.example, b.example). No spam phrase was seen, so this may be deliberate, but Google treats showing it other content than visitors see as cloaking.");
});
