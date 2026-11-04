#!/usr/bin/env node
/* style.css is Tailwind's build of input.css plus the classes it finds in the repo's files. It is built with the
   tailwindcss version in package-lock.json, so CI, which does not npm ci, builds the same bytes. Tailwind skips
   .gitignore'd files, so untracked files in a local checkout can add classes CI will not see.
   Run scripts/build-critical-css.js after a rebuild: the pages inline style.css. --check fails when style.css is stale. */
const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync } = require("child_process");

const root = path.join(__dirname, "..");
const target = path.join(root, "style.css");
const lock = require(path.join(root, "package-lock.json")).packages;
const version = lock["node_modules/tailwindcss"].version;
const cliVersion = lock["node_modules/@tailwindcss/cli"].version;
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "style-css-"));
const out = path.join(tmp, "style.css");
// @source paths and the scan for classes are relative to the stylesheet, so a rewritten input sits next to input.css.
const shim = path.join(root, `.input-${process.pid}.css`);

function installed() {
  try {
    return require(require.resolve("tailwindcss/package.json", { paths: [root] })).version === version;
  } catch (error) {
    return false;
  }
}

// On a bare runner `@import "tailwindcss"` resolves nowhere, so the locked packages go to a temp prefix.
function tailwind() {
  if (installed()) return { bin: "npx", args: ["-y", `@tailwindcss/cli@${cliVersion}`], input: "./input.css" };
  const prefix = path.join(tmp, "deps");
  execFileSync("npm", ["install", "-s", "--no-save", "--prefix", prefix, `tailwindcss@${version}`, `@tailwindcss/cli@${cliVersion}`], {
    stdio: ["ignore", "ignore", "inherit"]
  });
  const css = path.join(prefix, "node_modules/tailwindcss/index.css");
  fs.writeFileSync(shim, fs.readFileSync(path.join(root, "input.css"), "utf8").replace('@import "tailwindcss";', `@import ${JSON.stringify(css)};`));
  return { bin: path.join(prefix, "node_modules/.bin/tailwindcss"), args: [], input: shim };
}

try {
  const { bin, args, input } = tailwind();
  execFileSync(bin, [...args, "-i", input, "-o", out, "--minify"], { cwd: root, stdio: ["ignore", "ignore", "inherit"] });
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
  fs.rmSync(shim, { force: true });
  fs.rmSync(tmp, { recursive: true, force: true });
}
