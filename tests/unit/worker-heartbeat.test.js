const test = require('node:test');
const assert = require('node:assert/strict');

const load = () => import('../../workers/shared/heartbeat.js');
const SECRET = 'https://hc.example.test/ping/secret-uuid';
const fake = (impl = async () => new Response('OK', { status: 200 })) => {
	const calls = [];
	const fetchImpl = async (url, init) => {
		calls.push({ url, init });
		return impl(url, init);
	};
	return { calls, fetchImpl };
};

test('success ping goes to the configured URL', async () => {
	const { pingHeartbeat } = await load();
	const f = fake();
	assert.equal(await pingHeartbeat(SECRET, { fetchImpl: f.fetchImpl }), true);
	assert.deepEqual(f.calls.map((c) => c.url), [SECRET]);
});

test('missing URL is a no-op', async () => {
	const { pingHeartbeat, pingFailure, withHeartbeat } = await load();
	const f = fake();
	assert.equal(await pingHeartbeat(undefined, { fetchImpl: f.fetchImpl }), false);
	assert.equal(await pingFailure('', { fetchImpl: f.fetchImpl }), false);
	assert.equal(await withHeartbeat({}, 'outreach', async () => 'ok', { fetchImpl: f.fetchImpl }), 'ok');
	assert.equal(f.calls.length, 0);
});

test('withHeartbeat pings success after the job returns', async () => {
	const { withHeartbeat } = await load();
	const f = fake();
	const out = await withHeartbeat({ HEARTBEAT_OUTREACH_URL: SECRET }, 'outreach', async () => 42, { fetchImpl: f.fetchImpl });
	assert.equal(out, 42);
	assert.deepEqual(f.calls.map((c) => c.url), [SECRET]);
});

test('withHeartbeat pings /fail when the job throws and rethrows the job error', async () => {
	const { withHeartbeat } = await load();
	const f = fake();
	await assert.rejects(
		withHeartbeat({ HEARTBEAT_OUTREACH_URL: SECRET }, 'outreach', async () => { throw new Error('boom'); }, { fetchImpl: f.fetchImpl }),
		/boom/,
	);
	assert.deepEqual(f.calls.map((c) => c.url), [SECRET + '/fail']);
});

test('explicit fail URL wins over the /fail suffix', async () => {
	const { withHeartbeat } = await load();
	const f = fake();
	const env = { HEARTBEAT_OUTREACH_URL: SECRET, HEARTBEAT_OUTREACH_FAIL_URL: 'https://hc.example.test/other' };
	await assert.rejects(withHeartbeat(env, 'outreach', async () => { throw new Error('x'); }, { fetchImpl: f.fetchImpl }));
	assert.deepEqual(f.calls.map((c) => c.url), ['https://hc.example.test/other']);
});

test('failUrlFor handles trailing slash and query string', async () => {
	const { failUrlFor } = await load();
	assert.equal(failUrlFor('https://hc.example.test/p/u/'), 'https://hc.example.test/p/u/fail');
	assert.equal(failUrlFor('https://hc.example.test/p/u?create=1'), 'https://hc.example.test/p/u/fail?create=1');
	assert.equal(failUrlFor('not a url'), '');
});

test('a failing ping never throws and the URL is not leaked', async () => {
	const { pingHeartbeat, withHeartbeat } = await load();
	const f = fake(async (url) => { throw new Error('connect failed ' + url); });
	assert.equal(await pingHeartbeat(SECRET, { fetchImpl: f.fetchImpl }), false);
	assert.equal(await withHeartbeat({ HEARTBEAT_OUTREACH_URL: SECRET }, 'outreach', async () => 'ok', { fetchImpl: f.fetchImpl }), 'ok');
});

test('a hanging ping is aborted by the timeout', async () => {
	const { pingHeartbeat } = await load();
	const f = fake((url, init) => new Promise((_, reject) => init.signal.addEventListener('abort', () => reject(new Error('aborted')))));
	const started = Date.now();
	assert.equal(await pingHeartbeat(SECRET, { fetchImpl: f.fetchImpl, timeoutMs: 20 }), false);
	assert.ok(Date.now() - started < 1000);
});

test('checkEndpoints reports status, time and expected; a dead endpoint does not throw', async () => {
	const { checkEndpoints } = await load();
	let t = 0;
	const f = fake(async (url) => {
		if (url.includes('dead')) throw new Error('ECONNREFUSED');
		if (url.includes('moved')) return new Response(null, { status: 301 });
		if (url.includes('down')) return new Response('x', { status: 503 });
		return new Response('ok', { status: 200 });
	});
	const out = await checkEndpoints(
		['https://a.test/', 'https://down.test/', 'https://dead.test/', { url: 'https://moved.test/', expected: 301 }],
		{ fetchImpl: f.fetchImpl, now: () => (t += 5) },
	);
	assert.deepEqual(out.map((r) => [r.ok, r.status, r.expected]), [[true, 200, 200], [false, 503, 200], [false, 0, 200], [true, 301, 301]]);
	assert.equal(out[2].error, 'network error');
	assert.ok(out.every((r) => typeof r.ms === 'number'));
});

test('checkEndpoints on an empty list returns an empty array', async () => {
	const { checkEndpoints } = await load();
	assert.deepEqual(await checkEndpoints(undefined), []);
});
