'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { SKITS } = require('../../scripts/skits-studio/skits');
const { reportFor } = require('../../scripts/skits-studio/record');

test('reportFor fails seo-broken-links for friday-release and avoidable-404', () => {
	for (const id of ['friday-release', 'avoidable-404']) {
		const skit = SKITS.find((s) => s.id === id);
		const report = reportFor(skit, 'en');
		const finding = report.insights.findings.find((f) => f.key === 'seo-broken-links');
		assert.equal(finding.verdict, 'fail');
		assert.equal(finding.title, skit.lang.en.finding);
		assert.match(finding.evidence, /404/);
		assert.equal(report.findingId, finding.id);
		assert.ok(report.insights.findings.some((f) => f.key === 'seo-broken-links' && f.verdict === 'fail'));
	}
});

test('reportFor fails geo-llms for avoidable-geo', () => {
	const skit = SKITS.find((s) => s.id === 'avoidable-geo');
	const report = reportFor(skit, 'en');
	const finding = report.insights.findings.find((f) => f.key === 'geo-llms');
	assert.equal(finding.verdict, 'fail');
	assert.equal(finding.area, 'GEO');
	assert.equal(finding.title, skit.lang.en.finding);
	assert.match(finding.evidence, /llms\.txt/);
	assert.ok(report.insights.score.areas.GEO.fail >= 1);
});

test('reportFor injects a11y-labels when the fixture lacks that key', () => {
	const skit = SKITS.find((s) => s.id === 'avoidable-a11y-form');
	const report = reportFor(skit, 'es');
	const finding = report.insights.findings.find((f) => f.key === 'a11y-labels');
	assert.ok(finding);
	assert.equal(finding.verdict, 'fail');
	assert.equal(finding.area, 'Accessibility');
	assert.equal(finding.title, skit.lang.es.finding);
	assert.match(finding.evidence, /label/i);
	assert.equal(report.findingId, finding.id);
});
