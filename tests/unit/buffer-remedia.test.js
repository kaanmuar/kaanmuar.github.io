const test = require("node:test");
const assert = require("node:assert");
const { plan, withUrl } = require("../../scripts/buffer-remedia");

const now = Date.parse("2026-10-27T12:00:00Z");
const later = "2026-11-02T15:00:00.000Z";
const copy = (ext) => "https://buffer-media-uploads.s3.amazonaws.com/org/uploads/x." + ext;
const voiced = [
  { batch: "runs-100", slug: "02-mozilla", lang: "es", tiktok: "Mozilla: 85 idiomas, y sin sitemap. #SEO", youtubeTitle: "Mozilla: 85 idiomas, y sin sitemap. #Shorts" },
  { batch: "runs-100", slug: "03-mdn", lang: "pt", tiktok: "MDN Web Docs: 95. #SEO", youtubeTitle: "MDN Web Docs: 95. E nada de JSON-LD. #Shorts" }
];
const index = new Map([["text The LinkedIn caption", "runs-100/01-wikipedia"], ["text Another batch", "auto-1/01-a"]]);
const opts = { batches: ["runs-100"], index, voiced, now, site: "https://site.test", repo: "o/r" };

test("Buffer's own copies point at the batch's site image or release clip; addresses it fetches are left alone", () => {
  const rows = plan([
    { id: "li", channelService: "linkedin", dueAt: later, text: "The LinkedIn caption", assets: [{ type: "image", source: "https://buffer-pictures.s3.amazonaws.com/a.jpg" }] },
    { id: "tt", channelService: "tiktok", dueAt: later, text: "Mozilla: 85 idiomas, y sin sitemap. #SEO https://site.test/social/x", assets: [{ type: "video", source: copy("mp4") }] },
    { id: "yt", channelService: "youtube", dueAt: later, text: "x", metadata: { title: "MDN Web Docs: 95. E nada de JSON-LD. #Shorts" }, assets: [{ type: "video", source: copy("mp4") }] },
    { id: "site", channelService: "linkedin", dueAt: later, text: "The LinkedIn caption", assets: [{ type: "image", source: "https://carlosandmunoz.com/media/social-posts/runs-100/feed/01-wikipedia.jpg" }] },
    { id: "rel", channelService: "tiktok", dueAt: later, text: "y", assets: [{ type: "video", source: "https://github.com/o/r/releases/download/b/01-a.mp4" }] }
  ], opts);
  assert.deepStrictEqual(rows.map((r) => [r.post.id, r.name, r.url]), [
    ["li", "runs-100/01-wikipedia", "https://site.test/media/social-posts/runs-100/feed/01-wikipedia.jpg"],
    ["tt", "runs-100/02-mozilla", "https://github.com/o/r/releases/download/runs-100/02-mozilla.mp4"],
    ["yt", "runs-100/03-mdn", "https://github.com/o/r/releases/download/runs-100/03-mdn.mp4"]
  ]);
});

test("a copy matching no post in the batches, a clip whose language is unknown, or one due soon is left as it is", () => {
  const rows = plan([
    { id: "other", channelService: "linkedin", dueAt: later, text: "Another batch", assets: [{ type: "image", source: copy("jpg") }] },
    { id: "english", channelService: "tiktok", dueAt: later, text: "Mozilla: 85 languages, no sitemap.", assets: [{ type: "video", source: copy("mp4") }] },
    { id: "soon", channelService: "linkedin", dueAt: "2026-10-27T12:10:00.000Z", text: "The LinkedIn caption", assets: [{ type: "image", source: copy("jpg") }] }
  ], opts);
  assert.deepStrictEqual(rows.map((r) => [r.post.id, r.url, r.skip]), [
    ["other", undefined, "matches no post in runs-100"],
    ["english", undefined, "no voiced clip in runs-100 matches its text"],
    ["soon", undefined, "due within 30 minutes"]
  ]);
});

test("only the asset's address changes in the edit", () => {
  const input = { id: "p", text: "t", dueAt: later, assets: [{ video: { url: copy("mp4"), metadata: { thumbnailOffset: 0, title: "T" } } }], metadata: { youtube: { title: "T" } } };
  assert.deepStrictEqual(withUrl(input, "https://new/a.mp4"), Object.assign({}, input, { assets: [{ video: { url: "https://new/a.mp4", metadata: { thumbnailOffset: 0, title: "T" } } }] }));
});
