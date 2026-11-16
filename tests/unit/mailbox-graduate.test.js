const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const grad = require("../../functions/mailbox-graduate");
const ops = require("../../functions/ops-schedule");
const secrets = require("../../functions/secrets");

const [A, B, C, D] = grad.MAILBOXES;
const account = (email, extra) => Object.assign({ email, status: 1, warmup_status: 1 }, extra);
const healthy = { health_score: 100, sent: 300 };
const DUE = Date.parse(grad.DUE + "T09:00:00-05:00");

function fakeInstantly({ accounts, analytics, campaigns }) {
  const calls = [];
  const fetch = async (url, opts) => {
    const p = url.replace("https://api.instantly.ai/api/v2/", "");
    const body = opts.body ? JSON.parse(opts.body) : null;
    calls.push({ method: opts.method, path: p, body });
    let out = {};
    if (p.startsWith("accounts?")) out = { items: accounts };
    else if (p === "accounts/warmup-analytics") out = { aggregate_data: analytics };
    else if (p.startsWith("campaigns?")) out = { items: campaigns };
    return { ok: true, status: 200, text: async () => JSON.stringify(out) };
  };
  return { fetch, calls };
}

test("assess: only connected, warming, healthy mailboxes with enough warm-up are ready", () => {
  const { ready, held } = grad.assess(
    [account(A), account(B, { warmup_status: 0 }), account(C)],
    { [A]: healthy, [B]: healthy, [C]: { health_score: 82, sent: 300 } },
    []);
  assert.deepEqual(ready.map((r) => r.email), [A]);
  assert.deepEqual(held.map((h) => [h.email, h.why]), [
    [B, "warm-up is off"],
    [C, "warm-up health 82%, under 90%"],
    [D, "not connected to Instantly"]
  ]);
  assert.match(grad.assess([account(A)], { [A]: { health_score: 100, sent: 10 } }, [B, C, D]).held[0].why, /10 warm-up mails sent/);
  assert.equal(grad.assess([account(A)], { [A]: healthy }, [A, B, C, D]).ready.length, 0, "mailboxes already in are skipped");
});

test("plan: ready mailboxes join every open campaign once; finished ones are left alone", () => {
  const changes = grad.plan([
    { id: "1", name: "active", status: 1, email_list: ["carlos@qalabreview.com"] },
    { id: "2", name: "paused", status: 2, email_list: ["hello@qalabreview.com", A] },
    { id: "3", name: "done", status: 3, email_list: [] },
    { id: "4", name: "draft", status: 0, email_list: [A, B] }
  ], [A, B]);
  assert.deepEqual(changes.map((c) => [c.id, c.email_list]), [
    ["1", ["carlos@qalabreview.com", A, B]],
    ["2", ["hello@qalabreview.com", A, B]]
  ]);
});

test("run: waits until the due date and calls nothing", async () => {
  const api = fakeInstantly({});
  const out = await grad.run({ fetch: api.fetch, key: "k", now: DUE - 24 * 3600 * 1000, state: {}, notify: async () => assert.fail("no notice") });
  assert.equal(out.note, "waiting until " + grad.DUE);
  assert.equal(api.calls.length, 0);
});

test("run: on the due date the healthy mailboxes get the daily limit and join the campaigns, and Carlos is told", async () => {
  const api = fakeInstantly({
    accounts: [account(A), account(B), account(C), account(D)],
    analytics: { [A]: healthy, [B]: healthy, [C]: healthy, [D]: { health_score: 70, sent: 300 } },
    campaigns: [{ id: "c1", name: "W1", status: 1, email_list: ["carlos@qalabreview.com"] }]
  });
  const notices = [];
  const out = await grad.run({ fetch: api.fetch, key: "k", now: DUE, state: {}, notify: async (r) => notices.push(r) });
  assert.deepEqual(out.state.done, [A, B, C]);
  assert.equal(out.state.finished, undefined, "D is still held");
  const limits = api.calls.filter((c) => c.method === "PATCH" && c.path.startsWith("accounts/"));
  assert.deepEqual(limits.map((c) => [decodeURIComponent(c.path.slice(9)), c.body.daily_limit]), [[A, 20], [B, 20], [C, 20]]);
  const camp = api.calls.find((c) => c.method === "PATCH" && c.path === "campaigns/c1");
  assert.deepEqual(camp.body.email_list, ["carlos@qalabreview.com", A, B, C]);
  assert.equal(notices.length, 1);
  assert.equal(notices[0].push.title, "3 warmed-up mailboxes joined the campaigns");
  assert.match(notices[0].comment, /Held: munoz@tryqalabreview\.com: warm-up health 70%/);
  assert.equal(notices[0].mail.respondUrl, "https://github.com/kaanmuar/kaanmuar.github.io/issues/2379");
});

test("run: the last mailbox finishes the job, a quiet day sends nothing, and it gives up after 14 days", async () => {
  const healthyAll = { accounts: grad.MAILBOXES.map((e) => account(e)), analytics: { [D]: healthy }, campaigns: [{ id: "c1", status: 1, email_list: [A] }] };
  let notices = 0;
  const notify = async () => { notices++; };
  const last = await grad.run(Object.assign(fakeInstantly(healthyAll), { key: "k", now: DUE + 86400000, state: { done: [A, B, C] }, notify }));
  assert.ok(last.state.finished);
  assert.equal(notices, 1);

  const stopped = fakeInstantly(healthyAll);
  assert.match((await grad.run({ fetch: stopped.fetch, key: "k", now: DUE + 2 * 86400000, state: last.state, notify })).note, /^finished /);
  assert.equal(stopped.calls.length, 0);

  const sick = { accounts: grad.MAILBOXES.map((e) => account(e)), analytics: { [D]: { health_score: 60, sent: 300 } }, campaigns: [] };
  const quiet = await grad.run(Object.assign(fakeInstantly(sick), { key: "k", now: DUE + 3 * 86400000, state: { done: [A, B, C] }, notify }));
  assert.equal(notices, 1, "nothing joined, nothing said");
  assert.equal(quiet.state.finished, undefined);

  const reports = [];
  const gaveUp = await grad.run(Object.assign(fakeInstantly(sick), { key: "k", now: DUE + 14 * 86400000, state: { done: [A, B, C] }, notify: async (r) => reports.push(r) }));
  assert.ok(gaveUp.state.finished);
  assert.equal(reports[0].push.title, "Warm-up: 1 mailbox still not ready");
  assert.match(reports[0].comment, /Jarvis stops checking now/);
});

test("run: a missing key fails the run so the watchdog sees it", async () => {
  await assert.rejects(grad.run({ fetch: async () => assert.fail(), key: "", now: DUE, state: {}, notify: async () => {} }), /INSTANTLY_API_KEY/);
});

test("wiring: daily job, its secrets and its export", () => {
  assert.equal(ops.cron("mailboxGraduate"), "0 9 * * *");
  assert.ok(secrets.mailboxGraduate.includes("INSTANTLY_API_KEY"));
  assert.ok(secrets.mailboxGraduate.includes("SENDGRID_API_KEY"));
  const index = fs.readFileSync(path.join(__dirname, "../../functions/index.js"), "utf8");
  assert.match(index, /exports\.mailboxGraduate = scheduled\(/);
});
