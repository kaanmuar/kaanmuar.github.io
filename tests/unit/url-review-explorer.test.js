const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.join(__dirname, "../..");

test("qa-review-explorer.html wires the hero module and import map", () => {
  const html = fs.readFileSync(path.join(ROOT, "qa-review-explorer.html"), "utf8");
  assert.match(html, /qa-review-explorer\.html/);
  assert.match(html, /type="importmap"/);
  assert.match(html, /"three":\s*"\/vendor\/three\//);
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
  assert.match(html, /type="importmap"/);
  assert.match(html, /"three":\s*"\/vendor\/three\//);
  assert.doesNotMatch(html, /class="stage"[^>]*data-fx[^>]*data-fx-mode="0"/);
  for (const name of ["hero-3d-en-safe.webp", "hero-3d-en-safe.png", "hero-3d-en-scan.webp", "hero-3d-en-scan.png"]) {
    assert.ok(fs.existsSync(path.join(ROOT, "assets/url-review-hero", name)), name);
  }
});

test("hero scene module exports situational controls", () => {
  // Assert from source text: url-review-unit does not npm-install three, so scene.js cannot be imported here.
  const src = fs.readFileSync(path.join(ROOT, "js/url-review-hero/scene.js"), "utf8");
  assert.match(src, /export const LOOP_SEC = 10/);
  assert.match(src, /export const LAYER_KEYS = \["card", "shield", "orbit", "report"\]/);
  assert.match(src, /export const LANGS = \["en", "de", "es", "fr", "it", "pt"\]/);
  const map = JSON.parse(fs.readFileSync(path.join(ROOT, "js/url-review-hero/importmap.json"), "utf8"));
  assert.match(map.imports.three, /^\/vendor\/three\//);
});