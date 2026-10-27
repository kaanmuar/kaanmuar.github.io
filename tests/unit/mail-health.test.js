const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const health = require("../../functions/mail-health");
const core = require("../../js/admin-jarvis-core.js");
const secrets = require("../../functions/secrets");

const HOOK = "https://us-central1-carlosm-interactive-cv.cloudfunctions.net/mailInbound?key=SECRET&alias=qa&attachments=false";
const entry = (id, to, forward, statuses, extra) => Object.assign({
  id, message_id: "<" + id.split("-")[0] + "@mail>", created_at: "2026-10-27T20:0" + id.length % 10 + ":00Z", transport: "mx",
  recipient: { email: to }, sender: { email: "news@sender.example" }, forward: forward ? { email: forward } : null,
  events: statuses.map((s, i) => ({ status: s, code: s === "refused" || /bounce/.test(s) ? 550 : 250, message: s === "refused" ? "5.7.1 Message considered as SPAM" : s, created_at: "2026-10-27T20:00:0" + i + "Z" }))
}, extra);

test("mail health: a mail is counted once across its Gmail and webhook entries", () => {
  const out = health.tally([
    entry("a-1", "qa@carlosandmunoz.com", "kaanmuar@gmail.com", ["queued", "delivered"]),
    entry("a-2", "QA@carlosandmunoz.com", HOOK, ["queued", "delivered"])
  ], ["qa", "tiktok"]);
  assert.deepEqual(out.totals, { mails: 1, forwarded: 1, bounced: 0, refused: 0, unknown: 0, queued: 0 });
  assert.equal(out.aliases.length, 1);
  assert.equal(out.aliases[0].alias, "qa");
  assert.equal(out.aliases[0].forwarded, 1);
  assert.deepEqual(out.problems, []);
});

test("mail health: a bounce to the webhook is a problem and never shows the webhook key", () => {
  const out = health.tally([
    entry("b-1", "tiktok@carlosandmunoz.com", "kaanmuar@gmail.com", ["queued", "delivered"]),
    entry("b-2", "tiktok@carlosandmunoz.com", HOOK, ["queued", "soft-bounce", "hard-bounce"])
  ], ["tiktok"]);
  assert.equal(out.totals.bounced, 1);
  assert.equal(out.problems.length, 1);
  assert.equal(out.problems[0].outcome, "bounced");
  assert.deepEqual(out.problems[0].to, ["webhook"]);
  assert.doesNotMatch(JSON.stringify(out), /SECRET|key=/);
});

test("mail health: refusals to addresses that are not aliases are only counted", () => {
  const out = health.tally([
    entry("c-1", "info@carlosandmunoz.com", null, ["refused"]),
    entry("d-1", "qa@carlosandmunoz.com", null, ["refused"])
  ], ["qa"]);
  assert.equal(out.totals.unknown, 1);
  assert.equal(out.totals.refused, 1);
  assert.equal(out.problems.length, 1);
  assert.equal(out.problems[0].alias, "qa");
  assert.match(out.problems[0].reason, /SPAM/);
  assert.equal(out.problems[0].code, 550);
});

test("mail health: the canary goes out, comes back once, and is lost or stale when it does not", () => {
  const t0 = Date.parse("2026-10-27T14:10:00Z");
  const sent = health.canarySent(null, "abcdef012345", t0);
  assert.equal(health.canaryState(sent, t0 + 60000).state, "waiting");
  assert.equal(health.canaryState(sent, t0 + health.CANARY_WAIT_MS + 1).state, "lost");
  assert.equal(health.canaryBack(sent, "000000000000", t0 + 5000), null);
  const back = health.canaryBack(sent, "abcdef012345", t0 + 42000);
  assert.deepEqual(back, { receivedAt: "2026-10-27T14:10:42.000Z", seconds: 42 });
  const done = Object.assign({}, sent, back);
  assert.equal(health.canaryBack(done, "abcdef012345", t0 + 50000), null);
  assert.equal(health.canaryState(done, t0 + 3600000).state, "ok");
  assert.equal(health.canaryState(done, t0 + 27 * 3600000).state, "stale");
  assert.equal(health.canaryState(null, t0).state, "never");
  const next = health.canarySent(done, "111111111111", t0 + 86400000);
  assert.deepEqual(next.history, [{ sentAt: done.sentAt, seconds: 42 }]);
  assert.equal(health.canarySent(next, "222222222222", t0 + 2 * 86400000).history[1].seconds, null);
});

test("mail health: the canary subject carries its token and is not read as a sign-in code", () => {
  const mail = health.canaryMail("abcdef012345");
  assert.equal(mail.to, "canary@carlosandmunoz.com");
  assert.equal(health.tokenOf(mail.subject), "abcdef012345");
  assert.equal(health.tokenOf("Your code is 123456"), "");
  const inbound = require("../../functions/mail-inbound");
  assert.equal(inbound.codeOf(inbound.read({ from: { email: "qa@carlosandmunoz.com" }, subject: mail.subject, text: mail.text, to: [{ email: mail.to }] }, "canary")), null);
});

