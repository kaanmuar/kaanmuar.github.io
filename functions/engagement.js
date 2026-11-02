"use strict";
/*
 * Social engagement (#1988): what the scout does with each post it reads, without I/O, so tests/unit can run it.
 *
 * Every 30 minutes engagementScout (functions/index.js) reads our field's posts on each network
 * (functions/engagement-sources.js), keeps the ones that name a TOPICS keyword, scores them, asks Gemini what the
 * best ones are about and whether a reply is worth it, and decides per post: like, repost, follow, reply.
 * Likes, reposts and follows are planned on their own within the daily caps; a reply waits for Carlos in Jarvis
 * (push with Approve, Edit, Dismiss) and expires after REPLY_TTL. Phase 1 (#1989) plans; the APIs (#1990) and the
 * Mac's browser (#1991) carry the plan out.
 *
 *   score     = weight x (1 + relevance) x (1 + trend) x freshness
 *   relevance  distinct topic keywords the post names, at most 6
 *   trend      log2(1 + velocity / (scale / 10)), velocity = (likes + 2 replies + 3 reposts + views / 100) / hours^0.8
 *   freshness  halves every 24 hours
 */
const crypto = require("crypto");

const HOUR = 3600000;
const DAY = 24 * HOUR;
const REPLY_TTL = 6 * HOUR;
const LANGS = ["en", "es", "pt", "de", "fr", "it"];
const ACTIONS = ["like", "repost", "follow", "reply"];

// acts: the network takes likes, reposts, follows and replies (through its API, or the Mac's browser when browser).
// only: the actions it has when not all four (YouTube has no repost; a follow is a subscribe there).
// limit: the longest reply it takes. scale: how much engagement an hour counts as trending there.
// caps: a browser network's own daily ceiling under the settings' caps, the most an account takes from a real
// browser without the network flagging it as automated (#1991); LinkedIn and Facebook flag soonest.
const NETWORKS = {
  bluesky: { name: "Bluesky", acts: true, api: true, limit: 300, scale: 20, weight: 1 },
  mastodon: { name: "Mastodon", acts: true, api: true, limit: 500, scale: 10, weight: 1 },
  youtube: { name: "YouTube", acts: true, api: true, only: ["like", "follow", "reply"], limit: 500, scale: 200, weight: 0.9 },
  x: { name: "X", acts: true, browser: true, limit: 280, scale: 40, weight: 1, caps: { like: 50, repost: 10, follow: 15, reply: 10 } },
  linkedin: { name: "LinkedIn", acts: true, browser: true, limit: 1200, scale: 15, weight: 1.2, caps: { like: 25, repost: 3, follow: 10, reply: 8 } },
  facebook: { name: "Facebook", acts: true, browser: true, only: ["like", "reply"], limit: 1000, scale: 20, weight: 0.8, caps: { like: 25, reply: 6 } },
  instagram: { name: "Instagram", acts: true, browser: true, only: ["like", "follow", "reply"], limit: 1000, scale: 60, weight: 0.8, caps: { like: 50, follow: 15, reply: 8 } },
  threads: { name: "Threads", acts: true, browser: true, limit: 500, scale: 30, weight: 0.9, caps: { like: 50, repost: 10, follow: 15, reply: 10 } },
  tiktok: { name: "TikTok", acts: true, browser: true, only: ["like", "follow", "reply"], limit: 150, scale: 300, weight: 0.8, caps: { like: 50, follow: 15, reply: 8 } },
  hn: { name: "Hacker News", acts: false, scale: 30, weight: 1 },
  devto: { name: "DEV", acts: false, scale: 20, weight: 0.8 },
  lobsters: { name: "Lobsters", acts: false, scale: 10, weight: 0.9 }
};

