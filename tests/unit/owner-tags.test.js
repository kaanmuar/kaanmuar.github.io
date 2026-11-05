"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const T = require("../../functions/owner-tags.js");
const A = require("../../functions/engagement-act.js");
const { fakeDb } = require("./fixtures/fake-firestore.js");

const NOW = Date.parse("2026-11-05T15:15:00Z");
const SITE = "https://carlosandmunoz.com";
const METRO = { id: "metrobogota", host: "www.metrodebogota.gov.co", name: "Metro de Bogotá", city: "Bogotá", country: "CO", sector: "transit" };
const VIVA = { id: "u-vivastreet-ie", host: "vivastreet.ie", name: "Vivastreet", country: "IE" };
const FEED = { posts: [
  { id: "runs-2026-10/02-bogota", kind: "review", date: "2026-10-20", report: "metrobogota", alt: "" },
  { id: "auto-2026-11-03/11-vs-vivastreet-ie", kind: "review", date: "2026-11-03", report: null, alt: "Real run, natural competitors card. vivastreet.ie leads: 74. Scores side by side: vivastreet.ie Score 74, SEO 73. donedeal.ie Score 70, SEO 60." },
  { id: "evergreen-2026-11/16-skip-link", kind: "term", date: "2026-11-04", report: null, alt: "Word of the day card." }
] };
const OPEN = { posts: {
  "runs-2026-10/02-bogota": [
    { channel: "bluesky", id: "at://did:plc:us/app.bsky.feed.post/3abc", result: "sent", url: "https://bsky.app/profile/qalaburlreview.bsky.social/post/3abc", at: "2026-10-21T16:00:00Z" },
    { channel: "instagram", id: "ig1", result: "sent", url: "https://www.instagram.com/p/ABC/", at: "2026-10-21T16:00:00Z" }
  ],
  "auto-2026-11-03/11-vs-vivastreet-ie": [{ channel: "mastodon", id: "1175", result: "sent", url: "https://mastodon.social/@qalaburlreview/1175", at: "2026-11-03T16:00:00Z" }]
} };
const BUFFER = { posts: { "runs-2026-10/02-bogota": [
  { channel: "x", id: "b1", result: "sent", url: "https://x.com/qalaburlreview/status/1", at: "2026-10-21T17:00:00Z" },
  { channel: "tiktok", id: "b2", result: "sent", url: "https://www.tiktok.com/@qalaburlreview/video/2", at: "2026-10-21T17:00:00Z" },
  { channel: "linkedin", id: "b3", result: "failed", url: "", at: "2026-10-21T17:00:00Z" }
] } };
const HOME = '<a href="https://twitter.com/metrodebogota">X</a><a href="https://www.instagram.com/metrodebogota/">IG</a>'
  + '<a href="https://www.facebook.com/sharer/sharer.php?u=x">share</a><a href="https://bsky.app/profile/metrodebogota.bsky.social">B</a>'
  + '<script type="application/ld+json">{"sameAs":["https:\\/\\/www.youtube.com\\/@MetrodeBogota","https://www.tiktok.com/@metrodebogota"]}</script>';

