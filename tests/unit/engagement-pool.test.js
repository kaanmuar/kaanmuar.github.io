"use strict";
// The browser agent's scheduling (#3141): profile groups, per-profile locks, the staggered pool, --parallel, holds.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const P = require("../../scripts/engagement-browser/pool.js");

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), "engagement-pool-"));

test("networks with a profile of their own get a group each; the rest share the main profile, in order", () => {
  const own = new Set(["x", "reddit"]);
  const got = P.groups(["linkedin", "x", "threads", "reddit"], (k) => (own.has(k) ? "/p/" + k : "/chrome"));
  assert.deepEqual(got, [{ profile: "/chrome", nets: ["linkedin", "threads"] }, { profile: "/p/x", nets: ["x"] }, { profile: "/p/reddit", nets: ["reddit"] }]);
});

test("a lock is held once: a second take fails while its process lives, and works after unlock", () => {
  const dir = path.join(tmp(), "locks", "x");
  assert.equal(P.lock(dir, 60000), true);
  assert.equal(fs.readFileSync(path.join(dir, "pid"), "utf8"), String(process.pid));
  assert.equal(P.lock(dir, 60000), false, "this process still holds it");
  assert.equal(P.held(dir, 60000), true);
  P.unlock(dir);
  assert.equal(P.held(dir, 60000), false);
  assert.equal(P.lock(dir, 60000), true);
  P.unlock(dir);
});

test("a crashed run's lock is taken over: a dead pid at once, a lock with no pid once it is stale", () => {
  const root = tmp();
  const dead = path.join(root, "dead");
  fs.mkdirSync(dead);
  fs.writeFileSync(path.join(dead, "pid"), "2147483646");
  assert.equal(P.lock(dead, 60000), true, "its process is gone");
  const old = path.join(root, "old");
  fs.mkdirSync(old);
  assert.equal(P.lock(old, 60000), false, "no pid and fresh: still held");
  assert.equal(P.lock(old, 60000, Date.now() + 120000), true, "no pid and older than the stale time");
});

test("the pool runs at most n at once, staggers every start after the first, and keeps the items' order", async () => {
  let now = 0;
  let running = 0;
  let most = 0;
  const starts = [];
  const waits = [];
  const got = await P.pool([1, 2, 3, 4, 5], 2, async (v) => {
    starts.push(v);
    running += 1;
    most = Math.max(most, running);
    await new Promise((r) => setTimeout(r, 5 * (6 - v)));
    running -= 1;
    if (v === 3) throw new Error("three failed");
    return v * 10;
  }, { stagger: () => 7, sleep: async (ms) => { waits.push(ms); now += ms; } });
  assert.equal(most, 2);
  assert.deepEqual(waits, [7, 7, 7, 7], "four staggered starts after the first");
  assert.deepEqual(starts.slice().sort(), [1, 2, 3, 4, 5]);
  assert.deepEqual(got.map((r) => (r.ok ? r.value : r.error.message)), [10, 20, "three failed", 40, 50], "a failure costs only its item");
});

test("the pool with n above the items starts each once; with one it runs them in turn", async () => {
  const seen = [];
  await P.pool(["a"], 5, async (v) => seen.push(v));
  assert.deepEqual(seen, ["a"]);
  const order = [];
  await P.pool(["a", "b", "c"], 1, async (v) => { order.push(v + "<"); await new Promise((r) => setTimeout(r, 2)); order.push(v + ">"); });
  assert.deepEqual(order, ["a<", "a>", "b<", "b>", "c<", "c>"]);
});

test("--parallel N, --parallel=N, ENGAGEMENT_PARALLEL and the default 3, clamped to 1..8; other args stay in order", () => {
  assert.deepEqual(P.parallelArg(["run", "x,reddit", "--force"], {}), { n: 3, rest: ["run", "x,reddit", "--force"] });
  assert.deepEqual(P.parallelArg(["run", "--parallel", "5", "x"], {}), { n: 5, rest: ["run", "x"] });
  assert.deepEqual(P.parallelArg(["check", "--parallel=2", "--read"], { ENGAGEMENT_PARALLEL: "6" }), { n: 2, rest: ["check", "--read"] });
  assert.equal(P.parallelArg(["run"], { ENGAGEMENT_PARALLEL: "4" }).n, 4);
  assert.equal(P.parallelArg(["run", "--parallel", "40"], {}).n, 8);
  assert.equal(P.parallelArg(["run", "--parallel", "0"], { ENGAGEMENT_PARALLEL: "1" }).n, 1);
});

