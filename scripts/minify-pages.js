#!/usr/bin/env node
/* Minifies the JavaScript of a built Pages artifact in place, so the repo keeps readable sources.

     node scripts/minify-pages.js _site

   Every file under <dir>/js is minified on its own with esbuild, without bundling: top-level names stay global for the
   classic scripts and module scripts keep their imports. Non-ASCII stays UTF-8, because \u escapes would make the
   translated copy files larger. A file esbuild cannot parse fails the build. */

const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const ESBUILD = "esbuild@0.28.2";

function minifyPages(dir) {
  const js = path.join(dir, "js");
  const files = [];
  (function walk(at) {
    for (const entry of fs.readdirSync(at, { withFileTypes: true })) {
      const file = path.join(at, entry.name);
      if (entry.isDirectory()) walk(file);
      else if (/\.m?js$/.test(entry.name) && !/\.min\.m?js$/.test(entry.name)) files.push(file);
    }
  })(js);
  if (!files.length) return { files: 0, before: 0, after: 0 };
  const size = () => files.reduce((sum, file) => sum + fs.statSync(file).size, 0);
  const before = size();
  execFileSync(
    "npx",
    ["--yes", ESBUILD, ...files, "--minify", "--charset=utf8", "--log-level=warning", `--outbase=${js}`, `--outdir=${js}`, "--allow-overwrite"],
    { stdio: "inherit" }
  );
  return { files: files.length, before, after: size() };
}

module.exports = { minifyPages };

if (require.main === module) {
  const dir = path.resolve(process.argv[2] || "_site");
  const { files, before, after } = minifyPages(dir);
  console.log(`${path.relative(process.cwd(), dir) || "."}/js: ${files} files minified, ${(before / 1024).toFixed(0)} KB to ${(after / 1024).toFixed(0)} KB`);
}
