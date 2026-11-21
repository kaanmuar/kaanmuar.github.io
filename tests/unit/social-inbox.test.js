'use strict';
// Fediverse ActivityPub inbox receive (#3841): clean-room handler, no fedify.
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const Inbox = require('../../functions/social-inbox');

const OUR = 'https://social.example/users/qa';
const PEER = 'https://mastodon.example/users/alice';

function memDb() {
	const docs = new Map();
	return {
		collection(name) {
			assert.equal(name, Inbox.COLLECTION);
			return {
				doc(id) {
					return {
						id,
						async get() {
							return { exists: docs.has(id), data: () => docs.get(id) };
						},
						async set(row) {
							docs.set(id, row);
						},
					};
				},
			};
		},
		_docs: docs,
	};
}

test('gate: SOCIAL_INBOX_AP=1 enables the inbox', () => {
	assert.equal(Inbox.enabled({}), false);
	assert.equal(Inbox.enabled({ SOCIAL_INBOX_AP: '0' }), false);
	assert.equal(Inbox.enabled({ SOCIAL_INBOX_AP: '1' }), true);
});

test('content-type accepts activity+json and profiled ld+json', () => {
	assert.equal(Inbox.contentTypeOk('application/activity+json'), true);
	assert.equal(Inbox.contentTypeOk('application/ld+json; profile="https://www.w3.org/ns/activitystreams"'), true);
	assert.equal(Inbox.contentTypeOk('application/json'), false);
	assert.equal(Inbox.contentTypeOk(''), false);
});

test('normalizeActivity keeps Create / Follow / Undo and rejects junk', () => {
	const create = Inbox.normalizeActivity({
		id: PEER + '/statuses/1/activity',
		type: 'Create',
		actor: PEER,
		object: { id: PEER + '/statuses/1', type: 'Note', content: 'hi' },
		to: [OUR, 'https://www.w3.org/ns/activitystreams#Public'],
		published: '2026-11-21T12:00:00Z',
	});
	assert.equal(create.ok, true);
	assert.equal(create.event.type, 'Create');
	assert.equal(create.event.objectId, PEER + '/statuses/1');
	assert.deepEqual(create.event.objectTypes, ['Note']);
	const hostPath = (href) => {
		const p = new URL(href);
		return p.hostname + p.pathname;
	};
	assert.ok(create.event.to.some((id) => hostPath(id) === hostPath(OUR)));

	const follow = Inbox.normalizeActivity({
		id: PEER + '/follows/1',
		type: 'Follow',
		actor: PEER,
		object: OUR,
	});
	assert.equal(follow.ok, true);
	assert.equal(follow.event.objectId, OUR);

	assert.equal(Inbox.normalizeActivity({ type: 'Create', actor: PEER }).ok, false);
	assert.equal(Inbox.normalizeActivity({ id: 'x', type: 'Note', actor: PEER }).reason, 'type');
	assert.equal(Inbox.normalizeActivity(null).reason, 'body');
});

test('addressedToUs: Follow object=us counts even without to/cc', () => {
	const follow = Inbox.normalizeActivity({
		id: PEER + '/follows/2',
		type: 'Follow',
		actor: PEER,
		object: OUR,
	}).event;
	assert.equal(Inbox.addressedToUs(follow, OUR), true);
	assert.equal(Inbox.addressedToUs(follow, 'https://other.example/users/x'), false);
	assert.equal(Inbox.addressedToUs(follow, ''), true);
});

test('handleRequest: off → 404; wrong method → 405; bad content-type → 415', async () => {
	const off = await Inbox.handleRequest({ method: 'POST' }, { env: {} });
	assert.equal(off.status, 404);

	const get = await Inbox.handleRequest(
		{ method: 'GET' },
		{ env: { SOCIAL_INBOX_AP: '1', SOCIAL_INBOX_AP_ACTOR: OUR } }
	);
	assert.equal(get.status, 200);
	assert.equal(get.body.type, 'OrderedCollection');

	const badMethod = await Inbox.handleRequest(
		{ method: 'PUT', get: () => 'application/activity+json' },
		{ env: { SOCIAL_INBOX_AP: '1' } }
	);
	assert.equal(badMethod.status, 405);

	const badCt = await Inbox.handleRequest(
		{ method: 'POST', get: () => 'text/plain', rawBody: Buffer.from('{}') },
		{ env: { SOCIAL_INBOX_AP: '1', SOCIAL_INBOX_AP_SKIP_SIG: '1' } }
	);
	assert.equal(badCt.status, 415);
});

