const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const R = require("../../scripts/reddit-ledger");
const ledger = require("../../scripts/social-ledger");

const ROOT = path.join(__dirname, "../..");
const NOW = Date.parse("2026-11-04T16:50:00Z");
const post = (over) => Object.assign({ kind: "post", key: "live/2026-11-04", id: "t3_abc", url: "https://www.reddit.com/r/QALabLiveReports/comments/abc/x/", posted: "2026-11-04T16:20:03.000Z", at: "2026-11-04T16:20:04.000Z", subreddit: "QALabLiveReports", subscribers: 12 }, over);
const line = (rec) => R.PREFIX + JSON.stringify(rec);
const tmpFile = (body) => {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "reddit-ledger-")), "reddit.json");
  if (body) fs.writeFileSync(file, JSON.stringify(body));
  return file;
};

test("parse finds the app's lines in devvit logs --json output and in plain output, and skips the rest", () => {
  const text = [
    JSON.stringify({ message: line(post()), timestamp: "2026-11-04T16:20:04Z" }),
    "Nov 04 16:20:05 " + line({ kind: "members", at: "2026-11-03T16:20:00.000Z", subreddit: "QALabLiveReports", subscribers: 10 }),
    JSON.stringify({ message: "sticky failed; nope" }),
    R.PREFIX + "{\"kind\":\"post\",\"key\":",
    line({ kind: "other", at: "2026-11-04T00:00:00Z" }),
    "streaming logs for qalab-live-reports on r/QALabLiveReports"
  ].join("\n");
  const recs = R.parse(text);
  assert.deepEqual(recs.map((r) => r.kind), ["members", "post"], "oldest first, the cut and unknown lines dropped");
});

test("a batch post goes into the ledger like Telegram's, under its batch key, and the members get one point a day", () => {
  const book = ledger.empty();
  const keys = R.apply(book, R.parse([
    line({ kind: "members", at: "2026-11-03T16:20:00.000Z", subreddit: "QALabLiveReports", subscribers: 10 }),
    line(post()),
    line({ kind: "members", at: "2026-11-04T20:00:00.000Z", subreddit: "QALabLiveReports", subscribers: 13 })
  ].join("\n")), NOW);
  assert.deepEqual(keys, ["live/2026-11-04"]);
  assert.deepEqual(book.posts["live/2026-11-04"], [{ channel: "reddit", profile: "Reddit r/QALabLiveReports", id: "t3_abc", at: "2026-11-04T16:20:03.000Z", result: "sent", url: "https://www.reddit.com/r/QALabLiveReports/comments/abc/x/", checked: new Date(NOW).toISOString() }]);
  assert.equal(book.members.chat, "r/QALabLiveReports");
  assert.equal(book.members.members, 13);
  assert.deepEqual(book.members.history.map((p) => [p.date, p.members]), [["2026-11-03", 10], ["2026-11-04", 13]]);
});

test("a post line without a batch key or id records only the member count", () => {
  const book = ledger.empty();
  assert.deepEqual(R.apply(book, [post({ key: "menu" }), post({ id: "" })], NOW), []);
  assert.deepEqual(book.posts, {});
  assert.equal(book.members.members, 12);
  const none = ledger.empty();
  R.apply(none, [post({ subscribers: null, key: "x" })], NOW);
  assert.equal(none.members, undefined, "no count, no members entry");
});

test("run writes the ledger file with its members, and leaves it alone when the logs have no ledger line or on a dry run", () => {
  const file = tmpFile();
  const logs = [];
  R.run("", { file, now: NOW, log: (m) => logs.push(m) });
  assert.equal(fs.existsSync(file), false);
  assert.match(logs.pop(), /No ledger lines/);
  R.run(line(post()), { file, now: NOW, dry: true, log: (m) => logs.push(m) });
  assert.equal(fs.existsSync(file), false);
  assert.match(logs.pop(), /Dry run/);
  R.run(line(post()), { file, now: NOW, log: (m) => logs.push(m) });
  const saved = JSON.parse(fs.readFileSync(file, "utf8"));
  assert.equal(saved.posts["live/2026-11-04"][0].id, "t3_abc");
  assert.equal(saved.members.members, 12);
  assert.match(logs.pop(), /1 batch posts \(live\/2026-11-04\); r\/QALabLiveReports has 12 members/);
});