function web(opts) {
  const o = opts || {};
  const calls = [];
  const json = (data, status) => ({ ok: (status || 200) < 300, status: status || 200, json: async () => data, text: async () => JSON.stringify(data) });
  const html = (text) => ({ ok: true, status: 200, text: async () => text, json: async () => ({}) });
  const fetch = async (url) => {
    calls.push(url);
    if (url.startsWith(SITE + "/assets/social/feed.json")) return json(FEED);
    if (url.startsWith(SITE + "/assets/live-reports/index.json")) return json({ reports: [METRO, VIVA] });
    if (url.startsWith(SITE + "/assets/social/open-social.json")) return json(OPEN);
    if (url.startsWith(SITE + "/assets/social/buffer.json")) return json(BUFFER);
    if (url.startsWith(SITE + "/assets/social/facebook.json")) return json({}, 404);
    if (url === "https://www.metrodebogota.gov.co/") return html(HOME);
    if (url === "https://vivastreet.ie/" || url === "https://donedeal.ie/") return html('<a href="https://mastodon.social/@' + url.split("/")[2].split(".")[0] + '">M</a>');
    if (url.includes("resolveHandle")) return url.includes("fake") ? json({ error: "not found" }, 400) : json({ did: "did:plc:x" });
    if (url.includes("/.well-known/webfinger")) return json({ subject: "acct:x" });
    if (url.includes("getAuthorFeed")) return json({ feed: [{ post: { uri: "at://did:plc:metro/app.bsky.feed.post/9zz", author: { handle: "metrodebogota.bsky.social" }, record: { text: "Hoy", createdAt: o.old ? "2026-01-01T00:00:00Z" : "2026-11-04T12:00:00Z" } } }] });
    if (url.includes("/api/v1/accounts/lookup")) return json({ id: "77" });
    if (url.includes("/api/v1/accounts/77/statuses")) return json([{ url: "https://mastodon.social/@vivastreet/55", visibility: "public", created_at: "2026-11-02T10:00:00Z", content: "<p>hi</p>" }]);
    if (url.startsWith("https://www.youtube.com/@")) return html('"externalId":"UCabcdefghijklmnopqrstuv"');
    if (url.includes("feeds/videos.xml")) return html("<feed><entry><yt:videoId>vid12345678</yt:videoId><title>Obra</title><published>2026-11-01T00:00:00Z</published></entry></feed>");
    return json({}, 404);
  };
  return { fetch, calls };
}

function deps(db, o) {
  const pushes = [];
  const w = web(o);
  const suggestions = (o && o.suggestions) || [
    { network: "x", handle: "@movilidadbog", name: "Movilidad Bogotá", why: "city transit agency", scope: "city" },
    { network: "x", handle: "BogotaET", name: "El Tiempo Bogotá", why: "local news", scope: "city" },
    { network: "x", handle: "metrodebogota", name: "Metro de Bogotá", why: "the organisation itself", scope: "report" },
    { network: "bluesky", handle: "fake.bsky.social", name: "Made up", why: "?", scope: "report" },
    { network: "facebook", handle: "nope", name: "FB", why: "not text-mentionable", scope: "report" }
  ];
  return {
    d: { db, fetch: w.fetch, env: { GEMINI_API_KEY: "k" }, now: NOW, inc: (n) => ({ inc: n }), site: SITE, push: async (m) => { pushes.push(m); }, gemini: async () => JSON.stringify(suggestions) },
    pushes, calls: w.calls
  };
}

test("profile links become handles per network; share links and paths that are not profiles do not", () => {
  assert.deepEqual(T.handleOf("https://twitter.com/metrodebogota"), { network: "x", handle: "metrodebogota" });
  assert.deepEqual(T.handleOf("https://x.com/intent/tweet?text=a"), null);
  assert.deepEqual(T.handleOf("https://www.instagram.com/p/ABC/"), null);
  assert.deepEqual(T.handleOf("https://bsky.app/profile/Metro.bsky.social"), { network: "bluesky", handle: "metro.bsky.social" });
  assert.deepEqual(T.handleOf("https://mastodon.social/@qalab"), { network: "mastodon", handle: "qalab@mastodon.social" });
  assert.deepEqual(T.handleOf("https://medium.com/@someone"), null);
  assert.deepEqual(T.handleOf("https://www.youtube.com/channel/UCabcdefghijklmnopqrstuv"), { network: "youtube", handle: "channel/UCabcdefghijklmnopqrstuv" });
  assert.equal(T.mentionOf({ network: "youtube", handle: "channel/UCabcdefghijklmnopqrstuv" }), "");
  assert.equal(T.mentionOf({ network: "tiktok", handle: "metro" }), "", "TikTok makes a mention only from its menu");
  assert.deepEqual(T.socialLinksOf(HOME).map((h) => h.network + ":" + h.handle),
    ["x:metrodebogota", "instagram:metrodebogota", "bluesky:metrodebogota.bsky.social", "youtube:MetrodeBogota", "tiktok:metrodebogota"]);
});

