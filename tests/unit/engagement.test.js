// Social engagement (#1988): scoring, guardrails, the plan per post, caps, reply decisions, reports, and the
// scout run against an in-memory Firestore.
const test = require("node:test");
const assert = require("node:assert/strict");
const E = require("../../functions/engagement.js");
const S = require("../../functions/engagement-sources.js");
const J = require("../../functions/jarvis-engagement.js");
const push = require("../../functions/jarvis-mail-push.js");

const NOW = Date.parse("2026-11-01T22:00:00Z");
const hoursAgo = (h) => new Date(NOW - h * 3600000).toISOString();
const post = (o) => Object.assign({ network: "mastodon", id: "https://x.social/1", url: "https://x.social/@a/1", author: { handle: "ana@x.social", name: "Ana" }, text: "", lang: "en", createdAt: hoursAgo(2), isReply: false, metrics: { likes: 0, replies: 0, reposts: 0, views: 0 }, tags: [] }, o);
const scored = (o) => { const p = post(o); return Object.assign({ key: E.keyOf(p.network, p.id) }, p, E.score(p, NOW)); };

test("settings fill defaults, clamp numbers and merge a patch", () => {
  const s = E.settings(null);
  assert.equal(s.paused, false);
  assert.deepEqual(s.caps, { like: 60, repost: 15, follow: 15, reply: 15 });
  assert.ok(s.competitors.includes("semrush"));
  assert.equal(E.settings({ caps: { like: -4, reply: 9999 } }).caps.like, 0);
  assert.equal(E.settings({ caps: { reply: 9999 } }).caps.reply, 500);
  const next = E.settingsPatch(s, { paused: true, caps: { reply: 5 }, competitors: "acme, Foo\nbar" });
  assert.equal(next.paused, true);
  assert.equal(next.caps.reply, 5);
  assert.equal(next.caps.like, 60);
  assert.deepEqual(next.competitors, ["acme", "foo", "bar"]);
  assert.throws(() => E.settingsPatch(s, {}), /Nothing to change/);
});

test("relevance counts our field's keywords and hashtags, and nothing else", () => {
  const r = E.relevance("Our #a11y audit: WCAG 2.2 contrast fails and the screen reader skips the menu");
  assert.equal(r.topic, "Accessibility");
  assert.ok(r.hits >= 3);
  assert.ok(r.words.includes("screen readers"));
  assert.equal(E.relevance("Lovely sunset at the beach today").hits, 0);
  assert.equal(E.relevance("geography class").hits, 0);
  assert.equal(E.relevance("Core Web Vitals: INP is the new FID").topic, "Performance");
});

test("score rises with engagement and falls with age", () => {
  const quiet = scored({ text: "Playwright tip for flaky tests" });
  const busy = scored({ text: "Playwright tip for flaky tests", metrics: { likes: 40, replies: 10, reposts: 8 } });
  const old = scored({ text: "Playwright tip for flaky tests", metrics: { likes: 40, replies: 10, reposts: 8 }, createdAt: hoursAgo(40) });
  assert.ok(busy.score > quiet.score);
  assert.ok(busy.score > old.score);
  assert.ok(busy.trend > 0);
});

test("guard leaves alone our own posts, competitors, sensitive news, hashtag spam and old posts", () => {
  const c = E.settings(null);
  assert.equal(E.guard(post({ author: { handle: "carlosandmunoz@mastodon.social" } }), c, NOW), "own");
  assert.equal(E.guard(post({ text: "see carlosandmunoz.com" }), c, NOW), "own");
  assert.equal(E.guard(post({ author: { handle: "semrush", name: "Semrush" } }), c, NOW), "competitor");
  assert.equal(E.guard(post({ text: "RIP to a legend #qa" }), c, NOW), "sensitive");
  assert.equal(E.guard(post({ text: "Election night SEO" }), c, NOW), "sensitive");
  assert.equal(E.guard(post({ text: "Broken images and dead internal links for weeks" }), c, NOW), "");
  assert.equal(E.guard(post({ text: "x #a #b #c #d #e #f #g #h #i" }), c, NOW), "spam");
  assert.equal(E.guard(post({ createdAt: hoursAgo(72) }), c, NOW), "old");
});

