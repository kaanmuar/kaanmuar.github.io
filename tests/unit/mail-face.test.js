const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const mailFace = require("../../functions/mail-face");
const customerMail = require("../../functions/url-review-customer-mail");
const ownerMail = require("../../functions/url-review-owner-mail");
const { FACES } = require("../../scripts/brand-kit/faces");
const route = require("../../scripts/face-route");

const LANGS = ["en", "de", "fr", "it", "es", "pt"];
const DEFAULT_FROM = "qa@carlosandmunoz.com";

test("the functions copy of the faces matches scripts/brand-kit/faces.js and face-route", () => {
  assert.deepEqual(Object.keys(mailFace.FACES), Object.keys(FACES));
  for (const id of Object.keys(FACES)) {
    const { handle, email, name, langs, hub } = FACES[id];
    assert.deepEqual(mailFace.FACES[id], { id, handle, email, name, langs, hub }, id);
  }
  assert.equal(mailFace.DEFAULT, route.DEFAULT);
  for (const lang of LANGS.concat("ja", "nl")) assert.equal(mailFace.faceOf(lang).id, route.faceOf(lang), lang);
});

test("en/de/fr/it mail comes from qalaburlreview@, es/pt from qaurlreview@, and a mail with no language keeps the default sender", () => {
  for (const lang of ["en", "de", "fr", "it", "EN-us"]) {
    assert.deepEqual(mailFace.envelope(lang, DEFAULT_FROM, "", DEFAULT_FROM), {
      from: { email: "qalaburlreview@carlosandmunoz.com", name: "QA-lab URL Review" }, replyTo: "qalaburlreview@carlosandmunoz.com"
    }, lang);
  }
  for (const lang of ["es", "pt", "pt-BR"]) {
    assert.deepEqual(mailFace.envelope(lang, DEFAULT_FROM, "", DEFAULT_FROM), {
      from: { email: "qaurlreview@carlosandmunoz.com", name: "QA-lab URL Review · ES/PT" }, replyTo: "qaurlreview@carlosandmunoz.com"
    }, lang);
  }
  for (const lang of [undefined, null, "", "  "]) {
    assert.equal(mailFace.faceOf(lang), null);
    assert.deepEqual(mailFace.envelope(lang, DEFAULT_FROM, "", DEFAULT_FROM), { from: DEFAULT_FROM, replyTo: DEFAULT_FROM });
  }
  assert.equal(mailFace.envelope("es", DEFAULT_FROM, "reply+abc@reply.carlosandmunoz.com", DEFAULT_FROM).replyTo, "reply+abc@reply.carlosandmunoz.com", "a notice's reply thread wins");
});

test("a face links its language's page and its social hub", () => {
  assert.equal(mailFace.faceOf("pt").page, "https://carlosandmunoz.com/qa-review-pt.html");
  assert.equal(mailFace.faceOf("es").hubUrl, "https://carlosandmunoz.com/qa-review-social-es.html");
  assert.equal(mailFace.faceOf("de").page, "https://carlosandmunoz.com/qa-review-de.html");
  assert.equal(mailFace.faceOf("en").page, "https://carlosandmunoz.com/qa-review.html");
  assert.equal(mailFace.faceOf("ja").page, "https://carlosandmunoz.com/qa-review.html", "a language with no page gets English, as its mail does");
  for (const id of Object.keys(FACES)) assert.ok(fs.existsSync(path.join(__dirname, "../..", FACES[id].hub)), FACES[id].hub);
});

test("mail to a face address is read like mail to qa@", () => {
  assert.ok(mailFace.isFaceAlias("qalaburlreview") && mailFace.isFaceAlias("QAURLREVIEW"));
  assert.ok(!mailFace.isFaceAlias("qa") && !mailFace.isFaceAlias("tiktok") && !mailFace.isFaceAlias(""));
});

