"use strict";
/*
 * Where the engagement scout reads (#1988). Each reader returns posts in one shape:
 *   { network, id, cid?, url, author: { handle, name, id, followers }, title?, text, lang, createdAt, isReply,
 *     metrics: { likes, replies, reposts, views }, tags }
 * A reader without its key is skipped, and a failing one never stops the others. Queries rotate with the
 * half-hour slot so each run asks a little and the day covers every query.
 *
 *   Mastodon   tag timelines and trending posts, no token (MASTODON_URL, default mastodon.social)
 *   Bluesky    post search, which needs a login: BLUESKY_HANDLE and BLUESKY_APP_PASSWORD (BLUESKY_SERVICE)
 *   YouTube    videos of the last 3 days by views, every other slot (search costs 100 of the 10,000 daily units): YOUTUBE_KEY
 *   Hacker News, DEV and Lobsters: read for trends only
 * X, LinkedIn, Facebook, Instagram, Threads and TikTok are read by the Mac's browser (#1991).
 */
const SLOT = 30 * 60 * 1000;
const TIMEOUT = 12000;

const MASTODON_TAGS = ["a11y", "accessibility", "webperf", "corewebvitals", "seo", "softwaretesting", "testautomation", "playwright", "qa", "webdev", "wcag", "technicalseo", "webaccessibility", "ga4", "privacy"];
const BLUESKY_QUERIES = ["accessibility", "a11y", "web performance", "core web vitals", "SEO", "technical SEO", "playwright", "software testing", "test automation", "WCAG", "AI overviews", "GA4"];
const YOUTUBE_QUERIES = ["web accessibility", "core web vitals", "technical seo", "playwright testing", "test automation", "seo ai overviews", "wcag", "website speed"];
const HN_QUERIES = ["accessibility", "playwright", "SEO", "web performance", "testing", "Core Web Vitals", "WCAG", "Google Search"];
const DEV_TAGS = ["a11y", "testing", "seo", "webperf", "playwright", "qa"];

