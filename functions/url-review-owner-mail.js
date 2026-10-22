/* The owner notice email, the claimed-report email, and the pages its links open, in six languages.
   Rules for who gets one live in url-review-owner-notice.js. Nothing here names the asker. */

const base = require("./url-review-customer-mail");

const { SITE, AREAS, esc, fill, button, shell, scoreColor } = base;
const DEEPER = "qa@carlosandmunoz.com";

const COPY = {
  en: {
    subject: "{host} has a public review on QA-lab Live Reports",
    preheader: "The scores are public. You can claim the full report for free, or take the page down.",
    title: "A public review of {host} is on Live Reports",
    lead: "{host} was reviewed with QA-lab URL Review on {date}, and the scores were published on Live Reports. We never say who asked for a review. This is what the public page shows:",
    overall: "Overall",
    critical: "The review found a critical security issue. The full report says where it is and how to fix it.",
    claim: "Claim the full report",
    claimNote: "The full report lists every finding with its fix. It is sent free to an address at {domain}, which shows the mailbox is yours.",
    unlist: "Remove {host} from Live Reports",
    unlistNote: "It leaves the public page with the next daily update, and later reviews of {host} are not published either.",
    view: "See the public page",
    source: { "security.txt": "the site's security.txt, because the review found a critical security issue", schema: "the site's structured data", page: "{url}" },
    why: "You get this single notice because {email} is published on {source}. We send at most one per domain every six months, and we never fill in contact forms.",
    stop: "No more notices to this address or domain",
    areas: { SEO: "SEO", GEO: "GEO", Analytics: "Analytics", Security: "Security", Accessibility: "Accessibility", Performance: "Performance" },
    claimSubject: "The full report of {host}",
    claimTitle: "The full report of {host}",
    claimLead: "This address at {domain} asked for the full report. It opens here, with every finding and its fix:",
    claimOpen: "Open the full report",
    claimKeep: "Anyone with this link can open the report, so forward it only to your team.",
    claimWhy: "You get this because the full report of {host} was claimed with this address at carlosandmunoz.com.",
    page: {
      claimTitle: "Claim the full report of {host}",
      claimLead: "Enter an address at {domain}. The full report is sent there, free.",
      claimLabel: "Your email at {domain}",
      claimButton: "Send me the report",
      claimWrong: "Use an address that ends in @{domain}.",
      claimed: "Sent. Check {email}.",
      claimedLead: "The link in that email opens the full report.",
      claimLimit: "This link has already sent the report three times. Write to {deeper} if you need it again.",
      unlistTitle: "Remove {host} from Live Reports?",
      unlistLead: "It leaves the public page with the next daily update, and later reviews of {host} are not published either.",
      unlistButton: "Remove it",
      unlisted: "Done. {host} leaves Live Reports with the next daily update.",
      stopTitle: "Stop notices to {email}?",
      stopLead: "No more notices go to this address or to any address at {domain}.",
      stopButton: "Stop them",
      stopped: "Done. No more notices go to {email} or {domain}.",
      gone: "This link no longer works."
    }
  },
  es: {
    subject: "{host} tiene una revisión pública en QA-lab Live Reports",
    preheader: "Los puntajes son públicos. Puedes pedir el informe completo gratis o retirar la página.",
    title: "Hay una revisión pública de {host} en Live Reports",
    lead: "{host} se revisó con QA-lab URL Review el {date} y los puntajes se publicaron en Live Reports. Nunca decimos quién pidió una revisión. Esto es lo que muestra la página pública:",
    overall: "General",
    critical: "La revisión encontró un problema de seguridad crítico. El informe completo dice dónde está y cómo corregirlo.",
    claim: "Pedir el informe completo",
    claimNote: "El informe completo trae cada hallazgo con su corrección. Se envía gratis a una dirección de {domain}, lo que demuestra que el buzón es tuyo.",
    unlist: "Retirar {host} de Live Reports",
    unlistNote: "Sale de la página pública con la siguiente actualización diaria, y las revisiones futuras de {host} tampoco se publican.",
    view: "Ver la página pública",
    source: { "security.txt": "el security.txt del sitio, porque la revisión encontró un problema de seguridad crítico", schema: "los datos estructurados del sitio", page: "{url}" },
    why: "Recibes este único aviso porque {email} está publicado en {source}. Enviamos como máximo uno por dominio cada seis meses y nunca llenamos formularios de contacto.",
    stop: "No más avisos a esta dirección ni a este dominio",
    areas: { SEO: "SEO", GEO: "GEO", Analytics: "Analítica", Security: "Seguridad", Accessibility: "Accesibilidad", Performance: "Rendimiento" },
    claimSubject: "El informe completo de {host}",
    claimTitle: "El informe completo de {host}",
    claimLead: "Esta dirección de {domain} pidió el informe completo. Se abre aquí, con cada hallazgo y su corrección:",
    claimOpen: "Abrir el informe completo",
    claimKeep: "Cualquiera con este enlace puede abrir el informe, así que reenvíalo solo a tu equipo.",
    claimWhy: "Recibes esto porque el informe completo de {host} se pidió con esta dirección en carlosandmunoz.com.",
    page: {
      claimTitle: "Pedir el informe completo de {host}",
      claimLead: "Escribe una dirección de {domain}. El informe completo se envía ahí, gratis.",
      claimLabel: "Tu correo de {domain}",
      claimButton: "Enviarme el informe",
      claimWrong: "Usa una dirección que termine en @{domain}.",
      claimed: "Enviado. Revisa {email}.",
      claimedLead: "El enlace de ese correo abre el informe completo.",
      claimLimit: "Este enlace ya envió el informe tres veces. Escribe a {deeper} si lo necesitas de nuevo.",
      unlistTitle: "¿Retirar {host} de Live Reports?",
      unlistLead: "Sale de la página pública con la siguiente actualización diaria, y las revisiones futuras de {host} tampoco se publican.",
      unlistButton: "Retirarlo",
      unlisted: "Listo. {host} sale de Live Reports con la siguiente actualización diaria.",
      stopTitle: "¿Dejar de enviar avisos a {email}?",
      stopLead: "No llegarán más avisos a esta dirección ni a ninguna dirección de {domain}.",
      stopButton: "Dejar de enviarlos",
      stopped: "Listo. No llegarán más avisos a {email} ni a {domain}.",
      gone: "Este enlace ya no funciona."
    }
  },
  pt: {
    subject: "{host} tem uma revisão pública no QA-lab Live Reports",
    preheader: "As notas são públicas. Você pode pedir o relatório completo de graça ou retirar a página.",
    title: "Há uma revisão pública de {host} no Live Reports",
    lead: "{host} foi revisado com o QA-lab URL Review em {date}, e as notas foram publicadas no Live Reports. Nunca dizemos quem pediu uma revisão. Isto é o que a página pública mostra:",
    overall: "Geral",
    critical: "A revisão encontrou um problema de segurança crítico. O relatório completo diz onde ele está e como corrigi-lo.",
    claim: "Pedir o relatório completo",
    claimNote: "O relatório completo traz cada achado com a correção. Ele é enviado de graça para um endereço de {domain}, o que mostra que a caixa de e-mail é sua.",
    unlist: "Retirar {host} do Live Reports",
    unlistNote: "Ele sai da página pública na próxima atualização diária, e as próximas revisões de {host} também não são publicadas.",
    view: "Ver a página pública",
    source: { "security.txt": "o security.txt do site, porque a revisão encontrou um problema de segurança crítico", schema: "os dados estruturados do site", page: "{url}" },
    why: "Você recebe este único aviso porque {email} está publicado em {source}. Enviamos no máximo um por domínio a cada seis meses e nunca preenchemos formulários de contato.",
    stop: "Nenhum aviso mais para este endereço ou domínio",
    areas: { SEO: "SEO", GEO: "GEO", Analytics: "Analytics", Security: "Segurança", Accessibility: "Acessibilidade", Performance: "Desempenho" },
    claimSubject: "O relatório completo de {host}",
    claimTitle: "O relatório completo de {host}",
    claimLead: "Este endereço de {domain} pediu o relatório completo. Ele abre aqui, com cada achado e a correção:",
    claimOpen: "Abrir o relatório completo",
    claimKeep: "Qualquer pessoa com este link pode abrir o relatório, então encaminhe só para a sua equipe.",
    claimWhy: "Você recebeu isto porque o relatório completo de {host} foi pedido com este endereço em carlosandmunoz.com.",
    page: {
      claimTitle: "Pedir o relatório completo de {host}",
      claimLead: "Digite um endereço de {domain}. O relatório completo é enviado para lá, de graça.",
      claimLabel: "Seu e-mail de {domain}",
      claimButton: "Enviar o relatório",
      claimWrong: "Use um endereço que termine em @{domain}.",
      claimed: "Enviado. Confira {email}.",
      claimedLead: "O link nesse e-mail abre o relatório completo.",
      claimLimit: "Este link já enviou o relatório três vezes. Escreva para {deeper} se precisar de novo.",
      unlistTitle: "Retirar {host} do Live Reports?",
      unlistLead: "Ele sai da página pública na próxima atualização diária, e as próximas revisões de {host} também não são publicadas.",
      unlistButton: "Retirar",
      unlisted: "Pronto. {host} sai do Live Reports na próxima atualização diária.",
      stopTitle: "Parar os avisos para {email}?",
      stopLead: "Nenhum aviso mais vai para este endereço nem para qualquer endereço de {domain}.",
      stopButton: "Parar os avisos",
      stopped: "Pronto. Nenhum aviso mais vai para {email} nem para {domain}.",
      gone: "Este link não funciona mais."
    }
  },
  de: {
    subject: "Für {host} gibt es eine öffentliche Prüfung auf QA-lab Live Reports",
    preheader: "Die Werte sind öffentlich. Du kannst den vollständigen Bericht kostenlos anfordern oder die Seite entfernen lassen.",
    title: "Eine öffentliche Prüfung von {host} steht auf Live Reports",
    lead: "{host} wurde am {date} mit QA-lab URL Review geprüft, und die Werte wurden auf Live Reports veröffentlicht. Wer eine Prüfung angefordert hat, sagen wir nie. Das zeigt die öffentliche Seite:",
    overall: "Gesamt",
    critical: "Die Prüfung hat ein kritisches Sicherheitsproblem gefunden. Der vollständige Bericht sagt, wo es liegt und wie es sich beheben lässt.",
    claim: "Vollständigen Bericht anfordern",
    claimNote: "Der vollständige Bericht nennt jeden Befund mit seiner Lösung. Er geht kostenlos an eine Adresse bei {domain}; das zeigt, dass das Postfach dir gehört.",
    unlist: "{host} von Live Reports entfernen",
    unlistNote: "Die Seite verschwindet mit dem nächsten täglichen Update, und spätere Prüfungen von {host} werden auch nicht veröffentlicht.",
    view: "Öffentliche Seite ansehen",
    source: { "security.txt": "der security.txt der Website, weil die Prüfung ein kritisches Sicherheitsproblem gefunden hat", schema: "den strukturierten Daten der Website", page: "{url}" },
    why: "Du bekommst diesen einen Hinweis, weil {email} auf {source} veröffentlicht ist. Wir senden höchstens einen pro Domain alle sechs Monate und füllen nie Kontaktformulare aus.",
    stop: "Keine Hinweise mehr an diese Adresse oder Domain",
    areas: { SEO: "SEO", GEO: "GEO", Analytics: "Analytics", Security: "Sicherheit", Accessibility: "Barrierefreiheit", Performance: "Leistung" },
    claimSubject: "Der vollständige Bericht zu {host}",
    claimTitle: "Der vollständige Bericht zu {host}",
    claimLead: "Diese Adresse bei {domain} hat den vollständigen Bericht angefordert. Er öffnet sich hier, mit jedem Befund und seiner Lösung:",
    claimOpen: "Vollständigen Bericht öffnen",
    claimKeep: "Jeder mit diesem Link kann den Bericht öffnen. Leite ihn nur an dein Team weiter.",
    claimWhy: "Du bekommst diese E-Mail, weil der vollständige Bericht zu {host} mit dieser Adresse auf carlosandmunoz.com angefordert wurde.",
    page: {
      claimTitle: "Vollständigen Bericht zu {host} anfordern",
      claimLead: "Gib eine Adresse bei {domain} ein. Der vollständige Bericht wird kostenlos dorthin gesendet.",
      claimLabel: "Deine E-Mail bei {domain}",
      claimButton: "Bericht senden",
      claimWrong: "Nutze eine Adresse, die auf @{domain} endet.",
      claimed: "Gesendet. Sieh in {email} nach.",
      claimedLead: "Der Link in dieser E-Mail öffnet den vollständigen Bericht.",
      claimLimit: "Dieser Link hat den Bericht schon dreimal gesendet. Schreib an {deeper}, wenn du ihn noch einmal brauchst.",
      unlistTitle: "{host} von Live Reports entfernen?",
      unlistLead: "Die Seite verschwindet mit dem nächsten täglichen Update, und spätere Prüfungen von {host} werden auch nicht veröffentlicht.",
      unlistButton: "Entfernen",
      unlisted: "Erledigt. {host} verschwindet mit dem nächsten täglichen Update von Live Reports.",
      stopTitle: "Keine Hinweise mehr an {email}?",
      stopLead: "Es gehen keine Hinweise mehr an diese Adresse oder an eine andere Adresse bei {domain}.",
      stopButton: "Hinweise stoppen",
      stopped: "Erledigt. Es gehen keine Hinweise mehr an {email} oder {domain}.",
      gone: "Dieser Link funktioniert nicht mehr."
    }
  },
  fr: {
    subject: "{host} a une revue publique sur QA-lab Live Reports",
    preheader: "Les scores sont publics. Vous pouvez demander le rapport complet gratuitement ou retirer la page.",
    title: "Une revue publique de {host} est sur Live Reports",
    lead: "{host} a été revu avec QA-lab URL Review le {date}, et les scores ont été publiés sur Live Reports. Nous ne disons jamais qui a demandé une revue. Voici ce que montre la page publique :",
    overall: "Global",
    critical: "La revue a trouvé un problème de sécurité critique. Le rapport complet indique où il se trouve et comment le corriger.",
    claim: "Demander le rapport complet",
    claimNote: "Le rapport complet liste chaque constat avec sa correction. Il est envoyé gratuitement à une adresse en {domain}, ce qui montre que la boîte vous appartient.",
    unlist: "Retirer {host} de Live Reports",
    unlistNote: "La page publique disparaît à la prochaine mise à jour quotidienne, et les revues suivantes de {host} ne sont pas publiées non plus.",
    view: "Voir la page publique",
    source: { "security.txt": "le security.txt du site, car la revue a trouvé un problème de sécurité critique", schema: "les données structurées du site", page: "{url}" },
    why: "Vous recevez cet avis unique parce que {email} est publié sur {source}. Nous en envoyons au plus un par domaine tous les six mois, et nous ne remplissons jamais de formulaire de contact.",
    stop: "Plus d'avis à cette adresse ni à ce domaine",
    areas: { SEO: "SEO", GEO: "GEO", Analytics: "Analytics", Security: "Sécurité", Accessibility: "Accessibilité", Performance: "Performance" },
    claimSubject: "Le rapport complet de {host}",
    claimTitle: "Le rapport complet de {host}",
    claimLead: "Cette adresse en {domain} a demandé le rapport complet. Il s'ouvre ici, avec chaque constat et sa correction :",
    claimOpen: "Ouvrir le rapport complet",
    claimKeep: "Toute personne ayant ce lien peut ouvrir le rapport : transférez-le seulement à votre équipe.",
    claimWhy: "Vous recevez ce message parce que le rapport complet de {host} a été demandé avec cette adresse sur carlosandmunoz.com.",
    page: {
      claimTitle: "Demander le rapport complet de {host}",
      claimLead: "Saisissez une adresse en {domain}. Le rapport complet y est envoyé, gratuitement.",
      claimLabel: "Votre e-mail en {domain}",
      claimButton: "M'envoyer le rapport",
      claimWrong: "Utilisez une adresse qui se termine par @{domain}.",
      claimed: "Envoyé. Consultez {email}.",
      claimedLead: "Le lien de cet e-mail ouvre le rapport complet.",
      claimLimit: "Ce lien a déjà envoyé le rapport trois fois. Écrivez à {deeper} si vous en avez encore besoin.",
      unlistTitle: "Retirer {host} de Live Reports ?",
      unlistLead: "La page publique disparaît à la prochaine mise à jour quotidienne, et les revues suivantes de {host} ne sont pas publiées non plus.",
      unlistButton: "Le retirer",
      unlisted: "C'est fait. {host} quitte Live Reports à la prochaine mise à jour quotidienne.",
      stopTitle: "Arrêter les avis à {email} ?",
      stopLead: "Plus aucun avis n'ira à cette adresse ni à aucune adresse en {domain}.",
      stopButton: "Les arrêter",
      stopped: "C'est fait. Plus aucun avis n'ira à {email} ni à {domain}.",
      gone: "Ce lien ne fonctionne plus."
    }
  },
  it: {
    subject: "{host} ha una revisione pubblica su QA-lab Live Reports",
    preheader: "I punteggi sono pubblici. Puoi chiedere il report completo gratis o togliere la pagina.",
    title: "Una revisione pubblica di {host} è su Live Reports",
    lead: "{host} è stato revisionato con QA-lab URL Review il {date}, e i punteggi sono stati pubblicati su Live Reports. Non diciamo mai chi ha chiesto una revisione. Ecco cosa mostra la pagina pubblica:",
    overall: "Complessivo",
    critical: "La revisione ha trovato un problema di sicurezza critico. Il report completo dice dove si trova e come correggerlo.",
    claim: "Chiedi il report completo",
    claimNote: "Il report completo elenca ogni rilievo con la sua correzione. Viene inviato gratis a un indirizzo di {domain}, e questo dimostra che la casella è tua.",
    unlist: "Togli {host} da Live Reports",
    unlistNote: "Esce dalla pagina pubblica con il prossimo aggiornamento giornaliero, e le revisioni successive di {host} non vengono pubblicate.",
    view: "Vedi la pagina pubblica",
    source: { "security.txt": "il security.txt del sito, perché la revisione ha trovato un problema di sicurezza critico", schema: "i dati strutturati del sito", page: "{url}" },
    why: "Ricevi questo unico avviso perché {email} è pubblicato su {source}. Ne inviamo al massimo uno per dominio ogni sei mesi e non compiliamo mai moduli di contatto.",
    stop: "Nessun altro avviso a questo indirizzo o dominio",
    areas: { SEO: "SEO", GEO: "GEO", Analytics: "Analytics", Security: "Sicurezza", Accessibility: "Accessibilità", Performance: "Prestazioni" },
    claimSubject: "Il report completo di {host}",
    claimTitle: "Il report completo di {host}",
    claimLead: "Questo indirizzo di {domain} ha chiesto il report completo. Si apre qui, con ogni rilievo e la sua correzione:",
    claimOpen: "Apri il report completo",
    claimKeep: "Chiunque abbia questo link può aprire il report, quindi inoltralo solo al tuo team.",
    claimWhy: "Ricevi questa email perché il report completo di {host} è stato chiesto con questo indirizzo su carlosandmunoz.com.",
    page: {
      claimTitle: "Chiedi il report completo di {host}",
      claimLead: "Scrivi un indirizzo di {domain}. Il report completo viene inviato lì, gratis.",
      claimLabel: "La tua email di {domain}",
      claimButton: "Inviami il report",
      claimWrong: "Usa un indirizzo che finisce con @{domain}.",
      claimed: "Inviato. Controlla {email}.",
      claimedLead: "Il link in quella email apre il report completo.",
      claimLimit: "Questo link ha già inviato il report tre volte. Scrivi a {deeper} se ti serve di nuovo.",
      unlistTitle: "Togliere {host} da Live Reports?",
      unlistLead: "Esce dalla pagina pubblica con il prossimo aggiornamento giornaliero, e le revisioni successive di {host} non vengono pubblicate.",
      unlistButton: "Toglilo",
      unlisted: "Fatto. {host} esce da Live Reports con il prossimo aggiornamento giornaliero.",
      stopTitle: "Fermare gli avvisi a {email}?",
      stopLead: "Non arriveranno più avvisi a questo indirizzo né a nessun indirizzo di {domain}.",
      stopButton: "Fermali",
      stopped: "Fatto. Non arriveranno più avvisi a {email} né a {domain}.",
      gone: "Questo link non funziona più."
    }
  }
};

