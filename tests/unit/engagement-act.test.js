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
    if (url.includes("app.bsky.feed.getPostThread")) return reply(200, { thread: { post: {}, replies: [] } });
    if (url.includes("app.bsky.notification.listNotifications")) return reply(200, { notifications: [] });
    if (url.includes("/api/v1/notifications")) return reply(200, []);
    if (/\/api\/v1\/statuses\/\w+\/context$/.test(url)) return reply(200, { ancestors: [], descendants: [] });
    if (url.includes("youtube/v3/comments?") && !o.body) return reply(200, { items: [] });
    if (url.includes("youtube/v3/commentThreads") && !o.body) return reply(200, { items: [] });
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
  assert.equal(net.calls.find((c) => c.url.includes("commentThreads") && c.body).body.snippet.videoId, "vid9");
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
  assert.deepEqual(all.map((c) => c.connected), [false, true, true, false]);
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

// --- Conversations (#2421): never answer twice, and pick up comments under our replies -------------------------

test("an approved reply is not sent where our account already answered: it turns replied with a link to ours", async () => {
  const db = fakeDb();
  await seed(db);
  const net = networks();
  const fetch = async (url, o) => {
    const json = (data) => ({ ok: true, status: 200, text: async () => JSON.stringify(data) });
    if (url.includes("getPostThread")) return json({ thread: { replies: [{ post: { uri: "at://did:plc:us/app.bsky.feed.post/old", author: { did: "did:plc:us" } } }] } });
    if (url.endsWith("/api/v1/statuses/55/context")) return json({ descendants: [{ id: "60", in_reply_to_id: "55", url: "https://mastodon.social/@qalaburlreview/60", account: { acct: "qalaburlreview" } }] });
    if (url.includes("commentThreads?") && !(o || {}).body) return json({ items: [{ id: "UgxOld", snippet: { topLevelComment: { snippet: { authorChannelId: { value: "UCf" } } } } }] });
    return net.fetch(url, o);
  };
  const reply = (key, network, id) => db.collection("engagement_posts").doc(key).set({ network, id, seenAt: ago(1), author: {}, actions: { reply: { status: "approved", draft: "We pin axe in CI.", lang: "en" } } });
  await reply("bluesky_r", "bluesky", "at://did:plc:ana/app.bsky.feed.post/p1");
  await reply("mastodon_r", "mastodon", "https://m.s/users/ana/statuses/1");
  await reply("youtube_r", "youtube", "vid9");
  const out = await A.carryOut(deps(db, { fetch }), E.settings({}));
  assert.deepEqual([out.bluesky.already, out.mastodon.already, out.youtube.already], [1, 1, 1]);
  const r = (k) => db.data.get("engagement_posts/" + k).actions.reply;
  assert.equal(r("bluesky_r").status, "replied");
  assert.equal(r("bluesky_r").url, "https://bsky.app/profile/qalaburlreview.bsky.social/post/old");
  assert.equal(r("mastodon_r").url, "https://mastodon.social/@qalaburlreview/60");
  assert.equal(r("youtube_r").url, "https://www.youtube.com/watch?v=vid9&lc=UgxOld");
  assert.ok(!net.calls.some((c) => c.body && (c.body.collection === "app.bsky.feed.post" || c.body.status || c.body.snippet)), "nothing was posted");
  assert.equal(db.data.get("engagement_daily/" + E.bogotaDay(NOW)).n.youtube.already, 1);
});

test("approving a reply where we already answered says so instead of posting", async () => {
  const db = fakeDb();
  await seed(db);
  const net = networks();
  const fetch = async (url, o) => (url.includes("getPostThread")
    ? { ok: true, status: 200, text: async () => JSON.stringify({ thread: { replies: [{ post: { uri: "at://did:plc:us/app.bsky.feed.post/old", author: { did: "did:plc:us" } } }] } }) }
    : net.fetch(url, o));
  await db.collection("engagement_posts").doc("bluesky_aaaaaaaaaaaaaaaaaaaa").set({ network: "bluesky", id: "at://did:plc:ana/app.bsky.feed.post/p1", seenAt: ago(1), author: {}, actions: { reply: { status: "waiting", draft: "We pin the axe version in CI.", lang: "en", expiresAt: new Date(NOW + HOUR).toISOString() } } });
  const out = await J.decide(deps(db, { fetch }), { key: "bluesky_aaaaaaaaaaaaaaaaaaaa", decision: "approve" }, "carlos");
  assert.equal(out.status, "replied");
  assert.equal(out.message, "Not posted: we had already replied there on Bluesky.");
  assert.equal(out.url, "https://bsky.app/profile/qalaburlreview.bsky.social/post/old");
});

