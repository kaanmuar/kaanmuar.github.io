"use strict";
/*
 * Profile campaign (#2615): the company behind each public Live Report hears about its report on its own social
 * profiles, with its mini report card or link and a first-payment offer locked to its domain (url-review-domain-offer.js).
 *
 * Each scout run takes PER_RUN Live Reports in turn whose company is due, reads the site's homepage for its profiles
 * (profile links and schema.org sameAs, one per network), and has Gemini write one message per profile in the site's
 * language, in the tone of the touch (TONES). Every message waits for Carlos in Jarvis like every report reply:
 *
 *   reply   Bluesky and Mastodon (API_NETS) when the profile has an original post from the last FRESH_DAYS: a reply
 *           under it with the card, posted by engagement-act.js on approval
 *   copy    everywhere else, and API_NETS profiles with no fresh post: a message that names the profile, which approval
 *           turns "copy" for Carlos to paste on the network; neither poster picks it up
 *
 *   cadence one touch (all of a site's profiles) a WEEK at most, TOUCHES in all, and none in a week the site had a report
 *           reply, an owner notice or a cold email; never once the domain paid or asked not to be contacted
 *   link    the report reply's link (engagement-reports.js linkFor) with the offer code as a last segment, which
 *           qalabreview.com hands to the landing page as coupon=<code>
 *   ledger  engagement_profiles/<host> { host, profiles, code, touches [{ at, touch, keys }], stopped }
 *
 * Stored posts carry campaign "report-reply" and report.match "profile", so the card, the Engagement tab, the counters,
 * re-runs and the 30-day hold on owner notices and cold email treat them as report replies; report also holds
 * { touch, tone, offer, profile, manual }.
 */
const E = require("./engagement");
const R = require("./engagement-reports");

const DAY = 24 * 3600000;
const WEEK = 7 * DAY;
const TOUCHES = 4;
const PER_RUN = 3;
const FRESH_DAYS = 45;
const TTL = DAY;
const MATCH = "profile";
const COLLECTION = "engagement_profiles";
const API_NETS = ["bluesky", "mastodon"];
const TONES = ["cheer", "curious", "question", "last"];
const NETS = ["bluesky", "mastodon", "x", "linkedin", "facebook", "instagram", "threads", "youtube", "tiktok"];

// The link goes untouched up to R.LONG_LINK characters, plus the space before it.
const LINK_ROOM = R.LONG_LINK + 2;
// The message speaks to an organisation, so the singular register of report replies (R.REGISTER) would mix forms.
const ORG_REGISTER = "You are writing to an organisation: address it in the plural and keep that one form of address in the whole message (ustedes in Spanish, vocês in Portuguese, voi in Italian, Sie in German, vous in French).";

const room = (network) => ((E.NETWORKS[network] || {}).limit || 300) - LINK_ROOM;
const clip = (v, n) => String(v == null ? "" : v).replace(/\s+/g, " ").trim().slice(0, n);
const lang2 = (v) => String(v || "").slice(0, 2).toLowerCase();

// Paths on a network's own host that are not an account: sharing, search, posts, the network's own pages.
const NOT_ACCOUNT = /^(share|sharer|sharer\.php|intent|home|search|hashtag|explore|i|p|reel|reels|watch|status|login|signup|privacy|legal|help|about|policies|tos|terms|settings|dialog|plugins|groups|events|pages|profile\.php)$/i;
// Mastodon servers go by many names; a /@user path on a host like these is taken as one.
const MASTODON_HOST = /(^|\.)(mastodon\.[a-z.]+|mstdn\.[a-z.]+|[a-z0-9-]*masto[a-z0-9-]*\.[a-z.]+|fosstodon\.org|hachyderm\.io|infosec\.exchange|social\.[a-z0-9.-]+|toot\.[a-z.]+|chaos\.social|det\.social|norden\.social|troet\.cafe)$/i;

