const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const ledger = require("../../scripts/social-ledger");
const route = require("../../scripts/face-route");
const q = require("../../scripts/devto-queue");

const NOW = Date.parse("2026-11-02T20:00:00.000Z");
const TEXT = "Every page has a title, and AI answer and search crawlers may read the start page. But 162 structured data items miss a property Google expects, and the <head> of each page repeats it.\n\n"
  + "The lesson for every team: Fill the required properties of each JSON-LD type, then test it in the Rich Results Test before the next release goes out.\n"
  + "The full report: https://carlosandmunoz.com/qa-review.html?live=u-a-com&utm_source=linkedin&utm_medium=social\n\n#StructuredData #SEO #GEO #InteligênciaArtificial #QA #QAlab";
const feedPost = (id, over = {}) => Object.assign({ id, kind: "review", date: "2026-11-02", lang: "en", clipLang: null, title: "a.com: 68.", text: TEXT,
  image: "media/social-posts/auto-1/feed/01-u-a-com.jpg", alt: "Card [score] 68" }, over);
const article = (over = {}) => Object.assign(q.articles([feedPost("auto-1/01-u-a-com")])[0], over);

test("each hub post is one article, in the language its clip speaks when the hub has that variant", () => {
  const list = q.articles([
    feedPost("auto-1/01-u-a-com", { clipLang: "pt" }),
    feedPost("auto-1/01-u-a-com-pt", { lang: "pt", clipLang: "pt", title: "a.com: 68. A lacuna." }),
    feedPost("auto-1/01-u-a-com-de", { lang: "de", clipLang: "pt" }),
    feedPost("auto-1/02-u-b-com", { clipLang: "fr" }),
    feedPost("evergreen-1/es/02-tip", { kind: "tip", lang: "es" })
  ]);
  assert.deepEqual(list.map((a) => [a.key, a.id, a.lang]), [
    ["auto-1/01-u-a-com", "auto-1/01-u-a-com-pt", "pt"],
    ["auto-1/02-u-b-com", "auto-1/02-u-b-com", "en"],
    ["evergreen-1/es/02-tip", "evergreen-1/es/02-tip", "es"]
  ]);
  assert.equal(list[0].slug, "01-u-a-com-pt");
  assert.deepEqual(list[0].urls.map((u) => u.split("/").pop()), ["01-u-a-com.html", "01-u-a-com-pt.html", "01-u-a-com-de.html"]);
});

test("only reviews and tips with enough text, not held, make an article", () => {
  assert.equal(q.eligible(article()), true);
  assert.equal(q.eligible(article({ kind: "pick" })), false);
  assert.equal(q.eligible(article({ held: true })), false);
  assert.equal(q.eligible(article({ kind: "tip", text: "Short tip.\n\nhttps://carlosandmunoz.com/" + "x".repeat(400) + "\n\n#SEO #QA" })), false);
});

test("posts whose hub day came in the last week are due, newest first", () => {
  const list = ["2026-11-03", "2026-11-02", "2026-10-30", "2026-10-25", "2026-11-01"].map((date, i) => article({ id: "b/" + i, date }));
  assert.deepEqual(q.due(list, NOW).map((a) => a.date), ["2026-11-02", "2026-11-01", "2026-10-30"]);
});

test("tags are the first four topic hashtags dev.to accepts, else qa and webdev", () => {
  assert.deepEqual(q.tags(TEXT), ["structureddata", "seo", "geo", "qa"]);
  assert.deepEqual(q.tags("#QAlab #A11y"), ["a11y", "qa", "webdev"]);
});

