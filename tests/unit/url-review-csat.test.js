const test = require("node:test");
const assert = require("node:assert/strict");
const csat = require("../../functions/url-review-csat.js");
const customerMail = require("../../functions/url-review-customer-mail.js");
const jarvisMailPush = require("../../functions/jarvis-mail-push.js");
const report = require("./fixtures/review-wordpress.json");

const record = { id: "r7Kq2mWx9", email: "ana@example.com", lang: "en", createdAt: "2026-10-22T15:04:00Z", report };

test("parseRating and parseNps accept only their ranges", () => {
  assert.equal(csat.parseRating(5), 5);
  assert.equal(csat.parseRating(0), 0);
  assert.equal(csat.parseNps(0), 0);
  assert.equal(csat.parseNps(10), 10);
  assert.equal(csat.parseNps(11), -1);
});

test("readSubmit needs stars and NPS; quote checkbox becomes quoteOk", () => {
  const ok = csat.readSubmit({ rating: "4", nps: "9", comment: "  Clear  ", quote: "on" });
  assert.deepEqual(ok, { rating: 4, nps: 9, comment: "Clear", quoteOk: true });
  assert.equal(csat.isComplete(ok), true);
  assert.equal(csat.isComplete(csat.readSubmit({ rating: "4" })), false);
});

test("low scores get a draft reply and thanks CTAs", () => {
  const submit = csat.readSubmit({ rating: "2", nps: "4", comment: "Hard to read" });
  assert.equal(csat.isLow(submit), true);
  const row = csat.recordFrom(submit, { reviewId: "r1", email: "a@b.co", host: "shop.example", lang: "en", via: "email-link" });
  assert.equal(row.low, true);
  assert.equal(row.quoteOk, false);
  assert.match(row.draftReply, /shop\.example/);
  assert.match(row.draftReply, /Hard to read/);
  const urls = csat.thanksUrls("en", "shop.example", "r1");
  assert.match(urls.bookUrl, /book\.html|walkthrough/);
  assert.match(urls.rerunUrl, /^mailto:/);
  const thanks = csat.csatPage("en", "thanks", Object.assign({ host: "shop.example", low: true }, urls));
  assert.match(thanks, /Sorry this missed/);
  assert.match(thanks, /Book a 30-min call/);
});

test("csatPage ask form carries stars, NPS and quote opt-in", () => {
  const html = csat.csatPage("en", "ask", { host: "example.com", rating: 5 });
  assert.match(html, /How was this review\?/);
  assert.match(html, /name="rating"/);
  assert.match(html, /name="nps"/);
  assert.match(html, /name="quote"/);
  assert.match(html, /value="5" checked/);
});

test("mailBlock and remindMail point at the CSAT link", () => {
  const block = csat.mailBlock("en", "https://fn.example/csat?t=abc");
  assert.match(block.html, /How was this review\?/);
  assert.match(block.html, /rating=5/);
  const remind = csat.remindMail("es", "tienda.es", "https://fn.example/csat?t=abc");
  assert.match(remind.subject, /tienda\.es/);
  assert.match(remind.text, /URL Review/);
  assert.match(remind.text, /csat\?t=abc/);
});

test("remindWindow is 24–48 hours before now", () => {
  const now = new Date("2026-11-16T15:00:00Z");
  const w = csat.remindWindow(now);
  assert.equal(w.after, "2026-11-14T15:00:00.000Z");
  assert.equal(w.before, "2026-11-15T15:00:00.000Z");
});

test("reportMail embeds the CSAT ask when csatUrl is set (#3556)", () => {
  const withAsk = customerMail.reportMail(record, { csatUrl: "https://fn.example/csat?t=tokentokentokentokentokentoken12" });
  assert.match(withAsk.html, /How was this review\?/);
  assert.match(withAsk.text, /How was this review\?/);
  assert.doesNotMatch(customerMail.reportMail(record, {}).html, /How was this review\?/);
});

test("csatMessage pushes low drafts to the URL Review tab", () => {
  const msg = jarvisMailPush.csatMessage("c1", {
    rating: 2,
    nps: 3,
    host: "shop.example",
    email: "ana@example.com",
    reviewId: "r7",
    comment: "Unclear",
    draftReply: "Thanks for the honest feedback",
    low: true,
    quoteOk: true
  });
  assert.equal(msg.kind, "reviews");
  assert.equal(msg.tab, "products:review");
  assert.match(msg.title, /^Low ·/);
  assert.match(msg.title, /NPS 3/);
  assert.match(msg.body, /Thanks for the honest feedback/);
  assert.ok(msg.lines.some((line) => line === "quote ok"));
});

test("ops schedule lists sendCsatReminders", () => {
  const ops = require("../../functions/ops-schedule.js");
  assert.ok(ops.JOBS.some((row) => row.job === "sendCsatReminders"));
});
