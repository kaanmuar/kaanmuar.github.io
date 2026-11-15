#!/usr/bin/env node
// What the cloud daily fix (#2419, .github/workflows/fix-review-failures.yml) needs from the Mac, done whenever the Mac is awake.
// The pre-flight hook starts it in the background at most once an hour.
//   1. Uploads the Cursor Quota app's plan (planPct, cycleEnd, at, and odEnabled and odRemaining in cents for runs past 70%, #2481;
//      nothing else) to the repo variable CURSOR_QUOTA_CACHE: the run holds the agent back when that copy is missing or more than two days old.
//   2. Appends the work-log rows of the runs it has not seen (artifact fix-review-work-log) to work-log.csv.
//   node scripts/fix-review-failures-sync.js
const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync } = require("child_process");
const cursorPlan = require("./cursor-plan");
const { USAGE } = require("./fix-review-failures");

const ROOT = path.resolve(__dirname, "..");
const R = "repos/kaanmuar/kaanmuar.github.io";
const VAR = "CURSOR_QUOTA_CACHE";
const ARTIFACT = "fix-review-work-log";
const STATE = path.join(process.env.PREFLIGHT_STATE || path.join(os.homedir(), ".cursor", "preflight"), "fix-review-sync.json");

const gh = (args, opts) => execFileSync("gh", args, Object.assign({ cwd: ROOT, encoding: "utf8", timeout: 30000, stdio: ["ignore", "pipe", "pipe"] }, opts));
const quotaPayload = (cache) => cache && JSON.stringify({ planPct: cache.planPct, cycleEnd: cache.cycleEnd, at: cache.at, odEnabled: cache.odEnabled, odRemaining: cache.odRemaining });

function uploadQuota() {
  const value = quotaPayload(cursorPlan.readCache());
  if (!value) return "no Cursor Quota cache";
  try {
    gh(["api", "-X", "PATCH", R + "/actions/variables/" + VAR, "-f", "name=" + VAR, "-f", "value=" + value, "--silent"]);
  } catch (error) {
    gh(["api", R + "/actions/variables", "-f", "name=" + VAR, "-f", "value=" + value, "--silent"]);
  }
  return "plan uploaded";
}

function importRows(state) {
  state.imported = (state.imported || []).slice(-200);
  const artifacts = JSON.parse(gh(["api", R + "/actions/artifacts?name=" + ARTIFACT + "&per_page=50"])).artifacts
    .filter((row) => !row.expired && !state.imported.includes(row.id))
    .sort((a, b) => a.created_at.localeCompare(b.created_at));
  let rows = 0;
  for (const artifact of artifacts) {
    const zip = path.join(os.tmpdir(), ARTIFACT + "-" + artifact.id + ".zip");
    fs.writeFileSync(zip, gh(["api", R + "/actions/artifacts/" + artifact.id + "/zip"], { encoding: "buffer", maxBuffer: 16 << 20 }));
    const csv = execFileSync("unzip", ["-p", zip, "work-log.csv"], { encoding: "utf8" });
    fs.rmSync(zip, { force: true });
    if (csv.trim()) fs.appendFileSync(path.join(USAGE, "work-log.csv"), csv.endsWith("\n") ? csv : csv + "\n");
    rows += csv.split("\n").filter(Boolean).length;
    state.imported.push(artifact.id);
  }
  return rows + " work-log rows imported";
}

function main() {
  let state = {};
  try { state = JSON.parse(fs.readFileSync(STATE, "utf8")); } catch (error) {}
  const notes = [];
  for (const step of [uploadQuota, () => importRows(state)]) {
    try { notes.push(step()); } catch (error) { notes.push(String(error.stderr || error.message).trim().split("\n")[0]); }
  }
  state.at = new Date().toISOString();
  fs.writeFileSync(STATE, JSON.stringify(state));
  console.log(notes.join("; "));
}

if (require.main === module) main();
module.exports = { quotaPayload };
