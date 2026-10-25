/* Real runs compared (lane 4, #1113): two public sites of the same kind, scored by the same review. A quiz post asks
   which one scored higher and names the post that answers it; the reveal shows both scorecards side by side.
     node scripts/tips-studio/build.js --source compare --batch compare-2026-11
   Scores are copied from the saved reports in previews/insights-test/<report>-current.json (runs.js, runs-100.js,
   runs-3/), analyzed on 19 and 21 Oct 2026; every number in the copy comes from SCORES. Posts carry no prices and
   no personal name. */

const { SITE, GUIDE, xPost } = require("./tips");
const { BRAND, tagLine } = require("../social-tags");

const CAMPAIGN = "compare-2026-11";
const KIND = "compare";

const CATS = {
  Worldwide: { label: "Real runs compared · worldwide", color: "#7ef6fb" },
  National: { label: "Real runs compared · national", color: "#e2c48a" },
  Local: { label: "Real runs compared · local", color: "#6fe3b1" }
};

const COLS = ["Overall", "SEO", "GEO", "Analytics", "Security", "A11y", "Speed"];
// report: [host, pages analyzed, analyzed on, overall, SEO, GEO, Analytics, Security, Accessibility, Performance]
const SCORES = {
  "r3-berlin": ["berlin.de", 20, "21 Oct 2026", 86, 75, 86, 97, 86, 97, 80],
  "r3-wien": ["wien.gv.at", 20, "21 Oct 2026", 85, 94, 86, 97, 72, 85, 80],
  "r100-stanford": ["stanford.edu", 20, "19 Oct 2026", 86, 81, 86, 85, 86, 100, 76],
  "r100-mit": ["mit.edu", 20, "19 Oct 2026", 83, 59, 83, 85, 77, 97, 97],
  "r100-harvard": ["harvard.edu", 20, "19 Oct 2026", 82, 75, 89, 85, 54, 100, 94],
  "r100-davivienda": ["davivienda.com", 20, "19 Oct 2026", 72, 56, 86, 85, 72, 86, 50],
  "bancolombia": ["bancolombia.com", 20, "19 Oct 2026", 65, 41, 83, 85, 67, 45, 73],
  "govuk": ["gov.uk", 20, "19 Oct 2026", 92, 86, 86, 97, 94, 100, 89],
  "r3-usagov": ["usa.gov", 20, "21 Oct 2026", 88, 81, 91, 85, 77, 100, 94],
  "r100-metromedellin": ["metrodemedellin.gov.co", 20, "19 Oct 2026", 85, 83, 86, 94, 77, 79, 94],
  "r100-metrobogota": ["metrodebogota.gov.co", 20, "19 Oct 2026", 79, 65, 86, 85, 61, 86, 97],
  "bogota": ["bogota.gov.co", 20, "19 Oct 2026", 80, 97, 89, 74, 77, 71, 73],
  "r100-medellin": ["medellin.gov.co", 19, "19 Oct 2026", 74, 89, 91, 71, 54, 65, 80]
};

function matrix(rows, note) {
  return { type: "matrix", cols: COLS, rows: rows.map(([label, report]) => [label].concat(SCORES[report].slice(3))), note };
}

function quiz(id, answer, scope, title, body, sides, note, footRight) {
  return {
    id, kind: "quiz", answer, cat: scope, title, body, counter: "Quiz · which scored higher?",
    visual: { type: "quiz", or: "or", sides: sides.map(([label, report]) => ({ label, host: SCORES[report][0] })), note },
    actionLabel: "Your guess",
    action: "Make your guess. The answer, with all six area scores, comes out in our next post.",
    footRight: footRight || "Same review, same day",
    tags: ["WebQuality", "Quiz", "QA"]
  };
}

