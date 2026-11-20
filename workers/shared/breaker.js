// Retry and circuit breaker for the Workers' outbound calls (#3838). Dependency-free, runs on Cloudflare Workers.
//   - 429/503 wait for the Retry-After header (seconds or an HTTP date), capped at maxRetryAfterMs.
//   - Other 5xx and network errors back off exponentially with full jitter.
//   - Other 4xx are never retried and never count against the breaker.
//   - After `threshold` failures in a row the breaker opens for `coolDownMs`; calls fail fast with BreakerOpenError
//     until then, and one probe call is let through after the cool-down.
export class BreakerOpenError extends Error {
  constructor(name, retryAfterMs) {
    super(`circuit "${name}" is open; retry in ${Math.ceil(retryAfterMs / 1000)}s`);
    this.name = "BreakerOpenError";
    this.retryAfterMs = retryAfterMs;
  }
}

export function createBreaker({ name = "breaker", threshold = 5, coolDownMs = 30000, now = Date.now } = {}) {
  let failures = 0;
  let openedAt = null;
  let probing = false;
  const open = () => openedAt !== null;
  return {
    name,
    get state() { return !open() ? "closed" : now() - openedAt >= coolDownMs ? "half-open" : "open"; },
    get failures() { return failures; },
    // Throws BreakerOpenError while open; lets one probe through once the cool-down has passed.
    acquire() {
      if (!open()) return;
      const wait = coolDownMs - (now() - openedAt);
      if (wait > 0 || probing) throw new BreakerOpenError(name, Math.max(wait, 0));
      probing = true;
    },
    success() { failures = 0; openedAt = null; probing = false; },
    failure() {
      failures += 1;
      probing = false;
      if (failures >= threshold) openedAt = now();
    },
    // A call that ended without proof either way (a 4xx): free the probe slot only.
    neutral() { probing = false; },
  };
}

// Seconds ("120") or an HTTP date; returns milliseconds or null.
export function parseRetryAfter(value, now = Date.now()) {
  if (value == null || value === "") return null;
  const text = String(value).trim();
  if (/^\d+(\.\d+)?$/.test(text)) return Math.round(Number(text) * 1000);
  const at = Date.parse(text);
  return Number.isNaN(at) ? null : Math.max(at - now, 0);
}

const defaultSleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export function backoffMs(attempt, { baseMs = 250, maxMs = 8000, random = Math.random } = {}) {
  return Math.floor(random() * Math.min(maxMs, baseMs * 2 ** attempt));
}

// fetch with retries and a breaker. Returns the last Response when retries run out (so callers keep checking res.ok);
// throws the last network error, or BreakerOpenError when the breaker is open.
export async function resilientFetch(url, init, opts = {}) {
  const {
    retries = 3, baseMs = 250, maxMs = 8000, maxRetryAfterMs = 30000, breaker,
    fetchImpl = (...args) => fetch(...args), sleep = defaultSleep, random = Math.random, now = Date.now,
  } = opts;
  for (let attempt = 0; ; attempt++) {
    if (breaker) breaker.acquire();
    let res, error;
    try { res = await fetchImpl(url, init); } catch (e) { error = e; }
    const status = res ? res.status : 0;
    const transient = !res || status === 429 || status >= 500;
    if (!transient) {
      if (breaker) (status >= 400 ? breaker.neutral() : breaker.success());
      return res;
    }
    if (breaker) breaker.failure();
    if (attempt >= retries || (breaker && breaker.state !== "closed")) {
      if (res) return res;
      throw error;
    }
    const hinted = res && (status === 429 || status === 503) ? parseRetryAfter(res.headers.get("retry-after"), now()) : null;
    const wait = hinted != null ? Math.min(hinted, maxRetryAfterMs) : backoffMs(attempt, { baseMs, maxMs, random });
    await sleep(wait);
  }
}

// Same policy for any async call that throws (env.AI.run, env.VEC.query): retry when isRetryable(error), with backoff.
export async function resilientCall(fn, opts = {}) {
  const { retries = 2, baseMs = 250, maxMs = 8000, breaker, isRetryable = () => true, sleep = defaultSleep, random = Math.random } = opts;
  for (let attempt = 0; ; attempt++) {
    if (breaker) breaker.acquire();
    try {
      const out = await fn();
      if (breaker) breaker.success();
      return out;
    } catch (e) {
      if (!isRetryable(e)) { if (breaker) breaker.neutral(); throw e; }
      if (breaker) breaker.failure();
      if (attempt >= retries || (breaker && breaker.state !== "closed")) throw e;
      await sleep(backoffMs(attempt, { baseMs, maxMs, random }));
    }
  }
}
