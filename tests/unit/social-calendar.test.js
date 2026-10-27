const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const cal = require("../../scripts/social-calendar");
const ledger = require("../../scripts/social-ledger");

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
    post("digest-2026-11-06/01-this-week", { kind: "news", lane: 3, pin: true, rows: rows("2026-11-06") }),
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
  assert.equal(days.get("2026-11-06")[3], "digest-2026-11-06/01-this-week", "a pinned post keeps its day while lane 3 is free sooner");
  assert.equal(days.get("2026-11-01")[3], "runs-3/01-ilo", "a sent review stays, in a borrowed lane, not the top's");
  assert.ok(!moves.some((m) => m.post.lane === 1 && m.lane === 1 && !/\/01-/.test(m.post.id)), "only a top review takes lane 1");
});

test("a new daily batch puts its top review in the next free lane 1 slot and its other reviews in the next free lane 3 and 4 slots", () => {
  const at = (day, lane) => rows(day, cal.slotTime(day, "linkedin", lane));
  const posts = [
    post("auto-2026-10-31/01-u-taken-com", { sent: true, rows: rows("2026-11-01") }),
    post("runs-100/01-wikipedia", { rows: at("2026-11-01", 3) }),
    post("runs-100/02-bbc", { rows: at("2026-11-01", 4) }),
    post("runs-100/03-mit", { rows: at("2026-11-02", 3) }),
    post("auto-2026-11-01/01-u-top-com", { rows: rows("2026-11-01") }),
    post("auto-2026-11-01/02-u-second-com", { rows: rows("2026-11-01") }),
    post("auto-2026-11-01/03-u-third-com", { rows: rows("2026-11-01") })
  ];
  const result = cal.plan(posts, { from: "2026-11-01", batch: "auto-2026-11-01" });
  assert.deepEqual(result.moves.map((m) => m.post.id + " " + m.day + " " + m.lane), [
    "auto-2026-11-01/01-u-top-com 2026-11-02 1",
    "auto-2026-11-01/02-u-second-com 2026-11-02 4",
    "auto-2026-11-01/03-u-third-com 2026-11-03 3"
  ]);
  assert.deepEqual(result.held, []);
  assert.deepEqual(result.moves.map((m) => m.hub), ["2026-11-01", "2026-11-01", "2026-11-01"], "on the hub from the batch day");
  const moved = cal.rowsFor(result.moves[0]);
  assert.equal(moved.find((r) => r.channel === "linkedin").time, cal.slotTime("2026-11-02", "linkedin", 1));
  assert.deepEqual(moved.find((r) => r.channel === "instagram"), { date: "2026-11-02", time: "09:00", channel: "instagram", asset: "feed/x.jpg" });
});

