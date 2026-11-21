const test = require('node:test');
const assert = require('node:assert/strict');

const load = () => import('../../workers/uptime-check/src/index.js');
const SECRET = 'https://hc.example.test/ping/uptime-secret';
const ORIGIN = 'https://carlosandmunoz.com';

const fake = (impl = async () => new Response('OK', { status: 200 })) => {
	const calls = [];
	const fetchImpl = async (url, init) => {
		calls.push({ url, init });
		return impl(url, init);
	};
	return { calls, fetchImpl };
};

test('DEFAULT_ENDPOINTS covers the Jarvis product pages', async () => {
	const { DEFAULT_ENDPOINTS, SCHEDULE } = await load();
	assert.deepEqual(DEFAULT_ENDPOINTS, [
		ORIGIN + '/',
		ORIGIN + '/simulador.html',
		ORIGIN + '/qa-lab.html',
		ORIGIN + '/qa-review.html',
		ORIGIN + '/qa-review-social.html',
	]);
	assert.equal(SCHEDULE, '*/5 * * * *');
});

test('parseEndpoints falls back on missing, empty, or invalid JSON', async () => {
	const { parseEndpoints, DEFAULT_ENDPOINTS } = await load();
	assert.deepEqual(parseEndpoints(undefined), DEFAULT_ENDPOINTS);
	assert.deepEqual(parseEndpoints(''), DEFAULT_ENDPOINTS);
	assert.deepEqual(parseEndpoints('not-json'), DEFAULT_ENDPOINTS);
	assert.deepEqual(parseEndpoints('[]'), DEFAULT_ENDPOINTS);
	assert.deepEqual(parseEndpoints('["https://a.test/"]'), ['https://a.test/']);
	assert.deepEqual(parseEndpoints([{ url: 'https://b.test/', expected: 204 }]), [{ url: 'https://b.test/', expected: 204 }]);
});

test('runCheck pings success when every endpoint returns the expected status', async () => {
	const { runCheck, DEFAULT_ENDPOINTS } = await load();
	const f = fake();
	const out = await runCheck({ HEARTBEAT_UPTIME_URL: SECRET }, { fetchImpl: f.fetchImpl });
	assert.equal(out.length, DEFAULT_ENDPOINTS.length);
	assert.ok(out.every((r) => r.ok));
	const urls = f.calls.map((c) => c.url);
	assert.deepEqual(urls.slice(0, DEFAULT_ENDPOINTS.length), DEFAULT_ENDPOINTS);
	assert.equal(urls.at(-1), SECRET);
});

test('runCheck pings /fail when an endpoint is down and rethrows', async () => {
	const { runCheck } = await load();
	const f = fake(async (url) => {
		if (String(url).includes('qa-lab')) return new Response('x', { status: 503 });
		return new Response('ok', { status: 200 });
	});
	await assert.rejects(
		runCheck({ HEARTBEAT_UPTIME_URL: SECRET }, { fetchImpl: f.fetchImpl }),
		/uptime 1\/5 down/,
	);
	assert.equal(f.calls.at(-1).url, SECRET + '/fail');
});

test('runCheck uses UPTIME_ENDPOINTS override and explicit fail URL', async () => {
	const { runCheck } = await load();
	const f = fake(async () => new Response(null, { status: 500 }));
	const env = {
		HEARTBEAT_UPTIME_URL: SECRET,
		HEARTBEAT_UPTIME_FAIL_URL: 'https://hc.example.test/other-fail',
		UPTIME_ENDPOINTS: JSON.stringify(['https://down.example.test/']),
	};
	await assert.rejects(runCheck(env, { fetchImpl: f.fetchImpl }), /uptime 1\/1 down/);
	assert.deepEqual(f.calls.map((c) => c.url), ['https://down.example.test/', 'https://hc.example.test/other-fail']);
});

test('scheduled handler is exported', async () => {
	const mod = await load();
	assert.equal(typeof mod.default.scheduled, 'function');
});

test('missing heartbeat URL still checks endpoints (ping is a no-op)', async () => {
	const { runCheck } = await load();
	const f = fake();
	const out = await runCheck({ UPTIME_ENDPOINTS: '["https://ok.example.test/"]' }, { fetchImpl: f.fetchImpl });
	assert.equal(out[0].ok, true);
	assert.deepEqual(f.calls.map((c) => c.url), ['https://ok.example.test/']);
});
