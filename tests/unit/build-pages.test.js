const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const { listPublished } = require("../../scripts/build-pages");

const ROOT = path.join(__dirname, "..", "..");

test("a hub language page written by the rebuild but not committed is published", () => {
  const page = "social/pick/zz-untracked-es.html";
  const stray = "social/pick/zz-untracked.txt";
  fs.writeFileSync(path.join(ROOT, page), "<!DOCTYPE html><title>zz</title>\n");
  fs.writeFileSync(path.join(ROOT, stray), "not a page\n");
  try {
    const files = listPublished(ROOT);
    assert.ok(files.includes(page));
    assert.equal(files.includes(stray), false);
    assert.equal(files.filter((file) => file === page).length, 1);
    assert.ok(files.includes("index.html"));
  } finally {
    fs.unlinkSync(path.join(ROOT, page));
    fs.unlinkSync(path.join(ROOT, stray));
  }
});
