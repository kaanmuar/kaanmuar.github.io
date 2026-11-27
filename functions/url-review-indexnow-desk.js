'use strict';

/* Desk IndexNow after approved fix-diff packs (#4397 / #4360). Per-host rate limit, 429/422 backoff,
   dedupe hashes so repeat packs do not burn quota. Off by default — URL_REVIEW_INDEXNOW_DESK=1 or body/hooks. */

const crypto = require('node:crypto');
const customer = require('./url-review-indexnow-customer');
const fixDiffDesk = require('./url-review-fix-diff-desk');
const resilience = require('./http-resilience');

const ENV_KEY = 'URL_REVIEW_INDEXNOW_DESK';
const DEDUPE_COLLECTION = 'url_review_indexnow_desk_dedupe';
const RATE_COLLECTION = 'url_review_indexnow_desk_rate';
const DEFAULT_MAX_PER_HOST_HOUR = 12;
const DEDUPE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

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

function cleanKey(value) {
	return String(value || '')
		.trim()
		.replace(/[^a-f0-9]/gi, '')
		.slice(0, 64);
}

function cleanId(value) {
	return String(value || '')
		.replace(/[^A-Za-z0-9_-]/g, '')
		.slice(0, 60);
}

function safeHost(host) {
	return String(host || '')
		.trim()
		.toLowerCase()
		.replace(/[^a-z0-9.-]/g, '')
		.slice(0, 120);
}

function indexNowDeskOpts(body) {
	const b = body || {};
	if (b.indexNowDesk && typeof b.indexNowDesk === 'object') return b.indexNowDesk;
	return null;
}

/** True when env opts in, or explicit enabled on options/body. Off by default. */
function enabled(options) {
	const opts = options || {};
	if (opts.enabled === false) return false;
	const env = opts.env || process.env;
	if (Object.prototype.hasOwnProperty.call(env, ENV_KEY) && !truthy(env[ENV_KEY])) return false;
	if (opts.enabled === true || opts.force === true) return true;
	const desk = indexNowDeskOpts(opts.body);
	if (desk && desk.enabled === true) return true;
	return truthy(env[ENV_KEY]);
}

function maxPerHostHour(env) {
	const raw = Number((env || process.env).URL_REVIEW_INDEXNOW_DESK_MAX_PER_HOST);
	return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : DEFAULT_MAX_PER_HOST_HOUR;
}

function hourKey(nowMs) {
	return new Date(Number.isFinite(nowMs) ? nowMs : Date.now()).toISOString().slice(0, 13);
}

function normalizeOrigin(host) {
	const h = safeHost(host);
	if (!h) return '';
	return 'https://' + h;
}

/** URLs to ping for an approved fix-diff pack (pure). */
function urlsFromPack(pack, override) {
	if (Array.isArray(override) && override.length) {
		return override.map((u) => String(u || '').trim()).filter(Boolean);
	}
	const row = pack || {};
	const origin = normalizeOrigin(row.host);
	if (!origin) return [];
	if (row.kind === 'git' && row.path) {
		const rel = String(row.path)
			.trim()
			.replace(/^\/+/, '');
		return [origin.replace(/\/$/, '') + '/' + rel];
	}
	return [origin.replace(/\/$/, '') + '/'];
}

function dedupeHash(host, urls) {
	const payload =
		safeHost(host) +
		'\n' +
		[...urls]
			.map((u) => String(u).trim())
			.sort()
			.join('\n');
	return crypto.createHash('sha256').update(payload).digest('hex');
}

function rateLimitState(data, nowMs) {
	const row = data || {};
	const key = hourKey(nowMs);
	if (row.hourKey !== key) return { hourKey: key, count: 0, limited: false };
	const max = Number.isFinite(row.max) ? row.max : DEFAULT_MAX_PER_HOST_HOUR;
	return { hourKey: key, count: row.count || 0, limited: (row.count || 0) >= max, max };
}

function dedupeFresh(row, nowMs) {
	if (!row || !row.at) return false;
	const at = Date.parse(row.at);
	if (!Number.isFinite(at)) return false;
	return nowMs - at < DEDUPE_TTL_MS;
}

const defaultSleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function submitWithQuotaBackoff(fetchFn, params, opts) {
	const sleepFn = (opts && opts.sleep) || defaultSleep;
	const maxAttempts = (opts && opts.retries) != null ? opts.retries : 4;
	let last;
	for (let attempt = 0; attempt < maxAttempts; attempt++) {
		try {
			last = await customer.submitIndexNow(fetchFn, params);
		} catch (error) {
			last = { ok: false, status: 0, error: clean(error) };
		}
		if (last.ok) return last;
		if (last.status !== 429 && last.status !== 422) return last;
		if (attempt + 1 >= maxAttempts) return last;
		await sleepFn(resilience.backoffMs(attempt, { baseMs: 1000, maxMs: 30000 }));
	}
	return last;
}

async function readDedupe(db, hash) {
	if (!db || typeof db.collection !== 'function') return null;
	const snap = await db.collection(DEDUPE_COLLECTION).doc(hash.slice(0, 40)).get();
	return snap.exists ? snap.data() : null;
}

async function writeDedupe(db, hash, fields) {
	if (!db || typeof db.collection !== 'function') return;
	await db
		.collection(DEDUPE_COLLECTION)
		.doc(hash.slice(0, 40))
		.set(Object.assign({ hash }, fields), { merge: true });
}

async function readRate(db, host) {
	if (!db || typeof db.collection !== 'function') return { hourKey: '', count: 0 };
	const snap = await db.collection(RATE_COLLECTION).doc(safeHost(host)).get();
	return snap.exists ? snap.data() : { hourKey: '', count: 0 };
}

async function bumpRate(db, host, nowMs, env) {
	const id = safeHost(host);
	if (!db || !id) return { hourKey: hourKey(nowMs), count: 1 };
	const ref = db.collection(RATE_COLLECTION).doc(id);
	const max = maxPerHostHour(env);
	const key = hourKey(nowMs);
	return db.runTransaction(async (tx) => {
		const snap = await tx.get(ref);
		const prev = snap.exists ? snap.data() : {};
		let count = 0;
		if (prev.hourKey === key) count = prev.count || 0;
		count += 1;
		const next = { hourKey: key, count, max, updatedAt: new Date(nowMs).toISOString() };
		tx.set(ref, next, { merge: true });
		return next;
	});
}

function logFor(out) {
	if (!out || !out.enabled) return 'IndexNow desk: skipped (opt-in off).';
	if (out.reason === 'not-approved') return 'IndexNow desk: pack is not approved yet.';
	if (out.reason === 'deduped') return 'IndexNow desk: same URL set already pinged for this host (deduped).';
	if (out.reason === 'rate-limited')
		return 'IndexNow desk: per-host hourly limit reached for ' + (out.host || 'this host') + '.';
	if (out.reason === 'no-urls') return 'IndexNow desk: no URLs to ping for this pack.';
	if (out.reason === 'missing-key') return 'IndexNow desk: customer IndexNow key required.';
	if (out.reason === 'key-verification-failed') return 'IndexNow desk: key file did not verify.';
	if (out.ok && (out.indexnow === 200 || out.indexnow === 202))
		return 'IndexNow desk: pinged ' + (out.submitted || 0) + ' URL' + (out.submitted === 1 ? '' : 's') + ' (HTTP ' + out.indexnow + ').';
	if (out.indexnow != null) return 'IndexNow desk: HTTP ' + out.indexnow + '.';
	if (out.error) return 'IndexNow desk: ' + out.error + '.';
	return 'IndexNow desk: finished.';
}

/**
 * Ping IndexNow for an approved fix-diff pack with quota guardrails.
 * @returns {Promise<object>}
 */
