import { defineConfig } from "cf/config";

// Deploy: cd workers/preflight && PREFLIGHT_TOKEN=... ../../scripts/cf-quiet-deploy.sh -q
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
        ],
      },
    },
  },
});
