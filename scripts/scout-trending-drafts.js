#!/usr/bin/env node
/* Scout trending-tag drafts (#3814), DRAFT ONLY. It never posts and never calls a network.

   Input (first that exists): --tags "A,B,C" (a manual list), --file <json> (shape of scripts/trending-tags.json:
   { tags: [{ tag, topic, score }] } or a plain array of tags/strings), else scripts/trending-tags.json, which
   scripts/trending-tags.js fills from free sources (dev.to, Lobsters, Hacker News, Google Trends, Mastodon trends).
   Each tag is scored against the topics of our own posts (hashtags and words in assets/social/captions.json, read
   with engagement.js relevance), cleaned of spam and sensitive tags (engagement-trends.js clean), and turned into one
   playful draft per network where a hashtag in a reply is normal (TAG_NETWORKS). Drafts go to the review queue file
   assets/social/scout-drafts.json with status "draft" and noPost: true; Carlos reviews them in Jarvis. Nothing here sets
   trendSafe or an approved status, so no draft can go out on its own.

   Threads (#3814): a Mastodon row also carries the real thread it would answer, read from the instance's public tag
   timeline (no key): a recent English post under the tag that already has replies, not a reply itself, not sensitive,
   not drama. It is stored as row.thread (a link and a short excerpt) for review. Other networks have no free,
   keyless read, so their drafts stay tag-level. Reading never writes to a network; --no-threads skips the read.

     node scripts/scout-trending-drafts.js [--tags "A,B"] [--file f.json] [--networks x,bluesky] [--keep 5] [--out f.json] [--dry-run] [--no-threads] */
"use strict";

const fs = require("fs");
const path = require("path");
const E = require("../functions/engagement.js");
const T = require("../functions/engagement-trends.js");
const Sources = require("../functions/engagement-sources.js");

const ROOT = path.resolve(__dirname, "..");
const TRENDING_FILE = path.join(__dirname, "trending-tags.json");
const CAPTIONS_FILE = path.join(ROOT, "assets/social/captions.json");
const QUEUE_FILE = path.join(ROOT, "assets/social/scout-drafts.json");
const MAX_AGE_DAYS = 3;
const MAX_QUEUE = 200;
const THREAD_NETWORK = "mastodon";
const THREAD_MAX_AGE_MS = 2 * 86400000;
const THREAD_TIMEOUT_MS = 10000;

// Playful, short, no link, no pitch: a tag's draft gives a light take on the topic. The soft tool mention is added by
// Carlos at review (engagement.js SOFT: only when it flows, never twice in a thread).
const TAKES = {
  Testing: ["#TAG is trending and somewhere a flaky test just passed on the third retry. Suspicious.", "Everyone is talking about #TAG today. Meanwhile the real bug is the one that only shows up on Friday."],
  SEO: ["#TAG is everywhere today. Fun fact: half of SEO is checking the boring tags nobody looks at.", "Today's #TAG talk, in one line: the sitemap is always the last thing anyone checks."],
  GEO: ["#TAG is trending: now chatbots read your site too. Does yours answer them well?", "Funny how #TAG went from 'what is that' to 'why are we not in it' in a year."],
  Accessibility: ["#TAG today is a good reminder: if it only works with a mouse, it only half works.", "Tab through your own page once. #TAG people will thank you."],
  Performance: ["#TAG is trending and so is that 4 MB hero image. Coincidence?", "A fast site feels like good manners. #TAG"],
  Analytics: ["#TAG chatter is up. Reminder that a number you cannot explain is not a metric yet.", "Everyone loves #TAG until the dashboard disagrees with the other dashboard."],
  Security: ["#TAG is trending. Quick check that costs nothing: look at your own site's response headers.", "Every #TAG thread ends the same way: someone finds a header they forgot to set."],
  Privacy: ["#TAG is up today. The cookie banner is a good place to see how a site treats you.", "Privacy is mostly boring settings done on time. #TAG"],
  AI: ["#TAG is trending again. The useful question is still: what does it do to your site tomorrow?", "Everyone has a take on #TAG today. Mine: read the docs, then test it."],
  Trends: ["#TAG is trending and our field has opinions. What is yours?", "Today's #TAG mood: ship it, then check it."]
};
const FALLBACK = "Interesting to see #TAG rising today. What are you seeing on your side?";
const SCOUT_NETWORKS = T.TAG_NETWORKS.slice();

const hash = (s) => Array.from(String(s)).reduce((h, c) => Math.imul(h ^ c.codePointAt(0), 16777619) >>> 0, 2166136261);

