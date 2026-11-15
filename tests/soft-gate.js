// Soft-gate (#3478) E2E helpers: mock POST /review/preview and Unlock after frost.
const sample = require("../assets/qa-review-sample.json");

function softPreviewPayload(overrides) {
  const extra = overrides || {};
  const report = Object.assign({}, sample.report, {
    id: "softpreview01",
    softPreview: true,
    host: "example.com",
    requestedUrl: "https://example.com/"
  }, extra.report || {});
  return Object.assign({
    type: "done",
    report,
    frameworks: sample.frameworks || ["Playwright"],
    paid: false,
    softPreview: true,
    softLeft: 4,
    softCap: 5,
    priceUsd: 0
  }, extra.done || {});
}

function softPreviewNdjson(overrides) {
  const done = softPreviewPayload(overrides);
  return [{ type: "log", text: "Soft preview." }, done].map((line) => JSON.stringify(line)).join("\n") + "\n";
}

function fulfillSoftPreview(route, cors, overrides) {
  return route.fulfill({
    status: 200,
    contentType: "application/x-ndjson",
    headers: cors,
    body: softPreviewNdjson(overrides)
  });
}

// Soft gate: Review soft-runs; Unlock opens terms / sign-in / client checks / pricing / full crawl.
async function softThenUnlock(page, expect) {
  await page.locator("#review-btn").click();
  await expect(page.locator("#soft-unlock-btn")).toBeVisible({ timeout: 20000 });
  await page.locator("#soft-unlock-btn").click();
}

async function softPreviewFromHero(page, expect, url) {
  await page.locator("#stage-url").fill(url);
  await page.locator('#stage-start button[type="submit"]').click();
  await expect(page.locator("#soft-unlock-btn")).toBeVisible({ timeout: 20000 });
}

module.exports = {
  softPreviewPayload,
  softPreviewNdjson,
  fulfillSoftPreview,
  softThenUnlock,
  softPreviewFromHero
};
