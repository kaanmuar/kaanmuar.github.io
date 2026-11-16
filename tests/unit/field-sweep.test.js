const test = require("node:test");
const assert = require("node:assert/strict");
const admin = require("../../js/social-hub-admin");
const sweep = require("../../scripts/field-sweep");
const { SOURCES } = require("../../scripts/field-sweep/sources");

const NOW = Date.parse("2026-10-24T12:00:00Z");
const source = (id) => SOURCES.find((item) => item.id === id);
const ago = (days) => new Date(NOW - days * 86400000).toUTCString();

const RSS = `<?xml version="1.0"?><rss xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:media="http://search.yahoo.com/mrss/"><channel>
<title>Google Search Central Blog</title><link>https://developers.google.com/search/blog/</link>
<item><title>Structured data &amp; the new &lt;b&gt;Search Console&lt;/b&gt; report</title>
<link>https://developers.google.com/search/blog/2026/10/sd-report?utm_source=feed</link>
<description><![CDATA[<p>Search Console now shows <b>structured data</b> issues per page.</p><img src="https://example.com/sd.png">]]></description>
<pubDate>${ago(2)}</pubDate><dc:creator>John Mueller</dc:creator></item>
<item><title>Short</title><link>https://developers.google.com/search/blog/short</link><pubDate>${ago(1)}</pubDate></item>
<item><title>No address here at all</title><link>http://insecure.example.com/post</link><pubDate>${ago(1)}</pubDate></item>
</channel></rss>`;

const ATOM = `<feed xmlns="http://www.w3.org/2005/Atom" xmlns:media="http://search.yahoo.com/mrss/">
<entry><title>v1.64.0</title><link rel="alternate" type="text/html" href="https://github.com/microsoft/playwright/releases/tag/v1.64.0"/>
<updated>${new Date(NOW - 86400000).toISOString()}</updated><author><name>pavelfeldman</name></author>
<content type="html">&lt;p&gt;New &lt;code&gt;toMatchAriaSnapshot&lt;/code&gt; options.&lt;/p&gt;</content>
<media:thumbnail url="https://avatars.githubusercontent.com/u/1?v=4"/></entry></feed>`;

test("parses RSS items with attribution, clean text and an image", () => {
  const items = sweep.parseFeed(RSS, source("google-search-central"));
  assert.equal(items.length, 1);
  const [item] = items;
  assert.equal(item.title, "Structured data & the new Search Console report");
  assert.equal(item.source, "Google Search Central");
  assert.equal(item.author, "John Mueller");
  assert.equal(item.date, new Date(NOW - 2 * 86400000).toISOString().slice(0, 10));
  assert.equal(item.summary, "Search Console now shows structured data issues per page.");
  assert.equal(item.image, "https://example.com/sd.png");
});

test("parses Atom entries and names a release by its project", () => {
  const [entry] = sweep.parseFeed(ATOM, source("playwright-releases"));
  assert.equal(entry.title, "Playwright v1.64.0");
  assert.equal(entry.url, "https://github.com/microsoft/playwright/releases/tag/v1.64.0");
  assert.equal(entry.author, "pavelfeldman");
  assert.equal(entry.summary, "New toMatchAriaSnapshot options.");
  assert.equal(entry.image, "https://avatars.githubusercontent.com/u/1?v=4");
});

test("parses Hacker News, DEV and GitHub answers, and drops spam and other scripts", () => {
  const hn = sweep.parseHn({ hits: [
    { objectID: "1", title: "Show HN: Flaky test detector for Playwright", url: "https://flaky.dev/", author: "pg", points: 240, created_at: new Date(NOW).toISOString() },
    { objectID: "2", title: "Ask HN: How do you do accessibility testing?", url: null, author: "dang", points: 80, created_at: new Date(NOW).toISOString() }
  ] }, source("hn"));
  assert.deepEqual(hn.map((item) => [item.url, item.signal]), [["https://flaky.dev/", 240], ["https://news.ycombinator.com/item?id=2", 80]]);
  const dev = sweep.parseDevto([{ title: "Accessibility testing with Playwright and axe-core", url: "https://dev.to/a/b", canonical_url: "https://blog.example.com/a11y", published_timestamp: new Date(NOW).toISOString(), user: { name: "Vadym" }, description: "Axe in CI.", cover_image: "https://media.dev.to/c.png", positive_reactions_count: 42 }], source("devto"));
  assert.equal(dev[0].url, "https://blog.example.com/a11y");
  assert.equal(dev[0].author, "Vadym");
  const repo = (over) => Object.assign({ full_name: "acme/a11y-lint", html_url: "https://github.com/acme/a11y-lint", description: "Accessibility linter for CI", created_at: new Date(NOW).toISOString(), owner: { login: "acme" }, stargazers_count: 300 }, over);
  const gh = sweep.parseGithub({ items: [repo(), repo({ full_name: "x/yt", html_url: "https://github.com/x/yt", description: "YouTube view bot with proxy rotation" }), repo({ full_name: "x/zh", html_url: "https://github.com/x/zh", description: "在浏览器中运行小程序测试工具" }), repo({ full_name: "x/fork", html_url: "https://github.com/x/fork", fork: true })] }, source("github"));
  assert.deepEqual(gh.map((item) => item.title), ["acme/a11y-lint: Accessibility linter for CI"]);
  assert.equal(gh[0].image, "https://opengraph.githubassets.com/1/acme/a11y-lint");
});