const card = { id: "u-acme-co", host: "acme.co", read: "2026-10-22", overall: 49, grade: "F", areas: { SEO: 23 } };
const links = { claim: "https://fn/owner?t=x&do=claim", unlist: "https://fn/owner?t=x&do=unlist", stop: "https://fn/owner?t=x&do=stop", live: "https://carlosandmunoz.com/qa-review.html?live=u-acme-co" };
const notice = (lang) => ({ email: "hola@acme.co", host: "acme.co", domain: "acme.co", lang, source: "page", sourceUrl: "https://acme.co/contacto" });

test("an owner notice signs off as its face", () => {
  for (const lang of LANGS) {
    const face = mailFace.faceOf(lang);
    const mail = ownerMail.noticeMail(notice(lang), card, links, null);
    for (const part of [face.name, face.page, "@" + face.handle, face.hubUrl]) {
      assert.ok(mail.text.includes(part), lang + " text has " + part);
      assert.ok(mail.html.includes(customerMail.esc(part)), lang + " html has " + part);
    }
    const other = FACES[FACES[face.id].other];
    assert.ok(!mail.text.includes("@" + other.handle), lang + " never signs as the other face");
  }
  const plain = ownerMail.noticeMail(notice(""), card, links, null);
  assert.ok(plain.text.includes("QA-lab URL Review · Calle 29") && !plain.text.includes("@qalaburlreview"));
});

test("a note and a claimed report send the 'write to' mail to the face address", () => {
  for (const lang of LANGS) {
    const face = mailFace.faceOf(lang);
    const mail = customerMail.noteMail({ lang, host: "acme.co", reportId: "r1", title: "T", body: "B", subject: "S" }, { stopUrl: "https://fn/stop" });
    assert.ok(mail.text.includes(face.email) && !mail.text.includes("qa@carlosandmunoz.com"), lang + " note text");
    assert.ok(mail.html.includes("mailto:" + face.email + "?") && mail.html.includes(customerMail.esc("@" + face.handle)), lang + " note html");
  }
  const plain = customerMail.noteMail({ host: "acme.co", title: "T", body: "B" }, {});
  assert.ok(plain.text.includes("qa@carlosandmunoz.com") && !plain.text.includes("@qaurlreview"));

  const record = { id: "ff00", report: { id: "ff00", host: "acme.co", insights: { score: null, findings: [] } } };
  const claimed = customerMail.reportMail(record, { lang: "pt", face: mailFace.faceOf("pt") });
  assert.ok(claimed.html.includes("mailto:qaurlreview@carlosandmunoz.com?") && claimed.text.includes("qaurlreview@carlosandmunoz.com"));
  const asked = customerMail.reportMail(record, { lang: "pt" });
  assert.ok(!asked.text.includes("qaurlreview@") && asked.html.includes("mailto:qa@carlosandmunoz.com?"), "an asker's own report keeps qa@");
  assert.ok(customerMail.reportPdf(record, { lang: "pt", face: mailFace.faceOf("pt") }).html.includes("mailto:qaurlreview@carlosandmunoz.com?"), "the claimed report's PDF too");
  assert.ok(customerMail.reportPdf(record, { lang: "pt" }).html.includes("mailto:qa@carlosandmunoz.com?"));
});

test("notices, claimed reports and notes go out through sendFaceMail and mailRetry", () => {
  const src = fs.readFileSync(path.join(__dirname, "../../functions/index.js"), "utf8");
  const face = src.match(/async function sendFaceMail[\s\S]*?\n}\n/)[0];
  assert.match(face, /mailRetry\.send\(sgMail, getFirestore\(\), askerMessage\([^]*mailFace\.envelope\(lang, from, replyTo, REVIEW_ALERT_TO\)/);
  for (const category of ["url-review-owner-notice", "url-review-note", "url-review-owner-claim"]) {
    assert.match(src, new RegExp("sendFaceMail\\([^\\n]*\"" + category + "\""), category);
    assert.doesNotMatch(src, new RegExp("sendAskerMail\\([^\\n]*\"" + category + "\""), category);
  }
  assert.match(src, /mail\.alias === "qa" \|\| mailFace\.isFaceAlias\(mail\.alias\)/);
  assert.match(src, /const face = mailFace\.faceOf\(link\.lang\);\n\s+const pdf = await reportPdfFor\(copy, \{ face \}\);/);
});
