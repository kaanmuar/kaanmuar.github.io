const test = require('node:test');
const assert = require('node:assert/strict');
const indexnow = require('../../functions/url-review-indexnow-customer');

const ORIGIN = 'https://shop.example.com';
const KEY = 'abc123def456';
const INDEXNOW = 'https://api.indexnow.org/indexnow';

const reply = (body, status = 200, extras) =>
	Object.assign(
		{
			ok: status >= 200 && status < 300,
			status,
			text: async () => (typeof body === 'string' ? body : ''),
			json: async () => body,
		},
		extras || {}
	);

const okPage = (url, robots) => ({
	url,
	status: 200,
	inspect: { seo: robots ? { robots } : {} },
});

test('filterIndexableUrls keeps 2xx non-noindex pages and skips 4xx and noindex', () => {
	const pages = [
		okPage('https://shop.example.com/'),
		okPage('https://shop.example.com/private', 'noindex, nofollow'),
		{ url: 'https://shop.example.com/missing', status: 404 },
		{ url: 'https://shop.example.com/error', status: 500 },
		okPage('https://shop.example.com/deals'),
	];
	const out = indexnow.filterIndexableUrls(pages);
	assert.deepEqual(out.urls, ['https://shop.example.com/', 'https://shop.example.com/deals']);
	assert.equal(out.skipped.length, 3);
	assert.equal(out.skipped.find((s) => s.reason === 'noindex').url, 'https://shop.example.com/private');
	assert.equal(out.skipped.find((s) => s.reason === '4xx').url, 'https://shop.example.com/missing');
	assert.equal(out.skipped.find((s) => s.reason === '5xx').url, 'https://shop.example.com/error');
});

test('verifyIndexNowKey fetches the key file and matches the body', async () => {
	const calls = [];
	const fetchFn = async (url) => {
		calls.push(url);
		return reply(KEY, 200);
	};
	const good = await indexnow.verifyIndexNowKey(fetchFn, ORIGIN, KEY);
	assert.equal(good.ok, true);
	assert.equal(good.status, 200);
	assert.equal(calls[0], ORIGIN + '/' + KEY + '.txt');
	const bad = await indexnow.verifyIndexNowKey(fetchFn, ORIGIN, 'other');
	assert.equal(bad.ok, false);
});

test('submitIndexNow posts host, key, keyLocation, and urlList', async () => {
	let posted;
	const fetchFn = async (url, init) => {
		assert.equal(url, INDEXNOW);
		posted = JSON.parse(init.body);
		return reply('', 202);
	};
	const out = await indexnow.submitIndexNow(fetchFn, {
		host: 'shop.example.com',
		key: KEY,
		origin: ORIGIN,
		urlList: ['https://shop.example.com/', 'https://shop.example.com/deals'],
	});
	assert.equal(out.ok, true);
	assert.equal(out.status, 202);
	assert.equal(out.urlList, 2);
	assert.equal(posted.host, 'shop.example.com');
	assert.equal(posted.key, KEY);
	assert.equal(posted.keyLocation, ORIGIN + '/' + KEY + '.txt');
	assert.deepEqual(posted.urlList, ['https://shop.example.com/', 'https://shop.example.com/deals']);
});

test('runCustomerIndexNow is off unless URL_REVIEW_INDEXNOW=1 or enabled', async () => {
	const disabled = await indexnow.runCustomerIndexNow({ fetch: async () => reply('') });
	assert.equal(disabled.enabled, false);
	assert.equal(disabled.reason, 'disabled');
	const enabled = await indexnow.runCustomerIndexNow({
		enabled: true,
		fetch: async () => reply(''),
		origin: ORIGIN,
		key: KEY,
		pages: [],
	});
	assert.equal(enabled.enabled, true);
	assert.equal(enabled.reason, 'no-indexable-urls');
});

test('runCustomerIndexNow verifies key, pings IndexNow, and records HTTP status', async () => {
	const calls = [];
	const fetchFn = async (url, init) => {
		calls.push(url);
		if (url.endsWith(KEY + '.txt')) return reply(KEY, 200);
		if (url === INDEXNOW) {
			assert.equal(init.method, 'POST');
			return reply('', 200);
		}
		throw new Error('unexpected ' + url);
	};
	const out = await indexnow.runCustomerIndexNow({
		enabled: true,
		fetch: fetchFn,
		origin: ORIGIN,
		key: KEY,
		pages: [okPage('https://shop.example.com/'), { url: 'https://shop.example.com/x', status: 404 }],
	});
	assert.equal(out.ok, true);
	assert.equal(out.indexnow, 200);
	assert.equal(out.submitted, 1);
	assert.equal(out.key.ok, true);
	assert.deepEqual(out.urls, ['https://shop.example.com/']);
	assert.equal(calls.length, 2);
});

test('runCustomerIndexNow stops when the key file does not verify', async () => {
	const out = await indexnow.runCustomerIndexNow({
		enabled: true,
		env: { URL_REVIEW_INDEXNOW: '1' },
		fetch: async () => reply('wrong-key', 200),
		origin: ORIGIN,
		key: KEY,
		pages: [okPage('https://shop.example.com/')],
	});
	assert.equal(out.reason, 'key-verification-failed');
	assert.equal(out.key.ok, false);
	assert.equal(out.indexnow, null);
});