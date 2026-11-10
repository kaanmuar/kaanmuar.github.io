"use strict";
// Comment chains that turn into friends (#3137): the tone of each reply, the invite ladder, the outreach ledger,
// the 2-day pass offer with its DM and card, and the Mac sending it within the daily caps.
const test = require("node:test");
const assert = require("node:assert/strict");
const E = require("../../functions/engagement.js");
const J = require("../../functions/jarvis-engagement.js");
const M = require("../../functions/engagement-mac.js");
const T = require("../../functions/chain-trials.js");
const Card = require("../../functions/dm-card.js");
const { fakeDb } = require("./fixtures/fake-firestore.js");

const NOW = Date.parse("2026-11-09T18:00:00Z");
const HOUR = 3600000;
const DAY = 24 * HOUR;
const ago = (h) => new Date(NOW - h * HOUR).toISOString();
const TOKEN = "t".repeat(48);
const PASS = (n) => "https://carlosandmunoz.com/qa-review.html?trial=T" + n;

// Gemini: the chain read answers each comment with rows[author handle] (or a friendly default); the DM prompt gets a DM with the pass link.
function gemini(rows, seen) {
  return async (url, opts) => {
    const prompt = JSON.parse(opts.body).contents[0].parts[0].text;
    const items = JSON.parse(prompt.split("\n").pop());
    if (seen) seen.push(prompt);
    const out = /^People:$/m.test(prompt)
      ? items.map((x) => ({ id: x.id, dm: "Hi " + x.name + "! Loved your point about focus order. We unlocked 2 days of URL review for you: " + x.link + " Enjoy!", english: "" }))
      : items.map((x) => Object.assign({ id: x.id, lang: "en", sentiment: "positive", tone: "nice", like: true, worth: 0.8, reply: "Focus order first, then contrast: it catches the most.", invited: "none" }, (rows || {})[x.author] || {}));
    return { ok: true, status: 200, json: async () => ({ candidates: [{ content: { parts: [{ text: JSON.stringify(out) }] } }] }) };
  };
}

// The outreach ledger (#3136) as the chain pass calls it.
function outreach() {
  const L = { touches: [], mints: [] };
  L.people = { idFor: (network, handle) => network + "_" + handle, touch: async (db, id, patch) => { L.touches.push({ id, patch }); } };
  L.trials = { mintTrial: async (db, o) => { L.mints.push(o); return { code: "T" + L.mints.length, url: PASS(L.mints.length) }; } };
  return L;
}

const conf = (trials) => E.settings({ trials });
const deps = (db, extra) => Object.assign({ db, fetch: gemini(), env: { GEMINI_API_KEY: "k" }, now: NOW, inc: (n) => ({ inc: n }), push: async () => {} }, extra || {});

// Our reply under Ana's post on X, and a comment she left under it.
const PARENT = { key: "x_" + "a".repeat(20), network: "x", id: "p1", thread: "p1", url: "https://x.com/ana/status/p1", author: { handle: "ana", name: "Ana López" }, title: "", text: "How do you test focus order?",
  topic: "Accessibility", score: 3, actions: { reply: { status: "posted", draft: "We tab through every page in CI.", postedAt: ago(5) } } };
const comment = (id, extra) => Object.assign({ network: "x", id, url: "https://x.com/ana/status/" + id, author: { handle: "ana", name: "Ana López" }, text: "Love this, we do the same with axe!", lang: "en", createdAt: ago(1), liked: false, answered: false }, extra || {});
const chain = (parent, c) => [{ parent, comments: [c] }];

test("a reply's tone is Gemini's, but its flags win: an ad is spam, a fight is hostile, a political or negative 'nice' is neutral", () => {
  assert.equal(T.tone({ tone: "nice", sentiment: "positive" }), "nice");
  assert.equal(T.tone({ tone: "nice", promo: true }), "spam");
  assert.equal(T.tone({ tone: "neutral", sentiment: "angry" }), "hostile");
  assert.equal(T.tone({ tone: "nice", argument: true }), "hostile");
  assert.equal(T.tone({ tone: "nice", political: true }), "neutral");
  assert.equal(T.tone({ tone: "nice", sentiment: "negative" }), "neutral");
  assert.equal(T.tone({ sentiment: "positive" }), "nice", "an older read without tone falls back to its sentiment");
  assert.equal(T.tone({ tone: "hostile", sentiment: "neutral" }), "hostile");
  assert.equal(T.tone(null), "neutral");
});