/** Comments under our posted replies on the three networks, and Gemini's read of them. */
function chainNetworks() {
  const net = networks();
  const gemini = [];
  const fetch = async (url, o) => {
    const json = (data) => ({ ok: true, status: 200, text: async () => JSON.stringify(data), json: async () => data });
    const bsky = (rk, did, text, extra) => Object.assign({ post: { uri: "at://" + did + "/app.bsky.feed.post/" + rk, cid: "cid-" + rk, author: { did, handle: rk + ".bsky.social" }, record: { text, langs: ["en"], createdAt: ago(1), reply: { root: { uri: "at://did:plc:ana/app.bsky.feed.post/p1" } } }, viewer: {} }, replies: [] }, extra || {});
    if (url.includes("getPostThread") && url.includes(encodeURIComponent("at://did:plc:us/app.bsky.feed.post/r1"))) {
      const liked = bsky("c2", "did:plc:cy", "Thanks, that helped!");
      liked.post.viewer.like = "at://did:plc:us/app.bsky.feed.like/l1";
      const done = bsky("c3", "did:plc:dee", "Good point");
      done.post.viewer.like = "at://did:plc:us/app.bsky.feed.like/l2";
      done.replies = [{ post: { uri: "at://did:plc:us/app.bsky.feed.post/r2", author: { did: "did:plc:us" } } }];
      return json({ thread: { replies: [bsky("c1", "did:plc:bo", "Which axe rules do you turn off in CI?"), liked, done, { post: { uri: "at://did:plc:us/x/1", author: { did: "did:plc:us" } } }] } });
    }
    if (url.endsWith("/api/v1/statuses/77/context")) {
      return json({ descendants: [
        { id: "80", in_reply_to_id: "77", uri: "https://m.s/users/bo/statuses/80", url: "https://m.s/@bo/80", content: "<p>Do you pin the axe version?</p>", language: "en", created_at: ago(1), favourited: false, account: { acct: "bo@m.s", display_name: "Bo" } },
        { id: "81", in_reply_to_id: "80", account: { acct: "qalaburlreview" } },
        { id: "82", in_reply_to_id: "77", content: "<p>beep</p>", account: { acct: "bot@m.s", bot: true } }
      ] });
    }
    if (url.includes("youtube/v3/comments?") && url.includes("parentId=Ugx1") && !(o || {}).body) {
      return json({ items: [
        { id: "Ugx1.old", snippet: { authorChannelId: { value: "UCcy" }, authorDisplayName: "Cy", textOriginal: "First!", publishedAt: ago(3) } },
        { id: "Ugx1.a", snippet: { authorChannelId: { value: "UCbo" }, authorDisplayName: "Bo", textOriginal: "Does this work with Cypress too?", publishedAt: ago(1) } }
      ] });
    }
    if (url.includes("youtube/v3/comments?part=snippet") && (o || {}).body) { net.calls.push({ url, method: o.method, body: JSON.parse(o.body) }); return json({ id: "Ugx1.us" }); }
    if (url.includes("generativelanguage")) {
      const items = JSON.parse(JSON.parse(o.body).contents[0].parts[0].text.split("\n").pop());
      gemini.push(items);
      const rows = items.map((c) => ({ id: c.id, lang: "en", sentiment: "positive", like: true, worth: /\?/.test(c.comment) ? 0.9 : 0.1, why: "a question to us", reply: /\?/.test(c.comment) ? "Yes, cypress-axe runs the same rules." : "" }));
      return json({ candidates: [{ content: { parts: [{ text: JSON.stringify(rows) }] } }] });
    }
    return net.fetch(url, o);
  };
  return { fetch, calls: net.calls, gemini };
}

async function seedPosted(db) {
  const posted = (key, d) => db.collection("engagement_posts").doc(key).set(Object.assign({ seenAt: ago(5), score: 6, lang: "en", topic: "Accessibility", verdict: "engage", author: {} }, d));
  await posted("bluesky_p", { network: "bluesky", id: "at://did:plc:ana/app.bsky.feed.post/p1", thread: "at://did:plc:ana/app.bsky.feed.post/p1", text: "Axe in CI?", actions: { reply: { status: "posted", postedAt: ago(2), uri: "at://did:plc:us/app.bsky.feed.post/r1", draft: "We run axe in the Playwright job." } } });
  await posted("mastodon_p", { network: "mastodon", id: "https://m.s/users/ana/statuses/1", text: "Pinning tools", actions: { reply: { status: "posted", postedAt: ago(2), id: "77", draft: "We pin every tool in CI." } } });
  await posted("youtube_p", { network: "youtube", id: "vid9", title: "WCAG in 10 minutes", actions: { reply: { status: "posted", postedAt: ago(2), id: "Ugx1", url: "https://www.youtube.com/watch?v=vid9&lc=Ugx1", draft: "axe catches about a third of WCAG issues." } } });
  await posted("bluesky_week", { network: "bluesky", id: "at://old", actions: { reply: { status: "posted", postedAt: ago(24 * 8), uri: "at://did:plc:us/app.bsky.feed.post/r0" } } });
}

