// Dead-man heartbeats and uptime checks for the Workers (#4032, split from #3838). Dependency-free, runs on Cloudflare Workers.
// Patterns: healthchecks/healthchecks (a job pings a URL on success, "<url>/fail" on failure; silence raises the alert)
// and CalmRay-Solutions/uptime-guard / TwiN/gatus (status code, time and expected status per public endpoint).
//   - pingHeartbeat(url, opts)      GET the success URL. No URL: no-op.
//   - pingFailure(url, opts)        GET the failure URL: opts.failUrl, else the healthchecks "/fail" suffix on url.
//   - withHeartbeat(env, name, fn)  run fn(); ping success after it returns, failure if it throws (then rethrow fn's error).
//   - checkEndpoints(list, opts)    results [{ url, ok, status, expected, ms, error? }] for a separate uptime check.
// Pings use a short timeout and never throw into the caller. The URLs are secrets: they are never logged or put in an error.
// Operator bindings (set as Worker secrets, values are not stored in the repo; names in workers/.env.example):
//   HEARTBEAT_OUTREACH_URL       success ping URL of the outreach-cron check (healthchecks ping URL)
//   HEARTBEAT_OUTREACH_FAIL_URL  optional; failure ping URL. Default: HEARTBEAT_OUTREACH_URL + "/fail"
//   HEARTBEAT_UPTIME_URL         success ping URL of the uptime-check Worker
//   HEARTBEAT_UPTIME_FAIL_URL    optional; failure ping URL. Default: HEARTBEAT_UPTIME_URL + "/fail"
// Unset bindings turn the heartbeat off. The check's period and grace belong in the alerting service, not here.

const DEFAULT_TIMEOUT_MS = 3000;

// healthchecks ping URLs take "/fail" after the path: https://hc-ping.com/<uuid> -> https://hc-ping.com/<uuid>/fail
export function failUrlFor(url) {
  try {
    const u = new URL(url);
    let path = u.pathname;
    while (path.endsWith("/")) path = path.slice(0, -1);
    u.pathname = path + "/fail";
    return u.toString();
  } catch {
    return "";
  }
}

async function ping(url, { fetchImpl = globalThis.fetch, timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  if (!url || typeof url !== "string" || typeof fetchImpl !== "function") return false;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetchImpl(url, { method: "GET", signal: controller.signal, redirect: "manual" });
    // Drain the body so the connection is released; ignore a failure here.
    await res?.body?.cancel?.().catch?.(() => {});
    return Boolean(res && res.status >= 200 && res.status < 300);
  } catch {
    return false; // network error or timeout; the message could carry the URL, so it is dropped
  } finally {
    clearTimeout(timer);
  }
}

export const pingHeartbeat = (url, opts) => ping(url, opts);

export function pingFailure(url, opts = {}) {
  const target = opts.failUrl || (url ? failUrlFor(url) : "");
  return ping(target, opts);
}

// Run a scheduled job: success ping after it returns, failure ping if it throws. The job's own error always wins.
export async function withHeartbeat(env, name, job, opts = {}) {
  const url = env?.[`HEARTBEAT_${name.toUpperCase().replace(/[^A-Z0-9]+/g, "_")}_URL`];
  const failUrl = env?.[`HEARTBEAT_${name.toUpperCase().replace(/[^A-Z0-9]+/g, "_")}_FAIL_URL`];
  let result;
  try {
    result = await job();
  } catch (err) {
    await pingFailure(url, { ...opts, failUrl });
    throw err;
  }
  await pingHeartbeat(url, opts);
  return result;
}

// Uptime check results for public endpoints. Each item is a URL string or { url, expected = 200, timeoutMs }.
// A dead endpoint becomes { ok: false, status: 0, error } and never throws.
export async function checkEndpoints(list, { fetchImpl = globalThis.fetch, timeoutMs = 5000, now = Date.now } = {}) {
  return Promise.all((list || []).map(async (item) => {
    const spec = typeof item === "string" ? { url: item } : item;
    const expected = spec.expected ?? 200;
    const started = now();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), spec.timeoutMs ?? timeoutMs);
    try {
      const res = await fetchImpl(spec.url, { method: "GET", signal: controller.signal, redirect: "manual" });
      await res?.body?.cancel?.().catch?.(() => {});
      return { url: spec.url, ok: res.status === expected, status: res.status, expected, ms: now() - started };
    } catch (err) {
      return { url: spec.url, ok: false, status: 0, expected, ms: now() - started, error: err?.name === "AbortError" ? "timeout" : "network error" };
    } finally {
      clearTimeout(timer);
    }
  }));
}
