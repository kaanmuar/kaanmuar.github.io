const test = require("node:test");
const assert = require("node:assert/strict");
const reviewPromise = require("../../functions/url-review-promise.js");
const reviewFailures = require("../../functions/url-review-failures.js");
const reviewOffers = require("../../functions/url-review-offers.js");
const customerMail = require("../../functions/url-review-customer-mail.js");
const report = require("./fixtures/review-wordpress.json");

const DAY = 86400000;
const failed = (message, extra) => reviewFailures.failureRecord(Object.assign({
  kind: "failed", runId: "run1", url: "https://shop.example.com/", name: "Ana", email: "ana@example.com", lang: "de", error: message
}, extra));

test("a failure on our side is promised; site-side causes, sweeps, comparisons and askers with no email are not (#3079)", () => {
  assert.equal(reviewPromise.promised(failed("Headless Chrome did not finish the page in time.")), true);
  assert.equal(reviewPromise.promised(failed("The review failed.")), true);
  assert.equal(reviewPromise.promised(failed("The host name did not resolve.")), false);
  assert.equal(reviewPromise.promised(failed("Enter a full https address.")), false);
  assert.equal(reviewPromise.promised(failed("The site accepted no connection on port 443.")), false);
  assert.equal(reviewPromise.promised(failed("The URL returned status 404, in the plain read and in headless Chrome.")), false);
  assert.equal(reviewPromise.promised(failed("The review failed.", { source: "sweep", sweep: { host: "shop.example.com", cc: "co" } })), false);
  assert.equal(reviewPromise.promised(failed("The review failed.", { reasonCode: "compare" })), false);
  assert.equal(reviewPromise.promised(failed("The review failed.", { email: "" })), false);
  assert.equal(reviewPromise.promised(reviewFailures.failureRecord({ kind: "stopped", email: "ana@example.com", url: "https://shop.example.com/" })), false);
});

test("the stream's error line carries the inconclusive code, the email and the coupon only with a promise", () => {
  const promise = reviewPromise.promiseOf(failed("The review failed."), { code: "SORRY-ABCD2345", percent: 20, validUntil: "2027-02-07T00:00:00.000Z" });
  assert.deepEqual(reviewPromise.errorLine("The site took too long.", promise),
    { type: "error", error: "The site took too long.", code: "inconclusive", email: "ana@example.com", coupon: "SORRY-ABCD2345", percent: 20 });
  assert.deepEqual(reviewPromise.errorLine("The host name did not resolve.", null), { type: "error", error: "The host name did not resolve." });
  assert.deepEqual(reviewPromise.errorLine("", null), { type: "error", error: "The review failed." });
  assert.equal(promise.lang, "de");
  assert.equal(promise.state, "open");
});

test("the apology code takes APOLOGY_PERCENT off the next run once, and reads as a valid code", () => {
  const now = Date.parse("2026-11-09T12:00:00Z");
  const code = reviewPromise.couponCode((n) => n - 1);
  assert.match(code, /^SORRY-[A-Z0-9]{8}$/);
  assert.equal(reviewOffers.cleanCode(code), code);
  const coupon = reviewPromise.apologyCoupon(failed("The review failed."), now);
  assert.equal(coupon.percent, reviewPromise.APOLOGY_PERCENT);
  assert.equal(coupon.maxUses, 1);
  assert.equal(coupon.source, "inconclusive");
  assert.equal(coupon.validUntil, new Date(now + reviewPromise.COUPON_DAYS * DAY).toISOString());
  assert.equal(reviewOffers.couponOpen(coupon, "new-run", "", now + DAY), true);
  assert.equal(reviewOffers.couponOpen(Object.assign({}, coupon, { uses: 1 }), "new-run", "", now + DAY), false);
  assert.equal(reviewOffers.couponOpen(coupon, "new-run", "", now + (reviewPromise.COUPON_DAYS + 1) * DAY), false);
  assert.equal(reviewOffers.discountFor(5000, 1, { coupon: Object.assign({ code }, coupon) }).percent, reviewPromise.APOLOGY_PERCENT);
});

test("a retry of the same address while its promise is open keeps the first code; another address or a kept promise does not", () => {
  const rows = [
    { id: "a", at: "2026-11-09T10:00:00Z", url: "https://shop.example.com/", promise: { state: "open", coupon: "SORRY-FIRST234" } },
    { id: "b", at: "2026-11-09T11:00:00Z", url: "https://blog.example.com/", promise: { state: "open", coupon: "SORRY-OTHER234" } },
    { id: "c", at: "2026-11-09T12:00:00Z", url: "https://kept.example.com/", promise: { state: "delivered", coupon: "SORRY-KEPT2345" } }
  ];
  assert.equal(reviewPromise.openPromiseFor(rows, "https://SHOP.example.com").coupon, "SORRY-FIRST234");
  assert.equal(reviewPromise.openPromiseFor(rows, "https://kept.example.com/"), null);
  assert.equal(reviewPromise.openPromiseFor(rows, "https://new.example.com/"), null);
  assert.equal(reviewPromise.openPromiseFor(null, "https://shop.example.com/"), null);
});