test("relevance counts whole-word topic keywords, title double", () => {
  assert.deepEqual(sweep.relevance("WCAG 2.2 and screen readers", ""), { topic: "Accessibility", score: 4, inTitle: true });
  assert.deepEqual(sweep.relevance("Alternatives to animal testing", "A biology story"), { topic: "", score: 0, inTitle: false });
  assert.equal(sweep.relevance("Various input tweaks", "Geography").score, 0);
  assert.equal(sweep.relevance("Ship it", "Measure INP and LCP in the field").topic, "Performance");
});

test("canonUrl folds tracking, www, trailing slashes and fragments", () => {
  assert.equal(admin.canonUrl("http://www.Example.com/post/?utm_source=x&id=3#top"), "https://example.com/post?id=3");
  assert.equal(admin.canonUrl("https://example.com"), "https://example.com/");
  assert.equal(admin.canonUrl("javascript:alert(1)"), "");
  assert.equal(sweep.proposalId("https://www.example.com/post/"), sweep.proposalId("https://example.com/post"));
});

const item = (over) => Object.assign({ sourceId: "web-dev", source: "web.dev", url: "https://web.dev/blog/inp", title: "Optimize INP on real pages", author: "Barry", date: "2026-10-23", time: NOW - 86400000, summary: "Interaction to Next Paint.", image: "", signal: 0 }, over);

test("rank merges the same article across sources and boosts it", () => {
  const list = sweep.rank([
    item(),
    item({ sourceId: "hn", source: "Hacker News", url: "https://web.dev/blog/inp/?utm_source=hn", author: "pg", signal: 300 }),
    item({ sourceId: "webaim", source: "WebAIM", url: "https://webaim.org/blog/x", title: "A quiet post about the WebAIM Million", summary: "", time: NOW - 2 * 86400000, date: "2026-10-22" })
  ], { now: NOW, state: admin.empty(), previous: null });
  assert.equal(list.length, 2);
  const [top] = list;
  assert.equal(top.url, "https://web.dev/blog/inp");
  assert.equal(top.source, "web.dev");
  assert.equal(top.author, "Barry");
  assert.equal(top.topic, "Performance");
  assert.match(top.why, /300 points on Hacker News; also on Hacker News/);
  assert.equal(top.trend, Math.round(100 * (Math.log2(4) + 1)) / 100);
  assert.ok(top.score > list[1].score);
  assert.equal(top.firstSeen, "2026-10-24");
});

test("rank leaves out what is approved, dismissed, on the hub, too old or off topic for a general source", () => {
  const dismissed = item({ url: "https://web.dev/blog/dismissed", title: "Dismissed INP post" });
  const state = admin.clean({
    items: [{ id: "pick/x", date: "2026-10-24", title: "On the hub", url: "https://www.web.dev/blog/shared/", image: "https://example.com/a.png" }],
    decisions: { [sweep.proposalId(dismissed.url)]: "dismissed" }
  });
  const list = sweep.rank([
    dismissed,
    item({ url: "https://web.dev/blog/shared", title: "Shared already INP" }),
    item({ url: "https://web.dev/blog/old", title: "Old INP post", time: NOW - 30 * 86400000, date: "2026-09-24" }),
    item({ sourceId: "hn", source: "Hacker News", url: "https://news.example.com/frogs", title: "Alternatives to animal testing", signal: 900 }),
    item({ url: "https://web.dev/blog/kept", title: "Kept INP post" })
  ], { now: NOW, state, previous: null });
  assert.deepEqual(list.map((proposal) => proposal.url), ["https://web.dev/blog/kept"]);
});

