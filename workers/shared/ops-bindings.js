// Config shape for #3838 leftover ops: GeoIP R2 + heartbeat / uptime-guard secret *names*.
// Soft-fail: unset GEOIP_BUCKET or HEARTBEAT_* turns features off (local and pre-prod safe).
// Never put real secret values here — operators set them on the Worker / GitHub vars after deploy.

export const GEOIP_BINDING_NAME = "GEOIP";

/** Operator env that gates the preflight R2 binding (see workers/preflight/cloudflare.config.ts). */
export const GEOIP_BUCKET_ENV = "GEOIP_BUCKET";

/**
 * R2 binding stub for preflight. Empty when the bucket name is unset so local deploy works without R2.
 * When enabled, the binding *name* must be GEOIP (workers/shared/geoip.js reads env.GEOIP).
 */
export function geoipR2Bindings(bucketName) {
  const name = typeof bucketName === "string" ? bucketName.trim() : "";
  if (!name) return [];
  return [{ type: "r2_bucket", name: GEOIP_BINDING_NAME, bucket_name: name }];
}

/** Worker secret names (values never in repo). Unset = dead-man ping off. */
export const HEARTBEAT_SECRET_NAMES = Object.freeze([
  "HEARTBEAT_OUTREACH_URL",
  "HEARTBEAT_OUTREACH_FAIL_URL",
  "HEARTBEAT_UPTIME_URL",
  "HEARTBEAT_UPTIME_FAIL_URL",
]);

/** Optional uptime-check override (JSON). Unset uses DEFAULT_ENDPOINTS in workers/uptime-check. */
export const UPTIME_OPTIONAL_NAMES = Object.freeze(["UPTIME_ENDPOINTS"]);

/**
 * Assert config shape for GeoIP. When enabled (bucket set), bindings must include r2_bucket named GEOIP.
 * Soft: disabled → { ok: true, skipped: true }.
 */
export function assertGeoipConfigShape({ enabled, bindings } = {}) {
  if (!enabled) return { ok: true, skipped: true };
  const list = Array.isArray(bindings) ? bindings : [];
  const hit = list.find((b) => b && b.type === "r2_bucket" && b.name === GEOIP_BINDING_NAME);
  if (!hit) {
    return { ok: false, error: `enabled GeoIP requires r2_bucket binding named ${GEOIP_BINDING_NAME}` };
  }
  if (!hit.bucket_name || typeof hit.bucket_name !== "string") {
    return { ok: false, error: `GEOIP binding missing bucket_name` };
  }
  return { ok: true, binding: hit };
}
