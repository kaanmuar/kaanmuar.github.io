const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync } = require("child_process");
const ledger = require("../../scripts/social-ledger");

const POST = "auto-2026-10-24/01-u-example-com";
const entry = (over) => Object.assign({ channel: "linkedin", profile: "linkedin (QA-lab)", id: "b1", at: "2026-10-25T12:30:00.000Z", result: "queued", checked: "2026-10-24T12:00:00.000Z" }, over);
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), "social-ledger-"));

test("record keeps one entry per channel and profile, and drops empty fields", () => {
  const book = ledger.empty();
  ledger.record(book, POST, entry({ error: "", url: undefined }));
  ledger.record(book, POST, entry({ profile: "bluesky (qa)", channel: "x", id: "b2" }));
  ledger.record(book, POST, entry({ id: "b3", checked: "2026-10-24T13:00:00.000Z" }));
  assert.equal(book.posts[POST].length, 2);
  assert.deepEqual(ledger.find(book, POST, "linkedin", "linkedin (QA-lab)"), entry({ id: "b3", checked: "2026-10-24T13:00:00.000Z" }));
  assert.equal("error" in book.posts[POST][0], false);
  assert.equal(ledger.find(book, POST, "facebook", "Facebook Page"), null);
});

test("a sent or failed result outlives a later queued entry for the same post id, a new id replaces it", () => {
  const book = ledger.empty();
  ledger.record(book, POST, entry({ result: "sent", checked: "2026-10-25T13:00:00.000Z" }));
  ledger.record(book, POST, entry({ result: "queued", checked: "2026-10-26T13:00:00.000Z" }));
  assert.equal(book.posts[POST][0].result, "sent");
  ledger.record(book, POST, entry({ id: "b9", result: "queued", checked: "2026-10-26T13:00:00.000Z" }));
  assert.deepEqual([book.posts[POST][0].id, book.posts[POST][0].result], ["b9", "queued"]);
  ledger.record(book, POST, entry({ id: "b9", result: "failed", error: "Token expired", checked: "2026-10-26T12:00:00.000Z" }));
  assert.equal(book.posts[POST][0].result, "failed");
});

test("merge adds entries from another run without losing either side", () => {
  const ours = ledger.empty();
  ledger.record(ours, POST, entry({ result: "sent", checked: "2026-10-25T13:00:00.000Z" }));
  ledger.record(ours, "auto-2026-10-25/01-b", entry({ id: "b4" }));
  const theirs = ledger.empty();
  ledger.record(theirs, POST, entry());
  ledger.record(theirs, POST, entry({ channel: "facebook", profile: "Facebook Page", id: "1_2" }));
  ledger.merge(theirs, ours);
  assert.deepEqual(Object.keys(theirs.posts).sort(), [POST, "auto-2026-10-25/01-b"].sort());
  assert.deepEqual(theirs.posts[POST].map((e) => e.channel + ":" + e.result), ["linkedin:sent", "facebook:queued"]);
});

test("read and write: a missing file is an empty ledger, entries are sorted, and the --merge CLI combines two files", () => {
  const dir = tmp();
  const into = path.join(dir, "buffer.json");
  const from = path.join(dir, "from.json");
  assert.deepEqual(ledger.read(into), ledger.empty());
  const book = ledger.empty();
  ledger.record(book, "z/2", entry({ channel: "x", profile: "threads" }));
  ledger.record(book, "a/1", entry({ channel: "x", profile: "threads" }));
  ledger.record(book, "a/1", entry({ channel: "linkedin" }));
  ledger.write(into, book);
  const text = fs.readFileSync(into, "utf8");
  assert.ok(text.endsWith("}\n"));
  const back = JSON.parse(text);
  assert.deepEqual(Object.keys(back.posts), ["a/1", "z/2"]);
  assert.deepEqual(back.posts["a/1"].map((e) => e.channel), ["linkedin", "x"]);
  const other = ledger.empty();
  ledger.record(other, "a/1", entry({ channel: "linkedin", result: "sent", checked: "2026-10-26T00:00:00.000Z" }));
  ledger.record(other, "m/3", entry());
  ledger.write(from, other);
  execFileSync(process.execPath, [path.join(__dirname, "../../scripts/social-ledger.js"), "--merge", from, into]);
  const merged = ledger.read(into);
  assert.deepEqual(Object.keys(merged.posts), ["a/1", "m/3", "z/2"]);
  assert.equal(ledger.find(merged, "a/1", "linkedin", "linkedin (QA-lab)").result, "sent");
  assert.throws(() => execFileSync(process.execPath, [path.join(__dirname, "../../scripts/social-ledger.js"), "--merge", from], { stdio: "pipe" }));
  fs.writeFileSync(into, "{ not json");
  assert.throws(() => ledger.read(into), SyntaxError);
});

