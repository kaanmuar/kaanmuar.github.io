/**
 * Mail to a client who asked us to fix what their report found (#3082): the confirmation when the request
 * arrives, the quote with its pay link once Carlos sets one on the desk, and the before/after of the free re-review (#3102).
 */
const customerMail = require("./url-review-customer-mail");
const fixOffers = require("./url-review-fix-offers");
const fusion = require("./url-review-fusion");
const findingsCopy = require("./url-review-findings-copy");

const { esc, fill, button, shell, bodyCell, bookLink, footerHtml, footerText, langOf, pageUrl, COPY } = customerMail;
const { TEXT } = fusion;

const FIX = {
  en: {
    afterSubject: "Your re-review of {host}: {fixed} of {total} fixed",
    afterTitle: "Before and after the fix",
    afterLead: "We reviewed {host} again after the fix. Here is each finding you asked about, before and after.",
    afterLeadSelf: "We reviewed {host} again after your changes. Here is each open finding, before and after.",
    score: "Score", stateFixed: "Fixed", stateOpen: "Still open", stateCheck: "Needs a person",
    newProblems: "New problems the run found that were not open before: {n}. They are in the new report.",
    newReport: "Open the new report",
    afterWhy: "You get this mail because a fix on your site was marked done and QA-lab URL Review checked it again for free.",
    confirmSubject: "We got your fix request for {host}",
    confirmTitle: "Your fix request is in",
    confirmLead: "You asked us to fix {n} on {host}. Carlos reads every request and replies within two working days with a price, a date and what access we need.",
    findings: "Findings", package: "Package", quote: "Quote by hand", deadline: "Deadline", budget: "Budget", price: "Price",
    packageLine: "{name}, US${usd}, about {days} working days",
    noPassword: "Do not send passwords by email. When we start, we agree on a safe way to get access.",
    quoteSubject: "Your quote to fix {host}: US${usd}",
    quoteTitle: "Your quote is ready",
    quoteLead: "Here is the price to fix {n} on {host}.",
    quoteNoPrice: "Here is the link to pay for the fix of {n} on {host}.",
    pay: "Pay and start the fix", reply: "Reply to this mail with any question about the quote.",
    report: "Open the report",
    findingOne: "1 finding", findingMany: "{n} findings",
    why: "You get this mail because you asked QA-lab URL Review to fix what your report found."
  },
  es: {
    afterSubject: "Tu nueva revisión de {host}: {fixed} de {total} arreglados",
    afterTitle: "Antes y después del arreglo",
    afterLead: "Revisamos {host} de nuevo después del arreglo. Este es cada hallazgo que pediste, antes y después.",
    afterLeadSelf: "Revisamos {host} de nuevo después de tus cambios. Este es cada hallazgo abierto, antes y después.",
    score: "Puntuación", stateFixed: "Arreglado", stateOpen: "Sigue abierto", stateCheck: "Requiere una persona",
    newProblems: "Problemas nuevos que la revisión encontró y antes no estaban abiertos: {n}. Están en el nuevo informe.",
    newReport: "Abrir el nuevo informe",
    afterWhy: "Recibes este correo porque un arreglo en tu sitio se marcó como terminado y QA-lab URL Review lo revisó de nuevo gratis.",
    confirmSubject: "Recibimos tu solicitud de arreglo para {host}",
    confirmTitle: "Tu solicitud de arreglo llegó",
    confirmLead: "Nos pediste arreglar {n} en {host}. Carlos lee cada solicitud y responde en dos días hábiles con un precio, una fecha y el acceso que necesitamos.",
    findings: "Hallazgos", package: "Paquete", quote: "Cotización a medida", deadline: "Fecha límite", budget: "Presupuesto", price: "Precio",
    packageLine: "{name}, US${usd}, unos {days} días hábiles",
    noPassword: "No envíes contraseñas por correo. Cuando empecemos, acordamos una forma segura de darnos acceso.",
    quoteSubject: "Tu cotización para arreglar {host}: US${usd}",
    quoteTitle: "Tu cotización está lista",
    quoteLead: "Este es el precio para arreglar {n} en {host}.",
    quoteNoPrice: "Este es el enlace para pagar el arreglo de {n} en {host}.",
    pay: "Pagar y empezar el arreglo", reply: "Responde a este correo con cualquier pregunta sobre la cotización.",
    report: "Abrir el informe",
    findingOne: "1 hallazgo", findingMany: "{n} hallazgos",
    why: "Recibes este correo porque pediste a QA-lab URL Review arreglar lo que encontró tu informe."
  },
  pt: {
    afterSubject: "Sua nova revisão de {host}: {fixed} de {total} corrigidos",
    afterTitle: "Antes e depois da correção",
    afterLead: "Revisamos {host} de novo depois da correção. Este é cada achado que você pediu, antes e depois.",
    afterLeadSelf: "Revisamos {host} de novo depois das suas mudanças. Este é cada achado aberto, antes e depois.",
    score: "Pontuação", stateFixed: "Corrigido", stateOpen: "Ainda aberto", stateCheck: "Precisa de uma pessoa",
    newProblems: "Problemas novos que a revisão encontrou e antes não estavam abertos: {n}. Eles estão no novo relatório.",
    newReport: "Abrir o novo relatório",
    afterWhy: "Você recebe este e-mail porque uma correção no seu site foi marcada como concluída e o QA-lab URL Review a revisou de novo de graça.",
    confirmSubject: "Recebemos seu pedido de correção para {host}",
    confirmTitle: "Seu pedido de correção chegou",
    confirmLead: "Você pediu para corrigirmos {n} em {host}. Carlos lê cada pedido e responde em dois dias úteis com um preço, uma data e o acesso de que precisamos.",
    findings: "Achados", package: "Pacote", quote: "Orçamento sob medida", deadline: "Prazo", budget: "Orçamento disponível", price: "Preço",
    packageLine: "{name}, US${usd}, cerca de {days} dias úteis",
    noPassword: "Não envie senhas por e-mail. Quando começarmos, combinamos uma forma segura de acesso.",
    quoteSubject: "Seu orçamento para corrigir {host}: US${usd}",
    quoteTitle: "Seu orçamento está pronto",
    quoteLead: "Este é o preço para corrigir {n} em {host}.",
    quoteNoPrice: "Este é o link para pagar a correção de {n} em {host}.",
    pay: "Pagar e começar a correção", reply: "Responda a este e-mail com qualquer dúvida sobre o orçamento.",
    report: "Abrir o relatório",
    findingOne: "1 achado", findingMany: "{n} achados",
    why: "Você recebe este e-mail porque pediu ao QA-lab URL Review para corrigir o que seu relatório encontrou."
  },
  de: {
    afterSubject: "Ihre erneute Prüfung von {host}: {fixed} von {total} behoben",
    afterTitle: "Vorher und nachher",
    afterLead: "Wir haben {host} nach der Korrektur erneut geprüft. Hier ist jeder angefragte Befund, vorher und nachher.",
    afterLeadSelf: "Wir haben {host} nach Ihren Änderungen erneut geprüft. Hier ist jeder offene Befund, vorher und nachher.",
    score: "Bewertung", stateFixed: "Behoben", stateOpen: "Noch offen", stateCheck: "Braucht eine Person",
    newProblems: "Neue Probleme, die vorher nicht offen waren: {n}. Sie stehen im neuen Bericht.",
    newReport: "Neuen Bericht öffnen",
    afterWhy: "Sie erhalten diese Mail, weil eine Korrektur auf Ihrer Website als erledigt markiert wurde und QA-lab URL Review sie kostenlos erneut geprüft hat.",
    confirmSubject: "Wir haben Ihre Korrekturanfrage für {host} erhalten",
    confirmTitle: "Ihre Korrekturanfrage ist da",
    confirmLead: "Sie haben uns gebeten, {n} auf {host} zu beheben. Carlos liest jede Anfrage und antwortet innerhalb von zwei Werktagen mit Preis, Termin und dem Zugang, den wir brauchen.",
    findings: "Befunde", package: "Paket", quote: "Individuelles Angebot", deadline: "Frist", budget: "Budget", price: "Preis",
    packageLine: "{name}, US${usd}, etwa {days} Werktage",
    noPassword: "Senden Sie keine Passwörter per E-Mail. Zum Start vereinbaren wir einen sicheren Weg für den Zugang.",
    quoteSubject: "Ihr Angebot für die Korrektur von {host}: US${usd}",
    quoteTitle: "Ihr Angebot ist fertig",
    quoteLead: "Das ist der Preis, um {n} auf {host} zu beheben.",
    quoteNoPrice: "Das ist der Link, um die Korrektur von {n} auf {host} zu bezahlen.",
    pay: "Bezahlen und Korrektur starten", reply: "Antworten Sie auf diese Mail, wenn Sie Fragen zum Angebot haben.",
    report: "Bericht öffnen",
    findingOne: "1 Befund", findingMany: "{n} Befunde",
    why: "Sie erhalten diese Mail, weil Sie QA-lab URL Review gebeten haben, die Befunde Ihres Berichts zu beheben."
  },
  fr: {
    afterSubject: "Votre nouvelle revue de {host} : {fixed} sur {total} corrigés",
    afterTitle: "Avant et après la correction",
    afterLead: "Nous avons revu {host} après la correction. Voici chaque constat demandé, avant et après.",
    afterLeadSelf: "Nous avons revu {host} après vos changements. Voici chaque constat ouvert, avant et après.",
    score: "Score", stateFixed: "Corrigé", stateOpen: "Toujours ouvert", stateCheck: "À vérifier par une personne",
    newProblems: "Nouveaux problèmes trouvés qui n'étaient pas ouverts avant : {n}. Ils sont dans le nouveau rapport.",
    newReport: "Ouvrir le nouveau rapport",
    afterWhy: "Vous recevez cet e-mail parce qu'une correction sur votre site a été marquée terminée et que QA-lab URL Review l'a revue gratuitement.",
    confirmSubject: "Nous avons reçu votre demande de correction pour {host}",
    confirmTitle: "Votre demande de correction est arrivée",
    confirmLead: "Vous nous avez demandé de corriger {n} sur {host}. Carlos lit chaque demande et répond sous deux jours ouvrés avec un prix, une date et l'accès dont nous avons besoin.",
    findings: "Constats", package: "Forfait", quote: "Devis sur mesure", deadline: "Échéance", budget: "Budget", price: "Prix",
    packageLine: "{name}, US${usd}, environ {days} jours ouvrés",
    noPassword: "N'envoyez pas de mots de passe par e-mail. Au démarrage, nous convenons d'un moyen sûr pour l'accès.",
    quoteSubject: "Votre devis pour corriger {host} : US${usd}",
    quoteTitle: "Votre devis est prêt",
    quoteLead: "Voici le prix pour corriger {n} sur {host}.",
    quoteNoPrice: "Voici le lien pour payer la correction de {n} sur {host}.",
    pay: "Payer et lancer la correction", reply: "Répondez à cet e-mail pour toute question sur le devis.",
    report: "Ouvrir le rapport",
    findingOne: "1 constat", findingMany: "{n} constats",
    why: "Vous recevez cet e-mail parce que vous avez demandé à QA-lab URL Review de corriger ce que votre rapport a trouvé."
  },
  it: {
    afterSubject: "La nuova revisione di {host}: {fixed} su {total} corretti",
    afterTitle: "Prima e dopo la correzione",
    afterLead: "Abbiamo rivisto {host} dopo la correzione. Ecco ogni risultato che hai chiesto, prima e dopo.",
    afterLeadSelf: "Abbiamo rivisto {host} dopo le tue modifiche. Ecco ogni risultato aperto, prima e dopo.",
    score: "Punteggio", stateFixed: "Corretto", stateOpen: "Ancora aperto", stateCheck: "Serve una persona",
    newProblems: "Nuovi problemi trovati che prima non erano aperti: {n}. Sono nel nuovo report.",
    newReport: "Apri il nuovo report",
    afterWhy: "Ricevi questa email perché una correzione sul tuo sito è stata segnata come completata e QA-lab URL Review l'ha rivista gratis.",
    confirmSubject: "Abbiamo ricevuto la tua richiesta di correzione per {host}",
    confirmTitle: "La tua richiesta di correzione è arrivata",
    confirmLead: "Ci hai chiesto di correggere {n} su {host}. Carlos legge ogni richiesta e risponde entro due giorni lavorativi con un prezzo, una data e l'accesso che ci serve.",
    findings: "Risultati", package: "Pacchetto", quote: "Preventivo su misura", deadline: "Scadenza", budget: "Budget", price: "Prezzo",
    packageLine: "{name}, US${usd}, circa {days} giorni lavorativi",
    noPassword: "Non inviare password via email. Quando iniziamo, concordiamo un modo sicuro per l'accesso.",
    quoteSubject: "Il tuo preventivo per correggere {host}: US${usd}",
    quoteTitle: "Il tuo preventivo è pronto",
    quoteLead: "Ecco il prezzo per correggere {n} su {host}.",
    quoteNoPrice: "Ecco il link per pagare la correzione di {n} su {host}.",
    pay: "Paga e avvia la correzione", reply: "Rispondi a questa email per qualsiasi domanda sul preventivo.",
    report: "Apri il report",
    findingOne: "1 risultato", findingMany: "{n} risultati",
    why: "Ricevi questa email perché hai chiesto a QA-lab URL Review di correggere ciò che ha trovato il tuo report."
  }
};

