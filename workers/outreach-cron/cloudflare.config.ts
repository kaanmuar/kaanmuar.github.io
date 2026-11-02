import { defineConfig, triggers } from "cf/config";
import { MODES } from "./src/index.js";

// Deploy: cd workers/outreach-cron && npm ci && GH_TOKEN=... cf deploy
// The secret goes in the upload metadata as in workers/preflight, so one command ships code and token together.
export default defineConfig({
  worker: {
    name: "outreach-cron",
    entrypoint: "./src/index.js",
    compatibilityDate: "2026-10-01",
    workersDev: false,
    triggers: Object.keys(MODES).map((schedule) => triggers.scheduled({ schedule })),
    unsafe: {
      metadata: {
        bindings: [{ type: "secret_text", name: "GH_TOKEN", text: process.env.GH_TOKEN }],
      },
    },
  },
});
