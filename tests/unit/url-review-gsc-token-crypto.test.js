'use strict';

const crypto = require('crypto');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const gscCrypto = require('../../functions/url-review-gsc-token-crypto');

const DEV_KEY = gscCrypto.generateDevKey();
const ENV = { REVIEW_GSC_TOKEN_ENCRYPTION_KEY: DEV_KEY };
const SAMPLE_REFRESH = '1//0refresh-token-from-google-example';

test('encryptionReady is false without a key', () => {
	assert.equal(gscCrypto.encryptionReady({}), false);
	assert.equal(gscCrypto.encryptionReady({ REVIEW_GSC_TOKEN_ENCRYPTION_KEY: '' }), false);
	assert.equal(gscCrypto.encryptionReady({ REVIEW_GSC_TOKEN_ENCRYPTION_KEY: 'short' }), false);
});

test('encryptionReady accepts 32-byte base64url and 64-char hex keys', () => {
	assert.equal(gscCrypto.encryptionReady(ENV), true);
	const hex = crypto.randomBytes(32).toString('hex');
	assert.equal(gscCrypto.encryptionReady({ REVIEW_GSC_TOKEN_ENCRYPTION_KEY: hex }), true);
});

test('encrypt round-trips a refresh token', () => {
	const sealed = gscCrypto.encryptRefreshToken(SAMPLE_REFRESH, ENV);
	assert.match(sealed, /^gsc1:/);
	assert.notEqual(sealed, SAMPLE_REFRESH);
	const plain = gscCrypto.decryptRefreshToken(sealed, ENV);
	assert.equal(plain, SAMPLE_REFRESH);
});

test('ciphertext differs per call (random IV)', () => {
	const a = gscCrypto.encryptRefreshToken(SAMPLE_REFRESH, ENV);
	const b = gscCrypto.encryptRefreshToken(SAMPLE_REFRESH, ENV);
	assert.notEqual(a, b);
	assert.equal(gscCrypto.decryptRefreshToken(a, ENV), gscCrypto.decryptRefreshToken(b, ENV));
});

test('decrypt rejects wrong key', () => {
	const sealed = gscCrypto.encryptRefreshToken(SAMPLE_REFRESH, ENV);
	const other = { REVIEW_GSC_TOKEN_ENCRYPTION_KEY: gscCrypto.generateDevKey() };
	assert.throws(() => gscCrypto.decryptRefreshToken(sealed, other), /bad decrypt|unable to authenticate/i);
});

test('decrypt passes through legacy plaintext refresh tokens', () => {
	assert.equal(gscCrypto.decryptRefreshToken(SAMPLE_REFRESH, {}), SAMPLE_REFRESH);
});

test('sealTokenRow encrypts and openTokenRow decrypts', () => {
	const row = {
		refreshToken: SAMPLE_REFRESH,
		accessToken: 'atk',
		googleEmail: 'gsc@example.com',
	};
	const sealed = gscCrypto.sealTokenRow(row, ENV, { strict: true });
	assert.ok(gscCrypto.isEncryptedRefresh(sealed.refreshToken));
	assert.equal(sealed.refreshTokenEnc, 'gsc1');
	const opened = gscCrypto.openTokenRow(sealed, ENV);
	assert.equal(opened.refreshToken, SAMPLE_REFRESH);
	assert.equal(opened.googleEmail, 'gsc@example.com');
});

test('sealTokenRow strict throws when encryption key is missing', () => {
	assert.throws(
		() => gscCrypto.sealTokenRow({ refreshToken: SAMPLE_REFRESH }, {}, { strict: true }),
		/REVIEW_GSC_TOKEN_ENCRYPTION_KEY/
	);
});

test('sealTokenRow without strict keeps plaintext when key is missing', () => {
	const row = { refreshToken: SAMPLE_REFRESH };
	const out = gscCrypto.sealTokenRow(row, {});
	assert.equal(out.refreshToken, SAMPLE_REFRESH);
});

test('requireEncryptionAtRest throws when OAuth is on but key is missing', () => {
	const oauthNoKey = { REVIEW_GSC_OAUTH_CLIENT_ID: 'client', REVIEW_GSC_OAUTH_CLIENT_SECRET: 'secret' };
	assert.throws(() => gscCrypto.requireEncryptionAtRest(oauthNoKey), /REVIEW_GSC_TOKEN_ENCRYPTION_KEY/);
	assert.doesNotThrow(() => gscCrypto.requireEncryptionAtRest(ENV));
	assert.doesNotThrow(() => gscCrypto.requireEncryptionAtRest({}));
});

test('refreshTokenUsable and tokenRevoked', () => {
	const now = Date.now();
	const fresh = {
		refreshToken: gscCrypto.encryptRefreshToken(SAMPLE_REFRESH, ENV),
		accessExpiresAt: new Date(now + 3600_000).toISOString(),
		accessToken: 'atk',
	};
	assert.equal(gscCrypto.refreshTokenUsable(fresh, ENV), true);
	assert.equal(gscCrypto.tokenRevoked(fresh), false);
	const revoked = gscCrypto.markRevoked(fresh, now, { error: 'invalid_grant' });
	assert.equal(gscCrypto.tokenRevoked(revoked), true);
	assert.equal(gscCrypto.refreshTokenUsable(revoked, ENV), false);
	assert.ok(revoked.revokedAt);
	assert.equal(revoked.error, 'invalid_grant');
});

test('accessFresh honors skew', () => {
	const now = 1_700_000_000_000;
	const row = {
		accessToken: 'atk',
		accessExpiresAt: new Date(now + 120_000).toISOString(),
	};
	assert.equal(gscCrypto.accessFresh(row, now, 60_000), true);
	assert.equal(gscCrypto.accessFresh(row, now + 70_000, 60_000), false);
});

test('stripRefreshSecret removes bearer and refresh fields', () => {
	const scrubbed = gscCrypto.stripRefreshSecret({
		refreshToken: 'rt',
		accessToken: 'at',
		googleEmail: 'a@b.com',
	});
	assert.equal(scrubbed.googleEmail, 'a@b.com');
	assert.equal('refreshToken' in scrubbed, false);
	assert.equal('accessToken' in scrubbed, false);
});