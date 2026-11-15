const test = require("node:test");
const assert = require("node:assert/strict");

test("the outreach clock starts company trials once each weekday, in a slot of its own before leads", async () => {
  const { MODES } = await import("../../workers/outreach-cron/src/index.js");
  const at = Object.entries(MODES).filter(([, m]) => m === "companies").map(([cron]) => cron);
  assert.deepEqual(at, ["0 14 * * mon-fri"]);
  const hours = Object.entries(MODES).filter(([cron]) => cron.endsWith("mon-fri")).map(([cron, m]) => [Number(cron.split(" ")[1]) * 60 + Number(cron.split(" ")[0]), m]);
  assert.equal(new Set(hours.map(([h]) => h)).size, hours.length, "two weekday jobs share a start time");
  assert.ok(hours.find(([, m]) => m === "companies")[0] < hours.find(([, m]) => m === "leads")[0]);
});
