#!/usr/bin/env node
/* The GitHub Pages artifact: the committed files the live site serves, plus hub files the Pages rebuild just wrote.

     node scripts/build-pages.js            # copy the allowlist into _site/
     node scripts/build-pages.js dist       # same, into dist/

   Tracked files come from git ls-files, so a local build matches CI. Functions, scripts, tests, designs,
   test-framework folders and repo config stay out. In media/, the Buffer and alt-text CSVs are upload inputs,
   not pages; only calendar.csv (read by the admin social hub) and plan.csv (linked from a handoff page) ship.
   The Pages workflow rebuilds the social hub first (#2242). A pull request does not commit that output, so a
   new language page (a Spanish pick the phrasebook now covers) exists only in the worktree while tracked pages
   already link to it. Those hub outputs are copied from disk as well, or the link check fails. The JavaScript
   under js/ is then minified (scripts/minify-pages.js). Check the result with scripts/check-pages.js. */

const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");
const { minifyPages } = require("./minify-pages");
const csp = require("./build-csp-hashes");
const { isOutput } = require("./social-hub-outputs");

const ROOT = path.join(__dirname, "..");

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

function walk(dir, base) {
  if (!fs.existsSync(dir)) return [];
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const rel = base ? `${base}/${entry.name}` : entry.name;
    if (entry.isDirectory()) out.push(...walk(path.join(dir, entry.name), rel));
    else if (entry.isFile()) out.push(rel);
  }
  return out;
}

// Tracked allowlist, plus hub files the rebuild wrote that a pull request leaves uncommitted (#2242).
function listPublished(root = ROOT) {
  const tracked = execFileSync("git", ["ls-files", "-z"], { cwd: root, encoding: "utf8", maxBuffer: 64 << 20 })
    .split("\0")
    .filter((file) => file && wanted(file) && fs.existsSync(path.join(root, file)));
  const seen = new Set(tracked);
  const extras = [];
  const add = (file) => {
    if (!file || seen.has(file) || !wanted(file) || !isOutput(file) || !fs.existsSync(path.join(root, file))) return;
    seen.add(file);
    extras.push(file);
  };
  for (const dir of ["social", "assets/social"]) {
    for (const file of walk(path.join(root, dir), dir)) add(file);
  }
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    if (entry.isFile()) add(entry.name);
  }
  return tracked.concat(extras);
}

function build(out) {
  const files = listPublished(ROOT);
  fs.rmSync(out, { recursive: true, force: true });
  let bytes = 0;
  for (const file of files) {
    const dest = path.join(out, file);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(path.join(ROOT, file), dest);
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

  console.log(`${path.relative(ROOT, out) || "."}: ${files.length} files, ${(bytes / 1048576).toFixed(1)} MB`);

  const minified = minifyPages(out);
  console.log(`js/: ${minified.files} files minified, ${(minified.before / 1024).toFixed(0)} KB to ${(minified.after / 1024).toFixed(0)} KB`);
}

if (require.main === module) build(path.resolve(ROOT, process.argv[2] || "_site"));

module.exports = { wanted, listPublished };
