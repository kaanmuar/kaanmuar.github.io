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
  assert.match(customerMail.reportMail(Object.assign({}, open, { lang: "de" }), {}).html, /So beheben Sie es:<\/b>/);
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

const clearInsights = Object.assign({}, report.insights, {
  findings: report.insights.findings.filter((item) => item.verdict !== "fail" && item.verdict !== "risk"),
  score: Object.assign({}, report.insights.score, {
    overall: 100,
    grade: "A",
    areas: Object.fromEntries(customerMail.AREAS.map((area) => [area, { score: 100, grade: "A" }]))
  })
});
const clear = Object.assign({}, record, { report: Object.assign({}, report, { insights: clearInsights }) });
const preheaderOf = (mail) => mail.html.match(/<div style="display:none;[^>]*>([^&]*)/)[1];
const blur = /under (the blur|frost)|empañad|desenfoque|embaçad|desfoque|Milchglas|Unschärfe|verre dépoli|flou|smerigliato|sfocatura/i;

test("a review with no findings says the site passed every scored check, never that findings wait under the blur", () => {
  const mail = customerMail.reportMail(clear, {});
  assert.equal(preheaderOf(mail), "Six scores and no findings. The site passed every scored check.");
  assert.match(mail.html, /The six scores are in the clear, and the site passed every scored check\. There are no findings to fix\./);
  assert.equal(mail.subject, report.host + " scored 100/100 and passed every scored check.");
  assert.doesNotMatch(mail.html + mail.text + mail.subject, blur);
  assert.doesNotMatch(mail.html + mail.text, /What to fix first|more findings|\b0 findings|fail now|at risk/);
  const open = customerMail.reportMail(Object.assign({}, clear, { paid: true }), {});
  assert.equal(preheaderOf(open), "Six scores and no findings. The site passed every scored check.");
  assert.doesNotMatch(open.html, /the findings are open/i);
  const es = customerMail.reportMail(Object.assign({}, clear, { lang: "es" }), {});
  assert.equal(preheaderOf(es), "Seis puntajes y ningún hallazgo. El sitio pasó todas las comprobaciones con puntaje.");
  assert.match(es.html, /Los seis puntajes están a la vista y el sitio pasó todas las comprobaciones con puntaje\./);
  for (const lang of customerMail.LANGS) {
    const each = customerMail.reportMail(Object.assign({}, clear, { lang }), {});
    assert.doesNotMatch(each.html + each.text + each.subject, blur, lang);
    assert.doesNotMatch(preheaderOf(each), /\{count\}|\b0\b/, lang);
  }
});

test("a review with findings still says they wait under the blur, with the count", () => {
  const mail = customerMail.reportMail(record, {});
  assert.equal(preheaderOf(mail), "Six scores are open. 26 findings wait under the blur.");
  assert.match(mail.html, /The findings sit under frost/);
  assert.doesNotMatch(mail.html + mail.subject, /passed every scored check/);
  const es = customerMail.reportMail(Object.assign({}, record, { lang: "es" }), {});
  assert.equal(preheaderOf(es), "Los seis puntajes están abiertos. 26 hallazgos esperan bajo el desenfoque.");
  assert.doesNotMatch(es.html, /todas las comprobaciones/);
});

test("a review with neither a score nor findings says nothing came up, without promising six scores", () => {
  const bare = Object.assign({}, record, { report: Object.assign({}, report, { insights: { findings: [] } }) });
  const mail = customerMail.reportMail(bare, {});
  assert.equal(preheaderOf(mail), "No findings came up on the pages analyzed.");
  assert.match(mail.html, /No findings came up on the pages analyzed, so there is nothing to fix\./);
  for (const lang of customerMail.LANGS) {
    const each = customerMail.reportMail(Object.assign({}, bare, { lang }), {});
    assert.doesNotMatch(each.html + each.text, /\b(six|seis|sechs|sei)\b/i, lang);
    assert.doesNotMatch(each.html + each.text, blur, lang);
  }
});

test("the PDF footer and page numbers sit in the page margin, not in a fixed box over the content", () => {
  const { html } = customerMail.reportPdf(record);
  assert.doesNotMatch(html, /\.foot\{|class="foot"/);
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

const reviewCompare = require("../../functions/url-review-compare.js");
const rival = require("./fixtures/review-excalidraw.json");
const cmp = reviewCompare.compareSites(Object.assign({}, report, { id: "ab12cd" }), rival);
const compared = { id: "cd34", email: "ana@example.com", lang: "en", createdAt: "2026-10-24T10:00:00Z", compareWith: "ab12cd", report: Object.assign({}, rival, { id: "cd34", compare: cmp }) };

test("a competitor run's mail carries the comparison: both scores per area, the indicators won, and the problems only one site has", () => {
  const mail = customerMail.reportMail(compared, {});
  assert.match(mail.html, />Next to a competitor<\/p>/);
  assert.ok(mail.html.includes("?report=ab12cd&amp;utm_campaign=report-compare"));
  assert.ok(mail.html.indexOf("Next to a competitor") < mail.html.indexOf("What to fix first"));
  assert.match(mail.text, new RegExp("^Overall: " + report.host + " " + cmp.overall.own + " · " + rival.host + " " + cmp.overall.rival + " · Your lead [+-]?\\d+$", "m"));
  assert.match(mail.text, new RegExp("^Only " + report.host + " has: " + cmp.ownOnlyCount + " open problems · Only " + rival.host + " has: " + cmp.rivalOnlyCount + " open problems$", "m"));
  assert.match(mail.text, /wins \d+ of \d+ indicators\./);
  assert.match(mail.text, /got the public, passive checks only/);
  assert.doesNotMatch(customerMail.reportMail(record, {}).html + customerMail.reportPdf(record).html, /Next to a competitor/);
});

test("the comparison in the mail and the PDF speaks the record's language", () => {
  const titles = { es: "Frente a un competidor", pt: "Ao lado de um concorrente", de: "Neben einem Mitbewerber", fr: "Face à un concurrent", it: "Accanto a un concorrente" };
  for (const [lang, title] of Object.entries(titles)) {
    const each = Object.assign({}, compared, { lang });
    assert.ok(customerMail.reportMail(each, {}).text.includes("\n" + title + "\n"), lang);
    assert.ok(customerMail.reportPdf(each).html.includes("<h2>" + customerMail.esc(title) + "</h2>"), lang);
    assert.doesNotMatch(customerMail.reportMail(each, {}).text, /Your lead|open problems|indicators/, lang);
  }
  assert.match(customerMail.reportMail(Object.assign({}, compared, { lang: "de" }), {}).text, /^Ihre Prüfung von /m);
});

test("the mail's comparison wording matches the comparison card on the page", () => {
  const vm = require("node:vm");
  const source = require("node:fs").readFileSync(require("node:path").join(__dirname, "../../js/qa-review-compare-copy.js"), "utf8");
  for (const lang of customerMail.LANGS) {
    const sandbox = { window: {}, document: { documentElement: { lang } } };
    vm.runInNewContext(source, sandbox);
    const card = sandbox.window.QAReviewCompareCopy;
    const mail = customerMail.reportMail(Object.assign({}, compared, { lang }), {}).text;
    if (lang !== "de") assert.ok(mail.includes(card.t("intro", { own: report.host, when: card.t("introWhen", { date: "2026-10-19" }), rival: rival.host })), lang);
    assert.ok(mail.includes(card.t("shared", { n: cmp.shared })), lang);
    assert.ok(mail.includes(card.t("passive", { rival: rival.host }) + " " + card.t("verdictNote")), lang);
  }
});

test("an unpaid PDF frosts the problem titles of the comparison, and an open one prints them", () => {
  const title = cmp.rivalOnly[0].title;
  assert.ok(customerMail.reportPdf(Object.assign({}, compared, { paid: true })).html.includes(customerMail.esc(title)));
  assert.ok(!customerMail.reportPdf(compared).html.includes(customerMail.esc(title)));
  assert.ok(customerMail.reportPdf(compared).html.includes("Only " + rival.host + " has: " + cmp.rivalOnlyCount + "</h3>"));
});