/** Trending tags as [{ tag, topic, score }] from a file's parsed JSON, a plain list, or a "A,B" string. */
function parseTrends(input) {
  const raw = typeof input === "string" ? input.split(",") : Array.isArray(input) ? input : (input && input.tags) || [];
  const seen = new Set();
  return raw.map((r, i) => {
    const row = typeof r === "string" ? { tag: r } : r || {};
    return { tag: T.clean(row.tag), topic: row.topic || "", score: Number(row.score) > 0 ? Number(row.score) : Math.max(0.1, 1 - i / 100) };
  }).filter((r) => r.tag && !seen.has(r.tag.toLowerCase()) && seen.add(r.tag.toLowerCase()));
}

/** Topic -> share (0..1) of our own posts that touch it; posts: strings (captions) or { text }. */
function ownTopics(posts) {
  const count = {};
  let n = 0;
  (posts || []).forEach((p) => {
    const rel = E.relevance(typeof p === "string" ? p : (p && p.text) || "");
    rel.topics.forEach((t) => { count[t] = (count[t] || 0) + 1; });
    if (rel.topics.length) n += 1;
  });
  const share = {};
  Object.keys(count).forEach((t) => { share[t] = count[t] / Math.max(1, n); });
  return share;
}

/** One trend scored against our topics, or null when it is not about our field. */
function scoreTrend(trend, own) {
  const rel = E.relevance("#" + trend.tag);
  // The tag names a topic keyword itself, or its source topic is one our own posts cover.
  const topic = rel.topic || (trend.topic && own[trend.topic] ? trend.topic : "");
  if (!topic) return null;
  const fit = own[topic] || 0;
  const score = Math.round(trend.score * (1 + rel.hits) * (1 + fit) * 100) / 100;
  return { tag: trend.tag, topic, hits: rel.hits, fit: Math.round(fit * 100) / 100, score };
}

