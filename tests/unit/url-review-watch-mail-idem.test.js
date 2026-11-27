'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const W = require('../../functions/url-review-watch-mail-idem');
const webhookIdem = require('../../functions/webhook-idempotency');

const record = {
	id: 'rep-new',
	watchOf: 'rep-old',
	email: 'agency@client.com',
	report: { host: 'Example.COM' },
};

test('watchIdOf prefers watchSubId then email__host (#4396)', () => {
	assert.equal(W.watchIdOf(Object.assign({}, record, { watchSubId: 'sub-1' })), 'sub-1');
	assert.equal(W.watchIdOf(record), 'agency@client.com__example.com');
	assert.equal(W.watchIdOf({ watchOf: 'only-prior' }), 'only-prior');
});

test('windowKeyOf uses watchWindow or report id (#4396)', () => {
	assert.equal(W.windowKeyOf(Object.assign({}, record, { watchWindow: '2026-W48' })), '2026-W48');
	assert.equal(W.windowKeyOf(record), 'rep-new');
});

test('sendKey is stable and distinct per window (#4396)', () => {
	const a = W.sendKey('sub-1', '2026-W48');
	const b = W.sendKey('sub-1', '2026-W48');
	const c = W.sendKey('sub-1', '2026-W49');
	assert.deepEqual(a, b);
	assert.notEqual(a.docId, c.docId);
	assert.equal(W.sendKey('', 'x'), null);
});

test('cronGate: dry-run unless env on; allowlist when set (#4396)', () => {
	const env = {};
	assert.equal(W.cronGate({ env, email: 'a@example.com' }).why, 'dry-run');
	env[W.ENV_SEND] = 'on';
	assert.deepEqual(W.cronGate({ env, email: 'a@example.com' }), { ok: true });
	env[W.ENV_ALLOWLIST] = 'desk@carlosandmunoz.com, agency@client.com';
	assert.equal(W.cronGate({ env, email: 'other@example.com' }).why, 'not-allowlisted');
	assert.deepEqual(W.cronGate({ env, email: 'agency@client.com' }), { ok: true });
});

test('listUnsubscribeHeaders and mergeMailHeaders (#4396)', () => {
	const h = W.listUnsubscribeHeaders('https://x.test/stop?t=1');
	assert.equal(h['List-Unsubscribe'], '<https://x.test/stop?t=1>');
	assert.equal(h['List-Unsubscribe-Post'], 'List-Unsubscribe=One-Click');
	assert.deepEqual(W.listUnsubscribeHeaders(''), {});
	const mail = W.mergeMailHeaders({ subject: 's' }, 'https://x.test/stop');
	assert.equal(mail.headers['List-Unsubscribe'], '<https://x.test/stop>');
});

test('sendOnce: duplicate delivery does not double-send (#4396)', async () => {
	const store = webhookIdem.memoryStore();
	const env = { [W.ENV_SEND]: 'on' };
	let sends = 0;
	const input = {
		store,
		env,
		record,
		stopUrl: 'https://x.test/stop',
		send: async ({ headers }) => {
			sends++;
			assert.equal(headers['List-Unsubscribe'], '<https://x.test/stop>');
			return true;
		},
	};
	const first = await W.sendOnce(input);
	const second = await W.sendOnce(input);
	assert.equal(first.sent, true);
	assert.equal(first.state, 'new');
	assert.equal(second.sent, false);
	assert.equal(second.state, 'duplicate');
	assert.equal(sends, 1);
});

test('sendOnce: refuses when gate is dry-run (#4396)', async () => {
	let sends = 0;
	const out = await W.sendOnce({
		store: webhookIdem.memoryStore(),
		env: {},
		record,
		stopUrl: 'https://x.test/stop',
		send: async () => {
			sends++;
			return true;
		},
	});
	assert.equal(out.why, 'dry-run');
	assert.equal(sends, 0);
});

test('sendOnce: busy while another send holds the lease (#4396)', async () => {
	const store = webhookIdem.memoryStore();
	const env = { [W.ENV_SEND]: 'on' };
	let release;
	const gate = new Promise((resolve) => (release = resolve));
	let sends = 0;
	const base = { store, env, record, stopUrl: 'https://x.test/stop' };
	const slow = W.sendOnce(
		Object.assign({}, base, {
			send: async () => {
				sends++;
				await gate;
				return true;
			},
		})
	);
	const busy = await W.sendOnce(
		Object.assign({}, base, {
			send: async () => {
				sends++;
				return true;
			},
		})
	);
	assert.equal(busy.state, 'busy');
	assert.equal(busy.sent, false);
	release();
	await slow;
	assert.equal(sends, 1);
});