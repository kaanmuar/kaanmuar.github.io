#!/usr/bin/env node
/* Each sent post's numbers on every network, for the social hub's sort and the stats line on its cards (#1587).

     node scripts/social-metrics.js   # writes assets/social/metrics.json

   LinkedIn, TikTok, X and YouTube come from Buffer (Post.metrics, BUFFER_API_KEY), Facebook from the Graph API
   (FACEBOOK_PAGE_TOKEN), Bluesky and Mastodon from their public APIs (no key). Only ledger entries marked sent are
   asked about (assets/social/buffer.json, facebook.json, open-social.json). Jarvis > Business shows them per network
   and per clip (#2018).
   A network without its key, or one that fails, keeps the numbers of the last run, so a bad morning blanks nothing.
   scripts/build-social-hub.js writes them into the feed; auto-live-reports.yml runs this before it every day.

   { version: 1, updatedAt: "<ISO>", posts: { "<batch>/<slug>": { "<network>": { impressions, views, likes, shares, comments } } } } */

const fs = require("fs");
const path = require("path");
const queues = require("./social-ledger");

const ROOT = path.resolve(__dirname, "..");
const OUT = "assets/social/metrics.json";
const GRAPH = "https://graph.facebook.com/" + (process.env.FACEBOOK_GRAPH_VERSION || "v23.0");
const METRICS = ["impressions", "views", "likes", "shares", "comments"];
const BSKY = "https://public.api.bsky.app/xrpc/app.bsky.feed.getPosts";
const CHUNK = 20;

function empty() {
  return { version: 1, updatedAt: "", posts: {} };
}

function read(file = OUT) {
  const full = path.join(ROOT, file);
  if (!fs.existsSync(full)) return empty();
  const data = JSON.parse(fs.readFileSync(full, "utf8"));
  return { version: 1, updatedAt: String(data.updatedAt || ""), posts: data.posts && typeof data.posts === "object" ? data.posts : {} };
}

// Counts above zero only; a network that reports nothing for a post leaves it out.
function counts(values) {
  const out = {};
  METRICS.forEach((key) => {
    const n = Math.round(Number(values[key]) || 0);
    if (n > 0) out[key] = n;
  });
  return out;
}

// Buffer names cross-network metrics alike; reach stands in where a network has no impressions, and likes and
// reactions are the same count under two names, so the larger one is kept.
function fromBuffer(metrics) {
  const by = {};
  (metrics || []).forEach((m) => { if (m && m.type) by[m.type] = Number(m.value) || 0; });
  return counts({ impressions: by.impressions || by.reach, views: by.views, likes: Math.max(by.likes || 0, by.reactions || 0),
    shares: Math.max(by.shares || 0, by.reposts || 0, by.retweets || 0, by.reshares || 0), comments: by.comments });
}

// Sent entries per network: [{ post, channel, id }].
function sentEntries(book, channels) {
  const list = [];
  Object.entries(book.posts || {}).forEach(([post, entries]) => (entries || []).forEach((entry) => {
    if (entry.result === "sent" && entry.id && (!channels || channels.includes(entry.channel))) list.push({ post, channel: entry.channel, id: entry.id, url: entry.url || "" });
  }));
  return list;
}

async function bufferNumbers(entries, gql) {
  const found = [];
  const ask = async (chunk) => {
    const query = "query { " + chunk.map((entry, i) => "p" + i + ": post(input: { id: " + JSON.stringify(entry.id) + " }) { metrics { type value } }").join(" ") + " }";
    const data = await gql(query, {});
    chunk.forEach((entry, i) => { if (data && data["p" + i]) found.push(Object.assign({}, entry, { numbers: fromBuffer(data["p" + i].metrics) })); });
  };
  for (let i = 0; i < entries.length; i += CHUNK) {
    const chunk = entries.slice(i, i + CHUNK);
    try {
      await ask(chunk);
    } catch (error) {
      if (error.spent || chunk.length === 1) throw error;
      // A post deleted in Buffer fails its whole query, so the chunk is asked again one post at a time.
      for (const entry of chunk) {
        try { await ask([entry]); } catch (one) { if (one.spent) throw one; }
      }
    }
  }
  return found;
}

async function graphJson(request, url) {
  const res = await request(url);
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json.error) throw new Error("Graph " + res.status + ": " + JSON.stringify(json.error || json).slice(0, 200));
  return json;
}