/** The draft text for a tag on a network, within its limit; "" when no network limit fits. */
function draftText(tag, topic, network) {
  const list = TAKES[topic] || [];
  const limit = (E.NETWORKS[network] || {}).limit || 300;
  const text = (list.length ? list[hash(tag + network) % list.length] : FALLBACK).replace(/#TAG/g, "#" + tag);
  return text.length <= limit ? text : "";
}

/**
 * The real thread under a tag to answer, from Mastodon statuses (the raw timeline), or null. A thread is a recent English
 * original post (not a reply, not a bot) that carries the tag, already has replies, and is neither sensitive nor drama.
 * Busiest first (replies count double). Pure: no network.
 */
function pickThread(tag, statuses, now) {
  const at = now || Date.now();
  const want = String(tag).toLowerCase();
  const found = (Array.isArray(statuses) ? statuses : []).filter((s) => s && !(s.account || {}).bot).map((s) => ({ raw: s, post: Sources.mastodonPost(s) })).filter(({ raw, post }) => {
    const lang = String((raw.reblog || raw).language || "").toLowerCase();
    const age = at - Date.parse(post.createdAt);
    return !post.isReply && lang === "en" && /^https:\/\//.test(post.url) && age >= 0 && age <= THREAD_MAX_AGE_MS
      && post.metrics.replies >= 1 && post.text.length >= 20
      && post.tags.some((t) => String(t).toLowerCase() === want)
      && !E.SENSITIVE.test(post.text) && !T.drama({ text: post.text });
  }).map(({ post }) => post);
  found.sort((a, b) => (b.metrics.replies * 2 + b.metrics.likes + b.metrics.reposts) - (a.metrics.replies * 2 + a.metrics.likes + a.metrics.reposts) || a.url.localeCompare(b.url));
  const best = found[0];
  if (!best) return null;
  return { network: THREAD_NETWORK, url: best.url, author: best.author.handle, excerpt: best.text.replace(/\s+/g, " ").slice(0, 200), replies: best.metrics.replies, likes: best.metrics.likes, createdAt: best.createdAt };
}

/** { tag: statuses[] } read from the instance's public tag timelines (GET only, no key). A failing tag gives no thread. */
async function readThreads(tags, opts) {
  const o = opts || {};
  const fetchImpl = o.fetch || fetch;
  const base = String(o.base || process.env.MASTODON_URL || "https://mastodon.social").replace(/\/+$/, "");
  const out = {};
  await Promise.all(tags.map(async (tag) => {
    try {
      const res = await fetchImpl(base + "/api/v1/timelines/tag/" + encodeURIComponent(tag) + "?limit=40", { signal: AbortSignal.timeout(THREAD_TIMEOUT_MS) });
      const list = res.ok ? await res.json() : [];
      out[tag] = Array.isArray(list) ? list : [];
    } catch (e) { out[tag] = []; }
  }));
  return out;
}

/**
 * Draft queue rows (never posted): the best `keep` scored tags, one per network in `networks`. A row has
 * status "draft", noPost true, and no trendSafe flag, so Jarvis shows it for review and nothing sends it.
 */
function buildDrafts(trends, own, opts) {
  const o = opts || {};
  const now = o.now || Date.now();
  const nets = (o.networks || SCOUT_NETWORKS).filter((n) => SCOUT_NETWORKS.includes(n));
  const scored = parseTrends(trends).map((t) => scoreTrend(t, own || {})).filter(Boolean).sort((a, b) => b.score - a.score || a.tag.localeCompare(b.tag)).slice(0, o.keep || 5);
  const rows = [];
  scored.forEach((s) => nets.forEach((network) => {
    const draft = draftText(s.tag, s.topic, network);
    if (!draft || E.SENSITIVE.test(draft) || T.drama({ text: draft })) return;
    const thread = network === THREAD_NETWORK && o.threads ? pickThread(s.tag, o.threads[s.tag], now) : null;
    const row = {
      id: "scout-" + s.tag.toLowerCase() + "-" + network + "-" + E.bogotaDay(now), kind: "scout-trend", network, tag: s.tag, topic: s.topic,
      score: s.score, hits: s.hits, fit: s.fit, draft, lang: "en", status: "draft", noPost: true, createdAt: new Date(now).toISOString()
    };
    if (thread) row.thread = thread;
    rows.push(row);
  }));
  return rows;
}

/**
 * The queue with rows added; a row already there (same id) is kept as Carlos left it, except that a still-undecided draft
 * with no thread gains the thread a later run found (its text is never touched). Newest first, bounded.
 */
function mergeQueue(queue, rows) {
  const fresh = new Map(rows.map((r) => [r.id, r]));
  const kept = (queue || []).map((r) => {
    const f = fresh.get(r.id);
    return f && f.thread && !r.thread && r.status === "draft" ? Object.assign({}, r, { thread: f.thread }) : r;
  });
  const have = new Set(kept.map((r) => r.id));
  return rows.filter((r) => !have.has(r.id)).concat(kept).slice(0, MAX_QUEUE);
}

const readJson = (file, fallback) => { try { return JSON.parse(fs.readFileSync(file, "utf8")); } catch (e) { return fallback; } };
const arg = (argv, name) => { const i = argv.indexOf("--" + name); return i > -1 && argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[i + 1] : ""; };

async function main(argv) {
  const manual = arg(argv, "tags");
  const file = arg(argv, "file") || TRENDING_FILE;
  let source = manual;
  if (!source) {
    const data = readJson(file, null);
    const age = data && data.date ? (Date.now() - Date.parse(data.date + "T00:00:00Z")) / 86400000 : 0;
    if (!data || age > MAX_AGE_DAYS) { console.log("scout drafts: no fresh trending tags (" + path.relative(ROOT, file) + "); pass --tags or run scripts/trending-tags.js"); return 0; }
    source = data;
  }
  const own = ownTopics(Object.values(readJson(CAPTIONS_FILE, {})).flatMap((v) => (v && typeof v === "object" ? Object.values(v) : [v])));
  const nets = arg(argv, "networks");
  const keep = Number(arg(argv, "keep")) || 5;
  const networks = nets ? nets.split(",") : undefined;
  let threads;
  if (!argv.includes("--no-threads") && (networks || SCOUT_NETWORKS).includes(THREAD_NETWORK)) {
    const tags = [...new Set(buildDrafts(source, own, { keep, networks: [THREAD_NETWORK] }).map((r) => r.tag))];
    threads = await readThreads(tags);
  }
  const rows = buildDrafts(source, own, { keep, networks, threads });
  const Learn = require("../functions/scout-learn");
  const learned = Learn.learnFile("trending", {
    drafts: rows.length,
    tags: new Set(rows.map((r) => r.tag)).size,
  });
  if (learned.asked.length) console.log("scout learn asks Carlos: " + learned.asked.map((q) => q.text).join(" | "));
  const out = arg(argv, "out") || QUEUE_FILE;
  if (argv.includes("--dry-run")) { rows.forEach((r) => console.log(r.network + " #" + r.tag + " (" + r.topic + ", " + r.score + "): " + r.draft + (r.thread ? " [thread " + r.thread.url + "]" : ""))); console.log("scout drafts: " + rows.length + " drafts, dry run, nothing written"); return 0; }
  fs.writeFileSync(out, JSON.stringify(mergeQueue(readJson(out, []), rows), null, 1) + "\n");
  await Learn.syncFile("trending").catch(() => null);
  console.log("scout drafts: " + rows.length + " drafts (" + rows.filter((r) => r.thread).length + " with a thread) in " + path.relative(ROOT, out) + "; none posted");
  return 0;
}

if (require.main === module) main(process.argv.slice(2)).then((code) => process.exit(code), (e) => { console.error("scout drafts: " + (e && e.message)); process.exit(1); });

module.exports = { pickThread, readThreads, parseTrends, ownTopics, scoreTrend, draftText, buildDrafts, mergeQueue, TAKES, SCOUT_NETWORKS };
