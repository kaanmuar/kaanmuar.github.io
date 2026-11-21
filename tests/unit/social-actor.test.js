'use strict';
// ActivityPub actor + WebFinger + outbox Creates (#3841): no network; mocked store.
const test = require('node:test');
const assert = require('node:assert/strict');
const Actor = require('../../functions/social-actor');

const OUR = 'https://social.example/users/qa';
const ACCT = 'acct:qa@social.example';
const PEER = 'https://mastodon.example/users/alice';

const on = {
	SOCIAL_INBOX_AP: '1',
	SOCIAL_INBOX_AP_ACTOR: OUR,
	SOCIAL_INBOX_AP_ACCT: ACCT,
};

function memOutbox(rows = []) {
	const docs = new Map();
	for (const row of rows) {
		const id = row._id || row.activityId || row.id || String(docs.size + 1);
		const { _id, ...rest } = row;
		docs.set(id, rest);
	}
	function matches(row, filters) {
		return filters.every(([field, op, value]) => {
			if (op !== '==') return false;
			return row[field] === value;
		});
	}
	function query(filters = [], order = null, cap = null) {
		return {
			where(field, op, value) {
				return query(filters.concat([[field, op, value]]), order, cap);
			},
			orderBy(field, dir) {
				return query(filters, { field, dir: dir || 'asc' }, cap);
			},
			limit(n) {
				return query(filters, order, n);
			},
			async get() {
				let list = [...docs.entries()].map(([id, data]) => ({ id, data: () => data }));
				list = list.filter((d) => matches(d.data(), filters));
				if (order) {
					const mul = order.dir === 'desc' ? -1 : 1;
					list.sort((a, b) => {
						const av = String(a.data()[order.field] || '');
						const bv = String(b.data()[order.field] || '');
						return mul * av.localeCompare(bv);
					});
				}
				if (cap != null) list = list.slice(0, cap);
				return { docs: list };
			},
		};
	}
	return {
		collection(name) {
			assert.equal(name, Actor.OUTBOX_COLLECTION);
			return Object.assign(query(), {
				async get() {
					return {
						docs: [...docs.entries()].map(([id, data]) => ({ id, data: () => data })),
					};
				},
			});
		},
		_docs: docs,
	};
}

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

test('handleActor: disabled → 404; missing actor → 503; GET returns activity+json', async () => {
	assert.equal((await Actor.handleActor({ method: 'GET' }, { env: {} })).status, 404);
	assert.equal(
		(await Actor.handleActor({ method: 'GET' }, { env: { SOCIAL_INBOX_AP: '1' } })).reason,
		'no-actor'
	);
	const ok = await Actor.handleActor({ method: 'GET', path: '/' }, { env: on });
	assert.equal(ok.status, 200);
	assert.equal(ok.headers['Content-Type'], Actor.AP_JSON);
	assert.equal(ok.body.id, OUR);
	assert.equal((await Actor.handleActor({ method: 'POST' }, { env: on })).status, 405);
});

test('handleActor: /outbox empty OrderedCollection without store', async () => {
	const out = await Actor.handleActor({ method: 'GET', path: '/outbox' }, { env: on });
	assert.equal(out.status, 200);
	assert.equal(out.body.type, 'OrderedCollection');
	assert.equal(out.body.totalItems, 0);
	assert.deepEqual(out.body.orderedItems, []);
	assert.equal(out.body.id, OUR + '/outbox');
	assert.equal(out.reason, 'outbox-empty');
});

test('handleActor: /outbox returns public Creates from mocked fediverse_outbox', async () => {
	const db = memOutbox([
		{
			_id: 'old',
			activityId: OUR + '/activities/1',
			type: 'Create',
			actor: OUR,
			published: '2026-11-20T10:00:00Z',
			to: [Actor.AS_PUBLIC],
			activity: {
				id: OUR + '/activities/1',
				type: 'Create',
				actor: OUR,
				published: '2026-11-20T10:00:00Z',
				to: [Actor.AS_PUBLIC],
				object: { id: OUR + '/notes/1', type: 'Note', content: 'hello' },
				bto: [PEER],
			},
			acceptIntent: { secret: 'nope' },
			expireAt: 'never-leak',
		},
		{
			_id: 'new',
			activityId: OUR + '/activities/2',
			type: 'Create',
			actor: OUR,
			published: '2026-11-21T12:00:00Z',
			activity: {
				id: OUR + '/activities/2',
				type: 'Create',
				actor: OUR,
				published: '2026-11-21T12:00:00Z',
				to: [Actor.AS_PUBLIC],
				object: { id: OUR + '/notes/2', type: 'Note', content: 'newer' },
			},
		},
		{
			_id: 'peer',
			type: 'Create',
			actor: PEER,
			published: '2026-11-22T00:00:00Z',
			activity: {
				id: PEER + '/activities/9',
				type: 'Create',
				actor: PEER,
				object: { id: PEER + '/notes/9', type: 'Note', content: 'not ours' },
			},
		},
		{
			_id: 'follow',
			type: 'Follow',
			actor: OUR,
			published: '2026-11-23T00:00:00Z',
			activity: { id: OUR + '/follows/1', type: 'Follow', actor: OUR, object: PEER },
		},
	]);

	const out = await Actor.handleActor(
		{ method: 'GET', path: '/outbox' },
		{ env: on, db }
	);
	assert.equal(out.status, 200);
	assert.equal(out.reason, 'outbox');
	assert.equal(out.body.totalItems, 2);
	assert.equal(out.body.orderedItems.length, 2);
	assert.equal(out.body.orderedItems[0].id, OUR + '/activities/2');
	assert.equal(out.body.orderedItems[1].id, OUR + '/activities/1');
	assert.equal(out.body.orderedItems[0].object.content, 'newer');
	assert.equal(out.body.orderedItems[1].bto, undefined);
	assert.equal(out.body.orderedItems[1].acceptIntent, undefined);
	assert.equal(out.body.orderedItems[1].expireAt, undefined);
	assert.ok(!JSON.stringify(out.body).includes('nope'));
});

test('clampLimit caps page size; ?limit= respected under OUTBOX_PAGE_SIZE', async () => {
	assert.equal(Actor.clampLimit(100), Actor.OUTBOX_PAGE_SIZE);
	assert.equal(Actor.clampLimit(3), 3);
	const rows = [];
	for (let i = 0; i < 5; i++) {
		rows.push({
			_id: 'n' + i,
			type: 'Create',
			actor: OUR,
			published: '2026-11-2' + i + 'T00:00:00Z',
			activity: {
				id: OUR + '/activities/' + i,
				type: 'Create',
				actor: OUR,
				published: '2026-11-2' + i + 'T00:00:00Z',
				to: [Actor.AS_PUBLIC],
				object: { id: OUR + '/notes/' + i, type: 'Note', content: 'n' + i },
			},
		});
	}
	const out = await Actor.handleActor(
		{ method: 'GET', path: '/outbox', query: { limit: '2' } },
		{ env: on, db: memOutbox(rows) }
	);
	assert.equal(out.body.orderedItems.length, 2);
	assert.equal(out.body.totalItems, 2);
});

test('publicCreateActivity drops non-Create and foreign actors', () => {
	assert.equal(
		Actor.publicCreateActivity({ type: 'Announce', actor: OUR, activityId: OUR + '/a' }, OUR),
		null
	);
	assert.equal(
		Actor.publicCreateActivity(
			{
				type: 'Create',
				actor: PEER,
				activityId: PEER + '/a',
				activity: { id: PEER + '/a', type: 'Create', actor: PEER },
			},
			OUR
		),
		null
	);
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