test("the invite ladder climbs one rung per friendly exchange, rests after the link, and never pitches a person who has a pass or said no", () => {
  const t = T.trialSettings();
  assert.deepEqual([0, 1, 2, 3, 4, 9].map((friendly) => T.rung({ friendly }, t, NOW)), ["none", "none", "soft", "soft", "link", "link"]);
  assert.equal(T.rung({ friendly: 6, linkAt: ago(24 * 10) }, t, NOW), "none", "back to plain answers for linkGapDays after the link");
  assert.equal(T.rung({ friendly: 6, linkAt: ago(24 * 31) }, t, NOW), "link");
  ["offered", "claimed", "paid", "declined", "blocked"].forEach((stage) => assert.equal(T.rung({ friendly: 9, stage }, t, NOW), "none", stage));
  assert.equal(T.rung({ friendly: 1 }, T.trialSettings({ soft: 1, link: 1 }), NOW), "soft", "link always sits above soft");
  assert.equal(T.trialSettings({ soft: 1, link: 1 }).link, 2);

  assert.equal(T.used("soft", "link", "We built a free URL review"), "soft", "never above the rung allowed");
  assert.equal(T.used("link", "none", "Try " + T.REVIEW_URL), "link", "a reply with our link used the link rung whatever Gemini said");
  assert.equal(T.used("none", "", "Plain answer"), "none");
});

test("the chain prompt carries each person's rung, site and activity, and only the link rung keeps our link in the answer", () => {
  const items = [
    Object.assign({ key: "x_1", parent: PARENT }, comment("c1"), { invite: "link", site: "ana.dev", active: true }),
    Object.assign({ key: "x_2", parent: PARENT }, comment("c2"), { invite: "soft" })
  ];
  const prompt = E.chainPrompt(items);
  const list = JSON.parse(prompt.split("\n").pop());
  assert.deepEqual(list.map((x) => [x.invite, x.site, x.active]), [["link", "ana.dev", true], ["soft", "", false]]);
  assert.match(prompt, /Invite ladder/);
  assert.match(prompt, /"tone": "nice"/);

  const reply = "Run it on ana.dev: https://carlosandmunoz.com/qa-review.html and also https://spam.example.com";
  const ai = E.parseAi(JSON.stringify(items.map((x) => ({ id: x.key, lang: "en", tone: "nice", invited: "link", worth: 0.9, reply }))), items);
  assert.match(ai.x_1.reply, /carlosandmunoz\.com\/qa-review\.html/);
  assert.ok(!/spam\.example/.test(ai.x_1.reply), "other links still go");
  assert.ok(!/carlosandmunoz/.test(ai.x_2.reply), "below the link rung our link goes too");
  assert.equal(ai.x_1.tone, "nice");
  assert.equal(ai.x_1.invited, "link");
});

test("an active person's comment is always answered, the answer records its rung, and spam is skipped", () => {
  const c = conf();
  const quiet = E.chainDecide(Object.assign(comment("c1"), { invite: "soft" }), { lang: "en", tone: "nice", worth: 0.2, reply: "Thanks, glad it helped you!", invited: "soft" }, c, NOW);
  assert.equal(quiet.actions.reply, undefined, "a low-worth thanks from a stranger gets a like only");
  const friend = E.chainDecide(Object.assign(comment("c1"), { invite: "soft", active: true }), { lang: "en", tone: "nice", worth: 0.2, reply: "Thanks, glad it helped you!", invited: "soft" }, c, NOW);
  assert.equal(friend.actions.reply.status, "waiting");
  assert.equal(friend.actions.reply.invite, "soft");
  assert.equal(friend.tone, "nice");
  const off = E.chainDecide(Object.assign(comment("c1"), { active: true }), { lang: "en", worth: 0.2, reply: "Thanks, glad it helped you!" }, E.settings({ trials: { answerAll: false } }), NOW);
  assert.equal(off.actions.reply, undefined, "answerAll off goes back to the worth threshold");
  const spam = E.chainDecide(comment("c1"), { lang: "en", promo: true, tone: "nice", worth: 0.9, reply: "Buy my course now please" }, c, NOW);
  assert.equal(spam.verdict, "skip");
  assert.equal(spam.tone, "spam");
});

