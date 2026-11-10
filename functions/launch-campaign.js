"use strict";
/*
 * The URL review launch campaign (#3393, Carlos 2026-11-10): one mail to everyone who ran a review and did not opt
 * out, with a 50% code for their next review. Nothing goes out until Carlos approves: the send needs all of
 *
 *   LAUNCH_CAMPAIGN_SEND=on                         in functions/.env (off by default)
 *   url_review_campaigns/launch-2026-12             { approved: true, approvedBy: OWNER, approvedAt, option } written
 *                                                   by Carlos with scripts/launch-campaign.js --approve <option>
 *   --send --confirm launch-2026-12                 on the script's command line
 *
 * and stops on its own once LAST_SEND_AT passes, so no code arrives with less than three days left.
 *
 *   url_review_coupons/LAUNCH-XXXXXXXX              { percent 50, purposes new-run and report, maxUses 1, validUntil
 *                                                   LAUNCH.endsAt, campaign, source "launch-campaign", email }
 *                                                   minted at send time only; reviews only, never fix packages
 *   url_review_campaigns/launch-2026-12/sends/<h>   one row per address (h = sha256 of the address): the code it
 *                                                   holds and what happened to its mail; the row is created in the
 *                                                   same transaction as the coupon, so an address never gets two codes
 *
 * Opt-outs: a stop link (url_review_notes status follow-stop), an owner-notice stop for the address or its domain
 * (url_review_owner_stops), and the campaign's own stop list. SendGrid adds its bounces and spam reports at send time.
 * Pure helpers here; Firestore only in mintFor, optOuts and the send loop's callers.
 */
const crypto = require("crypto");
const fixOffers = require("./url-review-fix-offers");

const OWNER = "kaanmuar@gmail.com";
const CAMPAIGN = {
  id: "launch-2026-12",
  percent: 50,
  prefix: "LAUNCH-",
  purposes: ["new-run", "report"],
  validUntil: fixOffers.LAUNCH.endsAt,
  options: ["glass", "night", "editorial"]
};
const LAST_SEND_AT = "2026-12-08T05:00:00.000Z";
const COLLECTION = "url_review_campaigns";
const PAUSE_MS = 3000;
const MAX_PER_RUN = 150;
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
// Rows that are not a person who ran a review: the desk's own runs, sweeps, batch cards and the outreach lanes.
const NOT_A_REVIEWER = ["jarvis", "sweep", "outreach", "batch", "competitor", "desk"];
const DONE = ["complete", "stopped"];
const OWN_DOMAINS = ["carlosandmunoz.com", "qalabreview.com", "example.com", "example.org", "test.com"];
const DAY = 24 * 3600000;

const emailOf = (value) => {
  const e = String(value || "").trim().toLowerCase();
  return /^[^\s@/]+@[^\s@/]+\.[^\s@/]+$/.test(e) && e.length <= 200 ? e : "";
};
const domainOf = (email) => email.slice(email.indexOf("@") + 1);
const msOf = (value) => (value && typeof value.toDate === "function" ? value.toDate().getTime() : Date.parse(value || "") || 0);
const hashOf = (email) => crypto.createHash("sha256").update(emailOf(email)).digest("hex").slice(0, 40);

function codeOf(rand) {
  const pick = rand || ((n) => crypto.randomInt(n));
  return CAMPAIGN.prefix + Array.from({ length: 8 }, () => ALPHABET[pick(ALPHABET.length)]).join("");
}

/** The coupon row for one person: half off one review, until the launch ends; packages never take it. */
function couponFor(person, now) {
  const at = now == null ? Date.now() : now;
  return {
    percent: CAMPAIGN.percent,
    purposes: CAMPAIGN.purposes.slice(),
    maxUses: 1,
    uses: 0,
    email: emailOf(person && person.email),
    source: "launch-campaign",
    campaign: CAMPAIGN.id,
    validUntil: CAMPAIGN.validUntil,
    createdAt: new Date(at).toISOString(),
    expireAt: new Date(Date.parse(CAMPAIGN.validUntil) + 90 * DAY)
  };
}

/** Whether a mint may happen now: never before the send, never after the codes would expire. */
function mintAllowed(gateResult, now) {
  const at = now == null ? Date.now() : now;
  return !!(gateResult && gateResult.ok) && at < Date.parse(CAMPAIGN.validUntil);
}

/**
 * Whether the campaign may go out, and as which design. `input`: { env, approval (the campaign doc), send (the
 * --send flag), confirm (the --confirm value), now }. Every refusal names its reason; a dry run is a refusal too.
 */
