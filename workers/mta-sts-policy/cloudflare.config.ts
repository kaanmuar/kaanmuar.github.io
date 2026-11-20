import { defineConfig, triggers } from "cf/config";

// MTA-STS policy worker for carlosandmunoz.com (#884, #928 Stage 1 enforce).
export default defineConfig({
  worker: {
    name: "mta-sts-policy",
    entrypoint: "./src/index.js",
    compatibilityDate: "2026-10-24",
    workersDev: true,
    triggers: [
      triggers.fetch({ pattern: "mta-sts.carlosandmunoz.com/*", zone: "carlosandmunoz.com" })
    ]
  }
});
