#!/usr/bin/env node
/* Renders every URL Review mail and PDF from a fixture review, then screenshots them.
   node scripts/preview-review-mails.js [outDir]   (default: $TMPDIR/review-mail-preview) */
const fs = require("fs");
const os = require("os");
const path = require("path");
const customerMail = require("../functions/url-review-customer-mail");
const ownerMail = require("../functions/url-review-owner-mail");
const reviewMail = require("../functions/url-review-mail");
const reviewFailures = require("../functions/url-review-failures");
const { ownerMail: ownerLayout } = require("../functions/owner-mail");

const out = path.resolve(process.argv[2] || path.join(os.tmpdir(), "review-mail-preview"));
fs.mkdirSync(out, { recursive: true });

const report = require("../tests/unit/fixtures/review-wordpress.json");
const base = { id: "r7Kq2mWx9", email: "ana@example.com", name: "Ana", lang: "en", createdAt: "2026-10-22T15:04:00Z", retainUntil: "2027-10-22T15:04:00Z", report };
const noScore = Object.assign({}, base, { report: Object.assign({}, report, { insights: { findings: report.insights.findings } }) });
const files = [];

function save(name, mail) {
  fs.writeFileSync(path.join(out, name + ".html"), mail.html);
  if (mail.text) fs.writeFileSync(path.join(out, name + ".txt"), (mail.subject ? "Subject: " + mail.subject + "\n\n" : "") + mail.text);
  files.push({ name, pdf: !!mail.pdf });
}

save("report-blurred", customerMail.reportMail(base, { stopUrl: "https://fn/notes/stop?t=1", attached: true }));
save("report-open", customerMail.reportMail(Object.assign({}, base, { paid: true }), { stopUrl: "https://fn/notes/stop?t=1", attached: true }));
save("report-rerun", customerMail.reportMail(Object.assign({}, base, { free: true, rerunOf: ["f1"], failedAt: "2026-10-20T10:00:00Z" }), { attached: true }));
save("report-stopped", customerMail.reportMail(Object.assign({}, base, { status: "stopped" }), { attached: true }));
save("report-noscore", customerMail.reportMail(noScore, { attached: false }));
save("report-blurred-de", customerMail.reportMail(Object.assign({}, base, { lang: "de" }), { attached: true }));
save("report-claimed-es", customerMail.reportMail(base, { lang: "es", attached: true, why: ownerMail.claimWhy("es", report.host) }));
save("pdf-blurred", Object.assign(customerMail.reportPdf(base), { pdf: true }));
save("pdf-open", Object.assign(customerMail.reportPdf(Object.assign({}, base, { paid: true })), { pdf: true }));
save("note-return", customerMail.noteMail({ lang: "en", host: report.host, reportId: base.id, kind: "return", subject: "Three of the fixes on wordpress.org take an hour", title: "Three fixes take an hour", body: "The content security policy, the HSTS header and the alt text on the start page are each an hour of work. The report lists them first." }, { stopUrl: "https://fn/notes/stop?t=1", coupon: "BACK20" }));
save("sign-in", customerMail.signInMail("en", { id: "s1", token: "t", code: "482913" }, "qa-review.html"));
const score = report.insights.score;
save("owner-notice", ownerMail.noticeMail(
  { lang: "en", host: report.host, domain: "wordpress.org", email: "security@wordpress.org", source: "security.txt", critical: true, reviewedAt: base.createdAt },
  { read: base.createdAt, overall: score.overall, grade: score.grade, areas: {} },
  { claim: "https://fn/claim", unlist: "https://fn/unlist", stop: "https://fn/stop", live: "https://carlosandmunoz.com/live/wordpress.org" },
  score
));

