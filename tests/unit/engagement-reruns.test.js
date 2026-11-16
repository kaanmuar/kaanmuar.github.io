"use strict";
// Re-runs (#2469): a site's new Live Report score goes back, with the new card, under the replies we posted about it.
const test = require("node:test");
const assert = require("node:assert/strict");
const R = require("../../functions/engagement-reports");
const E = require("../../functions/engagement");
const J = require("../../functions/jarvis-engagement");
const A = require("../../functions/engagement-act");
const Card = require("../../functions/report-card");
const { fakeDb } = require("./fixtures/fake-firestore.js");

const NOW = Date.parse("2026-11-03T17:00:00Z");
const ago = (d) => new Date(NOW - d * 86400000).toISOString();
const index = {
  reports: [
    { id: "upb", name: "UPB", host: "www.upb.edu.co", overall: 58, sector: "university", country: "CO", areas: { SEO: 70, Accessibility: 41 } },
    { id: "govuk", name: "GOV.UK", host: "www.gov.uk", overall: 92, areas: { SEO: 86, Accessibility: 100 } },
    { id: "banco", name: "Bancolombia", host: "www.bancolombia.com", overall: 84, country: "CO", areas: { SEO: 90, Security: 77 } },
    { id: "who", name: "WHO", host: "who.int", overall: 81, areas: { Security: 70 } }
  ]
};
const sites = R.targets(index);
const site = (id) => sites.find((t) => t.id === id);

/** A report reply we posted: network, host, the score it went out with. */
const posted = (network, host, score, extra) => Object.assign({
  network, campaign: "report-reply", id: "orig-" + host, thread: "thread-" + host, url: "https://example.social/orig", lang: "es",
  author: { handle: "ana@m.s", name: "Ana" }, seenAt: ago(10), text: "Their post",
  report: { host, score, shown: score >= 80, match: "domain", format: R.CARD_NETS.includes(network) ? "card" : "link" },
  actions: { reply: { status: "posted", postedAt: ago(9), lang: "es", draft: "Hicimos una revisión gratuita: https://qalabreview.com/es/r/bsky/" + host,
    uri: network === "bluesky" ? "at://did:plc:us/app.bsky.feed.post/r-" + host : network === "mastodon" ? "https://mastodon.social/users/us/statuses/9" : "",
    url: network === "x" ? "https://x.com/qalab/status/1777" : "https://example.social/ours" } }
}, extra);

test("a score that moved 3 points or more, or crossed 80, is a re-run to go back with", () => {
  assert.ok(R.moved(50, 58));
  assert.ok(R.moved(60, 57));
  assert.ok(!R.moved(58, 60), "two points is noise");
  assert.ok(R.moved(79, 80), "crossing 80 means the card can name the score now");
  assert.ok(R.moved(81, 79));
  assert.ok(!R.moved(NaN, 80));
});

test("posted report replies whose site moved since are gone back to; re-run replies, old ones and the rest are not", () => {
  const list = [
    { key: "bluesky_a", doc: posted("bluesky", "upb.edu.co", 50) },
    { key: "bluesky_b", doc: posted("bluesky", "gov.uk", 92) },
    { key: "youtube_c", doc: posted("youtube", "bancolombia.com", 70) },
    { key: "bluesky_d", doc: posted("bluesky", "upb.edu.co", 50, { actions: { reply: { status: "posted", postedAt: ago(91), uri: "at://x" } } }) },
    { key: "bluesky_e", doc: posted("bluesky", "upb.edu.co", 50, { report: { host: "upb.edu.co", score: 50, match: "rerun" } }) },
    { key: "bluesky_f", doc: posted("bluesky", "upb.edu.co", 50, { report: { host: "upb.edu.co", score: 50, match: "domain", rerun: { score: 58 } } }) },
    { key: "x_g", doc: posted("x", "who.int", 70) },
    { key: "mastodon_h", doc: posted("mastodon", "unlisted.com", 50) },
    { key: "bluesky_i", doc: posted("bluesky", "upb.edu.co", 50, { campaign: "" }) }
  ];
  const out = R.reruns(list, sites, NOW);
  assert.deepEqual(out.map((x) => [x.key, x.was, x.target.score, x.back]), [["bluesky_a", 50, 58, true], ["youtube_c", 70, 84, false], ["x_g", 70, 81, true]]);
  assert.equal(R.replyId(posted("x", "who.int", 70)), "1777", "X is answered by our reply's status id");
  assert.equal(R.replyId(posted("bluesky", "upb.edu.co", 50)), "at://did:plc:us/app.bsky.feed.post/r-upb.edu.co");
  assert.equal(R.reruns([{ key: "k", doc: posted("bluesky", "upb.edu.co", 50, { actions: { reply: { status: "posted", postedAt: ago(1) } } }) }], sites, NOW)[0].back, false, "no address for our reply, nothing to answer under");
});

