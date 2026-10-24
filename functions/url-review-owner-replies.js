/* Replies to owner notices (#550): read, sorted, and turned into one decision each.

   Owner notices reply to reply+<owner link token>@<OWNER_REPLY_DOMAIN>. SendGrid Inbound Parse posts each
   reply to ownerReplies (functions/index.js), which matches it to its notice, sorts it with the rules
   below, applies what is safe at once, and mails the operator anything that needs a person. Rules only,
   no model: a reply costs nothing to read.

   kind       what happens
   auto       out-of-office or other automatic answer: filed
   bounce     the notice address does not exist: that address is stopped
   complaint  spam, legal or data-protection wording: the domain is stopped, the operator is told
   stop       "remove us": the domain is stopped, the operator is told
   redirect   "write to the new person in charge": waits; the decision page offers to send the notice there
   interested thanks, a price, a call: waits for a personal answer
   other      anything else: waits */

const OPERATORS = ["kaanmuar@gmail.com", "qa@carlosandmunoz.com"];
const OWN_DOMAINS = ["carlosandmunoz.com"];

const AUTO_SUBJECT = /auto-?reply|automatic reply|out of (the )?office|respuesta autom|fuera de la oficina|ausente|abwesen|automatische antwort|absence|r[ée]ponse automatique|risposta automatica|fuori ufficio|resposta autom|aus[êe]ncia/i;
const BOUNCE_FROM = /^(mailer-daemon|postmaster|mail-daemon)@/i;
const BOUNCE_SUBJECT = /undeliver|delivery status notification|mail delivery (failed|subsystem)|returned mail|failure notice|no se pudo entregar|non remis|unzustellbar|non recapitat|n[ãa]o entregue/i;
const COMPLAINT = /\bspam\b|abogad|demanda|denuncia|habeas data|ley 1581|superintendencia|\bgdpr\b|\bdsgvo\b|\brgpd\b|lawyer|legal action|attorney|abmahnung|avocat|avvocat|advogad/i;
const STOP = /unsubscribe|remove (me|us)|do not (contact|email|write)|stop (sending|emailing|writing)|dar(nos|me)? de baja|no (nos|me) (vuelva[ns]? a )?(env[ií]e|escrib|contact)|abmelden|keine (weiteren )?(e-?mails|nachrichten)|d[ée]sinscri|ne plus (nous|me) (contacter|[ée]crire)|cancellami|non (scriveteci|contattateci)|descadastr|n[ãa]o (nos|me) (envie|contate)/i;
const REDIRECT = /forward|redirect|instead|reenv[ií]|remit|redirig|dir[ií]j|dirigir|escrib(a|ir|an) a|nuev[oa] (responsable|encargad|contacto)|responsable|encargad|contact(e|ar|o) (a|con)|weiterleit|zust[äa]ndig|wenden sie sich|transf[ée]r|adress(ez|er)|inoltr|rivolger|responsabile|encaminh|respons[áa]vel/i;
const INTERESTED = /thank|gracias|interes|cotiza|precio|\bprice|quote|how much|cu[áa]nto|propuesta|reuni[óo]n|meeting|llamad|danke|merci|grazie|obrigad|angebot|devis|preventivo|or[çc]amento/i;

const FORWARD = /-{4,}\s*(forwarded message|mensaje reenviado|message transf[ée]r[ée]|weitergeleitete nachricht|messaggio inoltrato|mensagem encaminhada)\s*-{4,}|^[ \t]*(begin forwarded message|inicio del mensaje reenviado|d[ée]but du message r[ée]exp[ée]di[ée]|anfang der weitergeleiteten nachricht|inizio messaggio inoltrato|in[íi]cio da mensagem (re)?encaminhada)\s?:/im;
const FROM_KEYS = ["from", "de", "von", "da"];
const SUBJECT_KEYS = ["subject", "asunto", "betreff", "objet", "oggetto", "assunto"];
const OTHER_KEYS = ["sent", "date", "to", "cc", "reply-to", "enviado", "enviada", "fecha", "para", "gesendet", "datum", "an", "envoyé", "à", "a", "inviato", "data"];
const HEADER_LINE = /^[\s*]*([^:*]{1,12}?)[\s*]*:[\s*]*(.*?)[\s*]*$/;
const QUOTE_START = /^\s*(on .+wrote:|el .+escribi[óo]:|le .+a [ée]crit\s?:|am .+schrieb.*:|il giorno .+ha scritto:|em .+escreveu:|-{3,}\s*(original message|mensaje original|message d'origine|urspr[üu]ngliche nachricht|messaggio originale|mensagem original)\s*-{3,}|(from|de|von|da):\s.+@.+|_{8,})/im;
const EMAIL = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi;

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

// One forwarded header block (From/Sent/To/Subject) starting at a From line; a wrapped From line is joined.
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
  const words = ownWords(text);
  const headers = String(mail.headers || "");
  const mentioned = [...new Set((words.match(EMAIL) || []).map(lower))]
    .filter((email) => email !== from && !ours(email) && !/^(no-?reply|mailer-daemon|postmaster)@/.test(email));
  let kind = "other";
  if (BOUNCE_FROM.test(from) || BOUNCE_SUBJECT.test(subject)) kind = "bounce";
  else if (/^auto-submitted:\s*auto-(replied|generated)/im.test(headers) || /^x-autoreply:/im.test(headers) || AUTO_SUBJECT.test(subject)) kind = "auto";
  else if (COMPLAINT.test(words)) kind = "complaint";
  else if (STOP.test(words) || STOP.test(subject)) kind = "stop";
  else if (REDIRECT.test(words)) kind = "redirect";
  else if (INTERESTED.test(words)) kind = "interested";
  return { from, domain: domainOfEmail(from), subject, words: words.slice(0, 6000), kind, token, forwardedBy, mentioned: mentioned.slice(0, 5) };
}

// What is done without a person, and what the decision page proposes.
function plan(reply, notice) {
  const kind = reply.kind;
  if (kind === "auto") return { status: "filed", apply: [], propose: "" };
  if (kind === "bounce") return { status: "filed", apply: notice && notice.email ? ["stop-address"] : [], propose: "" };
  if (kind === "complaint" || kind === "stop") return { status: "applied", apply: ["stop-domain"], propose: "" };
  if (kind === "redirect" && reply.mentioned.length && notice) return { status: "waiting", apply: [], propose: "resend:" + reply.mentioned[0] };
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

module.exports = { OPERATORS, KIND_LABELS, ownWords, unforward, read, plan, summary, addressOf };