test("stages only move forward: replied, engaged on our own post, nice under their post, declined on hostility, blocked on spam", () => {
  assert.equal(T.nextStage("found", "neutral", false, false), "replied");
  assert.equal(T.nextStage("found", "nice", false, true), "engaged");
  assert.equal(T.nextStage("replied", "nice", true, false), "nice");
  assert.equal(T.nextStage("offered", "nice", true, false), "offered");
  assert.equal(T.nextStage("nice", "neutral", true, false), "nice", "never back");
  assert.equal(T.nextStage("replied", "hostile", true, false), "declined");
  assert.equal(T.nextStage("claimed", "hostile", true, false), "claimed", "a person with a pass keeps their stage");
  assert.equal(T.nextStage("nice", "spam", true, false), "blocked");
  assert.equal(T.nextStage("blocked", "nice", true, false), "blocked");
});

test("a nice reply under their own post touches the ledger, mints a 2-day pass and drafts a cheerful DM for Carlos", async () => {
  const db = fakeDb();
  const L = outreach();
  await db.collection("outreach_people").doc("x_ana").set({ stage: "replied", friendly: 1, lastAt: ago(30), domain: "https://ana.dev/blog" });
  const pushes = [];
  const prompts = [];
  const out = await J.takeChains(deps(db, { outreach: L, fetch: gemini({}, prompts), push: async (m) => pushes.push(m) }), conf(), chain(PARENT, comment("c1")));
  assert.equal(out.offers, 1);
  assert.equal(out.touched, 1);
  assert.deepEqual(L.mints[0], { kind: "social", person: "x_ana", lang: "en", network: "x", handle: "ana", domain: "ana.dev", by: "chain:" + E.keyOf("x", "c1") });

  const doc = (await db.collection("engagement_posts").doc(E.keyOf("x", "c1")).get()).data();
  assert.equal(doc.tone, "nice");
  assert.equal(doc.chain.rootAuthor, "ana");
  assert.equal(doc.actions.dm.status, "waiting", "autoSendDm is off until Carlos turns it on");
  assert.equal(doc.actions.dm.trial.url, PASS(1));
  assert.ok(doc.actions.dm.draft.includes(PASS(1)));
  assert.equal(doc.actions.dm.by, "gemini");
  assert.deepEqual(Object.keys(doc.actions.dm.card).sort(), ["first", "handle", "host", "look"]);
  assert.equal(doc.actions.dm.card.first, "Ana");
  assert.ok(T.LOOKS.includes(doc.actions.dm.card.look));
  assert.match(prompts[0], /"invite":"none"/, "one friendly exchange so far: pure value");
  assert.match(prompts[1], /^People:$/m, "the DM is drafted in its own Gemini read");

  const { id, patch } = L.touches[0];
  assert.equal(id, "x_ana");
  assert.equal(patch.stage, "offered");
  assert.equal(patch.friendly, 2);
  assert.equal(patch.threads[0].id, "p1");
  assert.equal(patch.threads[0].on, "their-post");
  assert.equal(patch.threads[0].theirLast, "Love this, we do the same with axe!");
  assert.equal(patch.threads[0].ourLast, "Focus order first, then contrast: it catches the most.");
  assert.equal(patch.offers[0].code, "T1");
  assert.deepEqual(patch.history.map((h) => h.what), ["comment", "offer"]);

  assert.ok(pushes.some((p) => p.ref === "engagement-dm:" + E.keyOf("x", "c1") && /2-day pass/.test(p.title)), "Carlos gets the DM to approve");
  const parent = (await db.collection("engagement_posts").doc(PARENT.key).get()).data();
  assert.equal(parent.chainUntil, new Date(NOW + 21 * DAY).toISOString(), "a thread with a friendly person keeps being read");
});

