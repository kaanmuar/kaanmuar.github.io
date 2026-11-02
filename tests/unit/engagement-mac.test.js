"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const A = require("../../functions/engagement-act.js");
const J = require("../../functions/jarvis-engagement.js");
const Agent = require("../../scripts/engagement-mac/agent.js");
const N = require("../../scripts/engagement-mac/networks.js");
const { fakeDb } = require("./fixtures/fake-firestore.js");

const NOW = Date.parse("2026-11-01T18:00:00Z");
const HOUR = 3600000;
const ago = (h) => new Date(NOW - h * HOUR).toISOString();

/** A network that records its clicks instead of opening Chrome. */
function fakeNet(name, calls, extra) {
  return Object.assign({
    name, queries: ["accessibility"],
    read: async (page, q) => { calls.push(name + " read " + q); return [N.post(name.toLowerCase(), { id: "9", url: "https://x.com/ana/status/9", handle: "ana", text: "WCAG 2.2 focus order #a11y", likes: "1.2K", replies: "12 replies", reposts: "40" })]; },
    account: async () => "@qalaburlreview",
    like: async (page, d) => { calls.push(name + " like " + d.key); return { url: d.url }; },
    repost: async (page, d) => { calls.push(name + " repost " + d.key); return { url: d.url }; },
    follow: async (page, d) => { calls.push(name + " follow " + d.key); return { url: d.url }; },
    reply: async (page, d, text) => { calls.push(name + " reply " + d.key + " " + text); return { url: "https://x.com/qalaburlreview/status/10" }; }
  }, extra || {});
}

function fakeChrome(calls, jar) {
  return async (state, visible) => { calls.push("open " + (visible ? "visible" : "hidden")); return { page: { goto: async () => null }, cookies: async () => Object.assign({}, jar), close: async () => { calls.push("close"); } }; };
}

async function seed(db, live) {
  await db.collection("jarvis_settings").doc("engagement").set({ live: !!live });
  await db.collection("engagement_private").doc("mac").set({ at: ago(0.1), signedIn: { x: "@qalaburlreview" }, readAt: ago(0.2) });
  await db.collection("engagement_posts").doc("x_a").set({ network: "x", id: "1", url: "https://x.com/ana/status/1", seenAt: ago(1), score: 5, author: { handle: "ana" }, actions: { like: { status: "planned" }, repost: { status: "planned" } } });
  await db.collection("engagement_posts").doc("x_b").set({ network: "x", id: "2", url: "https://x.com/bo/status/2", seenAt: ago(1), score: 4, author: { handle: "bo" }, actions: { reply: { status: "approved", draft: "Focus order matters.", lang: "en" } } });
  await db.collection("engagement_posts").doc("bluesky_a").set({ network: "bluesky", id: "at://a", seenAt: ago(1), score: 5, author: {}, actions: { like: { status: "planned" } } });
}

const deps = (db, calls, jar, extra) => Object.assign({ db, now: NOW, inc: (n) => ({ inc: n }), state: "/tmp/none", host: "mac", sleep: async () => {}, networks: { x: fakeNet("X", calls) }, open: fakeChrome(calls, jar || { x: true }) }, extra || {});
const status = (db, key, a) => db.data.get("engagement_posts/" + key).actions[a].status;

test("parses the counts the networks show", () => {
  assert.deepEqual(["1.2K", "12,345", "1,2 mil", "3 replies", "1234 views. View post analytics", "2.5M", ""].map(N.num), [1200, 12345, 1200, 3, 1234, 2500000, 0]);
  assert.equal(N.linkedinTime("7240000000000000000").slice(0, 10), "2024-09-12");
  assert.equal(N.tiktokTime("7432000000000000000").slice(0, 10), "2024-10-31");
  assert.deepEqual(N.post("x", { id: 1, url: "u", handle: "@ana", text: "Try #a11y and #WCAG" }).tags, ["a11y", "WCAG"]);
});

test("a dry run logs the Mac's likes and reposts without opening Chrome, and an approved reply still posts", async () => {
  const db = fakeDb();
  const calls = [];
  await seed(db, false);
  await db.collection("engagement_private").doc("mac").set({ readAt: ago(0.1) }, { merge: true });
  const me = await Agent.runOnce(deps(db, calls));
  assert.equal(status(db, "x_a", "like"), "dry");
  assert.equal(status(db, "x_a", "repost"), "dry");
  assert.equal(status(db, "x_b", "reply"), "posted");
  assert.equal(db.data.get("engagement_posts/x_b").actions.reply.url, "https://x.com/qalaburlreview/status/10");
  assert.equal(status(db, "bluesky_a", "like"), "planned", "the API side carries Bluesky out, not the Mac");
  assert.deepEqual(calls, ["open hidden", "X reply x_b Focus order matters.", "close"]);
  assert.equal(me.acted.x.dry, 2);
  assert.equal(me.acted.x.posted, 1);
});

