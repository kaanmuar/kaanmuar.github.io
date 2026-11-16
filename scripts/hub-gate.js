/* Hub first (#1038): a post goes to a network only once its page on the social hub answers 200, and never in a
   slot dated before its day on the hub. scripts/buffer-queue.js and scripts/facebook-queue.js ask before each post.
   The hub's date comes from assets/social/feed*.json, which carries the owner's date edits; captions.json is the
   fallback for a post the hub has not been rebuilt with yet. */

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const SITE = process.env.SITE || "https://carlosandmunoz.com";
const FEEDS = ["", "-es", "-pt", "-de", "-fr", "-it"].map((sfx) => "assets/social/feed" + sfx + ".json");

function hubUrl(batch, slug) {
  return SITE + "/social/" + batch + "/" + slug + ".html";
}

// Caption limits; X and Mastodon count any link, with or without https://, as 23 characters.
const LIMITS = { x: [280, 23], mastodon: [500, 23], threads: [500], bluesky: [300], linkedin: [3000], instagram: [2200], tiktok: [2200], youtube: [5000], facebook: [63206], telegram: [1024] };
const LINK = /(?:https?:\/\/)?(?:[a-z0-9-]+\.)+[a-z]{2,}(?:\/\S*)?/gi;

// Every caption ends with its hub post, tagged for the network it goes to (#539). A caption that would run past
// the network's limit loses whole words from its end, never part of a link.
function withHubLink(text, { batch, slug, network }) {
  const body = String(text || "").trim();
  if (!body || new RegExp("/social/" + batch + "/" + slug + "(?:\\.html)?(?![\\w.-])").test(body)) return text;
  const tail = "\n\n" + hubUrl(batch, slug) + "?utm_source=" + network + "&utm_medium=social&utm_campaign=" + batch;
  const [max, linkSize] = LIMITS[network] || [Infinity];
  const size = (s) => [...(linkSize ? s.replace(LINK, "x".repeat(linkSize)) : s)].length;
  if (size(body + tail) <= max) return body + tail;
  const parts = body.split(/(\s+)/);
  let kept = "";
  for (let i = 0; i < parts.length; i += 2) {
    const next = kept + (i ? parts[i - 1] : "") + parts[i];
    if (size(next + "…" + tail) > max) break;
    kept = next;
  }
  return kept.replace(/…$/u, "") + "…" + tail;
}

// First-comment UTM on LinkedIn / Instagram / Facebook (#3551): body stays link-throttle-safe; comment carries the tagged URL + drop-URL CTA.
const FIRST_COMMENT_NETS = new Set(["linkedin", "instagram", "facebook"]);
const DROP_URL = {
  en: "Drop a public URL in the comments and I'll run a QA-lab sweep on the top ones.",
  es: "Deja una URL pública en los comentarios y haré un barrido QA-lab de las primeras.",
  pt: "Deixe uma URL pública nos comentários e eu faço um varredura QA-lab nas primeiras.",
  de: "Schreib eine öffentliche URL in die Kommentare — ich prüfe die ersten mit QA-lab.",
  fr: "Laissez une URL publique en commentaire : je lancerai un balayage QA-lab sur les premières.",
  it: "Lascia un URL pubblico nei commenti e farò uno sweep QA-lab sui primi."
};

function stripUtms(text) {
  return String(text || "")
    .replace(/([?&])utm_[^=\s&#]*=[^&\s#]*/gi, "$1")
    .replace(/\?&+/g, "?")
    .replace(/[?&]+(#|$)/g, "$1")
    .replace(/&&+/g, "&");
}

function withUtms(url, network, batch, slug) {
  const base = stripUtms(String(url || "").trim()).replace(/[?&]$/, "");
  if (!/^https?:\/\//i.test(base)) return "";
  const join = base.includes("?") ? "&" : "?";
  const campaign = batch || "social";
  const content = slug ? "&utm_content=" + encodeURIComponent(slug) : "";
  return base + join + "utm_source=" + network + "&utm_medium=social&utm_campaign=" + encodeURIComponent(campaign) + content;
}

function dropUrlLine(lang) {
  return DROP_URL[lang] || DROP_URL.en;
}

/** For LI/IG/FB: strip UTMs from the body and put drop-URL + tagged primary (or hub) link in firstComment. Other nets keep withHubLink. */
function prepareCaption({ text, network, batch, slug, lang }) {
  const net = network === "twitter" ? "x" : network;
  if (!FIRST_COMMENT_NETS.has(net)) {
    return { text: withHubLink(text, { batch, slug, network: net }), firstComment: null };
  }
  const original = String(text || "").trim();
  const body = stripUtms(original);
  const urls = [...original.matchAll(/https?:\/\/[^\s)]+/gi)].map((m) => m[0]);
  const primary = urls.find((u) => /qa-review|\/social\//i.test(u)) || urls[0] || "";
  const tagged = primary
    ? withUtms(primary, net, batch, slug)
    : withUtms(hubUrl(batch, slug), net, batch, slug);
  return { text: body, firstComment: dropUrlLine(lang) + "\n\n" + tagged };
}

// calendar.csv and the hub both count days on Bogotá wall-clock time (UTC-5, no daylight saving).
function bogotaDay(when) {
  return new Date(new Date(when).getTime() - 5 * 3600e3).toISOString().slice(0, 10);
}

function hubDates(root = ROOT) {
  const dates = new Map();
  FEEDS.forEach((file) => {
    const full = path.join(root, file);
    if (!fs.existsSync(full)) return;
    (JSON.parse(fs.readFileSync(full, "utf8")).posts || []).forEach((post) => {
      if (post.id && post.date && !dates.has(post.id)) dates.set(post.id, post.date);
    });
  });
  return dates;
}

// Why a post may not go out in this slot, or null when it may.
function reason({ live, hubDate, at }) {
  if (!live) return "not on the hub";
  if (hubDate && at && bogotaDay(at) < hubDate) return "slot before its hub day (" + hubDate + ")";
  return null;
}

// One gate per run: each hub page is asked for once.
function createGate({ fetchImpl = fetch, root = ROOT } = {}) {
  const dates = hubDates(root);
  const pages = new Map();
  const live = (url) => {
    if (!pages.has(url)) pages.set(url, fetchImpl(url, { method: "HEAD", redirect: "follow" }).then((res) => !!(res && res.ok)).catch(() => false));
    return pages.get(url);
  };
  return async function check(batch, slug, cap, at) {
    const id = batch + "/" + slug;
    const url = hubUrl(batch, slug);
    const hubDate = dates.get(id) || (cap && cap.date) || "";
    return { url, hubDate, why: reason({ live: await live(url), hubDate, at }) };
  };
}

module.exports = {
  SITE, LIMITS, LINK, hubUrl, withHubLink, bogotaDay, hubDates, reason, createGate,
  FIRST_COMMENT_NETS, DROP_URL, stripUtms, withUtms, dropUrlLine, prepareCaption
};
