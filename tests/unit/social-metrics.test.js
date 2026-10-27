const test = require("node:test");
const assert = require("node:assert/strict");
const metrics = require("../../scripts/social-metrics");

test("Buffer's metrics become the hub's four counts, with reach for missing impressions and one count for likes and reactions", () => {
  assert.deepEqual(metrics.fromBuffer([
    { type: "reach", value: 120 }, { type: "views", value: 88.4 }, { type: "likes", value: 3 }, { type: "reactions", value: 5 },
    { type: "comments", value: 0 }, { type: "shares", value: 9 }
  ]), { impressions: 120, views: 88, likes: 5 });
  assert.deepEqual(metrics.fromBuffer([{ type: "impressions", value: 40 }, { type: "reach", value: 70 }]), { impressions: 40 });
  assert.deepEqual(metrics.fromBuffer(null), {});
});

test("only sent ledger entries are asked about", () => {
  const book = { posts: { "a/1": [{ channel: "x", id: "b1", result: "sent" }, { channel: "tiktok", id: "b2", result: "queued" }], "a/2": [{ channel: "facebook", id: "f1", result: "sent" }] } };
  assert.deepEqual(metrics.sentEntries(book), [{ post: "a/1", channel: "x", id: "b1" }, { post: "a/2", channel: "facebook", id: "f1" }]);
  assert.deepEqual(metrics.sentEntries(book, ["facebook"]), [{ post: "a/2", channel: "facebook", id: "f1" }]);
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

test("Facebook takes reactions and comments from the post, and views from whichever insight the Page still answers", async () => {
  const urls = [];
  const request = async (url) => {
    urls.push(url);
    const json = url.includes("/insights?") ? (url.includes("metric=post_media_view") ? { error: { message: "invalid metric" } } : url.includes("metric=post_impressions") ? { data: [{ values: [{ value: 410 }] }] } : { data: [] })
      : { reactions: { summary: { total_count: 7 } }, comments: { summary: { total_count: 1 } } };
    return { ok: !json.error, status: json.error ? 400 : 200, json: async () => json };
  };
  const found = await metrics.facebookNumbers([{ post: "a/1", channel: "facebook", id: "p_1" }], "tok", request);
  assert.deepEqual(found[0].numbers, { impressions: 410, likes: 7, comments: 1 });
  assert.ok(urls.every((url) => url.includes("access_token=tok")));
});

test("fresh numbers replace a network's old ones and leave networks not asked this run alone", () => {
  const previous = { posts: { "a/1": { x: { views: 1 }, facebook: { likes: 4 } }, "a/2": { x: { views: 9 } } } };
  const next = metrics.merge(previous, [{ post: "a/1", channel: "x", numbers: { views: 5 } }, { post: "a/2", channel: "x", numbers: {} }, { post: "a/0", channel: "tiktok", numbers: { likes: 2 } }], "2026-10-26T00:00:00.000Z");
  assert.deepEqual(next, { version: 1, updatedAt: "2026-10-26T00:00:00.000Z", posts: { "a/0": { tiktok: { likes: 2 } }, "a/1": { x: { views: 5 }, facebook: { likes: 4 } } } });
  assert.deepEqual(previous.posts["a/1"].x, { views: 1 });
});
