"use strict";

/* WordPress core, plugin and theme versions read from the public pages (#3086), matched against the Wordfence
   Intelligence vulnerability feed. wordfenceFeed (functions/index.js) downloads the whole feed once a day and stores
   a slug index in Cloud Storage; a review reads that index only when the site runs WordPress. */
const zlib = require("zlib");
const { atOrAbove } = require("./url-review-libraries");
const { say, some } = require("./url-review-findings-en");

const FEED_URL = "https://www.wordfence.com/api/intelligence/v3/vulnerabilities/production";
const TERMS_URL = "https://www.wordfence.com/wordfence-intelligence-terms-and-conditions/";
const BUCKET = "carlosm-interactive-cv.firebasestorage.app";
const INDEX_PATH = "wordfence/index.json.gz";
const H = 3600000;
// The key allows about one download per 30 minutes; going over answers 429 and can get the key suspended.
const MIN_REFRESH_MS = 20 * H;
const INDEX_TTL_MS = 6 * H;
const MISSING_TTL_MS = H / 2;
const MIN_RECORDS = 1000;
const MAX_SLUGS = 40;
const MAX_READS = 15;
const READ_PARALLEL = 3;
const TYPES = ["plugin", "theme", "core"];
const SEVERITY = [[9, "critical", "fail", "high"], [7, "high", "risk", "high"], [4, "medium", "risk", "medium"], [0, "low", "risk", "low"]];