test("parseAi keeps rows by id, strips links unless a tool was asked for, drops hashtags and cuts to the limit", () => {
  const a = scored({ id: "a", text: "SEO question" });
  const b = scored({ id: "b", network: "bluesky", text: "Which tool checks WCAG?" });
  const long = "x ".repeat(400);
  const text = JSON.stringify([
    { id: a.key, about: "SEO", lang: "EN", sentiment: "positive", worth: 0.9, reply: "Check the canonical first — see https://example.com/x and www.foo.com #seo" },
    { id: b.key, asksForTool: true, worth: 2, sentiment: "weird", reply: "Our free review at carlosandmunoz.com covers it. " + long },
    { id: "unknown", reply: "ignored" }
  ]);
  const out = E.parseAi("```json\n" + text + "\n```", [a, b]);
  assert.deepEqual(Object.keys(out).sort(), [a.key, b.key].sort());
  assert.equal(out[a.key].reply, "Check the canonical first, see and");
  assert.equal(out[a.key].lang, "en");
  assert.ok(out[b.key].reply.includes("carlosandmunoz.com"));
  assert.ok(out[b.key].reply.length <= 300);
  assert.equal(out[b.key].worth, 1);
  assert.equal(out[b.key].sentiment, "neutral");
  assert.deepEqual(E.parseAi("not json", [a]), {});
});

test("decide plans likes, reposts and follows by score, waits on replies, and respects caps and pause", () => {
  const c = E.settings({ caps: { like: 1 } });
  const p = scored({ text: "Playwright and WCAG: accessibility testing in CI", metrics: { likes: 300, replies: 40, reposts: 60 } });
  assert.ok(p.score >= c.thresholds.follow, "fixture scores high: " + p.score);
  const ai = { worth: 0.8, reply: "We run axe in the same Playwright job.", lang: "en", sentiment: "positive" };
  const used = {};
  const d = E.decide(p, ai, c, used, NOW, new Set());
  assert.equal(d.verdict, "engage");
  assert.equal(d.actions.like.status, "planned");
  assert.equal(d.actions.repost.status, "planned");
  assert.equal(d.actions.follow.status, "planned");
  assert.equal(d.actions.reply.status, "waiting");
  assert.equal(d.actions.reply.expiresAt, new Date(NOW + E.REPLY_TTL).toISOString());
  assert.deepEqual(used.mastodon, { like: 1, repost: 1, follow: 1, reply: 1 });
  const again = E.decide(p, ai, c, used, NOW, new Set(["mastodon:ana@x.social"]));
  assert.equal(again.actions.like.status, "capped");
  assert.equal(again.actions.follow, undefined);
  const paused = E.decide(p, ai, E.settings({ paused: true }), {}, NOW, new Set());
  assert.equal(paused.verdict, "watch");
  assert.equal(paused.actions.reply.status, "paused");
});

test("the default thresholds act on the posts a live run scores, not only on viral ones (#2001)", () => {
  const c = E.settings({});
  const modest = scored({ text: "How do you check accessibility in CI?", createdAt: hoursAgo(12), metrics: { likes: 2, replies: 1, reposts: 1, views: 0 } });
  const ai = { worth: 0.8, reply: "We run axe in the same Playwright job.", lang: "en", sentiment: "positive" };
  const d = E.decide(modest, ai, c, {}, NOW, new Set());
  assert.ok(modest.score > 2 && modest.score < 3, "a live-like score: " + modest.score);
  assert.equal(d.actions.like.status, "planned");
  assert.equal(d.actions.repost, undefined);
  assert.equal(d.actions.reply.status, "waiting");
  assert.equal(E.forAi([modest], c, NOW).length, 1);
  const quiet = scored({ text: "testing", createdAt: hoursAgo(40) });
  assert.equal(E.decide(quiet, null, c, {}, NOW, new Set()).verdict, "watch");
});

