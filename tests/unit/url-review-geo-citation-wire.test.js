'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const geo = require('../../functions/url-review-geo-citation');
const insights = require('../../functions/url-review-insights');

const HOME = {
	url: 'https://acme.test/',
	inspect: {
		title: 'Acme project management',
		description: 'Widgets and project tools for teams',
		h1: 'Acme',
		links: [],
		schema: { items: [] },
		social: {},
		bytes: 1200,
		scripts: 0,
		styles: 1,
	},
};

function groundedGenerate(chunks) {
	return async () => ({
		via: 'vertex',
		data: {
			candidates: [
				{
					groundingMetadata: {
						groundingChunks: chunks.map((web) => ({ web })),
					},
				},
			],
		},
	});
}

test('geoCitationExtra skips soft preview, passive, and missing Gemini without network', async () => {
	const base = {
		url: HOME.url,
		inspect: HOME.inspect,
		fetch: () => Promise.reject(new Error('network')),
	};
	assert.equal((await geo.geoCitationExtra(Object.assign({ softPreview: true }, base))).skipped, 'soft-preview');
	assert.equal((await geo.geoCitationExtra(Object.assign({ passive: true }, base))).skipped, 'passive');
	assert.equal((await geo.geoCitationExtra(Object.assign({ geminiReady: false }, base))).skipped, 'no-gemini');
});

test('geoCitationExtra stores trimmed citations via injected generate', async () => {
	const extra = await geo.geoCitationExtra({
		url: HOME.url,
		inspect: HOME.inspect,
		geminiReady: true,
		fetch: () => Promise.reject(new Error('network')),
		generate: groundedGenerate([
			{ uri: 'https://acme.test/', title: 'Acme' },
			{ uri: 'https://rival.test/', title: 'Rival' },
		]),
	});
	assert.equal(extra.ok, true);
	assert.equal(extra.via, 'vertex');
	assert.equal(extra.cited, true);
	assert.equal(extra.citations.length, 2);
	assert.equal(extra.raw, undefined);
	assert.ok(!('raw' in extra));
});

test('insights emits geo-citation pass with GEO-10 when extras bundle cites the brand', () => {
	const out = insights.analyze({
		pages: [HOME],
		extras: {
			geoCitation: {
				ok: true,
				brandHost: 'acme.test',
				topic: 'project management software',
				citations: [
					{ host: 'acme.test', url: 'https://acme.test/', title: 'Acme' },
					{ host: 'rival.test', url: 'https://rival.test/', title: 'Rival' },
				],
			},
		},
	});
	const row = out.findings.find((f) => f.key === 'geo-citation');
	assert.ok(row);
	assert.deepEqual(row.cases, ['GEO-10']);
	assert.match(row.title, /cites acme\.test/);
});

test('insights stays silent when geoCitation failed or has no chunks', () => {
	const missChunks = insights.analyze({
		pages: [HOME],
		extras: { geoCitation: { ok: false, error: 'timeout', citations: [] } },
	}).findings;
	assert.equal(missChunks.some((f) => f.key === 'geo-citation-miss'), false);
	const empty = insights.analyze({
		pages: [HOME],
		extras: { geoCitation: { ok: true, citations: [], brandHost: 'acme.test' } },
	}).findings;
	assert.equal(empty.some((f) => /^geo-citation/.test(f.key)), false);
});