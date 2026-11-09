const test = require("node:test");
const assert = require("node:assert/strict");
const metrics = require("../../scripts/social-metrics");

test("Buffer's metrics become the hub's counts, with reach for missing impressions and one count for likes and reactions", () => {
  assert.deepEqual(metrics.fromBuffer([
    { type: "reach", value: 120 }, { type: "views", value: 88.4 }, { type: "likes", value: 3 }, { type: "reactions", value: 5 },
    { type: "comments", value: 0 }, { type: "shares", value: 9 }
  ]), { impressions: 120, views: 88, likes: 5, shares: 9 });
  assert.deepEqual(metrics.fromBuffer([{ type: "impressions", value: 40 }, { type: "reach", value: 70 }]), { impressions: 40 });
  assert.deepEqual(metrics.fromBuffer(null), {});
});

test("only sent ledger entries are asked about", () => {
  const book = { posts: { "a/1": [{ channel: "x", id: "b1", result: "sent" }, { channel: "tiktok", id: "b2", result: "queued" }], "a/2": [{ channel: "facebook", id: "f1", result: "sent" }] } };
  assert.deepEqual(metrics.sentEntries(book), [{ post: "a/1", channel: "x", id: "b1", url: "" }, { post: "a/2", channel: "facebook", id: "f1", url: "" }]);
  assert.deepEqual(metrics.sentEntries(book, ["facebook"]), [{ post: "a/2", channel: "facebook", id: "f1", url: "" }]);
});