// Our field, as in scripts/field-sweep/sources.js, plus the web security and privacy a URL review checks.
const TOPICS = {
  Testing: ["test automation", "automated testing", "software testing", "testautomation", "softwaretesting", "unit testing", "e2e testing", "end-to-end testing", "api testing", "load testing", "visual testing", "flaky tests?", "quality assurance", "qa engineers?", "qa", "testers?", "playwright", "cypress", "selenium", "webdriver", "test suites?"],
  SEO: ["seo", "search console", "googlebot", "crawl budget", "indexing", "structured data", "schema\\.org", "core update", "search ranking", "sitemaps?", "canonical", "backlinks?", "technical seo"],
  GEO: ["generative engine optimi[sz]ation", "ai overviews?", "ai mode", "llms\\.txt", "ai search", "answer engine", "chatgpt search", "perplexity", "geo"],
  Accessibility: ["accessibility", "a11y", "wcag", "aria", "screen readers?", "inclusive design", "colou?r contrast", "keyboard navigation", "european accessibility act", "eaa", "ada compliance"],
  Performance: ["web performance", "webperf", "core web vitals", "corewebvitals", "inp", "lcp", "cls", "page ?speed", "lighthouse", "load time", "time to first byte", "ttfb", "speculation rules"],
  Analytics: ["ga4", "google analytics", "tag manager", "gtm", "conversion tracking", "server-side tagging", "consent mode"],
  Security: ["security headers", "content security policy", "csp", "hsts", "owasp", "xss", "tls certificates?", "web security", "websecurity"],
  Privacy: ["gdpr", "cookie banners?", "cookie consent", "privacy policy", "dsgvo", "rgpd", "lgpd"]
};
const TOPIC_RES = Object.fromEntries(Object.entries(TOPICS).map(([t, words]) => [t, words.map((w) => [w, new RegExp("(^|[^\\p{L}\\p{N}])#?" + w + "($|[^\\p{L}\\p{N}])", "iu")])]));

// As scripts/trending-tags.js: no post rides on news about deaths, wars, elections or layoffs. Words our field also
// uses ("dead links", "killed the process", "fired an event") are left to Gemini's political and tone flags.
const SENSITIVE = /\b(dies|died|death|rip|passed away|condolences|murder\w*|shooting|war|terror\w*|bomb\w*|hostage|election\w*|vote|president|senat\w*|congress|gaza|israel|ukraine|russia|earthquake|hurricane|flood\w*|wildfire|funeral|suicide|abuse|arrest\w*|detention|deport\w*|immigration|lawsuit|sued|layoffs?|scandal|trump|biden|maga|nazi\w*|genocide)\b/i;
const HASHTAG_SPAM = 8;

// Vendors whose own posts we never answer under; edited in Jarvis > Engagement > Settings.
const COMPETITORS = ["semrush", "ahrefs", "moz", "screamingfrog", "screaming frog", "sitebulb", "seranking", "se ranking", "browserstack", "lambdatest", "saucelabs", "sauce labs", "accessibe", "userway", "siteimprove", "audioeye", "gtmetrix", "pingdom", "debugbear", "contentsquare", "hotjar", "conductor", "brightedge"];

// live: planned likes, reposts and follows are carried out; off (the default, a dry run) marks them "dry" instead.
// Approved replies go out either way: Carlos approved each one.
const DEFAULTS = {
  paused: false,
  live: false,
  caps: { reply: 15, like: 60, repost: 15, follow: 15 },
  thresholds: { like: 1.5, repost: 3, follow: 3.5, reply: 2 },
  worth: 0.6,
  maxAgeHours: 48,
  perRun: 12,
  competitors: COMPETITORS,
  own: ["carlosandmunoz", "qalabreview", "kaanmuar"]
};

const clip = (v, n) => String(v == null ? "" : v).replace(/\s+/g, " ").trim().slice(0, n);
const num = (v) => (Number.isFinite(Number(v)) && Number(v) >= 0 ? Number(v) : 0);
const round = (n, d) => Math.round(n * 10 ** (d || 2)) / 10 ** (d || 2);
const lower = (list) => (Array.isArray(list) ? list : []).map((s) => clip(s, 60).toLowerCase()).filter(Boolean);

/** The stored settings with every field present and in range. */
function settings(doc) {
  const d = doc || {};
  const capsIn = d.caps || {};
  const thIn = d.thresholds || {};
  const between = (v, lo, hi, fb) => (Number.isFinite(Number(v)) ? Math.min(hi, Math.max(lo, Number(v))) : fb);
  return {
    paused: d.paused === true,
    live: d.live === true,
    liveAt: clip(d.liveAt, 30),
    caps: Object.fromEntries(ACTIONS.map((a) => [a, Math.round(between(capsIn[a], 0, 500, DEFAULTS.caps[a]))])),
    thresholds: Object.fromEntries(ACTIONS.map((a) => [a, between(thIn[a], 0, 1000, DEFAULTS.thresholds[a])])),
    worth: between(d.worth, 0, 1, DEFAULTS.worth),
    maxAgeHours: between(d.maxAgeHours, 1, 24 * 14, DEFAULTS.maxAgeHours),
    perRun: Math.round(between(d.perRun, 0, 30, DEFAULTS.perRun)),
    competitors: Array.isArray(d.competitors) ? lower(d.competitors).slice(0, 200) : DEFAULTS.competitors.slice(),
    own: Array.isArray(d.own) ? lower(d.own).slice(0, 40) : DEFAULTS.own.slice(),
    updatedAt: clip(d.updatedAt, 30),
    by: clip(d.by, 120)
  };
}

