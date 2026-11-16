/**
 * Quote-approved URL Review CSAT rows → pending social/CV testimonial stubs (#3557).
 * Human gate in Jarvis before anything posts publicly.
 */
"use strict";

const MIN_STARS = 4;
const MIN_NPS = 8;
const MIN_COMMENT = 24;

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

module.exports = { MIN_STARS, MIN_NPS, MIN_COMMENT, qualifies, testimonialDoc, queueTestimonial };