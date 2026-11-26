'use strict';

/* Search Console site URL normalization for customer property bind (#4377).
   Pure helpers — no OAuth, tokens, or HTTP. */

function hostnameOf(input) {
	try {
		const u = new URL(String(input || '').trim());
		return u.hostname.toLowerCase().replace(/\.$/, '');
	} catch (_) {
		return '';
	}
}

function apexHost(host) {
	const h = String(host || '').toLowerCase();
	if (!h) return '';
	return h.startsWith('www.') ? h.slice(4) : h;
}

/**
 * Normalize a GSC property id (API siteUrl).
 * @param {string} input e.g. sc-domain:example.com or https://www.example.com/
 * @returns {{ kind: 'domain'|'url-prefix', siteUrl: string, host: string, path?: string }|null}
 */
function normalizeGscProperty(input) {
	const raw = String(input || '').trim();
	if (!raw) return null;
	const domainMatch = /^sc-domain:([a-z0-9.-]+)$/i.exec(raw);
	if (domainMatch) {
		const host = domainMatch[1].toLowerCase().replace(/\.$/, '');
		if (!/^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/.test(host)) return null;
		return { kind: 'domain', siteUrl: 'sc-domain:' + host, host };
	}
	if (!/^https?:\/\//i.test(raw)) return null;
	try {
		const u = new URL(raw);
		if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
		let path = u.pathname || '/';
		if (path !== '/' && !path.endsWith('/')) path += '/';
		const siteUrl = u.origin + path;
		return {
			kind: 'url-prefix',
			siteUrl,
			host: u.hostname.toLowerCase(),
			path: path === '/' ? '/' : path,
		};
	} catch (_) {
		return null;
	}
}

/** Likely GSC siteUrl values to match against sites.list for a review URL. */
function gscPropertyCandidates(reviewUrl) {
	const host = hostnameOf(reviewUrl);
	if (!host) return [];
	const apex = apexHost(host);
	const out = [];
	const seen = new Set();
	const add = (siteUrl) => {
		if (siteUrl && !seen.has(siteUrl)) {
			seen.add(siteUrl);
			out.push(siteUrl);
		}
	};
	add('sc-domain:' + apex);
	try {
		const u = new URL(reviewUrl);
		add(u.origin + '/');
		if (host !== apex) add('https://' + apex + '/');
	} catch (_) {
		/* ignore */
	}
	return out;
}

/** Whether a bound GSC property covers the hostname/path of the review target. */
function propertyCoversSite(property, reviewUrl) {
	const prop = typeof property === 'string' ? normalizeGscProperty(property) : property;
	if (!prop) return false;
	const host = hostnameOf(reviewUrl);
	if (!host) return false;
	if (prop.kind === 'domain') {
		return host === prop.host || host.endsWith('.' + prop.host);
	}
	try {
		const review = new URL(reviewUrl);
		const prefix = new URL(prop.siteUrl);
		if (review.origin !== prefix.origin) return false;
		const basePath = prefix.pathname === '/' ? '/' : prefix.pathname;
		if (basePath === '/') return true;
		return review.pathname === basePath || review.pathname.startsWith(basePath);
	} catch (_) {
		return false;
	}
}

module.exports = {
	normalizeGscProperty,
	gscPropertyCandidates,
	propertyCoversSite,
	hostnameOf,
};