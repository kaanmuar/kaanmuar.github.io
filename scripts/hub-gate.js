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

module.exports = { SITE, hubUrl, bogotaDay, hubDates, reason, createGate };
