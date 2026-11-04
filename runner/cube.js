/**
 * The Cube: runs a URL review's proposed cases against the reviewed site (#1935).
 *
 * prepare() writes the suite that js/qa-review-scripts.js builds for the report,
 * execute() runs it, and collect() turns the runner's report into one row per case
 * with a triage label a customer can act on.
 */
const fs = require("node:fs");
const path = require("node:path");
const { spawn } = require("node:child_process");
const scripts = require("../js/qa-review-scripts.js");

const RUNNABLE = ["Playwright"];
const ANSI = /\x1b\[[0-9;]*m/g;
const UNREACHABLE = /net::ERR_|ERR_NAME_NOT_RESOLVED|ECONNREFUSED|ECONNRESET|ETIMEDOUT|page\.goto: Timeout|navigating to .* waiting until/i;

const CONFIG = `module.exports = {
  testDir: "playwright",
  outputDir: "artifacts",
  timeout: 60000,
  workers: Number(process.env.CUBE_WORKERS) || 4,
  retries: 1,
  reporter: [["json", { outputFile: "results.json" }], ["line"]],
  use: { trace: "retain-on-failure", screenshot: "only-on-failure", video: "retain-on-failure", userAgent: process.env.CUBE_AGENT || undefined }
};
`;

function modulesDir() {
  return path.resolve(path.dirname(require.resolve("@playwright/test/package.json")), "..", "..");
}

function prepare(report, frameworks, dir) {
  const chosen = (frameworks || RUNNABLE).filter((fw) => RUNNABLE.indexOf(fw) !== -1);
  if (!chosen.length) throw new Error("None of " + (frameworks || []).join(", ") + " can run in the Cube yet");
  const { files, frameworks: used } = scripts.bundle(report, report.cases || [], chosen);
  fs.mkdirSync(dir, { recursive: true });
  files.filter((file) => !/^(fix-kit|\.github)\//.test(file.path)).forEach((file) => {
    const target = path.join(dir, file.path);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, file.content);
  });
  fs.writeFileSync(path.join(dir, "playwright.config.js"), CONFIG);
  return used;
}

function execute(dir, onLine) {
  const link = path.join(dir, "node_modules");
  if (!fs.existsSync(link)) fs.symlinkSync(modulesDir(), link, "dir");
  return new Promise((resolve) => {
    const cli = path.join(modulesDir(), "@playwright", "test", "cli.js");
    const child = spawn(process.execPath, [cli, "test"], { cwd: dir, env: Object.assign({}, process.env, { FORCE_COLOR: "0" }) });
    let tail = "";
    const read = (chunk) => {
      const text = String(chunk);
      tail = (tail + text).slice(-4000);
      if (onLine) text.split("\n").filter(Boolean).forEach(onLine);
    };
    child.stdout.on("data", read);
    child.stderr.on("data", read);
    child.on("close", (code) => resolve({ code, tail }));
  });
}

function caseId(title) {
  const match = /^([A-Z0-9]+-\d+)\b/.exec(String(title || ""));
  return match ? match[1] : "";
}

/**
 * site: the run confirms a problem on the site.
 * disagree: the review passed this case and the run failed it. Either the site changed or the script reads it differently; a person looks before anyone fixes the site.
 * unreachable: the page did not answer; nothing was judged.
 */
function triage(item, error) {
  if (UNREACHABLE.test(error || "")) return "unreachable";
  if (item && item.verdict === "pass") return "disagree";
  return "site";
}

function collect(results, report) {
  const byId = new Map((report.cases || []).map((item) => [item.id, item]));
  const rows = [];
  const walk = (suite) => {
    (suite.specs || []).forEach((spec) => {
      (spec.tests || []).forEach((test) => {
        const tries = test.results || [];
        const last = tries[tries.length - 1] || {};
        const id = caseId(spec.title);
        const item = byId.get(id);
        const skipped = test.status === "skipped" || last.status === "skipped";
        const passed = last.status === "passed";
        const error = passed || skipped ? "" : String((last.error && last.error.message) || last.status || "").replace(ANSI, "").split("\n").slice(0, 8).join("\n").trim();
        const row = {
          id,
          title: spec.title.replace(/^[A-Z0-9]+-\d+\s*·\s*/, ""),
          status: skipped ? "skipped" : passed ? (tries.length > 1 ? "flaky" : "passed") : "failed",
          ms: tries.reduce((sum, result) => sum + (result.duration || 0), 0),
          layer: item ? item.layer : "",
          review: item ? item.verdict || "proposed" : ""
        };
        if (row.status === "failed") {
          row.error = error;
          row.triage = triage(item, error);
        }
        const files = (last.attachments || []).filter((file) => file.path).map((file) => ({ name: file.name, path: file.path, type: file.contentType }));
        if (files.length) row.artifacts = files;
        rows.push(row);
      });
    });
    (suite.suites || []).forEach(walk);
  };
  (results.suites || []).forEach(walk);
  return { cases: rows, summary: summarize(rows, results.stats) };
}

function summarize(rows, stats) {
  const summary = { total: rows.length, passed: 0, failed: 0, flaky: 0, skipped: 0, site: 0, disagree: 0, unreachable: 0, ms: Math.round((stats && stats.duration) || 0) };
  rows.forEach((row) => {
    summary[row.status] += 1;
    if (row.triage) summary[row.triage] += 1;
  });
  return summary;
}

async function run(report, options) {
  const opts = options || {};
  const dir = opts.dir;
  const frameworks = prepare(report, opts.frameworks, dir);
  const started = Date.now();
  const outcome = await execute(dir, opts.onLine);
  const file = path.join(dir, "results.json");
  if (!fs.existsSync(file)) {
    const error = new Error("The runner stopped before writing results: " + outcome.tail.split("\n").slice(-5).join(" ").trim());
    error.tail = outcome.tail;
    throw error;
  }
  const out = collect(JSON.parse(fs.readFileSync(file, "utf8")), report);
  return Object.assign({ base: scripts.context(report).base, frameworks, startedAt: new Date(started).toISOString(), finishedAt: new Date().toISOString() }, out);
}

module.exports = { RUNNABLE, prepare, execute, collect, triage, caseId, run };