/** One profile link as { network, handle, url }, or null when it is not an account page on a network we know. */
function profileOf(href, base) {
  let u;
  try { u = new URL(String(href || "").trim(), base || undefined); } catch (error) { return null; }
  if (!/^https?:$/.test(u.protocol)) return null;
  const host = u.hostname.toLowerCase().replace(/^(www|m|mobile)\./, "");
  const seg = u.pathname.split("/").filter(Boolean).map((s) => { try { return decodeURIComponent(s); } catch (error) { return s; } });
  const first = seg[0] || "";
  const at = (network, handle) => ({ network, handle, url: u.origin.replace(/\/\/(www|m|mobile)\./, "//") + "/" + seg.slice(0, network === "linkedin" || (network === "youtube" && !first.startsWith("@")) || network === "bluesky" ? 2 : 1).join("/") });
  if (host === "bsky.app") return first === "profile" && /^[a-z0-9.:-]{3,253}$/i.test(seg[1] || "") ? at("bluesky", seg[1].toLowerCase()) : null;
  if (host === "x.com" || host === "twitter.com") return /^[A-Za-z0-9_]{1,15}$/.test(first) && !NOT_ACCOUNT.test(first) ? at("x", "@" + first) : null;
  if (host === "linkedin.com") return /^(company|school|showcase)$/.test(first) && /^[\w.%-]{2,100}$/.test(seg[1] || "") ? at("linkedin", seg[1]) : null;
  if (host === "facebook.com" || host === "fb.com") return /^[\w.-]{3,80}$/.test(first) && !NOT_ACCOUNT.test(first) ? at("facebook", first) : null;
  if (host === "instagram.com") return /^[A-Za-z0-9_.]{1,30}$/.test(first) && !NOT_ACCOUNT.test(first) ? at("instagram", "@" + first) : null;
  if (host === "threads.net" || host === "threads.com") return /^@[A-Za-z0-9_.]{1,30}$/.test(first) ? at("threads", first) : null;
  if (host === "youtube.com") {
    if (/^@[\w.-]{2,100}$/.test(first)) return at("youtube", first);
    return /^(channel|c|user)$/.test(first) && seg[1] ? at("youtube", seg[1]) : null;
  }
  if (host === "tiktok.com") return /^@[\w.]{2,24}$/.test(first) ? at("tiktok", first) : null;
  if (MASTODON_HOST.test(host) && seg.length === 1 && /^@[A-Za-z0-9_]{1,30}$/.test(first)) return at("mastodon", first.slice(1) + "@" + host);
  return null;
}

/** A homepage's profiles, one per network in NETS order: its links first, then schema.org sameAs. */
function profilesOf(html, base) {
  const text = String(html || "").slice(0, 800000);
  const hrefs = [];
  const linkRe = /<a\b[^>]*?\bhref\s*=\s*(?:"([^"]*)"|'([^']*)')/gi;
  let m;
  while ((m = linkRe.exec(text)) && hrefs.length < 1500) hrefs.push(m[1] || m[2] || "");
  const sameRe = /"sameAs"\s*:\s*(\[[^\]]*\]|"[^"]*")/g;
  while ((m = sameRe.exec(text))) {
    try { [].concat(JSON.parse(m[1])).forEach((x) => typeof x === "string" && hrefs.push(x)); } catch (error) { /* not JSON */ }
  }
  const byNet = {};
  hrefs.forEach((h) => {
    const p = profileOf(h.replace(/&amp;/g, "&"), base);
    if (p && !byNet[p.network]) byNet[p.network] = p;
  });
  return NETS.filter((n) => byNet[n]).map((n) => byNet[n]);
}

/** A ledger's touches as ms, newest last. */
const touchTimes = (led) => ((led && led.touches) || []).map((t) => Date.parse(t.at)).filter(Number.isFinite).sort((a, b) => a - b);

/**
 * Whether a site's company is due a touch: { ok, touch, why }. ctx: { paid, stop, lastContact (ms of our latest report
 * reply, owner notice or cold email) }. why: "paid", "stop", "done", "week" or "".
 */
