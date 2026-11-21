'use strict';
// ActivityPub actor + WebFinger discovery (#3841): no network.
const test = require('node:test');
const assert = require('node:assert/strict');
const Actor = require('../../functions/social-actor');

const OUR = 'https://social.example/users/qa';
const ACCT = 'acct:qa@social.example';

const on = {
	SOCIAL_INBOX_AP: '1',
	SOCIAL_INBOX_AP_ACTOR: OUR,
	SOCIAL_INBOX_AP_ACCT: ACCT,
};

test('gate: SOCIAL_INBOX_AP=1 enables discovery', () => {
	assert.equal(Actor.enabled({}), false);
	assert.equal(Actor.enabled({ SOCIAL_INBOX_AP: '0' }), false);
	assert.equal(Actor.enabled({ SOCIAL_INBOX_AP: '1' }), true);
});

test('inbox/outbox IRIs match actor + /inbox|/outbox (inbox GET id shape)', () => {
	assert.equal(Actor.inboxIri(on), OUR + '/inbox');
	assert.equal(Actor.outboxIri(on), OUR + '/outbox');
	assert.equal(
		Actor.inboxIri({ ...on, SOCIAL_INBOX_AP_INBOX: 'https://fn.example/socialInbox' }),
		'https://fn.example/socialInbox'
	);
});

test('buildActor: preferredUsername, no publicKey without PEM env', () => {
	const doc = Actor.buildActor(on);
	assert.equal(doc.id, OUR);
	assert.equal(doc.type, 'Person');
	assert.equal(doc.preferredUsername, 'qa');
	assert.equal(doc.inbox, OUR + '/inbox');
	assert.equal(doc.outbox, OUR + '/outbox');
	assert.equal(doc.publicKey, undefined);
	assert.equal(doc['@context'], 'https://www.w3.org/ns/activitystreams');
});

test('buildActor: publicKey only when SOCIAL_INBOX_AP_PUBLIC_KEY_PEM is set', () => {
	const pem = '-----BEGIN PUBLIC KEY-----\nMIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8A\n-----END PUBLIC KEY-----';
	const doc = Actor.buildActor({ ...on, SOCIAL_INBOX_AP_PUBLIC_KEY_PEM: pem });
	assert.ok(doc.publicKey);
	assert.equal(doc.publicKey.owner, OUR);
	assert.equal(doc.publicKey.id, OUR + '#main-key');
	assert.equal(doc.publicKey.publicKeyPem, pem);
	assert.deepEqual(doc['@context'], [
		'https://www.w3.org/ns/activitystreams',
		'https://w3id.org/security/v1',
	]);
});

test('handleActor: disabled → 404; missing actor → 503; GET returns activity+json', () => {
	assert.equal(Actor.handleActor({ method: 'GET' }, { env: {} }).status, 404);
	assert.equal(
		Actor.handleActor({ method: 'GET' }, { env: { SOCIAL_INBOX_AP: '1' } }).reason,
		'no-actor'
	);
	const ok = Actor.handleActor({ method: 'GET', path: '/' }, { env: on });
	assert.equal(ok.status, 200);
	assert.equal(ok.headers['Content-Type'], Actor.AP_JSON);
	assert.equal(ok.body.id, OUR);
	assert.equal(Actor.handleActor({ method: 'POST' }, { env: on }).status, 405);
});

test('handleActor: /outbox returns empty OrderedCollection', () => {
	const out = Actor.handleActor({ method: 'GET', path: '/outbox' }, { env: on });
	assert.equal(out.status, 200);
	assert.equal(out.body.type, 'OrderedCollection');
	assert.equal(out.body.totalItems, 0);
	assert.deepEqual(out.body.orderedItems, []);
	assert.equal(out.body.id, OUR + '/outbox');
});

test('handleWebfinger: acct and actor IRI; unknown → 404', () => {
	const byAcct = Actor.handleWebfinger(
		{ method: 'GET', query: { resource: ACCT } },
		{ env: on }
	);
	assert.equal(byAcct.status, 200);
	assert.equal(byAcct.headers['Content-Type'], Actor.JRD_JSON);
	assert.equal(byAcct.body.subject, ACCT);
	assert.equal(byAcct.body.links[0].href, OUR);
	assert.equal(byAcct.body.links[0].type, Actor.AP_JSON);

	const byIri = Actor.handleWebfinger(
		{ method: 'GET', url: '/.well-known/webfinger?resource=' + encodeURIComponent(OUR) },
		{ env: on }
	);
	assert.equal(byIri.status, 200);
	assert.equal(byIri.body.links[0].href, OUR);

	assert.equal(
		Actor.handleWebfinger({ method: 'GET', query: { resource: 'acct:other@x.test' } }, { env: on })
			.status,
		404
	);
	assert.equal(Actor.handleWebfinger({ method: 'GET', query: {} }, { env: on }).status, 400);
	assert.equal(Actor.handleWebfinger({ method: 'GET', query: { resource: ACCT } }, { env: {} }).status, 404);
});

test('resourceMatches and preferredUsername from USER when ACCT unset', () => {
	const env = {
		SOCIAL_INBOX_AP: '1',
		SOCIAL_INBOX_AP_ACTOR: OUR,
		SOCIAL_INBOX_AP_USER: 'lab',
	};
	assert.equal(Actor.preferredUsername(env), 'lab');
	assert.equal(Actor.parseAcct(env).subject, 'acct:lab@social.example');
	assert.equal(Actor.resourceMatches('acct:lab@social.example', env), true);
	assert.equal(Actor.resourceMatches(OUR, env), true);
	assert.equal(Actor.resourceMatches('acct:nope@social.example', env), false);
});