test("the follow-up names the new score only from 80 up, in the reply's language, ending on the link", () => {
  const link = "https://qalabreview.com/es/r/bsky/who.int/abc123";
  assert.equal(R.rerunText(site("who"), 70, "es", link, "bluesky"), "Volvimos a pasar nuestra revisión gratuita de WHO: ahora obtiene 81/100. Aquí tienes el informe actualizado: " + link);
  const up = R.rerunText(site("upb"), 50, "en", link, "bluesky");
  assert.equal(up, "We re-ran our free review of UPB and its score went up. The updated report has a few findings worth a look on Accessibility: " + link);
  const down = R.rerunText(site("upb"), 66, "fr", link, "bluesky");
  assert.match(down, /^Nous avons relancé notre audit gratuit de UPB\. Le rapport mis à jour relève quelques points à examiner côté Accessibilité : /);
  assert.ok(![up, down].some((t) => /58|50|66|\/100/.test(t)), "no number under 80, and no old score");
  for (const lang of Object.keys(R.RERUN_COPY)) assert.ok(R.rerunText(site("upb"), 50, lang, link, "bluesky").endsWith(link), lang);
});

test("the follow-up is a waiting reply under our own reply, with the new report, that wants the card", () => {
  const orig = { key: "bluesky_a", doc: posted("bluesky", "upb.edu.co", 50) };
  const d = R.rerunDoc(orig, site("upb"), 50, "draft {link}", "es", "https://qalabreview.com/es/r/bsky/upb.edu.co/abcdef", NOW);
  assert.equal(d.id, "at://did:plc:us/app.bsky.feed.post/r-upb.edu.co");
  assert.equal(d.url, "https://example.social/ours");
  assert.equal(d.thread, "thread-upb.edu.co");
  assert.equal(d.author.handle, "ana@m.s", "the person we answered, for the mention");
  assert.deepEqual([d.report.match, d.report.was, d.report.score, d.report.shown, d.report.rerunOf, d.report.format], ["rerun", 50, 58, false, "bluesky_a", "card"]);
  assert.equal(d.actions.reply.status, "waiting");
  assert.equal(d.campaign, "report-reply");
  assert.ok(Card.wants(d));
  assert.equal(Card.facts(d).score, null);
});

// --- The re-run pass on an in-memory Firestore ----------------------------------------------------------------

const liveFetch = async (url) => {
  if (url.includes("live-reports/index.json")) return { ok: true, status: 200, json: async () => index };
  return { ok: false, status: 503, json: async () => ({}), text: async () => "" };
};

test("a re-run pass drafts one follow-up per moved reply, marks it, counts and pushes it, and does it once per score", async () => {
  const db = fakeDb();
  db.data.set("engagement_posts/bluesky_a", posted("bluesky", "upb.edu.co", 50));
  db.data.set("engagement_posts/bluesky_b", posted("bluesky", "gov.uk", 85));
  db.data.set("engagement_posts/youtube_c", posted("youtube", "bancolombia.com", 70));
  db.data.set("engagement_posts/x_g", posted("x", "who.int", 81));
  db.data.set("url_review_owner_notice_log/n1", { host: "gov.uk", sentAt: ago(5) });
  const pushed = [];
  const deps = { db, fetch: liveFetch, env: {}, now: NOW + 7200000, inc: (n) => ({ inc: n }), push: async (m) => { pushed.push(m); } };
  const conf = E.settings({});

  const out = await J.rerunPass(deps, conf);
  assert.equal(out.changed, 3, "upb went 50 to 58, gov.uk 85 to 92, bancolombia 70 to 84; who.int did not move");
  assert.equal(out.drafted, 1, "gov.uk's owner had our mail, and bancolombia's reply is a YouTube comment");
  assert.deepEqual(out.again.map((t) => t.host), ["bancolombia.com"], "a site with nothing to go back under is looked for again");

  const follow = Array.from(db.data.entries()).find(([, d]) => (d.report || {}).match === "rerun");
  assert.ok(follow);
  const [path, doc] = follow;
  assert.equal(doc.network, "bluesky");
  assert.equal(doc.report.rerunOf, "bluesky_a");
  assert.match(doc.actions.reply.draft, /^Volvimos a pasar nuestra revisión gratuita de UPB y su puntuación subió\. .* https:\/\/qalabreview\.com\/es\/r\/bsky\/upb\.edu\.co\/[a-f0-9]{6}$/);
  assert.equal(doc.report.link, doc.actions.reply.draft.split(" ").pop());
  assert.deepEqual(db.data.get("engagement_posts/bluesky_a").report.rerun, { score: 58, key: path.split("/")[1], at: new Date(NOW + 7200000).toISOString() });
  assert.equal(db.data.get("engagement_posts/youtube_c").report.rerun.score, 84, "the YouTube reply is covered by the new search");
  assert.equal(db.data.get("engagement_posts/bluesky_b").report.rerun, undefined, "a site we emailed waits, unmarked");

  const day = db.data.get("engagement_daily/" + E.bogotaDay(NOW + 7200000));
  assert.deepEqual([day.report.drafted, day.report.reruns, day.n.bluesky.drafted, day.n.bluesky.candidates], [1, 1, 1, undefined]);
  assert.equal(pushed.length, 1);
  assert.equal(pushed[0].title, "New score for UPB: go back to Ana on Bluesky?");
  assert.ok(pushed[0].lines.includes("We said: " + posted("bluesky", "upb.edu.co", 50).actions.reply.draft));
  assert.ok(pushed[0].lines.some((l) => l.includes("re-run, was 50")));

  const again = await J.rerunPass(Object.assign({}, deps, { now: NOW + 3 * 3600000 }), conf);
  assert.deepEqual([again.changed, again.drafted, again.again.length], [1, 0, 0], "each new score goes back once; only the emailed site is still waiting");
});

