const test = require("node:test");
const assert = require("node:assert/strict");
const { selectPagesFiles } = require("../../scripts/build-pages");

test("the Pages artifact keeps a hub page the rebuild wrote but the pull request did not commit", () => {
  const tracked = ["index.html", "qa-review-social-es.html", "social/pick/ai-search.html", "sitemap-social.xml"];
  const untracked = [
    "social/pick/ai-search-es.html",
    "assets/social/thumbs/ai-search-es.webp",
    "scripts/build-pages.js",
    "functions/index.js",
    "notes.md"
  ];
  const files = selectPagesFiles(tracked, untracked);
  assert.ok(files.includes("social/pick/ai-search-es.html"));
  assert.ok(files.includes("assets/social/thumbs/ai-search-es.webp"));
  assert.equal(files.includes("scripts/build-pages.js"), false);
  assert.equal(files.includes("functions/index.js"), false);
  assert.equal(files.includes("notes.md"), false);
  assert.equal(files.filter((file) => file === "qa-review-social-es.html").length, 1);
});

test("an untracked file outside the hub stays out even when it sits in a published directory", () => {
  const files = selectPagesFiles(["css/site-look.css"], ["css/scratch.css", "assets/social/edits.json", "media/social-posts/x/captions.json"]);
  assert.deepEqual(files, ["css/site-look.css"]);
});
