const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.join(__dirname, "../..");

test("qa-review-explorer.html wires the hero module and import map", () => {
  const html = fs.readFileSync(path.join(ROOT, "qa-review-explorer.html"), "utf8");
  assert.match(html, /qa-review-explorer\.html/);
  assert.match(html, /importmap.*url-review-hero\/importmap\.json/s);
  assert.match(html, /js\/url-review-hero\/explorer-boot\.js/);
  assert.match(html, /id="explorer-stage"/);
});

test("URL Review landing links to the 3D explorer", () => {
  const html = fs.readFileSync(path.join(ROOT, "qa-review.html"), "utf8");
  assert.match(html, /href="qa-review-explorer\.html"/);
});

test("URL Review landing mounts the #3429 hero", () => {
  const html = fs.readFileSync(path.join(ROOT, "qa-review.html"), "utf8");
  assert.match(html, /id="review-hero-3d"/);
  assert.match(html, /id="review-hero-still"/);
  assert.match(html, /assets\/url-review-hero\/hero-3d-en-safe\.webp/);
  assert.match(html, /landing-boot\.js/);
  assert.match(html, /url-review-hero\/importmap\.json/);
  assert.doesNotMatch(html, /class="stage"[^>]*data-fx[^>]*data-fx-mode="0"/);
  for (const name of ["hero-3d-en-safe.webp", "hero-3d-en-safe.png", "hero-3d-en-scan.webp", "hero-3d-en-scan.png"]) {
    assert.ok(fs.existsSync(path.join(ROOT, "assets/url-review-hero", name)), name);
  }
});

test("hero scene module exports situational controls", async () => {
  const mod = await import("../../js/url-review-hero/scene.js");
  assert.equal(mod.LOOP_SEC, 10);
  assert.deepEqual(mod.LAYER_KEYS, ["card", "shield", "orbit", "report"]);
  assert.ok(mod.LANGS.includes("en") && mod.LANGS.includes("de"));
});