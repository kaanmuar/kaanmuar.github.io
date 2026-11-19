// Riding the trends (#3814): the hashtag a reply carries, viral and adjacent posts, drama, and replies that go out on their own.
const test = require('node:test');
const assert = require('node:assert/strict');
const E = require('../../functions/engagement.js');
const T = require('../../functions/engagement-trends.js');

const NOW = Date.parse('2026-11-19T15:00:00Z');
const post = (o) =>
	Object.assign(
		{
			network: 'x',
			id: 'p1',
			key: 'x_1',
			author: { handle: 'ana', name: 'Ana' },
			title: '',
			text: 'Our flaky Playwright tests keep failing on CI #playwright #testing',
			lang: 'en',
			createdAt: new Date(NOW - 2 * 3600000).toISOString(),
			metrics: { likes: 10, replies: 2, reposts: 1, views: 0 },
			tags: [],
			topic: 'Testing',
		},
		o
	);
const ai = (o) => Object.assign({ about: 'x', lang: 'en', sentiment: 'positive', political: false, argument: false, promo: false, drama: false, worth: 0.9, reply: 'Pin the browser version and retry only the network step.', english: '' }, o);
const live = E.settings({ live: true });

test('trendingNow keeps tags that rise in two posts or weigh a lot, and drops sensitive and spam tags', () => {
	const posts = [
		post({ tags: ['Playwright', 'Election2026', 'f4f'], trend: 1 }),
		post({ tags: ['playwright'], text: 'x', trend: 2 }),
		post({ tags: ['OneOff'], text: 'x', trend: 0.5 }),
		post({ tags: ['Heavy'], text: 'x', trend: 6 }),
	];
	const tags = T.trendingNow(posts).map((t) => t.tag.toLowerCase());
	assert.deepEqual(tags.slice(0, 2), ['playwright', 'heavy']);
	assert.ok(!tags.includes('oneoff') && !tags.includes('election2026') && !tags.includes('f4f'));
});

test('pickTag prefers a tag of the post that is rising, then one in its topic, then an evergreen tag', () => {
	const trends = [{ tag: 'Playwright', weight: 5, posts: 3 }, { tag: 'Flaky', weight: 3, posts: 2 }];
	assert.equal(T.pickTag(post(), trends, E.relevance), 'playwright');
	assert.equal(T.pickTag(post({ text: 'CI is red again', tags: [] }), trends, E.relevance), 'Playwright');
	assert.match(T.pickTag(post({ text: 'CI is red again', tags: [], topic: 'SEO' }), [], E.relevance), /^(SEO|TechnicalSEO)$/);
});

test('no tag on networks where a hashtag in a reply reads as promotion', () => {
	['linkedin', 'facebook', 'youtube', 'reddit', 'telegram'].forEach((network) => assert.equal(T.pickTag(post({ network }), [{ tag: 'Playwright', weight: 5, posts: 3 }], E.relevance), ''));
});

test('withTag adds one tag when it fits, never twice', () => {
	assert.equal(T.withTag('Retry the network step only.', 'Playwright', 280), 'Retry the network step only. #Playwright');
	assert.equal(T.withTag('Use #playwright traces.', 'Playwright', 280), 'Use #playwright traces.');
	assert.equal(T.withTag('Short.', 'Playwright', 12), 'Short.');
	assert.equal(T.withTag('Short.', 'f4f', 280), 'Short.');
});

test('a viral post with no field keyword is read; a quiet one is not', () => {
	const hot = { text: 'The whole internet is down and nobody can reach their dashboards today', title: '' };
	assert.equal(T.viral(hot, { trend: 5 }), true);
	assert.equal(T.viral(hot, { trend: 1 }), false);
});

test('the adjacent topic puts outages and AI search chatter in the field', () => {
	assert.ok(E.relevance('Another outage today, status page says investigating').hits > 0);
	assert.ok(E.relevance('Does ChatGPT search read llms.txt?').topics.includes('Trends'));
});

test('threads about a person or brand under attack are skipped', () => {
	const g = E.guard(post({ text: 'Everyone boycott this company, they are a scam' }), E.settings({}), NOW);
	assert.equal(g, 'drama');
	assert.equal(E.guard(post(), E.settings({}), NOW), '');
});

