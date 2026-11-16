#!/usr/bin/env node
/* Checks the GitHub Pages artifact that scripts/build-pages.js wrote.

     node scripts/check-pages.js            # check _site/
     node scripts/check-pages.js dist       # check dist/

   Fails when the artifact holds a path the site must not publish, or when a local link in an HTML page, a CSS
   url(), a sitemap <loc> or a web manifest icon points at a file the artifact lacks. Links to carlosandmunoz.com
   count as local; other hosts, anchors, and mailto:/tel:/data:/javascript: are skipped. Query strings (cache
   busters) and fragments are ignored. /page serves page.html and /dir/ serves dir/index.html, as on Pages. */

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const OUT = path.resolve(ROOT, process.argv[2] || "_site");
const ORIGIN = "https://carlosandmunoz.com";
const MEDIA_CSV = ["calendar.csv", "plan.csv"];

const FORBIDDEN = [
  /^(functions|scripts|PubSap|designs|tests|desk-host|previews|samples|node_modules|android|cypress|\.github|\.cursor|\.idea)\//,
  /^[^/]+-results\//,
  /(^|\/)\.env/,
  /(^|\/)package(-lock)?\.json$/,
  /\.(py|sh|rb|java|robot|feature|jmx|rules|ya?ml)$/,
];

function walk(dir, base = "") {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const rel = base ? `${base}/${entry.name}` : entry.name;
    if (entry.isDirectory()) out.push(...walk(path.join(dir, entry.name), rel));
    else out.push(rel);
  }
  return out;
}

if (!fs.existsSync(OUT)) {
  console.error(`${OUT} does not exist; run scripts/build-pages.js first.`);
  process.exit(1);
}
const files = walk(OUT);
const have = new Set(files);
const problems = [];

for (const file of files) {
  if (FORBIDDEN.some((re) => re.test(file))) problems.push(`forbidden: ${file}`);
  if (file.endsWith(".csv") && !(file.startsWith("media/") && MEDIA_CSV.includes(path.basename(file)))) problems.push(`forbidden: ${file}`);
}
for (const must of ["index.html", "404.html", "CNAME", ".nojekyll", "robots.txt", "sitemap.xml"]) {
  if (!have.has(must)) problems.push(`missing: ${must}`);
}

function target(ref, from) {
  ref = ref.trim().replace(/&amp;/g, "&");
  if (!ref || ref.startsWith("#") || /[{}$<>`'+]/.test(ref)) return null;
  if (/^[a-z][a-z0-9+.-]*:|^\/\//i.test(ref)) {
    let url;
    try {
      url = new URL(ref, ORIGIN);
    } catch {
      return null;
    }
    if (url.origin !== ORIGIN) return null;
    ref = url.pathname;
  }
  ref = ref.split("#")[0].split("?")[0];
  if (!ref) return null;
  let rel;
  try {
    rel = decodeURIComponent(path.posix.normalize(ref.startsWith("/") ? ref.slice(1) : path.posix.join(path.posix.dirname(from), ref)));
    rel = rel.replace(/^(\.\.\/)+/, "");
  } catch {
    return null;
  }
  if (rel === "." || rel === "") return "index.html";
  if (rel.endsWith("/")) return `${rel}index.html`;
  return rel;
}

function resolves(rel) {
  return have.has(rel) || have.has(`${rel}.html`) || have.has(`${rel}/index.html`);
}

const ATTR = /\s(?:href|src|poster|data-src|action)\s*=\s*["']([^"']*)["']/gi;
const SRCSET = /\ssrcset\s*=\s*["']([^"']*)["']/gi;
const META = /<meta\s[^>]*(?:property|name)\s*=\s*["'](?:og:image|og:image:url|og:image:secure_url|og:video|og:video:url|og:video:secure_url|twitter:image|og:url)["'][^>]*>/gi;
const CONTENT = /\scontent\s*=\s*["']([^"']*)["']/i;
const CSS_URL = /url\(\s*["']?([^"')]+)["']?\s*\)/gi;
const LOC = /<(?:loc|image:loc|video:content_loc|video:thumbnail_loc)>([^<]+)</gi;

function refsOf(file, text) {
  const refs = [];
  if (file.endsWith(".html")) {
    const html = text.replace(/<script\b[^>]*>[\s\S]*?<\/script\b[^>]*>/gi, (tag) => tag.slice(0, tag.indexOf(">") + 1));
    for (const m of html.matchAll(ATTR)) refs.push(m[1]);
    for (const m of html.matchAll(SRCSET)) refs.push(...m[1].split(",").map((part) => part.trim().split(/\s+/)[0]));
    for (const m of html.matchAll(META)) {
      const content = m[0].match(CONTENT);
      if (content) refs.push(content[1]);
    }
    for (const m of html.matchAll(CSS_URL)) refs.push(m[1]);
  } else if (file.endsWith(".css")) {
    for (const m of text.matchAll(CSS_URL)) refs.push(m[1]);
  } else if (/^sitemap[^/]*\.xml$/.test(file)) {
    for (const m of text.matchAll(LOC)) refs.push(m[1]);
  } else if (file.endsWith(".webmanifest")) {
    const manifest = JSON.parse(text);
    refs.push(manifest.start_url, ...(manifest.icons || []).map((icon) => icon.src));
  }
  return refs;
}

let checked = 0;
for (const file of files) {
  if (!/\.(html|css|xml|webmanifest)$/.test(file)) continue;
  const text = fs.readFileSync(path.join(OUT, file), "utf8");
  for (const ref of refsOf(file, text)) {
    const rel = target(ref, file);
    if (rel === null) continue;
    checked += 1;
    if (!resolves(rel)) problems.push(`broken: ${file} -> ${ref}`);
  }
}

const unique = [...new Set(problems)];
if (unique.length) {
  console.error(unique.slice(0, 100).join("\n"));
  if (unique.length > 100) console.error(`... and ${unique.length - 100} more`);
  console.error(`${unique.length} problem(s) in ${path.relative(ROOT, OUT)}`);
  process.exit(1);
}
console.log(`${path.relative(ROOT, OUT)}: ${files.length} files, ${checked} local links resolve, no forbidden paths`);