test("merging two Reddit ledgers keeps both sides' posts and member points, the newer count wins", () => {
  const a = ledger.empty();
  R.apply(a, [post({ key: "live/2026-11-03", id: "t3_old", posted: "2026-11-03T16:20:03.000Z", at: "2026-11-03T16:20:04.000Z", subscribers: 10 })], NOW);
  const b = ledger.empty();
  R.apply(b, [post()], NOW);
  ledger.merge(a, b);
  assert.deepEqual(Object.keys(a.posts).sort(), ["live/2026-11-03", "live/2026-11-04"]);
  assert.equal(a.members.members, 12);
  assert.deepEqual(a.members.history.map((p) => p.members), [10, 12]);
  const older = ledger.empty();
  R.apply(older, [post({ at: "2026-11-02T10:00:00.000Z", subscribers: 9 })], NOW);
  ledger.merge(a, older);
  assert.equal(a.members.members, 12, "an older reading does not replace the count");
  assert.equal(a.members.history.length, 3);
});

test("the daily numbers line keeps each post's score and comments, a newer reading wins, and writing and merging keep them", () => {
  const book = ledger.empty();
  R.apply(book, R.parse([
    line({ kind: "numbers", at: "2026-11-04T16:20:06.000Z", posts: [{ id: "t3_abc", score: 7, comments: 2 }, { id: "", score: 1 }, { id: "t3_neg", score: -3, comments: 0 }] }),
    line({ kind: "numbers", at: "2026-11-03T16:20:06.000Z", posts: [{ id: "t3_abc", score: 1, comments: 0 }] })
  ].join("\n")), NOW);
  assert.deepEqual(book.numbers, { t3_abc: { likes: 7, comments: 2, at: "2026-11-04T16:20:06.000Z" }, t3_neg: { likes: 0, comments: 0, at: "2026-11-04T16:20:06.000Z" } });
  const file = tmpFile();
  ledger.write(file, book);
  assert.deepEqual(JSON.parse(fs.readFileSync(file, "utf8")).numbers.t3_abc, { likes: 7, comments: 2, at: "2026-11-04T16:20:06.000Z" });
  const other = ledger.empty();
  ledger.numbers(other, "t3_abc", { likes: 9, comments: 3 }, "2026-11-05T16:20:06.000Z");
  ledger.merge(book, other);
  assert.equal(book.numbers.t3_abc.likes, 9);
});

test("the Devvit app logs the lines the parser reads, and the ledger job and commit script use the ledger", () => {
  const server = fs.readFileSync(path.join(ROOT, "reddit/live-reports/src/server/index.js"), "utf8");
  assert.ok(server.includes('const LEDGER = "' + R.PREFIX + '"'));
  ["kind", "key", "id", "url", "posted", "subscribers"].forEach((f) => assert.match(server, new RegExp("\\b" + f + "\\b"), f));
  assert.match(server, /numberOfSubscribers/);
  assert.match(server, /kind: "numbers"/);
  assert.match(server, /score: post\.score, comments: post\.numberOfComments/);
  const wf = fs.readFileSync(path.join(ROOT, ".github/workflows/reddit-live.yml"), "utf8");
  assert.match(wf, /devvit logs "\$REDDIT_SUBREDDIT" qalab-live-reports --since 3d --json/);
  assert.match(wf, /node scripts\/reddit-ledger\.js/);
  assert.match(fs.readFileSync(path.join(ROOT, "scripts/commit-social-ledgers.sh"), "utf8"), /assets\/social\/reddit\.json/);
});
