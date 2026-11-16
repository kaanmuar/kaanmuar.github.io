"use strict";
// Telegram and Reddit in the field through the Mac's browser (#2614 part 2): who carries out what, groups found and
// joined within a warmed-up cap with a log of each, and the topics in other languages.
const test = require("node:test");
const assert = require("node:assert/strict");
const E = require("../../functions/engagement.js");
const M = require("../../functions/engagement-mac.js");
const J = require("../../functions/jarvis-engagement.js");
const Joins = require("../../functions/engagement-joins.js");
const Reddit = require("../../functions/engagement-reddit.js");
const { rdPosts } = require("../../scripts/engagement-browser/networks.js");
const { fakeDb } = require("./fixtures/fake-firestore.js");

const NOW = Date.parse("2026-11-05T15:00:00Z");
const HOUR = 3600000;
const DAY = 24 * HOUR;
const ago = (h) => new Date(NOW - h * HOUR).toISOString();
const TOKEN = "t".repeat(48);
const deps = (db, extra) => Object.assign({ db, fetch: async () => ({ ok: false, status: 500, json: async () => ({}) }), env: {}, now: NOW, inc: (n) => ({ inc: n }), push: async () => {} }, extra || {});

async function paired(live) {
  const db = fakeDb();
  await db.collection("engagement_private").doc("mac").set({ tokenHash: M.hash(TOKEN), pairedAt: ago(1) });
  if (live) await db.collection("jarvis_settings").doc("engagement").set({ live: true });
  return db;
}

const sub = (id, extra) => Object.assign({ network: "reddit", id, name: "r/" + id, url: "https://www.reddit.com/r/" + id + "/", members: 50000, lang: "en", about: "", kind: "subreddit", open: true }, extra);

test("topics match in other languages, Chinese and Japanese without spaces, and each language has its own searches", () => {
  assert.equal(E.relevance("Busco curso de automatización de pruebas con Playwright").topic, "Testing");
  assert.equal(E.relevance("Digitale Barrierefreiheit ab 2025 Pflicht").topic, "Accessibility");
  assert.deepEqual(E.relevance("Нужен тестировщик на автотесты").words, ["автотест", "тестировщик"]);
  assert.equal(E.relevance("我们在做自动化测试的方案").topic, "Testing");
  assert.equal(E.relevance("ウェブアクセシビリティの基本").topic, "Accessibility");
  assert.equal(E.relevance("Mi gato duerme mucho").hits, 0);
  const langs = new Set(E.DISCOVERY.map((d) => d.lang));
  ["es", "pt", "de", "fr", "it", "ru", "ja", "zh", "ar", "hi"].forEach((l) => assert.ok(langs.has(l), l));
  assert.deepEqual(E.DISCOVERY.slice(0, 2).map((d) => d.lang), ["es", "pt"], "languages take turns");
  assert.ok(E.DISCOVERY.every((d) => d.q && !/[\\?()]/.test(d.q)), "searches are plain words");
});

test("field posts on Telegram and Reddit are the Mac's; comments under our posts stay with the bot and the Reddit app", async () => {
  const db = await paired(true);
  const put = (key, d) => db.collection("engagement_posts").doc(key).set(Object.assign({ seenAt: ago(1), score: 5, lang: "en", author: { handle: "ana" } }, d));
  await put("telegram_aaaaaaaaaaaaaaaaaaaa", { network: "telegram", via: "mac", id: "qa_chat/12", url: "https://t.me/qa_chat/12", actions: { like: { status: "planned" } } });
  await put("telegram_bbbbbbbbbbbbbbbbbbbb", { network: "telegram", id: "-100:5", url: "https://t.me/c/1/5", chain: { parent: "x" }, actions: { like: { status: "planned" } } });
  await put("reddit_cccccccccccccccccccc", { network: "reddit", via: "mac", id: "t3_abc", title: "How do you test focus order?", url: "https://www.reddit.com/r/accessibility/comments/abc/x/", actions: { repost: { status: "planned" }, reply: { status: "approved", draft: "We tab through it with a screen reader on." } } });
  await put("reddit_dddddddddddddddddddd", { network: "reddit", id: "t1_def", url: "https://www.reddit.com/r/QALabLiveReports/comments/1/x/def/", actions: { reply: { status: "approved", draft: "Thanks for reading it." } } });

  const q = await M.queue(deps(db), { networks: ["telegram", "reddit"] });
  assert.deepEqual(q.tasks.map((t) => t.key + ":" + t.action).sort(), ["reddit_cccccccccccccccccccc:reply", "reddit_cccccccccccccccccccc:repost", "telegram_aaaaaaaaaaaaaaaaaaaa:like"]);
  assert.equal(q.tasks.find((t) => t.action === "repost").title, "How do you test focus order?", "a crosspost keeps the post's title");
  const app = await Reddit.queue(deps(db), E.settings({ live: true }));
  assert.deepEqual(app.items.map((i) => i.key), ["reddit_dddddddddddddddddddd"], "the Reddit app takes only replies under our posts");
  await assert.rejects(M.result(deps(db), { key: "telegram_bbbbbbbbbbbbbbbbbbbb", action: "like", ok: true }), /gone/, "the bot's comment is not the Mac's");
});

