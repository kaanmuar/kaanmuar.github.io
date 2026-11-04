"use strict";
// The Mac's browser agent (#1991): pairing, the posts it reads, the work it is given, and what it reports back.
const test = require("node:test");
const assert = require("node:assert/strict");
const E = require("../../functions/engagement.js");
const M = require("../../functions/engagement-mac.js");
const J = require("../../functions/jarvis-engagement.js");
const { fakeDb } = require("./fixtures/fake-firestore.js");

const NOW = Date.parse("2026-11-02T15:00:00Z");
const HOUR = 3600000;
const ago = (h) => new Date(NOW - h * HOUR).toISOString();
const TOKEN = "t".repeat(48);

function gemini() {
  return async (url, opts) => {
    const keys = JSON.parse(JSON.parse(opts.body).contents[0].parts[0].text.split("\n").pop()).map((p) => p.id);
    const text = JSON.stringify(keys.map((id) => ({ id, about: "WCAG audits", lang: "en", sentiment: "positive", worth: 0.9, reply: "We check focus order before contrast; it catches more." })));
    return { ok: true, status: 200, json: async () => ({ candidates: [{ content: { parts: [{ text }] } }] }) };
  };
}

async function paired() {
  const db = fakeDb();
  await db.collection("engagement_private").doc("mac").set({ tokenHash: M.hash(TOKEN), pairedAt: ago(1) });
  return db;
}

const deps = (db, extra) => Object.assign({ db, fetch: gemini(), env: { GEMINI_API_KEY: "k" }, now: NOW, inc: (n) => ({ inc: n }), push: async () => {} }, extra || {});
const tweet = (id, text, likes) => ({ network: "x", id, url: "https://x.com/ana/status/" + id, author: { handle: "@ana", name: "Ana" }, text, lang: "en", createdAt: ago(1), metrics: { likes, replies: 20, reposts: 10, views: 40000 } });

test("only a paired Mac gets in, and only with the token it paired", async () => {
  const db = await paired();
  await assert.rejects(M.handle(deps(db), { op: "engagement-mac-queue" }, ""), /Pair the Mac first/);
  await assert.rejects(M.handle(deps(db), { op: "engagement-mac-queue" }, "u".repeat(48)), (e) => e.status === 403);
  await assert.rejects(M.handle(deps(db), { op: "engagement-nope" }, TOKEN), /Unknown Mac op/);
  assert.equal((await M.handle(deps(db), { op: "engagement-mac-queue" }, TOKEN)).ok, true);
});

