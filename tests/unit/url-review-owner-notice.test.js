const test = require("node:test");
const assert = require("node:assert/strict");

const core = require("../../functions/url-review-core");
const notice = require("../../functions/url-review-owner-notice");
const ownerMail = require("../../functions/url-review-owner-mail");
const search = require("../../functions/url-review-owner-contacts");
const customerMail = require("../../functions/url-review-customer-mail");

const AREAS = {
  SEO: { score: 23, grade: "F", fail: 1, risk: 9, pass: 3 },
  GEO: { score: 83, grade: "B", fail: 0, risk: 4, pass: 2 },
  Analytics: { score: 59, grade: "D", fail: 0, risk: 4, pass: 3 },
  Security: { score: 24, grade: "F", fail: 2, risk: 10, pass: 8 },
  Accessibility: { score: 33, grade: "F", fail: 4, risk: 5, pass: 2 },
  Performance: { score: 79, grade: "C", fail: 1, risk: 2, pass: 2 }
};
const SCORE = { overall: 49, grade: "F", areas: AREAS, totals: { fail: 8, risk: 34, pass: 20, person: 2 }, severities: { critical: 0, high: 4, medium: 14, low: 24 } };

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
      pages: [{ status: 200, path: "/" }],
      observed: { lang: "es-CO" },
      insights: { score: SCORE, findings: [] },
      contacts: {
        found: [
          { email: "security@acme.co", source: "security.txt", url: "https://acme.co/.well-known/security.txt" },
          { email: "info@acme.co", source: "schema", url: "https://acme.co/" },
          { email: "hola@acme.co", source: "contact-page", url: "https://acme.co/contacto" },
          { email: "rua@dmarc-vendor.com", source: "dmarc", url: "" }
        ],
        profiles: []
      }
    }, report || {})
  }, extra || {});
}

test("the review keeps every address the site and its records publish", () => {
  const html = "<a href=\"mailto:Hello@Acme.co?subject=hi\">x</a><p>Write to ventas [at] acme [dot] co</p>" +
    "<a href=\"https://github.com/AcmeCo\">gh</a><a href=\"/contact\">c</a><a href=\"/politica-de-privacidad\">p</a>" +
    "<a href=\"/formulario/pqr\">f</a><a href=\"https://other.co/contacto\">o</a><a href=\"/blog\">b</a>" +
    "<script type=\"application/ld+json\">[{\"@type\":\"Organization\",\"email\":\"info@acme.co\",\"contactPoint\":{\"@type\":\"ContactPoint\",\"email\":\"mailto:support@acme.co\"}},{\"@type\":\"Person\",\"email\":\"jane@acme.co\"}]</script>";
  const seen = core.analyzeHtml(html, {}, "https://acme.co/contact");
  assert.deepEqual(seen.mailtos, ["hello@acme.co"]);
  assert.deepEqual(seen.schema.emails, ["info@acme.co", "support@acme.co"]);
  assert.ok(seen.textEmails.includes("ventas@acme.co"));
  const { found, profiles, paths } = core.ownerContacts([
    { url: "https://acme.co/", inspect: Object.assign({}, seen, { mailtos: ["footer@acme.co"] }) },
    { url: "https://acme.co/contact", inspect: seen }
  ], {
    securityTxt: { status: 200, html: false, body: "Contact: https://acme.co/report\nContact: mailto:security@acme.co\n" },
    llms: { status: 200, html: false, body: "Questions: docs@acme.co" },
    domain: { contacts: [{ role: "registrant", email: "owner@acme.co" }] },
    dns: { dmarc: "v=DMARC1; p=none; rua=mailto:dmarc@acme.co,mailto:x@vendor.com", soaEmail: "hostmaster@acme.co" }
  });
  const by = (source) => found.filter((row) => row.source === source).map((row) => row.email);
  assert.deepEqual(by("security.txt"), ["security@acme.co"]);
  assert.deepEqual(by("page"), ["footer@acme.co"]);
  assert.deepEqual(by("contact-page"), ["hello@acme.co"]);
  assert.deepEqual(by("llms"), ["docs@acme.co"]);
  assert.deepEqual(by("rdap"), ["owner@acme.co"]);
  assert.deepEqual(by("dmarc"), ["dmarc@acme.co", "x@vendor.com"]);
  assert.deepEqual(by("soa"), ["hostmaster@acme.co"]);
  assert.deepEqual(profiles, ["acmeco"]);
  assert.deepEqual(paths, ["/politica-de-privacidad"]);
});