test("planning again after a write changes nothing, even when the ids sort the other way as text", () => {
  const posts = [
    post("runs-3/98-caracoltv", { rows: rows("2026-11-01") }),
    post("runs-3/100-paris", { rows: rows("2026-11-02") })
  ];
  const slots = (result) => result.moves.map((m) => m.post.id + " " + m.day + " " + m.lane);
  const first = cal.plan(posts, { from: "2026-11-01" });
  assert.deepEqual(slots(first), ["runs-3/98-caracoltv 2026-11-01 3", "runs-3/100-paris 2026-11-01 4"]);
  const written = first.moves.map((m) => Object.assign({}, m.post, { rows: cal.rowsFor(m) }));
  assert.deepEqual(slots(cal.plan(written, { from: "2026-11-01" })), slots(first));
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

test("a daily Live Report's hub date never moves past its batch day, and any other post's follows its slot", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "cal-"));
  const dir = path.join(root, "media/social-posts/auto-2026-11-01");
  fs.mkdirSync(dir, { recursive: true });
  fs.mkdirSync(path.join(root, "assets/social"), { recursive: true });
  fs.writeFileSync(path.join(dir, "captions.json"), JSON.stringify({ "01-a": { date: "2026-11-01" }, "02-b": { date: "2026-11-01" }, "03-c": { date: "2026-11-01" } }, null, 2));
  fs.writeFileSync(path.join(dir, "calendar.csv"), "Date,Time,Channel,Post,Asset\n" + ["01-a", "02-b", "03-c"].map((slug) => "2026-11-01,09:15,linkedin," + slug + ",feed/" + slug + ".jpg").join("\n") + "\n");
  fs.writeFileSync(path.join(root, "assets/social/buffer.json"), JSON.stringify({ version: 1, posts: {
    "auto-2026-11-01/02-b": [{ channel: "linkedin", profile: "p", id: "b2", at: "2027-03-01T14:15:00.000Z", result: "queued" }],
    "auto-2026-11-01/03-c": [{ channel: "linkedin", profile: "p", id: "b3", at: "2026-10-31T14:15:00.000Z", result: "queued" }]
  } }));
  cal.reconcile(root, Date.parse("2026-10-25T00:00:00Z"));
  const caps = () => JSON.parse(fs.readFileSync(path.join(dir, "captions.json"), "utf8"));
  assert.deepEqual(Object.values(caps()).map((c) => c.date), ["2026-11-01", "2026-11-01", "2026-10-31"], "a queue later than the hub keeps the batch day; an earlier one pulls the hub date in");
  const { posts } = cal.load(root);
  const a = posts.find((p) => p.slug === "01-a");
  cal.write({ moves: [{ post: a, day: "2026-12-01", lane: 3, hub: "2026-11-01" }], held: [] }, root);
  assert.equal(caps()["01-a"].date, "2026-11-01");
  assert.match(fs.readFileSync(path.join(dir, "calendar.csv"), "utf8"), /^2026-12-01,\d\d:\d\d,linkedin,01-a,/m);

  const tips = [post("tips/01-sent", { kind: "tip", lane: 2, sent: true }), post("tips/02-next", { kind: "tip", lane: 2 })];
  assert.deepEqual(cal.plan(tips, { from: "2026-11-01" }).moves.map((m) => m.day + " " + m.hub), ["2026-11-02 2026-11-02"]);
});

test("sync moves only queued posts whose slot changed, never one due within half an hour", () => {
  const root = fixture();
  const now = Date.parse("2026-12-31T12:00:00Z");
  const entry = (over) => Object.assign({ channel: "linkedin", profile: "linkedin (QA-lab)", id: "b1", at: "2027-01-01T14:15:00.000Z", result: "queued" }, over);
  fs.writeFileSync(path.join(root, "assets/social/buffer.json"), JSON.stringify({ version: 1, posts: {
    "runs-100/01-a": [entry({ at: "2027-01-02T14:15:00.000Z" }), entry({ channel: "x", id: "b2" })],
    "runs-100/02-b": [entry({ id: "b3", at: "2027-01-01T15:15:00.000Z" })]
  } }));
  fs.writeFileSync(path.join(root, "assets/social/facebook.json"), JSON.stringify({ version: 1, posts: { "runs-100/02-b": [entry({ channel: "facebook", id: "f1", at: "2027-01-03T00:00:00.000Z" })] } }));
  assert.deepEqual(cal.targets(root, now).map((t) => t.postId + " -> " + t.to), ["b1 -> 2027-01-01T14:15:00.000Z"], "the Facebook Page keeps its times");
  assert.deepEqual(cal.targets(root, Date.parse("2027-01-01T14:00:00Z")), []);
});

const youtubePost = {
  id: "y1", status: "scheduled", dueAt: "2027-01-02T22:00:00.000Z", text: "Description", channelService: "youtube", schedulingType: "automatic", tags: [],
  assets: [{ type: "video", source: "https://github.com/o/r/releases/download/b/01-a.mp4", thumbnail: "https://t/1.jpg", video: { thumbnailOffset: 0, title: null } }],
  metadata: { __typename: "YoutubePostMetadata", title: "a.com: 72. #Shorts", category: { categoryId: "28", title: "Science & Technology" }, privacy: "public", license: "youtube", madeForKids: false, notifySubscribers: true, embeddable: true, isAiGenerated: false }
};

