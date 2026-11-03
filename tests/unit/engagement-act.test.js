"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const E = require("../../functions/engagement.js");
const A = require("../../functions/engagement-act.js");
const J = require("../../functions/jarvis-engagement.js");
const { fakeDb } = require("./fixtures/fake-firestore.js");

const NOW = Date.parse("2026-11-01T18:00:00Z");
const HOUR = 3600000;
const ago = (h) => new Date(NOW - h * HOUR).toISOString();
const REDIRECT = "https://us-central1-carlosm-interactive-cv.cloudfunctions.net/booking/callback";
const KEYS = { clientId: "cid.apps.googleusercontent.com", secret: "shh" };

/** The three networks and Google's token endpoint; calls lists every request, fail makes a host answer 401. */
function networks(fail) {
  const calls = [];
  const fetch = async (url, opts) => {
    const o = opts || {};
    const body = o.body ? (String(o.headers["Content-Type"]).includes("json") ? JSON.parse(o.body) : Object.fromEntries(new URLSearchParams(o.body))) : null;
    calls.push({ url, method: o.method, body, auth: (o.headers || {}).Authorization || "" });
    const reply = (status, data) => ({ ok: status < 300, status, text: async () => (data === undefined ? "" : JSON.stringify(data)) });
    if (fail && url.includes(fail)) return reply(401, { error: "The access token is invalid" });
    if (url.endsWith("com.atproto.server.createSession")) return body.password === "abcd-efgh-ijkl-mnop" ? reply(200, { accessJwt: "jwt", did: "did:plc:us", handle: "qalaburlreview.bsky.social" }) : reply(401, { message: "Invalid identifier or password" });
    if (url.includes("app.bsky.feed.getPosts")) return reply(200, { posts: [{ uri: "at://did:plc:ana/app.bsky.feed.post/p1", cid: "cid-p1", record: { reply: { root: { uri: "at://did:plc:bo/app.bsky.feed.post/root", cid: "cid-root" } } } }] });
    if (url.endsWith("com.atproto.repo.createRecord")) return reply(200, { uri: "at://did:plc:us/" + body.collection + "/rk" + calls.length, cid: "c" });
    if (url.includes("/api/v2/search")) return reply(200, { statuses: [{ id: "55", url: "https://mastodon.social/@ana@m.s/55", account: { id: "9", acct: "ana@m.s" } }] });
    if (/\/api\/v1\/statuses\/55\/(favourite|reblog)$/.test(url) || url.endsWith("/api/v1/accounts/9/follow")) return reply(200, {});
    if (url.endsWith("/api/v1/statuses")) return reply(200, { url: "https://mastodon.social/@qalaburlreview/77", uri: "https://mastodon.social/users/qalaburlreview/statuses/77" });
    if (url.endsWith("/api/v1/apps")) return reply(200, { client_id: "mc", client_secret: "ms" });
    if (url.endsWith("/oauth/token")) return reply(200, { access_token: "mtok" });
    if (url.endsWith("/accounts/verify_credentials")) return reply(200, { acct: "qalaburlreview", bot: false });
    if (url.endsWith("/accounts/update_credentials")) return reply(200, { bot: true });
    if (url === "https://oauth2.googleapis.com/token") return reply(200, body.grant_type === "authorization_code" ? { access_token: "ya29", refresh_token: "1//r", scope: A.YT_SCOPE } : { access_token: "ya29" });
    if (url.includes("youtube/v3/videos/rate")) return reply(204);
    if (url.includes("youtube/v3/subscriptions")) return reply(200, { id: "sub1" });
    if (url.includes("youtube/v3/commentThreads")) return reply(200, { id: "Ugx1" });
    if (url.includes("youtube/v3/channels")) return reply(200, { items: [{ id: "UCf-yFKiAHooXPsRsCXFKBjg", snippet: { title: "QA-lab URL Review" } }] });
    return reply(404, { error: "no route " + url });
  };
  return { fetch, calls };
}