test("a comparison card's sites are all its owners; posts about no report are left out", () => {
  const posts = T.ourPosts(FEED, [OPEN, BUFFER, null], [METRO, VIVA]);
  assert.deepEqual(posts.map((p) => p.network + " " + p.key), [
    "mastodon auto-2026-11-03/11-vs-vivastreet-ie", "x runs-2026-10/02-bogota", "tiktok runs-2026-10/02-bogota", "bluesky runs-2026-10/02-bogota", "instagram runs-2026-10/02-bogota"
  ]);
  assert.deepEqual(posts[0].reports.map((r) => r.host), ["vivastreet.ie", "donedeal.ie"]);
  assert.equal(posts[0].id, "https://mastodon.social/@qalaburlreview/1175", "Mastodon finds our post by its URL");
  assert.equal(posts[3].id, "at://did:plc:us/app.bsky.feed.post/3abc");
  assert.equal(T.langOf(METRO), "es");
  assert.equal(T.langOf({ host: "example.de" }), "de");
  assert.equal(T.langOf(VIVA), "en");
});

test("comments put owners first, then related accounts, within the network's cap, character limit and two comments", () => {
  const acct = (handle, kind) => ({ network: "instagram", handle, kind, status: "approved", scopes: ["report:metrobogota"] });
  const owners = [acct("metrodebogota", "owner")];
  const related = Array.from({ length: 12 }, (_, i) => acct("rel" + i, "related"));
  const out = T.comments("instagram", "es", owners, related, "https://qalabreview.com/es/r/ig/metrodebogota.gov.co/ot-abc", 2, false);
  assert.equal(out.length, 2);
  assert.match(out[0].text, /^@metrodebogota ya salió la revisión QA pública de tu sitio: https:\/\/qalabreview\.com\/\S+ cc @rel0 @rel1 @rel2 @rel3$/);
  assert.equal(out[0].mentions.length, 5, "Instagram takes five mentions a comment");
  assert.equal(out[1].text, "cc @rel4 @rel5 @rel6 @rel7 @rel8");
  const x = T.comments("x", "en", [], Array.from({ length: 40 }, (_, i) => ({ network: "x", handle: "account_number_" + i })), "", 2, false);
  assert.ok(x.every((c) => c.text.length <= 280 && c.mentions.length <= 10));
  assert.equal(x.reduce((n, c) => n + c.mentions.length, 0), T.RELATED_MAX);
});

test("a dry run reads owners and suggestions, pushes them, and only counts what it would post", async () => {
  const db = fakeDb();
  const { d, pushes } = deps(db);
  const out = await T.run(d);
  assert.equal(out.live, false);
  assert.equal(out.posts, 5);
  assert.equal(out.discovered, 3);
  const accounts = (await db.collection("owner_tag_accounts").get()).docs.map((s) => s.data());
  const metroOwners = accounts.filter((a) => a.kind === "owner" && a.scopes.includes("report:metrobogota")).map((a) => a.network + ":" + a.handle);
  assert.deepEqual(metroOwners.sort(), ["bluesky:metrodebogota.bsky.social", "instagram:metrodebogota", "tiktok:metrodebogota", "x:metrodebogota", "youtube:MetrodeBogota"]);
  const suggested = accounts.filter((a) => a.status === "suggested" && a.batch === "metrobogota").map((a) => a.handle + " " + a.scopes.join());
  assert.deepEqual(suggested.sort(), ["BogotaET city:bogota", "movilidadbog city:bogota"], "the made-up Bluesky handle, the Facebook one and the owner's own are not waiting");
  assert.equal(accounts.find((a) => a.network === "x" && a.handle === "metrodebogota").status, "approved", "Gemini naming the owner's own account leaves it approved");
  const push = pushes.find((p) => p.ref === "owner-tags:metrobogota");
  assert.deepEqual(push.actions.map((a) => a.act), ["approve", "edit", "dismiss"]);
  assert.equal((await db.collection("engagement_posts").get()).docs.length, 0);
  assert.ok(out.dry > 0);
  assert.ok(out.sample.some((s) => s.network === "x" && s.text.startsWith("@metrodebogota ya salió")));
  assert.match(T.runNote(out), /^owner tags \(dry run\): 5 posts/);
});

