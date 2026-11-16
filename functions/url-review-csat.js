/**
 * Post-report CSAT for URL Review (#3556): stars (run) + NPS (product) + comment + quote opt-in.
 * Email one-time links, delayed reminder, and signed-in session submit share the same store.
 * Thumbs are skipped: stars already cover a low-friction 1–5 scale.
 */
"use strict";

const fusion = require("./url-review-fusion");
const booking = require("./booking");
const { FUSION, TEXT } = fusion;

const LANGS = ["en", "es", "pt", "de", "fr", "it"];
const SITE = "https://carlosandmunoz.com";
const PAGE_FOR = {
  en: "qa-review.html",
  es: "qa-review-es.html",
  pt: "qa-review-pt.html",
  de: "qa-review-de.html",
  fr: "qa-review-fr.html",
  it: "qa-review-it.html"
};
const LOW_STAR = 2;
const REMIND_AFTER_MS = 24 * 60 * 60 * 1000;
const REMIND_BEFORE_MS = 48 * 60 * 60 * 1000;
/** Second nudge when the first remind did not land an answer (#3557). */
const RECUR_AFTER_MS = 7 * 24 * 60 * 60 * 1000;
const RECUR_BEFORE_MS = 8 * 24 * 60 * 60 * 1000;

const COPY = {
  en: {
    mailCta: "How was this review?",
    mailNote: "Rate the run (1–5) and how likely you are to recommend URL Review (0–10).",
    remindSubject: "Quick feedback on your review of {host}?",
    remindLead: "You opened the report for {host}. A 20-second rating helps us improve URL Review.",
    recurSubject: "Last nudge — feedback on your review of {host}?",
    recurLead: "We sent your report for {host} last week. If you have a spare minute, a quick rating still helps.",
    title: "How was this review?",
    lead: "Rate the review of {host}. Both scores and a short comment help.",
    stars: "This run (1–5)",
    nps: "Recommend URL Review? (0–10)",
    comment: "Anything we should improve? (optional)",
    quote: "You may quote my feedback publicly (name and site only if I left them).",
    submit: "Send feedback",
    thanks: "Thanks — your feedback is in.",
    thanksLow: "Sorry this missed the mark. Book a walkthrough or ask for a free re-check.",
    book: "Book a 30-min call",
    rerun: "Ask for a free re-check",
    gone: "This feedback link no longer works.",
    used: "You already sent feedback for this review.",
    bad: "Pick a run rating from 1 to 5 and an NPS from 0 to 10."
  },
  es: {
    mailCta: "¿Qué tal esta revisión?",
    mailNote: "Califica la corrida (1–5) y qué tan probable es que recomiendes URL Review (0–10).",
    remindSubject: "¿Un feedback rápido de tu revisión de {host}?",
    remindLead: "Abriste el informe de {host}. Una calificación de 20 segundos nos ayuda a mejorar URL Review.",
    title: "¿Qué tal esta revisión?",
    lead: "Califica la revisión de {host}. Ambas notas y un comentario corto ayudan.",
    stars: "Esta corrida (1–5)",
    nps: "¿Recomendarías URL Review? (0–10)",
    comment: "¿Qué deberíamos mejorar? (opcional)",
    quote: "Pueden citar mi feedback en público (nombre y sitio solo si los dejé).",
    submit: "Enviar feedback",
    thanks: "Gracias — ya recibimos tu feedback.",
    thanksLow: "Lamentamos que no haya alcanzado. Agenda una llamada o pide una re-revisión gratis.",
    book: "Agendar llamada de 30 min",
    rerun: "Pedir re-revisión gratis",
    gone: "Este enlace de feedback ya no sirve.",
    used: "Ya enviaste feedback para esta revisión.",
    bad: "Elige una nota de corrida del 1 al 5 y un NPS del 0 al 10."
  },
  pt: {
    mailCta: "Como foi esta revisão?",
    mailNote: "Avalie a execução (1–5) e a chance de recomendar o URL Review (0–10).",
    remindSubject: "Feedback rápido da revisão de {host}?",
    remindLead: "Você abriu o relatório de {host}. Uma nota de 20 segundos ajuda a melhorar o URL Review.",
    title: "Como foi esta revisão?",
    lead: "Avalie a revisão de {host}. As duas notas e um comentário curto ajudam.",
    stars: "Esta execução (1–5)",
    nps: "Recomendaria o URL Review? (0–10)",
    comment: "O que devemos melhorar? (opcional)",
    quote: "Podem citar meu feedback em público (nome e site só se eu deixar).",
    submit: "Enviar feedback",
    thanks: "Obrigado — seu feedback chegou.",
    thanksLow: "Desculpe se não bateu. Agende uma call ou peça uma reavaliação grátis.",
    book: "Agendar call de 30 min",
    rerun: "Pedir reavaliação grátis",
    gone: "Este link de feedback não vale mais.",
    used: "Você já enviou feedback para esta revisão.",
    bad: "Escolha uma nota de 1 a 5 e um NPS de 0 a 10."
  },
  de: {
    mailCta: "Wie war diese Prüfung?",
    mailNote: "Bewerten Sie den Lauf (1–5) und die Weiterempfehlung von URL Review (0–10).",
    remindSubject: "Kurzes Feedback zu Ihrer Prüfung von {host}?",
    remindLead: "Sie haben den Bericht zu {host} geöffnet. Eine 20-Sekunden-Bewertung hilft uns.",
    title: "Wie war diese Prüfung?",
    lead: "Bewerten Sie die Prüfung von {host}. Beide Werte und ein kurzer Kommentar helfen.",
    stars: "Dieser Lauf (1–5)",
    nps: "URL Review weiterempfehlen? (0–10)",
    comment: "Was sollten wir verbessern? (optional)",
    quote: "Mein Feedback darf öffentlich zitiert werden (Name und Site nur wenn ich sie nenne).",
    submit: "Feedback senden",
    thanks: "Danke — Ihr Feedback ist angekommen.",
    thanksLow: "Schade, wenn es nicht gepasst hat. Buchen Sie einen Call oder bitten Sie um einen kostenlosen Re-Check.",
    book: "30-Min-Call buchen",
    rerun: "Kostenlosen Re-Check anfragen",
    gone: "Dieser Feedback-Link gilt nicht mehr.",
    used: "Sie haben für diese Prüfung schon Feedback gesendet.",
    bad: "Wählen Sie 1–5 für den Lauf und 0–10 für NPS."
  },
  fr: {
    mailCta: "Cette revue vous a convenu ?",
    mailNote: "Notez la passe (1–5) et la recommandation d’URL Review (0–10).",
    remindSubject: "Un avis rapide sur votre revue de {host} ?",
    remindLead: "Vous avez ouvert le rapport de {host}. Une note de 20 secondes nous aide.",
    title: "Cette revue vous a convenu ?",
    lead: "Notez la revue de {host}. Les deux scores et un court commentaire aident.",
    stars: "Cette passe (1–5)",
    nps: "Recommander URL Review ? (0–10)",
    comment: "Que devons-nous améliorer ? (optionnel)",
    quote: "Vous pouvez citer mon avis en public (nom et site seulement si je les laisse).",
    submit: "Envoyer le feedback",
    thanks: "Merci — votre feedback est bien reçu.",
    thanksLow: "Désolé si ça a manqué. Réservez un appel ou demandez une relecture gratuite.",
    book: "Réserver 30 min",
    rerun: "Demander une relecture gratuite",
    gone: "Ce lien de feedback n'est plus valide.",
    used: "Vous avez déjà envoyé un feedback pour cette revue.",
    bad: "Choisissez 1–5 pour la passe et 0–10 pour le NPS."
  },
  it: {
    mailCta: "Com'è andata questa revisione?",
    mailNote: "Valuta l’esecuzione (1–5) e quanto consiglieresti URL Review (0–10).",
    remindSubject: "Un feedback rapido sulla revisione di {host}?",
    remindLead: "Hai aperto il report di {host}. Una valutazione di 20 secondi ci aiuta.",
    title: "Com'è andata questa revisione?",
    lead: "Valuta la revisione di {host}. Entrambi i punteggi e un breve commento aiutano.",
    stars: "Questa esecuzione (1–5)",
    nps: "Consiglieresti URL Review? (0–10)",
    comment: "Cosa dovremmo migliorare? (opzionale)",
    quote: "Potete citare il mio feedback in pubblico (nome e sito solo se li lascio).",
    submit: "Invia feedback",
    thanks: "Grazie — il tuo feedback è arrivato.",
    thanksLow: "Ci dispiace se non ha centrato. Prenota una call o chiedi un re-check gratis.",
    book: "Prenota 30 min",
    rerun: "Chiedi un re-check gratis",
    gone: "Questo link di feedback non è più valido.",
    used: "Hai già inviato feedback per questa revisione.",
    bad: "Scegli 1–5 per l’esecuzione e 0–10 per l’NPS."
  }
};