test("posts the Mac read on Telegram and Reddit are marked as its own, and groups a search found are kept when in our field", async () => {
  const db = await paired(false);
  const posts = [
    { network: "telegram", id: "qa_chat/12", url: "https://t.me/qa_chat/12", author: { handle: "qa_chat", name: "QA chat" }, text: "Автоматизация тестирования на Playwright: с чего начать?", createdAt: ago(2), metrics: { likes: 40, views: 9000 } },
    { network: "reddit", id: "t3_abc", url: "https://www.reddit.com/r/accessibility/comments/abc/x/", author: { handle: "bo" }, title: "WCAG 2.2 focus appearance", text: "", createdAt: ago(2), metrics: { likes: 120, replies: 30 } }
  ];
  const groups = [
    sub("QualityAssurance", { members: 90000, about: "Software testing and QA" }),
    sub("webdev_tiny", { members: 40, about: "web performance" }),
    sub("cats", { about: "Cats" }),
    sub("TestAutomation", { members: 12000, nsfw: true }),
    sub("accessibility", { member: true, members: 30000, about: "Digital accessibility" }),
    { network: "telegram", id: "qa_automation_ru", name: "Автотесты и QA", url: "https://t.me/qa_automation_ru", members: 4200, kind: "channel", lang: "ru", query: "автоматизация тестирования" },
    { network: "telegram", id: "qalab_live", name: "QA-lab Live", url: "https://t.me/qalab_live", members: 900, kind: "channel" }
  ];
  const out = await M.ingest(deps(db), { posts, groups, signedIn: { telegram: true, reddit: true }, accounts: { telegram: "user 1", reddit: "u/carlos" }, agent: "1.4.0" });
  assert.equal(out.read, 2);
  assert.deepEqual(out.groups, { found: 3, groups: 3 });
  assert.equal(db.data.get("engagement_posts/" + E.keyOf("telegram", "qa_chat/12")).via, "mac");
  assert.equal(db.data.get("engagement_posts/" + E.keyOf("reddit", "t3_abc")).via, "mac");
  const qa = db.data.get("engagement_joins/" + E.keyOf("reddit", "qualityassurance"));
  assert.equal(qa.status, "found");
  assert.equal(qa.members, 90000);
  assert.equal(qa.topic, "Testing");
  assert.equal(db.data.get("engagement_joins/" + E.keyOf("reddit", "accessibility")).status, "member", "a group the account is in is logged as such");
  assert.equal(db.data.get("engagement_joins/" + E.keyOf("telegram", "qa_automation_ru")).lang, "ru");
  assert.equal(db.data.get("engagement_joins/" + E.keyOf("telegram", "qalab_live")), undefined, "our own channel is never joined");

  const why = (g) => Joins.cleanGroup(g, E.settings({})).skip;
  assert.equal(why(sub("webdev_tiny", { members: 40, about: "web performance" })), "small");
  assert.equal(why(sub("cats")), "off-topic");
  assert.equal(why(sub("TestAutomation", { nsfw: true })), "nsfw");
  assert.equal(why(sub("SEOtools", { about: "Semrush tips for technical SEO" })), "competitor");
  assert.equal(why(sub("TestAutomation", { open: false })), "private");

  const plan = await M.sites(deps(db));
  assert.ok(plan.topics.length > 50);
  assert.deepEqual(plan.groups.reddit.map((g) => g.q), ["r/accessibility", "r/qualityassurance"], "groups we are in come first");
  assert.deepEqual(plan.groups.telegram.map((g) => g.q), ["@qa_automation_ru"]);
});

async function withGroups(live, from) {
  const db = await paired(live);
  if (from) await db.collection("engagement_private").doc("mac").set({ joinsFrom: { reddit: from } }, { merge: true });
  await Joins.found(deps(db), E.settings({}), [
    sub("QualityAssurance", { members: 90000, about: "Software testing and QA" }),
    sub("softwaretesting", { members: 120000, about: "Software testing" }),
    sub("TechSEO", { members: 60000, about: "Technical SEO" })
  ]);
  return db;
}

test("in a dry run each group is logged once as one we would join, within the first week's one a day", async () => {
  const db = await withGroups(false);
  const q = await M.queue(deps(db), { networks: ["reddit"] });
  assert.equal(q.tasks.length, 0, "nothing is joined in a dry run");
  assert.equal(q.dry, 1, "the warm-up starts at one a day");
  assert.equal((await M.queue(deps(db), { networks: ["reddit"] })).dry, 0, "the day's one is used");
  assert.equal(db.data.get("engagement_daily/" + E.bogotaDay(NOW)).n.reddit.join_dry, 1);
  assert.equal((await M.queue(deps(db, { now: NOW + DAY }), { networks: ["reddit"] })).dry, 1, "a new day, a new one");
  assert.equal([...db.data.keys()].filter((k) => k.startsWith("engagement_joins/") && db.data.get(k).status === "dry").length, 2);
});