function usd(value) {
  const n = Math.round((Number(value) || 0) * 100) / 100;
  return n % 1 ? n.toFixed(2) : String(n);
}

function countOf(t, n) {
  return n === 1 ? t.findingOne : fill(t.findingMany, { n });
}

function table(rows) {
  return "<table role=\"presentation\" width=\"100%\" cellpadding=\"0\" cellspacing=\"0\" style=\"margin:0 0 18px;border-collapse:collapse;\">" +
    rows.map((row) => "<tr><td style=\"padding:8px 12px 8px 0;border-bottom:1px solid " + fusion.LINE + ";font-size:14px;line-height:20px;color:" + TEXT.muted + ";vertical-align:top;white-space:nowrap;\">" + esc(row[0]) +
      "</td><td style=\"padding:8px 0;border-bottom:1px solid " + fusion.LINE + ";font-size:14px;line-height:20px;color:" + TEXT.strong + ";\">" + esc(row[1]) + "</td></tr>").join("") +
    "</table>";
}

function paragraph(text, style) {
  return "<p style=\"margin:0 0 16px;font-size:" + (style || "16px;line-height:25px;color:" + TEXT.body) + ";\">" + esc(text) + "</p>";
}

function mail(code, t, parts) {
  const reportLink = parts.record.reportId ? pageUrl(code, { report: parts.record.reportId, utm_campaign: parts.campaign }) : pageUrl(code, { utm_campaign: parts.campaign });
  const call = bookLink(code, parts.record.host, parts.record.reportId, parts.campaign);
  const inner = fusion.band("QA-lab URL Review", esc(parts.title)) +
    bodyCell("22px 28px 22px", true, "font-family:Arial,Helvetica,sans-serif;") +
    paragraph(parts.lead) + table(parts.rows) +
    parts.notes.map((note) => paragraph(note, "13px;line-height:19px;color:" + TEXT.muted)).join("") +
    (parts.action ? button(parts.action[1], parts.action[0], true) : "") +
    button(reportLink, t.report, !parts.action) + button(call, COPY[code].book, false) +
    "</td></tr>";
  return {
    lang: code,
    subject: parts.subject,
    text: [parts.title, "", parts.lead, "", parts.rows.map((row) => row[0] + ": " + row[1]).join("\n"), "", parts.notes.join("\n"), "",
      parts.action ? parts.action[0] + ": " + parts.action[1] : "", t.report + ": " + reportLink, COPY[code].book + ": " + call, "", footerText(COPY[code], parts.why || t.why)].filter((part, i, all) => part || all[i - 1]).join("\n"),
    html: shell(code, parts.lead, inner, footerHtml(COPY[code], parts.why || t.why))
  };
}