test("a re-run group keeps the open promise of its failures, and the ids that carry it", () => {
  const rows = [
    { id: "a", at: "2026-11-08T10:00:00Z", promise: { state: "open", coupon: "SORRY-FIRST234", email: "ana@example.com" } },
    { id: "b", at: "2026-11-09T10:00:00Z", promise: { state: "open", coupon: "SORRY-FIRST234", email: "ana@example.com" } },
    { id: "c", at: "2026-11-09T11:00:00Z" },
    { id: "d", at: "2026-11-09T12:00:00Z", promise: { state: "open", coupon: "SORRY-ELSE2345" } }
  ];
  const promise = reviewPromise.groupPromise({ failureIds: ["a", "b", "c"] }, rows);
  assert.deepEqual(promise.ids, ["b", "a"]);
  assert.equal(promise.coupon, "SORRY-FIRST234");
  assert.equal(promise.failedAt, "2026-11-08T10:00:00Z");
  assert.equal(reviewPromise.groupPromise({ failureIds: ["c"] }, rows), null);
});

test("an open promise past the 48-hour deadline gets one apology per code, counted from its first failure; a newer, settled or address-less one waits", () => {
  const now = Date.parse("2026-11-30T12:00:00Z");
  const HOUR = 3600000;
  assert.equal(reviewPromise.PROMISE_DEADLINE_H, 48);
  const first = new Date(now - 49 * HOUR).toISOString();
  const retry = new Date(now - 2 * HOUR).toISOString();
  const rows = [
    { id: "a", at: retry, url: "https://shop.example.com/", host: "shop.example.com", promise: { state: "open", coupon: "SORRY-FIRST234", email: "ana@example.com", lang: "es", percent: 20 } },
    { id: "b", at: first, url: "https://shop.example.com/", host: "shop.example.com", promise: { state: "open", coupon: "SORRY-FIRST234", email: "ana@example.com", lang: "es", percent: 20 } },
    { id: "c", at: new Date(now - 47 * HOUR).toISOString(), promise: { state: "open", coupon: "SORRY-NEW23456", email: "ana@example.com" } },
    { id: "d", at: first, promise: { state: "held", coupon: "SORRY-HELD2345", email: "ana@example.com" } },
    { id: "e", at: first, promise: { state: "open", coupon: "SORRY-NOMAIL23", email: "" } }
  ];
  const due = reviewPromise.apologiesDue(rows, now);
  assert.equal(due.length, 1);
  assert.deepEqual(due[0].ids, ["b", "a"]);
  assert.equal(due[0].failedAt, first);
  assert.equal(due[0].host, "shop.example.com");
  assert.equal(due[0].hours, 48);
});

test("a promised review runs again about 30 minutes after it failed, then at each later slot before the deadline, nearest deadline first", () => {
  const HOUR = 3600000;
  const now = Date.parse("2026-11-30T12:00:00Z");
  const row = (id, hoursAgo, extra) => Object.assign({ id, at: new Date(now - hoursAgo * HOUR).toISOString(), url: "https://" + id + ".example.com/", host: id + ".example.com", email: "ana@example.com", name: "Ana",
    options: { pages: 20, depth: 2, frameworks: [] }, intake: { lang: "fr" } }, extra, { promise: Object.assign({ state: "open", coupon: "SORRY-" + id.toUpperCase().padEnd(8, "2"), email: "ana@example.com", percent: 20 }, extra && extra.promise) });
  assert.deepEqual(reviewPromise.rescuesDue([row("fresh", 0.2)], now), []);
  const [first] = reviewPromise.rescuesDue([row("soon", 0.6)], now);
  assert.equal(first.tries, 1);
  assert.equal(first.trigger.id, "promise");
  assert.match(first.trigger.label, /^Promised re-run 1 of 5, 1 h after the failure, before the 48 h deadline$/);
  assert.deepEqual(first.options.frameworks, ["Playwright"]);
  assert.deepEqual(first.promise.ids, ["soon"]);
  assert.equal(first.intake.lang, "fr");
  assert.deepEqual(reviewPromise.rescuesDue([row("tried", 2, { promise: { tries: 1 } })], now), []);
  assert.equal(reviewPromise.rescuesDue([row("second", 5, { promise: { tries: 1 } })], now)[0].tries, 2);
  assert.deepEqual(reviewPromise.rescuesDue([row("spent", 45, { promise: { tries: 5 } })], now), []);
  assert.deepEqual(reviewPromise.rescuesDue([row("late", 48.5)], now), []);
  assert.deepEqual(reviewPromise.rescuesDue([row("kept", 1, { promise: { state: "delivered" } })], now), []);
  const many = [row("aa", 1), row("bb", 30, { promise: { tries: 3 } }), row("cc", 13, { promise: { tries: 2 } })];
  assert.deepEqual(reviewPromise.rescuesDue(many, now).map((group) => group.host), ["bb.example.com", "cc.example.com"]);
  assert.equal(reviewPromise.rescuesDue(many, now, 5).length, 3);
});

