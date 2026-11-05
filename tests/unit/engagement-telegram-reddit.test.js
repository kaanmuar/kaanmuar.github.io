"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const E = require("../../functions/engagement.js");
const A = require("../../functions/engagement-act.js");
const J = require("../../functions/jarvis-engagement.js");
const R = require("../../functions/engagement-reddit.js");
const { records } = require("../../scripts/reddit-engagement.js");
const { fakeDb } = require("./fixtures/fake-firestore.js");

const NOW = Date.parse("2026-11-05T15:00:00Z");
const HOUR = 3600000;
const sec = (h) => Math.floor((NOW - h * HOUR) / 1000);
const TOKEN = "123456789:AAEabcdefghijklmnopqrstuvwxyz012345";
const CHANNEL = -1001111111111;
const GROUP = -1002222222222;

const json = (status, data) => ({ ok: status < 300, status, text: async () => JSON.stringify(data), json: async () => data });

/** Gemini answers every comment: a question gets an answer, anything else a like only. */
function gemini(req, seen) {
  const items = JSON.parse(JSON.parse(req.body).contents[0].parts[0].text.split("\n").pop());
  seen.push(items);
  return json(200, { candidates: [{ content: { parts: [{ text: JSON.stringify(items.map((c) => ({ id: c.id, lang: "en", sentiment: "positive", like: true, worth: /\?/.test(c.comment) ? 0.9 : 0.1, reply: /\?/.test(c.comment) ? "We score it from field data, then lab runs." : "" }))) }] } }] });
}

const post = { message_id: 10, chat: { id: GROUP }, from: { id: 777000, is_bot: false, first_name: "Telegram" }, sender_chat: { id: CHANNEL }, is_automatic_forward: true, text: "New live reports: 12 sites", date: sec(3) };
const ours = { message_id: 50, chat: { id: GROUP }, from: { id: 42, is_bot: true, username: "qalab_live_bot" }, text: "We use field data.", date: sec(2) };
const UPDATES = [
  { update_id: 100, message: post },
  { update_id: 101, message: { message_id: 11, chat: { id: GROUP }, from: { id: 7, first_name: "Eve", username: "eve", language_code: "en" }, text: "How do you score INP?", reply_to_message: post, message_thread_id: 10, date: sec(1) } },
  { update_id: 102, message: { message_id: 12, chat: { id: GROUP }, from: { id: 7, first_name: "Eve", username: "eve" }, text: "Thanks!", reply_to_message: ours, date: sec(1) } },
  { update_id: 103, message: { message_id: 13, chat: { id: GROUP }, from: { id: 8, first_name: "Bo" }, text: "Same here?", reply_to_message: { message_id: 11, from: { id: 7 }, text: "How do you score INP?" }, date: sec(1) } },
  { update_id: 104, message: { message_id: 14, chat: { id: -1003 }, from: { id: 7, first_name: "Eve" }, text: "Elsewhere?", reply_to_message: post, date: sec(1) } }
];

/** The Bot API for @qalab_live_bot, and Gemini. */
function telegram(opts) {
  const o = opts || {};
  const calls = [];
  const seen = [];
  const fetch = async (url, req) => {
    if (url.includes("generativelanguage")) return gemini(req, seen);
    const m = url.match(/^https:\/\/api\.telegram\.org\/bot([^/]+)\/(\w+)$/);
    if (!m) return json(404, { error: "no route " + url });
    const body = req && req.body ? JSON.parse(req.body) : {};
    calls.push({ method: m[2], body });
    if (m[1] !== TOKEN) return json(401, { ok: false, description: "Unauthorized" });
    const ok = (result) => json(200, { ok: true, result });
    if (m[2] === "getMe") return ok({ id: 42, is_bot: true, username: "qalab_live_bot", can_read_all_group_messages: false });
    if (m[2] === "getChat") return ok(body.chat_id === "@qalab_live" ? { id: CHANNEL, title: "QA-lab Live", linked_chat_id: o.group === false ? undefined : GROUP } : { id: GROUP, title: "QA-lab Live chat" });
    if (m[2] === "getWebhookInfo") return ok({ url: "" });
    if (m[2] === "getChatMember") return ok({ status: o.status || "administrator" });
    if (m[2] === "getUpdates") return ok(UPDATES.filter((u) => !body.offset || u.update_id >= body.offset));
    if (m[2] === "setMessageReaction") return ok(true);
    if (m[2] === "sendMessage") return ok({ message_id: 900 });
    return json(404, { ok: false, description: "no method" });
  };
  return { fetch, calls, seen };
}