test("a Buffer edit sends the whole post back as Buffer holds it, with the new time", () => {
  assert.deepEqual(cal.editInput(youtubePost, "2027-01-01T22:10:00.000Z"), {
    id: "y1", mode: "customScheduled", dueAt: "2027-01-01T22:10:00.000Z", text: "Description", schedulingType: "automatic",
    assets: [{ video: { url: "https://github.com/o/r/releases/download/b/01-a.mp4", metadata: { thumbnailOffset: 0 } } }],
    metadata: { youtube: { title: "a.com: 72. #Shorts", categoryId: "28", privacy: "public", license: "youtube", madeForKids: false, notifySubscribers: true, embeddable: true, isAiGenerated: false } }
  });
  const linkedin = { id: "l1", text: "Post", channelService: "linkedin", tags: [{ id: "t1" }], assets: [{ type: "image", source: "https://s/feed/01-a.jpg", thumbnail: "https://s/t.jpg", image: { altText: "Score card" } }], metadata: { __typename: "LinkedInPostMetadata", firstComment: null } };
  assert.deepEqual(cal.editInput(linkedin, "2027-01-01T13:00:00.000Z"), { id: "l1", mode: "customScheduled", dueAt: "2027-01-01T13:00:00.000Z", text: "Post", tagIds: ["t1"], assets: [{ image: { url: "https://s/feed/01-a.jpg", metadata: { altText: "Score card" } } }] });
  const tiktok = { id: "t1", text: "Clip", channelService: "tiktok", assets: [], metadata: { title: null, isAiGenerated: false } };
  assert.deepEqual(cal.editInput(tiktok, "2027-01-01T23:00:00.000Z").metadata, { tiktok: { isAiGenerated: false } });
  assert.throws(() => cal.editInput({ id: "x1", text: "1/", channelService: "twitter", assets: [], metadata: { threadCount: 2 } }, "2027-01-01T13:00:00.000Z"), /thread/);
});

