const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ledger = require('../../functions/jarvis-ledger');

const DAY = 24 * 60 * 60 * 1000;
const MERGE = Date.parse('2026-11-18T00:00:00Z');
const NOW_FULL = MERGE + 40 * DAY; // 28 closed days after the merge, all closed
const iso = (ms) => new Date(ms).toISOString();

// counts: a flat rate per day over a range of day offsets from the merge (negative = before).
function flat(perDay, fromOffset, toOffset) {
	const counts = new Map();
	for (let o = fromOffset; o < toOffset; o += 1) counts.set(ledger.dayStart(MERGE + o * DAY), perDay);
	return counts;
}
const entry = (over) =>
	Object.assign({ id: 'e', title: 't', mergedAt: '2026-11-18', metric: 'review.failures', expect: 'down' }, over);

test('a metric key maps to one rollup kind; unknown keys have no spec', () => {
	assert.equal(ledger.metricSpec('review.failures').kind, 'failures');
	assert.equal(ledger.metricSpec('review.reviews').kind, 'reviews');
	assert.equal(ledger.metricSpec('review.opens').kind, 'opens');
	assert.equal(ledger.metricSpec('site.qa_review_vs_cta').kind, 'events');
	assert.equal(ledger.metricSpec('site.qa_review_vs_cta').keep({ name: 'qa_review_vs_cta' }), true);
	assert.equal(ledger.metricSpec('site.qa_review_vs_cta').keep({ name: 'other' }), false);
	assert.equal(ledger.metricSpec('nope'), null);
	assert.equal(ledger.metricSpec('site.bad name'), null);
});

test('countByDay buckets rows by UTC day, keeps only matching rows and skips bad times', () => {
	const rows = [
		{ at: iso(MERGE + 3600000) },
		{ at: iso(MERGE + 7200000) },
		{ at: iso(MERGE + DAY + 1) },
		{ at: 'not a date' },
		{ name: 'x', createdAt: iso(MERGE) },
	];
	const counts = ledger.countByDay(rows, { time: 'at', keep: () => true }, (v) => Date.parse(v));
	assert.equal(counts.get(MERGE), 2);
	assert.equal(counts.get(MERGE + DAY), 1);
	assert.equal(counts.size, 2);
});

test('a window is complete only when every day in it is closed', () => {
	const counts = flat(5, 0, 7);
	const full = ledger.windowOf(counts, MERGE, 7, NOW_FULL);
	assert.equal(full.complete, true);
	assert.equal(full.total, 35);
	assert.equal(full.mean, 5);
	const open = ledger.windowOf(counts, MERGE, 7, MERGE + 3 * DAY);
	assert.equal(open.complete, false);
});

test('too early until 7 closed days exist after the merge', () => {
	const counts = flat(10, -14, 3);
	const r = ledger.evaluate(entry({}), counts, MERGE + 3 * DAY);
	assert.equal(r.status, 'too early');
});

test('an empty baseline is too little data, not a regression against zero', () => {
	const counts = flat(10, 0, 40);
	const r = ledger.evaluate(entry({ expect: 'down' }), counts, NOW_FULL);
	assert.equal(r.status, 'too little data');
});

test('a "down" metric that falls by 10% or more is better', () => {
	const counts = flat(10, -14, 40);
	for (let o = 0; o < 40; o += 1) counts.set(ledger.dayStart(MERGE + o * DAY), 6);
	const r = ledger.evaluate(entry({ expect: 'down' }), counts, NOW_FULL);
	assert.equal(r.status, 'better');
	assert.ok(r.deltaPct <= -10);
});

test('a "down" metric that rises is worse', () => {
	const counts = flat(10, -14, 40);
	for (let o = 0; o < 40; o += 1) counts.set(ledger.dayStart(MERGE + o * DAY), 15);
	const r = ledger.evaluate(entry({ expect: 'down' }), counts, NOW_FULL);
	assert.equal(r.status, 'worse');
});

test('an "up" metric rising 10% or more is better; a change under 10% is flat', () => {
	const up = flat(10, -14, 40);
	for (let o = 0; o < 40; o += 1) up.set(ledger.dayStart(MERGE + o * DAY), 12);
	assert.equal(ledger.evaluate(entry({ expect: 'up' }), up, NOW_FULL).status, 'better');
	const flatish = flat(10, -14, 40);
	for (let o = 0; o < 40; o += 1) flatish.set(ledger.dayStart(MERGE + o * DAY), 10.5);
	assert.equal(ledger.evaluate(entry({ expect: 'up' }), flatish, NOW_FULL).status, 'flat');
});