async function seed(db) {
  await db.collection("engagement_private").doc("bluesky").set({ handle: "qalaburlreview.bsky.social", did: "did:plc:us", password: "abcd-efgh-ijkl-mnop" });
  await db.collection("engagement_private").doc("mastodon").set({ base: "https://mastodon.social", token: "mtok", acct: "qalaburlreview", bot: true });
  await db.collection("engagement_private").doc("youtube").set({ refresh: "1//r", channelId: "UCf", channel: "QA-lab URL Review" });
  const post = (key, d) => db.collection("engagement_posts").doc(key).set(Object.assign({ seenAt: ago(1), score: 5, lang: "en" }, d));
  await post("bluesky_a", { network: "bluesky", id: "at://did:plc:ana/app.bsky.feed.post/p1", cid: "cid-p1", author: { handle: "ana.bsky.social", id: "did:plc:ana" }, actions: { like: { status: "planned" }, repost: { status: "planned" }, follow: { status: "planned" } } });
  await post("mastodon_a", { network: "mastodon", id: "https://m.s/users/ana/statuses/1", url: "https://m.s/@ana/1", author: { handle: "ana@m.s" }, actions: { like: { status: "planned" }, follow: { status: "planned" } } });
  await post("youtube_a", { network: "youtube", id: "vid1", author: { id: "UCana" }, actions: { like: { status: "planned" }, follow: { status: "planned" } } });
  await post("bluesky_old", { network: "bluesky", id: "at://x/old", cid: "c", seenAt: ago(9), author: {}, actions: { like: { status: "planned" } } });
  await post("x_a", { network: "x", id: "1", author: {}, actions: { like: { status: "planned" } } });
}

const deps = (db, net, extra) => Object.assign({ db, fetch: net.fetch, now: NOW, inc: (n) => ({ inc: n }), keys: KEYS, sleep: async () => {} }, extra || {});
const status = (db, key, a) => db.data.get("engagement_posts/" + key).actions[a].status;

test("YouTube is never planned a repost; it has likes, subscribes and comments only", () => {
  const conf = E.settings({});
  const d = E.decide({ network: "youtube", score: 99, author: { handle: "chan" }, createdAt: ago(1) }, null, conf, {}, NOW, new Set());
  assert.deepEqual(Object.keys(d.actions).sort(), ["follow", "like"]);
});

test("a dry run logs what it would do, a plan past 6 hours is missed, and the Mac's networks are left to the browser agent", async () => {
  const db = fakeDb();
  await seed(db);
  const net = networks();
  const out = await A.carryOut(deps(db, net), E.settings({}));
  assert.equal(out.bluesky.dry, 3);
  assert.equal(out.bluesky.missed, 1);
  assert.equal(out.mastodon.dry + out.youtube.dry, 4);
  assert.equal(status(db, "bluesky_a", "like"), "dry");
  assert.equal(status(db, "bluesky_old", "like"), "missed");
  assert.equal(status(db, "x_a", "like"), "planned");
  assert.equal(net.calls.length, 0, "a dry run calls no network");
  const day = db.data.get("engagement_daily/" + E.bogotaDay(NOW));
  assert.equal(day.n.bluesky.like_dry, 1);
  assert.equal(day.n.youtube.follow_dry, 1);
});

test("live, the plan goes out on Bluesky, Mastodon and YouTube as the connected accounts", async () => {
  const db = fakeDb();
  await seed(db);
  const net = networks();
  const out = await A.carryOut(deps(db, net), E.settings({ live: true }));
  assert.deepEqual([out.bluesky.done, out.mastodon.done, out.youtube.done], [3, 2, 2]);
  ["like", "repost", "follow"].forEach((a) => assert.equal(status(db, "bluesky_a", a), "done"));
  const like = net.calls.find((c) => c.body && c.body.collection === "app.bsky.feed.like");
  assert.deepEqual(like.body.record.subject, { uri: "at://did:plc:ana/app.bsky.feed.post/p1", cid: "cid-p1" });
  assert.equal(like.body.repo, "did:plc:us");
  assert.equal(net.calls.find((c) => c.body && c.body.collection === "app.bsky.graph.follow").body.record.subject, "did:plc:ana");
  assert.ok(net.calls.some((c) => c.url.endsWith("/api/v1/statuses/55/favourite") && c.auth === "Bearer mtok"));
  assert.ok(net.calls.some((c) => c.url.endsWith("/api/v1/accounts/9/follow")));
  assert.ok(net.calls.some((c) => c.url.includes("videos/rate?rating=like&id=vid1") && c.auth === "Bearer ya29"));
  assert.equal(net.calls.find((c) => c.url.includes("subscriptions")).body.snippet.resourceId.channelId, "UCana");
  assert.equal(db.data.get("engagement_daily/" + E.bogotaDay(NOW)).n.mastodon.like_done, 1);
});

test("a refused sign-in stops that network for the run, keeps its plan, and says so in Jarvis", async () => {
  const db = fakeDb();
  await seed(db);
  const net = networks("mastodon.social/api/v2/search");
  const out = await A.carryOut(deps(db, net), E.settings({ live: true }));
  assert.match(out.mastodon.error, /401/);
  assert.equal(status(db, "mastodon_a", "like"), "planned", "tried again next run");
  assert.equal(out.bluesky.done, 3, "the other networks go on");
  const acc = (await A.connections(db)).find((c) => c.network === "mastodon");
  assert.match(acc.error, /401/);
});