test("decide skips political, angry and promo posts, replies only in our six languages, and only reads trend networks", () => {
  const c = E.settings(null);
  const p = scored({ text: "WCAG accessibility", metrics: { likes: 300, replies: 40, reposts: 60 } });
  assert.equal(E.decide(p, { political: true }, c, {}, NOW).skip, "political");
  assert.equal(E.decide(p, { sentiment: "angry" }, c, {}, NOW).skip, "angry");
  assert.equal(E.decide(p, { promo: true }, c, {}, NOW).skip, "promo");
  const ja = E.decide(p, { worth: 0.9, reply: "それは良い", lang: "ja" }, c, {}, NOW);
  assert.equal(ja.actions.reply, undefined);
  assert.equal(ja.actions.like.status, "planned");
  assert.equal(E.decide(Object.assign({}, p, { network: "hn" }), null, c, {}, NOW).verdict, "trend");
});

test("decideReply approves, takes an edit within the network's limit, dismisses, and refuses stale or decided replies", () => {
  const doc = { network: "bluesky", seenAt: hoursAgo(1), actions: { reply: { status: "waiting", draft: "Draft.", expiresAt: hoursAgo(-5) } } };
  const ok = E.decideReply(doc, "approve", "", "carlos", NOW);
  assert.equal(ok.reply.status, "approved");
  assert.equal(ok.counter, "approved");
  assert.equal(ok.waited, 3600000);
  const ed = E.decideReply(doc, "edit", "My own words here.", "carlos", NOW);
  assert.equal(ed.reply.draft, "My own words here.");
  assert.equal(ed.reply.original, "Draft.");
  assert.equal(ed.counter, "edited");
  assert.throws(() => E.decideReply(doc, "edit", "y".repeat(301), "c", NOW), /at most 300/);
  assert.equal(E.decideReply(doc, "dismiss", "", "c", NOW).reply.status, "dismissed");
  assert.throws(() => E.decideReply({ actions: { reply: Object.assign({}, doc.actions.reply, { expiresAt: hoursAgo(1) }) } }, "approve", "", "c", NOW), /expired/);
  assert.throws(() => E.decideReply({ actions: { reply: { status: "approved" } } }, "approve", "", "c", NOW), /already approved/);
  assert.throws(() => E.decideReply({ actions: {} }, "approve", "", "c", NOW), /no reply draft/);
});

test("rollup, report and the report mail add up across days and against the window before", () => {
  const docs = [
    { network: "mastodon", verdict: "engage", topic: "Accessibility", lang: "en", words: ["wcag"], actions: { like: { status: "planned" }, reply: { status: "waiting" } } },
    { network: "mastodon", verdict: "skip", skip: "competitor", topic: "SEO", lang: "es", words: ["seo"], actions: {} },
    { network: "bluesky", verdict: "engage", topic: "Accessibility", lang: "en", words: ["a11y"], actions: { like: { status: "capped" } } }
  ];
  const r1 = E.rollup({ mastodon: 50, bluesky: 30 }, docs, { errors: 1 });
  assert.equal(r1.n.mastodon.read, 50);
  assert.equal(r1.n.mastodon.candidates, 2);
  assert.equal(r1.n.mastodon.like, 1);
  assert.equal(r1.n.mastodon.drafted, 1);
  assert.equal(r1.skip.competitor, 1);
  assert.equal(r1.skip.cap_like, 1);
  const day1 = E.sumInto({ day: "2026-10-31" }, r1);
  const day2 = E.sumInto({ day: "2026-11-01" }, E.sumInto({}, r1));
  day2.n.mastodon.approved = 1;
  day2.decided = 1;
  day2.decideMs = 30 * 60000;
  const r = E.report("weekly", [day1, day2], [E.sumInto({}, r1)], [{ key: "k", network: "mastodon", url: "https://u", title: "WCAG 2.2", score: 9, author: { handle: "ana" } }], NOW);
  assert.equal(r.totals.read, 160);
  assert.equal(r.totals.drafted, 2);
  assert.equal(r.delta.read, 100);
  assert.equal(r.approvalRate, 100);
  assert.equal(r.avgDecideMin, 30);
  assert.equal(r.topics[0].label, "accessibility");
  assert.equal(r.networks.find((n) => n.network === "mastodon").approved, 1);
  const mail = E.reportMail(r);
  assert.match(mail.subject, /^Weekly social engagement/);
  assert.match(mail.body, /Mastodon: 100 read/);
  assert.match(mail.body, /WCAG 2\.2/);
  const p = E.reportPush(r);
  assert.equal(p.kind, "engagement");
  assert.equal(p.tab, "products:engagement");
});

