#!/usr/bin/env node
/* functions/ deploys on its own, so the Jarvis rules the admin page runs (js/admin-jarvis-core.js) are copied
   to functions/jarvis-core.js for the daily briefing and the hourly watch. --check fails when the copy is stale. */
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const source = path.join(root, "js/admin-jarvis-core.js");
const target = path.join(root, "functions/jarvis-core.js");
const want = fs.readFileSync(source, "utf8");
const have = fs.existsSync(target) ? fs.readFileSync(target, "utf8") : "";

if (process.argv.includes("--check")) {
  if (want !== have) {
    console.error("functions/jarvis-core.js is stale; run node scripts/build-jarvis-core.js");
    process.exit(1);
  }
  console.log("functions/jarvis-core.js matches js/admin-jarvis-core.js");
} else if (want !== have) {
  fs.writeFileSync(target, want);
  console.log("Wrote functions/jarvis-core.js");
} else {
  console.log("functions/jarvis-core.js is current");
}