test("live, joins are leased within the warmed-up cap, the warm-up starts at the first join, and each result is logged", async () => {
  const db = await withGroups(true);
  const q = await M.queue(deps(db), { networks: ["reddit", "x"] });
  assert.deepEqual(q.tasks.map((t) => t.action + ":" + t.id), ["join:qualityassurance"], "the best group first, one a day in the first week");
  assert.equal(db.data.get("engagement_private/mac").joinsFrom.reddit, new Date(NOW).toISOString());
  assert.equal((await M.queue(deps(db), { networks: ["reddit"] })).tasks.length, 0, "an open join counts toward the day");

  const key = q.tasks[0].key;
  assert.equal((await M.result(deps(db), { key, action: "join", ok: true, members: 121000 })).status, "joined");
  const doc = db.data.get("engagement_joins/" + key);
  assert.equal(doc.joinedAt, new Date(NOW).toISOString());
  assert.equal(doc.members, 121000);
  assert.equal(db.data.get("engagement_daily/" + E.bogotaDay(NOW)).n.reddit.join_done, 1);

  const src = await J.source({ db, now: NOW, days: 7, env: {} });
  assert.deepEqual(src.joins.log.map((l) => [l.network, l.name, l.lang, l.members, l.status]), [["reddit", "r/QualityAssurance", "en", 121000, "joined"]]);
  assert.equal(src.joins.caps.reddit, 1);
  assert.equal(src.joins.used.reddit, 1);
  assert.equal(src.joins.found.reddit, 2);
  assert.match(src.networks.find((n) => n.network === "reddit").acts, /^Reddit app: replies under our subreddit's posts.*; upvotes, crossposts, follows, comments and joins in the field through the Mac's browser once it is signed in there$/);
  assert.match(src.networks.find((n) => n.network === "telegram").reads, /^Mac browser, not set up; bot, our posts' comments$/);
});

test("the cap climbs after two weeks, never over the settings' or the network's, and refusals retry before they fail", async () => {
  const c = E.settings({ caps: { join: 5 } });
  assert.equal(E.joinCap(c, "reddit", "", NOW), 1);
  assert.equal(E.joinCap(c, "reddit", ago(8 * 24), NOW), 1);
  assert.equal(E.joinCap(c, "reddit", ago(15 * 24), NOW), 2);
  assert.equal(E.joinCap(c, "reddit", ago(30 * 24), NOW), 3, "the network's own cap");
  assert.equal(E.joinCap(E.settings({ caps: { join: 0 } }), "reddit", ago(30 * 24), NOW), 0, "zero turns joins off");
  assert.equal(E.joinCap(c, "x", ago(30 * 24), NOW), 0, "only Telegram and Reddit join");
  assert.equal(E.settings({ caps: { join: 900 } }).caps.join, 20);

  const db = await withGroups(true, ago(15 * 24));
  const q = await M.queue(deps(db), { networks: ["reddit"] });
  assert.equal(q.tasks.length, 2, "two a day in the third week");
  const [a, b] = q.tasks.map((t) => t.key);
  assert.equal((await M.result(deps(db), { key: a, action: "join", ok: false, retry: true, error: "Reddit rate-limited us." })).status, "found");
  for (let i = 0; i < 2; i += 1) assert.equal((await M.result(deps(db), { key: b, action: "join", ok: false, error: "No Join button." })).status, "found");
  assert.equal((await M.result(deps(db), { key: b, action: "join", ok: false, error: "No Join button." })).status, "failed");
  assert.equal((await M.result(deps(db), { key: a, action: "join", ok: true, already: true })).status, "member");
  assert.equal(db.data.get("engagement_daily/" + E.bogotaDay(NOW)).n.reddit.join_failed, 1);
  assert.equal(db.data.get("engagement_daily/" + E.bogotaDay(NOW)).n.reddit.join_done, undefined, "being in it already is not a join");
  await assert.rejects(M.result(deps(db), { key: "reddit_ffffffffffffffffffff", action: "join", ok: true }), /gone/);
});

test("Reddit listings become posts, leaving out NSFW, stickied, locked, removed and our own subreddit's", () => {
  const post = (extra) => ({ data: Object.assign({ name: "t3_a", permalink: "/r/QualityAssurance/comments/a/x/", subreddit: "QualityAssurance", author: "bo", title: "Flaky tests", selftext: "Help", created_utc: NOW / 1000, score: 12, num_comments: 4 }, extra) });
  const got = rdPosts({ data: { children: [post(), post({ name: "t3_b", over_18: true }), post({ name: "t3_c", stickied: true }), post({ name: "t3_d", author: "[deleted]" }), post({ name: "t3_e", subreddit: "QALabLiveReports" }), post({ name: "t3_f", locked: true })] } });
  assert.deepEqual(got.map((p) => p.id), ["t3_a"]);
  assert.equal(got[0].url, "https://www.reddit.com/r/QualityAssurance/comments/a/x/");
  assert.deepEqual(got[0].metrics, { likes: 12, replies: 4, reposts: 0, views: 0 });
});
