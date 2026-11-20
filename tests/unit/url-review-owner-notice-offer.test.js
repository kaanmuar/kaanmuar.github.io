const test = require("node:test");
const assert = require("node:assert/strict");

const offer = require("../../functions/url-review-owner-notice-offer");
const ownerMail = require("../../functions/url-review-owner-mail");
const reviewAuth = require("../../functions/url-review-auth");

function report(extra) {
  return Object.assign(
    {
      id: "abc123",
      host: "shop.acme.co",
      limits: { pagesRead: 5, maxPages: 20 },
      pages: [{ url: "https://shop.acme.co/", path: "/", status: 200 }],
      targeted: { status: "critical", level: "critical", items: [{ level: "critical" }] },
      insights: {
        score: {
          overall: 40,
          grade: "F",
          areas: { Security: { score: 20, grade: "F" } },
          totals: { fail: 1, risk: 0, pass: 0, person: 0 }
        },
        findings: [
          { key: "sec-kev", area: "Security", verdict: "fail", severity: "critical", title: "KEV CVE found", fix: "Upgrade the affected packages." },
          { key: "sec-hsts", area: "Security", verdict: "fail", severity: "medium", title: "HSTS", fix: "Send HSTS" }
        ]
      },
      contacts: { found: [{ email: "security@acme.co", source: "security.txt", url: "https://shop.acme.co/.well-known/security.txt" }] }
    },
    extra || {}
  );
}

function record(extra) {
  return Object.assign(
    {
      id: "rev1",
      paid: true,
      email: "payer@client.com",
      status: "complete",
      report: report()
    },
    extra || {}
  );
}

test("showOffer is false on free or non-critical paid reports (#3926)", () => {
  const paidCtx = { paid: true };
  assert.equal(offer.showOffer(report(), paidCtx), true);
  assert.equal(offer.showOffer(report(), { paid: false }), false);
  assert.equal(offer.showOffer(report({ insights: { findings: [] } }), paidCtx), false);
  assert.equal(offer.showOffer(report({ insights: { findings: [{ key: "sec-feodo", severity: "high", verdict: "fail" }] } }), paidCtx), false);
  assert.equal(offer.showOffer(report(), { paid: true, preview: true }), false);
});

test("refuseReason blocks non-payers and other accounts (#3926)", () => {
  const row = record();
  assert.equal(offer.refuseReason(row, "payer@client.com"), "");
  assert.equal(offer.refuseReason(Object.assign({}, row, { paid: false }), "payer@client.com"), "Only a paid report can send this notice.");
  assert.match(offer.refuseReason(row, "other@evil.com"), /Only the account that ran this review/);
});

test("attack mail lists title, level, source and fix only when attackOffer is set (#3926)", () => {
  const notice = {
    host: "shop.acme.co",
    domain: "acme.co",
    lang: "en",
    email: "security@acme.co",
    source: "security.txt",
    attackOffer: true,
    attackFindings: offer.attackMailFindings(report())
  };
  const mail = ownerMail.noticeMail(
    notice,
    { id: "u-shop", read: "2026-11-19", overall: 50, grade: "F" },
    { claim: "https://x/claim", unlist: "https://x/unlist", stop: "https://x/stop", live: "https://x/live" },
    report().insights
  );
  assert.match(mail.text, /KEV CVE found/);
  assert.match(mail.text, /critical/);
  assert.match(mail.text, /CISA KEV/);
  assert.match(mail.text, /Upgrade the affected packages/);

  const plain = ownerMail.noticeMail(
    Object.assign({}, notice, { attackOffer: false, attackFindings: [] }),
    { id: "u-shop", read: "2026-11-19", overall: 50, grade: "F" },
    { claim: "https://x/claim", unlist: "https://x/unlist", stop: "https://x/stop", live: "https://x/live" },
    report().insights
  );
  assert.doesNotMatch(plain.text, /attack or exploit signals/i);
});

test("sendFromAsker refuses the wrong account and never auto-runs (#3926)", async () => {
  let queued = 0;
  const out = await offer.sendFromAsker(record(), "stranger@x.com", {
    db: { collection: () => ({ doc: () => ({ set: async () => {} }) }) },
    queueOwnerNotice: async () => {
      queued += 1;
    },
    decideOwnerNotice: async () => ({ status: "sent" })
  });
  assert.equal(out.error, offer.refuseReason(record(), "stranger@x.com"));
  assert.equal(queued, 0);
});

test("reportAccess mirrors the paying-account gate (#3926)", async () => {
  const store = reviewAuth.memoryStore();
  const deviceKey = "a".repeat(64);
  const started = await reviewAuth.startEmail(store, { email: "payer@client.com", deviceKey });
  const signed = await reviewAuth.finishEmail(store, { id: started.id, code: started.code, deviceKey });
  const row = { report: report(), paid: true, email: "payer@client.com" };
  const ok = await reviewAuth.reportAccess(store, { session: signed.session, deviceKey }, row, false);
  assert.equal(ok.ok, true);
  const no = await reviewAuth.reportAccess(store, { session: signed.session, deviceKey }, Object.assign({}, row, { email: "other@x.com" }), false);
  assert.equal(no.ok, false);
  assert.match(no.error, /another account/);
});

test("no scheduled job sends attack-offer notices on its own (#3926)", () => {
  const ops = require("../../functions/ops-schedule");
  const jobs = ops.JOBS.map((row) => row.job);
  assert.ok(jobs.includes("sendOwnerNotices"));
  assert.ok(!jobs.some((job) => /attack|3926|owner-notice-offer/i.test(job)));
  assert.deepEqual(offer.autoSendPaths(), [{ file: "functions/ops-schedule.js", job: "sendOwnerNotices" }]);
});