test("addresses are ranked: own domain, contact pages and role boxes first; vendor DMARC and junk dropped", () => {
  const ranked = notice.rankContacts([
    { email: "rua@dmarc-vendor.com", source: "dmarc" },
    { email: "noreply@acme.co", source: "page" },
    { email: "user@example.com", source: "page-text" },
    { email: "acme.shop@gmail.com", source: "page" },
    { email: "security@acme.co", source: "security.txt" },
    { email: "hola@acme.co", source: "contact-page" },
    { email: "hola@acme.co", source: "search" },
    { email: "info@acme.co", source: "schema" }
  ], "www.acme.co");
  assert.deepEqual(ranked.map((row) => row.email), ["hola@acme.co", "info@acme.co", "security@acme.co", "acme.shop@gmail.com"]);
  assert.deepEqual(ranked[0].sources, ["contact-page", "search"]);
  assert.equal(ranked[3].onDomain, false);
  assert.equal(notice.pickContact(record("acme.co").report).email, "hola@acme.co");
});

test("a notice is skipped for own reviews, our hosts, unlisted hosts, .de and .at, stops, recent notices and no contact", () => {
  const now = Date.parse("2026-10-22T12:00:00Z");
  assert.equal(notice.skipReason(record("acme.co"), { now }), "");
  assert.equal(notice.skipReason(record("acme.co", { reasonCode: "own", email: "me@acme.co" }), { now }), "own");
  assert.equal(notice.skipReason(record("carlosandmunoz.com"), { now }), "own-or-test");
  assert.equal(notice.skipReason(record("shop.acme.co"), { unlisted: ["acme.co"], now }), "unlisted");
  assert.equal(notice.skipReason(record("acme.de"), { now }), "needs-consent");
  assert.equal(notice.skipReason(record("acme.at"), { now }), "needs-consent");
  assert.equal(notice.skipReason(record("acme.co", {}, { contacts: {} }), { now }), "no-contact");
  assert.equal(notice.skipReason(record("acme.co", {}, { contacts: {} }), { now, contacts: [{ email: "x@acme.co", source: "search" }] }), "");
  assert.equal(notice.skipReason(record("acme.co", { email: "hola@acme.co" }, { contacts: { found: [{ email: "hola@acme.co", source: "page" }] } }), { now }), "asker-is-contact");
  assert.equal(notice.skipReason(record("acme.co"), { stopped: new Set(["@acme.co"]), now }), "stopped");
  assert.equal(notice.skipReason(record("acme.co"), { stopped: new Set(["hola@acme.co", "info@acme.co", "security@acme.co"]), now }), "stopped");
  assert.equal(notice.skipReason(record("acme.co"), { notice: { status: "pending" }, now }), "recent");
  assert.equal(notice.skipReason(record("acme.co"), { notice: { status: "sent", sentAt: "2026-06-01T00:00:00Z" }, now }), "recent");
  assert.equal(notice.skipReason(record("acme.co"), { notice: { status: "sent", sentAt: "2026-03-01T00:00:00Z" }, now }), "");
  assert.equal(notice.skipReason(record("acme.co", { status: "stopped" }), { now }), "not-complete");
});

test("the queued row keeps the ranked candidates and the desk can address any of them", () => {
  const rec = record("www.shop.acme.com.co", {}, { contacts: { found: [{ email: "info@acme.com.co", source: "schema", url: "https://shop.acme.com.co/" }, { email: "x@acme.com.co", source: "rdap" }] } });
  const usable = notice.usableContacts(rec, notice.rankContacts(rec.report.contacts.found, rec.report.host));
  const row = notice.noticeRow(rec, usable, Date.parse("2026-10-22T12:00:00Z"));
  assert.equal(row.domain, "acme.com.co");
  assert.equal(row.host, "shop.acme.com.co");
  assert.equal(row.lang, "es");
  assert.equal(row.email, "info@acme.com.co");
  assert.deepEqual(row.candidates.map((c) => c.email), ["info@acme.com.co", "x@acme.com.co"]);
  const other = notice.addressed(row, "x@acme.com.co");
  assert.equal(other.email, "x@acme.com.co");
  assert.equal(other.source, "rdap");
  assert.equal(notice.addressed(row, "someone@else.com"), null);
});

test("a notice waits for a live card and no stop or unlist", () => {
  const pending = { status: "pending", host: "acme.co", domain: "acme.co", email: "info@acme.co" };
  const card = notice.liveCard({ reports: [{ id: "u-acme-co", host: "www.acme.co" }] }, "acme.co");
  assert.equal(card.id, "u-acme-co");
  assert.equal(notice.liveCard({ reports: [] }, "acme.co"), null);
  assert.equal(notice.sendBlock(pending, { card }), "");
  assert.match(notice.sendBlock(pending, { card: null }), /not on Live Reports yet/);
  assert.match(notice.sendBlock(pending, { card, stopped: new Set(["@acme.co"]) }), /asked for no notices/);
  assert.match(notice.sendBlock(pending, { card, unlisted: ["acme.co"] }), /already off/);
  assert.match(notice.sendBlock(Object.assign({}, pending, { status: "sent" }), { card }), /not waiting/);
});