/** A settings change from Jarvis, merged over the current settings. Throws on nothing to change. */
function settingsPatch(current, body) {
  const b = body || {};
  const next = Object.assign({}, current);
  let changed = false;
  if (typeof b.paused === "boolean") { next.paused = b.paused; changed = true; }
  if (typeof b.live === "boolean") { next.live = b.live; changed = true; }
  ["caps", "thresholds"].forEach((k) => { if (b[k] && typeof b[k] === "object") { next[k] = Object.assign({}, current[k], b[k]); changed = true; } });
  ["worth", "maxAgeHours", "perRun"].forEach((k) => { if (b[k] !== undefined) { next[k] = b[k]; changed = true; } });
  ["competitors", "own"].forEach((k) => {
    if (b[k] === undefined) return;
    next[k] = Array.isArray(b[k]) ? b[k] : String(b[k]).split(/[\n,]+/);
    changed = true;
  });
  if (!changed) throw new Error("Nothing to change.");
  return settings(next);
}

const keyOf = (network, id) => network + "_" + crypto.createHash("sha1").update(String(id)).digest("hex").slice(0, 20);

/** Topic keyword hits: the topic named most, every topic named, and the keywords. */
function relevance(text) {
  const t = String(text || "");
  const byTopic = {};
  const words = [];
  Object.entries(TOPIC_RES).forEach(([topic, res]) => {
    res.forEach(([w, re]) => { if (re.test(t)) { byTopic[topic] = (byTopic[topic] || 0) + 1; words.push(w.replace(/\\\./g, ".").replace(/\[(.)[^\]]*\]/g, "$1").replace(/ ?\?|\\/g, (m) => (m === " ?" ? " " : ""))); } });
  });
  const ranked = Object.entries(byTopic).sort((a, b) => b[1] - a[1]);
  return { hits: Math.min(6, words.length), topic: ranked.length ? ranked[0][0] : "", topics: ranked.map(([k]) => k), words: words.slice(0, 12) };
}

function ageHours(post, now) {
  const at = Date.parse(post && post.createdAt);
  return Number.isFinite(at) ? Math.max(0.25, (now - at) / HOUR) : 24;
}

function trend(post, now) {
  const net = NETWORKS[post.network] || { scale: 20 };
  const m = post.metrics || {};
  const weighted = num(m.likes) + 2 * num(m.replies) + 3 * num(m.reposts) + num(m.views) / 100;
  const velocity = weighted / Math.pow(ageHours(post, now), 0.8);
  return round(Math.log2(1 + velocity / (net.scale / 10)));
}

function score(post, now) {
  const net = NETWORKS[post.network] || { weight: 1 };
  const rel = relevance([post.title, post.text, (post.tags || []).map((t) => "#" + t).join(" ")].join("\n"));
  const tr = trend(post, now);
  const fresh = Math.pow(0.5, ageHours(post, now) / 24);
  return { relevance: rel.hits, topic: rel.topic, topics: rel.topics, words: rel.words, trend: tr, score: round(net.weight * (1 + rel.hits) * (1 + tr) * fresh) };
}

const lang2 = (v) => String(v || "").toLowerCase().slice(0, 2);
const has = (hay, list) => list.find((w) => w && hay.includes(w)) || "";