function findingRows(code, record) {
  const copy = findingsCopy.forLang(code);
  return (record.findings || []).map((f) => [f.id, copy.line(f.titleMsg, f.title)]);
}

/** The mail that tells the client their request arrived. */
function confirmMail(record) {
  const code = langOf(record.lang);
  const t = FIX[code];
  const pack = fixOffers.packageById(record.package);
  const vars = { host: record.host || "", n: countOf(t, (record.findings || []).length) };
  const rows = findingRows(code, record).concat([
    [t.package, pack ? fill(t.packageLine, { name: pack.name[code], usd: pack.usd, days: pack.days }) : t.quote],
    record.deadline ? [t.deadline, record.deadline] : null,
    record.budget ? [t.budget, record.budget] : null
  ].filter(Boolean));
  return mail(code, t, { record, campaign: "fix-request", subject: fill(t.confirmSubject, vars), title: t.confirmTitle, lead: fill(t.confirmLead, vars), rows, notes: [t.noPassword] });
}

/** The quote Carlos set on the desk, with its pay link when he added one. */
function quoteMail(record) {
  const code = langOf(record.lang);
  const t = FIX[code];
  const price = fixOffers.priceOf(record);
  const vars = { host: record.host || "", n: countOf(t, (record.findings || []).length), usd: usd(price) };
  const rows = findingRows(code, record).concat(price ? [[t.price, "US$" + usd(price)]] : []);
  return mail(code, t, {
    record,
    campaign: "fix-quote",
    subject: price ? fill(t.quoteSubject, vars) : fill(t.confirmSubject, vars),
    title: t.quoteTitle,
    lead: fill(price ? t.quoteLead : t.quoteNoPrice, vars),
    rows,
    notes: [t.reply, t.noPassword],
    action: record.payUrl ? [t.pay, record.payUrl] : null
  });
}

