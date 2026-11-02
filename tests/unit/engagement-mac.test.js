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

test("a paused engagement hands the Mac nothing", async () => {
  const db = await seeded(true);
  await db.collection("jarvis_settings").doc("engagement").set({ live: true, paused: true });
  const q = await M.queue(deps(db), {});
  assert.equal(q.paused, true);
  assert.equal(q.tasks.length, 0);
});
