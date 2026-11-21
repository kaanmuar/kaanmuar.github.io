const test = require('node:test');
const assert = require('node:assert/strict');

const node = require('../../functions/http-resilience.js');
const loadWorker = () => import('../../workers/shared/breaker.js');
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

// The functions' Node port must behave like the Workers module on every scenario both support.
const both = async () => [['functions', node], ['workers', await loadWorker()]];

test('Retry-After on 429/503 is honored (seconds and HTTP date) and capped, same as the Workers module', async () => {
	for (const [name, m] of await both()) {
		assert.equal(m.parseRetryAfter('7'), 7000, name);
		assert.equal(m.parseRetryAfter('Wed, 21 Oct 2015 07:28:10 GMT', Date.parse('Wed, 21 Oct 2015 07:28:00 GMT')), 10000, name);
		assert.equal(m.parseRetryAfter('soon'), null, name);
		const r = rig([() => res(429, { 'retry-after': '3' }), () => res(503, { 'retry-after': '999' }), () => res(200)]);
		const out = await m.resilientFetch('https://x.test', {}, { ...r.opts, maxRetryAfterMs: 20000 });
		assert.equal(out.status, 200, name);
		assert.deepEqual(r.waits, [3000, 20000], name);
	}
});

test('5xx and network errors back off with jitter, 4xx never retry, same as the Workers module', async () => {
	for (const [name, m] of await both()) {
		const r = rig([() => res(502), new Error('reset'), () => res(500), () => res(500)]);
		const out = await m.resilientFetch('https://x.test', {}, { ...r.opts, retries: 3, baseMs: 100 });
		assert.equal(out.status, 500, name);
		assert.equal(r.calls.length, 4, name);
		assert.deepEqual(r.waits, [50, 100, 200], name);
		const bad = rig([() => res(404)]);
		assert.equal((await m.resilientFetch('https://x.test', {}, bad.opts)).status, 404, name);
		assert.equal(bad.calls.length, 1, name);
		const down = rig([new Error('down')]);
		await assert.rejects(m.resilientFetch('https://x.test', {}, { ...down.opts, retries: 1 }), /down/, name);
		assert.equal(down.calls.length, 2, name);
	}
});

test('the breaker opens after the threshold, fails fast, then lets one probe through', async () => {
	for (const [name, m] of await both()) {
		let t = 0;
		const breaker = m.createBreaker({ name: 'svc', threshold: 2, coolDownMs: 1000, now: () => t });
		const r = rig([() => res(500), () => res(500), () => res(200)]);
		const out = await m.resilientFetch('https://x.test', {}, { ...r.opts, retries: 5, breaker });
		assert.equal(out.status, 500, name);
		assert.equal(breaker.state, 'open', name);
		assert.equal(r.calls.length, 2, name);
		await assert.rejects(m.resilientFetch('https://x.test', {}, { ...r.opts, breaker }), (e) => e.name === 'BreakerOpenError', name);
		assert.equal(r.calls.length, 2, name);
		t = 1500;
		assert.equal(breaker.state, 'half-open', name);
		assert.equal((await m.resilientFetch('https://x.test', {}, { ...r.opts, breaker })).status, 200, name);
		assert.equal(breaker.state, 'closed', name);
	}
});

test('functions only: noRetryStatuses return at once and stay neutral for the breaker', async () => {
	const breaker = node.createBreaker({ threshold: 1 });
	const r = rig([() => res(429, { 'retry-after': '1' })]);
	const out = await node.resilientFetch('https://x.test', {}, { ...r.opts, breaker, noRetryStatuses: [429] });
	assert.equal(out.status, 429);
	assert.equal(r.calls.length, 1);
	assert.deepEqual(r.waits, []);
	assert.equal(breaker.state, 'closed');
});

test('functions only: retryErrors can stop a retry, and timeoutMs gives every attempt a fresh signal', async () => {
	const timeout = Object.assign(new Error('late'), { name: 'TimeoutError' });
	const r = rig([timeout]);
	await assert.rejects(node.resilientFetch('https://x.test', {}, { ...r.opts, retries: 3, retryErrors: (e) => !node.isTimeout(e) }), /late/);
	assert.equal(r.calls.length, 1);
	const signals = [];
	await node.resilientFetch('https://x.test', {}, {
		retries: 1, sleep: async () => {}, timeoutMs: 5000,
		fetchImpl: async (url, init) => { signals.push(init.signal); return res(signals.length === 1 ? 500 : 200); },
	});
	assert.equal(signals.length, 2);
	assert.notEqual(signals[0], signals[1]);
});

