const test = require('node:test');
const assert = require('node:assert/strict');
const desk = require('../../functions/url-review-indexnow-desk');
const fixDiffDesk = require('../../functions/url-review-fix-diff-desk');

const ORIGIN = 'https://shop.example.com';
const HOST = 'shop.example.com';
const KEY = 'abc123def456';
const NOW = Date.parse('2026-11-26T15:30:00Z');

function memoryDb() {
	const store = { [desk.DEDUPE_COLLECTION]: new Map(), [desk.RATE_COLLECTION]: new Map() };
	const docRef = (name, id) => ({
		get: async () => {
			const row = store[name].get(id);
			return { exists: !!row, data: () => row };
		},
		set: async (value, opts) => {
			const prev = store[name].get(id) || {};
			store[name].set(id, opts && opts.merge ? Object.assign({}, prev, value) : value);
		},
	});
	return {
		store,
		collection: (name) => ({
			doc: (id) => docRef(name, id),
		}),
		runTransaction: async (fn) => {
			const tx = {
				get: async (ref) => ref.get(),
				set: (ref, value, opts) => ref.set(value, opts),
			};
			return fn(tx);
		},
	};
}

function response() {
	const out = { statusCode: 200, body: null };
	return {
		status(code) {
			out.statusCode = code;
			return this;
		},
		json(payload) {
			out.body = payload;
			return this;
		},
		out,
	};
}

test('enabled is off by default and on with URL_REVIEW_INDEXNOW_DESK=1 or ping flag', () => {
	assert.equal(desk.enabled({ env: {} }), false);
	assert.equal(desk.enabled({ env: { URL_REVIEW_INDEXNOW_DESK: '1' } }), true);
	assert.equal(desk.enabled({ env: {}, enabled: true }), true);
	assert.equal(desk.enabled({ env: { URL_REVIEW_INDEXNOW_DESK: '1' }, enabled: false }), false);
	assert.equal(desk.enabled({ env: {}, body: { indexNowDesk: { enabled: true } } }), true);
});

test('urlsFromPack builds git path URL and cms home URL', () => {
	const git = { kind: 'git', host: HOST, path: 'llms.txt' };
	assert.deepEqual(desk.urlsFromPack(git), ['https://shop.example.com/llms.txt']);
	const cms = { kind: 'cms', host: HOST };
	assert.deepEqual(desk.urlsFromPack(cms), ['https://shop.example.com/']);
	assert.deepEqual(desk.urlsFromPack(cms, ['https://custom.example/only']), ['https://custom.example/only']);
});

test('dedupeHash is stable for host and sorted urls', () => {
	const a = desk.dedupeHash(HOST, ['https://shop.example.com/b', 'https://shop.example.com/a']);
	const b = desk.dedupeHash(HOST, ['https://shop.example.com/a', 'https://shop.example.com/b']);
	assert.equal(a, b);
	assert.notEqual(a, desk.dedupeHash('other.example.com', ['https://shop.example.com/a']));
});

test('rateLimitState resets count on new hour and enforces max', () => {
	const hour = desk.hourKey(NOW);
	const open = desk.rateLimitState({ hourKey: hour, count: 3, max: 5 }, NOW);
	assert.equal(open.limited, false);
	const full = desk.rateLimitState({ hourKey: hour, count: 5, max: 5 }, NOW);
	assert.equal(full.limited, true);
	const nextHour = desk.rateLimitState({ hourKey: '2026-11-26T14', count: 99, max: 5 }, NOW);
	assert.equal(nextHour.count, 0);
	assert.equal(nextHour.limited, false);
});

test('submitWithQuotaBackoff retries 429 then succeeds', async () => {
	const calls = [];
	const fetchFn = async () => {
		calls.push(1);
		if (calls.length < 3) return { status: 429, ok: false };
		return { status: 202, ok: true };
	};
	const customer = require('../../functions/url-review-indexnow-customer');
	const orig = customer.submitIndexNow;
	customer.submitIndexNow = async (fetch) => {
		const res = await fetchFn();
		return { ok: res.ok, status: res.status, urlList: 1 };
	};
	try {
		const out = await desk.submitWithQuotaBackoff(
			async () => ({}),
			{ host: HOST, key: KEY, origin: ORIGIN, urlList: [ORIGIN + '/'] },
			{ sleep: async () => {}, retries: 4 }
		);
		assert.equal(out.ok, true);
		assert.equal(calls.length, 3);
	} finally {
		customer.submitIndexNow = orig;
	}
});

test('pingApprovedPack dedupes repeat hash within TTL', async () => {
	const db = memoryDb();
	const fetchCalls = [];
	const fetchFn = async (url) => {
		fetchCalls.push(url);
		if (String(url).endsWith(KEY + '.txt')) return { status: 200, text: async () => KEY };
		if (url.includes('indexnow')) return { status: 202, text: async () => '' };
		throw new Error('unexpected');
	};
	const pack = { id: 'p1', status: 'approved', kind: 'git', host: HOST, path: 'llms.txt' };
	const base = {
		enabled: true,
		env: { URL_REVIEW_INDEXNOW_DESK: '1' },
		db,
		fetch: fetchFn,
		key: KEY,
		nowMs: NOW,
		sleep: async () => {},
	};
	const first = await desk.pingApprovedPack(pack, base);
	assert.equal(first.ok, true);
	assert.equal(first.reason, undefined);
	const again = await desk.pingApprovedPack(pack, base);
	assert.equal(again.reason, 'deduped');
	assert.equal(fetchCalls.filter((u) => u.includes('indexnow')).length, 1);
});

test('deskPing requires approval and key when enabled', async () => {
	const pending = fixDiffDesk.recordFromBody(
		{ kind: 'git', findingId: 'F-01', path: 'llms.txt', before: 'a', after: 'b', host: HOST },
		NOW
	);
	const db = memoryDb();
	db.store[fixDiffDesk.COLLECTION] = new Map([['p1', pending]]);
	const dbApi = {
		collection: (name) => ({
			doc: (id) => ({
				get: async () => {
					const row = db.store[name].get(id);
					return { exists: !!row, data: () => row };
				},
			}),
		}),
		runTransaction: async () => ({ hourKey: desk.hourKey(NOW), count: 1 }),
	};
	const off = response();
	await desk.deskPing({ body: { id: 'p1', key: KEY } }, off, 'op', { db: dbApi, env: {} });
	assert.equal(off.out.statusCode, 403);
	const bad = response();
	await desk.deskPing(
		{ body: { id: 'p1', key: KEY } },
		bad,
		'op',
		{ db: dbApi, env: { URL_REVIEW_INDEXNOW_DESK: '1' }, nowMs: NOW }
	);
	assert.equal(bad.out.statusCode, 400);
	pending.status = 'approved';
	db.store[fixDiffDesk.COLLECTION].set('p1', pending);
	const noKey = response();
	await desk.deskPing(
		{ body: { id: 'p1' } },
		noKey,
		'op',
		{ db: dbApi, env: { URL_REVIEW_INDEXNOW_DESK: '1' }, nowMs: NOW }
	);
	assert.equal(noKey.out.statusCode, 400);
});