function gate(input) {
  const o = input || {};
  const at = o.now == null ? Date.now() : o.now;
  const a = o.approval || {};
  if (!o.send) return { ok: false, why: "dry-run" };
  if (!o.env || o.env.LAUNCH_CAMPAIGN_SEND !== "on") return { ok: false, why: "env-off" };
  if (a.approved !== true || emailOf(a.approvedBy) !== OWNER || !msOf(a.approvedAt) || msOf(a.approvedAt) > at) return { ok: false, why: "not-approved" };
  if (CAMPAIGN.options.indexOf(a.option) === -1) return { ok: false, why: "no-option" };
  if (o.confirm !== CAMPAIGN.id) return { ok: false, why: "no-confirm" };
  if (at >= Date.parse(LAST_SEND_AT)) return { ok: false, why: "too-late" };
  return { ok: true, option: a.option };
}

/** Whether an address or its domain opted out. `stops` holds addresses and "@domain" keys, lower case. */
function optedOut(email, stops) {
  const e = emailOf(email);
  if (!e) return true;
  const set = stops instanceof Set ? stops : new Set(stops || []);
  return set.has(e) || set.has("@" + domainOf(e));
}

/**
 * The people to write to, from url_reviews rows: one per address, who ran a review that finished, not one of ours,
 * not opted out, not already sent (`sent` holds addresses or their hashOf). Each keeps the language and host of their latest review. Newest first.
 */
function recipients(rows, stops, sent) {
  const done = sent instanceof Set ? sent : new Set(sent || []);
  const byEmail = new Map();
  (rows || []).forEach((row) => {
    const email = emailOf(row && row.email);
    if (!email || email === OWNER || OWN_DOMAINS.indexOf(domainOf(email)) !== -1) return;
    if (row.test === true || DONE.indexOf(row.status) === -1) return;
    if (NOT_A_REVIEWER.indexOf(String(row.source || "")) !== -1 || row.sweep) return;
    if (optedOut(email, stops) || done.has(email) || done.has(hashOf(email))) return;
    const at = msOf(row.createdAt);
    const prev = byEmail.get(email);
    if (!prev || prev.at < at) byEmail.set(email, { email, lang: String(row.lang || "en").slice(0, 2), host: String((row.report && row.report.host) || "").slice(0, 120), at });
  });
  return Array.from(byEmail.values()).sort((a, b) => b.at - a.at);
}

/** Today's batch: at most `limit` (MAX_PER_RUN) people, and the pause between two sends. */
function batch(people, limit) {
  const n = Math.max(0, Math.min(MAX_PER_RUN, Math.round(Number(limit) || MAX_PER_RUN)));
  return { people: (people || []).slice(0, n), pauseMs: PAUSE_MS };
}

/** The log row for one address after its send. */
function sendRow(person, outcome, now) {
  const o = outcome || {};
  return {
    emailHash: hashOf(person.email),
    lang: person.lang || "en",
    state: o.state || "failed",
    option: o.option || "",
    code: o.code || "",
    error: String(o.error || "").slice(0, 200),
    at: new Date(now == null ? Date.now() : now).toISOString()
  };
}

const campaignRef = (db) => db.collection(COLLECTION).doc(CAMPAIGN.id);
const sendRef = (db, email) => campaignRef(db).collection("sends").doc(hashOf(email));

/** Mints the person's code once, in one transaction with their send row; a second call returns the same code. */
async function mintFor(db, person, gateResult, now, rand) {
  if (!mintAllowed(gateResult, now)) throw new Error("The launch campaign is not approved to send, so no code is minted.");
  return db.runTransaction(async (tx) => {
    const ref = sendRef(db, person.email);
    const snap = await tx.get(ref);
    if (snap.exists && snap.get("code")) return snap.get("code");
    const code = codeOf(rand);
    tx.create(db.collection("url_review_coupons").doc(code), couponFor(person, now));
    tx.set(ref, { emailHash: hashOf(person.email), code, state: "minted", at: new Date(now == null ? Date.now() : now).toISOString() });
    return code;
  });
}

/** Every opt-out the campaign honours, as addresses and "@domain" keys. */
async function optOuts(db) {
  const [notes, owners, own] = await Promise.all([
    db.collection("url_review_notes").where("status", "==", "follow-stop").select("email").get(),
    db.collection("url_review_owner_stops").select().get(),
    campaignRef(db).collection("stops").select().get()
  ]);
  const keys = new Set();
  notes.docs.forEach((doc) => { const e = emailOf(doc.get("email")); if (e) keys.add(e); });
  owners.docs.concat(own.docs).forEach((doc) => keys.add(String(doc.id).toLowerCase()));
  return keys;
}

/** Addresses the campaign already wrote to (rows in state sent), as hashes. */
async function sentHashes(db) {
  const snap = await campaignRef(db).collection("sends").where("state", "==", "sent").select().get();
  return new Set(snap.docs.map((doc) => doc.id));
}

module.exports = {
  OWNER,
  CAMPAIGN,
  LAST_SEND_AT,
  COLLECTION,
  PAUSE_MS,
  MAX_PER_RUN,
  emailOf,
  hashOf,
  codeOf,
  couponFor,
  mintAllowed,
  gate,
  optedOut,
  recipients,
  batch,
  sendRow,
  mintFor,
  optOuts,
  sentHashes
};
