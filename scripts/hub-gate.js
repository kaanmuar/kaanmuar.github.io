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
const LIMITS = { x: [280, 23], mastodon: [500, 23], threads: [500], bluesky: [300], linkedin: [3000], instagram: [2200], tiktok: [2200], youtube: [5000], facebook: [63206] };
const LINK = /(?:https?:\/\/)?(?:[a-z0-9-]+\.)+[a-z]{2,}(?:\/\S*)?/gi;

// Every caption ends with its hub post, tagged for the network it goes to (#539). A caption that would run past
// the network's limit loses whole words from its end, never part of a link.
function withHubLink(text, { batch, slug, network }) {
  const body = String(text || "").trim();
  if (!body || body.includes("/social/" + batch + "/" + slug + ".html")) return text;
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
  return kept + "…" + tail;
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

module.exports = { SITE, LIMITS, hubUrl, withHubLink, bogotaDay, hubDates, reason, createGate };