test("upgrade looks up only queued entries whose time has passed and records sent or failed", async () => {
  const now = Date.parse("2026-10-26T12:00:00.000Z");
  const book = ledger.empty();
  ledger.record(book, POST, entry({ id: "sent-1" }));
  ledger.record(book, POST, entry({ channel: "x", profile: "bluesky", id: "error-1" }));
  ledger.record(book, POST, entry({ channel: "x", profile: "threads", id: "gone-1" }));
  ledger.record(book, POST, entry({ channel: "instagram", profile: "ig", id: "wait-1" }));
  ledger.record(book, POST, entry({ channel: "tiktok", profile: "tt", id: "future-1", at: "2026-10-27T12:00:00.000Z" }));
  ledger.record(book, POST, entry({ channel: "youtube", profile: "yt", id: "", result: "failed", error: "No clip" }));
  const posts = {
    "sent-1": { status: "sent", sentAt: "2026-10-25T12:31:04.000Z", externalLink: "https://www.linkedin.com/feed/update/1", error: null },
    "error-1": { status: "error", sentAt: null, externalLink: null, error: { message: "Channel disconnected" } },
    "gone-1": null,
    "wait-1": { status: "sending", sentAt: null, externalLink: null, error: null }
  };
  const asked = [];
  const counts = await ledger.upgrade(book, now, async (e) => { asked.push(e.id); return ledger.fromBuffer(posts[e.id]); });
  assert.deepEqual(asked.sort(), ["error-1", "gone-1", "sent-1", "wait-1"]);
  assert.deepEqual(counts, { sent: 1, failed: 2, queued: 1 });
  const get = (channel, profile) => ledger.find(book, POST, channel, profile);
  assert.deepEqual(get("linkedin", "linkedin (QA-lab)"), entry({ id: "sent-1", result: "sent", at: "2026-10-25T12:31:04.000Z", url: "https://www.linkedin.com/feed/update/1", checked: "2026-10-26T12:00:00.000Z" }));
  assert.deepEqual([get("x", "bluesky").result, get("x", "bluesky").error], ["failed", "Channel disconnected"]);
  assert.deepEqual([get("x", "threads").result, get("x", "threads").error], ["failed", "No longer in Buffer"]);
  assert.equal(get("instagram", "ig").result, "queued");
  assert.equal(get("tiktok", "tt").result, "queued");
  assert.equal(get("youtube", "yt").error, "No clip");
});

test("fromBuffer and fromGraph map the network's answer to a ledger result", () => {
  assert.equal(ledger.fromBuffer({ status: "scheduled" }), null);
  assert.equal(ledger.fromBuffer({ status: "error", error: null }).error, "Buffer could not publish it");
  assert.deepEqual(ledger.fromGraph({ is_published: true, permalink_url: "https://www.facebook.com/1/posts/2" }), { result: "sent", url: "https://www.facebook.com/1/posts/2" });
  assert.equal(ledger.fromGraph({ is_published: false }), null);
  assert.deepEqual(ledger.fromGraph(null), { result: "failed", error: "No longer on the Page" });
});

test("a batch a spent limit stopped stays listed for retry through write, read and a merge, until it is cleared", () => {
  const file = path.join(tmp(), "buffer.json");
  const book = ledger.empty();
  ledger.write(file, book);
  assert.equal("retry" in JSON.parse(fs.readFileSync(file, "utf8")), false);
  ledger.markRetry(book, "auto-2026-10-25", "Buffer's 1d limit is spent", "2026-10-25T06:00:00.000Z");
  ledger.markRetry(book, "auto-2026-10-25", "spent again", "2026-10-26T03:37:00.000Z");
  ledger.write(file, book);
  const back = ledger.read(file);
  assert.deepEqual(back.retry, { "auto-2026-10-25": { since: "2026-10-25T06:00:00.000Z", error: "spent again" } });
  const main = ledger.markRetry(ledger.empty(), "digest-2026-10-30", "spent", "2026-10-25T08:05:00.000Z");
  assert.deepEqual(ledger.retries(ledger.merge(main, back)), ["auto-2026-10-25", "digest-2026-10-30"]);
  ledger.clearRetry(back, "auto-2026-10-25");
  assert.deepEqual(ledger.retries(back), []);
  ledger.write(file, back);
  assert.equal("retry" in JSON.parse(fs.readFileSync(file, "utf8")), false);
});
