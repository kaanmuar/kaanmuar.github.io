#!/usr/bin/env node
// Ops check (#3838): assert GeoIP/heartbeat config *shape* (binding name when enabled). No secret values.
//   node scripts/check-heartbeat-geoip-config.js
// Soft: without GEOIP_BUCKET the R2 binding is omitted and the check reports skipped. Exit 1 only when
// enabled but the binding name is wrong/missing.
import {
  GEOIP_BINDING_NAME,
  GEOIP_BUCKET_ENV,
  HEARTBEAT_SECRET_NAMES,
  UPTIME_OPTIONAL_NAMES,
  assertGeoipConfigShape,
  geoipR2Bindings,
} from "../workers/shared/ops-bindings.js";

const bucket = process.env[GEOIP_BUCKET_ENV] || "";
const bindings = geoipR2Bindings(bucket);
const enabled = Boolean(bucket.trim());
const result = assertGeoipConfigShape({ enabled, bindings });

if (!result.ok) {
  console.error(result.error);
  process.exit(1);
}

if (result.skipped) {
  console.log(`GeoIP: skipped (unset ${GEOIP_BUCKET_ENV}; local OK without R2)`);
} else {
  console.log(`GeoIP: ok — r2_bucket binding name=${GEOIP_BINDING_NAME} bucket=${result.binding.bucket_name}`);
}

console.log(`Heartbeat secret names (operator-set, unset = off): ${HEARTBEAT_SECRET_NAMES.join(", ")}`);
console.log(`Uptime optional: ${UPTIME_OPTIONAL_NAMES.join(", ")}`);
process.exit(0);
