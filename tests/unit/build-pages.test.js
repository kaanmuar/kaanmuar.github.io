const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { extraHubFiles } = require("../../scripts/build-pages");

test("untracked social hub pages are part of the Pages artifact, and sources are not", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "pages-"));
  fs.mkdirSync(path.join(root, "social", "pick"), { recursive: true });
  fs.mkdirSync(path.join(root, "assets", "social", "thumbs"), { recursive: true });
  fs.writeFileSync(path.join(root, "social", "pick", "ai-search-measurement-needs-to-move-beyond-brand-mentions-es.html"), "<html></html>");
  fs.writeFileSync(path.join(root, "social", "pick", "already.html"), "<html></html>");
  fs.writeFileSync(path.join(root, "sitemap-social.xml"), "<urlset></urlset>");
  fs.writeFileSync(path.join(root, "qa-review-social-es.html"), "<html></html>");
  fs.writeFileSync(path.join(root, "assets", "social", "feed-es.json"), "{}\n");
  fs.writeFileSync(path.join(root, "assets", "social", "thumbs", "pick.webp"), "");
  fs.writeFileSync(path.join(root, "assets", "social", "edits.json"), "{}\n");
  fs.writeFileSync(path.join(root, "qa-review.html"), "<html></html>");
  const extra = extraHubFiles(root, ["social/pick/already.html"]);
  assert.deepEqual(extra, [
    "assets/social/feed-es.json",
    "assets/social/thumbs/pick.webp",
    "qa-review-social-es.html",
    "sitemap-social.xml",
    "social/pick/ai-search-measurement-needs-to-move-beyond-brand-mentions-es.html"
  ]);
  fs.rmSync(root, { recursive: true, force: true });
});
