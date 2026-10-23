const test = require("node:test");
const assert = require("node:assert/strict");
const customerMail = require("../../functions/url-review-customer-mail.js");
const { summarizePeriod, reportRows, reportSubject } = require("../../functions/url-review-mail.js");
const { ownerMail, ownerRows } = require("../../functions/owner-mail.js");
const report = require("./fixtures/review-wordpress.json");

const record = { id: "r7Kq2mWx9", email: "ana@example.com", lang: "en", createdAt: "2026-10-22T15:04:00Z", report };

test("the report mail labels each finding with its severity and states the date and the fail and risk counts", () => {
  const mail = customerMail.reportMail(record, {});
  assert.match(mail.html, /Analytics &middot; <\/span><span [^>]*color:#b91c1c;">high<\/span>/);
  assert.match(mail.html, /Analyzed on 2026-10-19 &middot; 20 pages analyzed &middot; 77 proposed test cases/);
  assert.match(mail.html, />0 fail now<\/span>.*>26 at risk<\/span>/);
  assert.match(mail.text, /^- \[Analytics · high\] Tracking starts on/m);
  assert.match(mail.text, /^0 fail now · 26 at risk$/m);
});

test("an open report mail and PDF carry the fix of each finding, and a blurred one never does", () => {
  const fix = report.insights.findings.find((item) => item.rank === 1).fix;
  const open = Object.assign({}, record, { paid: true });
  assert.ok(customerMail.reportMail(open, {}).html.includes("Fix:</b> " + customerMail.esc(fix)));
  assert.ok(customerMail.reportMail(open, {}).text.includes("  Fix: " + fix));
  assert.ok(customerMail.reportPdf(open).html.includes(customerMail.esc(fix)));
  assert.ok(!customerMail.reportMail(record, {}).html.includes(customerMail.esc(fix)));
  assert.ok(!customerMail.reportPdf(record).html.includes(customerMail.esc(fix)));
  assert.match(customerMail.reportMail(Object.assign({}, open, { lang: "de" }), {}).html, /So behebst du es:<\/b>/);
});

test("a review without a score does not promise six scores", () => {
  const plain = Object.assign({}, record, { report: Object.assign({}, report, { insights: { findings: report.insights.findings } }) });
  for (const lang of customerMail.LANGS) {
    const mail = customerMail.reportMail(Object.assign({}, plain, { lang }), {});
    assert.doesNotMatch(mail.html + mail.text, /\b(six|seis|sechs|six|sei)\b/i, lang);
  }
  assert.match(customerMail.reportMail(plain, {}).html, /The findings sit under frost/);
  assert.match(customerMail.reportMail(Object.assign({}, plain, { paid: true }), {}).html, /The findings are open, each line in full\./);
});

test("the PDF footer and page numbers sit in the page margin, not in a fixed box over the content", () => {
  const { html } = customerMail.reportPdf(record);
  assert.doesNotMatch(html, /position:fixed|class="foot"/);
  assert.match(html, /@bottom-left\{content:"QA-lab URL Review · carlosandmunoz\.com\/qa-review\.html"/);
  assert.match(html, /@bottom-right\{content:"r7Kq2mWx9" "  ·  " counter\(page\) " \/ " counter\(pages\)/);
  assert.match(customerMail.reportPdf(Object.assign({}, record, { id: "a\"}b" })).html, /content:"ab"/);
  assert.match(html, /<span class="url">https:\/\/wordpress\.org\/<\/span>/);
});

const at = (h) => new Date(Date.UTC(2026, 9, 22, h)).toISOString();
const rows = [
  { createdAt: at(13), status: "complete", email: "ana@x.co", paid: true, priceUsd: 9, report: { insights: { score: { overall: 80, grade: "B" } } }, mail: { sent: true, pdf: true } },
  { createdAt: at(14), status: "complete", email: "ana@x.co", paid: true, free: true, priceUsd: 0, mail: { sent: false, error: "Bad Request" } },
  { createdAt: at(15), status: "stopped", email: "jo@x.de", paid: false, priceUsd: 9, report: { insights: { score: { overall: 60, grade: "D" } } } },
  { createdAt: at(15), status: "failed", email: "lu@x.co" },
  { createdAt: at(16), status: "paid-report", paid: true, priceUsd: 9, reportId: "r1" },
  { createdAt: at(16), status: "run-credit", paid: true, priceUsd: 19 },
  { createdAt: at(16), status: "run-credit", paid: true, priceUsd: 19, test: true },
  { createdAt: at(16), status: "run-credit-used", paid: true, priceUsd: 19 },
  { createdAt: at(17), status: "checkout-open", priceUsd: 9 },
  { createdAt: at(17), status: "payment-due", email: "max@x.de", priceUsd: 9 },
  { createdAt: at(18), status: "owner-claim", email: "owner@x.co", report: { host: "x.co" } }
];

test("the period summary counts runs as reviews, and reads money from the payments only", () => {
  const summary = summarizePeriod([{ ip: "1" }, { ip: "1" }, { ip: "2" }], rows, [], []);
  assert.equal(summary.reviews, 4);
  assert.deepEqual(summary.statuses, { complete: 2, stopped: 1, failed: 1 });
  assert.equal(summary.claims, 1);
  assert.deepEqual(summary.turnedAway, { "payment-due": 1 });
  assert.equal(summary.paidUsd, 28);
  assert.equal(summary.paidCount, 2);
  assert.deepEqual(summary.paidKinds, { "report unlocks": 1, "run credits": 1 });
  assert.equal(summary.testPayments, 1);
  assert.equal(summary.checkouts, 1);
  assert.equal(summary.paidRuns, 1);
  assert.equal(summary.freeRuns, 1);
  assert.equal(summary.visitors, 2);
  assert.equal(summary.averageScore, 70);
  assert.equal(summary.repeatAskers, 1);
  assert.deepEqual(summary.mailed, { sent: 1, pdf: 1, failed: 1, unrecorded: 1 });
  assert.match(summary.body, /\nPayments\n.*paid-report/);
  assert.match(summary.body, /\nTurned away\n.*payment-due · max@x\.de/);
  assert.match(summary.body, /\nOwner claims\n.*x\.co · owner@x\.co/);
  assert.match(summary.body, /complete · ana@x\.co · 0 USD · free · mail failed: Bad Request/);
});

test("the period report leads with volume and money, puts deltas inline, and drops empty sections", () => {
  const summary = summarizePeriod([{ ip: "1", createdAt: at(15) }, { ip: "2", createdAt: at(13) }], rows, [], []);
  const previous = summarizePeriod([{ ip: "1" }], rows.slice(0, 1), [], []);
  const list = reportRows(summary, previous, "the day before", { followUp: { notes: 1, stops: 0, notices: 2, unlisted: 0, replies: 1, redemptions: 0 }, sweep: 3 });
  const row = (label) => (list.find((item) => item.label === label) || {}).value;
  assert.equal(list[0].heading, "Volume and money");
  assert.equal(row("Opens"), "2 (1 the day before, +1); 2 networks");
  assert.equal(row("Revenue"), "28 USD (0 USD the day before, +28) from 2 payments (report unlocks 1, run credits 1); 1 test not counted");
  assert.equal(row("Conversion"), "200% of opens ran a review, 25% of reviews were paid for");
  assert.equal(row("Report mails"), "1 sent (1 with PDF), 1 failed, 1 not recorded");
  assert.equal(row("Owner notices"), "2 sent, 1 claimed, 0 taken off Live Reports, 1 reply");
  assert.equal(row("Country sweep"), "3 reviewed, not counted above");
  assert.equal(row("Hours"), "08 1, 10 1 America/Bogota");
  const kept = ownerRows(list);
  assert.ok(!kept.some((item) => item.heading === "Failures"));
  assert.ok(!kept.some((item) => item.label === "Follow-up notes" && !item.value));
  assert.equal(reportSubject("Daily", "22 Oct 2026", summary, 1), "Daily URL review — 22 Oct 2026 · 4 reviews, 28 USD, 1 failed");
  assert.equal(reportSubject("Daily", "22 Oct 2026", summarizePeriod([], [rows[0]], [], []), 0), "Daily URL review — 22 Oct 2026 · 1 review");
});

test("the owner mail renders section headings and its eyebrow", () => {
  const mail = ownerMail({ intro: "Report", eyebrow: "QA-lab URL Review", rows: [{ heading: "Money" }, { label: "Revenue", value: "9 USD" }, { heading: "Empty" }, { label: "Nothing", value: "" }] });
  assert.match(mail.html, />QA-lab URL Review<\/p>/);
  assert.match(mail.html, />Money<\/td>/);
  assert.doesNotMatch(mail.html, />Empty</);
  assert.equal(mail.text, "Report\n\nMONEY\nRevenue: 9 USD\n\n");
  assert.match(ownerMail({ intro: "x", rows: [] }).html, />Carlos Muñoz CV<\/p>/);
});
