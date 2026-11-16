const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const replies = require("../../functions/url-review-owner-replies");

const METRO = [
  "---------- Forwarded message ---------",
  "De: Comunicaciones Metro <comunicaciones@metrodebogota.gov.co>",
  "Date: vie, 23 oct 2026 a las 9:12",
  "Subject: RE: Informe público de www.metrodebogota.gov.co",
  "To: <qa@carlosandmunoz.com>",
  "",
  "",
  "Buenos días,",
  "",
  "Por favor remitir estos correos a la nueva responsable del sitio web, laura.gomez@metrodebogota.gov.co.",
  "",
  "Cordialmente,",
  "Oficina de Comunicaciones",
  "",
  "De: QA-lab URL Review <review@carlosandmunoz.com>",
  "Enviado: jueves, 22 de octubre de 2026",
  "Asunto: Informe público de www.metrodebogota.gov.co",
  "Escríbenos a otra.persona@metrodebogota.gov.co si quieres."
].join("\n");

test("a reply forwarded from the inbox is read as the owner's, with the new person in charge proposed", () => {
  const reply = replies.read({ from: "Carlos <kaanmuar@gmail.com>", to: "reply@reply.carlosandmunoz.com", subject: "Fwd: RE: Informe", text: METRO });
  assert.equal(reply.from, "comunicaciones@metrodebogota.gov.co");
  assert.equal(reply.domain, "metrodebogota.gov.co");
  assert.equal(reply.forwardedBy, "kaanmuar@gmail.com");
  assert.equal(reply.subject, "RE: Informe público de www.metrodebogota.gov.co");
  assert.equal(reply.kind, "redirect");
  assert.deepEqual(reply.mentioned, ["laura.gomez@metrodebogota.gov.co"]);
  assert.ok(!reply.words.includes("Enviado:"), "the quoted notice is cut");
  const decision = replies.plan(reply, { email: "info@metrodebogota.gov.co" });
  assert.deepEqual(decision, { status: "waiting", apply: [], propose: "resend:laura.gomez@metrodebogota.gov.co" });
  assert.equal(replies.summary(reply, decision), "metrodebogota.gov.co asks to write to someone else: send the notice to laura.gomez@metrodebogota.gov.co");
  assert.equal(replies.plan(reply, null).propose, "", "nothing to resend without a notice");
});

test("an Outlook forward with no marker line is read as the owner's, not the operator's (#764)", () => {
  const text = fs.readFileSync(path.join(__dirname, "fixtures", "owner-reply-outlook-forward.txt"), "utf8");
  const reply = replies.read({ from: "QA-lab <qa@carlosandmunoz.com>", to: "reply@reply.carlosandmunoz.com", subject: "RV: RE: Informe", text });
  assert.equal(reply.from, "soporte@ferreteria-ejemplo.com.co");
  assert.equal(reply.domain, "ferreteria-ejemplo.com.co");
  assert.equal(reply.forwardedBy, "qa@carlosandmunoz.com");
  assert.equal(reply.subject, "RE: Informe público de www.ferreteria-ejemplo.com.co");
  assert.equal(reply.kind, "interested");
  assert.ok(reply.words.startsWith("Buenas tardes,"));
  assert.ok(!reply.words.includes("Hicimos una revisión"), "the quoted notice is cut");
  assert.deepEqual(reply.mentioned, []);
});

test("the original sender is found in Gmail, Outlook and Apple Mail forward headers", () => {
  const body = "\n\nPlease write to the new web manager instead.";
  const cases = [
    ["---------- Forwarded message ---------\nFrom: owner@shop.example\nDate: Fri, Oct 23, 2026\nSubject: Re: report\nTo: <qa@carlosandmunoz.com>" + body, "Re: report"],
    ["---------- Forwarded message ---------\n\nFrom: \"Shop Owner\" <owner@shop.example>\nDate: Fri, Oct 23, 2026\nSubject: Re: report" + body, "Re: report"],
    ["-----Original Message-----\nFrom: Shop Owner [mailto:owner@shop.example]\nSent: Friday, October 23, 2026 9:12 AM\nTo: QA-lab\nSubject: RE: report" + body, "RE: report"],
    ["________________________________\nFrom: Shop Owner <owner@shop.example<mailto:owner@shop.example>>\nSent: Friday, October 23, 2026 9:12 AM\nSubject: RE: report" + body, "RE: report"],
    ["**From:** Shop Owner <owner@shop.example>\n**Sent:** Friday, October 23, 2026\n**Subject:** RE: report" + body, "RE: report"],
    ["Von: Shop Owner <owner@shop.example>\nGesendet: Freitag, 23. Oktober 2026\nBetreff: AW: Bericht" + body, "AW: Bericht"],
    ["De : Shop Owner <owner@shop.example>\nEnvoyé : vendredi 23 octobre 2026\nObjet : RE: Rapport" + body, "RE: Rapport"],
    ["Begin forwarded message:\n\nFrom: Shop Owner <owner@shop.example>\nSubject: Re: report\nDate: October 23, 2026" + body, "Re: report"],
    ["Inicio del mensaje reenviado:\n\nDe: Shop Owner <owner@shop.example>\nAsunto: Re: Informe\nFecha: 23 de octubre de 2026" + body, "Re: Informe"]
  ];
  for (const [text, subject] of cases) {
    const reply = replies.read({ from: "kaanmuar@gmail.com", subject: "Fwd: report", text });
    assert.equal(reply.from, "owner@shop.example", text);
    assert.equal(reply.forwardedBy, "kaanmuar@gmail.com", text);
    assert.equal(reply.subject, subject, text);
    assert.equal(reply.kind, "redirect", text);
  }
});