test("saving holds keeps another run's networks as stored and this run's as it left them (a hold it dropped stays dropped)", () => {
  const stored = { blocked: { x: "2026-11-10T00:00:00Z", reddit: "2026-11-10T01:00:00Z" }, inboxAt: { x: "a", tiktok: "b" } };
  const mine = { blocked: { x: "2026-11-10T00:00:00Z", linkedin: "2026-11-10T02:00:00Z" }, inboxAt: { linkedin: "c", tiktok: "stale" } };
  assert.deepEqual(P.mergeHeld(stored, mine, ["linkedin", "reddit"]), {
    blocked: { x: "2026-11-10T00:00:00Z", linkedin: "2026-11-10T02:00:00Z" },
    inboxAt: { x: "a", tiktok: "b", linkedin: "c" }
  });
});

test("a clone leaves out caches and Chrome's open-profile locks, and keeps cookies and storage", () => {
  ["SingletonLock", "SingletonCookie", "Default/Cache/Cache_Data/f_000001", "Default/Code Cache/js/index", "GrShaderCache/data_0",
    "Default/Service Worker/CacheStorage/abc", "Crashpad/settings.dat", "BrowserMetrics-spare.pma"].forEach((p) => assert.equal(P.cloneSkip(p), true, p));
  ["Local State", "Default/Cookies", "Default/Local Storage/leveldb/000003.log", "Default/IndexedDB/https_www.instagram.com_0.indexeddb.leveldb/LOG",
    "Default/Preferences", "Default/Service Worker/Database/LOG"].forEach((p) => assert.equal(P.cloneSkip(p), false, p));
});

test("cookies belong to their network's hosts and subdomains only (#3163)", () => {
  assert.equal(P.cookieOf(".linkedin.com", "linkedin"), true);
  assert.equal(P.cookieOf("www.linkedin.com", "linkedin"), true);
  assert.equal(P.cookieOf(".twitter.com", "x"), true);
  assert.equal(P.cookieOf(".instagram.com", "threads"), false);
  assert.equal(P.cookieOf("notlinkedin.com", "linkedin"), false);
  assert.equal(P.cookieOf(".example.com"), false, "no network: not one of the agent's");
  assert.equal(P.cookieOf(".tiktok.com"), true);
});

test("kept sessions: a copy per gap unless more networks signed in, each network's newest kept however old (#3163)", () => {
  const root = tmp();
  const profile = path.join(root, "chrome");
  const dir = path.join(root, "sessions", "main");
  fs.mkdirSync(path.join(profile, "Default"), { recursive: true });
  assert.equal(P.saveSessions(profile, dir, ["x"], Date.parse("2026-11-09T10:00:00Z")), "", "no cookie store yet");
  fs.writeFileSync(path.join(profile, "Default", "Cookies"), "v1");
  fs.writeFileSync(path.join(profile, "Local State"), "{}");
  fs.mkdirSync(path.join(profile, "Default", "Local Storage"));
  fs.writeFileSync(path.join(profile, "Default", "Local Storage", "a"), "auth");
  const H = 3600000;
  const t0 = Date.parse("2026-11-09T10:00:00Z");
  const first = P.saveSessions(profile, dir, ["x", "linkedin"], t0);
  assert.ok(first);
  assert.equal(fs.readFileSync(path.join(first, "Cookies"), "utf8"), "v1");
  assert.ok(fs.existsSync(path.join(first, "Local State")));
  assert.equal(fs.readFileSync(path.join(first, "Local Storage", "a"), "utf8"), "auth");
  const back = path.join(root, "back");
  assert.equal(P.putStores(back, first), 1);
  assert.equal(fs.readFileSync(path.join(back, "Default", "Local Storage", "a"), "utf8"), "auth");
  assert.equal(P.putStores(back, path.join(root, "empty")), 0);
  assert.equal(P.saveSessions(profile, dir, ["x"], t0 + H), "", "within the gap and nothing new signed in");
  assert.equal(P.saveSessions(profile, dir, [], t0 + 7 * H), "", "nothing signed in: nothing kept");
  fs.writeFileSync(path.join(profile, "Default", "Cookies"), "v2");
  assert.ok(P.saveSessions(profile, dir, ["x", "linkedin", "reddit"], t0 + 2 * H), "a network more signs in within the gap");
  assert.equal(P.sessionFor(dir, "reddit").nets.length, 3);
  for (let i = 1; i <= P.SESSION_KEEP + 2; i += 1) P.saveSessions(profile, dir, ["x"], t0 + (2 + i * 7) * H);
  const copies = P.sessionCopies(dir);
  assert.equal(copies.length, P.SESSION_KEEP + 1, "the newest copies, and the last one with LinkedIn and Reddit");
  assert.deepEqual(P.sessionFor(dir, "linkedin").nets, ["x", "linkedin", "reddit"], "LinkedIn's last signed-in copy survives the pruning");
  assert.deepEqual(P.sessionFor(dir, "x").at, copies[0].at);
  assert.equal(P.sessionFor(dir, "tiktok"), null);
  assert.deepEqual(P.restoreList({ x: false, linkedin: true, tiktok: false, facebook: false }, (k) => k !== "facebook"), ["x", "tiktok"]);
  assert.deepEqual(P.restoreList({ x: true }, () => true), []);
});
