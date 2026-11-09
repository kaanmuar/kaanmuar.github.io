const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const live = require("../../functions/jarvis-live");
const sections = require("../../functions/jarvis-sections");
const push = require("../../functions/jarvis-push");
const secrets = require("../../functions/secrets");
const core = require("../../js/admin-jarvis-core.js");

const T0 = Date.parse("2026-11-09T05:00:00Z");
const ENDPOINT = "https://fcm.googleapis.com/fcm/send/abc123def456";

// Firestore stand-in: docs by collection and id, a counter of transaction reads, and collection get for the devices.
function fakeDb(devices) {
  const docs = new Map();
  const key = (c, id) => c + "/" + id;
  const stats = { reads: 0, writes: 0 };
  (devices || []).forEach((d) => docs.set(key("jarvis_devices", d.id), Object.assign({}, d)));
  const ref = (c, id) => ({
    c, id,
    get: async () => { stats.reads += 1; const d = docs.get(key(c, id)); return { exists: !!d, data: () => d && Object.assign({}, d) }; },
    set: async (row) => { stats.writes += 1; docs.set(key(c, id), Object.assign({}, row)); },
    update: async (patch) => { if (!docs.has(key(c, id))) throw new Error("5 NOT_FOUND"); docs.set(key(c, id), Object.assign({}, docs.get(key(c, id)), patch)); },
    delete: async () => { docs.delete(key(c, id)); }
  });
  return {
    stats,
    doc: (c, id) => docs.get(key(c, id)),
    collection: (c) => ({
      doc: (id) => ref(c, id),
      get: async () => ({ docs: Array.from(docs.entries()).filter(([k]) => k.startsWith(c + "/")).map(([k, d]) => ({ id: k.slice(c.length + 1), data: () => Object.assign({}, d) })) })
    }),
    runTransaction: async (fn) => fn({ get: (r) => r.get(), set: (r, row) => { r.set(row); } })
  };
}

function deps(db, { clock, dead } = {}) {
  const sent = { phones: [], web: [], sleeps: [] };
  const now = clock || { t: T0 };
  return {
    sent,
    clock: now,
    db,
    now: () => now.t,
    sleep: async (ms) => { sent.sleeps.push(ms); now.t += ms; },
    messaging: {
      sendEachForMulticast: async (msg) => {
        sent.phones.push(msg);
        const responses = msg.tokens.map((t) => (dead && dead.includes(t) ? { success: false, error: { code: "messaging/registration-token-not-registered" } } : { success: true }));
        return { responses, successCount: responses.filter((r) => r.success).length, failureCount: responses.filter((r) => !r.success).length };
      }
    },
    webpush: {
      generateVAPIDKeys: () => ({ publicKey: "pub", privateKey: "priv" }),
      sendNotification: async (sub, body, options) => { sent.web.push({ sub, body: JSON.parse(body), options }); }
    }
  };
}

const versions = (over) => Object.assign({}, ...sections.NAMES.map((name) => ({ [name]: { v: name.padEnd(12, "0").slice(0, 12), at: new Date(T0 - 60000).toISOString() } })), over || {});
const phone = { id: push.idOf("token-aaaaaaaaaaaaaaaaaaaa"), token: "token-aaaaaaaaaaaaaaaaaaaa", kinds: {} };
const browser = (liveAt) => ({ id: push.idOf(ENDPOINT), type: "web", subscription: { endpoint: ENDPOINT, keys: { p256dh: "p", auth: "a" } }, kinds: {}, liveAt });

test.beforeEach(() => live.forget());

test("mail and devices are read live on every fetch and are never pushed", () => {
  assert.ok(!live.NAMES.includes("mail") && !live.NAMES.includes("devices"));
  assert.deepEqual(Object.keys(live.pick(versions())).sort(), live.NAMES.slice().sort());
});

