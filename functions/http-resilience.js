/* Retry and circuit breaker for the Cloud Functions' outbound calls to third-party services (#3838).
   Node (CommonJS) port of the policy in workers/shared/breaker.js, which is an ES module for Workers and cannot be
   required here, so it is not a byte copy. tests/unit/http-resilience.test.js runs the same scenarios against both
   files to keep the policy from drifting.
   - 429/503 wait for the Retry-After header (seconds or an HTTP date), capped at maxRetryAfterMs.
   - Other 5xx and network errors back off exponentially with full jitter.
   - Other 4xx are returned at once and never count against the breaker.
   - After `threshold` failures in a row the breaker opens for `coolDownMs`; calls throw BreakerOpenError until then,
     and one probe call is let through after the cool-down.
   Options added for the functions: `noRetryStatuses` (returned at once, neutral for the breaker: a spent daily quota
   will not recover in seconds), `timeoutMs` (a fresh AbortSignal per attempt) and `retryErrors(error)`. */

class BreakerOpenError extends Error {
	constructor(name, retryAfterMs) {
		super('circuit "' + name + '" is open; retry in ' + Math.ceil(retryAfterMs / 1000) + 's');
		this.name = 'BreakerOpenError';
		this.retryAfterMs = retryAfterMs;
	}
}

function createBreaker({ name = 'breaker', threshold = 5, coolDownMs = 30000, now = Date.now } = {}) {
	let failures = 0;
	let openedAt = null;
	let probing = false;
	const open = () => openedAt !== null;
	return {
		name,
		get state() {
			return !open() ? 'closed' : now() - openedAt >= coolDownMs ? 'half-open' : 'open';
		},
		get failures() {
			return failures;
		},
		acquire() {
			if (!open()) return;
			const wait = coolDownMs - (now() - openedAt);
			if (wait > 0 || probing) throw new BreakerOpenError(name, Math.max(wait, 0));
			probing = true;
		},
		success() {
			failures = 0;
			openedAt = null;
			probing = false;
		},
		failure() {
			failures += 1;
			probing = false;
			if (failures >= threshold) openedAt = now();
		},
		neutral() {
			probing = false;
		},
	};
}

function parseRetryAfter(value, now = Date.now()) {
	if (value == null || value === '') return null;
	const text = String(value).trim();
	if (/^\d+(\.\d+)?$/.test(text)) return Math.round(Number(text) * 1000);
	const at = Date.parse(text);
	return Number.isNaN(at) ? null : Math.max(at - now, 0);
}

const defaultSleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function backoffMs(attempt, { baseMs = 250, maxMs = 8000, random = Math.random } = {}) {
	return Math.floor(random() * Math.min(maxMs, baseMs * 2 ** attempt));
}

// Returns the last response when retries run out (callers keep checking res.ok); throws the last network error, or
// BreakerOpenError when the breaker is open.
async function resilientFetch(url, init, opts = {}) {
	const {
		retries = 3,
		baseMs = 250,
		maxMs = 8000,
		maxRetryAfterMs = 30000,
		breaker,
		noRetryStatuses = [],
		timeoutMs,
		retryErrors = () => true,
		fetchImpl = (...args) => fetch(...args),
		sleep = defaultSleep,
		random = Math.random,
		now = Date.now,
	} = opts;
	for (let attempt = 0; ; attempt++) {
		if (breaker) breaker.acquire();
		let res, error;
		try {
			res = await fetchImpl(
				url,
				timeoutMs ? Object.assign({}, init, { signal: AbortSignal.timeout(timeoutMs) }) : init
			);
		} catch (e) {
			error = e;
		}
		const status = res ? res.status : 0;
		const transient = !res || status === 429 || status >= 500;
		if (!transient || noRetryStatuses.includes(status)) {
			if (breaker) status >= 400 ? breaker.neutral() : breaker.success();
			return res;
		}
		if (breaker) breaker.failure();
		const stop = attempt >= retries || (breaker && breaker.state !== 'closed') || (!res && !retryErrors(error));
		if (stop) {
			if (res) return res;
			throw error;
		}
		const hinted =
			res && (status === 429 || status === 503)
				? parseRetryAfter(res.headers && res.headers.get('retry-after'), now())
				: null;
		await sleep(hinted != null ? Math.min(hinted, maxRetryAfterMs) : backoffMs(attempt, { baseMs, maxMs, random }));
	}
}

// Shared breakers, one per outside service, per function instance.
const breakers = {
	pagespeed: createBreaker({ name: 'pagespeed', threshold: 5, coolDownMs: 30000 }),
	webrisk: createBreaker({ name: 'webrisk', threshold: 5, coolDownMs: 30000 }),
	crux: createBreaker({ name: 'crux', threshold: 5, coolDownMs: 30000 }),
	places: createBreaker({ name: 'places', threshold: 5, coolDownMs: 30000 }),
	urlhaus: createBreaker({ name: 'urlhaus', threshold: 5, coolDownMs: 30000 }),
	phishstats: createBreaker({ name: 'phishstats', threshold: 5, coolDownMs: 30000 }),
	cloudflare: createBreaker({ name: 'cloudflare', threshold: 5, coolDownMs: 30000 }),
	'doh-cloudflare': createBreaker({ name: 'doh-cloudflare', threshold: 5, coolDownMs: 30000 }),
	'doh-google': createBreaker({ name: 'doh-google', threshold: 5, coolDownMs: 30000 }),
};

const isTimeout = (error) => !!error && (error.name === 'TimeoutError' || error.name === 'AbortError');

module.exports = { BreakerOpenError, createBreaker, parseRetryAfter, backoffMs, resilientFetch, breakers, isTimeout };