test("the second look reads unread contact pages, linked GitHub profiles and web search, on time", async () => {
  const report = { host: "acme.co", finalUrl: "https://acme.co/", pages: [{ path: "/" }, { path: "/contact" }], contacts: { found: [], profiles: ["acmeco"], paths: ["/la-compania/quienes-somos"] } };
  assert.equal(search.pathsToTry(report)[0], "/la-compania/quienes-somos");
  assert.ok(!search.pathsToTry(report).includes("/contact"));
  const asked = [];
  const found = await search.discover(report, {
    fetchPage: async (url) => { asked.push(url); return url.endsWith("/contacto") ? { status: 200, html: true, url, body: "<a href=\"mailto:hola@acme.co\">x</a>" } : { status: 404 }; },
    analyze: core.analyzeHtml,
    github: async (name) => (name === "acmeco" ? { email: "Dev@Acme.co" } : null),
    search: async () => "<div class=\"result\">Escríbenos a ventas@acme.co o a otro@ajeno.com</div>",
    emailsInText: core.emailsInText,
    visibleText: core.visibleText,
    registrable: core.registrable
  });
  const askedPaths = asked.map((url) => new URL(url).pathname);
  assert.ok(asked.every((url) => new URL(url).origin === "https://acme.co"));
  assert.ok(askedPaths.includes("/contacto"));
  assert.ok(!askedPaths.includes("/contact"));
  const by = (source) => found.filter((row) => row.source === source).map((row) => row.email);
  assert.deepEqual(by("contact-page"), ["hola@acme.co"]);
  assert.deepEqual(by("github"), ["dev@acme.co"]);
  assert.deepEqual(by("search"), ["ventas@acme.co"]);
});

test("the notice email carries the health score, both buttons, the source and the postal address, and no asker", () => {
  const rec = record("acme.co", { name: "Asker Name" });
  const row = Object.assign(notice.noticeRow(rec, notice.usableContacts(rec, notice.rankContacts(rec.report.contacts.found, "acme.co"))), { critical: true });
  const card = { id: "u-acme-co", host: "acme.co", read: "2026-10-22", overall: 49, grade: "F", areas: { SEO: 23, GEO: 83, Analytics: 59, Security: 24, Accessibility: 33, Performance: 79 } };
  const links = { claim: "https://fn/owner?t=x&do=claim", unlist: "https://fn/owner?t=x&do=unlist", stop: "https://fn/owner?t=x&do=stop", live: "https://carlosandmunoz.com/qa-review-es.html?live=u-acme-co" };
  for (const lang of notice.LANGS) {
    const mail = ownerMail.noticeMail(Object.assign({}, row, { lang }), card, links, SCORE);
    assert.equal(mail.lang, lang);
    assert.match(mail.subject, /acme\.co/);
    for (const part of [links.claim, links.unlist, links.stop, "49/100", "Calle 29 # 29-31", "hola@acme.co", "https://acme.co/contacto"]) {
      assert.ok(mail.text.includes(part), lang + " text has " + part);
    }
    for (const part of [">49<", ">23</b>", ">83</b>", "do=claim", "do=unlist", "do=stop", ">34</b>"]) assert.ok(mail.html.includes(part), lang + " html has " + part);
    assert.ok(!/\{\w+\}/.test(mail.text + mail.html), lang + " leaves no placeholder");
    assert.ok(!mail.html.includes("asker@elsewhere.com") && !mail.html.includes("Asker Name"));
  }
  const fromCard = ownerMail.noticeMail(Object.assign({}, row, { lang: "en" }), card, links, null);
  assert.ok(fromCard.html.includes(">49<") && fromCard.html.includes(">24</b>"));
});

test("a claimed report goes out as the blurred report mail with the owner's footer line", () => {
  const mail = customerMail.reportMail({ id: "ff00", report: { id: "ff00", host: "acme.co", insights: { score: SCORE, findings: [{ verdict: "fail", rank: 1, area: "Security", severity: "high", title: "HSTS is not sent on any page of the site" }] } } }, { lang: "es", why: ownerMail.claimWhy("es", "acme.co") });
  assert.ok(mail.html.includes("report=ff00"));
  assert.ok(mail.text.includes("el informe de acme.co se pidió con esta dirección"));
  assert.ok(!mail.text.includes("HSTS is not sent on any page of the site"));
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
  }
});
