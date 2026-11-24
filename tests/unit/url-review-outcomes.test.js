'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const outcomes = require('../../functions/url-review-outcomes');
const scenarios = require('../../functions/url-review-scenarios');
const insights = require('../../functions/url-review-insights');
const core = require('../../functions/url-review-core');

const PAGE_URL = 'https://shop.example.com/';

function sampleFindings() {
	return [
		{ key: 'pf-lcp', area: 'Performance', verdict: 'fail', severity: 'medium' },
		{ key: 'seo-broken-links', area: 'SEO', verdict: 'risk', severity: 'low' },
		{ key: 'geo-llms', area: 'GEO', verdict: 'fail', severity: 'medium' },
		{ key: 'a11y-labels', area: 'Accessibility', verdict: 'risk', severity: 'low' },
		{ key: 'sec-csp', area: 'Security', verdict: 'fail', severity: 'high' },
		{ key: 'an-consent', area: 'Analytics', verdict: 'risk', severity: 'medium' },
		{ key: 'seo-title', area: 'SEO', verdict: 'pass', severity: 'info' },
	];
}

test('OUTCOMES reference only known scenario ids', () => {
	const known = new Set(scenarios.SCENARIOS.map((row) => row.scenarioId));
	for (const pack of outcomes.OUTCOMES) {
		for (const scenarioId of pack.scenarioIds) {
			assert.ok(known.has(scenarioId), pack.outcomeId + ' → ' + scenarioId);
		}
		assert.ok(pack.primaryCta.actionType === 'fix_package' || pack.primaryCta.actionType === 'trial');
		assert.ok(pack.primaryCta.targetSlug);
	}
	assert.equal(outcomes.OUTCOMES.length, 4);
});

test('outcomeForScenario maps curated scenarios to packs', () => {
	assert.equal(outcomes.outcomeForScenario('cold-pf-lcp').outcomeId, 'commerce');
	assert.equal(outcomes.outcomeForScenario('warm-geo-entity').outcomeId, 'marketing');
	assert.equal(outcomes.outcomeForScenario('cold-a11y-alt').outcomeId, 'engagement');
	assert.equal(outcomes.outcomeForScenario('warm-an-privacy').outcomeId, 'security');
	assert.equal(outcomes.outcomeForScenario('unknown'), null);
});

test('outcomesForFindings returns packs with open area findings or matching scenario keys', () => {
	const matched = outcomes.outcomesForFindings(sampleFindings());
	assert.deepEqual(
		matched.map((row) => row.outcomeId).sort(),
		['commerce', 'engagement', 'marketing', 'security']
	);
	const clean = outcomes.outcomesForFindings([{ key: 'seo-title', area: 'SEO', verdict: 'pass', severity: 'info' }]);
	assert.equal(clean.length, 0);
	const byKey = outcomes.outcomesForFindings([{ key: 'geo-llms', area: 'GEO', verdict: 'pass', severity: 'info' }]);
	assert.deepEqual(byKey.map((row) => row.outcomeId), ['marketing']);
});

test('build returns serializable rows with area verdict counts', () => {
	const findings = sampleFindings();
	const built = outcomes.build({ findings, score: { overall: 72 } });
	assert.equal(built.length, 4);
	const commerce = built.find((row) => row.outcomeId === 'commerce');
	assert.deepEqual([commerce.open, commerce.fail, commerce.risk, commerce.pass], [2, 1, 1, 1]);
	assert.equal(commerce.primaryCta.targetSlug, 'performance');
	assert.equal(typeof commerce.label, 'string');
	assert.ok(JSON.stringify(built));
	const marketing = built.find((row) => row.outcomeId === 'marketing');
	assert.deepEqual([marketing.open, marketing.fail, marketing.risk, marketing.pass], [2, 1, 1, 1]);
});

test('analyze attaches outcomes next to trust', () => {
	const headers = { 'content-type': 'text/html' };
	const page = {
		url: PAGE_URL,
		path: '/',
		status: 200,
		ms: 100,
		depth: 0,
		inspect: core.analyzeHtml('<html><head><title>Shop</title></head><body><h1>Shop</h1></body></html>', headers, PAGE_URL),
	};
	const report = insights.analyze({ pages: [page], robotsText: '', extras: {} });
	assert.ok(Array.isArray(report.outcomes));
	assert.equal(report.outcomes.length, 4);
	assert.ok(report.trust);
	assert.ok('open' in report.outcomes[0]);
});