const deps = (db, net, extra) => Object.assign({ db, fetch: net.fetch, now: NOW, inc: (n) => ({ inc: n }), env: { GEMINI_API_KEY: "k" }, sleep: async () => {} }, extra || {});
const connect = (db) => db.collection("engagement_private").doc("telegram").set({ token: TOKEN, handle: "@qalab_live_bot", channel: "@qalab_live", channelId: CHANNEL, group: GROUP, groupTitle: "QA-lab Live chat", groupUser: "", admin: true });
const doc = (db, network, id) => db.data.get("engagement_posts/" + E.keyOf(network, id));

test("Telegram and Reddit act under our own posts only: reactions and replies on Telegram, replies on Reddit", () => {
  assert.deepEqual(E.NETWORKS.telegram.only, ["like", "reply"]);
  assert.equal(E.NETWORKS.telegram.api, true);
  assert.deepEqual(E.NETWORKS.reddit.only, ["reply"]);
  assert.equal(E.NETWORKS.reddit.devvit, true);
  assert.ok(E.CHAIN_LIKES.includes("telegram"));
  assert.ok(!E.CHAIN_LIKES.includes("reddit"), "the Reddit app cannot vote");
  assert.ok(A.API.includes("telegram") && !A.API.includes("reddit"));
});

test("the bot's token is checked before it is kept, and Jarvis says what the channel still lacks", async () => {
  const db = fakeDb();
  await assert.rejects(A.saveTelegram(deps(db, telegram()), { token: "qalab_live_bot" }), /BotFather/);
  const wrong = await A.saveTelegram(deps(db, telegram()), { token: "987654321:AAEzyxwvutsrqponmlkjihgfedcba987654" }).catch((e) => e.message);
  assert.match(wrong, /Telegram refused the token/);
  assert.doesNotMatch(wrong, /AAE/, "the token never shows in an error");

  const lone = await A.saveTelegram(deps(db, telegram({ group: false })), { token: TOKEN });
  assert.match(lone.message, /@qalab_live has no discussion group: in the channel, Edit > Discussion/);
  assert.equal(db.data.get("engagement_private/telegram").group, null);

  const member = await A.saveTelegram(deps(db, telegram({ status: "member" })), { token: TOKEN });
  assert.match(member.message, /Make @qalab_live_bot an admin of “QA-lab Live chat”/);

  const ready = await A.saveTelegram(deps(db, telegram()), { token: TOKEN });
  assert.equal(ready.message, "Telegram is connected as @qalab_live_bot. It reacts to and answers comments under @qalab_live's posts in “QA-lab Live chat”.");
  const saved = db.data.get("engagement_private/telegram");
  assert.equal(saved.group, GROUP);
  assert.equal(saved.error, "");
  const row = (await A.connections(db)).find((c) => c.network === "telegram");
  assert.equal(row.connected, true);
  assert.equal(row.account, "@qalab_live_bot");
  assert.ok(!JSON.stringify(row).includes(TOKEN));
});

test("comments under our channel's posts and replies to the bot come in once, and Telegram confirms only what is stored", async () => {
  const db = fakeDb();
  await connect(db);
  const net = telegram();
  const out = await J.followChains(deps(db, net), E.settings({}));
  assert.deepEqual(out.errors, {});
  assert.equal(out.chained, 2, "the channel's own forward, replies to other people and other chats are left out");
  const q = doc(db, "telegram", GROUP + ":11");
  assert.equal(q.chain.on, "post");
  assert.equal(q.chain.ours, "New live reports: 12 sites");
  assert.equal(q.thread, GROUP + ":10");
  assert.equal(q.url, "https://t.me/c/2222222222/11");
  assert.equal(q.actions.like.status, "planned");
  assert.equal(q.actions.reply.status, "waiting");
  const thanks = doc(db, "telegram", GROUP + ":12");
  assert.equal(thanks.chain.ours, "We use field data.");
  assert.equal(thanks.actions.reply, undefined, "a thank-you gets a reaction only");
  assert.equal(db.data.get("engagement_private/telegram").offset, 101, "updates are confirmed only up to the first comment not stored yet");

  const later = await J.followChains(deps(db, net, { now: NOW + 2 * HOUR }), E.settings({}));
  assert.equal(later.chained, 0);
  assert.equal(db.data.get("engagement_private/telegram").offset, 105);
  assert.equal(net.seen.length, 1);
});