function langOf(lang) {
  const code = String(lang || "en").toLowerCase().slice(0, 2);
  return LANGS.indexOf(code) === -1 ? "en" : code;
}

function esc(value) {
  return String(value == null ? "" : value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function fill(template, vars) {
  return String(template || "").replace(/\{(\w+)\}/g, (_, key) => (vars && vars[key] != null ? String(vars[key]) : ""));
}

function cleanComment(value) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, 2000);
}

function parseRating(value) {
  const n = Number(value);
  return [1, 2, 3, 4, 5].indexOf(n) === -1 ? 0 : n;
}

function parseNps(value) {
  const n = Number(value);
  if (!Number.isInteger(n) || n < 0 || n > 10) return -1;
  return n;
}

function readSubmit(body) {
  const raw = body && typeof body === "object" ? body : {};
  const quote = raw.quote === true || raw.quote === "on" || raw.quote === "1" || raw.quote === "true";
  return {
    rating: parseRating(raw.rating),
    nps: parseNps(raw.nps),
    comment: cleanComment(raw.comment),
    quoteOk: quote
  };
}

function isComplete(submit) {
  return !!(submit && submit.rating && submit.nps >= 0);
}

function isLow(submit) {
  return !!(submit && (submit.rating <= LOW_STAR || submit.nps <= 6));
}

