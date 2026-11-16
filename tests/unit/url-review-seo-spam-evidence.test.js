/**
 * Search-spam severity follows the evidence (#3308), a failed search reads as not checked (#3156), retest titles
 * keep full addresses whole (#3309), and WordPress is not read as Squarespace (#3312).
 *
 *   node --test tests/unit/url-review-seo-spam-evidence.test.js
 */
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const hack = require("../../functions/url-review-hack-signs");
const core = require("../../functions/url-review-core");
const caseRank = require("../../functions/url-review-cases");
const { english } = require("../../functions/url-review-findings-en");
const findingsCopy = require("../../functions/url-review-findings-copy");

const fixture = (name) => fs.readFileSync(path.join(__dirname, "fixtures", "hack-signs", name), "utf8");
const WORDPRESS_ROWS = JSON.parse(fixture("search-wordpress-org.json"));
const PLANTED = JSON.parse(fixture("search-planted.json"));
const CLEAN = fixture("clean.html");
const HOME = "https://www.harborbakery.example/";
const BAKERY = { title: "Harbor Bakery | Fresh bread in Portland", description: "", h1: ["Harbor Bakery"], lang: "en", types: [] };
const WP_HOME = "https://wordpress.org/";
const WORDPRESS = { title: "Blog Tool, Publishing Platform, and CMS – WordPress.org", description: "", h1: ["Meet WordPress"], lang: "en-US", types: [] };
const FULL_SITEMAP = { urls: [HOME, HOME + "menu", HOME + "about", HOME + "ja/menu"], partial: false };
const page = (url) => ({ url, status: 200, headers: {}, body: CLEAN });

function collect(signs) {
  const rows = [];
  hack.findings(signs, (area, verdict, severity, key, title, evidence, fix, opts) => rows.push({ area, verdict, severity, key, title, evidence, fix, opts: opts || {} }));
  return rows;
}

const seoSpam = (signs) => collect(signs).find((row) => row.key === "sec-seo-spam");

function lookAt(rows, opts) {
  const o = opts || {};
  return hack.look(Object.assign({ url: HOME, html: CLEAN, site: BAKERY, fetch: async (url) => page(url), search: async () => rows }, o));
}

test.describe("pages that only write about spam (#3308)", () => {
  test("the wordpress.org plugin page and moderators' guide are not hacked-site spam", async () => {
    const signs = await hack.look({
      url: WP_HOME, html: fixture("wordpress-org-home.html"), site: WORDPRESS, fetch: async (url) => page(url),
      links: [WP_HOME + "plugins/", WP_HOME + "themes/"],
      sitemap: { urls: [WP_HOME, WP_HOME + "plugins/"], partial: true },
      search: async () => WORDPRESS_ROWS
    });
    assert.equal(signs.search.rows.length, 2, "both pages hold a spam phrase in their snippet");
    assert.ok(signs.search.rows.every((row) => row.signs.length === 0), JSON.stringify(signs.search.rows));
    const row = seoSpam(signs);
    assert.equal(row.verdict, "person");
    assert.equal(row.severity, "info");
    assert.match(english(row.title), /^Search results show 2 pages on wordpress\.org that only mention spam phrases$/);
    assert.match(english(row.evidence), /\/plugins\/georgica-compliance-accessibility-check\/ \(“payday loans”\)/);
    assert.match(english(row.evidence), /https:\/\/make\.wordpress\.org\/support\/2015\/01\/how-to-properly-use-tags\/ \(“buy viagra”\)/);
    assert.match(hack.line(signs), /2 pages with spam phrases, 0 with signs of being planted/);
  });

  test("a page in a full sitemap, or on another host of the domain, is not an orphan", async () => {
    const sitemap = { urls: [WP_HOME, WP_HOME + "plugins/georgica-compliance-accessibility-check/"], partial: false };
    const signs = await hack.look({ url: WP_HOME, html: "", site: WORDPRESS, fetch: async (url) => page(url), sitemap, search: async () => WORDPRESS_ROWS });
    assert.deepEqual(signs.search.rows.map((row) => row.signs), [[], []]);
    assert.equal(seoSpam(signs).verdict, "person");
  });

  test("snippet matches alone never reach high, however many there are", async () => {
    const many = Array.from({ length: 8 }, (_, i) => ({ title: "Spam filter notes " + i, url: HOME + "blog/spam-notes-" + i, description: "We block comments that say buy viagra online." }));
    const row = seoSpam(await lookAt(many, { links: many.map((item) => item.url) }));
    assert.equal(row.verdict, "person");
    assert.equal(row.severity, "info");
  });
});