const ASSET = /\/wp-content\/(plugins|themes)\/([a-z0-9][a-z0-9_.-]{0,80})\//i;
const GENERATOR = /<meta\b[^>]*name\s*=\s*["']?generator["']?[^>]*>/gi;
// Gutenberg serves the block library under the same path with its own version (10 and up), so only 3.x-9.x reads as core.
const CORE_ASSET = /\/wp-includes\/(?:css\/dist\/block-library\/style|js\/wp-emoji-release)(?:\.min)?\.(?:css|js)\?ver=([3-9]\.\d{1,2}(?:\.\d{1,2})?)\b/i;
const PLAUSIBLE = /^\d{1,3}(?:\.\d{1,4}){0,3}(?:[-.]?(?:alpha|beta|rc|pre|dev|a|b|p)\.?\d*)?$/i;

function plausible(value) {
  const version = String(value || "").trim();
  return PLAUSIBLE.test(version) ? version : "";
}

function sameSite(url, page) {
  if (url.hostname === page.hostname) return true;
  const base = (host) => host.replace(/^www\./, "").split(".").slice(-2).join(".");
  return base(url.hostname) === base(page.hostname) || url.pathname.indexOf("/" + page.hostname.replace(/^www\./, "")) === 0;
}

// What one page's HTML says: the core version and the plugin and theme folders its own files load from.
function fromHtml(html, pageUrl) {
  const text = String(html || "");
  if (!/wp-content|wp-includes|generator["']?\s+content\s*=\s*["']?wordpress/i.test(text)) return null;
  let page;
  try { page = new URL(pageUrl); } catch (error) { return null; }
  const out = { core: "", via: "", plugins: [], themes: [] };
  const generator = (text.match(GENERATOR) || []).map((tag) => (tag.match(/content\s*=\s*["']?WordPress\s+([0-9][0-9.]*)/i) || [])[1]).find(Boolean);
  const coreAsset = (text.replace(/\\\//g, "/").match(CORE_ASSET) || [])[1];
  if (plausible(generator)) Object.assign(out, { core: generator, via: "generator" });
  else if (coreAsset) Object.assign(out, { core: coreAsset, via: "asset" });
  const seen = new Set();
  for (const hit of text.matchAll(/\b(?:src|href)\s*=\s*["']([^"'<>\s]+)["']/gi)) {
    let url;
    try { url = new URL(hit[1].replace(/&amp;/g, "&"), page); } catch (error) { continue; }
    const path = url.pathname.match(ASSET);
    if (!path || !/^https?:$/.test(url.protocol) || !sameSite(url, page)) continue;
    const kind = path[1].toLowerCase() === "plugins" ? "plugins" : "themes";
    const slug = path[2].toLowerCase();
    if (seen.has(kind + slug) || seen.size >= MAX_SLUGS) continue;
    seen.add(kind + slug);
    out[kind].push({ slug, ver: plausible(url.searchParams.get("ver")) });
  }
  return out.core || out.plugins.length || out.themes.length ? out : null;
}

// One list across the pages: the first core version and the first plausible ?ver= for each folder.
function collect(pages) {
  const found = (pages || []).map((page) => page && page.inspect && page.inspect.wordpress).filter(Boolean);
  if (!found.length) return null;
  const core = found.find((row) => row.via === "generator") || found.find((row) => row.core) || {};
  const merge = (kind) => {
    const bySlug = new Map();
    found.forEach((row) => (row[kind] || []).forEach((item) => {
      if (!bySlug.has(item.slug)) bySlug.set(item.slug, item.ver || "");
      else if (!bySlug.get(item.slug) && item.ver) bySlug.set(item.slug, item.ver);
    }));
    return [...bySlug].slice(0, MAX_SLUGS).map(([slug, ver]) => ({ slug, ver }));
  };
  return { core: core.core || "", via: core.via || "", plugins: merge("plugins"), themes: merge("themes") };
}

function stableTag(text) {
  const hit = String(text || "").slice(0, 16000).match(/^[ \t]*Stable tag:[ \t]*(\S+)/im);
  return plausible(hit && hit[1]);
}

function themeVersion(text) {
  const head = String(text || "").slice(0, 16000);
  const comment = (head.match(/\/\*[\s\S]*?\*\//) || [head])[0];
  const hit = comment.match(/^[ \t*]*Version:[ \t]*(\S+)/im);
  return plausible(hit && hit[1]);
}

// A ?ver= equal to the core version is what WordPress appends when a plugin gives none, so it says nothing.
function assetVersion(ver, core) {
  return ver && ver !== core ? ver : "";
}

// Up to MAX_READS readme.txt (plugins) and style.css (themes) headers, a few at a time, through the review's own fetch.
async function readVersions(origin, found, read) {
  const items = found.themes.map((row) => ({ type: "theme", slug: row.slug, ver: row.ver }))
    .concat(found.plugins.map((row) => ({ type: "plugin", slug: row.slug, ver: row.ver })));
  const queue = typeof read === "function" ? items.slice(0, MAX_READS) : [];
  const worker = async () => {
    while (queue.length) {
      const item = queue.shift();
      const file = item.type === "theme" ? "/wp-content/themes/" + item.slug + "/style.css" : "/wp-content/plugins/" + item.slug + "/readme.txt";
      let res = null;
      try { res = await read(origin + file); } catch (error) { if (error && error.code === "STOPPED") throw error; }
      const ok = res && res.status === 200 && !res.html && res.body;
      const version = ok ? (item.type === "theme" ? themeVersion(res.body) : stableTag(res.body)) : "";
      if (version) Object.assign(item, { version, via: item.type === "theme" ? "style" : "readme" });
    }
  };
  await Promise.all(Array.from({ length: READ_PARALLEL }, worker));
  return items.map((item) => {
    if (item.version) return item;
    const version = assetVersion(item.ver, found.core);
    return Object.assign(item, { version, via: version ? "asset" : "" });
  });
}

function compare(a, b) {
  const up = atOrAbove(a, b);
  const down = atOrAbove(b, a);
  return up && down ? 0 : up ? 1 : -1;
}

function inRange(version, [from, fromInc, to, toInc]) {
  const low = from === "*" || !from || (fromInc ? compare(version, from) >= 0 : compare(version, from) > 0);
  const high = to === "*" || !to || (toInc ? compare(version, to) <= 0 : compare(version, to) < 0);
  return low && high;
}

function rating(score) {
  if (typeof score !== "number") return null;
  return SEVERITY.find(([floor]) => score >= floor);
}

// The vulnerabilities the index lists for one component at one version, the worst CVSS, and the version that fixes all.
function match(index, type, slug, version) {
  const entry = index && index[type] && index[type][slug];
  if (!entry || !plausible(version)) return null;
  const hits = entry.v.filter((row) => row[0].some((range) => inRange(version, range)));
  if (!hits.length) return { name: entry.n, vulns: 0 };
  let fixed = "";
  let unpatched = false;
  hits.forEach((row) => {
    const next = row[1].filter((patch) => compare(patch, version) > 0).sort(compare)[0];
    if (!next) unpatched = true;
    else if (!fixed || compare(next, fixed) > 0) fixed = next;
  });
  const scored = hits.filter((row) => typeof row[2] === "number").sort((a, b) => b[2] - a[2]);
  const worst = scored[0] || hits[0];
  const cves = [...new Set(scored.concat(hits.filter((row) => typeof row[2] !== "number")).map((row) => row[3]).filter(Boolean))];
  return {
    name: entry.n,
    vulns: hits.length,
    score: typeof worst[2] === "number" ? worst[2] : null,
    cves: cves.slice(0, 3),
    id: worst[4] || "",
    summary: String(worst[5] || "").split(" - ").slice(1).join(" - ").trim(),
    fixed: unpatched ? "" : fixed,
    unpatched
  };
}

let cached = { at: 0, index: null, pending: null };

async function storedIndex(storage) {
  const file = (storage || require("firebase-admin/storage").getStorage()).bucket(BUCKET).file(INDEX_PATH);
  const [exists] = await file.exists();
  if (!exists) return null;
  const [body] = await file.download();
  return JSON.parse(zlib.gunzipSync(body).toString("utf8"));
}

// The stored index, kept in memory between reviews on a warm instance.
async function loadIndex(storage) {
  const now = Date.now();
  if (cached.at && now - cached.at < (cached.index ? INDEX_TTL_MS : MISSING_TTL_MS)) return cached.index;
  if (!cached.pending) {
    cached.pending = storedIndex(storage).catch((error) => {
      console.error("Wordfence index read failed:", error && error.message);
      return null;
    }).then((index) => {
      cached = { at: Date.now(), index, pending: null };
      return index;
    });
  }
  return cached.pending;
}

// The review's step: the versions on the pages, the headers it reads to confirm them, and the feed's matches.
async function check(pages, options) {
  const opts = options || {};
  const found = collect(pages);
  if (!found) return null;
  const home = (pages || []).find((page) => page && page.url) || {};
  let origin = "";
  try { origin = new URL(home.url).origin; } catch (error) { return null; }
  const items = await readVersions(origin, found, opts.read);
  if (found.core) items.unshift({ type: "core", slug: "wordpress", version: found.core, via: found.via });
  const index = await (opts.index ? opts.index() : loadIndex(opts.storage));
  const components = items.map((item) => {
    const row = { type: item.type, slug: item.slug, version: item.version || "", via: item.via || "" };
    if (index && row.version) Object.assign(row, match(index, row.type, row.slug, row.version) || { vulns: 0 });
    if (row.type === "core") row.name = "WordPress";
    else if (!row.name) row.name = row.slug;
    return row;
  });
  return {
    components,
    feed: index ? { fetched: index.fetched || "", count: index.count || 0 } : null
  };
}

function note(result) {
  if (!result) return "";
  const named = result.components.filter((row) => row.type !== "core");
  const versioned = result.components.filter((row) => row.version);
  const flawed = result.components.filter((row) => row.vulns);
  const core = result.components.find((row) => row.type === "core");
  return "WordPress" + (core ? " " + core.version : "") + ": " + named.length + " plugin" + (named.length === 1 ? "" : "s") + " and theme" + (named.length === 1 ? "" : "s") + " seen, " +
    versioned.length + " with a version" + (result.feed
      ? ", " + flawed.length + " with known vulnerabilities in the Wordfence feed of " + result.feed.fetched + "."
      : ". The Wordfence feed is not stored yet, so no version was checked.");
}

const TYPE_LABEL = { core: "sec-wordpress.type.core", plugin: "sec-wordpress.type.plugin", theme: "sec-wordpress.type.theme" };

// The report's finding: one row per component with known vulnerabilities, worst CVSS first, or a pass for those checked.
function checks(result, add) {
  if (!result || !result.feed) return;
  const checked = result.components.filter((row) => row.version && row.vulns != null);
  if (!checked.length) return;
  const source = say("sec-wordpress.source", { date: result.feed.fetched });
  const flawed = checked.filter((row) => row.vulns).sort((a, b) => (b.score == null ? 5 : b.score) - (a.score == null ? 5 : a.score) || b.vulns - a.vulns || a.name.localeCompare(b.name));
  if (!flawed.length) {
    add("Security", "pass", "info", "sec-wordpress", say("sec-wordpress.pass.title"), say("sec-wordpress.pass.evidence", { list: some(checked.map((row) => row.name + " " + row.version), 5), source }), "");
    return;
  }
  const level = rating(flawed[0].score) || SEVERITY[2];
  const rows = flawed.slice(0, 4).map((row, index) => say(row.score == null ? "sec-wordpress.row.unscored" : "sec-wordpress.row", {
    name: row.name,
    version: row.version,
    type: say(TYPE_LABEL[row.type]),
    vulns: say("sec-wordpress.vulns", { n: row.vulns }),
    score: row.score == null ? "" : row.score.toFixed(1),
    worst: row.score == null ? "" : say("sec-libraries.worst." + rating(row.score)[1]),
    ids: row.cves.length ? say("sec-wordpress.ids", { list: { items: row.cves } }) : "",
    fixed: row.unpatched ? say("sec-wordpress.unfixed") : row.fixed ? say("sec-wordpress.fixed", { version: row.fixed }) : "",
    summary: index === 0 && row.summary ? " " + row.summary.replace(/\.?$/, ".") : ""
  }));
  const evidence = say("sec-wordpress.evidence", {
    rows: { items: rows, sep: " " },
    more: flawed.length > 4 ? say("sec-wordpress.more", { n: flawed.length - 4 }) : "",
    source
  });
  const steps = flawed.slice(0, 4).map((row, index) => row.unpatched || !row.fixed
    ? say("sec-wordpress.remove" + (index ? "" : ".first"), { name: row.name })
    : say("sec-wordpress.update" + (index ? "" : ".first"), { name: row.name, fixed: row.fixed }));
  add("Security", level[2], level[3], "sec-wordpress",
    flawed.length === 1 ? say("sec-wordpress.one.title", { name: flawed[0].name, version: flawed[0].version, n: flawed[0].vulns }) : say("sec-wordpress.title", { n: flawed.length }),
    evidence, say("sec-wordpress.fix", { steps: { items: steps, sep: "; " } }), { effort: "hours", count: flawed.length });
}

function trim(text, max) {
  const value = String(text || "").replace(/\s+/g, " ").trim();
  return value.length > max ? value.slice(0, max - 1) + "…" : value;
}

// Splits the feed's top-level object ({ "<id>": record, ... }) into one parsed record at a time, so the whole
// document (over 150 MB) is never held as one string.
function feedSplitter(onRecord) {
  let depth = 0;
  let quoted = false;
  let escaped = false;
  let parts = [];
  return (chunk) => {
    let from = depth >= 2 ? 0 : -1;
    for (let i = 0; i < chunk.length; i += 1) {
      const c = chunk[i];
      if (quoted) {
        if (escaped) escaped = false;
        else if (c === "\\") escaped = true;
        else if (c === "\"") quoted = false;
        continue;
      }
      if (c === "\"") quoted = true;
      else if (c === "{" || c === "[") {
        depth += 1;
        if (depth === 2) from = i;
      } else if (c === "}" || c === "]") {
        depth -= 1;
        if (depth === 1 && from >= 0) {
          parts.push(chunk.slice(from, i + 1));
          onRecord(JSON.parse(parts.join("")));
          parts = [];
          from = -1;
        }
      }
    }
    if (from >= 0) parts.push(chunk.slice(from));
  };
}

function ranges(affected) {
  return Object.values(affected || {}).map((range) => [
    String(range.from_version || "*"), range.from_inclusive === false ? 0 : 1, String(range.to_version || "*"), range.to_inclusive === false ? 0 : 1
  ]);
}

// The slug index the review reads: per type and slug the software name and one row per vulnerability,
// [ranges, patched versions, CVSS score, CVE, Wordfence id, title].
function indexer() {
  const index = { plugin: {}, theme: {}, core: {} };
  let count = 0;
  const add = (record) => {
    if (!record || typeof record !== "object" || record.informational || !Array.isArray(record.software)) return;
    count += 1;
    const score = record.cvss && typeof record.cvss.score === "number" ? record.cvss.score : null;
    record.software.forEach((soft) => {
      const type = soft && String(soft.type || "").toLowerCase();
      const slug = soft && String(soft.slug || "").toLowerCase();
      if (TYPES.indexOf(type) < 0 || !slug) return;
      const span = ranges(soft.affected_versions);
      if (!span.length) return;
      const entry = index[type][slug] || (index[type][slug] = { n: trim(soft.name || slug, 80), v: [] });
      entry.v.push([span, (soft.patched_versions || []).map(String).filter(plausible), score, String(record.cve || ""), String(record.id || ""), trim(record.title, 140)]);
    });
  };
  return { add, done: (fetched) => Object.assign(index, { source: "Wordfence Intelligence", terms: TERMS_URL, fetched, count }) };
}

// The daily job: download the feed once, build the index and store it. Without a key, or with a fresh index, it does nothing.
async function refreshFeed(options) {
  const opts = options || {};
  const key = opts.key;
  if (!key) {
    console.log("WORDFENCE_KEY is not set, so the Wordfence feed was not downloaded.");
    return { skipped: "no key" };
  }
  const file = (opts.storage || require("firebase-admin/storage").getStorage()).bucket(BUCKET).file(INDEX_PATH);
  const now = opts.now || Date.now();
  const [exists] = await file.exists();
  if (exists && !opts.force) {
    const [meta] = await file.getMetadata();
    const age = now - Date.parse(meta.updated || 0);
    if (age < MIN_REFRESH_MS) return { skipped: "fresh", hours: Math.round(age / H) };
  }
  const res = await (opts.fetch || fetch)(FEED_URL, { headers: { authorization: "Bearer " + key, accept: "application/json" } });
  if (res.status === 429) {
    console.warn("The Wordfence feed answered 429; the stored index stays until tomorrow.");
    return { skipped: "rate limited" };
  }
  if (!res.ok) throw new Error("The Wordfence feed answered " + res.status);
  const build = indexer();
  const split = feedSplitter(build.add);
  const decoder = new TextDecoder();
  for await (const bytes of res.body) split(decoder.decode(bytes, { stream: true }));
  split(decoder.decode());
  const index = build.done(new Date(now).toISOString().slice(0, 10));
  if (index.count < (opts.minRecords == null ? MIN_RECORDS : opts.minRecords)) throw new Error("The Wordfence feed had only " + index.count + " records; the stored index was kept.");
  const body = zlib.gzipSync(JSON.stringify(index));
  await file.save(body, { resumable: false, contentType: "application/gzip", metadata: { metadata: { fetched: index.fetched, count: String(index.count) } } });
  cached = { at: 0, index: null, pending: null };
  const slugs = Object.keys(index.plugin).length + Object.keys(index.theme).length;
  console.log("Wordfence feed: " + index.count + " records, " + slugs + " plugin and theme slugs, " + Math.round(body.length / 1024) + " KB stored at " + INDEX_PATH + ".");
  return { count: index.count, slugs, bytes: body.length };
}

module.exports = { fromHtml, collect, check, note, checks, match, feedSplitter, indexer, refreshFeed, loadIndex, stableTag, themeVersion, FEED_URL, INDEX_PATH };
