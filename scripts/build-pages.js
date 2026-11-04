#!/usr/bin/env node
/* The GitHub Pages artifact: the committed files the live site serves, and nothing else.

     node scripts/build-pages.js            # copy the allowlist into _site/
     node scripts/build-pages.js dist       # same, into dist/

   Only tracked files are copied (git ls-files), so a local build matches CI. Functions, scripts, tests, designs,
   test-framework folders and repo config stay out. In media/, the Buffer and alt-text CSVs are upload inputs,
   not pages; only calendar.csv (read by the admin social hub) and plan.csv (linked from a handoff page) ship. The JavaScript
   under js/ is then minified (scripts/minify-pages.js). Check the result with scripts/check-pages.js. */

const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");
const { minifyPages } = require("./minify-pages");
const csp = require("./build-csp-hashes");

const ROOT = path.join(__dirname, "..");
const OUT = path.resolve(ROOT, process.argv[2] || "_site");

const ROOT_FILES = [
  "CNAME",
  "robots.txt",
  "favicon.ico",
  "favicon.svg",
  "apple-touch-icon.png",
  "style.css",
  "jarvis-sw.js",
  "c1ab1d693aa44efeae5463b429a4813e.txt",
];
const ROOT_PATTERNS = [/^[^/]+\.html$/, /^[^/]+\.webmanifest$/, /^sitemap[^/]*\.xml$/, /^llms[^/]*\.txt$/];
const DIRS = [".well-known", "assets", "css", "js", "media", "social"];
const MEDIA_CSV = ["calendar.csv", "plan.csv"];

function wanted(file) {
  if (!file.includes("/")) return ROOT_FILES.includes(file) || ROOT_PATTERNS.some((re) => re.test(file));
  if (!DIRS.includes(file.split("/")[0])) return false;
  if (file.startsWith("media/") && file.endsWith(".csv")) return MEDIA_CSV.includes(path.basename(file));
  return true;
}

const files = execFileSync("git", ["ls-files", "-z"], { cwd: ROOT, encoding: "utf8", maxBuffer: 64 << 20 })
  .split("\0")
  .filter((file) => file && wanted(file) && fs.existsSync(path.join(ROOT, file)));

fs.rmSync(OUT, { recursive: true, force: true });
let bytes = 0;
for (const file of files) {
  const dest = path.join(OUT, file);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(path.join(ROOT, file), dest);
  bytes += fs.statSync(dest).size;
}
fs.writeFileSync(path.join(OUT, ".nojekyll"), "");

// A page committed with stale script hashes would have its inline scripts refused; CI flags it, the artifact is rehashed.
const rehashed = files.filter((file) => file.endsWith(".html")).filter((file) => {
  const dest = path.join(OUT, file);
  const html = fs.readFileSync(dest, "utf8");
  const next = csp.apply(html);
  if (next !== html) fs.writeFileSync(dest, next);
  return next !== html;
});
if (rehashed.length) console.warn(`CSP script hashes were stale in ${rehashed.join(", ")}; run node scripts/build-csp-hashes.js`);

console.log(`${path.relative(ROOT, OUT) || "."}: ${files.length} files, ${(bytes / 1048576).toFixed(1)} MB`);

const minified = minifyPages(OUT);
console.log(`js/: ${minified.files} files minified, ${(minified.before / 1024).toFixed(0)} KB to ${(minified.after / 1024).toFixed(0)} KB`);