// Meta retired post_impressions for post_media_view (views of the post); whichever this Page still answers is kept.
async function facebookNumbers(entries, token, request) {
  const found = [];
  for (const entry of entries) {
    const qs = (params) => new URLSearchParams(Object.assign({ access_token: token }, params)).toString();
    let base;
    try {
      base = await graphJson(request, GRAPH + "/" + entry.id + "?" + qs({ fields: "comments.summary(true).limit(0),reactions.summary(true).limit(0),shares" }));
    } catch (error) {
      continue;
    }
    const insight = async (metric) => {
      try {
        const json = await graphJson(request, GRAPH + "/" + entry.id + "/insights?" + qs({ metric }));
        const row = (json.data || [])[0];
        return row && row.values && row.values[0] ? Number(row.values[0].value) || 0 : 0;
      } catch (error) {
        return 0;
      }
    };
    const impressions = (await insight("post_media_view")) || (await insight("post_impressions"));
    const views = await insight("post_video_views");
    const total = (edge) => (base[edge] && base[edge].summary && base[edge].summary.total_count) || 0;
    found.push(Object.assign({}, entry, { numbers: counts({ impressions, views, likes: total("reactions"), shares: (base.shares && base.shares.count) || 0, comments: total("comments") }) }));
  }
  return found;
}

// Bluesky answers 25 posts a call; reposts and quotes are both shares. It counts no views.
async function blueskyNumbers(entries, request) {
  const found = [];
  for (let i = 0; i < entries.length; i += 25) {
    const chunk = entries.slice(i, i + 25);
    try {
      const res = await request(BSKY + "?" + chunk.map((e) => "uris=" + encodeURIComponent(e.id)).join("&"));
      const json = await res.json();
      const by = {};
      (json.posts || []).forEach((p) => { by[p.uri] = p; });
      chunk.forEach((e) => {
        const p = by[e.id];
        if (p) found.push(Object.assign({}, e, { numbers: counts({ likes: p.likeCount, shares: (p.repostCount || 0) + (p.quoteCount || 0), comments: p.replyCount }) }));
      });
    } catch (error) { /* a failed chunk keeps its last numbers */ }
  }
  return found;
}

// A public status answers on its own server without a token; the server comes from the post's URL.
async function mastodonNumbers(entries, request) {
  const found = [];
  for (const e of entries) {
    let origin;
    try { origin = new URL(e.url).origin; } catch (error) { continue; }
    try {
      const res = await request(origin + "/api/v1/statuses/" + encodeURIComponent(e.id));
      if (!res.ok) continue;
      const s = await res.json();
      found.push(Object.assign({}, e, { numbers: counts({ likes: s.favourites_count, shares: s.reblogs_count, comments: s.replies_count }) }));
    } catch (error) { /* kept from the last run */ }
  }
  return found;
}

// Fresh numbers replace a network's old ones; networks not asked this run keep theirs.
function merge(previous, found, updatedAt) {
  const posts = JSON.parse(JSON.stringify(previous.posts || {}));
  found.forEach(({ post, channel, numbers }) => {
    posts[post] = posts[post] || {};
    if (Object.keys(numbers).length) posts[post][channel] = numbers;
    else delete posts[post][channel];
    if (!Object.keys(posts[post]).length) delete posts[post];
  });
  const sorted = Object.fromEntries(Object.keys(posts).sort().map((key) => [key, posts[key]]));
  return { version: 1, updatedAt, posts: sorted };
}

async function main() {
  const found = [];
  const notes = [];
  if (process.env.BUFFER_API_KEY) {
    const { gql } = require("./buffer-queue");
    try {
      const entries = sentEntries(queues.read(queues.BUFFER));
      found.push(...await bufferNumbers(entries, gql));
      notes.push("Buffer: " + entries.length + " sent posts asked");
    } catch (error) {
      notes.push("Buffer kept the last numbers: " + error.message);
    }
  } else notes.push("Buffer skipped: no BUFFER_API_KEY");
  if (process.env.FACEBOOK_PAGE_TOKEN) {
    const entries = sentEntries(queues.read(queues.FACEBOOK), ["facebook"]);
    found.push(...await facebookNumbers(entries, process.env.FACEBOOK_PAGE_TOKEN, fetch));
    notes.push("Facebook: " + entries.length + " sent posts asked");
  } else notes.push("Facebook skipped: no FACEBOOK_PAGE_TOKEN");
  const open = queues.read(queues.OPEN_SOCIAL);
  const sky = sentEntries(open, ["bluesky"]);
  const toots = sentEntries(open, ["mastodon"]);
  found.push(...await blueskyNumbers(sky, fetch), ...await mastodonNumbers(toots, fetch));
  notes.push("Bluesky: " + sky.length + " and Mastodon: " + toots.length + " sent posts asked");
  const next = merge(read(), found, new Date().toISOString());
  fs.mkdirSync(path.dirname(path.join(ROOT, OUT)), { recursive: true });
  fs.writeFileSync(path.join(ROOT, OUT), JSON.stringify(next, null, 1) + "\n");
  console.log(notes.join("\n") + "\n" + Object.keys(next.posts).length + " posts with numbers in " + OUT);
}

if (require.main === module) main().catch((error) => { console.error(error); process.exit(1); });

module.exports = { METRICS, OUT, read, counts, fromBuffer, sentEntries, bufferNumbers, facebookNumbers, blueskyNumbers, mastodonNumbers, merge };