function due(led, now, ctx) {
  const c = ctx || {};
  if (c.paid) return { ok: false, touch: 0, why: "paid" };
  if (c.stop || (led && led.stopped)) return { ok: false, touch: 0, why: "stop" };
  const times = touchTimes(led);
  if (times.length >= TOUCHES) return { ok: false, touch: 0, why: "done" };
  const last = Math.max(times.length ? times[times.length - 1] : 0, Number(c.lastContact) || 0);
  if (last && now - last < WEEK) return { ok: false, touch: 0, why: "week" };
  return { ok: true, touch: times.length + 1, why: "" };
}

const toneOf = (touch) => TONES[Math.min(TONES.length, Math.max(1, touch)) - 1];

/** The latest original post from posts (as engagement-sources maps them) in the last FRESH_DAYS that ok passes, or null. */
function latestOf(posts, now, ok) {
  const since = now - FRESH_DAYS * DAY;
  return (posts || []).filter((p) => p && p.id && !p.isReply && Date.parse(p.createdAt) >= since && (!ok || ok(p)))
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))[0] || null;
}

/** An email's domain is the site's, or one of them sits under the other. */
function sameDomain(email, host) {
  const d = R.bare(String(email || "").split("@")[1] || "");
  const h = R.bare(host);
  return !!d && !!h && (d === h || h.endsWith("." + d) || d.endsWith("." + h));
}

/** The link for a message: the report reply's link with the offer code as its last segment. */
function linkFor(t, network, lang, key, code) {
  return R.linkFor(t, network, lang, key) + (code ? "/" + String(code).toLowerCase() : "");
}

const TONE_RULES = {
  cheer: "Touch 1, cheer: open on something genuine about them (their post when there is one, or what the organisation does), say we included their site in our public website reviews and invite them to see their report. No offer.",
  curious: "Touch 2, curious: one friendly, curious question tied to site.weakest (how they approach it), then say their live report has a few findings on it worth a look. No offer.",
  question: "Touch 3, question: a light question that hints there is something in site.weakest worth checking, without diagnosing, blaming or naming numbers, and mention a welcome offer for site.domain: offer.percent% off their first payment, offer.days days from when they open it.",
  last: "Touch 4, last note: short and kind, say their report stays live and the offer.percent% welcome offer for site.domain is still there for offer.days days once opened. No pressure words, no countdowns.",
  trial: "Tone trial (#3139, a company whose business runs on its site): say we reviewed site.domain and name site.weakest as one area worth a look, then offer offer.days days of full free access for site.domain at {link}, and offer.percent% off their first payment after it. No pressure words, no countdowns."
};

/** The Gemini prompt for this run's messages, one per item, with {link} where the link goes. */
function prompt(items) {
  const list = items.map((p) => ({
    id: p.key, network: (E.NETWORKS[p.network] || {}).name || p.network, mode: p.mode, handle: p.profile.handle, lang: p.lang, touch: p.touch, tone: p.tone,
    post: p.mode === "reply" ? clip(p.post.text, 700) : "",
    site: { name: p.target.name || p.target.host, domain: p.target.host, sector: p.target.sector, country: p.target.country, score: R.shown(p.target) ? p.target.score : null, weakest: p.target.weakest },
    offer: { percent: p.offer.percent, days: p.offer.days },
    maxLength: room(p.network)
  }));
  return [
    "You help Carlos & Munoz (carlosandmunoz.com) tell an organisation, on its own social profile, that a free public report of its website is live: QA-lab URL Review checks a site's SEO, GEO (AI search), accessibility, performance, analytics and security.",
    "For each item return one JSON object in a JSON array, same order: {\"id\": same id, \"text\": the message, or \"\" when nothing honest and welcome can be said}.",
    "mode \"reply\" is a reply under the organisation's own post (post): open on what the post says, and return \"\" when the post is about politics, elections, war, a tragedy, a death, a crisis or a fight. mode \"copy\" is a message to the profile: start with handle.",
    TONE_RULES.cheer, TONE_RULES.curious, TONE_RULES.question, TONE_RULES.last,
    ...(items.some((p) => p.tone === "trial") ? [TONE_RULES.trial] : []),
    "Rules: write in lang (en, es, pt, de, fr or it). First person plural, warm, specific, one or two short sentences. When site.score is a number you may name it as score/100; when it is null never name a score, grade or number and never call the site bad, slow, broken or unsafe. Say only what site says; no made-up findings. End with {link} exactly once. " + ORG_REGISTER,
    "Never: any other link or address (naming the site is fine), hashtags, more than one emoji, em dashes, flattery like \"Great post!\", made-up numbers, urgency or sales talk, or anything about a person.",
    "Stay under maxLength characters, {link} not counted.",
    "Items:",
    JSON.stringify(list)
  ].join("\n");
}