test("a channel without a discussion group says so in the run's errors, and one linked later is found and kept", async () => {
  const db = fakeDb();
  await db.collection("engagement_private").doc("telegram").set({ token: TOKEN, handle: "@qalab_live_bot", channel: "@qalab_live", group: null, error: "@qalab_live has no discussion group" });
  const out = await J.followChains(deps(db, telegram({ group: false })), E.settings({}));
  assert.match(out.errors.telegram, /@qalab_live has no discussion group/);

  const linked = await J.followChains(deps(db, telegram(), { now: NOW + 2 * HOUR }), E.settings({}));
  assert.deepEqual(linked.errors, {});
  assert.equal(linked.chained, 2);
  const saved = db.data.get("engagement_private/telegram");
  assert.equal(saved.group, GROUP);
  assert.equal(saved.groupTitle, "QA-lab Live chat");
  assert.equal(saved.error, "");
});

test("the Connect Telegram workflow's token is kept only when Telegram says it is our bot's", async () => {
  const db = fakeDb();
  await assert.rejects(A.connectTelegramCi(deps(db, telegram(), { env: { TELEGRAM_BOT: "other_bot" } }), { token: TOKEN }), /not @other_bot's/);
  await assert.rejects(A.connectTelegramCi(deps(db, telegram()), { token: "987654321:AAEzyxwvutsrqponmlkjihgfedcba987654" }), /Telegram refused the token/);
  await assert.rejects(A.connectTelegramCi(deps(db, telegram()), { token: "nope" }), /not a bot token/);
  assert.equal(db.data.get("engagement_private/telegram"), undefined);
  const out = await A.connectTelegramCi(deps(db, telegram()), { token: TOKEN, channel: "@someone_else" });
  assert.match(out.message, /in “QA-lab Live chat”/);
  assert.equal(db.data.get("engagement_private/telegram").channel, "@qalab_live", "the caller never picks the channel");
});

test("the bot reacts with a thank-you or a thumbs-up, and an approved answer goes into the comment's thread", async () => {
  const db = fakeDb();
  await connect(db);
  const net = telegram();
  const d = deps(db, net);
  await J.followChains(d, E.settings({}));
  const tally = await A.carryOut(d, E.settings({ live: true }));
  assert.equal(tally.telegram.done, 2);
  const reactions = net.calls.filter((c) => c.method === "setMessageReaction").map((c) => [c.body.message_id, c.body.reaction[0].emoji]).sort();
  assert.deepEqual(reactions, [[11, "👍"], [12, "🙏"]]);
  assert.equal(net.calls.find((c) => c.method === "setMessageReaction").body.chat_id, GROUP);

  const key = E.keyOf("telegram", GROUP + ":11");
  const sent = await J.decide(d, { key, decision: "approve" }, "carlos");
  assert.equal(sent.status, "posted");
  const msg = net.calls.find((c) => c.method === "sendMessage").body;
  assert.equal(msg.chat_id, GROUP);
  assert.equal(msg.reply_parameters.message_id, 11);
  assert.equal(msg.text, "We score it from field data, then lab runs.");
  assert.equal(db.data.get("engagement_posts/" + key).actions.reply.url, "https://t.me/c/2222222222/900");
});

// --- Reddit ---------------------------------------------------------------------------------------------------------

const line = (rec) => JSON.stringify({ message: "qalab-ledger " + JSON.stringify(rec) });
const comment = (id, extra) => Object.assign({ id, post: "t3_p1", parent: "t3_p1", author: "eve", body: "How is the score made?", created: new Date(NOW - HOUR).toISOString(), permalink: "/r/QALabLiveReports/comments/p1/live/" + id.slice(3) + "/", score: 2, answered: false, ours: "12 new live reports" }, extra || {});

test("the sync reads the app's comments and reply results from devvit's log dump, one comment per id", () => {
  const text = [
    line({ kind: "comments", at: "2026-11-05T13:30:00Z", items: [comment("t1_a1")] }),
    line({ kind: "comments", at: "2026-11-05T14:00:00Z", items: [comment("t1_a1", { answered: true }), comment("t1_b2")] }),
    line({ kind: "members", at: "2026-11-05T14:00:00Z", subscribers: 3 }),
    line({ kind: "replied", at: "2026-11-05T14:00:00Z", key: "reddit_0123456789abcdef0123", id: "t1_us", url: "https://www.reddit.com/r/x/comments/p1/live/us/" }),
    "Some CLI line",
    'qalab-ledger {"kind":"comments","at":"2026-11-05T14:30:00Z","items":[{"id":"t1_cut'
  ].join("\n");
  const got = records(text);
  assert.deepEqual(got.comments.map((c) => [c.id, c.answered]), [["t1_a1", true], ["t1_b2", false]]);
  assert.equal(got.results.length, 1);
  assert.equal(got.results[0].kind, "replied");
});

test("comments under our subreddit's posts get answers for Carlos; an approval ships with the next upload and the app's line marks it posted", async () => {
  const db = fakeDb();
  const seen = [];
  const d = deps(db, { fetch: async (url, req) => (url.includes("generativelanguage") ? gemini(req, seen) : json(404, {})) });
  await db.collection("engagement_private").doc("reddit").set({ tokenHash: R.hash("t".repeat(64)) });
  await assert.rejects(R.handle(d, { op: "engagement-reddit-sync" }, "x".repeat(64)), (e) => e.status === 403);
  await assert.rejects(R.handle(d, { op: "engagement-reddit-sync" }, ""), (e) => e.status === 401);

  const first = await R.handle(d, { op: "engagement-reddit-sync", comments: [comment("t1_a1"), comment("t1_b2", { parent: "t1_us0", body: "Nice, thanks", ours: "We score it from field data." }), comment("bad")] }, "t".repeat(64));
  assert.equal(first.chained, 2);
  assert.equal(first.drafted, 1);
  assert.deepEqual(first.queue, []);
  const a = doc(db, "reddit", "t1_a1");
  assert.equal(a.chain.on, "post");
  assert.equal(a.chain.ours, "12 new live reports");
  assert.equal(a.thread, "t3_p1");
  assert.equal(a.url, "https://www.reddit.com/r/QALabLiveReports/comments/p1/live/a1/");
  assert.equal(a.actions.like, undefined, "the app cannot upvote");
  assert.equal(a.actions.reply.status, "waiting");
  assert.equal(seen[0][0].on, "our post");

  const key = E.keyOf("reddit", "t1_a1");
  const approved = await J.decide(d, { key, decision: "approve" }, "carlos");
  assert.match(approved.message, /the Reddit app posts it with its next hourly upload/);
  const next = await R.sync(d, {});
  assert.deepEqual(next.queue, [{ key, id: "t1_a1", text: "We score it from field data, then lab runs." }]);
  assert.equal(next.upload, true);
  assert.equal((await R.sync(d, { uploaded: [key] })).upload, false, "once uploaded, it waits for the app");
  assert.equal((await R.sync(Object.assign({}, d, { now: NOW + 4 * HOUR }), {})).upload, true, "an upload the app never confirmed goes again");

  const done = await R.sync(d, { results: [{ kind: "replied", at: "2026-11-05T15:30:00Z", key, id: "t1_us1", url: "https://www.reddit.com/r/QALabLiveReports/comments/p1/live/us1/" }] });
  assert.equal(done.posted, 1);
  assert.deepEqual(done.queue, []);
  const r = db.data.get("engagement_posts/" + key).actions.reply;
  assert.equal(r.status, "posted");
  assert.equal(r.url, "https://www.reddit.com/r/QALabLiveReports/comments/p1/live/us1/");
  assert.equal(db.data.get("engagement_private/reddit").posted, 1);
});

test("a reply the app keeps failing turns failed after 3 runs, each run counted once", async () => {
  const db = fakeDb();
  const d = deps(db, { fetch: async () => json(404, {}) });
  const key = E.keyOf("reddit", "t1_f1");
  await db.collection("engagement_posts").doc(key).set({ network: "reddit", id: "t1_f1", actions: { reply: { status: "approved", draft: "Thanks for asking." } } });
  const fail = (at) => ({ kind: "reply-failed", key, at, error: "RATELIMIT" });
  await R.sync(d, { results: [fail("2026-11-05T13:00:00Z"), fail("2026-11-05T13:00:00Z"), fail("2026-11-05T13:30:00Z")] });
  assert.equal(db.data.get("engagement_posts/" + key).actions.reply.tries, 2);
  assert.equal(db.data.get("engagement_posts/" + key).actions.reply.status, "approved");
  await R.sync(d, { results: [fail("2026-11-05T14:00:00Z")] });
  assert.equal(db.data.get("engagement_posts/" + key).actions.reply.status, "failed");
  assert.equal(db.data.get("engagement_posts/" + key).actions.reply.error, "RATELIMIT");
});
