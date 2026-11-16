/* Real runs compared, second batch (lane 4, #3012): compare.js's quiz and answer pairs, two more public sites of the
   same kind scored by the same review.
     node scripts/tips-studio/build.js --source compare-b
   Scores are copied from the saved reports in previews/insights-test/<report>-current.json (runs-100.js), analyzed on
   19 Oct 2026; every number in the copy comes from SCORES. LANG_OFFSET starts the batch at Spanish, so the first quiz
   and its answer (es, pt) go out from the same face and its Threads account (#2701). Each post is pinned to its day in
   DAYS, a quiz the day before its answer, at its lane's free slot: lane 4's backlog would otherwise hold it for months.
   Posts carry no prices and no personal name. */

const { SITE, GUIDE, xPost } = require("./tips");
const { BRAND, tagLine } = require("../social-tags");
const cal = require("../social-calendar");

const BATCH = "compare-2026-11b";
const KIND = "compare";
const LANG_OFFSET = 1;

const CATS = {
  Worldwide: { label: "Real runs compared · worldwide", color: "#7ef6fb" },
  Local: { label: "Real runs compared · local", color: "#6fe3b1" }
};

const COLS = ["Overall", "SEO", "GEO", "Analytics", "Security", "A11y", "Speed"];
// report: [host, pages analyzed, analyzed on, overall, SEO, GEO, Analytics, Security, Accessibility, Performance]
const SCORES = {
  "r100-eafit": ["eafit.edu.co", 20, "19 Oct 2026", 75, 72, 86, 85, 77, 76, 58],
  "r100-udea": ["udea.edu.co", 20, "19 Oct 2026", 53, 34, 56, 82, 16, 78, 68],
  "r100-elpais": ["elpais.com", 20, "19 Oct 2026", 74, 73, 59, 85, 46, 94, 92],
  "r100-lemonde": ["lemonde.fr", 20, "19 Oct 2026", 72, 54, 61, 97, 62, 79, 83]
};

function matrix(rows, note) {
  return { type: "matrix", cols: COLS, rows: rows.map(([label, report]) => [label].concat(SCORES[report].slice(3))), note };
}

function quiz(id, answer, scope, title, body, sides, note, extra) {
  return Object.assign({
    id, kind: "quiz", answer, cat: scope, title, body, counter: "Quiz · which scored higher?",
    visual: { type: "quiz", or: "or", sides: sides.map(([label, report]) => ({ label, host: SCORES[report][0] })), note },
    actionLabel: "Your guess",
    action: "Make your guess. The answer, with all six area scores, comes out tomorrow.",
    footRight: "Same review, same day",
    tags: ["WebQuality", "Quiz", "QA"]
  }, extra);
}

const TIPS = [
  quiz("quiz-medellin-universities", "medellin-universities", "Local",
    ["EAFIT or UdeA:", "*which university site scored higher?*"],
    "Two Medellín universities, EAFIT and the Universidad de Antioquia, 20 public pages each, analyzed by the same review on the same day in October 2026.",
    [["EAFIT", "r100-eafit"], ["UdeA", "r100-udea"]], "Overall score out of 100 · 20 pages each",
    { place: "Medellín, Colombia" }),
  {
    id: "medellin-universities", cat: "Local", counter: "The answer", place: "Medellín, Colombia",
    title: ["EAFIT 75, UdeA 53.", "*Security is the widest gap.*"],
    body: "EAFIT leads security, 77 to 16, SEO, 72 to 34, and GEO, 86 to 56. UdeA answers with speed, 68 to 58, and accessibility, 78 to 76. Analytics is close, 85 to 82.",
    visual: matrix([["EAFIT", "r100-eafit"], ["UdeA", "r100-udea"]], "eafit.edu.co and udea.edu.co · 20 pages each"),
    actionLabel: "Lesson",
    action: "A wide gap often starts in one weak area. Find your lowest area score and fix that first.",
    footRight: "Analyzed on 19 Oct 2026",
    tags: ["WebQuality", "HigherEd", "WebSecurity"]
  },
  quiz("quiz-newspapers", "newspapers", "Worldwide",
    ["El País or Le Monde:", "*which newspaper site scored higher?*"],
    "Two daily newspapers, from Spain and France, 20 public pages each, analyzed by the same review on the same day in October 2026. Two points separate them.",
    [["El País", "r100-elpais"], ["Le Monde", "r100-lemonde"]], "Overall score out of 100 · 20 pages each"),
  {
    id: "newspapers", cat: "Worldwide", counter: "The answer",
    title: ["El País 74, Le Monde 72.", "*Each wins three areas.*"],
    body: "El País leads SEO, 73 to 54, accessibility, 94 to 79, and speed, 92 to 83. Le Monde answers with analytics, 97 to 85, security, 62 to 46, and GEO, 61 to 59.",
    visual: matrix([["El País", "r100-elpais"], ["Le Monde", "r100-lemonde"]], "elpais.com and lemonde.fr · 20 pages each"),
    actionLabel: "Lesson",
    action: "Two close totals can hide opposite strengths. Compare area by area before you copy a competitor.",
    footRight: "Analyzed on 19 Oct 2026",
    tags: ["WebQuality", "SEO", "Media"]
  }
];

