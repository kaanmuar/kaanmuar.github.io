const test = require("node:test");
const assert = require("node:assert/strict");
const notice = require("../../functions/url-review-owner-notice");
const ownerMail = require("../../functions/url-review-owner-mail");

const report = (...findings) => ({ insights: { findings } });
const f = (key, verdict, severity) => ({ key, verdict, severity, area: "SEO" });
const links = { claim: "https://c", unlist: "https://u", stop: "https://s", live: "https://l" };

test("a notice leads with the worst Google Maps finding: failing first, then severity, then the profile order", () => {
  assert.equal(notice.localLead(report(f("local-utm", "risk", "low"), f("local-hours", "risk", "medium"), f("local-nap", "pass", "info"))), "hours");
  assert.equal(notice.localLead(report(f("local-hours", "risk", "medium"), f("local-website", "fail", "high"))), "website_fail");
  assert.equal(notice.localLead(report(f("local-status", "fail", "high"), f("local-website", "fail", "high"))), "status_fail");
  assert.equal(notice.localLead(report(f("local-status", "risk", "medium"), f("local-hours", "risk", "medium"))), "status_risk");
  assert.equal(notice.localLead(report(f("local-website", "risk", "medium"))), "website_risk");
  assert.equal(notice.localLead(report(f("local-website", "risk", "low"), f("local-utm", "risk", "low"))), "website_low");
  assert.equal(notice.localLead(report(f("local-profile", "person", "low"))), "profile");
  assert.equal(notice.localLead(report(f("local-profile", "pass", "info"), f("meta-title", "risk", "high"))), "");
  assert.equal(notice.localLead(null), "");
});

test("the notice row keeps the lead key, and the mail opens with it in the owner's language before the usual lead", () => {
  const record = { report: { id: "r1", host: "www.speed-plumbing.com", fetchedAt: "2026-11-02T05:00:00Z", insights: { findings: [f("local-hours", "risk", "medium")] } } };
  const row = notice.noticeRow(record, [{ email: "info@speed-plumbing.com", sources: ["schema"], url: "https://speed-plumbing.com/", onDomain: true }], Date.parse("2026-11-02T06:00:00Z"));
  assert.equal(row.local, "hours");
  for (const lang of ["en", "es", "pt", "de", "fr", "it"]) {
    const mail = ownerMail.noticeMail(Object.assign({}, row, { lang }), { read: "2026-11-02" }, links, null);
    const text = mail.text.split("\n").filter(Boolean);
    assert.match(text[1], /speed-plumbing\.com/, lang);
    assert.match(text[1], /Google[ -]Maps/, lang);
    assert.match(mail.html, /Google[ -]Maps/, lang);
  }
});

test("every lead key has copy in all six languages, and a notice without one reads as before", () => {
  const keys = ["status_fail", "status_risk", "website_fail", "website_risk", "website_low", "hours", "nap", "utm", "profile"];
  for (const lang of ["en", "es", "pt", "de", "fr", "it"]) {
    for (const key of keys) {
      const mail = ownerMail.noticeMail({ lang, host: "smile.dental", domain: "smile.dental", source: "schema", email: "a@smile.dental", local: key }, { read: "2026-11-02" }, links, null);
      assert.match(mail.text, /smile\.dental/, lang + " " + key);
      assert.ok(!/\{host\}/.test(mail.text), lang + " " + key);
    }
  }
  const plain = ownerMail.noticeMail({ lang: "en", host: "smile.dental", domain: "smile.dental", source: "schema", email: "a@smile.dental" }, { read: "2026-11-02" }, links, null);
  assert.ok(!/Google Maps/.test(plain.text));
});
