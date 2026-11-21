/**
 * CodeQL js/insufficient-password-hash (#154, ticket #4087).
 * Auth stores digests of random device keys, sessions, and sign-in secrets — not user passwords.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const auth = require('../../functions/url-review-auth');

const DESKTOP = 'a'.repeat(64);

test('email sign-in codes are stored with scrypt, not plain SHA-256 (#4087)', async () => {
	const store = auth.memoryStore();
	const started = await auth.startEmail(store, { email: 'ana@example.com', deviceKey: DESKTOP, ip: '1.1.1.1' });
	const row = await store.get('url_review_sign_ins', started.id);
	assert.match(row.codeHash, new RegExp('^' + auth.SIGNIN_CODE_PREFIX));
	assert.ok(row.codeHash.length > 64);
	assert.match(row.tokenHash, /^[a-f0-9]{64}$/);
	const signed = await auth.finishEmail(store, { id: started.id, code: started.code, deviceKey: DESKTOP });
	assert.equal(signed.ok, true);
});

test('a legacy SHA-256 code hash still opens until it expires (#4087)', async () => {
	const store = auth.memoryStore();
	const now = Date.now();
	const started = await auth.startEmail(store, { email: 'ana@example.com', deviceKey: DESKTOP, now });
	await store.set('url_review_sign_ins', started.id, {
		codeHash: auth.sha256Hex(started.id + ':' + started.code),
		tokenHash: started.token && auth.sha256Hex(started.id + ':' + started.token),
	});
	const signed = await auth.finishEmail(store, { id: started.id, code: started.code, deviceKey: DESKTOP, now });
	assert.equal(signed.ok, true);
});

test('device binding hashes 256-bit random keys with SHA-256 only (#4087)', () => {
	const key = 'f'.repeat(64);
	assert.equal(auth.deviceHash(key), auth.sha256Hex('device:' + key));
});