test('decide appends one tag to the reply and flags a reply that may go out on its own in a live run', () => {
	const trends = [{ tag: 'playwright', weight: 5, posts: 3 }];
	const p = Object.assign(post({ score: 5 }), { trend: 1 });
	const d = E.decide(p, ai(), live, {}, NOW, new Set(), new Set(), trends);
	const r = d.actions.reply;
	assert.equal(r.status, 'waiting');
	assert.match(r.draft, / #playwright$/);
	assert.equal(r.tag, 'playwright');
	assert.equal(r.trendSafe, true);
});

test('a reply is never trend-safe when it is political, a fight, drama, promo, negative, or the run is not live', () => {
	const trends = [{ tag: 'playwright', weight: 5, posts: 3 }];
	const p = Object.assign(post({ score: 5 }), { trend: 1 });
	[{ sentiment: 'negative' }, { promo: true }, { drama: true }, { worth: 0.65 }].forEach((o) => {
		const r = (E.decide(p, ai(o), live, {}, NOW, new Set(), new Set(), trends).actions || {}).reply;
		assert.ok(!r || !r.trendSafe, JSON.stringify(o));
	});
	assert.ok(!E.decide(p, ai(), E.settings({}), {}, NOW, new Set(), new Set(), trends).actions.reply.trendSafe);
	assert.ok(!E.decide(p, ai(), E.settings({ live: true, autoReplies: false }), {}, NOW, new Set(), new Set(), trends).actions.reply.trendSafe);
	const quiet = E.decide(Object.assign({}, p, { text: 'CI is red again', tags: [] }), ai(), live, {}, NOW, new Set(), new Set(), []).actions.reply;
	assert.ok(!quiet.trendSafe);
});

test('replies on LinkedIn carry no tag', () => {
	const d = E.decide(Object.assign(post({ network: 'linkedin', score: 5 }), { trend: 1 }), ai(), live, {}, NOW, new Set(), new Set(), [{ tag: 'playwright', weight: 5, posts: 3 }]);
	assert.ok(!/#/.test(d.actions.reply.draft));
});

test('the prompt asks for wit, a soft mention and the drama flag, and leaves room for the tag', () => {
	const prompt = E.aiPrompt([Object.assign(post(), { key: 'x_1' })]);
	assert.match(prompt, /playful and meme-aware/);
	assert.match(prompt, /free URL review/);
	assert.match(prompt, /"drama"/);
	assert.match(prompt, /"maxReply":250/);
});

test('X and Threads take about a quarter more a day; the other networks keep their ceilings', () => {
	assert.equal(E.NETWORKS.x.caps.reply, 12);
	assert.equal(E.NETWORKS.threads.caps.like, 62);
	assert.equal(E.NETWORKS.linkedin.caps.reply, 8);
	assert.equal(E.NETWORKS.tiktok.caps.reply, 8);
	assert.equal(E.NETWORKS.youtube.caps.reply, 15);
});

const J = require('../../functions/jarvis-engagement.js');
const { fakeDb } = require('./fixtures/fake-firestore.js');

const waitingDoc = (key, score) => ({ key, network: 'x', score, actions: { reply: { status: 'waiting', trendSafe: true, draft: 'hi there friend' } } });

test('trend-safe replies are approved on their own in a live run once sending is auto, within the daily cap, best first', async () => {
	const db = fakeDb();
	const long = NOW + 30 * 24 * 3600000;
	await db.collection('jarvis_settings').doc('outreach_send').set({ launchAt: new Date(NOW).toISOString(), caps: { x: 1 } });
	const docs = [waitingDoc('a', 2), waitingDoc('b', 9)];
	assert.equal(await J.autoApprove({ db }, live, docs, long), 1);
	assert.equal(docs[1].actions.reply.status, 'approved');
	assert.equal(docs[1].actions.reply.by, 'auto');
	assert.equal(docs[0].actions.reply.status, 'waiting');
});

test('nothing is approved on its own in a dry run, or while Carlos still approves everything', async () => {
	const db = fakeDb();
	await db.collection('jarvis_settings').doc('outreach_send').set({ launchAt: new Date(NOW).toISOString() });
	assert.equal(await J.autoApprove({ db }, E.settings({}), [waitingDoc('a', 2)], NOW + 30 * 24 * 3600000), 0);
	const docs = [waitingDoc('a', 2)];
	assert.equal(await J.autoApprove({ db }, live, docs, NOW + 3600000), 0);
	assert.equal(docs[0].actions.reply.status, 'waiting');
});