test("comments under our replies get a like when we have not liked them, and an answer for Carlos when they ask something", async () => {
  const db = fakeDb();
  await seed(db);
  await seedPosted(db);
  const net = chainNetworks();
  const pushed = [];
  const d = deps(db, net, { env: { GEMINI_API_KEY: "k" }, push: async (m) => { pushed.push(m); } });
  const out = await J.followChains(d, E.settings({}));
  assert.equal(out.checked, 3, "a reply older than 7 days is not read again");
  assert.equal(out.chained, 4, "liked-and-answered comments, our own and bots are left out; YouTube comments before ours too");
  const doc = (network, id) => db.data.get("engagement_posts/" + E.keyOf(network, id));

  const c1 = doc("bluesky", "at://did:plc:bo/app.bsky.feed.post/c1");
  assert.equal(c1.actions.like.status, "planned");
  assert.equal(c1.actions.reply.status, "waiting");
  assert.equal(c1.actions.reply.expiresAt, new Date(NOW + E.CHAIN_TTL).toISOString());
  assert.deepEqual(c1.chain, { parent: "bluesky_p", root: "bluesky_p", depth: 1, on: "reply", ours: "We run axe in the Playwright job.", post: "Axe in CI?" });
  assert.equal(c1.thread, "at://did:plc:ana/app.bsky.feed.post/p1");
  assert.equal(c1.cid, "cid-c1", "the like needs no extra lookup");
  const c2 = doc("bluesky", "at://did:plc:cy/app.bsky.feed.post/c2");
  assert.deepEqual(Object.keys(c2.actions), [], "already liked, and a thank-you needs no answer");
  assert.equal(c2.verdict, "watch");

  const m = doc("mastodon", "https://m.s/users/bo/statuses/80");
  assert.equal(m.actions.like.status, "planned");
  assert.equal(m.actions.reply, undefined, "we already answered it");

  const y = doc("youtube", "Ugx1.a");
  assert.equal(y.actions.like, undefined, "YouTube takes no comment likes");
  assert.equal(y.actions.reply.status, "waiting");
  assert.equal(y.parentId, "Ugx1");
  assert.equal(y.videoId, "vid9");
  assert.equal(y.url, "https://www.youtube.com/watch?v=vid9&lc=Ugx1.a");

  assert.equal(pushed.length, 2);
  assert.match(pushed[0].title, /^Answer .+ on (Bluesky|YouTube)\?/);
  assert.match(pushed[0].lines[0], /^We said: /);
  const day = db.data.get("engagement_daily/" + E.bogotaDay(NOW));
  assert.equal(day.n.bluesky.chained, 2);
  assert.equal(day.n.bluesky.like, 1);
  assert.equal(day.n.youtube.drafted, 1);
  assert.ok(db.data.get("engagement_posts/bluesky_p").chainAt);

  assert.equal((await J.followChains(d, E.settings({}))).checked, 0, "each reply is read at most once an hour");
  const later = await J.followChains(Object.assign({}, d, { now: NOW + 2 * HOUR }), E.settings({}));
  assert.equal(later.checked, 3);
  assert.equal(later.chained, 0, "comments already taken in are not drafted again");
  assert.equal(net.gemini.length, 1);

  const live = E.settings({ live: true });
  await A.carryOut(Object.assign({}, d, { now: NOW + 3 * HOUR }), live);
  assert.equal(db.data.get("engagement_posts/" + E.keyOf("bluesky", "at://did:plc:bo/app.bsky.feed.post/c1")).actions.like.status, "done");
  assert.ok(net.calls.some((c) => c.body && c.body.collection === "app.bsky.feed.like" && c.body.record.subject.uri === "at://did:plc:bo/app.bsky.feed.post/c1"));

  const yKey = E.keyOf("youtube", "Ugx1.a");
  const answered = await J.decide(Object.assign({}, d, { now: NOW + 3 * HOUR }), { key: yKey, decision: "approve" }, "carlos");
  assert.equal(answered.status, "posted");
  const sent = net.calls.find((c) => c.url.includes("youtube/v3/comments?part=snippet") && c.body);
  assert.deepEqual(sent.body.snippet, { parentId: "Ugx1", textOriginal: "Yes, cypress-axe runs the same rules." }, "the answer goes into the comment thread, not on the video");
  assert.equal(db.data.get("engagement_posts/" + yKey).actions.reply.url, "https://www.youtube.com/watch?v=vid9&lc=Ugx1.us");
});

