import { defineConfig, triggers } from "cf/config";

// Dynamic Open Graph & Twitter Cards for public ?live=<id> report shares (#3764) + COOP header on review routes.
export default defineConfig({
  worker: {
    name: "carlosandmunoz-edge-og",
    entrypoint: "./src/index.js",
    compatibilityDate: "2026-10-27",
    workersDev: false,
    triggers: [
      triggers.fetch({ pattern: "carlosandmunoz.com/qa-review.html*", zone: "carlosandmunoz.com" }),
      triggers.fetch({ pattern: "carlosandmunoz.com/qa-review-es.html*", zone: "carlosandmunoz.com" }),
      triggers.fetch({ pattern: "carlosandmunoz.com/qa-review-pt.html*", zone: "carlosandmunoz.com" }),
      triggers.fetch({ pattern: "carlosandmunoz.com/qa-review-de.html*", zone: "carlosandmunoz.com" }),
      triggers.fetch({ pattern: "carlosandmunoz.com/qa-review-fr.html*", zone: "carlosandmunoz.com" }),
      triggers.fetch({ pattern: "carlosandmunoz.com/qa-review-it.html*", zone: "carlosandmunoz.com" }),
      triggers.fetch({ pattern: "carlosandmunoz.com/live.html*", zone: "carlosandmunoz.com" })
    ]
  }
});
