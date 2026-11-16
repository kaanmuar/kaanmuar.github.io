#!/usr/bin/env node
/* Hook templates for tips / creative-intel / trend-held posts (#3559).
   Kind → array of hook lines (English). Captions and studio titles pick one by seed.
   node scripts/social-hooks.js [--kind list|myth|quiz|trend|audit] [--seed N] */

"use strict";

const HOOKS = {
  list: [
    "Three checks most sites still skip.",
    "A short list your next release should clear.",
    "Five findings that keep showing up in URL reviews."
  ],
  myth: [
    "Myth: a green Lighthouse score means you are done.",
    "Myth: accessibility is only an alt-text problem.",
    "Myth: SEO starts after you ship."
  ],
  quiz: [
    "Which of these fails a real URL review first?",
    "Can you spot the risk before the score drops?",
    "One of these headers is lying. Which?"
  ],
  trend: [
    "The field is talking about this — here is the practical take.",
    "Trending in web quality this week, without the noise.",
    "What the feed got right about site quality today."
  ],
  audit: [
    "We ran the public checks. Here is what stood out.",
    "A live URL review, cut to the findings that matter.",
    "Same six scores, plain language on what to fix first."
  ]
};

function hash(text) {
  let h = 2166136261;
  for (const ch of String(text || "")) h = Math.imul(h ^ ch.codePointAt(0), 16777619);
  return h >>> 0;
}

function kinds() {
  return Object.keys(HOOKS);
}

function pick(kind, seed) {
  const list = HOOKS[kind] || HOOKS.list;
  const n = Number.isFinite(Number(seed)) ? Number(seed) : hash(kind + String(seed || ""));
  return list[Math.abs(n) % list.length];
}

/** Title array for tips-studio cards: first line is the hook, optional second for emphasis. */
function titleLines(kind, seed) {
  const hook = pick(kind, seed);
  const cut = hook.indexOf(". ");
  if (cut > 12 && cut < hook.length - 8) return [hook.slice(0, cut + 1), "*" + hook.slice(cut + 2) + "*"];
  return [hook];
}

if (require.main === module) {
  const kindAt = process.argv.indexOf("--kind");
  const seedAt = process.argv.indexOf("--seed");
  const kind = kindAt > -1 ? process.argv[kindAt + 1] : "list";
  const seed = seedAt > -1 ? process.argv[seedAt + 1] : Date.now();
  if (!HOOKS[kind]) {
    console.error("kinds: " + kinds().join(", "));
    process.exit(1);
  }
  console.log(pick(kind, seed));
}

module.exports = { HOOKS, kinds, pick, titleLines, hash };
