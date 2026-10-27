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
  const o = mailPush.opsMessage([{ job: "sweepReviews", why: "no successful run" }, { job: "buffer-sync", why: "last success 2026-10-20" }], ["sweepReviews", "buffer-sync"]);
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

test("buttons: each push lists at most three, and only what its ref accepts", () => {
  const m = mailPush.messageMessage("abc", { name: "Ana", email: "ana@x.co", message: "hi" }, "");
  assert.deepEqual(m.actions, [{ act: "reply", label: "Reply", input: "Your reply" }]);
  assert.deepEqual(mailPush.messageMessage("abc", { message: "no address" }, "").actions, []);

  const waiting = { status: "waiting", propose: "resend:owner@shop.co", host: "shop.co" };
  assert.deepEqual(mailPush.ownerReplyMessage("f00d", waiting, "s", "https://d").actions.map((a) => a.act), ["resend", "stop", "done"]);
  assert.equal(mailPush.ownerReplyMessage("f00d", waiting, "s", "https://d").actions[0].label, "Send to owner@shop.co");
  assert.deepEqual(mailPush.ownerReplyMessage("f00d", { status: "waiting", propose: "answer" }, "s", "").actions.map((a) => a.act), ["stop", "unlist", "done"]);
  assert.deepEqual(mailPush.ownerReplyMessage("f00d", { status: "applied" }, "s", "").actions, []);

  assert.deepEqual(mailPush.rerunMessage([{ status: "failed", host: "c.co" }], "").actions, []);
  assert.deepEqual(mailPush.rerunMessage([{ status: "held", host: "c.co" }], "").actions.map((a) => a.act), ["send-all", "drop-all"]);

  const ops = mailPush.opsMessage([{ job: "sweepReviews", why: "x" }, { job: "live-reports.yml", why: "y" }], ["sweepReviews"]);
  assert.equal(ops.ref, "ops:sweepReviews");
  assert.equal(ops.actions[0].label, "Rerun job");
  assert.deepEqual(mailPush.opsMessage([{ job: "live-reports.yml", why: "y" }], ["sweepReviews"]).actions, []);

  for (const msg of [m, ops, mailPush.ownerReplyMessage("f", waiting, "s", "")]) {
    const { type } = mailPush.parseAct(msg.ref, msg.actions[0].act);
    assert.ok(mailPush.ACTS[type].includes(msg.actions[0].act));
  }
});

test("parseAct refuses unknown refs, acts and missing ids", () => {
  assert.deepEqual(mailPush.parseAct("notice:shop.co", "send"), { type: "notice", id: "shop.co", act: "send" });
  assert.deepEqual(mailPush.parseAct("rerun-held", "drop-all"), { type: "rerun-held", id: "", act: "drop-all" });
  assert.deepEqual(mailPush.parseAct("proposal:review:conv:low", "done"), { type: "proposal", id: "review:conv:low", act: "done" });
  assert.throws(() => mailPush.parseAct("message:abc", "delete"), /no longer works/);
  assert.throws(() => mailPush.parseAct("run:abc", "reply"), /no longer works/);
  assert.throws(() => mailPush.parseAct("message:", "reply"), /no longer works/);
});

test("outreach notices push one by one; social posts push once each, and a first run only remembers", () => {
  const n = mailPush.noticeMessage({ domain: "shop.co", host: "www.shop.co", email: "info@shop.co", critical: true });
  assert.equal(n.ref, "notice:shop.co");
  assert.equal(n.body, "To info@shop.co. Critical security finding.");
  assert.deepEqual(n.actions.map((a) => a.act), ["send", "skip"]);
  assert.deepEqual(mailPush.noticeMessage({ domain: "x.co" }).actions.map((a) => a.act), ["skip"]);
  assert.equal(mailPush.noticeMessage({}), null);

  const s = mailPush.socialMessage({ id: "14d11eaabbc6", title: "Accessibility testing", source: "DEV", topic: "Testing", summary: "Playwright and axe." });
  assert.equal(s.kind, "social");
  assert.equal(s.ref, "social:14d11eaabbc6");
  assert.deepEqual(s.actions.map((a) => a.act), ["approved", "dismissed"]);

  const pending = [{ id: "a" }, { id: "b" }, { id: "c" }, { id: "d" }, { id: "e" }];
  assert.deepEqual(mailPush.socialDue(pending, null, 3), []);
  assert.deepEqual(mailPush.socialDue(pending, ["a"], 3).map((p) => p.id), ["b", "c", "d"]);
});

test("the briefing push carries Done and Dismiss for the top proposal", () => {
  const items = [{ level: "warn", text: "Conversion is low" }];
  const b = jarvisPush.briefingMessage({ items, aiText: "", dateLabel: "Mon", top: { key: "review:conversion", title: "Fix the checkout copy" } });
  assert.equal(b.ref, "proposal:review:conversion");
  assert.equal(b.lines[0], "Do next: Fix the checkout copy");
  assert.deepEqual(b.actions.map((a) => a.act), ["done", "dismissed"]);
  assert.deepEqual(jarvisPush.briefingMessage({ items, aiText: "", dateLabel: "Mon" }).actions, []);
});

test("send carries the buttons as JSON, three at most", async () => {
  const sent = [];
  const messaging = { sendEachForMulticast: async (m) => { sent.push(m); return { successCount: 1, failureCount: 0, responses: [{ success: true }] }; } };
  const four = [1, 2, 3, 4].map((i) => ({ act: "a" + i, label: "L" + i }));
  await jarvisPush.send(messaging, null, ["tok"], { kind: "inbox", title: "t", body: "b", actions: four });
  assert.equal(JSON.parse(sent[0].data.actions).length, 3);
  await jarvisPush.send(messaging, null, ["tok"], { kind: "inbox", title: "t", body: "b", actions: [] });
  assert.equal(sent[1].data.actions, undefined);
});
