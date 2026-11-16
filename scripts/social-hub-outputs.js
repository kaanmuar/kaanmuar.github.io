#!/usr/bin/env node
/* The files scripts/build-social-hub.js writes, which pull requests leave to the bots (#2242).

     git diff --name-only HEAD^1 HEAD | node scripts/social-hub-outputs.js --guard   # CI: exit 1 if one is listed
     node scripts/social-hub-outputs.js --restore                                    # put main's copies back on a branch

   The ledger commits (scripts/commit-social-ledgers.sh) and the regen commits (scripts/regen-generated.sh) rebuild
   them on main many times a day, so a pull request that commits them conflicts with main within minutes. A PR changes
   the sources and the builder only: CI and the Pages build rebuild the hub from them, and after the merge
   regen-generated.yml commits the rebuild to main. */

const { execFileSync } = require("child_process");

const OUTPUTS = [
  /^sitemap-social\.xml$/,
  /^qa-review-social(-[a-z]{2})?\.html$/,
  /^social\/.+\.html$/,
  /^assets\/social\/(feed|captions)(-[a-z]{2})?\.json$/,
  /^assets\/social\/rss(-[a-z]{2})?\.xml$/,
  /^assets\/social\/thumbs\/[^/]+\.webp$/
];

const isOutput = (file) => OUTPUTS.some((re) => re.test(file));

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
    process.exitCode = guard(require("fs").readFileSync(0, "utf8").split("\n").map((line) => line.trim()).filter(Boolean));
  } else if (args.includes("--restore")) {
    restore();
  } else {
    console.error("Usage: node scripts/social-hub-outputs.js --guard < files | --restore");
    process.exitCode = 2;
  }
}

module.exports = { OUTPUTS, isOutput, guard };