test("a section moves when its version changes, unless it was built before the pushed one", () => {
  const pushed = live.pick(versions());
  assert.deepEqual(live.moved(pushed, live.pick(versions())), []);
  assert.deepEqual(live.moved(pushed, live.pick(versions({ goals: { v: "newgoals0000", at: new Date(T0).toISOString() } }))), ["goals"]);
  assert.deepEqual(live.moved(pushed, live.pick(versions({ goals: { v: "oldgoals0000", at: new Date(T0 - 3600000).toISOString() } }))), []);
  assert.deepEqual(live.moved({}, { goals: { v: "x", at: "" } }), ["goals"]);
});

test("the message is data only, string values, every pushed version, well under FCM's 4 KB", () => {
  const all = live.pick(versions());
  const msg = live.message(1, all, ["processes", "goals"], T0);
  assert.equal(msg.kind, "sections");
  assert.equal(msg.days, "1");
  assert.equal(msg.sections, "goals,processes");
  Object.values(msg).forEach((v) => assert.equal(typeof v, "string"));
  assert.deepEqual(Object.keys(JSON.parse(msg.versions)).sort(), live.NAMES.slice().sort());
  assert.ok(Buffer.byteLength(JSON.stringify(msg)) < 1024);
  assert.equal(msg.title, undefined);
});

test("the first check pushes every section at normal priority, and the same versions again cost no read", async () => {
  const db = fakeDb([phone]);
  const d = deps(db);
  const v = versions();
  delete v.processes;
  const out = await live.check(d, 1, v);
  assert.equal(out.pushed, true);
  assert.equal(d.sent.phones.length, 1);
  const msg = d.sent.phones[0];
  assert.deepEqual(msg.tokens, [phone.token]);
  assert.equal(msg.android.priority, "normal");
  assert.equal(msg.android.collapseKey, live.COLLAPSE);
  assert.equal(msg.notification, undefined);
  assert.deepEqual(Object.keys(db.doc("jarvis_cache", "pushed-1").versions).sort(), live.NAMES.filter((n) => n !== "processes").sort());
  const reads = db.stats.reads;
  d.clock.t += 60000;
  assert.deepEqual(await live.check(d, 1, v), { pushed: false, reason: "unchanged" });
  assert.equal(db.stats.reads, reads);
  assert.equal(d.sent.phones.length, 1);
});

test("a rebuild with the same content reads the pushed doc once and pushes nothing", async () => {
  const db = fakeDb([phone]);
  const d = deps(db);
  await live.check(d, 1, versions());
  d.clock.t += 60000;
  const rebuilt = versions({ goals: { v: versions().goals.v, at: new Date(d.clock.t).toISOString() } });
  assert.equal((await live.check(d, 1, rebuilt)).pushed, false);
  assert.equal(d.sent.phones.length, 1);
});

test("processes goes at high priority, and only browsers with Jarvis open get it", async () => {
  const db = fakeDb([phone, browser(new Date(T0 - 60000).toISOString())]);
  const d = deps(db);
  const quiet = versions();
  delete quiet.processes;
  await live.check(d, 1, quiet);
  d.clock.t += 60000;
  const out = await live.check(d, 1, versions({ processes: { v: "running00001", at: new Date(d.clock.t).toISOString() } }));
  assert.deepEqual(out.sections, ["processes"]);
  assert.equal(d.sent.phones[1].android.priority, "high");
  assert.equal(JSON.parse(d.sent.phones[1].data.versions).processes, "running00001");
  assert.equal(d.sent.web.length, 2);
  assert.equal(d.sent.web[1].body.kind, "sections");
  assert.equal(d.sent.web[1].options.urgency, "normal");
  assert.equal(d.sent.web[1].options.topic, live.COLLAPSE);
  assert.equal(d.sent.web[0].options.urgency, "low");
  live.forget();
  const away = fakeDb([phone, browser(new Date(T0 - live.WEB_LIVE_MS - 1000).toISOString())]);
  const d2 = deps(away);
  await live.check(d2, 1, versions());
  assert.equal(d2.sent.web.length, 0);
  assert.equal(d2.sent.phones.length, 1);
});

