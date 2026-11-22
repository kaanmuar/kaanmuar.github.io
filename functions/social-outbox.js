'use strict';
/*
 * ActivityPub outbox Create publishers (#3841).
 *
 * Appends public-safe Create activities (Note / Article-ish) to Firestore `fediverse_outbox` so the
 * actor GET `/outbox` OrderedCollection (#4198) can list them. Field shapes match
 * `functions/social-actor.js` `publicCreateActivity` / `listOutboxCreates` (type, actor, published,
 * activityId, activity with object).
 *
 * Gate: SOCIAL_INBOX_AP_OUTBOX=1 (off by default — do not spam production). Actor IRI from
 * SOCIAL_INBOX_AP_ACTOR (same as inbox / actor discovery). Clean-room; no @fedify/fedify.
 *
 * Call site: scripts/open-social-queue.js after a successful public Mastodon post (best-effort;
 * missing credentials or a write failure never fails the social post).
 */

const crypto = require('crypto');

const AS_CONTEXT = 'https://www.w3.org/ns/activitystreams';
const AS_PUBLIC = 'https://www.w3.org/ns/activitystreams#Public';
const OUTBOX_COLLECTION = 'fediverse_outbox';
const OBJECT_TYPES = new Set(['Note', 'Article', 'Page']);

function enabled(env = process.env) {
	return String(env.SOCIAL_INBOX_AP_OUTBOX || '') === '1';
}

function ourActor(env = process.env) {
	return String(env.SOCIAL_INBOX_AP_ACTOR || '').trim();
}

function docIdFor(activityId) {
	return crypto.createHash('sha256').update(String(activityId)).digest('hex').slice(0, 40);
}

function slugPart(raw, fallback) {
	let s = String(raw || '').replace(/[^a-zA-Z0-9._-]+/g, '-');
	// Trim leading/trailing hyphens without /^-+|-+$/ (ReDoS-flagged alternation).
	while (s.startsWith('-')) s = s.slice(1);
	while (s.endsWith('-')) s = s.slice(0, -1);
	s = s.slice(0, 80);
	return s || fallback;
}

/**
 * Build a public-safe Create row for fediverse_outbox (no private keys, bto/bcc, or raw dumps).
 * `input`: { content?, summary?, url?, objectType?, objectId?, activityId?, published?, to?,
 *            statusId?, batch?, slug?, now? }
 */
function buildCreate(input = {}, env = process.env) {
	const actor = ourActor(env);
	if (!actor) return { ok: false, reason: 'no-actor' };

	const now = input.now instanceof Date ? input.now : new Date(input.now || Date.now());
	const published = String(input.published || now.toISOString()).slice(0, 64);
	const objectType = OBJECT_TYPES.has(String(input.objectType || ''))
		? String(input.objectType)
		: 'Note';

	const seed =
		input.statusId ||
		input.activityId ||
		[input.batch, input.slug].filter(Boolean).join('-') ||
		published;
	const tag = slugPart(seed, docIdFor(actor + '|' + published).slice(0, 16));

	const objectId = String(input.objectId || trailSlash(actor) + 'notes/' + tag).slice(0, 2048);
	const activityId = String(input.activityId || trailSlash(actor) + 'activities/' + tag).slice(
		0,
		2048
	);
	if (!/^https?:\/\//i.test(objectId) || !/^https?:\/\//i.test(activityId)) {
		return { ok: false, reason: 'id' };
	}

	const content =
		typeof input.content === 'string' ? input.content.slice(0, 5000) : '';
	const summary =
		typeof input.summary === 'string' ? input.summary.slice(0, 500) : '';
	const url =
		typeof input.url === 'string' && /^https?:\/\//i.test(input.url)
			? input.url.slice(0, 2048)
			: '';

	const to = Array.isArray(input.to) && input.to.length
		? input.to.map(String).filter(Boolean).slice(0, 32)
		: [AS_PUBLIC];

	const object = {
		id: objectId,
		type: objectType,
		attributedTo: actor,
		published,
	};
	if (content) object.content = content;
	if (summary) object.summary = summary;
	if (url) object.url = url;

	const activity = {
		'@context': AS_CONTEXT,
		id: activityId,
		type: 'Create',
		actor,
		published,
		to,
		object,
	};

	const row = {
		activityId,
		type: 'Create',
		actor,
		published,
		to,
		objectId,
		objectTypes: [objectType],
		receivedAt: now.toISOString(),
		activity,
	};

	return { ok: true, activityId, row };
}

function trailSlash(iri) {
	return String(iri || '').replace(/\/?$/, '/');
}

/**
 * Append one Create to fediverse_outbox. Idempotent on activityId (sha256 doc id).
 * Returns { stored, duplicate?, reason?, id?, activityId? }.
 */
async function appendCreate(db, input = {}, env = process.env) {
	if (!enabled(env)) return { stored: false, reason: 'disabled' };
	if (!db || typeof db.collection !== 'function') return { stored: false, reason: 'no-db' };

	const built = buildCreate(input, env);
	if (!built.ok) return { stored: false, reason: built.reason };

	const ref = db.collection(OUTBOX_COLLECTION).doc(docIdFor(built.activityId));
	const snap = await ref.get();
	if (snap && snap.exists) {
		return { stored: false, duplicate: true, id: ref.id, activityId: built.activityId };
	}
	await ref.set(built.row);
	return { stored: true, duplicate: false, id: ref.id, activityId: built.activityId };
}

module.exports = {
	AS_PUBLIC,
	AS_CONTEXT,
	OUTBOX_COLLECTION,
	enabled,
	ourActor,
	docIdFor,
	buildCreate,
	appendCreate,
};
