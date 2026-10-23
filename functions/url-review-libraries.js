// Front-end library versions read from script addresses, file banners and page globals,
// matched against the retire.js list bundled in assets/retire.json (scripts/retire-update.js refreshes it).
const REPO = require("./assets/retire.json");

const VERSION = "[0-9][0-9.a-z_\\-]+";
// WordPress serves its bundled jQuery under a fixed path with the version in ?ver=.
const EXTRA_URI = {
  "jQuery": ["/wp-includes/js/jquery/jquery(?:\\.min)?\\.js\\?ver=(§§version§§)"],
  "jQuery Migrate": ["/wp-includes/js/jquery/jquery-migrate(?:\\.min)?\\.js\\?ver=(§§version§§)"],
  "jQuery UI": ["/wp-includes/js/jquery/ui/[a-z-]+(?:\\.min)?\\.js\\?ver=(§§version§§)"]
};
const SEVERITY_RANK = { low: 1, medium: 2, high: 3, critical: 4 };
const MAX_CONTENT = 4000000;

function compile(list) {
  return (list || []).map((source) => {
    try { return new RegExp(source.replace(/§§version§§/g, VERSION)); } catch (error) { return null; }
  }).filter(Boolean);
}

function readable(expr) {
  if (/\bnew\s/.test(expr)) return false;
  try { new Function("return (" + expr + ");"); return true; } catch (error) { return false; }
}

const LIBS = Object.keys(REPO.libraries).map((name) => {
  const row = REPO.libraries[name];
  const ex = row.extractors;
  return {
    name,
    uri: compile((ex.uri || []).concat(EXTRA_URI[name] || [])),
    filename: compile(ex.filename),
    content: compile(ex.filecontent),
    func: (ex.func || []).filter(readable),
    flaws: row.flaws
  };
});
const BY_NAME = new Map(LIBS.map((lib) => [lib.name, lib]));

function cleanVersion(raw) {
  let value = String(raw || "").trim();
  for (let i = 0; i < 3; i += 1) value = value.replace(/[._-](min|js|slim|prod|production)$/i, "").replace(/[._-]+$/, "");
  return value.length <= 24 && /^\d[\w.-]*$/.test(value) ? value : "";
}

function firstVersion(patterns, text) {
  for (const re of patterns) {
    const hit = re.exec(text);
    const version = hit && cleanVersion(hit[1]);
    if (version) return version;
  }
  return "";
}

// Libraries named by a script's address: the path (CDN folders) or the file name.
function fromUrl(raw) {
  let url;
  try { url = new URL(raw); } catch (error) { return []; }
  if (!/^https?:$/.test(url.protocol)) return [];
  let file = url.pathname.split("/").pop() || "";
  try { file = decodeURIComponent(file); } catch (error) { /* keep the raw name */ }
  const out = [];
  LIBS.forEach((lib) => {
    const version = firstVersion(lib.uri, url.href) || firstVersion(lib.filename, file);
    if (version) out.push({ name: lib.name, version, via: "url", url: url.href.slice(0, 300) });
  });
  return out;
}

// Libraries named by a banner or version string inside a script file.
function fromContent(text, url) {
  const body = String(text || "");
  if (!body || body.length > MAX_CONTENT) return [];
  const out = [];
  LIBS.forEach((lib) => {
    const version = firstVersion(lib.content, body);
    if (version) out.push({ name: lib.name, version, via: "banner", url: String(url || "").slice(0, 300) });
  });
  return out;
}

// An expression for the page that reads each library's version from its globals.
const PROBE = "(() => { const out = {}; " + LIBS.filter((lib) => lib.func.length).map((lib) => {
  const key = JSON.stringify(lib.name);
  return lib.func.map((expr) => "if (!out[" + key + "]) try { const v = (" + expr + "); if (typeof v === \"string\" || typeof v === \"number\") out[" + key + "] = String(v).slice(0, 30); } catch (e) {}").join(" ");
}).join(" ") + " return out; })()";

function fromGlobals(values, url) {
  return Object.keys(values || {}).filter((name) => BY_NAME.has(name)).map((name) => ({ name, version: cleanVersion(values[name]), via: "global", url: String(url || "").slice(0, 300) })).filter((row) => row.version);
}

function toComparable(part) {
  if (!part) return 0;
  return /^[0-9]+$/.test(part) ? parseInt(part, 10) : part;
}

// retire.js comparison: numeric parts compare as numbers, and a number ranks above a pre-release tag.
function atOrAbove(left, right) {
  const a = String(left).split(/[.-]/);
  const b = String(right).split(/[.-]/);
  for (let i = 0; i < Math.max(a.length, b.length); i += 1) {
    const x = toComparable(a[i]);
    const y = toComparable(b[i]);
    if (typeof x !== typeof y) return typeof x === "number";
    if (x > y) return true;
    if (x < y) return false;
  }
  return true;
}

function flawsOf(name, version) {
  const lib = BY_NAME.get(name);
  if (!lib || !version) return [];
  return lib.flaws.filter((flaw) => !atOrAbove(version, flaw.below) && (!flaw.atOrAbove || atOrAbove(version, flaw.atOrAbove)));
}

// One row per library and version, with the flaws the bundled list knows and the first version that fixes them all.
function assess(found) {
  const rows = new Map();
  (found || []).forEach((item) => {
    const version = cleanVersion(item && item.version);
    if (!item || !BY_NAME.has(item.name) || !version) return;
    const key = item.name + "@" + version;
    if (!rows.has(key)) rows.set(key, { name: item.name, version, via: item.via || "url", url: item.url || "" });
  });
  return [...rows.values()].map((row) => {
    const flaws = flawsOf(row.name, row.version);
    const below = flaws.reduce((best, flaw) => !best || atOrAbove(flaw.below, best) ? flaw.below : best, "");
    // retire.js marks a release line that will get no fix with a bound like 3.999.999.
    const ended = /(^|\.)999(\.|$)/.test(below);
    const worst = flaws.reduce((best, flaw) => (SEVERITY_RANK[flaw.severity] || 2) > (SEVERITY_RANK[best] || 0) ? flaw.severity : best, "");
    const ids = [...new Set([].concat.apply([], flaws.map((flaw) => flaw.ids || [])))];
    const major = (value) => parseInt(String(value).split(".")[0], 10) || 0;
    return Object.assign(row, { flaws: flaws.length, worst, ids: ids.slice(0, 3), summary: (flaws.find((flaw) => flaw.severity === worst && flaw.summary) || {}).summary || "", fixed: ended ? "" : below, ended, majorJump: ended || (!!below && major(below) > major(row.version)) });
  }).sort((a, b) => (SEVERITY_RANK[b.worst] || 0) - (SEVERITY_RANK[a.worst] || 0) || b.flaws - a.flaws || a.name.localeCompare(b.name));
}

module.exports = { fromUrl, fromContent, fromGlobals, assess, atOrAbove, cleanVersion, PROBE, LIST_DATE: REPO.fetched };