test("live: approved accounts are tagged once, new approvals go in the comment left, owners get one reply under their latest post", async () => {
  const db = fakeDb();
  const { d } = deps(db);
  await T.saveSettings(db, { live: true }, "test", NOW);
  await T.run(d);
  let docs = (await db.collection("engagement_posts").get()).docs.map((s) => s.data());
  const tags = docs.filter((x) => x.ownerTags.kind === "tags");
  const onX = tags.filter((x) => x.network === "x");
  assert.equal(onX.length, 1);
  assert.match(onX[0].actions.reply.draft, /^@metrodebogota ya salió .* https:\/\/qalabreview\.com\/es\/r\/x\/metrodebogota\.gov\.co\/ot-/);
  assert.equal(onX[0].actions.reply.status, "approved");
  assert.equal(onX[0].campaign, "owner-tags");
  assert.ok(!tags.some((x) => x.network === "tiktok"), "no tag comments where a typed handle is no mention");
  const viva = tags.find((x) => x.network === "mastodon");
  assert.match(viva.actions.reply.draft, /^@vivastreet@mastodon\.social @donedeal@mastodon\.social your sites are compared/);
  const replies = docs.filter((x) => x.ownerTags.kind === "reply");
  assert.deepEqual(replies.map((x) => x.network + " " + x.id).sort(), [
    "bluesky at://did:plc:metro/app.bsky.feed.post/9zz", "mastodon https://mastodon.social/@vivastreet/55", "mastodon https://mastodon.social/@vivastreet/55", "youtube vid12345678"
  ], "one per owner account: both comparison owners on Mastodon (the fake server gives both the same post)");
  assert.match(replies.find((x) => x.network === "bluesky").actions.reply.draft, /^@metrodebogota\.bsky\.social publicamos una revisión QA pública de metrodebogota\.gov\.co/);
  assert.ok(!/^@/.test(replies.find((x) => x.network === "mastodon").actions.reply.draft), "Mastodon names the owner on its own");

  await T.decide(d, "metrobogota", "edit", "@movilidadbog x:@SecMovilidad", "test");
  const acc = (await db.collection("owner_tag_accounts").get()).docs.map((s) => s.data());
  assert.equal(acc.find((a) => a.handle === "movilidadbog").status, "approved");
  assert.equal(acc.find((a) => a.handle === "BogotaET").status, "rejected");
  assert.equal(acc.find((a) => a.handle === "SecMovilidad").status, "approved");

  await T.run(Object.assign({}, d, { now: NOW + 86400000 }));
  docs = (await db.collection("engagement_posts").get()).docs.map((s) => s.data());
  const again = docs.filter((x) => x.ownerTags.kind === "tags" && x.network === "x").sort((a, b) => a.ownerTags.part - b.ownerTags.part);
  assert.equal(again.length, 2);
  assert.equal(again[1].actions.reply.draft, "cc @SecMovilidad @movilidadbog", "the report's own accounts before the city's");
  assert.equal(docs.filter((x) => x.ownerTags.kind === "reply").length, replies.length, "one reply per owner and report");

  await T.run(Object.assign({}, d, { now: NOW + 2 * 86400000 }));
  assert.equal((await db.collection("engagement_posts").get()).docs.filter((s) => s.data().network === "x").length, 2, "two comments a post at most");
});

test("a paused run posts nothing; a blocked account is never tagged", async () => {
  const db = fakeDb();
  const { d } = deps(db, { suggestions: [] });
  await T.saveSettings(db, { live: true, paused: true }, "test", NOW);
  assert.match(T.runNote(await T.run(d)), /paused/);
  await T.saveSettings(db, { paused: false }, "test", NOW);
  await T.account(d, { url: "https://twitter.com/metrodebogota", status: "blocked" }, "test");
  await T.run(d);
  const docs = (await db.collection("engagement_posts").get()).docs.map((s) => s.data());
  assert.ok(docs.some((x) => x.network === "instagram"));
  assert.ok(!docs.some((x) => x.network === "x"), "the X owner is blocked and nobody else is approved there");
  await assert.rejects(T.account(d, { network: "x", handle: "nobody" }, "test"), /scope/);
});

test("Bluesky mentions carry their DID facet; an e-mail address is no mention", async () => {
  const text = "@metro.bsky.social mira https://x.co cc @otro.bsky.social and mail@site.com";
  const f = A.mentionFacets(text, { "metro.bsky.social": "did:plc:m", "otro.bsky.social": "did:plc:o" });
  assert.deepEqual(f.map((x) => [text.slice(x.index.byteStart, x.index.byteEnd), x.features[0].did]), [["@metro.bsky.social", "did:plc:m"], ["@otro.bsky.social", "did:plc:o"]]);
});
