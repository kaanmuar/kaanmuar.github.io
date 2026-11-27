'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const snap = require('../../functions/url-review-outcomes-snapshot');

const FIXTURES = path.join(__dirname, '../fixtures/outcomes-snapshot');
const ANCHOR = Date.parse('2026-11-26T12:00:00.000Z');

function load(name) {
	return JSON.parse(fs.readFileSync(path.join(FIXTURES, name), 'utf8'));
}

function memoryDb() {
	const data = { [snap.COLLECTION]: new Map() };
	const docRef = (name, id) => ({
		id,
		get: async () => ({ exists: data[name].has(id), data: () => data[name].get(id) }),
		set: async (value) => data[name].set(id, value),
		create: async (value) => {
			if (data[name].has(id)) {
				const err = new Error('exists');
				err.code = 6;
				throw err;
			}
			data[name].set(id, value);
		},
	});
	return {
		data,
		collection: (name) => ({
			doc: (id) => docRef(name, id),
		}),
	};
}

test('wireEligible is off by default (#4399)', () => {
	assert.equal(snap.wireEligible({}, {}), false);
	assert.equal(snap.wireEligible({ outcomesSnapshot: { enabled: true } }, { URL_REVIEW_OUTCOMES_SNAPSHOT: '0' }), false);
	assert.equal(snap.wireEligible({ passive: true, outcomesSnapshot: { enabled: true } }, { URL_REVIEW_OUTCOMES_SNAPSHOT: '1' }), false);
	assert.equal(snap.wireEligible({}, { URL_REVIEW_OUTCOMES_SNAPSHOT: '1' }), true);
	assert.equal(snap.wireEligible({ outcomesSnapshot: { enabled: true } }, {}), true);
});

test('gscTotals aggregates clicks and impression-weighted position', () => {
	const totals = snap.gscTotals([
		{ clicks: 100, impressions: 1000, position: 10 },
		{ clicks: 50, impressions: 500, position: 20 },
	]);
	assert.equal(totals.clicks, 150);
	assert.equal(totals.impressions, 1500);
	assert.equal(totals.position, 13.3);
	assert.equal(totals.pageCount, 2);
});

test('metricsFromReport extracts GSC GEO and scores from fixture', () => {
	const report = load('baseline-metrics.json');
	const metrics = snap.metricsFromReport(report, ANCHOR);
	assert.equal(metrics.gsc.clicks, 160);
	assert.equal(metrics.gsc.impressions, 3300);
	assert.equal(metrics.geo.share, 0);
	assert.equal(metrics.geo.cited, false);
	assert.equal(metrics.scores.overall, 62);
	assert.equal(metrics.scores.areas.SEO, 75);
});

test('baselineRecord is immutable and anchored at fix approval', () => {
	const report = load('baseline-metrics.json');
	const metrics = snap.metricsFromReport(report, ANCHOR);
	const pack = {
		id: 'pack-geo-1',
		status: 'approved',
		host: 'shop.example.com',
		reportId: 'abc123',
		findingId: 'geo-llms',
		decidedAt: '2026-11-26T12:00:00.000Z',
	};
	const row = snap.baselineRecord(pack, metrics, { anchoredAt: pack.decidedAt });
	assert.equal(row.immutable, true);
	assert.equal(row.packId, 'pack-geo-1');
	assert.equal(row.gsc.clicks, 160);
	assert.equal(row.kind, 'outcomes-baseline');
	assert.equal(row.anchoredAt, '2026-11-26T12:00:00.000Z');
});

test('deltasByWindow exposes 7d not 14d on day 10 pull', () => {
	const report = load('baseline-metrics.json');
	const later = load('pull-day-10.json');
	const baseline = snap.baselineRecord(
		{ id: 'p1', decidedAt: '2026-11-26T12:00:00.000Z' },
		snap.metricsFromReport(report, ANCHOR)
	);
	const pull = snap.metricsFromReport(later, Date.parse('2026-12-06T12:00:00.000Z'));
	const windows = snap.deltasByWindow(baseline, pull);
	assert.ok(windows[7]);
	assert.equal(windows[7].daysSinceFix, 10);
	assert.equal(windows[7].gsc.clicks.delta, 45);
	assert.ok(Math.abs(windows[7].gsc.position.delta - -1.2) < 0.01);
	assert.equal(windows[7].geo.share.delta, 50);
	assert.equal(windows[7].geo.cited.improved, true);
	assert.equal(windows[14], undefined);
});

test('badgeForWindow surfaces desk-friendly tone', () => {
	const report = load('baseline-metrics.json');
	const later = load('pull-day-10.json');
	const baseline = snap.baselineRecord(
		{ id: 'p1', decidedAt: '2026-11-26T12:00:00.000Z' },
		snap.metricsFromReport(report, ANCHOR)
	);
	const pull = snap.metricsFromReport(later, Date.parse('2026-12-06T12:00:00.000Z'));
	const badge = snap.badgeForWindow(snap.deltasByWindow(baseline, pull)[7]);
	assert.equal(badge.key, 'outcomes-7d');
	assert.equal(badge.tone, 'good');
	assert.match(badge.detail, /GSC clicks \+45/);
	assert.match(badge.detail, /now cited/);
});

test('saveBaseline is idempotent per pack id', async () => {
	const db = memoryDb();
	const record = snap.baselineRecord(
		{ id: 'pack-a', decidedAt: '2026-11-26T12:00:00.000Z', status: 'approved' },
		snap.metricsFromReport(load('baseline-metrics.json'), ANCHOR)
	);
	const first = await snap.saveBaseline(db, record);
	assert.equal(first.ok, true);
	assert.equal(first.id, 'pack-a');
	const second = await snap.saveBaseline(db, record);
	assert.equal(second.reason, 'duplicate');
});

test('captureOnPackApproved gates on env opt-in', async () => {
	const db = memoryDb();
	const pack = {
		id: 'pack-b',
		status: 'approved',
		host: 'shop.example.com',
		decidedAt: '2026-11-26T12:00:00.000Z',
	};
	assert.equal(await snap.captureOnPackApproved(db, pack, {}), null);
	const out = await snap.captureOnPackApproved(db, pack, {
		env: { URL_REVIEW_OUTCOMES_SNAPSHOT: '1' },
		report: load('baseline-metrics.json'),
	});
	assert.equal(out.ok, true);
	assert.equal(db.data[snap.COLLECTION].get('pack-b').gsc.clicks, 160);
});