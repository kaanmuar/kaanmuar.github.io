"use strict";
/*
 * Owner tags (#2633): once a day, every social post we published about a URL review report gets comments that tag the
 * report's owner (every owner on a comparison card) and the accounts around them, and the owners' own latest posts get a
 * reply with their report's link.
 *
 *   posts     assets/social/feed.json posts with a report, or with the sites their card names (comparisons), joined
 *             with their sent entries in the ledgers (buffer.json, facebook.json, open-social.json), newest first
 *   owners    the profile links on the reviewed site's home page (kind owner, approved as found), read again every
 *             DISCOVER_DAYS, at most DISCOVER_PER_RUN sites a run
 *   related   accounts Gemini suggests around a report: for the report itself, its city, its country or its sector
 *             (kind related, suggested), SUGGEST_PER_RUN reports a run; Bluesky and Mastodon handles that do not
 *             resolve are dropped. Each report's batch is pushed to Carlos once (Approve, Edit with the handles to keep
 *             or add, Dismiss); a city, country or sector approval serves every report there
 *   comments  owners first, then up to RELATED_MAX related accounts (report, then city, sector, country), in at most
 *             COMMENTS_MAX comments a post, each within the network's MENTIONS cap and character limit. A later run
 *             tags accounts approved since in the comments left. Stored as approved engagement_posts replies with
 *             campaign "owner-tags", so engagement-act carries them on the API networks and the Mac's agent on the
 *             others; ownerTags.kind "tags" skips the already-replied check, since our second comment is expected
 *   replies   one reply per report, network and owner account under the owner's latest post of the last REPLY_DAYS:
 *             found here on Bluesky, Mastodon and YouTube; on the Mac's networks (LATEST_NETS, #2638) the reply targets
 *             the owner's profile (ownerTags.latest) and the agent finds the newest own post there. One the agent finds
 *             none for (ownerTags.none) is queued again after LATEST_RETRY_DAYS
 *   cards     a post's first comment and each owner reply keep the report's card as ownerTags.image (the feed post's
 *             image, a single report's for replies), which the Mac's agent attaches on Threads (#2710)
 *
 * Switzerland, Belgium and Luxembourg speak several languages, so their sites are addressed in English unless the host's
 * own country code says otherwise.
 * Facebook, LinkedIn and TikTok make a mention only when it is picked from the comment box's menu (PICKED, #2637): their
 * comments carry ownerTags.menu [{ token, handle, name }], the agent picks each token's account from the menu, and its
 * result keeps which were linked and which stayed plain text, and the names the menu showed for accounts without one.
 * At most PER_DAY comments and replies a network a day; a blocked account is never tagged. settings.paused stops it;
 * until settings.live it only counts what it would post.
 *
 *   owner_tags/settings            { paused, live, updatedAt, by }
 *   owner_tags/last                the last run's note and counts, for Jarvis
 *   owner_tag_accounts/<net>:<h>   { network, handle, name, kind, status, scopes, batch, source, why, verified, at }
 *   owner_tag_reports/<report id>  { host, name, discoveredAt, suggestedAt, pushedAt, error }
 *   owner_tag_daily/<day>          { n: { <network>: count } }
 */
const crypto = require("crypto");
const E = require("./engagement");
const R = require("./engagement-reports");

const DAY = 24 * 3600000;
const CAMPAIGN = "owner-tags";
const RELATED_MAX = 10;
const COMMENTS_MAX = 2;
const REPLY_DAYS = 30;
const DISCOVER_DAYS = 30;
const DISCOVER_PER_RUN = 30;
const SUGGEST_PER_RUN = 8;
const SUGGEST_MAX = 15;
const REPLY_PER_RUN = 12;
const LIST_ACCOUNTS = 200;
const LIST_COMMENTS = 50;
const TIMEOUT = 10000;
const HTML_MAX = 1500000;
// Mentions a comment may carry; Instagram and Threads hide comments with more.
const MENTIONS = { bluesky: 10, mastodon: 10, youtube: 10, x: 10, instagram: 5, threads: 5, facebook: 5, linkedin: 5, tiktok: 5 };
const PICKED = ["facebook", "linkedin", "tiktok"];
const SUGGESTED = ["x", "instagram", "threads", "bluesky", "mastodon", "youtube"];
const REPLY_NETS = ["bluesky", "mastodon", "youtube"];
const LATEST_NETS = ["x", "instagram", "threads", "facebook", "linkedin", "tiktok"];
const LATEST_PER_RUN = 6;
const LATEST_RETRY_DAYS = 7;
const PER_DAY = { bluesky: 20, mastodon: 20, youtube: 20, x: 6, instagram: 6, threads: 6, facebook: 6, linkedin: 6, tiktok: 6 };
const STATUSES = ["approved", "suggested", "rejected", "blocked"];
const SCOPES = ["report", "city", "sector", "country"];
const NET_CODES = { x: "x", twitter: "x", ig: "instagram", instagram: "instagram", bsky: "bluesky", bluesky: "bluesky", mast: "mastodon", mastodon: "mastodon",
  yt: "youtube", youtube: "youtube", th: "threads", threads: "threads", tt: "tiktok", tiktok: "tiktok", fb: "facebook", facebook: "facebook", li: "linkedin", linkedin: "linkedin" };
const LANG_OF = { co: "es", mx: "es", es: "es", ar: "es", cl: "es", pe: "es", ec: "es", uy: "es", py: "es", bo: "es", ve: "es", cr: "es", pa: "es", gt: "es", hn: "es", sv: "es", ni: "es", do: "es", cu: "es",
  br: "pt", pt: "pt", de: "de", at: "de", li: "de", fr: "fr", mc: "fr", it: "it", sm: "it" };
const COPY = {
  en: { site: "The public QA review of {host} is out: {link}", one: "{owners} your site's public QA review is out: {link}", many: "{owners} your sites are compared in a public QA review: {link}", cc: "cc", reply: "{mention} we published a public QA review of {host}, free to read: {link}" },
  es: { site: "Ya salió la revisión QA pública de {host}: {link}", one: "{owners} ya salió la revisión QA pública de tu sitio: {link}", many: "{owners} sus sitios aparecen comparados en una revisión QA pública: {link}", cc: "cc", reply: "{mention} publicamos una revisión QA pública de {host}, gratis: {link}" },
  pt: { site: "A revisão de QA pública de {host} saiu: {link}", one: "{owners} a revisão de QA pública do seu site saiu: {link}", many: "{owners} seus sites foram comparados numa revisão de QA pública: {link}", cc: "cc", reply: "{mention} publicamos uma revisão de QA pública de {host}, grátis: {link}" },
  de: { site: "Die öffentliche QA-Prüfung von {host} ist online: {link}", one: "{owners} die öffentliche QA-Prüfung Ihrer Website ist online: {link}", many: "{owners} Ihre Websites werden in einer öffentlichen QA-Prüfung verglichen: {link}", cc: "cc", reply: "{mention} wir haben eine öffentliche QA-Prüfung von {host} veröffentlicht, kostenlos: {link}" },
  fr: { site: "L'analyse QA publique de {host} est en ligne : {link}", one: "{owners} l'analyse QA publique de votre site est en ligne : {link}", many: "{owners} vos sites sont comparés dans une analyse QA publique : {link}", cc: "cc", reply: "{mention} nous avons publié une analyse QA publique de {host}, gratuite : {link}" },
  it: { site: "La revisione QA pubblica di {host} è online: {link}", one: "{owners} la revisione QA pubblica del tuo sito è online: {link}", many: "{owners} i vostri siti sono confrontati in una revisione QA pubblica: {link}", cc: "cc", reply: "{mention} abbiamo pubblicato una revisione QA pubblica di {host}, gratuita: {link}" }
};