test("sync moves Buffer posts in windows of calls, records each move, skips what is due within half an hour, and a dry run re-saves one post per channel", async () => {
  const root = fixture();
  const now = Date.parse("2026-12-31T12:00:00Z");
  const queued = (channel, id, at) => ({ channel, profile: channel, id, at, result: "queued" });
  fs.writeFileSync(path.join(root, "assets/social/buffer.json"), JSON.stringify({ version: 1, posts: {
    "runs-100/01-a": [queued("linkedin", "l1", "2027-01-05T14:00:00.000Z"), queued("instagram", "i1", "2027-01-05T17:00:00.000Z")],
    "runs-100/02-b": [queued("linkedin", "l2", "2027-01-06T14:00:00.000Z")]
  } }));
  const held = {
    l1: { id: "l1", status: "scheduled", dueAt: "2027-01-05T14:00:00.000Z", text: "A", channelService: "linkedin", assets: [], metadata: null },
    i1: { id: "i1", status: "scheduled", dueAt: "2027-01-05T17:00:00.000Z", text: "A", channelService: "instagram", assets: [], metadata: { type: "post", shouldShareToFeed: true } },
    l2: { id: "l2", status: "scheduled", dueAt: "2027-01-06T14:00:00.000Z", text: "B", channelService: "linkedin", assets: [], metadata: null }
  };
  const edits = [];
  const gql = async (query, vars) => {
    if (/organizations/.test(query)) return { account: { organizations: [{ id: "o" }] } };
    if (/posts\(/.test(query)) return { posts: { pageInfo: { hasNextPage: false }, edges: Object.values(held).map((node) => ({ node })) } };
    edits.push(vars.input);
    return { editPost: { post: { id: vars.input.id, dueAt: vars.input.dueAt } } };
  };
  const quiet = console.log;
  console.log = () => {};
  try {
    const dry = await cal.sync({ dryRun: true, root, gql, now: () => now, sleep: async () => {}, pace: 0 });
    assert.deepEqual(edits.map((e) => e.id + " " + e.dueAt), ["l1 2027-01-05T14:00:00.000Z", "i1 2027-01-05T17:00:00.000Z"], "one post per channel, at its own time");
    assert.deepEqual(Object.keys(dry.checked), ["linkedin", "instagram"]);
    assert.equal(dry.failed, 0);

    edits.length = 0;
    const waits = [];
    const first = await cal.sync({ root, gql, now: () => now, sleep: async (ms) => { if (ms > 1000) waits.push(ms); }, pace: 0, windows: 1, perWindow: 5 });
    assert.deepEqual(edits.map((e) => e.id + " " + e.dueAt), ["l1 2027-01-05T14:00:00.000Z", "i1 2027-01-05T17:00:00.000Z", "l1 2027-01-01T14:15:00.000Z"], "two reads, a check per channel and one move fill the window");
    assert.deepEqual([first.left, waits.length], [2, 0]);
    const book = () => JSON.parse(fs.readFileSync(path.join(root, "assets/social/buffer.json"), "utf8")).posts;
    assert.equal(book()["runs-100/01-a"].find((e) => e.id === "l1").at, "2027-01-01T14:15:00.000Z", "the ledger records the move");
    held.l1.dueAt = "2027-01-01T14:15:00.000Z";

    edits.length = 0;
    const rest = await cal.sync({ root, gql, now: () => now, sleep: async (ms) => { if (ms > 1000) waits.push(ms); }, pace: 0, windows: 2, perWindow: 5 });
    assert.deepEqual(edits.map((e) => e.id), ["l2", "i1", "l2", "i1"], "the checks, then the soonest time first");
    assert.equal(edits[3].metadata.instagram.type, "post");
    assert.deepEqual([rest.left, waits.length], [0, 1], "the second window waited for the first to end");
    assert.deepEqual(cal.targets(root, now), []);
    assert.deepEqual((await cal.sync({ root, gql, now: () => Date.parse("2027-01-01T14:00:00Z"), pace: 0 })).list, [], "nothing within half an hour of its time");
  } finally {
    console.log = quiet;
  }
});

test("a post waiting for the sync keeps its calendar slot, and the sync stops while the day's or the 30 days' reserve of Buffer calls is left", async () => {
  const root = fixture();
  const now = Date.parse("2026-12-31T12:00:00Z");
  const file = path.join(root, "assets/social/buffer.json");
  const book = () => JSON.parse(fs.readFileSync(file, "utf8")).posts["runs-100/01-a"][0];
  fs.writeFileSync(file, JSON.stringify({ version: 1, posts: { "runs-100/01-a": [{ channel: "linkedin", profile: "p", id: "l1", at: "2027-01-05T14:00:00.000Z", result: "queued" }] } }));
  assert.equal(cal.mark(root, now), 1);
  assert.equal(book().slot, "2027-01-01T14:15:00.000Z");
  cal.reconcile(root, now);
  assert.match(fs.readFileSync(path.join(root, "media/social-posts/runs-100/calendar.csv"), "utf8"), /^2027-01-01,09:15,linkedin,01-a,/m, "the daily --write does not set it back");

  const seeded = ledger.read(file);
  ledger.record(seeded, "runs-100/01-a", { channel: "linkedin", profile: "p", id: "l1", at: "2027-01-05T14:00:00.000Z", result: "queued", checked: "2027-01-01T00:00:00.000Z" });
  assert.equal(seeded.posts["runs-100/01-a"][0].slot, "2027-01-01T14:15:00.000Z", "a seed keeps the slot");
  ledger.record(seeded, "runs-100/01-a", { channel: "linkedin", profile: "p", id: "l1", at: "2027-01-01T14:15:00.000Z", result: "queued", checked: "2027-01-02T00:00:00.000Z" });
  assert.equal(seeded.posts["runs-100/01-a"][0].slot, undefined, "and drops it once Buffer has the new time");

  cal.readLimits(new Headers([
    ["ratelimit", '"100-in-15min"; r=98; t=897'], ["ratelimit", '"500-in-1day"; r=212; t=40000'], ["ratelimit", '"15000-in-30days"; r=14000; t=696980'],
    ["ratelimit-policy", '"100-in-15min"; q=100; w=900'], ["ratelimit-policy", '"500-in-1day"; q=500; w=86400'], ["ratelimit-policy", '"15000-in-30days"; q=15000; w=2592000']
  ]));
  assert.deepEqual(cal.daily, { left: 212, quota: 500, reset: 40000 }, "the daily window, matched by its length");
  assert.deepEqual(cal.monthly, { left: 14000, quota: 15000, reset: 696980 }, "and the 30-day one");
  Object.assign(cal.daily, { left: null, quota: null, reset: null });
  Object.assign(cal.monthly, { left: null, quota: null, reset: null });
  assert.deepEqual([cal.waitText(3600), cal.waitText(40000), cal.waitText(696980)], ["1 h", "12 h", "9 days"]);

  const post = { id: "l1", status: "scheduled", dueAt: "2027-01-05T14:00:00.000Z", text: "A", channelService: "linkedin", assets: [], metadata: null };
  const edits = [];
  const gql = (edit) => async (query, vars) => {
    if (/organizations/.test(query)) return { account: { organizations: [{ id: "o" }] } };
    if (/posts\(/.test(query)) return { posts: { pageInfo: { hasNextPage: false }, edges: [{ node: post }] } };
    edits.push(vars.input.id);
    return edit(vars);
  };
  const ok = gql((vars) => ({ editPost: { post: { id: vars.input.id, dueAt: vars.input.dueAt } } }));
  const opts = { root, now: () => now, sleep: async () => {}, pace: 0 };
  const quiet = console.log;
  console.log = () => {};
  try {
    const reserve = await cal.sync(Object.assign({ gql: ok, limits: { left: 100, quota: 250, reset: 7200 } }, opts));
    assert.match(reserve.stopped, /100 of Buffer's 250 daily calls left/);
    const month = await cal.sync(Object.assign({ gql: ok, month: { left: 4800, quota: 12000, reset: 864000 } }, opts));
    assert.match(month.stopped, /4800 of Buffer's 12000 calls for 30 days left, kept for the other jobs; the oldest frees up in 10 days/);
    const roomy = cal.budget({ windows: 1, gql: async () => ({}), sleep: async () => {}, now: () => now, limits: { left: 1000, quota: 1800, reset: 1 }, month: { left: 4801, quota: 12000, reset: 1 } });
    assert.deepEqual([await roomy("query { a }"), roomy.stopped], [{}, null], "above both reserves it calls");
    const monthSpent = await cal.sync(Object.assign({ gql: gql(() => { throw Object.assign(new Error("Buffer 429"), { window: "30d", retryAfter: 5 * 86400 }); }) }, opts));
    assert.match(monthSpent.stopped, /30d limit is spent; retry in 5 days/);
    edits.length = 0;
    const spent = await cal.sync(Object.assign({ gql: gql(() => { throw Object.assign(new Error("Buffer 429"), { window: "24h", retryAfter: 3600 }); }) }, opts));
    assert.match(spent.stopped, /24h limit is spent/);
    assert.deepEqual([edits, spent.left, book().slot], [["l1"], 1, "2027-01-01T14:15:00.000Z"], "nothing moved, and it still waits");

    edits.length = 0;
    const rejected = await cal.sync(Object.assign({ gql: gql(() => ({ editPost: { message: "YouTube posts require a title" } })) }, opts));
    assert.deepEqual([edits, rejected.failed, rejected.left, book().slot], [["l1"], 1, 1, "2027-01-01T14:15:00.000Z"], "a channel whose check Buffer rejects does not move");
    const done = await cal.sync(Object.assign({ gql: ok }, opts));
    assert.deepEqual([done.left, done.stopped, book().at, book().slot], [0, null, "2027-01-01T14:15:00.000Z", undefined]);
  } finally {
    console.log = quiet;
  }
});

test("a moved post's Facebook Page row keeps its time, and its hub date is no later than any network holds it", () => {
  const post = { id: "runs-100/01-a", lane: 1, rows: rows("2026-11-10"), kept: new Set(["facebook"]), queuedDay: "2026-11-08" };
  const move = { post, day: "2026-11-12", lane: 3 };
  const moved = cal.rowsFor(move);
  assert.deepEqual(moved.find((r) => r.channel === "facebook"), { date: "2026-11-10", time: "09:00", channel: "facebook", asset: "feed/x.jpg" });
  assert.equal(moved.find((r) => r.channel === "linkedin").date, "2026-11-12");
  assert.equal(cal.hubDay(move), "2026-11-08");
  assert.equal(cal.hubDay(Object.assign({}, move, { post: Object.assign({}, post, { queuedDay: null, kept: new Set() }) })), "2026-11-12");

  const root = fixture();
  fs.writeFileSync(path.join(root, "assets/social/buffer.json"), JSON.stringify({ version: 1, posts: {
    "runs-100/01-a": [{ channel: "linkedin", profile: "p", id: "b1", at: "2026-12-30T14:00:00.000Z", result: "queued" }]
  } }));
  assert.deepEqual(cal.hubLate(root, Date.parse("2026-12-01T00:00:00Z")), ["runs-100/01-a hub 2027-01-01, on a network 2026-12-30"]);
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

test("the launch set's calendar becomes one post per language in the common layout, and its posts take lane 5 in the clips' language order", () => {
  const old = "Date,Time,Channel,Language,Post,Format,Asset,How,Caption key\n" + [
    "2026-10-29,17:00,LinkedIn,es,exports,PDF carousel,es/exports-carousel.pdf,\"Buffer composer, attach PDF\",linkedin",
    "2026-10-29,08:30,LinkedIn,es,exports,Image 1080x1350,es/exports-portrait.jpg,Buffer CSV,linkedin",
    "2026-10-29,12:00,Instagram story,en,exports,Image 1080x1920,en/exports-story.jpg,\"Buffer composer, add link sticker\",story",
    "2026-10-29,18:30,YouTube Shorts,en,exports,Video 1080x1920,en/exports-reel.mp4,\"Buffer composer, title from youtubeTitle\",youtube"
  ].join("\n") + "\n";
  assert.equal(cal.launchCalendar(old), "Date,Time,Channel,Post,Asset\n" + [
    "2026-10-29,08:30,linkedin,es/exports,es/exports-portrait.jpg",
    "2026-10-29,12:00,instagram-story,en/exports,en/exports-story.jpg",
    "2026-10-29,17:00,linkedin-carousel,es/exports,es/exports-carousel.pdf",
    "2026-10-29,18:30,youtube,en/exports,en/exports-reel.mp4"
  ].join("\n") + "\n");
  assert.throws(() => cal.launchCalendar("Date,Time,Channel,Language,Post,Format,Asset\n2026-10-29,08:30,Pinterest,en,x,Image,a.jpg\n"), /Pinterest/);

  const root = fs.mkdtempSync(path.join(os.tmpdir(), "launch-"));
  const dir = path.join(root, "media/social-posts/launch-2026-10");
  fs.mkdirSync(path.join(root, "assets/social"), { recursive: true });
  const langs = ["de", "en", "es", "fr", "it", "pt"];
  langs.forEach((lang) => {
    fs.mkdirSync(path.join(dir, lang), { recursive: true });
    fs.writeFileSync(path.join(dir, lang, "a11y-captions.json"), "{}");
  });
  const lines = langs.flatMap((lang) => cal.NETWORKS.map((net) => "2026-10-26,08:30," + (net === "youtube" ? "YouTube Shorts" : net) + "," + lang + ",a11y,Image,a.jpg,Buffer CSV," + net));
  fs.writeFileSync(path.join(dir, "calendar.csv"), cal.launchCalendar("Date,Time,Channel,Language,Post,Format,Asset,How,Caption key\n" + lines.join("\n")));
  fs.writeFileSync(path.join(root, "assets/social/buffer.json"), JSON.stringify({ version: 1, posts: {
    "launch-2026-10/en/a11y": [{ channel: "youtube", profile: "youtube (QA-lab)", id: "y1", at: "2026-10-19T03:40:52.000Z", result: "sent" }]
  } }));
  const { posts } = cal.load(root);
  assert.deepEqual(posts.map((p) => p.id + " " + p.lane + " " + p.date).sort(), langs.map((lang) => "launch-2026-10/" + lang + "/a11y 5 2026-10-26"));
  const { moves } = cal.plan(posts, { from: "2026-10-26" });
  assert.deepEqual(moves.map((m) => m.day + " " + m.lane + " " + m.post.slug), [
    "2026-10-27 5 es/a11y", "2026-10-28 5 pt/a11y", "2026-10-29 5 de/a11y", "2026-10-30 5 fr/a11y", "2026-10-31 5 it/a11y"
  ], "the English post went out on YouTube and keeps its day's lane 5");
  assert.deepEqual(cal.write({ moves, held: [] }, root), ["launch-2026-10"]);
  assert.ok(!fs.existsSync(path.join(dir, "captions.json")), "the launch set keeps its captions per post");
  const csv = fs.readFileSync(path.join(dir, "calendar.csv"), "utf8");
  assert.match(csv, new RegExp("^2026-10-31," + cal.slotTime("2026-10-31", "linkedin", 5) + ",linkedin,it/a11y,a\\.jpg$", "m"));
  assert.match(csv, /^2026-10-26,08:30,linkedin,en\/a11y,/m);

  fs.writeFileSync(path.join(dir, "es", "a11y-captions.json"), JSON.stringify({ youtubeTitle: "Tu sitio, revisado. #Shorts" }));
  fs.writeFileSync(path.join(root, "assets/social/youtube.json"), JSON.stringify({ videos: { v1: { title: "Tu sitio, revisado.", publishedAt: "2026-10-19T04:00:00Z" } } }));
  assert.ok(cal.load(root).posts.find((p) => p.slug === "es/a11y").sent, "a clip the hub's YouTube ledger lists went out, though Buffer's ledger lacks it");
  assert.ok(!cal.load(root).posts.find((p) => p.slug === "pt/a11y").sent);
});

test("a daily Live Reports batch sends every review to the networks", () => {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "auto-")), "batch.json");
  const run = (host) => ({ host, title: [host + ": {overall}."], body: "b", action: "a", areas: { SEO: 70 }, overall: 70, scope: "Requested", fetchedAt: "2026-10-24T10:00:00Z", pages: 1 });
  fs.writeFileSync(file, JSON.stringify([run("a.com"), run("b.com"), run("c.com")]));
  process.env.AUTO_BATCH = file;
  delete require.cache[require.resolve("../../scripts/tips-studio/runs-auto")];
  const { TIPS } = require("../../scripts/tips-studio/runs-auto");
  delete process.env.AUTO_BATCH;
  assert.deepEqual(TIPS.map((tip) => tip.host + ":" + !!tip.hold), ["a.com:false", "b.com:false", "c.com:false"]);
});

test("the Friday digest credits five linked picks and is pinned to its Friday inside each network's window", () => {
  const digest = require("../../scripts/tips-studio/weekly-digest");
  digest.editions().forEach((day) => {
    const edition = digest.load(day);
    assert.equal(new Date(day + "T12:00:00Z").getUTCDay(), 5, day + " is a Friday");
    assert.ok(!edition.draft, day + " is still a draft");
    const tip = digest.postFor(edition);
    assert.equal(tip.kind, "news");
    assert.ok(tip.pin);
    edition.picks.forEach((pick) => {
      assert.match(pick.url, /^https:\/\//, day + " " + pick.id);
      assert.ok(pick.source && pick.title && pick.short && pick.summary, day + " " + pick.id);
    });
  });
  const tip = digest.TIPS[0];
  const text = digest.captions(tip).linkedin;
  digest.load(tip.date).picks.forEach((pick) => {
    assert.ok(text.includes(pick.url) && text.includes(digest.credit(pick)), pick.id + " is credited and linked");
  });
  cal.NETWORKS.forEach((network) => {
    const at = digest.timeFor(tip, network);
    const [from, to] = cal.WINDOWS[network].map(minutes);
    assert.ok(minutes(at) >= from && minutes(at) <= to, network + " " + at + " is in its window");
  });
});
