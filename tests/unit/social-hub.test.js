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
  assert.match(html, /href="qa-review-es.html\?live=u-uber-com"/);
  assert.match(html, /href="qa-review-social-es.html\?p=auto-2026-10-22%2F01-u-uber-com"/);
  assert.match(html, /▶ ES/);
  assert.match(html, /data-act="play" data-video="5b4Hr6r-cBk"/);
});

test("each page prerenders only posts due by its as-of day, links all six languages and carries valid JSON-LD", () => {
  const posts = [post({ id: "b/late", date: "2026-11-30", title: "Not yet" }), post()];
  const html = hub.page("de", posts, "2026-10-24");
  assert.ok(!html.includes("Not yet"));
  assert.match(html, /<html lang="de">/);
  assert.match(html, /<link rel="canonical" href="https:\/\/carlosandmunoz.com\/qa-review-social-de.html">/);
  for (const code of Object.keys(LANGS).concat("x-default")) assert.match(html, new RegExp("hreflang=\"" + code + "\""));
  const ld = JSON.parse(html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1]);
  const list = ld["@graph"].find((node) => node["@type"] === "ItemList");
  assert.equal(list.numberOfItems, 1);
  assert.equal(list.itemListElement[0].item.video.embedUrl, "https://www.youtube.com/embed/5b4Hr6r-cBk");
  assert.equal(list.itemListElement[0].item.video.inLanguage, "es");
  assert.match(html, /1 Beiträge/);
});

test("the calendar parser keeps the header keys", () => {
  assert.deepEqual(hub.csvRows("Date,Language,Post\n2026-10-19,de,talking\n"), [{ Date: "2026-10-19", Language: "de", Post: "talking" }]);
});
