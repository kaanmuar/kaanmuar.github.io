const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const cal = require("../../scripts/social-calendar");

const minutes = (t) => { const [h, m] = t.split(":").map(Number); return h * 60 + m; };
const rows = (date, time = "09:00") => cal.NETWORKS.concat("instagram").map((channel) => ({ date, time, channel, asset: "feed/x.jpg" }));
const post = (id, over) => Object.assign({ id, batch: id.split("/")[0], slug: id.split("/")[1], kind: "review", lane: 1, date: "2026-11-01", hold: false, sent: false, rows: rows("2026-11-01") }, over);

test("each network's five lanes take the five parts of its window, apart, and the order moves on a part a day", () => {
  for (const network of cal.NETWORKS) {
    const [from, to] = cal.WINDOWS[network].map(minutes);
    const part = (to - from) / 5;
    const at = (day) => [1, 2, 3, 4, 5].map((lane) => Math.floor((minutes(cal.slotTime(day, network, lane)) - from) / part));
    assert.deepEqual(at("2026-11-01").slice().sort(), [0, 1, 2, 3, 4], network);
    assert.deepEqual(at("2026-11-02"), at("2026-11-01").map((p) => (p + 1) % 5), network);
    const times = [1, 2, 3, 4, 5].map((lane) => minutes(cal.slotTime("2026-11-01", network, lane))).sort((a, b) => a - b);
    times.slice(1).forEach((t, i) => assert.ok(t - times[i] >= part * 0.3, network + " slots too close"));
  }
  assert.equal(cal.slotTime("2026-11-01", "x", 3), cal.slotTime("2026-11-01", "x", 3));
});

test("the top Live Report keeps lane 1, the review backlog borrows lanes 3 and 4, and other lanes take their own kind", () => {
  const posts = [
    post("auto-2026-10-31/01-u-top-com", { rows: rows("2026-11-01") }),
    post("auto-2026-10-31/02-u-next-com", { rows: rows("2026-11-02") }),
    post("runs-100/01-wikipedia", { rows: rows("2026-12-01") }),
    post("runs-100/02-bbc", { rows: rows("2026-12-01") }),
    post("tips-2026-10/01-hsts", { kind: "tip", lane: 2, rows: rows("2026-11-03") }),
    post("tips-2026-10/02-csp", { kind: "tip", lane: 2, rows: rows("2026-11-03") }),
    post("horror/01-csp", { kind: "series", lane: 5, rows: rows("2026-11-02") }),
    post("checks/01-pre-release", { kind: "advice", lane: 4, rows: rows("2026-11-05") }),
    post("runs-3/01-ilo", { sent: true, rows: rows("2026-11-01") }),
    post("auto-2026-10-20/02-u-old-com", { rows: rows("2026-10-31") }),
    post("promo/01-held", { kind: "launch", lane: 5, hold: true })
  ];
  const { moves, days } = cal.plan(posts, { from: "2026-11-01" });
  const at = Object.fromEntries(moves.map((m) => [m.post.id, m.day + " lane " + m.lane]));
  assert.deepEqual(at, {
    "auto-2026-10-31/01-u-top-com": "2026-11-01 lane 1",
    "tips-2026-10/01-hsts": "2026-11-01 lane 2",
    "checks/01-pre-release": "2026-11-01 lane 4",
    "auto-2026-10-31/02-u-next-com": "2026-11-02 lane 3",
    "tips-2026-10/02-csp": "2026-11-02 lane 2",
    "runs-100/01-wikipedia": "2026-11-02 lane 4",
    "runs-100/02-bbc": "2026-11-03 lane 3"
  });
  assert.equal(days.get("2026-11-02")[5], "horror/01-csp", "a seasonal series keeps its day");
  assert.equal(days.get("2026-11-01")[3], "runs-3/01-ilo", "a sent review stays, in a borrowed lane, not the top's");
  assert.ok(!moves.some((m) => m.post.lane === 1 && m.lane === 1 && !/\/01-/.test(m.post.id)), "only a top review takes lane 1");
});

