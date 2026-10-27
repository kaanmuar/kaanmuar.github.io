const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const watch = require("../../functions/tiktok-business-watch");
const ops = require("../../functions/ops-schedule");
const secrets = require("../../functions/secrets");

const tiktok = (subject, text, extra) => Object.assign({ id: subject, from: "TikTok for Business <no-reply@business.tiktok.com>", subject, text, date: "2026-10-28T15:00:00.000Z" }, extra);

test("verdict: TikTok's approval and rejection, in English and Spanish", () => {
  assert.equal(watch.verdict(tiktok("Your TikTok Business account has been approved", "Congratulations! You can now use all business features.")), "approved");
  assert.equal(watch.verdict(tiktok("Actualización de tu cuenta de empresa", "Tu solicitud ha sido aprobada.")), "approved");
  assert.equal(watch.verdict(tiktok("Business verification update", "Unfortunately your application was not approved because the documents were unclear.")), "rejected");
  assert.equal(watch.verdict(tiktok("Business verification update", "We were unable to verify your business.")), "rejected");
  assert.equal(watch.verdict(tiktok("Tu solicitud de cuenta de empresa", "Lamentablemente, tu solicitud fue rechazada.")), "rejected");
  assert.equal(watch.verdict(tiktok("Tu solicitud de cuenta de empresa", "Tu solicitud no ha sido aprobada.")), "rejected");
});

test("verdict: a promise to approve or a receipt is not a decision", () => {
  assert.equal(watch.verdict(tiktok("We received your business application", "Your application is under review. Once approved, you can run ads.")), "unclear");
  assert.equal(watch.verdict(tiktok("Recibimos tu solicitud", "Tu solicitud está en revisión y será aprobada en 3 días hábiles si cumple las normas.")), "unclear");
});

test("verdict: other TikTok mail and other senders are ignored", () => {
  assert.equal(watch.verdict(tiktok("Your login code", "Use 123456 to log in.")), "");
  assert.equal(watch.verdict(tiktok("New creative trends this week", "See what's trending on TikTok.")), "");
  assert.equal(watch.verdict(tiktok("Your business account has been approved", "Congratulations!", { from: "Scammer <tiktok-support@gmail.com>" })), "");
  assert.equal(watch.verdict(tiktok("Your business account has been approved", "Congratulations!", { from: "TikTok <x@tiktok.com.evil.io>" })), "");
  assert.equal(watch.isTikTok("TikTok <noreply@account.tiktok.com>"), true);
  assert.equal(watch.isTikTok("Bytedance <a@bytedance.com>"), true);
});

test("sort: the newest decision wins, unclear mails push once, mail before the application is skipped", () => {
  const receipt = tiktok("We received your business application", "It is under review.", { id: "r1", date: "2026-10-27T17:00:00.000Z" });
  const old = tiktok("Your business account has been approved", "Congratulations", { id: "old", date: "2026-10-01T00:00:00.000Z" });
  assert.deepEqual(watch.sort([receipt, old], []), { decided: null, unclear: [Object.assign({}, receipt, { verdict: "unclear" })] });
  assert.equal(watch.sort([receipt], ["r1"]).unclear.length, 0);
  const no = tiktok("Business verification update", "Your application was not approved.", { id: "no", date: "2026-10-28T10:00:00.000Z" });
  const yes = tiktok("Business verification update", "Your application has been approved.", { id: "yes", date: "2026-10-30T10:00:00.000Z" });
  assert.equal(watch.sort([no, yes, receipt], []).decided.id, "yes");
});

test("notify: push, mail and the #1888 comment say passed or not", () => {
  const yes = Object.assign(tiktok("Your business account has been approved", "Congratulations!"), { verdict: "approved" });
  const no = Object.assign(tiktok("Business verification update", "Not approved."), { verdict: "rejected" });
  assert.equal(watch.message(yes).title, "TikTok Business: approved");
  assert.equal(watch.message(yes).kind, "alerts");
  assert.equal(watch.message(no).title, "TikTok Business: not approved");
  assert.match(watch.mail(no).intro, /reapply/);
  assert.match(watch.mail(yes).intro, /Buffer/);
  assert.match(watch.comment(no), /not approved/);
});

test("fetchMails: reads All Mail and Spam for TikTok mail since the application", async () => {
  const searched = [];
  class FakeImap {
    constructor(opts) { assert.equal(opts.host, "imap.gmail.com"); assert.equal(opts.auth.pass, "app-pass"); }
    async connect() {}
    async list() { return [{ path: "INBOX" }, { path: "[Gmail]/Todos", specialUse: "\\All" }, { path: "[Gmail]/Spam", specialUse: "\\Junk" }]; }
    async getMailboxLock(p) { this.box = p; return { release() {} }; }
    async search(query) { searched.push([this.box, query]); return this.box === "[Gmail]/Spam" ? [] : [7]; }
    async *fetch(uids) { for (const uid of uids) yield { uid, source: "raw" }; }
    async logout() {}
  }
  const parser = async () => ({ messageId: "<m1@tiktok.com>", from: { text: "TikTok <no-reply@tiktok.com>" }, subject: "Hi", text: "Body", date: new Date("2026-10-28T00:00:00Z") });
  const mails = await watch.fetchMails({ user: "a@gmail.com", pass: "app-pass" }, FakeImap, parser);
  assert.deepEqual(searched.map((s) => s[0]), ["[Gmail]/Todos", "[Gmail]/Spam"]);
  assert.equal(searched[0][1].since.toISOString().slice(0, 10), watch.SINCE);
  assert.deepEqual(mails, [{ id: "<m1@tiktok.com>", from: "TikTok <no-reply@tiktok.com>", subject: "Hi", text: "Body", date: "2026-10-28T00:00:00.000Z" }]);
});

test("wiring: hourly job, its secret and its export", () => {
  assert.equal(ops.cron("tiktokBusinessWatch"), "25 * * * *");
  assert.ok(secrets.tiktokBusinessWatch.includes("QA_MAIL_APP_PASSWORD"));
  const index = fs.readFileSync(path.join(__dirname, "../../functions/index.js"), "utf8");
  assert.match(index, /exports\.tiktokBusinessWatch = scheduled\(/);
  assert.doesNotMatch(index, /\badmin\.(firestore|messaging|auth|storage)\(/, "index.js uses the modular admin SDK (getFirestore() and friends)");
  const pkg = require("../../functions/package.json");
  assert.ok(pkg.dependencies.imapflow && pkg.dependencies.mailparser);
});
