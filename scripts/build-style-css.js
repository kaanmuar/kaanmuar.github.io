#!/usr/bin/env node
/* style.css is Tailwind's build of input.css plus the classes it finds in the repo's files. It is built with the
   @tailwindcss/cli version in package-lock.json, so CI, which does not npm ci, builds the same bytes. Tailwind skips
   .gitignore'd files, so untracked files in a local checkout can add classes CI will not see.
   Run scripts/build-critical-css.js after a rebuild: the pages inline style.css. --check fails when style.css is stale. */
const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync } = require("child_process");

const root = path.join(__dirname, "..");
const target = path.join(root, "style.css");
const version = require(path.join(root, "package-lock.json")).packages["node_modules/@tailwindcss/cli"].version;
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "style-css-"));
const out = path.join(tmp, "style.css");

try {
  execFileSync("npx", ["-y", `@tailwindcss/cli@${version}`, "-i", "./input.css", "-o", out, "--minify"], {
    cwd: root,
    stdio: ["ignore", "ignore", "inherit"]
  });
  const want = fs.readFileSync(out, "utf8");
  const have = fs.existsSync(target) ? fs.readFileSync(target, "utf8") : "";
  if (process.argv.includes("--check")) {
    if (want !== have) {
      console.error("style.css is stale; run node scripts/build-style-css.js, then node scripts/build-critical-css.js");
      process.exitCode = 1;
    } else {
      console.log(`style.css matches input.css (Tailwind ${version})`);
    }
  } else if (want !== have) {
    fs.writeFileSync(target, want);
    console.log("Rebuilt style.css");
  } else {
    console.log("style.css already matches input.css");
  }
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}