function copyFor(lang) {
  return COPY[base.langOf(lang)];
}

function header(title) {
  return "<tr><td bgcolor=\"#0f172a\" style=\"background:#0f172a;background-image:linear-gradient(135deg,#0f172a 0%,#0e7490 100%);border-radius:16px 16px 0 0;padding:30px 28px 24px;font-family:Arial,Helvetica,sans-serif;\">" +
    "<p style=\"margin:0 0 8px;font-size:12px;letter-spacing:0.12em;text-transform:uppercase;color:#7dd3fc;\">QA-lab URL Review</p>" +
    "<p style=\"margin:0;font-size:24px;line-height:30px;color:#ffffff;font-weight:bold;\">" + esc(title) + "</p>" +
    "</td></tr>";
}

function para(text, style) {
  return "<p style=\"margin:0 0 14px;font-family:Arial,Helvetica,sans-serif;" + (style || "font-size:15px;line-height:23px;color:#334155;") + "\">" + esc(text) + "</p>";
}

function scoreRows(t, card) {
  const rows = [[t.overall, Number(card.overall) || 0, true]].concat(AREAS.filter((area) => card.areas && card.areas[area] != null).map((area) => [t.areas[area] || area, Number(card.areas[area]) || 0, false]));
  return "<table role=\"presentation\" width=\"100%\" cellpadding=\"0\" cellspacing=\"0\" style=\"margin:0 0 18px;\">" + rows.map(([label, value, strong]) =>
    "<tr><td style=\"padding:5px 0;border-top:1px solid #eef2f6;font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#334155;" + (strong ? "font-weight:bold;" : "") + "\">" + esc(label) + "</td>" +
    "<td style=\"padding:5px 0;border-top:1px solid #eef2f6;font-family:Arial,Helvetica,sans-serif;font-size:14px;font-weight:bold;text-align:right;color:" + scoreColor(value) + ";\">" + value + "/100</td></tr>"
  ).join("") + "</table>";
}

