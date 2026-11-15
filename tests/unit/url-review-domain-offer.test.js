/**
 * The domain offer (#2615): a first-payment coupon for one host that opens only for an address on that domain or a
 * proved one, within its window, once.
 *
 *   npm run test:review
 */
const test = require("node:test");
const assert = require("node:assert/strict");

const core = require("../../functions/url-review-core");
const Offer = require("../../functions/url-review-domain-offer");
const offers = require("../../functions/url-review-offers");

const DAY = 24 * 3600000;
const NOW = Date.parse("2026-11-05T15:00:00Z");
const match = core.mailboxMatchesHost;

test("a minted offer is 50% off one first payment for its bare host, ending HARD_DAYS on", () => {
  const { code, coupon } = Offer.mint("https://www.Shop.example.com/", NOW, () => 0);
  assert.match(code, /^HI-[A-Z0-9]{8}$/);
  assert.equal(offers.cleanCode(code), code);
  assert.deepEqual([coupon.percent, coupon.host, coupon.maxUses, coupon.perEmail, coupon.firstPayment], [50, "shop.example.com", 1, 1, true]);
  assert.equal(Date.parse(coupon.validUntil) - NOW, Offer.HARD_DAYS * DAY);
});

test("the window runs WINDOW_DAYS from the first splash view, and never past the hard stop", () => {
  const { coupon } = Offer.mint("shop.example.com", NOW);
  assert.equal(Offer.endsAt(coupon), Date.parse(coupon.validUntil));
  const start = Offer.opening(coupon, NOW + DAY);
  assert.ok(start.openedAt);
  assert.equal(Offer.endsAt(Object.assign({}, coupon, start)), NOW + 8 * DAY);
  assert.equal(Offer.opening(Object.assign({}, coupon, start), NOW + 2 * DAY), null);
  assert.equal(Offer.endsAt(Object.assign({}, coupon, { openedAt: new Date(NOW + 33 * DAY).toISOString() })), Date.parse(coupon.validUntil));
});

test("only an address on the domain, or one that proved it, opens the offer, and only on its first payment", () => {
  const { coupon } = Offer.mint("shop.example.com", NOW);
  const proof = { kind: "site", email: "ana@gmail.com", host: "shop.example.com", expireAt: new Date(NOW + 10 * DAY).toISOString() };
  assert.deepEqual(Offer.lockOpen(coupon, { email: "ceo@example.com" }, NOW, match), { ok: true, why: "", how: "mailbox" });
  assert.deepEqual(Offer.lockOpen(coupon, { email: "ana@gmail.com", proofs: [proof] }, NOW, match), { ok: true, why: "", how: "site" });
  assert.equal(Offer.lockOpen(coupon, { email: "ana@gmail.com" }, NOW, match).why, "domain");
  assert.equal(Offer.lockOpen(coupon, { email: "" }, NOW, match).why, "sign-in");
  assert.equal(Offer.lockOpen(coupon, { email: "ceo@example.com", paidBefore: true }, NOW, match).why, "paid");
  assert.equal(Offer.lockOpen(Object.assign({}, coupon, { openedAt: new Date(NOW).toISOString() }), { email: "ceo@example.com" }, NOW + 8 * DAY, match).why, "expired");
  assert.equal(Offer.lockOpen({ percent: 20 }, { email: "" }, NOW, match).ok, true);
});

test("the public view tells the splash the offer and its end, and nothing for other coupons", () => {
  const { code, coupon } = Offer.mint("shop.example.com", NOW);
  const view = Offer.publicView(code, Object.assign({}, coupon, { openedAt: new Date(NOW).toISOString() }), NOW);
  assert.deepEqual([view.host, view.percent, view.open, view.started, view.endsAt], ["shop.example.com", 50, true, true, new Date(NOW + 7 * DAY).toISOString()]);
  assert.equal(Offer.publicView(code, Object.assign({}, coupon, { uses: 1 }), NOW).open, false);
  assert.equal(Offer.publicView("BACK-1234", { percent: 20 }, NOW), null);
});

test("an opened offer prices at half through the usual coupon path", () => {
  const { code, coupon } = Offer.mint("shop.example.com", NOW);
  const deal = offers.discountFor(4000, 1, { coupon: Object.assign({ code }, coupon) });
  assert.equal(deal.percent, 50);
  assert.equal(deal.source, "coupon");
});
