"use strict";
/* The safe PageSpeed fixes (#1978): small edits to a page's HTML text, driven by its PageSpeed audits in both modes.
   Each fixer takes (html, ctx) and returns { html, fixes: [{ kind, detail }] }; ctx = { url, psi: { mobile, desktop },
   readLocal(path) -> text|null }. Tags are edited in place, never re-serialized, so the rest of the file is untouched.

   lcp       the LCP <img>: drop loading="lazy", add fetchpriority="high"
   lazy      <img> with width and height and <iframe src> that start below 1.5 screens on phone and desktop (ctx.places),
             never the LCP image: loading="lazy"
   defer     a render-blocking classic <script src> that nothing after it needs synchronously: defer
   fonts     Google Fonts CSS gets display=swap and a preconnect to fonts.gstatic.com; up to two same-origin fonts on the
             critical chain get a preload */

const { ORIGIN } = require("./pages");

const KINDS = ["lcp", "lazy", "defer", "fonts"];
const JS_TYPES = /^(|text\/javascript|application\/javascript|module)$/i;

// --- tags and attributes ---------------------------------------------------------------------------------------

function attrRe(name) {
  return new RegExp("\\s" + name + "(?:\\s*=\\s*(\"[^\"]*\"|'[^']*'|[^\\s>]+))?(?=[\\s/>])", "i");
}

