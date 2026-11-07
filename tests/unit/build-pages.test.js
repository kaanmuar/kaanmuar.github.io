const test = require("node:test");
const assert = require("node:assert/strict");
const { artifactFiles } = require("../../scripts/build-pages");

test("the Pages artifact includes hub files the rebuild wrote but has not committed", () => {
  const tracked = ["index.html", "social/pick/a.html", "scripts/build-pages.js", "media/secret.csv", "media/calendar.csv"];
  const untracked = [
    "social/pick/ai-search-measurement-needs-to-move-beyond-brand-mentions-es.html",
    "assets/social/thumbs/a.webp",
    "sitemap-social.xml",
    "qa-review-social-es.html",
    "assets/social/feed-es.json",
    "notes/draft.html",
    "scratch.html",
    "assets/social/edits.json",
    "social/pick/a-es.html.bak",
  ];
  assert.deepEqual(artifactFiles(tracked, untracked), [
    "index.html",
    "social/pick/a.html",
    "media/calendar.csv",
    "social/pick/ai-search-measurement-needs-to-move-beyond-brand-mentions-es.html",
    "assets/social/thumbs/a.webp",
    "sitemap-social.xml",
    "qa-review-social-es.html",
    "assets/social/feed-es.json",
  ]);
});

test("a hub file already tracked is not listed twice", () => {
  assert.deepEqual(artifactFiles(["social/pick/a-es.html"], ["social/pick/a-es.html"]), ["social/pick/a-es.html"]);
});
