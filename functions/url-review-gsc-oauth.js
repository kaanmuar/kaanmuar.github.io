'use strict';

/* Customer Search Console OAuth (#4377 / #4389). Incremental Google auth with webmasters.readonly only.
   Refresh tokens stay on the server (Firestore url_review_gsc_tokens); the browser never sees them. */

const crypto = require('crypto');
const reviewAuth = require('./url-review-auth');
const gscProp = require('./url-review-gsc-property');

const COL_OAUTH = 'url_review_gsc_oauth';
const COL_TOKENS = 'url_review_gsc_tokens';
const COL_ACCOUNTS = 'url_review_accounts';
const STATE_MS = 10 * 60 * 1000;
const ACCESS_SKEW_MS = 60 * 1000;

const SCOPE_READONLY = 'https://www.googleapis.com/auth/webmasters.readonly';
const SCOPES = [SCOPE_READONLY, 'openid', 'email'];
const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const REVOKE_URL = 'https://oauth2.googleapis.com/revoke';
const SITES_URL = 'https://www.googleapis.com/webmasters/v3/sites';
const DEFAULT_REDIRECT_ORIGINS = 'https://carlosandmunoz.com,http://127.0.0.1:8765';

function fail(status, error, extra) {
	return Object.assign({ ok: false, status, error }, extra || {});
}

function clip(text, max) {
	return String(text == null ? '' : text)
		.replace(/\s+/g, ' ')
		.trim()
		.slice(0, max);
}

function credentials(env) {
	const clientId = String((env || {}).REVIEW_GSC_OAUTH_CLIENT_ID || '').trim();
	const secret = String((env || {}).REVIEW_GSC_OAUTH_CLIENT_SECRET || '').trim();
	return clientId && secret ? { clientId, secret } : null;
}

function ready(env) {
	return !!credentials(env);
}

function redirectOrigins(env) {
	const raw = String((env || {}).REVIEW_GSC_OAUTH_REDIRECT_ORIGINS || DEFAULT_REDIRECT_ORIGINS);
	return raw
		.split(',')
		.map((part) => part.trim())
		.filter(Boolean);
}

function redirectAllowed(env, redirectUri) {
	if (!redirectUri) return false;
	try {
		const origin = new URL(String(redirectUri)).origin;
		return redirectOrigins(env).indexOf(origin) !== -1;
	} catch (_) {
		return false;
	}
}

function idTokenClaims(idToken) {
	try {
		return JSON.parse(Buffer.from(String(idToken || '').split('.')[1] || '', 'base64url').toString('utf8'));
	} catch (_) {
		return {};
	}
}

function scopeOk(scope) {
	const parts = String(scope || '')
		.split(/\s+/)
		.filter(Boolean);
	return parts.indexOf(SCOPE_READONLY) !== -1;
}

function publicTokenRow(row) {
	if (!row || row.revokedAt) return null;
	return {
		googleEmail: row.googleEmail || '',
		googleSub: row.googleSub || '',
		scopes: row.scopes || '',
		connectedAt: row.connectedAt || '',
	};
}

function publicBind(accountRow) {
	const gsc = accountRow && accountRow.gsc;
	if (!gsc || !gsc.siteUrl) return null;
	const norm = gscProp.normalizeGscProperty(gsc.siteUrl);
	if (!norm) return null;
	return {
		siteUrl: norm.siteUrl,
		kind: norm.kind,
		host: norm.host,
		boundAt: gsc.boundAt || '',
	};
}

async function postForm(fetcher, url, form) {
	const res = await fetcher(url, {
		method: 'POST',
		headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' },
		body: new URLSearchParams(form).toString(),
		signal: AbortSignal.timeout(15000),
	});
	const data = await res.json().catch(() => ({}));
	return { res, data };
}

function accessExpiry(now, expiresIn) {
	const sec = Number(expiresIn) || 3600;
	return new Date((now || Date.now()) + sec * 1000).toISOString();
}

function accessFresh(row, now) {
	if (!row || !row.accessToken || !row.accessExpiresAt) return false;
	return Date.parse(row.accessExpiresAt) > (now || Date.now()) + ACCESS_SKEW_MS;
}

async function exchangeCode(keys, redirectUri, code, fetcher) {
	const { res, data } = await postForm(fetcher, TOKEN_URL, {
		code,
		client_id: keys.clientId,
		client_secret: keys.secret,
		redirect_uri: redirectUri,
		grant_type: 'authorization_code',
	});
	if (!res.ok || !data.access_token)
		throw new Error('Google token ' + res.status + ': ' + clip(data.error_description || data.error, 160));
	return data;
}

async function refreshAccess(keys, refreshToken, fetcher) {
	const { res, data } = await postForm(fetcher, TOKEN_URL, {
		client_id: keys.clientId,
		client_secret: keys.secret,
		refresh_token: refreshToken,
		grant_type: 'refresh_token',
	});
	if (!res.ok || !data.access_token)
		throw new Error('Google refresh ' + res.status + ': ' + clip(data.error_description || data.error, 160));
	return data;
}