test("mail health: the source reads the account, aliases, mx logs and SMTP counts", async () => {
  const asked = [];
  const fetch = async (url, opts) => {
    asked.push(url);
    assert.equal(opts.headers.Authorization, "Basic " + Buffer.from("api:k").toString("base64"));
    const body = url.endsWith("/account") ? { account: { email_log_retention_days: 180, plan: { name: "Premium - Monthly", monthly_send_limit: 12000, daily_send_limit: 400 } } }
      : /\/aliases/.test(url) ? { aliases: [{ alias: "qa" }, { alias: "canary" }] }
        : /\/logs\/count/.test(url) ? { total: 3 }
          : /cursor=/.test(url) ? { logs: [entry("e-1", "canary@carlosandmunoz.com", HOOK, ["queued", "delivered"])], next_cursor: null }
            : { logs: [entry("f-1", "qa@carlosandmunoz.com", "kaanmuar@gmail.com", ["queued", "delivered"])], next_cursor: "page2" };
    return { ok: true, status: 200, json: async () => body };
  };
  const db = { collection: () => ({ doc: () => ({ get: async () => ({ exists: true, data: () => health.canarySent(null, "abcdef012345", Date.parse("2026-10-27T14:10:00Z")) }) }) }) };
  const out = await health.mailbox({ fetch, env: { IMPROVMX_API_KEY: "k" }, db, now: Date.parse("2026-10-27T21:00:00Z"), days: 7 });
  assert.equal(out.ok, true);
  assert.deepEqual(out.smtp, { month: 3, monthLimit: 12000, today: 3, dayLimit: 400 });
  assert.equal(out.totals.mails, 2);
  assert.equal(out.aliasCount, 2);
  assert.equal(out.canary.state, "lost");
  assert.equal(out.partial, false);
  assert.ok(asked.some((u) => /transport=mx/.test(u) && /after=2026-10-20T21%3A00%3A00Z/.test(u)));
  assert.ok(asked.some((u) => /logs\/count\?transport=smtp&after=2026-10-01T00%3A00%3A00Z/.test(u)));
  assert.deepEqual(await health.mailbox({ fetch, env: {}, now: 0, days: 1 }), { ok: false, error: "IMPROVMX_API_KEY is not mounted on this function.", needs: [] });
});

test("mail health: the briefing alerts on a bounce or refusal to an alias and on a lost canary", () => {
  const box = {
    ok: true, smtp: { month: 9700, monthLimit: 12000 }, canary: { state: "lost", sentAt: "2026-10-27T14:10:00.000Z" },
    problems: [{ id: "x1", alias: "qa", outcome: "refused", reason: "5.7.1 Message considered as SPAM" }, { id: "x0", alias: "qa", outcome: "bounced", reason: "old" }]
  };
  const rows = core.briefing({ external: { mailbox: box } });
  const qa = rows.find((r) => r.key === "mailbox:qa:x1");
  assert.equal(qa.level, "alert");
  assert.match(qa.text, /2 mails to qa@ were bounced or refused by ImprovMX in range: 5\.7\.1/);
  assert.equal(rows.find((r) => r.key === "mailbox:canary:2026-10-27T14:10:00.000Z").level, "alert");
  assert.equal(rows.find((r) => r.key === "mailbox:smtp").level, "warn");
  assert.deepEqual(core.briefing({ external: { mailbox: { ok: true, problems: [], canary: { state: "ok" }, smtp: { month: 2, monthLimit: 12000 } } } }).filter((r) => /^mailbox/.test(r.key)), []);
  assert.ok(core.connections({ mailbox: box }).some((c) => c.key === "mailbox" && c.state === "live"));
});

test("mail health: the functions, the watch and the app are wired to the mailbox source", () => {
  const index = fs.readFileSync(path.join(__dirname, "../../functions/index.js"), "utf8");
  const hook = index.slice(index.indexOf("exports.mailInbound"));
  assert.ok(hook.indexOf("mailHealth.CANARY") < hook.indexOf("mailInbound.codeOf(mail)"));
  assert.match(index, /exports\.mailCanary = scheduled\(/);
  assert.match(index, /jarvisExternal\(\["health", "jobs", "uptime", "money", "safety", "platform", "mailbox"\], 1\)/);
  assert.equal(require("../../functions/ops-schedule.js").cron("mailCanary"), "10 9 * * *");
  assert.ok(secrets.jarvis.includes("IMPROVMX_API_KEY") && secrets.jarvisWatch.includes("IMPROVMX_API_KEY"));
  assert.deepEqual(secrets.mailCanary, ["SENDGRID_API_KEY"]);
  assert.equal(require("../../functions/jarvis-sources.js").SOURCES.mailbox, health.mailbox);
  const app = fs.readFileSync(path.join(__dirname, "../../android/app/src/main/java/com/carlosandmunoz/jarvis/ui/Screens.kt"), "utf8");
  assert.match(app, /MailHealth\(snap\.ext\("mailbox"\)\)/);
});
