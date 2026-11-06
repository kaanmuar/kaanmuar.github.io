const test = require("node:test");
const assert = require("node:assert/strict");
const c = require("../../scripts/threads-compose");
const compare = require("../../media/social-posts/compare-2026-11/captions.json");

const base = { text: "Berlin 86, Vienna 85.\n\nRead your own scores.\n\nhttps://carlosandmunoz.com/social/b/s.html", url: "https://carlosandmunoz.com/card.jpg", alt: "Card", lang: "es" };
const uses = (plans) => plans.map((p) => p.uses.join("+"));

test("the topic is the first hashtag but the brand's, its words spaced, without periods or ampersands", () => {
  assert.equal(c.topicOf("Lesson.\n#QAlab #WebPerformance #CLS"), "Web Performance");
  assert.equal(c.topicOf("#GEO #QAlab"), "GEO");
  assert.equal(c.topicOf("#QAlab only"), "");
  assert.ok([...c.topicOf("#" + "A".repeat(80))].length <= 50);
  assert.equal(c.topicOf("No tags here", "Perf"), "Web Performance");
  assert.equal(c.topicOf("No tags here", "Requested"), "Web Quality");
});

test("Threads text drops the hashtag lines and keeps the rest", () => {
  assert.equal(c.withoutHashtags("Title\n\nBody #inline stays\n\nhttps://x.y/z\n#GEO #QAlab"), "Title\n\nBody #inline stays\n\nhttps://x.y/z");
});

test("every compare quiz title gives a two-option poll in Spanish and Portuguese", () => {
  const quizzes = Object.values(compare).filter((cap) => cap.kind === "quiz");
  assert.ok(quizzes.length >= 5);
  for (const cap of quizzes) for (const lang of ["es", "pt"]) {
    const poll = c.pollOf(cap.i18n[lang].title);
    assert.ok(poll, cap.i18n[lang].title);
    for (const option of [poll.option_a, poll.option_b]) assert.ok([...option].length >= 1 && [...option].length <= 25, option);
  }
  assert.deepEqual(c.pollOf("Berlín o Viena: ¿qué portal?"), { option_a: "Berlín", option_b: "Viena" });
  assert.deepEqual(c.pollOf("Metro de Medellín o de Bogotá: ¿qué sitio?"), { option_a: "Metro de Medellín", option_b: "Metro de Bogotá" });
  assert.equal(c.pollOf("No question here"), null);
});

test("a quiz posts as a text poll with its topic, then falls back to the card", () => {
  const cap = compare["01-quiz-berlin-vienna"];
  const plans = c.plans(Object.assign({}, base, { cap, topic: "Web Quality" }));
  assert.deepEqual(uses(plans), ["poll+topic", "image+topic", "image"]);
  assert.equal(plans[0].params.media_type, "TEXT");
  assert.deepEqual(JSON.parse(plans[0].params.poll_attachment), { option_a: "Berlín", option_b: "Viena" });
  assert.equal(plans[0].params.topic_tag, "Web Quality");
  assert.equal(plans.at(-1).params.media_type, "IMAGE");
});

test("an answer quotes its quiz with the scores line behind a spoiler", () => {
  const [first] = c.plans(Object.assign({}, base, { cap: { kind: "compare" }, quote: "1789" }));
  assert.equal(first.params.quote_post_id, "1789");
  assert.deepEqual(JSON.parse(first.params.text_entities), [{ entity_type: "SPOILER", offset: 0, length: "Berlin 86, Vienna 85.".length }]);
  assert.deepEqual(first.uses, ["image", "quote", "spoiler"]);
});

test("a clip in the caption's language makes a carousel of card and clip; another language keeps the card", () => {
  const clip = { url: "https://github.com/o/r/releases/download/b/s.mp4", lang: "es" };
  const plans = c.plans(Object.assign({}, base, { topic: "GEO", clip }));
  assert.deepEqual(uses(plans), ["carousel+video+topic", "image+topic", "image"]);
  assert.equal(plans[0].params.media_type, "CAROUSEL");
  assert.deepEqual(plans[0].items.map((i) => [i.media_type, i.is_carousel_item]), [["IMAGE", "true"], ["VIDEO", "true"]]);
  assert.equal(plans[0].items[1].video_url, clip.url);
  assert.deepEqual(uses(c.plans(Object.assign({}, base, { topic: "GEO", clip: Object.assign({}, clip, { lang: "en" }) }))), ["image+topic", "image"]);
});

test("the digest posts as text with its long caption attached and linked to the hub", () => {
  const [first] = c.plans(Object.assign({}, base, { cap: { kind: "news" }, long: "x".repeat(12000), hub: "https://carlosandmunoz.com/social/d/01.html" }));
  assert.equal(first.params.media_type, "TEXT");
  const attachment = JSON.parse(first.params.text_attachment);
  assert.equal(attachment.plaintext.length, 10000);
  assert.equal(attachment.link_attachment_url, "https://carlosandmunoz.com/social/d/01.html");
});

test("a post with nothing extra has the single plain card plan", () => {
  assert.deepEqual(uses(c.plans(base)), ["image"]);
});
