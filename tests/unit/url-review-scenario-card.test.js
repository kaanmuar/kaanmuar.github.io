const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../../functions/url-review-scenario-card');

test('scenarioCardDataUrl is a deterministic SVG data URL from review text', () => {
	const a = C.scenarioCardDataUrl({
		host: 'example.com',
		title: '3 internal links lead to an error',
		evidence: '/pricing answered 404.',
		consequence: 'Crawlers hit dead ends.',
		cta: 'Fix or redirect each path',
	});
	const b = C.scenarioCardDataUrl({
		host: 'example.com',
		title: '3 internal links lead to an error',
		evidence: '/pricing answered 404.',
		consequence: 'Crawlers hit dead ends.',
		cta: 'Fix or redirect each path',
	});
	assert.equal(a, b);
	assert.match(a, /^data:image\/svg\+xml;charset=utf-8,%3Csvg/);
	assert.doesNotMatch(a, /lawsuit|sue|embarrass/i);
	const decoded = decodeURIComponent(a.replace(/^data:image\/svg\+xml;charset=utf-8,/, ''));
	assert.match(decoded, /example\.com/);
	assert.match(decoded, /OPERATIONAL IMPACT/);
	assert.match(decoded, /Fix or redirect/);
});