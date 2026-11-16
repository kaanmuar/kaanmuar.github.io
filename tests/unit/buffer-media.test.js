const test = require("node:test");
const assert = require("node:assert");
const { mediaHost } = require("../../scripts/buffer-queue");

test("a scheduled post's media is fetched from the site or a release, or is Buffer's own copy", () => {
  assert.strictEqual(mediaHost("https://carlosandmunoz.com/media/social-posts/runs-100/feed/01-govuk.jpg"), "site");
  assert.strictEqual(mediaHost("https://github.com/kaanmuar/kaanmuar.github.io/releases/download/compare-2026-11/01-a.mp4"), "release");
  assert.strictEqual(mediaHost("https://buffer-media-uploads.s3.amazonaws.com/uploads/x.mp4"), "buffer");
  assert.strictEqual(mediaHost("https://example.com/x.jpg"), "other");
  assert.strictEqual(mediaHost(""), "none");
});
