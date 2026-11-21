const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync, spawn } = require('node:child_process');
const { etagFetch, memoryStore, fileStore, cacheKey } = require('../../functions/etag-cache');
const gh = require('../../functions/jarvis-github');

// A fake GitHub: serves `body` with an ETag, answers 304 when If-None-Match matches.
function fakeGitHub(initial) {
	const state = { etag: '"v1"', body: initial, seen: [] };
	const fetchImpl = async (url, init) => {
		const headers = (init && init.headers) || {};
		state.seen.push({ url, inm: headers['If-None-Match'] || null });
		if (headers['If-None-Match'] === state.etag) return { ok: false, status: 304, headers: new Map([['etag', state.etag]]), json: async () => ({}) };
		return { ok: true, status: 200, headers: { get: (n) => (n === 'etag' ? state.etag : null) }, json: async () => state.body };
	};
	return { state, fetchImpl };
}
const headersGet = (fetchImpl) => async (url, init) => {
	const res = await fetchImpl(url, init);
	if (res.headers instanceof Map) res.headers = { get: (n) => res.headers.get(n) || null };
	return res;
};

test('first GET stores the ETag, the second sends If-None-Match and a 304 serves the cached body', async () => {
	const { state, fetchImpl } = fakeGitHub({ n: 1 });
	const get = etagFetch(headersGet(fetchImpl), memoryStore(), 'tok');
	const a = await get('https://api.github.com/repos/x/y/pulls', { headers: {} });
	assert.deepEqual(await a.json(), { n: 1 });
	const b = await get('https://api.github.com/repos/x/y/pulls', { headers: {} });
	assert.equal(b.fromCache, true);
	assert.equal(b.ok, true);
	assert.deepEqual(await b.json(), { n: 1 });
	assert.equal(state.seen[0].inm, null);
	assert.equal(state.seen[1].inm, '"v1"');
	assert.deepEqual({ calls: get.stats.calls, hits: get.stats.hits, misses: get.stats.misses }, { calls: 2, hits: 1, misses: 1 });
});

test('a changed resource (new ETag, 200) replaces the cached body', async () => {
	const { state, fetchImpl } = fakeGitHub({ n: 1 });
	const get = etagFetch(headersGet(fetchImpl), memoryStore(), 'tok');
	await get('https://api.github.com/a', { headers: {} });
	state.etag = '"v2"';
	state.body = { n: 2 };
	assert.deepEqual(await (await get('https://api.github.com/a', { headers: {} })).json(), { n: 2 });
	assert.deepEqual(await (await get('https://api.github.com/a', { headers: {} })).json(), { n: 2 });
	assert.equal(get.stats.hits, 1);
});

test('POST, graphql and rate_limit pass through, and responses without an ETag are not cached', async () => {
	const calls = [];
	const plain = async (url, init) => { calls.push([url, init]); return { ok: true, status: 200, headers: { get: () => null }, json: async () => ({ ok: 1 }) }; };
	const get = etagFetch(plain, memoryStore(), 'tok');
	await get('https://api.github.com/graphql', { method: 'POST', body: '{}' });
	await get('https://api.github.com/rate_limit', { headers: {} });
	await get('https://api.github.com/noetag', { headers: {} });
	await get('https://api.github.com/noetag', { headers: {} });
	assert.equal(calls.length, 4);
	assert.ok(calls.every(([, init]) => !(init.headers && init.headers['If-None-Match'])));
	assert.equal(get.stats.hits, 0);
});

test('a token never reads another token\'s cache entry', () => {
	assert.notEqual(cacheKey('a', '/x'), cacheKey('b', '/x'));
	assert.equal(cacheKey('a', '/x'), cacheKey('a', '/x'));
});

test('memoryStore evicts the oldest entry past its limit', () => {
	const s = memoryStore(2);
	s.set('1', { etag: 'a', body: 1 });
	s.set('2', { etag: 'b', body: 2 });
	s.set('3', { etag: 'c', body: 3 });
	assert.equal(s.get('1'), null);
	assert.equal(s.get('3').body, 3);
});