test("a change within the gap waits it out and goes with the rest of the burst in one push", async () => {
  const db = fakeDb([phone]);
  const d = deps(db);
  await live.check(d, 1, versions());
  d.clock.t += 1000;
  const later = new Date(d.clock.t).toISOString();
  const out = await live.check(d, 1, versions({ processes: { v: "step20000000", at: later }, goals: { v: "goals2000000", at: later } }));
  assert.deepEqual(d.sent.sleeps, [live.GAP_MS - 1000]);
  assert.deepEqual(out.sections.sort(), ["goals", "processes"]);
  assert.equal(d.sent.phones.length, 2);
});

test("a stale content hash that comes back (a process that ends) is pushed again", async () => {
  const db = fakeDb([phone]);
  const d = deps(db);
  await live.check(d, 1, versions());
  d.clock.t += 10000;
  await live.check(d, 1, versions({ processes: { v: "running00001", at: new Date(d.clock.t).toISOString() } }));
  d.clock.t += 10000;
  const out = await live.check(d, 1, versions({ processes: { v: versions().processes.v, at: new Date(d.clock.t).toISOString() } }));
  assert.deepEqual(out.sections, ["processes"]);
  assert.equal(d.sent.phones.length, 3);
});

test("a phone whose token is gone is deleted", async () => {
  const db = fakeDb([phone]);
  const d = deps(db, { dead: [phone.token] });
  const out = await live.check(d, 1, versions());
  assert.equal(out.removed, 1);
  assert.equal(db.doc("jarvis_devices", phone.id), undefined);
});

test("markLive stamps a registered browser and ignores anything that is not an endpoint", async () => {
  const db = fakeDb([browser("")]);
  assert.equal(await live.markLive(db, ENDPOINT, T0), true);
  assert.equal(db.doc("jarvis_devices", push.idOf(ENDPOINT)).liveAt, new Date(T0).toISOString());
  assert.equal(await live.markLive(db, "javascript:alert(1)", T0), false);
  await assert.rejects(live.markLive(db, "https://push.example.com/unknown-subscription", T0));
});

test("the functions that load the snapshot for a live push hold every secret the jarvis function does", () => {
  ["jarvisWatch", "jarvisCountdowns"].forEach((name) => secrets.jarvis.forEach((s) => assert.ok(secrets[name].includes(s), name + " lacks " + s)));
});

test("the jarvis function pushes after the writes that drop a section and on the one-day snapshot read", () => {
  const src = fs.readFileSync(path.join(__dirname, "../../functions/index.js"), "utf8");
  assert.match(src, /if \(days === jarvisLive\.DAYS\) await jarvisLive\.check\(/);
  const ops = src.match(/const JARVIS_LIVE_OPS = new Set\(\[([^\]]*)\]\)/)[1];
  ["settings-save", "proposal-mark", "countdown", "brief-mark", "outreach-target", "send-report"].forEach((op) => assert.ok(ops.includes('"' + op + '"'), op));
  assert.match(src, /jarvisLivePush\("jarvisWatch"\)/);
});

test("the web page fetches on a section push only when it lacks a version or shows another range", () => {
  const held = { goals: { v: "g1" }, processes: { v: "p1" } };
  assert.equal(core.sectionsStale({ days: "1", versions: JSON.stringify({ goals: "g1", processes: "p1" }) }, held, "1"), false);
  assert.equal(core.sectionsStale({ days: "1", versions: JSON.stringify({ goals: "g1", processes: "p2" }) }, held, "1"), true);
  assert.equal(core.sectionsStale({ days: "1", versions: JSON.stringify({ goals: "g1" }) }, held, "30"), true);
  assert.equal(core.sectionsStale({ days: "1", versions: "{" }, held, "1"), true);
  assert.equal(core.sectionsStale({ days: "1", versions: JSON.stringify({ goals: "g1" }) }, null, "1"), true);
});

test("the service worker hands a section push to the open admin tabs and shows no notification", () => {
  const sw = fs.readFileSync(path.join(__dirname, "../../jarvis-sw.js"), "utf8");
  assert.match(sw, /if \(msg\.kind === 'sections'\) \{ event\.waitUntil\(toTabs\(msg\)\); return; \}/);
  assert.doesNotMatch(sw.slice(sw.indexOf("async function toTabs"), sw.indexOf("self.addEventListener('push'")), /showNotification/);
});