function sourceText(t, notice) {
  return fill(t.source[notice.source] || t.source.page, { url: notice.sourceUrl || notice.host });
}

function footer(t, notice, stopUrl, postal) {
  return esc(fill(t.why, { email: notice.email, source: sourceText(t, notice) })) + "<br>" +
    "<a href=\"" + esc(stopUrl) + "\" style=\"color:#0e7490;\">" + esc(t.stop) + "</a><br>" +
    "<a href=\"" + SITE + "/qa-review.html\" style=\"color:#0e7490;\">QA-lab URL Review</a> &middot; " + esc(postal);
}

// notice: the url_review_owner_notices row. links: { claim, unlist, stop, live }. card: the Live Report card.
function noticeMail(notice, card, links, postal) {
  const t = copyFor(notice.lang);
  const vars = { host: notice.host, domain: notice.domain, date: String(card.read || notice.reviewedAt || "").slice(0, 10) };
  const inner = header(fill(t.title, vars)) +
    "<tr><td bgcolor=\"#ffffff\" style=\"background:#ffffff;border-radius:0 0 16px 16px;padding:22px 28px 22px;\">" +
    para(fill(t.lead, vars)) +
    scoreRows(t, card) +
    (notice.critical ? para(t.critical, "font-size:15px;line-height:23px;color:#7f1d1d;font-weight:bold;") : "") +
    button(links.claim, t.claim, true) + button(links.unlist, fill(t.unlist, vars), false) +
    para(fill(t.claimNote, vars), "font-size:13px;line-height:19px;color:#64748b;margin:6px 0 8px;") +
    para(fill(t.unlistNote, vars), "font-size:13px;line-height:19px;color:#64748b;margin:0 0 12px;") +
    "<p style=\"margin:0;font-family:Arial,Helvetica,sans-serif;font-size:14px;\"><a href=\"" + esc(links.live) + "\" style=\"color:#0e7490;\">" + esc(t.view) + "</a></p>" +
    "</td></tr>";
  const scores = [t.overall + " " + (Number(card.overall) || 0) + "/100"].concat(AREAS.filter((area) => card.areas && card.areas[area] != null).map((area) => (t.areas[area] || area) + " " + card.areas[area] + "/100"));
  const text = [
    fill(t.title, vars), "",
    fill(t.lead, vars), scores.join(" · "), "",
    notice.critical ? t.critical + "\n" : "",
    t.claim + ": " + links.claim, fill(t.claimNote, vars), "",
    fill(t.unlist, vars) + ": " + links.unlist, fill(t.unlistNote, vars), "",
    t.view + ": " + links.live, "",
    fill(t.why, { email: notice.email, source: sourceText(t, notice) }),
    t.stop + ": " + links.stop,
    "QA-lab URL Review · " + postal
  ].filter((line, i, all) => line !== "" || all[i - 1] !== "").join("\n");
  return { lang: base.langOf(notice.lang), subject: fill(t.subject, vars), text, html: shell(base.langOf(notice.lang), t.preheader, inner, footer(t, notice, links.stop, postal)) };
}

