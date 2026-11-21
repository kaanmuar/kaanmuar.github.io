import { defineConfig, triggers } from "cf/config";
import { SCHEDULE } from "./src/index.js";

// Deploy: cd workers/uptime-check && npm ci && ../../scripts/cf-quiet-deploy.sh -q
// Secrets (HEARTBEAT_UPTIME_URL, optional HEARTBEAT_UPTIME_FAIL_URL, optional UPTIME_ENDPOINTS) are set by the
// operator after deploy — not uploaded from this config, and never committed. See src/index.js header.
export default defineConfig({
  worker: {
    name: "uptime-check",
    entrypoint: "./src/index.js",
    compatibilityDate: "2026-10-01",
    workersDev: false,
    triggers: [triggers.scheduled({ schedule: SCHEDULE })],
  },
});
