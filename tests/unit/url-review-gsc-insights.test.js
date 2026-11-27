'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const core = require('../../functions/url-review-core');
const insights = require('../../functions/url-review-insights');

const ORIGIN = 'https://shop.example/';

function page(path, opts) {
	const url = ORIGIN.replace(/\/$/, '') + path;
	const html =
		opts && opts.html != null
			? opts.html
			: '<!doctype html><html lang="en"><head><title>Shop</title><link rel="canonical" href="' +
				url +
				'"></head><body><main><h1>Shop</h1></main></body></html>';
	return {
		url,
		path,
		status: 200,
		depth: 0,
		inspect: core.analyzeHtml(html, { 'content-type': 'text/html' }, url),
	};
}

const GSC_FIXTURE = {
	ok: true,
	current: [
		{ page: '/', clicks: 5, impressions: 120, position: 14 },
		{ page: '/pricing', clicks: 40, impressions: 200, position: 6 },
	],
	prior: [
		{ page: '/', clicks: 50, impressions: 120, position: 5 },
		{ page: '/pricing', clicks: 42, impressions: 200, position: 6 },
	],
	queryPages: [
		{ query: 'widgets', page: '/', clicks: 12, impressions: 90, position: 4 },
		{ query: 'widgets', page: '/blog/widgets', clicks: 3, impressions: 80, position: 9 },
	],
};

test('insights skips GSC findings when extras.gsc is absent (#4375)', () => {
	const report = insights.analyze({ pages: [page('/')], robotsText: '' });
	assert.ok(!report.findings.some((row) => /^seo-gsc-/.test(row.key)));
});

test('insights emits decay and cannibal findings from fixture rows (#4375)', () => {
	const report = insights.analyze({
		pages: [page('/'), page('/pricing')],
		robotsText: '',
		extras: { gsc: GSC_FIXTURE },
	});
	const keys = report.findings.filter((row) => /^seo-gsc-/.test(row.key)).map((row) => row.key);
	assert.deepEqual(keys, ['seo-gsc-decay', 'seo-gsc-cannibal']);
	assert.equal(report.findings.find((row) => row.key === 'seo-gsc-decay').verdict, 'fail');
});

test('insights limits decay to indexable crawled paths when reviewedPaths omitted (#4375)', () => {
	const report = insights.analyze({
		pages: [page('/')],
		robotsText: '',
		extras: { gsc: GSC_FIXTURE },
	});
	const decay = report.findings.find((row) => row.key === 'seo-gsc-decay');
	assert.equal(decay.verdict, 'fail');
	assert.match(decay.evidence, /\/:/);
	assert.doesNotMatch(decay.evidence, /\/pricing/);
});

test('insights accepts customer GSC rows on input.gsc (#4375)', () => {
	const report = insights.analyze({
		pages: [page('/'), page('/pricing')],
		robotsText: '',
		gsc: {
			ok: true,
			current: [{ page: '/pricing', clicks: 42, impressions: 200, position: 6 }],
			prior: [{ page: '/pricing', clicks: 44, impressions: 200, position: 6 }],
		},
	});
	const decay = report.findings.find((row) => row.key === 'seo-gsc-decay');
	assert.equal(decay.verdict, 'pass');
});