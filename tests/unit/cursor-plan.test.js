const test = require("node:test");
const assert = require("node:assert/strict");
const plan = require("../../scripts/cursor-plan.js");

const now = Date.parse("2026-11-02T07:30:00Z");
const cache = (at, cycleEnd, extra = {}) => ({ at, planPct: 71.5, cycleEnd, odEnabled: true, odLimit: 0, odRemaining: 0, ...extra });

test("the plan share comes from a fresh Cursor Quota cache; a missing, old or last-cycle cache reads as unknown (#2012)", () => {
  assert.equal(plan.planPercent(cache(Date.parse("2026-11-02T06:00:00Z") / 1000, "2026-11-08T19:58:25Z"), now), 71.5);
  assert.equal(plan.planPercent(cache(Date.parse("2026-11-02T06:00:00Z"), "2026-11-08T19:58:25Z"), now), 71.5);
  assert.equal(plan.planPercent(cache(Date.parse("2026-11-01T06:00:00Z") / 1000, "2026-11-01T23:34:01.000Z"), now), null);
  assert.equal(plan.planPercent(cache(Date.parse("2026-10-23T15:00:00Z") / 1000, "2026-11-08T19:58:25Z"), now), null);
  assert.equal(plan.planPercent(cache(Date.parse("2026-11-02T06:00:00Z") / 1000, ""), now), null);
  assert.equal(plan.planPercent(null, now), null);
  assert.equal(plan.planPercent({}, now), null);
});

test("the quota shortcut prints the plan share, or says it is unknown instead of a stale number", () => {
  assert.equal(plan.quotaLine(cache(now / 1000 - 60, "2026-11-08T19:58:25Z"), now), "Cursor plan 72% used · resets Nov 8");
  assert.equal(plan.quotaLine(cache(now / 1000 - 3600, "2026-11-08T19:58:25Z", { odLimit: 10000, odRemaining: 2550 }), now), "Cursor plan 72% used · on-demand $25.50 of $100 left · resets Nov 8 · as of 60m ago");
  assert.match(plan.quotaLine(cache(Date.parse("2026-10-23T15:00:00Z") / 1000, "2026-11-01T23:34:01.000Z"), now), /^Cursor quota unknown/);
});