function claimMail(lang, claim) {
  const code = base.langOf(lang);
  const t = COPY[code];
  const vars = { host: claim.host, domain: claim.domain };
  const inner = header(fill(t.claimTitle, vars)) +
    "<tr><td bgcolor=\"#ffffff\" style=\"background:#ffffff;border-radius:0 0 16px 16px;padding:22px 28px 22px;\">" +
    para(fill(t.claimLead, vars)) +
    button(claim.reportUrl, t.claimOpen, true) +
    para(t.claimKeep, "font-size:13px;line-height:19px;color:#64748b;margin:6px 0 0;") +
    "</td></tr>";
  const foot = esc(fill(t.claimWhy, vars)) + "<br>" +
    "<a href=\"" + SITE + "/qa-review.html\" style=\"color:#0e7490;\">QA-lab URL Review</a> &middot; " + esc(claim.postal);
  return {
    lang: code,
    subject: fill(t.claimSubject, vars),
    text: [fill(t.claimTitle, vars), "", fill(t.claimLead, vars), claim.reportUrl, "", t.claimKeep, "", fill(t.claimWhy, vars), "QA-lab URL Review · " + claim.postal].join("\n"),
    html: shell(code, fill(t.claimLead, vars), inner, foot)
  };
}

const PAGE_STYLE = "body{margin:0;min-height:100vh;display:grid;place-items:center;background:#e8eef4;font-family:Arial,Helvetica,sans-serif;color:#0f172a}" +
  "main{background:#fff;border-radius:16px;padding:32px;max-width:460px;margin:16px;text-align:center}h1{font-size:22px;line-height:1.3;font-weight:normal}" +
  "p{color:#334155;line-height:1.5}label{display:block;text-align:left;font-size:14px;margin:0 0 6px}" +
  "input{box-sizing:border-box;width:100%;padding:12px;border:1px solid #9cc7d3;border-radius:10px;font-size:16px;margin:0 0 14px}" +
  "button{background:#0e7490;color:#fff;border:0;border-radius:10px;padding:13px 22px;font-size:15px;font-weight:bold;cursor:pointer}" +
  ".error{color:#b91c1c}a{color:#0e7490}";

