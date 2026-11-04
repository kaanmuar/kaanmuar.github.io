import { createPrivateKey } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { defineConfig, triggers } from "cf/config";
import { MODES } from "./src/index.js";

// Deploy: cd workers/outreach-cron && npm ci && cf deploy
// Reads the qa-lab-agents app from ~/.config/qa-lab (as scripts/gh-app-token.js does) and uploads its key as PKCS#8,
// the only private key format WebCrypto imports. The secret goes in the upload metadata as in workers/preflight.
const dir = join(homedir(), ".config", "qa-lab");
const app = existsSync(join(dir, "app.json")) ? JSON.parse(readFileSync(join(dir, "app.json"), "utf8")) : {};
const key = existsSync(join(dir, "app.pem"))
  ? createPrivateKey(readFileSync(join(dir, "app.pem"))).export({ type: "pkcs8", format: "pem" }).toString()
  : undefined;

export default defineConfig({
  worker: {
    name: "outreach-cron",
    entrypoint: "./src/index.js",
    compatibilityDate: "2026-10-01",
    workersDev: false,
    triggers: Object.keys(MODES).map((schedule) => triggers.scheduled({ schedule })),
    unsafe: {
      metadata: {
        bindings: [
          { type: "plain_text", name: "APP_ID", text: String(app.client_id || app.id || "") },
          { type: "secret_text", name: "APP_KEY", text: key },
        ],
      },
    },
  },
});
