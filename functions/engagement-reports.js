"use strict";
/*
 * Report replies (#2465): posts that name a site we reviewed get a reply inviting them to its report.
 *
 * Each scout run takes PER_RUN public Live Reports in turn (assets/live-reports/index.json, which never holds private,
 * unlisted or paid owner reports), searches the networks for posts naming the site's domain or name
 * (functions/engagement-sources.js search), and has Gemini check each post is really about that site and write the
 * invite in the post's language. The reply waits for Carlos in Jarvis like every engagement reply; answers to it come
 * back through the comment chains (#2421). A report run from the link is published to the Live Reports in turn and
 * so becomes a site the scout looks for.
 *
 *   link    qalabreview.com/<lang>/r/<network code>/<host>/<post ref> (qalabreview/src/routes.js): utm_campaign
 *           social-reply-<network>, utm_content <host>, utm_term <post ref>; TinyURL when it runs past LONG_LINK
 *   score   named from SHOW_SCORE up; under it the invite points at the weakest area and names no number
 *   format  "card" where the network takes an image in a reply (CARD_NETS), else "link"
 *   once    one reply per site per SITE_GAP across all networks, and none to a site whose owner had our mail in it
 *
 * Each stored post carries campaign "report-reply" and report { host, id, name, score, shown, weakest, match, format, link }.
 */
const E = require("./engagement");

const DAY = 24 * 3600000;
const SITE_GAP = 30 * DAY;
const SHOW_SCORE = 80;
const PER_RUN = 4;
const MAX_AGE_HOURS = 7 * 24;
const LONG_LINK = 60;
const CAMPAIGN = "report-reply";
const SHORT = "https://qalabreview.com/";
const CODES = { bluesky: "bsky", mastodon: "mast", youtube: "yt", x: "x", linkedin: "li", facebook: "fb", instagram: "ig", threads: "th", tiktok: "tt" };
const CARD_NETS = ["bluesky", "mastodon", "x"];
// Names that say nothing on their own; those sites are searched by domain only.
const GENERIC = /^(home|inicio|accueil|startseite|welcome|bienvenid[oa]s?|index|news|noticias|blog|shop|store|tienda|loja|portal|site|web)$/i;