test("live, the Mac clicks the plan out, reads a search into the inbox, and checks in", async () => {
  const db = fakeDb();
  const calls = [];
  await seed(db, true);
  await db.collection("engagement_private").doc("mac").set({ readAt: ago(1) }, { merge: true });
  const me = await Agent.runOnce(deps(db, calls));
  assert.equal(status(db, "x_a", "like"), "done");
  assert.equal(status(db, "x_a", "repost"), "done");
  assert.deepEqual(calls.filter((c) => c.startsWith("X")), ["X reply x_b Focus order matters.", "X like x_a", "X repost x_a", "X read accessibility"]);
  const inbox = Array.from(db.data.keys()).filter((k) => k.startsWith("engagement_inbox/"));
  assert.equal(inbox.length, 1);
  const got = db.data.get(inbox[0]);
  assert.deepEqual(got.read, { x: 1 });
  assert.equal(got.posts[0].metrics.likes, 1200);
  const mac = db.data.get("engagement_private/mac");
  assert.equal(mac.signedIn.x, "@qalaburlreview");
  assert.equal(mac.readAt, me.at);
  assert.equal(db.data.get("engagement_daily/2026-11-01").n.x.like_done, 1);
});

test("a network that signed the Mac out stops, and a challenge waits for a new sign-in", async () => {
  const db = fakeDb();
  const calls = [];
  await seed(db, true);
  let me = await Agent.runOnce(deps(db, calls, { x: false }));
  assert.equal(me.signedIn.x, undefined);
  assert.match(me.errors.x, /signed the Mac out/);
  assert.equal(status(db, "x_a", "like"), "planned");

  const db2 = fakeDb();
  await seed(db2, true);
  const wall = fakeNet("X", calls, { like: async () => { throw new A.ActError("X asks to sign in again (/i/flow/login).", true); }, reply: async () => { throw new A.ActError("X asks to sign in again (/i/flow/login).", true); } });
  me = await Agent.runOnce(deps(db2, calls, { x: true }, { networks: { x: wall } }));
  assert.match(me.errors.x, /sign in again/);
  assert.equal(status(db2, "x_a", "like"), "planned", "a fatal error leaves the plan for the next pass");
  assert.equal(status(db2, "x_b", "reply"), "approved");
});

test("a pause stops the Mac: nothing clicked, nothing read, still checks in", async () => {
  const db = fakeDb();
  const calls = [];
  await seed(db, true);
  await db.collection("jarvis_settings").doc("engagement").set({ live: true, paused: true });
  await db.collection("engagement_private").doc("mac").set({ readAt: ago(5) }, { merge: true });
  const me = await Agent.runOnce(deps(db, calls));
  assert.deepEqual(calls, []);
  assert.equal(me.paused, true);
  assert.equal(status(db, "x_a", "like"), "planned");
});

test("Sign in on the Mac: Jarvis asks, the next pass opens the sign-in on screen and records who signed in", async () => {
  const db = fakeDb();
  const calls = [];
  await db.collection("engagement_private").doc("mac").set({ at: ago(0.05), signedIn: {} });
  const asked = await J.connect({ db, now: NOW }, { network: "linkedin" });
  assert.equal(asked.mac, true);
  assert.match(asked.message, /within 5 minutes/);
  await assert.rejects(A.askMacLogin({ db, now: NOW }, "bluesky"), /The Mac signs in to X, LinkedIn/);
  const nets = { linkedin: fakeNet("LinkedIn", calls, { account: async () => "Carlos Muñoz" }) };
  const me = await Agent.runOnce(deps(db, calls, { linkedin: true }, { networks: nets, loginWait: 50 }));
  assert.equal(me.signedIn.linkedin, "Carlos Muñoz");
  assert.equal(db.data.get("engagement_private/mac_login"), undefined);
  assert.equal(calls[0], "open visible");

  const late = await A.askMacLogin({ db: fakeDb(), now: NOW }, "x");
  assert.match(late.message, /not installed yet/);
});

