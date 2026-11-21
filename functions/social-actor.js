'use strict';
/*
 * ActivityPub actor document + WebFinger discovery + outbox Creates (#3841).
 *
 * Clean-room and dependency-light: @fedify/fedify was rejected for the inbox slice as too heavy for
 * this Cloud Functions bundle (deck: skip). This module serves discovery JSON and a public outbox
 * OrderedCollection — no fedify code is copied.
 *
 * Gate: SOCIAL_INBOX_AP=1 (same as functions/social-inbox.js). Disabled → 404.
 * Actor IRI: SOCIAL_INBOX_AP_ACTOR (must match the public URL peers will fetch).
 * Optional SOCIAL_INBOX_AP_INBOX overrides the inbox IRI (else actor + "/inbox", matching inbox GET id).
 * Optional SOCIAL_INBOX_AP_ACCT (acct:user@host) or SOCIAL_INBOX_AP_USER + host from actor URL for WebFinger.
 * Optional SOCIAL_INBOX_AP_PUBLIC_KEY_PEM — omit publicKey when unset.
 *
 * Outbox: GET …/outbox returns recent Create activities from Firestore `fediverse_outbox` (dedicated;
 * cleaner than reusing inbound `fediverse_inbox`). Cap OUTBOX_PAGE_SIZE; public-safe fields only.
 *
 * Does not touch scripts/open-social-queue.js or scripts/social-inbox.js.
 */

const AP_JSON = 'application/activity+json';
const JRD_JSON = 'application/jrd+json';
const AS_CONTEXT = 'https://www.w3.org/ns/activitystreams';
const SEC_CONTEXT = 'https://w3id.org/security/v1';
const AS_PUBLIC = 'https://www.w3.org/ns/activitystreams#Public';

/** Dedicated store for activities we publish (outbox). Not the inbound fediverse_inbox. */
const OUTBOX_COLLECTION = 'fediverse_outbox';
/** Hard cap on orderedItems per outbox GET (also clamps ?limit=). */
const OUTBOX_PAGE_SIZE = 20;

function enabled(env = process.env) {
	return String(env.SOCIAL_INBOX_AP || '') === '1';
}

function ourActor(env = process.env) {
	return String(env.SOCIAL_INBOX_AP_ACTOR || '').trim();
}

function trailSlash(iri) {
	return String(iri || '').replace(/\/?$/, '/');
}

function inboxIri(env = process.env) {
	const override = String(env.SOCIAL_INBOX_AP_INBOX || '').trim();
	if (override) return override;
	const actor = ourActor(env);
	return actor ? trailSlash(actor) + 'inbox' : '';
}

function outboxIri(env = process.env) {
	const actor = ourActor(env);
	return actor ? trailSlash(actor) + 'outbox' : '';
}

function preferredUsername(env = process.env) {
	const user = String(env.SOCIAL_INBOX_AP_USER || '').trim();
	if (user) return user;
	const acct = parseAcct(env);
	if (acct && acct.user) return acct.user;
	const actor = ourActor(env);
	if (!actor) return '';
	try {
		let path = new URL(actor).pathname;
		while (path.endsWith('/')) path = path.slice(0, -1);
		const part = path.split('/').filter(Boolean).pop();
		return part || '';
	} catch (error) {
		return '';
	}
}

function parseAcct(env = process.env) {
	const raw = String(env.SOCIAL_INBOX_AP_ACCT || '').trim();
	const m = /^acct:([^@\s]+)@([^@\s]+)$/i.exec(raw);
	if (m) return { user: m[1], host: m[2].toLowerCase(), subject: 'acct:' + m[1] + '@' + m[2].toLowerCase() };
	const user = String(env.SOCIAL_INBOX_AP_USER || '').trim();
	if (!user) return null;
	const actor = ourActor(env);
	if (!actor) return null;
	try {
		const host = new URL(actor).hostname.toLowerCase();
		if (!host) return null;
		return { user, host, subject: 'acct:' + user + '@' + host };
	} catch (error) {
		return null;
	}
}