test("no pass for a comment on our own post, someone else's reply, a second time, or a hostile reply; the ladder reaches the link", async () => {
  const db = fakeDb();
  const L = outreach();
  await db.collection("outreach_people").doc("x_ana").set({ stage: "offered", friendly: 5, lastAt: ago(2), offers: [{ kind: "social", code: "T0" }] });
  await db.collection("outreach_people").doc("x_bo").set({ stage: "replied", friendly: 4, lastAt: ago(2), domain: "bo.shop" });
  const own = Object.assign({}, PARENT, { key: "", own: true });
  const prompts = [];
  const out = await J.takeChains(deps(db, { outreach: L, fetch: gemini({ "Mia": { tone: "hostile", sentiment: "negative" } }, prompts) }), conf(), [
    { parent: PARENT, comments: [comment("c1")] },
    { parent: PARENT, comments: [comment("c2", { author: { handle: "bo", name: "Bo" } })] },
    { parent: own, comments: [comment("c3", { author: { handle: "cy", name: "Cy" } })] },
    { parent: PARENT, comments: [comment("c4", { author: { handle: "mia", name: "Mia" } })] }
  ]);
  assert.equal(out.offers, 0);
  assert.equal(L.mints.length, 0);
  const items = JSON.parse(prompts[0].split("\n").pop());
  const by = Object.fromEntries(items.map((x) => [x.author, x]));
  assert.equal(by.Bo.invite, "link", "four friendly exchanges: the link with a hook to their site");
  assert.equal(by.Bo.site, "bo.shop");
  assert.equal(by.Bo.active, true);
  assert.equal(by["Ana López"].invite, "none", "a person with a pass is not pitched again");
  const stages = Object.fromEntries(L.touches.map((t) => [t.id, t.patch.stage]));
  assert.deepEqual(stages, { x_ana: "offered", x_bo: "replied", x_cy: "engaged", x_mia: "declined" });
});

test("an answer that expired unanswered is drafted once more for a friendly person, and the ledger is optional until #3136 ships", async () => {
  const db = fakeDb();
  const key = E.keyOf("x", "c1");
  await db.collection("engagement_posts").doc(key).set({ network: "x", id: "c1", chain: { parent: PARENT.key }, tone: "nice", actions: { reply: { status: "expired", draft: "Old" } } });
  const out = await J.takeChains(deps(db, { outreach: null }), conf(), chain(PARENT, comment("c1")));
  assert.equal(out.chained, 1);
  assert.equal(out.offers, 0, "no ledger, no pass");
  const doc = (await db.collection("engagement_posts").doc(key).get()).data();
  assert.equal(doc.redrafted, true);
  assert.equal(doc.actions.reply.status, "waiting");
  const again = await J.takeChains(deps(db, { outreach: null }), conf(), chain(PARENT, comment("c1")));
  assert.equal(again.chained, 0, "already drafted again: left alone");
  await db.collection("engagement_posts").doc(key).update({ "actions.reply.status": "expired" });
  assert.equal((await J.takeChains(deps(db, { outreach: null }), conf(), chain(PARENT, comment("c1")))).chained, 0, "only once");
});

test("Carlos approves, edits or dismisses a DM; an edit that drops the pass link gets it back", async () => {
  const db = fakeDb();
  const key = "x_" + "b".repeat(20);
  const dm = { status: "waiting", draft: "Hi Ana! Here is your pass: " + PASS(1), lang: "en", trial: { code: "T1", url: PASS(1) }, card: { look: "ticket" }, expiresAt: new Date(NOW + DAY).toISOString() };
  await db.collection("engagement_posts").doc(key).set({ network: "x", actions: { dm } });
  const r = await J.decide(deps(db), { key, what: "dm", decision: "edit", text: "Hi Ana, enjoy two days on us!" }, "carlos");
  assert.equal(r.status, "approved");
  const saved = (await db.collection("engagement_posts").doc(key).get()).data().actions.dm;
  assert.equal(saved.draft, "Hi Ana, enjoy two days on us! " + PASS(1));
  assert.equal(saved.edited, true);
  await assert.rejects(J.decide(deps(db), { key, what: "dm", decision: "approve" }, "carlos"), /already approved/);

  assert.equal(T.decideDm({ actions: { dm } }, "dismiss", "", "c", NOW).dm.status, "dismissed");
  assert.throws(() => T.decideDm({ actions: { dm } }, "approve", "", "c", NOW + 2 * DAY), /expired/);
  assert.throws(() => T.decideDm({ actions: {} }, "approve", "", "c", NOW), /no DM draft/);
});

