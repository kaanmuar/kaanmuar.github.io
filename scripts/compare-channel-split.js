/**
 * Channel-split compare quizzes (#3497 / #3475):
 * - X, Telegram, Threads: keep two-day quiz → reveal.
 * - LinkedIn, Instagram, Facebook, Mastodon, Bluesky: one reveal-day carousel (quiz card + reveal card).
 *
 * Bluesky/Mastodon/Telegram/Threads share the X calendar slot; only nets with their own calendar
 * channel drop quiz-day rows. Shared-slot carousel nets skip the quiz at publish time instead.
 */
"use strict";

// Publish as quiz+reveal carousel (Carlos: LI/IG + FB + Mastodon + Bluesky).
const SAME_CAROUSEL = new Set(["linkedin", "instagram", "instagram-story", "facebook", "mastodon", "bluesky"]);
// These have their own calendar.csv channel column (not shared with X).
const CALENDAR_OWN = new Set(["linkedin", "instagram", "instagram-story", "facebook"]);

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
  if (!cap || !isQuiz(cap)) return true;
  return !CALENDAR_OWN.has(String(channel || "").toLowerCase());
}

function filterCalendarRows(rows, captions) {
  return (rows || []).filter((row) => keepCalendarRow(row.channel, row.slug, captions));
}

// Skip posting the quiz slug on carousel networks (reveal carries both cards).
function skipQuizPublish(network, cap) {
  return isQuiz(cap) && SAME_CAROUSEL.has(String(network || "").toLowerCase());
}

function pairSlides(base, revealSlug, captions) {
  const quiz = quizSlugFor(revealSlug, captions);
  if (!quiz || !base) return null;
  const reveal = captions[revealSlug] || {};
  const ask = captions[quiz] || {};
  const root = String(base).replace(/\/$/, "");
  return [
    { slug: quiz, url: root + "/feed/" + quiz + ".jpg", alt: ask.alt || ask.title || "" },
    { slug: revealSlug, url: root + "/feed/" + revealSlug + ".jpg", alt: reveal.alt || reveal.title || "" }
  ];
}

function mergedCaption(network, revealCap, quizCap) {
  const key = network === "bluesky" || network === "mastodon" || network === "threads" || network === "telegram" ? "x" : network;
  const reveal = String((revealCap && (revealCap[key] || revealCap[network] || revealCap.linkedin || revealCap.x)) || "").trim();
  if (!quizCap) return reveal;
  const ask = String(quizCap[key] || quizCap[network] || quizCap.linkedin || quizCap.x || quizCap.title || "").trim();
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
  CALENDAR_OWN,
  isQuiz,
  quizSlugFor,
  keepCalendarRow,
  filterCalendarRows,
  skipQuizPublish,
  pairSlides,
  mergedCaption,
  usesPairCarousel
};
