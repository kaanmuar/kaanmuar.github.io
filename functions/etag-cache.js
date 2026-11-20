/* Conditional GitHub GETs (#3835): remember each GET's ETag and body, send If-None-Match next time, and serve the
   remembered body on a 304. A 304 costs no REST quota. The pattern is from octokit/plugin-throttling.js and
   steipete/RepoBar (reference only, no code copied). No dependencies. Used by jarvis-github.js (in-memory store) and
   scripts/gh-etag.js (file store, behind scripts/gh-budget.sh --cached-get).
   Keys carry a hash of the token: a body fetched with one token is never served to another. */
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const SKIP = /(^|\/)rate_limit(\?|$)|(^|\/)graphql(\?|$)/;

function cacheKey(token, url) {
	return crypto
		.createHash('sha256')
		.update(String(token || ''))
		.update('\n')
		.update(String(url))
		.digest('hex');
}

function memoryStore(max) {
	const map = new Map();
	const limit = max || 500;
	return {
		get: (key) => map.get(key) || null,
		set: (key, entry) => {
			map.delete(key);
			map.set(key, entry);
			while (map.size > limit) map.delete(map.keys().next().value);
		},
		size: () => map.size,
	};
}

function fileStore(dir) {
	const file = (key) => path.join(dir, key + '.json');
	return {
		get: (key) => {
			try {
				return JSON.parse(fs.readFileSync(file(key), 'utf8'));
			} catch (error) {
				return null;
			}
		},
		set: (key, entry) => {
			fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
			const tmp = file(key) + '.' + process.pid + '.tmp';
			fs.writeFileSync(tmp, JSON.stringify(entry), { mode: 0o600 });
			fs.renameSync(tmp, file(key));
		},
	};
}

const header = (res, name) =>
	res && res.headers && typeof res.headers.get === 'function' ? res.headers.get(name) : null;

/* Wraps a fetch-like function. Only GETs to non-rate-limit, non-GraphQL URLs are conditional; everything else passes through
   untouched. `stats` counts hits (304: no quota spent), misses (200 that was stored or sent no ETag) and calls. */
function etagFetch(fetchImpl, store, token, stats) {
	const counts = stats || { calls: 0, hits: 0, misses: 0 };
	const wrapped = async (url, init) => {
		const method = String((init && init.method) || 'GET').toUpperCase();
		if (method !== 'GET' || SKIP.test(String(url))) return fetchImpl(url, init);
		counts.calls++;
		const key = cacheKey(token, url);
		const known = store.get(key);
		const sent =
			known && known.etag
				? Object.assign({}, init, { headers: Object.assign({}, init && init.headers, { 'If-None-Match': known.etag }) })
				: init;
		const res = await fetchImpl(url, sent);
		if (res.status === 304 && known) {
			counts.hits++;
			return { ok: true, status: 200, fromCache: true, headers: res.headers, json: async () => known.body };
		}
		counts.misses++;
		const etag = header(res, 'etag');
		if (!res.ok || !etag) return res;
		const body = await res.json().catch(() => undefined);
		if (body !== undefined) store.set(key, { etag, body });
		return { ok: res.ok, status: res.status, headers: res.headers, json: async () => (body === undefined ? {} : body) };
	};
	wrapped.stats = counts;
	return wrapped;
}

module.exports = { cacheKey, memoryStore, fileStore, etagFetch, SKIP };