test("comment chains wait while paused, and stay unread when Gemini fails so the next run tries again", async () => {
  const db = fakeDb();
  await seed(db);
  await seedPosted(db);
  const net = chainNetworks();
  const d = deps(db, net, { env: { GEMINI_API_KEY: "k" } });
  assert.equal((await J.followChains(d, E.settings({ paused: true }))).checked, 0);
  const broken = async (url, o) => (url.includes("generativelanguage") ? { ok: false, status: 503, json: async () => ({ error: { message: "overloaded" } }) } : net.fetch(url, o));
  const out = await J.followChains(Object.assign({}, d, { fetch: broken }), E.settings({}));
  assert.match(out.aiError, /503/);
  assert.equal(Array.from(db.data.keys()).filter((k) => k.startsWith("engagement_posts/") && db.data.get(k).chain).length, 0);
  const again = await J.followChains(Object.assign({}, d, { now: NOW + 2 * HOUR }), E.settings({}));
  assert.equal(again.chained, 4);
});

// --- Comments on our own posts and clips (#2447) ---------------------------------------------------------------

/** Notifications on the three networks: one new comment each, plus ones the inbox leaves out. */
function inboxNetworks() {
  const net = networks();
  const gemini = [];
  const fetch = async (url, o) => {
    const json = (data) => ({ ok: true, status: 200, text: async () => JSON.stringify(data), json: async () => data });
    if (url.includes("listNotifications")) {
      return json({ notifications: [
        { reason: "reply", uri: "at://did:plc:eve/app.bsky.feed.post/n1", author: { did: "did:plc:eve" }, indexedAt: ago(1), record: { reply: { parent: { uri: "at://did:plc:us/app.bsky.feed.post/own1" } } } },
        { reason: "like", uri: "at://did:plc:eve/app.bsky.feed.like/l1", author: { did: "did:plc:eve" }, indexedAt: ago(1) },
        { reason: "reply", uri: "at://did:plc:eve/app.bsky.feed.post/old", author: { did: "did:plc:eve" }, indexedAt: ago(24 * 9) }
      ] });
    }
    if (url.includes("getPosts?uris=" + encodeURIComponent("at://did:plc:eve/app.bsky.feed.post/n1"))) {
      return json({ posts: [{ uri: "at://did:plc:eve/app.bsky.feed.post/n1", cid: "cid-n1", author: { did: "did:plc:eve", handle: "eve.bsky.social" }, record: { text: "Does the LCP tip work on Shopify?", createdAt: ago(1), reply: { root: { uri: "at://did:plc:us/app.bsky.feed.post/own1" } } }, viewer: {} }] });
    }
    if (url.includes("getPosts?uris=" + encodeURIComponent("at://did:plc:us/app.bsky.feed.post/own1"))) return json({ posts: [{ uri: "at://did:plc:us/app.bsky.feed.post/own1", author: { did: "did:plc:us" }, record: { text: "LCP in 60 seconds" } }] });
    if (url.includes("/api/v1/notifications")) {
      return json([{ created_at: ago(1), account: { acct: "eve@m.s" }, status: { id: "90", uri: "https://m.s/users/eve/statuses/90", url: "https://m.s/@eve/90", content: "<p>Thanks for the free review!</p>", language: "en", created_at: ago(1), in_reply_to_id: "70", favourited: false, account: { acct: "eve@m.s", display_name: "Eve" } } }]);
    }
    if (url.endsWith("/api/v1/statuses/70")) return json({ uri: "https://mastodon.social/users/qalaburlreview/statuses/70", content: "<p>Our free URL review</p>", account: { acct: "qalaburlreview" } });
    if (url.includes("allThreadsRelatedToChannelId=UCf")) {
      const thread = (id, channel, text) => ({ id, snippet: { videoId: "ourvid", totalReplyCount: 0, topLevelComment: { snippet: { authorChannelId: { value: channel }, authorDisplayName: "Eve", textOriginal: text, publishedAt: ago(1) } } } });
      return json({ items: [thread("UgyOwn", "UCeve", "How do you measure INP?"), thread("UgyUs", "UCf", "Pinned: links below")] });
    }
    if (url.includes("youtube/v3/videos?part=snippet&id=ourvid")) return json({ items: [{ snippet: { title: "INP in 60 seconds" } }] });
    if (url.includes("youtube/v3/comments?part=snippet") && (o || {}).body) { net.calls.push({ url, body: JSON.parse(o.body) }); return json({ id: "UgyOwn.us" }); }
    if (url.includes("generativelanguage")) {
      const items = JSON.parse(JSON.parse(o.body).contents[0].parts[0].text.split("\n").pop());
      gemini.push(items);
      return json({ candidates: [{ content: { parts: [{ text: JSON.stringify(items.map((c) => ({ id: c.id, lang: "en", sentiment: "positive", like: true, worth: /\?/.test(c.comment) ? 0.9 : 0.1, reply: /\?/.test(c.comment) ? "Yes, measure it in the field with CrUX." : "" }))) }] } }] });
    }
    return net.fetch(url, o);
  };
  return { fetch, calls: net.calls, gemini };
}

