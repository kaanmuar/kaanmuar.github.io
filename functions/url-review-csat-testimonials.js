/**
 * Quote-approved URL Review CSAT rows → pending social/CV testimonial stubs (#3557).
 * Human gate in Jarvis before anything posts publicly.
 */
"use strict";

const MIN_STARS = 4;
const MIN_NPS = 8;
const MIN_COMMENT = 24;
const DECISIONS = new Set(["approved", "dismissed"]);
const ROW_ID = /^[\w-]{1,128}$/;
const HUB_IMAGE = "assets/share/qa-review-social.jpg";

function serverTimestamp() {
  try {
    return require("firebase-admin/firestore").FieldValue.serverTimestamp();
  } catch (error) {
    return new Date().toISOString();
  }
}

function qualifies(row) {
  const data = row || {};
  if (!data.quoteOk) return false;
  const comment = String(data.comment || "").trim();
  if (comment.length < MIN_COMMENT) return false;
  const rating = Math.min(5, Math.max(0, Number(data.rating) || 0));
  if (rating < MIN_STARS) return false;
  const nps = Number(data.nps);
  if (Number.isFinite(nps) && nps >= 0 && nps <= 10 && nps < MIN_NPS) return false;
  return true;
}

function testimonialDoc(csatId, data) {
  const d = data || {};
  const comment = String(d.comment || "").trim();
  return {
    csatId: String(csatId || ""),
    reviewId: String(d.reviewId || ""),
    email: String(d.email || "").trim().toLowerCase(),
    host: String(d.host || "").trim(),
    lang: String(d.lang || "en"),
    rating: d.rating,
    nps: d.nps,
    quote: comment.slice(0, 500),
    status: "pending",
    createdAt: d.createdAt || new Date().toISOString()
  };
}

/** Idempotent queue: one pending row per CSAT answer. */
async function queueTestimonial(db, csatId, data) {
  if (!db || !csatId || !qualifies(data)) return { queued: false, reason: "skip" };
  const ref = db.collection("url_review_csat_testimonials").doc(String(csatId));
  const snap = await ref.get();
  if (snap.exists) return { queued: false, reason: "exists" };
  await ref.set(testimonialDoc(csatId, data));
  return { queued: true };
}

/** Pending rows waiting for Jarvis approve/dismiss, newest first. */
async function listPending(db, limit) {
  const cap = Math.min(Math.max(Number(limit) || 20, 1), 50);
  const snap = await db.collection("url_review_csat_testimonials").where("status", "==", "pending").limit(cap).get();
  return snap.docs
    .map((doc) => Object.assign({ id: doc.id }, doc.data()))
    .sort((a, b) => Date.parse(b.createdAt || 0) - Date.parse(a.createdAt || 0))
    .slice(0, cap);
}

function hubState(raw) {
  const Admin = require("./social-hub-admin");
  try {
    return Admin.clean(JSON.parse((raw && raw.json) || "{}"));
  } catch (error) {
    return Admin.empty();
  }
}

/** Publish one approved quote to CV testimonials + a Social hub pick (human gate only; no auto-publish). */
async function publishApproved(db, row, now) {
  const customerMail = require("./url-review-customer-mail");
  const Admin = require("./social-hub-admin");
  const id = String(row.id || "");
  const host = String(row.host || "").trim();
  const quote = String(row.quote || "").trim();
  const lang = String(row.lang || "en");
  const rating = Math.min(5, Math.max(0, Number(row.rating) || 0));
  const reviewId = String(row.reviewId || "");
  const authorName = host ? "Team at " + host.slice(0, 80) : "URL Review client";

  let cv = false;
  const cvSnap = await db.collection("testimonials").where("sourceId", "==", id).limit(1).get();
  if (cvSnap.empty) {
    await db.collection("testimonials").add({
      authorName,
      originalText: quote,
      rating,
      createdAt: serverTimestamp(),
      sourceId: id,
      sourceType: "url-review-csat"
    });
    cv = true;
  }

  let social = false;
  const hubRef = db.collection("socialHub").doc("live");
  await db.runTransaction(async (tx) => {
    const live = hubState((await tx.get(hubRef)).data());
    const base = "pick/csat-" + Admin.slug(host || id).slice(0, 50);
    const taken = new Set((live.items || []).map((item) => item.id));
    let itemId = base;
    for (let n = 2; taken.has(itemId); n += 1) itemId = base + "-" + n;
    if ((live.items || []).some((item) => item.id && item.id.startsWith(base))) {
      social = true;
      return;
    }
    const today = new Date(now - 5 * 3600 * 1000).toISOString().slice(0, 10);
    const pageUrl = reviewId
      ? customerMail.pageUrl(lang, { report: reviewId, utm_campaign: "csat-quote" })
      : customerMail.SITE + "/qa-review.html";
    const item = Admin.cleanItem({
      id: itemId,
      date: today,
      lang,
      title: (host ? "Feedback on " + host : "URL Review feedback").slice(0, 200),
      text: ("\"" + quote.slice(0, 280) + "\" — QA-lab URL Review client").slice(0, 3000),
      url: pageUrl,
      image: HUB_IMAGE,
      cat: "testimonial"
    });
    if (!item) throw new Error("That quote could not become a hub pick.");
    if (!(live.items || []).some((entry) => entry.id === item.id)) {
      live.items = (live.items || []).concat(item);
      tx.set(hubRef, { json: JSON.stringify(Admin.clean(live)), updatedAt: serverTimestamp() });
      social = true;
    }
  });
  return { cv, social };
}

async function decide(db, { id, decision, operator }) {
  if (!DECISIONS.has(decision)) throw new Error("Approve or dismiss the quote.");
  if (!ROW_ID.test(String(id || ""))) throw new Error("Which quote?");
  const ref = db.collection("url_review_csat_testimonials").doc(id);
  const snap = await ref.get();
  if (!snap.exists) throw new Error("That quote is no longer waiting.");
  const data = snap.data() || {};
  if ((data.status || "pending") !== "pending") throw new Error("That quote was already decided.");
  const now = Date.now();
  let published = null;
  if (decision === "approved") published = await publishApproved(db, Object.assign({ id }, data), now);
  await ref.set({
    status: decision,
    decidedAt: new Date(now).toISOString(),
    decidedBy: String(operator || "").slice(0, 120)
  }, { merge: true });
  return Object.assign({ id, decision, ok: true }, published || { cv: false, social: false });
}

module.exports = {
  MIN_STARS,
  MIN_NPS,
  MIN_COMMENT,
  qualifies,
  testimonialDoc,
  queueTestimonial,
  listPending,
  publishApproved,
  decide
};