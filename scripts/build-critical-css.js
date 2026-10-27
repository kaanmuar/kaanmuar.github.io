/**
 * Inlines each page's critical CSS and loads its stylesheets without blocking the first paint (#1028).
 * A rule is critical when one of its selectors matches the page's own HTML; hover, focus and other states, and the
 * theme and look classes the head scripts put on <html>, are left out of the match. Each local stylesheet in <head>
 * becomes <style data-critical> + <link rel="preload"> + <link media="print" data-async-css> + <noscript><link>; remote
 * ones (Google Fonts) get the last three, and js/async-css.js switches each to all media once it has loaded (an onload
 * attribute would need 'unsafe-inline' in script-src). Preload fetches at high priority, so the full CSS usually lands
 * before the deferred scripts paint what the static HTML does not have. The builder first undoes its own output, so
 * the page keeps one plain <link> per stylesheet as its source.
 * The review language pages copy qa-review.html's head; build-social-hub.js calls inline() on the hub pages.
 *
 *   node scripts/build-critical-css.js          rewrites the pages
 *   node scripts/build-critical-css.js --check  exits 1 when a page no longer matches its CSS
 *   node scripts/build-critical-css.js --deps   prints the packages CI installs to run it
 */
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const DEPS = ["postcss", "css-select", "css-what", "htmlparser2"];
const PAGES = [
  "index.html", "404.html", "accessibility.html", "admin.html", "qa-lab.html", "simulador.html",
  "qa-review.html", "qa-review-pay.html", "qa-review-account.html", "qa-review-guide.html", "qa-review-legal.html"
];
const ASYNC_JS = "js/async-css.js";
const STATE_PSEUDOS = new Set([
  "hover", "focus", "focus-visible", "focus-within", "active", "visited", "link", "any-link", "target", "checked",
  "indeterminate", "disabled", "enabled", "invalid", "valid", "required", "optional", "placeholder-shown", "autofill",
  "user-invalid", "user-valid", "open", "closed", "popover-open", "modal", "fullscreen", "defined", "playing", "paused",
  "read-only", "read-write", "in-range", "out-of-range", "default", "before", "after", "first-line", "first-letter"
]);
const STATE_CLASSES = new Set(["dark-mode", "is-visible"]);

function undo(html) {
  return html
    .replace(/[ \t]*<style data-critical="[^"]*">[\s\S]*?<\/style>\r?\n?/g, "")
    .replace(/[ \t]*<script src="[^"]*async-css\.js[^"]*" async><\/script>\r?\n?/g, "")
    .replace(/<link rel="preload" href="[^"]*"[^>]*? as="style">\s*<link\b[^>]*\sdata-async-css>\s*<noscript>(<link\b[^>]*>)<\/noscript>/g, "$1")
    .replace(/<link\b[^>]*?\s(?:media="print" onload="this\.media='all'"|as="style" onload="this\.onload=null;this\.rel='stylesheet'")[^>]*>\s*<noscript>(<link\b[^>]*>)<\/noscript>/g, "$1");
}

/** The async-css.js URL as the page refers to its scripts, with a content hash so a change reaches cached pages. */
function asyncScript(head, page) {
  const version = require("crypto").createHash("sha256").update(fs.readFileSync(path.join(ROOT, ASYNC_JS))).digest("hex").slice(0, 10);
  const src = /\ssrc="\/js\//.test(head) || path.dirname(page) !== "." ? "/" + ASYNC_JS : ASYNC_JS;
  return `<script src="${src}?v=${version}" async></script>`;
}

function deps() {
  return { postcss: require("postcss"), cssSelect: require("css-select"), cssWhat: require("css-what"), htmlparser2: require("htmlparser2") };
}

function stateFree(tokens) {
  const out = [];
  let compound = [];
  const flush = () => {
    const pageRoot = compound.some((t) => (t.type === "tag" && (t.name === "html" || t.name === "body")) || (t.type === "pseudo" && t.name === "root"));
    const kept = compound.filter((t) => !(pageRoot && t.type === "attribute"));
    out.push(...(kept.length ? kept : [{ type: "universal", namespace: null }]));
    compound = [];
  };
  for (const token of tokens) {
    if (["descendant", "child", "sibling", "adjacent", "parent", "column"].includes(token.type)) {
      flush();
      out.push(token);
      continue;
    }
    if (token.type === "pseudo-element") continue;
    if (token.type === "pseudo" && (STATE_PSEUDOS.has(token.name) || token.name.startsWith("-"))) continue;
    if (token.type === "attribute" && token.name === "class" && STATE_CLASSES.has(token.value)) continue;
    if (token.type === "attribute" && token.name.startsWith("data-look")) continue;
    if (token.type === "pseudo" && Array.isArray(token.data)) {
      const inner = token.data.map(stateFree).filter((part) => !part.every((t) => t.type === "universal"));
      if (!inner.length) continue;
      compound.push({ ...token, data: inner });
      continue;
    }
    compound.push(token);
  }
  flush();
  return out;
}

function matcher(html, lib) {
  const dom = lib.htmlparser2.parseDocument(html);
  const seen = new Map();
  return (selector) => {
    if (seen.has(selector)) return seen.get(selector);
    let hit = true;
    try {
      const parsed = lib.cssWhat.parse(selector).map(stateFree);
      hit = !!lib.cssSelect.selectOne(lib.cssWhat.stringify(parsed), dom);
    } catch (error) {
      hit = true;
    }
    seen.set(selector, hit);
    return hit;
  };
}

