const test = require("node:test");
const assert = require("node:assert/strict");

const webPush = require("../../functions/jarvis-webpush.js");
const push = require("../../functions/jarvis-push.js");

const NOW = Date.parse("2026-10-26T22:00:00Z");
const SUB = { endpoint: "https://fcm.googleapis.com/fcm/send/abc123def456", keys: { p256dh: "BPkey", auth: "authkey" } };

// One Firestore stand-in for jarvis_devices and jarvis_private, with transactions.
function memDb() {
  const cols = {};
  const col = (name) => {
    const docs = (cols[name] = cols[name] || {});
    return {
      doc: (id) => ({
        _col: name, _id: id,
        get: async () => ({ exists: id in docs, data: () => docs[id] }),
        set: async (row, o) => { docs[id] = Object.assign(o && o.merge ? docs[id] || {} : {}, row); },
        delete: async () => { delete docs[id]; }
      }),
      get: async () => ({ docs: Object.keys(docs).map((id) => ({ id, data: () => docs[id] })) })
    };
  };
  return {
    cols,
    collection: col,
    runTransaction: async (fn) => fn({ get: (ref) => ref.get(), set: (ref, row) => ref.set(row) })
  };
}

const fakeWebpush = (fail) => {
  const sent = [];
  let made = 0;
  return {
    sent,
    generateVAPIDKeys: () => { made += 1; return { publicKey: "PUB" + made, privateKey: "PRIV" + made }; },
    sendNotification: async (sub, body, options) => {
      if (fail && fail[sub.endpoint]) { const e = new Error("gone"); e.statusCode = fail[sub.endpoint]; throw e; }
      sent.push({ sub, body: JSON.parse(body), options });
    }
  };
};

test("keys are made once and kept", async () => {
  const db = memDb();
  const wp = fakeWebpush();
  const a = await webPush.keys(db, wp);
  const b = await webPush.keys(db, wp);
  assert.equal(a.publicKey, "PUB1");
  assert.equal(b.publicKey, "PUB1");
  assert.equal(a.signKey.length, 64);
});

test("a signature works for its own ref and act only, until it expires", () => {
  const exp = NOW + 1000;
  const sig = webPush.sign("k", "notice:shop.co", "send", exp);
  assert.ok(webPush.verify("k", { ref: "notice:shop.co", act: "send", exp, sig }, NOW));
  assert.ok(!webPush.verify("k", { ref: "notice:shop.co", act: "skip", exp, sig }, NOW));
  assert.ok(!webPush.verify("k", { ref: "notice:evil.co", act: "send", exp, sig }, NOW));
  assert.ok(!webPush.verify("other", { ref: "notice:shop.co", act: "send", exp, sig }, NOW));
  assert.ok(!webPush.verify("k", { ref: "notice:shop.co", act: "send", exp, sig }, exp + 1));
  assert.ok(!webPush.verify("k", { ref: "notice:shop.co", act: "send", exp: String(exp + 5), sig }, NOW));
  assert.ok(!webPush.verify("k", { ref: "notice:shop.co", act: "send", exp }, NOW));
});

test("the payload keeps two buttons, signs the plain ones and leaves Reply unsigned", () => {
  const msg = { kind: "inbox", title: "t", body: "b", ref: "owner-reply:f00d", actions: [{ act: "resend", label: "Send" }, { act: "stop", label: "Stop" }, { act: "done", label: "Done" }] };
  const p = JSON.parse(webPush.payload(msg, "k", NOW));
  assert.equal(p.actions.length, 2);
  assert.ok(webPush.verify("k", Object.assign({ ref: p.ref }, p.actions[0]), NOW));
  const reply = JSON.parse(webPush.payload({ kind: "inbox", title: "t", body: "b", ref: "message:a", actions: [{ act: "reply", label: "Reply", input: "Your reply" }] }, "k", NOW));
  assert.deepEqual(reply.actions, [{ act: "reply", label: "Reply", input: "Your reply" }]);
  assert.deepEqual(JSON.parse(webPush.payload({ kind: "desk", title: "t", body: "b", actions: [{ act: "x", label: "X" }] }, "k", NOW)).actions, []);
});

test("subscriptions are checked before they are stored", () => {
  assert.deepEqual(webPush.cleanSubscription(Object.assign({ expirationTime: null }, SUB)), SUB);
  assert.equal(webPush.cleanSubscription({ endpoint: "http://x.co/abcdefghijk", keys: SUB.keys }), null);
  assert.equal(webPush.cleanSubscription({ endpoint: SUB.endpoint, keys: {} }), null);
});

test("browsers register beside phones; phone-only kinds and tests skip them", async () => {
  const db = memDb();
  await push.register(db, { token: "t".repeat(40), name: "Pixel" }, "owner", NOW);
  await push.register(db, { subscription: SUB, name: "Chrome on Mac", kinds: { social: false } }, "owner", NOW);
  assert.deepEqual(await push.targets(db, "alerts"), ["t".repeat(40)]);
  assert.equal((await push.webTargets(db, "alerts")).length, 1);
  assert.equal((await push.webTargets(db, "social")).length, 0);
  assert.equal((await push.webTargets(db, "update")).length, 0);
  await assert.rejects(push.register(db, { subscription: { endpoint: "nope" } }, "owner", NOW), /not a browser subscription/);
  await push.unregister(db, SUB.endpoint);
  assert.equal((await push.webTargets(db, "alerts")).length, 0);
  assert.equal(await push.anyTargets(db, "alerts"), true);
});

test("anyTargets counts a browser when no phone is registered", async () => {
  const db = memDb();
  assert.equal(await push.anyTargets(db, "outreach"), false);
  await push.register(db, { subscription: SUB }, "owner", NOW);
  assert.equal(await push.anyTargets(db, "outreach"), true);
  assert.equal(await push.anyTargets(db, "update"), false);
});

test("sendWeb delivers the payload and drops subscriptions the push service says are gone", async () => {
  const db = memDb();
  await push.register(db, { subscription: SUB }, "owner", NOW);
  const gone = Object.assign({}, SUB, { endpoint: "https://fcm.googleapis.com/fcm/send/gone999999" });
  await push.register(db, { subscription: gone }, "owner", NOW);
  const wp = fakeWebpush({ [gone.endpoint]: 410 });
  const devices = await push.webTargets(db, "alerts");
  const out = await webPush.sendWeb(wp, db, devices, { kind: "alerts", title: "Down", body: "carlosandmunoz.com", quiet: false }, NOW);
  assert.deepEqual(out, { sent: 1, failed: 1, removed: 1 });
  assert.equal(wp.sent[0].body.title, "Down");
  assert.equal(wp.sent[0].options.urgency, "high");
  assert.equal((await push.webTargets(db, "alerts")).length, 1);
});
