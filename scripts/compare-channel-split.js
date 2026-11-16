/**
 * Channel-split compare quizzes (#3497 / #3475):
 * - X, Telegram, Threads (+ other nets by default): keep two-day quiz → reveal.
 * - LinkedIn + Instagram: one post on reveal day with quiz card + reveal card as a carousel.
 */
"use strict";

const SAME_CAROUSEL = new Set(["linkedin", "instagram", "instagram-story"]);

function isQuiz(cap) {
  return !!(cap && (cap.kind === "quiz" || cap.answer));
}

function quizSlugFor(revealSlug, captions) {
  const want = String(revealSlug || "");
  if (!want || !captions) return "";
  return Object.keys(captions).find((slug) => String(captions[slug].answer || "") === want) || "";
}

function keepCalendarRow(channel, slug, captions) {
  const cap = captions && captions[slug];
  if (!cap) return true;
  if (!isQuiz(cap)) return true;
  // Quizzes keep a row only on two-day networks; LI/IG wait for the reveal-day carousel.
  return !SAME_CAROUSEL.has(String(channel || "").toLowerCase());
}

function filterCalendarRows(rows, captions) {
  return (rows || []).filter((row) => keepCalendarRow(row.channel, row.slug, captions));
}

function pairSlides(base, revealSlug, captions) {
  const quiz = quizSlugFor(revealSlug, captions);
  if (!quiz || !base) return null;
  const reveal = captions[revealSlug] || {};
  const ask = captions[quiz] || {};
  return [
    { slug: quiz, url: String(base).replace(/\/$/, "") + "/feed/" + quiz + ".jpg", alt: ask.alt || ask.title || "" },
    { slug: revealSlug, url: String(base).replace(/\/$/, "") + "/feed/" + revealSlug + ".jpg", alt: reveal.alt || reveal.title || "" }
  ];
}

// LI/IG reveal-day caption: keep the reveal text; prepend a short quiz line when the quiz copy exists.
function mergedCaption(network, revealCap, quizCap) {
  const reveal = String((revealCap && (revealCap[network] || revealCap.linkedin || revealCap.x)) || "").trim();
  if (!quizCap) return reveal;
  const ask = String(quizCap[network] || quizCap.linkedin || quizCap.x || quizCap.title || "").trim();
  if (!ask || !reveal) return reveal || ask;
  if (reveal.indexOf(ask.slice(0, Math.min(40, ask.length))) !== -1) return reveal;
  return ask + "\n\n" + reveal;
}

function usesPairCarousel(channel, slug, captions) {
  if (!SAME_CAROUSEL.has(String(channel || "").toLowerCase())) return false;
  if (!captions || !captions[slug] || isQuiz(captions[slug])) return false;
  return !!quizSlugFor(slug, captions);
}

module.exports = {
  SAME_CAROUSEL,
  isQuiz,
  quizSlugFor,
  keepCalendarRow,
  filterCalendarRows,
  pairSlides,
  mergedCaption,
  usesPairCarousel
};