test.describe("planted spam still counts (#3308)", () => {
  test("a spam phrase in the title or address is a risk, three such pages a high fail", async () => {
    const one = seoSpam(await lookAt(PLANTED.name));
    assert.deepEqual([one.verdict, one.severity], ["risk", "medium"]);
    assert.deepEqual(one.opts.pages, ["/?p=buy-cialis-online"]);
    assert.match(english(one.evidence), /\/\?p=buy-cialis-online \(“buy cialis”: in the title or address\)/);
    const three = ["buy-cialis-online", "cheap-viagra-pills", "replica-rolex-watches"].map((slug) => ({ title: slug.replace(/-/g, " "), url: HOME + slug + "/", description: "" }));
    const high = seoSpam(await lookAt(three));
    assert.deepEqual([high.verdict, high.severity], ["fail", "high"]);
  });

  test("a page missing from a full sitemap and the start page's links is an orphan", async () => {
    const signs = await lookAt(PLANTED.orphan, { sitemap: FULL_SITEMAP, links: [HOME + "menu"] });
    assert.deepEqual(signs.search.rows[0].signs, ["orphan"]);
    assert.equal(seoSpam(signs).verdict, "risk");
    const listed = await lookAt(PLANTED.orphan, { sitemap: FULL_SITEMAP, links: [HOME + "news/update-2/"] });
    assert.deepEqual(listed.search.rows[0].signs, [], "linked from the start page, with or without a trailing slash");
    const partial = await lookAt(PLANTED.orphan, { sitemap: Object.assign({}, FULL_SITEMAP, { partial: true }) });
    assert.deepEqual(partial.search.rows[0].signs, [], "a partial sitemap cannot prove a page is missing");
  });

  test("a page in another script than the site is foreign, unless it sits on a language path or host", async () => {
    const foreign = await lookAt(PLANTED.language);
    assert.deepEqual(foreign.search.rows[0].signs, ["language"]);
    assert.equal(seoSpam(foreign).verdict, "risk");
    const both = seoSpam(await lookAt(PLANTED.nameAndLanguage));
    assert.deepEqual([both.verdict, both.severity], ["fail", "high"], "two independent signs on one page");
    assert.match(english(both.evidence), /in the title or address and written in another script than the site/);
    const translated = await lookAt(PLANTED.translated);
    assert.deepEqual(translated.search.rows.map((row) => row.signs), [[], []]);
    assert.equal(seoSpam(translated).verdict, "person");
    const japanese = await lookAt(PLANTED.language, { site: Object.assign({}, BAKERY, { lang: "ja" }) });
    assert.equal(japanese.search.rows.length, 0, "Japanese text is not spam on a Japanese site");
  });

  test("the site's script comes from its language, or from its title when it declares none", () => {
    assert.equal(hack.siteScript({ lang: "en-US" }), "latin");
    assert.equal(hack.siteScript({ lang: "ja" }), "cjk");
    assert.equal(hack.siteScript({ lang: "ru-RU" }), "cyrillic");
    assert.equal(hack.siteScript({ title: "Пекарня у гавани" }), "cyrillic");
    assert.equal(hack.siteScript({ title: "Bakery" }), "latin");
    assert.equal(hack.siteScript({}), "");
  });
});

