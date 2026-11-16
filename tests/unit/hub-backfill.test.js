const test = require("node:test");
const assert = require("node:assert");
const { plan, language, title } = require("../../scripts/hub-backfill");

const post = (id, slot, sentAt, text, source, extra) => Object.assign({ id, slot, profile: slot + " (p)", status: "sent", sentAt, text, externalLink: "https://x/" + id, assets: source ? [{ type: "video", source }] : [] }, extra);

test("posts sharing a clip are one hub post with a caption per network, dated by the first send", () => {
  const items = [
    post("b", "linkedin", "2026-10-14T23:06:00Z", "The page speaks back. A public page goes in.", "https://cdn/x.mp4?v=2"),
    post("a", "youtube", "2026-10-14T01:35:00Z", "QA-lab URL Review lee una página pública y la describe de vuelta.", "https://cdn/x.mp4", { metadata: { title: "La página habla #Shorts" } }),
    post("c", "youtube", "2026-10-15T09:00:00Z", "Otra película distinta sobre la página.", "https://cdn/x.mp4"),
    post("d", "x", "2026-10-16T14:15:00Z", "Flaky test, or flaky page? Before blaming the runner, read the page.")
  ];
  const { captions, posts, images } = plan(items);
  const slugs = Object.keys(captions);
  assert.strictEqual(slugs.length, 3);
  const first = captions[slugs[0]];
  assert.strictEqual(first.date, "2026-10-13");
  assert.strictEqual(first.textLang, "es");
  assert.strictEqual(first.youtubeTitle, "La página habla #Shorts");
  assert.ok(first.linkedin.startsWith("The page speaks back"));
  assert.ok(captions[slugs[1]].youtube.startsWith("Otra película"));
  assert.strictEqual(captions[slugs[2]].x, items[3].text);
  assert.deepStrictEqual(images.get(slugs[2]), { text: title(items[3].text) });
  assert.strictEqual(posts.length, 4);
});

test("a rerun adds nothing for posts already in captions.json", () => {
  const items = [post("a", "x", "2026-10-16T14:15:00Z", "Flaky test, or flaky page?")];
  const once = plan(items);
  const twice = plan(items, once.captions);
  assert.deepStrictEqual(twice.captions, once.captions);
  assert.strictEqual(twice.images.size, 0);
  assert.strictEqual(twice.posts[0].slug, once.posts[0].slug);
});

test("language and title", () => {
  assert.strictEqual(language("QA-lab URL Review liest eine öffentliche Seite und beschreibt sie"), "de");
  assert.strictEqual(language("A página já está falando. A maioria dos planos de teste começa"), "pt");
  assert.strictEqual(title("Release day: build green. Smoke passed https://a.b #qa"), "Release day: build green.");
});
