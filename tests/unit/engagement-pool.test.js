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
