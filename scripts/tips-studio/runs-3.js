/* Real runs, series three: one public site per post, scored by the same review anyone can run.
   Scores come from the saved report in previews/insights-test/<report>-current.json. Each claim in
   the copy was checked against the live site with curl on the read date. Lead with what the site
   does well, then one lesson any team can use. Posts carry no prices and no personal name. */

const fs = require("fs");
const path = require("path");
const { SITE, GUIDE, xPost } = require("./tips");

const REPORTS = path.resolve(__dirname, "../../previews/insights-test");
const AREAS = [["SEO", "SEO"], ["GEO", "GEO"], ["Analytics", "Analytics"], ["Security", "Security"], ["Accessibility", "A11y"], ["Performance", "Speed"]];

const CATS = {
  Worldwide: { label: "Real run · worldwide", color: "#7ef6fb" },
  National: { label: "Real run · national", color: "#e2c48a" },
  Regional: { label: "Real run · regional", color: "#c9a7ff" },
  Local: { label: "Real run · local", color: "#6fe3b1" }
};

// Each scope lives in runs-3/<scope>.js as an array of { id, report, scope, title, body, action, tags }.
// {overall} and {SEO}, {GEO}, {Analytics}, {Security}, {Accessibility}, {Performance} come from the report.
const PARTS = ["worldwide", "national", "regional", "local"].map((name) => require("./runs-3/" + name));
const RUNS = [];
for (let i = 0; PARTS.some((part) => i < part.length); i++) PARTS.forEach((part) => { if (part[i]) RUNS.push(part[i]); });

function readDate(iso) {
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
}

const TIPS = RUNS.map((run, index) => {
  const report = JSON.parse(fs.readFileSync(path.join(REPORTS, run.report + "-current.json"), "utf8"));
  const score = report.insights.score;
  const read = readDate(report.fetchedAt);
  const fill = (text) => text.replace(/\{(\w+)\}/g, (all, key) => key === "overall" ? score.overall : score.areas[key] ? score.areas[key].score : all);
  return Object.assign({}, run, {
    title: run.title.map(fill),
    body: fill(run.body),
    action: fill(run.action),
    cat: run.scope,
    counter: "Real run " + String(index + 1).padStart(2, "0") + " / " + String(RUNS.length).padStart(2, "0"),
    actionLabel: "Lesson",
    footRight: "Read on " + read,
    read,
    overall: score.overall,
    visual: {
      type: "scores",
      overall: score.overall,
      areas: AREAS.map(([key, label]) => [label, score.areas[key].score]),
      note: report.host + " · " + report.pages.length + (report.pages.length === 1 ? " page read · " : " pages read · ") + read
    }
  });
});

function link(platform, run) {
  return GUIDE + "?utm_source=" + platform + "&utm_medium=social&utm_campaign=runs-3-2027-01&utm_content=" + run.id;
}

function plainTitle(run) { return run.title.join(" ").replace(/\*/g, "").replace(/\s+/g, " ").trim(); }
function hashtags(run, n) { return run.tags.slice(0, n).map((t) => "#" + t).join(" "); }

function captions(run) {
  const head = plainTitle(run);
  const fair = "One automated read of public pages on " + run.read + ". A starting point, not a verdict.";
  return {
    linkedin: [head, "", run.body, "", "The lesson for every team: " + run.action, "", fair, "How the review works, step by step: " + link("linkedin", run), "", hashtags(run, 3) + " #QA"].join("\n"),
    x: xPost(head + "\n\n" + run.action, link("x", run)),
    instagram: [head, "", run.body, "", "Lesson: " + run.action, "", fair, "Guide: link in bio.", "", hashtags(run, 3) + " #QA #WebDev #QAlab"].join("\n"),
    facebook: [head, "", run.body, "", "Lesson: " + run.action, "", fair, link("facebook", run)].join("\n"),
    tiktok: head + " " + run.action + " " + hashtags(run, 3) + " #QA #techtok",
    youtubeTitle: (head + " #Shorts").slice(0, 100),
    youtube: [run.body, "", "Lesson: " + run.action, "", fair, "", "Guide: " + link("youtube", run), "", "Real runs · QA-lab URL Review"].join("\n")
  };
}

module.exports = { SITE, GUIDE, CATS, TIPS, captions, link, plainTitle };
