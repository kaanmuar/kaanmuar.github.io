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

test("the owner reply page renders and escapes the proposed address", () => {
  const index = fs.readFileSync(path.join(__dirname, "../../functions/index.js"), "utf8");
  const source = index.match(/function replyPage\(id, row, message\) \{[\s\S]*?\n\}/)[0];
  const replyPage = new Function("ownerLayout", "ownerReplies", "OWNER_REPLIES_URL", source + "\nreturn replyPage;")(
    require("../../functions/owner-mail.js"), { KIND_LABELS: {} }, "https://example.test/ownerReplies");
  const html = replyPage("abc", { kind: "other", status: "waiting", from: "a@b.c", host: "shop.example", domain: "shop.example", propose: "resend:x\"><script>alert(1)</script>@shop.example", words: "hi" }, "");
  assert.match(html, /value="x&quot;&gt;&lt;script&gt;alert\(1\)&lt;\/script&gt;@shop\.example"/);
  assert.ok(!html.includes("<script>"));
});