function grade(score, letter) {
  return letter ? score + " (" + letter + ")" : String(score);
}

/** The before/after of the free re-review: the score, each finding's state now, and how many new problems the run found. */
function afterMail(record, reportId, result) {
  const code = langOf(record.lang);
  const t = FIX[code];
  const copy = findingsCopy.forLang(code);
  const state = { fixed: t.stateFixed, open: t.stateOpen, check: t.stateCheck };
  const vars = { host: record.host || "", fixed: result.fixed, total: result.items.length, n: result.newCount };
  const rows = [[t.score, grade(result.scoreBefore, result.gradeBefore) + " → " + grade(result.scoreAfter, result.gradeAfter)]]
    .concat(result.items.map((item) => [state[item.state] || item.state, item.id + " · " + copy.line(item.titleMsg, item.title)]));
  return mail(code, t, {
    record,
    campaign: "fix-rereview",
    subject: fill(t.afterSubject, vars),
    title: t.afterTitle,
    lead: fill(record.kind === "self" ? t.afterLeadSelf : t.afterLead, vars),
    rows,
    notes: result.newCount ? [fill(t.newProblems, vars)] : [],
    action: [t.newReport, pageUrl(code, { report: reportId, utm_campaign: "fix-rereview" })],
    why: t.afterWhy
  });
}

module.exports = { FIX, confirmMail, quoteMail, afterMail };
