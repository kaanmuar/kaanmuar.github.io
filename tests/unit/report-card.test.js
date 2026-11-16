"use strict";
// The mini report card (#2466): what it says, and how it rides on report replies on Bluesky, Mastodon and X.
const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("path");
const A = require("../../functions/engagement-act.js");
const M = require("../../functions/engagement-mac.js");
const Card = require("../../functions/report-card.js");
const { fakeDb } = require("./fixtures/fake-firestore.js");

const NOW = Date.parse("2026-11-03T18:00:00Z");
const ago = (h) => new Date(NOW - h * 3600000).toISOString();
const TOKEN = "t".repeat(48);
const PNG = Buffer.from("89504e470d0a1a0a", "hex");
const CARD = { png: PNG, type: "image/png", alt: "Tarjeta de QA-lab URL Review", width: 1200, height: 675, lang: "es" };

const report = (network, score, extra) => Object.assign({
  network, campaign: "report-reply", lang: "es", seenAt: ago(1), score: 4, author: { handle: "ana" },
  report: { host: "who.int", id: "who", name: "World Health Organization", score, shown: score >= 80, weakest: "Security", format: network === "youtube" ? "link" : "card", link: "https://qalabreview.com/es/r/bsky/who.int/a1b2c3" },
  actions: { reply: { status: "approved", draft: "Hicimos una revisión gratuita de who.int: https://qalabreview.com/es/r/bsky/who.int/a1b2c3", lang: "es" } }
}, extra);

test("the card shows the score only from 80 up, otherwise the weakest area, in the reply's language", () => {
  const high = Card.facts(report("bluesky", 92));
  assert.equal(high.score, 92);
  assert.match(Card.alt(high), /obtiene 92\/100/);

  const low = Card.facts(report("bluesky", 61));
  assert.equal(low.score, null);
  assert.equal(low.area, "Seguridad");
  assert.ok(!/61/.test(Card.alt(low)) && !/61/.test(JSON.stringify(Card.tree(low))), "no number under 80, on the card or in its alt text");
  assert.match(Card.alt(low), /vale la pena revisar en seguridad/);
  assert.match(Card.alt(low), /qalabreview\.com\/es\/r\/bsky\/who\.int\/a1b2c3/);

  const stale = Card.facts(report("bluesky", 92, { report: Object.assign(report("bluesky", 92).report, { shown: false }) }));
  assert.equal(stale.score, null, "a report stored as not shown stays hidden");

  const de = Card.facts(report("mastodon", 61, { actions: { reply: { lang: "de" } } }));
  assert.match(Card.alt(de), /Befunde zu Sicherheit/);
  assert.equal(Card.facts(report("x", 61, { lang: "ja", actions: { reply: { lang: "ja" } } })).lang, "en", "a language we do not write falls back to English");
});

test("a TinyURL link stays in the text; the card names the report on qalabreview.com", () => {
  const doc = report("mastodon", 85);
  doc.report.link = "https://tinyurl.com/abc123";
  assert.equal(Card.facts(doc).display, "qalabreview.com/es/r/mast/who.int");
});

test("only report replies on Bluesky, Mastodon and X want a card", () => {
  assert.ok(Card.wants(report("bluesky", 61)));
  assert.ok(Card.wants(report("x", 61)));
  assert.ok(!Card.wants(report("youtube", 61)));
  assert.ok(!Card.wants(Object.assign(report("bluesky", 61), { campaign: "" })));
});

const installed = (() => { try { require.resolve("satori", { paths: [path.join(__dirname, "../../functions")] }); return true; } catch (error) { return false; } })();
test("the card renders as a 1200x675 PNG small enough for Bluesky", { skip: !installed && "satori is not installed in functions/" }, async () => {
  const card = await Card.render(report("bluesky", 92));
  assert.equal(card.png.subarray(1, 4).toString(), "PNG");
  assert.equal(card.png.readUInt32BE(16), 1200);
  assert.equal(card.png.readUInt32BE(20), 675);
  assert.ok(card.png.length < 900 * 1024);
});

