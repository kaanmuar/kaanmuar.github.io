'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const gsc = require('../../functions/url-review-gsc-outcomes');
const { english } = require('../../functions/url-review-findings-en');

const collect = () => {
	const rows = [];
	const add = (area, verdict, severity, key, title, evidence, fix) =>
		rows.push({
			area,
			verdict,
			severity,
			key,
			title: english(title),
			evidence: english(evidence),
			fix: fix ? english(fix) : '',
		});
	return { rows, add };
};

test('pageKey normalizes URLs and paths', () => {
	assert.equal(gsc.pageKey('https://ex.test/blog/post.html'), '/blog/post');
	assert.equal(gsc.pageKey('/pricing/'), '/pricing');
	assert.equal(gsc.pageKey('pricing'), '/pricing');
});

test('gscDecayFindings flags click drops and position slips', () => {
	const decay = gsc.gscDecayFindings({
		current: [
			{ page: '/a', clicks: 10, impressions: 200, position: 12 },
			{ page: '/b', clicks: 50, impressions: 300, position: 5 },
		],
		prior: [
			{ page: '/a', clicks: 40, impressions: 200, position: 6 },
			{ page: '/b', clicks: 55, impressions: 300, position: 5 },
		],
		minImpressions: 50,
	});
	assert.equal(decay.length, 1);
	assert.equal(decay[0].path, '/a');
	assert.ok(decay[0].reasons.some((r) => r.kind === 'clicks'));
	assert.ok(decay[0].reasons.some((r) => r.kind === 'position'));
});

test('gscDecayFindings respects reviewed path filter', () => {
	const decay = gsc.gscDecayFindings({
		pages: ['/keep'],
		current: [{ page: '/other', clicks: 1, impressions: 100, position: 20 }],
		prior: [{ page: '/other', clicks: 80, impressions: 100, position: 4 }],
	});
	assert.equal(decay.length, 0);
});

test('cannibalizationFindings groups competing pages per query', () => {
	const rows = gsc.cannibalizationFindings(
		[
			{ query: 'best crm', page: '/crm', clicks: 20, impressions: 200, position: 4 },
			{ query: 'Best CRM', page: '/blog/crm-guide', clicks: 5, impressions: 180, position: 9 },
			{ query: 'solo query', page: '/only', clicks: 10, impressions: 100, position: 3 },
		],
		{ minImpressions: 50 }
	);
	assert.equal(rows.length, 1);
	assert.equal(rows[0].query, 'best crm');
	assert.equal(rows[0].owner, '/crm');
	assert.deepEqual(rows[0].rivals, ['/blog/crm-guide']);
	assert.equal(rows[0].action, 'merge');
});

test('findings emits decay and cannibal SEO tips', () => {
	const box = collect();
	const summary = gsc.findings(
		{
			ok: true,
			current: [{ page: '/a', clicks: 5, impressions: 100, position: 15 }],
			prior: [{ page: '/a', clicks: 40, impressions: 100, position: 5 }],
			queryPages: [
				{ query: 'widgets', page: '/w1', clicks: 10, impressions: 80, position: 3 },
				{ query: 'widgets', page: '/w2', clicks: 4, impressions: 70, position: 8 },
			],
		},
		box.add
	);
	assert.equal(summary.decay, 1);
	assert.equal(summary.cannibalization, 1);
	assert.equal(box.rows.length, 2);
	assert.equal(box.rows[0].key, 'seo-gsc-decay');
	assert.equal(box.rows[0].area, 'SEO');
	assert.match(box.rows[0].title, /losing Search Console/);
	assert.equal(box.rows[1].key, 'seo-gsc-cannibal');
	assert.match(box.rows[1].title, /competing pages/);
});

test('findings pass when prior/current present but stable', () => {
	const box = collect();
	gsc.findings(
		{
			ok: true,
			current: [{ page: '/stable', clicks: 40, impressions: 100, position: 5 }],
			prior: [{ page: '/stable', clicks: 42, impressions: 100, position: 5 }],
		},
		box.add
	);
	assert.equal(box.rows.length, 1);
	assert.equal(box.rows[0].verdict, 'pass');
	assert.equal(box.rows[0].key, 'seo-gsc-decay');
});
