const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const inbound = require("../../functions/mail-inbound");
const push = require("../../functions/jarvis-push");
const secrets = require("../../functions/secrets");

const auth = (domain) => ({ "Authentication-Results": ["mx1.improvmx.com; spf=pass (improvmx.com: domain of " + domain + " designates 1.2.3.4 as permitted sender) smtp.mailfrom=bounce@" + domain + "; dkim=pass header.d=" + domain] });
const payload = (from, subject, text, extra) => Object.assign({
  headers: auth(from.split("@")[1]),
  to: [{ name: null, email: "tiktok@carlosandmunoz.com" }],
  from: { name: "Sender", email: from },
  subject,
  "message-id": "<" + subject.length + "." + from + ">",
  timestamp: 1824000000,
  text,
  html: ""
}, extra);
const code = (p, alias) => inbound.codeOf(inbound.read(p, alias));

test("codeOf: codes in the subject and the body, English and Spanish", () => {
  assert.equal(code(payload("security@mail.instagram.com", "123456 is your Instagram code", "Someone tried to log in.")).code, "123456");
  assert.equal(code(payload("no-reply@accounts.google.com", "G-482913 is your Google verification code", "")).code, "482913");
  assert.equal(code(payload("no-reply@account.tiktok.com", "Your TikTok verification code", "Your verification code is 739201. It expires in 5 minutes.")).code, "739201");
  assert.equal(code(payload("no-reply@account.tiktok.com", "Código de verificación", "Tu código de verificación es: 551 902")).code, "551902");
  assert.equal(code(payload("info@x.com", "Confirm your email", "Use the code below to confirm your email address.\n\n  4kx92mpa  \n\nThanks, X")).code, "4kx92mpa");
  assert.equal(code(payload("security-noreply@linkedin.com", "Here's your verification code", "Use the code below to sign in:\n\n204816\n\nThis code expires in 15 minutes.")).code, "204816");
});

test("codeOf: the service comes from the sender, checked against SPF and DKIM", () => {
  const ok = code(payload("no-reply@account.tiktok.com", "Your code", "Code: 123987"));
  assert.equal(ok.service, "tiktok");
  assert.equal(ok.label, "TikTok");
  assert.equal(ok.trusted, true);
  assert.equal(ok.alias, "tiktok");
  const forged = code(payload("no-reply@account.tiktok.com", "Your code", "Code: 123987", { headers: auth("evil.io") }));
  assert.equal(forged.trusted, false);
  const lookAlike = code(payload("no-reply@tiktok.com.evil.io", "Your code", "Code: 123987"));
  assert.equal(lookAlike.service, "tiktok.com.evil.io");
  assert.equal(lookAlike.trusted, false);
});

test("codeOf: a confirm link only from a checked sender, pointing at the same service", () => {
  const html = (href) => ({ html: "<p>Confirm your new email</p><a href=\"" + href + "\">Confirm</a>" });
  const link = code(payload("noreply@bsky.app", "Confirm your email", "Confirm your new email address.", html("https://bsky.app/confirm-email?token=abc")));
  assert.equal(link.code, "");
  assert.equal(link.link, "https://bsky.app/confirm-email?token=abc");
  assert.equal(code(payload("noreply@bsky.app", "Confirm your email", "Confirm your new email address.", Object.assign(html("https://bsky.app/confirm-email?token=abc"), { headers: {} }))), null);
  assert.equal(code(payload("noreply@bsky.app", "Confirm your email", "Confirm your new email address.", html("https://phish.example/bsky/confirm"))), null);
});

test("codeOf: newsletters, years and phone numbers are not codes", () => {
  assert.equal(code(payload("news@buffer.com", "What's new in Buffer for 2026", "Read the release notes.")), null);
  assert.equal(code(payload("no-reply@account.tiktok.com", "Trends this week", "Call 18005551234 for ads support.")), null);
  assert.equal(code(payload("no-reply@account.tiktok.com", "Your login code", "Your code expires in\n2026\n")), null);
});

test("read: the alias comes from the webhook URL first, then the To address; htmlText is used without a text part", () => {
  const p = payload("no-reply@account.tiktok.com", "Your code", "", { html: "<div>Your code is <b>918273</b></div>", to: [{ email: "youtube@carlosandmunoz.com" }] });
  assert.equal(inbound.read(p, "x").alias, "x");
  assert.equal(inbound.read(p).alias, "youtube");
  assert.equal(code(p).code, "918273");
  assert.deepEqual(inbound.passedDomains(auth("tiktok.com")), ["tiktok.com"]);
  assert.equal(inbound.htmlText("<p>&amp;quot; &quot;</p>").trim(), "&quot; \"");
});

test("message: a codes push with the code, the alias and a warning for an unchecked sender", () => {
  const row = code(payload("no-reply@account.tiktok.com", "Your TikTok code", "Code: 123987", { headers: {} }));
  const msg = inbound.message(row);
  assert.equal(msg.kind, "codes");
  assert.equal(msg.title, "TikTok code: 123987");
  assert.equal(msg.code, "123987");
  assert.equal(msg.tag, "jarvis-code-tiktok");
  assert.match(msg.lines.join(" "), /To tiktok@, sender not checked/);
  assert.ok(push.KINDS.includes("codes"));
});

test("rows: the last day only, newest first, at most ten", () => {
  const now = Date.parse("2026-10-27T18:00:00Z");
  const at = (h) => new Date(now - h * 3600000).toISOString();
  const docs = Array.from({ length: 14 }, (_, i) => ({ service: "x", label: "X", code: String(100000 + i), at: at(i * 2) }));
  const out = inbound.rows(docs, now);
  assert.equal(out.length, 10);
  assert.equal(out[0].code, "100000");
  assert.ok(out.every((r) => Date.parse(r.at) > now - inbound.KEEP_MS));
});

test("wiring: mailInbound reads its key, the snapshot carries the codes, and both apps list the codes kind", () => {
  const root = path.join(__dirname, "../..");
  const index = fs.readFileSync(path.join(root, "functions/index.js"), "utf8");
  assert.deepEqual(secrets.mailInbound, ["MAIL_WEBHOOK_KEY"]);
  assert.match(index, /exports\.mailInbound = functions\.runWith\(\{[^}]*secrets: SECRETS\.mailInbound/);
  assert.match(index, /op === "snapshot"\) out = Object\.assign\([^\n]*mailCodes: await mailCodeRows\(\)/);
  assert.match(fs.readFileSync(path.join(root, "js/admin-jarvis-push.js"), "utf8"), /\['codes', 'Sign-in codes'/);
  assert.match(fs.readFileSync(path.join(root, "android/app/src/main/java/com/carlosandmunoz/jarvis/push/Push.kt"), "utf8"), /CODES to Triple\("Sign-in codes"/);
});
