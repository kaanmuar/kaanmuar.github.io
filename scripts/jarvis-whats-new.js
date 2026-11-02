#!/usr/bin/env node
// What's new in a Jarvis app release (#2169): the titles of the PRs merged into android/ since the last
// jarvis-android-v* tag, as short lines. CI bakes them into the APK, which shows them once after the update,
// and puts them in the GitHub release.
//   node scripts/jarvis-whats-new.js [ref]    prints one line per change; nothing when there is no earlier release
const { execFileSync } = require("node:child_process");

const MAX = 6;
// Merges and pipeline-only changes mean nothing to someone using the app.
const SKIP = /^(merge|revert|ci|tests?|docs?|chore|deps|build|lint|refactor)\b|\bworkflows?\b/i;
const REFS = /\s*\((?:[\w.-]+\/[\w.-]+)?#\d+\)\s*$/;
const AREA = /^(?:jarvis|admin|apps?|android|mac|windows|be|fe)(?: v?[\d.]+)?:\s*/i;

function line(subject) {
  let s = subject.trim();
  while (REFS.test(s)) s = s.replace(REFS, "");
  s = s.replace(AREA, "").trim();
  return s && s[0].toUpperCase() + s.slice(1);
}

/** Commit subjects, newest first, to at most MAX lines; the rest fold into one. */
function notes(subjects, max = MAX) {
  const out = [...new Set(subjects.filter((s) => s && !SKIP.test(s.trim())).map(line).filter(Boolean))];
  if (out.length <= max) return out;
  const more = out.length - (max - 1);
  return [...out.slice(0, max - 1), `And ${more} smaller change${more === 1 ? "" : "s"}.`];
}

function git(...args) {
  return execFileSync("git", args, { encoding: "utf8" }).trim();
}

if (require.main === module) {
  const ref = process.argv[2] || "HEAD";
  const prev = git("tag", "-l", "jarvis-android-v*", "--sort=-v:refname", "--merged", ref, "--no-contains", ref).split("\n").filter(Boolean)[0];
  if (prev) {
    const subjects = git("log", "--no-merges", "--format=%s", `${prev}..${ref}`, "--", "android").split("\n");
    for (const l of notes(subjects)) console.log(l);
  }
}

module.exports = { line, notes };
