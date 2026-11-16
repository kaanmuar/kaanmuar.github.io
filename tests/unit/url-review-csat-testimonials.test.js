const test = require("node:test");
const assert = require("node:assert/strict");
const testimonials = require("../../functions/url-review-csat-testimonials.js");
const csat = require("../../functions/url-review-csat.js");

test("qualifies needs quote ok, stars, NPS and comment length", () => {
  assert.equal(testimonials.qualifies({ quoteOk: true, rating: 5, nps: 9, comment: "This report was clear and actionable." }), true);
  assert.equal(testimonials.qualifies({ quoteOk: false, rating: 5, nps: 9, comment: "x".repeat(30) }), false);
  assert.equal(testimonials.qualifies({ quoteOk: true, rating: 3, nps: 9, comment: "x".repeat(30) }), false);
  assert.equal(testimonials.qualifies({ quoteOk: true, rating: 5, nps: 6, comment: "x".repeat(30) }), false);
});

test("recurWindow is 7–8 days before now", () => {
  const now = new Date("2026-11-16T15:00:00Z");
  const w = csat.recurWindow(now);
  assert.equal(w.after, "2026-11-08T15:00:00.000Z");
  assert.equal(w.before, "2026-11-09T15:00:00.000Z");
});