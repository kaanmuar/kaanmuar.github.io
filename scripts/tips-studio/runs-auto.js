/* Requested reviews: one post per user review that went public that day.
   The batch comes from scripts/auto-live-reports.js (previews/auto-live-reports/batch.json, or
   AUTO_BATCH). Copy is that script's template; each post links to the site's own Live Report.
   Posts carry no prices, no personal name, and nothing about who asked for the review. */

const fs = require("fs");
const path = require("path");
const { SITE, GUIDE, BRAND, xPost } = require("./tips");

const FILE = process.env.AUTO_BATCH || path.resolve(__dirname, "../../previews/auto-live-reports/batch.json");
const AREAS = [["SEO", "SEO"], ["GEO", "GEO"], ["Analytics", "Analytics"], ["Security", "Security"], ["Accessibility", "A11y"], ["Performance", "Speed"]];

const CATS = {
  Requested: { label: "Real run · requested", color: "#f2b37a" }
};

const RUNS = fs.existsSync(FILE) ? JSON.parse(fs.readFileSync(FILE, "utf8")) : [];

function shortDate(iso) {
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
}

const TIPS = RUNS.map((run) => {
  const analyzed = shortDate(run.fetchedAt);
  const fill = (text) => text.replace(/\{(\w+)\}/g, (all, key) => key === "overall" ? run.overall : run.areas[key] !== undefined ? run.areas[key] : all);
  return Object.assign({}, run, {
    title: run.title.map(fill),
    body: fill(run.body),
    action: fill(run.action),
    cat: run.scope,
    counter: "Requested review",
    actionLabel: "Lesson",
    footRight: "Analyzed on " + analyzed,
    analyzed,
    visual: {
      type: "scores",
      overall: run.overall,
      areas: AREAS.map(([key, label]) => [label, run.areas[key]]),
      note: run.host + " · " + run.pages + (run.pages === 1 ? " page analyzed · " : " pages analyzed · ") + analyzed
    }
  });
});

function link(platform, run) {
  return SITE + "/qa-review.html?live=" + run.id + "&utm_source=" + platform + "&utm_medium=social&utm_campaign=requested-reviews&utm_content=" + run.id;
}

function plainTitle(run) { return run.title.join(" ").replace(/\*/g, "").replace(/\s+/g, " ").trim(); }
function hashtags(run, n) { return run.tags.slice(0, n).map((t) => "#" + t).join(" "); }

function captions(run) {
  const head = plainTitle(run);
  const fair = "One automated analysis of public pages on " + run.analyzed + ", requested through QA-lab URL Review. A starting point, not a verdict.";
  return {
    linkedin: [head, "", run.body, "", "The lesson for every team: " + run.action, "", fair, "The full report: " + link("linkedin", run), "", hashtags(run, 3) + " #QA " + BRAND].join("\n"),
    x: xPost(head + "\n\n" + run.action, link("x", run)),
    instagram: [head, "", run.body, "", "Lesson: " + run.action, "", fair, "Full report: link in bio.", "", hashtags(run, 3) + " #QA #WebDev " + BRAND].join("\n"),
    facebook: [head, "", run.body, "", "Lesson: " + run.action, "", fair, link("facebook", run), "", BRAND].join("\n"),
    tiktok: head + " " + run.action + " " + hashtags(run, 3) + " #QA #techtok " + BRAND,
    youtubeTitle: (head + " #Shorts").slice(0, 100),
    youtube: [run.body, "", "Lesson: " + run.action, "", fair, "", "Full report: " + link("youtube", run), "", "Requested reviews · QA-lab URL Review"].join("\n")
  };
}

module.exports = { SITE, GUIDE, CATS, TIPS, captions, link, plainTitle };
