const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("path");

const { bluesky, mastodon } = require("../../scripts/open-social-queue");

const KIT = path.join(__dirname, "..", "..", "media", "brand-kit-2026-10");
const IMAGES = { avatar: path.join(KIT, "instagram", "avatar-1080.jpg"), banner: path.join(KIT, "x", "header-1500x500.jpg") };
const ENV = { BLUESKY_HANDLE: "qalaburlreview.bsky.social", BLUESKY_APP_PASSWORD: "x", MASTODON_URL: "https://mastodon.example", MASTODON_TOKEN: "t" };

function stub(routes) {
  const calls = [];
  const real = global.fetch;
  global.fetch = async (url, init = {}) => {
    calls.push({ url: String(url), init });
    const hit = Object.keys(routes).find((key) => String(url).includes(key));
    const [status, json] = hit ? routes[hit] : [404, { error: "NotFound" }];
    return { ok: status < 400, status, json: async () => json };
  };
  return { calls, restore: () => { global.fetch = real; } };
}

test("Bluesky keeps the name and bio and only swaps the avatar and banner", async () => {
  const { calls, restore } = stub({
    createSession: [200, { did: "did:plc:q", handle: ENV.BLUESKY_HANDLE, accessJwt: "jwt" }],
    getRecord: [200, { cid: "cid1", value: { $type: "app.bsky.actor.profile", displayName: "QA-lab URL Review", description: "One public URL in." } }],
    uploadBlob: [200, { blob: { ref: "b" } }],
    putRecord: [200, { uri: "at://x", cid: "cid2" }]
  });
  try {
    const client = bluesky(ENV);
    await client.login();
    assert.equal(await client.profile(IMAGES), "https://bsky.app/profile/" + ENV.BLUESKY_HANDLE);
    const put = JSON.parse(calls.find((c) => c.url.includes("putRecord")).init.body);
    assert.equal(put.swapRecord, "cid1");
    assert.equal(put.record.displayName, "QA-lab URL Review");
    assert.equal(put.record.description, "One public URL in.");
    assert.deepEqual(put.record.avatar, { ref: "b" });
    assert.deepEqual(put.record.banner, { ref: "b" });
  } finally { restore(); }
});

test("Bluesky stops instead of writing a blank profile when the current one cannot be read", async () => {
  const { calls, restore } = stub({
    createSession: [200, { did: "did:plc:q", handle: ENV.BLUESKY_HANDLE, accessJwt: "jwt" }],
    getRecord: [500, { error: "InternalServerError", message: "upstream failure" }]
  });
  try {
    const client = bluesky(ENV);
    await client.login();
    await assert.rejects(client.profile(IMAGES), /upstream failure/);
    assert.ok(!calls.some((c) => c.url.includes("putRecord")));
  } finally { restore(); }
});

test("Mastodon sends only the avatar and header", async () => {
  const { calls, restore } = stub({ update_credentials: [200, { url: "https://mastodon.example/@qalaburlreview" }] });
  try {
    assert.equal(await mastodon(ENV).profile(IMAGES), "https://mastodon.example/@qalaburlreview");
    const form = calls[0].init.body;
    assert.equal(calls[0].init.method, "PATCH");
    assert.deepEqual([...form.keys()].sort(), ["avatar", "header"]);
  } finally { restore(); }
});
