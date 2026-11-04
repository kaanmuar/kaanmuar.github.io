const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const digest = require("../../functions/jarvis-digest");
const jarvis = require("../../functions/jarvis");
const ops = require("../../functions/ops-schedule");

const at = (hhmm) => "2026-10-27T" + hhmm + ":00.000Z";

test("an empty day sends no digest", () => {
  assert.equal(digest.digestMail({ pushes: [], actions: [], waiting: {}, marked: new Set() }), null);
  assert.equal(digest.digestMail({ pushes: [{ kind: "test", title: "Test", at: at("15:00") }], actions: [{ status: "skipped" }] }), null);
});

test("the digest groups pushes by kind, lists what waits and what ran", () => {
  const mail = digest.digestMail({
    pushes: [
      { kind: "inbox", title: "New CV message", body: "Ana: hello", at: at("14:05") },
      { kind: "desk", title: "Re-runs held", body: "2 held", at: at("15:00") },
      { kind: "inbox", title: "New CV feedback", body: "5/5", at: at("13:00") },
      { kind: "briefing", title: "Briefing", ref: "proposal:speed", at: at("12:40") },
      { kind: "briefing", title: "Old one", ref: "proposal:done-one", at: at("12:41") }
    ],
    actions: [
      { action: "rerun-held", mode: "auto", status: "done", target: "a.com", at: at("16:05") },
      { action: "notify-act", mode: "click", status: "done", target: "message:1", by: "browser push", at: at("16:10") }
    ],
    waiting: { reruns: [{ host: "a.com" }, { host: "b.com" }], ownerReplies: [{ domain: "x.com" }], notices: [] },
    marked: new Set(["done-one"])
  });
  assert.equal(mail.subject, "Jarvis digest: 5 pushes, 4 waiting");
  assert.deepEqual(mail.rows.map((r) => r.label), ["Pushed", "Waiting", "Ran"]);
  assert.equal(mail.rows[0].value, "Briefing 2 · Inbox 2 · Review desk 1");
  assert.equal(mail.rows[1].value, "2 held re-runs · 1 owner reply · 1 proposal");
  assert.equal(mail.rows[2].value, "1 action by Jarvis, 1 by you");
  assert.match(mail.body, /Inbox \(2\)\n- 08:00 New CV feedback — 5\/5\n- 09:05 New CV message — Ana: hello/);
  assert.match(mail.body, /- 2 held re-runs: a\.com, b\.com/);
  assert.match(mail.body, /- 1 proposal: Briefing/);
  assert.match(mail.body, /- 11:10 notify-act message:1, done \(browser push\)/);
});

test("waiting items alone still send, and long lists are cut", () => {
  const notices = Array.from({ length: 12 }, (_, i) => ({ domain: "n" + i + ".com" }));
  const mail = digest.digestMail({ pushes: [], actions: [], waiting: { notices } });
  assert.match(mail.body, /12 owner notices to send: n0\.com, .*n9\.com, \+2 more/);
});

test("moved emails are off by default, and old saved settings lose daily and watch until saved again", () => {
  const fresh = jarvis.normalizeSettings({});
  jarvis.MOVED_MAIL.forEach((key) => assert.equal(fresh.mail[key], false, key));
  assert.equal(fresh.mail.digest, true);
  assert.equal(fresh.mail.weekly, true);
  const old = jarvis.normalizeSettings({ mail: { daily: true, watch: true, weekly: false } });
  assert.deepEqual([old.mail.daily, old.mail.watch, old.mail.weekly], [false, false, false]);
  const saved = jarvis.normalizeSettings({ mailVersion: 2, mail: { daily: true, watch: true, messages: true } });
  assert.deepEqual([saved.mail.daily, saved.mail.watch, saved.mail.messages], [true, true, true]);
});

test("a save from the settings form keeps daily and watch as ticked", async () => {
  let written = null;
  const db = { collection: () => ({ doc: () => ({ set: async (value) => { written = value; } }) }) };
  const out = await jarvis.saveSettings(db, { mail: { daily: true, watch: true, digest: false } }, "kaanmuar@gmail.com");
  assert.deepEqual([out.mail.daily, out.mail.watch, out.mail.digest], [true, true, false]);
  assert.equal(jarvis.normalizeSettings(written).mail.daily, true);
});

test("the digest job is on the ops schedule at 20:00 Bogotá and in the functions", () => {
  assert.equal(ops.cron("jarvisEveningDigest"), "0 20 * * *");
  const index = fs.readFileSync(path.join(__dirname, "../../functions/index.js"), "utf8");
  assert.match(index, /exports\.jarvisEveningDigest = scheduled\(/);
  assert.match(index, /op === "digest-now"/);
});

test("each moved email checks its switch, and payment problems stay instant", () => {
  const index = fs.readFileSync(path.join(__dirname, "../../functions/index.js"), "utf8");
  jarvis.MOVED_MAIL.forEach((key) => assert.match(index, new RegExp('mailOn\\("' + key + '"\\)'), key));
  assert.match(index, /INSTANT_REVIEW_MAIL = new Set\(\["payment-refunded", "payment-disputed", "payment-unmatched"\]\)/);
  const web = fs.readFileSync(path.join(__dirname, "../../js/admin-jarvis.js"), "utf8");
  jarvis.MOVED_MAIL.forEach((key) => assert.match(web, new RegExp("\\b" + key + ": \""), key));
  const app = fs.readFileSync(path.join(__dirname, "../../android/app/src/main/java/com/carlosandmunoz/jarvis/ui/Main.kt"), "utf8");
  jarvis.MOVED_MAIL.concat(["digest"]).forEach((key) => assert.match(app, new RegExp('"' + key + '" to "'), key));
});
