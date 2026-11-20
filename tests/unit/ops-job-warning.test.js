const test = require('node:test');
const assert = require('node:assert/strict');
const ops = require('../../functions/ops-schedule');
const review = require('../../functions/jarvis-review-ops');

const H = 3600000;
const NOW = Date.parse('2026-11-20T08:10:00Z');
const iso = (hours) => new Date(NOW - hours * H).toISOString();
const quiet = () =>
	Object.fromEntries(ops.JOBS.filter((r) => r.host !== 'github').map((r) => [r.job, { startedAt: iso(1), endedAt: iso(1), ok: true }]));

test('a job returns a note or { note, warn }, and outcome reads both (#3811)', () => {
	assert.deepEqual(ops.outcome('12 sent'), { note: '12 sent', warn: false });
	assert.deepEqual(ops.outcome({ warn: true, note: 'skipped: rate limited' }), { note: 'skipped: rate limited', warn: true });
	assert.deepEqual(ops.outcome(null), { note: '', warn: false });
	assert.deepEqual(ops.outcome(undefined), { note: '', warn: false });
});

test('a warning run is no problem for a day, then opsWatchdog flags the job (#3811)', () => {
	const runs = quiet();
	runs.wordfenceFeed = { startedAt: iso(1), endedAt: iso(1), ok: true, note: 'skipped: rate limited', warn: true, warnSince: iso(10) };
	assert.deepEqual(ops.overdue(runs, NOW, '2026-09-01T00:00:00Z'), []);
	runs.wordfenceFeed.warnSince = iso(25);
	const problems = ops.overdue(runs, NOW, '2026-09-01T00:00:00Z');
	assert.deepEqual(problems.map((p) => p.job), ['wordfenceFeed']);
	assert.match(problems[0].why, /^warning since .*: skipped: rate limited$/);
	runs.wordfenceFeed = { startedAt: iso(1), endedAt: iso(1), ok: true, note: '9 records, 3 slugs stored' };
	assert.deepEqual(ops.overdue(runs, NOW, '2026-09-01T00:00:00Z'), []);
});

test('the Jarvis Wordfence row shows a skipped-by-429 run as a warning, not off or fine (#3811)', () => {
	const row = review.wordfenceState({ ok: true, endedAt: iso(1), note: 'skipped: rate limited', warn: true, warnSince: iso(30) });
	assert.equal(row.state, 'quiet');
	assert.equal(row.warn, true);
	assert.equal(row.stored, false);
	assert.equal(review.wordfenceState({ ok: true, endedAt: iso(1), note: 'skipped: no key' }).state, 'off');
});
