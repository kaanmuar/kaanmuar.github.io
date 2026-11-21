'use strict';
/*
 * Riding the trends (#3814): what the scouts add to ride the conversations people already have, without I/O.
 *
 *   ADJACENT   keywords next to our field (AI search and chatbots, outages, breaches, vibe coding, dev life, launches)
 *              that engagement.js adds to TOPICS, so posts about them are read and scored like field posts.
 *   viral      a post that is trending hard on its network is read even when it names no keyword; Gemini still decides
 *              whether we can add an on-topic angle, and the guards still skip politics, fights, drama and promo.
 *   trendingNow  the tags that are rising in this run's reads, weighted by how fast their posts grow.
 *   pickTag    the one hashtag a reply carries, on the networks where a hashtag in a reply is normal (TAG_NETWORKS).
 *   drama      threads about a named person or brand being attacked, boycotted or exposed: we stay out.
 *   autoReply  a reply that is safe and on a trend goes out without waiting for Carlos (live runs only).
 */
const ADJACENT = [
	'chatgpt',
	'openai',
	'claude',
	'gemini',
	'copilot',
	'llms?',
	'ai agents?',
	'agentic',
	'mcp server',
	'vibe ?coding',
	'prompt engineering',
	'web ?dev',
	'web development',
	'front-?end',
	'javascript',
	'typescript',
	'next\\.js',
	'open source',
	'outage',
	'downtime',
	'is down',
	'incident',
	'post-?mortem',
	'data breach',
	'ransomware',
	'phishing',
	'zero-?day',
	'vulnerabilit(?:y|ies)',
	'cve-\\d{4}-\\d+',
	'passkeys?',
	'ddos',
	'supply chain attack',
	'bug bounty',
	'devops',
	'ci/cd',
	'deploy(?:ed|ing)? on friday',
	'works on my machine',
	'ship(?:ped|ping) it',
	'hackathon',
	'side project',
	'indie hackers?',
	'build in public',
	'launch day',
	'startup',
	'dark patterns?',
	'cookie wall',
	'eu ai act',
	'digital services act',
	'page experience',
	'site migration',
	'broken links?',
];

// Tags a reply never carries, or that point at news we stay out of (as SENSITIVE in engagement.js, but for a tag, which has no word breaks).
const BAD_TAG =
	/^(f4f|l4l|s4s|sfs|followback|follow4follow|followforfollow|like4like|giveaways?|airdrop|nft\w*|onlyfans|nsfw|18plus|casino\w*|betting|gambling|porn\w*|sex\w*|nude\w*)$/i;
const SENSITIVE_TAG =
	/election|vote|trump|biden|maga|nazi|gaza|israel|ukraine|russia|terror|genocide|layoff|murder|shooting|suicide|lawsuit|scandal|boycott|metoo|rip$|^war|war$|politic|protest|abortion|immigra/i;