function publicKeyPem(env = process.env) {
	const pem = String(env.SOCIAL_INBOX_AP_PUBLIC_KEY_PEM || '').trim();
	return pem || '';
}

function buildActor(env = process.env) {
	const id = ourActor(env);
	if (!id) return null;
	const name = preferredUsername(env) || 'actor';
	const inbox = inboxIri(env);
	const outbox = outboxIri(env);
	const pem = publicKeyPem(env);
	const doc = {
		'@context': pem ? [AS_CONTEXT, SEC_CONTEXT] : AS_CONTEXT,
		id,
		type: 'Person',
		preferredUsername: name,
		name,
		inbox,
		outbox,
		discoverable: true,
		manuallyApprovesFollowers: true,
	};
	if (pem) {
		doc.publicKey = {
			id: (id.includes('#') ? id.slice(0, id.indexOf('#')) : id) + '#main-key',
			owner: id,
			publicKeyPem: pem,
		};
	}
	return doc;
}

function pathOf(req) {
	const raw = String(req.originalUrl || req.url || req.path || '/').split('?')[0];
	return raw || '/';
}

function wantsOutbox(req) {
	return /\/outbox\/?$/i.test(pathOf(req));
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

function isPublicAudience(iri) {
	const s = String(iri || '');
	return s === AS_PUBLIC || s === 'Public' || s === 'as:Public';
}

/** Keep only Public + bare IRIs; drop bto/bcc and non-string junk. */
function publicAudience(list) {
	return asArray(list)
		.map(iriOf)
		.filter((iri) => iri && (isPublicAudience(iri) || /^https?:\/\//i.test(iri)))
		.slice(0, 32);
}

/**
 * Strip a stored Create (or raw activity) down to fields safe on a public outbox GET.
 * Omits private keys, acceptIntent, expireAt, raw dumps, bto/bcc, and non-Create rows.
 */
function publicCreateActivity(row, actorIri) {
	if (!row || typeof row !== 'object') return null;
	const raw = row.activity && typeof row.activity === 'object' ? row.activity : row;
	const types = typeOf(raw).concat(typeOf(row));
	if (!types.includes('Create') && String(row.type || '') !== 'Create') return null;
	const id = iriOf(raw.id || raw['@id'] || row.activityId || row.id);
	if (!id || id.length > 2048) return null;
	const actor = iriOf(raw.actor || row.actor) || actorIri;
	if (!actor) return null;
	if (actorIri && actor !== actorIri && actor.replace(/\/$/, '') !== actorIri.replace(/\/$/, '')) {
		return null;
	}
	const published = String(raw.published || row.published || row.receivedAt || '').slice(0, 64);
	const to = publicAudience(raw.to != null ? raw.to : row.to);
	const cc = publicAudience(raw.cc != null ? raw.cc : row.cc);
	const object = publicObject(raw.object != null ? raw.object : row.object, row);
	const out = {
		id,
		type: 'Create',
		actor,
		published,
		to: to.length ? to : [AS_PUBLIC],
		object,
	};
	if (cc.length) out.cc = cc;
	return out;
}

function publicObject(object, row) {
	if (object == null || object === '') {
		const oid = iriOf(row && row.objectId);
		if (!oid) return {};
		const types = (row && row.objectTypes) || [];
		return types.length ? { id: oid, type: types[0] } : { id: oid };
	}
	if (typeof object === 'string') return { id: object.trim() };
	if (typeof object !== 'object' || Array.isArray(object)) return {};
	const id = iriOf(object.id || object['@id']);
	const types = typeOf(object);
	const out = {};
	if (id) out.id = id;
	if (types[0]) out.type = types[0];
	if (typeof object.content === 'string') out.content = object.content.slice(0, 5000);
	if (typeof object.summary === 'string') out.summary = object.summary.slice(0, 500);
	if (typeof object.url === 'string' && /^https?:\/\//i.test(object.url)) out.url = object.url.slice(0, 2048);
	const attributedTo = iriOf(object.attributedTo);
	if (attributedTo) out.attributedTo = attributedTo;
	if (typeof object.published === 'string') out.published = object.published.slice(0, 64);
	const inReplyTo = iriOf(object.inReplyTo);
	if (inReplyTo) out.inReplyTo = inReplyTo;
	const mediaType = typeof object.mediaType === 'string' ? object.mediaType.slice(0, 128) : '';
	if (mediaType) out.mediaType = mediaType;
	return out;
}

function clampLimit(raw, hardCap = OUTBOX_PAGE_SIZE) {
	const n = Number.parseInt(String(raw == null ? '' : raw), 10);
	if (!Number.isFinite(n) || n < 1) return hardCap;
	return Math.min(n, hardCap);
}

function limitFromReq(req) {
	if (req.query && req.query.limit != null) return clampLimit(req.query.limit);
	const url = String(req.originalUrl || req.url || '');
	const q = url.indexOf('?');
	if (q < 0) return OUTBOX_PAGE_SIZE;
	try {
		return clampLimit(new URLSearchParams(url.slice(q + 1)).get('limit'));
	} catch (error) {
		return OUTBOX_PAGE_SIZE;
	}
}

/**
 * Load recent Create rows for our actor from fediverse_outbox.
 * Prefer orderBy(published desc); fall back to in-memory sort when the mock/store lacks indexes.
 */
async function listOutboxCreates(db, { actorIri, limit = OUTBOX_PAGE_SIZE } = {}) {
	const cap = clampLimit(limit);
	if (!db || !actorIri) return [];
	const col = db.collection(OUTBOX_COLLECTION);
	let rows = [];
	try {
		let query = col;
		if (typeof col.where === 'function') {
			query = query.where('type', '==', 'Create').where('actor', '==', actorIri);
		}
		if (typeof query.orderBy === 'function') {
			query = query.orderBy('published', 'desc');
		}
		if (typeof query.limit === 'function') {
			query = query.limit(cap);
		}
		const snap = await query.get();
		const docs = (snap && snap.docs) || [];
		rows = docs.map((d) => (typeof d.data === 'function' ? d.data() : d));
	} catch (error) {
		// Composite index missing or mock without where — scan + sort in memory (page-sized).
		rows = await scanOutboxCreates(col, actorIri, cap);
	}
	return rows
		.map((row) => publicCreateActivity(row, actorIri))
		.filter(Boolean)
		.slice(0, cap);
}

async function scanOutboxCreates(col, actorIri, cap) {
	if (!col || typeof col.get !== 'function') return [];
	const snap = await col.get();
	const docs = (snap && snap.docs) || [];
	const rows = docs
		.map((d) => (typeof d.data === 'function' ? d.data() : d))
		.filter((row) => row && String(row.type || '') === 'Create')
		.filter((row) => {
			const a = iriOf(row.actor);
			return a === actorIri || a.replace(/\/$/, '') === actorIri.replace(/\/$/, '');
		})
		.sort((a, b) => String(b.published || b.receivedAt || '').localeCompare(String(a.published || a.receivedAt || '')));
	return rows.slice(0, cap);
}

async function buildOutboxCollection(env, opts = {}) {
	const id = outboxIri(env);
	const actorIri = ourActor(env);
	const limit = opts.limit != null ? clampLimit(opts.limit) : OUTBOX_PAGE_SIZE;
	const items = await listOutboxCreates(opts.db, { actorIri, limit });
	return {
		'@context': AS_CONTEXT,
		type: 'OrderedCollection',
		id,
		totalItems: items.length,
		orderedItems: items,
	};
}

/**
 * GET actor document or outbox OrderedCollection of recent Creates.
 * Disabled / missing actor → 404/503. `opts.db` is Firestore (or mock); optional for actor GET.
 */
async function handleActor(req, opts = {}) {
	const env = opts.env || process.env;
	if (!enabled(env)) {
		return { status: 404, body: { error: 'Fediverse discovery is off.' }, reason: 'disabled' };
	}
	const method = String(req.method || 'GET').toUpperCase();
	if (method !== 'GET' && method !== 'HEAD') {
		return { status: 405, body: { error: 'GET the actor document.' }, reason: 'method' };
	}
	const actor = buildActor(env);
	if (!actor) {
		return {
			status: 503,
			body: { error: 'Set SOCIAL_INBOX_AP_ACTOR to the public actor IRI.' },
			reason: 'no-actor',
		};
	}
	if (wantsOutbox(req)) {
		const body = await buildOutboxCollection(env, {
			db: opts.db || null,
			limit: limitFromReq(req),
		});
		return {
			status: 200,
			headers: { 'Content-Type': AP_JSON },
			body,
			reason: body.orderedItems.length ? 'outbox' : 'outbox-empty',
		};
	}
	return {
		status: 200,
		headers: { 'Content-Type': AP_JSON },
		body: actor,
		reason: 'actor',
	};
}

function resourceParam(req) {
	if (req.query && req.query.resource != null) return String(req.query.resource).trim();
	const url = String(req.originalUrl || req.url || '');
	const q = url.indexOf('?');
	if (q < 0) return '';
	try {
		return String(new URLSearchParams(url.slice(q + 1)).get('resource') || '').trim();
	} catch (error) {
		return '';
	}
}

function resourceMatches(resource, env) {
	const want = String(resource || '').trim();
	if (!want) return false;
	const actor = ourActor(env);
	if (actor && (want === actor || want === actor.replace(/\/$/, ''))) return true;
	const acct = parseAcct(env);
	if (!acct) return false;
	const lower = want.toLowerCase();
	if (lower === acct.subject) return true;
	if (lower === acct.user + '@' + acct.host) return true;
	return false;
}

/**
 * WebFinger JRD (RFC 7033). resource=acct:user@host or the actor IRI.
 * Cloud Function URL is fine; Pages/Firebase Hosting can rewrite /.well-known/webfinger here.
 */
function handleWebfinger(req, opts = {}) {
	const env = opts.env || process.env;
	if (!enabled(env)) {
		return { status: 404, body: { error: 'Fediverse discovery is off.' }, reason: 'disabled' };
	}
	const method = String(req.method || 'GET').toUpperCase();
	if (method !== 'GET' && method !== 'HEAD') {
		return { status: 405, body: { error: 'GET with ?resource=acct:…' }, reason: 'method' };
	}
	const actor = ourActor(env);
	if (!actor) {
		return {
			status: 503,
			body: { error: 'Set SOCIAL_INBOX_AP_ACTOR to the public actor IRI.' },
			reason: 'no-actor',
		};
	}
	const resource = resourceParam(req);
	if (!resource) {
		return { status: 400, body: { error: 'Missing resource query parameter.' }, reason: 'resource' };
	}
	if (!resourceMatches(resource, env)) {
		return { status: 404, body: { error: 'Unknown resource.' }, reason: 'unknown' };
	}
	const acct = parseAcct(env);
	const subject = acct ? acct.subject : actor;
	return {
		status: 200,
		headers: { 'Content-Type': JRD_JSON },
		body: {
			subject,
			aliases: acct && subject !== actor ? [actor] : [],
			links: [
				{
					rel: 'self',
					type: AP_JSON,
					href: actor,
				},
				{
					rel: 'http://webfinger.net/rel/profile-page',
					type: 'text/html',
					href: actor,
				},
			],
		},
		reason: 'webfinger',
	};
}

module.exports = {
	AP_JSON,
	JRD_JSON,
	AS_PUBLIC,
	OUTBOX_COLLECTION,
	OUTBOX_PAGE_SIZE,
	enabled,
	ourActor,
	inboxIri,
	outboxIri,
	preferredUsername,
	parseAcct,
	publicKeyPem,
	buildActor,
	publicCreateActivity,
	publicObject,
	clampLimit,
	listOutboxCreates,
	buildOutboxCollection,
	handleActor,
	handleWebfinger,
	resourceMatches,
};
