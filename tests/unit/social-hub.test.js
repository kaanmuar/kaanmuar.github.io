const test = require("node:test");
const assert = require("node:assert/strict");
const hub = require("../../scripts/build-social-hub");
const card = require("../../js/social-hub-card");
const { COPY, LANGS } = require("../../scripts/social-hub/copy");

const post = (over) => Object.assign({
  id: "auto-2026-10-22/01-u-uber-com", kind: "review", batch: "auto-2026-10-22", date: "2026-10-22", lang: "en", clipLang: "es",
  cat: "", title: "uber.com: 66. The gap: page titles.", text: "Give every page a title.\n\nGuide: https://carlosandmunoz.com/qa-review-guide.html?utm_source=x&utm_medium=social",
  image: "media/social-posts/auto-2026-10-22/feed/01-u-uber-com.jpg", thumb: "assets/social/thumbs/x.webp", alt: "Card <uber>", youtube: "5b4Hr6r-cBk", report: "u-uber-com", captions: {}
}, over);

test("YouTube titles match their post across #Shorts, spaced domains and voiced languages", () => {
  assert.equal(hub.titleKey("postobon. com: 49. A lacuna. #Shorts"), hub.titleKey("postobon.com: 49. A lacuna."));
  assert.equal(hub.cleanTitle("postobon. com: 49. A lacuna: rótulos. #Shorts"), "postobon.com: 49. A lacuna: rótulos.");
  assert.equal(hub.scoreKey("teaminternational.com: 64. Il punto debole: link rotti. #Shorts"), hub.scoreKey("teaminternational.com: 64. The gap: broken links."));
  assert.equal(hub.scoreKey("Release day: is the page still right?"), "");
});

test("a card escapes its text, shortens tagged links and links the report in the page language", () => {
  const html = card.cardHtml(post(), COPY.es, "es");
  assert.match(html, /alt="Card &lt;uber&gt;"/);
  assert.match(html, /href="https:\/\/carlosandmunoz.com\/qa-review-guide.html\?utm_source=x&amp;utm_medium=social"/);
  assert.match(html, />carlosandmunoz.com\/qa-review-guide.html</);
  assert.match(html, /href="qa-review-es.html\?live=u-uber-com&amp;from=social"/);
  assert.match(html, /href="social\/auto-2026-10-22\/01-u-uber-com\.html" data-act="open"/);
  assert.match(html, /▶ ES/);
  assert.match(html, /data-act="play" data-video="5b4Hr6r-cBk"/);
});

test("a card names its topic and the clip's voice in the page language and keeps caption paragraphs apart", () => {
  const html = card.cardHtml(post({ cat: "Requested" }), COPY.de, "de");
  assert.match(html, /<span class="post-tag">Angefragt<\/span>/);
  assert.match(html, /aria-label="Clip ansehen \(mit Ton, ES\)"/);
  assert.match(html, /<span class="post-par">Give every page a title.<\/span> <span class="post-par">Guide: /);
  assert.equal(card.topic({ cat: "Brand new" }, COPY.de), "Brand new");
  for (const lang of Object.keys(LANGS)) assert.deepEqual(Object.keys(COPY[lang].cats), Object.keys(COPY.en.cats), lang);
});

