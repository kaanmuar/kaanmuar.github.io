const test = require("node:test");
const assert = require("node:assert/strict");

const core = require("../../functions/url-review-core");
const notice = require("../../functions/url-review-owner-notice");
const ownerMail = require("../../functions/url-review-owner-mail");

const AREAS = { SEO: { score: 70 }, GEO: { score: 80 }, Analytics: { score: 60 }, Security: { score: 40 }, Accessibility: { score: 90 }, Performance: { score: 75 } };

function record(host, extra, report) {
  return Object.assign({
    status: "complete",
    email: "asker@elsewhere.com",
    reasonCode: "client",
    createdAt: "2026-10-22T10:00:00Z",
    report: Object.assign({
      id: "abc123",
      host,
      fetchedAt: "2026-10-22T10:00:00Z",
      limits: { pagesRead: 5 },
      pages: [{ status: 200 }],
      observed: { lang: "es-CO" },
      insights: { score: { overall: 70, areas: AREAS }, findings: [] },
      contacts: { securityTxt: ["security@acme.co"], schema: ["info@acme.co"], pages: [{ email: "hola@acme.co", url: "https://acme.co/contacto" }] }
    }, report || {})
  }, extra || {});
}

const critical = { area: "Security", verdict: "fail", severity: "critical", title: "Flagged" };

test("contacts come from security.txt, schema.org values and mailtos on contact pages only", () => {
  const html = "<a href=\"mailto:Hello@Acme.co?subject=hi\">x</a>" +
    "<script type=\"application/ld+json\">[{\"@type\":\"Organization\",\"email\":\"info@acme.co\",\"contactPoint\":{\"@type\":\"ContactPoint\",\"email\":\"mailto:support@acme.co\"}},{\"@type\":\"Person\",\"email\":\"jane@acme.co\"}]</script>";
  const found = core.analyzeHtml(html, {}, "https://acme.co/contact");
  assert.deepEqual(found.mailtos, ["hello@acme.co"]);
  assert.deepEqual(found.schema.emails, ["info@acme.co", "support@acme.co"]);
  const contacts = core.ownerContacts([
    { url: "https://acme.co/", inspect: Object.assign({}, found, { mailtos: ["footer@acme.co"] }) },
    { url: "https://acme.co/contact", inspect: found }
  ], { status: 200, html: false, body: "Contact: https://acme.co/report\nContact: mailto:security@acme.co\n" });
  assert.deepEqual(contacts.securityTxt, ["security@acme.co"]);
  assert.deepEqual(contacts.pages, [{ email: "hello@acme.co", url: "https://acme.co/contact" }]);
  assert.deepEqual(core.ownerContacts([], { status: 200, html: true, body: "Contact: mailto:x@acme.co" }).securityTxt, []);
});

test("security.txt is used only for a critical security finding, then schema, then a contact page", () => {
  assert.equal(notice.pickContact(record("acme.co").report).email, "info@acme.co");
  assert.equal(notice.pickContact(record("acme.co", {}, { insights: { score: { overall: 70, areas: AREAS }, findings: [critical] } }).report).source, "security.txt");
  assert.deepEqual(notice.pickContact(record("acme.co", {}, { contacts: { securityTxt: ["s@acme.co"], schema: [], pages: [{ email: "hola@acme.co", url: "https://acme.co/contacto" }] } }).report),
    { email: "hola@acme.co", source: "page", url: "https://acme.co/contacto" });
  assert.equal(notice.pickContact(record("acme.co", {}, { contacts: { securityTxt: ["s@acme.co"], schema: [], pages: [] } }).report), null);
});

test("a notice is skipped for own reviews, our hosts, unlisted hosts, .de and .at, stops and recent notices", () => {
  const now = Date.parse("2026-10-22T12:00:00Z");
  assert.equal(notice.skipReason(record("acme.co"), { now }), "");
  assert.equal(notice.skipReason(record("acme.co", { reasonCode: "own", email: "me@acme.co" }), { now }), "own");
  assert.equal(notice.skipReason(record("carlosandmunoz.com"), { now }), "own-or-test");
  assert.equal(notice.skipReason(record("shop.acme.co"), { unlisted: ["acme.co"], now }), "unlisted");
  assert.equal(notice.skipReason(record("acme.de"), { now }), "needs-consent");
  assert.equal(notice.skipReason(record("acme.at"), { now }), "needs-consent");
  assert.equal(notice.skipReason(record("acme.co", {}, { contacts: {} }), { now }), "no-contact");
  assert.equal(notice.skipReason(record("acme.co", { email: "info@acme.co" }), { now }), "asker-is-contact");
  assert.equal(notice.skipReason(record("acme.co"), { stopped: new Set(["@acme.co"]), now }), "stopped");
  assert.equal(notice.skipReason(record("acme.co"), { stopped: new Set(["info@acme.co"]), now }), "stopped");
  assert.equal(notice.skipReason(record("acme.co"), { notice: { status: "pending" }, now }), "recent");
  assert.equal(notice.skipReason(record("acme.co"), { notice: { status: "sent", sentAt: "2026-06-01T00:00:00Z" }, now }), "recent");
  assert.equal(notice.skipReason(record("acme.co"), { notice: { status: "sent", sentAt: "2026-03-01T00:00:00Z" }, now }), "");
  assert.equal(notice.skipReason(record("acme.co", { status: "stopped" }), { now }), "not-complete");
});