test("Bluesky marks every link in a reply with a facet over its bytes", () => {
  const text = "Revisión gratis → https://qalabreview.com/es/r/bsky/who.int.";
  const [f] = A.linkFacets(text);
  assert.equal(f.features[0].uri, "https://qalabreview.com/es/r/bsky/who.int");
  assert.equal(Buffer.from(text).subarray(f.index.byteStart, f.index.byteEnd).toString(), "https://qalabreview.com/es/r/bsky/who.int");
  assert.equal(A.linkFacets("no link here"), undefined);
});

/** Bluesky and Mastodon with media endpoints; fail names an endpoint that answers 500. */
function networks(fail) {
  const calls = [];
  const reply = (status, data) => ({ ok: status < 300, status, text: async () => JSON.stringify(data) });
  const fetch = async (url, o) => {
    const type = (o.headers || {})["Content-Type"] || "";
    const body = typeof o.body === "string" && type.includes("json") ? JSON.parse(o.body) : o.body;
    calls.push({ url, body, type });
    if (fail && url.includes(fail)) return reply(500, { error: "Upload failed" });
    if (url.endsWith("createSession")) return reply(200, { accessJwt: "jwt", did: "did:plc:us", handle: "qalaburlreview.bsky.social" });
    if (url.includes("getPostThread")) return reply(200, { thread: { replies: [] } });
    if (url.includes("getPosts")) return reply(200, { posts: [{ uri: "at://did:plc:ana/app.bsky.feed.post/p1", cid: "cid-p1", record: {} }] });
    if (url.endsWith("uploadBlob")) return reply(200, { blob: { $type: "blob", ref: { $link: "bafy" }, mimeType: "image/png", size: 8 } });
    if (url.endsWith("createRecord")) return reply(200, { uri: "at://did:plc:us/app.bsky.feed.post/r1", cid: "c" });
    if (url.includes("/api/v2/search")) return reply(200, { statuses: [{ id: "55", account: { id: "9", acct: "ana@m.s" } }] });
    if (/\/statuses\/55\/context$/.test(url)) return reply(200, { descendants: [] });
    if (url.endsWith("/api/v2/media")) return reply(202, { id: "m1", url: null });
    if (url.endsWith("/api/v1/media/m1")) return reply(200, { id: "m1", url: "https://files.m.s/m1.png" });
    if (url.endsWith("/api/v1/statuses")) return reply(200, { id: "77", url: "https://mastodon.social/@qalaburlreview/77" });
    return reply(404, { error: "no route " + url });
  };
  return { fetch, calls };
}

async function seeded(docs) {
  const db = fakeDb();
  await db.collection("engagement_private").doc("bluesky").set({ handle: "qalaburlreview.bsky.social", did: "did:plc:us", password: "abcd-efgh-ijkl-mnop" });
  await db.collection("engagement_private").doc("mastodon").set({ base: "https://mastodon.social", token: "mtok", acct: "qalaburlreview" });
  await db.collection("engagement_private").doc("mac").set({ tokenHash: M.hash(TOKEN), pairedAt: ago(1) });
  for (const [key, d] of Object.entries(docs)) await db.collection("engagement_posts").doc(key).set(d);
  return db;
}
const deps = (db, net, extra) => Object.assign({ db, fetch: net.fetch, now: NOW, inc: (n) => ({ inc: n }), sleep: async () => {}, card: async () => CARD }, extra);
const replyOf = (db, key) => db.data.get("engagement_posts/" + key).actions.reply;

test("an approved report reply on Bluesky uploads the card and embeds it with its alt text", async () => {
  const db = await seeded({ bluesky_r: report("bluesky", 61) });
  const net = networks();
  assert.equal((await A.replyNow(deps(db, net), "bluesky_r")).status, "posted");
  const up = net.calls.find((c) => c.url.endsWith("uploadBlob"));
  assert.equal(up.type, "image/png");
  assert.deepEqual(up.body, PNG);
  const rec = net.calls.find((c) => c.url.endsWith("createRecord")).body.record;
  assert.equal(rec.embed.$type, "app.bsky.embed.images");
  assert.equal(rec.embed.images[0].alt, CARD.alt);
  assert.deepEqual(rec.embed.images[0].aspectRatio, { width: 1200, height: 675 });
  assert.equal(rec.facets[0].features[0].uri, "https://qalabreview.com/es/r/bsky/who.int/a1b2c3");
  assert.equal(replyOf(db, "bluesky_r").card, "attached");
});

