const test = require('node:test');
const assert = require('node:assert/strict');

const load = () => import('../../workers/preflight/src/index.js');
const reject = () => new Request('https://preflight.test/triage', { method: 'POST', headers: { authorization: 'Bearer nope', 'cf-connecting-ip': '8.8.8.8' }, body: '{}' });

test('without a GEOIP binding a rejected call is still a 401 and the lookup is null', async () => {
	const { default: worker, lookupCaller } = await load();
	assert.equal(await lookupCaller(reject(), {}), null);
	const pending = [];
	const res = await worker.fetch(reject(), { TOKEN: 'secret' }, { waitUntil: (p) => pending.push(p) });
	assert.equal(res.status, 401);
	await Promise.all(pending);
});

test('a broken GEOIP binding never breaks the 401', async () => {
	const { default: worker } = await load();
	const pending = [];
	const bucket = { get: async () => { throw new Error('r2 down'); } };
	const res = await worker.fetch(reject(), { TOKEN: 'secret', GEOIP: bucket }, { waitUntil: (p) => pending.push(p) });
	assert.equal(res.status, 401);
	await Promise.all(pending);
});

test('a missing database object logs geo unknown', async () => {
	const { default: worker } = await load();
	const logs = [];
	const warn = console.warn;
	console.warn = (...a) => logs.push(a.join(' '));
	try {
		const pending = [];
		await worker.fetch(reject(), { TOKEN: 'secret', GEOIP: { get: async () => null } }, { waitUntil: (p) => pending.push(p) });
		await Promise.all(pending);
	} finally { console.warn = warn; }
	assert.deepEqual(logs, ['unauthorized /triage geo unknown']);
});
