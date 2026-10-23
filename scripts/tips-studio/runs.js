/* Real-run posts: one public site per post, scored by the same review anyone can run.
   Scores come from the saved report in previews/insights-test/<report>-current.json. Each claim in
   the copy was checked against the live site on the analysis date. Lead with what the site does well,
   then one lesson any team can use. Posts carry no prices, no country, and no personal name. */

const fs = require("fs");
const path = require("path");
const { SITE, GUIDE, xPost } = require("./tips");
const { tagLine } = require("../social-tags");

const REPORTS = path.resolve(__dirname, "../../previews/insights-test");
const AREAS = [["SEO", "SEO"], ["GEO", "GEO"], ["Analytics", "Analytics"], ["Security", "Security"], ["Accessibility", "A11y"], ["Performance", "Speed"]];

const CATS = {
  Worldwide: { label: "Real run · worldwide", color: "#7ef6fb" },
  National: { label: "Real run · national", color: "#e2c48a" },
  Local: { label: "Real run · local", color: "#6fe3b1" }
};

// {overall} and {SEO}, {GEO}, {Analytics}, {Security}, {Accessibility}, {Performance} come from the report.
const RUNS = [
  {
    id: "govuk", report: "govuk", scope: "Worldwide",
    title: ["We analyzed GOV.UK.", "*It scores {overall}.*"],
    body: "Accessibility {Accessibility}, a strict content security policy, and real visitors see the main content in 0.7 s. The one gap: 19 of the 20 pages analyzed have no canonical link.",
    action: "Give every page a canonical link, even when only one address serves it. One line settles which URL ranks.",
    tags: ["SEO", "WebPerformance", "Accessibility"]
  },
  {
    id: "bogota", report: "bogota", scope: "Local",
    title: ["Bogotá city hall:", "*SEO {SEO}.*"],
    body: "Every page has a title and a description, the sitemap answers, structured data parses, and share cards are complete. The catch: every page reports to two GA4 properties.",
    action: "One site, one GA4 property, one gtag.js. If two teams need the data, share access instead of adding a tag.",
    tags: ["Analytics", "GA4", "SEO"]
  },
  {
    id: "who", report: "who", scope: "Worldwide",
    title: ["WHO's fact sheets", "*end in a stray semicolon.*"],
    body: "WHO welcomes AI answer crawlers and its pages read well without JavaScript: GEO {GEO}. But the JSON-LD on its fact sheets ends in \"};\", and a strict parser drops the whole block.",
    action: "Run every JSON-LD block through a JSON validator before release. One character can void the entire block.",
    tags: ["StructuredData", "SEO", "GEO"]
  },
  {
    id: "govco", report: "govco", scope: "National",
    title: ["GOV.CO is empty", "*until JavaScript runs.*"],
    body: "The portal for more than 78,000 government procedures sends an HTML body with almost no text. Most AI crawlers do not run JavaScript, so they see a title and little else.",
    action: "Render the main text on the server, or prerender the start page. View source should show what a visitor reads.",
    tags: ["GEO", "AISearch", "JavaScriptSEO"]
  },
  {
    id: "bbc", report: "bbc", scope: "Worldwide",
    title: ["The BBC decides", "*who may read it.*"],
    body: "DMARC reject, preloaded HSTS, and Core Web Vitals that pass for real visitors. Its robots.txt also turns away AI answer crawlers like ChatGPT search and Perplexity. GEO: {GEO}.",
    action: "Blocking AI training and blocking AI answers are separate choices. Name each crawler in robots.txt on purpose.",
    tags: ["GEO", "AISearch", "SEO"]
  },
  {
    id: "transmilenio", report: "transmilenio", scope: "Local",
    title: ["TransMilenio lets", "*search write its pitch.*"],
    body: "Every linked page answers and AI crawlers are welcome. But none of the 20 pages analyzed has a meta description, the start page included, so search engines write the snippet themselves.",
    action: "Write a description of about 150 characters for your ten most visited pages, starting with the home page.",
    tags: ["SEO", "MetaDescription", "SERP"]
  },
  {
    id: "python", report: "python", scope: "Worldwide",
    title: ["Python.org reads well.", "*Its site name is missing.*"],
    body: "Every page has a title and a description, and the text reads without JavaScript. The gap: its WebSite JSON-LD has no name, the property search uses for the site name in results.",
    action: "Add \"name\" to your WebSite JSON-LD, written exactly as you want the site named in search results.",
    tags: ["StructuredData", "SEO", "OpenSource"]
  },
  {
    id: "bancolombia", report: "bancolombia", scope: "National",
    title: ["Bancolombia's site", "*won't let you zoom.*"],
    body: "Language versions link to each other, share cards are complete, and pages read without JavaScript. But the viewport sets maximum-scale=1, which blocks pinch-zoom on many phones for people who need larger text.",
    action: "Drop maximum-scale and user-scalable=no from your viewport tag. Zoom is how many people read.",
    tags: ["Accessibility", "A11y", "MobileUX"]
  },
  {
    id: "un", report: "un", scope: "Worldwide",
    title: ["The UN home page", "*never says its language.*"],
    body: "Links answer, campaign tags survive redirects, and AI answer crawlers are welcome. But the start page's <html> tag has no lang, so screen readers guess the voice and browsers guess the translation.",
    action: "Put lang on the html tag of every language version: lang=\"en\", lang=\"fr\", lang=\"ar\". One attribute per page.",
    tags: ["Accessibility", "i18n", "A11y"]
  },
  {
    id: "nasa", report: "nasa", scope: "Worldwide",
    title: ["NASA is wide open", "*to AI search.*"],
    body: "GEO scores {GEO}: answer crawlers are welcome, structured data names the organization, and pages carry authors and dates. Security headers are where it trails.",
    action: "Four headers close most of that gap: Content-Security-Policy, X-Content-Type-Options, Referrer-Policy, and Permissions-Policy.",
    tags: ["WebSecurity", "GEO", "AISearch"]
  }
];

