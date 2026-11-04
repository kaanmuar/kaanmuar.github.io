const test = require("node:test");
const assert = require("node:assert/strict");
const { withHub } = require("../../scripts/build-pages");

test("the Pages artifact includes hub pages the rebuild wrote that are not committed yet", () => {
  const tracked = ["index.html", "qa-review-social-es.html", "social/pick/post.html"];
  const extras = [
    "social/pick/post-es.html",
    "assets/social/thumbs/post-es.webp",
    "sitemap-social.xml",
    "scripts/build-social-hub.js",
    "social/pick/post.html"
  ];
  assert.deepEqual(withHub(tracked, extras), [
    "index.html",
    "qa-review-social-es.html",
    "social/pick/post.html",
    "social/pick/post-es.html",
    "assets/social/thumbs/post-es.webp",
    "sitemap-social.xml"
  ]);
});
