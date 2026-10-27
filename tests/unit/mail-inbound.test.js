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
  assert.deepEqual(secrets.mailInbound, ["SENDGRID_API_KEY", "MAIL_WEBHOOK_KEY"]);
  assert.match(index, /exports\.mailInbound = functions\.runWith\(\{[^}]*secrets: SECRETS\.mailInbound/);
  assert.match(index, /op === "snapshot"\) out = Object\.assign\([^\n]*mailCodes: await mailCodeRows\(\)/);
  assert.match(fs.readFileSync(path.join(root, "js/admin-jarvis-push.js"), "utf8"), /\['codes', 'Sign-in codes'/);
  assert.match(fs.readFileSync(path.join(root, "android/app/src/main/java/com/carlosandmunoz/jarvis/push/Push.kt"), "utf8"), /CODES to Triple\("Sign-in codes"/);
});

const replies = require("../../functions/url-review-owner-replies");
const ownerPayload = (from, subject, text, extra) => payload(from, subject, text, Object.assign({ to: [{ name: null, email: "qa@carlosandmunoz.com" }] }, extra));

test("replyMail: an owner's mail to qa@ reads like an Inbound Parse post (#1899)", () => {
  const p = ownerPayload("ana@ejemplo.co", "RE: Informe público de ejemplo.co", "Por favor escriban a comunicaciones@ejemplo.co en adelante.", {
    cc: [{ name: null, email: "web@ejemplo.co" }],
    headers: Object.assign(auth("ejemplo.co"), { "Auto-Submitted": "no", "Message-ID": "<abc@ejemplo.co>" })
  });
  const mail = inbound.replyMail(p);
  assert.equal(mail.to, "qa@carlosandmunoz.com web@ejemplo.co");
  assert.match(mail.headers, /^Auto-Submitted: no$/m);
  assert.match(mail.headers, /^Authentication-Results: mx1\.improvmx\.com; spf=pass/m);
  assert.equal(mail.messageId, p["message-id"]);
  const reply = replies.read(mail);
  assert.equal(reply.from, "ana@ejemplo.co");
  assert.equal(reply.kind, "redirect");
  assert.deepEqual(reply.mentioned, ["comunicaciones@ejemplo.co"]);
  assert.equal(inbound.replyMail(Object.assign({}, p, { text: "", html: "<p>Gracias &amp; saludos</p>" })).text.trim(), "Gracias & saludos");
});

test("replyAuth: SPF and DKIM in the form SendGrid's fields use", () => {
  assert.deepEqual(inbound.replyAuth(auth("ejemplo.co")), { spf: "pass", dkim: "{@ejemplo.co : pass}" });
  assert.deepEqual(inbound.replyAuth({}), { spf: "", dkim: "" });
});

test("fromUs: our own alerts to qa@ are never taken as owner replies", () => {
  assert.equal(inbound.fromUs("reviews@carlosandmunoz.com"), true);
  assert.equal(inbound.fromUs("Reviews <bot@mail.carlosandmunoz.com>"), true);
  assert.equal(inbound.fromUs("ana@ejemplo.co"), false);
  assert.equal(inbound.fromUs("x@notcarlosandmunoz.com"), false);
});

test("replyId: the same mail gets the same row id through ImprovMX and SendGrid, retries included", () => {
  const id = replies.replyId("<abc@ejemplo.co>");
  assert.match(id, /^[a-f0-9]{32}$/);
  assert.equal(replies.replyId("abc@ejemplo.co"), id);
  assert.equal(replies.replyId(replies.messageIdOf("Received: by mx\r\nMessage-ID: <abc@ejemplo.co>\r\nSubject: RE: x")), id);
  assert.equal(replies.replyId(inbound.replyMail(ownerPayload("ana@ejemplo.co", "RE", "x", { "message-id": "<abc@ejemplo.co>" })).messageId), id);
  assert.equal(replies.replyId(""), "");
});

test("wiring: qa@ mail that is not a code goes to the owner-replies flow, matched notices only", () => {
  const index = fs.readFileSync(path.join(__dirname, "../../functions/index.js"), "utf8");
  assert.match(index, /!row && mail\.alias === "qa" && !mailInbound\.fromUs\(mail\.fromEmail\)\) \{\n\s+const out = await takeOwnerReply\(mailInbound\.replyMail\(req\.body\), mailInbound\.replyAuth\(req\.body\.headers\), true\)/);
  assert.match(index, /if \(matchedOnly && ownerReplies\.OPERATORS\.includes\(reply\.from\)\)/);
  assert.match(index, /if \(matchedOnly && !ref && !link\) return/);
  assert.match(index, /const id = ownerReplies\.replyId\(mail\.messageId\) \|\| crypto\.randomBytes/);
  assert.match(index, /collection\("url_review_owner_replies"\)\.doc\(id\)\.create\(row\)/);
  assert.match(index, /messageId: ownerReplies\.messageIdOf\(field\("headers"\)\)/);
  assert.match(index, /reply\.kind === "bounce" && \(reply\.mentioned \|\| \[\]\)\.length\) \{\n\s+const hit = await notices\.where\("email", "in", reply\.mentioned\.slice\(0, 10\)\)/);
});

test("a notice bounce at qa@ is a bounce that names the address it bounced from, Postfix and Gmail", () => {
  const postfix = replies.read(inbound.replyMail(ownerPayload("MAILER-DAEMON@mx.ejemplo.co", "Undelivered Mail Returned to Sender",
    "I am sorry to inform you that your message could not be delivered.\n\n<info@ejemplo.co>: host mx.ejemplo.co said: 550 5.1.1 User unknown\n\n--- Original message ---\nFrom: qa@carlosandmunoz.com\nTo: info@ejemplo.co")));
  assert.equal(postfix.kind, "bounce");
  assert.deepEqual(postfix.mentioned, ["info@ejemplo.co"]);
  const gmail = replies.read(inbound.replyMail(ownerPayload("mailer-daemon@googlemail.com", "Delivery Status Notification (Failure)",
    "Address not found\n\nYour message wasn't delivered to ana@ejemplo.co because the address couldn't be found.")));
  assert.equal(gmail.kind, "bounce");
  assert.deepEqual(gmail.mentioned, ["ana@ejemplo.co"]);
});