/** Owner-facing draft when the score is low (#3556). */
function draftReply(submit, host) {
  const site = String(host || "your site");
  const bits = [];
  if (submit && submit.rating && submit.rating <= LOW_STAR) bits.push("the " + submit.rating + "/5 on the run");
  if (submit && submit.nps >= 0 && submit.nps <= 6) bits.push("the " + submit.nps + "/10 on recommending URL Review");
  const about = bits.length ? bits.join(" and ") : "the low scores";
  const heard = submit && submit.comment
    ? "I read your note about “" + submit.comment.slice(0, 160) + "”."
    : "I saw the scores without a comment.";
  return "Thanks for the honest feedback on " + site + " — " + about + " matter. " + heard +
    " Happy to walk through the report on a 30-min call, or run a free re-check once we know what missed. What would help most?";
}

function shell(lang, title, body) {
  const code = langOf(lang);
  return "<!DOCTYPE html><html lang=\"" + code + "\"><head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\"><meta name=\"robots\" content=\"noindex\"><title>" + esc(title) + "</title>" +
    "<style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:" + fusion.PAGE_BG + ";font-family:Arial,Helvetica,sans-serif;color:" + TEXT.strong + "}" +
    "main{background:#fff;border-radius:16px;border-top:4px solid " + FUSION.teal + ";padding:32px;max-width:480px;margin:16px;text-align:center}" +
    "h1{font-size:22px;line-height:1.3;font-weight:normal;margin:0 0 12px}p{font-size:15px;line-height:1.45;color:" + TEXT.body + ";margin:0 0 16px}" +
    "fieldset{border:0;margin:0 0 14px;padding:0}legend{font-size:13px;color:" + TEXT.muted + ";margin:0 0 10px}" +
    ".picks{display:flex;justify-content:center;gap:6px;flex-wrap:wrap}" +
    ".picks label{display:inline-flex;align-items:center;justify-content:center;min-width:36px;height:36px;border-radius:999px;border:1px solid " + fusion.LINE + ";cursor:pointer;font-weight:bold;font-size:14px}" +
    ".picks input{position:absolute;opacity:0;pointer-events:none}" +
    ".picks input:checked+span,.picks label:hover span{background:" + FUSION.teal + ";color:" + FUSION.night + ";border-radius:999px;width:100%;height:100%;display:grid;place-items:center;padding:0 8px;box-sizing:border-box}" +
    "textarea{width:100%;min-height:88px;box-sizing:border-box;border:1px solid " + fusion.LINE + ";border-radius:12px;padding:12px;font:inherit;margin:0 0 12px;resize:vertical}" +
    ".quote{display:flex;gap:10px;align-items:flex-start;text-align:left;font-size:13px;color:" + TEXT.body + ";margin:0 0 16px}" +
    ".quote input{margin-top:3px}" +
    "button,.btn{display:inline-block;background:" + FUSION.teal + ";color:" + FUSION.night + ";border:0;border-radius:999px;padding:13px 22px;font-size:15px;font-weight:bold;cursor:pointer;text-decoration:none;margin:6px 4px}" +
    ".btn.s{background:transparent;border:1px solid " + FUSION.teal + ";color:" + TEXT.strong + "}" +
    "a{color:" + TEXT.link + "}.err{color:" + TEXT.risk + ";font-weight:bold}</style></head>" +
    "<body><main>" + body + "</main></body></html>";
}

