const test = require('node:test');
const assert = require('node:assert/strict');
const Invites = require('../../functions/telegram-invites');

const NOW = Date.parse('2026-11-27T12:00:00.000Z');

test('candidatesFromReports skips our own handles and de-dupes by telegram username', () => {
	const list = Invites.candidatesFromReports([
		{ id: 'a', host: 'a.com', name: 'A', telegram: [{ handle: 'brand_a', url: 'https://t.me/brand_a' }] },
		{ id: 'b', host: 'b.com', name: 'B', telegram: [{ handle: 'brand_a', url: 'https://t.me/brand_a' }] },
		{ id: 'c', host: 'c.com', name: 'C', telegram: [{ handle: 'qalab_live', url: 'https://t.me/qalab_live' }] },
		{ id: 'd', host: 'd.com', name: 'D', telegram: [] },
	]);
	assert.deepEqual(
		list.map((c) => [c.handle, c.host]),
		[['brand_a', 'a.com']]
	);
});

test('inviteDraft names the handle, the site and the invite link', () => {
	const text = Invites.inviteDraft(
		{ handle: 'brand_a', name: 'Brand A', host: 'brand-a.com' },
		'https://t.me/+InviteLink'
	);
	assert.match(text, /@brand_a/);
	assert.match(text, /Brand A/);
	assert.match(text, /https:\/\/t\.me\/\+InviteLink/);
	assert.match(text, /t\.me\/qalab_live/);
});

test('ensureGroupInviteLink reuses a stored link and otherwise creates one', async () => {
	const calls = [];
	const tg = async (method, params) => {
		calls.push([method, params]);
		return { invite_link: 'https://t.me/+NewLink' };
	};
	assert.deepEqual(
		await Invites.ensureGroupInviteLink(tg, { group: -1001, groupInviteLink: 'https://t.me/+Old' }),
		{ link: 'https://t.me/+Old', reused: true }
	);
	assert.equal(calls.length, 0);
	const created = await Invites.ensureGroupInviteLink(tg, { group: -1001 });
	assert.equal(created.link, 'https://t.me/+NewLink');
	assert.equal(created.reused, false);
	assert.equal(calls[0][0], 'createChatInviteLink');
	assert.equal(calls[0][1].chat_id, -1001);
});

test('queueInvites writes one waiting Jarvis draft per due handle', async () => {
	const store = new Map();
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
						async set(doc) {
							store.set(key, Object.assign({}, store.get(key) || {}, doc));
						},
					};
				},
			};
		},
	};
	const reports = [
		{ id: 'a', host: 'a.com', name: 'A', telegram: [{ handle: 'brand_a', url: 'https://t.me/brand_a' }] },
	];
	const first = await Invites.queueInvites({ db, now: NOW }, reports, 'https://t.me/+Invite');
	assert.equal(first.queued, 1);
	assert.equal(first.candidates, 1);
	const again = await Invites.queueInvites({ db, now: NOW + 1000 }, reports, 'https://t.me/+Invite');
	assert.equal(again.queued, 0);
	assert.equal(again.skipped, 1);
	const post = [...store.entries()].find(([k]) => k.startsWith('engagement_posts/'));
	assert.ok(post);
	assert.equal(post[1].campaign, Invites.CAMPAIGN);
	assert.equal(post[1].actions.reply.status, 'waiting');
	assert.match(post[1].actions.reply.draft, /@brand_a/);
});

test('publicReport exposes telegram handles from crawl socialLinks', () => {
	const publish = require('../../functions/url-review-publish');
	const out = publish.publicReport({
		id: 'x',
		host: 'example.com',
		finalUrl: 'https://example.com/',
		fetchedAt: '2026-11-27T00:00:00.000Z',
		observed: { lang: 'en', socialLinks: ['https://t.me/ExampleOrg', 'https://x.com/example'] },
		insights: { score: { overall: 70, grade: 'C', areas: {} }, findings: [] },
		pagespeed: { ok: false },
	});
	assert.deepEqual(
		out.telegram.map((t) => t.handle),
		['exampleorg']
	);
});