async function pingApprovedPack(pack, options) {
	const opts = options || {};
	const nowMs = Number.isFinite(opts.nowMs) ? opts.nowMs : Date.now();
	const env = opts.env || process.env;
	const fetchFn = opts.fetch || globalThis.fetch;
	const out = {
		at: new Date(nowMs).toISOString(),
		enabled: enabled(opts),
		packId: pack && pack.id,
		host: pack && pack.host,
		submitted: 0,
		indexnow: null,
		ok: false,
	};
	if (!out.enabled) {
		out.reason = 'disabled';
		return out;
	}
	if (!pack || pack.status !== 'approved') {
		out.reason = 'not-approved';
		return out;
	}
	const urls = urlsFromPack(pack, opts.urls);
	if (!urls.length) {
		out.reason = 'no-urls';
		return out;
	}
	const key = cleanKey(opts.key);
	if (!key) {
		out.reason = 'missing-key';
		return out;
	}
	if (typeof fetchFn !== 'function') {
		out.reason = 'missing-fetch';
		return out;
	}
	const hash = dedupeHash(pack.host, urls);
	out.hash = hash;
	const prior = await readDedupe(opts.db, hash);
	if (dedupeFresh(prior, nowMs)) {
		out.reason = 'deduped';
		out.indexnow = prior.indexnow != null ? prior.indexnow : null;
		out.ok = prior.ok === true;
		return out;
	}
	const rateRow = await readRate(opts.db, pack.host);
	const rate = rateLimitState(Object.assign(rateRow, { max: maxPerHostHour(env) }), nowMs);
	if (rate.limited) {
		out.reason = 'rate-limited';
		out.rate = rate;
		return out;
	}
	const origin = normalizeOrigin(pack.host);
	const keyCheck = await customer.verifyIndexNowKey(fetchFn, origin, key);
	out.key = { ok: keyCheck.ok, status: keyCheck.status, url: keyCheck.url, error: keyCheck.error };
	if (!keyCheck.ok) {
		out.reason = 'key-verification-failed';
		return out;
	}
	const host = safeHost(pack.host);
	try {
		const ping = await submitWithQuotaBackoff(
			fetchFn,
			{ host, key, origin, urlList: urls },
			{ sleep: opts.sleep, retries: opts.retries }
		);
		out.indexnow = ping.status;
		out.submitted = urls.length;
		out.ok = ping.ok;
		out.urls = urls;
		if (!ping.ok && ping.error) out.error = ping.error;
		await bumpRate(opts.db, pack.host, nowMs, env);
		await writeDedupe(opts.db, hash, {
			host,
			packId: pack.id,
			urls,
			at: out.at,
			indexnow: out.indexnow,
			ok: out.ok,
			operator: opts.operator || '',
		});
	} catch (error) {
		out.ok = false;
		out.error = clean(error);
	}
	return out;
}

function fail(res, status, error) {
	res.status(status).json({ error });
}

async function deskPing(req, res, operator, deps) {
	const body = req.body || {};
	const id = cleanId(body.id || body.packId);
	const key = cleanKey(body.key || body.indexNowKey);
	if (!id) return fail(res, 400, 'Which fix pack?');
	const db = deps && deps.db;
	if (!db || typeof db.collection !== 'function') return fail(res, 503, 'Storage is not available.');
	const snap = await db.collection(fixDiffDesk.COLLECTION).doc(id).get();
	if (!snap.exists) return fail(res, 404, 'That fix pack is not saved.');
	const pack = fixDiffDesk.deskRow(id, snap.data());
	const out = await pingApprovedPack(pack, {
		env: (deps && deps.env) || process.env,
		db,
		fetch: deps && deps.fetch,
		nowMs: deps && deps.nowMs,
		key,
		urls: Array.isArray(body.urls) ? body.urls : undefined,
		enabled: body.indexNowDesk && body.indexNowDesk.enabled,
		body,
		operator,
		sleep: deps && deps.sleep,
		retries: deps && deps.retries,
	});
	const line = logFor(out);
	if (out.reason === 'disabled') return fail(res, 403, 'IndexNow desk pings are off. Set ' + ENV_KEY + '=1.');
	if (out.reason === 'not-approved') return fail(res, 400, 'Approve the pack before pinging IndexNow.');
	if (out.reason === 'missing-key') return fail(res, 400, 'Enter the customer IndexNow key.');
	if (out.reason === 'rate-limited') return fail(res, 429, line);
	if (out.reason === 'deduped') {
		res.status(200).json({ ok: true, deduped: true, indexnow: out, note: line });
		return;
	}
	if (!out.ok && out.reason === 'key-verification-failed') return fail(res, 422, line);
	if (!out.ok) return fail(res, out.indexnow === 429 ? 429 : 502, line);
	res.status(200).json({ ok: true, indexnow: out, note: line });
}

module.exports = {
	ENV_KEY,
	DEDUPE_COLLECTION,
	RATE_COLLECTION,
	DEDUPE_TTL_MS,
	enabled,
	urlsFromPack,
	dedupeHash,
	hourKey,
	rateLimitState,
	dedupeFresh,
	submitWithQuotaBackoff,
	pingApprovedPack,
	logFor,
	deskPing,
};