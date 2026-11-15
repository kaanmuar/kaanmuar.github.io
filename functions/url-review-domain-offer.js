"use strict";
/*
 * The domain offer (#2615): a first-payment discount for the company behind a site we reviewed, sent with the profile
 * campaign's messages (engagement-profiles.js) and shown as a splash when they arrive (js/qa-review-offer.js).
 *
 * One coupon per host in url_review_coupons, with host set. Anyone may hold the code; it opens only for a signed-in
 * address on the host's domain, or one that proved the host by DNS TXT or meta tag (url-review-owner-proof.js), and
 * only on that account's first payment.
 *
 *   window  WINDOW_DAYS from the first time the splash shows it (openedAt), never past validUntil (HARD_DAYS from mint)
 *   once    maxUses 1 and perEmail 1, so one payment in all
 */
const crypto = require("crypto");
const proofs = require("./url-review-owner-proof");

const DAY = 24 * 3600000;
const PERCENT = 50;
const WINDOW_DAYS = 7;
const HARD_DAYS = 35;
const SOURCE = "profile-campaign";
const PURPOSES = ["new-run", "report"];
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

const iso = (ms) => new Date(ms).toISOString();
const ms = (value) => {
  const at = value && typeof value.toDate === "function" ? value.toDate().getTime() : Date.parse(value || "");
  return Number.isFinite(at) ? at : 0;
};

/** A fresh code and its coupon for host: { code, coupon }. rand(n) picks 0..n-1 (crypto.randomInt by default). */
function mint(host, now, rand) {
  const pick = rand || ((n) => crypto.randomInt(n));
  const code = "HI-" + Array.from({ length: 8 }, () => ALPHABET[pick(ALPHABET.length)]).join("");
  const where = proofs.hostOf(host);
  return {
    code,
    coupon: {
      percent: PERCENT, host: where, firstPayment: true, maxUses: 1, uses: 0, perEmail: 1, windowDays: WINDOW_DAYS,
      validFrom: iso(now), validUntil: iso(now + HARD_DAYS * DAY), purposes: PURPOSES.slice(), source: SOURCE, createdAt: iso(now)
    }
  };
}

/** When the offer ends, in ms: WINDOW_DAYS after it was first shown, never past validUntil; validUntil until then. */
function endsAt(coupon) {
  const hard = ms(coupon && coupon.validUntil) || Infinity;
  const opened = ms(coupon && coupon.openedAt);
  const days = Number((coupon && coupon.windowDays) || WINDOW_DAYS);
  return opened ? Math.min(hard, opened + days * DAY) : hard;
}

/** The patch that starts the window the first time the splash shows the offer, or null when it already started. */
function opening(coupon, now) {
  return coupon && coupon.host && !coupon.openedAt ? { openedAt: iso(now) } : null;
}

/**
 * Why who holds host, or "": "mailbox" for an address on the host's domain, "site" or "credentials" for an unexpired
 * owner proof of that address (proofs.validFor). who: { email, proofs }. matches: core.mailboxMatchesHost.
 */
function holds(who, host, now, matches) {
  const email = proofs.emailOf(who && who.email);
  if (!email || !host) return "";
  if (matches(email, host)) return "mailbox";
  return proofs.validFor((who && who.proofs) || [], email, host, now);
}

/**
 * Whether a host-locked coupon opens for who: { ok, why, how }. who: { email, proofs, paidBefore }. why says what is
 * missing: "sign-in", "expired", "domain" or "paid". A coupon with no host is not this offer and always passes.
 */
function lockOpen(coupon, who, now, matches) {
  if (!coupon || !coupon.host) return { ok: true, why: "", how: "" };
  if (!proofs.emailOf(who && who.email)) return { ok: false, why: "sign-in", how: "" };
  if (endsAt(coupon) <= now) return { ok: false, why: "expired", how: "" };
  const how = holds(who, coupon.host, now, matches);
  if (!how) return { ok: false, why: "domain", how: "" };
  if (coupon.firstPayment && who.paidBefore) return { ok: false, why: "paid", how };
  return { ok: true, why: "", how };
}

/** What the splash and the pay page may show of a coupon, or null when it is not a domain offer. */
function publicView(code, coupon, now) {
  if (!coupon || !coupon.host || coupon.source !== SOURCE) return null;
  const end = endsAt(coupon);
  const used = Number(coupon.maxUses) > 0 && Number(coupon.uses || 0) >= Number(coupon.maxUses);
  return {
    code, host: coupon.host, percent: Number(coupon.percent) || PERCENT, windowDays: Number(coupon.windowDays) || WINDOW_DAYS,
    endsAt: Number.isFinite(end) ? iso(end) : "", started: !!coupon.openedAt, open: !used && end > now && ms(coupon.validFrom) <= now
  };
}

module.exports = { PERCENT, WINDOW_DAYS, HARD_DAYS, SOURCE, PURPOSES, mint, endsAt, opening, holds, lockOpen, publicView };