test('fileStore round-trips and survives a missing or corrupt file', () => {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'etag-'));
	const s = fileStore(path.join(dir, 'c'));
	assert.equal(s.get('k'), null);
	s.set('k', { etag: '"e"', body: [1, 2] });
	assert.deepEqual(s.get('k'), { etag: '"e"', body: [1, 2] });
	fs.writeFileSync(path.join(dir, 'c', 'bad.json'), '{nope');
	assert.equal(s.get('bad'), null);
});

test('jarvis-github client sends If-None-Match on a repeat GET and serves the 304 body', async () => {
	const { state, fetchImpl } = fakeGitHub([{ id: 1 }]);
	const client = gh.__client ? gh.__client(headersGet(fetchImpl), 'tok-jarvis') : null;
	assert.ok(client, 'jarvis-github exports __client for tests');
	assert.deepEqual(await client.get('repos/x/y/issues'), [{ id: 1 }]);
	assert.deepEqual(await client.get('repos/x/y/issues'), [{ id: 1 }]);
	assert.equal(state.seen[1].inm, '"v1"');
	assert.equal(client.cacheStats.hits, 1);
});

// --- scripts/git-lock.sh (mkdir fallback: GIT_LOCK_NO_FLOCK=1 forces it on machines that have flock) ---
const LOCK = path.join(__dirname, '../../scripts/git-lock.sh');
const lockEnv = (extra) => Object.assign({ PATH: process.env.PATH, GIT_LOCK_NO_FLOCK: '1' }, extra);
const run = (lock, args, env) => spawnSync('bash', [LOCK, lock, ...args], { encoding: 'utf8', env: lockEnv(env) });
const LOCK_JOB =
	"const fs=require('fs'),{spawnSync}=require('child_process');const [name,log]=process.argv.slice(1);fs.appendFileSync(log,'start-'+name+'\\n');spawnSync('sleep',['0.5']);fs.appendFileSync(log,'end-'+name+'\\n');";

test('git-lock runs the command, passes its exit status and releases the lock', () => {
	const lock = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'gl-')), 'l');
	assert.equal(run(lock, ['true']).status, 0);
	assert.equal(run(lock, ['bash', '-c', 'exit 7']).status, 7);
	assert.equal(fs.existsSync(lock + '.d'), false);
});

test('git-lock takes over a lock whose owner pid is gone', () => {
	const lock = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'gl-')), 'l');
	fs.mkdirSync(lock + '.d');
	fs.writeFileSync(lock + '.d/pid', '999999');
	const r = run(lock, ['echo', 'ran']);
	assert.equal(r.status, 0);
	assert.match(r.stdout, /ran/);
	assert.match(r.stderr, /stale lock/);
});

test('git-lock takes over a live-owner lock older than the stale timeout', () => {
	const lock = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'gl-')), 'l');
	fs.mkdirSync(lock + '.d');
	fs.writeFileSync(lock + '.d/pid', String(process.pid));
	const old = new Date(Date.now() - 600000);
	fs.utimesSync(lock + '.d', old, old);
	const r = run(lock, ['echo', 'ran'], { GIT_LOCK_STALE: '60' });
	assert.equal(r.status, 0);
});

test('git-lock gives up with 75 while a live owner holds a fresh lock', () => {
	const lock = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'gl-')), 'l');
	fs.mkdirSync(lock + '.d');
	fs.writeFileSync(lock + '.d/pid', String(process.pid));
	const r = run(lock, ['echo', 'never'], { GIT_LOCK_WAIT: '1' });
	assert.equal(r.status, 75);
	assert.doesNotMatch(r.stdout, /never/);
});

test('git-lock serializes two concurrent holders', async () => {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gl-'));
	const lock = path.join(dir, 'l');
	const log = path.join(dir, 'log');
	const job = (name) => new Promise((resolve) => {
		const p = spawn('bash', [LOCK, lock, process.execPath, '-e', LOCK_JOB, name, log], { env: lockEnv() });
		p.on('close', resolve);
	});
	await Promise.all([job('a'), job('b')]);
	const lines = fs.readFileSync(log, 'utf8').trim().split('\n');
	assert.equal(lines.length, 4);
	assert.equal(lines[0].replace('start-', ''), lines[1].replace('end-', ''));
	assert.equal(lines[2].replace('start-', ''), lines[3].replace('end-', ''));
});