test("the article is the hub text in markdown: links tagged for dev.to, card after the first paragraph, footer in its language", () => {
  const md = q.markdown(article());
  const parts = md.split("\n\n");
  assert.match(parts[0], /^Every page has a title.*the &lt;head&gt; of each page/);
  assert.equal(parts[1], "![Card  score  68](https://carlosandmunoz.com/media/social-posts/auto-1/feed/01-u-a-com.jpg)");
  assert.match(md, /The full report: <https:\/\/carlosandmunoz\.com\/qa-review\.html\?live=u-a-com&utm_source=devto&utm_medium=social>/);
  assert.doesNotMatch(md, /#SEO|utm_source=linkedin/);
  assert.match(md, /\*First published on the \[QA-lab URL Review social hub\]\(https:\/\/carlosandmunoz\.com\/social\/auto-1\/01-u-a-com\.html\?utm_source=devto&utm_medium=social&utm_campaign=auto-1\)\.\*\n$/);
  const pt = q.markdown(article({ lang: "pt" }));
  assert.match(pt, /\*Publicado primeiro no \[hub social do QA-lab URL Review\]/);
  assert.match(pt, /<https:\/\/carlosandmunoz\.com\/qa-review-pt\.html\?live=u-a-com&utm_source=devto/);
  const body = q.payload(article());
  assert.equal(body.canonical_url, "https://carlosandmunoz.com/social/auto-1/01-u-a-com.html");
  assert.equal(body.published, true);
  assert.equal(body.main_image, "https://carlosandmunoz.com/media/social-posts/auto-1/feed/01-u-a-com.jpg");
});

test("each face's key comes from its own secret", () => {
  const env = { DEVTO_API_KEY: "en-key", DEVTO_API_KEY_ES: "es-key" };
  assert.equal(route.faceEnv("en", env).DEVTO_API_KEY, "en-key");
  assert.equal(route.faceEnv("es", env).DEVTO_API_KEY, "es-key");
  assert.equal(route.faceEnv("en", env).DEVTO_API_KEY_ES, undefined);
  assert.equal(route.faceEnv("es", { DEVTO_API_KEY: "en-key" }).DEVTO_API_KEY, undefined);
  assert.equal(route.accountFace("dev.to/qaurlreview"), "es");
});

test("the client logs in with the api-key header and posts the article wrapped as dev.to expects", async () => {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, init });
    const json = url.endsWith("/users/me") ? { username: "qalaburlreview" } : { id: 7, url: "https://dev.to/qalaburlreview/a-1" };
    return { ok: true, status: 200, json: async () => json };
  };
  const client = q.devto({ DEVTO_API_KEY: "k" }, fetchImpl);
  assert.equal(client.ready, true);
  assert.equal(q.devto({}).ready, false);
  assert.equal(await client.login(), "dev.to/qalaburlreview");
  assert.deepEqual(await client.post({ title: "t" }), { id: 7, url: "https://dev.to/qalaburlreview/a-1" });
  assert.equal(calls[0].init.headers["api-key"], "k");
  assert.deepEqual(JSON.parse(calls[1].init.body), { article: { title: "t" } });
});

function fakeClient(recent = []) {
  const posted = [];
  return { posted, profile: "dev.to/qalaburlreview", recent: async () => recent, post: async (body) => { posted.push(body); return { id: posted.length, url: "https://dev.to/x/" + posted.length }; } };
}
const gate = async () => ({ why: null });

test("a run posts one article a day per face, newest first, and records it", async () => {
  const book = ledger.empty();
  const client = fakeClient();
  const list = [article({ key: "b/01", id: "b/01", slug: "01", date: "2026-11-01" }), article({ key: "b/02", id: "b/02", slug: "02", date: "2026-11-02" })];
  const c = await q.run("en", client, list, book, { live: true, now: NOW, gate });
  assert.deepEqual([c.posted, c.waiting], [1, 1]);
  assert.equal(client.posted[0].canonical_url, "https://carlosandmunoz.com/social/auto-1/02.html");
  assert.equal(book.posts["b/02"][0].result, "sent");
  const again = await q.run("en", client, list, book, { live: true, now: NOW + 3600e3, gate });
  assert.deepEqual([again.posted, client.posted.length], [0, 1]);
});

test("a post the account or the other face already has is not posted again; a hub page that is not up is held", async () => {
  const book = ledger.empty();
  ledger.record(book, "b/01", { channel: "devto", profile: "dev.to/qaurlreview", result: "sent", at: "2026-10-31T15:00:00.000Z" });
  const client = fakeClient([{ id: 9, url: "https://dev.to/x/9", canonical: "https://carlosandmunoz.com/social/auto-1/02-de.html", body: "", at: "2026-10-30T15:00:00.000Z" }]);
  const list = [
    article({ key: "b/01", id: "b/01", slug: "01" }),
    article({ key: "b/02", id: "b/02", slug: "02", urls: ["https://carlosandmunoz.com/social/auto-1/02.html", "https://carlosandmunoz.com/social/auto-1/02-de.html"] }),
    article({ key: "b/03", id: "b/03", slug: "03", date: "2026-11-01" })
  ];
  const held = async () => ({ why: "not on the hub" });
  const c = await q.run("en", client, list, book, { live: true, now: NOW, gate: held });
  assert.deepEqual([c.posted, c.already, c.held], [0, 1, 1]);
  assert.equal(book.posts["b/02"][0].url, "https://dev.to/x/9");
  assert.equal(book.posts["b/03"][0].result, "failed");
  assert.equal(client.posted.length, 0);
});

test("hub feeds are read once per post id across languages", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "devto-"));
  fs.mkdirSync(path.join(root, "assets/social"), { recursive: true });
  fs.writeFileSync(path.join(root, "assets/social/feed.json"), JSON.stringify({ posts: [feedPost("b/01"), feedPost("evergreen/es/01", { lang: "es" })] }));
  fs.writeFileSync(path.join(root, "assets/social/feed-es.json"), JSON.stringify({ posts: [feedPost("b/01-es", { lang: "es" }), feedPost("evergreen/es/01", { lang: "es" })] }));
  assert.deepEqual(q.feedPosts(root).map((p) => p.id), ["b/01", "evergreen/es/01", "b/01-es"]);
});