test("a forward of a forward skips the other operator inbox, and our own headers are never the sender", () => {
  const text = [
    "---------- Forwarded message ---------",
    "From: QA-lab <qa@carlosandmunoz.com>",
    "Date: Fri, Oct 23, 2026",
    "Subject: Fwd: Re: report",
    "",
    "---------- Forwarded message ---------",
    "From: Shop Owner <owner@shop.example>",
    "Date: Fri, Oct 23, 2026",
    "Subject: Re: report",
    "",
    "Thanks, what would a full audit cost?"
  ].join("\n");
  const reply = replies.read({ from: "kaanmuar@gmail.com", subject: "Fwd: Fwd: Re: report", text });
  assert.equal(reply.from, "owner@shop.example");
  assert.equal(reply.subject, "Re: report");
  assert.equal(reply.kind, "interested");
  assert.equal(replies.unforward("Testing.\n\nFrom: QA-lab URL Review <review@carlosandmunoz.com>\nSent: Thu\nSubject: Report"), null);
  assert.equal(replies.unforward("De: aquí en adelante, owner@shop.example se encarga."), null, "a From line alone is not a header block");
});

test("a direct reply carries its notice token and loses the quoted text", () => {
  const token = "a".repeat(32);
  const reply = replies.read({
    from: "Ana <ana@tienda.com.co>",
    to: "reply+" + token + "@reply.carlosandmunoz.com",
    subject: "Re: Your public report",
    text: "Thanks, how much would a full audit cost?\n\nOn Thu, Oct 22, 2026 at 9:00 AM QA-lab <review@carlosandmunoz.com> wrote:\n> write to old@tienda.com.co\n"
  });
  assert.equal(reply.token, token);
  assert.equal(reply.kind, "interested");
  assert.deepEqual(reply.mentioned, []);
  assert.equal(replies.plan(reply, {}).propose, "answer");
});

test("automatic answers and bounces are filed; a bounce stops the address it bounced from", () => {
  const ooo = replies.read({ from: "x@acme.de", subject: "Abwesenheitsnotiz: Ihr Bericht", text: "Ich bin bis Montag nicht im Büro." });
  assert.equal(ooo.kind, "auto");
  assert.deepEqual(replies.plan(ooo, {}), { status: "filed", apply: [], propose: "" });
  const header = replies.read({ from: "x@acme.com", subject: "Re: report", text: "Back Monday", headers: "Auto-Submitted: auto-replied\nX-Foo: 1" });
  assert.equal(header.kind, "auto");
  const bounce = replies.read({ from: "MAILER-DAEMON@mx.acme.com", subject: "Undelivered Mail Returned to Sender", text: "550 no such user" });
  assert.equal(bounce.kind, "bounce");
  assert.deepEqual(replies.plan(bounce, { email: "gone@acme.com" }).apply, ["stop-address"]);
});

test("stop and complaint wording stops the domain at once, in any site language", () => {
  for (const text of ["Por favor no nos vuelvan a escribir.", "Please unsubscribe us.", "Bitte keine weiteren E-Mails.", "Merci de ne plus nous contacter."]) {
    const reply = replies.read({ from: "a@b.com", subject: "Re: report", text });
    assert.equal(reply.kind, "stop", text);
    assert.deepEqual(replies.plan(reply, {}), { status: "applied", apply: ["stop-domain"], propose: "" });
  }
  assert.equal(replies.read({ from: "a@b.com", subject: "Re", text: "This is spam, remove us." }).kind, "complaint");
  assert.equal(replies.read({ from: "a@b.co", subject: "Re", text: "Esto viola la Ley 1581 de habeas data." }).kind, "complaint");
});

