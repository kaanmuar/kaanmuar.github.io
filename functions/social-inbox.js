'use strict';
/*
 * Fediverse ActivityPub inbox receive (#3841).
 *
 * Clean-room and dependency-light on purpose: @fedify/fedify 2.4.6 (MIT) unpacks to ~5.9 MB and is too heavy for this
 * Cloud Functions bundle. Behaviour follows the ActivityPub server inbox (W3C TR) and HTTP Signatures (cavage draft)
 * as Mastodon and Pleroma send them — no fedify code is copied.
 *
 * Gate: SOCIAL_INBOX_AP=1. Optional SOCIAL_INBOX_AP_ACTOR (our actor IRI) drops activities that do not address us.
 * Optional SOCIAL_INBOX_AP_SKIP_SIG=1 accepts unsigned POSTs (local tests only; never set in production).
 *
 * Does not touch scripts/social-inbox.js (owner share → post) or open-social-queue.js (outbound posting).
 */

const crypto = require('crypto');

const MAX_BODY = 256 * 1024;
const ACTOR_CACHE_MS = 10 * 60 * 1000;
const COLLECTION = 'fediverse_inbox';
const ACTIVITY_TYPES = new Set([
	'Create',
	'Follow',
	'Undo',
	'Like',
	'Announce',
	'Accept',
	'Reject',
	'Update',
	'Delete',
	'Block',
	'Flag',
]);

const AP_TYPES =
	/(^|[,;\s])application\/(activity\+json|ld\+json)($|[,;\s])/i;

function enabled(env = process.env) {
	return String(env.SOCIAL_INBOX_AP || '') === '1';
}

function skipSig(env = process.env) {
	return String(env.SOCIAL_INBOX_AP_SKIP_SIG || '') === '1';
}

function ourActor(env = process.env) {
	const a = String(env.SOCIAL_INBOX_AP_ACTOR || '').trim();
	return a || '';
}

function contentTypeOk(header) {
	const ct = String(header || '');
	if (!ct) return false;
	if (AP_TYPES.test(ct)) return true;
	// Some peers send profiled ld+json without the activity+json subtype.
	return /application\/ld\+json/i.test(ct) && /activitystreams/i.test(ct);
}

function asArray(value) {
	if (value == null || value === '') return [];
	return Array.isArray(value) ? value : [value];
}

function iriOf(value) {
	if (value == null) return '';
	if (typeof value === 'string') return value.trim();
	if (typeof value === 'object' && typeof value.id === 'string') return value.id.trim();
	return '';
}

function typeOf(value) {
	const t = value && value.type;
	if (Array.isArray(t)) return t.map(String);
	if (t == null || t === '') return [];
	return [String(t)];
}

function primaryType(types) {
	for (const t of types) {
		if (ACTIVITY_TYPES.has(t)) return t;
	}
	return types[0] || '';
}

/** Strip to the fields Jarvis / engagement can list; keep raw under `activity` for later Accept/Reject. */
function normalizeActivity(raw) {
	if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
		return { ok: false, reason: 'body' };
	}
	const id = iriOf(raw.id || raw['@id']);
	const types = typeOf(raw);
	const kind = primaryType(types);
	if (!id || id.length > 2048) return { ok: false, reason: 'id' };
	if (!kind || !ACTIVITY_TYPES.has(kind)) return { ok: false, reason: 'type' };
	const actor = iriOf(raw.actor);
	if (!actor || actor.length > 2048) return { ok: false, reason: 'actor' };
	const object = raw.object;
	const objectId = iriOf(object);
	const objectTypes = object && typeof object === 'object' ? typeOf(object) : [];
	const to = asArray(raw.to)
		.concat(asArray(raw.cc))
		.map(iriOf)
		.filter(Boolean);
	const published = String(raw.published || raw.updated || '').slice(0, 64);
	return {
		ok: true,
		event: {
			id,
			type: kind,
			types,
			actor,
			objectId,
			objectTypes,
			to,
			published,
			activity: raw,
		},
	};
}

function addressedToUs(event, actorIri) {
	if (!actorIri) return true;
	const targets = new Set(event.to);
	if (targets.has(actorIri) || targets.has('https://www.w3.org/ns/activitystreams#Public')) return true;
	// Follow/Undo/Like often omit to/cc and only set object = our actor.
	if (event.objectId === actorIri) return true;
	return false;
}

function docIdFor(activityId) {
	return crypto.createHash('sha256').update(String(activityId)).digest('hex').slice(0, 40);
}

function parseSignatureHeader(header) {
	const out = {};
	String(header || '')
		.split(',')
		.forEach((part) => {
			const m = /^\s*([a-zA-Z]+)\s*=\s*"([^"]*)"\s*$/.exec(part);
			if (m) out[m[1].toLowerCase()] = m[2];
		});
	if (!out.keyid || !out.signature || !out.headers) return null;
	return {
		keyId: out.keyid,
		algorithm: (out.algorithm || 'rsa-sha256').toLowerCase(),
		headers: out.headers.trim().split(/\s+/),
		signature: out.signature,
	};
}

