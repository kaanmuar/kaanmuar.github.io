import { defineConfig } from "cf/config";

// Deploy: cd workers/preflight && PREFLIGHT_TOKEN=... ../../scripts/cf-quiet-deploy.sh -q
// GeoIP (#4031): GEOIP_BUCKET=<r2 bucket> adds the R2 binding GEOIP, read by workers/shared/geoip.js (country/ASN of rejected
// calls). It is left off until the bucket exists (R2 enabled, `node scripts/geoip-fetch.js --bucket <name>` run), because
// a deploy that binds a missing bucket fails. Daily refresh: .github/workflows/geoip-refresh.yml.
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
          ...(process.env.GEOIP_BUCKET ? [{ type: "r2_bucket", name: "GEOIP", bucket_name: process.env.GEOIP_BUCKET }] : []),
        ],
      },
    },
  },
});
