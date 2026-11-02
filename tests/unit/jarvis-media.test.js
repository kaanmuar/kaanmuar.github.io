// Jarvis > Business media (#2018): every clip's plays, likes, shares and comments per network and per clip.
const test = require("node:test");
const assert = require("node:assert/strict");
const media = require("../../functions/jarvis-media.js");

test("ledgers, the daily numbers and YouTube's views add up per network and per clip", () => {
  const buffer = { posts: {
    "auto-2026-10-21/01-u-uni-edu": [
      { channel: "youtube", result: "sent", at: "2026-10-22T10:00:00Z", url: "https://www.youtube.com/shorts/AAAAAAAA" },
      { channel: "tiktok", result: "sent", at: "2026-10-22T11:00:00Z", url: "https://tiktok.com/@q/video/1" },
      { channel: "x", result: "queued", at: "2026-10-23T11:00:00Z" }
    ],
    "auto-2026-10-22/02-u-shop-co": [{ channel: "linkedin", result: "sent", at: "2026-10-23T10:00:00Z", url: "https://linkedin.com/1" }]
  } };
  const open = { posts: { "auto-2026-10-22/02-u-shop-co": [{ channel: "bluesky", result: "sent", at: "2026-10-23T09:00:00Z", url: "https://bsky.app/1" }] } };
  const metrics = { updatedAt: "2026-11-01T11:00:00Z", posts: {
    "auto-2026-10-21/01-u-uni-edu": { youtube: { views: 30, likes: 1 }, tiktok: { views: 200, likes: 9, shares: 4, comments: 2 } },
    "auto-2026-10-22/02-u-shop-co": { bluesky: { likes: 3, shares: 1 } }
  } };
  const videos = [{ id: "AAAAAAAA", title: "Uni: alt text", views: 95, likes: 5, comments: 1 }, { id: "BBBBBBBB", title: "By hand", views: 12, likes: 0, comments: 0 }];
  const out = media.mediaStats([buffer, null, open], metrics, videos);
  const net = (k) => out.networks.find((n) => n.network === k);
  assert.deepEqual([net("youtube").posts, net("youtube").plays, net("youtube").likes], [2, 107, 5]);
  assert.deepEqual([net("tiktok").plays, net("tiktok").shares, net("tiktok").state], [200, 4, ""]);
  assert.deepEqual([net("linkedin").posts, net("linkedin").measured, net("linkedin").state], [1, 0, "waiting for the first numbers"]);
  assert.equal(net("instagram").state, "no posts yet, no stats yet");
  assert.equal(net("x").posts, 0);
  assert.deepEqual([out.total.clips, out.total.plays], [3, 307]);
  assert.deepEqual(out.clips.map((c) => c.title), ["Uni: alt text", "By hand", "shop-co"]);
  assert.deepEqual(out.clips[0].networks.map((n) => [n.network, n.plays]), [["youtube", 95], ["tiktok", 200]]);
  assert.equal(out.clips[0].total.plays, 295);
  assert.equal(out.updatedAt, "2026-11-01T11:00:00Z");
});

test("YouTube ids come from Shorts and watch links", () => {
  assert.equal(media.youtubeId("https://www.youtube.com/shorts/BZTtWQCzPCM"), "BZTtWQCzPCM");
  assert.equal(media.youtubeId("https://www.youtube.com/watch?v=abc123XYZ"), "abc123XYZ");
  assert.equal(media.youtubeId("https://x.com/1"), "");
});
