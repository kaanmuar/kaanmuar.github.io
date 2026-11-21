// Scout drafts in the Jarvis Engagement waiting queue (#3814): load, brief, decide never posts.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const J = require('../../functions/jarvis-engagement.js');
const { fakeDb } = require('./fake-jarvis-db.js');

const NOW = Date.parse('2026-11-20T18:00:00Z');
const ROW = {
	id: 'scout-websecurity-x-2026-11-20',
	kind: 'scout-trend',
	network: 'x',
	tag: 'WebSecurity',
	topic: 'Security',
	score: 2.4,
	hits: 1,
	fit: 0.5,
	draft: "#WebSecurity is trending. Quick check that costs nothing: look at your own site's response headers.",
	lang: 'en',
	status: 'draft',
	noPost: true,
	createdAt: '2026-11-20T15:00:00.000Z',
};

test('scoutBrief keeps noPost and waiting status, never trendSafe', () => {
	const b = J.scoutBrief(ROW, NOW);
	assert.equal(b.key, ROW.id);
	assert.equal(b.campaign, J.SCOUT_CAMPAIGN);
	assert.equal(b.noPost, true);
	assert.equal(b.actions.reply.status, 'waiting');
	assert.equal(b.actions.reply.noPost, true);
	assert.equal(b.actions.reply.draft, ROW.draft);
	assert.ok(!('trendSafe' in b.actions.reply));
});

test('loadScoutDrafts drops decided, non-draft and posting rows', async () => {
	const payload = [
		ROW,
		Object.assign({}, ROW, { id: 'scout-a11y-bluesky-2026-11-20', tag: 'a11y', network: 'bluesky' }),
		Object.assign({}, ROW, { id: 'scout-bad-x-2026-11-20', status: 'approved', noPost: false }),
	];
	const fetchImpl = async () => ({ ok: true, json: async () => payload });
	const list = await J.loadScoutDrafts(fetchImpl, { [ROW.id]: { status: 'dismissed' } }, NOW);
	assert.equal(list.length, 1);
	assert.equal(list[0].key, 'scout-a11y-bluesky-2026-11-20');
	assert.equal(list[0].noPost, true);
});

test('decideScout records approve or dismiss and never calls a network', async () => {
	const db = fakeDb();
	const out = await J.decideScout(
		{ db, now: NOW },
		{ key: ROW.id, decision: 'approve', text: 'Edited #WebSecurity take.' },
		'carlos'
	);
	assert.equal(out.status, 'approved');
	assert.match(out.message, /Nothing was posted/);
	const doc = db.doc('jarvis_settings', 'scout-drafts');
	assert.equal(doc.decisions[ROW.id].status, 'approved');
	assert.equal(doc.decisions[ROW.id].draft, 'Edited #WebSecurity take.');
	const gone = await J.decide({ db, now: NOW + 1000 }, { key: ROW.id, decision: 'dismiss' }, 'carlos');
	assert.equal(gone.status, 'dismissed');
	assert.match(gone.message, /Nothing was posted/);
});

test('the workflow commits only scout-drafts.json and never posts', () => {
	const flow = fs.readFileSync(path.join(__dirname, '../../.github/workflows/scout-trending-drafts.yml'), 'utf8');
	const ops = require('../../functions/ops-schedule');
	const row = ops.JOBS.find((j) => j.job === 'scout-trending-drafts.yml');
	assert.ok(row, 'ops-schedule lists scout-trending-drafts.yml');
	assert.equal(row.host, 'github');
	assert.ok(flow.includes(`cron: '${row.cron}'`));
	assert.match(flow, /scout-trending-drafts\.js/);
	assert.match(flow, /git add assets\/social\/scout-drafts\.json/);
	assert.doesNotMatch(
		flow,
		/open-social\.yml|buffer-batch\.yml|facebook-page\.yml|social-inbox\.yml|engagement-act|replyNow|trendSafe\s*:/
	);
	assert.match(flow, /NEVER posts/);
	assert.match(flow, /NEVER auto-approves/);
});

test('SCOUT_ID accepts the draft id shape and rejects engagement post keys', () => {
	assert.ok(J.SCOUT_ID.test('scout-websecurity-x-2026-11-20'));
	assert.ok(!J.SCOUT_ID.test('bluesky_abcdef0123456789abcd'));
});