async function ensureAccess(store, email, env, fetcher, now) {
	const keys = credentials(env);
	if (!keys) return fail(503, 'Search Console connect is not open yet.');
	const row = await store.get(COL_TOKENS, email);
	if (!row || row.revokedAt || !row.refreshToken) return fail(404, 'Search Console is not connected for this account.');
	if (accessFresh(row, now)) return { ok: true, accessToken: row.accessToken, row };
	try {
		const data = await refreshAccess(keys, row.refreshToken, fetcher);
		const next = {
			accessToken: data.access_token,
			accessExpiresAt: accessExpiry(now, data.expires_in),
			refreshedAt: new Date(now).toISOString(),
		};
		await store.set(COL_TOKENS, email, Object.assign({}, row, next));
		return { ok: true, accessToken: data.access_token, row: Object.assign({}, row, next) };
	} catch (error) {
		if (/invalid_grant/i.test(error.message)) {
			await store.set(COL_TOKENS, email, {
				revokedAt: new Date(now).toISOString(),
				error: 'invalid_grant',
			});
			return fail(410, 'Search Console access expired. Connect again.', { code: 'reconnect' });
		}
		throw error;
	}
}

function connectAuthorizeUrl(keys, redirectUri, state) {
	const url = new URL(AUTH_URL);
	url.searchParams.set('client_id', keys.clientId);
	url.searchParams.set('redirect_uri', redirectUri);
	url.searchParams.set('response_type', 'code');
	url.searchParams.set('scope', SCOPES.join(' '));
	url.searchParams.set('access_type', 'offline');
	url.searchParams.set('prompt', 'consent');
	url.searchParams.set('include_granted_scopes', 'true');
	url.searchParams.set('state', state);
	return url.toString();
}

async function startConnect(store, input) {
	const now = input.now || Date.now();
	if (!ready(input.env)) return fail(503, 'Search Console connect is not open yet.');
	const email = reviewAuth.cleanEmail(input.email);
	if (!email) return fail(401, 'Sign in first.');
	const device = reviewAuth.deviceHash(input.deviceKey);
	if (!device) return fail(400, 'This browser did not send its device key. Reload the page and try again.');
	const redirectUri = String(input.redirectUri || '').trim();
	if (!redirectAllowed(input.env, redirectUri))
		return fail(400, 'That redirect address is not allowed for Search Console connect.');
	const keys = credentials(input.env);
	const state = crypto.randomBytes(24).toString('hex');
	await store.set(COL_OAUTH, state, {
		email,
		deviceHash: device,
		redirectUri,
		used: false,
		createdAt: new Date(now).toISOString(),
		expiresAt: new Date(now + STATE_MS).toISOString(),
		expireAt: new Date(now + STATE_MS),
	});
	return { ok: true, state, url: connectAuthorizeUrl(keys, redirectUri, state) };
}

async function finishConnect(store, input) {
	const now = input.now || Date.now();
	if (!ready(input.env)) return fail(503, 'Search Console connect is not open yet.');
	const state = String(input.state || '')
		.replace(/[^a-f0-9]/g, '')
		.slice(0, 48);
	const pending = state.length === 48 ? await store.get(COL_OAUTH, state) : null;
	if (!pending || pending.used || Date.parse(pending.expiresAt) < now)
		return fail(410, 'This connect link expired. Start again.', { code: 'expired' });
	const device = reviewAuth.deviceHash(input.deviceKey);
	if (!reviewAuth.sameHash(device, pending.deviceHash)) {
		await store.set(COL_OAUTH, state, { used: true, otherDeviceAt: new Date(now).toISOString() });
		return fail(403, reviewAuth.OTHER_DEVICE, { code: 'other-device' });
	}
	await store.set(COL_OAUTH, state, { used: true, usedAt: new Date(now).toISOString() });
	const email = reviewAuth.cleanEmail(input.email);
	if (!email || email !== pending.email) return fail(403, 'Sign in as the same account that started connect.');
	const code = String(input.code || '').slice(0, 2000);
	if (input.error || !code)
		return fail(400, 'Google did not grant Search Console access. Try again.', { code: 'cancelled' });
	const keys = credentials(input.env);
	const fetcher = input.fetch || fetch;
	let token;
	try {
		token = await exchangeCode(keys, pending.redirectUri, code, fetcher);
	} catch (error) {
		console.error('GSC connect token failed:', error.message);
		return fail(502, 'Google did not confirm Search Console access. Try again.');
	}
	if (!scopeOk(token.scope)) return fail(400, 'Google did not grant read-only Search Console access.');
	if (!token.refresh_token)
		return fail(
			400,
			'Google sent no refresh token. Disconnect the app at myaccount.google.com/permissions and connect again.'
		);
	const claims = idTokenClaims(token.id_token);
	const row = {
		refreshToken: token.refresh_token,
		accessToken: token.access_token,
		accessExpiresAt: accessExpiry(now, token.expires_in),
		googleSub: String(claims.sub || '').slice(0, 128),
		googleEmail: String(claims.email || '').slice(0, 160),
		scopes: String(token.scope || ''),
		connectedAt: new Date(now).toISOString(),
		revokedAt: '',
	};
	await store.set(COL_TOKENS, email, row);
	return { ok: true, connected: publicTokenRow(row) };
}

