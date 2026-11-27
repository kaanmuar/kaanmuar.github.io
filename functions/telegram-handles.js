'use strict';
/*
 * Public Telegram handles from crawl socialLinks / live reports (#4467).
 * Parses t.me and telegram.me profile/channel links; skips invite/joinchat deep links.
 */
const RESERVED = /^(share|addstickers|proxy|socks|setlanguage|joinchat|s|iv|login|confirmphone)$/i;
const HANDLE = /^[a-zA-Z][a-zA-Z0-9_]{3,31}$/;

const clip = (v, n) =>
	String(v == null ? '' : v)
		.replace(/\s+/g, ' ')
		.trim()
		.slice(0, n);

/** One public @username from a t.me / telegram.me URL, or null. */
function parseTelegramLink(link) {
	let u;
	try {
		u = new URL(String(link || '').trim());
	} catch (error) {
		return null;
	}
	if (!/^https?:$/.test(u.protocol)) return null;
	const host = u.hostname.toLowerCase().replace(/^(www|m|web)\./, '');
	if (host !== 't.me' && host !== 'telegram.me' && host !== 'telegram.dog') return null;
	const parts = u.pathname
		.split('/')
		.filter(Boolean)
		.map((p) => decodeURIComponent(p));
	const first = parts[0] || '';
	if (!first || first.startsWith('+') || RESERVED.test(first) || first.toLowerCase() === 'c') return null;
	const handle = first.replace(/^@/, '');
	if (!HANDLE.test(handle)) return null;
	const lower = handle.toLowerCase();
	return {
		handle: lower,
		url: 'https://t.me/' + lower,
		kind: parts[1] && /^\d+$/.test(parts[1]) ? 'channel' : 'chat',
	};
}

/** Unique Telegram handles from a list of social URLs (crawl socialLinks or similar). */
function fromSocialLinks(links) {
	const seen = new Set();
	const out = [];
	for (const link of Array.isArray(links) ? links : []) {
		const hit = parseTelegramLink(link);
		if (!hit || seen.has(hit.handle)) continue;
		seen.add(hit.handle);
		out.push(hit);
		if (out.length >= 8) break;
	}
	return out;
}

/** Unique Telegram handles already on a live-report card or publishable report. */
function fromReport(report) {
	const r = report || {};
	if (Array.isArray(r.telegram) && r.telegram.length) {
		const seen = new Set();
		return r.telegram
			.map((t) => {
				if (!t) return null;
				if (typeof t === 'string') return parseTelegramLink(t.startsWith('http') ? t : 'https://t.me/' + t);
				const handle = String(t.handle || '')
					.replace(/^@/, '')
					.toLowerCase();
				if (!HANDLE.test(handle) || seen.has(handle)) return null;
				seen.add(handle);
				return {
					handle,
					url: clip(t.url, 120) || 'https://t.me/' + handle,
					kind: clip(t.kind, 20) || 'chat',
				};
			})
			.filter(Boolean)
			.slice(0, 8);
	}
	const links = (r.observed && r.observed.socialLinks) || r.socialLinks || [];
	return fromSocialLinks(links);
}

module.exports = { parseTelegramLink, fromSocialLinks, fromReport, HANDLE };