// Alt text from the post's own sentences, whole sentences only, within LinkedIn's 300 characters.
function altFor(tip) {
  const parts = [tip.kind === "quiz" ? "Quiz card." : "Comparison card.", plainTitle(tip)].concat(tip.body.split(/(?<=\.)\s+/));
  if (tip.kind === "quiz") parts.push("Scores hidden until tomorrow.");
  return parts.reduce((out, part) => (out.length + part.length + 1 <= 300 ? (out ? out + " " : "") + part : out), "");
}
// Each clip's "Did you know?" scene (#1663): one more number from SCORES, never the one a quiz's answer hinges on.
const MORE = {
  "quiz-medellin-universities": "Both universities score in the 80s for analytics, so that area will not decide it.",
  "medellin-universities": "UdeA's 16 for security is the lowest area score in either comparison batch.",
  "quiz-newspapers": "Both newspapers score within two points of each other for GEO, 59 and 61.",
  newspapers: "Le Monde's 97 for analytics is its highest area score. El País's is accessibility, at 94."
};
const DAYS = { "quiz-medellin-universities": "2026-11-11", "medellin-universities": "2026-11-12", "quiz-newspapers": "2026-11-13", newspapers: "2026-11-14" };
TIPS.forEach((tip) => {
  Object.assign(tip, { alt: tip.alt || altFor(tip), more: MORE[tip.id], date: DAYS[tip.id], pin: true });
  tip.times = Object.fromEntries(cal.NETWORKS.map((network) => [network, cal.freeSlot(tip.date, network, cal.LANES[tip.kind || KIND], BATCH)]));
});

function link(platform, tip) {
  const q = new URLSearchParams({ utm_source: platform, utm_medium: "social", utm_campaign: BATCH, utm_content: tip.id });
  return GUIDE + "?" + q.toString();
}

function plainTitle(tip) { return tip.title.join(" ").replace(/\*/g, "").replace(/\s+/g, " ").trim(); }

function captions(tip) {
  const head = plainTitle(tip);
  const label = tip.actionLabel + ": ";
  return {
    linkedin: [head, "", tip.body, "", label + tip.action, "", "How a public-page review works, step by step: " + link("linkedin", tip), "", tagLine(tip, "linkedin")].join("\n"),
    x: xPost(head + "\n\n" + tip.action, link("x", tip), tagLine(tip, "x")),
    instagram: [head, "", tip.body, "", label + tip.action, "", tagLine(tip, "instagram")].join("\n"),
    facebook: [head, "", tip.body, "", label + tip.action, "", link("facebook", tip), "", tagLine(tip, "facebook")].join("\n"),
    tiktok: head + " " + tip.action + " " + tagLine(tip, "tiktok"),
    youtubeTitle: (head + " #Shorts").slice(0, 100),
    youtube: [tip.body, "", label + tip.action, "", "Guide: " + link("youtube", tip), "", tip.counter + " · QA-lab URL Review", "", tagLine(tip, "youtube")].join("\n")
  };
}

module.exports = { SITE, GUIDE, BRAND, BATCH, CATS, KIND, LANG_OFFSET, SCORES, TIPS, captions, link, plainTitle, xPost };