// state: claim, claimed, claim-limit, unlist, unlisted, stop, stopped, gone.
// link: the url_review_owner_links row, plus email (claimed) or wrong (a rejected claim address).
function ownerPage(lang, state, link) {
  const code = base.langOf(lang);
  const t = COPY[code].page;
  const data = link || {};
  const vars = { host: data.host || "", domain: data.domain || "", email: data.email || "", deeper: DEEPER };
  const confirm = (title, lead, label) => "<h1>" + esc(fill(title, vars)) + "</h1><p>" + esc(fill(lead, vars)) + "</p><form method=\"post\"><button type=\"submit\">" + esc(label) + "</button></form>";
  const said = (title, lead) => "<h1>" + esc(fill(title, vars)) + "</h1>" + (lead ? "<p>" + esc(fill(lead, vars)) + "</p>" : "") + "<p><a href=\"" + SITE + "/" + (code === "en" ? "qa-review.html" : "qa-review-" + code + ".html") + "\">QA-lab URL Review</a></p>";
  let body;
  if (state === "claim") {
    body = "<h1>" + esc(fill(t.claimTitle, vars)) + "</h1><p>" + esc(fill(t.claimLead, vars)) + "</p>" +
      (data.wrong ? "<p class=\"error\" role=\"alert\">" + esc(fill(t.claimWrong, vars)) + "</p>" : "") +
      "<form method=\"post\"><label for=\"email\">" + esc(fill(t.claimLabel, vars)) + "</label>" +
      "<input id=\"email\" name=\"email\" type=\"email\" required autocomplete=\"email\" placeholder=\"name@" + esc(vars.domain) + "\">" +
      "<button type=\"submit\">" + esc(t.claimButton) + "</button></form>";
  } else if (state === "claimed") body = said(t.claimed, t.claimedLead);
  else if (state === "claim-limit") body = said(t.claimLimit, "");
  else if (state === "unlist") body = confirm(t.unlistTitle, t.unlistLead, t.unlistButton);
  else if (state === "unlisted") body = said(t.unlisted, "");
  else if (state === "stop") body = confirm(t.stopTitle, t.stopLead, t.stopButton);
  else if (state === "stopped") body = said(t.stopped, "");
  else body = said(t.gone, "");
  return "<!DOCTYPE html><html lang=\"" + code + "\"><head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\"><meta name=\"robots\" content=\"noindex\"><title>QA-lab URL Review</title>" +
    "<style>" + PAGE_STYLE + "</style></head><body><main>" + body + "</main></body></html>";
}

module.exports = { COPY, noticeMail, claimMail, ownerPage };
