/* Threads Graph API client for scripts/open-social-queue.js (#3841).
   Retries 429/5xx (and network errors) through functions/http-resilience resilientFetch; other 4xx fail at once.
   Missing THREADS_TOKEN is a clear skip, not a failed login. */
'use strict';

const resilience = require('../functions/http-resilience');

const BASE = 'https://graph.threads.net/v1.0';

async function reply(res, label) {
	const json = await res.json().catch(() => ({}));
	const why = json.error && json.error.message ? json.error.message : json.message || json.error;
	if (!res.ok || (json.error && json.error.message)) {
		const graphError = json.error && typeof json.error === 'object' ? json.error : {};
		throw Object.assign(
			new Error(label + ' ' + res.status + ': ' + String(why || JSON.stringify(json)).slice(0, 300)),
			{ status: res.status, code: graphError.code, subcode: graphError.error_subcode }
		);
	}
	return json;
}

/** Why Threads should be skipped this run, or '' when THREADS_TOKEN is set. */
function skipWhy(env = process.env) {
	if (env.THREADS_TOKEN) return '';
	return 'THREADS_TOKEN missing (set via scripts/meta-token.js threads), skipped';
}

const ready = (env = process.env) => Boolean(env && env.THREADS_TOKEN);

/* Graph call: GET puts params on the query string; POST sends them as form body (same as the previous inline
   helper). opts.fetchImpl / sleep / random / now are for unit tests. */
function createCall(token, opts = {}) {
	const {
		retries = 3,
		baseMs = 250,
		maxMs = 8000,
		maxRetryAfterMs = 30000,
		timeoutMs = 30000,
		breaker,
		fetchImpl,
		sleep,
		random,
		now,
	} = opts;
	return async (method, edge, params = {}) => {
		const qs = new URLSearchParams(Object.assign({}, params, { access_token: token || '' }));
		const url = method === 'GET' ? BASE + '/' + edge + '?' + qs : BASE + '/' + edge;
		const init = method === 'GET' ? undefined : { method, body: qs };
		const res = await resilience.resilientFetch(url, init, {
			retries,
			baseMs,
			maxMs,
			maxRetryAfterMs,
			timeoutMs,
			breaker,
			fetchImpl,
			sleep,
			random,
			now,
		});
		return reply(res, 'Threads ' + String(edge).split('/').pop());
	};
}

module.exports = { BASE, ready, skipWhy, createCall, reply };