/** A LinkedIn post page whose identity switch acts as `as`, or has no switch when as is null. */
function fakeLinkedIn(as, calls) {
  const state = { as, picked: false };
  const el = (sel, onClick) => ({
    first() { return this; }, last() { return this; },
    count: async () => 1, isVisible: async () => true, scrollIntoViewIfNeeded: async () => null, innerText: async () => "",
    click: async () => { calls.push("click " + sel); onClick(); }
  });
  const toggle = Object.assign(el("switch", () => null), {
    isVisible: async () => state.as !== null, locator: () => ({ first: () => ({ getAttribute: async () => state.as }) })
  });
  const dialog = Object.assign(el("dialog", () => null), {
    locator: (sel) => (sel.includes(N.LI_AS) ? el("page", () => { state.picked = true; }) : /Save/.test(sel) ? el("save", () => { if (state.picked) state.as = N.LI_AS; }) : el("other", () => null))
  });
  return { state, locator: (sel) => (sel === "[role=dialog]" ? dialog : toggle) };
}

test("LinkedIn acts as the company page, never as the member, and never follows", async () => {
  assert.deepEqual(require("../../functions/engagement.js").NETWORKS.linkedin.only, ["like", "repost", "reply"]);
  assert.equal(N.NETWORKS.linkedin.follow, undefined);

  const calls = [];
  await assert.rejects(N.liAsPage(fakeLinkedIn(null, calls)), /no switch to act as QA-lab URL Review/);
  await N.liAsPage(fakeLinkedIn("QA-lab URL Review", calls));
  assert.deepEqual(calls, []);

  const page = fakeLinkedIn("Carlos Muñoz", calls);
  await N.liAsPage(page);
  assert.equal(page.state.as, "QA-lab URL Review");
  assert.deepEqual(calls.map((c) => c.split(" ")[1]), ["switch", "page", "save"]);
});

test("the scout takes the Mac's inbox once and drops old or foreign posts", async () => {
  const db = fakeDb();
  const p = (network, id) => ({ network, id, url: "https://x.com/a/status/" + id, text: "WCAG" });
  await db.collection("engagement_inbox").doc(ago(0.2)).set({ at: ago(0.2), posts: [p("x", "1"), p("bluesky", "2")], read: { x: 1 }, errors: { tiktok: "TikTok shows a captcha." } });
  await db.collection("engagement_inbox").doc(ago(5)).set({ at: ago(5), posts: [p("x", "3")], read: { x: 1 } });
  const got = await J.inbox(db, NOW);
  assert.deepEqual(got.posts.map((x) => x.id), ["1"]);
  assert.deepEqual(got.read, { x: 1 });
  assert.equal(got.errors.tiktok, "TikTok shows a captcha.");
  assert.equal(Array.from(db.data.keys()).filter((k) => k.startsWith("engagement_inbox/")).length, 0);
});

test("Jarvis lists the Mac's networks under Accounts, says what the Mac needs, and an approved X reply waits for it", async () => {
  const db = fakeDb();
  await db.collection("engagement_private").doc("mac").set({ at: ago(0.05), signedIn: { x: "@qalaburlreview" }, errors: { threads: "Threads shows a captcha." } });
  const rows = await A.connections(db);
  const x = rows.find((r) => r.network === "x");
  assert.deepEqual([x.via, x.connected, x.account], ["mac", true, "@qalaburlreview"]);
  const th = rows.find((r) => r.network === "threads");
  assert.equal(th.connected, false);
  assert.match(th.help, /Sign in on the Mac/);
  const src = await J.source({ db, now: NOW, days: 7, env: {} });
  assert.equal(src.mac.late, false);
  assert.ok(src.needs.some((n) => /Mac is not signed in to LinkedIn, Facebook, Instagram, Threads, TikTok/.test(n)), src.needs.join("\n"));
  assert.match(src.networks.find((n) => n.network === "x").acts, /^Mac browser as @qalaburlreview: likes, reposts, follows and replies \(dry run/);
  assert.equal(src.networks.find((n) => n.network === "tiktok").reads, "needs sign-in on the Mac");

  await db.collection("engagement_posts").doc("x_0123456789abcdef0123").set({ network: "x", id: "1", actions: { reply: { status: "waiting", draft: "Hi", lang: "en", expiresAt: ago(-3) } }, seenAt: ago(1) });
  const out = await J.decide({ db, now: NOW, inc: (n) => ({ inc: n }) }, { key: "x_0123456789abcdef0123", decision: "approve" }, "carlos");
  assert.match(out.message, /the Mac posts it on X within 5 minutes/);

  await db.collection("engagement_private").doc("mac").set({ at: ago(2) }, { merge: true });
  const stale = await J.source({ db, now: NOW, days: 7, env: {} });
  assert.ok(stale.needs.some((n) => /Mac browser agent last checked in 120 minutes ago/.test(n)));
});
