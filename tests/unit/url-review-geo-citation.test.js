'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const geo = require('../../functions/url-review-geo-citation');
const { english } = require('../../functions/url-review-findings-en');

function collectFinding(input) {
	const rows = [];
	geo.findings(input, (area, verdict, severity, key, title, evidence, fix, meta) =>
		rows.push({
			area,
			verdict,
			severity,
			key,
			title: english(title),
			evidence: english(evidence),
			fix: fix ? english(fix) : '',
			meta,
		})
	);
	return rows;
}

test('normalizeCitationItem accepts Vertex web chunks and dedupes on registrable host', () => {
	const row = geo.normalizeCitationItem({
		uri: 'https://www.shop.example.com/page/',
		title: 'Shop',
	});
	assert.equal(row.host, 'example.com');
	assert.equal(row.key, 'example.com');
	assert.equal(row.url, 'https://www.shop.example.com/page');
	assert.equal(row.title, 'Shop');
	assert.equal(
		geo.normalizeCitationItem('competitor.io/guide').url,
		geo.normalizeCitationItem({ url: 'https://competitor.io/guide' }).url
	);
	assert.equal(geo.normalizeCitationItem('not a url'), null);
});

test('aiCitationDiff counts added, removed and unchanged hosts', () => {
	const baseline = [{ uri: 'https://a.test/' }, { uri: 'https://b.test/' }];
	const current = [{ uri: 'https://b.test/news' }, { uri: 'https://c.test/' }];
	const diff = geo.aiCitationDiff(baseline, current);
	assert.deepEqual(
		diff.added.map((row) => row.host),
		['c.test']
	);
	assert.deepEqual(
		diff.removed.map((row) => row.host),
		['a.test']
	);
	assert.equal(diff.unchangedCount, 1);
});

test('scoreShareOfVoice reports brand share and citesBrand mirrors cited', () => {
	const items = [{ uri: 'https://brand.example/' }, { uri: 'https://rival.test/' }, { uri: 'https://other.test/' }];
	const voice = geo.scoreShareOfVoice(items, 'www.brand.example');
	assert.equal(voice.total, 3);
	assert.equal(voice.brandCount, 1);
	assert.equal(voice.share, 33.3);
	assert.equal(voice.cited, true);
	assert.equal(geo.citesBrand(items, 'brand.example'), true);
	assert.equal(geo.scoreShareOfVoice(items, 'missing.example').cited, false);
});

test('findings emits geo-citation-miss tip when the brand is absent', () => {
	const rows = collectFinding({
		brandHost: 'acme.test',
		topic: 'project management software',
		citations: [{ uri: 'https://rival.test/' }, { uri: 'https://other.test/guide' }],
	});
	assert.equal(rows.length, 1);
	assert.equal(rows[0].key, 'geo-citation-miss');
	assert.equal(rows[0].area, 'GEO');
	assert.equal(rows[0].severity, 'low');
	assert.match(rows[0].title, /does not cite acme\.test/);
	assert.match(rows[0].evidence, /rival\.test/);
	assert.match(rows[0].fix, /llms\.txt/);
});

test('findings passes when the brand is cited', () => {
	const rows = collectFinding({
		brandHost: 'acme.test',
		citations: [{ uri: 'https://acme.test/' }, { uri: 'https://rival.test/' }],
	});
	assert.equal(rows.length, 1);
	assert.equal(rows[0].key, 'geo-citation');
	assert.equal(rows[0].verdict, 'pass');
	assert.match(rows[0].evidence, /50% of the grounded sources were acme\.test/);
});

test('groundedCitationCheck uses injected generate and never calls the network', async () => {
	let called = 0;
	const result = await geo.groundedCitationCheck(
		{ brandHost: 'acme.test', topic: 'widgets' },
		{
			fetch: () => Promise.reject(new Error('network')),
			generate: async () => {
				called += 1;
				return {
					candidates: [
						{
							groundingMetadata: {
								groundingChunks: [{ web: { uri: 'https://acme.test/', title: 'Acme' } }],
							},
						},
					],
				};
			},
		}
	);
	assert.equal(called, 1);
	assert.equal(result.ok, true);
	assert.deepEqual(result.citations.map((row) => row.host), ['acme.test']);
	assert.match(result.prompt, /widgets/);
});

test('groundedCitationCheck returns not configured without fetch', async () => {
	const result = await geo.groundedCitationCheck({ brandHost: 'acme.test' }, {});
	assert.equal(result.ok, false);
	assert.match(result.error, /fetch not configured/);
});