async function connectStatus(store, input) {
	const now = input.now || Date.now();
	const email = reviewAuth.cleanEmail(input.email);
	if (!email) return fail(401, 'Sign in first.');
	const open = ready(input.env);
	const token = await store.get(COL_TOKENS, email);
	const account = await store.get(COL_ACCOUNTS, email);
	const bound = publicBind(account);
	const connected = !!(token && !token.revokedAt && token.refreshToken);
	return {
		ok: true,
		open,
		connected,
		connectedAs: connected ? publicTokenRow(token) : null,
		bound,
		reviewHost: String(input.reviewHost || '').trim(),
		coversReviewHost:
			bound && input.reviewUrl
				? gscProp.propertyCoversSite(bound.siteUrl, input.reviewUrl)
				: bound && input.reviewHost
					? gscProp.propertyCoversSite(bound.siteUrl, 'https://' + input.reviewHost + '/')
					: null,
		at: new Date(now).toISOString(),
	};
}

async function listSites(store, input) {
	const now = input.now || Date.now();
	const email = reviewAuth.cleanEmail(input.email);
	if (!email) return fail(401, 'Sign in first.');
	if (!ready(input.env)) return fail(503, 'Search Console connect is not open yet.');
	const access = await ensureAccess(store, email, input.env, input.fetch || fetch, now);
	if (!access.ok) return access;
	const fetcher = input.fetch || fetch;
	const res = await fetcher(SITES_URL, {
		headers: { authorization: 'Bearer ' + access.accessToken, accept: 'application/json' },
		signal: AbortSignal.timeout(15000),
	});
	const data = await res.json().catch(() => ({}));
	if (!res.ok)
		return fail(502, 'Search Console did not list properties: ' + clip((data.error && data.error.message) || res.status, 120));
	const sites = (data.siteEntry || [])
		.map((row) => {
			const norm = gscProp.normalizeGscProperty(row.siteUrl);
			return norm
				? {
						siteUrl: norm.siteUrl,
						kind: norm.kind,
						host: norm.host,
						permissionLevel: String(row.permissionLevel || ''),
					}
				: null;
		})
		.filter(Boolean);
	return { ok: true, sites };
}

async function bindProperty(store, input) {
	const now = input.now || Date.now();
	const email = reviewAuth.cleanEmail(input.email);
	if (!email) return fail(401, 'Sign in first.');
	if (!ready(input.env)) return fail(503, 'Search Console connect is not open yet.');
	const token = await store.get(COL_TOKENS, email);
	if (!token || token.revokedAt || !token.refreshToken)
		return fail(404, 'Connect Search Console before choosing a property.');
	const norm = gscProp.normalizeGscProperty(input.siteUrl);
	if (!norm) return fail(400, 'That property address is not valid for Search Console.');
	const sites = await listSites(store, Object.assign({}, input, { email }));
	if (!sites.ok) return sites;
	if (!sites.sites.some((row) => row.siteUrl === norm.siteUrl))
		return fail(400, 'That property is not in your Search Console account.');
	await store.set(COL_ACCOUNTS, email, {
		gsc: {
			siteUrl: norm.siteUrl,
			kind: norm.kind,
			host: norm.host,
			boundAt: new Date(now).toISOString(),
		},
	});
	return { ok: true, bound: publicBind({ gsc: { siteUrl: norm.siteUrl, kind: norm.kind, host: norm.host, boundAt: new Date(now).toISOString() } }) };
}

async function disconnectConnect(store, input) {
	const now = input.now || Date.now();
	const email = reviewAuth.cleanEmail(input.email);
	if (!email) return fail(401, 'Sign in first.');
	const token = await store.get(COL_TOKENS, email);
	if (token && token.refreshToken) {
		const fetcher = input.fetch || fetch;
		try {
			await fetcher(REVOKE_URL, {
				method: 'POST',
				headers: { 'content-type': 'application/x-www-form-urlencoded' },
				body: 'token=' + encodeURIComponent(token.refreshToken),
				signal: AbortSignal.timeout(10000),
			});
		} catch (_) {
			/* best-effort */
		}
	}
	if (token) await store.set(COL_TOKENS, email, { revokedAt: new Date(now).toISOString(), disconnectedAt: new Date(now).toISOString() });
	const account = await store.get(COL_ACCOUNTS, email);
	if (account && account.gsc) {
		await store.set(COL_ACCOUNTS, email, { gsc: null });
	}
	return { ok: true, connected: false };
}

module.exports = {
	COL_OAUTH,
	COL_TOKENS,
	COL_ACCOUNTS,
	STATE_MS,
	SCOPES,
	SCOPE_READONLY,
	ready,
	credentials,
	redirectAllowed,
	startConnect,
	finishConnect,
	connectStatus,
	listSites,
	bindProperty,
	disconnectConnect,
	ensureAccess,
	publicTokenRow,
	publicBind,
};