const clip = (v, n) => String(v == null ? "" : v).replace(/\s+/g, " ").trim().slice(0, n);
const bare = (h) => String(h || "").trim().toLowerCase().replace(/^https?:\/\//, "").split("/")[0].replace(/^www\./, "");
const lang2 = (v) => String(v || "").toLowerCase().slice(0, 2);
const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** The Live Reports index as sites to look for: { id, host, name, score, grade, sector, country, weakest, read }. */
function targets(index) {
  const seen = new Set();
  return ((index || {}).reports || []).filter((r) => r && r.id && r.host && Number.isFinite(Number(r.overall))).map((r) => {
    const areas = Object.entries(r.areas || {}).filter(([, v]) => Number.isFinite(Number(v))).sort((a, b) => a[1] - b[1]);
    return { id: clip(r.id, 80), host: bare(r.host), name: clip(r.name, 80), score: Math.round(Number(r.overall)), grade: clip(r.grade, 3), sector: clip(r.sector, 40), country: clip(r.country, 4), weakest: areas.length ? areas[0][0] : "", read: clip(r.read, 10) };
  }).filter((t) => t.host.includes(".") && !seen.has(t.host) && seen.add(t.host));
}

/** A name worth searching on its own: long enough, not generic, and not just the domain again. */
const nameOk = (t) => t.name.length >= 4 && !GENERIC.test(t.name) && bare(t.name) !== t.host;

/** This slot's sites, skipping those answered or emailed in the gap (skip holds hosts). */
function pick(list, slot, skip, n) {
  const open = list.filter((t) => !(skip && skip.has(t.host)));
  if (!open.length) return [];
  const k = Math.min(n || PER_RUN, open.length);
  return Array.from({ length: k }, (_, i) => open[(slot * k + i) % open.length]);
}

/** What to search for a site: its domain, and its name when that says something. */
const queries = (t) => [t.host].concat(nameOk(t) ? [t.name] : []);

/** How a post names a site: "domain", "name" or "". */
function matchOf(post, t) {
  const hay = [post.title, post.text, post.url, (post.tags || []).join(" ")].join("\n").toLowerCase();
  if (hay.includes(t.host)) return "domain";
  if (nameOk(t) && new RegExp("(^|[^\\p{L}\\p{N}])" + escape(t.name.toLowerCase()) + "($|[^\\p{L}\\p{N}])", "u").test(hay)) return "name";
  return "";
}

/** The site a post names, of the sites searched this run, as { target, match } or null. */
function siteOf(post, list) {
  const q = String(post.query || "").toLowerCase();
  const first = list.filter((t) => q && (q === t.host || q === t.name.toLowerCase())).concat(list);
  for (const t of first) { const m = matchOf(post, t); if (m) return { target: t, match: m }; }
  return null;
}

const shown = (t) => t.score >= SHOW_SCORE;

/** The report's link for a reply: the post's language, the network's code, and a ref from the post's key. */
function linkFor(t, network, lang, key) {
  const ref = String(key || "").split("_").pop().slice(0, 6);
  return SHORT + (E.LANGS.includes(lang) ? lang : "en") + "/r/" + CODES[network] + "/" + t.host + (ref.length >= 4 ? "/" + ref : "");
}

/** The Gemini prompt: is each post about the site, and the invite to its report, with {link} where the link goes. */
function prompt(items) {
  const list = items.map((p) => ({
    id: p.key, network: (E.NETWORKS[p.network] || {}).name || p.network, lang: lang2(p.lang) || "?", author: clip((p.author || {}).name || (p.author || {}).handle, 60),
    title: clip(p.title, 160), text: clip(p.text, 900),
    site: { name: p.target.name || p.target.host, domain: p.target.host, sector: p.target.sector, score: shown(p.target) ? p.target.score : null, weakest: p.target.weakest },
    maxReply: ((E.NETWORKS[p.network] || {}).limit || 300) - 32
  }));
  return [
    "You help Carlos & Munoz (carlosandmunoz.com) invite people to a free website report we already ran: QA-lab URL Review checks a site's SEO, GEO (AI search), accessibility, performance, analytics and security.",
    "Each post below names a website we reviewed (site). For each post, return one JSON object in a JSON array, same order, with exactly these keys:",
    '{"id": same id, "aboutSite": true only when the post is really about this website or the organisation behind it, not something else with the same name, "about": what the post is about in at most 20 English words, "lang": the post\'s language as an ISO 639-1 code, "sentiment": "positive" | "neutral" | "negative" | "angry", "political": true when it is about politics, elections, wars or culture-war topics, "argument": true when the thread is a fight or a pile-on, "worth": 0 to 1, how welcome a short note about the site\'s report would be under this post, "why": at most 15 English words, "reply": the invite, or "" when aboutSite is false, worth is under 0.6, or the post is political, angry, an argument or about a tragedy}',
    "Reply rules: write in the post's language (en, es, pt, de, fr or it; otherwise reply \"\"). Speak as a helpful practitioner, first person plural, warm and specific, in one or two short sentences. Open on what the post says, then say we ran a free review of the site and invite them to look at it. When site.score is a number you may name it as score/100; when it is null never name a score, grade or number, never call the site bad, slow, broken or unsafe, and say instead that the report has a few findings worth a look on site.weakest. End with {link} exactly once, where the link goes. " + REGISTER,
    "Never: any link or address other than {link} (naming the site is fine), hashtags, more than one emoji, em dashes, flattery like \"Great post!\", made-up numbers, pressure or sales talk, or anything about the author's person. Stay under maxReply characters, {link} not counted.",
    "Posts:",
    JSON.stringify(list)
  ].join("\n");
}

const REGISTER = "Address people as tú in Spanish, você in Portuguese, tu in Italian, Sie in German and vous in French.";

/** Gemini's answer by id. A reply keeps one {link} (added at the end when missing) and is dropped when it names a score we do not show. */
function parse(text, items) {
  let rows;
  try { rows = JSON.parse(String(text || "").replace(/^```(?:json)?|```$/gm, "").trim()); } catch (error) { return {}; }
  if (!Array.isArray(rows)) return {};
  const byKey = Object.fromEntries((items || []).map((p) => [p.key, p]));
  const out = {};
  rows.forEach((r) => {
    const p = r && byKey[r.id];
    if (!p) return;
    let reply = String(r.reply || "").replace(/\bhttps?:\/\/\S+|\bwww\.\S+/gi, "").replace(/(^|\s)#[\p{L}\p{N}_]+/gu, "$1").replace(/\s*—\s*/g, ", ").replace(/\s{2,}/g, " ").trim();
    let once = false;
    reply = reply.replace(/\{link\}/g, () => (once ? "" : (once = true, "{link}"))).replace(/\s{2,}/g, " ").trim();
    if (reply && !once) reply += " {link}";
    if (!shown(p.target) && (new RegExp("\\b" + p.target.score + "\\b").test(reply) || /\b\d{1,3}\s*\/\s*100\b/.test(reply))) reply = "";
    out[r.id] = {
      aboutSite: r.aboutSite === true, about: clip(r.about, 200), lang: lang2(r.lang) || lang2(p.lang),
      sentiment: ["positive", "neutral", "negative", "angry"].includes(r.sentiment) ? r.sentiment : "neutral",
      political: r.political === true, argument: r.argument === true, worth: Math.min(1, Math.max(0, Number(r.worth) || 0)), why: clip(r.why, 160),
      reply: reply.replace("{link}", "").trim().length >= 12 ? reply : ""
    };
  });
  return out;
}

/** The reply with its link in, cut before the link to the network's limit. */
function fill(reply, link, network) {
  const limit = (E.NETWORKS[network] || {}).limit || 300;
  let [before, after = ""] = reply.split("{link}");
  const room = limit - link.length - after.length;
  if (before.length > room) before = before.slice(0, Math.max(0, room - 2)).replace(/\s+\S*$/, "") + "… ";
  return (before + link + after).replace(/\s{2,}/g, " ").trim();
}

/**
 * What to do with a post that names a site. ctx: { recent: hosts answered in the gap, contacted: Map host => why,
 * replied: E.threadKey of conversations we answered, links: post key => the link to use }. Same shape as E.decide,
 * with the reply only: waiting for Carlos, capped (shared with the scout's daily reply cap), paused or replied.
 */
function decide(post, ai, target, conf, used, now, ctx) {
  const net = E.NETWORKS[post.network] || {};
  const no = (skip) => ({ verdict: "skip", skip, actions: {} });
  if (!net.acts || !CODES[post.network] || (net.only && !net.only.includes("reply"))) return { verdict: "trend", skip: "", actions: {} };
  const g = E.guard(post, Object.assign({}, conf, { maxAgeHours: Math.max(conf.maxAgeHours, MAX_AGE_HOURS) }), now);
  if (g) return no(g);
  if (ctx.recent.has(target.host)) return no("site_recent");
  if (ctx.contacted.has(target.host)) return no("contacted");
  if (!ai) return no("unread");
  if (!ai.aboutSite) return no("not_site");
  const flag = ai.political ? "political" : ai.argument ? "argument" : ai.sentiment === "angry" ? "angry" : "";
  if (flag) return no(flag);
  const lang = ai.lang || lang2(post.lang);
  if (!E.LANGS.includes(lang)) return no("lang");
  if (!ai.reply || ai.worth < conf.worth) return { verdict: "watch", skip: "", actions: {} };
  if (ctx.replied.has(E.threadKey(post))) return { verdict: "watch", skip: "", actions: { reply: { status: "replied", error: "We already replied in this conversation." } } };
  if (conf.paused) return { verdict: "watch", skip: "", actions: { reply: { status: "paused" } } };
  const n = ((used[post.network] || {}).reply) || 0;
  const own = (net.caps || {}).reply;
  if (n >= Math.min(conf.caps.reply, own === undefined ? Infinity : own)) return { verdict: "watch", skip: "", actions: { reply: { status: "capped" } } };
  used[post.network] = Object.assign({}, used[post.network], { reply: n + 1 });
  ctx.recent.add(target.host);
  const link = (ctx.links && ctx.links[post.key]) || linkFor(target, post.network, lang, post.key);
  return {
    verdict: "engage", skip: "",
    actions: { reply: { status: "waiting", kind: CAMPAIGN, draft: fill(ai.reply, link, post.network), lang, expiresAt: new Date(now + E.REPLY_TTL).toISOString() } }
  };
}

/** The engagement_posts document for a post that names a site. */
function doc(post, ai, target, match, decision, link, now) {
  const a = ai || {};
  const base = E.postDoc(Object.assign({}, post, { topic: "Reports", topics: ["Reports"] }), { about: a.about, lang: a.lang, sentiment: a.sentiment, worth: a.worth, why: a.why }, decision, now);
  return Object.assign(base, {
    campaign: CAMPAIGN,
    report: { host: target.host, id: target.id, name: target.name, score: target.score, shown: shown(target), weakest: target.weakest, match, query: clip(post.query, 80), format: CARD_NETS.includes(post.network) ? "card" : "link", link: link || "" }
  });
}

/** Counters a report pass adds to engagement_daily/<day> under report, besides the scout's own per-network ones. */
function rollup(searched, docs) {
  const out = { searched, matched: 0, drafted: 0, skip: {}, net: {} };
  (docs || []).forEach((d) => {
    out.matched += 1;
    out.net[d.network] = (out.net[d.network] || 0) + 1;
    if (d.skip) out.skip[d.skip] = (out.skip[d.skip] || 0) + 1;
    if (((d.actions || {}).reply || {}).status === "waiting") out.drafted += 1;
  });
  return out;
}

module.exports = {
  CAMPAIGN, CODES, CARD_NETS, SHOW_SCORE, SITE_GAP, PER_RUN, LONG_LINK, MAX_AGE_HOURS,
  targets, pick, queries, matchOf, siteOf, shown, linkFor, prompt, parse, fill, decide, doc, rollup, bare
};
