/**
 * Runs the URL review against public addresses and saves each report as JSON.
 *
 *   CHROME_PATH=... node scripts/review-snapshot.js name=https://example.com [name=url ...]
 *
 * Reports go to previews/insights-test/<name>-current.json. The browser pass
 * runs when CHROME_PATH is set, and PageSpeed Insights when PAGESPEED_KEY is
 * set in the environment or in functions/.env.
 *
 *   node scripts/review-snapshot.js --sample https://carlosandmunoz.com/
 *
 * writes the public sample that qa-review.html opens before the disclaimers.
 */
const fs = require("fs");
const path = require("path");
const core = require("../functions/url-review-core");

const ROOT = path.join(__dirname, "..");
const OUT = path.join(ROOT, "previews", "insights-test");
const SAMPLE = path.join(ROOT, "assets", "qa-review-sample.json");

function loadEnvFile() {
  let text = "";
  try { text = fs.readFileSync(path.join(ROOT, "functions", ".env"), "utf8"); } catch (error) { return; }
  text.split("\n").forEach((line) => {
    const trimmed = line.trim();
    const eq = trimmed.indexOf("=");
    if (!trimmed || trimmed.startsWith("#") || eq < 1) return;
    const key = trimmed.slice(0, eq).trim();
    if (!process.env[key]) process.env[key] = trimmed.slice(eq + 1).trim();
  });
}

function summary(name, report) {
  const scores = (report.insights && report.insights.score && report.insights.score.areas) || {};
  const areas = Object.keys(scores).map((area) => area + " " + scores[area].score).join(", ");
  const overall = report.insights && report.insights.score ? report.insights.score.overall : "";
  return name + ": " + report.pages.length + " pages, " + report.cases.length + " cases, overall " + overall + " (" + areas + ")";
}

async function main() {
  loadEnvFile();
  const args = process.argv.slice(2);
  if (args[0] === "--sample") {
    if (!args[1]) {
      console.error("Usage: node scripts/review-snapshot.js --sample https://example.com/");
      process.exit(2);
    }
    const report = await core.reviewTarget(args[1], {
      browse: process.env.CHROME_PATH ? (job) => require("../functions/url-review-browser").browse(job) : undefined,
      pagespeed: process.env.PAGESPEED_KEY ? (url) => core.pageSpeed(url, process.env.PAGESPEED_KEY) : undefined
    });
    fs.writeFileSync(SAMPLE, JSON.stringify({ frameworks: core.FRAMEWORKS, report }) + "\n");
    console.log(summary("sample", report) + " -> " + path.relative(ROOT, SAMPLE));
    return;
  }
  const targets = args.map((arg) => {
    const eq = arg.indexOf("=");
    return { name: arg.slice(0, eq), url: arg.slice(eq + 1) };
  }).filter((t) => t.name && t.url);
  if (!targets.length) {
    console.error("Usage: node scripts/review-snapshot.js name=https://example.com [name=url ...]");
    process.exit(2);
  }
  fs.mkdirSync(OUT, { recursive: true });
  for (const target of targets) {
    const started = Date.now();
    try {
      const report = await core.reviewTarget(target.url, {
        browse: process.env.CHROME_PATH ? (job) => require("../functions/url-review-browser").browse(job) : undefined,
        pagespeed: process.env.PAGESPEED_KEY ? (url) => core.pageSpeed(url, process.env.PAGESPEED_KEY) : undefined
      });
      fs.writeFileSync(path.join(OUT, target.name + "-current.json"), JSON.stringify(report, null, 1));
      console.log(summary(target.name, report) + " in " + Math.round((Date.now() - started) / 1000) + " s");
    } catch (error) {
      console.log(target.name + ": failed, " + (error && error.message ? error.message : error));
    }
  }
}

main();