test("each page offers the topics of its posts, translated, and versions its CSS and JS by content", () => {
  const html = hub.page("fr", [post({ cat: "Worldwide" }), post({ id: "b/2", cat: "Worldwide" }), post({ id: "b/3", cat: "Local" })], "2026-10-24");
  assert.match(html, /<option value="all">Tous les thèmes<\/option><option value="Worldwide">Mondial<\/option><option value="Local">Local<\/option>/);
  assert.match(html, /css\/social-hub.css\?v=[0-9a-f]{10}"/);
  assert.match(html, /script-src [^;]*https:\/\/www\.gstatic\.com[ ;]/, "js/site-analytics.js loads the Firebase SDK from gstatic to store hub events");
  assert.match(html, /id="hub-clear"[^>]*>Effacer les filtres</);
});

test("a Trending chip appears only when posts carry a trending rank, and the feed keeps the rank", () => {
  assert.doesNotMatch(hub.page("es", [post()], "2026-10-24"), /data-kind="trending"/);
  const html = hub.page("es", [post({ trend: 1 })], "2026-10-24");
  assert.match(html, /data-kind="all" aria-pressed="true">Todo<\/button><button type="button" class="hub-chip" data-kind="trending" aria-pressed="false">Tendencias</);
  for (const lang of Object.keys(LANGS)) assert.ok(COPY[lang].kinds.trending, lang);
  assert.equal(JSON.parse(hub.feedJson([post({ trend: 3 })], "2026-10-24")).posts[0].trend, 3);
});

test("posted cards come first, newest first, then scheduled ones, soonest first", () => {
  const order = card.arrange([post({ id: "a", date: "2026-11-30" }), post({ id: "b", date: "2026-10-01" }), post({ id: "c", date: "2026-11-02" }), post({ id: "d", date: "2026-10-20" })], "2026-10-24");
  assert.deepEqual(order.map((p) => p.id + (p.upcoming ? "+" : "")), ["d", "b", "c+", "a+"]);
  assert.match(card.cardHtml(order[2], COPY.fr, "fr"), /post-scheduled">Programmée</);
});

test("each page shows scheduled posts after posted ones, keeps them out of JSON-LD, links six languages", () => {
  const posts = [post({ id: "b/late", date: "2026-11-30", title: "Not yet" }), post()];
  const html = hub.page("de", posts, "2026-10-24");
  assert.ok(html.indexOf("Not yet") > html.indexOf("uber.com: 66."));
  assert.match(html, /post-scheduled">Geplant</);
  assert.match(html, /<html lang="de">/);
  assert.match(html, /<link rel="canonical" href="https:\/\/carlosandmunoz.com\/qa-review-social-de.html">/);
  for (const code of Object.keys(LANGS).concat("x-default")) assert.match(html, new RegExp("hreflang=\"" + code + "\""));
  const ld = JSON.parse(html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1]);
  const list = ld["@graph"].find((node) => node["@type"] === "ItemList");
  assert.equal(list.numberOfItems, 1);
  assert.equal(list.itemListElement[0].item.video.embedUrl, "https://www.youtube.com/embed/5b4Hr6r-cBk");
  assert.equal(list.itemListElement[0].item.video.inLanguage, "es");
  assert.ok(!JSON.stringify(ld).includes("Not yet"));
  assert.match(html, /2 Beiträge/);
});

test("every language has the full interface copy", () => {
  const keys = (obj) => Object.keys(obj).sort().join(",");
  for (const lang of Object.keys(LANGS)) {
    assert.equal(keys(COPY[lang]), keys(COPY.en), lang);
    assert.equal(keys(COPY[lang].kinds), keys(COPY.en.kinds), lang);
  }
});

test("each RSS feed lists posted items only, linked to its own language page", () => {
  const xml = hub.rss("de", [post(), post({ id: "later", date: "2099-01-01", title: "Later" })], "2026-10-24");
  assert.match(xml, /<language>de<\/language>/);
  assert.match(xml, /<link>https:\/\/carlosandmunoz\.com\/social\/auto-2026-10-22\/01-u-uber-com\.html<\/link>/);
  assert.match(xml, /youtube\.com\/shorts\/5b4Hr6r-cBk/);
  assert.doesNotMatch(xml, /Later/);
});

test("the social sitemap lists the six hub pages and each posted post page with its image and clip", () => {
  const xml = hub.sitemap([post(), post({ id: "later", date: "2099-01-01" })], "2026-10-24");
  const page = xml.split("<url>").find((block) => block.includes("social/auto-2026-10-22/01-u-uber-com.html</loc>"));
  assert.equal((xml.match(/qa-review-social(-[a-z]{2})?\.html<\/loc>/g) || []).length, 6);
  assert.match(page, /image:loc>https:\/\/carlosandmunoz\.com\/media\/social-posts\/auto-2026-10-22\/feed\/01-u-uber-com\.jpg/);
  assert.match(page, /embed\/5b4Hr6r-cBk/);
  assert.doesNotMatch(xml, /social\/later\.html/);
});

test("a post page is canonical, in its own language, links its other languages and is noindex until its day", () => {
  const de = post({ id: "promo-x/02-topic-de", kind: "launch", lang: "de", group: "promo-x/topic", captions: { x: "Hallo <welt>" } });
  const en = post({ id: "promo-x/01-topic-en", kind: "launch", lang: "en", group: "promo-x/topic" });
  const html = hub.postPage(de, [en, de], [en], "2026-10-21");
  assert.match(html, /<html lang="de">/);
  assert.match(html, /<link rel="canonical" href="https:\/\/carlosandmunoz\.com\/social\/promo-x\/02-topic-de\.html">/);
  assert.match(html, /hreflang="en" href="https:\/\/carlosandmunoz\.com\/social\/promo-x\/01-topic-en\.html"/);
  assert.match(html, /hreflang="x-default" href="[^"]+01-topic-en\.html"/);
  assert.match(html, /<meta name="robots" content="noindex, follow">/);
  assert.match(html, /Hallo &lt;welt&gt;/);
  assert.match(html, /"@type": "SocialMediaPosting"/);
  assert.match(html, new RegExp(COPY.de.allPosts));
  assert.doesNotMatch(hub.postPage(de, [de], [], "2026-10-24"), /noindex|hreflang/);
});

test("the hub promo writes every topic in six languages and queues each twice, woman then man", () => {
  const promo = require("../../scripts/tips-studio/promo-social-hub");
  assert.equal(promo.TIPS.length, 36);
  const queued = promo.TIPS.filter((tip) => !tip.hold);
  assert.equal(queued.length, 12);
  assert.deepEqual(queued.map((tip) => tip.voice), Array(6).fill("w").concat(Array(6).fill("m")));
  const byTopic = {};
  queued.forEach((tip) => { (byTopic[tip.topic] = byTopic[tip.topic] || []).push(tip.lang); });
  Object.values(byTopic).forEach((langs) => { assert.equal(langs.length, 2); assert.notEqual(langs[0], langs[1]); });
  assert.equal(new Set(queued.map((tip) => tip.date)).size, 12);
  for (const tip of promo.TIPS) {
    const cap = promo.captions(tip);
    assert.ok(cap.x.length <= 280, tip.id);
    assert.ok(tip.alt.length <= 300, tip.id);
    assert.match(cap.facebook, new RegExp("qa-review-social" + (tip.lang === "en" ? "" : "-" + tip.lang) + "\\.html\\?utm_source=facebook&utm_medium=social&utm_campaign=social-hub-promo&utm_content=" + tip.id));
  }
});

test("the calendar parser keeps the header keys", () => {
  assert.deepEqual(hub.csvRows("Date,Language,Post\n2026-10-19,de,talking\n"), [{ Date: "2026-10-19", Language: "de", Post: "talking" }]);
});