function requestTarget(method, pathWithQuery) {
	return String(method || 'POST').toLowerCase() + ' ' + (pathWithQuery || '/');
}

function headerValue(headers, name) {
	if (!headers) return '';
	const want = String(name).toLowerCase();
	if (typeof headers.get === 'function') return String(headers.get(name) || headers.get(want) || '');
	for (const key of Object.keys(headers)) {
		if (key.toLowerCase() === want) return String(headers[key] || '');
	}
	return '';
}

function signingString(sig, { method, path, headers, body }) {
	const lines = [];
	for (const h of sig.headers) {
		const name = h.toLowerCase();
		if (name === '(request-target)') {
			lines.push('(request-target): ' + requestTarget(method, path));
		} else if (name === 'digest') {
			const digest = headerValue(headers, 'digest') || bodyDigest(body);
			lines.push('digest: ' + digest);
		} else {
			const value = headerValue(headers, name);
			if (!value) return null;
			lines.push(name + ': ' + value);
		}
	}
	return lines.join('\n');
}

function bodyDigest(body) {
	const buf = Buffer.isBuffer(body) ? body : Buffer.from(String(body || ''), 'utf8');
	return 'SHA-256=' + crypto.createHash('sha256').update(buf).digest('base64');
}

function digestMatches(headers, body) {
	const got = headerValue(headers, 'digest');
	if (!got) return false;
	const want = bodyDigest(body);
	const parts = got.split(',').map((p) => p.trim());
	return parts.some((p) => {
		const a = Buffer.from(p);
		const b = Buffer.from(want);
		return a.length === b.length && crypto.timingSafeEqual(a, b);
	});
}

function publicKeyPemFromActor(actor) {
	if (!actor || typeof actor !== 'object') return '';
	const pk = actor.publicKey;
	if (pk && typeof pk === 'object' && typeof pk.publicKeyPem === 'string') return pk.publicKeyPem;
	if (Array.isArray(pk)) {
		for (const row of pk) {
			if (row && typeof row.publicKeyPem === 'string') return row.publicKeyPem;
		}
	}
	return '';
}

function actorCache() {
	const map = new Map();
	return {
		async get(url, fetchImpl) {
			const now = Date.now();
			const hit = map.get(url);
			if (hit && now - hit.at < ACTOR_CACHE_MS) return hit.actor;
			const res = await fetchImpl(url, {
				headers: {
					Accept: 'application/activity+json, application/ld+json; profile="https://www.w3.org/ns/activitystreams"',
				},
				signal: AbortSignal.timeout(10000),
			});
			if (!res.ok) throw new Error('actor ' + res.status);
			const actor = await res.json();
			map.set(url, { at: now, actor });
			return actor;
		},
		_map: map,
	};
}

const defaultActors = actorCache();

/**
 * Verify cavage HTTP Signature (rsa-sha256) and Digest. keyId may be actor#main-key; the actor document is fetched.
 */
async function verifyHttpSignature(
	{ method, path, headers, body, fetchImpl = fetch, actors = defaultActors } = {}
) {
	const sig = parseSignatureHeader(headerValue(headers, 'signature'));
	if (!sig) return { ok: false, reason: 'signature-header' };
	if (sig.algorithm !== 'rsa-sha256' && sig.algorithm !== 'hs2019') {
		return { ok: false, reason: 'algorithm' };
	}
	if (!digestMatches(headers, body)) return { ok: false, reason: 'digest' };
	const stringToSign = signingString(sig, { method, path, headers, body });
	if (!stringToSign) return { ok: false, reason: 'signing-string' };
	const keyUrl = sig.keyId.split('#')[0];
	let pem = '';
	try {
		const actor = await actors.get(keyUrl, fetchImpl);
		pem = publicKeyPemFromActor(actor);
		// keyId sometimes points at a separate publicKey document.
		if (!pem && actor && actor.id !== keyUrl) {
			const keyDoc = await actors.get(sig.keyId, fetchImpl).catch(() => null);
			pem = publicKeyPemFromActor(keyDoc) || (keyDoc && keyDoc.publicKeyPem) || '';
		}
		if (!pem && typeof actor.publicKeyPem === 'string') pem = actor.publicKeyPem;
	} catch (error) {
		return { ok: false, reason: 'actor-fetch' };
	}
	if (!pem) return { ok: false, reason: 'public-key' };
	let ok = false;
	try {
		ok = crypto.verify(
			'sha256',
			Buffer.from(stringToSign, 'utf8'),
			pem,
			Buffer.from(sig.signature, 'base64')
		);
	} catch (error) {
		return { ok: false, reason: 'verify' };
	}
	return ok ? { ok: true, keyId: sig.keyId } : { ok: false, reason: 'bad-signature' };
}

