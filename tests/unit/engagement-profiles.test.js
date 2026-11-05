/**
 * Profile campaign (#2615): a reviewed company's own profiles from its homepage, a touch a week up to four until it
 * pays, and messages stored as report replies with the offer in their link.
 *
 *   npm run test:review
 */
const test = require("node:test");
const assert = require("node:assert/strict");

const P = require("../../functions/engagement-profiles");
const R = require("../../functions/engagement-reports");
const Card = require("../../functions/report-card");

const DAY = 24 * 3600000;
const NOW = Date.parse("2026-11-05T15:00:00Z");
const SITE = { id: "upb", host: "upb.edu.co", name: "UPB", score: 72, weakest: "Performance", sector: "university", country: "CO", lang: "es" };

const HOME = `<html><head><script type="application/ld+json">{"@type":"Organization","sameAs":["https://www.linkedin.com/school/upb/","https://bsky.app/profile/upb.edu.co"]}</script></head><body>
<a href="https://twitter.com/intent/tweet?text=hi">share</a>
<a href="https://www.facebook.com/sharer/sharer.php?u=x">share</a>
<a href='https://x.com/UPBoficial'>X</a>
<a href="https://www.instagram.com/upb_oficial/">IG</a>
<a href="https://www.facebook.com/UPBColombia">FB</a>
<a href="https://mastodon.social/@upb">Masto</a>
<a href="https://www.youtube.com/@upbvideos">YT</a>
<a href="https://www.linkedin.com/in/some-person">person</a>
<a href="https://medium.com/@upb">blog</a>
</body></html>`;

test("a homepage's profiles: one account per network from links and sameAs, never share links, people or blogs", () => {
  const got = P.profilesOf(HOME, "https://upb.edu.co/");
  assert.deepEqual(got.map((p) => p.network + " " + p.handle), [
    "bluesky upb.edu.co", "mastodon upb@mastodon.social", "x @UPBoficial", "linkedin upb", "facebook UPBColombia", "instagram @upb_oficial", "youtube @upbvideos"
  ]);
  assert.equal(got.find((p) => p.network === "linkedin").url, "https://linkedin.com/school/upb");
  assert.equal(P.profileOf("https://x.com/home"), null);
  assert.equal(P.profileOf("javascript:alert(1)"), null);
});

test("a company is due a touch a week, four in all, never once it paid, asked to stop, or had other mail that week", () => {
  const led = (n, lastDaysAgo) => ({ touches: Array.from({ length: n }, (_, i) => ({ at: new Date(NOW - (lastDaysAgo + (n - 1 - i) * 7) * DAY).toISOString() })) });
  assert.deepEqual(P.due(null, NOW, {}), { ok: true, touch: 1, why: "" });
  assert.deepEqual(P.due(led(1, 8), NOW, {}), { ok: true, touch: 2, why: "" });
  assert.equal(P.due(led(1, 3), NOW, {}).why, "week");
  assert.equal(P.due(led(4, 8), NOW, {}).why, "done");
  assert.equal(P.due(led(1, 8), NOW, { paid: true }).why, "paid");
  assert.equal(P.due(null, NOW, { stop: true }).why, "stop");
  assert.equal(P.due(null, NOW, { lastContact: NOW - 2 * DAY }).why, "week");
  assert.deepEqual(P.TONES.map((_, i) => P.toneOf(i + 1)), ["cheer", "curious", "question", "last"]);
});

test("a reply goes under the profile's latest original post of the last FRESH_DAYS only", () => {
  const post = (id, days, isReply) => ({ id, isReply, createdAt: new Date(NOW - days * DAY).toISOString() });
  assert.equal(P.latestOf([post("a", 10), post("b", 2, true), post("c", 4)], NOW).id, "c");
  assert.equal(P.latestOf([post("old", P.FRESH_DAYS + 1)], NOW), null);
  assert.equal(P.latestOf([post("a", 10), post("c", 4)], NOW, (p) => p.id !== "c").id, "a");
});

test("a paid address on the company's domain or a subdomain ends its campaign", () => {
  assert.equal(P.sameDomain("ana@upb.edu.co", "www.upb.edu.co"), true);
  assert.equal(P.sameDomain("ana@mail.upb.edu.co", "upb.edu.co"), true);
  assert.equal(P.sameDomain("ana@gmail.com", "upb.edu.co"), false);
});

test("messages keep one link, drop other links and hashtags, and never name a score the card does not show", () => {
  const items = [{ key: "a", target: SITE }, { key: "b", target: SITE }, { key: "c", target: SITE }];
  const out = P.parse(JSON.stringify([
    { id: "a", text: "Nos encantó su nueva sede #UPB, revisamos su sitio: https://evil.test {link} {link}" },
    { id: "b", text: "Su sitio sacó 72 en nuestra revisión {link}" },
    { id: "c", text: "Hola" }
  ]), items);
  assert.equal(out.a, "Nos encantó su nueva sede, revisamos su sitio: {link}");
  assert.equal(out.b, undefined);
  assert.equal(out.c, undefined);
});

test("a message is a waiting report reply with match profile: a card under their post, or a manual copy for the profile", () => {
  const offer = { code: "HI-ABCD2345", percent: 50, days: 7 };
  const profile = { network: "bluesky", handle: "upb.edu.co", url: "https://bsky.app/profile/upb.edu.co" };
  const post = { network: "bluesky", id: "at://did:plc:x/app.bsky.feed.post/1", cid: "c", url: "https://bsky.app/profile/upb.edu.co/post/1", author: { handle: "upb.edu.co" }, text: "Open day!", lang: "es", createdAt: new Date(NOW).toISOString() };
  const link = P.linkFor(SITE, "bluesky", "es", "bluesky_abcdef1234", offer.code);
  assert.equal(link, "https://qalabreview.com/es/r/bsky/upb.edu.co/abcdef/hi-abcd2345");
  const reply = P.doc({ key: "bluesky_1", network: "bluesky", mode: "reply", post, profile, target: SITE, touch: 1, tone: "cheer", lang: "es", offer }, "¡Qué buen open day! Revisamos su sitio {link}", link, NOW);
  assert.equal(reply.campaign, R.CAMPAIGN);
  assert.deepEqual([reply.report.match, reply.report.format, reply.report.manual, reply.report.offer, reply.actions.reply.status], ["profile", "card", false, offer.code, "waiting"]);
  assert.ok(reply.actions.reply.draft.endsWith(link));
  assert.equal(Card.wants(reply), true);
  const li = { network: "linkedin", handle: "upb", url: "https://linkedin.com/school/upb" };
  const copy = P.doc({ key: "linkedin_1", network: "linkedin", mode: "copy", post: null, profile: li, target: SITE, touch: 3, tone: "question", lang: "es", offer }, "upb, ¿cómo cuidan la velocidad de su sitio? {link}", link, NOW);
  assert.deepEqual([copy.id, copy.report.format, copy.report.manual, copy.report.profile], [li.url, "link", true, li.url]);
  assert.equal(Card.wants(copy), false);
  assert.equal(Date.parse(copy.actions.reply.expiresAt) - NOW, P.TTL);
});

test("the prompt asks for the touch's tone in the site's language and keeps the offer out of the first two touches", () => {
  const text = P.prompt([{ key: "k", network: "x", mode: "copy", profile: { handle: "@UPBoficial" }, target: SITE, touch: 2, tone: "curious", lang: "es", offer: { percent: 50, days: 7 } }]);
  assert.match(text, /Touch 2, curious[^\n]*No offer/);
  assert.match(text, /"handle":"@UPBoficial"/);
  assert.match(text, /"score":null/);
});