test("a paused scout and a full reply cap draft no follow-ups, and a capped one is tried again", async () => {
  const db = fakeDb();
  db.data.set("engagement_posts/bluesky_a", posted("bluesky", "upb.edu.co", 50));
  const deps = { db, fetch: liveFetch, env: {}, now: NOW + 4 * 3600000, inc: (n) => ({ inc: n }) };
  assert.equal((await J.rerunPass(deps, E.settings({ paused: true }))).changed, 0);
  db.data.set("engagement_daily/" + E.bogotaDay(deps.now), { n: { bluesky: { drafted: 999 } } });
  const capped = await J.rerunPass(deps, E.settings({}));
  assert.deepEqual([capped.changed, capped.drafted, capped.again.length], [1, 0, 0]);
  assert.equal(db.data.get("engagement_posts/bluesky_a").report.rerun, undefined);
});

test("a site sent back to the report pass is looked for first, past the 30-day gap", async () => {
  const db = fakeDb();
  db.data.set("engagement_posts/youtube_c", posted("youtube", "bancolombia.com", 70));
  const calls = [];
  const fetch = async (url) => {
    calls.push(url);
    const json = (body) => ({ ok: true, status: 200, json: async () => body });
    if (url.includes("live-reports/index.json")) return json(index);
    if (url.includes("createSession")) return json({ accessJwt: "t", did: "did:plc:us", handle: "us.bsky.social" });
    if (url.includes("searchPosts")) return json({ posts: [] });
    return { ok: false, status: 503, json: async () => ({}) };
  };
  const deps = { db, fetch, env: { BLUESKY_HANDLE: "us", BLUESKY_APP_PASSWORD: "p" }, now: NOW + 5 * 3600000, inc: (n) => ({ inc: n }) };
  const conf = E.settings({});
  const plain = await J.reportPass(deps, conf, {});
  assert.ok(!calls.some((u) => u.includes("q=bancolombia.com")), "answered this month, so not looked for");
  calls.length = 0;
  const out = await J.reportPass(deps, conf, {}, [site("banco")]);
  assert.ok(calls.some((u) => u.includes("q=bancolombia.com")), "a re-run sends it back to the search");
  assert.equal(out.searched, plain.searched + 1);
});

test("on Mastodon, a follow-up under our own reply names the person we answered, not us", async () => {
  const db = fakeDb();
  await db.collection("engagement_private").doc("mastodon").set({ base: "https://mastodon.social", token: "mtok", acct: "qalaburlreview" });
  const orig = { key: "mastodon_h", doc: posted("mastodon", "upb.edu.co", 50) };
  const d = R.rerunDoc(orig, site("upb"), 50, "We re-ran it: https://qalabreview.com/en/r/mast/upb.edu.co", "en", "https://qalabreview.com/en/r/mast/upb.edu.co", NOW);
  d.actions.reply.status = "approved";
  await db.collection("engagement_posts").doc("mastodon_r").set(d);
  const calls = [];
  const fetch = async (url, o) => {
    calls.push({ url, body: typeof o.body === "string" ? JSON.parse(o.body) : o.body });
    const reply = (data) => ({ ok: true, status: 200, text: async () => JSON.stringify(data) });
    if (url.includes("/api/v2/search")) return reply({ statuses: [{ id: "9", account: { id: "1", acct: "qalaburlreview" } }] });
    if (/\/statuses\/9\/context$/.test(url)) return reply({ descendants: [] });
    if (url.endsWith("/api/v1/statuses")) return reply({ id: "10", url: "https://mastodon.social/@qalaburlreview/10" });
    return { ok: false, status: 404, text: async () => "{}" };
  };
  const out = await A.replyNow({ db, fetch, now: NOW, inc: (n) => ({ inc: n }), sleep: async () => {}, card: async () => { throw new Error("no card in this test"); } }, "mastodon_r");
  assert.equal(out.status, "posted");
  const sent = calls.find((c) => c.url.endsWith("/api/v1/statuses")).body;
  assert.match(sent.status, /^@ana@m\.s We re-ran it/);
  assert.equal(sent.in_reply_to_id, "9");
});