test("the queued row is keyed by registrable domain and speaks the site's language", () => {
  const row = notice.noticeRow(record("www.shop.acme.com.co"), Date.parse("2026-10-22T12:00:00Z"));
  assert.equal(row.domain, "acme.com.co");
  assert.equal(row.host, "shop.acme.com.co");
  assert.equal(row.lang, "es");
  assert.equal(row.status, "pending");
  assert.equal(row.reviewId, "abc123");
  assert.equal(notice.noticeRow(record("acme.co", {}, { observed: { lang: "ja" } })).lang, "en");
});

test("a notice waits for a postal address, a live card, and no stop or unlist", () => {
  const pending = { status: "pending", host: "acme.co", domain: "acme.co", email: "info@acme.co" };
  const card = notice.liveCard({ reports: [{ id: "u-acme-co", host: "www.acme.co" }] }, "acme.co");
  assert.equal(card.id, "u-acme-co");
  assert.equal(notice.liveCard({ reports: [] }, "acme.co"), null);
  assert.equal(notice.sendBlock(pending, { postal: "Calle 1, Bogotá", card }), "");
  assert.match(notice.sendBlock(pending, { postal: "", card }), /OWNER_NOTICE_POSTAL/);
  assert.match(notice.sendBlock(pending, { postal: "x", card: null }), /not on Live Reports yet/);
  assert.match(notice.sendBlock(pending, { postal: "x", card, stopped: new Set(["@acme.co"]) }), /asked for no notices/);
  assert.match(notice.sendBlock(pending, { postal: "x", card, unlisted: ["acme.co"] }), /already off/);
  assert.match(notice.sendBlock(Object.assign({}, pending, { status: "sent" }), { postal: "x", card }), /not waiting/);
});

test("the notice email has both buttons, the public scores, the source and the postal address, and no asker", () => {
  const row = Object.assign(notice.noticeRow(record("acme.co", { name: "Asker Name" })), { critical: true });
  const card = { id: "u-acme-co", host: "acme.co", read: "2026-10-22", overall: 71, areas: { SEO: 70, GEO: 80, Analytics: 60, Security: 40, Accessibility: 90, Performance: 75 } };
  const links = { claim: "https://fn/owner?t=x&do=claim", unlist: "https://fn/owner?t=x&do=unlist", stop: "https://fn/owner?t=x&do=stop", live: "https://carlosandmunoz.com/qa-review-es.html?live=u-acme-co" };
  for (const lang of notice.LANGS) {
    const mail = ownerMail.noticeMail(Object.assign({}, row, { lang }), card, links, "Calle 1 # 2-3, Bogotá, Colombia");
    assert.equal(mail.lang, lang);
    assert.match(mail.subject, /acme\.co/);
    for (const part of [links.claim, links.unlist, links.stop, "71/100", "Calle 1 # 2-3", "info@acme.co"]) {
      assert.ok(mail.text.includes(part), lang + " text has " + part);
    }
    assert.ok(mail.html.includes("do=claim") && mail.html.includes("do=unlist") && mail.html.includes("do=stop"));
    assert.ok(!mail.html.includes("asker@elsewhere.com") && !mail.html.includes("Asker Name"));
  }
});

test("owner pages render every state in six languages", () => {
  const link = { host: "acme.co", domain: "acme.co", email: "info@acme.co" };
  for (const lang of notice.LANGS) {
    for (const state of ["claim", "claimed", "claim-limit", "unlist", "unlisted", "stop", "stopped", "gone"]) {
      const page = ownerMail.ownerPage(lang, state, link);
      assert.match(page, new RegExp("<html lang=\"" + lang + "\""));
      assert.ok(!/\{\w+\}/.test(page), lang + " " + state + " leaves no placeholder");
    }
    assert.match(ownerMail.ownerPage(lang, "claim", Object.assign({ wrong: true }, link)), /@acme\.co/);
    const claim = ownerMail.claimMail(lang, { host: "acme.co", domain: "acme.co", reportUrl: "https://carlosandmunoz.com/qa-review.html?report=ff", postal: "Calle 1" });
    assert.ok(claim.text.includes("report=ff") && claim.html.includes("report=ff"));
  }
});
