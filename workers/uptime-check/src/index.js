// Scheduled uptime checks (#4032): GET public product pages via checkEndpoints; dead-man ping on the result.
// Patterns: CalmRay-Solutions/uptime-guard / TwiN/gatus (status per endpoint) + healthchecks dead-man URLs.
//   - DEFAULT_ENDPOINTS  carlosandmunoz.com product pages (same set as Jarvis uptime)
//   - SCHEDULE           Cron Triggers string (Cloudflare: */5 = every 5 minutes)
//   - parseEndpoints     optional JSON override from UPTIME_ENDPOINTS (no regex)
//   - runCheck           checkEndpoints then withHeartbeat("uptime"): success ping if all ok, /fail if any down
// Deploy: cd workers/uptime-check && npm ci && ../../scripts/cf-quiet-deploy.sh -q
// Do not create healthchecks checks or set production secrets from this repo; the operator does that.
//
// Operator bindings (Worker secrets; values are never stored in the repo):
//   HEARTBEAT_UPTIME_URL       success ping URL of the uptime check (healthchecks ping URL)
//   HEARTBEAT_UPTIME_FAIL_URL  optional; failure ping URL. Default: HEARTBEAT_UPTIME_URL + "/fail"
//   UPTIME_ENDPOINTS           optional JSON array of URL strings or { url, expected?, timeoutMs? }
// Unset HEARTBEAT_UPTIME_URL turns the dead-man ping off; checks still run and log. Period/grace live in the alerting service.

import { checkEndpoints, withHeartbeat } from "../../shared/heartbeat.js";

const ORIGIN = "https://carlosandmunoz.com";

// Same public pages Jarvis watches (functions/jarvis.js PAGES). expected defaults to 200 in checkEndpoints.
export const DEFAULT_ENDPOINTS = [
  ORIGIN + "/",
  ORIGIN + "/simulador.html",
  ORIGIN + "/qa-lab.html",
  ORIGIN + "/qa-review.html",
  ORIGIN + "/qa-review-social.html",
];

// Every 5 minutes UTC. healthchecks period/grace should cover this cadence plus a small buffer.
export const SCHEDULE = "*/5 * * * *";

// Parse optional UPTIME_ENDPOINTS JSON. Invalid or empty input falls back to DEFAULT_ENDPOINTS.
export function parseEndpoints(raw) {
  if (raw == null || raw === "") return DEFAULT_ENDPOINTS.slice();
  try {
    const list = typeof raw === "string" ? JSON.parse(raw) : raw;
    if (!Array.isArray(list) || !list.length) return DEFAULT_ENDPOINTS.slice();
    return list;
  } catch {
    return DEFAULT_ENDPOINTS.slice();
  }
}

// Run the probe list; ping success when every endpoint is ok, failure (and throw) when any is down.
export async function runCheck(env, opts = {}) {
  const list = parseEndpoints(env?.UPTIME_ENDPOINTS);
  return withHeartbeat(env, "uptime", async () => {
    const results = await checkEndpoints(list, opts);
    const failed = results.filter((r) => !r.ok);
    if (failed.length) {
      // Public endpoint hosts only; never the heartbeat secret URL.
      const detail = failed.map((r) => `${r.status}:${r.error || "bad status"}`).join(",");
      throw new Error(`uptime ${failed.length}/${results.length} down (${detail})`);
    }
    console.log(`uptime ok ${results.length}`);
    return results;
  }, opts);
}

export default {
  async scheduled(_controller, env) {
    await runCheck(env);
  },
};
