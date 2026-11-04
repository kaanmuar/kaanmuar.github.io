#!/usr/bin/env node
/* The files scripts/build-social-hub.js writes, which pull requests leave to the bots (#2242).

     git diff --name-only HEAD^1 HEAD | node scripts/social-hub-outputs.js --guard   # CI: exit 1 if one is listed
     node scripts/social-hub-outputs.js --restore                                    # put main's copies back on a branch
     node scripts/social-hub-outputs.js --discard                                    # drop uncommitted hub files before a commit

   The ledger commits (scripts/commit-social-ledgers.sh) and the regen commits (scripts/regen-generated.sh) rebuild
   them on main many times a day, so a pull request that commits them conflicts with main within minutes. A PR changes
   the sources and the builder only: CI and the Pages build rebuild the hub from them, and after the merge
   regen-generated.yml commits the rebuild to main. */

const { execFileSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const OUTPUTS = [
  /^sitemap-social\.xml$/,
  /^qa-review-social(-[a-z]{2})?\.html$/,
  /^social\/.+\.html$/,
  /^assets\/social\/(feed|captions)(-[a-z]{2})?\.json$/,
  /^assets\/social\/rss(-[a-z]{2})?\.xml$/,
  /^assets\/social\/thumbs\/[^/]+\.webp$/
];

const isOutput = (file) => OUTPUTS.some((re) => re.test(file));

/** Files a branch may commit. Generated hub files are left for the bots (#2242). */
const keep = (files) => (files || []).filter((file) => !isOutput(file));

function git(cwd, args) {
  return execFileSync("git", args, { cwd, encoding: "utf8" });
}

/** Porcelain records for the worktree. A rename's new path is the file that would be committed. */
function statusRecords(cwd) {
  const parts = git(cwd, ["status", "--porcelain", "-z", "--untracked-files=all"]).split("\0");
  const records = [];
  for (let i = 0; i < parts.length; i++) {
    const rec = parts[i];
    if (!rec) continue;
    const xy = rec.slice(0, 2);
    let file = rec.slice(3);
    if (xy[0] === "R" || xy[0] === "C") file = parts[++i];
    records.push({ xy, file });
  }
  return records;
}

/* Put generated hub files back to HEAD and delete ones the builder added. The PageSpeed job rebuilds the hub
   so Lighthouse scores the rebuilt pages, then commits the branch: committing those files makes the PR conflict
   with main, and GitHub then does not run pull_request CI, so url-review-unit never passes (#2242). */
function discard(cwd = process.cwd()) {
  const hub = statusRecords(cwd).filter((record) => isOutput(record.file));
  const restore = hub.filter((record) => record.xy !== "??" && record.xy[0] !== "A").map((record) => record.file);
  const remove = hub.filter((record) => record.xy === "??" || record.xy[0] === "A").map((record) => record.file);
  if (restore.length) git(cwd, ["restore", "--source=HEAD", "--worktree", "--staged", "--", ...restore]);
  if (remove.length) {
    git(cwd, ["rm", "-q", "--cached", "--ignore-unmatch", "--", ...remove]);
    remove.forEach((file) => fs.rmSync(path.join(cwd, file), { force: true }));
  }
  console.log("Discarded " + hub.length + " generated social hub file" + (hub.length === 1 ? "" : "s") + "; the bots rebuild them on main (#2242).");
  return hub.length;
}

function guard(files) {
  const found = files.filter(isOutput);
  if (!found.length) {
    console.log("No generated social hub files in this change.");
    return 0;
  }
  console.error("This pull request commits " + found.length + " generated social hub file" + (found.length === 1 ? "" : "s") + ":\n" +
    found.slice(0, 20).map((file) => "  " + file).join("\n") + (found.length > 20 ? "\n  ..." : "") +
    "\nThe bots rebuild them on main after the merge, so committing them makes the PR conflict with main (#2242)." +
    "\nPut main's copies back with: node scripts/social-hub-outputs.js --restore");
  return 1;
}

function restore() {
  const git = (...args) => execFileSync("git", args, { encoding: "utf8" });
  git("fetch", "-q", "origin", "main");
  const changed = git("diff", "--name-only", "--no-renames", "origin/main...HEAD").split("\n").filter(isOutput);
  if (!changed.length) return console.log("No generated social hub files differ from main.");
  const onMain = new Set(git("ls-tree", "-r", "--name-only", "origin/main", "--", ...new Set(changed.map((file) => file.split("/")[0]))).split("\n"));
  const back = changed.filter((file) => onMain.has(file));
  const added = changed.filter((file) => !onMain.has(file));
  if (back.length) git("restore", "--source=origin/main", "--staged", "--worktree", "--", ...back);
  if (added.length) git("rm", "-q", "--cached", "--ignore-unmatch", "--", ...added);
  console.log("Restored " + back.length + " and untracked " + added.length + " generated hub files; commit the result.");
}

if (require.main === module) {
  const args = process.argv.slice(2);
  if (args.includes("--guard")) {
    process.exitCode = guard(fs.readFileSync(0, "utf8").split("\n").map((line) => line.trim()).filter(Boolean));
  } else if (args.includes("--restore")) {
    restore();
  } else if (args.includes("--discard")) {
    discard();
  } else {
    console.error("Usage: node scripts/social-hub-outputs.js --guard < files | --restore | --discard");
    process.exitCode = 2;
  }
}

module.exports = { OUTPUTS, isOutput, keep, guard, discard };