const clip = (v, n) => String(v == null ? "" : v).replace(/\s+/g, " ").trim().slice(0, n);
const bare = (host) => String(host || "").toLowerCase().replace(/^https?:\/\//, "").replace(/[/:].*$/, "").replace(/^www\./, "");
const slug = (v) => String(v || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const accountId = (network, handle) => network + ":" + String(handle).toLowerCase().replace(/\//g, "|");
const docKey = (...parts) => "ot-" + crypto.createHash("sha1").update(parts.join("|")).digest("hex").slice(0, 24);
const settingsRef = (db) => db.collection("owner_tags").doc("settings");

// --- Handles ----------------------------------------------------------------------------------------------------

const RESERVED = /^(home|share|sharer|intent|i|search|hashtag|explore|p|reel|reels|stories|tv|watch|results|feed|login|signup|about|help|privacy|terms|legal|policies|settings|tag|discover|embed|plugins|dialog|groups|events|pages|profile\.php)$/i;

/** A profile link as { network, handle }, or null; a Mastodon handle is user@server, a YouTube channel id channel/UC…. */
function handleOf(link) {
  let u;
  try { u = new URL(String(link || "").trim()); } catch (error) { return null; }
  if (!/^https?:$/.test(u.protocol)) return null;
  const host = u.hostname.toLowerCase().replace(/^(www|m|mobile)\./, "");
  const path = u.pathname.split("/").filter(Boolean).map((p) => decodeURIComponent(p));
  const first = path[0] || "";
  const ok = (network, handle, re) => (handle && re.test(handle) && !RESERVED.test(handle.replace(/^@/, "")) ? { network, handle: handle.replace(/^@/, "") } : null);
  if (host === "x.com" || host === "twitter.com") return ok("x", first, /^@?[A-Za-z0-9_]{1,15}$/);
  if (host === "instagram.com") return ok("instagram", first, /^@?[A-Za-z0-9._]{1,30}$/);
  if (host === "threads.net" || host === "threads.com") return first.startsWith("@") ? ok("threads", first, /^@[A-Za-z0-9._]{1,30}$/) : null;
  if (host === "tiktok.com") return first.startsWith("@") ? ok("tiktok", first, /^@[A-Za-z0-9._]{2,24}$/) : null;
  if (host === "bsky.app") return first === "profile" ? ok("bluesky", String(path[1] || "").toLowerCase(), /^[a-z0-9][a-z0-9.-]*\.[a-z]{2,}$/) : null;
  if (host === "youtube.com") {
    if (first.startsWith("@")) return ok("youtube", first, /^@[A-Za-z0-9._-]{3,30}$/);
    if (first === "channel" && /^UC[\w-]{22}$/.test(path[1] || "")) return { network: "youtube", handle: "channel/" + path[1] };
    return null;
  }
  if (host === "facebook.com" || host === "fb.com") return ok("facebook", first, /^[A-Za-z0-9.-]{3,80}$/);
  if (host === "linkedin.com") return ["company", "in", "school"].includes(first) && path[1] ? { network: "linkedin", handle: first + "/" + path[1].toLowerCase() } : null;
  if ((/(^|\.)(mastodon|mstdn)\b/.test(host) || /^(social|toot)\./.test(host)) && /^@[A-Za-z0-9_]{1,30}$/.test(first)) return { network: "mastodon", handle: first.slice(1) + "@" + host };
  return null;
}

/**
 * The text that tags an account on its network, or "" where it cannot be tagged (a YouTube channel id). On Facebook,
 * LinkedIn (its slug) and TikTok it is the token the Mac's agent swaps for the account picked from the menu.
 */
function mentionOf(a) {
  if (!a || !MENTIONS[a.network]) return "";
  const h = String(a.handle).replace(/^@/, "");
  if (a.network === "linkedin") return /^(company|in|school)\/[^/\s]+$/.test(h) ? "@" + h.split("/")[1] : "";
  return h.includes("/") ? "" : "@" + h;
}

/** A mention the Mac's agent picks from a network's menu: { token, handle, name }. */
const tagOf = (a) => ({ token: mentionOf(a), handle: a.handle, name: a.name || "" });

/** Where the Mac's agent finds an owner's latest post on a browser network: the profile. */
function profileOf(a) {
  const h = String(a.handle).replace(/^@/, "");
  return {
    x: "https://x.com/" + h, instagram: "https://www.instagram.com/" + h + "/", threads: "https://www.threads.com/@" + h, tiktok: "https://www.tiktok.com/@" + h,
    facebook: "https://www.facebook.com/" + h, linkedin: "https://www.linkedin.com/" + h + "/"
  }[a.network] || "";
}

const SOCIAL = /https?:\/\/(?:www\.|m\.)?(?:x\.com|twitter\.com|instagram\.com|threads\.(?:net|com)|tiktok\.com|bsky\.app|youtube\.com|facebook\.com|linkedin\.com|[a-z0-9-]*(?:mastodon|mstdn)[a-z0-9.-]*|social\.[a-z0-9.-]+|toot\.[a-z0-9.-]+)\/[^\s"'<>\\)]+/gi;

/** The profile links a home page names (links and schema.org sameAs alike), as { network, handle }, one per account. */
function socialLinksOf(html) {
  const seen = new Set();
  const out = [];
  for (const m of String(html || "").replace(/&amp;/g, "&").replace(/\\\//g, "/").matchAll(SOCIAL)) {
    const h = handleOf(m[0].replace(/[.,;]+$/, ""));
    if (!h || seen.has(accountId(h.network, h.handle))) continue;
    seen.add(accountId(h.network, h.handle));
    out.push(h);
    if (out.length >= 20) break;
  }
  return out;
}

// --- Posts and reports ------------------------------------------------------------------------------------------

/** A report's scopes, most specific first: report:<id>, city:<slug>, sector:<sector>, country:<cc>. */
function scopesOf(report) {
  const r = report || {};
  return ["report:" + r.id].concat(r.city ? ["city:" + slug(r.city)] : [], r.sector ? ["sector:" + slug(r.sector)] : [], r.country ? ["country:" + String(r.country).toLowerCase()] : []);
}

/** The language we address a report's owner in: its country's, else its host's country code's, else English. */
function langOf(report) {
  const r = report || {};
  const cc = String(r.country || "").toLowerCase() || (bare(r.host).match(/\.([a-z]{2})$/) || [])[1] || "";
  return LANG_OF[cc] || "en";
}

/** The reports a feed post is about: its report, or every site its comparison card names ("<host> Score 76"). */
function reportsOf(post, live) {
  const byId = new Map((live || []).map((r) => [r.id, r]));
  const byHost = new Map((live || []).map((r) => [bare(r.host), r]));
  if (post.report) {
    const r = byId.get(post.report);
    return r ? [r] : [];
  }
  if (!["review", "compare"].includes(post.kind)) return [];
  const hosts = [...new Set([...String(post.alt || "").matchAll(/\b((?:[a-z0-9-]+\.)+[a-z]{2,})\s+Score\s+\d/gi)].map((m) => bare(m[1])))];
  return hosts.map((h) => byHost.get(h) || { id: "u-" + slug(h), host: h, name: h, country: "", city: "", sector: "" });
}

const youtubeId = (url) => (String(url || "").match(/(?:[?&]v=|shorts\/|youtu\.be\/)([\w-]{11})/) || [])[1] || "";
// The id each network's carrier finds a post by: Bluesky its at:// URI, YouTube the video, the Mac's agent the X status
// id and the Threads post code (scripts/engagement-browser/networks.js), the rest their URL.
function postIdOf(network, entry) {
  const url = String(entry.url || "");
  if (network === "bluesky") return entry.id || "";
  if (network === "youtube") return youtubeId(url);
  if (network === "x") return (url.match(/\/status\/(\d+)/) || [])[1] || "";
  if (network === "threads") return (url.match(/\/post\/([\w-]+)/) || [])[1] || "";
  return url;
}

/** Our sent posts about reports, one per post and network, newest first: { key, network, id, url, at, reports, image }. */
function ourPosts(feed, ledgers, live) {
  const entries = {};
  (ledgers || []).forEach((l) => Object.entries((l && l.posts) || {}).forEach(([k, list]) => { (entries[k] = entries[k] || []).push(...(Array.isArray(list) ? list : [])); }));
  const out = [];
  for (const post of (feed && feed.posts) || []) {
    const reports = reportsOf(post, live);
    if (!reports.length) continue;
    const seen = new Set();
    for (const e of entries[post.id] || []) {
      const network = e.channel === "twitter" ? "x" : e.channel;
      if (e.result !== "sent" || !e.url || !E.NETWORKS[network] || seen.has(network)) continue;
      const id = postIdOf(network, e);
      if (!id) continue;
      seen.add(network);
      out.push({ key: post.id, network, id, url: e.url, at: e.at || post.date || "", reports, image: post.image || "" });
    }
    if (post.youtube && !seen.has("youtube")) out.push({ key: post.id, network: "youtube", id: post.youtube, url: "https://www.youtube.com/watch?v=" + post.youtube, at: post.date || "", reports, image: post.image || "" });
  }
  return out.sort((a, b) => String(b.at).localeCompare(String(a.at)));
}

// --- Comments ---------------------------------------------------------------------------------------------------

/** The approved accounts to tag on one post and network, minus those tagged there: { owners, related }. */
function pick(accounts, reports, network, tagged) {
  const done = new Set(tagged || []);
  const open = (accounts || []).filter((a) => a.network === network && a.status === "approved" && mentionOf(a) && !done.has(accountId(a.network, a.handle)));
  const reportScopes = reports.map((r) => "report:" + r.id);
  const owners = open.filter((a) => a.kind === "owner" && (a.scopes || []).some((s) => reportScopes.includes(s)));
  const ownerIds = new Set(owners.map((a) => accountId(a.network, a.handle)));
  const rank = new Map();
  reports.forEach((r) => scopesOf(r).forEach((s, i) => { if (!rank.has(s) || rank.get(s) > i) rank.set(s, i); }));
  const related = open.filter((a) => !ownerIds.has(accountId(a.network, a.handle)) && (a.scopes || []).some((s) => rank.has(s)))
    .map((a) => ({ a, r: Math.min(...(a.scopes || []).filter((s) => rank.has(s)).map((s) => rank.get(s))) }))
    .sort((x, y) => x.r - y.r || String(x.a.handle).localeCompare(String(y.a.handle))).map((x) => x.a);
  return { owners, related };
}

/**
 * The comments for one post: [{ text, mentions, tags }] in at most room comments. The first that names owners carries
 * the owner line and link; the rest of the mentions follow as cc, never past the network's cap or character limit. The
 * post's first comment (first) always carries the link: with no owner on the network it names the site (host). tags,
 * on the networks whose mentions are picked from a menu (PICKED), are the mentions as tagOf gives them.
 */
function comments(network, lang, owners, related, link, room, many, host, first) {
  const copy = COPY[lang] || COPY.en;
  const cap = MENTIONS[network] || 0;
  const limit = (E.NETWORKS[network] || {}).limit || 300;
  const line = (list) => (many ? copy.many : copy.one).replace("{owners}", list.map(mentionOf).join(" ")).replace("{link}", link);
  const out = [];
  let ownersLeft = owners.slice();
  const queue = related.slice(0, RELATED_MAX);
  while ((ownersLeft.length || queue.length) && out.length < (room === undefined ? COMMENTS_MAX : room)) {
    const mentions = ownersLeft.slice(0, cap);
    while (mentions.length > 1 && line(mentions).length > limit) mentions.pop();
    ownersLeft = ownersLeft.slice(mentions.length);
    let text = mentions.length ? line(mentions)
      : first && !out.length && host ? copy.site.replace("{host}", host).replace("{link}", link) : "";
    let cc = false;
    while (queue.length && mentions.length < cap) {
      const m = mentionOf(queue[0]);
      const next = !text ? copy.cc + " " + m : cc ? text + " " + m : text + " " + copy.cc + " " + m;
      if (next.length > limit) break;
      text = next;
      cc = true;
      mentions.push(queue.shift());
    }
    if (!mentions.length) break;
    out.push(Object.assign({ text, mentions: mentions.map((a) => accountId(a.network, a.handle)) }, PICKED.includes(network) ? { tags: mentions.map(tagOf) } : {}));
  }
  return out;
}

/** The reply under an owner's own post; Mastodon and the Mac's networks tell the owner of a comment on their own. */
function replyText(lang, account, host, link) {
  const copy = COPY[lang] || COPY.en;
  const mention = account.network === "mastodon" || LATEST_NETS.includes(account.network) ? "" : mentionOf(account);
  const text = copy.reply.replace("{mention}", mention).replace("{host}", host).replace("{link}", link).trim();
  return mention ? text : text.charAt(0).toUpperCase() + text.slice(1);
}

/** An approved engagement_posts reply carrying one comment or owner reply. */
function engagementDoc(target, draft, lang, tags, now) {
  const at = new Date(now).toISOString();
  const base = E.postDoc({
    network: target.network, id: target.id, url: target.url, author: target.author || {}, title: "", text: clip(target.text || "", 1200),
    lang, createdAt: target.createdAt || "", topic: "Reports", topics: ["Reports"]
  }, { lang }, { verdict: "reply", skip: "", actions: { reply: { status: "approved", draft, lang, decidedAt: at, by: CAMPAIGN } } }, now);
  return Object.assign(base, { campaign: CAMPAIGN, own: tags.kind === "tags", ownerTags: tags });
}

// --- Gemini suggestions -----------------------------------------------------------------------------------------

function suggestPrompt(report) {
  const r = report || {};
  return [
    "Carlos & Munoz (carlosandmunoz.com) published a free public QA review of a website (SEO, AI search, accessibility, performance, analytics, security) and posts about it on social networks.",
    "List the social accounts that would care about this review: the organisation's own accounts, its parent or umbrella bodies, the city or regional government and its agencies in the same field, regulators, the main local and national news outlets and journalists who cover it, and well-known community or watchdog accounts in its field.",
    "Site: " + JSON.stringify({ name: r.name || r.host, host: r.host, org: r.org || "", sector: r.sector || "", city: r.city || "", country: r.country || "" }),
    "Only accounts you are sure exist, with their exact handle. Networks: x, instagram, threads, bluesky, mastodon, youtube.",
    "Return a JSON array of at most " + SUGGEST_MAX + " objects: {\"network\": one of the networks, \"handle\": the handle without @ (Mastodon as user@server, Bluesky as the full domain handle), \"name\": the account's display name, \"why\": at most 12 English words, \"scope\": \"report\" when it is about this site or organisation only, \"city\" when it fits any site in its city, \"sector\" for any site in its field, \"country\" for any site in its country}."
  ].join("\n");
}

function parseSuggestions(text) {
  let list;
  try { list = JSON.parse(String(text || "").replace(/^```(?:json)?|```$/g, "").trim()); } catch (error) { return []; }
  return (Array.isArray(list) ? list : []).map((s) => {
    const network = NET_CODES[String((s || {}).network || "").toLowerCase()];
    const handle = clip((s || {}).handle, 120).replace(/^@/, "");
    if (!network || !SUGGESTED.includes(network) || !handle || /\s/.test(handle)) return null;
    return { network, handle, name: clip(s.name, 80), why: clip(s.why, 120), scope: SCOPES.includes(s.scope) ? s.scope : "report" };
  }).filter(Boolean).slice(0, SUGGEST_MAX);
}

/** Handles Carlos typed in an Edit: "@a", "x:@b", "ig:c", "bsky:d.bsky.social" or a profile link, as { network, handle }. */
function parseHandles(text) {
  return String(text || "").split(/[\s,;]+/).filter(Boolean).map((t) => {
    if (/^https?:\/\//i.test(t)) return handleOf(t);
    const m = t.match(/^([a-z]+):@?(.+)$/i);
    if (m && NET_CODES[m[1].toLowerCase()]) return { network: NET_CODES[m[1].toLowerCase()], handle: m[2].replace(/^@/, "") };
    return { network: "", handle: t.replace(/^@/, "") };
  }).filter((h) => h && h.handle);
}

// --- I/O --------------------------------------------------------------------------------------------------------

async function getJson(deps, url) {
  const res = await deps.fetch(url, { cache: "no-store", signal: AbortSignal.timeout(TIMEOUT) });
  if (!res.ok) throw new Error(url.replace(/^https:\/\//, "").replace(/\?.*$/, "") + " answered " + res.status);
  return res.json();
}

async function getText(deps, url) {
  const res = await deps.fetch(url, { redirect: "follow", headers: { "User-Agent": "Mozilla/5.0 (compatible; QAlabOwnerTags/1.0; +https://carlosandmunoz.com)" }, signal: AbortSignal.timeout(TIMEOUT) });
  if (!res.ok) throw new Error(url.replace(/^https?:\/\//, "").replace(/\?.*$/, "") + " answered " + res.status);
  return (await res.text()).slice(0, HTML_MAX);
}

async function readSettings(db) {
  const s = (await settingsRef(db).get()).data() || {};
  return { paused: s.paused === true, live: s.live === true };
}

async function saveSettings(db, patch, by, now) {
  const p = patch || {};
  const next = {};
  if (typeof p.paused === "boolean") next.paused = p.paused;
  if (typeof p.live === "boolean") next.live = p.live;
  if (!Object.keys(next).length) throw new Error("Say paused or live, true or false.");
  await settingsRef(db).set(Object.assign(next, { updatedAt: new Date(now).toISOString(), by: clip(by, 80) }), { merge: true });
  const s = await readSettings(db);
  return { settings: s, message: "Owner tags are " + (s.paused ? "paused" : s.live ? "live" : "in a dry run") + "." };
}

async function readAccounts(db) {
  return (await db.collection("owner_tag_accounts").limit(5000).get()).docs.map((d) => Object.assign({ id: d.id }, d.data()));
}

/** Saves an account, adding scopes to one already known; a blocked or rejected one stays so unless status says otherwise. */
async function saveAccount(db, a, now) {
  const id = accountId(a.network, a.handle);
  const ref = db.collection("owner_tag_accounts").doc(id);
  const was = (await ref.get()).data();
  const scopes = [...new Set(((was && was.scopes) || []).concat(a.scopes || []))];
  const keep = was && !a.force && (["blocked", "rejected"].includes(was.status) || (was.status === "approved" && a.status === "suggested")) && a.status !== "blocked";
  const status = a.status && !keep ? a.status : (was && was.status) || "suggested";
  await ref.set(Object.assign({}, was || {}, {
    network: a.network, handle: a.handle, name: a.name || (was && was.name) || "", kind: (was && was.kind === "owner") || a.kind === "owner" ? "owner" : "related",
    status, scopes, batch: a.batch || (was && was.batch) || "", source: (was && was.source) || a.source || "", why: a.why || (was && was.why) || "",
    verified: a.verified === undefined ? (was && was.verified) || false : a.verified, at: (was && was.at) || new Date(now).toISOString(), updatedAt: new Date(now).toISOString()
  }));
  return id;
}

/** Whether a Bluesky or Mastodon handle exists; other networks cannot be checked from here (null). */
async function verify(deps, a) {
  try {
    if (a.network === "bluesky") return !!(await getJson(deps, "https://public.api.bsky.app/xrpc/com.atproto.identity.resolveHandle?handle=" + encodeURIComponent(a.handle))).did;
    if (a.network === "mastodon") {
      const [user, host] = a.handle.split("@");
      if (!user || !host) return false;
      return !!(await getJson(deps, "https://" + host + "/.well-known/webfinger?resource=" + encodeURIComponent("acct:" + user + "@" + host))).subject;
    }
  } catch (error) { return false; }
  return null;
}

function suggestPush(report, list) {
  const names = list.map((a) => "@" + a.handle + " (" + ((E.NETWORKS[a.network] || {}).name || a.network) + ")");
  return {
    kind: "engagement",
    title: "Tag these around " + clip(report.name || report.host, 60) + " on our posts?",
    body: clip(names.join(", "), 220),
    lines: list.slice(0, 6).map((a) => "@" + a.handle + ": " + clip(a.why || a.name, 80) + (a.scope !== "report" ? " (every " + a.scope + " report)" : "")),
    tab: "products:engagement",
    tag: "jarvis-owner-tags-" + report.id,
    ref: "owner-tags:" + report.id,
    actions: [{ act: "approve", label: "Approve all" }, { act: "edit", label: "Edit", input: "Handles to keep or add (x:@a, ig:@b)" }, { act: "dismiss", label: "Dismiss" }]
  };
}

/** Reads the site's profile links into owner accounts, then asks Gemini for the accounts around it. */
async function explore(deps, report, state, out) {
  const { db, now } = deps;
  const ref = db.collection("owner_tag_reports").doc(report.id);
  const at = new Date(now).toISOString();
  if (out.discovered < DISCOVER_PER_RUN && !(Date.parse(state.discoveredAt || 0) > now - DISCOVER_DAYS * DAY)) {
    out.discovered += 1;
    try {
      const found = socialLinksOf(await getText(deps, "https://" + report.host + "/"));
      for (const h of found) await saveAccount(db, { network: h.network, handle: h.handle, kind: "owner", status: "approved", scopes: ["report:" + report.id], source: "site", verified: true, why: "linked from " + report.host }, now);
      out.owners += found.length;
      await ref.set({ host: report.host, name: report.name || report.host, discoveredAt: at, owners: found.length, error: "" }, { merge: true });
    } catch (error) {
      await ref.set({ host: report.host, name: report.name || report.host, discoveredAt: at, error: clip(error.message, 200) }, { merge: true });
    }
  }
  if (!deps.env.GEMINI_API_KEY || out.suggested >= SUGGEST_PER_RUN || state.suggestedAt) return;
  out.suggested += 1;
  let list;
  try { list = parseSuggestions(await deps.gemini(suggestPrompt(report))); }
  catch (error) { out.aiError = clip(error.message, 200); return; }
  const kept = [];
  for (const s of list) {
    const ok = await verify(deps, s);
    if (ok === false) continue;
    const scope = s.scope === "report" ? "report:" + report.id : scopesOf(report).find((x) => x.startsWith(s.scope + ":"));
    if (!scope) continue;
    await saveAccount(db, { network: s.network, handle: s.handle, name: s.name, kind: "related", status: "suggested", scopes: [scope], batch: report.id, source: "gemini", why: s.why, verified: ok === true }, now);
    kept.push(Object.assign({}, s, { scope: scope.split(":")[0] }));
  }
  await ref.set({ host: report.host, name: report.name || report.host, suggestedAt: at, suggestions: kept.length }, { merge: true });
  const waiting = (await readAccounts(db)).filter((a) => a.batch === report.id && a.status === "suggested");
  if (waiting.length && deps.push) {
    await deps.push(suggestPush(report, waiting.map((a) => Object.assign({ scope: ((a.scopes || [])[0] || "report:").split(":")[0] }, a)))).catch(() => null);
    await ref.set({ pushedAt: at }, { merge: true });
    out.pushed += 1;
  }
}

/** The owner's latest own post on an API network within REPLY_DAYS: { id, url, text, createdAt, author } or null. */
async function latestPost(deps, a) {
  const since = deps.now - REPLY_DAYS * DAY;
  const fresh = (at) => Date.parse(at || 0) > since;
  if (a.network === "bluesky") {
    const got = await getJson(deps, "https://public.api.bsky.app/xrpc/app.bsky.feed.getAuthorFeed?filter=posts_no_replies&limit=10&actor=" + encodeURIComponent(a.handle));
    const p = ((got.feed || []).find((f) => !f.reason && f.post && ((f.post.author || {}).handle || "").toLowerCase() === a.handle.toLowerCase()) || {}).post;
    const at = p && ((p.record || {}).createdAt || p.indexedAt);
    return p && fresh(at) ? { id: p.uri, url: "https://bsky.app/profile/" + a.handle + "/post/" + p.uri.split("/").pop(), text: (p.record || {}).text || "", createdAt: at, author: { handle: a.handle } } : null;
  }
  if (a.network === "mastodon") {
    const [user, host] = a.handle.split("@");
    const acct = await getJson(deps, "https://" + host + "/api/v1/accounts/lookup?acct=" + encodeURIComponent(user));
    const list = await getJson(deps, "https://" + host + "/api/v1/accounts/" + encodeURIComponent(acct.id) + "/statuses?exclude_replies=true&exclude_reblogs=true&limit=5");
    const st = (Array.isArray(list) ? list : []).find((s) => s.visibility === "public" || !s.visibility);
    return st && fresh(st.created_at) ? { id: st.url, url: st.url, text: clip(String(st.content || "").replace(/<[^>]+>/g, " "), 600), createdAt: st.created_at, author: { handle: "" } } : null;
  }
  if (a.network === "youtube") {
    let channel = a.handle.startsWith("channel/") ? a.handle.slice(8) : "";
    if (!channel) channel = ((await getText(deps, "https://www.youtube.com/@" + encodeURIComponent(a.handle))).match(/"(?:externalId|channelId)":"(UC[\w-]{22})"/) || [])[1] || "";
    if (!channel) return null;
    const xml = await getText(deps, "https://www.youtube.com/feeds/videos.xml?channel_id=" + channel);
    const entry = (xml.match(/<entry>[\s\S]*?<\/entry>/) || [""])[0];
    const id = (entry.match(/<yt:videoId>([\w-]{11})<\/yt:videoId>/) || [])[1];
    const at = (entry.match(/<published>([^<]+)<\/published>/) || [])[1];
    return id && fresh(at) ? { id, url: "https://www.youtube.com/watch?v=" + id, text: (entry.match(/<title>([^<]*)<\/title>/) || [])[1] || "", createdAt: at, author: { handle: a.handle, id: channel } } : null;
  }
  return null;
}

/**
 * One daily pass. deps: { db, fetch, env, now, inc, push, site, gemini(prompt) }. Returns the counts it wrote to
 * owner_tags/last: { posts, comments, replies, dry, discovered, owners, suggested, pushed, capped, errors, sample }.
 */
async function run(deps) {
  const { db, now } = deps;
  const conf = await readSettings(db);
  const out = { at: new Date(now).toISOString(), live: conf.live, paused: conf.paused, posts: 0, comments: 0, replies: 0, dry: 0, discovered: 0, owners: 0, suggested: 0, pushed: 0, capped: 0, errors: [], sample: [] };
  if (conf.paused) return finish(db, out);
  const asset = (file) => getJson(deps, deps.site + "/assets/" + file + "?t=" + now);
  const [feed, live, ...ledgers] = await Promise.all([asset("social/feed.json"), asset("live-reports/index.json"),
    ...["buffer.json", "facebook.json", "open-social.json"].map((f) => asset("social/" + f).catch((error) => { out.errors.push(error.message); return null; }))]);
  const posts = ourPosts(feed, ledgers, (live && live.reports) || []);
  out.posts = posts.length;
  const cardUrl = (rel) => (rel ? deps.site + "/" + String(rel).replace(/^\//, "") : "");
  const cards = new Map();
  posts.filter((p) => p.image && p.reports.length === 1).forEach((p) => { if (!cards.has(p.reports[0].id)) cards.set(p.reports[0].id, cardUrl(p.image)); });

  const reports = new Map();
  posts.forEach((p) => p.reports.forEach((r) => reports.set(r.id, r)));
  const states = new Map((await db.collection("owner_tag_reports").limit(5000).get()).docs.map((d) => [d.id, d.data()]));
  for (const r of reports.values()) {
    if (out.discovered >= DISCOVER_PER_RUN && out.suggested >= SUGGEST_PER_RUN) break;
    await explore(deps, r, states.get(r.id) || {}, out);
  }

  const usable = (await readAccounts(db)).filter((a) => a.status === "approved");
  const ownerIds = new Set(usable.filter((a) => a.kind === "owner").map((a) => accountId(a.network, a.handle)));
  const dayRef = db.collection("owner_tag_daily").doc(E.bogotaDay(now));
  const used = Object.assign({}, ((await dayRef.get()).data() || {}).n || {});
  const mine = (await db.collection("engagement_posts").where("campaign", "==", CAMPAIGN).limit(10000).get()).docs.map((d) => Object.assign({ key: d.id }, d.data()));
  const retry = (d) => (d.ownerTags || {}).latest && Date.parse((d.ownerTags || {}).none || "") < now - LATEST_RETRY_DAYS * DAY;
  const keys = new Set(mine.filter((d) => !retry(d)).map((d) => d.key));
  const byPost = new Map();
  mine.filter((d) => (d.ownerTags || {}).kind === "tags").forEach((d) => {
    const k = d.ownerTags.post + "|" + d.network;
    const cur = byPost.get(k) || { count: 0, tagged: [] };
    cur.count += 1;
    cur.tagged.push(...(d.ownerTags.mentions || []));
    byPost.set(k, cur);
  });
  const add = async (key, doc) => {
    if (out.sample.length < 5) out.sample.push({ network: doc.network, url: doc.url, text: doc.actions.reply.draft });
    used[doc.network] = (used[doc.network] || 0) + 1;
    if (!conf.live) { out.dry += 1; return; }
    await db.collection("engagement_posts").doc(key).set(Object.assign({ key }, doc));
    await dayRef.set({ n: { [doc.network]: deps.inc(1) } }, { merge: true });
  };
  const room = (net) => (PER_DAY[net] || 0) - (used[net] || 0);

  for (const p of posts) {
    if (!MENTIONS[p.network]) continue;
    const had = byPost.get(p.key + "|" + p.network) || { count: 0, tagged: [] };
    const left = Math.min(COMMENTS_MAX - had.count, room(p.network));
    if (left <= 0) { if (had.count < COMMENTS_MAX) out.capped += 1; continue; }
    const { owners, related } = pick(usable, p.reports, p.network, had.tagged);
    const relatedLeft = Math.max(0, RELATED_MAX - had.tagged.filter((id) => !ownerIds.has(id)).length);
    if (!owners.length && !(relatedLeft && related.length)) continue;
    const lead = p.reports[0];
    const lang = langOf(lead);
    const link = R.linkFor({ host: bare(lead.host) }, p.network, lang, docKey("link", p.key, p.network));
    const list = comments(p.network, lang, owners, related.slice(0, relatedLeft), link, left, p.reports.length > 1, bare(lead.host), had.count === 0);
    for (let i = 0; i < list.length; i += 1) {
      const part = had.count + i;
      const key = docKey("tags", p.key, p.network, part);
      if (keys.has(key)) continue;
      const tags = Object.assign({ kind: "tags", post: p.key, part, mentions: list[i].mentions, reports: p.reports.map((r) => r.id) }, part === 0 && p.image ? { image: cardUrl(p.image) } : {});
      await add(key, engagementDoc(p, list[i].text, lang, Object.assign(tags, list[i].tags ? { menu: list[i].tags } : {}), now));
      out.comments += 1;
    }
  }

  let fetched = 0;
  let latest = 0;
  for (const a of usable.filter((x) => x.kind === "owner" && (REPLY_NETS.includes(x.network) || LATEST_NETS.includes(x.network)))) {
    const report = (a.scopes || []).map((s) => reports.get(s.replace(/^report:/, ""))).find(Boolean);
    const onMac = LATEST_NETS.includes(a.network);
    if (!report || room(a.network) <= 0 || (onMac ? latest >= LATEST_PER_RUN : fetched >= REPLY_PER_RUN)) continue;
    const key = docKey("reply", report.id, a.network, a.handle.toLowerCase());
    if (keys.has(key)) continue;
    let target;
    if (onMac) {
      latest += 1;
      target = { id: "", url: profileOf(a), author: { handle: a.handle, name: a.name || "" } };
    } else {
      fetched += 1;
      try { target = await latestPost(deps, a); } catch (error) { out.errors.push(a.network + " @" + a.handle + ": " + clip(error.message, 120)); continue; }
      if (!target) continue;
    }
    const lang = langOf(report);
    const link = R.linkFor({ host: bare(report.host) }, a.network, lang, key);
    const tags = Object.assign({ kind: "reply", report: report.id, account: accountId(a.network, a.handle) }, onMac ? { latest: true } : {}, cards.has(report.id) ? { image: cards.get(report.id) } : {});
    await add(key, engagementDoc(Object.assign({ network: a.network }, target), replyText(lang, a, bare(report.host), link), lang, tags, now));
    out.replies += 1;
  }
  return finish(db, out);
}

async function finish(db, out) {
  out.errors = out.errors.slice(0, 10);
  await db.collection("owner_tags").doc("last").set(out);
  return out;
}

function runNote(out) {
  if (out.paused) return "owner tags paused";
  return "owner tags" + (out.live ? "" : " (dry run)") + ": " + out.posts + " posts, " + out.comments + " comments, " + out.replies + " owner replies"
    + (out.live ? "" : ", " + out.dry + " would post") + "; " + out.discovered + " sites read, " + out.owners + " owner accounts, " + out.suggested + " suggestion runs, "
    + out.pushed + " pushed" + (out.capped ? "; " + out.capped + " posts wait for tomorrow's cap" : "") + (out.aiError ? "; Gemini: " + out.aiError : "") + (out.errors.length ? "; " + out.errors.length + " errors" : "");
}

/** A push button or Jarvis decision on a report's suggested accounts: approve, dismiss, or edit with the handles to keep or add. */
async function decide(deps, reportId, act, text, by) {
  const { db, now } = deps;
  const id = clip(reportId, 200);
  const batch = (await readAccounts(db)).filter((a) => a.batch === id && a.status === "suggested");
  if (act === "approve" || act === "dismiss") {
    for (const a of batch) await saveAccount(db, Object.assign({}, a, { status: act === "approve" ? "approved" : "rejected", force: true }), now);
    return { message: batch.length + " accounts " + (act === "approve" ? "approved" : "dismissed") + "." };
  }
  if (act !== "edit") throw new Error("Say approve, edit or dismiss.");
  const typed = parseHandles(text);
  if (!typed.length) throw new Error("Write the handles to keep or add, like x:@metrodebogota ig:@movilidadbogota.");
  const kept = new Set();
  let added = 0;
  for (const h of typed) {
    const match = batch.find((a) => a.handle.toLowerCase() === h.handle.toLowerCase() && (!h.network || a.network === h.network));
    if (match) { kept.add(match.id); await saveAccount(db, Object.assign({}, match, { status: "approved", force: true }), now); continue; }
    if (!h.network) continue;
    await saveAccount(db, { network: h.network, handle: h.handle, kind: "related", status: "approved", scopes: ["report:" + id], batch: id, source: clip(by, 40) || "jarvis", force: true }, now);
    added += 1;
  }
  for (const a of batch.filter((x) => !kept.has(x.id))) await saveAccount(db, Object.assign({}, a, { status: "rejected", force: true }), now);
  return { message: kept.size + " kept, " + added + " added, " + (batch.length - kept.size) + " dismissed." };
}

/** Jarvis's account op: { network, handle } or { url }, status approved | rejected | blocked | suggested, scope "report:<id>" etc. */
async function account(deps, body, by) {
  const b = body || {};
  const h = b.url ? handleOf(b.url) : { network: NET_CODES[String(b.network || "").toLowerCase()], handle: clip(b.handle, 120).replace(/^@/, "") };
  if (!h || !h.network || !h.handle) throw new Error("Give a profile link, or a network and handle.");
  const status = STATUSES.includes(b.status) ? b.status : "approved";
  const scope = /^(report|city|sector|country):[\w.-]+$/.test(String(b.scope || "")) ? b.scope : "";
  if (status === "blocked") return block(deps, h, b.why || "blocked by " + (clip(by, 40) || "jarvis"), by);
  if (status === "approved" && !scope && !(await deps.db.collection("owner_tag_accounts").doc(accountId(h.network, h.handle)).get()).exists) throw new Error("Say where it belongs: scope report:<id>, city:<city>, sector:<sector> or country:<cc>.");
  const id = await saveAccount(deps.db, { network: h.network, handle: h.handle, kind: b.kind === "owner" ? "owner" : "related", status, scopes: scope ? [scope] : [], source: clip(by, 40) || "jarvis", force: true }, deps.now);
  return { id, message: "@" + h.handle + " on " + ((E.NETWORKS[h.network] || {}).name || h.network) + " is " + status + "." };
}

/** The names the Mac's agent read for menu mentions ([{ handle, name }]), kept on the accounts that had none. */
async function learnNames(db, network, list, now) {
  for (const m of list || []) {
    const name = clip(m && m.name, 80);
    if (!name || !m.handle) continue;
    const ref = db.collection("owner_tag_accounts").doc(accountId(network, m.handle));
    const was = (await ref.get()).data();
    if (was && !was.name) await ref.set({ name, updatedAt: new Date(now).toISOString() }, { merge: true });
  }
}

const LIST_ORDER = ["suggested", "approved", "rejected", "blocked"];
const commentAt = (d) => String(((d.actions || {}).reply || {}).postedAt || ((d.actions || {}).reply || {}).decidedAt || d.seenAt || "");

/**
 * What Jarvis > Engagement and the app show about owner tags: the settings, the last run, the accounts by status and
 * the first LIST_ACCOUNTS of them (suggested first), the newest LIST_COMMENTS comments and replies, and what was
 * posted on each network in the last 7 days (week).
 */
async function status(db, now) {
  const at = now || Date.now();
  const [s, last, accounts, mine] = await Promise.all([readSettings(db), db.collection("owner_tags").doc("last").get().then((d) => d.data() || null), readAccounts(db),
    db.collection("engagement_posts").where("campaign", "==", CAMPAIGN).limit(5000).get().then((q) => q.docs.map((d) => Object.assign({ key: d.id }, d.data())))]);
  const by = {};
  accounts.forEach((a) => { by[a.status] = (by[a.status] || 0) + 1; });
  const since = new Date(at - 7 * DAY).toISOString();
  const week = {};
  mine.filter((d) => ((d.actions || {}).reply || {}).status === "posted" && String(d.actions.reply.postedAt || "") >= since).forEach((d) => { week[d.network] = (week[d.network] || 0) + 1; });
  const rank = (a) => LIST_ORDER.indexOf(a.status);
  const list = accounts.slice().sort((a, b) => rank(a) - rank(b) || String(b.updatedAt || b.at || "").localeCompare(String(a.updatedAt || a.at || ""))).slice(0, LIST_ACCOUNTS)
    .map((a) => ({ id: a.id, network: a.network, handle: a.handle, name: a.name || "", kind: a.kind, status: a.status, scopes: a.scopes || [], batch: a.batch || "", source: a.source || "", why: a.why || "", verified: a.verified === true, at: a.updatedAt || a.at || "" }));
  const comments = mine.sort((a, b) => commentAt(b).localeCompare(commentAt(a))).slice(0, LIST_COMMENTS).map((d) => {
    const r = (d.actions || {}).reply || {};
    const t = d.ownerTags || {};
    return { key: d.key, network: d.network, kind: t.kind || "tags", status: r.status || "", draft: r.draft || "", url: r.url || "", post: d.url || "", error: r.error || "", at: commentAt(d),
      mentions: (t.mentions || []).length, report: t.report || (t.reports || [])[0] || "" };
  });
  return { settings: s, last, note: last ? runNote(Object.assign({ errors: [] }, last)) : "", accounts: by, waiting: accounts.filter((a) => a.status === "suggested").slice(0, 20).map((a) => ({ id: a.id, batch: a.batch, why: a.why })), list, comments, week };
}

// --- Jarvis on its own (jarvis-actions.js) ------------------------------------------------------------------------

/** A handle without its network's dressing, so @metrodebogota, metrodebogota.bsky.social and metrodebogota@mastodon.social match. */
const baseHandle = (a) => String(a.handle || "").toLowerCase().replace(/^@/, "").replace(/^channel\//, "").replace(/\.bsky\.social$/, "").replace(/@.*$/, "");

/** Suggested accounts Jarvis may approve alone: their handle resolved (verified), or an approved owner uses the same handle on another network. */
async function autoApprovable(db) {
  const accounts = await readAccounts(db);
  const owners = new Map();
  accounts.filter((a) => a.kind === "owner" && a.status === "approved").forEach((a) => owners.set(baseHandle(a), a));
  return accounts.filter((a) => a.status === "suggested").map((a) => {
    const owner = owners.get(baseHandle(a));
    const why = a.verified === true ? "its handle resolves" : owner && owner.network !== a.network ? "the owner is @" + owner.handle + " on " + ((E.NETWORKS[owner.network] || {}).name || owner.network) : "";
    return why ? { id: a.id, network: a.network, handle: a.handle, batch: a.batch || "", why } : null;
  }).filter(Boolean).sort((a, b) => a.id.localeCompare(b.id));
}

/** Approves the accounts named by id that are still suggested. */
async function approveMany(deps, ids, by) {
  const accounts = await readAccounts(deps.db);
  const take = accounts.filter((a) => (ids || []).includes(a.id) && a.status === "suggested");
  for (const a of take) await saveAccount(deps.db, Object.assign({}, a, { status: "approved", force: true, source: a.source || clip(by, 40) }), deps.now);
  return { count: take.length, ids: take.map((a) => a.id), message: take.length + " account" + (take.length === 1 ? "" : "s") + " approved: " + take.slice(0, 5).map((a) => "@" + a.handle).join(", ") + "." };
}

// A comment under one of our tags that asks us to stop ("stop tagging", "no me etiqueten", "ya basta", "spam"), and not
// one that only uses the word ("the bus stop", "basta con entrar").
const STOP = new RegExp([
  "^\\W*(?:stop|basta|para|pare|spam|unfollow)\\W*$", "\\bstop\\s+(?:tagging|mentioning|spamming|it|this|now|please)\\b", "\\bplease\\s+stop\\b", "\\b(?:spam|spammers?|spamming|unfollow(?:ed)?|unsubscribe)\\b",
  "\\b(?:ya\\s+basta|basta\\s+ya)\\b", "\\bno\\s+(?:me|nos)\\s+(?:etiquet|mencion|marqu)", "\\b(?:dejen|deja|dejad)\\s+de\\s+(?:etiquet|mencion|molest|escrib)", "d[eé]j[ae]n?(?:me|nos)\\s+en\\s+paz",
  "\\b(?:don'?t|do not|quit|stop)\\s+(?:tag|mention)", "\\bleave\\s+(?:me|us)\\s+alone\\b", "\\bparem?\\s+de\\s+(?:me\\s+)?(?:marcar|mencionar)", "\\bn[aã]o\\s+me\\s+marque",
  "\\barr[eê]te[sz]?\\s+de\\s+(?:me\\s+)?(?:tag|identif|mentionn)", "\\bne\\s+me\\s+taguez", "\\bh[oö]r(?:t|en sie)?\\s+auf\\b", "\\bsmettila\\b", "\\bnon\\s+taggarmi\\b"
].join("|"), "i");
const isStop = (text) => STOP.test(String(text || ""));

/**
 * Comments under our owner-tags comments and replies that ask us to stop, whose author is not blocked yet:
 * [{ id, network, handle, text, key, url }]. The account matched is the one already known on that network with the
 * same handle (a Mastodon user@server by its user), else a new one.
 */
async function stopRequests(db) {
  const [chained, accounts] = await Promise.all([
    db.collection("engagement_posts").where("chain.parent", ">=", "ot-").where("chain.parent", "<", "ot.").limit(500).get().then((q) => q.docs.map((d) => Object.assign({ key: d.id }, d.data()))),
    readAccounts(db)
  ]);
  const out = [];
  const seen = new Set();
  for (const d of chained.filter((x) => isStop(x.text))) {
    const handle = clip((d.author || {}).handle, 120).replace(/^@/, "");
    if (!handle || !d.network) continue;
    const known = accounts.find((a) => a.network === d.network && (a.handle.toLowerCase() === handle.toLowerCase() || (d.network === "mastodon" && baseHandle(a) === handle.toLowerCase().split("@")[0])));
    const id = known ? known.id : accountId(d.network, handle);
    if ((known && known.status === "blocked") || seen.has(id)) continue;
    seen.add(id);
    out.push({ id, network: d.network, handle: known ? known.handle : handle, text: clip(d.text, 200), key: d.key, url: d.url || "" });
  }
  return out;
}

/** Blocks an account ({ id } or { network, handle }) and dismisses its tags and replies not posted yet. */
async function block(deps, target, why, by) {
  const t = target || {};
  const id = t.id || (t.network && t.handle ? accountId(t.network, t.handle) : "");
  const [network, ...rest] = id.split(":");
  const handle = t.handle || rest.join(":").replace(/\|/g, "/");
  if (!network || !handle) throw new Error("Say which account to block.");
  await saveAccount(deps.db, { network, handle, status: "blocked", why: clip(why, 120), source: clip(by, 40) || "jarvis", force: true }, deps.now);
  const queued = (await deps.db.collection("engagement_posts").where("campaign", "==", CAMPAIGN).limit(5000).get()).docs
    .filter((d) => { const x = d.data(); const o = x.ownerTags || {}; return ((x.actions || {}).reply || {}).status === "approved" && ((o.mentions || []).includes(id) || o.account === id); });
  const at = new Date(deps.now).toISOString();
  for (const d of queued) await d.ref.update({ "actions.reply.status": "dismissed", "actions.reply.error": "@" + handle + " is blocked from owner tags.", updatedAt: at });
  return { id, dismissed: queued.length, message: "@" + handle + " on " + ((E.NETWORKS[network] || {}).name || network) + " is blocked" + (queued.length ? "; " + queued.length + " queued comment" + (queued.length === 1 ? "" : "s") + " dismissed" : "") + "." };
}

module.exports = {
  CAMPAIGN, RELATED_MAX, COMMENTS_MAX, MENTIONS, PICKED, PER_DAY, REPLY_NETS, LATEST_NETS, REPLY_DAYS, LATEST_RETRY_DAYS,
  handleOf, mentionOf, profileOf, learnNames, socialLinksOf, scopesOf, langOf, reportsOf, ourPosts, pick, comments, replyText, engagementDoc, suggestPrompt, parseSuggestions, parseHandles, accountId, docKey,
  run, runNote, decide, account, status, readSettings, saveSettings, latestPost, autoApprovable, approveMany, isStop, stopRequests, block
};
