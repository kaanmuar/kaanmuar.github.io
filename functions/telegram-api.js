/* grammY-inspired Telegram Bot API helper (#3841).
   Clean-room (MIT patterns only): no `grammy` dependency. Scripts and Cloud Functions share this
   module. Retries HTTP 429/5xx (+ network errors) through http-resilience resilientFetch, and Bot API
   flood waits (`ok: false` with `parameters.retry_after` / error_code 429) with a short outer loop.
   Other 4xx and non-flood Bot API errors fail at once with a clear method + description surface. */
'use strict';

const resilience = require('./http-resilience');

const BASE = 'https://api.telegram.org/bot';

class TelegramApiError extends Error {
	constructor(method, description, extras = {}) {
		const status = extras.status;
		const label = status ? 'Telegram ' + status + ': ' + description : method + ': ' + description;
		super(label);
		this.name = 'TelegramApiError';
		this.method = method;
		this.description = description;
		this.status = status;
		this.errorCode = extras.errorCode;
		this.retryAfter = extras.retryAfter;
	}
}

/** Why Telegram Bot API calls should be skipped, or '' when TELEGRAM_BOT_TOKEN is set. */
function skipWhy(env = process.env) {
	if (env && env.TELEGRAM_BOT_TOKEN) return '';
	return 'TELEGRAM_BOT_TOKEN missing (BotFather > /mybots > API Token), skipped';
}

const ready = (env = process.env) => Boolean(env && env.TELEGRAM_BOT_TOKEN);

function botUrl(token, method) {
	return BASE + token + '/' + method;
}

/**
 * One Bot API method call with resilience. Returns `result` on success.
 * opts.fetchImpl / sleep / random / now are for unit tests (same as threads-api).
 */
function createApi(token, opts = {}) {
	const {
		retries = 3,
		baseMs = 250,
		maxMs = 8000,
		maxRetryAfterMs = 30000,
		timeoutMs = 30000,
		breaker,
		fetchImpl,
		sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
		random,
		now,
	} = opts;

	return async (method, params = {}) => {
		if (!token) {
			throw new TelegramApiError(method, 'Set TELEGRAM_BOT_TOKEN (BotFather > /mybots > API Token).', {
				status: 0,
			});
		}
		const url = botUrl(token, method);
		const init = {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify(params || {}),
		};

		for (let floodAttempt = 0; ; floodAttempt++) {
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
			const json = await res.json().catch(() => ({
				ok: false,
				description: 'status ' + res.status,
			}));
			if (json && json.ok) return json.result;

			const description = String((json && json.description) || 'no answer').slice(0, 200);
			const retryAfterSec = json && json.parameters ? Number(json.parameters.retry_after) : NaN;
			const errorCode = (json && json.error_code) || res.status;
			const err = new TelegramApiError(method, description, {
				status: res.status,
				errorCode,
				retryAfter: Number.isFinite(retryAfterSec) ? retryAfterSec : undefined,
			});

			const flood =
				errorCode === 429 || res.status === 429 || (Number.isFinite(retryAfterSec) && retryAfterSec > 0);
			if (!flood || floodAttempt >= retries) throw err;
			const waitMs = Number.isFinite(retryAfterSec)
				? Math.min(Math.round(retryAfterSec * 1000), maxRetryAfterMs)
				: Math.min(1000, maxRetryAfterMs);
			await sleep(waitMs);
		}
	};
}

module.exports = {
	BASE,
	TelegramApiError,
	ready,
	skipWhy,
	botUrl,
	createApi,
};
