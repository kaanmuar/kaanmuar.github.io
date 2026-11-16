const test = require("node:test");
const assert = require("node:assert/strict");
const hooks = require("../../scripts/social-hooks.js");
const velocity = require("../../scripts/social-reply-velocity.js");
const intel = require("../../scripts/tips-studio/creative-intel.js");
const tags = require("../../scripts/social-tags.js");

test("hook templates pick a stable line per kind and seed (#3559)", () => {
  assert.ok(hooks.kinds().includes("trend"));
  assert.equal(hooks.pick("myth", 1), hooks.pick("myth", 1));
  assert.notEqual(hooks.pick("list", 1), hooks.pick("quiz", 1));
  assert.ok(hooks.titleLines("audit", 3).length >= 1);
});

test("reply velocity scores comments over hours (#3559)", () => {
  assert.ok(velocity.score(4, 2) > velocity.score(4, 24));
  assert.equal(velocity.commentsOf({ linkedin: { comments: 2 }, x: { comments: 1 } }), 3);
  const out = velocity.velocity({
    now: Date.parse("2026-11-16T12:00:00Z"),
    hours: 24,
    limit: 5,
    metrics: { posts: { "batch/a": { linkedin: { comments: 3 } }, "batch/b": { x: { comments: 0 } } } },
    books: [{ posts: {
      "batch/a": [{ result: "sent", at: "2026-11-16T06:00:00Z" }],
      "batch/b": [{ result: "sent", at: "2026-11-15T12:00:00Z" }]
    } }]
  });
  assert.equal(out.hot[0].key, "batch/a");
  assert.ok(out.hot[0].velocity > 0);
});

test("creative-intel ranks winning kinds from feed + metrics (#3558)", () => {
  const feed = { posts: [
    { id: "1", kind: "news", cat: "Field", title: ["This week"], batch: "digest-a", slug: "01", date: "2026-11-14" },
    { id: "2", kind: "tip", cat: "A11y", title: ["Myth"], batch: "tips", slug: "02", date: "2026-11-13", visual: { type: "list" } }
  ] };
  const metrics = { posts: {
    "digest-a/01": { linkedin: { likes: 10, comments: 2, impressions: 200 } },
    "tips/02": { x: { likes: 1 } }
  } };
  const wins = intel.rankWins(feed, metrics);
  assert.equal(wins[0].key, "digest-a/01");
  assert.equal(intel.kindOf(feed.posts[0]), "list");
  const formats = intel.formatBuckets(wins);
  assert.ok(formats.some((f) => f.kind === "list"));
});

test("hitchSkipped lists topic words in text that are not on the post (#3559)", () => {
  const skipped = tags.hitchSkipped("Turn on HSTS and fix the CSP before launch", ["QA"]);
  assert.ok(skipped.includes("Security"));
  assert.deepEqual(tags.hitchSkipped("plain hello", ["QA"]), []);
});