test("comments on our own posts and clips come from each network's notifications, once, with what we wrote", async () => {
  const db = fakeDb();
  await seed(db);
  const net = inboxNetworks();
  const pushed = [];
  const d = deps(db, net, { env: { GEMINI_API_KEY: "k" }, push: async (m) => { pushed.push(m); } });
  const out = await J.followChains(d, E.settings({}));
  assert.deepEqual(out.errors, {});
  assert.equal(out.chained, 3, "likes, notifications older than 7 days and our own comments are left out");
  const doc = (network, id) => db.data.get("engagement_posts/" + E.keyOf(network, id));

  const b = doc("bluesky", "at://did:plc:eve/app.bsky.feed.post/n1");
  assert.equal(b.chain.on, "post");
  assert.equal(b.chain.ours, "LCP in 60 seconds");
  assert.equal(b.actions.like.status, "planned");
  assert.equal(b.actions.reply.status, "waiting");
  assert.equal(b.thread, "at://did:plc:us/app.bsky.feed.post/own1");

  const m = doc("mastodon", "https://m.s/users/eve/statuses/90");
  assert.equal(m.chain.ours, "Our free URL review");
  assert.equal(m.actions.like.status, "planned");
  assert.equal(m.actions.reply, undefined, "a thank-you gets a like only");

  const y = doc("youtube", "UgyOwn");
  assert.equal(y.chain.ours, "INP in 60 seconds");
  assert.equal(y.parentId, "UgyOwn");
  assert.equal(y.videoId, "ourvid");
  assert.equal(y.actions.reply.status, "waiting");
  assert.equal(net.gemini[0][0].on, "our post");

  assert.equal(pushed.length, 2);
  assert.equal((await J.followChains(d, E.settings({}))).checked, 0, "each inbox is read at most once an hour");
  const later = await J.followChains(Object.assign({}, d, { now: NOW + 2 * HOUR }), E.settings({}));
  assert.equal(later.chained, 0);
  assert.equal(later.checked, 0, "comments already taken in are not looked at again");
  assert.equal(net.gemini.length, 1);

  const yKey = E.keyOf("youtube", "UgyOwn");
  assert.equal((await J.decide(Object.assign({}, d, { now: NOW + 3 * HOUR }), { key: yKey, decision: "approve" }, "carlos")).status, "posted");
  assert.deepEqual(net.calls.find((c) => c.url.includes("youtube/v3/comments?part=snippet") && c.body).body.snippet, { parentId: "UgyOwn", textOriginal: "Yes, measure it in the field with CrUX." }, "the answer goes into the comment's thread on our video");
});

test("a video with comments turned off refuses only that reply; another 403 still stops the network", async () => {
  const answer = (error) => async () => ({ ok: false, status: 403, text: async () => JSON.stringify({ error }) });
  const off = await A.call(answer({ message: "The video identified by the videoId parameter has disabled comments.", errors: [{ reason: "commentsDisabled" }] }), "https://www.googleapis.com/youtube/v3/commentThreads?part=snippet", { json: {} }).catch((e) => e);
  assert.equal(off.fatal, false);
  const denied = await A.call(answer({ message: "Request had insufficient authentication scopes.", errors: [{ reason: "insufficientPermissions" }] }), "https://www.googleapis.com/youtube/v3/commentThreads?part=snippet", { json: {} }).catch((e) => e);
  assert.equal(denied.fatal, true);
});
