const test = require("node:test");
const assert = require("node:assert/strict");

process.env.FACEBOOK_PAGE_TOKEN = "t";
process.env.FACEBOOK_UPLOAD_WAIT_MS = "0";
const c = require("../../scripts/facebook-compose");
const fb = require("../../scripts/facebook-queue");

const due = Date.parse("2026-11-20T15:00:00Z");
const base = { caption: "Caption\n\nhttps://carlosandmunoz.com/social/b/s.html", image: "https://carlosandmunoz.com/card.jpg", alt: "Card", due, lang: "es", hub: "https://carlosandmunoz.com/social/b/s.html?utm_source=facebook" };
const uses = (plans) => plans.map((p) => p.uses.join("+"));
const json = (body, status = 200) => ({ ok: status < 400, status, json: async () => body });

test("a clip in the caption's language goes out as a scheduled Reel, then the card", () => {
  const plans = c.plans(Object.assign({}, base, { clip: { url: "https://assets/clip.mp4", lang: "es" } }));
  assert.deepEqual(uses(plans), ["reel", "photo"]);
  assert.equal(plans[0].file, "https://assets/clip.mp4");
  assert.deepEqual(plans[0].params, { description: base.caption, video_state: "SCHEDULED", scheduled_publish_time: String(due / 1000) });
  assert.deepEqual(plans[1].params, { url: base.image, caption: base.caption, alt_text_custom: "Card", published: "false", scheduled_publish_time: String(due / 1000) });
});

test("a clip in another language, a missing clip and a compare quiz post the card", () => {
  assert.deepEqual(uses(c.plans(Object.assign({}, base, { clip: { url: "https://assets/clip.mp4", lang: "en" } }))), ["photo"]);
  assert.deepEqual(uses(c.plans(base)), ["photo"]);
  assert.deepEqual(uses(c.plans(Object.assign({}, base, { cap: { kind: "quiz" }, clip: { url: "https://assets/clip.mp4", lang: "es" } }))), ["photo"]);
});

test("the digest is a link post to its hub page, then the card", () => {
  const plans = c.plans(Object.assign({}, base, { cap: { kind: "news" } }));
  assert.deepEqual(uses(plans), ["link", "photo"]);
  assert.equal(plans[0].edge, "feed");
  assert.deepEqual(plans[0].params, { message: base.caption, link: base.hub, published: "false", scheduled_publish_time: String(due / 1000) });
});

test("posts carry the batch clip in its voiced language and the digest its hub link", async () => {
  const tip = fb.posts("tips-2026-10").find((p) => p.slug === "01-img-size");
  assert.deepEqual(tip.clip, { url: "https://github.com/kaanmuar/kaanmuar.github.io/releases/download/tips-2026-10/01-img-size.mp4", lang: "en" });
  const real = global.fetch;
  global.fetch = async () => ({ ok: false, status: 302, headers: { get: () => "https://release-assets.githubusercontent.com/x?sig=1" } });
  try {
    const plans = await fb.compose(tip, "Caption", due, "en");
    assert.deepEqual(uses(plans), ["reel", "photo"]);
    assert.equal(plans[0].file, "https://release-assets.githubusercontent.com/x?sig=1");
    const digest = fb.posts("digest-2026-10-30").find((p) => p.cap.kind === "news");
    const link = (await fb.compose(digest, "Caption", due, "en"))[0];
    assert.equal(link.params.link, "https://carlosandmunoz.com/social/digest-2026-10-30/" + digest.slug + ".html?utm_source=facebook&utm_medium=social&utm_campaign=digest-2026-10-30");
  } finally {
    global.fetch = real;
  }
});

function stubGraph(handlers) {
  const calls = [];
  const real = global.fetch;
  global.fetch = async (url, opts = {}) => {
    const u = String(url);
    const body = opts.body ? Object.fromEntries(new URLSearchParams(String(opts.body))) : null;
    calls.push({ u, method: opts.method || "GET", body, headers: opts.headers });
    for (const [match, reply] of handlers) if (match(u, opts, body)) return reply(u, body);
    return json({ error: { message: "unexpected " + u } }, 400);
  };
  return { calls, restore: () => { global.fetch = real; } };
}

