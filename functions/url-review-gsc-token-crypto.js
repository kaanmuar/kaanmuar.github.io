'use strict';

/* AES-256-GCM for GSC OAuth refresh tokens at rest (#4395). Key: REVIEW_GSC_TOKEN_ENCRYPTION_KEY
   (Secret Manager / .env). url-review-gsc-oauth.js (#4393) should seal on write and open on read. */

const crypto = require('crypto');

const PREFIX = 'gsc1:';
const ALGO = 'aes-256-gcm';
const IV_LEN = 12;
const TAG_LEN = 16;
const KEY_BYTES = 32;
const DEFAULT_ACCESS_SKEW_MS = 60 * 1000;

function parseKey(env) {
	const raw = String((env || {}).REVIEW_GSC_TOKEN_ENCRYPTION_KEY || '').trim();
	if (!raw) return null;
	if (/^[0-9a-f]{64}$/i.test(raw)) return Buffer.from(raw, 'hex');
	for (const enc of ['base64url', 'base64']) {
		try {
			const buf = Buffer.from(raw, enc);
			if (buf.length === KEY_BYTES) return buf;
		} catch (_) {
			/* try next encoding */
		}
	}
	return null;
}

function encryptionReady(env) {
	return !!parseKey(env);
}

function gscOauthConfigured(env) {
	const clientId = String((env || {}).REVIEW_GSC_OAUTH_CLIENT_ID || '').trim();
	const secret = String((env || {}).REVIEW_GSC_OAUTH_CLIENT_SECRET || '').trim();
	return !!(clientId && secret);
}

function requireEncryptionAtRest(env) {
	if (gscOauthConfigured(env) && !encryptionReady(env)) {
		throw new Error('REVIEW_GSC_TOKEN_ENCRYPTION_KEY is required when GSC OAuth is configured');
	}
}

function isEncryptedRefresh(value) {
	return String(value || '').startsWith(PREFIX);
}

function encryptRefreshToken(plain, env) {
	const key = parseKey(env);
	if (!key) throw new Error('REVIEW_GSC_TOKEN_ENCRYPTION_KEY is not set');
	const iv = crypto.randomBytes(IV_LEN);
	const cipher = crypto.createCipheriv(ALGO, key, iv);
	const enc = Buffer.concat([cipher.update(String(plain), 'utf8'), cipher.final()]);
	const tag = cipher.getAuthTag();
	return PREFIX + Buffer.concat([iv, tag, enc]).toString('base64url');
}

function decryptRefreshToken(stored, env) {
	const s = String(stored || '');
	if (!s) return '';
	if (!isEncryptedRefresh(s)) return s;
	const key = parseKey(env);
	if (!key) throw new Error('REVIEW_GSC_TOKEN_ENCRYPTION_KEY is not set');
	const buf = Buffer.from(s.slice(PREFIX.length), 'base64url');
	if (buf.length < IV_LEN + TAG_LEN + 1) throw new Error('GSC refresh token ciphertext is truncated');
	const iv = buf.subarray(0, IV_LEN);
	const tag = buf.subarray(IV_LEN, IV_LEN + TAG_LEN);
	const data = buf.subarray(IV_LEN + TAG_LEN);
	const decipher = crypto.createDecipheriv(ALGO, key, iv);
	decipher.setAuthTag(tag);
	return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
}

function sealTokenRow(row, env, options) {
	if (!row || !row.refreshToken || isEncryptedRefresh(row.refreshToken)) return row;
	const strict = !!(options && options.strict);
	if (!encryptionReady(env)) {
		if (strict) throw new Error('REVIEW_GSC_TOKEN_ENCRYPTION_KEY is not set');
		return row;
	}
	return Object.assign({}, row, {
		refreshToken: encryptRefreshToken(row.refreshToken, env),
		refreshTokenEnc: 'gsc1',
	});
}

function openTokenRow(row, env) {
	if (!row || !row.refreshToken || !isEncryptedRefresh(row.refreshToken)) return row;
	return Object.assign({}, row, {
		refreshToken: decryptRefreshToken(row.refreshToken, env),
	});
}

function accessFresh(row, now, skewMs) {
	const skew = skewMs == null ? DEFAULT_ACCESS_SKEW_MS : skewMs;
	if (!row || !row.accessToken || !row.accessExpiresAt) return false;
	return Date.parse(row.accessExpiresAt) > (now || Date.now()) + skew;
}

function tokenRevoked(row) {
	return !!(row && row.revokedAt);
}

function refreshTokenUsable(row, env) {
	if (!row || tokenRevoked(row)) return false;
	const rt = row.refreshToken;
	if (!rt) return false;
	if (isEncryptedRefresh(rt)) {
		if (!encryptionReady(env)) return false;
		try {
			return !!decryptRefreshToken(rt, env);
		} catch (_) {
			return false;
		}
	}
	return true;
}

function markRevoked(row, now, extra) {
	return Object.assign({}, row || {}, { revokedAt: new Date(now || Date.now()).toISOString() }, extra || {});
}

function stripRefreshSecret(row) {
	if (!row) return row;
	const next = Object.assign({}, row);
	delete next.refreshToken;
	delete next.accessToken;
	return next;
}

function generateDevKey() {
	return crypto.randomBytes(KEY_BYTES).toString('base64url');
}

module.exports = {
	PREFIX,
	DEFAULT_ACCESS_SKEW_MS,
	encryptionReady,
	gscOauthConfigured,
	requireEncryptionAtRest,
	isEncryptedRefresh,
	encryptRefreshToken,
	decryptRefreshToken,
	sealTokenRow,
	openTokenRow,
	accessFresh,
	tokenRevoked,
	refreshTokenUsable,
	markRevoked,
	stripRefreshSecret,
	generateDevKey,
};