test("posts the Mac read are cleaned, kept to its networks, scored and planned like the scout's, and the heartbeat says what it saw", async () => {
  const db = await paired();
  const posts = [
    tweet("1", "Our WCAG accessibility audit checklist for 2026", 900),
    tweet("2", "Pictures of my cat", 900),
    Object.assign(tweet("3", "accessibility"), { network: "mastodon" }),
    Object.assign(tweet("4", "accessibility"), { url: "javascript:alert(1)" })
  ];
  const out = await M.ingest(deps(db), { posts, signedIn: { x: true, linkedin: false }, accounts: { x: "@qalabreview" }, errors: { linkedin: "Not signed in." }, agent: "1.0.0" });
  assert.equal(out.read, 2, "a network the Mac does not read and a non-https link are dropped");
  assert.equal(out.fresh, 1, "the cat post is not in our field");
  assert.equal(out.drafted, 1);
  const doc = db.data.get("engagement_posts/" + E.keyOf("x", "1"));
  assert.equal(doc.author.handle, "ana");
  assert.equal(doc.actions.like.status, "planned");
  assert.equal(doc.actions.reply.status, "waiting");
  const mac = db.data.get("engagement_private/mac");
  assert.equal(mac.tokenHash, M.hash(TOKEN), "the heartbeat keeps the pairing");
  assert.deepEqual(mac.read, { x: 2 });
  assert.equal(mac.errors.linkedin, "Not signed in.");
  assert.equal(db.data.get("engagement_daily/" + E.bogotaDay(NOW)).n.x.read, 2);

  const src = await J.source({ db, now: NOW, days: 7, env: {} });
  const x = src.networks.find((n) => n.network === "x");
  assert.equal(x.reads, "Mac browser as @qalabreview");
  assert.equal(x.lastRead, 2);
  assert.match(x.acts, /^Mac browser: likes, reposts, follows and replies \(dry run/);
  assert.ok(src.needs.some((n) => /sign in to LinkedIn in the agent's Chrome: node scripts\/engagement-browser\/agent.js login linkedin/.test(n)));
});

async function seeded(live) {
  const db = await paired();
  if (live) await db.collection("jarvis_settings").doc("engagement").set({ live: true });
  const post = (key, d) => db.collection("engagement_posts").doc(key).set(Object.assign({ seenAt: ago(1), score: 5, lang: "en", url: "https://x.com/a/status/1", author: { handle: "ana" } }, d));
  await post("x_aaaaaaaaaaaaaaaaaaaa", { network: "x", id: "1", actions: { like: { status: "planned" }, follow: { status: "planned" } } });
  await post("x_bbbbbbbbbbbbbbbbbbbb", { network: "x", id: "2", seenAt: ago(8), actions: { like: { status: "planned" } } });
  await post("linkedin_cccccccccccccccccccc", { network: "linkedin", id: "urn:li:activity:3", actions: { reply: { status: "approved", draft: "We audit with real screen readers.", lang: "en" } } });
  await post("bluesky_dddddddddddddddddddd", { network: "bluesky", id: "at://4", actions: { like: { status: "planned" } } });
  return db;
}

test("in a dry run the queue logs likes, reposts and follows as dry but still hands out approved replies", async () => {
  const db = await seeded(false);
  const q = await M.queue(deps(db), {});
  assert.deepEqual(q.tasks.map((t) => t.action), ["reply"]);
  assert.equal(q.tasks[0].draft, "We audit with real screen readers.");
  assert.equal(q.dry, 2);
  assert.equal(q.missed, 1, "a plan older than 6 hours is missed");
  assert.equal(db.data.get("engagement_posts/x_aaaaaaaaaaaaaaaaaaaa").actions.like.status, "dry");
  assert.equal(db.data.get("engagement_posts/bluesky_dddddddddddddddddddd").actions.like.status, "planned", "the API networks are the poster's");
});

test("live, the queue leases each task once, and the results move the plan and the day's counters", async () => {
  const db = await seeded(true);
  const q = await M.queue(deps(db), { networks: ["x", "linkedin"] });
  assert.deepEqual(q.tasks.map((t) => t.network + ":" + t.action).sort(), ["linkedin:reply", "x:follow", "x:like"]);
  assert.equal((await M.queue(deps(db), {})).tasks.length, 0, "a leased task is not handed out twice");
  assert.equal((await M.queue(deps(db, { now: NOW + M.LEASE + 1000 }), {})).tasks.length, 3, "a lease runs out");

  await M.result(deps(db), { key: "x_aaaaaaaaaaaaaaaaaaaa", action: "like", ok: true });
  await M.result(deps(db), { key: "x_aaaaaaaaaaaaaaaaaaaa", action: "follow", ok: false, retry: true, error: "X asked for a check." });
  const doc = db.data.get("engagement_posts/x_aaaaaaaaaaaaaaaaaaaa");
  assert.equal(doc.actions.like.status, "done");
  assert.equal(doc.actions.like.by, "mac");
  assert.equal(doc.actions.follow.status, "planned", "a refusal for now stays queued");
  assert.equal(doc.actions.follow.leasedAt, "");
  assert.equal((await M.result(deps(db), { key: "x_aaaaaaaaaaaaaaaaaaaa", action: "like", ok: true })).note, "Already done.");

  const reply = { key: "linkedin_cccccccccccccccccccc", action: "reply" };
  for (let i = 0; i < 2; i += 1) assert.equal((await M.result(deps(db), Object.assign({ ok: false, error: "The comment box did not open." }, reply))).status, "approved");
  assert.equal((await M.result(deps(db), Object.assign({ ok: false, error: "The comment box did not open." }, reply))).status, "failed", "three tries in all");
  const day = db.data.get("engagement_daily/" + E.bogotaDay(NOW)).n;
  assert.equal(day.x.like_done, 1);
  assert.equal(day.linkedin.failed, 1);
  await assert.rejects(M.result(deps(db), { key: "bluesky_dddddddddddddddddddd", action: "like", ok: true }), /gone/);
  await assert.rejects(M.result(deps(db), { key: "x_aaaaaaaaaaaaaaaaaaaa", action: "delete", ok: true }), /not a task/);
});

test("a LinkedIn like is the reaction that fits the post, and the result keeps the one LinkedIn took (#2444)", async () => {
  const r = (text, extra) => M.reaction(Object.assign({ text }, extra));
  assert.equal(r("Excited to announce we just launched our Playwright course 🎉"), "celebrate");
  assert.equal(r("Estamos orgullosos: lanzamos la nueva guía de accesibilidad"), "celebrate");
  assert.equal(r("Burnout is real in QA teams. Six months of flaky tests broke me."), "support");
  assert.equal(r("Grateful to everyone who joined our WCAG meetup ❤️"), "love");
  assert.equal(r("5 tips to debug INP: a step-by-step guide"), "insightful");
  assert.equal(r("When the test passes locally but fails in CI 😂"), "funny");
  assert.equal(r("Core web vitals report for this week."), "like");
  assert.equal(r("x".repeat(600), { relevance: 2 }), "insightful", "a long post in our field");
  assert.equal(r("This guide is wrong and dangerous.", { sentiment: "negative" }), "like", "no Insightful on a post we disagree with");
  assert.ok(["fixes", "launch the browser"].every((t) => r(t) === "like"), "a technical launch is no celebration");

  const db = await paired();
  await db.collection("jarvis_settings").doc("engagement").set({ live: true });
  const post = (key, d) => db.collection("engagement_posts").doc(key).set(Object.assign({ seenAt: ago(1), score: 5, lang: "en", url: "https://www.linkedin.com/feed/update/urn:li:activity:9/", author: { handle: "ana" }, actions: { like: { status: "planned" } } }, d));
  await post("linkedin_eeeeeeeeeeeeeeeeeeee", { network: "linkedin", id: "urn:li:activity:9", text: "Thrilled to share that I am now ISTQB certified!" });
  await post("x_ffffffffffffffffffff", { network: "x", id: "9", text: "Thrilled to share that I am now ISTQB certified!" });
  const q = await M.queue(deps(db), {});
  const by = Object.fromEntries(q.tasks.map((t) => [t.network, t.reaction]));
  assert.deepEqual(by, { linkedin: "celebrate", x: "" }, "only LinkedIn has the reactions menu");

  await M.result(deps(db), { key: "linkedin_eeeeeeeeeeeeeeeeeeee", action: "like", ok: true, reaction: "celebrate" });
  assert.equal(db.data.get("engagement_posts/linkedin_eeeeeeeeeeeeeeeeeeee").actions.like.reaction, "celebrate");
  await M.result(deps(db), { key: "x_ffffffffffffffffffff", action: "like", ok: true, reaction: "<b>" });
  assert.equal(db.data.get("engagement_posts/x_ffffffffffffffffffff").actions.like.reaction, undefined, "an unknown reaction is not stored");
});

test("a reply the Mac finds already answered by us is not sent, and counts as already answered (#2424)", async () => {
  const db = await seeded(true);
  const q = await M.queue(deps(db), { networks: ["linkedin"] });
  assert.equal(q.tasks[0].id, "urn:li:activity:3", "the Mac gets the post id to find our earlier reply");
  const r = await M.result(deps(db), { key: "linkedin_cccccccccccccccccccc", action: "reply", ok: false, already: true, url: "https://www.linkedin.com/feed/update/urn:li:activity:3" });
  assert.equal(r.status, "replied");
  const doc = db.data.get("engagement_posts/linkedin_cccccccccccccccccccc");
  assert.equal(doc.actions.reply.status, "replied");
  assert.equal(doc.actions.reply.url, "https://www.linkedin.com/feed/update/urn:li:activity:3");
  assert.equal(doc.actions.reply.leasedAt, "");
  assert.equal(db.data.get("engagement_daily/" + E.bogotaDay(NOW)).n.linkedin.already, 1);
  assert.equal((await M.queue(deps(db), {})).tasks.filter((t) => t.action === "reply").length, 0, "it is not handed out again");
});

test("replies and mentions of us the Mac read in the notifications become chain posts, once each (#2424)", async () => {
  const db = await paired();
  await db.collection("jarvis_settings").doc("engagement").set({ live: true });
  const reply = Object.assign(tweet("50", "@qalaburlreview Does your WCAG audit check focus order?", 3), { liked: false, on: "40", ours: "We audit with real screen readers." });
  const liked = Object.assign(tweet("51", "@qalaburlreview thanks for the accessibility tips", 1), { liked: true, on: "41" });
  const out = await M.ingest(deps(db), { posts: [], comments: [reply, liked, Object.assign(tweet("52", "x"), { url: "javascript:alert(1)" })], signedIn: { x: true } });
  assert.equal(out.chained, 2, "a comment with a non-https link is dropped");
  const doc = db.data.get("engagement_posts/" + E.keyOf("x", "50"));
  assert.equal(doc.chain.on, "post");
  assert.equal(doc.chain.ours, "We audit with real screen readers.");
  assert.equal(doc.thread, "40");
  assert.equal(doc.actions.like.status, "planned", "the Mac likes it on its next run");
  assert.equal(doc.actions.reply.status, "waiting", "the answer waits for Carlos");
  assert.ok(!(db.data.get("engagement_posts/" + E.keyOf("x", "51")).actions.like), "one we already liked is not liked again");
  assert.equal((await M.ingest(deps(db), { posts: [], comments: [reply], signedIn: { x: true } })).chained, 0, "a comment already taken in is not read again");
});

test("the X inbox reads what we said from any timeline nesting: a reply after its @mentions, a long post from note_tweet (#2452)", () => {
  const { xTexts } = require("../../scripts/engagement-browser/networks.js");
  const tweet = (id, legacy, extra) => ({ tweet_results: { result: Object.assign({ __typename: "Tweet", rest_id: id, legacy }, extra) } });
  const page = { data: { user: { result: { timeline: { timeline: { instructions: [{ entries: [
    { content: { itemContent: tweet("40", { full_text: "@ana_qa @bo We audit with real screen readers.", display_text_range: [12, 46] }) } },
    { content: { items: [{ item: { itemContent: { tweet_results: { result: { __typename: "TweetWithVisibilityResults", tweet: { rest_id: "41", legacy: { full_text: "Focus order first 🎯" } } } } } } }] } },
    { content: { itemContent: tweet("42", { full_text: "Short cut…" }, { note_tweet: { note_tweet_results: { result: { text: "The whole long post." } } } }) } },
    { content: { itemContent: tweet("43", { full_text: "@ana_qa ", display_text_range: [8, 8] }) } }
  ] }] } } } } } };
  assert.deepEqual(xTexts(page), { 40: "We audit with real screen readers.", 41: "Focus order first 🎯", 42: "The whole long post." });
  assert.deepEqual(xTexts(null), {});
});

test("a comment whose post text we could not read pushes no empty We said line (#2452)", () => {
  const push = E.replyPush({ key: "x_" + "a".repeat(20), network: "x", url: "https://x.com/ana/status/50", text: "Does it check focus order?", author: { handle: "ana" }, score: 1,
    chain: { on: "post", ours: "" }, actions: { reply: { status: "waiting", draft: "Yes, first." } } });
  assert.ok(!push.lines.some((l) => /^We said/.test(l)));
});

function reportFetch() {
  const index = { reports: [
    { id: "upb", name: "UPB", host: "www.upb.edu.co", overall: 58, areas: { SEO: 70, Accessibility: 41 } },
    { id: "banco", name: "Bancolombia", host: "www.bancolombia.com", overall: 84, areas: { SEO: 90, Security: 77 } }
  ] };
  return async (url, opts) => {
    const json = (body) => ({ ok: true, status: 200, json: async () => body });
    if (url.includes("live-reports/index.json")) return json(index);
    if (url.includes("tinyurl.com")) return { ok: false, status: 503, text: async () => "" };
    const items = JSON.parse(JSON.parse(opts.body).contents[0].parts[0].text.split("\n").pop());
    return json({ candidates: [{ content: { parts: [{ text: JSON.stringify(items.map((p) => ({ id: p.id, aboutSite: true, about: "enrolment", lang: "es", sentiment: "positive", worth: 0.9,
      reply: "¡Felicidades! Hicimos una revisión gratuita de " + p.site.name + " con hallazgos sobre " + p.site.weakest + ": {link}" }))) }] } }] });
  };
}

test("the Mac gets this slot's reviewed-site queries, and the posts naming a site come back as report-reply invites (#2467)", async () => {
  const db = await paired();
  const d = deps(db, { fetch: reportFetch() });
  const s = await M.handle(d, { op: "engagement-mac-sites" }, TOKEN);
  assert.deepEqual(s.queries.sort(), ["Bancolombia", "bancolombia.com", "upb.edu.co"], "the domain, and the name when it says something");

  const hit = Object.assign(tweet("70", "Me matriculé en upb.edu.co, qué buena la web nueva", 4), { lang: "es", query: "upb.edu.co" });
  const miss = Object.assign(tweet("71", "Un post sin nada que ver", 4), { query: "upb.edu.co" });
  const out = await M.ingest(d, { posts: [], reports: [hit, miss, Object.assign(tweet("72", "upb.edu.co"), { query: "" })], signedIn: { x: true } });
  assert.deepEqual(out.reports, { read: 2, matched: 1, drafted: 1 }, "a post with no query is not a site post");
  const doc = db.data.get("engagement_posts/" + E.keyOf("x", "70"));
  assert.equal(doc.campaign, "report-reply");
  assert.equal(doc.report.host, "upb.edu.co");
  assert.equal(doc.actions.reply.status, "waiting");
  assert.match(doc.actions.reply.draft, /https:\/\/qalabreview\.com\/es\/r\/x\/upb\.edu\.co\/[a-f0-9]{6}$/);
  const day = db.data.get("engagement_daily/" + E.bogotaDay(NOW));
  assert.equal(day.report.drafted, 1);
  assert.ok(!day.report.searched, "the cloud's pass counts this slot's sites");
  assert.equal(day.n.x.read, 2);
  assert.deepEqual(db.data.get("engagement_private/mac").read, { x: 2 }, "site searches count in what the Mac read");

  const again = Object.assign(tweet("73", "Otra vez upb.edu.co", 4), { lang: "es", query: "upb.edu.co" });
  assert.equal((await M.ingest(d, { posts: [], reports: [again], signedIn: { x: true } })).reports.drafted, 0, "one invite per site per 30 days");
  assert.deepEqual((await M.handle(d, { op: "engagement-mac-sites" }, TOKEN)).queries.sort(), ["Bancolombia", "bancolombia.com"], "a site we just invited is not searched again");
});

test("a comment on our LinkedIn post becomes a chain post with a like the Mac does as a comment task, quoting our post (#2452)", async () => {
  const db = await paired();
  await db.collection("jarvis_settings").doc("engagement").set({ live: true });
  const urn = "urn:li:comment:(activity:7523410117875273728,7523455839509348352)";
  const comment = { network: "linkedin", id: urn, url: "https://www.linkedin.com/feed/update/urn:li:activity:7523410117875273728?dashCommentUrn=x&actorCompanyId=146731408",
    author: { handle: "", name: "Ana Pérez" }, text: "Do website issues affect the enquiries businesses receive?", createdAt: ago(2), isReply: true,
    liked: false, answered: false, on: "urn:li:activity:7523410117875273728", ours: "Medellín 85, Bogotá 79." };
  const out = await M.ingest(deps(db), { posts: [], comments: [comment], signedIn: { linkedin: true } });
  assert.equal(out.chained, 1);
  const key = E.keyOf("linkedin", urn);
  const doc = db.data.get("engagement_posts/" + key);
  assert.equal(doc.chain.ours, "Medellín 85, Bogotá 79.");
  assert.equal(doc.actions.like.status, "planned", "LinkedIn comments take likes now");
  const task = (await M.queue(deps(db), {})).tasks.find((t) => t.key === key && t.action === "like");
  assert.equal(task.chain, true);
  assert.equal(task.text, comment.text);
  assert.equal(task.reaction, "", "a comment gets a plain like, not a post's reaction");
});

test("a paused engagement hands the Mac nothing", async () => {
  const db = await seeded(true);
  await db.collection("jarvis_settings").doc("engagement").set({ live: true, paused: true });
  const q = await M.queue(deps(db), {});
  assert.equal(q.paused, true);
  assert.equal(q.tasks.length, 0);
});
