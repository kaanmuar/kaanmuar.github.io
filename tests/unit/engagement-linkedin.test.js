'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const L = require('../../functions/engagement-linkedin.js');
const M = require('../../functions/engagement-mac.js');
const { fakeDb } = require('./fixtures/fake-firestore.js');

const NOW = Date.parse('2026-11-02T15:00:00Z');
const TOKEN = 't'.repeat(48);
const SYNC = {
	linkedin: {
		date: '2026-11-02',
		items: [
			{
				name: 'Ana Pérez',
				sent: false,
				profile: 'https://www.linkedin.com/in/ana',
				lines: ['Note: Hola Ana', 'Check first: role'],
			},
			{ name: 'Bea Gómez', sent: true, profile: 'https://www.linkedin.com/in/bea', lines: [] },
		],
	},
};

const deps = (db, extra) =>
	Object.assign({ db, fetch: async () => ({}), now: NOW, push: async () => ({ sent: 1 }) }, extra || {});

test('linkedinLine reads labelled list rows', () => {
	assert.equal(L.linkedinLine(SYNC.linkedin.items[0], 'Note'), 'Hola Ana');
	assert.equal(L.linkedinLine(SYNC.linkedin.items[0], 'Check first'), 'role');
});

test('macQueue respects the daily cap and skips sent people', async () => {
	const db = await fakeDb();
	await db
		.collection('engagement_private')
		.doc('mac')
		.set({ tokenHash: M.hash(TOKEN) });
	await db.collection('jarvis_settings').doc('marketing_sync').set(SYNC);
	const q = await M.handle(deps(db), { op: 'engagement-mac-linkedin-queue', auto: true }, TOKEN);
	assert.equal(q.ok, true);
	assert.equal(q.tasks.length, 1);
	assert.equal(q.tasks[0].name, 'Ana Pérez');
	assert.equal(q.tasks[0].note, 'Hola Ana');
});

test('linkedin-send queues from Jarvis and marks sent after the Mac reports', async () => {
	const db = await fakeDb();
	await db
		.collection('engagement_private')
		.doc('mac')
		.set({ tokenHash: M.hash(TOKEN) });
	await db.collection('jarvis_settings').doc('marketing_sync').set(SYNC);
	await L.queueSend(
		db,
		{ date: '2026-11-02', name: 'Ana Pérez', profile: 'https://www.linkedin.com/in/ana', note: 'Hola' },
		NOW
	);
	const q = await M.handle(deps(db), { op: 'engagement-mac-linkedin-queue', auto: false }, TOKEN);
	assert.equal(q.tasks.length, 1);
	const pushed = [];
	await M.handle(
		deps(db, {
			push: async (m) => {
				pushed.push(m);
				return { sent: 1 };
			},
		}),
		{
			op: 'engagement-mac-linkedin-result',
			key: q.tasks[0].key,
			date: '2026-11-02',
			name: 'Ana Pérez',
			ok: true,
			outcome: 'sent',
		},
		TOKEN
	);
	const cmds = await db.collection('jarvis_commands').get();
	assert.equal(cmds.docs.length, 1);
	assert.equal(cmds.docs[0].data().action, 'linkedin');
	assert.equal(pushed[0].title, 'LinkedIn connect sent');
});