test("a new daily batch puts its top review in the next free lane 1 slot and its hub-only reviews on the same day", () => {
  const posts = [
    post("auto-2026-10-31/01-u-taken-com", { sent: true, rows: rows("2026-11-01") }),
    post("auto-2026-11-01/01-u-top-com", { rows: rows("2026-11-01") }),
    post("auto-2026-11-01/02-u-second-com", { hold: true, rows: [], date: "2026-11-03" }),
    post("runs-100/01-wikipedia", { rows: rows("2026-11-02", cal.slotTime("2026-11-02", "linkedin", 3)) }),
    post("runs-100/02-bbc", { rows: rows("2026-11-02", "06:00") })
  ];
  const result = cal.plan(posts, { from: "2026-11-01", batch: "auto-2026-11-01" });
  assert.deepEqual(result.moves.map((m) => m.post.id + " " + m.day), ["auto-2026-11-01/01-u-top-com 2026-11-02"]);
  assert.deepEqual(result.held.map((m) => m.post.id + " " + m.day), ["auto-2026-11-01/02-u-second-com 2026-11-02"]);
  assert.deepEqual(result.days.get("2026-11-02"), { 1: "auto-2026-11-01/01-u-top-com", 3: "runs-100/01-wikipedia", 4: "runs-100/02-bbc" }, "the planned backlog keeps lanes 3 and 4");
  const moved = cal.rowsFor(result.moves[0]);
  assert.equal(moved.find((r) => r.channel === "linkedin").time, cal.slotTime("2026-11-02", "linkedin", 1));
  assert.deepEqual(moved.find((r) => r.channel === "instagram"), { date: "2026-11-02", time: "09:00", channel: "instagram", asset: "feed/x.jpg" });
});

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "cal-"));
  const dir = path.join(root, "media/social-posts/runs-100");
  fs.mkdirSync(dir, { recursive: true });
  fs.mkdirSync(path.join(root, "assets/social"), { recursive: true });
  fs.writeFileSync(path.join(dir, "captions.json"), JSON.stringify({ "01-a": { date: "2027-01-01", cat: "Worldwide" }, "02-b": { date: "2027-01-01", cat: "Worldwide" } }, null, 2));
  fs.writeFileSync(path.join(dir, "calendar.csv"), "Date,Time,Channel,Post,Asset\n2027-01-01,09:15,linkedin,01-a,feed/01-a.jpg\n2027-01-01,10:15,linkedin,02-b,feed/02-b.jpg\n2027-01-01,12:00,instagram,01-a,feed/01-a.jpg\n");
  return root;
}

test("writing a plan moves a post's calendar rows and hub date together", () => {
  const root = fixture();
  const { posts } = cal.load(root);
  assert.deepEqual(posts.map((p) => p.id + " " + p.kind + " " + p.lane), ["runs-100/01-a review 1", "runs-100/02-b review 1"]);
  const result = cal.plan(posts, { from: "2026-11-01" });
  assert.deepEqual(cal.write(result, root), ["runs-100"]);
  const caps = JSON.parse(fs.readFileSync(path.join(root, "media/social-posts/runs-100/captions.json"), "utf8"));
  assert.deepEqual([caps["01-a"].date, caps["02-b"].date], ["2026-11-01", "2026-11-01"]);
  const csv = fs.readFileSync(path.join(root, "media/social-posts/runs-100/calendar.csv"), "utf8").trim().split("\n");
  assert.equal(csv[0], "Date,Time,Channel,Post,Asset");
  assert.deepEqual(csv.slice(1).map((l) => l.split(",").slice(0, 4).join(",")).sort(), [
    "2026-11-01," + cal.slotTime("2026-11-01", "linkedin", 3) + ",linkedin,01-a",
    "2026-11-01," + cal.slotTime("2026-11-01", "linkedin", 4) + ",linkedin,02-b",
    "2026-11-01,12:00,instagram,01-a"
  ].sort());
});

