"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const R = require("../../functions/engagement-regions");
const E = require("../../functions/engagement");

const SLOT = 30 * 60 * 1000;
const NOW = Date.parse("2026-11-05T15:00:00Z");

test("pack rotates by slot when discoveryPack is auto", () => {
  const a = R.packForRun(NOW, { discoveryPack: "auto" });
  const b = R.packForRun(NOW + SLOT, { discoveryPack: "auto" });
  assert.ok(a.rotate);
  assert.notEqual(a.primary, b.primary);
  assert.ok(R.PACK_IDS.includes(a.primary));
});

test("pinned pack ignores rotation", () => {
  const run = R.packForRun(NOW + 99 * SLOT, { discoveryPack: "apac" });
  assert.equal(run.primary, "apac");
  assert.equal(run.rotate, false);
  const topics = R.discoveryForRun(NOW, null, { discoveryPack: "apac" });
  assert.ok(topics.every((t) => R.PACKS.apac.langs.includes(t.lang)));
});

test("discovery budget respects pack pool", () => {
  const topics = R.discoveryForRun(NOW, 8, { discoveryPack: "cis" });
  assert.equal(topics.length, 8);
  assert.ok(topics.some((t) => t.lang === "ru" || t.lang === "uk"));
  assert.ok(E.settings(null).discoveryPack === "auto");
});