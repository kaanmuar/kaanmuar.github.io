'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const gap = require('../../functions/url-review-content-gap');
const { english } = require('../../functions/url-review-findings-en');

const SITE = 'https://shop.example';

function page(path, html, depth, extra) {
	return Object.assign(
		{
			url: SITE + path,
			path,
			status: 200,
			depth: depth != null ? depth : 0,
			inspect: {
				title: (html.match(/<title>([^<]*)<\/title>/i) || [])[1] || '',
				h1: (html.match(/<h1[^>]*>([^<]*)<\/h1>/i) || [])[1] ? [(html.match(/<h1[^>]*>([^<]*)<\/h1>/i) || [])[1]] : [],
				words: (html.replace(/<[^>]+>/g, ' ').match(/\S+/g) || []).length,
				links: (html.match(/href="([^"]+)"/g) || []).map((bit) => bit.slice(6, -1)),
			},
		},
		extra || {}
	);
}

const HOME = page(
	'/',
	'<html><head><title>Shop home</title></head><body><h1>Shop</h1>' +
		'<a href="https://shop.example/about">About</a><a href="https://shop.example/thin-h1">Thin</a>' +
		'<a href="https://shop.example/orphan">Orphan</a>' +
		'<a href="https://shop.example/dup-b">Dup B</a>' +
		' ' +
		Array(200).fill('word').join(' ') +
		'</body></html>',
	0
);

test('contentGapMatrix marks duplicate and near-duplicate titles for merge, with the shallowest page as keep', () => {
	const shared = 'Alpha Bravo Charlie Delta Echo Foxtrot';
	const dupA = page(
		'/dup-a',
		'<html><head><title>' + shared + '</title></head><body><h1>A</h1> ' + Array(200).fill('x').join(' ') + '</body></html>',
		1
	);
	const dupB = page(
		'/dup-b',
		'<html><head><title>' + shared + '</title></head><body><h1>B</h1> ' + Array(200).fill('x').join(' ') + '</body></html>',
		2
	);
	const nearTitle = shared + ' Golf';
	const near = page(
		'/dup-near',
		'<html><head><title>' + nearTitle + '</title></head><body><h1>N</h1> ' + Array(200).fill('x').join(' ') + '</body></html>',
		2
	);
	assert.ok(gap.titleNear(gap.normTitle(shared), gap.normTitle(nearTitle)));
	const matrix = gap.contentGapMatrix([HOME, dupA, dupB, near]);
	const byPath = new Map(matrix.rows.map((row) => [row.path, row]));
	assert.equal(byPath.get('/dup-a').action, 'keep');
	assert.equal(byPath.get('/dup-b').action, 'merge');
	assert.match(byPath.get('/dup-b').reason, /Duplicate title/);
	assert.equal(byPath.get('/dup-near').action, 'merge');
	assert.match(byPath.get('/dup-near').reason, /Near-duplicate title/);
	assert.ok(matrix.summary.merge >= 2);
});

test('contentGapMatrix redirects thin orphans and flags thin or headless pages to write manually', () => {
	const orphan = page(
		'/orphan',
		'<html><head><title>Orphan</title></head><body><h1>Orphan</h1> thin thin</body></html>',
		2
	);
	const thin = page(
		'/thin-h1',
		'<html><head><title>Thin</title></head><body>no heading here ' + Array(200).fill('w').join(' ') + '</body></html>',
		1,
		{ inspect: { title: 'Thin', h1: [], words: 200, links: [] } }
	);
	// Linked from / and /about so it is not an orphan
	thin.inspect.links = [];
	const about = page(
		'/about',
		'<html><head><title>About</title></head><body><h1>About</h1><a href="https://shop.example/thin-h1">Thin</a> ' +
			Array(200).fill('w').join(' ') +
			'</body></html>',
		1
	);
	const matrix = gap.contentGapMatrix([HOME, about, orphan, thin]);
	const byPath = new Map(matrix.rows.map((row) => [row.path, row]));
	assert.equal(byPath.get('/orphan').action, 'redirect');
	assert.match(byPath.get('/orphan').reason, /Orphan/);
	assert.equal(byPath.get('/thin-h1').action, 'write-manually');
	assert.match(byPath.get('/thin-h1').reason, /no H1/);
	assert.equal(byPath.get('/').action, 'keep');
});

test('contentGapMatrix respects indexablePaths when passed in opts', () => {
	const noindex = page(
		'/ghost',
		'<html><head><title>X</title></head><body></body></html>',
		1,
		{ inspect: { title: 'X', h1: [], words: 0, links: [] } }
	);
	const matrix = gap.contentGapMatrix([HOME, noindex], { indexablePaths: new Set(['/']) });
	assert.equal(matrix.summary.pages, 1);
	assert.deepEqual(matrix.rows.map((row) => row.path), ['/']);
});

test('findings emits seo-content-gap info finding with actionable rows', () => {
	const orphan = page(
		'/orphan',
		'<html><head><title>Orphan</title></head><body><h1>O</h1> a b c</body></html>',
		2
	);
	const rows = [];
	const add = (area, verdict, severity, key, title, evidence, fix, meta) =>
		rows.push({
			area,
			verdict,
			severity,
			key,
			title: english(title),
			evidence: english(evidence),
			fix: fix ? english(fix) : '',
			meta,
		});
	const matrix = gap.findings([HOME, orphan], add);
	assert.ok(matrix);
	assert.equal(rows.length, 1);
	assert.equal(rows[0].key, 'seo-content-gap');
	assert.equal(rows[0].verdict, 'pass');
	assert.equal(rows[0].severity, 'info');
	assert.match(rows[0].title, /redirect/);
	assert.match(rows[0].evidence, /\/orphan: redirect/);
	assert.ok(rows[0].meta.pages.includes('/orphan'));
});

test('findings pass row when every page is keep', () => {
	const good = page(
		'/about',
		'<html><head><title>About</title></head><body><h1>About</h1> ' + Array(200).fill('w').join(' ') + '</body></html>',
		1
	);
	const rows = [];
	gap.findings([HOME, good], (area, verdict, severity, key, title, evidence) =>
		rows.push({ key, title: english(title), evidence: english(evidence), verdict, severity })
	);
	assert.equal(rows[0].key, 'seo-content-gap');
	assert.match(rows[0].title, /no merge, redirect or rewrite/);
	assert.match(rows[0].evidence, /all are keep/);
});