const TIPS = [
  quiz("quiz-berlin-vienna", "berlin-vienna", "Local",
    ["Berlin or Vienna:", "*which city portal scored higher?*"],
    "Two capital city portals, 20 pages each, analyzed by the same public-page review in October 2026. One of them leads by a single point.",
    [["Berlin", "r3-berlin"], ["Vienna", "r3-wien"]], "Overall score out of 100 · 20 pages each"),
  {
    id: "berlin-vienna", cat: "Local", counter: "The answer",
    title: ["Berlin 86, Vienna 85.", "*One point apart.*"],
    body: "Vienna leads SEO by 19 points, 94 to 75. Berlin answers in security, 86 to 72, and accessibility, 97 to 85. GEO, analytics and speed are tied.",
    visual: matrix([["Berlin", "r3-berlin"], ["Vienna", "r3-wien"]], "berlin.de and wien.gv.at · 20 pages each"),
    actionLabel: "Lesson",
    action: "A one-point lead can hide a 19-point gap. Read your own site's area scores, not just the total.",
    footRight: "Analyzed on 21 Oct 2026",
    tags: ["WebQuality", "SEO", "GovTech"]
  },
  {
    id: "three-universities", cat: "Worldwide", counter: "Comparison",
    title: ["Stanford, MIT, Harvard:", "*each one wins somewhere.*"],
    body: "Stanford leads overall with 86, and in security. MIT has the fastest pages, 97 for speed. Harvard leads GEO with 89, and shares a perfect 100 for accessibility with Stanford.",
    visual: matrix([["Stanford", "r100-stanford"], ["MIT", "r100-mit"], ["Harvard", "r100-harvard"]], "stanford.edu, mit.edu, harvard.edu · 20 pages each"),
    actionLabel: "Lesson",
    action: "Pick your two closest peers and compare area by area. The total hides where each one is strong.",
    footRight: "Analyzed on 19 Oct 2026",
    tags: ["WebQuality", "HigherEd", "Accessibility"]
  },
  quiz("quiz-banks", "banks", "National",
    ["Davivienda or Bancolombia:", "*which bank's site scored higher?*"],
    "Two of Colombia's biggest banks, 20 public pages each, analyzed on the same day in October 2026.",
    [["Davivienda", "r100-davivienda"], ["Bancolombia", "bancolombia"]], "Overall score out of 100 · public pages only"),
  {
    id: "banks", cat: "National", counter: "The answer",
    title: ["Davivienda 72, Bancolombia 65.", "*The gap is accessibility.*"],
    body: "Davivienda scores 86 for accessibility, Bancolombia 45. Bancolombia has the faster pages, 73 to 50, and analytics is tied at 85.",
    visual: matrix([["Davivienda", "r100-davivienda"], ["Bancolombia", "bancolombia"]], "davivienda.com and bancolombia.com · 20 pages each"),
    actionLabel: "Lesson",
    action: "Check labels, contrast and headings on your public pages first. Here they moved the total more than any other area.",
    footRight: "Analyzed on 19 Oct 2026",
    tags: ["WebQuality", "Accessibility", "Fintech"]
  },
  quiz("quiz-govuk-usagov", "govuk-usagov", "National",
    ["GOV.UK or USA.gov:", "*which national portal scored higher?*"],
    "Two national government portals, each built on a public design system, 20 pages each, analyzed in October 2026.",
    [["United Kingdom", "govuk"], ["United States", "r3-usagov"]], "Overall score out of 100 · 20 pages each", "Same review, Oct 2026"),
  {
    id: "govuk-usagov", cat: "National", counter: "The answer",
    title: ["GOV.UK 92, USA.gov 88.", "*Both score 100 for accessibility.*"],
    body: "GOV.UK leads security, 94 to 77, and analytics, 97 to 85. USA.gov answers with speed, 94 to 89, and GEO, 91 to 86.",
    visual: matrix([["GOV.UK", "govuk"], ["USA.gov", "r3-usagov"]], "gov.uk and usa.gov · 20 pages each"),
    actionLabel: "Lesson",
    action: "Both build their pages from a public design system. Reuse tested components instead of rebuilding them on every page.",
    footRight: "Analyzed in Oct 2026",
    tags: ["WebQuality", "GovTech", "DesignSystems"]
  },
  quiz("quiz-metros", "metros", "Local",
    ["Medellín's metro or Bogotá's:", "*which site scored higher?*"],
    "Medellín's metro has carried riders since 1995, while Bogotá's first line is still being built. Their websites, 20 pages each, went through the same review.",
    [["Metro de Medellín", "r100-metromedellin"], ["Metro de Bogotá", "r100-metrobogota"]], "Overall score out of 100 · 20 pages each"),
  {
    id: "metros", cat: "Local", counter: "The answer",
    title: ["Medellín 85, Bogotá 79.", "*Bogotá's site is faster.*"],
    body: "Metro de Medellín leads SEO, 83 to 65, and security, 77 to 61. Metro de Bogotá wins speed, 97 to 94, and accessibility, 86 to 79. GEO is tied at 86.",
    visual: matrix([["Medellín", "r100-metromedellin"], ["Bogotá", "r100-metrobogota"]], "metrodemedellin.gov.co and metrodebogota.gov.co · 20 pages each"),
    actionLabel: "Lesson",
    action: "A faster site can still lose overall. Fix the weakest area first: for Metro de Bogotá that is security, at 61.",
    footRight: "Analyzed on 19 Oct 2026",
    tags: ["WebQuality", "PublicTransport", "WebSecurity"]
  },
  quiz("quiz-cities", "cities", "Local",
    ["Bogotá or Medellín:", "*whose city hall site scored higher?*"],
    "Colombia's two largest cities and their official portals, analyzed by the same public-page review in October 2026.",
    [["Bogotá", "bogota"], ["Medellín", "r100-medellin"]], "Overall score out of 100 · city hall portals"),
  {
    id: "cities", cat: "Local", counter: "The answer",
    title: ["Bogotá 80, Medellín 74.", "*Security made the difference.*"],
    body: "Bogotá leads security, 77 to 54, and SEO, 97 to 89. Medellín has the faster pages, 80 to 73, and edges GEO, 91 to 89.",
    visual: matrix([["Bogotá", "bogota"], ["Medellín", "r100-medellin"]], "bogota.gov.co, 20 pages · medellin.gov.co, 19 pages"),
    actionLabel: "Lesson",
    action: "Medellín's portal sends no HSTS, CSP, Referrer-Policy or Permissions-Policy header. Most hosts and CDNs set headers as configuration, not code.",
    footRight: "Analyzed on 19 Oct 2026",
    tags: ["WebQuality", "GovTech", "WebSecurity"]
  }
];

// Alt text from the post's own sentences, whole sentences only, within LinkedIn's 300 characters.
function altFor(tip) {
  const parts = [tip.kind === "quiz" ? "Quiz card." : "Comparison card.", plainTitle(tip)].concat(tip.body.split(/(?<=\.)\s+/));
  if (tip.kind === "quiz") parts.push("Scores hidden until the next post.");
  return parts.reduce((out, part) => (out.length + part.length + 1 <= 300 ? (out ? out + " " : "") + part : out), "");
}
TIPS.forEach((tip) => { tip.alt = tip.alt || altFor(tip); });

function link(platform, tip) {
  const q = new URLSearchParams({ utm_source: platform, utm_medium: "social", utm_campaign: CAMPAIGN, utm_content: tip.id });
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

module.exports = { SITE, GUIDE, BRAND, CATS, KIND, SCORES, TIPS, captions, link, plainTitle, xPost };
