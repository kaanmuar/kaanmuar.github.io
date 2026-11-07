#!/usr/bin/env node
/* The GitHub Pages artifact: the files the live site serves.

     node scripts/build-pages.js            # copy the allowlist into _site/
     node scripts/build-pages.js dist       # same, into dist/

   Tracked files are copied (git ls-files), plus social hub outputs the rebuild wrote that a pull request has not
   committed yet (#2242). Pages rebuilds the hub before this script, so those new pages have to be in the artifact or
   the link check fails on them. Functions, scripts, tests, designs, test-framework folders and repo config stay out.
   In media/, the Buffer and alt-text CSVs are upload inputs, not pages; only calendar.csv (read by the admin social
   hub) and plan.csv (linked from a handoff page) ship. The JavaScript under js/ is then minified
   (scripts/minify-pages.js). Check the result with scripts/check-pages.js. */

const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");
const { minifyPages } = require("./minify-pages");
const csp = require("./build-csp-hashes");
const { isOutput } = require("./social-hub-outputs");

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

// Hub outputs present on disk and not in git. A pull request leaves them untracked; the Pages job has just rebuilt them.
function extraHubFiles(root, tracked) {
  const have = new Set(tracked);
  const found = [];
  const add = (rel) => {
    if (have.has(rel) || !isOutput(rel) || !wanted(rel)) return;
    found.push(rel);
  };
  const walk = (abs, base) => {
    for (const entry of fs.readdirSync(abs, { withFileTypes: true })) {
      const rel = base + "/" + entry.name;
      if (entry.isDirectory()) walk(path.join(abs, entry.name), rel);
      else if (entry.isFile()) add(rel);
    }
  };
  for (const top of ["social", "assets/social"]) {
    const abs = path.join(root, top);
    if (fs.existsSync(abs)) walk(abs, top);
  }
  if (fs.existsSync(root)) {
    for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
      if (entry.isFile()) add(entry.name);
    }
  }
  return found.sort();
}

function pageFiles(root) {
  const tracked = execFileSync("git", ["ls-files", "-z"], { cwd: root, encoding: "utf8", maxBuffer: 64 << 20 })
    .split("\0")
    .filter((file) => file && wanted(file) && fs.existsSync(path.join(root, file)));
  return tracked.concat(extraHubFiles(root, tracked));
}

function build(root, out) {
  const files = pageFiles(root);
  fs.rmSync(out, { recursive: true, force: true });
  let bytes = 0;
  for (const file of files) {
    const dest = path.join(out, file);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(path.join(root, file), dest);
    bytes += fs.statSync(dest).size;
  }
  fs.writeFileSync(path.join(out, ".nojekyll"), "");

  // A page committed with stale script hashes would have its inline scripts refused; CI flags it, the artifact is rehashed.
  const rehashed = files.filter((file) => file.endsWith(".html")).filter((file) => {
    const dest = path.join(out, file);
    const html = fs.readFileSync(dest, "utf8");
    const next = csp.apply(html);
    if (next !== html) fs.writeFileSync(dest, next);
    return next !== html;
  });
  if (rehashed.length) console.warn(`CSP script hashes were stale in ${rehashed.join(", ")}; run node scripts/build-csp-hashes.js`);

  console.log(`${path.relative(root, out) || "."}: ${files.length} files, ${(bytes / 1048576).toFixed(1)} MB`);
  const minified = minifyPages(out);
  console.log(`js/: ${minified.files} files minified, ${(minified.before / 1024).toFixed(0)} KB to ${(minified.after / 1024).toFixed(0)} KB`);
}

if (require.main === module) build(ROOT, OUT);

module.exports = { extraHubFiles, wanted, pageFiles };
