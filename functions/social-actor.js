'use strict';
/*
 * ActivityPub actor document + WebFinger discovery (#3841).
 *
 * Clean-room and dependency-light: @fedify/fedify was rejected for the inbox slice as too heavy for
 * this Cloud Functions bundle. This module only serves discovery JSON — no fedify code is copied.
 *
 * Gate: SOCIAL_INBOX_AP=1 (same as functions/social-inbox.js). Disabled → 404.
 * Actor IRI: SOCIAL_INBOX_AP_ACTOR (must match the public URL peers will fetch).
 * Optional SOCIAL_INBOX_AP_INBOX overrides the inbox IRI (else actor + "/inbox", matching inbox GET id).
 * Optional SOCIAL_INBOX_AP_ACCT (acct:user@host) or SOCIAL_INBOX_AP_USER + host from actor URL for WebFinger.
 * Optional SOCIAL_INBOX_AP_PUBLIC_KEY_PEM — omit publicKey when unset. Follow Accept / HTTP sig verify still
 * needs an ops-managed key pair later; do not invent or commit private keys here.
 *
 * Does not touch scripts/open-social-queue.js or scripts/social-inbox.js.
 */

const AP_JSON = 'application/activity+json';
const JRD_JSON = 'application/jrd+json';
const AS_CONTEXT = 'https://www.w3.org/ns/activitystreams';
const SEC_CONTEXT = 'https://w3id.org/security/v1';

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

/**
 * GET actor document or empty outbox collection. Disabled / missing actor → 404.
 */
function handleActor(req, opts = {}) {
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
		return {
			status: 200,
			headers: { 'Content-Type': AP_JSON },
			body: {
				'@context': AS_CONTEXT,
				type: 'OrderedCollection',
				id: outboxIri(env),
				totalItems: 0,
				orderedItems: [],
			},
			reason: 'outbox-empty',
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
	enabled,
	ourActor,
	inboxIri,
	outboxIri,
	preferredUsername,
	parseAcct,
	publicKeyPem,
	buildActor,
	handleActor,
	handleWebfinger,
	resourceMatches,
};