function getAttr(tag, name) {
  const m = attrRe(name).exec(tag);
  if (!m) return null;
  const v = m[1];
  return v === undefined ? "" : v.replace(/^["']|["']$/g, "");
}

function setAttr(tag, name, value) {
  const re = attrRe(name);
  const pair = value === "" ? " " + name : " " + name + '="' + value + '"';
  if (re.test(tag)) return tag.replace(re, pair);
  const end = /\s*\/?>$/.exec(tag);
  return tag.slice(0, end.index) + pair + tag.slice(end.index);
}

function dropAttr(tag, name) {
  return tag.replace(attrRe(name), "");
}

// Comments, scripts, styles and templates: tags inside them are text, not elements.
function masked(html) {
  const ranges = [];
  const re = /<!--[\s\S]*?-->|<(script|style|template|textarea)\b[^>]*>[\s\S]*?<\/\1\s*>/gi;
  let m;
  while ((m = re.exec(html))) ranges.push([m.index, m.index + m[0].length]);
  return (i) => ranges.some(([a, b]) => i > a && i < b);
}

function tags(html, name) {
  const inside = masked(html);
  const out = [];
  const re = new RegExp("<" + name + "\\b[^>]*>", "gi");
  let m;
  while ((m = re.exec(html))) if (!inside(m.index)) out.push({ start: m.index, end: m.index + m[0].length, tag: m[0] });
  return out;
}

// Replaces tags (sorted by start) from last to first so earlier offsets stay right.
function splice(html, edits) {
  return edits.slice().sort((a, b) => b.start - a.start).reduce((h, e) => h.slice(0, e.start) + e.tag + h.slice(e.end), html);
}

function resolve(ref, base) {
  try { return new URL(String(ref || "").trim(), base || ORIGIN + "/"); } catch (error) { return null; }
}

function samePath(a, b, base) {
  const x = resolve(a, base);
  const y = resolve(b, base);
  return !!(x && y && x.origin === y.origin && x.pathname === y.pathname);
}

const ours = (u, base) => { const x = resolve(u, base); return !!(x && x.origin === ORIGIN); };
const rootPath = (u, base) => { const x = resolve(u, base); return x ? x.pathname + x.search : ""; };
const modes = (ctx) => ["mobile", "desktop"].map((m) => (ctx.psi || {})[m]).filter((r) => r && r.ok !== false);
const audit = (ctx, id) => modes(ctx).map((r) => (r.audits || {})[id]).filter(Boolean);

function srcs(tag) {
  const list = [getAttr(tag, "src"), getAttr(tag, "data-src")].filter(Boolean);
  (getAttr(tag, "srcset") || "").split(",").forEach((part) => { const u = part.trim().split(/\s+/)[0]; if (u) list.push(u); });
  return list;
}

function insertHead(html, line) {
  const at = html.search(/<\/head\s*>/i);
  if (at < 0) return html;
  const before = html.slice(0, at).replace(/[ \t]*$/, "");
  const close = html.slice(before.length, at);
  const prev = (/(?:^|\n)([ \t]*)\S[^\n]*\n?$/.exec(before) || [])[1];
  return before + (before.endsWith("\n") ? "" : "\n") + (prev === undefined ? close : prev) + line + "\n" + close + html.slice(at);
}

// --- fixers ----------------------------------------------------------------------------------------------------

// The LCP element's image, from the <img> snippet PageSpeed names. Lighthouse 13 gives no URL for a CSS-background LCP.
function lcpTargets(ctx) {
  const out = { imgs: [] };
  modes(ctx).forEach((r) => {
    const snip = ((r.lcpEl || {}).node || {}).snippet || "";
    const src = /^<img\b/i.test(snip) ? getAttr(snip + ">", "src") : null;
    if (src) out.imgs.push(src);
  });
  return out;
}

function lcp(html, ctx) {
  const fixes = [];
  const want = lcpTargets(ctx);
  const edits = [];
  tags(html, "img").forEach((t) => {
    if (!want.imgs.some((src) => srcs(t.tag).some((s) => samePath(s, src, ctx.url)))) return;
    let tag = t.tag;
    if ((getAttr(tag, "loading") || "").toLowerCase() === "lazy") { tag = dropAttr(tag, "loading"); fixes.push({ kind: "lcp", detail: "Dropped loading=lazy on the LCP image " + getAttr(t.tag, "src") + "." }); }
    if (getAttr(tag, "fetchpriority") === null) { tag = setAttr(tag, "fetchpriority", "high"); fixes.push({ kind: "lcp", detail: "Gave the LCP image " + getAttr(t.tag, "src") + " fetchpriority=high." }); }
    if (tag !== t.tag) edits.push(Object.assign({}, t, { tag }));
  });
  return { html: splice(html, edits), fixes };
}

/* True when every element with this src starts below FOLD screens in both viewports. ctx.places comes from
   lighthouse.positions(); without it nothing is lazy-loaded. A hidden element counts as above the fold. */
const FOLD = 1.5;
function belowFold(src, tag, ctx) {
  const p = ctx.places;
  if (!p || !p.mobile || !p.desktop) return false;
  return ["mobile", "desktop"].every((m) => {
    const same = p[m].filter((e) => e.tag === tag && e.src && samePath(e.src, src, ctx.url));
    return same.length > 0 && same.every((e) => e.shown && e.top > FOLD * p.vh[m]);
  });
}

/** True when the page has an element the lazy fixer could change, so it is worth placing in Chrome. */
function lazyCandidates(html) {
  return tags(html, "img").some((t) => getAttr(t.tag, "src") && getAttr(t.tag, "loading") === null && getAttr(t.tag, "width") !== null && getAttr(t.tag, "height") !== null)
    || tags(html, "iframe").some((t) => getAttr(t.tag, "src") && getAttr(t.tag, "loading") === null);
}

function lazy(html, ctx) {
  const lcpSrcs = lcpTargets(ctx).imgs;
  const edits = [];
  tags(html, "img").forEach((t) => {
    const src = getAttr(t.tag, "src");
    if (!src || getAttr(t.tag, "loading") !== null || getAttr(t.tag, "fetchpriority") !== null) return;
    if (getAttr(t.tag, "width") === null || getAttr(t.tag, "height") === null) return;
    if (lcpSrcs.some((l) => samePath(src, l, ctx.url)) || !belowFold(src, "img", ctx)) return;
    let tag = setAttr(t.tag, "loading", "lazy");
    if (getAttr(tag, "decoding") === null) tag = setAttr(tag, "decoding", "async");
    edits.push(Object.assign({}, t, { tag }));
  });
  tags(html, "iframe").forEach((t) => {
    const src = getAttr(t.tag, "src");
    if (!src || getAttr(t.tag, "loading") !== null || !belowFold(src, "iframe", ctx)) return;
    edits.push(Object.assign({}, t, { tag: setAttr(t.tag, "loading", "lazy") }));
  });
  const fixes = edits.length ? [{ kind: "lazy", detail: "Lazy-loaded " + edits.length + " image" + (edits.length === 1 ? "" : "s") + " or frame" + (edits.length === 1 ? "" : "s") + " that start below " + FOLD + " screens on phone and desktop." }] : [];
  return { html: splice(html, edits), fixes };
}

function scripts(html) {
  const out = [];
  const re = /<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi;
  const inComment = (() => {
    const ranges = [];
    const c = /<!--[\s\S]*?-->/g;
    let m;
    while ((m = c.exec(html))) ranges.push([m.index, m.index + m[0].length]);
    return (i) => ranges.some(([a, b]) => i > a && i < b);
  })();
  let m;
  while ((m = re.exec(html))) {
    if (inComment(m.index)) continue;
    const open = "<script" + m[1] + ">";
    const type = (getAttr(open, "type") || "").trim();
    if (!JS_TYPES.test(type)) continue;
    out.push({ start: m.index, end: m.index + open.length, tag: open, src: getAttr(open, "src"), module: /module/i.test(type), async: getAttr(open, "async") !== null, defer: getAttr(open, "defer") !== null, inline: getAttr(open, "src") === null && m[2].trim().length > 0 });
  }
  return out;
}

// Deferring is safe when no classic script after this one runs before it would: no inline script and no plain
// (not async, not deferred) external script follows, and the file does not call document.write.
function defer(html, ctx) {
  const fixes = [];
  const blocking = audit(ctx, "render-blocking-insight").flatMap((a) => a.items || []).map((i) => i.url).filter((u) => u && /\.m?js(\?|$)/i.test(u));
  if (!blocking.length) return { html, fixes };
  const list = scripts(html);
  const edits = [];
  for (let i = list.length - 1; i >= 0; i -= 1) {
    const s = list[i];
    if (!s.src || s.module || s.async || s.defer || !blocking.some((u) => samePath(u, s.src, ctx.url)) || !ours(s.src, ctx.url)) continue;
    if (list.slice(i + 1).some((x) => !x.module && (x.inline || (x.src && !x.async && !x.defer)))) continue;
    const local = ctx.readLocal ? ctx.readLocal(decodeURIComponent(resolve(s.src, ctx.url).pathname).replace(/^\//, "")) : null;
    if (local === null || /document\.write/.test(local)) continue;
    s.defer = true;
    edits.push(Object.assign({}, s, { tag: setAttr(s.tag, "defer", "") }));
    fixes.unshift({ kind: "defer", detail: "Deferred the render-blocking script " + s.src + "." });
  }
  return { html: splice(html, edits), fixes };
}

function fonts(html, ctx) {
  const fixes = [];
  let out = html;
  const links = tags(out, "link").filter((t) => /fonts\.googleapis\.com\/css/i.test(getAttr(t.tag, "href") || ""));
  const edits = [];
  links.forEach((t) => {
    const href = getAttr(t.tag, "href").replace(/&amp;/g, "&");
    if (/[?&]display=/.test(href)) return;
    const next = href + (href.includes("?") ? "&" : "?") + "display=swap";
    edits.push(Object.assign({}, t, { tag: setAttr(t.tag, "href", next.replace(/&/g, "&amp;")) }));
    fixes.push({ kind: "fonts", detail: "Added display=swap to the Google Fonts stylesheet." });
  });
  out = splice(out, edits);
  if (links.length && !tags(out, "link").some((t) => /preconnect/i.test(getAttr(t.tag, "rel") || "") && /fonts\.gstatic\.com/.test(getAttr(t.tag, "href") || ""))) {
    out = insertHead(out, '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>');
    fixes.push({ kind: "fonts", detail: "Preconnected to fonts.gstatic.com." });
  }
  const chain = Array.from(new Set(modes(ctx).flatMap((r) => r.chainFonts || []))).filter((u) => ours(u, ctx.url) && /\.woff2(\?|$)/i.test(u));
  chain.slice(0, 2).forEach((u) => {
    if (tags(out, "link").some((t) => /preload/i.test(getAttr(t.tag, "rel") || "") && samePath(getAttr(t.tag, "href"), u, ctx.url))) return;
    out = insertHead(out, '<link rel="preload" href="' + rootPath(u, ctx.url) + '" as="font" type="font/woff2" crossorigin>');
    fixes.push({ kind: "fonts", detail: "Preloaded the font " + rootPath(u, ctx.url) + " on the critical chain." });
  });
  return { html: out, fixes };
}

const FIXERS = { lcp, lazy, defer, fonts };

/** Runs every fixer in order over one page. */
function fixPage(html, ctx) {
  return KINDS.reduce((acc, kind) => {
    const r = FIXERS[kind](acc.html, ctx);
    return { html: r.html, fixes: acc.fixes.concat(r.fixes) };
  }, { html, fixes: [] });
}

// --- images ----------------------------------------------------------------------------------------------------

const IMAGE = /\.(jpe?g|png|webp)$/i;

/** Same-origin images PageSpeed says could be smaller through compression or a modern format, as repo paths. */
function imagesToCompress(ctx) {
  const out = new Set();
  audit(ctx, "image-delivery-insight").forEach((a) => (a.items || []).forEach((i) => {
    if (!i.url || !ours(i.url, ctx.url)) return;
    if (i.reasons && i.reasons.length && !i.reasons.some((r) => /compression|modern image format/i.test(r))) return;
    const p = decodeURIComponent(resolve(i.url, ctx.url).pathname).replace(/^\//, "");
    if (IMAGE.test(p) && !p.split("/").includes("..")) out.add(p);
  }));
  return Array.from(out);
}

/** Re-encodes one image in its own format and size (PNG losslessly); keeps it only when at least 10% and 2 KB smaller. */
async function compress(sharp, buf, file) {
  const ext = (IMAGE.exec(file) || [])[1].toLowerCase();
  const img = sharp(buf, { animated: false });
  const out = ext === "png" ? await img.png({ compressionLevel: 9, adaptiveFiltering: true, palette: false, effort: 10 }).toBuffer()
    : ext === "webp" ? await img.webp({ quality: 80, effort: 6 }).toBuffer()
      : await img.jpeg({ quality: 82, mozjpeg: true }).toBuffer();
  const saved = buf.length - out.length;
  return saved >= Math.max(2048, buf.length * 0.1) ? { buf: out, before: buf.length, after: out.length } : null;
}

module.exports = { KINDS, FOLD, getAttr, setAttr, dropAttr, tags, scripts, samePath, insertHead, lcpTargets, belowFold, lazyCandidates, lcp, lazy, defer, fonts, fixPage, imagesToCompress, compress };
