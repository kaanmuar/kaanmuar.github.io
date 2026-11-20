const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const soft = require('../../functions/url-review-soft-quota');

describe('soft preview quotas (#3478)', () => {
	test('anonymous IP cap is 5 and signed-in email cap is 20', () => {
		assert.equal(soft.SOFT_ANON_CAP, 5);
		assert.equal(soft.SOFT_SIGNED_CAP, 20);
		assert.equal(soft.identityOf({ ip: '1.2.3.4' }).cap, 5);
		assert.equal(soft.identityOf({ ip: '1.2.3.4', email: 'ana@example.org' }).cap, 20);
		assert.equal(soft.identityOf({ email: 'Ana@Example.org' }).kind, 'email');
	});

	test('memory store counts per UTC day and stops at the cap', async () => {
		const store = soft.memoryStore();
		const ip = '203.0.113.9';
		for (let i = 0; i < 5; i += 1) {
			const took = await store.take({ ip });
			assert.equal(took.ok, true, 'take ' + i);
			assert.equal(took.left, 4 - i);
		}
		const blocked = await store.take({ ip });
		assert.equal(blocked.ok, false);
		assert.equal(blocked.code, 'soft-quota');
		assert.equal(blocked.left, 0);
		const peek = await store.peek({ ip });
		assert.equal(peek.ok, false);
		assert.equal(peek.count, 5);
		assert.match(soft.quotaMessage(blocked), /5 free previews/);
	});

	test('signed-in email uses a separate higher bucket', async () => {
		const store = soft.memoryStore();
		const ip = '203.0.113.10';
		for (let i = 0; i < 5; i += 1) assert.equal((await store.take({ ip })).ok, true);
		assert.equal((await store.take({ ip })).ok, false);
		const email = 'ana@example.org';
		const first = await store.take({ ip, email });
		assert.equal(first.ok, true);
		assert.equal(first.cap, 20);
		assert.equal(first.signedIn, true);
		assert.match(soft.quotaMessage({ signedIn: true }), /20 signed-in/);
	});

	test('quota keys never embed the raw IP', () => {
		const key = soft.softKey('ip', '203.0.113.11');
		assert.equal(key.length, 40);
		assert.ok(!key.includes('203'));
	});
});
