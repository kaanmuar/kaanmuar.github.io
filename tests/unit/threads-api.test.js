const test = require('node:test');
const assert = require('node:assert/strict');
const api = require('../../scripts/threads-api');

const json = (status, body, headers = {}) =>
	new Response(JSON.stringify(body), {
		status,
		headers: Object.assign({ 'content-type': 'application/json' }, headers),
	});

const rig = (queue) => {
	const calls = [];
	const waits = [];
	const left = [...queue];
	return {
		calls,
		waits,
		opts: {
			fetchImpl: async (url, init) => {
				calls.push({ url: String(url), method: (init && init.method) || 'GET' });
				const next = left.length > 1 ? left.shift() : left[0];
				if (next instanceof Error) throw next;
				return typeof next === 'function' ? next() : next;
			},
			sleep: async (ms) => waits.push(ms),
			random: () => 0.5,
		},
	};
};

test('skipWhy names THREADS_TOKEN when missing, empty when set', () => {
	assert.match(api.skipWhy({}), /THREADS_TOKEN missing/);
	assert.equal(api.skipWhy({ THREADS_TOKEN: 'x' }), '');
	assert.equal(api.ready({}), false);
	assert.equal(api.ready({ THREADS_TOKEN: 'x' }), true);
});

test('createCall retries 503 then returns JSON', async () => {
	const r = rig([json(503, { error: { message: 'busy' } }), json(200, { id: '1', username: 'qa' })]);
	const call = api.createCall('tok', { ...r.opts, retries: 3, baseMs: 100 });
	const me = await call('GET', 'me', { fields: 'id,username' });
	assert.equal(me.username, 'qa');
	assert.equal(r.calls.length, 2);
	const first = new URL(r.calls[0].url);
	assert.equal(first.hostname, 'graph.threads.net');
	assert.equal(first.searchParams.get('access_token'), 'tok');
	assert.ok(r.waits.length >= 1);
});

test('429 honors Retry-After (capped) before succeeding', async () => {
	const r = rig([
		() => json(429, { error: { message: 'rate' } }, { 'retry-after': '2' }),
		() => json(200, { data: [{ id: '9' }] }),
	]);
	const call = api.createCall('tok', { ...r.opts, retries: 2, maxRetryAfterMs: 5000 });
	const out = await call('GET', 'me/threads', { fields: 'id', limit: '1' });
	assert.equal(out.data[0].id, '9');
	assert.deepEqual(r.waits, [2000]);
});

test('4xx is not retried', async () => {
	const r = rig([json(400, { error: { message: 'bad request', code: 100 } })]);
	const call = api.createCall('tok', { ...r.opts, retries: 5 });
	await assert.rejects(() => call('POST', 'me/threads', { media_type: 'TEXT', text: 'hi' }), /bad request/);
	assert.equal(r.calls.length, 1);
	assert.equal(r.calls[0].method, 'POST');
	assert.equal(r.waits.length, 0);
});

test('exhausted 5xx returns the last error through reply()', async () => {
	const r = rig([json(502, { error: { message: 'bad gateway' } })]);
	const call = api.createCall('tok', { ...r.opts, retries: 1, baseMs: 10 });
	await assert.rejects(() => call('GET', 'me', { fields: 'id' }), /bad gateway/);
	assert.equal(r.calls.length, 2);
});