test("the Mac sends approved DMs with their card within each network's daily cap, and the ledger records each one", async () => {
  const db = fakeDb();
  await db.collection("engagement_private").doc("mac").set({ tokenHash: M.hash(TOKEN), pairedAt: ago(1) });
  await db.collection("jarvis_settings").doc("engagement").set({ live: true, trials: { dmCaps: { x: 1, linkedin: 2 } } });
  const dm = (extra) => Object.assign({ status: "approved", draft: "Hi! " + PASS(1), lang: "es", trial: { code: "T1", url: PASS(1) }, card: { look: "sunrise", first: "Ana" } }, extra);
  const put = (key, network, d) => db.collection("engagement_posts").doc(key).set({ network, id: key, url: "https://example.com/" + key, author: { handle: "ana" }, actions: { dm: d } });
  await put("x_" + "1".repeat(20), "x", dm());
  await put("x_" + "2".repeat(20), "x", dm());
  await put("threads_" + "3".repeat(20), "threads", dm());
  await put("linkedin_" + "4".repeat(20), "linkedin", dm({ status: "waiting" }));
  const drawn = [];
  const L = outreach();
  const d = deps(db, { outreach: L, dmCard: async (x) => { drawn.push(x.card.look); return { png: Buffer.from("png"), type: "image/png", alt: "Tarjeta" }; } });
  const q = await M.handle(d, { op: "engagement-mac-queue", networks: ["x", "threads", "linkedin"] }, TOKEN);
  const dms = q.tasks.filter((t) => t.action === "dm");
  assert.equal(dms.length, 1, "X's cap is 1; Threads needs Instagram signed in; a waiting DM is not sent");
  assert.equal(dms[0].network, "x");
  assert.equal(dms[0].card.alt, "Tarjeta");
  assert.equal(dms[0].lang, "es");
  assert.deepEqual(drawn, ["sunrise"]);

  const key = dms[0].key;
  const res = await M.handle(d, { op: "engagement-mac-result", key, action: "dm", ok: true, url: "https://x.com/messages/1", card: "attached" }, TOKEN);
  assert.equal(res.status, "sent");
  const saved = (await db.collection("engagement_posts").doc(key).get()).data().actions.dm;
  assert.equal(saved.cardSent, "attached");
  assert.equal(L.touches[0].id, "x_ana");
  assert.equal(L.touches[0].patch.dms[0].status, "sent");
  assert.equal((await db.collection("engagement_daily").doc(E.bogotaDay(NOW)).get()).data().n.x.dm_sent, 1);

  const next = await M.handle(d, { op: "engagement-mac-queue", networks: ["x", "threads", "instagram"] }, TOKEN);
  assert.deepEqual(next.tasks.filter((t) => t.action === "dm").map((t) => t.network), ["threads"], "X is at its cap for today; Threads goes with Instagram signed in");
  assert.equal(next.tasks.find((t) => t.action === "dm").via, "instagram");
});

test("in a dry run an auto-approved DM waits, while one Carlos approved goes", async () => {
  const db = fakeDb();
  await db.collection("jarvis_settings").doc("engagement").set({ live: false });
  await db.collection("engagement_posts").doc("x_" + "5".repeat(20)).set({ network: "x", author: { handle: "a" }, actions: { dm: { status: "approved", auto: true, draft: "Hi " + PASS(1), card: {} } } });
  await db.collection("engagement_posts").doc("x_" + "6".repeat(20)).set({ network: "x", author: { handle: "b" }, actions: { dm: { status: "approved", draft: "Hi " + PASS(2), card: {} } } });
  const tasks = await M.dmTasks(deps(db, { dmCard: async () => ({ png: Buffer.from("p"), type: "image/png", alt: "" }) }), await J.readSettings(db), ["x"]);
  assert.deepEqual(tasks.map((t) => t.key), ["x_" + "6".repeat(20)]);
});

