/**
 * Keeps each page's script-src free of 'unsafe-inline': the <meta> Content-Security-Policy lists a 'sha256-...' for
 * every inline script the page runs, so a changed inline script needs this builder run again or the browser refuses it.
 * Inline event handlers (onclick=, onload=) and javascript: URLs cannot be allowed by a hash; use addEventListener.
 * build-social-hub.js and build-review-langs.py apply the same rewrite to the pages they write.
 *
 *   node scripts/build-csp-hashes.js          rewrites the pages
 *   node scripts/build-csp-hashes.js --check  exits 1 when a page's hashes no longer match its inline scripts
 */
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const META = /(<meta\s+http-equiv="Content-Security-Policy"\s+content=")([^"]*)(")/i;
const DATA_TYPES = /^(application\/(ld\+)?json|text\/(plain|template|html|x-template))$/i;
// Google Translate's element.js runs this inline script in a srcdoc iframe, which inherits the page's CSP. When Google
// changes it, tests/csp.spec.js fails with the new hash from Chrome's console message; update it here and in csp_hashes.py.
const TRANSLATE = { host: "https://translate.google.com", hashes: ["'sha256-R6kjt5FwTd5vAw94Q08NLDZsSaGTzg4NsdIfKtECSp0='"] };

/** The text of each inline script the browser would run, in document order (comments are skipped). */
function inlineScripts(html) {
  const out = [];
  const tag = /<!--|<script\b([^>]*)>/gi;
  let m;
  while ((m = tag.exec(html))) {
    if (m[0] === "<!--") {
      const end = html.indexOf("-->", m.index + 4);
      if (end === -1) break;
      tag.lastIndex = end + 3;
      continue;
    }
    const close = html.slice(tag.lastIndex).search(/<\/script[\s/>]/i);
    if (close === -1) break;
    const body = html.slice(tag.lastIndex, tag.lastIndex + close);
    tag.lastIndex += close;
    const attrs = m[1];
    if (/\ssrc\s*=/i.test(" " + attrs)) continue;
    const type = (attrs.match(/\stype\s*=\s*["']?([^"'\s>]+)/i) || [])[1];
    if (type && DATA_TYPES.test(type)) continue;
    out.push(body);
  }
  return out;
}

function hash(body) {
  return "'sha256-" + crypto.createHash("sha256").update(body.replace(/\r\n?/g, "\n"), "utf8").digest("base64") + "'";
}

/** Returns the page with script-src listing its inline scripts' hashes in place of 'unsafe-inline'. */
function apply(html) {
  const meta = html.match(META);
  if (!meta) return html;
  const hashes = [...new Set(inlineScripts(html).map(hash))];
  const policy = meta[2].split(";").map((part) => {
    const tokens = part.trim().split(/\s+/);
    if (tokens[0] !== "script-src") return part;
    const kept = tokens.filter((token) => token !== "'unsafe-inline'" && !/^'sha(256|384|512)-/.test(token));
    const extra = kept.includes(TRANSLATE.host) ? TRANSLATE.hashes.filter((h) => !hashes.includes(h)) : [];
    return (part.match(/^\s*/)[0]) + kept.concat(hashes, extra).join(" ");
  }).join(";");
  return html.replace(META, (all, open, _, close) => open + policy + close);
}

function pages() {
  const out = fs.readdirSync(ROOT).filter((name) => name.endsWith(".html"));
  const walk = (dir) => {
    for (const entry of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
      const rel = path.posix.join(dir, entry.name);
      if (entry.isDirectory()) walk(rel);
      else if (entry.name.endsWith(".html")) out.push(rel);
    }
  };
  if (fs.existsSync(path.join(ROOT, "social"))) walk("social");
  return out;
}

function main() {
  const check = process.argv.includes("--check");
  const stale = [];
  const list = pages();
  for (const page of list) {
    const file = path.join(ROOT, page);
    const html = fs.readFileSync(file, "utf8");
    const next = apply(html);
    if (next === html) continue;
    stale.push(page);
    if (!check) fs.writeFileSync(file, next);
  }
  if (check && stale.length) {
    console.error("Inline script hashes in the Content-Security-Policy are stale; run node scripts/build-csp-hashes.js\n" + stale.join("\n"));
    process.exit(1);
  }
  console.log(check ? `CSP script hashes match their inline scripts (${list.length} pages)` : `CSP script hashes: rewrote ${stale.length} of ${list.length} pages`);
}

module.exports = { apply, inlineScripts, hash, TRANSLATE };

if (require.main === module) main();