test("anything else waits for a person", () => {
  const reply = replies.read({ from: "a@b.com", subject: "Re", text: "Who are you?" });
  assert.equal(reply.kind, "other");
  assert.deepEqual(replies.plan(reply, {}), { status: "waiting", apply: [], propose: "" });
  assert.equal(replies.unforward("no forward here"), null);
});

function loadReplyPage() {
  const index = fs.readFileSync(path.join(__dirname, "../../functions/index.js"), "utf8");
  const source = index.match(/function replyPage\(id, row, message\) \{[\s\S]*?\n\}/)[0];
  return new Function("ownerLayout", "ownerReplies", "OWNER_REPLIES_URL", source + "\nreturn replyPage;")(
    require("../../functions/owner-mail.js"), replies, "https://example.test/ownerReplies");
}

test("the owner reply page renders and escapes the proposed address", () => {
  const evil = "x\"><script>alert(1)</script>@shop.example";
  const html = loadReplyPage()("abc", { kind: "other", status: "waiting", from: "a@b.c", host: "shop.example", domain: "shop.example", propose: "resend:" + evil, mentioned: [evil], words: "hi" }, "");
  assert.match(html, /value="x&quot;&gt;&lt;script&gt;alert\(1\)&lt;\/script&gt;@shop\.example" required checked/);
  assert.ok(!html.includes("<script>"));
});

test("the decision page offers every address in the reply, the proposal checked, never the notice's own (#1095, #1094)", () => {
  const row = {
    kind: "redirect", status: "waiting", from: "contactenos@metrodebogota.gov.co", host: "metrodebogota.gov.co", domain: "metrodebogota.gov.co",
    noticeEmail: "contactenos@metrodebogota.gov.co", propose: "resend:dcc_general@metro1.com.co", words: "hi",
    mentioned: ["dcc_general@metro1.com.co", "commercial@metro1.com.co", "hr@metro1.com.co", "contactenos@metrodebogota.gov.co"]
  };
  const html = loadReplyPage()("abc", row, "");
  assert.equal((html.match(/type="radio" name="email"/g) || []).length, 3);
  assert.match(html, /value="dcc_general@metro1\.com\.co" required checked/);
  assert.match(html, /value="hr@metro1\.com\.co" required>/);
  assert.ok(!html.includes("value=\"contactenos@metrodebogota.gov.co\""));
  assert.deepEqual(replies.resendChoices(row), ["dcc_general@metro1.com.co", "commercial@metro1.com.co", "hr@metro1.com.co"]);
  const none = loadReplyPage()("abc", Object.assign({}, row, { mentioned: [row.noticeEmail], propose: "" }), "");
  assert.ok(!none.includes("do\" value=\"resend\""), "no resend button without another address");
});

test("POST do=resend only accepts an address offered on the page", () => {
  const index = fs.readFileSync(path.join(__dirname, "../../functions/index.js"), "utf8");
  assert.match(index, /action === "resend"\) problem = ownerReplies\.resendChoices\(row\)\.includes\(email\) \?/);
});

test("an auto-acknowledgement is filed, not answered (#1093, mit.edu Oct 23)", () => {
  const text = [
    "---------- Forwarded message ---------",
    "From: MIT Admissions <admissions@mit.edu>",
    "Date: Fri, Oct 23, 2026 at 11:02 AM",
    "Subject: RE: mit.edu has a public review on QA-lab Live Reports",
    "To: qa@carlosandmunoz.com <qa@carlosandmunoz.com>",
    "",
    "",
    "Hello,",
    "",
    "Thank you for reaching out; we’ve received your email.",
    "",
    "We promise to get back to you as soon as we can, typically within 3-5",
    "business days, and will answer all of your questions!",
    "",
    "Thank you,",
    "MIT Undergraduate Admissions"
  ].join("\n");
  const reply = replies.read({ from: "kaanmuar@gmail.com", subject: "Fwd: RE: mit.edu has a public review", text });
  assert.equal(reply.from, "admissions@mit.edu");
  assert.equal(reply.kind, "auto");
  assert.deepEqual(replies.plan(reply, { email: "admissions@mit.edu" }), { status: "filed", apply: [], propose: "" });
  const receipts = [
    "Hemos recibido su correo y le responderemos en un plazo de 3 días hábiles.",
    "Recebemos sua mensagem e entraremos em contato o mais breve possível.",
    "Vielen Dank, wir haben Ihre Nachricht erhalten und melden uns schnellstmöglich.",
    "Nous avons bien reçu votre message et reviendrons vers vous dans les meilleurs délais.",
    "Abbiamo ricevuto la sua richiesta, vi risponderemo entro 2 giorni lavorativi."
  ];
  for (const words of receipts) assert.equal(replies.read({ from: "info@shop.example", subject: "Re: report", text: words }).kind, "auto", words);
  assert.equal(replies.read({ from: "info@shop.example", subject: "Re", text: "We received your email. How much would a full audit cost?" }).kind, "interested", "a person who asks something is not an auto-reply");
});