const at = (h) => new Date(Date.UTC(2026, 9, 22, h, 12)).toISOString();
const opens = [
  { createdAt: at(13), page: "qa-review.html", query: "?utm_source=linkedin", lang: "en", country: "US", city: "Austin", screen: "desktop", timezone: "America/Chicago", ip: "1.2.3.4", userAgent: "Mozilla/5.0 Chrome/130" },
  { createdAt: at(14), page: "qa-review-es.html", lang: "es", country: "CO", city: "Medellín", referrerHost: "www.google.com", screen: "phone", timezone: "America/Bogota", ip: "5.6.7.8", userAgent: "Mozilla/5.0 Safari" },
  { createdAt: at(15), page: "qa-review-pay.html", lang: "en", country: "DE", city: "Berlin", screen: "desktop", timezone: "Europe/Berlin", ip: "9.9.9.9", userAgent: "Mozilla/5.0 Firefox" }
];
const reviews = [
  Object.assign({}, base, { status: "complete", paid: true, priceUsd: 9, frameworks: ["playwright"], pages: 20, depth: 2, country: "US", city: "Austin", requestedUrl: "https://wordpress.org/", mail: { sent: true, pdf: true } }),
  { createdAt: at(16), status: "failed", name: "Luis", email: "luis@example.co", requestedUrl: "https://shop.example.co/", reasonCode: "blocked", country: "CO", city: "Bogotá" },
  { createdAt: at(17), status: "complete", paid: false, priceUsd: 9, name: "Jo", email: "jo@example.de", requestedUrl: "https://example.de/", report: { host: "example.de", counts: { cases: 40 }, insights: { score: { overall: 64, grade: "D" } } }, country: "DE", city: "Berlin", mail: { sent: false, error: "Bad Request" } },
  { createdAt: at(17), status: "paid-report", paid: true, priceUsd: 9, email: "ana@example.com", reportId: base.id, provider: "stripe" },
  { createdAt: at(18), status: "payment-due", name: "Max", email: "max@example.de", requestedUrl: "https://example.org/", priceUsd: 9 },
  { createdAt: at(19), status: "owner-claim", email: "owner@wordpress.org", report: { host: "wordpress.org" }, mail: { sent: true, pdf: true } }
];
const summary = reviewMail.summarizePeriod(opens, reviews, [{ at: at(18), kind: "pdf", reportId: base.id }], []);
const previous = reviewMail.summarizePeriod(opens.slice(0, 1), reviews.slice(0, 1), [], []);
const failures = reviewFailures.periodFailures({
  failures: [{ kind: "failed", at: at(16), host: "shop.example.co", url: "https://shop.example.co/", name: "Luis", cause: { id: "blocked" } }],
  previous: [],
  reruns: [],
  bugs: [{ issue: 412, title: "BE: A bot wall answered the review", cause: "blocked", runs: 2, hosts: ["shop.example.co"] }],
  phrase: "the day before",
  deskUrl: "https://fn/desk/failures"
});
save("period-daily", Object.assign({ subject: reviewMail.reportSubject("Daily", "22 Oct 2026", summary, failures.failed) }, ownerLayout({
  eyebrow: "QA-lab URL Review",
  intro: "Daily QA-lab URL Review report for 22 Oct 2026",
  rows: reviewMail.reportRows(summary, previous, "the day before", {
    failures: failures.rows,
    followUp: { notes: 2, stops: 1, notices: 5, unlisted: 1, replies: 1, redemptions: 0 },
    sweep: 24
  }),
  body: [summary.body, failures.body].join("\n\n")
})));
save("open-notification", Object.assign({ subject: "QA-lab URL Review was opened" }, ownerLayout({
  eyebrow: "QA-lab URL Review",
  intro: "Someone opened the QA-lab URL Review",
  rows: reviewMail.openRows(Object.assign({}, opens[0], { name: "Ana", email: "ana@example.com", urls: ["https://wordpress.org/"] }), 0)
})));

(async () => {
  let chromium;
  try { ({ chromium } = require("playwright")); } catch (error) { console.log("HTML written to " + out + " (no playwright for screenshots)"); return; }
  const browser = await chromium.launch({ channel: "chrome" });
  for (const file of files) {
    const page = await browser.newPage({ viewport: { width: file.pdf ? 794 : 680, height: 900 } });
    await page.goto("file://" + path.join(out, file.name + ".html"));
    if (file.pdf) {
      await page.emulateMedia({ media: "print" });
      await page.pdf({ path: path.join(out, file.name + ".pdf"), format: "A4", printBackground: true, preferCSSPageSize: true });
    }
    await page.screenshot({ path: path.join(out, file.name + ".png"), fullPage: true });
    await page.close();
  }
  await browser.close();
  console.log(files.length + " previews in " + out);
})();
