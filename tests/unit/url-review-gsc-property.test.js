'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const gscProp = require('../../functions/url-review-gsc-property');

test('normalizeGscProperty accepts domain properties', () => {
	assert.deepEqual(gscProp.normalizeGscProperty('sc-domain:Example.COM'), {
		kind: 'domain',
		siteUrl: 'sc-domain:example.com',
		host: 'example.com',
	});
});

test('normalizeGscProperty accepts URL-prefix properties', () => {
	const row = gscProp.normalizeGscProperty('https://www.example.com/blog');
	assert.equal(row.kind, 'url-prefix');
	assert.equal(row.siteUrl, 'https://www.example.com/blog/');
	assert.equal(row.host, 'www.example.com');
});

test('gscPropertyCandidates orders domain before origin', () => {
	const list = gscProp.gscPropertyCandidates('https://www.shop.example.com/p');
	assert.ok(list[0] === 'sc-domain:shop.example.com' || list.includes('sc-domain:shop.example.com'));
	assert.ok(list.some((s) => s === 'https://www.shop.example.com/'));
});

test('propertyCoversSite for domain includes subdomains', () => {
	assert.equal(gscProp.propertyCoversSite('sc-domain:example.com', 'https://api.example.com/x'), true);
	assert.equal(gscProp.propertyCoversSite('sc-domain:example.com', 'https://other.test/'), false);
});

test('propertyCoversSite for URL-prefix respects path', () => {
	assert.equal(
		gscProp.propertyCoversSite('https://www.example.com/blog/', 'https://www.example.com/blog/post'),
		true
	);
	assert.equal(
		gscProp.propertyCoversSite('https://www.example.com/blog/', 'https://www.example.com/about'),
		false
	);
});