test('url review: Web Risk and PageSpeed keep their answer shapes through retries and the breaker', async () => {
	const core = require('../../functions/url-review-core.js');
	const saved = global.fetch;
	const slept = global.setTimeout;
	global.setTimeout = (fn, ms, ...a) => slept(fn, Math.min(ms, 1), ...a);
	try {
		let n = 0;
		global.fetch = async () => (++n === 1 ? res(503, { 'retry-after': '1' }) : new Response(JSON.stringify({ threat: { threatTypes: ['MALWARE'] } }), { status: 200 }));
		assert.deepEqual(await core.webRisk('https://bad.example/', 'k'), { ok: true, url: 'https://bad.example/', threats: ['MALWARE'] });
		assert.equal(n, 2);
		global.fetch = async () => res(403);
		assert.deepEqual(await core.webRisk('https://bad.example/', 'k'), { ok: false, error: 'status 403' });
		n = 0;
		global.fetch = async () => (n++, res(429));
		assert.deepEqual(await core.pageSpeed('https://x.example/', 'k'), { ok: false, error: 'the daily quota is used up' });
		assert.equal(n, 1);
		n = 0;
		global.fetch = async () => (n++, res(500));
		assert.deepEqual(await core.pageSpeed('https://x.example/', 'k'), { ok: false, error: 'status 500' });
		assert.equal(n, 2);
	} finally {
		global.fetch = saved;
		global.setTimeout = slept;
		node.breakers.webrisk.success();
		node.breakers.pagespeed.success();
	}
});

test('url review: CrUX History and Places keep their answer shapes through retries and the breaker', async () => {
	const core = require('../../functions/url-review-core.js');
	const local = require('../../functions/url-review-local.js');
	const prospects = require('../../functions/url-review-prospects.js');
	const saved = global.fetch;
	const slept = global.setTimeout;
	global.setTimeout = (fn, ms, ...a) => slept(fn, Math.min(ms, 1), ...a);
	const emptyCrux = () =>
		new Response(JSON.stringify({ record: { metrics: {}, collectionPeriods: [] } }), { status: 200 });
	try {
		let n = 0;
		global.fetch = async () => (++n <= 2 ? res(503, { 'retry-after': '1' }) : emptyCrux());
		const crux = await core.cruxHistory('https://x.example/', 'k');
		assert.equal(crux.ok, true);
		assert.ok(n >= 3, 'CrUX retries a 503 before succeeding');
		n = 0;
		global.fetch = async () => (n++, res(429));
		await assert.rejects(core.cruxHistory('https://x.example/', 'k'), /quota is used up/);
		assert.ok(n >= 1 && n <= 2, 'CrUX does not retry a spent quota (forms may race)');
		assert.ok(n < 4, 'no Retry-After loop on CrUX 429');
		n = 0;
		global.fetch = async () => (++n === 1 ? res(503, { 'retry-after': '1' }) : new Response(JSON.stringify({ places: [{ id: 'p1' }] }), { status: 200 }));
		assert.deepEqual(await local.placesSearch({ textQuery: 'cafe' }, 'k'), { ok: true, places: [{ id: 'p1' }] });
		assert.equal(n, 2);
		n = 0;
		global.fetch = async () => (n++, res(429));
		assert.deepEqual(await prospects.placesSearch({ textQuery: 'x' }, 'k'), { ok: false, error: 'status 429' });
		assert.equal(n, 1, 'Places prospects share no-retry on 429');
		n = 0;
		global.fetch = async () => (n++, res(500));
		assert.deepEqual(await local.placesSearch({ textQuery: 'x' }, 'k'), { ok: false, error: 'status 500' });
		assert.equal(n, 3, 'Places retries 5xx twice then returns');
	} finally {
		global.fetch = saved;
		global.setTimeout = slept;
		node.breakers.crux.success();
		node.breakers.places.success();
	}
});