test.describe("a failed web search (#3156)", () => {
  test("reads as not checked when the search fails, throws or does not answer in time", async () => {
    const failed = await lookAt(null);
    const thrown = await lookAt(null, { search: async () => { throw new Error("429"); } });
    const slow = await lookAt(null, { search: () => new Promise(() => {}), fetch: async (url) => page(url), budgetMs: 50 });
    for (const signs of [failed, thrown, slow]) {
      assert.equal(signs.search.failed, true);
      const row = seoSpam(signs);
      assert.deepEqual([row.verdict, row.severity], ["person", "info"]);
      assert.equal(english(row.title), "Search results were not checked for spam pages on harborbakery.example");
      assert.match(hack.line(signs), /failed or did not answer, so not checked/);
    }
    assert.equal(seoSpam(await lookAt([])).verdict, "pass", "an answered empty search still passes");
  });

  test("webSearchOrNull tells a failed request from an empty answer", async (t) => {
    const original = global.fetch;
    t.after(() => { global.fetch = original; });
    global.fetch = async () => ({ ok: false, status: 429, json: async () => ({}) });
    assert.equal(await core.webSearchOrNull("q", { BRAVE_SEARCH_KEY: "k" }), null);
    assert.deepEqual(await core.webSearch("q", { BRAVE_SEARCH_KEY: "k" }), [], "webSearch keeps answering a list");
    global.fetch = async () => { throw new Error("timeout"); };
    assert.equal(await core.webSearchOrNull("q", { BRAVE_SEARCH_KEY: "k", TAVILY_API_KEY: "t" }), null);
    global.fetch = async (url) => ({ ok: true, json: async () => (/brave/.test(url) ? { web: { results: [] } } : {}) });
    assert.deepEqual(await core.webSearchOrNull("q", { BRAVE_SEARCH_KEY: "k" }), []);
    global.fetch = async (url) => (/brave/.test(url) ? { ok: false, status: 500 } : { ok: true, json: async () => ({ results: [] }) });
    assert.deepEqual(await core.webSearchOrNull("q", { BRAVE_SEARCH_KEY: "k", TAVILY_API_KEY: "t" }), [], "Tavily answered after Brave failed");
  });
});

test("every new search-spam finding renders in each page language", async () => {
  const rows = [
    seoSpam(await lookAt(null)),
    seoSpam(await hack.look({ url: WP_HOME, html: "", site: WORDPRESS, fetch: async (url) => page(url), search: async () => WORDPRESS_ROWS })),
    seoSpam(await lookAt(PLANTED.nameAndLanguage.concat(PLANTED.orphan), { sitemap: FULL_SITEMAP }))
  ];
  assert.deepEqual(rows.map((row) => row.verdict), ["person", "person", "fail"]);
  for (const lang of ["es", "pt", "de", "fr", "it"]) {
    const book = findingsCopy.forLang(lang);
    for (const row of rows) for (const field of ["title", "evidence", "fix"]) {
      if (!row[field]) continue;
      const text = book.line(row[field], english(row[field]));
      assert.notEqual(text, english(row[field]), lang + " " + field + " " + text);
      assert.ok(!/\{\w+\}/.test(text), lang + " " + text);
    }
  }
});

test("a search-spam retest case keeps a full address whole and prefixes the host only to paths (#3309)", async () => {
  const rows = PLANTED.name.concat([
    { title: "Slot gacor terpercaya", url: "https://shop.harborbakery.example/slot-gacor/", description: "" },
    { title: "Cheap replica rolex", url: HOME + "replica-rolex/", description: "" }
  ]);
  const found = seoSpam(await lookAt(rows));
  assert.deepEqual(found.opts.pages, ["/?p=buy-cialis-online", "https://shop.harborbakery.example/slot-gacor/", "/replica-rolex/"]);
  const finding = { id: "F-01", key: "sec-seo-spam", area: "Security", verdict: found.verdict, severity: found.severity, rank: 1, pages: found.opts.pages,
    title: english(found.title), evidence: english(found.evidence), fix: english(found.fix), msg: { title: found.title, evidence: found.evidence, fix: found.fix } };
  const [retest] = caseRank.refine([], { findings: [finding], origin: HOME }).filter((item) => /^RT-/.test(item.id));
  assert.equal(retest.title, "Retest on www.harborbakery.example/?p=buy-cialis-online, shop.harborbakery.example/slot-gacor/ and 1 more: Search results show 3 spam pages on harborbakery.example");
  assert.equal(english(retest.msg.title), retest.title);
  assert.equal(caseRank.siteLabel("wordpress.org", "https://wordpress.org/"), "wordpress.org");
});

test.describe("Squarespace detection (#3312)", () => {
  const names = (html, url) => core.analyzeHtml(html, { "content-type": "text/html" }, url).technologies.map((item) => item.name);

  test("a WordPress site that mentions or embeds Squarespace is not Squarespace", () => {
    const found = names(fixture("wordpress-org-home.html"), WP_HOME);
    assert.ok(found.includes("WordPress"), found.join(", "));
    assert.ok(!found.includes("Squarespace"), found.join(", "));
  });

  test("Squarespace's own asset hosts and context object still name it", () => {
    assert.ok(names(fixture("squarespace-home.html"), HOME).includes("Squarespace"));
    assert.ok(!names("<html><body class=\"squarespace-like\"><script>var builder = 'squarespace';</script></body></html>", HOME).includes("Squarespace"));
  });
});