test("rank keeps proposals still waiting from the last run and their first-seen day", () => {
  const old = { id: "aaaaaaaaaaaa", title: "Waiting post", url: "https://example.com/waiting", source: "W3C", date: "2026-10-20", topic: "Standards", weight: 1.2, relevance: 2, trend: 0, firstSeen: "2026-10-20", score: 9 };
  const gone = Object.assign({}, old, { id: "bbbbbbbbbbbb", url: "https://example.com/gone", date: "2026-09-01" });
  const again = item({ url: "https://web.dev/blog/again", title: "Seen again INP" });
  const seen = Object.assign({}, old, { id: sweep.proposalId(again.url), url: again.url, firstSeen: "2026-10-21" });
  const list = sweep.rank([again], { now: NOW, state: admin.empty(), previous: { proposals: [old, gone, seen] } });
  assert.deepEqual(list.map((proposal) => proposal.id).sort(), ["aaaaaaaaaaaa", seen.id].sort());
  assert.equal(list.find((proposal) => proposal.id === seen.id).firstSeen, "2026-10-21");
  assert.equal(list.find((proposal) => proposal.id === "aaaaaaaaaaaa").score, sweep.score(old, NOW));
});

test("rank caps each source so one busy feed does not fill the list", () => {
  const many = Array.from({ length: 9 }, (_, i) => item({ url: "https://web.dev/blog/p" + i, title: "INP post number " + i }));
  assert.equal(sweep.rank(many, { now: NOW, state: admin.empty(), previous: null }).length, 4);
});

test("a source that fails does not stop the others", async () => {
  const sources = [source("google-search-central"), source("whatwg"), source("hn")];
  const fetcher = async (url) => {
    if (url.includes("whatwg")) throw new Error("blog.whatwg.org answered 500");
    if (url.includes("algolia") && url.includes("playwright")) throw new Error("timeout");
    if (url.includes("algolia")) return JSON.stringify({ hits: [] });
    if (url.startsWith("https://example.com/")) return "<meta property=\"og:image\" content=\"https://example.com/og.png\">";
    return RSS;
  };
  const { proposals, report } = await sweep.sweep({ sources, fetcher, now: NOW, state: admin.empty(), previous: null });
  assert.equal(report["google-search-central"], 1);
  assert.match(report.whatwg, /^failed: blog\.whatwg\.org answered 500/);
  assert.equal(report.hn, 0);
  assert.equal(proposals.length, 1);
  assert.equal(proposals[0].image, "https://example.com/sd.png");
});

test("the owner's state keeps decisions in shape and the admin shows only proposals still waiting", () => {
  const state = admin.clean({ decisions: { aaaaaaaaaaaa: "approved", bbbbbbbbbbbb: "dismissed", cccccccccccc: "maybe", "../x": "dismissed" } });
  assert.deepEqual(state.decisions, { aaaaaaaaaaaa: "approved", bbbbbbbbbbbb: "dismissed" });
  assert.equal(admin.clean({}).decisions, undefined);
  state.items.push({ id: "pick/a", url: "https://www.example.com/shared/" });
  const proposals = [
    { id: "aaaaaaaaaaaa", url: "https://example.com/a" },
    { id: "bbbbbbbbbbbb", url: "https://example.com/b" },
    { id: "dddddddddddd", url: "https://example.com/shared?utm_medium=x" },
    { id: "eeeeeeeeeeee", url: "https://example.com/e" },
    { id: "not-an-id", url: "https://example.com/f" }
  ];
  assert.deepEqual(admin.pendingProposals(proposals, state).map((proposal) => proposal.id), ["eeeeeeeeeeee"]);
});

test("an approved proposal starts as a hand-added item that credits its source", () => {
  const draft = admin.proposalDraft({ id: "eeeeeeeeeeee", title: "Optimize INP", url: "https://web.dev/blog/inp", source: "web.dev", author: "Barry", date: "2026-10-23", topic: "Performance", summary: "Interaction to Next Paint.", image: "" }, "2026-10-24");
  assert.deepEqual(draft, {
    title: "Optimize INP", url: "https://web.dev/blog/inp", image: "assets/share/qa-review-social.jpg", lang: "en", date: "2026-10-24", cat: "Performance",
    text: "Interaction to Next Paint.\n\nVia web.dev, by Barry, 2026-10-23."
  });
  assert.ok(admin.cleanItem(Object.assign({ id: admin.newId(draft.title, []) }, draft)));
});
