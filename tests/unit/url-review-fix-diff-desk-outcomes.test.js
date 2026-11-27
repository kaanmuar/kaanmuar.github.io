'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const deskOutcomes = require('../../functions/url-review-fix-diff-desk-outcomes');
const snap = require('../../functions/url-review-outcomes-snapshot');

const FIXTURES = path.join(__dirname, '../fixtures/outcomes-snapshot');
const NOW = Date.parse('2026-11-26T12:00:00.000Z');

test('outcomesView is honest when snapshot env is off (#4455)', () => {
	const view = deskOutcomes.outcomesView({ env: {} });
	assert.equal(view.enabled, false);
	assert.equal(view.state, 'off');
	assert.doesNotMatch(view.detail, /baseline saved/i);
});

test('outcomesView reports saved baseline when capture succeeded', () => {
	const baseline = snap.baselineRecord(
		{ id: 'p1', status: 'approved', decidedAt: '2026-11-26T12:00:00.000Z' },
		snap.metricsFromReport(JSON.parse(fs.readFileSync(path.join(FIXTURES, 'baseline-metrics.json'), 'utf8')), NOW)
	);
	const view = deskOutcomes.outcomesView({
		env: { URL_REVIEW_OUTCOMES_SNAPSHOT: '1' },
		captureResult: { ok: true, id: 'p1' },
		baseline,
		packStatus: 'approved',
	});
	assert.equal(view.state, 'saved');
	assert.equal(view.tone, 'good');
	assert.match(view.detail, /clicks at anchor: 160/);
});

test('verifyView exposes report and customer recheck links', () => {
	const v = deskOutcomes.verifyView({
		id: 'pack1',
		status: 'approved',
		reportId: 'abc123',
		findingId: 'geo-llms',
	});
	assert.equal(v.canQueue, true);
	assert.equal(v.steps.length, 3);
	assert.match(v.steps[1].href, /#fix-outcomes/);
});

test('queueOperatorRereview creates fix request with queued rereview', async () => {
	const fixRereview = require('../../functions/url-review-fix-rereview');
	const report = Object.assign(JSON.parse(fs.readFileSync(path.join(FIXTURES, 'baseline-metrics.json'), 'utf8')), {
		id: 'abc123def4567890abc123def4567890',
		insights: Object.assign(
			JSON.parse(fs.readFileSync(path.join(FIXTURES, 'baseline-metrics.json'), 'utf8')).insights,
			{
				findings: [
					{
						id: 'GEO-1',
						key: 'geo-llms',
						title: 'Publish llms.txt',
						verdict: 'fail',
						severity: 'high',
						area: 'GEO',
					},
				],
			}
		),
	});
	const data = {
		url_reviews: new Map([['abc123def4567890abc123def4567890', { email: 'owner@example.com', lang: 'en', report }]]),
		[fixRereview.COLLECTION]: new Map(),
	};
	const db = {
		data,
		collection: (name) => ({
			doc: (id) => ({
				id,
				get: async () => ({ exists: data[name].has(id), data: () => data[name].get(id) }),
				create: async (row) => {
					if (data[name].has(id)) throw new Error('exists');
					data[name].set(id, row);
				},
				update: async (patch) => data[name].set(id, Object.assign({}, data[name].get(id), patch)),
			}),
		}),
	};
	const out = await deskOutcomes.queueOperatorRereview(
		db,
		{ id: 'pack-x', reportId: 'abc123def4567890abc123def4567890', findingId: 'GEO-1', status: 'approved' },
		'ops@example.com',
		{ nowMs: NOW }
	);
	assert.equal(out.ok, true);
	assert.equal(out.rereview.status, 'queued');
	const saved = data[fixRereview.COLLECTION].get('pack-pack-x');
	assert.equal(saved.fixDiffPackId, 'pack-x');
	assert.equal(saved.rereview.status, 'queued');
});

test('desk PAGE surfaces outcomes panel hooks (#4455)', () => {
	const page = fs.readFileSync(path.join(__dirname, '../../functions/url-review-desk.js'), 'utf8');
	assert.match(page, /paintFixDiffOutcomes/);
	assert.match(page, /\/desk\/fix-diff\/rereview/);
	assert.match(page, /URL_REVIEW_OUTCOMES_SNAPSHOT/);
});