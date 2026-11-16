const test = require("node:test");
const assert = require("node:assert/strict");
const retry = require("../../functions/mail-retry");

const NOW = Date.parse("2026-11-01T12:00:00Z");

function fakeDb(docs) {
  const store = new Map(Object.entries(docs || {}));
  const ref = (id) => ({ id, delete: async () => { store.delete(id); }, set: async (data) => { store.set(id, data); } });
  return {
    store,
    collection: () => ({
      doc: (id) => ref(id),
      get: async () => ({ empty: store.size === 0, docs: Array.from(store.entries()).map(([id, data]) => ({ id, ref: ref(id), data: () => data })) })
    })
  };
}

function fakeMail() {
  const sent = [];
  let n = 0;
  return { sent, send: async (msg) => { sent.push(msg); n += 1; return [{ headers: { "x-message-id": "new" + n } }]; } };
}

test("mail retry: only mail to our own domain is kept, and blocklist refusals are named", async () => {
  assert.equal(retry.toOwnDomain("qa@carlosandmunoz.com"), true);
  assert.equal(retry.toOwnDomain([{ email: "someone@example.com" }]), false);
  assert.equal(retry.blocklistOf("551 5.7.1 Your IP is black listed by SpamCop.org"), "SpamCop");
  assert.equal(retry.blocklistOf("550 5.1.1 user unknown"), "");

  const db = fakeDb();
  const mail = fakeMail();
  await retry.send(mail, db, { to: "qa@carlosandmunoz.com", from: "qa@carlosandmunoz.com", subject: "Ops" }, NOW);
  await retry.send(mail, db, { to: "owner@example.com", from: "qa@carlosandmunoz.com", subject: "Notice" }, NOW);
  assert.deepEqual(Array.from(db.store.keys()), ["new1"]);
  assert.equal(db.store.get("new1").tries, 1);
});

test("mail retry: a blocklist refusal is sent once more, delivered and other refusals are dropped", () => {
  const kept = { sentAt: new Date(NOW - 60000).toISOString(), tries: 1 };
  assert.equal(retry.decide(kept, { status: "not_delivered" }, "551 Your IP is black listed by SpamCop.org", NOW), "resend");
  assert.equal(retry.decide(Object.assign({}, kept, { tries: 2 }), { status: "not_delivered" }, "551 SpamCop", NOW), "drop");
  assert.equal(retry.decide(kept, { status: "not_delivered" }, "550 user unknown", NOW), "drop");
  assert.equal(retry.decide(kept, { status: "delivered" }, "", NOW), "drop");
  assert.equal(retry.decide(kept, null, "", NOW), "wait");
  assert.equal(retry.decide({ sentAt: new Date(NOW - 25 * 3600000).toISOString() }, null, "", NOW), "drop");
});

test("mail retry: the watch resends a refused mail from Email Activity and notes the listed IP", async () => {
  const msg = { to: "qa@carlosandmunoz.com", from: "qa@carlosandmunoz.com", subject: "Ops: 2 jobs failed", text: "x" };
  const db = fakeDb({ abc: { msg, sentAt: new Date(NOW - 600000).toISOString(), tries: 1 }, ok1: { msg, sentAt: new Date(NOW - 600000).toISOString(), tries: 1 } });
  const mail = fakeMail();
  const fetch = async (url) => ({
    ok: true,
    json: async () => (/messages\?/.test(url)
      ? { messages: [{ msg_id: "abc.recvd-1", status: "not_delivered" }, { msg_id: "ok1.recvd-2", status: "delivered" }] }
      : { outbound_ip: "149.72.40.63", events: [{ event_name: "processed" }, { event_name: "bounce", reason: "551 5.7.1 Your IP is black listed by SpamCop.org" }] })
  });
  const note = await retry.retry({ db, sgMail: mail, fetch, key: "k", now: NOW });
  assert.equal(note, "resent 1 refused for a blocklist: qa@carlosandmunoz.com (SpamCop 149.72.40.63)");
  assert.equal(mail.sent.length, 1);
  assert.deepEqual(Array.from(db.store.keys()), ["new1"]);
  assert.equal(db.store.get("new1").tries, 2);
});