test('a "hold" guard is worse only when the metric rises, otherwise held', () => {
	const rising = flat(10, -14, 40);
	for (let o = 0; o < 40; o += 1) rising.set(ledger.dayStart(MERGE + o * DAY), 20);
	assert.equal(ledger.evaluate(entry({ expect: 'hold' }), rising, NOW_FULL).status, 'worse');
	const steady = flat(10, -14, 40);
	assert.equal(ledger.evaluate(entry({ expect: 'hold' }), steady, NOW_FULL).status, 'held');
	const falling = flat(10, -14, 40);
	for (let o = 0; o < 40; o += 1) falling.set(ledger.dayStart(MERGE + o * DAY), 2);
	assert.equal(ledger.evaluate(entry({ expect: 'hold' }), falling, NOW_FULL).status, 'held');
});

test('too little data when the windows hold fewer than 20 events', () => {
	const counts = flat(0, -14, 40);
	counts.set(ledger.dayStart(MERGE), 3);
	const r = ledger.evaluate(entry({ expect: 'down' }), counts, NOW_FULL);
	assert.equal(r.status, 'too little data');
});

test('a 28-day window decides once it is complete, the 7-day one before', () => {
	const counts = flat(10, -14, 7);
	const r7 = ledger.evaluate(entry({ expect: 'down' }), counts, MERGE + 8 * DAY);
	assert.equal(r7.after.days, 7);
	const counts28 = flat(10, -14, 40);
	const r28 = ledger.evaluate(entry({ expect: 'down' }), counts28, NOW_FULL);
	assert.equal(r28.after.days, 28);
});

test('a change with no metric is manual and names where to look', () => {
	const r = ledger.evaluate(
		{ id: 'm', title: 'DMARC', mergedAt: '2026-11-18', metric: null, check: 'Cloudflare DMARC' },
		new Map(),
		NOW_FULL
	);
	assert.equal(r.status, 'manual');
	assert.equal(r.check, 'Cloudflare DMARC');
});

test('an unknown metric, expect or merge day is reported, not guessed', () => {
	assert.equal(ledger.evaluate(entry({ metric: 'nope' }), new Map(), NOW_FULL).status, 'unknown metric');
	assert.equal(ledger.evaluate(entry({ expect: 'sideways' }), new Map(), NOW_FULL).status, 'unknown expect');
	assert.equal(ledger.evaluate(entry({ mergedAt: 'soon' }), new Map(), NOW_FULL).status, 'bad mergedAt');
});

test('evaluateAll reads each metric by key and readFrom starts 14 days before the earliest merge', () => {
	const entries = [entry({ id: 'a', mergedAt: '2026-11-18' }), entry({ id: 'b', mergedAt: '2026-11-20' })];
	assert.equal(ledger.readFrom(entries), MERGE - 14 * DAY);
	assert.equal(ledger.readFrom([]), 0);
	const out = ledger.evaluateAll(entries, () => flat(10, -14, 40), NOW_FULL);
	assert.deepEqual(
		out.map((r) => r.id),
		['a', 'b']
	);
});

test('the shipped ledger parses and every entry evaluates to a known status', () => {
	const file = JSON.parse(fs.readFileSync(path.join(__dirname, '../../functions/change-ledger.json'), 'utf8'));
	assert.ok(Array.isArray(file.entries) && file.entries.length >= 1);
	const known = new Set(['manual', 'too early', 'too little data', 'better', 'worse', 'flat', 'held']);
	file.entries.forEach((e) => {
		const r = ledger.evaluate(e, new Map(), NOW_FULL);
		assert.ok(known.has(r.status) || r.status === 'too early', e.id + ': ' + r.status);
	});
});

test('run reads the day rollups once and returns results with a timestamp', async () => {
	const calls = [];
	const dayRows = {
		toMs: (v) => Date.parse(v),
		rows: async (db, kinds, opts) => {
			calls.push({ kinds, from: opts.from });
			return { failures: [{ at: iso(MERGE + DAY) }], reviews: [], opens: [], events: [] };
		},
	};
	const out = await ledger.run(
		{},
		[entry({ metric: 'review.failures', expect: 'down', mergedAt: '2026-11-18' })],
		NOW_FULL,
		dayRows
	);
	assert.equal(calls.length, 1);
	assert.deepEqual(calls[0].kinds, ['failures']);
	assert.equal(calls[0].from, MERGE - 14 * DAY);
	assert.equal(out.at, iso(NOW_FULL));
	assert.equal(out.results.length, 1);
});