test("an approved report reply on Mastodon uploads the card with its description and waits for it", async () => {
  const db = await seeded({ mastodon_r: report("mastodon", 92) });
  const net = networks();
  assert.equal((await A.replyNow(deps(db, net), "mastodon_r")).status, "posted");
  const up = net.calls.find((c) => c.url.endsWith("/api/v2/media"));
  assert.ok(up.body instanceof FormData);
  assert.equal(up.body.get("description"), CARD.alt);
  assert.equal(up.body.get("file").type, "image/png");
  assert.ok(net.calls.some((c) => c.url.endsWith("/api/v1/media/m1")), "polled until the image was processed");
  assert.deepEqual(net.calls.find((c) => c.url.endsWith("/api/v1/statuses")).body.media_ids, ["m1"]);
  assert.equal(replyOf(db, "mastodon_r").card, "attached");
});

test("when the upload or the drawing fails, the reply still goes out as text with its link", async () => {
  const db = await seeded({ bluesky_r: report("bluesky", 61), mastodon_r: report("mastodon", 61) });
  const net = networks("uploadBlob");
  assert.equal((await A.replyNow(deps(db, net), "bluesky_r")).status, "posted");
  assert.equal(net.calls.find((c) => c.url.endsWith("createRecord")).body.record.embed, undefined);
  assert.equal(replyOf(db, "bluesky_r").card, "text");
  assert.match(replyOf(db, "bluesky_r").cardError, /uploadBlob answered 500/);

  const net2 = networks();
  assert.equal((await A.replyNow(deps(db, net2, { card: async () => { throw new Error("no fonts"); } }), "mastodon_r")).status, "posted");
  assert.ok(!net2.calls.some((c) => c.url.includes("/media")));
  assert.equal(net2.calls.find((c) => c.url.endsWith("/api/v1/statuses")).body.media_ids, undefined);
  assert.equal(replyOf(db, "mastodon_r").cardError, "The card was not drawn: no fonts");
});

test("a reply that is not a report reply carries no card", async () => {
  const plain = report("bluesky", 61, { campaign: "" });
  delete plain.report;
  const db = await seeded({ bluesky_r: plain });
  const net = networks();
  await A.replyNow(deps(db, net, { card: async () => assert.fail("drew a card") }), "bluesky_r");
  assert.ok(!net.calls.some((c) => c.url.endsWith("uploadBlob")));
  assert.equal(replyOf(db, "bluesky_r").card, undefined);
});

test("the Mac gets an X report reply's card with its alt text, and reports whether it went with the reply", async () => {
  const db = await seeded({ x_aaaaaaaaaaaaaaaaaaaa: report("x", 61, { id: "1", url: "https://x.com/ana/status/1" }), x_bbbbbbbbbbbbbbbbbbbb: report("x", 61, { id: "2", url: "https://x.com/bo/status/2" }) });
  const d = deps(db, networks(), { env: {} });
  const q = await M.handle(d, { op: "engagement-mac-queue", networks: ["x"] }, TOKEN);
  const t = q.tasks.find((x) => x.key === "x_aaaaaaaaaaaaaaaaaaaa");
  assert.equal(Buffer.from(t.card.png, "base64").toString("hex"), PNG.toString("hex"));
  assert.equal(t.card.alt, CARD.alt);

  await M.handle(d, { op: "engagement-mac-result", key: "x_aaaaaaaaaaaaaaaaaaaa", action: "reply", ok: true, url: "https://x.com/qalaburlreview/status/9", card: "attached" }, TOKEN);
  assert.equal(replyOf(db, "x_aaaaaaaaaaaaaaaaaaaa").card, "attached");
  await M.handle(d, { op: "engagement-mac-result", key: "x_bbbbbbbbbbbbbbbbbbbb", action: "reply", ok: true, url: "https://x.com/qalaburlreview/status/10", card: "text", cardError: "X did not take the image." }, TOKEN);
  assert.equal(replyOf(db, "x_bbbbbbbbbbbbbbbbbbbb").card, "text");
  assert.equal(replyOf(db, "x_bbbbbbbbbbbbbbbbbbbb").cardError, "X did not take the image.");
  assert.equal(replyOf(db, "x_bbbbbbbbbbbbbbbbbbbb").status, "posted", "a card that did not go never holds the reply back");
});