function pickRow(name, values, picked) {
  return values.map((n) => {
    const on = picked === n ? " checked" : "";
    return "<label><input type=\"radio\" name=\"" + name + "\" value=\"" + n + "\"" + on + " required><span>" + n + "</span></label>";
  }).join("");
}

/**
 * state: ask | thanks | gone | used | bad
 * opts: { host, rating, nps, comment, quoteOk, reviewId, bookUrl, rerunUrl, low }
 */
function csatPage(lang, state, opts) {
  const code = langOf(lang);
  const t = COPY[code];
  const o = opts || {};
  const host = String(o.host || "your site");
  if (state === "gone") return shell(code, t.gone, "<h1>" + esc(t.gone) + "</h1><p><a href=\"" + SITE + "/" + PAGE_FOR[code] + "\">QA-lab URL Review</a></p>");
  if (state === "used") return shell(code, t.used, "<h1>" + esc(t.used) + "</h1><p><a href=\"" + SITE + "/" + PAGE_FOR[code] + "\">QA-lab URL Review</a></p>");
  if (state === "thanks") {
    const low = !!o.low;
    const book = o.bookUrl ? "<a class=\"btn\" href=\"" + esc(o.bookUrl) + "\">" + esc(t.book) + "</a>" : "";
    const rerun = o.rerunUrl ? "<a class=\"btn s\" href=\"" + esc(o.rerunUrl) + "\">" + esc(t.rerun) + "</a>" : "";
    const extra = low ? "<p>" + esc(t.thanksLow) + "</p><p>" + book + rerun + "</p>" : "";
    return shell(code, t.thanks, "<h1>" + esc(t.thanks) + "</h1>" + extra + "<p><a href=\"" + SITE + "/" + PAGE_FOR[code] + "\">QA-lab URL Review</a></p>");
  }
  const err = state === "bad" || o.error ? "<p class=\"err\">" + esc(t.bad) + "</p>" : "";
  const body = "<h1>" + esc(t.title) + "</h1>" +
    "<p>" + esc(fill(t.lead, { host })) + "</p>" + err +
    "<form method=\"post\">" +
    "<fieldset><legend>" + esc(t.stars) + "</legend><div class=\"picks\">" + pickRow("rating", [1, 2, 3, 4, 5], parseRating(o.rating) || undefined) + "</div></fieldset>" +
    "<fieldset><legend>" + esc(t.nps) + "</legend><div class=\"picks\">" + pickRow("nps", [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10], o.nps != null && o.nps >= 0 ? parseNps(o.nps) : undefined) + "</div></fieldset>" +
    "<label for=\"csat-comment\" style=\"display:block;text-align:left;font-size:13px;color:" + TEXT.muted + ";margin:0 0 6px\">" + esc(t.comment) + "</label>" +
    "<textarea id=\"csat-comment\" name=\"comment\" maxlength=\"2000\">" + esc(o.comment || "") + "</textarea>" +
    "<label class=\"quote\"><input type=\"checkbox\" name=\"quote\" value=\"on\"" + (o.quoteOk ? " checked" : "") + ">" + esc(t.quote) + "</label>" +
    "<button type=\"submit\">" + esc(t.submit) + "</button></form>";
  return shell(code, t.title, body);
}