/** Why a post is left alone whatever it scores, or "". */
function guard(post, conf, now) {
  const a = post.author || {};
  const who = [a.handle, a.name, a.url].map((s) => String(s || "").toLowerCase()).join(" ");
  const text = [post.title, post.text].join(" ");
  if (has(who + " " + String(post.url || "").toLowerCase(), conf.own) || /carlosandmunoz\.com|qalabreview\.com/i.test(text)) return "own";
  if (has(who, conf.competitors)) return "competitor";
  if (SENSITIVE.test(text)) return "sensitive";
  if ((String(post.text || "").match(/(^|\s)#[\p{L}\p{N}_]+/gu) || []).length > HASHTAG_SPAM) return "spam";
  if (ageHours(post, now) > conf.maxAgeHours) return "old";
  return "";
}

/** The Gemini prompt for a batch of posts: what each is about, its tone, and a reply when one adds something. */
function aiPrompt(items) {
  const list = items.map((p) => ({
    id: p.key, network: (NETWORKS[p.network] || {}).name || p.network, lang: lang2(p.lang) || "?", author: clip((p.author || {}).name || (p.author || {}).handle, 60),
    title: clip(p.title, 160), text: clip(p.text, 900), likes: num((p.metrics || {}).likes), replies: num((p.metrics || {}).replies), reposts: num((p.metrics || {}).reposts),
    topic: p.topic, maxReply: (NETWORKS[p.network] || {}).limit || 300
  }));
  return [
    "You help Carlos & Munoz (carlosandmunoz.com), a small consultancy for QA and test automation, SEO and GEO, web accessibility, web performance, analytics and web security, take part in conversations on social networks.",
    "For each post below, return one JSON object in a JSON array, same order, with exactly these keys:",
    '{"id": same id, "about": what the post is about in at most 20 English words, "lang": the post\'s language as an ISO 639-1 code, "sentiment": "positive" | "neutral" | "negative" | "angry", "political": true when it is about politics, elections, wars or culture-war topics, "argument": true when the thread is a fight or a pile-on, "asksForTool": true only when the post asks for a tool, service or audit, "promo": true when the post advertises the author\'s own product, service, course or tool, "worth": 0 to 1, how much a short expert reply from us would add to this conversation, "why": at most 15 English words, "reply": the reply, or "" when worth is under 0.6 or the post is political, angry, an argument or promo}',
    "Reply rules: write in the post's language (en, es, pt, de, fr or it; otherwise reply \"\"). Speak as a helpful practitioner, first person plural, friendly and specific, in one to three short sentences. Open with the substance, not with praise. Add one concrete insight, tip, caveat or question that the post did not already say, about the post's own subject; never steer the conversation toward our services or other areas. Address people as tú in Spanish, você in Portuguese, tu in Italian, Sie in German and vous in French.",
    "Never: a link or a website address unless asksForTool is true (then at most one mention of carlosandmunoz.com), a sales pitch, hashtags, more than one emoji, em dashes, flattery like \"Great post!\" or \"impressive\", made-up numbers or studies, claims about work we did, or anything about the author's person. Stay under maxReply characters.",
    "Posts:",
    JSON.stringify(list)
  ].join("\n");
}

const URLS = /\bhttps?:\/\/\S+|\b(?:www\.)?[a-z0-9-]+\.(?:com|net|org|io|dev|app|co)\b\S*/gi;

/** Gemini's answer as rows by id; a reply loses links unless the post asked for a tool, and is cut to the network's limit. */
function parseAi(text, items) {
  let rows;
  try { rows = JSON.parse(String(text || "").replace(/^```(?:json)?|```$/gm, "").trim()); } catch (error) { return {}; }
  if (!Array.isArray(rows)) return {};
  const byKey = Object.fromEntries((items || []).map((p) => [p.key, p]));
  const out = {};
  rows.forEach((r) => {
    const p = r && byKey[r.id];
    if (!p) return;
    const ask = r.asksForTool === true;
    let reply = String(r.reply || "").trim();
    if (!ask) reply = reply.replace(URLS, "").replace(/\s{2,}/g, " ").trim();
    reply = reply.replace(/(^|\s)#[\p{L}\p{N}_]+/gu, "$1").replace(/\s*—\s*/g, ", ").trim();
    const limit = (NETWORKS[p.network] || {}).limit || 300;
    if (reply.length > limit) reply = reply.slice(0, limit - 1).replace(/\s+\S*$/, "") + "…";
    out[r.id] = {
      about: clip(r.about, 200), lang: lang2(r.lang) || lang2(p.lang), sentiment: ["positive", "neutral", "negative", "angry"].includes(r.sentiment) ? r.sentiment : "neutral",
      political: r.political === true, argument: r.argument === true, promo: r.promo === true, asksForTool: ask, worth: Math.min(1, Math.max(0, Number(r.worth) || 0)), why: clip(r.why, 160),
      reply: reply.length >= 12 ? reply : ""
    };
  });
  return out;
}

/** used[network][action] counts what today's runs already planned; decide adds to it. */
function capped(used, network, action, conf) {
  const n = ((used[network] || {})[action]) || 0;
  const own = ((NETWORKS[network] || {}).caps || {})[action];
  return n >= Math.min(conf.caps[action], own === undefined ? Infinity : own);
}
function take(used, network, action) {
  used[network] = used[network] || {};
  used[network][action] = (used[network][action] || 0) + 1;
}

/**
 * What to do with one new post. Returns { verdict, skip, actions }: verdict "engage" (at least one action),
 * "watch" (in the field, nothing to do), "trend" (a network we only read) or "skip" (skip says why).
 * Each action is { status } with planned, waiting (a reply for Carlos), capped or paused.
 */
function decide(post, ai, conf, used, now, followed) {
  const net = NETWORKS[post.network] || {};
  if (!net.acts) return { verdict: "trend", skip: "", actions: {} };
  const why = guard(post, conf, now);
  if (why) return { verdict: "skip", skip: why, actions: {} };
  const a = ai || null;
  if (a && (a.political || a.argument || a.promo || a.sentiment === "angry")) return { verdict: "skip", skip: a.political ? "political" : a.argument ? "argument" : a.promo ? "promo" : "angry", actions: {} };
  const actions = {};
  const plan = (action, ok, extra) => {
    if (!ok || (net.only && !net.only.includes(action))) return;
    if (conf.paused) actions[action] = { status: "paused" };
    else if (capped(used, post.network, action, conf)) actions[action] = { status: "capped" };
    else { take(used, post.network, action); actions[action] = Object.assign({ status: "planned" }, extra || {}); }
  };
  const s = post.score || 0;
  const handle = String((post.author || {}).handle || "").toLowerCase();
  plan("like", s >= conf.thresholds.like);
  plan("repost", s >= conf.thresholds.repost && !post.isReply && (!a || a.sentiment !== "negative"));
  plan("follow", s >= conf.thresholds.follow && handle && !(followed && followed.has(post.network + ":" + handle)));
  const lang = (a && a.lang) || lang2(post.lang);
  if (a && a.reply && a.worth >= conf.worth && s >= conf.thresholds.reply && LANGS.includes(lang)) {
    plan("reply", true, { draft: a.reply, lang, expiresAt: new Date(now + REPLY_TTL).toISOString() });
    if (actions.reply && actions.reply.status === "planned") actions.reply.status = "waiting";
  }
  return { verdict: Object.values(actions).some((x) => x.status === "planned" || x.status === "waiting") ? "engage" : "watch", skip: "", actions };
}

/** A post kept on "watch" whose score now clears an action threshold is decided again, so posts that start to trend after we first saw them still get acted on. */
function rises(doc, post, conf, now) {
  if (!doc || doc.verdict !== "watch" || doc.skip || !(NETWORKS[post.network] || {}).acts) return false;
  if (doc.decidedAgainAt && Date.parse(doc.decidedAgainAt) > now - REPLY_TTL) return false;
  return (post.score || 0) >= Math.min(conf.thresholds.like, conf.thresholds.reply);
}

/** Gemini's earlier read of a stored post, without a draft: a new draft needs a new read. */
function storedAi(doc) {
  if (!doc || doc.worth === null || doc.worth === undefined) return null;
  return { about: doc.about || "", lang: doc.lang || "", sentiment: doc.sentiment || "neutral", worth: doc.worth, why: doc.why || "", asksForTool: doc.asksForTool === true, reply: "" };
}

/** A risen post goes back to Gemini only if it never had a read, or the read said a reply was worth it. */
const askAgain = (doc, conf) => doc.worth === null || doc.worth === undefined || doc.worth >= conf.worth;

/** Posts worth a Gemini read this run: new, on a network we act on, not guarded, best first. */
function forAi(posts, conf, now) {
  if (conf.paused) return [];
  return posts.filter((p) => (NETWORKS[p.network] || {}).acts && p.score >= conf.thresholds.reply && !guard(p, conf, now))
    .sort((a, b) => b.score - a.score).slice(0, conf.perRun);
}

/** The Firestore document for a new post (Firestore adds seenAt as a timestamp-free ISO string so ranges sort). */
function postDoc(post, ai, decision, now) {
  const a = ai || {};
  return {
    network: post.network, id: clip(post.id, 300), url: clip(post.url, 500), cid: clip(post.cid, 120),
    author: { handle: clip((post.author || {}).handle, 120), name: clip((post.author || {}).name, 120), id: clip((post.author || {}).id, 200), followers: num((post.author || {}).followers) },
    title: clip(post.title, 300), text: clip(post.text, 1200), lang: a.lang || lang2(post.lang), createdAt: clip(post.createdAt, 30), isReply: post.isReply === true,
    metrics: { likes: num((post.metrics || {}).likes), replies: num((post.metrics || {}).replies), reposts: num((post.metrics || {}).reposts), views: num((post.metrics || {}).views) },
    tags: (post.tags || []).map((t) => clip(t, 40)).slice(0, 10), topic: post.topic || "", topics: post.topics || [], words: post.words || [],
    relevance: post.relevance || 0, trend: post.trend || 0, score: post.score || 0,
    about: a.about || "", sentiment: a.sentiment || "", worth: a.worth === undefined ? null : a.worth, why: a.why || "", asksForTool: a.asksForTool === true,
    verdict: decision.verdict, skip: decision.skip, actions: decision.actions,
    seenAt: new Date(now).toISOString(), updatedAt: new Date(now).toISOString(), day: bogotaDay(now)
  };
}

const bogotaDay = (ms) => new Date(ms - 5 * HOUR).toISOString().slice(0, 10);
const safeKey = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 40) || "other";

/** Counters a run adds to engagement_daily/<day>, as plain numbers (index.js turns them into increments). Posts decided again count only their new actions. */
function rollup(read, docs, run, again) {
  const out = { runs: 1, runErrors: run && run.errors ? run.errors : 0, n: {}, topic: {}, lang: {}, tag: {}, skip: {}, verdict: {} };
  const bump = (map, k, n) => { map[k] = (map[k] || 0) + (n === undefined ? 1 : n); };
  const net = (k) => { out.n[k] = out.n[k] || {}; return out.n[k]; };
  Object.entries(read || {}).forEach(([k, n]) => bump(net(k), "read", n));
  const acts = (d) => Object.entries(d.actions || {}).forEach(([act, x]) => {
    if (x.status === "planned" || x.status === "waiting") bump(net(d.network), act === "reply" ? "drafted" : act);
    else if (x.status === "capped") bump(out.skip, "cap_" + act);
  });
  (docs || []).forEach((d) => {
    bump(net(d.network), "candidates");
    bump(out.verdict, d.verdict);
    if (d.topic) bump(out.topic, safeKey(d.topic));
    if (d.lang) bump(out.lang, safeKey(d.lang));
    (d.words || []).slice(0, 4).forEach((w) => bump(out.tag, safeKey(w)));
    if (d.skip) bump(out.skip, d.skip);
    acts(d);
  });
  (again || []).forEach(acts);
  return out;
}

const sumInto = (into, from) => {
  Object.entries(from || {}).forEach(([k, v]) => {
    if (typeof v === "number") into[k] = (into[k] || 0) + v;
    else if (v && typeof v === "object") { into[k] = into[k] || {}; sumInto(into[k], v); }
  });
  return into;
};

const FUNNEL = ["drafted", "approved", "edited", "dismissed", "expired", "posted", "failed"];
// What the poster did with the planned likes, reposts and follows: done, done in a dry run, or failed.
const CARRIED = ["like_done", "repost_done", "follow_done", "like_dry", "repost_dry", "follow_dry", "act_failed"];
const pairs = (map, n) => Object.entries(map || {}).sort((a, b) => b[1] - a[1]).slice(0, n || 12).map(([label, value]) => ({ label, value }));
const pct = (a, b) => (b ? Math.round((a / b) * 100) : null);

/** A report over engagement_daily documents, against the window before; top lists the window's best posts. */
function report(period, days, priorDays, top, now) {
  const sum = sumInto({}, {});
  (days || []).forEach((d) => sumInto(sum, d));
  const prior = sumInto({}, {});
  (priorDays || []).forEach((d) => sumInto(prior, d));
  const totals = (s) => {
    const t = { read: 0, candidates: 0, like: 0, repost: 0, follow: 0 };
    FUNNEL.concat(CARRIED).forEach((k) => { t[k] = 0; });
    Object.values(s.n || {}).forEach((n) => Object.keys(t).forEach((k) => { t[k] += n[k] || 0; }));
    return t;
  };
  const t = totals(sum);
  const p = totals(prior);
  const networks = Object.keys(NETWORKS).filter((k) => sum.n && sum.n[k]).map((k) => {
    const n = sum.n[k];
    const row = { network: k, name: NETWORKS[k].name, read: n.read || 0, candidates: n.candidates || 0, like: n.like || 0, repost: n.repost || 0, follow: n.follow || 0 };
    FUNNEL.concat(CARRIED).forEach((f) => { row[f] = n[f] || 0; });
    return row;
  });
  const decided = t.approved + t.edited + t.dismissed;
  const posts = (top || []).slice(0, 15).map((d) => ({
    key: d.key, network: d.network, url: d.url, author: (d.author || {}).name || (d.author || {}).handle || "", title: d.title || clip(d.text, 120), about: d.about || "",
    topic: d.topic, lang: d.lang, score: d.score, trend: d.trend, likes: (d.metrics || {}).likes || 0, replies: (d.metrics || {}).replies || 0, reposts: (d.metrics || {}).reposts || 0,
    verdict: d.verdict, reply: (d.actions && d.actions.reply && d.actions.reply.status) || ""
  }));
  const authors = {};
  (top || []).forEach((d) => { const a = (d.author || {}).handle; if (a) authors[d.network + ":" + a] = (authors[d.network + ":" + a] || 0) + 1; });
  return {
    period, at: new Date(now).toISOString(), from: days && days.length ? days[0].day || "" : "", to: days && days.length ? days[days.length - 1].day || "" : "",
    runs: sum.runs || 0, runErrors: sum.runErrors || 0, totals: t, prior: p,
    delta: Object.fromEntries(Object.keys(t).map((k) => [k, p[k] ? Math.round(((t[k] - p[k]) / p[k]) * 100) : null])),
    approvalRate: pct(t.approved + t.edited, decided), editRate: pct(t.edited, t.approved + t.edited), expiredRate: pct(t.expired, t.drafted),
    avgDecideMin: sum.decided ? Math.round((sum.decideMs || 0) / sum.decided / 60000) : null,
    networks, topics: pairs(sum.topic), langs: pairs(sum.lang), tags: pairs(sum.tag, 20), skips: pairs(sum.skip), verdicts: pairs(sum.verdict),
    posts, authors: pairs(authors, 10)
  };
}

const PERIOD_NAME = { daily: "Daily", weekly: "Weekly", monthly: "Monthly" };
const signed = (d) => (d === null || d === undefined ? "" : " (" + (d > 0 ? "+" : "") + d + "%)");
const doneLine = (t) => t.like_done + " likes, " + t.repost_done + " reposts, " + t.follow_done + " follows"
  + (t.like_dry + t.repost_dry + t.follow_dry ? "; dry run: " + t.like_dry + " likes, " + t.repost_dry + " reposts, " + t.follow_dry + " follows" : "")
  + (t.act_failed ? "; " + t.act_failed + " failed" : "");

/** The owner email for a report: rows for the numbers, body for the lists. */
function reportMail(r) {
  const t = r.totals;
  const window = r.from && r.to && r.from !== r.to ? r.from + " to " + r.to : r.to || r.from;
  const rows = [
    { heading: "Activity" },
    { label: "Scout runs", value: r.runs + (r.runErrors ? " (" + r.runErrors + " with a failing network)" : "") },
    { label: "Posts read", value: t.read + signed(r.delta.read) },
    { label: "In our field", value: t.candidates + signed(r.delta.candidates) },
    { label: "Likes planned", value: t.like + signed(r.delta.like) },
    { label: "Reposts planned", value: t.repost + signed(r.delta.repost) },
    { label: "Follows planned", value: t.follow + signed(r.delta.follow) },
    { label: "Done", value: doneLine(t) },
    { heading: "Replies" },
    { label: "Drafted", value: t.drafted + signed(r.delta.drafted) },
    { label: "Approved", value: t.approved + " (" + t.edited + " edited)" },
    { label: "Dismissed", value: String(t.dismissed) },
    { label: "Expired unanswered", value: String(t.expired) },
    { label: "Posted", value: String(t.posted) + (t.failed ? " (" + t.failed + " failed)" : "") },
    { label: "Approval rate", value: r.approvalRate === null ? "—" : r.approvalRate + "%" },
    { label: "Average time to decide", value: r.avgDecideMin === null ? "—" : r.avgDecideMin + " min" }
  ];
  const list = (title, items, fmt) => (items.length ? [title + ":", ...items.map(fmt), ""] : []);
  const body = [
    ...list("By network", r.networks, (n) => "- " + n.name + ": " + n.read + " read, " + n.candidates + " in field, " + n.like + " likes, " + n.repost + " reposts, " + n.follow + " follows planned (done: " + doneLine(n) + "), " + n.drafted + " replies drafted, " + n.posted + " posted"),
    ...list("Topics", r.topics, (x) => "- " + x.label + ": " + x.value),
    ...list("Trending keywords", r.tags.slice(0, 12), (x) => "- " + x.label.replace(/_/g, " ") + ": " + x.value),
    ...list("Languages", r.langs, (x) => "- " + x.label + ": " + x.value),
    ...list("Left alone", r.skips, (x) => "- " + x.label.replace(/_/g, " ") + ": " + x.value),
    ...list("Top posts in our field", r.posts.slice(0, 10), (x) => "- [" + ((NETWORKS[x.network] || {}).name || x.network) + ", score " + x.score + "] " + clip(x.title, 100) + (x.about ? " (" + x.about + ")" : "") + " " + x.url),
    ...list("Authors seen most", r.authors, (x) => "- " + x.label + ": " + x.value)
  ].join("\n");
  return {
    subject: PERIOD_NAME[r.period] + " social engagement · " + window + " · " + t.candidates + " posts, " + t.drafted + " replies drafted",
    intro: PERIOD_NAME[r.period] + " engagement report, " + window + ". Likes, reposts and follows are planned within the daily caps and carried out on the networks that are connected and live; replies wait for you in Jarvis.",
    rows, body
  };
}

/** The push for a report: the numbers that matter in one notification. */
function reportPush(r) {
  const t = r.totals;
  return {
    kind: "engagement",
    title: PERIOD_NAME[r.period] + " engagement: " + t.candidates + " posts in our field",
    body: t.like + " likes, " + t.repost + " reposts, " + t.follow + " follows planned; done: " + doneLine(t) + ". " + t.drafted + " replies drafted, " + (t.approved + t.edited) + " approved, " + t.posted + " posted, " + t.expired + " expired.",
    lines: r.topics.slice(0, 3).map((x) => x.label + ": " + x.value).concat(r.posts.slice(0, 2).map((p) => "Top: " + clip(p.title, 80))),
    tab: "products:engagement",
    tag: "jarvis-engagement-" + r.period,
    quiet: r.period === "daily"
  };
}

/** A reply draft waiting for Carlos: Approve, Edit (typed inline) or Dismiss. */
function replyPush(doc) {
  const r = (doc.actions || {}).reply || {};
  return {
    kind: "engagement",
    title: "Reply on " + ((NETWORKS[doc.network] || {}).name || doc.network) + "? " + clip(doc.about || doc.title || doc.text, 90),
    body: clip(r.draft, 220),
    lines: [clip((doc.author || {}).name || (doc.author || {}).handle, 60) + ": " + clip(doc.title || doc.text, 140), "Score " + doc.score + " · " + (doc.topic || "") + " · " + (r.lang || doc.lang || "")],
    tab: "products:engagement",
    tag: "jarvis-engage-" + doc.key,
    url: /^https:\/\//.test(doc.url || "") ? doc.url : "",
    ref: "engagement:" + doc.key,
    actions: [{ act: "approve", label: "Approve" }, { act: "edit", label: "Edit", input: "Your reply" }, { act: "dismiss", label: "Dismiss" }]
  };
}

/** A decision on a waiting reply: the reply's next state and the daily counters it moves. Throws when it cannot. */
function decideReply(doc, decision, text, by, now) {
  const r = ((doc || {}).actions || {}).reply;
  if (!r) throw new Error("That post has no reply draft.");
  if (r.status !== "waiting") throw new Error("That reply is already " + r.status + ".");
  if (Date.parse(r.expiresAt) < now) throw new Error("That reply expired; the conversation has moved on.");
  if (!["approve", "edit", "dismiss"].includes(decision)) throw new Error("Approve, edit or dismiss.");
  const at = new Date(now).toISOString();
  const waited = Math.max(0, now - Date.parse((doc || {}).seenAt || at));
  if (decision === "dismiss") return { reply: Object.assign({}, r, { status: "dismissed", decidedAt: at, by }), counter: "dismissed", waited };
  let draft = r.draft;
  if (decision === "edit") {
    draft = String(text || "").trim();
    const limit = (NETWORKS[doc.network] || {}).limit || 300;
    if (draft.length < 5) throw new Error("Write the reply first.");
    if (draft.length > limit) throw new Error((NETWORKS[doc.network] || {}).name + " takes at most " + limit + " characters; this is " + draft.length + ".");
  }
  return { reply: Object.assign({}, r, { status: "approved", draft, edited: decision === "edit", original: decision === "edit" ? r.draft : r.original || "", decidedAt: at, by }), counter: decision === "edit" ? "edited" : "approved", waited };
}

module.exports = {
  NETWORKS, TOPICS, LANGS, ACTIONS, DEFAULTS, COMPETITORS, SENSITIVE, REPLY_TTL, FUNNEL, CARRIED,
  settings, settingsPatch, keyOf, relevance, trend, score, guard, aiPrompt, parseAi, decide, rises, storedAi, askAgain, forAi, postDoc, rollup, sumInto, report, reportMail, reportPush, replyPush, decideReply, bogotaDay
};
