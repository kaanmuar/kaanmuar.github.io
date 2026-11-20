const test = require('node:test');
const assert = require('node:assert/strict');

const load = () => import('../../workers/shared/breaker.js');
const res = (status, headers = {}) => new Response(status === 204 ? null : 'x', { status, headers });
const rig = (responses) => {
	const calls = [];
	const waits = [];
	const queue = [...responses];
	return {
		calls,
		waits,
		opts: {
			fetchImpl: async () => {
				calls.push(1);
				const next = queue.length > 1 ? queue.shift() : queue[0];
				if (next instanceof Error) throw next;
				return next();
			},
			sleep: async (ms) => waits.push(ms),
			random: () => 0.5,
		},
	};
};

test('Retry-After on a 429 is honored (seconds and HTTP date) and capped', async () => {
	const { resilientFetch, parseRetryAfter } = await load();
	assert.equal(parseRetryAfter('7'), 7000);
	assert.equal(parseRetryAfter('Wed, 21 Oct 2015 07:28:10 GMT', Date.parse('Wed, 21 Oct 2015 07:28:00 GMT')), 10000);
	assert.equal(parseRetryAfter('soon'), null);
	const r = rig([() => res(429, { 'retry-after': '3' }), () => res(503, { 'retry-after': '999' }), () => res(200)]);
	const out = await resilientFetch('https://x.test', {}, { ...r.opts, maxRetryAfterMs: 20000 });
	assert.equal(out.status, 200);
	assert.deepEqual(r.waits, [3000, 20000]);
});

test('5xx and network errors back off exponentially with jitter, then return the last response', async () => {
	const { resilientFetch } = await load();
	const r = rig([() => res(502), new Error('reset'), () => res(500), () => res(500)]);
	const out = await resilientFetch('https://x.test', {}, { ...r.opts, retries: 3, baseMs: 100 });
	assert.equal(out.status, 500);
	assert.equal(r.calls.length, 4);
	assert.deepEqual(r.waits, [50, 100, 200]);
	const net = rig([new Error('down')]);
	await assert.rejects(resilientFetch('https://x.test', {}, { ...net.opts, retries: 1 }), /down/);
	assert.equal(net.calls.length, 2);
});

test('a 4xx other than 429 is returned at once and not counted against the breaker', async () => {
	const { resilientFetch, createBreaker } = await load();
	const breaker = createBreaker({ threshold: 2 });
	for (const status of [400, 401, 404, 422]) {
		const r = rig([() => res(status)]);
		const out = await resilientFetch('https://x.test', {}, { ...r.opts, breaker });
		assert.equal(out.status, status);
		assert.equal(r.calls.length, 1);
		assert.equal(r.waits.length, 0);
	}
	assert.equal(breaker.state, 'closed');
	assert.equal(breaker.failures, 0);
});

test('the breaker opens after N failures in a row, fails fast, then recovers after the cool-down', async () => {
	const { resilientFetch, createBreaker, BreakerOpenError } = await load();
	let clock = 1000;
	const breaker = createBreaker({ name: 't', threshold: 3, coolDownMs: 5000, now: () => clock });
	const bad = rig([() => res(500)]);
	// Three failures open it mid-retry, so the loop stops there instead of using all its retries.
	const out = await resilientFetch('https://x.test', {}, { ...bad.opts, retries: 10, breaker });
	assert.equal(out.status, 500);
	assert.equal(bad.calls.length, 3);
	assert.equal(breaker.state, 'open');
	await assert.rejects(resilientFetch('https://x.test', {}, { ...bad.opts, breaker }), BreakerOpenError);
	assert.equal(bad.calls.length, 3, 'no call while open');
	clock += 5000;
	assert.equal(breaker.state, 'half-open');
	const good = rig([() => res(200)]);
	assert.equal((await resilientFetch('https://x.test', {}, { ...good.opts, breaker })).status, 200);
	assert.equal(breaker.state, 'closed');
	assert.equal(breaker.failures, 0);
});

test('a failed probe after the cool-down re-opens the breaker and only one probe runs at a time', async () => {
	const { createBreaker, BreakerOpenError } = await load();
	let clock = 0;
	const b = createBreaker({ threshold: 1, coolDownMs: 100, now: () => clock });
	b.acquire();
	b.failure();
	assert.throws(() => b.acquire(), BreakerOpenError);
	clock = 100;
	b.acquire();
	assert.throws(() => b.acquire(), BreakerOpenError, 'second caller during the probe');
	b.failure();
	assert.equal(b.state, 'open');
});

test('resilientCall retries only errors the caller marks transient', async () => {
	const { resilientCall } = await load();
	let n = 0;
	const flaky = async () => { if (++n < 3) throw new Error('503 capacity'); return 'ok'; };
	assert.equal(await resilientCall(flaky, { sleep: async () => {}, random: () => 0, isRetryable: (e) => /503/.test(e.message) }), 'ok');
	assert.equal(n, 3);
	let m = 0;
	await assert.rejects(resilientCall(async () => { m++; throw new Error('4006 quota'); }, { sleep: async () => {}, isRetryable: (e) => !/4006/.test(e.message) }), /4006/);
	assert.equal(m, 1);
});

test('the outreach clock and the pre-flight brain still load with the shared module', async () => {
	assert.ok((await import('../../workers/outreach-cron/src/index.js')).MODES);
	assert.equal(typeof (await import('../../workers/preflight/src/index.js')).default.fetch, 'function');
});