// A thread about a person or a company being attacked, boycotted or exposed. Not our fight, and a "smart" reply under it is a pile-on.
const DRAMA =
	/\b(boycott\w*|cancel(?:l?ed)? (?:him|her|them|the)|exposed|expos(?:e|ing)|scammer|scam(?:med)?|rip-?off|fraud\w*|worst (?:company|service|brand)|dumpster fire|pile[- ]on|ratio'?d|clown|shame on|disgusting|should be fired|resign\w*|apolog(?:y|ise|ize) now|vs\.? (?:semrush|ahrefs|moz|browserstack|lambdatest|hotjar))\b/i;

// Networks where a hashtag in a reply is normal; LinkedIn, Facebook, YouTube, Reddit and Telegram read it as promotion, or have no tags.
const TAG_NETWORKS = ['x', 'instagram', 'tiktok', 'threads', 'bluesky', 'mastodon'];

// One evergreen tag per topic of engagement.js, for a reply with no better tag in the thread.
const EVERGREEN = {
	Testing: ['SoftwareTesting', 'TestAutomation', 'QA'],
	SEO: ['SEO', 'TechnicalSEO'],
	GEO: ['GEO', 'AISearch'],
	Accessibility: ['a11y', 'Accessibility'],
	Performance: ['WebPerf', 'CoreWebVitals'],
	Analytics: ['GA4', 'Analytics'],
	Security: ['WebSecurity', 'InfoSec'],
	Privacy: ['Privacy', 'GDPR'],
	Procurement: [],
	Trends: ['WebDev', 'TechTwitter'],
};

const norm = (t) =>
	String(t || '')
		.replace(/^#/, '')
		.trim();
const clean = (t) => {
	const tag = norm(t);
	return /^[\p{L}\p{N}_]{3,30}$/u.test(tag) && !/^\d+$/.test(tag) && !BAD_TAG.test(tag) && !SENSITIVE_TAG.test(tag)
		? tag
		: '';
};
const hashtagsIn = (text) =>
	(String(text || '').match(/(?:^|\s)#([\p{L}\p{N}_]{3,30})/gu) || []).map((m) => m.replace(/^\s*#/, ''));
const tagsOf = (post) =>
	Array.from(new Set((post.tags || []).concat(hashtagsIn(post.text)).map(clean).filter(Boolean)));
const hash = (s) => Array.from(String(s)).reduce((h, c) => Math.imul(h ^ c.codePointAt(0), 16777619) >>> 0, 2166136261);

/** The tags rising in this run's posts: [{ tag, weight, posts }], heaviest first. posts: scored posts ({ trend, tags, text }). */
function trendingNow(posts, keep) {
	const by = new Map();
	(posts || []).forEach((p) => {
		tagsOf(p).forEach((t) => {
			const k = t.toLowerCase();
			const row = by.get(k) || { tag: t, weight: 0, posts: 0 };
			row.weight += 1 + Math.max(0, Number(p.trend) || 0);
			row.posts += 1;
			by.set(k, row);
		});
	});
	return Array.from(by.values())
		.filter((r) => r.posts >= 2 || r.weight >= 4)
		.sort((a, b) => b.weight - a.weight)
		.slice(0, keep || 30)
		.map((r) => ({ tag: r.tag, weight: Math.round(r.weight * 100) / 100, posts: r.posts }));
}

/**
 * The one hashtag a reply on this network carries, or "". Order: a tag of the post that is also rising now, a rising tag
 * in the post's own topic, a tag of the post that names our field, then an evergreen tag of its topic.
 * rel: engagement.js relevance, so this file needs no copy of the topic keywords.
 */
function pickTag(post, trends, rel) {
	if (!TAG_NETWORKS.includes(post.network)) return '';
	const own = tagsOf(post);
	const rising = new Map((trends || []).map((t) => [t.tag.toLowerCase(), t]));
	const hot = own
		.filter((t) => rising.has(t.toLowerCase()))
		.sort((a, b) => rising.get(b.toLowerCase()).weight - rising.get(a.toLowerCase()).weight)[0];
	if (hot) return hot;
	const topic = post.topic || '';
	const near = (trends || []).find((t) => clean(t.tag) && rel(t.tag).topic === topic && topic);
	if (near) return near.tag;
	const inField = own.find((t) => rel('#' + t).hits > 0);
	if (inField) return inField;
	const list = EVERGREEN[topic] || [];
	return list.length ? list[hash(post.key || post.id || '') % list.length] : '';
}

/** The reply with " #tag" added when it fits the network's limit and does not carry the tag already. */
function withTag(reply, tag, limit) {
	const t = clean(tag);
	const text = String(reply || '').trim();
	if (!t || !text || new RegExp('#' + t + '(?![\\p{L}\\p{N}_])', 'iu').test(text)) return text;
	const next = text + ' #' + t;
	return next.length <= (limit || 300) ? next : text;
}

/** A post trending hard on its network: worth a read even with no keyword in it. s: the score row from engagement.js. */
const VIRAL_TREND = 4;
const viral = (post, s) => (Number(s.trend) || 0) >= VIRAL_TREND && String(post.text || post.title || '').length >= 40;

/** Why a thread is a person or brand under attack, or "". */
const drama = (post) => (DRAMA.test([post.title, post.text].join(' ')) ? 'drama' : '');

/**
 * A reply that goes out without waiting for Carlos: a live run, Gemini found nothing political, angry, fighting, promo or
 * dramatic, it is not about a sensitive topic, and it rides a trend (a viral post, or a tag rising now).
 */
function autoReply(post, ai, conf, trends, tag) {
	if (!conf || conf.live !== true || conf.autoReplies === false || !ai) return false;
	if (ai.political || ai.argument || ai.promo || ai.drama || ai.sentiment === 'angry' || ai.sentiment === 'negative')
		return false;
	if (ai.worth < Math.max(0.75, conf.worth)) return false;
	const rising = tag && (trends || []).some((t) => t.tag.toLowerCase() === tag.toLowerCase());
	return (Number(post.trend) || 0) >= VIRAL_TREND || !!rising;
}

module.exports = {
	ADJACENT,
	TAG_NETWORKS,
	EVERGREEN,
	VIRAL_TREND,
	clean,
	hashtagsIn,
	tagsOf,
	trendingNow,
	pickTag,
	withTag,
	viral,
	drama,
	autoReply,
};
