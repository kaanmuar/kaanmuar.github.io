import { defineConfig } from "cf/config";
import { geoipR2Bindings } from "../shared/ops-bindings.js";

// Deploy: cd workers/preflight && PREFLIGHT_TOKEN=... ../../scripts/cf-quiet-deploy.sh -q
// GeoIP (#4031 / #3838): GEOIP_BUCKET=<r2 bucket> adds the R2 binding named GEOIP (workers/shared/geoip.js).
// Gated: unset GEOIP_BUCKET omits the binding so local deploy works without the bucket. A deploy that binds a
// missing bucket fails — enable R2, `node scripts/geoip-fetch.js --bucket <name>`, then set GEOIP_BUCKET.
// Daily refresh: .github/workflows/geoip-refresh.yml. Env names: workers/.env.example.
// Shape check: node scripts/check-heartbeat-geoip-config.js
// cf has no builders for Workers AI or Vectorize yet, so the bindings go in the upload metadata as is.
export default defineConfig({
  worker: {
    name: "preflight",
    entrypoint: "./src/index.js",
    compatibilityDate: "2026-10-01",
    workersDev: false,
    domains: ["preflight.carlosandmunoz.com"],
    unsafe: {
      metadata: {
        bindings: [
          { type: "ai", name: "AI" },
          { type: "vectorize", name: "VEC", index_name: "preflight" },
          { type: "secret_text", name: "TOKEN", text: process.env.PREFLIGHT_TOKEN },
          ...geoipR2Bindings(process.env.GEOIP_BUCKET),
        ],
      },
    },
  },
});
