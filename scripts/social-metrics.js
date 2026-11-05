#!/usr/bin/env node
/* Each sent post's numbers on every network, for the social hub's sort and the stats line on its cards (#1587).

     node scripts/social-metrics.js   # writes assets/social/metrics.json

   LinkedIn, TikTok, X and YouTube come from Buffer (Post.metrics, BUFFER_API_KEY), Facebook from the Graph API
   (FACEBOOK_PAGE_TOKEN, and FACEBOOK_PAGE_TOKEN_ES for @qaurlreview's Page, #2327), Bluesky and Mastodon from their
   public APIs (no key). Only ledger entries marked sent are asked about (assets/social/buffer.json, facebook.json,
   open-social.json). Jarvis > Business shows them per network and per clip (#2018).
   A network without its key, or one that fails, keeps the numbers of the last run, so a bad morning blanks nothing.
   scripts/build-social-hub.js writes them into the feed; auto-live-reports.yml runs this before it every day.

   Telegram's channel members come from the Bot API (getChatMemberCount, TELEGRAM_BOT_TOKEN and TELEGRAM_CHANNEL, #2570),
   one point a day, so Jarvis shows the count and its change over the selected range.

   { version: 1, updatedAt: "<ISO>", posts: { "<batch>/<slug>": { "<network>": { impressions, views, likes, shares, comments } } },
     pages: { "<Facebook Page profile>": { asked, answered, insights, error } or { skipped: "no FACEBOOK_PAGE_TOKEN..." } },
     channels: { telegram: { chat: "@qalab_live", members, at: "<ISO>", history: [{ date: "YYYY-MM-DD", members }], skipped?, error? } } }
   pages is this run's word from each Facebook Page; Jarvis reads it to say why a Page has no numbers (#2460).
   A skipped or failed Telegram run keeps the last count and history and says why in skipped or error. */

const fs = require("fs");
const path = require("path");
const queues = require("./social-ledger");
const faceRoute = require("./face-route");
const { FACES } = require("./brand-kit/faces");

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
  const out = { version: 1, updatedAt: String(data.updatedAt || ""), posts: data.posts && typeof data.posts === "object" ? data.posts : {} };
  if (data.channels && typeof data.channels === "object") out.channels = data.channels;
  return out;
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
// reactions are the same count under two names, so the larger one is kept. Reposts, retweets and reshares are shares.
function fromBuffer(metrics) {
  const by = {};
  (metrics || []).forEach((m) => { if (m && m.type) by[m.type] = Number(m.value) || 0; });
  return counts({ impressions: by.impressions || by.reach, views: by.views, likes: Math.max(by.likes || 0, by.reactions || 0),
    shares: Math.max(by.shares || 0, by.reposts || 0, by.retweets || 0, by.reshares || 0), comments: by.comments });
}

