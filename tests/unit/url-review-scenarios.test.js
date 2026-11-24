'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const scenarios = require('../../functions/url-review-scenarios');
const findingsEn = require('../../functions/url-review-findings-en');

const SEEDED_IDS = ['seo-broken-links', 'a11y-labels', 'an-consent', 'an-reject', 'sec-csp', 'geo-llms'];

test('seed rows use real finding ids from url-review-findings-en', () => {
	const keys = new Set(Object.keys(findingsEn.EN));
	for (const scenario of scenarios.SCENARIOS) {
		for (const id of scenario.findingIds) {
			const hasTitle = [...keys].some((key) => key === id + '.title' || key.startsWith(id + '.title_') || key === id + '.pass.title');
			assert.ok(hasTitle, id);
		}
	}
	assert.equal(scenarios.SCENARIOS.length, 5);
	for (const id of ['seo-broken-links', 'a11y-labels', 'sec-csp', 'geo-llms']) {
		assert.ok(scenarios.scenarioForFinding(id), id);
	}
	assert.ok(scenarios.scenarioForFinding('an-consent'));
	assert.equal(scenarios.scenarioForFinding('an-reject').scenarioId, 'warm-an-consent');
});

test('cold_safe copy never uses forbidden legal-threat language', () => {
	for (const row of scenarios.SCENARIOS.filter((item) => item.tier === 'cold_safe')) {
		const blob = [row.consequence, ...Object.values(row.copyHooks)].join(' ');
		assert.ok(!scenarios.FORBIDDEN_COLD.test(blob), row.scenarioId);
	}
});

test('scenarioForFinding returns the most specific row or null', () => {
	assert.equal(scenarios.scenarioForFinding('unknown-key'), null);
	assert.equal(scenarios.scenarioForFinding('seo-broken-links').scenarioId, 'cold-seo-broken-links');
	assert.equal(scenarios.scenarioForFinding('an-reject').tier, 'warm_only');
});

test('scenariosForOffer accepts string ids, filters channel and confidence', () => {
	const email = scenarios.scenariosForOffer(['seo-broken-links', 'sec-csp'], { channel: 'email' });
	assert.deepEqual(
		email.map((row) => row.scenarioId),
		['cold-seo-broken-links', 'warm-sec-csp']
	);
	const linkedinOnly = scenarios.scenariosForOffer([{ id: 'geo-llms', confidence: 0.9 }], { channel: 'email' });
	assert.equal(linkedinOnly.length, 0);
	assert.equal(
		scenarios.scenariosForOffer([{ id: 'geo-llms', confidence: 0.9 }], { channel: 'linkedin' }).length,
		1
	);
	assert.equal(
		scenarios.scenariosForOffer([{ id: 'a11y-labels', confidence: 0.2 }], { channel: 'email' }).length,
		0
	);
	assert.equal(
		scenarios.scenariosForOffer([{ id: 'a11y-labels', confidence: 0.6 }], { channel: 'email' }).length,
		1
	);
});

test('maxConfidenceMissing drops findings without confidence', () => {
	const withDefault = scenarios.scenariosForOffer([{ id: 'seo-broken-links' }], { channel: 'email' });
	assert.equal(withDefault.length, 1);
	const strict = scenarios.scenariosForOffer([{ id: 'seo-broken-links' }], {
		channel: 'email',
		maxConfidenceMissing: true,
	});
	assert.equal(strict.length, 0);
	const strictOk = scenarios.scenariosForOffer([{ id: 'seo-broken-links', confidence: 0.8 }], {
		channel: 'email',
		maxConfidenceMissing: true,
	});
	assert.equal(strictOk.length, 1);
});

test('pickColdScenario returns the first cold_safe email scenario', () => {
	const picked = scenarios.pickColdScenario(['seo-broken-links', 'sec-csp', 'a11y-labels']);
	assert.equal(picked.scenarioId, 'cold-seo-broken-links');
	assert.equal(picked.mediaKind, 'evidence_card');
	assert.equal(scenarios.pickColdScenario(['sec-csp']), null);
});

test('scenariosForOffer accepts review insight `key` the same as `id`', () => {
	const fromKey = scenarios.pickColdScenario([
		{ key: 'a11y-labels', confidence: 0.9, verdict: 'fail' },
	]);
	assert.equal(fromKey.scenarioId, 'cold-a11y-labels');
});

test('each scenario exposes the schema fields outreach expects', () => {
	const tiers = new Set(['cold_safe', 'warm_only', 'social_generic']);
	const media = new Set(['evidence_card', 'skit', 'static_post']);
	const channels = new Set(['email', 'linkedin', 'landing', 'leave_behind']);
	for (const row of scenarios.SCENARIOS) {
		assert.ok(tiers.has(row.tier), row.scenarioId);
		assert.ok(media.has(row.mediaKind), row.scenarioId);
		assert.ok(row.findingIds.length >= 1);
		assert.ok(typeof row.consequence === 'string' && row.consequence.length > 20);
		assert.ok(row.channelAllow.every((ch) => channels.has(ch)), row.scenarioId);
		assert.ok(row.copyHooks.subjectHint && row.copyHooks.bodyLine && row.copyHooks.cta);
		assert.ok(row.confidenceMin > 0 && row.confidenceMin <= 1);
	}
	assert.deepEqual(
		scenarios.SCENARIOS.map((row) => row.scenarioId).sort(),
		[
			'cold-a11y-labels',
			'cold-seo-broken-links',
			'social-geo-llms',
			'warm-an-consent',
			'warm-sec-csp',
		]
	);
	for (const id of SEEDED_IDS) {
		assert.ok(scenarios.scenarioForFinding(id), id);
	}
});