test("a settled promise is written with dotted paths, and the desk names its state and code", () => {
  const fields = reviewPromise.settled("delivered", { "promise.reportId": "r1" });
  assert.equal(fields["promise.state"], "delivered");
  assert.equal(fields["promise.reportId"], "r1");
  assert.ok(fields["promise.closedAt"]);
  assert.equal(reviewPromise.deskLabel({ state: "open", coupon: "SORRY-FIRST234", percent: 20 }), "promised: report by email · SORRY-FIRST234 20%");
  assert.equal(reviewPromise.deskLabel(null), "");
  const row = reviewFailures.failureRow({ id: "a", kind: "failed", promise: { state: "apologized", coupon: "SORRY-FIRST234", percent: 20, at: "x", closedAt: "y" } });
  assert.deepEqual(row.promise, { state: "apologized", coupon: "SORRY-FIRST234", percent: 20, at: "x", closedAt: "y" });
  assert.equal(reviewFailures.failureRow({ id: "b", kind: "failed" }).promise, null);
});

test("the owner's re-run mail counts a promised re-run that went out on its own", () => {
  const sent = { status: "sent", host: "shop.example.com", name: "Ana", email: "ana@example.com", trigger: { label: "Cleared" }, reportId: "r1" };
  const held = Object.assign({}, sent, { status: "held", reportId: "r2" });
  const mail = reviewFailures.rerunMail([sent, held]);
  assert.match(mail.subject, /1 held for you, 1 sent as promised, 0 failed again/);
  assert.match(mail.body, /^Sent to the asker, as promised: shop\.example\.com/m);
  assert.match(mail.body, /Askers promised their report by email got it\./);
  assert.match(reviewFailures.rerunMail([held]).body, /No asker was emailed\./);
});

test("the re-run report mail of a kept promise reminds the asker of their code and carries it to the next review", () => {
  const promise = { coupon: "SORRY-FIRST234", percent: 20, validUntil: "2027-02-07T00:00:00.000Z" };
  const record = { id: "r7Kq2mWx9", email: "ana@example.com", lang: "en", createdAt: "2026-11-20T15:04:00Z", report, paid: true, free: true, rerunOf: ["a"], failedAt: "2026-11-09T12:00:00Z" };
  const mail = customerMail.reportMail(record, { promise });
  assert.match(mail.text, /As promised when it failed, here is your report\. Your code SORRY-FIRST234 still takes 20% off your next review, until 2027-02-07\./);
  assert.ok(mail.html.includes("SORRY-FIRST234</span>"));
  assert.ok(mail.html.includes("coupon=SORRY-FIRST234"));
  assert.ok(!customerMail.reportMail(record, {}).text.includes("SORRY-"));
  assert.match(customerMail.reportMail(Object.assign({}, record, { lang: "pt" }), { promise }).text, /Seu código SORRY-FIRST234 continua dando 20% de desconto/);
});

test("the apology mail says the review could not be finished, in the asker's language, and keeps the code", () => {
  const promise = { email: "ana@example.com", lang: "en", host: "shop.example.com", url: "https://shop.example.com/", coupon: "SORRY-FIRST234", percent: 20, validUntil: "2027-02-07T00:00:00.000Z", failedAt: "2026-11-09T12:00:00Z", hours: 48 };
  const en = customerMail.promiseClosedMail(promise, { stopUrl: "https://example.com/stop" });
  assert.equal(en.subject, "We could not finish your review of shop.example.com");
  assert.match(en.text, /failed on 2026-11-09 for a reason on our side\. We kept trying for 48 hours/);
  assert.match(customerMail.promiseClosedMail(Object.assign({}, promise, { lang: "it" }), {}).text, /per 48 ore/);
  assert.match(en.text, /Your code takes 20% off your next review, until 2027-02-07:\nSORRY-FIRST234/);
  assert.ok(en.html.includes("coupon=SORRY-FIRST234"));
  const de = customerMail.promiseClosedMail(Object.assign({}, promise, { lang: "de" }), {});
  assert.equal(de.lang, "de");
  assert.match(de.subject, /^Wir konnten Ihre Prüfung von shop\.example\.com nicht abschließen$/);
  assert.match(customerMail.promiseClosedMail(Object.assign({}, promise, { failedAt: "", host: "" }), {}).text, /^Your review of shop\.example\.com failed for a reason on our side\./m);
  const keys = Object.keys(customerMail.PROMISE.en).sort();
  customerMail.LANGS.forEach((lang) => assert.deepEqual(Object.keys(customerMail.PROMISE[lang]).sort(), keys, lang));
});