async function remember(db, event, now = new Date()) {
	if (!db) return { stored: false, duplicate: false };
	const ref = db.collection(COLLECTION).doc(docIdFor(event.id));
	const snap = await ref.get();
	if (snap.exists) return { stored: false, duplicate: true, id: ref.id };
	const expiresAt = new Date(now.getTime() + 30 * 86400000);
	await ref.set({
		activityId: event.id,
		type: event.type,
		actor: event.actor,
		objectId: event.objectId || '',
		objectTypes: event.objectTypes || [],
		to: event.to || [],
		published: event.published || '',
		receivedAt: now.toISOString(),
		expireAt: expiresAt,
		activity: event.activity,
	});
	return { stored: true, duplicate: false, id: ref.id };
}

/**
 * Handle one inbox HTTP request. Returns { status, body, headers?, event?, reason? }.
 * `req` is Express-like (method, path/url, headers/get, rawBody/body).
 */
async function handleRequest(req, opts = {}) {
	const env = opts.env || process.env;
	const fetchImpl = opts.fetchImpl || fetch;
	const actors = opts.actors || defaultActors;
	const db = opts.db || null;
	const now = opts.now || new Date();

	if (!enabled(env)) {
		return { status: 404, body: { error: 'Fediverse inbox is off.' }, reason: 'disabled' };
	}
	const method = String(req.method || 'GET').toUpperCase();
	if (method === 'GET') {
		return {
			status: 200,
			headers: { 'Content-Type': 'application/activity+json' },
			body: {
				'@context': 'https://www.w3.org/ns/activitystreams',
				type: 'OrderedCollection',
				id: ourActor(env) ? ourActor(env).replace(/\/?$/, '/') + 'inbox' : '',
				totalItems: 0,
				orderedItems: [],
			},
		};
	}
	if (method !== 'POST') {
		return { status: 405, body: { error: 'POST an ActivityPub activity.' }, reason: 'method' };
	}

	const ct = typeof req.get === 'function' ? req.get('content-type') : headerValue(req.headers, 'content-type');
	if (!contentTypeOk(ct)) {
		return { status: 415, body: { error: 'Expected application/activity+json.' }, reason: 'content-type' };
	}

	const raw =
		req.rawBody != null
			? req.rawBody
			: Buffer.from(typeof req.body === 'string' ? req.body : JSON.stringify(req.body || {}));
	if (!raw || !raw.length) return { status: 400, body: { error: 'Empty body.' }, reason: 'empty' };
	if (raw.length > MAX_BODY) return { status: 413, body: { error: 'Activity too large.' }, reason: 'size' };

	if (!skipSig(env)) {
		const path =
			(req.originalUrl || req.url || req.path || '/').split('#')[0] || '/';
		const verified = await verifyHttpSignature({
			method,
			path,
			headers: req.headers || { get: (n) => (typeof req.get === 'function' ? req.get(n) : '') },
			body: raw,
			fetchImpl,
			actors,
		});
		if (!verified.ok) {
			return { status: 401, body: { error: 'Bad HTTP Signature.', reason: verified.reason }, reason: verified.reason };
		}
	}

	let parsed;
	try {
		parsed = JSON.parse(Buffer.isBuffer(raw) ? raw.toString('utf8') : String(raw));
	} catch (error) {
		return { status: 400, body: { error: 'Invalid JSON.' }, reason: 'json' };
	}

	const norm = normalizeActivity(parsed);
	if (!norm.ok) return { status: 400, body: { error: 'Invalid activity.', reason: norm.reason }, reason: norm.reason };

	if (!addressedToUs(norm.event, ourActor(env))) {
		return { status: 202, body: { ok: true, ignored: true, reason: 'not-addressed' }, reason: 'not-addressed' };
	}

	const saved = await remember(db, norm.event, now instanceof Date ? now : new Date(now));
	return {
		status: 202,
		body: {
			ok: true,
			id: norm.event.id,
			type: norm.event.type,
			duplicate: saved.duplicate,
			stored: saved.stored,
		},
		event: norm.event,
		reason: saved.duplicate ? 'duplicate' : 'accepted',
	};
}

module.exports = {
	COLLECTION,
	MAX_BODY,
	ACTIVITY_TYPES,
	enabled,
	skipSig,
	ourActor,
	contentTypeOk,
	normalizeActivity,
	addressedToUs,
	docIdFor,
	parseSignatureHeader,
	bodyDigest,
	digestMatches,
	verifyHttpSignature,
	remember,
	handleRequest,
	actorCache,
	publicKeyPemFromActor,
};
