const test = require('node:test');
const assert = require('node:assert/strict');
const wire = require('../../functions/url-review-indexnow-wire');
const customer = require('../../functions/url-review-indexnow-customer');

const ORIGIN = 'https://shop.example.com';
const KEY = 'abc123def456';
const INDEXNOW = 'https://api.indexnow.org/indexnow';

const reply = (body, status = 200) => ({
	ok: status >= 200 && status < 300,
	status,
	text: async () => (typeof body === 'string' ? body : ''),
});

test('wireEligible is off without URL_REVIEW_INDEXNOW and without hooks.enabled', () => {
	assert.equal(wire.wireEligible({}, {}), false);
	assert.equal(wire.wireEligible({ indexNowKey: KEY }, {}), false);
	assert.equal(wire.wireEligible({ indexNowKey: KEY }, { URL_REVIEW_INDEXNOW: '0' }), false);
	assert.equal(wire.wireEligible({ indexNowKey: KEY, softPreview: true }, { URL_REVIEW_INDEXNOW: '1' }), false);
	assert.equal(wire.wireEligible({ indexNowKey: KEY, passive: true }, { URL_REVIEW_INDEXNOW: '1' }), false);
});

test('wireEligible opens when env and customer key are set', () => {
	assert.equal(wire.wireEligible({ indexNowKey: KEY }, { URL_REVIEW_INDEXNOW: '1' }), true);
	assert.equal(
		wire.wireEligible({ indexNow: { key: KEY, enabled: true } }, {}),
		true
	);
	assert.equal(customer.ENV_KEY, 'URL_REVIEW_INDEXNOW');
});

test('attachAfterReview returns null when the gate is closed', async () => {
	const out = await wire.attachAfterReview({
		hooks: { indexNowKey: KEY },
		pages: [{ url: ORIGIN + '/', status: 200, inspect: { seo: {} } }],
		origin: ORIGIN,
		fetch: async () => reply(''),
		env: {},
	});
	assert.equal(out, null);
});

test('attachAfterReview logs and returns HTTP results when opted in', async () => {
	const lines = [];
	const fetchFn = async (url) => {
		if (url.endsWith(KEY + '.txt')) return reply(KEY, 200);
		if (url === INDEXNOW) return reply('', 202);
		throw new Error('unexpected ' + url);
	};
	const out = await wire.attachAfterReview({
		hooks: { indexNowKey: KEY },
		pages: [
			{ url: ORIGIN + '/', status: 200, inspect: { seo: {} } },
			{ url: ORIGIN + '/gone', status: 404 },
		],
		origin: ORIGIN,
		note: (text) => lines.push(text),
		fetch: fetchFn,
		env: { URL_REVIEW_INDEXNOW: '1' },
	});
	assert.equal(out.ok, true);
	assert.equal(out.indexnow, 202);
	assert.ok(lines.some((line) => /IndexNow took 1 page/.test(line)));
	assert.ok(lines.some((line) => /skipped 1 URL/.test(line)));
	assert.deepEqual(out.urls, [ORIGIN + '/']);
});

test('attachAfterReview never uses jarvis site key constants', async () => {
	let posted;
	const fetchFn = async (url, init) => {
		if (url.endsWith(KEY + '.txt')) return reply(KEY, 200);
		if (url === INDEXNOW) {
			posted = JSON.parse(init.body);
			return reply('', 200);
		}
		throw new Error('unexpected');
	};
	await wire.attachAfterReview({
		hooks: { indexNow: { key: KEY, enabled: true } },
		pages: [{ url: ORIGIN + '/', status: 200, inspect: { seo: {} } }],
		origin: ORIGIN,
		fetch: fetchFn,
		env: {},
	});
	assert.equal(posted.key, KEY);
	assert.notEqual(posted.key, 'c1ab1d693aa44efeae5463b429a4813e');
	assert.equal(posted.keyLocation, ORIGIN + '/' + KEY + '.txt');
});