test('handleRequest: unsigned Follow is stored once (skip-sig for unit tests)', async () => {
	const db = memDb();
	const activity = {
		'@context': 'https://www.w3.org/ns/activitystreams',
		id: PEER + '/follows/unit-1',
		type: 'Follow',
		actor: PEER,
		object: OUR,
	};
	const raw = Buffer.from(JSON.stringify(activity));
	const req = {
		method: 'POST',
		url: '/socialInbox',
		get: (n) => (String(n).toLowerCase() === 'content-type' ? 'application/activity+json' : ''),
		rawBody: raw,
	};
	const env = {
		SOCIAL_INBOX_AP: '1',
		SOCIAL_INBOX_AP_ACTOR: OUR,
		SOCIAL_INBOX_AP_SKIP_SIG: '1',
	};
	const first = await Inbox.handleRequest(req, { env, db, now: new Date('2026-11-21T12:00:00Z') });
	assert.equal(first.status, 202);
	assert.equal(first.body.stored, true);
	assert.equal(first.body.type, 'Follow');
	assert.equal(db._docs.size, 1);

	const second = await Inbox.handleRequest(req, { env, db });
	assert.equal(second.status, 202);
	assert.equal(second.body.duplicate, true);
	assert.equal(db._docs.size, 1);
});

test('handleRequest: activity not addressed to us is ignored (202)', async () => {
	const db = memDb();
	const activity = {
		id: PEER + '/follows/other',
		type: 'Follow',
		actor: PEER,
		object: 'https://other.example/users/x',
	};
	const out = await Inbox.handleRequest(
		{
			method: 'POST',
			get: () => 'application/activity+json',
			rawBody: Buffer.from(JSON.stringify(activity)),
		},
		{
			env: { SOCIAL_INBOX_AP: '1', SOCIAL_INBOX_AP_ACTOR: OUR, SOCIAL_INBOX_AP_SKIP_SIG: '1' },
			db,
		}
	);
	assert.equal(out.status, 202);
	assert.equal(out.body.ignored, true);
	assert.equal(db._docs.size, 0);
});

test('HTTP Signature rsa-sha256 verifies Digest and Signature', async () => {
	const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
	const pem = publicKey.export({ type: 'spki', format: 'pem' });
	const activity = {
		id: PEER + '/likes/1',
		type: 'Like',
		actor: PEER,
		object: OUR + '/statuses/9',
		to: [OUR],
	};
	const body = Buffer.from(JSON.stringify(activity));
	const digest = Inbox.bodyDigest(body);
	const date = 'Sat, 21 Nov 2026 17:00:00 GMT';
	const headersList = '(request-target) host date digest';
	const path = '/socialInbox';
	const toSign = ['(request-target): post ' + path, 'host: carlosandmunoz.com', 'date: ' + date, 'digest: ' + digest].join(
		String.fromCharCode(10)
	);
	const signature = crypto.sign('sha256', Buffer.from(toSign), privateKey).toString('base64');
	const keyId = PEER + '#main-key';
	const headers = {
		host: 'carlosandmunoz.com',
		date,
		digest,
		signature:
			'keyId="' +
			keyId +
			'",algorithm="rsa-sha256",headers="' +
			headersList +
			'",signature="' +
			signature +
			'"',
		'content-type': 'application/activity+json',
	};
	const actors = {
		async get(url) {
			assert.equal(url, PEER);
			return { id: PEER, publicKey: { id: keyId, owner: PEER, publicKeyPem: pem } };
		},
	};
	const ok = await Inbox.verifyHttpSignature({
		method: 'POST',
		path,
		headers,
		body,
		actors,
	});
	assert.equal(ok.ok, true);

	const bad = await Inbox.verifyHttpSignature({
		method: 'POST',
		path,
		headers: Object.assign({}, headers, { digest: 'SHA-256=AAAA' }),
		body,
		actors,
	});
	assert.equal(bad.ok, false);
	assert.equal(bad.reason, 'digest');

	const signedReq = {
		method: 'POST',
		url: path,
		headers,
		get(n) {
			const k = String(n).toLowerCase();
			return headers[k] || '';
		},
		rawBody: body,
	};
	const accepted = await Inbox.handleRequest(signedReq, {
		env: { SOCIAL_INBOX_AP: '1', SOCIAL_INBOX_AP_ACTOR: OUR },
		db: memDb(),
		actors,
	});
	assert.equal(accepted.status, 202);
	assert.equal(accepted.body.type, 'Like');
	assert.equal(accepted.body.stored, true);
});
