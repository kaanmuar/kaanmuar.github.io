'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const auth = require('../../functions/url-review-auth');
const gscOauth = require('../../functions/url-review-gsc-oauth');
const gscCrypto = require('../../functions/url-review-gsc-token-crypto');

const DESKTOP = 'a'.repeat(64);
const EMAIL = 'owner@example.com';
const PAGE = 'https://carlosandmunoz.com/qa-review.html';
const ENV = {
	REVIEW_GSC_OAUTH_CLIENT_ID: 'gsc-client',
	REVIEW_GSC_OAUTH_CLIENT_SECRET: 'gsc-secret',
	REVIEW_GSC_OAUTH_REDIRECT_ORIGINS: 'https://carlosandmunoz.com,http://127.0.0.1:8765',
	REVIEW_GSC_TOKEN_ENCRYPTION_KEY: gscCrypto.generateDevKey(),
};
const ENV_NO_ENCRYPTION_KEY = {
	REVIEW_GSC_OAUTH_CLIENT_ID: 'gsc-client',
	REVIEW_GSC_OAUTH_CLIENT_SECRET: 'gsc-secret',
	REVIEW_GSC_OAUTH_REDIRECT_ORIGINS: ENV.REVIEW_GSC_OAUTH_REDIRECT_ORIGINS,
};

function memoryCalls(tokenBody, sitesBody) {
	const calls = [];
	const fetcher = async (url, options) => {
		calls.push({ url, options });
		if (url === 'https://oauth2.googleapis.com/token') {
			const body = options && options.body ? Object.fromEntries(new URLSearchParams(options.body)) : {};
			if (body.grant_type === 'refresh_token') {
				return { ok: true, status: 200, json: async () => ({ access_token: 'atk-ref', expires_in: 3600 }) };
			}
			return {
				ok: true,
				status: 200,
				json: async () =>
					Object.assign(
						{
							access_token: 'atk-1',
							refresh_token: 'rtk-1',
							expires_in: 3600,
							scope: gscOauth.SCOPE_READONLY + ' openid email',
							id_token:
								'eyJhbGciOiJub25lIn0.' +
								Buffer.from(JSON.stringify({ sub: 'sub-9', email: 'gsc@example.com' })).toString('base64url') +
								'.',
						},
						tokenBody || {}
					),
			};
		}
		if (url === 'https://www.googleapis.com/webmasters/v3/sites') {
			return {
				ok: true,
				status: 200,
				json: async () =>
					sitesBody || {
						siteEntry: [{ siteUrl: 'sc-domain:example.com', permissionLevel: 'siteOwner' }],
					},
			};
		}
		if (url === 'https://oauth2.googleapis.com/revoke') return { ok: true, status: 200, json: async () => ({}) };
		return { ok: false, status: 404, json: async () => ({}) };
	};
	return { fetcher, calls };
}

test('ready is false until GSC OAuth client id and secret are set', () => {
	assert.equal(gscOauth.ready({}), false);
	assert.equal(gscOauth.ready({ REVIEW_GSC_OAUTH_CLIENT_ID: 'x' }), false);
	assert.equal(gscOauth.ready(ENV), true);
});

test('startConnect stores state and builds a Google authorize URL', async () => {
	const store = auth.memoryStore();
	const started = await gscOauth.startConnect(store, {
		email: EMAIL,
		deviceKey: DESKTOP,
		redirectUri: PAGE,
		env: ENV,
	});
	assert.equal(started.ok, true);
	const url = new URL(started.url);
	assert.equal(url.origin + url.pathname, 'https://accounts.google.com/o/oauth2/v2/auth');
	assert.equal(url.searchParams.get('client_id'), 'gsc-client');
	assert.equal(url.searchParams.get('redirect_uri'), PAGE);
	assert.match(url.searchParams.get('scope') || '', /webmasters\.readonly/);
	assert.equal(url.searchParams.get('access_type'), 'offline');
	const row = await store.get(gscOauth.COL_OAUTH, started.state);
	assert.equal(row.email, EMAIL);
	assert.equal(row.deviceHash, auth.deviceHash(DESKTOP));
});

test('finishConnect exchanges the code and stores refresh token server-side only', async () => {
	const store = auth.memoryStore();
	const { fetcher } = memoryCalls();
	const started = await gscOauth.startConnect(store, {
		email: EMAIL,
		deviceKey: DESKTOP,
		redirectUri: PAGE,
		env: ENV,
	});
	const finished = await gscOauth.finishConnect(store, {
		email: EMAIL,
		deviceKey: DESKTOP,
		state: started.state,
		code: 'code-1',
		env: ENV,
		fetch: fetcher,
	});
	assert.equal(finished.ok, true);
	assert.equal(finished.connected.googleEmail, 'gsc@example.com');
	const token = await store.get(gscOauth.COL_TOKENS, EMAIL);
	assert.ok(gscCrypto.isEncryptedRefresh(token.refreshToken));
	assert.equal(gscCrypto.decryptRefreshToken(token.refreshToken, ENV), 'rtk-1');
	assert.equal(token.accessToken, 'atk-1');
	assert.equal(finished.connected.refreshToken, undefined);
});