test("sync moves only queued posts whose slot changed, never one due within half an hour", () => {
  const root = fixture();
  const now = Date.parse("2026-12-31T12:00:00Z");
  const entry = (over) => Object.assign({ channel: "linkedin", profile: "linkedin (QA-lab)", id: "b1", at: "2027-01-01T14:15:00.000Z", result: "queued" }, over);
  fs.writeFileSync(path.join(root, "assets/social/buffer.json"), JSON.stringify({ version: 1, posts: {
    "runs-100/01-a": [entry({ at: "2027-01-02T14:15:00.000Z" }), entry({ channel: "x", id: "b2" })],
    "runs-100/02-b": [entry({ id: "b3", at: "2027-01-01T15:15:00.000Z" })]
  } }));
  fs.writeFileSync(path.join(root, "assets/social/facebook.json"), JSON.stringify({ version: 1, posts: { "runs-100/02-b": [entry({ channel: "linkedin", id: "f1", result: "sent", at: "2027-01-03T00:00:00.000Z" })] } }));
  assert.deepEqual(cal.targets(root, now).map((t) => t.service + " " + t.postId + " -> " + t.to), ["buffer b1 -> 2027-01-01T14:15:00.000Z"]);
  assert.deepEqual(cal.targets(root, Date.parse("2027-01-01T14:00:00Z")), []);
});

test("the calendar takes the queued times from the ledgers, the hub date follows, and queued posts stay unless asked", () => {
  const root = fixture();
  const now = Date.parse("2026-10-25T00:00:00Z");
  fs.writeFileSync(path.join(root, "assets/social/buffer.json"), JSON.stringify({ version: 1, posts: {
    "runs-100/02-b": [{ channel: "linkedin", profile: "p", id: "b3", at: "2026-11-10T14:15:00.000Z", result: "queued" }]
  } }));
  assert.deepEqual(cal.reconcile(root, now), ["runs-100"]);
  const csv = fs.readFileSync(path.join(root, "media/social-posts/runs-100/calendar.csv"), "utf8");
  assert.match(csv, /^2026-11-10,09:15,linkedin,02-b,feed\/02-b\.jpg$/m);
  assert.match(csv, /^2027-01-01,09:15,linkedin,01-a,/m);
  const caps = JSON.parse(fs.readFileSync(path.join(root, "media/social-posts/runs-100/captions.json"), "utf8"));
  assert.deepEqual([caps["01-a"].date, caps["02-b"].date], ["2027-01-01", "2026-11-10"]);
  assert.deepEqual(cal.reconcile(root, now), [], "a second pass changes nothing");

  const { posts } = cal.load(root);
  assert.deepEqual(cal.plan(posts, { from: "2026-11-01" }).moves.map((m) => m.post.id), ["runs-100/01-a"]);
  assert.deepEqual(cal.plan(posts, { from: "2026-11-01", moveQueued: true }).moves.map((m) => m.post.id).sort(), ["runs-100/01-a", "runs-100/02-b"]);
});

test("a daily Live Reports batch sends its first review to the networks and keeps the others on the hub", () => {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "auto-")), "batch.json");
  const run = (host) => ({ host, title: [host + ": {overall}."], body: "b", action: "a", areas: { SEO: 70 }, overall: 70, scope: "Requested", fetchedAt: "2026-10-24T10:00:00Z", pages: 1 });
  fs.writeFileSync(file, JSON.stringify([run("a.com"), run("b.com"), run("c.com")]));
  process.env.AUTO_BATCH = file;
  delete require.cache[require.resolve("../../scripts/tips-studio/runs-auto")];
  const { TIPS } = require("../../scripts/tips-studio/runs-auto");
  delete process.env.AUTO_BATCH;
  assert.deepEqual(TIPS.map((tip) => tip.host + ":" + tip.hold), ["a.com:false", "b.com:true", "c.com:true"]);
});
