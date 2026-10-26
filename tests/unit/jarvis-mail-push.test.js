const test = require("node:test");
const assert = require("node:assert/strict");

const mailPush = require("../../functions/jarvis-mail-push.js");
const jarvisPush = require("../../functions/jarvis-push.js");
const reviewDesk = require("../../functions/url-review-desk.js");

test("CV messages and ratings push to the inbox with the document as ref", () => {
  const m = mailPush.messageMessage("abc", { name: "Ana", email: "ana@x.co", message: "Hola  there\nfriend", fileURL: "https://f" }, "Job offer");
  assert.equal(m.kind, "inbox");
  assert.equal(m.title, "CV message · Ana · Job offer");
  assert.equal(m.body, "Hola there friend");
  assert.deepEqual(m.lines, ["ana@x.co", "Has an attachment"]);
  assert.equal(m.ref, "message:abc");
  assert.equal(m.tab, "products:inbox");

  const r = mailPush.ratingMessage("r1", { name: "", rating: 9, comment: "" });
  assert.equal(r.title, "CV feedback · 5/5 · Someone");
  assert.equal(r.body, "(no comment)");
  assert.equal(r.ref, "rating:r1");
});

test("owner replies push to the inbox and open the decide page", () => {
  const m = mailPush.ownerReplyMessage("f00d", { host: "shop.co", from: "boss@shop.co", words: "Please send it to me" }, "Asks to resend to another address", "https://fn/ownerReplies/decide?t=f00d");
  assert.equal(m.title, "Owner reply · shop.co");
  assert.equal(m.url, "https://fn/ownerReplies/decide?t=f00d");
  assert.equal(m.ref, "owner-reply:f00d");
  assert.equal(mailPush.ownerReplyMessage("x", {}, "s", "javascript:alert(1)").url, "");
});

test("re-runs push only when something ran, led by what is held", () => {
  assert.equal(mailPush.rerunMessage([], "https://d"), null);
  const m = mailPush.rerunMessage([{ status: "held", host: "a.co", name: "Ana" }, { status: "held", host: "b.co" }, { status: "failed", host: "c.co" }], "https://fn/reviewUrl/desk");
  assert.equal(m.kind, "desk");
  assert.equal(m.title, "2 re-runs held for you");
  assert.equal(m.body, "2 held: send or drop each, 1 failed again.");
  assert.equal(m.lines[0], "held · a.co for Ana");
  assert.equal(m.ref, "rerun-held");
});

test("comparisons push to the desk with their link and rows", () => {
  assert.equal(mailPush.comparisonMessage(null), null);
  const m = mailPush.comparisonMessage({ subject: "Comparison: a.co vs b.co", intro: "Ana compared a.co with b.co.", rows: [{ heading: "a.co" }, { label: "Score", value: "80 vs 70" }], respondUrl: "https://x/versus" });
  assert.deepEqual(m.lines, ["Score: 80 vs 70"]);
  assert.equal(m.url, "https://x/versus");
});

test("a customer run updates one quiet notification; problems push loud and on their own", () => {
  const source = { runId: "run1", name: "Ana", email: "ana@x.co", requestedUrl: "https://www.shop.co/", status: "running" };
  const started = mailPush.runMessage(source, reviewDesk.alertFrom("started", source));
  assert.equal(started.quiet, true);
  assert.equal(started.tag, "jarvis-review-run1");
  assert.match(started.title, /^Review running/);
  assert.equal(started.ref, "");

  const failed = mailPush.runMessage(source, reviewDesk.alertFrom("failed", source));
  assert.equal(failed.quiet, false);
  assert.equal(failed.tag, "jarvis-desk-failed-run1");
  assert.equal(failed.ref, "run:run1");
});

test("sweep and test runs push only their problems", () => {
  const sweep = { runId: "s1", source: "sweep", status: "running" };
  assert.equal(mailPush.runMessage(sweep, reviewDesk.alertFrom("started", sweep)), null);
  const test = { runId: "t1", test: true };
  assert.equal(mailPush.runMessage(test, reviewDesk.alertFrom("checkout", test)), null);
  const disputed = mailPush.runMessage(test, reviewDesk.alertFrom("payment-disputed", test));
  assert.match(disputed.title, /^Test · A buyer opened/);
});

test("backup and ops failures go to alerts, ops only when a job failed", () => {
  const b = mailPush.backupMessage("2026-10-25", "permission denied");
  assert.equal(b.kind, "alerts");
  assert.equal(b.body, "2026-10-25: permission denied");
  assert.equal(mailPush.opsMessage([]), null);
  const o = mailPush.opsMessage([{ job: "sweepReviews", why: "no successful run" }, { job: "buffer-sync", why: "last success 2026-10-20" }]);
  assert.equal(o.title, "2 scheduled jobs missed or failed");
  assert.equal(o.ref, "ops:sweepReviews,buffer-sync");
});

test("send passes ref and quiet, and a quiet push goes at normal priority", async () => {
  const sent = [];
  const messaging = { sendEachForMulticast: async (m) => { sent.push(m); return { successCount: 1, failureCount: 0, responses: [{ success: true }] }; } };
  await jarvisPush.send(messaging, null, ["tok"], { kind: "desk", title: "t", body: "b", quiet: true, ref: "run:1" });
  assert.equal(sent[0].data.quiet, "1");
  assert.equal(sent[0].data.ref, "run:1");
  assert.equal(sent[0].android.priority, "normal");
  await jarvisPush.send(messaging, null, ["tok"], { kind: "inbox", title: "t", body: "b" });
  assert.equal(sent[1].data.quiet, undefined);
  assert.equal(sent[1].android.priority, "high");
});

test("inbox and desk are kinds a device can turn off", () => {
  assert.deepEqual(jarvisPush.cleanKinds({ inbox: false }).inbox, false);
  assert.equal(jarvisPush.cleanKinds({}).desk, true);
});