test('finishConnect refuses the wrong device', async () => {
	const store = auth.memoryStore();
	const started = await gscOauth.startConnect(store, {
		email: EMAIL,
		deviceKey: DESKTOP,
		redirectUri: PAGE,
		env: ENV,
	});
	const { fetcher } = memoryCalls();
	const finished = await gscOauth.finishConnect(store, {
		email: EMAIL,
		deviceKey: 'b'.repeat(64),
		state: started.state,
		code: 'code-1',
		env: ENV,
		fetch: fetcher,
	});
	assert.equal(finished.status, 403);
	assert.equal(finished.code, 'other-device');
});

test('finishConnect refuses to store tokens when encryption key is missing', async () => {
	const store = auth.memoryStore();
	const { fetcher } = memoryCalls();
	const started = await gscOauth.startConnect(store, {
		email: EMAIL,
		deviceKey: DESKTOP,
		redirectUri: PAGE,
		env: ENV_NO_ENCRYPTION_KEY,
	});
	assert.equal(started.ok, false);
	assert.equal(started.status, 503);
});

test('disconnectConnect sends plaintext refresh to Google revoke', async () => {
	const store = auth.memoryStore();
	const { fetcher, calls } = memoryCalls();
	const started = await gscOauth.startConnect(store, {
		email: EMAIL,
		deviceKey: DESKTOP,
		redirectUri: PAGE,
		env: ENV,
	});
	await gscOauth.finishConnect(store, {
		email: EMAIL,
		deviceKey: DESKTOP,
		state: started.state,
		code: 'code-1',
		env: ENV,
		fetch: fetcher,
	});
	await gscOauth.disconnectConnect(store, { email: EMAIL, env: ENV, fetch: fetcher });
	const revoke = calls.find((row) => row.url === 'https://oauth2.googleapis.com/revoke');
	assert.ok(revoke);
	assert.match(revoke.options.body, /token=rtk-1/);
});

test('connectStatus reports closed when secrets are missing', async () => {
	const store = auth.memoryStore();
	const status = await gscOauth.connectStatus(store, { email: EMAIL, env: {} });
	assert.equal(status.ok, true);
	assert.equal(status.open, false);
	assert.equal(status.connected, false);
});

test('disconnectConnect revokes and clears token and bind', async () => {
	const store = auth.memoryStore();
	const { fetcher, calls } = memoryCalls();
	const started = await gscOauth.startConnect(store, {
		email: EMAIL,
		deviceKey: DESKTOP,
		redirectUri: PAGE,
		env: ENV,
	});
	await gscOauth.finishConnect(store, {
		email: EMAIL,
		deviceKey: DESKTOP,
		state: started.state,
		code: 'code-1',
		env: ENV,
		fetch: fetcher,
	});
	await store.set(gscOauth.COL_ACCOUNTS, EMAIL, {
		gsc: { siteUrl: 'sc-domain:example.com', kind: 'domain', host: 'example.com', boundAt: '2026-01-01T00:00:00.000Z' },
	});
	const out = await gscOauth.disconnectConnect(store, { email: EMAIL, env: ENV, fetch: fetcher });
	assert.equal(out.ok, true);
	assert.ok(calls.some((row) => row.url === 'https://oauth2.googleapis.com/revoke'));
	const token = await store.get(gscOauth.COL_TOKENS, EMAIL);
	assert.ok(token.revokedAt);
	const account = await store.get(gscOauth.COL_ACCOUNTS, EMAIL);
	assert.equal(account.gsc, null);
});

test('bindProperty requires a listed site', async () => {
	const store = auth.memoryStore();
	const { fetcher } = memoryCalls();
	const started = await gscOauth.startConnect(store, {
		email: EMAIL,
		deviceKey: DESKTOP,
		redirectUri: PAGE,
		env: ENV,
	});
	await gscOauth.finishConnect(store, {
		email: EMAIL,
		deviceKey: DESKTOP,
		state: started.state,
		code: 'code-1',
		env: ENV,
		fetch: fetcher,
	});
	const bound = await gscOauth.bindProperty(store, {
		email: EMAIL,
		siteUrl: 'sc-domain:example.com',
		env: ENV,
		fetch: fetcher,
	});
	assert.equal(bound.ok, true);
	assert.equal(bound.bound.siteUrl, 'sc-domain:example.com');
	const bad = await gscOauth.bindProperty(store, {
		email: EMAIL,
		siteUrl: 'sc-domain:other.test',
		env: ENV,
		fetch: fetcher,
	});
	assert.equal(bad.status, 400);
});