// auto-live-reports.js reads /publishable page by page (#2038): one request with every review since a stuck cursor
// ran the function out of memory, and a failed run never moved the cursor.
// When render times out before commit (#4444), needsCardsOnly tells the watchdog to catch up without clips.
const test = require('node:test');
const assert = require('node:assert/strict');
const {
	fetchPublishable,
	PAGE,
	SOCIAL_POSTS_PER_BATCH,
	needsCardsOnly,
} = require('../../scripts/auto-live-reports.js');

const page = (since, until, read, host) => ({
	since,
	until,
	read,
	held: { thin: 1 },
	unlisted: ['gone.com'],
	reports: [{ report: { host } }],
	comparisons: [],
});

test('reads pages from since to until and merges them', async () => {
	const asked = [];
	const pages = {
		a: page('a', 'b', PAGE, 'one.com'),
		b: page('b', 'c', PAGE, 'two.com'),
		c: page('c', 'd', 3, 'three.com'),
	};
	const out = await fetchPublishable('a', async (from) => {
		asked.push(from);
		return pages[from];
	});
	assert.deepEqual(asked, ['a', 'b', 'c']);
	assert.deepEqual([out.since, out.until, out.read, out.held.thin], ['a', 'd', PAGE * 2 + 3, 3]);
	assert.deepEqual(
		out.reports.map((r) => r.report.host),
		['one.com', 'two.com', 'three.com']
	);
});

test('a page that fails after the first keeps what came back; a first page that fails throws', async () => {
	const out = await fetchPublishable('a', async (from) => {
		if (from === 'b') throw new Error('publishable answered 500');
		return page('a', 'b', PAGE, 'one.com');
	});
	assert.deepEqual([out.until, out.reports.length], ['b', 1]);
	await assert.rejects(
		fetchPublishable('a', async () => {
			throw new Error('publishable answered 500');
		}),
		/500/
	);
});

test('two cancelled Live Reports runs mean the next dispatch should be cards-only (#4444)', () => {
	assert.equal(SOCIAL_POSTS_PER_BATCH, 12);
	assert.equal(needsCardsOnly([]), false);
	assert.equal(
		needsCardsOnly([
			{ status: 'completed', conclusion: 'cancelled' },
			{ status: 'completed', conclusion: 'success' },
		]),
		false
	);
	assert.equal(
		needsCardsOnly([
			{ status: 'completed', conclusion: 'cancelled' },
			{ status: 'completed', conclusion: 'timed_out' },
			{ status: 'in_progress', conclusion: null },
		]),
		true
	);
});

test('clearSocialPending drops the pending marker and the tracked batch file (#4457)', () => {
	const fs = require('fs');
	const path = require('path');
	const os = require('os');
	const { clearSocialPending, SOCIAL_BATCH } = require('../../scripts/auto-live-reports.js');
	const dir = path.dirname(SOCIAL_BATCH);
	fs.mkdirSync(dir, { recursive: true });
	const existed = fs.existsSync(SOCIAL_BATCH);
	const prior = existed ? fs.readFileSync(SOCIAL_BATCH, 'utf8') : null;
	fs.writeFileSync(SOCIAL_BATCH, '{"batch":"auto-test","posts":[1]}\n');
	const out = clearSocialPending({ since: 'x', socialPending: { batch: 'auto-test', count: 1 } });
	assert.equal(out.socialPending, null);
	assert.equal(fs.existsSync(SOCIAL_BATCH), false);
	if (prior != null) fs.writeFileSync(SOCIAL_BATCH, prior);
	else if (existed) {/* restored */}
});
