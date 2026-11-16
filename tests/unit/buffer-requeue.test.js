const test = require("node:test");
const assert = require("node:assert");
const { requeueTargets } = require("../../scripts/buffer-queue");

test("requeue replaces only queued posts with an id that are not due within 30 minutes", () => {
  const now = Date.parse("2026-10-26T12:00:00Z");
  const yt = (extra) => Object.assign({ channel: "youtube", profile: "youtube (QA-lab URL Review)", id: "b1", at: "2026-10-26T21:55:00.000Z", result: "queued" }, extra);
  const book = { posts: {
    "auto-1/01-a": [{ channel: "tiktok", profile: "tiktok (x)", id: "t1", at: "2026-10-27T00:00:00Z", result: "queued" }, yt()],
    "auto-1/02-b": [yt({ result: "sent" })],
    "auto-1/03-c": [yt({ at: "2026-10-26T12:20:00.000Z" })],
    "auto-1/04-d": [yt({ id: undefined })]
  } };
  const out = requeueTargets(book, ["auto-1/01-a", "auto-1/02-b", "auto-1/03-c", "auto-1/04-d", "auto-1/05-e"], "youtube", now);
  assert.deepStrictEqual(out.map((t) => [t.batch, t.slug, t.skip && t.skip.split(/,| on/)[0]]), [
    ["auto-1", "01-a", null],
    ["auto-1", "02-b", "sent"],
    ["auto-1", "03-c", "due 2026-10-26T12:20:00.000Z"],
    ["auto-1", "04-d", "queued"],
    ["auto-1", "05-e", "not in the ledger"]
  ]);
  assert.strictEqual(out[0].entry.id, "b1");
});
