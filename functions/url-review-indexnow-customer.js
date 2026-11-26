'use strict';

/* Customer IndexNow dispatcher (#4365): for reviewed customer sites, verify the site's IndexNow key,
   skip noindex and non-2xx pages, ping indexable URLs, and return HTTP results. Pattern from jarvis-index.js;
   off by default — enable with URL_REVIEW_INDEXNOW=1 or { enabled: true }. */

const INDEXNOW_URL = 'https://api.indexnow.org/indexnow';
const ENV_KEY = 'URL_REVIEW_INDEXNOW';
const TIMEOUT_MS = 30000;

const clean = (error) =>
	String((error && error.message) || error || '')
		.replace(/\s+/g, ' ')
		.slice(0, 200);

function truthy(value) {
	if (value === true || value === 1) return true;
	const text = String(value == null ? '' : value)
		.trim()
		.toLowerCase();
	return text === '1' || text === 'true' || text === 'yes' || text === 'on';
}

/** True when env or options opt in. Explicit false on options wins over env. */
function enabled(options) {
	const opts = options || {};
	if (opts.enabled === false) return false;
	if (opts.enabled === true || opts.force === true) return true;
	const env = opts.env || process.env;
	return truthy(env[ENV_KEY]);
}

function robotsDirectives(page) {
	const seo = page && page.inspect && page.inspect.seo;
	if (!seo) return '';
	return [seo.robots, seo.googlebot, seo.xRobots].filter(Boolean).join(', ').toLowerCase();
}

function pageNoindex(page) {
	const directives = robotsDirectives(page);
	return /\bnoindex\b|(^|[\s,])none([\s,]|$)/.test(directives);
}

function skipReason(page) {
	if (!page || !page.url) return 'no-url';
	const status = Number(page.status);
	if (!Number.isFinite(status) || status < 200 || status >= 300) {
		if (status >= 400 && status < 500) return '4xx';
		if (status >= 500) return '5xx';
		if (status >= 300 && status < 400) return '3xx';
		return status ? 'status-' + status : 'no-status';
	}
	if (pageNoindex(page)) return 'noindex';
	return '';
}

/** Crawl pages that should be pinged: 2xx, not noindex. */
function filterIndexableUrls(pages) {
	const list = Array.isArray(pages) ? pages : [];
	const kept = [];
	const skipped = [];
	for (let i = 0; i < list.length; i++) {
		const page = list[i];
		const reason = skipReason(page);
		if (reason) skipped.push({ url: page.url, reason });
		else kept.push(page);
	}
	return { pages: kept, urls: kept.map((p) => p.url), skipped };
}

function normalizeOrigin(origin) {
	let out = String(origin || '').trim();
	while (out.length > 1 && out.endsWith('/')) out = out.slice(0, -1);
	return out;
}

function hostFromOrigin(origin) {
	try {
		return new URL(origin).hostname;
	} catch (error) {
		return '';
	}
}

/** Fetch {origin}/{key}.txt and confirm the body equals the key (#4365). */
async function verifyIndexNowKey(fetchFn, origin, key) {
	const base = normalizeOrigin(origin);
	const cleanKey = String(key || '').trim();
	if (!base || !cleanKey) {
		return { ok: false, status: 0, error: 'missing origin or key' };
	}
	const url = base + '/' + cleanKey + '.txt';
	let res;
	try {
		res = await fetchFn(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
	} catch (error) {
		return { ok: false, status: 0, error: clean(error) };
	}
	const status = res.status || 0;
	let body = '';
	try {
		body = typeof res.text === 'function' ? await res.text() : '';
	} catch (error) {
		return { ok: false, status, error: clean(error) };
	}
	const ok = status >= 200 && status < 300 && body.trim() === cleanKey;
	return { ok, status, body: body.trim(), url };
}

async function submitIndexNow(fetchFn, params) {
	const host = String((params && params.host) || '').trim();
	const key = String((params && params.key) || '').trim();
	const urlList = Array.isArray(params && params.urlList) ? params.urlList.filter(Boolean) : [];
	const keyLocation = params && params.keyLocation;
	if (!host || !key || !urlList.length) {
		throw new Error('IndexNow needs host, key, and at least one URL');
	}
	const origin =
		params && params.origin ? normalizeOrigin(params.origin) : keyLocation ? keyLocation.replace(/\/[^/]+\.txt$/, '') : '';
	const location = keyLocation || (origin ? origin + '/' + key + '.txt' : '');
	const res = await fetchFn(INDEXNOW_URL, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json; charset=utf-8' },
		body: JSON.stringify({ host, key, keyLocation: location, urlList }),
		signal: AbortSignal.timeout(TIMEOUT_MS),
	});
	const status = res.status || 0;
	const ok = status === 200 || status === 202;
	return { ok, status, urlList: urlList.length };
}

/**
 * Run customer IndexNow when opted in: filter pages, verify key, submit, log HTTP results.
 * @returns {Promise<object>}
 */
async function runCustomerIndexNow(ctx) {
	const options = ctx || {};
	const out = {
		at: new Date(options.now || Date.now()).toISOString(),
		enabled: enabled(options),
		submitted: 0,
		indexnow: null,
		skipped: [],
	};
	if (!out.enabled) {
		out.reason = 'disabled';
		return out;
	}
	const fetchFn = options.fetch;
	const origin = normalizeOrigin(options.origin);
	const key = String(options.key || '').trim();
	if (!fetchFn || !origin || !key) {
		out.reason = 'missing-fetch-origin-or-key';
		return out;
	}
	const filtered = filterIndexableUrls(options.pages || []);
	out.filtered = filtered.urls.length;
	out.skipped = filtered.skipped;
	if (!filtered.urls.length) {
		out.reason = 'no-indexable-urls';
		return out;
	}
	const keyCheck = await verifyIndexNowKey(fetchFn, origin, key);
	out.key = { ok: keyCheck.ok, status: keyCheck.status, url: keyCheck.url, error: keyCheck.error };
	if (!keyCheck.ok) {
		out.reason = 'key-verification-failed';
		return out;
	}
	const host = hostFromOrigin(origin);
	try {
		const ping = await submitIndexNow(fetchFn, {
			host,
			key,
			origin,
			urlList: filtered.urls,
		});
		out.indexnow = ping.status;
		out.submitted = filtered.urls.length;
		out.ok = ping.ok;
		out.urls = filtered.urls;
	} catch (error) {
		out.ok = false;
		out.error = clean(error);
	}
	return out;
}

module.exports = {
	ENV_KEY,
	enabled,
	filterIndexableUrls,
	verifyIndexNowKey,
	submitIndexNow,
	runCustomerIndexNow,
};