test("Buffer is asked in aliased chunks, and a chunk with a deleted post is asked again one post at a time", async () => {
  const queries = [];
  const gql = async (query) => {
    queries.push(query);
    if (query.includes("\"gone\"")) throw new Error("Buffer 200: post not found");
    const out = {};
    [...query.matchAll(/(p\d+): post\(input: \{ id: "([^"]+)" \}\)/g)].forEach(([, alias, id]) => { out[alias] = { metrics: [{ type: "views", value: id.length }] }; });
    return out;
  };
  const found = await metrics.bufferNumbers([{ post: "a/1", channel: "x", id: "abc" }, { post: "a/2", channel: "x", id: "gone" }, { post: "a/3", channel: "tiktok", id: "abcdef" }], gql);
  assert.equal(queries.length, 4);
  assert.deepEqual(found.map((entry) => [entry.post, entry.numbers]), [["a/1", { views: 3 }], ["a/3", { views: 6 }]]);
  const spent = Object.assign(new Error("limit"), { spent: true });
  await assert.rejects(metrics.bufferNumbers([{ post: "a/1", channel: "x", id: "abc" }], async () => { throw spent; }), /limit/);
});

const graphReply = (json) => ({ ok: !json.error, status: json.error ? 400 : 200, json: async () => json });
const lifetime = (values) => ({ data: Object.entries(values).map(([name, value]) => ({ name, period: "lifetime", values: [{ value }] })) });

test("Facebook takes reactions and comments from the post, and views from its lifetime insights", async () => {
  const urls = [];
  const request = async (url) => {
    urls.push(url);
    return graphReply(url.includes("/insights?") ? lifetime({ post_media_view: 410, post_video_views: 0, post_reactions_by_type_total: { like: 3 } })
      : { reactions: { summary: { total_count: 7 } }, comments: { summary: { total_count: 1 } } });
  };
  const found = await metrics.facebookNumbers([{ post: "a/1", channel: "facebook", id: "p_1" }], "tok", request);
  assert.deepEqual(found[0].numbers, { impressions: 410, likes: 7, comments: 1 });
  assert.ok(urls.every((url) => url.includes("access_token=tok")));
  assert.ok(urls.some((url) => url.includes("period=lifetime")));
});

test("a post whose reactions are refused still gets its views, and reactions from the insights", async () => {
  const request = async (url) => graphReply(url.includes("/insights?") ? lifetime({ post_media_view: 52, post_reactions_by_type_total: { like: 2, love: 1 } })
    : { error: { message: "(#10) This endpoint requires the 'pages_read_user_content' permission" } });
  const report = {};
  const found = await metrics.facebookNumbers([{ post: "a/1", channel: "facebook", id: "p_1" }], "tok", request, report);
  assert.deepEqual(found[0].numbers, { impressions: 52, likes: 3 });
  assert.deepEqual([report.asked, report.answered, report.insights], [1, 1, 1]);
  assert.match(report.error, /pages_read_user_content/);
});

test("a Page that refuses a post reports how many it answered and had insights, and its first refusal", async () => {
  const request = async (url) => graphReply(url.includes("/gone") ? { error: { message: "(#100) Object does not exist" } } : url.includes("/insights?") ? { data: [] } : { reactions: { summary: { total_count: 2 } } });
  const report = {};
  const found = await metrics.facebookNumbers([{ post: "a/1", channel: "facebook", id: "gone" }, { post: "a/2", channel: "facebook", id: "p_2" }], "tok", request, report);
  assert.deepEqual(found.map((entry) => entry.post), ["a/2"]);
  assert.deepEqual([report.asked, report.answered, report.insights], [2, 1, 0]);
  assert.match(report.error, /Object does not exist/);
  assert.deepEqual(metrics.merge({ posts: {} }, [], "t", { "Facebook Page": report }).pages, { "Facebook Page": report });
});

test("the Telegram member count is read from getChatMemberCount, and a refusal says why without the token", async () => {
  const asked = [];
  const reply = (status, json) => async (url) => { asked.push(url); return { ok: status === 200, status, json: async () => json }; };
  assert.equal(await metrics.telegramMembers("123:abc", "@qalab_live", reply(200, { ok: true, result: 42 })), 42);
  assert.equal(asked[0], "https://api.telegram.org/bot123:abc/getChatMemberCount?chat_id=%40qalab_live");
  await assert.rejects(metrics.telegramMembers("123:abc", "@qalab_live", reply(400, { ok: false, description: "Bad Request: chat not found" })), (error) => /Telegram 400: Bad Request: chat not found/.test(error.message) && !error.message.includes("123:abc"));
  await assert.rejects(metrics.telegramMembers("t", "@c", reply(200, { ok: true, result: "many" })), /no member count/);
});

test("the Telegram history keeps one point a day, and a skipped or failed run keeps the last count and says why", () => {
  const first = metrics.telegramEntry(undefined, { chat: "@qalab_live", members: 10 }, "2026-11-01T15:00:00.000Z");
  assert.deepEqual(first, { chat: "@qalab_live", members: 10, at: "2026-11-01T15:00:00.000Z", history: [{ date: "2026-11-01", members: 10 }] });
  const again = metrics.telegramEntry(first, { chat: "@qalab_live", members: 12 }, "2026-11-01T20:00:00.000Z");
  assert.deepEqual(again.history, [{ date: "2026-11-01", members: 12 }]);
  const next = metrics.telegramEntry(again, { chat: "@qalab_live", members: 15 }, "2026-11-02T15:00:00.000Z");
  assert.deepEqual(next.history.map((p) => p.date + ":" + p.members), ["2026-11-01:12", "2026-11-02:15"]);
  const skipped = metrics.telegramEntry(next, { chat: "", skipped: "no TELEGRAM_BOT_TOKEN secret" }, "2026-11-03T15:00:00.000Z");
  assert.deepEqual([skipped.chat, skipped.members, skipped.at, skipped.history.length, skipped.skipped], ["@qalab_live", 15, "2026-11-02T15:00:00.000Z", 2, "no TELEGRAM_BOT_TOKEN secret"]);
  const failed = metrics.telegramEntry(skipped, { chat: "@qalab_live", error: "Telegram 403: Forbidden" }, "2026-11-04T15:00:00.000Z");
  assert.deepEqual([failed.members, failed.error, failed.skipped], [15, "Telegram 403: Forbidden", undefined]);
  assert.deepEqual(metrics.telegramEntry(undefined, { skipped: "no TELEGRAM_CHANNEL variable" }, "2026-11-04T15:00:00.000Z"), { chat: "", history: [], skipped: "no TELEGRAM_CHANNEL variable" });
  const long = { members: 1, history: Array.from({ length: 405 }, (_, i) => ({ date: new Date(Date.UTC(2025, 0, 1) + i * 86400000).toISOString().slice(0, 10), members: i })) };
  const capped = metrics.telegramEntry(long, { members: 500 }, "2027-01-01T00:00:00.000Z");
  assert.equal(capped.history.length, 400);
  assert.deepEqual(capped.history[399], { date: "2027-01-01", members: 500 });
});

test("channels survive a run that does not touch them, and a new channels entry replaces them", () => {
  const telegram = { chat: "@qalab_live", members: 3, history: [] };
  assert.deepEqual(metrics.merge({ posts: {}, channels: { telegram } }, [], "t").channels, { telegram });
  assert.deepEqual(metrics.merge({ posts: {}, channels: { telegram } }, [], "t", null, { telegram: { members: 4 } }).channels, { telegram: { members: 4 } });
});

test("fresh numbers replace a network's old ones and leave networks not asked this run alone", () => {
  const previous = { posts: { "a/1": { x: { views: 1 }, facebook: { likes: 4 } }, "a/2": { x: { views: 9 } } } };
  const next = metrics.merge(previous, [{ post: "a/1", channel: "x", numbers: { views: 5 } }, { post: "a/2", channel: "x", numbers: {} }, { post: "a/0", channel: "tiktok", numbers: { likes: 2 } }], "2026-10-26T00:00:00.000Z");
  assert.deepEqual(next, { version: 1, updatedAt: "2026-10-26T00:00:00.000Z", posts: { "a/0": { tiktok: { likes: 2 } }, "a/1": { x: { views: 5 }, facebook: { likes: 4 } } } });
  assert.deepEqual(previous.posts["a/1"].x, { views: 1 });
});

test("Bluesky and Mastodon numbers come from their public APIs; reposts and quotes are shares (#2018)", async () => {
  const urls = [];
  const request = async (url) => {
    urls.push(url);
    if (url.startsWith("https://public.api.bsky.app/")) return { ok: true, json: async () => ({ posts: [{ uri: "at://a/1", likeCount: 4, repostCount: 2, quoteCount: 1, replyCount: 0 }] }) };
    if (url === "https://mastodon.social/api/v1/statuses/77") return { ok: true, json: async () => ({ favourites_count: 3, reblogs_count: 1, replies_count: 2 }) };
    return { ok: false, json: async () => ({}) };
  };
  const sky = await metrics.blueskyNumbers([{ post: "a/1", channel: "bluesky", id: "at://a/1" }, { post: "a/2", channel: "bluesky", id: "at://a/2" }], request);
  assert.deepEqual(sky.map((e) => [e.post, e.numbers]), [["a/1", { likes: 4, shares: 3 }]]);
  assert.match(urls[0], /uris=at%3A%2F%2Fa%2F1&uris=at%3A%2F%2Fa%2F2/);
  const toots = await metrics.mastodonNumbers([{ post: "a/1", channel: "mastodon", id: "77", url: "https://mastodon.social/@q/77" }, { post: "a/2", channel: "mastodon", id: "78", url: "https://mastodon.social/@q/78" }, { post: "a/3", channel: "mastodon", id: "79", url: "" }], request);
  assert.deepEqual(toots.map((e) => [e.post, e.numbers]), [["a/1", { likes: 3, shares: 1, comments: 2 }]]);
});