test("reply pushes carry Approve, Edit inline and Dismiss, which notify-act accepts", () => {
  const msg = E.replyPush({ key: "mastodon_0123456789abcdef0123", network: "mastodon", url: "https://x.social/@a/1", score: 7, topic: "SEO", about: "Canonical tags", author: { name: "Ana" }, text: "t", actions: { reply: { draft: "Our draft", lang: "en" } } });
  assert.equal(msg.ref, "engagement:mastodon_0123456789abcdef0123");
  assert.deepEqual(msg.actions.map((a) => a.act), ["approve", "edit", "dismiss"]);
  assert.equal(msg.actions[1].input, "Your reply");
  assert.deepEqual(push.parseAct(msg.ref, "edit"), { type: "engagement", id: "mastodon_0123456789abcdef0123", act: "edit" });
  assert.throws(() => push.parseAct(msg.ref, "approved"));
});

test("readers turn Mastodon and Bluesky posts into the common shape", () => {
  const m = S.mastodonPost({ id: "9", uri: "https://m.s/u/1", url: "https://m.s/@a/1", content: "<p>Hi &amp; <a href='#'>#a11y</a></p>", language: "en", created_at: hoursAgo(1), favourites_count: 3, reblogs_count: 2, replies_count: 1, in_reply_to_id: null, account: { acct: "a@m.s", display_name: "A", followers_count: 10 }, tags: [{ name: "a11y" }] });
  assert.equal(m.text, "Hi & #a11y");
  assert.deepEqual(m.metrics, { likes: 3, replies: 1, reposts: 2, views: 0 });
  const b = S.blueskyPost({ uri: "at://did:plc:x/app.bsky.feed.post/3abc", cid: "c1", author: { handle: "ana.bsky.social", did: "did:plc:x" }, record: { text: "WCAG", langs: ["es"], createdAt: hoursAgo(1), reply: { parent: {} } }, likeCount: 4, repostCount: 1, quoteCount: 1, replyCount: 2 });
  assert.equal(b.url, "https://bsky.app/profile/ana.bsky.social/post/3abc");
  assert.equal(b.isReply, true);
  assert.equal(b.metrics.reposts, 2);
  assert.deepEqual(S.pick(["a", "b", "c"], 1, 2), ["c", "a"]);
  assert.deepEqual(S.readable({}).filter((r) => !r.ok).map((r) => r.network).sort(), ["bluesky", "youtube"]);
});

test("monthly reports cover the calendar month before, against the one before it", () => {
  const w = J.windowOf("monthly", Date.parse("2026-11-01T13:10:00Z"));
  assert.equal(w.days[0], "2026-10-01");
  assert.equal(w.days[w.days.length - 1], "2026-10-31");
  assert.equal(w.prior.length, 30);
  assert.equal(w.prior[0], "2026-09-01");
  const wk = J.windowOf("weekly", NOW);
  assert.equal(wk.days.length, 7);
  assert.equal(wk.days[6], "2026-11-01");
});

// --- An in-memory Firestore, enough for the scout, a decision and the Jarvis source --------------------------

