// Scout trending-tag drafts (#3814): fixture trends are scored against our own topics and become review drafts, never posts.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const S = require('../../scripts/scout-trending-drafts.js');

const NOW = Date.parse('2026-11-20T15:00:00Z');
const FIXTURE = {
	date: '2026-11-20',
	tags: [
		{ tag: 'WebSecurity', topic: 'Security', score: 2 },
		{ tag: 'a11y', topic: 'Accessibility', score: 1.5 },
		{ tag: 'Election2026', topic: 'Trends', score: 9 },
		{ tag: 'f4f', topic: 'Trends', score: 9 },
		{ tag: 'Cats', topic: 'Pets', score: 5 },
		{ tag: 'websecurity', topic: 'Security', score: 1 },
	],
};
const OUR_POSTS = ['HSTS and a content security policy for web security', 'Security headers on a bank site', 'Keyboard accessibility on a form'];

test('parseTrends drops spam, sensitive and duplicate tags and accepts a manual list', () => {
	assert.deepEqual(S.parseTrends(FIXTURE).map((t) => t.tag), ['WebSecurity', 'a11y', 'Cats']);
	assert.deepEqual(S.parseTrends('#SEO, GEO ,f4f').map((t) => t.tag), ['SEO', 'GEO']);
});

test('trends are scored against our own post topics; off-topic tags are dropped', () => {
	const own = S.ownTopics(OUR_POSTS);
	assert.ok(own.Security > own.Accessibility);
	const sec = S.scoreTrend(S.parseTrends(FIXTURE)[0], own);
	assert.equal(sec.topic, 'Security');
	assert.equal(S.scoreTrend({ tag: 'Cats', topic: 'Pets', score: 5 }, own), null);
});

test('buildDrafts writes one draft per tag-friendly network, status draft, noPost, never trendSafe', () => {
	const rows = S.buildDrafts(FIXTURE, S.ownTopics(OUR_POSTS), { now: NOW, keep: 3 });
	assert.ok(rows.length >= 2);
	assert.deepEqual([...new Set(rows.map((r) => r.tag))], ['WebSecurity', 'a11y']);
	assert.deepEqual([...new Set(rows.map((r) => r.network))].sort(), S.SCOUT_NETWORKS.slice().sort());
	rows.forEach((r) => {
		assert.equal(r.status, 'draft');
		assert.equal(r.noPost, true);
		assert.ok(!('trendSafe' in r) && !('approved' in r));
		assert.ok(r.draft.includes('#' + r.tag));
		assert.ok(!/https?:\/\//.test(r.draft));
		assert.ok(r.id.endsWith('2026-11-20'));
	});
	assert.ok(!rows.some((r) => ['linkedin', 'reddit', 'telegram', 'youtube', 'facebook'].includes(r.network)));
});

test('a network outside the tag-friendly list is ignored, and re-running keeps the first row as Carlos left it', () => {
	const own = S.ownTopics(OUR_POSTS);
	assert.deepEqual(S.buildDrafts(FIXTURE, own, { now: NOW, networks: ['linkedin'] }), []);
	const first = S.buildDrafts(FIXTURE, own, { now: NOW, networks: ['x'] });
	const edited = [Object.assign({}, first[0], { draft: 'edited by Carlos' })];
	const merged = S.mergeQueue(edited, first);
	assert.equal(merged.length, first.length);
	assert.equal(merged.find((r) => r.id === first[0].id).draft, 'edited by Carlos');
});

test('the CLI writes only the draft file, from a fixture, and makes no network call', () => {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'scout-'));
	const out = path.join(dir, 'queue.json');
	const file = path.join(dir, 'trends.json');
	fs.writeFileSync(file, JSON.stringify(Object.assign({}, FIXTURE, { date: new Date().toISOString().slice(0, 10) })));
	const run = spawnSync(process.execPath, ['scripts/scout-trending-drafts.js', '--file', file, '--out', out, '--keep', '2'], { encoding: 'utf8', cwd: path.join(__dirname, '../..'), env: Object.assign({}, process.env, { HTTPS_PROXY: 'http://127.0.0.1:1', HTTP_PROXY: 'http://127.0.0.1:1' }) });
	assert.equal(run.status, 0, run.stderr);
	const queue = JSON.parse(fs.readFileSync(out, 'utf8'));
	assert.ok(queue.length > 0 && queue.every((r) => r.status === 'draft' && r.noPost === true));
	assert.match(run.stdout, /none posted/);
});

test('a stale or missing trending file writes nothing', () => {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'scout-'));
	const out = path.join(dir, 'queue.json');
	const run = spawnSync(process.execPath, ['scripts/scout-trending-drafts.js', '--file', path.join(dir, 'none.json'), '--out', out], { encoding: 'utf8', cwd: path.join(__dirname, '../..') });
	assert.equal(run.status, 0);
	assert.ok(!fs.existsSync(out));
});
