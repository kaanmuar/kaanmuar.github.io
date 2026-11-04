import { defineConfig, triggers } from "cf/config";

// The 301 page rule that used to send everything to qa-review.html is gone; this Worker owns both hosts.
export default defineConfig({
  worker: {
    name: "qalabreview",
    entrypoint: "./src/index.js",
    compatibilityDate: "2026-10-27",
    triggers: [
      triggers.fetch({ pattern: "qalabreview.com/*", zone: "qalabreview.com" }),
      triggers.fetch({ pattern: "www.qalabreview.com/*", zone: "qalabreview.com" })
    ]
  }
});
