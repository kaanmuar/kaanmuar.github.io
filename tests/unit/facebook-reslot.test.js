const test = require("node:test");
const assert = require("node:assert");
const { plan } = require("../../scripts/facebook-reslot");

const at = (day, time) => Date.parse(day + "T" + time + ":00-05:00");
const now = at("2026-10-25", "08:00");

test("a day over the cap keeps pinned and on-day posts and moves the rest to the next day with room", () => {
  const day = "2026-10-30";
  const queued = [
    { post: "b/pinned", at: at(day, "19:00"), keep: 2 },
    { post: "b/on-day", at: at(day, "18:00"), keep: 1 },
    ...["12:00", "13:00", "14:00", "15:00"].map((t, i) => ({ post: "b/off-" + i, at: at(day, t), keep: 0 })),
    ...[0, 1, 2, 3, 4].map((i) => ({ post: "b/full-" + i, at: at("2026-10-31", "1" + (2 + i) + ":00"), keep: 1 }))
  ];
  const moves = plan(queued, { cap: 5, from: "2026-10-26", now });
  assert.deepStrictEqual(moves.map((m) => m.post), ["b/off-3"]);
  const to = new Date(moves[0].to - 5 * 3600e3).toISOString();
  assert.strictEqual(to.slice(0, 10), "2026-11-01");
  assert.ok(to.slice(11, 16) >= "12:00" && to.slice(11, 16) <= "19:00");
});

test("days before --from and days within the cap are left alone", () => {
  const queued = [0, 1, 2, 3, 4, 5].map((i) => ({ post: "b/" + i, at: at("2026-10-25", "1" + i + ":00"), keep: 0 }));
  assert.deepStrictEqual(plan(queued, { cap: 5, from: "2026-10-26", now }), []);
  assert.deepStrictEqual(plan(queued.slice(0, 5).map((q) => Object.assign({}, q, { at: q.at + 86400e3 })), { cap: 5, from: "2026-10-26", now }), []);
});

test("a moved post never lands within 30 minutes of another post that day", () => {
  const day = "2026-11-02";
  const queued = [0, 1, 2, 3, 4, 5].map((i) => ({ post: "b/" + i, at: at(day, String(12 + i).padStart(2, "0") + ":10"), keep: 0 }))
    .concat({ post: "b/next", at: at("2026-11-03", "15:00"), keep: 0 });
  const [move] = plan(queued, { cap: 5, from: "2026-10-26", now });
  assert.ok(Math.abs(move.to - at("2026-11-03", "15:00")) >= 30 * 60e3);
});