test("a forwarded noreply mail is filed, with the words after the inner forward header (#1093, dw.com Oct 23)", () => {
  const text = [
    "---------- Forwarded message ---------",
    "From: Deutsche Welle <noreply@dw.com>",
    "Date: Fri, Oct 23, 2026 at 10:14 AM",
    "Subject: Fwd: Deutsche Welle - Please Read!     Bitte Lesen!     Por favor,",
    "lea!",
    "To: <qa@carlosandmunoz.com>",
    "",
    "",
    "---------- Forwarded message ---------",
    "From: Deutsche Welle <noreply@dw.com>",
    "Subject: Deutsche Welle - Please Read!",
    "",
    "This mailbox is not monitored. Please use the contact form on dw.com.",
    "Dieses Postfach wird nicht gelesen."
  ].join("\n");
  const reply = replies.read({ from: "kaanmuar@gmail.com", subject: "Fwd: Fwd: Deutsche Welle - Please Read!", text });
  assert.equal(reply.from, "noreply@dw.com");
  assert.equal(reply.subject, "Fwd: Deutsche Welle - Please Read!     Bitte Lesen!     Por favor, lea!");
  assert.equal(reply.kind, "auto");
  assert.ok(reply.words.startsWith("This mailbox is not monitored."), reply.words);
});

test("a mailing-list rejection stops the address and never proposes a resend to it (#1094, php.net Oct 23)", () => {
  const text = [
    "---------- Forwarded message ---------",
    "From: <php-webmaster+owner@lists.php.net>",
    "Date: Fri, Oct 23, 2026 at 9:58 AM",
    "Subject: Post to php-webmaster@lists.php.net denied: php.net has a public",
    "review on QA-lab Live Reports",
    "To: <qa@carlosandmunoz.com>",
    "",
    "",
    "Hi, this is the Mlmmj program managing the <php-webmaster@lists.php.net>",
    "mailing list.",
    "",
    "The message from <qa@carlosandmunoz.com> with subject \"php.net has a public",
    "review on QA-lab Live Reports\" was unable to be delivered to the list",
    "because you are not a list subscriber.",
    "",
    "If you believe you are a subscriber, you are probably subscribed with a",
    "different email address. To find out which address you are subscribed with,",
    "refer to the message welcoming you to the list, or look at the envelope",
    "\"Return-Path\" header of a message you receive from the list.",
    "",
    "(The denied message is below.)",
    "",
    "",
    "",
    "---------- Forwarded message ----------",
    "From: QA-lab URL Review <qa@carlosandmunoz.com>",
    "To: php-webmaster@lists.php.net",
    "Subject: php.net has a public review on QA-lab Live Reports"
  ].join("\n");
  const reply = replies.read({ from: "kaanmuar@gmail.com", subject: "Fwd: Post to php-webmaster@lists.php.net denied", text });
  assert.equal(reply.from, "php-webmaster+owner@lists.php.net");
  assert.equal(reply.kind, "bounce");
  const notice = { email: "php-webmaster@lists.php.net" };
  assert.deepEqual(replies.plan(reply, notice), { status: "filed", apply: ["stop-address"], propose: "" });
  assert.equal(replies.plan(Object.assign({}, reply, { kind: "redirect" }), notice).propose, "", "never the address that refused it");
});

test("a redirect proposes the address the owner points to, then general inboxes, jobs and suppliers last (#1095, Metro de Bogotá Oct 23)", () => {
  const text = fs.readFileSync(path.join(__dirname, "fixtures", "owner-reply-metro-concessionaire.txt"), "utf8");
  const reply = replies.read({ from: "Carlos <kaanmuar@gmail.com>", subject: "Fwd: RE: metrodebogota.gov.co", text });
  assert.equal(reply.from, "contactenos@metrodebogota.gov.co");
  assert.equal(reply.subject, "RE: metrodebogota.gov.co tiene una revisión pública en QA-lab Live Reports");
  assert.equal(reply.kind, "redirect");
  assert.ok(reply.words.startsWith("Buen día"));
  assert.ok(!reply.words.includes("Los puntajes son públicos"), "the quoted notice after a bold *De:* header is cut");
  assert.deepEqual(reply.mentioned, [
    "dcc_general@metro1.com.co",
    "commercial@metro1.com.co",
    "hr@metro1.com.co",
    "construction@metro1.com.co",
    "subcontractor@metro1.com.co",
    "procurement@metro1.com.co"
  ]);
  assert.equal(replies.plan(reply, { email: "contactenos@metrodebogota.gov.co" }).propose, "resend:dcc_general@metro1.com.co");
});
