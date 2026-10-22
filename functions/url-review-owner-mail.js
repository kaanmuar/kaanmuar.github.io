/* The owner notice email and the pages its links open, in six languages.
   A claimed report goes out as the asker's blurred report mail (url-review-customer-mail.js), with
   claimWhy as its footer line. Rules for who gets a notice live in url-review-owner-notice.js.
   Nothing here names the asker. */

const base = require("./url-review-customer-mail");

const { SITE, POSTAL, AREAS, esc, fill, button, shell } = base;
const DEEPER = "qa@carlosandmunoz.com";

const COPY = {
  en: {
    subject: "{host} has a public review on QA-lab Live Reports",
    preheader: "The scores are public. You can claim the report for free, or take the page down.",
    title: "A public review of {host} is on Live Reports",
    lead: "{host} was reviewed with QA-lab URL Review on {date}, and the scores were published on Live Reports. We never say who asked for a review. This is what the public page shows:",
    critical: "The review found a critical security issue. The report says what to fix first.",
    claim: "Claim the report",
    claimNote: "The report shows the six scores and what to fix first, with the details blurred. It is sent free to an address at {domain}, which shows the mailbox is yours.",
    unlist: "Remove {host} from Live Reports",
    unlistNote: "It leaves the public page with the next daily update, and later reviews of {host} are not published either.",
    view: "See the public page",
    source: { "security.txt": "the site's security.txt", schema: "the site's structured data", llms: "the site's llms.txt", rdap: "the domain's registration record (RDAP)", dmarc: "the domain's DMARC record", soa: "the domain's DNS records", search: "public web search results for {domain}", page: "{url}" },
    why: "You get this single notice because {email} is public: we found it in {source}. We send at most one per domain every six months, and we never fill in contact forms.",
    stop: "No more notices to this address or domain",
    claimWhy: "You get this because the report of {host} was claimed with this address at carlosandmunoz.com.",
    health: {
      title: "Health score", grade: "Grade",
      summary: "{host} scores {overall} out of 100 ({grade}). {fail} checks fail now, {risk} are at risk, and {pass} pass.",
      fail: "Fails now", risk: "At risk", pass: "Passes", person: "Needs a browser",
      critical: "critical", high: "high", medium: "medium", low: "low",
      measured: "Every check was measured from the public response, not guessed.",
      counts: "{fail} fail · {risk} at risk · {pass} pass",
      areas: { SEO: "SEO", GEO: "GEO", Analytics: "Analytics", Security: "Security", Accessibility: "Accessibility", Performance: "Performance" },
      about: { SEO: "Indexing, sitemap, titles, structured data", GEO: "How AI answers can read and cite the site", Analytics: "Tags, consent, campaign tracking", Security: "Headers, TLS, DNS, exposure", Accessibility: "Markup, axe-core, and the phone layout", Performance: "Speed, weight, paint, and layout shift" }
    },
    page: {
      claimTitle: "Claim the report of {host}",
      claimLead: "Enter an address at {domain}. The report is sent there, free, with the details blurred.",
      claimLabel: "Your email at {domain}",
      claimButton: "Send me the report",
      claimWrong: "Use an address that ends in @{domain}.",
      claimed: "Sent. Check {email}.",
      claimedLead: "The link in that email opens the report.",
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
    preheader: "Los puntajes son públicos. Puedes pedir el informe gratis o retirar la página.",
    title: "Hay una revisión pública de {host} en Live Reports",
    lead: "{host} se revisó con QA-lab URL Review el {date} y los puntajes se publicaron en Live Reports. Nunca decimos quién pidió una revisión. Esto es lo que muestra la página pública:",
    critical: "La revisión encontró un problema de seguridad crítico. El informe dice qué arreglar primero.",
    claim: "Pedir el informe",
    claimNote: "El informe muestra los seis puntajes y qué arreglar primero, con los detalles difuminados. Se envía gratis a una dirección de {domain}, lo que demuestra que el buzón es tuyo.",
    unlist: "Retirar {host} de Live Reports",
    unlistNote: "Sale de la página pública con la siguiente actualización diaria, y las revisiones futuras de {host} tampoco se publican.",
    view: "Ver la página pública",
    source: { "security.txt": "el security.txt del sitio", schema: "los datos estructurados del sitio", llms: "el llms.txt del sitio", rdap: "el registro del dominio (RDAP)", dmarc: "el registro DMARC del dominio", soa: "los registros DNS del dominio", search: "resultados públicos de búsqueda web para {domain}", page: "{url}" },
    why: "Recibes este único aviso porque {email} es público: lo encontramos en {source}. Enviamos como máximo uno por dominio cada seis meses y nunca llenamos formularios de contacto.",
    stop: "No más avisos a esta dirección ni a este dominio",
    claimWhy: "Recibes esto porque el informe de {host} se pidió con esta dirección en carlosandmunoz.com.",
    health: {
      title: "Puntaje de salud", grade: "Nota",
      summary: "{host} obtiene {overall} de 100 ({grade}). {fail} controles fallan ahora, {risk} están en riesgo y {pass} pasan.",
      fail: "Fallan ahora", risk: "En riesgo", pass: "Pasan", person: "Necesita un navegador",
      critical: "crítico", high: "alto", medium: "medio", low: "bajo",
      measured: "Cada control se midió en la respuesta pública, no se adivinó.",
      counts: "{fail} fallan · {risk} en riesgo · {pass} pasan",
      areas: { SEO: "SEO", GEO: "GEO", Analytics: "Analítica", Security: "Seguridad", Accessibility: "Accesibilidad", Performance: "Rendimiento" },
      about: { SEO: "Indexación, sitemap, títulos, datos estructurados", GEO: "Cómo las respuestas de IA leen y citan el sitio", Analytics: "Etiquetas, consentimiento, seguimiento de campañas", Security: "Cabeceras, TLS, DNS, exposición", Accessibility: "Marcado, axe-core y la vista en el teléfono", Performance: "Velocidad, peso, pintado y saltos de diseño" }
    },
    page: {
      claimTitle: "Pedir el informe de {host}",
      claimLead: "Escribe una dirección de {domain}. El informe se envía ahí, gratis, con los detalles difuminados.",
      claimLabel: "Tu correo de {domain}",
      claimButton: "Enviarme el informe",
      claimWrong: "Usa una dirección que termine en @{domain}.",
      claimed: "Enviado. Revisa {email}.",
      claimedLead: "El enlace de ese correo abre el informe.",
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
    preheader: "As notas são públicas. Você pode pedir o relatório de graça ou retirar a página.",
    title: "Há uma revisão pública de {host} no Live Reports",
    lead: "{host} foi revisado com o QA-lab URL Review em {date}, e as notas foram publicadas no Live Reports. Nunca dizemos quem pediu uma revisão. Isto é o que a página pública mostra:",
    critical: "A revisão encontrou um problema de segurança crítico. O relatório diz o que corrigir primeiro.",
    claim: "Pedir o relatório",
    claimNote: "O relatório mostra as seis notas e o que corrigir primeiro, com os detalhes desfocados. Ele é enviado de graça para um endereço de {domain}, o que mostra que a caixa de e-mail é sua.",
    unlist: "Retirar {host} do Live Reports",
    unlistNote: "Ele sai da página pública na próxima atualização diária, e as próximas revisões de {host} também não são publicadas.",
    view: "Ver a página pública",
    source: { "security.txt": "o security.txt do site", schema: "os dados estruturados do site", llms: "o llms.txt do site", rdap: "o registro do domínio (RDAP)", dmarc: "o registro DMARC do domínio", soa: "os registros DNS do domínio", search: "resultados públicos de busca na web para {domain}", page: "{url}" },
    why: "Você recebe este único aviso porque {email} é público: nós o encontramos em {source}. Enviamos no máximo um por domínio a cada seis meses e nunca preenchemos formulários de contato.",
    stop: "Nenhum aviso mais para este endereço ou domínio",
    claimWhy: "Você recebeu isto porque o relatório de {host} foi pedido com este endereço em carlosandmunoz.com.",
    health: {
      title: "Nota de saúde", grade: "Nota",
      summary: "{host} tem {overall} de 100 ({grade}). {fail} verificações falham agora, {risk} estão em risco e {pass} passam.",
      fail: "Falham agora", risk: "Em risco", pass: "Passam", person: "Precisa de navegador",
      critical: "crítico", high: "alto", medium: "médio", low: "baixo",
      measured: "Cada verificação foi medida na resposta pública, sem suposições.",
      counts: "{fail} falham · {risk} em risco · {pass} passam",
      areas: { SEO: "SEO", GEO: "GEO", Analytics: "Analytics", Security: "Segurança", Accessibility: "Acessibilidade", Performance: "Desempenho" },
      about: { SEO: "Indexação, sitemap, títulos, dados estruturados", GEO: "Como as respostas de IA leem e citam o site", Analytics: "Tags, consentimento, rastreamento de campanhas", Security: "Cabeçalhos, TLS, DNS, exposição", Accessibility: "Marcação, axe-core e o layout no celular", Performance: "Velocidade, peso, renderização e mudanças de layout" }
    },
    page: {
      claimTitle: "Pedir o relatório de {host}",
      claimLead: "Digite um endereço de {domain}. O relatório é enviado para lá, de graça, com os detalhes desfocados.",
      claimLabel: "Seu e-mail de {domain}",
      claimButton: "Enviar o relatório",
      claimWrong: "Use um endereço que termine em @{domain}.",
      claimed: "Enviado. Confira {email}.",
      claimedLead: "O link nesse e-mail abre o relatório.",
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
    preheader: "Die Werte sind öffentlich. Du kannst den Bericht kostenlos anfordern oder die Seite entfernen lassen.",
    title: "Eine öffentliche Prüfung von {host} steht auf Live Reports",
    lead: "{host} wurde am {date} mit QA-lab URL Review geprüft, und die Werte wurden auf Live Reports veröffentlicht. Wer eine Prüfung angefordert hat, sagen wir nie. Das zeigt die öffentliche Seite:",
    critical: "Die Prüfung hat ein kritisches Sicherheitsproblem gefunden. Der Bericht sagt, was zuerst zu beheben ist.",
    claim: "Bericht anfordern",
    claimNote: "Der Bericht zeigt die sechs Werte und was zuerst zu beheben ist, mit unscharfen Details. Er geht kostenlos an eine Adresse bei {domain}; das zeigt, dass das Postfach dir gehört.",
    unlist: "{host} von Live Reports entfernen",
    unlistNote: "Die Seite verschwindet mit dem nächsten täglichen Update, und spätere Prüfungen von {host} werden auch nicht veröffentlicht.",
    view: "Öffentliche Seite ansehen",
    source: { "security.txt": "der security.txt der Website", schema: "den strukturierten Daten der Website", llms: "der llms.txt der Website", rdap: "dem Registrierungseintrag der Domain (RDAP)", dmarc: "dem DMARC-Eintrag der Domain", soa: "den DNS-Einträgen der Domain", search: "öffentlichen Websuchergebnissen zu {domain}", page: "{url}" },
    why: "Du bekommst diesen einen Hinweis, weil {email} öffentlich ist: Wir haben die Adresse in {source} gefunden. Wir senden höchstens einen pro Domain alle sechs Monate und füllen nie Kontaktformulare aus.",
    stop: "Keine Hinweise mehr an diese Adresse oder Domain",
    claimWhy: "Du bekommst diese E-Mail, weil der Bericht zu {host} mit dieser Adresse auf carlosandmunoz.com angefordert wurde.",
    health: {
      title: "Gesundheitswert", grade: "Note",
      summary: "{host} erreicht {overall} von 100 ({grade}). {fail} Prüfungen scheitern jetzt, {risk} sind gefährdet und {pass} bestehen.",
      fail: "Scheitern jetzt", risk: "Gefährdet", pass: "Bestanden", person: "Braucht einen Browser",
      critical: "kritisch", high: "hoch", medium: "mittel", low: "niedrig",
      measured: "Jede Prüfung wurde an der öffentlichen Antwort gemessen, nicht geschätzt.",
      counts: "{fail} scheitern · {risk} gefährdet · {pass} bestanden",
      areas: { SEO: "SEO", GEO: "GEO", Analytics: "Analytics", Security: "Sicherheit", Accessibility: "Barrierefreiheit", Performance: "Leistung" },
      about: { SEO: "Indexierung, Sitemap, Titel, strukturierte Daten", GEO: "Wie KI-Antworten die Website lesen und zitieren", Analytics: "Tags, Einwilligung, Kampagnen-Tracking", Security: "Header, TLS, DNS, Angriffsfläche", Accessibility: "Markup, axe-core und die Ansicht am Handy", Performance: "Tempo, Gewicht, Rendering und Layout-Verschiebungen" }
    },
    page: {
      claimTitle: "Bericht zu {host} anfordern",
      claimLead: "Gib eine Adresse bei {domain} ein. Der Bericht wird kostenlos dorthin gesendet, mit unscharfen Details.",
      claimLabel: "Deine E-Mail bei {domain}",
      claimButton: "Bericht senden",
      claimWrong: "Nutze eine Adresse, die auf @{domain} endet.",
      claimed: "Gesendet. Sieh in {email} nach.",
      claimedLead: "Der Link in dieser E-Mail öffnet den Bericht.",
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
    preheader: "Les scores sont publics. Vous pouvez demander le rapport gratuitement ou retirer la page.",
    title: "Une revue publique de {host} est sur Live Reports",
    lead: "{host} a été revu avec QA-lab URL Review le {date}, et les scores ont été publiés sur Live Reports. Nous ne disons jamais qui a demandé une revue. Voici ce que montre la page publique :",
    critical: "La revue a trouvé un problème de sécurité critique. Le rapport indique ce qu'il faut corriger d'abord.",
    claim: "Demander le rapport",
    claimNote: "Le rapport montre les six scores et ce qu'il faut corriger d'abord, avec les détails floutés. Il est envoyé gratuitement à une adresse en {domain}, ce qui montre que la boîte vous appartient.",
    unlist: "Retirer {host} de Live Reports",
    unlistNote: "La page publique disparaît à la prochaine mise à jour quotidienne, et les revues suivantes de {host} ne sont pas publiées non plus.",
    view: "Voir la page publique",
    source: { "security.txt": "le security.txt du site", schema: "les données structurées du site", llms: "le llms.txt du site", rdap: "la fiche d'enregistrement du domaine (RDAP)", dmarc: "l'enregistrement DMARC du domaine", soa: "les enregistrements DNS du domaine", search: "les résultats publics de recherche web pour {domain}", page: "{url}" },
    why: "Vous recevez cet avis unique parce que {email} est public : nous l'avons trouvé dans {source}. Nous en envoyons au plus un par domaine tous les six mois, et nous ne remplissons jamais de formulaire de contact.",
    stop: "Plus d'avis à cette adresse ni à ce domaine",
    claimWhy: "Vous recevez ce message parce que le rapport de {host} a été demandé avec cette adresse sur carlosandmunoz.com.",
    health: {
      title: "Score de santé", grade: "Note",
      summary: "{host} obtient {overall} sur 100 ({grade}). {fail} contrôles échouent, {risk} sont à risque et {pass} réussissent.",
      fail: "Échouent", risk: "À risque", pass: "Réussis", person: "Nécessite un navigateur",
      critical: "critique", high: "élevé", medium: "moyen", low: "faible",
      measured: "Chaque contrôle a été mesuré sur la réponse publique, sans supposition.",
      counts: "{fail} échouent · {risk} à risque · {pass} réussis",
      areas: { SEO: "SEO", GEO: "GEO", Analytics: "Analytics", Security: "Sécurité", Accessibility: "Accessibilité", Performance: "Performance" },
      about: { SEO: "Indexation, sitemap, titres, données structurées", GEO: "Comment les réponses d'IA lisent et citent le site", Analytics: "Balises, consentement, suivi des campagnes", Security: "En-têtes, TLS, DNS, exposition", Accessibility: "Balisage, axe-core et l'affichage sur téléphone", Performance: "Vitesse, poids, rendu et décalages de mise en page" }
    },
    page: {
      claimTitle: "Demander le rapport de {host}",
      claimLead: "Saisissez une adresse en {domain}. Le rapport y est envoyé, gratuitement, avec les détails floutés.",
      claimLabel: "Votre e-mail en {domain}",
      claimButton: "M'envoyer le rapport",
      claimWrong: "Utilisez une adresse qui se termine par @{domain}.",
      claimed: "Envoyé. Consultez {email}.",
      claimedLead: "Le lien de cet e-mail ouvre le rapport.",
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
    preheader: "I punteggi sono pubblici. Puoi chiedere il report gratis o togliere la pagina.",
    title: "Una revisione pubblica di {host} è su Live Reports",
    lead: "{host} è stato revisionato con QA-lab URL Review il {date}, e i punteggi sono stati pubblicati su Live Reports. Non diciamo mai chi ha chiesto una revisione. Ecco cosa mostra la pagina pubblica:",
    critical: "La revisione ha trovato un problema di sicurezza critico. Il report dice cosa correggere per primo.",
    claim: "Chiedi il report",
    claimNote: "Il report mostra i sei punteggi e cosa correggere per primo, con i dettagli sfocati. Viene inviato gratis a un indirizzo di {domain}, e questo dimostra che la casella è tua.",
    unlist: "Togli {host} da Live Reports",
    unlistNote: "Esce dalla pagina pubblica con il prossimo aggiornamento giornaliero, e le revisioni successive di {host} non vengono pubblicate.",
    view: "Vedi la pagina pubblica",
    source: { "security.txt": "il security.txt del sito", schema: "i dati strutturati del sito", llms: "il llms.txt del sito", rdap: "la registrazione del dominio (RDAP)", dmarc: "il record DMARC del dominio", soa: "i record DNS del dominio", search: "i risultati pubblici di ricerca web per {domain}", page: "{url}" },
    why: "Ricevi questo unico avviso perché {email} è pubblico: l'abbiamo trovato in {source}. Ne inviamo al massimo uno per dominio ogni sei mesi e non compiliamo mai moduli di contatto.",
    stop: "Nessun altro avviso a questo indirizzo o dominio",
    claimWhy: "Ricevi questa email perché il report di {host} è stato chiesto con questo indirizzo su carlosandmunoz.com.",
    health: {
      title: "Punteggio di salute", grade: "Voto",
      summary: "{host} ottiene {overall} su 100 ({grade}). {fail} controlli falliscono ora, {risk} sono a rischio e {pass} passano.",
      fail: "Falliscono ora", risk: "A rischio", pass: "Superati", person: "Serve un browser",
      critical: "critico", high: "alto", medium: "medio", low: "basso",
      measured: "Ogni controllo è stato misurato sulla risposta pubblica, non indovinato.",
      counts: "{fail} falliscono · {risk} a rischio · {pass} superati",
      areas: { SEO: "SEO", GEO: "GEO", Analytics: "Analytics", Security: "Sicurezza", Accessibility: "Accessibilità", Performance: "Prestazioni" },
      about: { SEO: "Indicizzazione, sitemap, titoli, dati strutturati", GEO: "Come le risposte dell'IA leggono e citano il sito", Analytics: "Tag, consenso, tracciamento delle campagne", Security: "Header, TLS, DNS, esposizione", Accessibility: "Markup, axe-core e il layout su telefono", Performance: "Velocità, peso, rendering e spostamenti del layout" }
    },
    page: {
      claimTitle: "Chiedi il report di {host}",
      claimLead: "Scrivi un indirizzo di {domain}. Il report viene inviato lì, gratis, con i dettagli sfocati.",
      claimLabel: "La tua email di {domain}",
      claimButton: "Inviami il report",
      claimWrong: "Usa un indirizzo che finisce con @{domain}.",
      claimed: "Inviato. Controlla {email}.",
      claimedLead: "Il link in quella email apre il report.",
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

const GRADE_COLOR = { A: "#5fb88a", B: "#7fb08a", C: "#c9a86a", D: "#e0896a", F: "#e8796b" };
const PANEL = "#171412";
const CARD = "#1f1b18";
const LINE = "#3a332e";

function copyFor(lang) {
  return COPY[base.langOf(lang)];
}

function gradeOf(score) {
  if (score >= 90) return "A";
  if (score >= 80) return "B";
  if (score >= 70) return "C";
  if (score >= 60) return "D";
  return "F";
}

function barColor(score) {
  return GRADE_COLOR[gradeOf(score)];
}

// The review's insights.score, or the card's numbers when the review record is gone.
function healthFacts(score, card) {
  const source = score && typeof score.overall === "number" ? score : null;
  const overall = Number(source ? source.overall : card.overall) || 0;
  const areas = {};
  AREAS.forEach((area) => {
    const row = source && source.areas && source.areas[area];
    const value = row ? Number(row.score) : Number(card.areas && card.areas[area]);
    if (!isNaN(value)) areas[area] = { score: value, grade: (row && row.grade) || gradeOf(value), fail: row ? row.fail || 0 : null, risk: row ? row.risk || 0 : null, pass: row ? row.pass || 0 : null };
  });
  return {
    overall,
    grade: (source && source.grade) || card.grade || gradeOf(overall),
    totals: source && source.totals ? source.totals : null,
    severities: source && source.severities ? source.severities : null,
    areas
  };
}

function chip(text, color) {
  return "<span style=\"display:inline-block;margin:0 6px 6px 0;padding:3px 10px;border:1px solid " + color + ";border-radius:999px;font-size:12px;line-height:18px;color:" + color + ";\">" + text + "</span>";
}

function healthBlock(t, host, facts) {
  const h = t.health;
  const totals = facts.totals;
  const summary = totals ? fill(h.summary, { host, overall: facts.overall, grade: facts.grade, fail: totals.fail, risk: totals.risk, pass: totals.pass }) : "";
  const chips = totals
    ? chip("<b>" + totals.fail + "</b> " + esc(h.fail), "#f0897b") + chip("<b>" + totals.risk + "</b> " + esc(h.risk), "#e3b866") + chip("<b>" + totals.pass + "</b> " + esc(h.pass), "#6fcf97") +
      (totals.person ? chip("<b>" + totals.person + "</b> " + esc(h.person), "#b8b0a8") : "")
    : "";
  const sev = facts.severities
    ? ["critical", "high", "medium", "low"].map((key) => chip("<b>" + (facts.severities[key] || 0) + "</b> " + esc(h[key]), { critical: "#b8b0a8", high: "#f0897b", medium: "#e3b866", low: "#b8b0a8" }[key])).join("")
    : "";
  const areaCard = (area) => {
    const row = facts.areas[area];
    if (!row) return "<td width=\"50%\"></td>";
    const counts = row.fail == null ? "" : fill(h.counts, { fail: row.fail, risk: row.risk, pass: row.pass }) + " — ";
    return "<td width=\"50%\" valign=\"top\" style=\"padding:5px;\"><table role=\"presentation\" width=\"100%\" cellpadding=\"0\" cellspacing=\"0\" bgcolor=\"" + CARD + "\" style=\"background:" + CARD + ";border:1px solid " + LINE + ";border-radius:12px;\"><tr><td style=\"padding:12px 14px;font-family:Arial,Helvetica,sans-serif;\">" +
      "<table role=\"presentation\" width=\"100%\" cellpadding=\"0\" cellspacing=\"0\"><tr>" +
      "<td style=\"font-size:15px;color:#f5f0eb;\"><b style=\"font-size:20px;\">" + row.score + "</b> " + esc(h.areas[area] || area) + "</td>" +
      "<td align=\"right\"><span style=\"display:inline-block;min-width:22px;text-align:center;padding:3px 6px;border-radius:6px;background:" + (GRADE_COLOR[row.grade] || GRADE_COLOR.F) + ";color:#ffffff;font-size:13px;font-weight:bold;\">" + esc(row.grade) + "</span></td>" +
      "</tr></table>" +
      "<table role=\"presentation\" width=\"100%\" cellpadding=\"0\" cellspacing=\"0\" style=\"margin:8px 0;background:#0f2a3a;border-radius:4px;\"><tr>" +
      (row.score > 0 ? "<td width=\"" + Math.min(100, row.score) + "%\" style=\"height:6px;line-height:6px;font-size:0;background:" + barColor(row.score) + ";border-radius:4px;\">&nbsp;</td>" : "") +
      (row.score < 100 ? "<td style=\"height:6px;line-height:6px;font-size:0;\">&nbsp;</td>" : "") +
      "</tr></table>" +
      "<p style=\"margin:0;font-size:12px;line-height:17px;color:#b8b0a8;\">" + esc(counts + h.about[area]) + "</p>" +
      "</td></tr></table></td>";
  };
  const shown = AREAS.filter((area) => facts.areas[area]);
  const grid = shown.filter((area, i) => i % 2 === 0).map((area, i) => "<tr>" + areaCard(area) + areaCard(shown[i * 2 + 1]) + "</tr>").join("");
  return "<table role=\"presentation\" width=\"100%\" cellpadding=\"0\" cellspacing=\"0\" bgcolor=\"" + PANEL + "\" style=\"background:" + PANEL + ";border-radius:14px;margin:0 0 18px;\"><tr><td style=\"padding:18px 14px 12px;font-family:Arial,Helvetica,sans-serif;\">" +
    "<p style=\"margin:0 6px 12px;font-family:Georgia,serif;font-size:19px;font-weight:bold;color:#f5f0eb;\">" + esc(h.title) + "</p>" +
    "<table role=\"presentation\" width=\"100%\" cellpadding=\"0\" cellspacing=\"0\"><tr>" +
    "<td width=\"112\" valign=\"top\" align=\"center\" style=\"padding:0 6px;\"><div style=\"width:96px;height:96px;border-radius:96px;border:8px solid " + barColor(facts.overall) + ";text-align:center;\">" +
    "<p style=\"margin:18px 0 0;font-family:Georgia,serif;font-size:38px;line-height:40px;font-weight:bold;color:#f5f0eb;\">" + facts.overall + "</p>" +
    "<p style=\"margin:2px 0 0;font-size:10px;letter-spacing:0.12em;text-transform:uppercase;color:#b8b0a8;\">" + esc(h.grade) + " " + esc(facts.grade) + "</p></div></td>" +
    "<td valign=\"top\" style=\"padding:0 6px;\">" +
    (summary ? "<p style=\"margin:0 0 10px;font-size:15px;line-height:22px;color:#f5f0eb;\">" + esc(summary) + "</p>" : "") +
    (chips ? "<div>" + chips + "</div>" : "") + (sev ? "<div>" + sev + "</div>" : "") +
    "<p style=\"margin:4px 0 0;font-size:12px;line-height:17px;color:#b8b0a8;\">" + esc(h.measured) + "</p>" +
    "</td></tr></table>" +
    "<table role=\"presentation\" width=\"100%\" cellpadding=\"0\" cellspacing=\"0\" style=\"margin-top:12px;\">" + grid + "</table>" +
    "</td></tr></table>";
}

function healthText(t, host, facts) {
  const h = t.health;
  const lines = [h.title + ": " + facts.overall + "/100 (" + facts.grade + ")"];
  if (facts.totals) lines.push(fill(h.summary, { host, overall: facts.overall, grade: facts.grade, fail: facts.totals.fail, risk: facts.totals.risk, pass: facts.totals.pass }));
  AREAS.forEach((area) => {
    const row = facts.areas[area];
    if (row) lines.push("- " + (h.areas[area] || area) + " " + row.score + " (" + row.grade + ")" + (row.fail == null ? "" : ": " + fill(h.counts, { fail: row.fail, risk: row.risk, pass: row.pass })));
  });
  return lines.join("\n");
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

function sourceText(t, notice) {
  return fill(t.source[notice.source] || t.source.page, { url: notice.sourceUrl || notice.host, domain: notice.domain });
}

function footer(t, notice, stopUrl) {
  return esc(fill(t.why, { email: notice.email, source: sourceText(t, notice) })) + "<br>" +
    "<a href=\"" + esc(stopUrl) + "\" style=\"color:#0e7490;\">" + esc(t.stop) + "</a><br>" +
    "<a href=\"" + SITE + "/qa-review.html\" style=\"color:#0e7490;\">QA-lab URL Review</a> &middot; " + esc(POSTAL);
}

// notice: the url_review_owner_notices row, addressed. card: the Live Report card.
// links: { claim, unlist, stop, live }. score: the review's insights.score, when the record is still there.
function noticeMail(notice, card, links, score) {
  const t = copyFor(notice.lang);
  const vars = { host: notice.host, domain: notice.domain, date: String(card.read || notice.reviewedAt || "").slice(0, 10) };
  const facts = healthFacts(score, card);
  const inner = header(fill(t.title, vars)) +
    "<tr><td bgcolor=\"#ffffff\" style=\"background:#ffffff;border-radius:0 0 16px 16px;padding:22px 24px 22px;\">" +
    para(fill(t.lead, vars)) +
    healthBlock(t, notice.host, facts) +
    (notice.critical ? para(t.critical, "font-size:15px;line-height:23px;color:#7f1d1d;font-weight:bold;") : "") +
    button(links.claim, t.claim, true) + button(links.unlist, fill(t.unlist, vars), false) +
    para(fill(t.claimNote, vars), "font-size:13px;line-height:19px;color:#64748b;margin:6px 0 8px;") +
    para(fill(t.unlistNote, vars), "font-size:13px;line-height:19px;color:#64748b;margin:0 0 12px;") +
    "<p style=\"margin:0;font-family:Arial,Helvetica,sans-serif;font-size:14px;\"><a href=\"" + esc(links.live) + "\" style=\"color:#0e7490;\">" + esc(t.view) + "</a></p>" +
    "</td></tr>";
  const text = [
    fill(t.title, vars), "",
    fill(t.lead, vars), "",
    healthText(t, notice.host, facts), "",
    notice.critical ? t.critical : "",
    t.claim + ": " + links.claim, fill(t.claimNote, vars), "",
    fill(t.unlist, vars) + ": " + links.unlist, fill(t.unlistNote, vars), "",
    t.view + ": " + links.live, "",
    fill(t.why, { email: notice.email, source: sourceText(t, notice) }),
    t.stop + ": " + links.stop,
    "QA-lab URL Review · " + POSTAL
  ].filter((line, i, all) => line !== "" || all[i - 1] !== "").join("\n");
  return { lang: base.langOf(notice.lang), subject: fill(t.subject, vars), text, html: shell(base.langOf(notice.lang), t.preheader, inner, footer(t, notice, links.stop)) };
}

// The footer line of the blurred report mail when an owner claimed it.
function claimWhy(lang, host) {
  return fill(copyFor(lang).claimWhy, { host });
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

module.exports = { COPY, POSTAL, healthFacts, noticeMail, claimWhy, ownerPage };
