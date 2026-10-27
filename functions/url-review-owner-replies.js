/* Replies to owner notices (#550): read, sorted, and turned into one decision each.

   Owner notices reply to reply+<owner link token>@<OWNER_REPLY_DOMAIN>. SendGrid Inbound Parse posts each
   reply to ownerReplies (functions/index.js), which matches it to its notice, sorts it with the rules
   below, applies what is safe at once, and mails the operator anything that needs a person. Rules only,
   no model: a reply costs nothing to read.

   kind       what happens
   auto       out-of-office, "we received your email" or noreply answer: filed
   bounce     the notice address does not exist or a mailing list refused it: that address is stopped
   complaint  spam, legal or data-protection wording: the domain is stopped, the operator is told
   stop       "remove us": the domain is stopped, the operator is told
   redirect   "write to the new person in charge": waits; the decision page offers every address in the reply,
              the one it points to first, and sends the notice to the one picked
   interested thanks, a price, a call: waits for a personal answer
   other      anything else: waits

   Owners who write to qa@ instead reach the same flow through ImprovMX's mailInbound webhook (#1899), which
   keeps only mail that matches a notice. */

const crypto = require("crypto");

const OPERATORS = ["kaanmuar@gmail.com", "qa@carlosandmunoz.com"];
const OWN_DOMAINS = ["carlosandmunoz.com"];