// Sent entries per network: [{ post, channel, id, url, profile? }]. url is what Mastodon needs to find its server.
function sentEntries(book, channels) {
  const list = [];
  Object.entries(book.posts || {}).forEach(([post, entries]) => (entries || []).forEach((entry) => {
    if (entry.result === "sent" && entry.id && (!channels || channels.includes(entry.channel))) {
      list.push(Object.assign({ post, channel: entry.channel, id: entry.id, url: entry.url || "" }, entry.profile ? { profile: entry.profile } : {}));
    }
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

// Meta retired post_impressions; post_media_view over the post's lifetime is its views. Insights come back empty, not
// refused, when the token lacks read_insights, and reactions and comments need pages_read_user_content (#2464), so a
// refused post still asks for insights and takes its reactions from them. Shares stay on the post object.
// report gets how many posts were asked, answered and had insights, and the first refusal, so a Page that answers
// nothing says why.
const INSIGHTS = "post_media_view,post_video_views,post_reactions_by_type_total";

function insightValues(data) {
  const out = {};
  (data || []).forEach((row) => {
    const value = row && row.values && row.values[0] ? row.values[0].value : 0;
    out[row.name] = value && typeof value === "object" ? Object.values(value).reduce((sum, n) => sum + (Number(n) || 0), 0) : Number(value) || 0;
  });
  return out;
}

async function facebookNumbers(entries, token, request, report = {}) {
  const found = [];
  Object.assign(report, { asked: entries.length, answered: 0, insights: 0 });
  const refused = (error) => { if (!report.error) report.error = error.message; };
  for (const entry of entries) {
    const qs = (params) => new URLSearchParams(Object.assign({ access_token: token }, params)).toString();
    let base = null;
    try {
      base = await graphJson(request, GRAPH + "/" + entry.id + "?" + qs({ fields: "comments.summary(true).limit(0),reactions.summary(true).limit(0),shares" }));
    } catch (error) {
      refused(error);
    }
    let insights = {};
    try {
      insights = insightValues((await graphJson(request, GRAPH + "/" + entry.id + "/insights?" + qs({ metric: INSIGHTS, period: "lifetime" }))).data);
    } catch (error) {
      refused(error);
    }
    const hasInsights = Object.keys(insights).length > 0;
    if (hasInsights) report.insights += 1;
    if (!base && !hasInsights) continue;
    report.answered += 1;
    const total = (edge) => (base && base[edge] && base[edge].summary && base[edge].summary.total_count) || 0;
    const likes = base && base.reactions ? total("reactions") : insights.post_reactions_by_type_total;
    const shares = base && base.shares ? base.shares.count : 0;
    found.push(Object.assign({}, entry, { numbers: counts({ impressions: insights.post_media_view, views: insights.post_video_views, likes, shares, comments: total("comments") }) }));
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

const TELEGRAM_API = "https://api.telegram.org/bot";
const HISTORY_DAYS = 400;

async function telegramMembers(token, chat, request) {
  const res = await request(TELEGRAM_API + token + "/getChatMemberCount?chat_id=" + encodeURIComponent(chat));
  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json.ok) throw new Error("Telegram " + res.status + ": " + String(json.description || "no answer").slice(0, 200));
  const members = Math.round(Number(json.result));
  if (!Number.isFinite(members) || members < 0) throw new Error("Telegram answered no member count");
  return members;
}

// One point per UTC day: a second run the same day replaces that day's count. Without a fresh count (read.members
// missing) the last count and history stay and read.skipped or read.error says why.
function telegramEntry(previous, read, at) {
  const old = previous && typeof previous === "object" ? previous : {};
  const history = (Array.isArray(old.history) ? old.history : []).filter((p) => p && /^\d{4}-\d{2}-\d{2}$/.test(p.date) && Number.isFinite(Number(p.members)));
  const entry = { chat: read.chat || old.chat || "" };
  if (Number.isFinite(read.members)) {
    const date = at.slice(0, 10);
    const kept = history.filter((p) => p.date !== date).concat({ date, members: read.members }).sort((a, b) => a.date.localeCompare(b.date));
    return Object.assign(entry, { members: read.members, at, history: kept.slice(-HISTORY_DAYS) });
  }
  if (Number.isFinite(Number(old.members))) Object.assign(entry, { members: Number(old.members), at: old.at || "" });
  entry.history = history.slice(-HISTORY_DAYS);
  if (read.skipped) entry.skipped = read.skipped;
  if (read.error) entry.error = read.error;
  return entry;
}

// Fresh numbers replace a network's old ones; networks not asked this run keep theirs, and so do channels.
function merge(previous, found, updatedAt, pages, channels) {
  const posts = JSON.parse(JSON.stringify(previous.posts || {}));
  found.forEach(({ post, channel, numbers }) => {
    posts[post] = posts[post] || {};
    if (Object.keys(numbers).length) posts[post][channel] = numbers;
    else delete posts[post][channel];
    if (!Object.keys(posts[post]).length) delete posts[post];
  });
  const sorted = Object.fromEntries(Object.keys(posts).sort().map((key) => [key, posts[key]]));
  const keep = channels || previous.channels;
  return Object.assign({ version: 1, updatedAt, posts: sorted }, pages ? { pages } : {}, keep ? { channels: keep } : {});
}

// A face's Facebook entries, read with its own Page token (#2327); entries from before the faces have no profile of
// another face, so they stay with the default one.
const pageEntries = (entries, face) => entries.filter((e) => (e.profile || faceRoute.pageProfile(faceRoute.DEFAULT)) === faceRoute.pageProfile(face));

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
  const facebook = sentEntries(queues.read(queues.FACEBOOK), ["facebook"]);
  const pages = {};
  for (const face of Object.keys(FACES)) {
    const token = faceRoute.faceEnv(face).FACEBOOK_PAGE_TOKEN;
    const profile = faceRoute.pageProfile(face);
    const entries = pageEntries(facebook, face);
    if (!token) {
      if (face === faceRoute.DEFAULT || entries.length) {
        pages[profile] = { skipped: "no FACEBOOK_PAGE_TOKEN" + FACES[face].env };
        notes.push(profile + " skipped: " + pages[profile].skipped);
      }
      continue;
    }
    pages[profile] = {};
    found.push(...await facebookNumbers(entries, token, fetch, pages[profile]));
    notes.push(profile + ": " + pages[profile].answered + " of " + entries.length + " sent posts answered, " + pages[profile].insights + " with insights" + (pages[profile].error ? "; first refusal: " + pages[profile].error : ""));
  }
  const open = queues.read(queues.OPEN_SOCIAL);
  const sky = sentEntries(open, ["bluesky"]);
  const toots = sentEntries(open, ["mastodon"]);
  found.push(...await blueskyNumbers(sky, fetch), ...await mastodonNumbers(toots, fetch));
  notes.push("Bluesky: " + sky.length + " and Mastodon: " + toots.length + " sent posts asked");
  const previous = read();
  const at = new Date().toISOString();
  const chat = process.env.TELEGRAM_CHANNEL || "";
  const tg = { chat };
  if (!process.env.TELEGRAM_BOT_TOKEN || !chat) tg.skipped = "no " + [!process.env.TELEGRAM_BOT_TOKEN && "TELEGRAM_BOT_TOKEN secret", !chat && "TELEGRAM_CHANNEL variable"].filter(Boolean).join(" or ");
  else {
    try { tg.members = await telegramMembers(process.env.TELEGRAM_BOT_TOKEN, chat, fetch); } catch (error) { tg.error = error.message; }
  }
  const telegram = telegramEntry((previous.channels || {}).telegram, tg, at);
  notes.push("Telegram " + (chat || "channel") + ": " + (tg.skipped ? "skipped, " + tg.skipped : tg.error ? "kept the last count, " + tg.error : tg.members + " members"));
  const next = merge(previous, found, at, pages, Object.assign({}, previous.channels, { telegram }));
  fs.mkdirSync(path.dirname(path.join(ROOT, OUT)), { recursive: true });
  fs.writeFileSync(path.join(ROOT, OUT), JSON.stringify(next, null, 1) + "\n");
  console.log(notes.join("\n") + "\n" + Object.keys(next.posts).length + " posts with numbers in " + OUT);
}

if (require.main === module) main().catch((error) => { console.error(error); process.exit(1); });

module.exports = { METRICS, OUT, read, counts, fromBuffer, sentEntries, pageEntries, bufferNumbers, facebookNumbers, blueskyNumbers, mastodonNumbers, telegramMembers, telegramEntry, merge };
