/* Seeded English scaffolding for social captions (#3733).
   Networks were refusing near-identical posts; title/body/action stay as written, and the shared
   frames (action lead, guide CTA, fair close, bio pointer) rotate by post id so each post keeps the
   same objective with different wording. Every string here must also live in the social-hub phrasebooks. */

function hash(text) {
  let h = 2166136261;
  for (const ch of String(text)) h = Math.imul(h ^ ch.codePointAt(0), 16777619);
  return h >>> 0;
}

function seedOf(post) {
  return post && (post.id || post.slug || post.host || post.live) || "post";
}

function pick(post, lane, list) {
  return list[hash(seedOf(post) + "\0" + lane) % list.length];
}

// Leads that end with ":" so i18n splits them from the tip's own action sentence.
const TRY = [
  "Try this:",
  "Try this today:",
  "Do this next:",
  "One fix to ship:",
  "Put this on the list:",
  "Start here:"
];

const LESSON = [
  "Lesson:",
  "The lesson for every team:",
  "Takeaway:",
  "What to change:",
  "Carry this forward:",
  "Apply this:"
];

const CHECK = [
  "Check it today:",
  "Verify this now:",
  "Look for this today:",
  "Audit this next:",
  "Confirm this:"
];

const GUIDE_LINK = [
  "How a public-page review works, step by step:",
  "How the review works, step by step:",
  "Walk through a public-page review:",
  "See the review flow, step by step:",
  "The guide, step by step:"
];

const REPORT_LINK = [
  "The full report:",
  "Full report:",
  "Open the full report:",
  "Read the complete report:",
  "Report:"
];

const GUIDE_BIO = [
  "Full guide: link in bio.",
  "Guide: link in bio.",
  "The full guide is in the bio.",
  "Guide link sits in the bio.",
  "Step-by-step guide: link in bio."
];

const REPORT_BIO = [
  "Full report: link in bio.",
  "The full report is in the bio.",
  "Report link sits in the bio.",
  "Complete report: link in bio.",
  "Open the report from the bio."
];

const FAIR_CLOSE = [
  "A starting point, not a verdict.",
  "An opening read, not a final call.",
  "A first look, not a judgment.",
  "A baseline, not a ruling.",
  "A snapshot to start from, not a verdict."
];

const FAIR_ONE = [
  "One automated analysis of public pages on ",
  "One automated read of public pages on ",
  "A single automated pass over public pages on ",
  "One public-page analysis on ",
  "An automated check of public pages on "
];

const FAIR_MANY = [
  "Automated analyses of public pages on ",
  "Automated reads of public pages on ",
  "Automated passes over public pages on ",
  "Public-page analyses on ",
  "Automated checks of public pages on "
];

const DID_YOU = [
  "Did you know?",
  "Worth knowing:",
  "One more fact:",
  "Side note:",
  "Also true:"
];

const YT_GUIDE = [
  "Guide:",
  "Full guide:",
  "Walkthrough:",
  "The guide:",
  "Steps:"
];

function actionKind(post) {
  const label = String((post && post.actionLabel) || "").toLowerCase();
  if (label.includes("lesson") || label.includes("takeaway")) return "lesson";
  if (label.includes("check") || label.includes("verify")) return "check";
  return "try";
}

function actionLead(post, kind) {
  const lane = kind || actionKind(post);
  const list = lane === "lesson" ? LESSON : lane === "check" ? CHECK : TRY;
  return pick(post, "action:" + lane, list) + " ";
}

function guideLinked(post, url) {
  return pick(post, "guide", GUIDE_LINK) + " " + url;
}

function reportLinked(post, url) {
  return pick(post, "report", REPORT_LINK) + " " + url;
}

function guideBio(post) {
  return pick(post, "bio-guide", GUIDE_BIO);
}

function reportBio(post) {
  return pick(post, "bio-report", REPORT_BIO);
}

function fairClose(post) {
  return pick(post, "fair-close", FAIR_CLOSE);
}

function fairOpen(post, many) {
  return pick(post, many ? "fair-many" : "fair-one", many ? FAIR_MANY : FAIR_ONE);
}

function didYouKnow(post) {
  return pick(post, "more", DID_YOU) + " ";
}

function youtubeGuide(post, url) {
  return pick(post, "yt-guide", YT_GUIDE) + " " + url;
}

// Openings stay fixed so phrasebooks keep matching the dated scope sentence; only the close rotates.
function fairLine(post, analyzed, how, many) {
  const open = many ? "Automated analyses of public pages on " : "One automated analysis of public pages on ";
  if (how) return open + analyzed + how + " " + fairClose(post);
  return open + analyzed + ". " + fairClose(post);
}

module.exports = {
  hash, seedOf, pick, actionKind,
  actionLead, guideLinked, reportLinked, guideBio, reportBio,
  fairClose, fairOpen, fairLine, didYouKnow, youtubeGuide,
  TRY, LESSON, CHECK, GUIDE_LINK, REPORT_LINK, GUIDE_BIO, REPORT_BIO, FAIR_CLOSE, FAIR_ONE, FAIR_MANY, DID_YOU, YT_GUIDE
};
