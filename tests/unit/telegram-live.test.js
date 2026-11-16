const test = require("node:test");
const assert = require("node:assert/strict");
const ledgers = require("../../scripts/social-ledger");

process.env.TELEGRAM_APP = "https://t.me/qalab_live_bot/live";
const tg = require("../../scripts/telegram-live");

const NOW = Date.parse("2026-11-06T12:00:00.000Z");
const report = (id, read, over = {}) => Object.assign({ id, name: id + ".com", read, overall: 70, grade: "C", flag: "🌐", sector: "health", country: "PE" }, over);
const sent = (id, over = {}) => Object.assign({ channel: "telegram", profile: "Telegram @qalab_live", id, at: "2026-11-04T18:38:14.000Z", result: "sent", checked: "2026-11-04T18:38:14.214Z" }, over);
const INDEX = { reports: [report("a", "2026-11-03"), report("b", "2026-11-04", { overall: 90 }), report("c", "2026-11-05"), report("d", "2026-11-06", { country: "MX" })] };
const ledgerOf = (posts) => ({ version: 1, posts });

test("the channel description names the Mini App, the review page and the face page, within Telegram's 255 characters", () => {
  const text = tg.channelDescription();
  assert.ok(text.length <= 255, text.length + " characters");
  ["t.me/qalab_live_bot/live", "carlosandmunoz.com/qa-review.html", "carlosandmunoz.com/qalaburlreview.html"].forEach((link) => assert.ok(text.includes(link), link));
});

test("each ledger date holds the reports read after the date before it, the first only its own date's", () => {
  const ledger = ledgerOf({ "live/2026-11-04": [sent("3")], "live/2026-11-06": [sent("4")] });
  assert.deepEqual(tg.batches(ledger, INDEX).map((b) => [b.day, b.reports.map((r) => r.id)]), [["2026-11-04", ["b"]], ["2026-11-06", ["c", "d"]]]);
});

test("the series size a post names counts only the reports read up to its date", () => {
  assert.equal(tg.seriesSize(INDEX, "2026-11-04"), 2);
  assert.ok(tg.message([INDEX.reports[1]], 2).includes("The series now holds 2 public sites."));
});

test("a post whose text matches its hash is left alone, and a later batch does not change an older post", () => {
  const first = tg.message([INDEX.reports[1]], tg.seriesSize(INDEX, "2026-11-04"));
  const ledger = ledgerOf({ "live/2026-11-04": [sent("3", { hash: tg.hash(first) })] });
  assert.deepEqual(tg.scrubPlan(ledger, INDEX, NOW), []);
});

test("a withdrawn site is rebuilt out of its post, and an emptied batch says the day's reports were withdrawn without names", () => {
  const before = tg.message([INDEX.reports[2], INDEX.reports[3]], 4);
  const ledger = ledgerOf({ "live/2026-11-04": [sent("3", { hash: tg.hash(tg.message([INDEX.reports[1]], 2)) })], "live/2026-11-06": [sent("4", { hash: tg.hash(before) })] });
  const index = { reports: [INDEX.reports[0], INDEX.reports[3]] };
  const plan = tg.scrubPlan(ledger, index, NOW);
  assert.deepEqual(plan.map((p) => [p.post, p.entry.id, p.count]), [["live/2026-11-04", "3", 0], ["live/2026-11-06", "4", 1]]);
  assert.equal(plan[0].text, tg.withdrawn("2026-11-04"));
  assert.ok(!plan[0].text.includes("b.com"));
  assert.ok(!plan[1].text.includes("c.com") && plan[1].text.includes("d.com"));
  assert.ok(plan[1].text.includes("The series now holds 2 public sites."));
});

test("only sent posts of the last 60 days are scrubbed, and a post without a hash is checked once", () => {
  const ledger = ledgerOf({
    "live/2026-09-01": [sent("1")],
    "live/2026-11-04": [sent("3", { result: "failed" })],
    "live/2026-11-06": [sent("4")]
  });
  const index = { reports: [report("old", "2026-09-01")].concat(INDEX.reports) };
  assert.deepEqual(tg.scrubPlan(ledger, index, NOW).map((p) => p.post), ["live/2026-11-06"]);
});

test("scrubbing edits the changed posts, takes 'message is not modified' as current, and records the hash and time", async () => {
  const ledger = ledgerOf({ "live/2026-11-04": [sent("3")], "live/2026-11-06": [sent("4")], "live/2026-11-07": [sent("5")] });
  const index = { reports: INDEX.reports.concat(report("e", "2026-11-07")) };
  const edits = [];
  const counts = await tg.scrubLedger(ledger, index, NOW, async (entry, text) => {
    edits.push([entry.id, text]);
    if (entry.id === "4") throw new Error("editMessageText: Bad Request: message is not modified: specified new message content and reply markup are exactly the same");
    if (entry.id === "5") throw new Error("editMessageText: Bad Request: message to edit not found");
  });
  assert.deepEqual(counts, { edited: 1, same: 1, failed: 1 });
  assert.deepEqual(edits.map(([id]) => id), ["3", "4", "5"]);
  const at = new Date(NOW).toISOString();
  assert.deepEqual(ledgers.find(ledger, "live/2026-11-04", "telegram", "Telegram @qalab_live"), sent("3", { hash: tg.hash(edits[0][1]), checked: at }));
  assert.equal(ledgers.find(ledger, "live/2026-11-06", "telegram", "Telegram @qalab_live").hash, tg.hash(edits[1][1]));
  assert.equal(ledgers.find(ledger, "live/2026-11-07", "telegram", "Telegram @qalab_live").hash, undefined);
  assert.deepEqual(tg.scrubPlan(ledger, index, NOW).map((p) => p.entry.id), ["5"]);
});

test("the ledger keeps the hash through write and merge, newest check wins", () => {
  const into = ledgerOf({ "live/2026-11-04": [sent("3")] });
  const from = ledgerOf({ "live/2026-11-04": [sent("3", { hash: "abc123", checked: "2026-11-05T00:00:00.000Z" })] });
  assert.equal(ledgers.merge(into, from).posts["live/2026-11-04"][0].hash, "abc123");
});