function animations(root) {
  const names = new Set();
  root.walkDecls(/^(-webkit-)?animation(-name)?$/, (decl) => {
    decl.value.split(/[\s,]+/).forEach((word) => names.add(word));
  });
  return names;
}

function compact(root) {
  root.walk((node) => {
    if (node.type === "comment") return node.remove();
    if (node.type === "decl") {
      node.raws.before = "";
      node.raws.between = ":";
      node.value = node.value.replace(/\s*\n\s*/g, " ");
      if (node.important) node.raws.important = "!important";
    } else if (node.type === "rule") {
      node.selector = node.selectors.map((s) => s.replace(/\s+/g, " ").trim()).join(",");
      Object.assign(node.raws, { before: "", between: "", after: "", semicolon: false });
    } else if (node.type === "atrule") {
      node.params = node.params.replace(/\s+/g, " ").trim();
      Object.assign(node.raws, { before: "", between: "", after: "", afterName: node.params ? " " : "", semicolon: false });
    }
  });
  root.raws.after = "";
  return root.toString();
}

function critical(css, matches, lib) {
  const root = lib.postcss.parse(css);
  root.walkRules((rule) => {
    if (rule.parent.type === "atrule" && /keyframes$/i.test(rule.parent.name)) return;
    const kept = rule.selectors.filter((selector) => matches(selector));
    if (!kept.length) rule.remove();
    else rule.selectors = kept;
  });
  root.walkAtRules((at) => {
    if (/^(page|import|charset)$/i.test(at.name) || (at.name === "media" && /^print$/i.test(at.params.trim()))) at.remove();
  });
  const used = animations(root);
  root.walkAtRules(/keyframes$/i, (at) => {
    if (!used.has(at.params.trim())) at.remove();
  });
  let emptied = true;
  while (emptied) {
    emptied = false;
    root.walkAtRules((at) => {
      if (at.nodes && !at.nodes.length) {
        at.remove();
        emptied = true;
      }
    });
  }
  return compact(root);
}

function localFile(href, page) {
  const clean = href.split(/[?#]/)[0];
  return clean.startsWith("/") ? path.join(ROOT, clean) : path.join(ROOT, path.dirname(page), clean);
}

/** Returns the page's HTML with its head stylesheets rebuilt; page is its path from the repo root. */
function inline(html, page, lib = deps()) {
  const source = undo(html);
  const headEnd = source.search(/<\/head>/i);
  if (headEnd === -1) return source;
  const head = source.slice(0, headEnd);
  const skip = [...head.matchAll(/<noscript>[\s\S]*?<\/noscript>/gi)].map((m) => [m.index, m.index + m[0].length]);
  const matches = matcher(source, lib);
  let out = "";
  let at = 0;
  let pad = "";
  for (const m of head.matchAll(/^([ \t]*)<link\b([^>]*)>/gim)) {
    const attrs = m[2];
    if (!/\brel=["']stylesheet["']/i.test(attrs) || /\bmedia=/i.test(attrs)) continue;
    const start = m.index + m[1].length;
    if (skip.some(([a, b]) => start >= a && start < b)) continue;
    const href = (attrs.match(/\bhref=["']([^"']+)["']/i) || [])[1];
    if (!href) continue;
    pad = m[1];
    const sri = ["integrity", "crossorigin"].map((name) => (attrs.match(new RegExp(`\\s${name}=["'][^"']*["']`, "i")) || [""])[0]).join("");
    const plain = `<link rel="stylesheet" href="${href}"${sri}>`;
    const lines = [];
    if (!/^(https?:)?\/\//i.test(href)) {
      const file = localFile(href, page);
      if (!fs.existsSync(file)) throw new Error(`${page}: ${href} was not found at ${path.relative(ROOT, file)}`);
      const css = critical(fs.readFileSync(file, "utf8"), matches, lib);
      if (css) lines.push(`<style data-critical="${href}">${css}</style>`);
    }
    lines.push(`<link rel="preload" href="${href}"${sri} as="style">`, `<link rel="stylesheet" href="${href}"${sri} media="print" data-async-css>`, `<noscript>${plain}</noscript>`);
    out += source.slice(at, start) + lines.join("\n" + pad);
    at = start + m[0].length - m[1].length;
  }
  if (!at) return source;
  return out + "\n" + pad + asyncScript(head, page) + source.slice(at);
}

function main() {
  const args = process.argv.slice(2);
  if (args.includes("--deps")) {
    const dev = require(path.join(ROOT, "package.json")).devDependencies || {};
    console.log(DEPS.map((name) => `${name}@${String(dev[name] || "latest").replace(/^[\^~]/, "")}`).join(" "));
    return;
  }
  const check = args.includes("--check");
  const lib = deps();
  const stale = [];
  for (const page of PAGES) {
    const file = path.join(ROOT, page);
    const html = fs.readFileSync(file, "utf8");
    const next = inline(html, page, lib);
    if (next === html) continue;
    stale.push(page);
    if (!check) fs.writeFileSync(file, next);
  }
  if (check && stale.length) {
    console.error("Critical CSS is stale; run node scripts/build-critical-css.js\n" + stale.join("\n"));
    process.exit(1);
  }
  console.log(check ? `Critical CSS matches its stylesheets (${PAGES.length} pages)` : `Critical CSS: rebuilt ${stale.length} of ${PAGES.length} pages`);
}

module.exports = { inline, undo };

if (require.main === module) main();