const pick = (list, slot, n) => Array.from({ length: Math.min(n, list.length) }, (_, i) => list[(slot * n + i) % list.length]);
const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const ENTITIES = { amp: "&", lt: "<", gt: ">", quot: '"', "#39": "'", apos: "'", nbsp: " " };
const plain = (html) => String(html || "").replace(/<br\s*\/?>|<\/p>/gi, "\n").replace(/<[^>]+>/g, "").replace(/&(amp|lt|gt|quot|#39|apos|nbsp);/g, (m, k) => ENTITIES[k]).trim();

async function getJson(fetchImpl, url, opts) {
  const res = await fetchImpl(url, Object.assign({ signal: AbortSignal.timeout(TIMEOUT) }, opts || {}));
  if (!res.ok) throw new Error(url.replace(/[?#].*$/, "").replace(/^https:\/\//, "") + " answered " + res.status);
  return res.json();
}

function mastodonPost(s) {
  const st = s.reblog || s;
  const acct = st.account || {};
  return {
    network: "mastodon", id: st.uri || st.url || String(st.id), url: st.url || st.uri || "", localId: String(s.id || ""),
    author: { handle: acct.acct || acct.username || "", name: acct.display_name || acct.username || "", id: acct.url || "", followers: num(acct.followers_count), bot: acct.bot === true },
    text: plain(st.content), lang: st.language || "", createdAt: st.created_at || "", isReply: !!st.in_reply_to_id,
    metrics: { likes: num(st.favourites_count), replies: num(st.replies_count), reposts: num(st.reblogs_count), views: 0 },
    tags: (st.tags || []).map((t) => t.name).filter(Boolean)
  };
}

async function mastodon(ctx) {
  const base = String(ctx.env.MASTODON_URL || "https://mastodon.social").replace(/\/+$/, "");
  const urls = pick(MASTODON_TAGS, ctx.slot, 4).map((t) => base + "/api/v1/timelines/tag/" + encodeURIComponent(t) + "?limit=30")
    .concat([base + "/api/v1/trends/statuses?limit=30"]);
  const lists = await Promise.all(urls.map((u) => getJson(ctx.fetch, u).catch((error) => ({ error }))));
  const failed = lists.filter((l) => l && l.error);
  if (failed.length === lists.length) throw failed[0].error;
  return lists.filter(Array.isArray).flat().filter((s) => !(s.account || {}).bot).map(mastodonPost);
}

function blueskyPost(p) {
  const a = p.author || {};
  const r = p.record || {};
  const rkey = String(p.uri || "").split("/").pop();
  return {
    network: "bluesky", id: p.uri, cid: p.cid, url: "https://bsky.app/profile/" + (a.handle || a.did) + "/post/" + rkey,
    author: { handle: a.handle || "", name: a.displayName || a.handle || "", id: a.did || "", followers: 0 },
    text: String(r.text || ""), lang: (r.langs || [])[0] || "", createdAt: r.createdAt || p.indexedAt || "", isReply: !!r.reply,
    metrics: { likes: num(p.likeCount), replies: num(p.replyCount), reposts: num(p.repostCount) + num(p.quoteCount), views: 0 },
    tags: (r.facets || []).flatMap((f) => (f.features || []).filter((x) => x.tag).map((x) => x.tag))
  };
}

/** A Bluesky session for reading (and, in #1990, acting). */
async function blueskySession(ctx) {
  const service = String(ctx.env.BLUESKY_SERVICE || "https://bsky.social").replace(/\/+$/, "");
  const s = await getJson(ctx.fetch, service + "/xrpc/com.atproto.server.createSession", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ identifier: ctx.env.BLUESKY_HANDLE, password: ctx.env.BLUESKY_APP_PASSWORD })
  });
  return { service, token: s.accessJwt, did: s.did, handle: s.handle };
}

async function bluesky(ctx) {
  const session = await blueskySession(ctx);
  const since = new Date(ctx.now - 2 * 24 * 3600000).toISOString();
  const lists = await Promise.all(pick(BLUESKY_QUERIES, ctx.slot, 3).map((q) => getJson(ctx.fetch,
    session.service + "/xrpc/app.bsky.feed.searchPosts?sort=top&limit=30&since=" + encodeURIComponent(since) + "&q=" + encodeURIComponent(q),
    { headers: { Authorization: "Bearer " + session.token } }).catch(() => ({ posts: [] }))));
  return lists.flatMap((l) => l.posts || []).map(blueskyPost);
}

async function youtube(ctx) {
  if (ctx.slot % 2) return [];
  const key = ctx.env.YOUTUBE_KEY;
  const q = pick(YOUTUBE_QUERIES, ctx.slot / 2, 1)[0];
  const after = new Date(ctx.now - 3 * 24 * 3600000).toISOString();
  const found = await getJson(ctx.fetch, "https://www.googleapis.com/youtube/v3/search?part=id&type=video&order=viewCount&maxResults=15&publishedAfter=" + encodeURIComponent(after) + "&q=" + encodeURIComponent(q) + "&key=" + encodeURIComponent(key));
  const ids = (found.items || []).map((i) => i.id && i.id.videoId).filter(Boolean);
  if (!ids.length) return [];
  const vids = await getJson(ctx.fetch, "https://www.googleapis.com/youtube/v3/videos?part=snippet,statistics&id=" + ids.join(",") + "&key=" + encodeURIComponent(key));
  return (vids.items || []).map((v) => {
    const sn = v.snippet || {};
    const st = v.statistics || {};
    return {
      network: "youtube", id: v.id, url: "https://www.youtube.com/watch?v=" + v.id,
      author: { handle: sn.channelTitle || "", name: sn.channelTitle || "", id: sn.channelId || "", followers: 0 },
      title: sn.title || "", text: String(sn.description || "").slice(0, 800), lang: sn.defaultAudioLanguage || sn.defaultLanguage || "", createdAt: sn.publishedAt || "", isReply: false,
      metrics: { likes: num(st.likeCount), replies: num(st.commentCount), reposts: 0, views: num(st.viewCount) }, tags: (sn.tags || []).slice(0, 10)
    };
  });
}

async function hn(ctx) {
  const since = Math.floor((ctx.now - 2 * 24 * 3600000) / 1000);
  const lists = await Promise.all(pick(HN_QUERIES, ctx.slot, 2).map((q) => getJson(ctx.fetch,
    "https://hn.algolia.com/api/v1/search?tags=story&hitsPerPage=20&query=" + encodeURIComponent(q) + "&numericFilters=" + encodeURIComponent("created_at_i>" + since))));
  return lists.flatMap((l) => l.hits || []).map((h) => ({
    network: "hn", id: h.objectID, url: "https://news.ycombinator.com/item?id=" + h.objectID, author: { handle: h.author || "", name: h.author || "", id: "", followers: 0 },
    title: h.title || "", text: h.url || "", lang: "en", createdAt: h.created_at || "", isReply: false,
    metrics: { likes: num(h.points), replies: num(h.num_comments), reposts: 0, views: 0 }, tags: []
  }));
}

async function devto(ctx) {
  const tag = pick(DEV_TAGS, ctx.slot, 1)[0];
  const list = await getJson(ctx.fetch, "https://dev.to/api/articles?top=2&per_page=15&tag=" + encodeURIComponent(tag));
  return (Array.isArray(list) ? list : []).map((a) => ({
    network: "devto", id: String(a.id), url: a.url, author: { handle: (a.user || {}).username || "", name: (a.user || {}).name || "", id: "", followers: 0 },
    title: a.title || "", text: a.description || "", lang: "en", createdAt: a.published_at || "", isReply: false,
    metrics: { likes: num(a.public_reactions_count), replies: num(a.comments_count), reposts: 0, views: 0 }, tags: a.tag_list || []
  }));
}

async function lobsters(ctx) {
  const list = await getJson(ctx.fetch, "https://lobste.rs/hottest.json");
  return (Array.isArray(list) ? list : []).map((s) => ({
    network: "lobsters", id: s.short_id, url: s.comments_url || s.short_id_url, author: { handle: (s.submitter_user || {}).username || s.submitter_user || "", name: "", id: "", followers: 0 },
    title: s.title || "", text: s.description_plain || s.url || "", lang: "en", createdAt: s.created_at || "", isReply: false,
    metrics: { likes: num(s.score), replies: num(s.comment_count), reposts: 0, views: 0 }, tags: s.tags || []
  }));
}

// [network, reader, what it needs in env (all of them), what to do when it is missing]
const READERS = [
  ["mastodon", mastodon, [], ""],
  ["bluesky", bluesky, ["BLUESKY_HANDLE", "BLUESKY_APP_PASSWORD"], "Bluesky search needs a login: set BLUESKY_HANDLE and BLUESKY_APP_PASSWORD in Secret Manager (#1990)."],
  ["youtube", youtube, ["YOUTUBE_KEY"], "YouTube: YOUTUBE_KEY is not set for the engagement scout."],
  ["hn", hn, [], ""],
  ["devto", devto, [], ""],
  ["lobsters", lobsters, [], ""]
];

/** Which networks the scout can read now, and what each one missing needs. */
function readable(env) {
  return READERS.map(([network, , needs, help]) => ({ network, ok: needs.every((k) => env && env[k]), help: needs.every((k) => env && env[k]) ? "" : help }));
}

/** Every reader in parallel: { posts, read: { network: n }, errors: { network: message }, skipped: [network] }. */
async function readAll(ctx) {
  const c = Object.assign({ slot: Math.floor(ctx.now / SLOT) }, ctx);
  const out = { posts: [], read: {}, errors: {}, skipped: [] };
  await Promise.all(READERS.map(async ([network, reader, needs]) => {
    if (!needs.every((k) => c.env && c.env[k])) { out.skipped.push(network); return; }
    try {
      const posts = (await reader(c)).filter((p) => p && p.id && p.url);
      out.read[network] = posts.length;
      out.posts.push(...posts);
    } catch (error) {
      out.errors[network] = String((error && error.message) || error).slice(0, 200);
    }
  }));
  return out;
}

module.exports = { readAll, readable, blueskySession, mastodonPost, blueskyPost, plain, pick, READERS, SLOT };