const AUTO_SUBJECT = /auto-?reply|automatic reply|out of (the )?office|respuesta autom|fuera de la oficina|ausente|abwesen|automatische antwort|absence|r[ée]ponse automatique|risposta automatica|fuori ufficio|resposta autom|aus[êe]ncia/i;
const AUTO_FROM = /^(no-?reply|no_reply|do-?not-?reply|donotreply|auto-?reply|autoresponder)([._+-][^@]*)?@/i;
const RECEIPT = /we(['’]ve| have)? (successfully )?received your (e-?mail|message|request|inquiry|enquiry)|your (e-?mail|message|request|inquiry|enquiry) (has been|was) received|this is an automat(ic|ed) (message|response|reply|e-?mail)|this (mailbox|inbox|address) is not monitored|(hemos|he) recibido (su|tu) (correo|mensaje|solicitud|e-?mail)|(su|tu) (correo|mensaje|solicitud) (ha sido|fue) recibid|(este es un )?mensaje (generado )?autom[áa]tic|recebemos (o |a )?(seu|sua) (e-?mail|mensagem|solicita)|(sua|seu) (mensagem|e-?mail|solicita[çc][ãa]o) foi recebid|ihre (e-?mail|nachricht|anfrage) (ist bei uns eingegangen|haben wir erhalten)|wir haben ihre (e-?mail|nachricht|anfrage) erhalten|automatisch (erstellte|generierte) (e-?mail|nachricht)|nous avons (bien )?re[çc]u votre (e-?mail|courriel|message|demande)|votre (e-?mail|courriel|message|demande) a (bien )?[ée]t[ée] re[çc]u|abbiamo ricevuto (la tua|la sua|il tuo|il suo) (e-?mail|mail|messaggio|richiesta)|messaggio (generato )?automatic/i;
const PROMISE = /get back to you|(business|working) days|as soon as (we can|possible)|d[íi]as h[áa]biles|lo antes posible|nos pondremos en contacto|dias [úu]teis|o mais breve|entraremos em contato|werktag|schnellstm[öo]glich|melden uns|jours ouvr|dans les (plus brefs|meilleurs) d[ée]lais|reviendrons vers vous|giorni lavorativi|al pi[ùu] presto|vi risponderemo/i;
const BOUNCE_FROM = /^(mailer-daemon|postmaster|mail-daemon)@|^[^@]+[-+](owner|bounces?)@/i;
const BOUNCE_SUBJECT = /undeliver|delivery status notification|mail delivery (failed|subsystem)|returned mail|failure notice|no se pudo entregar|non remis|unzustellbar|non recapitat|n[ãa]o entregue|\bpost(ing)? to \S+ (denied|rejected)/i;
const LIST_REJECT = /not a list (subscriber|member)|not subscribed to (this|the) (mailing )?list|only (list )?(members|subscribers) (may|can) post|non-?member (post|submission)s? (are|is) (not allowed|rejected)/i;
const COMPLAINT = /\bspam\b|abogad|demanda|denuncia|habeas data|ley 1581|superintendencia|\bgdpr\b|\bdsgvo\b|\brgpd\b|lawyer|legal action|attorney|abmahnung|avocat|avvocat|advogad/i;
const STOP = /unsubscribe|remove (me|us)|do not (contact|email|write)|stop (sending|emailing|writing)|dar(nos|me)? de baja|no (nos|me) (vuelva[ns]? a )?(env[ií]e|escrib|contact)|abmelden|keine (weiteren )?(e-?mails|nachrichten)|d[ée]sinscri|ne plus (nous|me) (contacter|[ée]crire)|cancellami|non (scriveteci|contattateci)|descadastr|n[ãa]o (nos|me) (envie|contate)/i;
const REDIRECT = /forward|redirect|instead|reenv[ií]|remit|redirig|dir[ií]j|dirigir|escrib(a|ir|an) a|nuev[oa] (responsable|encargad|contacto)|responsable|encargad|contact(e|ar|o) (a|con)|weiterleit|zust[äa]ndig|wenden sie sich|transf[ée]r|adress(ez|er)|inoltr|rivolger|responsabile|encaminh|respons[áa]vel/i;
const INTERESTED = /thank|gracias|interes|cotiza|precio|\bprice|quote|how much|cu[áa]nto|propuesta|reuni[óo]n|meeting|llamad|danke|merci|grazie|obrigad|angebot|devis|preventivo|or[çc]amento/i;

const FORWARD = /-{4,}\s*(forwarded message|mensaje reenviado|message transf[ée]r[ée]|weitergeleitete nachricht|messaggio inoltrato|mensagem encaminhada)\s*-{4,}|^[ \t]*(begin forwarded message|inicio del mensaje reenviado|d[ée]but du message r[ée]exp[ée]di[ée]|anfang der weitergeleiteten nachricht|inizio messaggio inoltrato|in[íi]cio da mensagem (re)?encaminhada)\s?:/im;
const FROM_KEYS = ["from", "de", "von", "da"];
const SUBJECT_KEYS = ["subject", "asunto", "betreff", "objet", "oggetto", "assunto"];
const OTHER_KEYS = ["sent", "date", "to", "cc", "reply-to", "enviado", "enviada", "fecha", "para", "gesendet", "datum", "an", "envoyé", "à", "a", "inviato", "data"];
const HEADER_LINE = /^[\s*]*([^:*]{1,12}?)[\s*]*:[\s*]*(.*?)[\s*]*$/;
const QUOTE_START = /^\s*(on .+wrote:|el .+escribi[óo]:|le .+a [ée]crit\s?:|am .+schrieb.*:|il giorno .+ha scritto:|em .+escreveu:|-{3,}\s*(original message|mensaje original|message d'origine|urspr[üu]ngliche nachricht|messaggio originale|mensagem original)\s*-{3,}|\**(from|de|von|da):\**\s.+@.+|_{8,})/im;
const EMAIL = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi;

// Who an address reaches, from its local part: a general or web inbox first, jobs and suppliers last (#1095).
const ROLE_FIRST = /^(contact[a-z]*|kontakt|info[a-z]*|general|hello|hola|hallo|commercial|comercial|sales|ventas|vendas|vertrieb|communications?|comunicaci[a-z]*|comunicacoes|kommunikation|press|prensa|presse|imprensa|stampa|media|medios|web|webmaster|www|marketing|digital|office|oficina|atencion[a-z]*)$/;
const ROLE_LAST = /^(hr|rrhh|rh|talent[a-z]*|jobs?|careers?|carreras|empleos?|trabajo|trabajaconnosotros|recruit[a-z]*|seleccion|cv|hojasdevida|procurement|compras|purchas[a-z]*|suppliers?|proveedores|fornecedores|subcontract[a-z]*|subcontrat[a-z]*|construction|construccion|obras|billing|facturaci[a-z]*|invoices?|facturas?|accounting|contabilidad|payments?|pagos)$/;
const POINTED = /oficial|official|offiziell|officiel|ufficiale|responsable|respons[áa]vel|responsabile|zust[äa]ndig|in charge/i;

function lower(value) {
  return String(value || "").trim().toLowerCase();
}

function addressOf(value) {
  const found = String(value || "").match(EMAIL);
  return found ? lower(found[found.length - 1]) : "";
}

function domainOfEmail(email) {
  return lower(String(email || "").split("@")[1]);
}

function ours(email) {
  const domain = domainOfEmail(email);
  return OPERATORS.includes(lower(email)) || OWN_DOMAINS.some((d) => domain === d || domain.endsWith("." + d));
}

// The reply's own words: no quoted notice, no "On ... wrote:" tail.
function ownWords(text) {
  const lines = String(text || "").replace(/\r/g, "").split("\n").filter((line) => !/^\s*>/.test(line));
  const body = lines.join("\n");
  const cut = body.search(QUOTE_START);
  return (cut > 0 ? body.slice(0, cut) : body).trim();
}

function headerKey(line) {
  const m = line.match(HEADER_LINE);
  const key = m ? lower(m[1]) : "";
  return FROM_KEYS.includes(key) || SUBJECT_KEYS.includes(key) || OTHER_KEYS.includes(key) ? key : "";
}

// One forwarded header block (From/Sent/To/Subject) starting at a From line; a wrapped From line is joined,
// and so is a wrapped Subject line when another header follows it.
function headerBlock(lines, start) {
  const head = { from: "", subject: "", fields: 0 };
  let last = "";
  let i = start;
  for (; i < lines.length && lines[i].trim(); i += 1) {
    const m = lines[i].match(HEADER_LINE);
    const key = m ? lower(m[1]) : "";
    if (FROM_KEYS.includes(key) && i === start) head.from = m[2];
    else if (SUBJECT_KEYS.includes(key)) head.subject = m[2];
    else if (!OTHER_KEYS.includes(key)) {
      if (SUBJECT_KEYS.includes(last)) {
        let next = i;
        while (next < lines.length && lines[next].trim() && !headerKey(lines[next])) next += 1;
        if (next < lines.length && lines[next].trim()) {
          head.subject += " " + lines.slice(i, next).map((line) => line.trim()).join(" ");
          i = next - 1;
          continue;
        }
      }
      if (last !== "from" || addressOf(head.from)) break;
      head.from += " " + lines[i].trim();
      continue;
    }
    last = i === start ? "from" : key;
    head.fields += 1;
  }
  return { from: addressOf(head.from), subject: head.subject.trim(), fields: head.fields, end: i };
}

// A reply the operator forwarded from the inbox: the original sender, subject and text.
// Outlook forwards have no marker line, so the first header block that is not ours is the sender.
function unforward(text) {
  const raw = String(text || "").replace(/\r/g, "");
  const at = raw.search(FORWARD);
  const lines = at < 0 ? raw.split("\n") : raw.slice(at).split("\n").slice(1);
  for (let i = 0; i < lines.length; i += 1) {
    const m = lines[i].match(HEADER_LINE);
    if (!m || !FROM_KEYS.includes(lower(m[1]))) continue;
    const head = headerBlock(lines, i);
    if (head.from && head.fields > 1 && !ours(head.from)) {
      return { from: head.from, subject: head.subject, text: lines.slice(head.end).join("\n").trim() };
    }
  }
  return null;
}

// The reply's words; when they are only another forward marker, the words after that forward's header block (#1093).
function forwardedWords(text) {
  let rest = String(text || "").replace(/\r/g, "");
  let words = ownWords(rest);
  for (let hop = 0; hop < 3 && !words.replace(new RegExp(FORWARD.source, "gim"), "").trim(); hop += 1) {
    const at = rest.search(FORWARD);
    if (at < 0) break;
    const lines = rest.slice(at).split("\n").slice(1);
    const start = lines.findIndex((line) => line.trim());
    if (start < 0 || !FROM_KEYS.includes(headerKey(lines[start]))) break;
    const head = headerBlock(lines, start);
    if (!head.from || ours(head.from)) break;
    rest = lines.slice(head.end).join("\n");
    words = ownWords(rest);
  }
  return words;
}

// Addresses in the reply, the one the owner points to first (#1095).
function rankAddresses(words, emails) {
  const text = lower(words);
  const tier = (email) => {
    const parts = email.split("@")[0].split(/[._+-]/);
    const role = parts.some((part) => ROLE_LAST.test(part)) ? 2 : parts.some((part) => ROLE_FIRST.test(part)) ? 0 : 1;
    const at = text.indexOf(email);
    const before = at < 0 ? "" : text.slice(Math.max(0, at - 120), at).split(EMAIL).pop();
    return role - (POINTED.test(before) ? 1 : 0);
  };
  return emails.map((email, order) => ({ email, order, rank: tier(email) }))
    .sort((a, b) => a.rank - b.rank || a.order - b.order)
    .map((item) => item.email);
}

// The addresses the decision page offers for a resend: never the address the notice already went to (#1094).
function resendChoices(row) {
  const sent = lower(row.noticeEmail);
  return (row.mentioned || []).map(lower).filter((email) => email && email !== sent);
}

// mail: { from, to, subject, text, headers }. Returns what the reply is and what it points to.
function read(mail) {
  let from = addressOf(mail.from);
  let subject = String(mail.subject || "").trim();
  let text = String(mail.text || "");
  let forwardedBy = "";
  if (OPERATORS.includes(from)) {
    const original = unforward(text);
    if (original) {
      forwardedBy = from;
      ({ from, subject, text } = original);
    }
  }
  const token = (String(mail.to || "").match(/reply\+([a-f0-9]{32})@/i) || [])[1] || "";
  const words = forwardedWords(text);
  const headers = String(mail.headers || "");
  const found = [...new Set((words.match(EMAIL) || []).map(lower))]
    .filter((email) => email !== from && !ours(email) && !AUTO_FROM.test(email) && !BOUNCE_FROM.test(email));
  const mentioned = rankAddresses(words, found);
  let kind = "other";
  if (BOUNCE_FROM.test(from) || BOUNCE_SUBJECT.test(subject) || LIST_REJECT.test(words)) kind = "bounce";
  else if (/^auto-submitted:\s*auto-(replied|generated)/im.test(headers) || /^x-autoreply:/im.test(headers) || AUTO_SUBJECT.test(subject) || AUTO_FROM.test(from)) kind = "auto";
  else if (RECEIPT.test(words) && (PROMISE.test(words) || !words.includes("?"))) kind = "auto";
  else if (COMPLAINT.test(words)) kind = "complaint";
  else if (STOP.test(words) || STOP.test(subject)) kind = "stop";
  else if (REDIRECT.test(words)) kind = "redirect";
  else if (INTERESTED.test(words)) kind = "interested";
  return { from, domain: domainOfEmail(from), subject, words: words.slice(0, 6000), kind, token, forwardedBy, mentioned: mentioned.slice(0, 8) };
}

// What is done without a person, and what the decision page proposes.
function plan(reply, notice) {
  const kind = reply.kind;
  if (kind === "auto") return { status: "filed", apply: [], propose: "" };
  if (kind === "bounce") return { status: "filed", apply: notice && notice.email ? ["stop-address"] : [], propose: "" };
  if (kind === "complaint" || kind === "stop") return { status: "applied", apply: ["stop-domain"], propose: "" };
  const to = notice ? resendChoices({ mentioned: reply.mentioned, noticeEmail: notice.email })[0] : "";
  if (kind === "redirect" && to) return { status: "waiting", apply: [], propose: "resend:" + to };
  return { status: "waiting", apply: [], propose: kind === "interested" ? "answer" : "" };
}

const KIND_LABELS = {
  auto: "automatic answer",
  bounce: "the address bounced",
  complaint: "complaint (domain stopped)",
  stop: "asked for no more notices (domain stopped)",
  redirect: "asks to write to someone else",
  interested: "interested, answer personally",
  other: "needs a look"
};

function summary(reply, decision) {
  const target = decision.propose.startsWith("resend:") ? ": send the notice to " + decision.propose.slice(7) : "";
  return (reply.domain || reply.from) + " " + KIND_LABELS[reply.kind] + target;
}

/** The Message-ID line of a raw header block, as SendGrid Inbound Parse posts it. */
function messageIdOf(headers) {
  return ((String(headers || "").match(/^message-id:[ \t]*(.+)$/im) || [])[1] || "").trim();
}

/* One row per mail (#1899): a reply that reaches both reply+<token>@ and qa@, or is posted again on a retry,
   gets the same id in either path. "" when the mail has no Message-ID. */
function replyId(messageId) {
  const key = String(messageId || "").trim().replace(/^<|>$/g, "");
  return key ? crypto.createHash("sha256").update(key).digest("hex").slice(0, 32) : "";
}

module.exports = { OPERATORS, KIND_LABELS, ownWords, unforward, read, plan, summary, addressOf, resendChoices, messageIdOf, replyId };