function mailBlock(lang, csatUrl) {
  const code = langOf(lang);
  const t = COPY[code];
  const url = String(csatUrl || "");
  if (!url) return { html: "", text: "" };
  const quick = [5, 4, 3, 2, 1].map((n) => {
    const href = url + (url.indexOf("?") === -1 ? "?" : "&") + "rating=" + n;
    return "<a href=\"" + esc(href) + "\" style=\"display:inline-block;margin:0 4px 8px;padding:10px 14px;border-radius:999px;border:1px solid " + fusion.LINE + ";text-decoration:none;color:" + TEXT.strong + ";font-weight:bold;\">" + n + "</a>";
  }).join("");
  const html = "<tr><td style=\"padding:8px 28px 20px;font-family:Arial,Helvetica,sans-serif;\">" +
    "<p style=\"margin:0 0 8px;font-size:15px;line-height:23px;color:" + TEXT.strong + ";font-weight:bold;\">" + esc(t.mailCta) + "</p>" +
    "<p style=\"margin:0 0 12px;font-size:13px;line-height:19px;color:" + TEXT.muted + ";\">" + esc(t.mailNote) + "</p>" +
    "<p style=\"margin:0 0 4px;font-size:12px;color:" + TEXT.muted + ";\">" + esc(t.stars) + "</p>" +
    "<p style=\"margin:0;\">" + quick + "</p>" +
    "<p style=\"margin:10px 0 0;font-size:13px;\"><a href=\"" + esc(url) + "\" style=\"color:" + TEXT.link + ";\">" + esc(t.title) + "</a></p>" +
    "</td></tr>";
  const text = t.mailCta + "\n" + t.mailNote + "\n" + t.title + ": " + url + "\n" +
    [5, 4, 3, 2, 1].map((n) => n + ": " + url + (url.indexOf("?") === -1 ? "?" : "&") + "rating=" + n).join("\n");
  return { html, text };
}

function remindMail(lang, host, csatUrl) {
  const code = langOf(lang);
  const t = COPY[code];
  const vars = { host: host || "your site" };
  const ask = mailBlock(code, csatUrl);
  return {
    lang: code,
    subject: fill(t.remindSubject, vars).slice(0, 140),
    text: [fill(t.remindLead, vars), "", ask.text].join("\n").slice(0, 8000),
    html: "<tr><td style=\"padding:22px 28px;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:23px;color:" + TEXT.body + ";\">" +
      esc(fill(t.remindLead, vars)) + "</td></tr>" + ask.html
  };
}

function thanksUrls(lang, host, reviewId) {
  const code = langOf(lang);
  return {
    bookUrl: booking.bookUrl("walkthrough", code, { host, report: reviewId, from: "csat" }),
    rerunUrl: "mailto:qa@carlosandmunoz.com?subject=" + encodeURIComponent("Free re-check: " + (host || reviewId || "URL Review"))
  };
}

/** Build the Firestore row + draft for a completed submit. */
function recordFrom(submit, meta) {
  const m = meta || {};
  const low = isLow(submit);
  const row = {
    reviewId: String(m.reviewId || ""),
    email: String(m.email || "").trim().toLowerCase(),
    host: String(m.host || "").trim(),
    lang: langOf(m.lang),
    rating: submit.rating,
    nps: submit.nps,
    comment: submit.comment,
    quoteOk: !!submit.quoteOk,
    via: String(m.via || "email-link"),
    low,
    createdAt: m.createdAt || new Date().toISOString()
  };
  if (low) row.draftReply = draftReply(submit, row.host);
  return row;
}

/** Reviews whose report mail went out 24–48h ago and still need a CSAT nudge. */
function remindWindow(now) {
  const at = now instanceof Date ? now.getTime() : Number(now) || Date.now();
  return { after: new Date(at - REMIND_BEFORE_MS).toISOString(), before: new Date(at - REMIND_AFTER_MS).toISOString() };
}

/** Report mail 7–8d ago, still no CSAT, after the first remind (#3557). */
function recurWindow(now) {
  const at = now instanceof Date ? now.getTime() : Number(now) || Date.now();
  return { after: new Date(at - RECUR_BEFORE_MS).toISOString(), before: new Date(at - RECUR_AFTER_MS).toISOString() };
}

function recurMail(lang, host, csatUrl) {
  const parts = remindMail(lang, host, csatUrl);
  const code = langOf(lang);
  const t = COPY[code];
  const vars = { host: host || "your site" };
  const lead = fill(t.recurLead || t.remindLead, vars);
  const subject = fill(t.recurSubject || t.remindSubject, vars).slice(0, 140);
  const ask = mailBlock(code, csatUrl);
  return Object.assign(parts, {
    subject,
    text: [lead, "", ask.text].join("\n").slice(0, 8000),
    html: "<tr><td style=\"padding:22px 28px;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:23px;color:" + fusion.TEXT.body + ";\">" +
      esc(lead) + "</td></tr>" + ask.html
  });
}

module.exports = {
  LANGS, COPY, LOW_STAR, REMIND_AFTER_MS, REMIND_BEFORE_MS, RECUR_AFTER_MS, RECUR_BEFORE_MS,
  langOf, esc, fill, parseRating, parseNps, cleanComment, readSubmit, isComplete, isLow,
  draftReply, csatPage, mailBlock, remindMail, recurMail, thanksUrls, recordFrom, remindWindow, recurWindow
};
