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
const both = async () => [
	['functions', node],
	['workers', await loadWorker()],
];

test('Retry-After on 429/503 is honored (seconds and HTTP date) and capped, same as the Workers module', async () => {
	for (const [name, m] of await both()) {
		assert.equal(m.parseRetryAfter('7'), 7000, name);
		assert.equal(
			m.parseRetryAfter('Wed, 21 Oct 2015 07:28:10 GMT', Date.parse('Wed, 21 Oct 2015 07:28:00 GMT')),
			10000,
			name
		);
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
		await assert.rejects(
			m.resilientFetch('https://x.test', {}, { ...r.opts, breaker }),
			(e) => e.name === 'BreakerOpenError',
			name
		);
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
	await assert.rejects(
		node.resilientFetch('https://x.test', {}, { ...r.opts, retries: 3, retryErrors: (e) => !node.isTimeout(e) }),
		/late/
	);
	assert.equal(r.calls.length, 1);
	const signals = [];
	await node.resilientFetch(
		'https://x.test',
		{},
		{
			retries: 1,
			sleep: async () => {},
			timeoutMs: 5000,
			fetchImpl: async (url, init) => {
				signals.push(init.signal);
				return res(signals.length === 1 ? 500 : 200);
			},
		}
	);
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
		global.fetch = async () =>
			++n === 1
				? res(503, { 'retry-after': '1' })
				: new Response(JSON.stringify({ threat: { threatTypes: ['MALWARE'] } }), { status: 200 });
		assert.deepEqual(await core.webRisk('https://bad.example/', 'k'), {
			ok: true,
			url: 'https://bad.example/',
			threats: ['MALWARE'],
		});
		assert.equal(n, 2);
		global.fetch = async () => res(403);
		assert.deepEqual(await core.webRisk('https://bad.example/', 'k'), { ok: false, error: 'status 403' });
		n = 0;
		global.fetch = async () => (n++, res(429));
		assert.deepEqual(await core.pageSpeed('https://x.example/', 'k'), {
			ok: false,
			error: 'the daily quota is used up',
		});
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
		global.fetch = async () =>
			++n === 1
				? res(503, { 'retry-after': '1' })
				: new Response(JSON.stringify({ places: [{ id: 'p1' }] }), { status: 200 });
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

test('url review: threat lists keep their answer shapes through retries and the breaker', async () => {
	const lists = require('../../functions/url-review-threat-lists.js');
	const slept = global.setTimeout;
	global.setTimeout = (fn, ms, ...a) => slept(fn, Math.min(ms, 1), ...a);
	const env = {
		URLHAUS_AUTH_KEY: 'uh',
		PHISHSTATS_KEY: 'psk_x',
		CLOUDFLARE_URLSCAN_TOKEN: 'cf',
		CLOUDFLARE_ACCOUNT_ID: 'acc',
	};
	const cleanCf = [
		[/urlscanner\/v2\/search/, () => new Response(JSON.stringify({ results: [] }), { status: 200 })],
		[/urlscanner\/v2\/scan$/, () => new Response(JSON.stringify({ uuid: 's1' }), { status: 200 })],
		[
			/urlscanner\/v2\/result\/s1/,
			() =>
				new Response(
					JSON.stringify({
						task: {
							uuid: 's1',
							url: 'https://shop.example.com/',
							time: '2026-11-09T10:00:00Z',
							reportURL: 'https://radar.cloudflare.com/scan/s1',
						},
						verdicts: { overall: { malicious: false, categories: [] } },
					}),
					{ status: 200 }
				),
		],
	];
	const route = (table) => async (url) => {
		for (const [match, answer] of table) if (match.test(String(url))) return answer();
		throw new Error('unexpected ' + url);
	};
	const run = (fetch) => {
		lists._cache.clear();
		return lists.check('https://shop.example.com/', {
			env,
			fetch,
			now: Date.parse('2026-11-09T12:00:00Z'),
			pause: async () => {},
		});
	};
	try {
		let n = 0;
		const result = await run(
			route([
				[
					/urlhaus-api/,
					() =>
						++n === 1
							? res(503, { 'retry-after': '1' })
							: new Response(JSON.stringify({ query_status: 'no_results' }), { status: 200 }),
				],
				[/phishstats/, () => new Response(JSON.stringify([]), { status: 200 })],
				...cleanCf,
			])
		);
		assert.equal(result.sources[0].ok, true);
		assert.equal(result.sources[0].listed, false);
		assert.ok(n >= 2, 'URLhaus retries a 503 before succeeding (host + registrable)');
		n = 0;
		const failed = await run(
			route([
				[/urlhaus-api/, () => (n++, res(500))],
				[/phishstats/, () => new Response(JSON.stringify([]), { status: 200 })],
				...cleanCf,
			])
		);
		assert.deepEqual([failed.sources[0].ok, failed.sources[0].error], [false, 'status 500']);
		assert.equal(n, 3, 'URLhaus retries 5xx twice then returns the last status');
		let p = 0;
		let cfn = 0;
		const retried = await run(
			route([
				[/urlhaus-api/, () => new Response(JSON.stringify({ query_status: 'no_results' }), { status: 200 })],
				[/phishstats/, () => (++p === 1 ? res(502) : new Response(JSON.stringify([]), { status: 200 }))],
				[
					/urlscanner\/v2\/search/,
					() => (++cfn === 1 ? res(503) : new Response(JSON.stringify({ results: [] }), { status: 200 })),
				],
				...cleanCf.slice(1),
			])
		);
		assert.ok(p >= 2, 'PhishStats retries a 502');
		assert.ok(cfn >= 2, 'Cloudflare scanner retries a 503');
		assert.equal(retried.sources.length >= 2, true);
		assert.equal(retried.sources[1].ok, true);
		n = 0;
		node.breakers.urlhaus.failure();
		node.breakers.urlhaus.failure();
		node.breakers.urlhaus.failure();
		node.breakers.urlhaus.failure();
		node.breakers.urlhaus.failure();
		assert.equal(node.breakers.urlhaus.state, 'open');
		const paused = await run(
			route([
				[/urlhaus-api/, () => (n++, res(200))],
				[/phishstats/, () => new Response(JSON.stringify([]), { status: 200 })],
				...cleanCf,
			])
		);
		assert.deepEqual([paused.sources[0].ok, paused.sources[0].error], [false, 'paused after repeated failures']);
		assert.equal(n, 0, 'open breaker does not call URLhaus');
	} finally {
		global.setTimeout = slept;
		node.breakers.urlhaus.success();
		node.breakers.phishstats.success();
		node.breakers.cloudflare.success();
		lists._cache.clear();
	}
});

test('url review: Identity Toolkit accounts:lookup uses resilientFetch and the identitytoolkit breaker', async () => {
	const desk = require('../../functions/url-review-desk.js');
	const auth = require('../../functions/url-review-auth.js');
	const saved = global.fetch;
	const slept = global.setTimeout;
	global.setTimeout = (fn, ms, ...a) => slept(fn, Math.min(ms, 1), ...a);
	const prevKey = process.env.FIREBASE_WEB_KEY;
	process.env.FIREBASE_WEB_KEY = 'test-firebase-web-key';
	const user = {
		localId: 'op1',
		email: 'kaanmuar@gmail.com',
		emailVerified: true,
		providerUserInfo: [{ providerId: 'password', rawId: 'op1' }],
	};
	const signedBy = (method, sub = 'op1') =>
		[
			'h',
			Buffer.from(JSON.stringify({ sub, firebase: { sign_in_provider: method } })).toString('base64url'),
			's'.repeat(30),
		].join('.');
	const okBody = () => new Response(JSON.stringify({ users: [user] }), { status: 200 });
	try {
		let n = 0;
		global.fetch = async (url) => {
			assert.match(String(url), /identitytoolkit\.googleapis\.com\/v1\/accounts:lookup/);
			n++;
			if (n === 1) return res(503, { 'retry-after': '1' });
			return okBody();
		};
		assert.equal(await desk.verifyOperator(signedBy('password')), 'kaanmuar@gmail.com');
		assert.ok(n >= 2, 'desk lookup retries a 503 before succeeding');

		n = 0;
		global.fetch = async () => (
			n++,
			new Response(JSON.stringify({ error: { message: 'INVALID_ID_TOKEN' } }), { status: 400 })
		);
		assert.equal(await desk.verifyOperator(signedBy('password')), null);
		assert.equal(n, 1, 'permanent 4xx auth failure is not retried as 5xx');

		n = 0;
		global.fetch = async () => {
			n++;
			if (n === 1) return res(502);
			return okBody();
		};
		const decoded = await auth.lookupIdToken('test-firebase-web-key')(signedBy('password'));
		assert.equal(decoded.uid, 'op1');
		assert.equal(decoded.email, 'kaanmuar@gmail.com');
		assert.ok(n >= 2, 'local auth lookup retries a 502 before succeeding');

		n = 0;
		global.fetch = async () => (
			n++,
			new Response(JSON.stringify({ error: { message: 'INVALID_ID_TOKEN' } }), { status: 400 })
		);
		await assert.rejects(auth.lookupIdToken('test-firebase-web-key')(signedBy('password')), /not accepted/);
		assert.equal(n, 1, 'local auth does not retry permanent 4xx');

		n = 0;
		node.breakers.identitytoolkit.failure();
		node.breakers.identitytoolkit.failure();
		node.breakers.identitytoolkit.failure();
		node.breakers.identitytoolkit.failure();
		node.breakers.identitytoolkit.failure();
		assert.equal(node.breakers.identitytoolkit.state, 'open');
		global.fetch = async () => (n++, okBody());
		await assert.rejects(
			() => desk.verifyOperator(signedBy('password')),
			node.BreakerOpenError,
			'open breaker skips Identity Toolkit for desk'
		);
		assert.equal(n, 0, 'open breaker does not call Identity Toolkit');
		await assert.rejects(
			() => auth.lookupIdToken('test-firebase-web-key')(signedBy('password')),
			node.BreakerOpenError,
			'open breaker skips Identity Toolkit for local auth'
		);
		assert.equal(n, 0);
	} finally {
		global.fetch = saved;
		global.setTimeout = slept;
		node.breakers.identitytoolkit.success();
		if (prevKey == null) delete process.env.FIREBASE_WEB_KEY;
		else process.env.FIREBASE_WEB_KEY = prevKey;
	}
});

test('url review: lookalike DoH uses resilientFetch and the doh breakers', async () => {
	const lookalikes = require('../../functions/url-review-lookalikes.js');
	const saved = global.fetch;
	const slept = global.setTimeout;
	global.setTimeout = (fn, ms, ...a) => slept(fn, Math.min(ms, 1), ...a);
	const dnsOk = (status = 0, answers = []) =>
		new Response(JSON.stringify({ Status: status, Answer: answers }), {
			status: 200,
			headers: { 'content-type': 'application/dns-json' },
		});
	try {
		let n = 0;
		global.fetch = async (url) => {
			assert.match(String(url), /cloudflare-dns\.com|dns\.google/);
			n++;
			if (n === 1) return res(503, { 'retry-after': '1' });
			return dnsOk(0, [{ type: 1, data: '203.0.113.9' }]);
		};
		const out = await lookalikes.doh('example.com', 'A', 500);
		assert.equal(out.status, 0);
		assert.deepEqual(out.answers, ['203.0.113.9']);
		assert.ok(n >= 2, 'DoH retries a 503 before succeeding');

		n = 0;
		global.fetch = async () => (n++, dnsOk(3));
		assert.deepEqual(await lookalikes.doh('missing.example', 'A', 500), { status: 3, answers: [] });
		assert.equal(n, 1, 'NXDOMAIN (HTTP 200 Status 3) is not retried as 5xx');

		n = 0;
		const hosts = [];
		global.fetch = async (url) => {
			hosts.push(String(url));
			n++;
			if (String(url).includes('cloudflare-dns')) return res(400);
			return dnsOk(0, [{ type: 1, data: '203.0.113.10' }]);
		};
		const viaGoogle = await lookalikes.doh('example.com', 'A', 500);
		assert.deepEqual(viaGoogle.answers, ['203.0.113.10']);
		assert.equal(n, 2, '4xx fails over to the next resolver without retries');
		assert.ok(hosts.some((u) => u.includes('dns.google')));

		n = 0;
		node.breakers['doh-cloudflare'].failure();
		node.breakers['doh-cloudflare'].failure();
		node.breakers['doh-cloudflare'].failure();
		node.breakers['doh-cloudflare'].failure();
		node.breakers['doh-cloudflare'].failure();
		assert.equal(node.breakers['doh-cloudflare'].state, 'open');
		global.fetch = async (url) => {
			n++;
			assert.match(String(url), /dns\.google/, 'open CF DoH breaker skips cloudflare-dns.com');
			return dnsOk(0, [{ type: 1, data: '203.0.113.11' }]);
		};
		const paused = await lookalikes.doh('example.com', 'A', 500);
		assert.deepEqual(paused.answers, ['203.0.113.11']);
		assert.equal(n, 1, 'open breaker does not call Cloudflare DoH');
	} finally {
		global.fetch = saved;
		global.setTimeout = slept;
		node.breakers['doh-cloudflare'].success();
		node.breakers['doh-google'].success();

	}
});
