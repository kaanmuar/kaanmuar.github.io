const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const { inputsFor } = require("../../scripts/buffer-queue");

const ROOT = path.resolve(__dirname, "../..");
const captions = (batch) => JSON.parse(fs.readFileSync(path.join(ROOT, "media/social-posts", batch, "captions.json"), "utf8"));
const xSize = (text) => [...text.replace(/(?:https?:\/\/)?(?:[a-z0-9-]+\.)+[a-z]{2,}(?:\/\S*)?/gi, "x".repeat(23))].length;
const make = (service, batch, slug, cap, face = "en") => inputsFor({ id: "c", service, face }, slug, cap, "https://site/media/social-posts/" + batch, "https://clips", {}, batch);
const thread = (input) => input.metadata && input.metadata.twitter && input.metadata.twitter.thread;

test("a Buffer Threads channel takes nothing: open-social-queue.js posts Threads (#2720)", () => {
  const cap = captions("evergreen-2026-11")["07-pre-release"];
  assert.deepEqual(make("threads", "evergreen-2026-11", "07-pre-release", cap), []);
});

test("the digest posts on X as a thread: the card, then one reply per pick with its source (#2708)", () => {
  const cap = captions("digest-2026-10-30")["01-this-week"];
  const [{ input }] = make("twitter", "digest-2026-10-30", "01-this-week", cap);
  const items = thread(input);
  assert.equal(items.length, 6);
  assert.equal(items[0].text, input.text);
  assert.deepEqual(items[0].assets, input.assets);
  assert.match(items[1].text, /^1\. W3C maps the web for AI agents\n\n[\s\S]+\n\nhttps:\/\/www\.w3\.org\/news\/\S+$/);
  items.slice(1).forEach((item, i) => {
    assert.ok(item.text.startsWith(i + 1 + ". "), item.text);
    assert.ok(xSize(item.text) <= 280, item.text);
    assert.deepEqual(item.assets, []);
  });
});

test("an evergreen checklist threads its steps on X; a step the post already says adds no reply (#2708)", () => {
  const cap = captions("evergreen-2026-11");
  const [{ input: list }] = make("twitter", "evergreen-2026-11", "07-pre-release", cap["07-pre-release"]);
  const replies = thread(list).slice(1).map((item) => item.text);
  assert.ok(replies.length >= 2);
  replies.forEach((reply) => assert.ok(xSize(reply) <= 280, reply));
  assert.equal(replies.join("\n"), cap["07-pre-release"].steps.map((step, i) => i + 1 + ". " + step).join("\n"));
  const [{ input: whole }] = make("twitter", "evergreen-2026-11", "01-ttfb-curl", cap["01-ttfb-curl"]);
  assert.equal(whole.metadata, undefined);
  const [{ input: cut }] = make("twitter", "evergreen-2026-11", "08-googlebot", cap["08-googlebot"]);
  assert.deepEqual(thread(cut).slice(1).map((item) => item.text), cap["08-googlebot"].steps);
});

test("a translated X post carries no English steps, and a compare quiz stays one post", () => {
  const cap = captions("evergreen-2026-11")["07-pre-release"];
  const es = Object.assign({}, cap, { lang: "es" });
  const [{ input }] = make("twitter", "evergreen-2026-11", "07-pre-release", es, "es");
  assert.ok(input.text.startsWith(cap.i18n.es.x.split("\n")[0]), input.text);
  assert.equal(input.metadata, undefined);
  const quiz = captions("compare-2026-11")["01-quiz-berlin-vienna"];
  assert.equal(make("twitter", "compare-2026-11", "01-quiz-berlin-vienna", quiz)[0].input.metadata, undefined);
});

test("YouTube files each track in its category; LinkedIn posts the feed card until the batch renders a document", () => {
  const category = (kind) => make("youtube", "b", "s", { kind, youtube: "Yt.", youtubeTitle: "T" })[0].input.metadata.youtube.categoryId;
  assert.deepEqual(["trick", "myth", "term", "advice", "skit", "news", "quiz", undefined].map(category), ["27", "27", "27", "27", "23", "28", "28", "28"]);
  const [{ input }] = make("linkedin", "evergreen-2026-11", "07-pre-release", captions("evergreen-2026-11")["07-pre-release"]);
  assert.deepEqual(Object.keys(input.assets[0]), ["image"]);
});
