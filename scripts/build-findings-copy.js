#!/usr/bin/env node
/* functions/ deploys on its own, so the hand-written finding copy the review pages use (js/qa-review-findings-copy.js)
   is copied to functions/url-review-findings-copy.js for the report emails and the PDF. --check fails when the copy is stale. */
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const source = path.join(root, "js/qa-review-findings-copy.js");
const target = path.join(root, "functions/url-review-findings-copy.js");
const want = fs.readFileSync(source, "utf8");
const have = fs.existsSync(target) ? fs.readFileSync(target, "utf8") : "";

if (process.argv.includes("--check")) {
  if (want !== have) {
    console.error("functions/url-review-findings-copy.js is stale; run node scripts/build-findings-copy.js");
    process.exit(1);
  }
  console.log("functions/url-review-findings-copy.js matches js/qa-review-findings-copy.js");
} else if (want !== have) {
  fs.writeFileSync(target, want);
  console.log("Wrote functions/url-review-findings-copy.js");
} else {
  console.log("functions/url-review-findings-copy.js is current");
}