test("an approved reply posts at once: in the thread on Bluesky, with the mention on Mastodon, as a comment on YouTube", async () => {
  const db = fakeDb();
  await seed(db);
  const net = networks();
  const reply = (key, network, extra) => db.collection("engagement_posts").doc(key).set(Object.assign({ network, seenAt: ago(1), score: 4, lang: "es", author: {}, actions: { reply: { status: "approved", draft: "Probamos axe en el mismo job.", lang: "es" } } }, extra));
  await reply("bluesky_r", "bluesky", { id: "at://did:plc:ana/app.bsky.feed.post/p1" });
  await reply("mastodon_r", "mastodon", { id: "https://m.s/users/ana/statuses/1" });
  await reply("youtube_r", "youtube", { id: "vid9" });

  const b = await A.replyNow(deps(db, net), "bluesky_r");
  assert.equal(b.status, "posted");
  const post = net.calls.find((c) => c.body && c.body.collection === "app.bsky.feed.post").body.record;
  assert.deepEqual(post.reply.parent, { uri: "at://did:plc:ana/app.bsky.feed.post/p1", cid: "cid-p1" });
  assert.equal(post.reply.root.uri, "at://did:plc:bo/app.bsky.feed.post/root", "a reply to a reply keeps the thread's root");
  assert.deepEqual(post.langs, ["es"]);
  assert.match(b.url, /^https:\/\/bsky\.app\/profile\/qalaburlreview\.bsky\.social\/post\//);

  const m = await A.replyNow(deps(db, net), "mastodon_r");
  assert.equal(m.status, "posted");
  const toot = net.calls.find((c) => c.url.endsWith("/api/v1/statuses")).body;
  assert.equal(toot.status, "@ana@m.s Probamos axe en el mismo job.");
  assert.equal(toot.in_reply_to_id, "55");
  assert.equal(toot.language, "es");

  const y = await A.replyNow(deps(db, net), "youtube_r");
  assert.equal(y.status, "posted");
  assert.equal(net.calls.find((c) => c.url.includes("commentThreads")).body.snippet.videoId, "vid9");
  assert.equal(db.data.get("engagement_posts/youtube_r").actions.reply.url, "https://www.youtube.com/watch?v=vid9&lc=Ugx1");
  assert.equal(db.data.get("engagement_daily/" + E.bogotaDay(NOW)).n.mastodon.posted, 1);
  assert.equal((await A.replyNow(deps(db, net), "mastodon_r")).status, "posted", "a posted reply is never sent twice");
  assert.equal(net.calls.filter((c) => c.url.endsWith("/api/v1/statuses")).length, 1);
});

test("a reply the network keeps refusing fails after 3 tries; one on a network not connected waits", async () => {
  const db = fakeDb();
  const net = networks();
  await db.collection("engagement_private").doc("bluesky").set({ handle: "qalaburlreview.bsky.social", password: "abcd-efgh-ijkl-mnop" });
  await db.collection("engagement_posts").doc("bluesky_r").set({ network: "bluesky", id: "at://gone", seenAt: ago(1), author: {}, actions: { reply: { status: "approved", draft: "Hello there friend." } } });
  await db.collection("engagement_posts").doc("mastodon_r").set({ network: "mastodon", id: "u", seenAt: ago(1), author: {}, actions: { reply: { status: "approved", draft: "Hello there friend." } } });
  const gone = async (url, o) => (url.includes("getPosts") ? { ok: true, status: 200, text: async () => "{\"posts\":[]}" } : net.fetch(url, o));
  for (let i = 0; i < 3; i += 1) await A.carryOut(deps(db, { fetch: gone }), E.settings({}));
  const r = db.data.get("engagement_posts/bluesky_r").actions.reply;
  assert.equal(r.status, "failed");
  assert.equal(r.tries, 3);
  assert.match(r.error, /gone/);
  assert.equal(db.data.get("engagement_posts/mastodon_r").actions.reply.status, "approved");
});

test("a pause stops the poster", async () => {
  const db = fakeDb();
  await seed(db);
  const net = networks();
  await A.carryOut(deps(db, net), E.settings({ live: true, paused: true }));
  assert.equal(status(db, "bluesky_a", "like"), "planned");
  assert.equal(net.calls.length, 0);
});

test("Bluesky takes an app password only, checked by a sign-in; the account password is refused", async () => {
  const db = fakeDb();
  const net = networks();
  await assert.rejects(A.saveBluesky(deps(db, net), { handle: "qalaburlreview.bsky.social", password: "my real password" }), /app password/);
  await assert.rejects(A.saveBluesky(deps(db, net), { handle: "qalaburlreview.bsky.social", password: "zzzz-zzzz-zzzz-zzzz" }), /refused the sign-in/);
  const ok = await A.saveBluesky(deps(db, net), { handle: "@QALabURLReview.bsky.social", password: "abcd-efgh-ijkl-mnop" });
  assert.equal(ok.account, "qalaburlreview.bsky.social");
  const acc = (await A.connections(db)).find((c) => c.network === "bluesky");
  assert.equal(acc.connected, true);
  assert.equal(JSON.stringify(await A.connections(db)).includes("abcd"), false, "Jarvis never sees the password");
  assert.equal(J.withAccounts({}, await A.readCreds(db)).BLUESKY_APP_PASSWORD, "abcd-efgh-ijkl-mnop", "the scout reads Bluesky as the connected account");
});

test("Connect Mastodon registers the app, signs in, marks the account a bot; Connect YouTube keeps the channel; the calendar's state is left alone", async () => {
  const db = fakeDb();
  const net = networks();
  const m = await A.connectUrl(deps(db, net), "mastodon", REDIRECT, KEYS);
  const mu = new URL(m.url);
  assert.equal(mu.origin + mu.pathname, "https://mastodon.social/oauth/authorize");
  assert.equal(mu.searchParams.get("scope"), A.MASTODON_SCOPES);
  assert.equal(mu.searchParams.get("redirect_uri"), REDIRECT);
  assert.equal(await A.connectCallback(deps(db, net), { state: "someone-elses", code: "x" }, REDIRECT, KEYS), null, "the calendar's callback goes on");
  const back = await A.connectCallback(deps(db, net), { state: mu.searchParams.get("state"), code: "mc0de" }, REDIRECT, KEYS);
  assert.equal(back.ok, true);
  assert.match(back.message, /@qalaburlreview, marked as an automated account/);
  assert.equal(net.calls.find((c) => c.url.endsWith("update_credentials")).body.bot, "true");
  assert.equal(db.data.get("engagement_private/mastodon").token, "mtok");

  const y = await A.connectUrl(deps(db, net), "youtube", REDIRECT, KEYS);
  const yu = new URL(y.url);
  assert.equal(yu.searchParams.get("scope"), A.YT_SCOPE);
  assert.equal(yu.searchParams.get("access_type"), "offline");
  const late = await A.connectCallback(deps(db, net, { now: NOW + 11 * 60000 }), { state: yu.searchParams.get("state"), code: "g" }, REDIRECT, KEYS);
  assert.match(late.message, /expired/);
  const y2 = new URL((await A.connectUrl(deps(db, net), "youtube", REDIRECT, KEYS)).url);
  const ok = await A.connectCallback(deps(db, net), { state: y2.searchParams.get("state"), code: "g" }, REDIRECT, KEYS);
  assert.match(ok.message, /QA-lab URL Review/);
  assert.equal(db.data.get("engagement_private/youtube").refresh, "1//r");
  const all = await A.connections(db);
  assert.deepEqual(all.map((c) => c.connected), [false, true, true]);
  assert.equal(all.find((c) => c.network === "mastodon").bot, true);
  await A.disconnect(db, "youtube");
  assert.equal((await A.connections(db)).find((c) => c.network === "youtube").connected, false);
});

test("approving through Jarvis posts the reply and says where; a dry run still posts approved replies", async () => {
  const db = fakeDb();
  await seed(db);
  const net = networks();
  await db.collection("engagement_posts").doc("mastodon_aaaaaaaaaaaaaaaaaaaa").set({ network: "mastodon", id: "https://m.s/users/ana/statuses/1", seenAt: ago(1), author: {}, actions: { reply: { status: "waiting", draft: "We pin the axe version in CI.", lang: "en", expiresAt: new Date(NOW + HOUR).toISOString() } } });
  const out = await J.decide(deps(db, net), { key: "mastodon_aaaaaaaaaaaaaaaaaaaa", decision: "approve" }, "carlos");
  assert.equal(out.status, "posted");
  assert.equal(out.message, "Posted on Mastodon.");
  await db.collection("engagement_posts").doc("x_aaaaaaaaaaaaaaaaaaaa").set({ network: "x", id: "1", seenAt: ago(1), author: {}, actions: { reply: { status: "waiting", draft: "Short and useful.", expiresAt: new Date(NOW + HOUR).toISOString() } } });
  const x = await J.decide(deps(db, net), { key: "x_aaaaaaaaaaaaaaaaaaaa", decision: "approve" }, "carlos");
  assert.match(x.message, /Mac's browser agent posts it on X on its next run/);
});
