const test = require('node:test');
const assert = require('node:assert/strict');
const M = require('../../functions/telegram-monitor');
const Invites = require('../../functions/telegram-invites');
const JoinBot = require('../../functions/telegram-join-bot');

test('tallyCampaign counts waiting and posted soft-invites', () => {
	const t = M.tallyCampaign(
		[
			{ campaign: Invites.CAMPAIGN, actions: { reply: { status: 'waiting' } } },
			{ campaign: Invites.CAMPAIGN, actions: { reply: { status: 'posted' } } },
			{ campaign: JoinBot.CAMPAIGN, actions: { reply: { status: 'waiting' } } },
			{ campaign: 'report-reply', actions: { reply: { status: 'waiting' } } },
		],
		Invites.CAMPAIGN
	);
	assert.equal(t.waiting, 1);
	assert.equal(t.posted, 1);
	assert.equal(t.total, 2);
});

test('tallyBotAdd sums Telegram join botAdd outcomes', () => {
	const t = M.tallyBotAdd([
		{ network: 'telegram', botAdd: 'added' },
		{ network: 'telegram', botAdd: 'needs_admin' },
		{ network: 'reddit', botAdd: 'added' },
		{ network: 'telegram', botAdd: '' },
	]);
	assert.equal(t.added, 1);
	assert.equal(t.needs_admin, 1);
	assert.equal(t.total, 2);
});

test('quality needs reconnect when invite link is missing', () => {
	const q = M.quality(
		{ token: 'x', group: -1, admin: true, handle: '@qalab_live_bot' },
		{ waiting: 0, posted: 0, failed: 0, total: 0 },
		{ added: 0, already: 0, needs_admin: 0, failed: 0, total: 0 },
		{}
	);
	assert.ok(q.flags.some((f) => f.id === 'no-invite-link'));
	assert.ok(q.needs.some((n) => /invite link/i.test(n)));
});

test('quality flags invite backlog and bot-add stuck', () => {
	const q = M.quality(
		{ token: 'x', group: -1, admin: true, groupInviteLink: 'https://t.me/+x' },
		{ waiting: 9, posted: 0, failed: 0, total: 9 },
		{ added: 0, already: 0, needs_admin: 3, failed: 0, total: 3 },
		{}
	);
	assert.ok(q.flags.some((f) => f.id === 'invite-backlog'));
	assert.ok(q.flags.some((f) => f.id === 'bot-add-stuck'));
});

test('advanceOf improves when more posted and bot added', () => {
	assert.equal(M.advanceOf({ posted: 2, approved: 1, added: 2, failed: 0, needs_admin: 0 }, { posted: 0, approved: 0, added: 0, failed: 0, needs_admin: 0 }), 1);
	assert.equal(M.advanceOf({ posted: 0, approved: 0, added: 0, failed: 2, needs_admin: 2 }, { posted: 2, approved: 1, added: 1, failed: 0, needs_admin: 0 }), -1);
});

test('summary builds Jarvis payload from posts, joins and creds', async () => {
	const store = new Map();
	store.set('engagement_private/telegram', {
		token: 't',
		channel: '@qalab_live',
		group: -100,
		admin: true,
		groupInviteLink: 'https://t.me/+Ready',
		groupTitle: 'QA-lab Live Reports Chat',
	});
	const db = {
		collection(name) {
			return {
				doc(id) {
					const key = name + '/' + id;
					return {
						async get() {
							return store.has(key)
								? { exists: true, data: () => store.get(key) }
								: { exists: false, data: () => ({}) };
						},
					};
				},
				limit() {
					return {
						async get() {
							return { size: 2, docs: [] };
						},
					};
				},
			};
		},
	};
	const out = await M.summary(
		{ db, now: Date.parse('2026-11-27T20:00:00.000Z') },
		[{ campaign: Invites.CAMPAIGN, actions: { reply: { status: 'waiting' } } }],
		[{ network: 'telegram', botAdd: 'added' }],
		{ at: '2026-11-27T19:00:00.000Z', telegramInvites: { candidates: 3, queued: 1, skipped: 2 } }
	);
	assert.equal(out.ok, true);
	assert.equal(out.invites.waiting, 1);
	assert.equal(out.botAdd.added, 1);
	assert.equal(out.lastScout.queued, 1);
	assert.equal(out.groupInviteLink, 'https://t.me/+Ready');
	assert.ok(out.flags.some((f) => f.id === 'invite-link'));
});