/**
 * Gemini's messages by id, cleaned like report replies: one {link}, no other links, hashtags or em dashes, no unshown
 * score. A message too long for its network next to the link is dropped rather than cut mid-sentence.
 */
function parse(text, items) {
  let rows;
  try { rows = JSON.parse(String(text || "").replace(/^```(?:json)?|```$/gm, "").trim()); } catch (error) { return {}; }
  if (!Array.isArray(rows)) return {};
  const byKey = Object.fromEntries((items || []).map((p) => [p.key, p]));
  const out = {};
  rows.forEach((r) => {
    const p = r && byKey[r.id];
    if (!p) return;
    let msg = String(r.text || "").replace(/\bhttps?:\/\/\S+|\bwww\.\S+/gi, "").replace(/(^|\s)#[\p{L}\p{N}_]+/gu, "$1").replace(/\s*—\s*/g, ", ").replace(/\s{2,}/g, " ").trim();
    let once = false;
    msg = msg.replace(/\{link\}/g, () => (once ? "" : (once = true, "{link}"))).replace(/\s+([,.])/g, "$1").replace(/\s{2,}/g, " ").trim();
    if (msg && !once) msg += " {link}";
    if (!R.shown(p.target) && (new RegExp("\\b" + p.target.score + "\\b").test(msg) || /\b\d{1,3}\s*\/\s*100\b/.test(msg))) msg = "";
    const body = msg.replace("{link}", "").trim().length;
    if (body >= 12 && body <= room(p.network)) out[r.id] = msg;
  });
  return out;
}

/** The engagement_posts document for one message, waiting for Carlos. */
function doc(item, message, link, now) {
  const manual = item.mode !== "reply";
  const post = manual
    ? { network: item.network, id: item.profile.url, url: item.profile.url, author: { handle: item.profile.handle, name: item.target.name || item.target.host }, text: "", lang: item.lang, createdAt: new Date(now).toISOString() }
    : item.post;
  const reply = { status: "waiting", kind: R.CAMPAIGN, draft: R.fill(message, link, item.network), lang: item.lang, expiresAt: new Date(now + TTL).toISOString() };
  const base = E.postDoc(Object.assign({}, post, { topic: "Reports", topics: ["Reports"] }), { about: "Profile campaign, touch " + item.touch, lang: item.lang }, { verdict: "engage", skip: "", actions: { reply } }, now);
  const t = item.target;
  return Object.assign(base, {
    campaign: R.CAMPAIGN,
    report: {
      host: t.host, id: t.id, name: t.name, score: t.score, shown: R.shown(t), weakest: t.weakest, match: MATCH, problem: "", niche: "", query: "",
      format: !manual && R.CARD_NETS.includes(item.network) ? "card" : "link", link,
      touch: item.touch, tone: item.tone, offer: item.offer.code, profile: item.profile.url, manual
    }
  });
}

/** The ledger patch after a touch: profiles seen, the offer code, and the touch with its post keys. */
function ledgerPatch(led, host, profiles, code, touch, keys, now) {
  return {
    host, profiles, code,
    touches: ((led && led.touches) || []).concat({ at: new Date(now).toISOString(), touch, keys }),
    updatedAt: new Date(now).toISOString()
  };
}

module.exports = {
  WEEK, TOUCHES, PER_RUN, FRESH_DAYS, TTL, MATCH, COLLECTION, API_NETS, TONES, NETS,
  profileOf, profilesOf, due, toneOf, latestOf, sameDomain, linkFor, prompt, parse, doc, ledgerPatch
};
