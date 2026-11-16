const { test } = require("node:test");
const assert = require("node:assert/strict");
const battle = require("../../scripts/battle-formats");
const auditCarousel = require("../../scripts/tips-studio/audit-carousel");
const threads = require("../../scripts/threads-compose");
const studio = require("../../scripts/tips-studio/battle-vs");

test("formats are locked to vs-tool carousel and us-vs-them thread with seo default", () => {
  assert.deepEqual(Object.keys(battle.FORMATS).sort(), ["us-vs-them", "vs-tool"]);
  assert.equal(battle.FORMATS["vs-tool"].defaultRival, "seo");
  assert.equal(battle.FORMATS["us-vs-them"].defaultRival, "seo");
  assert.equal(battle.DEFAULT_RIVAL, "seo");
  assert.equal(battle.THREAD_BEATS, 4);
});

test("seo coverage reads qa-review-vs marks and lists checks only we name", () => {
  const cov = battle.coverage("seo");
  assert.equal(cov.rivalId, "seo");
  assert.match(cov.themName, /Semrush|Ahrefs/);
  assert.ok(cov.weOnly.length >= 3);
  assert.ok(cov.weOnly.every((row) => row.us !== "n" && row.them === "n"));
  assert.ok(cov.rows.every((row) => row.label && row.us && row.them));
});

test("vs-tool carousel is four slides and audit-carousel routes battle tips there", () => {
  const tip = studio.TIPS.find((t) => t.battleFormat === "vs-tool");
  assert.ok(tip);
  const slides = battle.vsToolCarouselSlides(tip);
  assert.equal(slides.length, 4);
  assert.equal(slides[0].counter, "1 / 4");
  assert.equal(slides[3].counter, "4 / 4");
  assert.deepEqual(auditCarousel.auditCarouselSlides(tip).map((s) => s.counter), ["1 / 4", "2 / 4", "3 / 4", "4 / 4"]);
  assert.equal(battle.vsToolCarouselSlides({ battleFormat: "us-vs-them" }), null);
});

test("us-vs-them beats fit X replies and Threads battle-thread plans", () => {
  const tip = studio.TIPS.find((t) => t.battleFormat === "us-vs-them");
  assert.ok(tip);
  assert.equal(tip.steps.length, 4);
  assert.ok(tip.steps.every((step) => step.length > 20 && step.length < 280));
  const cap = { battleFormat: "us-vs-them", kind: "compare", steps: tip.steps, title: tip.title.join(" ") };
  const replies = battle.threadsBattleReplies(cap);
  assert.equal(replies.length, 4);
  assert.equal(replies[0].params.media_type, "TEXT");
  assert.match(replies[0].params.text, /^1\/4 /);

  const plans = threads.plans({
    text: "Us vs them\n\nLesson.",
    url: "https://example.com/card.jpg",
    alt: "Card",
    lang: "en",
    topic: "SEO",
    cap
  });
  assert.ok(plans[0].uses.includes("battle-thread"));
  assert.equal(plans[0].reply.length, 4);
});

test("battle-vs studio exports two pinned compare tips for the batch", () => {
  assert.equal(studio.BATCH, "battle-vs-2026-11");
  assert.equal(studio.KIND, "compare");
  assert.equal(studio.TIPS.length, 2);
  assert.deepEqual(studio.TIPS.map((t) => t.battleFormat).sort(), ["us-vs-them", "vs-tool"]);
  assert.ok(studio.TIPS.every((t) => t.pin && t.date && t.times && t.times.x));
});