function fakeDb() {
  const data = new Map();
  const get = (path) => data.get(path);
  const merge = (a, b) => {
    const out = Object.assign({}, a);
    Object.entries(b).forEach(([k, v]) => {
      if (v && v.inc !== undefined) out[k] = (out[k] || 0) + v.inc;
      else if (v && typeof v === "object" && !Array.isArray(v)) out[k] = merge(out[k] || {}, v);
      else out[k] = v;
    });
    return out;
  };
  const setPath = (obj, dotted, v) => { const parts = dotted.split("."); let o = obj; parts.slice(0, -1).forEach((p) => { o[p] = Object.assign({}, o[p]); o = o[p]; }); o[parts[parts.length - 1]] = v; };
  const at = (obj, dotted) => dotted.split(".").reduce((o, k) => (o == null ? undefined : o[k]), obj);
  const snap = (path) => ({ id: path.split("/").pop(), exists: data.has(path), data: () => JSON.parse(JSON.stringify(get(path) || {})), get: (k) => at(get(path) || {}, k), ref: docRef(path) });
  function docRef(path) {
    return {
      path, id: path.split("/").pop(),
      get: async () => snap(path),
      set: async (v, o) => { data.set(path, o && o.merge ? merge(get(path) || {}, v) : merge({}, v)); },
      update: async (v) => { const cur = JSON.parse(JSON.stringify(get(path) || {})); Object.entries(v).forEach(([k, x]) => setPath(cur, k, x)); data.set(path, cur); },
      delete: async () => { data.delete(path); }
    };
  }
  function query(coll, filters, order, lim) {
    return {
      where: (f, op, v) => query(coll, filters.concat([[f, op, v]]), order, lim),
      orderBy: (f, dir) => query(coll, filters, [f, dir || "asc"], lim),
      limit: (n) => query(coll, filters, order, n),
      get: async () => {
        let rows = Array.from(data.keys()).filter((p) => p.startsWith(coll + "/") && p.split("/").length === 2).map((p) => snap(p));
        filters.forEach(([f, op, v]) => { rows = rows.filter((s) => { const x = at(s.data(), f); return op === "==" ? x === v : op === ">=" ? x >= v : op === "<" ? x < v : true; }); });
        if (order) rows.sort((a, b) => String(at(a.data(), order[0])).localeCompare(String(at(b.data(), order[0]))) * (order[1] === "desc" ? -1 : 1));
        return { docs: rows.slice(0, lim || rows.length) };
      }
    };
  }
  const db = {
    data,
    collection: (name) => Object.assign(query(name, [], null, 0), { doc: (id) => docRef(name + "/" + id) }),
    getAll: async (...refs) => refs.map((r) => snap(r.path)),
    batch: () => { const ops = []; return { set: (r, v) => ops.push(() => r.set(v)), update: (r, v) => ops.push(() => r.update(v)), commit: async () => { for (const op of ops) await op(); } }; },
    runTransaction: async (fn) => fn({ get: (r) => r.get(), update: (r, v) => r.update(v), set: (r, v) => r.set(v) })
  };
  return db;
}

function fakeFetch(gemini) {
  const toot = (id, text, likes) => ({ id, uri: "https://m.s/u/" + id, url: "https://m.s/@a/" + id, content: "<p>" + text + "</p>", language: "en", created_at: hoursAgo(1), favourites_count: likes, reblogs_count: likes, replies_count: 5, account: { acct: "ana" + id + "@m.s", display_name: "Ana" } });
  return async (url, opts) => {
    const json = (body) => ({ ok: true, status: 200, json: async () => body });
    if (url.includes("/timelines/tag/")) return json([toot("1", "Playwright and WCAG accessibility testing in CI", 200), toot("2", "Pictures of my cat", 900)]);
    if (url.includes("/trends/statuses")) return json([toot("3", "Semrush says SEO is changing", 50)].map((t) => Object.assign(t, { account: { acct: "semrush@m.s", display_name: "Semrush" } })));
    if (url.includes("generativelanguage")) {
      const keys = JSON.parse(JSON.parse(opts.body).contents[0].parts[0].text.split("\n").pop()).map((p) => p.id);
      return json({ candidates: [{ content: { parts: [{ text: JSON.stringify(keys.map((id) => Object.assign({ id, about: "a11y in CI", lang: "en", sentiment: "positive", worth: 0.9, reply: "We run axe in the same Playwright job." }, gemini || {}))) }] } }] });
    }
    return { ok: false, status: 503, json: async () => ({}) };
  };
}

