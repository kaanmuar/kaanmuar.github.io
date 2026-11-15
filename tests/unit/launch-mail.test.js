const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const launchMail = require("../../functions/launch-mail");
const COPY = require("../../functions/launch-mail-copy");
const fixOffers = require("../../functions/url-review-fix-offers");
const report = require("./fixtures/review-wordpress.json");

const LANGS = ["en", "es", "pt", "de", "fr", "it"];
const DURING = Date.parse("2026-11-12T12:00:00Z");
const AFTER = Date.parse("2026-12-11T05:00:00Z");
const STOP = "https://fn.example/notes/stop?t=abc";

function shape(value) {
  if (Array.isArray(value)) return value.map(shape);
  if (value && typeof value === "object") return Object.fromEntries(Object.keys(value).sort().map((key) => [key, shape(value[key])]));
  return typeof value;
}

test("every language has every line of every template", () => {
  LANGS.forEach((lang) => assert.deepEqual(shape(COPY[lang]), shape(COPY.en), lang));
  LANGS.forEach((lang) => assert.equal(COPY[lang].L.checks.length, 6, lang));
});

test("each launch design carries the code, the 50% note that packages take no code, the hero with alt text and an unsubscribe link", () => {
  launchMail.OPTIONS.forEach((option) => LANGS.forEach((lang) => {
    const mail = launchMail.launchMail(option, lang, { code: "LAUNCH-ABCD2345", stopUrl: STOP }, { now: DURING });
    const words = COPY[lang].L;
    assert.equal(mail.subject, words.subjects[option]);
    assert.ok(mail.html.includes("LAUNCH-ABCD2345"), option + lang);
    assert.ok(mail.html.includes("coupon=LAUNCH-ABCD2345"), option + lang);
    assert.ok(mail.html.includes("https://carlosandmunoz.com/assets/mail/launch/" + launchMail.HERO[option]));
    assert.ok(mail.html.includes("alt=\"" + words.heroAlt[option].replace(/'/g, "&#39;") + "\""), option + lang);
    assert.ok(mail.html.includes(STOP) && mail.text.includes(STOP));
    assert.ok(mail.html.includes("v:roundrect"), "bulletproof button for Outlook");
    assert.match(mail.html, /max-width:600px/);
    assert.match(mail.html, /name="color-scheme"/);
    assert.ok(mail.text.includes(COPY[lang].F.noCoupon));
    assert.ok(mail.text.includes("LAUNCH-ABCD2345"));
    assert.equal(mail.lang, lang);
  }));
});

test("the launch mail lists every package at its launch price with the list price struck, and only the list price after Dec 10", () => {
  const during = launchMail.launchMail("editorial", "en", { code: "LAUNCH-ABCD2345", stopUrl: STOP }, { now: DURING });
  const after = launchMail.launchMail("editorial", "en", { code: "LAUNCH-ABCD2345", stopUrl: STOP }, { now: AFTER });
  fixOffers.PACKAGES.forEach((pkg) => {
    assert.ok(during.html.includes("US$" + pkg.usd + "</span>"), pkg.id);
    assert.ok(during.html.includes("List US$" + pkg.listUsd), pkg.id);
    assert.ok(after.html.includes("US$" + pkg.listUsd + "</span>"), pkg.id);
    assert.ok(!after.html.includes("List US$" + pkg.listUsd), pkg.id);
  });
});

test("the three animated heroes are hosted with the site and each is under 1 MB", () => {
  Object.values(launchMail.HERO).forEach((file) => {
    const size = fs.statSync(path.join(__dirname, "..", "..", "assets", "mail", "launch", file)).size;
    assert.ok(size > 10000 && size < 1000000, file + " is " + size + " bytes");
    assert.equal(fs.readFileSync(path.join(__dirname, "..", "..", "assets", "mail", "launch", file)).subarray(0, 6).toString(), "GIF89a");
  });
});

test("the outreach mail leads with the safety checks and fixed prices, names the host and carries no code", () => {
  LANGS.forEach((lang) => {
    const mail = launchMail.outreachMail(lang, { host: "bakery.example", name: "Ana", stopUrl: STOP }, { now: DURING });
    assert.ok(mail.subject.includes("bakery.example"), lang);
    assert.ok(mail.html.includes(COPY[lang].L.checks[0][0].replace(/'/g, "&#39;")), lang);
    assert.ok(mail.text.includes("US$69"), lang);
    assert.ok(mail.html.includes("url=https%3A%2F%2Fbakery.example%2F"), lang);
    assert.ok(!/LAUNCH-/.test(mail.html), lang);
    assert.ok(mail.html.includes(STOP), lang);
  });
  const withReport = launchMail.outreachMail("en", { host: "bakery.example", reportUrl: "https://carlosandmunoz.com/qa-review.html?report=r1", date: "2026-11-09", count: 14, critical: 1 }, { now: DURING });
  assert.match(withReport.text, /14 findings, 1 of them critical/);
  assert.match(launchMail.outreachMail("en", { host: "bakery.example" }, { now: DURING }).text, /^Hello,/);
});

test("the student mail offers the outreach trial's days and percent, and the fixed-price fixes", () => {
  const trial = require("../../functions/outreach-trials").TRIAL;
  LANGS.forEach((lang) => {
    const mail = launchMail.studentOutreachMail(lang, { name: "Sam", trialUrl: "https://carlosandmunoz.com/qa-review.html?trial=TRY-AB12CD", stopUrl: STOP }, { now: DURING });
    assert.ok(mail.text.includes(String(trial.followup.student)), lang);
    assert.ok(mail.html.includes("trial=TRY-AB12CD"), lang);
    assert.ok(mail.text.includes("US$69"), lang);
  });
});

test("the fixable follow-up is off by default, lists only the packages the report's findings call for and links to the fix panel", () => {
  assert.equal(launchMail.fixableOn({}), false);
  assert.equal(launchMail.fixableOn({ FIXABLE_FOLLOWUP_MAIL: "true" }), false);
  assert.equal(launchMail.fixableOn({ FIXABLE_FOLLOWUP_MAIL: "on" }), true);
  const record = { id: "r7Kq2mWx9", lang: "fr", email: "ana@example.com", report };
  const mail = launchMail.fixableMail(record, { stopUrl: STOP, now: DURING });
  const offers = fixOffers.offersFor(report.insights.findings, DURING);
  assert.equal(mail.count, offers.reduce((n, o) => n + o.findings.length, 0));
  assert.ok(mail.html.includes("report=r7Kq2mWx9"));
  assert.ok(mail.html.includes("#fix-offer"));
  assert.ok(mail.text.includes(COPY.fr.F.noCoupon));
  fixOffers.PACKAGES.forEach((pkg) => assert.equal(mail.html.includes(pkg.name.fr.replace(/'/g, "&#39;")), offers.some((o) => o.id === pkg.id), pkg.id));
  const clean = JSON.parse(JSON.stringify(report));
  clean.insights.findings = clean.insights.findings.filter((f) => !fixOffers.packageFor(f.key));
  assert.equal(launchMail.fixableMail(Object.assign({}, record, { report: clean }), {}), null);
});
