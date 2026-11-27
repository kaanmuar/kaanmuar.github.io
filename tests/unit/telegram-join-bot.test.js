'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const E = require('../../functions/engagement.js');
const T = require('../../functions/telegram-join-bot.js');
const { fakeDb } = require('./fixtures/fake-firestore.js');

const NOW = Date.parse('2026-11-05T15:00:00Z');
const deps = (db, extra) =>
	Object.assign({ db, env: { TELEGRAM_BOT: 'qalab_live_bot' }, now: NOW, inc: (n) => ({ inc: n }) }, extra || {});

test('botUser reads TELEGRAM_BOT and shouldAddBot skips our channel', () => {
	assert.equal(T.botUser({}), 'qalab_live_bot');
	assert.equal(T.botUser({ TELEGRAM_BOT: '@Other_Bot' }), 'other_bot');
	assert.equal(T.shouldAddBot('qa_testers', 'qalab_live_bot'), true);
	assert.equal(T.shouldAddBot('qalab_live', 'qalab_live_bot'), false);
	assert.equal(T.shouldAddBot('qalab_live_bot', 'qalab_live_bot'), false);
});

test('botAddStatus and adminAskDraft', () => {
	assert.equal(T.botAddStatus({ botAdd: 'added' }), 'added');
	assert.equal(T.botAddStatus({ botError: 'nope' }), 'failed');
	assert.equal(T.botAddStatus({}), '');
	const draft = T.adminAskDraft({ id: 'qa_testers', name: 'QA Testers', lang: 'es' }, 'qalab_live_bot');
	assert.match(draft, /qalab_live_bot/);
	assert.match(draft, /QA Testers/);
	assert.match(draft, /¿pueden agregar/);
});

test('adminAskDoc is a waiting Telegram reply for Jarvis', () => {
	const doc = T.adminAskDoc(
		{ id: 'qa_testers', name: 'QA Testers', url: 'https://t.me/qa_testers', lang: 'en', kind: 'group' },
		'telegram_abc',
		'Please add the bot.',
		NOW
	);
	assert.equal(doc.campaign, T.CAMPAIGN);
	assert.equal(doc.network, 'telegram');
	assert.equal(doc.actions.reply.status, 'waiting');
	assert.equal(doc.actions.reply.kind, T.CAMPAIGN);
	assert.equal(doc.join.key, 'telegram_abc');
	assert.equal(doc.via, 'mac');
});

test('queueAdminAsk writes once and marks the join', async () => {
	const db = fakeDb();
	const key = E.keyOf('telegram', 'qa_testers');
	await db
		.collection('engagement_joins')
		.doc(key)
		.set({
			network: 'telegram',
			id: 'qa_testers',
			name: 'QA Testers',
			url: 'https://t.me/qa_testers',
			lang: 'en',
			status: 'joined',
		});
	const join = (await db.collection('engagement_joins').doc(key).get()).data();
	const first = await T.queueAdminAsk(deps(db), join, key);
	assert.equal(first.queued, true);
	const postKey = E.keyOf('telegram', 'qa_testers/bot-ask');
	assert.ok(db.data.get('engagement_posts/' + postKey));
	assert.match(db.data.get('engagement_posts/' + postKey).actions.reply.draft, /qalab_live_bot/);
	assert.equal(db.data.get('engagement_joins/' + key).botAskAt, new Date(NOW).toISOString());
	const again = await T.queueAdminAsk(deps(db), join, key);
	assert.equal(again.queued, false);
});