test("a failed DM is tried again up to three times, then recorded as failed", async () => {
  const db = fakeDb();
  const key = "x_" + "7".repeat(20);
  await db.collection("engagement_posts").doc(key).set({ network: "x", author: { handle: "ana" }, actions: { dm: { status: "approved", draft: "x", tries: 2, card: { look: "ticket" } } } });
  const L = outreach();
  const r = await M.dmResult(deps(db, { outreach: L }), key, { ok: false, error: "No Message button" });
  assert.equal(r.status, "failed");
  assert.equal(L.touches[0].patch.dms[0].status, "failed");
  await db.collection("engagement_posts").doc(key).update({ "actions.dm.status": "approved", "actions.dm.tries": 0 });
  assert.equal((await M.dmResult(deps(db, { outreach: L }), key, { ok: false, retry: true, error: "Signed out" })).status, "approved");
});

test("waiting DMs expire with the replies", async () => {
  const db = fakeDb();
  await db.collection("engagement_posts").doc("x_" + "8".repeat(20)).set({ network: "x", actions: { dm: { status: "waiting", expiresAt: ago(1) } } });
  assert.equal(await J.expire(deps(db)), 1);
  const st = (await db.collection("engagement_posts").doc("x_" + "8".repeat(20)).get()).data().actions.dm.status;
  assert.equal(st, "expired");
});

test("the DM and its card speak the person's language, greet them by first name or handle, and always carry the pass link", () => {
  const trial = { code: "T1", url: PASS(1) };
  T.LANGS.forEach((lang) => {
    const f = T.dmFacts(comment("c1", { lang }), { domain: "www.ana.dev" }, trial);
    assert.equal(f.lang, lang);
    assert.equal(f.host, "ana.dev");
    const text = T.dmFallback(f);
    assert.ok(text.includes(PASS(1)) && text.includes("Ana") && text.includes("ana.dev"), lang + ": " + text);
    const card = Card.facts({ lang, card: { look: f.look, first: f.first, host: f.host }, trial });
    assert.equal(card.lang, lang);
    assert.match(Card.alt(card), /2/);
    assert.ok(JSON.stringify(Card.tree(card)).includes(Card.COPY[lang].head), lang + " headline on the card");
  });
  const noName = T.dmFacts(comment("c1", { author: { handle: "@qa_bob", name: "🚀" }, lang: "ja" }), null, trial);
  assert.equal(noName.lang, "en", "a language we do not write falls back to English");
  assert.equal(noName.first, "@qa_bob");
  assert.match(T.dmFallback(Object.assign({}, noName, { first: "" })), /^Hi! Thanks/);
  Card.LOOKS.forEach((look) => assert.ok(Card.tree(Card.facts({ lang: "fr", card: { look }, trial })), look));
  assert.equal(Card.facts({ card: { look: "nope" } }).look, "confetti");

  const items = [{ key: "k1", facts: T.dmFacts(comment("c1"), null, trial) }, { key: "k2", facts: T.dmFacts(comment("c2", { lang: "de" }), null, trial) }];
  const parsed = T.parseDms(JSON.stringify([{ id: "k1", dm: "Hi Ana, a big thank-you, your pass: " + PASS(1) + " #promo" }, { id: "k2", dm: "Hallo Ana, ohne Link, das geht so nicht." }]), items);
  assert.equal(parsed.k1.by, "gemini");
  assert.ok(!/#promo/.test(parsed.k1.draft));
  assert.equal(parsed.k2.by, "template", "a DM without the pass link falls back to the template");
  assert.match(parsed.k2.draft, /Hallo Ana!/);
});

test("trials settings default to approval for every DM, and Jarvis can change them", () => {
  const s = E.settings(null);
  assert.equal(s.trials.autoSendDm, false);
  assert.equal(s.trials.offers, true);
  assert.deepEqual(s.trials.dmCaps, T.TRIALS.dmCaps);
  const next = E.settingsPatch(s, { trials: { autoSendDm: true, dmCaps: { x: 50 } } });
  assert.equal(next.trials.autoSendDm, true);
  assert.equal(next.trials.dmCaps.x, 20, "a cap stays within what a young account takes");
  assert.equal(next.trials.dmCaps.linkedin, 3);
});