const reelPlans = () => c.plans(Object.assign({}, base, { clip: { url: "https://assets/clip.mp4", lang: "es" } }));
const start = [(u, o, b) => u.endsWith("/page/video_reels") && b && b.upload_phase === "start", () => json({ video_id: "v1", upload_url: "https://rupload.facebook.com/video-upload/v23.0/v1" })];
const rupload = (ok = true) => [(u) => u.startsWith("https://rupload.facebook.com/video-upload/"), () => json(ok ? { success: true } : { error: { message: "robots.txt" } }, ok ? 200 : 400)];
const fetched = [(u) => u.includes("/v1?") && u.includes("fields=status"), () => json({ status: { video_status: "processing", uploading_phase: { status: "complete" } } })];
const deleted = [(u, o) => o.method === "DELETE", () => json({ success: true })];

test("a Reel starts, uploads the clip by file_url with the Page token and finishes scheduled with the caption", async () => {
  const s = stubGraph([start, rupload(), fetched, [(u, o, b) => b && b.upload_phase === "finish", () => json({ success: true })]]);
  try {
    assert.deepEqual(await fb.publish("page", reelPlans()), { id: "v1", uses: ["reel"] });
    const up = s.calls.find((x) => x.u.startsWith("https://rupload"));
    assert.equal(up.u, "https://rupload.facebook.com/video-upload/v23.0/v1");
    assert.deepEqual(up.headers, { Authorization: "OAuth t", file_url: "https://assets/clip.mp4" });
    const finish = s.calls.find((x) => x.body && x.body.upload_phase === "finish").body;
    assert.deepEqual([finish.video_id, finish.video_state, finish.description, finish.scheduled_publish_time], ["v1", "SCHEDULED", base.caption, String(due / 1000)]);
    assert.ok(!s.calls.some((x) => x.u.includes("/photos")));
  } finally {
    s.restore();
  }
});

test("a refused upload deletes the video and posts the card", async () => {
  const s = stubGraph([start, rupload(false), deleted, [(u) => u.endsWith("/page/photos"), () => json({ id: "ph", post_id: "page_1" })]]);
  try {
    assert.deepEqual(await fb.publish("page", reelPlans()), { id: "page_1", uses: ["photo"] });
    assert.ok(s.calls.some((x) => x.method === "DELETE" && x.u.includes("/v1?")));
  } finally {
    s.restore();
  }
});

test("a refused finish is not retried as the card: the video is deleted and the post fails", async () => {
  const s = stubGraph([start, rupload(), fetched, deleted, [(u, o, b) => b && b.upload_phase === "finish", () => json({ error: { message: "finish refused" } }, 400)]]);
  try {
    await assert.rejects(fb.publish("page", reelPlans()), /finish refused/);
    assert.ok(!s.calls.some((x) => x.u.includes("/photos")));
    assert.ok(s.calls.some((x) => x.method === "DELETE"));
  } finally {
    s.restore();
  }
});

test("a refused link post falls back to the card; a revoked token stops at once", async () => {
  const digest = () => c.plans(Object.assign({}, base, { cap: { kind: "news" } }));
  let s = stubGraph([[(u) => u.endsWith("/page/feed"), () => json({ error: { message: "link refused" } }, 400)], [(u) => u.endsWith("/page/photos"), () => json({ id: "ph", post_id: "page_2" })]]);
  try {
    assert.deepEqual(await fb.publish("page", digest()), { id: "page_2", uses: ["photo"] });
  } finally {
    s.restore();
  }
  s = stubGraph([[(u) => u.endsWith("/page/feed"), () => json({ error: { code: 190, message: "Session has been invalidated" } }, 400)]]);
  try {
    await assert.rejects(fb.publish("page", digest()), /FACEBOOK_PAGE_TOKEN was revoked/);
    assert.equal(s.calls.length, 1);
  } finally {
    s.restore();
  }
});

test("a queued Reel is read back from its video status", async () => {
  assert.equal(fb.isReel({ id: "123" }), true);
  assert.equal(fb.isReel({ id: "page_123" }), false);
  assert.deepEqual(fb.fromReel({ id: "9", status: { video_status: "ready", publishing_phase: { status: "complete" } } }), { result: "sent", url: "https://www.facebook.com/reel/9" });
  assert.equal(fb.fromReel({ id: "9", status: { video_status: "processing", publishing_phase: { status: "not_started" } } }), null);
  assert.equal(fb.fromReel({ id: "9", status: { video_status: "error" } }).result, "failed");
  const s = stubGraph([[(u) => u.includes("/9?") && u.includes("fields=status"), () => json({ status: { publishing_phase: { status: "complete" } } })]]);
  try {
    assert.deepEqual(await fb.lookup({ id: "9" }, []), { result: "sent", url: "https://www.facebook.com/reel/9" });
  } finally {
    s.restore();
  }
});