function shortDate(iso) {
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
}

const TIPS = RUNS.map((run, index) => {
  const report = JSON.parse(fs.readFileSync(path.join(REPORTS, run.report + "-current.json"), "utf8"));
  const score = report.insights.score;
  const analyzed = shortDate(report.fetchedAt);
  const fill = (text) => text.replace(/\{(\w+)\}/g, (all, key) => key === "overall" ? score.overall : score.areas[key] ? score.areas[key].score : all);
  return Object.assign({}, run, {
    title: run.title.map(fill),
    body: fill(run.body),
    action: fill(run.action),
    cat: run.scope,
    counter: "Real run " + String(index + 1).padStart(2, "0") + " / " + String(RUNS.length).padStart(2, "0"),
    actionLabel: "Lesson",
    footRight: "Analyzed on " + analyzed,
    analyzed,
    overall: score.overall,
    visual: {
      type: "scores",
      overall: score.overall,
      areas: AREAS.map(([key, label]) => [label, score.areas[key].score]),
      note: report.host + " · " + report.pages.length + (report.pages.length === 1 ? " page analyzed · " : " pages analyzed · ") + analyzed
    }
  });
});

function link(platform, run) {
  return GUIDE + "?utm_source=" + platform + "&utm_medium=social&utm_campaign=runs-2026-10&utm_content=" + run.id;
}

function plainTitle(run) { return run.title.join(" ").replace(/\*/g, "").replace(/\s+/g, " ").trim(); }

function captions(run) {
  const head = plainTitle(run);
  const fair = "One automated analysis of public pages on " + run.analyzed + ". A starting point, not a verdict.";
  return {
    linkedin: [head, "", run.body, "", "The lesson for every team: " + run.action, "", fair, "How the review works, step by step: " + link("linkedin", run), "", tagLine(run, "linkedin")].join("\n"),
    x: xPost(head + "\n\n" + run.action, link("x", run), tagLine(run, "x")),
    instagram: [head, "", run.body, "", "Lesson: " + run.action, "", fair, "Guide: link in bio.", "", tagLine(run, "instagram")].join("\n"),
    facebook: [head, "", run.body, "", "Lesson: " + run.action, "", fair, link("facebook", run), "", tagLine(run, "facebook")].join("\n"),
    tiktok: head + " " + run.action + " " + tagLine(run, "tiktok"),
    youtubeTitle: (head + " #Shorts").slice(0, 100),
    youtube: [run.body, "", "Lesson: " + run.action, "", fair, "", "Guide: " + link("youtube", run), "", "Real runs · QA-lab URL Review", "", tagLine(run, "youtube")].join("\n")
  };
}

module.exports = { SITE, GUIDE, CATS, TIPS, captions, link, plainTitle };