test("a scout run stores the field's posts, plans actions, pushes reply drafts, counts the day, and a decision moves the funnel", async () => {
  const db = fakeDb();
  const pushed = [];
  const deps = { db, fetch: fakeFetch(), env: { GEMINI_API_KEY: "k" }, now: NOW, inc: (n) => ({ inc: n }), push: async (m) => { pushed.push(m); } };
  const run = await J.scout(deps);
  assert.equal(run.fresh, 2, "the cat post is not in our field");
  assert.equal(run.drafted, 1, "the competitor's post gets no draft");
  assert.equal(pushed.length, 1);
  assert.deepEqual(Object.keys(run.errors).sort(), ["devto", "hn", "lobsters"]);
  const kept = Array.from(db.data.entries()).filter(([p]) => p.startsWith("engagement_posts/")).map(([, d]) => d);
  assert.equal(kept.find((d) => d.author.handle === "semrush@m.s").skip, "competitor");
  const day = db.data.get("engagement_daily/" + E.bogotaDay(NOW));
  assert.equal(day.runs, 1);
  assert.equal(day.n.mastodon.drafted, 1);
  assert.equal(day.skip.competitor, 1);
  assert.match(J.runNote(run), /2 new in field, 1 to engage, 1 replies drafted; failed: /);

  const again = await J.scout(Object.assign({}, deps, { now: NOW + 60000 }));
  assert.equal(again.fresh, 0);
  assert.equal(again.updated, 2);

  const key = pushed[0].ref.split(":")[1];
  const out = await J.decide(Object.assign({}, deps, { now: NOW + 600000 }), { key, decision: "edit", text: "We run axe-core inside the Playwright job." }, "carlos");
  assert.equal(out.status, "approved");
  assert.match(out.message, /Your version is approved/);
  const doc = db.data.get("engagement_posts/" + key);
  assert.equal(doc.actions.reply.draft, "We run axe-core inside the Playwright job.");
  assert.equal(db.data.get("engagement_daily/" + E.bogotaDay(NOW)).n.mastodon.edited, 1);
  await assert.rejects(J.decide(deps, { key, decision: "approve" }, "carlos"), /already approved/);

  const src = await J.source({ db, now: NOW + 700000, days: 7, env: {} });
  assert.equal(src.ok, true);
  assert.equal(src.waiting.length, 0);
  assert.equal(src.approved.length, 1);
  assert.equal(src.report.totals.edited, 1);
  assert.equal(src.stale, false);
  assert.ok(src.needs.some((n) => /BLUESKY_APP_PASSWORD/.test(n)));
  assert.equal(src.networks.find((n) => n.network === "linkedin").reads, "Mac browser");
});

test("a paused scout reads and counts but drafts and pushes nothing, and expired drafts are counted", async () => {
  const db = fakeDb();
  await db.collection("jarvis_settings").doc("engagement").set({ paused: true });
  const pushed = [];
  const deps = { db, fetch: fakeFetch(), env: { GEMINI_API_KEY: "k" }, now: NOW, inc: (n) => ({ inc: n }), push: async (m) => { pushed.push(m); } };
  const run = await J.scout(deps);
  assert.equal(run.paused, true);
  assert.equal(run.asked, 0);
  assert.equal(pushed.length, 0);

  await db.collection("jarvis_settings").doc("engagement").set({ paused: false });
  await db.collection("engagement_posts").doc("mastodon_00000000000000000000").set({ network: "mastodon", seenAt: hoursAgo(8), actions: { reply: { status: "waiting", expiresAt: hoursAgo(2) } } });
  const later = await J.scout(Object.assign({}, deps, { now: NOW + 60000 }));
  assert.equal(later.expired, 1);
  assert.equal(db.data.get("engagement_posts/mastodon_00000000000000000000").actions.reply.status, "expired");
});

test("settings save through Jarvis and refuse an empty change", async () => {
  const db = fakeDb();
  const out = await J.saveSettings(db, { paused: true, caps: { like: 30 } }, "carlos", NOW);
  assert.equal(out.settings.paused, true);
  assert.equal((await J.readSettings(db)).caps.like, 30);
  await assert.rejects(J.saveSettings(db, {}, "carlos", NOW), /Nothing to change/);
});
