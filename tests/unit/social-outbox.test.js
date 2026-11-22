'use strict';
// ActivityPub outbox Create publishers (#3841): mocked Firestore, no network.
const test = require('node:test');
const assert = require('node:assert/strict');
const Outbox = require('../../functions/social-outbox');

const OUR = 'https://social.example/users/qa';

function memDb() {
	const docs = new Map();
	return {
		collection(name) {
			assert.equal(name, Outbox.OUTBOX_COLLECTION);
			return {
				doc(id) {
					return {
						id,
						async get() {
							return { exists: docs.has(id), data: () => docs.get(id) };
						},
						async set(row) {
							docs.set(id, Object.assign({}, row));
						},
					};
				},
			};
		},
		_docs: docs,
	};
}

const on = {
	SOCIAL_INBOX_AP_OUTBOX: '1',
	SOCIAL_INBOX_AP_ACTOR: OUR,
};

test('gate: SOCIAL_INBOX_AP_OUTBOX=1 enables append', () => {
	assert.equal(Outbox.enabled({}), false);
	assert.equal(Outbox.enabled({ SOCIAL_INBOX_AP_OUTBOX: '0' }), false);
	assert.equal(Outbox.enabled({ SOCIAL_INBOX_AP_OUTBOX: '1' }), true);
});

test('appendCreate: disabled / no-db / no-actor', async () => {
	const db = memDb();
	assert.equal((await Outbox.appendCreate(db, { content: 'x' }, {})).reason, 'disabled');
	assert.equal(
		(await Outbox.appendCreate(null, { content: 'x' }, on)).reason,
		'no-db'
	);
	assert.equal(
		(
			await Outbox.appendCreate(
				db,
				{ content: 'x' },
				{ SOCIAL_INBOX_AP_OUTBOX: '1' }
			)
		).reason,
		'no-actor'
	);
});

test('appendCreate: stores public-safe Create matching outbox reader fields', async () => {
	const db = memDb();
	const published = '2026-11-22T07:00:00.000Z';
	const result = await Outbox.appendCreate(
		db,
		{
			content: 'Hello fediverse',
			url: 'https://carlosandmunoz.com/social/batch/slug.html',
			statusId: 'mastodon-99',
			objectType: 'Note',
			published,
			now: new Date(published),
		},
		on
	);
	assert.equal(result.stored, true);
	assert.equal(result.duplicate, false);
	assert.ok(result.activityId.startsWith(OUR + '/activities/'));

	const row = db._docs.get(result.id);
	assert.equal(row.type, 'Create');
	assert.equal(row.actor, OUR);
	assert.equal(row.published, published);
	assert.equal(row.activityId, result.activityId);
	assert.deepEqual(row.to, [Outbox.AS_PUBLIC]);
	assert.equal(row.objectTypes[0], 'Note');
	assert.equal(row.activity.type, 'Create');
	assert.equal(row.activity.actor, OUR);
	assert.equal(row.activity.object.type, 'Note');
	assert.equal(row.activity.object.content, 'Hello fediverse');
	assert.equal(row.activity.object.attributedTo, OUR);
	assert.equal(row.activity.object.url, 'https://carlosandmunoz.com/social/batch/slug.html');
	assert.equal(row.activity['@context'], Outbox.AS_CONTEXT);
	assert.equal(row.acceptIntent, undefined);
	assert.equal(row.activity.bto, undefined);
});

test('appendCreate: Article objectType and idempotent duplicate', async () => {
	const db = memDb();
	const first = await Outbox.appendCreate(
		db,
		{
			content: 'Longer piece',
			summary: 'teaser',
			objectType: 'Article',
			activityId: OUR + '/activities/article-1',
			objectId: OUR + '/articles/1',
			published: '2026-11-22T08:00:00Z',
		},
		on
	);
	assert.equal(first.stored, true);
	assert.equal(db._docs.get(first.id).activity.object.type, 'Article');
	assert.equal(db._docs.get(first.id).activity.object.summary, 'teaser');

	const again = await Outbox.appendCreate(
		db,
		{
			content: 'Longer piece',
			objectType: 'Article',
			activityId: OUR + '/activities/article-1',
			objectId: OUR + '/articles/1',
			published: '2026-11-22T08:00:00Z',
		},
		on
	);
	assert.equal(again.stored, false);
	assert.equal(again.duplicate, true);
	assert.equal(db._docs.size, 1);
});

test('buildCreate: rejects non-http ids', () => {
	const bad = Outbox.buildCreate(
		{ activityId: 'urn:example:1', objectId: 'urn:example:2', content: 'x' },
		on
	);
	assert.equal(bad.ok, false);
	assert.equal(bad.reason, 'id');
});
