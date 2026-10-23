/* Requested reviews and country-sweep sites: one post per review that went public that day.
   The batch comes from scripts/auto-live-reports.js (previews/auto-live-reports/batch.json, or
   AUTO_BATCH). Copy is that script's template; each post links to the site's own Live Report.
   Posts carry no prices, no personal name, and nothing about who asked for the review. */

const fs = require("fs");
const path = require("path");
const { SITE, GUIDE, BRAND, xPost } = require("./tips");

const OWN = SITE + "/qa-review.html";
const FILE = process.env.AUTO_BATCH || path.resolve(__dirname, "../../previews/auto-live-reports/batch.json");
const AREAS = [["SEO", "SEO"], ["GEO", "GEO"], ["Analytics", "Analytics"], ["Security", "Security"], ["Accessibility", "A11y"], ["Performance", "Speed"]];

const CATS = {
  Requested: { label: "Real run · requested", color: "#f2b37a", counter: "Requested review", series: "Requested reviews" },
  National: { label: "Real run · national", color: "#8fc1e3", counter: "Country sweep", series: "Country sweep" }
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
    counter: (CATS[run.scope] || CATS.Requested).counter,
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
  const campaign = run.scope === "National" ? "country-sweep" : "requested-reviews";
  return SITE + "/qa-review.html?live=" + run.id + "&utm_source=" + platform + "&utm_medium=social&utm_campaign=" + campaign + "&utm_content=" + run.id;
}

function plainTitle(run) { return run.title.join(" ").replace(/\*/g, "").replace(/\s+/g, " ").trim(); }
function hashtags(run, n) { return run.tags.slice(0, n).map((t) => "#" + t).join(" "); }

function captions(run) {
  const head = plainTitle(run);
  const how = run.scope === "National" ? ", one of the most visited sites in its country, from QA-lab URL Review's country sweep." : ", requested through QA-lab URL Review.";
  const fair = "One automated analysis of public pages on " + run.analyzed + how + " A starting point, not a verdict.";
  const own = "Review your own site: " + OWN;
  return {
    linkedin: [head, "", run.body, "", "The lesson for every team: " + run.action, "", fair, "The full report: " + link("linkedin", run), "", own, "", hashtags(run, 3) + " #QA " + BRAND].join("\n"),
    x: xPost(head + "\n\n" + run.action, link("x", run)),
    instagram: [head, "", run.body, "", "Lesson: " + run.action, "", fair, "Full report: link in bio.", "", own, "", hashtags(run, 3) + " #QA #WebDev " + BRAND].join("\n"),
    facebook: [head, "", run.body, "", "Lesson: " + run.action, "", fair, link("facebook", run), "", own, "", BRAND].join("\n"),
    tiktok: head + " " + run.action + " " + own + " " + hashtags(run, 3) + " #QA #techtok " + BRAND,
    youtubeTitle: (head + " #Shorts").slice(0, 100),
    youtube: [run.body, "", "Lesson: " + run.action, "", fair, "", "Full report: " + link("youtube", run), "", own, "", (CATS[run.scope] || CATS.Requested).series + " · QA-lab URL Review", "", hashtags(run, 3) + " #QA " + BRAND].join("\n")
  };
}

module.exports = { SITE, GUIDE, CATS, TIPS, captions, link, plainTitle };
