#!/usr/bin/env node
// Fails a PR that changes the web Jarvis without changing the Android app (#1447).
// Usage in CI: node scripts/check-jarvis-parity.js <base-sha> <head-sha>, with the PR body in PR_BODY.
"use strict";

const { execFileSync } = require("child_process");

const JARVIS = [/^js\/admin-jarvis[^/]*\.js$/, /^css\/admin-jarvis\.css$/, /^functions\/jarvis[^/]*\.js$/];
const OPT_OUT = /no app change:\s*\S/i;

function check(files, body) {
  const web = files.filter((f) => JARVIS.some((re) => re.test(f)));
  if (!web.length) return { ok: true, web };
  if (files.some((f) => f.startsWith("android/"))) return { ok: true, web };
  if (OPT_OUT.test(body || "")) return { ok: true, web, optOut: true };
  return { ok: false, web };
}

if (require.main === module) {
  const [base, head] = process.argv.slice(2);
  const files = execFileSync("git", ["diff", "--name-only", `${base}...${head}`], { encoding: "utf8" }).split("\n").filter(Boolean);
  const out = check(files, process.env.PR_BODY);
  if (out.ok) {
    console.log(out.web.length ? (out.optOut ? "Jarvis changed with 'no app change' in the PR body." : "Jarvis and android/ changed together.") : "No web Jarvis change.");
  } else {
    console.error(`This PR changes the web Jarvis (${out.web.join(", ")}) but not android/.\nMake the same change in the app, or add "no app change: <why>" to the PR body.`);
    process.exit(1);
  }
}

module.exports = { check };
