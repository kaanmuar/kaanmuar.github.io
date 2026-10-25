/**
 * Mail to the asker: the report after a run, the return notes, and sign-in.
 * An unpaid report is cut here, so the hidden part of a line never leaves in mail.
 */
const findingsCopy = require("./url-review-findings-copy");

const SITE = "https://carlosandmunoz.com";
const DEEPER = "qa@carlosandmunoz.com";
const ACCOUNT_PAGE = "qa-review-account.html";
const ACCOUNT_URL = SITE + "/" + ACCOUNT_PAGE;
const LEGAL_URL = SITE + "/qa-review-legal.html";
const POSTAL = "Calle 29 # 29-31, Medellín, Colombia (050016)";
const LANGS = ["en", "es", "pt", "de", "fr", "it"];
const PAGE_FOR = {
  en: "qa-review.html",
  es: "qa-review-es.html",
  pt: "qa-review-pt.html",
  de: "qa-review-de.html",
  fr: "qa-review-fr.html",
  it: "qa-review-it.html"
};
const AREAS = ["SEO", "GEO", "Analytics", "Security", "Accessibility", "Performance"];
const SHOWN_FINDINGS = 5;

const COPY = {
  en: {
    subjects: ["{host} scored {score}/100. The rest is under frost.", "{score}/100 for {host}. Here is where the points went.", "{host}: {score} out of 100, and a list worth reading."],
    subjectPlain: "Your review of {host} is in.",
    preheader: "Six scores are open. {count} findings wait under the blur.",
    title: "The review of {host} is in.",
    lead: "The six scores are in the clear. The findings sit under frost, with just enough showing to tell which ones matter.",
    subjectClear: "{host} scored {score}/100 and passed every scored check.",
    preheaderClear: "Six scores and no findings. The site passed every scored check.",
    leadClear: "The six scores are in the clear, and the site passed every scored check. There are no findings to fix.",
    outOf: "out of 100",
    pages: "pages analyzed",
    pagesFound: "of {n} found",
    cases: "proposed test cases",
    findings: "What to fix first",
    more: "+{n} more findings in the full report",
    open: "Unlock the full report",
    openNote: "From there you can download it, export the test cases, or print it.",
    reopen: "Open the last report",
    another: "Review another URL",
    deeper: "Want to go deeper?",
    deeperLines: ["Want to evaluate more pages, more links, or more sites?", "Want full, real test cases run in any or all of the automation frameworks?"],
    deeperCta: "Write to qa@carlosandmunoz.com",
    deeperSubject: "Going deeper on {host}",
    why: "You get this because a review of {host} was run with this address at carlosandmunoz.com.",
    stop: "Stop follow-up notes",
    subjectOpen: "{host} scored {score}/100. The full report is open.",
    subjectRerun: "Your review of {host} ran again and is in.",
    subjectStopped: "Your review of {host} stopped before the last page.",
    titleStopped: "The review of {host} stopped before the last page.",
    preheaderOpen: "Six scores and {count} findings, all open.",
    leadOpen: "The six scores and the findings are open, each line in full.",
    leadStopped: "It stopped before the last page, so it covers the pages analyzed until then.",
    rerun: "Your earlier review of {host} failed on {date}. It ran again after the cause cleared, and this is the result, open at no charge.",
    rerunUndated: "Your earlier review of {host} failed. It ran again after the cause cleared, and this is the result, open at no charge.",
    openFull: "Open the full report",
    account: "Your reviews",
    kept: "Kept until {date}",
    live: "Public scores from this review may appear as a Live Report. Site owners who want it removed can write to qa@carlosandmunoz.com.",
    controller: "Carlos A. Muñoz, {postal}, is responsible for your data.",
    legal: "How it is used",
    areas: { SEO: "SEO", GEO: "GEO", Analytics: "Analytics", Security: "Security", Accessibility: "Accessibility", Performance: "Performance" },
    page: ["Stop the follow-up notes?", "Stop them", "Done. No more follow-up notes go to {email}.", "This link no longer works."]
  },
  es: {
    subjects: ["{host} sacó {score}/100. El resto sigue empañado.", "{score}/100 para {host}. Aquí está a dónde se fueron los puntos.", "{host}: {score} de 100, y una lista que vale la pena leer."],
    subjectPlain: "La revisión de {host} está lista.",
    preheader: "Los seis puntajes están abiertos. {count} hallazgos esperan bajo el desenfoque.",
    title: "La revisión de {host} está lista.",
    lead: "Los seis puntajes están a la vista. Los hallazgos siguen empañados, con lo justo para saber cuáles importan.",
    subjectClear: "{host} sacó {score}/100 y pasó todas las comprobaciones con puntaje.",
    preheaderClear: "Seis puntajes y ningún hallazgo. El sitio pasó todas las comprobaciones con puntaje.",
    leadClear: "Los seis puntajes están a la vista y el sitio pasó todas las comprobaciones con puntaje. No hay hallazgos que arreglar.",
    outOf: "de 100",
    pages: "páginas analizadas",
    pagesFound: "de {n} encontradas",
    cases: "casos de prueba propuestos",
    findings: "Qué arreglar primero",
    more: "+{n} hallazgos más en el informe completo",
    open: "Desbloquear el informe completo",
    openNote: "Desde ahí lo descargas, exportas los casos de prueba o lo imprimes.",
    reopen: "Abrir el último informe",
    another: "Revisar otra URL",
    deeper: "¿Quieres ir más a fondo?",
    deeperLines: ["¿Quieres evaluar más páginas, más enlaces o más sitios?", "¿Quieres casos de prueba reales y completos, corridos en uno o en todos los frameworks de automatización?"],
    deeperCta: "Escribe a qa@carlosandmunoz.com",
    deeperSubject: "Ir más a fondo con {host}",
    why: "Recibes esto porque se hizo una revisión de {host} con este correo en carlosandmunoz.com.",
    stop: "Dejar de recibir notas",
    subjectOpen: "{host} sacó {score}/100. El informe completo está abierto.",
    subjectRerun: "Tu revisión de {host} se hizo de nuevo y está lista.",
    subjectStopped: "Tu revisión de {host} se detuvo antes de la última página.",
    titleStopped: "La revisión de {host} se detuvo antes de la última página.",
    preheaderOpen: "Seis puntajes y {count} hallazgos, todo abierto.",
    leadOpen: "Los seis puntajes y los hallazgos están abiertos, cada línea completa.",
    leadStopped: "Se detuvo antes de la última página, así que cubre las páginas analizadas hasta ese momento.",
    rerun: "Tu revisión anterior de {host} falló el {date}. Se hizo de nuevo cuando la causa se resolvió, y este es el resultado, abierto sin costo.",
    rerunUndated: "Tu revisión anterior de {host} falló. Se hizo de nuevo cuando la causa se resolvió, y este es el resultado, abierto sin costo.",
    openFull: "Abrir el informe completo",
    account: "Tus revisiones",
    kept: "Se guarda hasta el {date}",
    live: "Los puntajes públicos de esta revisión pueden aparecer como Live Report. Si eres dueño del sitio y quieres retirarlo, escribe a qa@carlosandmunoz.com.",
    controller: "Carlos A. Muñoz, {postal}, es responsable de tus datos.",
    legal: "Cómo se usan",
    areas: { SEO: "SEO", GEO: "GEO", Analytics: "Analítica", Security: "Seguridad", Accessibility: "Accesibilidad", Performance: "Rendimiento" },
    page: ["¿Dejar de recibir las notas?", "Sí, detenerlas", "Listo. No llegarán más notas a {email}.", "Este enlace ya no sirve."]
  },
  pt: {
    subjects: ["{host} tirou {score}/100. O resto está embaçado.", "{score}/100 para {host}. Veja para onde foram os pontos.", "{host}: {score} de 100, e uma lista que vale a leitura."],
    subjectPlain: "A revisão de {host} está pronta.",
    preheader: "As seis notas estão abertas. {count} achados esperam sob o desfoque.",
    title: "A revisão de {host} está pronta.",
    lead: "As seis notas estão à vista. Os achados seguem embaçados, com o suficiente para saber quais importam.",
    subjectClear: "{host} tirou {score}/100 e passou em todas as verificações com nota.",
    preheaderClear: "Seis notas e nenhum achado. O site passou em todas as verificações com nota.",
    leadClear: "As seis notas estão à vista e o site passou em todas as verificações com nota. Não há achados para corrigir.",
    outOf: "de 100",
    pages: "páginas analisadas",
    pagesFound: "de {n} encontradas",
    cases: "casos de teste propostos",
    findings: "O que corrigir primeiro",
    more: "+{n} achados no relatório completo",
    open: "Desbloquear o relatório completo",
    openNote: "De lá você baixa, exporta os casos de teste ou imprime.",
    reopen: "Abrir o último relatório",
    another: "Revisar outra URL",
    deeper: "Quer ir mais fundo?",
    deeperLines: ["Quer avaliar mais páginas, mais links ou mais sites?", "Quer casos de teste reais e completos, rodando em um ou em todos os frameworks de automação?"],
    deeperCta: "Escreva para qa@carlosandmunoz.com",
    deeperSubject: "Ir mais fundo com {host}",
    why: "Você recebe isto porque uma revisão de {host} foi feita com este e-mail em carlosandmunoz.com.",
    stop: "Parar de receber notas",
    subjectOpen: "{host} tirou {score}/100. O relatório completo está aberto.",
    subjectRerun: "Sua revisão de {host} rodou de novo e está pronta.",
    subjectStopped: "Sua revisão de {host} parou antes da última página.",
    titleStopped: "A revisão de {host} parou antes da última página.",
    preheaderOpen: "Seis notas e {count} achados, tudo aberto.",
    leadOpen: "As seis notas e os achados estão abertos, cada linha completa.",
    leadStopped: "Ela parou antes da última página, então cobre as páginas analisadas até ali.",
    rerun: "Sua revisão anterior de {host} falhou em {date}. Ela rodou de novo quando a causa foi resolvida, e este é o resultado, aberto sem custo.",
    rerunUndated: "Sua revisão anterior de {host} falhou. Ela rodou de novo quando a causa foi resolvida, e este é o resultado, aberto sem custo.",
    openFull: "Abrir o relatório completo",
    account: "Suas revisões",
    kept: "Guardado até {date}",
    live: "As notas públicas desta revisão podem aparecer como Live Report. Se o site é seu e você quer removê-lo, escreva para qa@carlosandmunoz.com.",
    controller: "Carlos A. Muñoz, {postal}, é o responsável pelos seus dados.",
    legal: "Como são usados",
    areas: { SEO: "SEO", GEO: "GEO", Analytics: "Analytics", Security: "Segurança", Accessibility: "Acessibilidade", Performance: "Desempenho" },
    page: ["Parar as notas?", "Sim, parar", "Pronto. Nenhuma nota a mais vai para {email}.", "Este link não vale mais."]
  },
  de: {
    subjects: ["{host} hat {score}/100. Der Rest liegt unter Milchglas.", "{score}/100 für {host}. Wo die Punkte verloren gingen.", "{host}: {score} von 100 und eine Liste, die sich lohnt."],
    subjectPlain: "Die Prüfung von {host} ist fertig.",
    preheader: "Die sechs Werte sind offen. {count} Befunde warten unter der Unschärfe.",
    title: "Die Prüfung von {host} ist fertig.",
    lead: "Die sechs Werte liegen offen. Die Befunde stehen unter Milchglas, gerade so sichtbar, dass man erkennt, welche zählen.",
    subjectClear: "{host} hat {score}/100 und besteht alle bewerteten Checks.",
    preheaderClear: "Sechs Werte, keine Befunde. Die Website besteht alle bewerteten Checks.",
    leadClear: "Die sechs Werte liegen offen, und die Website besteht alle bewerteten Checks. Es gibt nichts zu beheben.",
    outOf: "von 100",
    pages: "geprüfte Seiten",
    pagesFound: "von {n} gefundenen",
    cases: "vorgeschlagene Testfälle",
    findings: "Was zuerst zu beheben ist",
    more: "+{n} weitere Befunde im vollständigen Bericht",
    open: "Vollständigen Bericht freischalten",
    openNote: "Dort können Sie ihn herunterladen, die Testfälle exportieren oder drucken.",
    reopen: "Letzten Bericht öffnen",
    another: "Eine andere URL prüfen",
    deeper: "Möchten Sie tiefer gehen?",
    deeperLines: ["Mehr Seiten, mehr Links oder mehr Websites prüfen?", "Echte, vollständige Testfälle in einem oder allen Automatisierungs-Frameworks ausführen?"],
    deeperCta: "Schreiben Sie an qa@carlosandmunoz.com",
    deeperSubject: "Tiefer gehen mit {host}",
    why: "Sie erhalten diese Nachricht, weil mit dieser Adresse eine Prüfung von {host} auf carlosandmunoz.com gestartet wurde.",
    stop: "Keine Notizen mehr",
    subjectOpen: "{host} hat {score}/100. Der vollständige Bericht ist offen.",
    subjectRerun: "Ihre Prüfung von {host} lief erneut und ist fertig.",
    subjectStopped: "Ihre Prüfung von {host} hat vor der letzten Seite angehalten.",
    titleStopped: "Die Prüfung von {host} hat vor der letzten Seite angehalten.",
    preheaderOpen: "Sechs Werte und {count} Befunde, alles offen.",
    leadOpen: "Die sechs Werte und die Befunde liegen offen, jede Zeile vollständig.",
    leadStopped: "Sie hat vor der letzten Seite angehalten und umfasst die bis dahin geprüften Seiten.",
    rerun: "Ihre frühere Prüfung von {host} ist am {date} fehlgeschlagen. Sie lief erneut, nachdem die Ursache behoben war. Hier ist das Ergebnis, offen und kostenlos.",
    rerunUndated: "Ihre frühere Prüfung von {host} ist fehlgeschlagen. Sie lief erneut, nachdem die Ursache behoben war. Hier ist das Ergebnis, offen und kostenlos.",
    openFull: "Vollständigen Bericht öffnen",
    account: "Ihre Prüfungen",
    kept: "Gespeichert bis {date}",
    live: "Öffentliche Werte aus dieser Prüfung können als Live Report erscheinen. Gehört Ihnen die Website und soll er entfernt werden, schreiben Sie an qa@carlosandmunoz.com.",
    controller: "Carlos A. Muñoz, {postal}, ist für Ihre Daten verantwortlich.",
    legal: "Wie sie verwendet werden",
    areas: { SEO: "SEO", GEO: "GEO", Analytics: "Analytics", Security: "Sicherheit", Accessibility: "Barrierefreiheit", Performance: "Leistung" },
    page: ["Keine Notizen mehr?", "Ja, stoppen", "Erledigt. An {email} gehen keine Notizen mehr.", "Dieser Link gilt nicht mehr."]
  },
  fr: {
    subjects: ["{host} obtient {score}/100. Le reste est sous verre dépoli.", "{score}/100 pour {host}. Voici où sont partis les points.", "{host} : {score} sur 100, et une liste qui vaut la lecture."],
    subjectPlain: "La revue de {host} est prête.",
    preheader: "Les six notes sont ouvertes. {count} constats attendent sous le flou.",
    title: "La revue de {host} est prête.",
    lead: "Les six notes sont à découvert. Les constats restent sous verre dépoli, juste assez visibles pour savoir lesquels comptent.",
    subjectClear: "{host} obtient {score}/100 et réussit tous les contrôles notés.",
    preheaderClear: "Six notes et aucun constat. Le site réussit tous les contrôles notés.",
    leadClear: "Les six notes sont à découvert, et le site réussit tous les contrôles notés. Il n'y a aucun constat à corriger.",
    outOf: "sur 100",
    pages: "pages analysées",
    pagesFound: "sur {n} trouvées",
    cases: "cas de test proposés",
    findings: "À corriger en premier",
    more: "+{n} autres constats dans le rapport complet",
    open: "Débloquer le rapport complet",
    openNote: "De là, vous pouvez le télécharger, exporter les cas de test ou l'imprimer.",
    reopen: "Ouvrir le dernier rapport",
    another: "Analyser une autre URL",
    deeper: "Envie d'aller plus loin ?",
    deeperLines: ["Évaluer plus de pages, plus de liens ou plus de sites ?", "Faire tourner de vrais cas de test complets dans un ou tous les frameworks d'automatisation ?"],
    deeperCta: "Écrivez à qa@carlosandmunoz.com",
    deeperSubject: "Aller plus loin avec {host}",
    why: "Vous recevez ce message parce qu'une revue de {host} a été lancée avec cette adresse sur carlosandmunoz.com.",
    stop: "Ne plus recevoir de notes",
    subjectOpen: "{host} obtient {score}/100. Le rapport complet est ouvert.",
    subjectRerun: "Votre revue de {host} a été relancée et elle est prête.",
    subjectStopped: "Votre revue de {host} s'est arrêtée avant la dernière page.",
    titleStopped: "La revue de {host} s'est arrêtée avant la dernière page.",
    preheaderOpen: "Six notes et {count} constats, tout est ouvert.",
    leadOpen: "Les six notes et les constats sont ouverts, chaque ligne en entier.",
    leadStopped: "Elle s'est arrêtée avant la dernière page et couvre les pages analysées jusque-là.",
    rerun: "Votre revue précédente de {host} a échoué le {date}. Elle a été relancée une fois la cause levée, et voici le résultat, ouvert sans frais.",
    rerunUndated: "Votre revue précédente de {host} a échoué. Elle a été relancée une fois la cause levée, et voici le résultat, ouvert sans frais.",
    openFull: "Ouvrir le rapport complet",
    account: "Vos revues",
    kept: "Conservé jusqu'au {date}",
    live: "Les notes publiques de cette revue peuvent paraître dans un Live Report. Si le site vous appartient et que vous voulez le retirer, écrivez à qa@carlosandmunoz.com.",
    controller: "Carlos A. Muñoz, {postal}, est responsable de vos données.",
    legal: "Comment elles sont utilisées",
    areas: { SEO: "SEO", GEO: "GEO", Analytics: "Analytics", Security: "Sécurité", Accessibility: "Accessibilité", Performance: "Performance" },
    page: ["Arrêter les notes ?", "Oui, arrêter", "C'est fait. Plus aucune note n'ira à {email}.", "Ce lien n'est plus valide."]
  },
  it: {
    subjects: ["{host} ha preso {score}/100. Il resto è sotto vetro smerigliato.", "{score}/100 per {host}. Ecco dove sono finiti i punti.", "{host}: {score} su 100, e una lista che vale la pena leggere."],
    subjectPlain: "La revisione di {host} è pronta.",
    preheader: "I sei punteggi sono aperti. {count} rilievi aspettano sotto la sfocatura.",
    title: "La revisione di {host} è pronta.",
    lead: "I sei punteggi sono in chiaro. I rilievi restano sotto vetro smerigliato, quanto basta per capire quali contano.",
    subjectClear: "{host} ha preso {score}/100 e ha superato tutti i controlli con punteggio.",
    preheaderClear: "Sei punteggi e nessun rilievo. Il sito ha superato tutti i controlli con punteggio.",
    leadClear: "I sei punteggi sono in chiaro e il sito ha superato tutti i controlli con punteggio. Non ci sono rilievi da sistemare.",
    outOf: "su 100",
    pages: "pagine analizzate",
    pagesFound: "su {n} trovate",
    cases: "casi di test proposti",
    findings: "Cosa sistemare prima",
    more: "+{n} altri rilievi nel report completo",
    open: "Sblocca il report completo",
    openNote: "Da lì puoi scaricarlo, esportare i casi di test o stamparlo.",
    reopen: "Apri l'ultimo report",
    another: "Rivedi un altro URL",
    deeper: "Vuoi andare più a fondo?",
    deeperLines: ["Valutare più pagine, più link o più siti?", "Eseguire casi di test reali e completi in uno o in tutti i framework di automazione?"],
    deeperCta: "Scrivi a qa@carlosandmunoz.com",
    deeperSubject: "Andare più a fondo con {host}",
    why: "Ricevi questo messaggio perché con questo indirizzo è stata avviata una revisione di {host} su carlosandmunoz.com.",
    stop: "Non ricevere più note",
    subjectOpen: "{host} ha preso {score}/100. Il report completo è aperto.",
    subjectRerun: "La tua revisione di {host} è stata rifatta ed è pronta.",
    subjectStopped: "La tua revisione di {host} si è fermata prima dell'ultima pagina.",
    titleStopped: "La revisione di {host} si è fermata prima dell'ultima pagina.",
    preheaderOpen: "Sei punteggi e {count} rilievi, tutto aperto.",
    leadOpen: "I sei punteggi e i rilievi sono aperti, ogni riga per intero.",
    leadStopped: "Si è fermata prima dell'ultima pagina, quindi copre le pagine analizzate fin lì.",
    rerun: "La tua revisione precedente di {host} non è riuscita il {date}. È stata rifatta quando la causa è stata risolta, ed ecco il risultato, aperto senza costi.",
    rerunUndated: "La tua revisione precedente di {host} non è riuscita. È stata rifatta quando la causa è stata risolta, ed ecco il risultato, aperto senza costi.",
    openFull: "Apri il report completo",
    account: "Le tue revisioni",
    kept: "Conservato fino al {date}",
    live: "I punteggi pubblici di questa revisione possono comparire in un Live Report. Se il sito è tuo e vuoi rimuoverlo, scrivi a qa@carlosandmunoz.com.",
    controller: "Carlos A. Muñoz, {postal}, è responsabile dei tuoi dati.",
    legal: "Come vengono usati",
    areas: { SEO: "SEO", GEO: "GEO", Analytics: "Analytics", Security: "Sicurezza", Accessibility: "Accessibilità", Performance: "Prestazioni" },
    page: ["Fermare le note?", "Sì, fermale", "Fatto. Nessun'altra nota arriverà a {email}.", "Questo link non è più valido."]
  }
};

const PDF_COPY = {
  en: { badgeOpen: "Full report", attachedOpen: "The full report is attached as a PDF.", fileOpen: "report", badge: "Blurred preview", note: "The opening of each line is readable. The rest stays blurred until the report is unlocked.", findings: "Findings", cases: "Proposed test cases", moreCases: "+{n} more cases in the full report", unlock: "Unlock the full report", attached: "The blurred report is attached as a PDF.", fails: "fail now", risks: "at risk", read: "Analyzed on {date}", file: "blurred-report", sev: { critical: "critical", high: "high", medium: "medium", low: "low" } },
  es: { badgeOpen: "Informe completo", attachedOpen: "El informe completo va adjunto en PDF.", fileOpen: "informe", badge: "Vista previa empañada", note: "El comienzo de cada línea se puede leer. El resto sigue empañado hasta desbloquear el informe.", findings: "Hallazgos", cases: "Casos de prueba propuestos", moreCases: "+{n} casos más en el informe completo", unlock: "Desbloquear el informe completo", attached: "El informe empañado va adjunto en PDF.", fails: "fallan ahora", risks: "en riesgo", read: "Analizado el {date}", file: "informe-empanado", sev: { critical: "crítico", high: "alto", medium: "medio", low: "bajo" } },
  pt: { badgeOpen: "Relatório completo", attachedOpen: "O relatório completo vai anexado em PDF.", fileOpen: "relatorio", badge: "Prévia embaçada", note: "O início de cada linha pode ser lido. O resto fica embaçado até o relatório ser desbloqueado.", findings: "Achados", cases: "Casos de teste propostos", moreCases: "+{n} casos a mais no relatório completo", unlock: "Desbloquear o relatório completo", attached: "O relatório embaçado vai anexado em PDF.", fails: "falham agora", risks: "em risco", read: "Analisado em {date}", file: "relatorio-embacado", sev: { critical: "crítico", high: "alto", medium: "médio", low: "baixo" } },
  de: { badgeOpen: "Vollständiger Bericht", attachedOpen: "Der vollständige Bericht liegt als PDF bei.", fileOpen: "bericht", badge: "Verschwommene Vorschau", note: "Der Anfang jeder Zeile ist lesbar. Der Rest bleibt verschwommen, bis der Bericht freigeschaltet ist.", findings: "Befunde", cases: "Vorgeschlagene Testfälle", moreCases: "+{n} weitere Fälle im vollständigen Bericht", unlock: "Vollständigen Bericht freischalten", attached: "Der verschwommene Bericht liegt als PDF bei.", fails: "schlagen fehl", risks: "gefährdet", read: "Geprüft am {date}", file: "verschwommener-bericht", sev: { critical: "kritisch", high: "hoch", medium: "mittel", low: "niedrig" } },
  fr: { badgeOpen: "Rapport complet", attachedOpen: "Le rapport complet est joint en PDF.", fileOpen: "rapport", badge: "Aperçu flouté", note: "Le début de chaque ligne est lisible. Le reste reste flou jusqu'au déverrouillage du rapport.", findings: "Constats", cases: "Cas de test proposés", moreCases: "+{n} cas de plus dans le rapport complet", unlock: "Déverrouiller le rapport complet", attached: "Le rapport flouté est joint en PDF.", fails: "échouent", risks: "à risque", read: "Analysé le {date}", file: "rapport-floute", sev: { critical: "critique", high: "élevé", medium: "moyen", low: "faible" } },
  it: { badgeOpen: "Rapporto completo", attachedOpen: "Il rapporto completo è allegato in PDF.", fileOpen: "rapporto", badge: "Anteprima sfocata", note: "L'inizio di ogni riga è leggibile. Il resto resta sfocato finché il rapporto non viene sbloccato.", findings: "Risultati", cases: "Casi di test proposti", moreCases: "+{n} casi in più nel rapporto completo", unlock: "Sblocca il rapporto completo", attached: "Il rapporto sfocato è allegato in PDF.", fails: "falliscono ora", risks: "a rischio", read: "Analizzato il {date}", file: "rapporto-sfocato", sev: { critical: "critico", high: "alto", medium: "medio", low: "basso" } }
};
// The lead and preheader of a review with no score, so the mail never mentions six scores it does not show.
const PLAIN = {
  en: { lead: "The findings sit under frost, with just enough showing to tell which ones matter.", leadOpen: "The findings are open, each line in full.", preheader: "{count} findings wait under the blur.", preheaderOpen: "{count} findings, all open.", leadClear: "No findings came up on the pages analyzed, so there is nothing to fix.", preheaderClear: "No findings came up on the pages analyzed." },
  es: { lead: "Los hallazgos siguen empañados, con lo justo para saber cuáles importan.", leadOpen: "Los hallazgos están abiertos, cada línea completa.", preheader: "{count} hallazgos esperan bajo el desenfoque.", preheaderOpen: "{count} hallazgos, todo abierto.", leadClear: "No salió ningún hallazgo en las páginas analizadas, así que no hay nada que arreglar.", preheaderClear: "No salió ningún hallazgo en las páginas analizadas." },
  pt: { lead: "Os achados seguem embaçados, com o suficiente para saber quais importam.", leadOpen: "Os achados estão abertos, cada linha completa.", preheader: "{count} achados esperam sob o desfoque.", preheaderOpen: "{count} achados, tudo aberto.", leadClear: "Nenhum achado apareceu nas páginas analisadas, então não há nada para corrigir.", preheaderClear: "Nenhum achado apareceu nas páginas analisadas." },
  de: { lead: "Die Befunde stehen unter Milchglas, gerade so sichtbar, dass man erkennt, welche zählen.", leadOpen: "Die Befunde liegen offen, jede Zeile vollständig.", preheader: "{count} Befunde warten unter der Unschärfe.", preheaderOpen: "{count} Befunde, alles offen.", leadClear: "Auf den geprüften Seiten gab es keine Befunde, es gibt also nichts zu beheben.", preheaderClear: "Auf den geprüften Seiten gab es keine Befunde." },
  fr: { lead: "Les constats restent sous verre dépoli, juste assez visibles pour savoir lesquels comptent.", leadOpen: "Les constats sont ouverts, chaque ligne en entier.", preheader: "{count} constats attendent sous le flou.", preheaderOpen: "{count} constats, tout est ouvert.", leadClear: "Aucun constat sur les pages analysées, donc rien à corriger.", preheaderClear: "Aucun constat sur les pages analysées." },
  it: { lead: "I rilievi restano sotto vetro smerigliato, quanto basta per capire quali contano.", leadOpen: "I rilievi sono aperti, ogni riga per intero.", preheader: "{count} rilievi aspettano sotto la sfocatura.", preheaderOpen: "{count} rilievi, tutto aperto.", leadClear: "Nessun rilievo nelle pagine analizzate, quindi non c'è niente da sistemare.", preheaderClear: "Nessun rilievo nelle pagine analizzate." }
};
const FIX_LABEL = { en: "Fix", es: "Cómo arreglarlo", pt: "Como corrigir", de: "So beheben Sie es", fr: "Correctif", it: "Come correggere" };
// The comparison card's wording on the page (js/qa-review-compare-copy.js).
const CMP_COPY = {
  en: { title: "Next to a competitor", intro: "Your review of {own}{when} next to this review of {rival}.", introWhen: " from {date}", area: "Area", overall: "Overall", yourLead: "Your lead", wins: "{site} wins {n} of {total} indicators", sameWins: "The two sites win the same number of indicators", tally: "{own} {a}, {rival} {b}, level {c}.", onlyHas: "Only {site} has", openProblems: "open problems", shared_one: "{n} open problem is on both sites.", shared_other: "{n} open problems are on both sites.", more: "and {n} more", none: "None.", passive: "{rival} got the public, passive checks only: no chat conversation and no form sent.", verdictNote: "Both scores come from automated reviews, a starting point and not a verdict." },
  es: { title: "Frente a un competidor", intro: "Tu revisión de {own}{when} junto a esta revisión de {rival}.", introWhen: " del {date}", area: "Área", overall: "General", yourLead: "Tu ventaja", wins: "{site} gana {n} de {total} indicadores", sameWins: "Los dos sitios ganan el mismo número de indicadores", tally: "{own} {a}, {rival} {b}, empate {c}.", onlyHas: "Solo {site} tiene", openProblems: "problemas abiertos", shared_one: "{n} problema abierto está en los dos sitios.", shared_other: "{n} problemas abiertos están en los dos sitios.", more: "y {n} más", none: "Ninguno.", passive: "{rival} recibió solo las comprobaciones públicas y pasivas: sin conversación con el chat y sin enviar formularios.", verdictNote: "Las dos puntuaciones vienen de revisiones automatizadas: un punto de partida, no un veredicto." },
  pt: { title: "Ao lado de um concorrente", intro: "Sua revisão de {own}{when} ao lado desta revisão de {rival}.", introWhen: " de {date}", area: "Área", overall: "Geral", yourLead: "Sua vantagem", wins: "{site} vence {n} de {total} indicadores", sameWins: "Os dois sites vencem o mesmo número de indicadores", tally: "{own} {a}, {rival} {b}, empate {c}.", onlyHas: "Só {site} tem", openProblems: "problemas abertos", shared_one: "{n} problema aberto está nos dois sites.", shared_other: "{n} problemas abertos estão nos dois sites.", more: "e mais {n}", none: "Nenhum.", passive: "{rival} recebeu só as verificações públicas e passivas: sem conversa com o chat e sem envio de formulários.", verdictNote: "As duas pontuações vêm de revisões automatizadas: um ponto de partida, não um veredito." },
  de: { title: "Neben einem Mitbewerber", intro: "Ihre Prüfung von {own}{when} neben dieser Prüfung von {rival}.", introWhen: " vom {date}", area: "Bereich", overall: "Gesamt", yourLead: "Ihr Vorsprung", wins: "{site} gewinnt {n} von {total} Kennzahlen", sameWins: "Beide Websites gewinnen gleich viele Kennzahlen", tally: "{own} {a}, {rival} {b}, gleichauf {c}.", onlyHas: "Nur {site} hat", openProblems: "offene Probleme", shared_one: "{n} offenes Problem gibt es auf beiden Websites.", shared_other: "{n} offene Probleme gibt es auf beiden Websites.", more: "und {n} weitere", none: "Keine.", passive: "{rival} erhielt nur die öffentlichen, passiven Prüfungen: kein Chat-Gespräch und kein gesendetes Formular.", verdictNote: "Beide Werte stammen aus automatisierten Prüfungen: ein Ausgangspunkt, kein Urteil." },
  fr: { title: "Face à un concurrent", intro: "Votre analyse de {own}{when} à côté de cette analyse de {rival}.", introWhen: " du {date}", area: "Domaine", overall: "Global", yourLead: "Votre avance", wins: "{site} gagne {n} indicateurs sur {total}", sameWins: "Les deux sites gagnent le même nombre d’indicateurs", tally: "{own} {a}, {rival} {b}, égalité {c}.", onlyHas: "Seul {site} a", openProblems: "problèmes ouverts", shared_one: "{n} problème ouvert est présent sur les deux sites.", shared_other: "{n} problèmes ouverts sont présents sur les deux sites.", more: "et {n} de plus", none: "Aucun.", passive: "{rival} n’a reçu que les vérifications publiques et passives : aucune conversation avec le chat et aucun formulaire envoyé.", verdictNote: "Les deux scores viennent d’analyses automatisées : un point de départ, pas un verdict." },
  it: { title: "Accanto a un concorrente", intro: "La tua revisione di {own}{when} accanto a questa revisione di {rival}.", introWhen: " del {date}", area: "Area", overall: "Complessivo", yourLead: "Il tuo vantaggio", wins: "{site} vince {n} indicatori su {total}", sameWins: "I due siti vincono lo stesso numero di indicatori", tally: "{own} {a}, {rival} {b}, pari {c}.", onlyHas: "Solo {site} ha", openProblems: "problemi aperti", shared_one: "{n} problema aperto è presente su entrambi i siti.", shared_other: "{n} problemi aperti sono presenti su entrambi i siti.", more: "e altri {n}", none: "Nessuno.", passive: "{rival} ha ricevuto solo i controlli pubblici e passivi: nessuna conversazione con la chat e nessun modulo inviato.", verdictNote: "Entrambi i punteggi vengono da revisioni automatizzate: un punto di partenza, non un verdetto." }
};
const PDF_CASES = 24;
const FILLER_WORDS = "lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod tempor incididunt ut labore et dolore magna aliqua".split(" ");

function langOf(value) {
  const code = String(value || "").slice(0, 2).toLowerCase();
  return LANGS.indexOf(code) === -1 ? "en" : code;
}

const FINDING_COPY = {};

// A finding's title, evidence or fix in the mail's language; its English when the copy has no line for it.
function findingLine(lang, item, part) {
  if (!FINDING_COPY[lang]) FINDING_COPY[lang] = findingsCopy.forLang(lang);
  return FINDING_COPY[lang].line(item && item.msg && item.msg[part], String((item && item[part]) || ""));
}

function esc(value) {
  return String(value == null ? "" : value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function fill(text, vars) {
  return String(text || "").replace(/\{(\w+)\}/g, (all, key) => (vars[key] == null ? all : String(vars[key])));
}

function dateOf(value) {
  const when = new Date(value || "");
  return isNaN(when) ? "" : when.toISOString().slice(0, 10);
}

// Paid, free-account and re-run records open in full; the page and the account page open them too.
function isOpen(record) {
  return !!record && (record.paid === true || record.free === true);
}

function pageUrl(lang, params, file) {
  const url = new URL(SITE + "/" + (file || PAGE_FOR[langOf(lang)]));
  Object.keys(params || {}).forEach((key) => { if (params[key]) url.searchParams.set(key, params[key]); });
  url.searchParams.set("utm_source", "email");
  url.searchParams.set("utm_medium", "url-review");
  return url.toString();
}

function deeperUrl(t, host, reportId) {
  return "mailto:" + DEEPER + "?subject=" + encodeURIComponent(fill(t.deeperSubject, { host })) +
    (reportId ? "&body=" + encodeURIComponent("Report " + reportId + "\n\n") : "");
}

// The opening words up to about 45% of the line stay readable, the same share the page leaves clear.
function frost(title) {
  const text = String(title || "").replace(/\s+/g, " ").trim();
  if (text.length < 12) return { shown: text.slice(0, Math.ceil(text.length / 2)), hidden: Math.floor(text.length / 2) };
  const words = text.split(" ");
  let shown = "";
  for (const word of words) {
    const next = shown ? shown + " " + word : word;
    if (shown && next.length > text.length * 0.45) break;
    shown = next;
  }
  if (shown.length >= text.length) shown = words.slice(0, Math.max(1, words.length - 1)).join(" ");
  return { shown, hidden: Math.max(6, text.length - shown.length) };
}

function scoreColor(score) {
  if (score >= 80) return "#15803d";
  if (score >= 50) return "#b45309";
  return "#b91c1c";
}

const SEVERITY_COLOR = { critical: "#7f1d1d", high: "#b91c1c", medium: "#b45309", low: "#64748b" };

function reportFacts(record, open, lang) {
  const report = (record && record.report) || {};
  const insights = report.insights || {};
  const score = insights.score || null;
  const actionable = (Array.isArray(insights.findings) ? insights.findings : [])
    .filter((item) => item && (item.verdict === "fail" || item.verdict === "risk"))
    .sort((a, b) => (a.rank || 999) - (b.rank || 999));
  const counts = report.counts || {};
  const fails = actionable.filter((item) => item.verdict === "fail").length;
  return {
    id: String((record && record.id) || report.id || ""),
    host: String(report.host || "").slice(0, 120) || "your site",
    date: dateOf(report.fetchedAt || (record && record.createdAt)),
    score,
    pages: Number(counts.pages) || (Array.isArray(report.pages) ? report.pages.length : 0),
    found: Number(report.limits && report.limits.pagesFound) ? report.limits.pagesFound + (report.limits.pagesFoundPartial ? "+" : "") : "",
    cases: Number(counts.cases) || (Array.isArray(report.cases) ? report.cases.length : 0),
    findings: actionable.slice(0, SHOWN_FINDINGS).map((item) => Object.assign({ area: item.area || "", severity: item.severity || "low" },
      open ? { shown: findingLine(lang, item, "title").replace(/\s+/g, " ").trim(), hidden: 0, fix: findingLine(lang, item, "fix").replace(/\s+/g, " ").trim() } : frost(findingLine(lang, item, "title")))),
    moreCount: Math.max(0, actionable.length - SHOWN_FINDINGS),
    total: actionable.length,
    fails,
    risks: actionable.length - fails
  };
}

function button(href, label, primary) {
  const style = primary
    ? "display:inline-block;background:#0e7490;color:#ffffff;border:1px solid #0e7490;"
    : "display:inline-block;background:#ffffff;color:#0e7490;border:1px solid #9cc7d3;";
  return "<a href=\"" + esc(href) + "\" style=\"" + style + "text-decoration:none;font-family:Arial,Helvetica,sans-serif;font-size:15px;font-weight:bold;line-height:20px;padding:13px 22px;border-radius:10px;margin:0 8px 10px 0;\">" + esc(label) + "</a>";
}

function shell(lang, preheader, inner, footer) {
  return "<!DOCTYPE html><html lang=\"" + esc(lang) + "\"><head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\">" +
    "<meta name=\"color-scheme\" content=\"light\"><meta name=\"supported-color-schemes\" content=\"light\"><title>QA-lab URL Review</title></head>" +
    "<body style=\"margin:0;padding:0;background:#e8eef4;\">" +
    "<div style=\"display:none;max-height:0;overflow:hidden;opacity:0;color:#e8eef4;\">" + esc(preheader) + "&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;</div>" +
    "<table role=\"presentation\" width=\"100%\" cellpadding=\"0\" cellspacing=\"0\" style=\"background:#e8eef4;\"><tr><td align=\"center\" style=\"padding:28px 12px;\">" +
    "<table role=\"presentation\" width=\"100%\" cellpadding=\"0\" cellspacing=\"0\" style=\"max-width:600px;\">" +
    inner +
    "<tr><td style=\"padding:20px 8px 0;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:18px;color:#5b6b7b;text-align:center;\">" + footer + "</td></tr>" +
    "</table></td></tr></table></body></html>";
}

function deeperBlock(t, host, reportId) {
  return "<tr><td style=\"padding:0 0 16px;\"><table role=\"presentation\" width=\"100%\" cellpadding=\"0\" cellspacing=\"0\" bgcolor=\"#0f172a\" style=\"background:#0f172a;background-image:linear-gradient(120deg,#0f172a 0%,#134e5e 100%);border-radius:16px;\">" +
    "<tr><td style=\"padding:26px 28px;font-family:Arial,Helvetica,sans-serif;\">" +
    "<p style=\"margin:0 0 12px;font-size:20px;line-height:26px;color:#ffffff;font-weight:bold;\">" + esc(t.deeper) + "</p>" +
    t.deeperLines.map((line) => "<p style=\"margin:0 0 8px;font-size:15px;line-height:22px;color:#cfe3ea;\"><span style=\"color:#5eead4;\">&rarr;</span>&nbsp; " + esc(line) + "</p>").join("") +
    "<p style=\"margin:16px 0 0;\"><a href=\"" + esc(deeperUrl(t, host, reportId)) + "\" style=\"display:inline-block;background:#5eead4;color:#0f172a;text-decoration:none;font-size:15px;font-weight:bold;line-height:20px;padding:12px 20px;border-radius:10px;\">" + esc(t.deeperCta) + "</a></p>" +
    "</td></tr></table></td></tr>";
}

function link(href, label) {
  return "<a href=\"" + esc(href) + "\" style=\"color:#0e7490;\">" + esc(label) + "</a>";
}

// `kept` is the retention date and `live` adds the Live Reports line; both belong to the report mail only.
function footerHtml(t, why, opts) {
  const o = opts || {};
  return esc(why) + "<br>" +
    (o.live ? esc(t.live).replace(DEEPER, link("mailto:" + DEEPER, DEEPER)) + "<br>" : "") +
    (o.kept ? esc(fill(t.kept, { date: o.kept })) + " &middot; " : "") +
    (o.stopUrl ? link(o.stopUrl, t.stop) + " &middot; " : "") +
    link(ACCOUNT_URL, t.account) + " &middot; " + link(SITE + "/qa-review.html", "QA-lab URL Review") + "<br>" +
    esc(fill(t.controller, { postal: POSTAL })) + " " + link(LEGAL_URL, t.legal);
}

function footerText(t, why, opts) {
  const o = opts || {};
  return [
    why,
    o.live ? t.live : "",
    o.kept ? fill(t.kept, { date: o.kept }) : "",
    o.stopUrl ? t.stop + ": " + o.stopUrl : "",
    t.account + ": " + ACCOUNT_URL,
    "QA-lab URL Review · " + SITE + "/qa-review.html",
    fill(t.controller, { postal: POSTAL }) + " " + t.legal + ": " + LEGAL_URL
  ].filter(Boolean).join("\n");
}

function metaHtml(t, p, facts) {
  return "<p style=\"margin:14px 0 0;font-size:13px;line-height:19px;color:#cbd5e1;\">" +
    [facts.date ? esc(fill(p.read, { date: facts.date })) : "", facts.pages + " " + esc(t.pages) + (facts.found ? " " + esc(t.pagesFound.replace("{n}", facts.found)) : ""), facts.cases + " " + esc(t.cases)].filter(Boolean).join(" &middot; ") + "</p>" +
    (facts.total ? "<p style=\"margin:4px 0 0;font-size:13px;line-height:19px;font-weight:bold;\"><span style=\"color:#fca5a5;\">" + facts.fails + " " + esc(p.fails) + "</span><span style=\"color:#cbd5e1;\"> &middot; </span><span style=\"color:#fcd34d;\">" + facts.risks + " " + esc(p.risks) + "</span></p>" : "");
}

function metaText(t, p, facts) {
  return [
    [facts.date ? fill(p.read, { date: facts.date }) : "", facts.pages + " " + t.pages + (facts.found ? " " + t.pagesFound.replace("{n}", facts.found) : ""), facts.cases + " " + t.cases].filter(Boolean).join(" · "),
    facts.total ? facts.fails + " " + p.fails + " · " + facts.risks + " " + p.risks : ""
  ].filter(Boolean).join("\n");
}

function scoreBlock(t, p, facts, title) {
  if (!facts.score) return "";
  const overall = Number(facts.score.overall) || 0;
  const bars = AREAS.map((area) => {
    const row = (facts.score.areas || {})[area];
    if (!row) return "";
    const value = Math.max(0, Math.min(100, Number(row.score) || 0));
    return "<tr>" +
      "<td style=\"padding:5px 10px 5px 0;font-family:Arial,Helvetica,sans-serif;font-size:13px;color:#334155;white-space:nowrap;width:112px;\">" + esc(t.areas[area] || area) + "</td>" +
      "<td style=\"padding:5px 0;\"><table role=\"presentation\" width=\"100%\" cellpadding=\"0\" cellspacing=\"0\" style=\"background:#e5eaf0;border-radius:6px;\"><tr>" +
      (value > 0 ? "<td width=\"" + value + "%\" style=\"height:10px;line-height:10px;font-size:0;background:" + scoreColor(value) + ";border-radius:6px;\">&nbsp;</td>" : "") +
      (value < 100 ? "<td style=\"height:10px;line-height:10px;font-size:0;\">&nbsp;</td>" : "") +
      "</tr></table></td>" +
      "<td style=\"padding:5px 0 5px 12px;font-family:Arial,Helvetica,sans-serif;font-size:14px;font-weight:bold;color:" + scoreColor(value) + ";text-align:right;width:34px;\">" + value + "</td>" +
      "</tr>";
  }).join("");
  return "<tr><td bgcolor=\"#0f172a\" style=\"background:#0f172a;background-image:linear-gradient(135deg,#0f172a 0%,#0e7490 100%);border-radius:16px 16px 0 0;padding:30px 28px 26px;font-family:Arial,Helvetica,sans-serif;\">" +
    "<p style=\"margin:0 0 6px;font-size:12px;letter-spacing:0.12em;text-transform:uppercase;color:#7dd3fc;\">QA-lab URL Review</p>" +
    "<p style=\"margin:0 0 18px;font-size:22px;line-height:28px;color:#ffffff;\">" + esc(title) + "</p>" +
    "<table role=\"presentation\" cellpadding=\"0\" cellspacing=\"0\"><tr>" +
    "<td style=\"font-size:64px;line-height:64px;font-weight:bold;color:#ffffff;padding-right:14px;\">" + overall + "</td>" +
    "<td style=\"vertical-align:bottom;padding-bottom:8px;\"><span style=\"display:inline-block;background:" + scoreColor(overall) + ";color:#ffffff;font-size:14px;font-weight:bold;padding:4px 10px;border-radius:999px;\">" + esc(facts.score.grade || "") + "</span><br><span style=\"font-size:13px;color:#cbd5e1;\">" + esc(t.outOf) + "</span></td>" +
    "</tr></table>" +
    metaHtml(t, p, facts) +
    "</td></tr>" +
    "<tr><td bgcolor=\"#ffffff\" style=\"background:#ffffff;padding:20px 28px 8px;\"><table role=\"presentation\" width=\"100%\" cellpadding=\"0\" cellspacing=\"0\">" + bars + "</table></td></tr>";
}

function findingsBlock(t, p, lang, facts) {
  if (!facts.findings.length) return "";
  const rows = facts.findings.map((item) =>
    "<tr><td style=\"padding:10px 0;border-top:1px solid #eef2f6;font-family:Arial,Helvetica,sans-serif;\">" +
    "<span style=\"display:inline-block;width:8px;height:8px;border-radius:8px;background:" + (SEVERITY_COLOR[item.severity] || SEVERITY_COLOR.low) + ";\"></span>&nbsp; " +
    "<span style=\"font-size:11px;letter-spacing:0.06em;text-transform:uppercase;color:#64748b;\">" + esc(t.areas[item.area] || item.area) + " &middot; </span>" +
    "<span style=\"font-size:11px;letter-spacing:0.06em;text-transform:uppercase;font-weight:bold;color:" + (SEVERITY_COLOR[item.severity] || SEVERITY_COLOR.low) + ";\">" + esc(p.sev[item.severity] || item.severity) + "</span><br>" +
    "<span style=\"font-size:15px;line-height:24px;color:#0f172a;\">" + esc(item.shown) + "</span>" +
    (item.hidden ? " <span aria-hidden=\"true\" style=\"display:inline-block;background:#d6dee8;color:#d6dee8;border-radius:5px;font-size:15px;line-height:18px;\">" + "&nbsp;".repeat(Math.min(34, item.hidden)) + "</span>" : "") +
    (item.fix ? "<br><span style=\"font-size:13px;line-height:20px;color:#475569;\"><b style=\"color:#0e7490;\">" + esc(FIX_LABEL[lang]) + ":</b> " + esc(item.fix) + "</span>" : "") +
    "</td></tr>"
  ).join("");
  const more = facts.moreCount ? "<p style=\"margin:8px 0 0;font-family:Arial,Helvetica,sans-serif;font-size:13px;color:#64748b;\">" + esc(fill(t.more, { n: facts.moreCount })) + "</p>" : "";
  return "<tr><td bgcolor=\"#ffffff\" style=\"background:#ffffff;padding:14px 28px 6px;\">" +
    "<p style=\"margin:0 0 6px;font-family:Arial,Helvetica,sans-serif;font-size:13px;font-weight:bold;letter-spacing:0.08em;text-transform:uppercase;color:#0e7490;\">" + esc(t.findings) + "</p>" +
    "<table role=\"presentation\" width=\"100%\" cellpadding=\"0\" cellspacing=\"0\">" + rows + "</table>" + more +
    "</td></tr>";
}

const OWN_COLOR = "#0e7490";
const RIVAL_COLOR = "#7c3aed";

function scoreOf(value) {
  return typeof value === "number" && isFinite(value) ? value : null;
}

// A competitor run carries the comparison with the asker's own review; the mail and the PDF show its scores and counts.
function compareFacts(record, lang) {
  const cmp = record && record.report && record.report.compare;
  if (!cmp || !cmp.overall) return null;
  const c = CMP_COPY[lang];
  const t = COPY[lang];
  const own = String(cmp.ownHost || "").slice(0, 120);
  const rival = String(cmp.rivalHost || record.report.host || "").slice(0, 120);
  const areas = Array.isArray(cmp.areas) ? cmp.areas : [];
  const rows = [{ label: c.overall, own: scoreOf(cmp.overall.own), rival: scoreOf(cmp.overall.rival) }].concat(AREAS.map((area) => {
    const row = areas.find((item) => item && item.area === area);
    return row ? { label: t.areas[area] || area, own: scoreOf(row.own), rival: scoreOf(row.rival) } : null;
  }).filter(Boolean)).map((row) => Object.assign(row, { lead: row.own == null || row.rival == null ? null : row.own - row.rival }));
  const wins = cmp.dominance || { own: 0, rival: 0, tie: 0 };
  const decided = (wins.own || 0) + (wins.rival || 0) + (wins.tie || 0);
  const ahead = wins.own === wins.rival ? "" : wins.own > wins.rival ? "own" : "rival";
  const shared = Number(cmp.shared) || 0;
  const date = dateOf(cmp.ownAt);
  const side = (items, count) => ({ items: (Array.isArray(items) ? items : []).map((item) => Object.assign({}, item, { title: findingLine(lang, item, "title") })), count: Number(count) || 0 });
  return {
    own,
    rival,
    ownId: String(cmp.ownId || "").replace(/[^a-f0-9]/g, "").slice(0, 32),
    intro: { own, when: date ? fill(c.introWhen, { date }) : "", rival },
    rows,
    verdict: decided ? (ahead ? fill(c.wins, { site: ahead === "own" ? own : rival, n: wins[ahead], total: decided }) : c.sameWins) + ". " +
      fill(c.tally, { own, a: wins.own || 0, rival, b: wins.rival || 0, c: wins.tie || 0 }) : "",
    ownOnly: side(cmp.ownOnly, cmp.ownOnlyCount),
    rivalOnly: side(cmp.rivalOnly, cmp.rivalOnlyCount),
    shared: fill(shared === 1 ? c.shared_one : c.shared_other, { n: shared }),
    note: fill(c.passive, { rival }) + " " + c.verdictNote
  };
}

function leadText(lead) {
  return lead == null ? "–" : (lead > 0 ? "+" : "") + lead;
}

function leadColor(lead) {
  return lead == null || lead === 0 ? "#64748b" : lead > 0 ? "#15803d" : "#b91c1c";
}

function compareBlock(c, cf, baseUrl) {
  const font = "font-family:Arial,Helvetica,sans-serif;";
  const th = (text, color, align) => "<th style=\"" + font + "padding:0 0 6px 10px;font-size:11px;letter-spacing:0.04em;text-align:" + (align || "right") + ";color:" + color + ";font-weight:bold;word-break:break-all;\">" + esc(text) + "</th>";
  const td = (text, color, bold) => "<td style=\"" + font + "padding:6px 0 6px 10px;border-top:1px solid #eef2f6;font-size:14px;text-align:right;color:" + color + ";" + (bold ? "font-weight:bold;" : "") + "\">" + esc(text) + "</td>";
  const rows = cf.rows.map((row) =>
    "<tr><td style=\"" + font + "padding:6px 0;border-top:1px solid #eef2f6;font-size:13px;color:#334155;\">" + esc(row.label) + "</td>" +
    td(row.own == null ? "–" : row.own, row.own == null ? "#94a3b8" : scoreColor(row.own), true) +
    td(row.rival == null ? "–" : row.rival, row.rival == null ? "#94a3b8" : scoreColor(row.rival), true) +
    td(leadText(row.lead), leadColor(row.lead), true) + "</tr>").join("");
  const tile = (site, side, color) => "<td width=\"50%\" valign=\"top\" style=\"" + font + "padding:12px 14px;background:#f8fafc;border-top:3px solid " + color + ";border-radius:10px;\">" +
    "<p style=\"margin:0;font-size:12px;line-height:17px;color:#475569;word-break:break-all;\">" + esc(fill(c.onlyHas, { site })) + "</p>" +
    "<p style=\"margin:2px 0 0;font-size:26px;line-height:30px;font-weight:bold;color:" + color + ";\">" + side.count + "</p>" +
    "<p style=\"margin:0;font-size:12px;line-height:17px;color:#64748b;\">" + esc(c.openProblems) + "</p></td>";
  const ownName = "<b style=\"color:" + OWN_COLOR + ";\">" + esc(cf.own) + "</b>";
  return "<tr><td bgcolor=\"#ffffff\" style=\"background:#ffffff;padding:18px 28px 6px;\">" +
    "<p style=\"margin:0 0 6px;" + font + "font-size:13px;font-weight:bold;letter-spacing:0.08em;text-transform:uppercase;color:#0e7490;\">" + esc(c.title) + "</p>" +
    "<p style=\"margin:0 0 12px;" + font + "font-size:15px;line-height:23px;color:#334155;\">" + fill(esc(c.intro), {
      own: baseUrl ? "<a href=\"" + esc(baseUrl) + "\" style=\"text-decoration:underline;color:" + OWN_COLOR + ";\">" + ownName + "</a>" : ownName,
      when: esc(cf.intro.when),
      rival: "<b style=\"color:" + RIVAL_COLOR + ";\">" + esc(cf.rival) + "</b>"
    }) + "</p>" +
    "<table role=\"presentation\" width=\"100%\" cellpadding=\"0\" cellspacing=\"0\"><tr>" + th(c.area, "#64748b", "left") + th(cf.own, OWN_COLOR) + th(cf.rival, RIVAL_COLOR) + th(c.yourLead, "#64748b") + "</tr>" + rows + "</table>" +
    (cf.verdict ? "<p style=\"margin:12px 0 0;" + font + "font-size:14px;line-height:21px;color:#0f172a;font-weight:bold;\">" + esc(cf.verdict) + "</p>" : "") +
    "<table role=\"presentation\" width=\"100%\" cellpadding=\"0\" cellspacing=\"0\" style=\"margin:12px 0 0;\"><tr>" + tile(cf.own, cf.ownOnly, OWN_COLOR) + "<td width=\"12\" style=\"font-size:0;\">&nbsp;</td>" + tile(cf.rival, cf.rivalOnly, RIVAL_COLOR) + "</tr></table>" +
    "<p style=\"margin:10px 0 0;" + font + "font-size:13px;line-height:19px;color:#334155;\">" + esc(cf.shared) + "</p>" +
    "<p style=\"margin:6px 0 0;" + font + "font-size:12px;line-height:18px;color:#64748b;\">" + esc(cf.note) + "</p>" +
    "</td></tr>";
}

function compareText(c, cf) {
  return [
    c.title,
    fill(c.intro, cf.intro),
    cf.rows.map((row) => row.label + ": " + cf.own + " " + (row.own == null ? "–" : row.own) + " · " + cf.rival + " " + (row.rival == null ? "–" : row.rival) + " · " + c.yourLead + " " + leadText(row.lead)).join("\n"),
    cf.verdict,
    fill(c.onlyHas, { site: cf.own }) + ": " + cf.ownOnly.count + " " + c.openProblems + " · " + fill(c.onlyHas, { site: cf.rival }) + ": " + cf.rivalOnly.count + " " + c.openProblems,
    cf.shared,
    cf.note
  ].filter(Boolean).join("\n");
}

// What the report mail says depends on whether the record is open, a re-run, or stopped early.
function reportStory(record, t, facts, lang) {
  const open = isOpen(record);
  const plain = facts.score ? null : PLAIN[lang];
  const clear = !facts.total;
  const stopped = !!record && record.status === "stopped";
  const rerun = !!record && Array.isArray(record.rerunOf) && record.rerunOf.length > 0;
  const failedOn = rerun ? dateOf(record.failedAt) : "";
  const score = facts.score ? Number(facts.score.overall) || 0 : 0;
  const pick = Array.from(facts.id).reduce((sum, char) => sum + char.charCodeAt(0), 0) % t.subjects.length;
  const vars = { host: facts.host, score };
  const subject = stopped ? fill(t.subjectStopped, vars)
    : rerun ? fill(t.subjectRerun, vars)
      : !facts.score ? fill(t.subjectPlain, vars)
        : open ? fill(t.subjectOpen, vars)
          : clear ? fill(t.subjectClear, vars)
            : fill(t.subjects[pick], vars);
  const key = clear ? "Clear" : open ? "Open" : "";
  return {
    open,
    subject,
    title: fill(stopped ? t.titleStopped : t.title, vars),
    lead: [
      rerun ? fill(failedOn ? t.rerun : t.rerunUndated, { host: facts.host, date: failedOn }) : "",
      stopped ? t.leadStopped : "",
      (plain || t)["lead" + key]
    ].filter(Boolean).join(" "),
    preheader: fill((plain || t)["preheader" + key], { count: facts.total }),
    cta: open ? t.openFull : t.open
  };
}

function reportMail(record, options) {
  const opts = options || {};
  const lang = langOf(opts.lang || (record && record.lang));
  const t = COPY[lang];
  const p = PDF_COPY[lang];
  const facts = reportFacts(record, isOpen(record), lang);
  const story = reportStory(record, t, facts, lang);
  const attached = story.open ? p.attachedOpen : p.attached;
  const openUrl = pageUrl(lang, { report: facts.id, utm_campaign: "report" });
  const anotherUrl = pageUrl(lang, { utm_campaign: "report-another" });
  const cf = compareFacts(record, lang);
  const baseUrl = cf && cf.ownId ? pageUrl(lang, { report: cf.ownId, utm_campaign: "report-compare" }) : "";
  const scoreHtml = scoreBlock(t, p, facts, story.title);
  const head = scoreHtml || "<tr><td bgcolor=\"#0f172a\" style=\"background:#0f172a;background-image:linear-gradient(135deg,#0f172a 0%,#0e7490 100%);border-radius:16px 16px 0 0;padding:30px 28px 26px;font-family:Arial,Helvetica,sans-serif;\">" +
    "<p style=\"margin:0 0 6px;font-size:12px;letter-spacing:0.12em;text-transform:uppercase;color:#7dd3fc;\">QA-lab URL Review</p>" +
    "<p style=\"margin:0;font-size:22px;line-height:28px;color:#ffffff;\">" + esc(story.title) + "</p>" + metaHtml(t, p, facts) + "</td></tr>";
  const inner = head +
    "<tr><td bgcolor=\"#ffffff\" style=\"background:#ffffff;padding:16px 28px 4px;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:23px;color:#334155;\">" + esc(story.lead) + "</td></tr>" +
    (cf ? compareBlock(CMP_COPY[lang], cf, baseUrl) : "") +
    findingsBlock(t, p, lang, facts) +
    "<tr><td bgcolor=\"#ffffff\" style=\"background:#ffffff;border-radius:0 0 16px 16px;padding:18px 28px 22px;\">" +
    button(openUrl, story.cta, true) + button(anotherUrl, t.another, false) +
    "<p style=\"margin:4px 0 0;font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:19px;color:#64748b;\">" + esc(t.openNote) + "</p>" +
    (opts.attached ? "<p style=\"margin:10px 0 0;font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:19px;color:#0e7490;font-weight:bold;\">&#128206; " + esc(attached) + "</p>" : "") +
    "</td></tr>" +
    "<tr><td style=\"height:16px;line-height:16px;font-size:0;\">&nbsp;</td></tr>" +
    deeperBlock(t, facts.host, facts.id);
  const findingLines = facts.findings.map((item) => "- [" + (t.areas[item.area] || item.area) + " · " + (p.sev[item.severity] || item.severity) + "] " + item.shown + (item.hidden ? " …" : "") +
    (item.fix ? "\n  " + FIX_LABEL[lang] + ": " + item.fix : ""));
  const why = opts.why || fill(t.why, { host: facts.host });
  const foot = { stopUrl: opts.stopUrl, kept: dateOf(record && record.retainUntil), live: true };
  const text = [
    story.title,
    facts.score ? (Number(facts.score.overall) || 0) + " " + t.outOf + " (" + (facts.score.grade || "") + ")" : "",
    facts.score ? AREAS.filter((area) => facts.score.areas && facts.score.areas[area]).map((area) => (t.areas[area] || area) + " " + facts.score.areas[area].score).join(" · ") : "",
    metaText(t, p, facts),
    "",
    story.lead,
    cf ? "\n" + compareText(CMP_COPY[lang], cf) + (baseUrl ? "\n" + cf.own + ": " + baseUrl : "") : "",
    findingLines.length ? "\n" + t.findings + "\n" + findingLines.join("\n") : "",
    facts.moreCount ? fill(t.more, { n: facts.moreCount }) : "",
    "",
    story.cta + ": " + openUrl,
    opts.attached ? attached : "",
    t.another + ": " + anotherUrl,
    "",
    t.deeper,
    t.deeperLines.join("\n"),
    t.deeperCta,
    "",
    footerText(t, why, foot)
  ].filter((line, index, all) => line !== "" || all[index - 1] !== "").join("\n");
  return {
    lang,
    subject: story.subject.slice(0, 140),
    text: text.slice(0, 16000),
    html: shell(lang, story.preheader, inner, footerHtml(t, why, foot))
  };
}

function filler(length, seed) {
  const out = [];
  let size = 0;
  let at = seed || 0;
  while (size < length) {
    const word = FILLER_WORDS[at++ % FILLER_WORDS.length];
    out.push(word);
    size += word.length + 1;
  }
  return out.join(" ");
}

let frostStrip = "";

// One pre-blurred strip of filler words, cut into word-sized pieces. Chrome embeds it once,
// where a CSS blur on live text would be rasterized per word and push the PDF past 2 MB.
function stripUrl() {
  if (!frostStrip) {
    frostStrip = "data:image/png;base64," + require("fs").readFileSync(require("path").join(__dirname, "assets", "frost-strip.png")).toString("base64");
  }
  return frostStrip;
}

function frostedLine(text, seed) {
  const cut = frost(text);
  if (!cut.shown) return "";
  let at = seed || 0;
  const words = filler(cut.hidden, seed).split(" ").map((word) => {
    at += 7;
    return "<span class=\"fz\" style=\"width:" + (word.length * 0.5 + 0.2).toFixed(2) + "em;background-position:-" + (at % 38) + "em 50%\"></span>";
  });
  return esc(cut.shown) + " " + words.join(" ");
}

const PDF_STYLE = "@page{size:A4;margin:12mm 0 14mm}@page:first{margin:0 0 14mm}*{box-sizing:border-box}html,body{margin:0;padding:0}" +
  "body{font-family:Inter,'Helvetica Neue',Arial,sans-serif;color:#0f172a;background:#fff;-webkit-print-color-adjust:exact;print-color-adjust:exact;font-size:10.5pt;line-height:1.45}" +
  ".page{position:relative;z-index:1;padding:0 0 4mm}" +
  ".wm{position:fixed;top:-30%;left:-30%;width:160%;height:160%;z-index:3;pointer-events:none;display:flex;flex-wrap:wrap;align-content:space-around;justify-content:space-around;gap:18mm 26mm;transform:rotate(-30deg);font-size:13pt;font-weight:600;color:rgba(15,23,42,.08);white-space:nowrap;overflow:hidden}" +
  ".hero{background:#0f172a;background-image:radial-gradient(circle at 85% 20%,rgba(94,234,212,.28),transparent 45%),linear-gradient(135deg,#0f172a 0%,#0e4a5c 60%,#0e7490 100%);color:#fff;padding:14mm 16mm 12mm;display:flex;gap:10mm;align-items:center}" +
  ".hero .who{flex:1}.eyebrow{font-size:8.5pt;letter-spacing:.16em;text-transform:uppercase;color:#7dd3fc;margin:0 0 3mm}" +
  ".host{font-family:Georgia,'Times New Roman',serif;font-size:26pt;line-height:1.1;margin:0 0 3mm;word-break:break-all}" +
  ".meta{font-size:9pt;color:#cbd5e1;margin:0}.meta code{font-family:Menlo,Consolas,monospace;color:#e2e8f0}" +
  ".badge{display:inline-block;margin-top:4mm;padding:1.2mm 3.4mm;border-radius:99px;background:rgba(94,234,212,.16);border:1px solid rgba(94,234,212,.55);color:#99f6e4;font-size:8.5pt;font-weight:700;letter-spacing:.04em}" +
  ".ring{width:42mm;height:42mm;border-radius:50%;display:flex;align-items:center;justify-content:center;flex:none}" +
  ".ring div{width:33mm;height:33mm;border-radius:50%;background:#0f172a;display:flex;flex-direction:column;align-items:center;justify-content:center}" +
  ".ring b{font-size:30pt;line-height:1}.ring i{font-style:normal;font-size:8.5pt;color:#94a3b8}.ring em{font-style:normal;margin-top:1mm;padding:.6mm 2.6mm;border-radius:99px;font-size:9pt;font-weight:700;color:#fff}" +
  ".stats{display:flex;gap:4mm;padding:0 16mm;margin-top:-6mm}" +
  ".stat{flex:1;background:#fff;border:1px solid #dbe3ea;border-radius:4mm;padding:3.4mm 4mm}" +
  ".stat b{display:block;font-size:17pt;line-height:1.1}.stat span{font-size:8pt;color:#64748b;text-transform:uppercase;letter-spacing:.06em}" +
  ".sec{margin:7mm 16mm 0}.sec h2{font-size:9pt;letter-spacing:.14em;text-transform:uppercase;color:#0e7490;margin:0 0 3mm}" +
  ".note{font-size:9pt;color:#475569;margin:0 0 3mm}" +
  ".areas{display:grid;grid-template-columns:1fr 1fr;gap:2.4mm 8mm;background:#fff;border:1px solid #dbe3ea;border-radius:4mm;padding:5mm}" +
  ".area{display:grid;grid-template-columns:27mm 1fr 9mm;align-items:center;gap:3mm;font-size:9.5pt}" +
  ".bar{height:2.6mm;border-radius:2mm;background:#e5eaf0;overflow:hidden}.bar i{display:block;height:100%;border-radius:2mm}" +
  ".area b{text-align:right}" +
  ".finding{background:#fff;border:1px solid #dbe3ea;border-left:1.4mm solid #94a3b8;border-radius:3mm;padding:3.2mm 4mm;margin:0 0 2.6mm;break-inside:avoid}" +
  ".finding .k{font-size:7.8pt;letter-spacing:.08em;text-transform:uppercase;color:#64748b;margin:0 0 1mm}" +
  ".finding .t{font-weight:700;margin:0 0 1mm}.finding .e{color:#475569;margin:0;font-size:9.5pt}" +
  ".finding .f{margin:1.6mm 0 0;padding:1.6mm 2.4mm;border-radius:2mm;background:#f0f9fb;color:#0f172a;font-size:9.5pt}.finding .f b{color:#0e7490}" +
  ".meta .url{display:block;margin-top:1mm;color:#94a3b8;word-break:break-all}" +
  ".fz{display:inline-block;height:1.25em;vertical-align:-.28em;background-repeat:repeat-x;background-size:auto 2.3em}" +
  ".cases{display:grid;grid-template-columns:1fr 1fr;gap:2mm 5mm}" +
  ".case{background:#fff;border:1px solid #e2e8f0;border-radius:2.6mm;padding:2.4mm 3mm;font-size:9pt;break-inside:avoid}" +
  ".case code{font-family:Menlo,Consolas,monospace;font-size:7.8pt;color:#0e7490;margin-right:1.6mm}.case small{color:#64748b;font-size:7.8pt}" +
  ".more{font-size:9pt;color:#64748b;margin:2.6mm 0 0}" +
  ".cta{margin:8mm 16mm 0;border-radius:5mm;padding:7mm 8mm;color:#fff;background:#0f172a;background-image:linear-gradient(120deg,#0f172a 0%,#134e5e 100%);break-inside:avoid}" +
  ".cta h3{margin:0 0 2mm;font-size:15pt}.cta p{margin:0 0 1.6mm;color:#cfe3ea;font-size:10pt}" +
  ".btns{margin-top:4mm;display:flex;gap:3mm;flex-wrap:wrap}" +
  ".btn{display:inline-block;padding:2.8mm 5mm;border-radius:2.6mm;font-weight:700;text-decoration:none;font-size:10pt}" +
  ".btn.p{background:#5eead4;color:#0f172a}.btn.s{border:1px solid #5eead4;color:#99f6e4}" +
  ".cmp{background:#fff;border:1px solid #dbe3ea;border-radius:4mm;padding:5mm;break-inside:avoid}.cmp .note{margin:0 0 3mm}" +
  ".cmp table{width:100%;border-collapse:collapse;font-size:9.5pt}.cmp th,.cmp td{padding:1.4mm 0 1.4mm 3mm;text-align:right;border-bottom:1px solid #eef2f6}" +
  ".cmp th{font-size:7.8pt;letter-spacing:.06em;text-transform:uppercase;word-break:break-all}.cmp th:first-child,.cmp td:first-child{text-align:left;padding-left:0}" +
  ".cmp .own{color:" + OWN_COLOR + "}.cmp .rival{color:" + RIVAL_COLOR + "}.cmp .verdict{font-weight:700;margin:3mm 0 0}" +
  ".only{display:grid;grid-template-columns:1fr 1fr;gap:5mm;margin-top:4mm}.only>div{border-top:1mm solid;padding-top:2mm;font-size:9pt}.only h3{margin:0 0 1.6mm;font-size:9pt;word-break:break-all}" +
  ".only ul{margin:0;padding-left:4mm}.only li{margin:0 0 1mm}.only small{color:#64748b}";

// The running footer sits in the page margin: a position:fixed footer lands over the content on pages after the first.
function pdfFooter(id) {
  const box = "font-family:Inter,'Helvetica Neue',Arial,sans-serif;font-size:8pt;color:#64748b;border-top:1px solid #dbe3ea;vertical-align:middle;";
  const quoted = "\"" + String(id || "").replace(/[^A-Za-z0-9_-]/g, "") + "\"";
  return "@page{@bottom-left{content:\"QA-lab URL Review · carlosandmunoz.com/qa-review.html\";padding-left:16mm;" + box + "}" +
    "@bottom-right{content:" + quoted + " \"  ·  \" counter(page) \" / \" counter(pages);padding-right:16mm;text-align:right;" + box + "}}";
}

// Problem titles are lines of the report, so an unpaid PDF frosts them like the findings.
function comparePdf(c, cf, t, lineOf) {
  const cell = (value, cls) => "<td class=\"" + cls + "\"><b" + (value == null ? "" : " style=\"color:" + scoreColor(value) + "\"") + ">" + (value == null ? "–" : value) + "</b></td>";
  const rows = cf.rows.map((row) => "<tr><td>" + esc(row.label) + "</td>" + cell(row.own, "") + cell(row.rival, "") +
    "<td><b style=\"color:" + leadColor(row.lead) + "\">" + esc(leadText(row.lead)) + "</b></td></tr>").join("");
  const list = (site, side, cls, seed) => "<div class=\"" + cls + "\" style=\"border-color:" + (cls === "own" ? OWN_COLOR : RIVAL_COLOR) + "\"><h3>" + esc(fill(c.onlyHas, { site })) + ": " + side.count + "</h3>" +
    (side.items.length ? "<ul>" + side.items.map((item, index) => "<li>" + lineOf(item.title, seed + index) + " <small>" + esc(t.areas[item.area] || item.area || "") + "</small></li>").join("") + "</ul>" +
      (side.count > side.items.length ? "<p class=\"more\">" + esc(fill(c.more, { n: side.count - side.items.length })) + "</p>" : "")
      : "<p class=\"more\">" + esc(c.none) + "</p>") + "</div>";
  return "<div class=\"sec\"><h2>" + esc(c.title) + "</h2><div class=\"cmp\">" +
    "<p class=\"note\">" + fill(esc(c.intro), { own: "<b class=\"own\">" + esc(cf.own) + "</b>", when: esc(cf.intro.when), rival: "<b class=\"rival\">" + esc(cf.rival) + "</b>" }) + "</p>" +
    "<table><thead><tr><th>" + esc(c.area) + "</th><th class=\"own\">" + esc(cf.own) + "</th><th class=\"rival\">" + esc(cf.rival) + "</th><th>" + esc(c.yourLead) + "</th></tr></thead><tbody>" + rows + "</tbody></table>" +
    (cf.verdict ? "<p class=\"verdict\">" + esc(cf.verdict) + "</p>" : "") +
    "<div class=\"only\">" + list(cf.own, cf.ownOnly, "own", 11) + list(cf.rival, cf.rivalOnly, "rival", 31) + "</div>" +
    "<p class=\"more\">" + esc(cf.shared) + " " + esc(cf.note) + "</p>" +
    "</div></div>";
}

// A print page for the mail attachment. On an unpaid report hidden words are filler, so the PDF never carries them.
function reportPdf(record, options) {
  const opts = options || {};
  const lang = langOf(opts.lang || (record && record.lang));
  const t = COPY[lang];
  const p = PDF_COPY[lang];
  const report = (record && record.report) || {};
  const ins = report.insights || {};
  const open = isOpen(record);
  const lineOf = (text, seed) => open ? esc(text) : frostedLine(text, seed);
  const facts = reportFacts(record, open, lang);
  const cf = compareFacts(record, lang);
  const all = (Array.isArray(ins.findings) ? ins.findings : [])
    .filter((item) => item && (item.verdict === "fail" || item.verdict === "risk"))
    .sort((a, b) => (a.rank || 999) - (b.rank || 999));
  const fails = all.filter((item) => item.verdict === "fail").length;
  const overall = facts.score ? Number(facts.score.overall) || 0 : 0;
  const ringColor = scoreColor(overall);
  const when = new Date(report.fetchedAt || (record && record.createdAt) || Date.now());
  const date = isNaN(when) ? "" : when.toISOString().slice(0, 10);
  const openUrl = pageUrl(lang, { report: facts.id, utm_campaign: "report-pdf" });
  const areas = facts.score ? AREAS.map((area) => {
    const row = (facts.score.areas || {})[area];
    if (!row) return "";
    const value = Math.max(0, Math.min(100, Number(row.score) || 0));
    return "<div class=\"area\"><span>" + esc(t.areas[area] || area) + "</span><div class=\"bar\"><i style=\"width:" + value + "%;background:" + scoreColor(value) + "\"></i></div><b style=\"color:" + scoreColor(value) + "\">" + value + "</b></div>";
  }).join("") : "";
  const findings = all.map((item, index) =>
    "<div class=\"finding\" style=\"border-left-color:" + (SEVERITY_COLOR[item.severity] || SEVERITY_COLOR.low) + "\">" +
    "<p class=\"k\">" + esc(t.areas[item.area] || item.area || "") + " · " + esc(p.sev[item.severity] || item.severity || p.sev.low) + "</p>" +
    "<p class=\"t\">" + lineOf(findingLine(lang, item, "title"), index) + "</p>" +
    (item.evidence ? "<p class=\"e\">" + lineOf(findingLine(lang, item, "evidence"), index + 3) + "</p>" : "") +
    (open && item.fix ? "<p class=\"f\"><b>" + esc(FIX_LABEL[lang]) + ":</b> " + esc(findingLine(lang, item, "fix")) + "</p>" : "") +
    "</div>"
  ).join("");
  const caseRows = (Array.isArray(report.cases) ? report.cases : []).slice(0, PDF_CASES).map((item, index) =>
    "<div class=\"case\"><code>" + esc(item.id || "") + "</code><small>" + esc(item.layer || "") + "</small><br>" + lineOf(findingLine(lang, item, "title"), index + 7) + "</div>"
  ).join("");
  const moreCases = Math.max(0, facts.cases - PDF_CASES);
  const finalUrl = /^https?:\/\//i.test(String(report.finalUrl || "")) ? String(report.finalUrl).slice(0, 200) : "";
  // Fixed, so the print engine repeats it on every page.
  const mark = String((record && record.email) || "");
  const watermark = mark ? "<div class=\"wm\" aria-hidden=\"true\">" + ("<span>" + esc(mark) + "</span>").repeat(40) + "</div>" : "";
  const html = "<!DOCTYPE html><html lang=\"" + lang + "\"><head><meta charset=\"utf-8\"><title>QA-lab URL Review · " + esc(facts.host) + "</title><style>" + PDF_STYLE + pdfFooter(facts.id) + (open ? "" : ".fz{background-image:url(" + stripUrl() + ")}") + "</style></head><body>" +
    watermark +
    "<div class=\"page\">" +
    "<div class=\"hero\"><div class=\"who\"><p class=\"eyebrow\">QA-lab URL Review</p><p class=\"host\">" + esc(facts.host) + "</p>" +
    "<p class=\"meta\">" + esc(fill(p.read, { date })) + " · <code>" + esc(facts.id) + "</code>" + (finalUrl ? "<span class=\"url\">" + esc(finalUrl) + "</span>" : "") + "</p><span class=\"badge\">" + esc(open ? p.badgeOpen : p.badge) + "</span></div>" +
    (facts.score ? "<div class=\"ring\" style=\"background:conic-gradient(" + ringColor + " " + overall * 3.6 + "deg,rgba(255,255,255,.14) 0)\"><div><b>" + overall + "</b><i>" + esc(t.outOf) + "</i><em style=\"background:" + ringColor + "\">" + esc(facts.score.grade || "") + "</em></div></div>" : "") +
    "</div>" +
    "<div class=\"stats\">" +
    "<div class=\"stat\"><b>" + facts.pages + "</b><span>" + esc(t.pages) + (facts.found ? " " + esc(t.pagesFound.replace("{n}", facts.found)) : "") + "</span></div>" +
    "<div class=\"stat\"><b>" + facts.cases + "</b><span>" + esc(t.cases) + "</span></div>" +
    "<div class=\"stat\"><b style=\"color:#b91c1c\">" + fails + "</b><span>" + esc(p.fails) + "</span></div>" +
    "<div class=\"stat\"><b style=\"color:#b45309\">" + (all.length - fails) + "</b><span>" + esc(p.risks) + "</span></div>" +
    "</div>" +
    (areas ? "<div class=\"sec\"><div class=\"areas\">" + areas + "</div></div>" : "") +
    (cf ? comparePdf(CMP_COPY[lang], cf, t, lineOf) : "") +
    (findings ? "<div class=\"sec\"><h2>" + esc(p.findings) + "</h2>" + (open ? "" : "<p class=\"note\">" + esc(p.note) + "</p>") + findings + "</div>" : "") +
    (caseRows ? "<div class=\"sec\"><h2>" + esc(p.cases) + "</h2><div class=\"cases\">" + caseRows + "</div>" + (moreCases ? "<p class=\"more\">" + esc(fill(p.moreCases, { n: moreCases })) + "</p>" : "") + "</div>" : "") +
    "<div class=\"cta\"><h3>" + esc(t.deeper) + "</h3>" + t.deeperLines.map((line) => "<p>→ " + esc(line) + "</p>").join("") +
    "<div class=\"btns\"><a class=\"btn p\" href=\"" + esc(openUrl) + "\">" + esc(open ? t.openFull : p.unlock) + "</a><a class=\"btn s\" href=\"" + esc(deeperUrl(t, facts.host, facts.id)) + "\">" + esc(t.deeperCta) + "</a></div></div>" +
    "</div></body></html>";
  const slug = facts.host.replace(/[^a-z0-9.-]/gi, "-").replace(/-+/g, "-").slice(0, 60);
  return { html, filename: "qa-lab-" + slug + "-" + (open ? p.fileOpen : p.file) + ".pdf" };
}

function noteMail(note, options) {
  const opts = options || {};
  const lang = langOf(note && note.lang);
  const t = COPY[lang];
  const host = (note && note.host) || "your site";
  const openUrl = pageUrl(lang, { report: note && note.reportId, coupon: opts.coupon, utm_campaign: "note-" + ((note && note.kind) || "return") });
  const anotherUrl = pageUrl(lang, { coupon: opts.coupon, utm_campaign: "note-another" });
  const inner = "<tr><td bgcolor=\"#0f172a\" style=\"background:#0f172a;background-image:linear-gradient(135deg,#0f172a 0%,#0e7490 100%);border-radius:16px 16px 0 0;padding:30px 28px 24px;font-family:Arial,Helvetica,sans-serif;\">" +
    "<p style=\"margin:0 0 8px;font-size:12px;letter-spacing:0.12em;text-transform:uppercase;color:#7dd3fc;\">QA-lab URL Review &middot; " + esc(host) + "</p>" +
    "<p style=\"margin:0;font-size:26px;line-height:32px;color:#ffffff;font-weight:bold;\">" + esc(note && note.title) + "</p>" +
    "</td></tr>" +
    "<tr><td bgcolor=\"#ffffff\" style=\"background:#ffffff;border-radius:0 0 16px 16px;padding:22px 28px 22px;font-family:Arial,Helvetica,sans-serif;\">" +
    "<p style=\"margin:0 0 18px;font-size:16px;line-height:25px;color:#334155;\">" + esc(note && note.body) + "</p>" +
    (note && note.reportId ? button(openUrl, t.reopen, true) : "") + button(anotherUrl, t.another, !(note && note.reportId)) +
    "<p style=\"margin:4px 0 0;font-size:13px;line-height:19px;color:#64748b;\">" + esc(t.openNote) + "</p>" +
    "</td></tr>" +
    "<tr><td style=\"height:16px;line-height:16px;font-size:0;\">&nbsp;</td></tr>" +
    deeperBlock(t, host, note && note.reportId);
  const text = [
    note && note.title,
    "",
    note && note.body,
    "",
    note && note.reportId ? t.reopen + ": " + openUrl : "",
    t.another + ": " + anotherUrl,
    "",
    t.deeper,
    t.deeperLines.join("\n"),
    t.deeperCta,
    "",
    footerText(t, fill(t.why, { host }), { stopUrl: opts.stopUrl })
  ].filter((line, index, all) => line !== "" || all[index - 1] !== "").join("\n");
  return {
    lang,
    subject: String((note && note.subject) || "QA-lab URL Review").slice(0, 140),
    text: text.slice(0, 16000),
    html: shell(lang, (note && note.title) || "", inner, footerHtml(t, fill(t.why, { host }), { stopUrl: opts.stopUrl }))
  };
}

const SIGN_IN = {
  en: {
    subject: "{code} is your QA-lab sign-in code",
    title: "Sign in to QA-lab URL Review",
    lead: "Type this code on the page where you asked for it. It works for 15 minutes.",
    link: "Or open this link in the same browser, on the same device:",
    button: "Sign in on this device",
    device: "A code or link opened on another device or browser signs no one in and starts no review.",
    why: "You get this because a sign-in with this address was asked for at carlosandmunoz.com. If it was not you, ignore this email."
  },
  es: {
    subject: "{code} es tu código para entrar a QA-lab",
    title: "Entra a QA-lab URL Review",
    lead: "Escribe este código en la página donde lo pediste. Sirve durante 15 minutos.",
    link: "O abre este enlace en el mismo navegador, en el mismo dispositivo:",
    button: "Entrar en este dispositivo",
    device: "Un código o enlace abierto en otro dispositivo o navegador no inicia sesión ni empieza ninguna revisión.",
    why: "Recibes esto porque alguien pidió entrar con esta dirección en carlosandmunoz.com. Si no fuiste tú, ignora este correo."
  },
  pt: {
    subject: "{code} é o seu código de acesso ao QA-lab",
    title: "Entre no QA-lab URL Review",
    lead: "Digite este código na página onde você o pediu. Ele vale por 15 minutos.",
    link: "Ou abra este link no mesmo navegador, no mesmo dispositivo:",
    button: "Entrar neste dispositivo",
    device: "Um código ou link aberto em outro dispositivo ou navegador não faz login nem inicia nenhuma revisão.",
    why: "Você recebeu isto porque alguém pediu para entrar com este endereço em carlosandmunoz.com. Se não foi você, ignore este e-mail."
  },
  de: {
    subject: "{code} ist Ihr Anmeldecode für QA-lab",
    title: "Bei QA-lab URL Review anmelden",
    lead: "Geben Sie diesen Code auf der Seite ein, auf der Sie ihn angefordert haben. Er gilt 15 Minuten.",
    link: "Oder öffnen Sie diesen Link im selben Browser auf demselben Gerät:",
    button: "Auf diesem Gerät anmelden",
    device: "Ein Code oder Link, der auf einem anderen Gerät oder Browser geöffnet wird, meldet niemanden an und startet keine Prüfung.",
    why: "Sie erhalten diese E-Mail, weil auf carlosandmunoz.com eine Anmeldung mit dieser Adresse angefordert wurde. Waren Sie es nicht, ignorieren Sie sie."
  },
  fr: {
    subject: "{code} est votre code de connexion QA-lab",
    title: "Connexion à QA-lab URL Review",
    lead: "Saisissez ce code sur la page où vous l'avez demandé. Il est valable 15 minutes.",
    link: "Ou ouvrez ce lien dans le même navigateur, sur le même appareil :",
    button: "Me connecter sur cet appareil",
    device: "Un code ou un lien ouvert sur un autre appareil ou navigateur ne connecte personne et ne lance aucune revue.",
    why: "Vous recevez ce message parce qu'une connexion avec cette adresse a été demandée sur carlosandmunoz.com. Si ce n'était pas vous, ignorez-le."
  },
  it: {
    subject: "{code} è il tuo codice di accesso a QA-lab",
    title: "Accedi a QA-lab URL Review",
    lead: "Scrivi questo codice nella pagina in cui l'hai chiesto. Vale 15 minuti.",
    link: "Oppure apri questo link nello stesso browser, sullo stesso dispositivo:",
    button: "Accedi su questo dispositivo",
    device: "Un codice o un link aperto su un altro dispositivo o browser non fa accedere nessuno e non avvia alcuna revisione.",
    why: "Ricevi questa email perché su carlosandmunoz.com è stato chiesto un accesso con questo indirizzo. Se non sei stato tu, ignorala."
  }
};

// `page` is the path that asked for the code, so the link returns there as the OAuth return does.
function signInMail(lang, sign, page) {
  const code = langOf(lang);
  const t = SIGN_IN[code];
  const back = String(page || "").replace(/^\//, "") === ACCOUNT_PAGE ? ACCOUNT_PAGE : "";
  const link = pageUrl(code, { signin: sign.id, key: sign.token, utm_campaign: "sign-in" }, back);
  const inner = "<tr><td bgcolor=\"#0f172a\" style=\"background:#0f172a;background-image:linear-gradient(135deg,#0f172a 0%,#0e7490 100%);border-radius:16px 16px 0 0;padding:30px 28px 24px;font-family:Arial,Helvetica,sans-serif;\">" +
    "<p style=\"margin:0 0 8px;font-size:12px;letter-spacing:0.12em;text-transform:uppercase;color:#7dd3fc;\">QA-lab URL Review</p>" +
    "<p style=\"margin:0;font-size:26px;line-height:32px;color:#ffffff;font-weight:bold;\">" + esc(t.title) + "</p>" +
    "</td></tr>" +
    "<tr><td bgcolor=\"#ffffff\" style=\"background:#ffffff;border-radius:0 0 16px 16px;padding:22px 28px 22px;font-family:Arial,Helvetica,sans-serif;\">" +
    "<p style=\"margin:0 0 14px;font-size:16px;line-height:25px;color:#334155;\">" + esc(t.lead) + "</p>" +
    "<p style=\"margin:0 0 20px;font-family:'Courier New',monospace;font-size:34px;line-height:40px;letter-spacing:0.3em;font-weight:bold;color:#0f172a;\">" + esc(sign.code) + "</p>" +
    "<p style=\"margin:0 0 12px;font-size:14px;line-height:21px;color:#334155;\">" + esc(t.link) + "</p>" +
    button(link, t.button, true) +
    "<p style=\"margin:6px 0 0;font-size:13px;line-height:19px;color:#64748b;\">" + esc(t.device) + "</p>" +
    "</td></tr>";
  return {
    lang: code,
    subject: fill(t.subject, { code: sign.code }),
    text: [t.title, "", t.lead, "", sign.code, "", t.link, link, "", t.device, "", footerText(COPY[code], t.why)].join("\n"),
    html: shell(code, t.lead, inner, footerHtml(COPY[code], t.why))
  };
}

const SHARED_OPEN = {
  en: {
    subject: "Someone else opened your report link for {host}",
    title: "Another account opened your report link",
    lead: "Someone signed in with a different account opened the link to your review of {host} on {date}.",
    safe: "They saw only the blurred preview, with the findings under frost. A report opens in full only for the account that ran it.",
    button: "Open your report",
    once: "This notice is sent once per report. Later opens are not emailed."
  },
  es: {
    subject: "Alguien más abrió el enlace de tu informe de {host}",
    title: "Otra cuenta abrió el enlace de tu informe",
    lead: "Alguien con otra cuenta abrió el enlace de tu revisión de {host} el {date}.",
    safe: "Solo vio la vista previa difuminada, con los hallazgos bajo la escarcha. Un informe se abre completo solo para la cuenta que lo pidió.",
    button: "Abrir tu informe",
    once: "Este aviso se envía una vez por informe. Las aperturas siguientes no se avisan por correo."
  },
  pt: {
    subject: "Outra pessoa abriu o link do seu relatório de {host}",
    title: "Outra conta abriu o link do seu relatório",
    lead: "Alguém com outra conta abriu o link da sua revisão de {host} em {date}.",
    safe: "Essa pessoa viu só a prévia desfocada, com os achados sob a geada. Um relatório abre completo só para a conta que o pediu.",
    button: "Abrir seu relatório",
    once: "Este aviso é enviado uma vez por relatório. As próximas aberturas não geram e-mail."
  },
  de: {
    subject: "Jemand anderes hat den Link zu Ihrem Bericht über {host} geöffnet",
    title: "Ein anderes Konto hat Ihren Berichtslink geöffnet",
    lead: "Jemand mit einem anderen Konto hat am {date} den Link zu Ihrer Prüfung von {host} geöffnet.",
    safe: "Zu sehen war nur die unscharfe Vorschau, die Befunde blieben unter Frost. Ein Bericht öffnet sich vollständig nur für das Konto, das ihn gestartet hat.",
    button: "Ihren Bericht öffnen",
    once: "Dieser Hinweis kommt einmal pro Bericht. Spätere Aufrufe werden nicht gemailt."
  },
  fr: {
    subject: "Quelqu'un d'autre a ouvert le lien de votre rapport sur {host}",
    title: "Un autre compte a ouvert le lien de votre rapport",
    lead: "Une personne connectée avec un autre compte a ouvert le lien de votre revue de {host} le {date}.",
    safe: "Elle n'a vu que l'aperçu flouté, avec les constats sous le givre. Un rapport ne s'ouvre en entier que pour le compte qui l'a lancé.",
    button: "Ouvrir votre rapport",
    once: "Cet avis est envoyé une fois par rapport. Les ouvertures suivantes ne sont pas signalées par e-mail."
  },
  it: {
    subject: "Qualcun altro ha aperto il link del tuo report su {host}",
    title: "Un altro account ha aperto il link del tuo report",
    lead: "Qualcuno con un altro account ha aperto il link della tua revisione di {host} il {date}.",
    safe: "Ha visto solo l'anteprima sfocata, con i risultati sotto la brina. Un report si apre per intero solo per l'account che l'ha avviato.",
    button: "Apri il tuo report",
    once: "Questo avviso arriva una volta per report. Le aperture successive non vengono segnalate via email."
  }
};

// Never names or describes who opened the link.
function sharedOpenMail(record, at) {
  const code = langOf(record && record.lang);
  const t = SHARED_OPEN[code];
  const host = (record && record.report && record.report.host) || "";
  const vars = { host, date: dateOf(at) };
  const link = pageUrl(code, { report: record && record.id, utm_campaign: "shared-open" });
  const why = fill(COPY[code].why, { host });
  const inner = "<tr><td bgcolor=\"#0f172a\" style=\"background:#0f172a;background-image:linear-gradient(135deg,#0f172a 0%,#0e7490 100%);border-radius:16px 16px 0 0;padding:30px 28px 24px;font-family:Arial,Helvetica,sans-serif;\">" +
    "<p style=\"margin:0 0 8px;font-size:12px;letter-spacing:0.12em;text-transform:uppercase;color:#7dd3fc;\">QA-lab URL Review</p>" +
    "<p style=\"margin:0;font-size:26px;line-height:32px;color:#ffffff;font-weight:bold;\">" + esc(t.title) + "</p>" +
    "</td></tr>" +
    "<tr><td bgcolor=\"#ffffff\" style=\"background:#ffffff;border-radius:0 0 16px 16px;padding:22px 28px 22px;font-family:Arial,Helvetica,sans-serif;\">" +
    "<p style=\"margin:0 0 14px;font-size:16px;line-height:25px;color:#334155;\">" + esc(fill(t.lead, vars)) + "</p>" +
    "<p style=\"margin:0 0 20px;font-size:15px;line-height:23px;color:#334155;\">" + esc(t.safe) + "</p>" +
    button(link, t.button, true) +
    "<p style=\"margin:6px 0 0;font-size:13px;line-height:19px;color:#64748b;\">" + esc(t.once) + "</p>" +
    "</td></tr>";
  return {
    lang: code,
    subject: fill(t.subject, vars),
    text: [t.title, "", fill(t.lead, vars), "", t.safe, "", t.button + ": " + link, "", t.once, "", footerText(COPY[code], why)].join("\n"),
    html: shell(code, fill(t.lead, vars), inner, footerHtml(COPY[code], why))
  };
}

const RECEIPT = {
  en: {
    subject: "Your QA-lab URL Review receipt: {item}, US${amount}",
    title: "Payment received",
    lead: "PayPal confirmed your payment on {date}. This is your receipt.",
    item: "Item", site: "Site", amount: "Amount paid", list: "List price", coupon: "Coupon",
    date: "Date", number: "Receipt number", order: "PayPal order", capture: "PayPal transaction", seller: "Seller",
    test: "Test payment in the PayPal sandbox. No money moved.",
    notInvoice: "This is a payment receipt, not a tax invoice (factura electrónica). Write to {mail} if you need one.",
    button: "Open QA-lab URL Review",
    why: "You get this receipt because you paid on QA-lab URL Review.",
    items: { report: "Full report", "new-run": "Review run", pass: "Monthly pass", fixlist: "Fix list", cases: "Test case export", alerts: "Change alerts", credentials: "Signed-in run" }
  },
  es: {
    subject: "Tu recibo de QA-lab URL Review: {item}, US${amount}",
    title: "Pago recibido",
    lead: "PayPal confirmó tu pago el {date}. Este es tu recibo.",
    item: "Concepto", site: "Sitio", amount: "Importe pagado", list: "Precio de lista", coupon: "Cupón",
    date: "Fecha", number: "Número de recibo", order: "Orden de PayPal", capture: "Transacción de PayPal", seller: "Vendedor",
    test: "Pago de prueba en el sandbox de PayPal. No se movió dinero.",
    notInvoice: "Este es un recibo de pago, no una factura electrónica. Escribe a {mail} si necesitas una.",
    button: "Abrir QA-lab URL Review",
    why: "Recibes este recibo porque pagaste en QA-lab URL Review.",
    items: { report: "Informe completo", "new-run": "Revisión", pass: "Pase mensual", fixlist: "Lista de arreglos", cases: "Exportación de casos de prueba", alerts: "Alertas de cambios", credentials: "Revisión con sesión iniciada" }
  },
  pt: {
    subject: "Seu recibo do QA-lab URL Review: {item}, US${amount}",
    title: "Pagamento recebido",
    lead: "O PayPal confirmou seu pagamento em {date}. Este é o seu recibo.",
    item: "Item", site: "Site", amount: "Valor pago", list: "Preço de tabela", coupon: "Cupom",
    date: "Data", number: "Número do recibo", order: "Pedido do PayPal", capture: "Transação do PayPal", seller: "Vendedor",
    test: "Pagamento de teste no sandbox do PayPal. Nenhum dinheiro foi movimentado.",
    notInvoice: "Este é um recibo de pagamento, não uma nota fiscal (factura electrónica). Escreva para {mail} se precisar de uma.",
    button: "Abrir o QA-lab URL Review",
    why: "Você recebe este recibo porque pagou no QA-lab URL Review.",
    items: { report: "Relatório completo", "new-run": "Revisão", pass: "Passe mensal", fixlist: "Lista de correções", cases: "Exportação de casos de teste", alerts: "Alertas de mudanças", credentials: "Revisão com login" }
  },
  de: {
    subject: "Ihre Quittung von QA-lab URL Review: {item}, US${amount}",
    title: "Zahlung erhalten",
    lead: "PayPal hat Ihre Zahlung am {date} bestätigt. Dies ist Ihre Quittung.",
    item: "Leistung", site: "Website", amount: "Bezahlter Betrag", list: "Listenpreis", coupon: "Gutschein",
    date: "Datum", number: "Quittungsnummer", order: "PayPal-Bestellung", capture: "PayPal-Transaktion", seller: "Verkäufer",
    test: "Testzahlung in der PayPal-Sandbox. Es wurde kein Geld bewegt.",
    notInvoice: "Dies ist eine Zahlungsquittung, keine Steuerrechnung (factura electrónica). Schreiben Sie an {mail}, wenn Sie eine benötigen.",
    button: "QA-lab URL Review öffnen",
    why: "Sie erhalten diese Quittung, weil Sie bei QA-lab URL Review bezahlt haben.",
    items: { report: "Vollständiger Bericht", "new-run": "Prüfung", pass: "Monatspass", fixlist: "Korrekturliste", cases: "Export der Testfälle", alerts: "Änderungsalarme", credentials: "Prüfung mit Anmeldung" }
  },
  fr: {
    subject: "Votre reçu QA-lab URL Review : {item}, US${amount}",
    title: "Paiement reçu",
    lead: "PayPal a confirmé votre paiement le {date}. Voici votre reçu.",
    item: "Article", site: "Site", amount: "Montant payé", list: "Prix catalogue", coupon: "Coupon",
    date: "Date", number: "Numéro de reçu", order: "Commande PayPal", capture: "Transaction PayPal", seller: "Vendeur",
    test: "Paiement de test dans la sandbox PayPal. Aucun argent n'a circulé.",
    notInvoice: "Ceci est un reçu de paiement, pas une facture fiscale (factura electrónica). Écrivez à {mail} si vous en avez besoin.",
    button: "Ouvrir QA-lab URL Review",
    why: "Vous recevez ce reçu parce que vous avez payé sur QA-lab URL Review.",
    items: { report: "Rapport complet", "new-run": "Revue", pass: "Pass mensuel", fixlist: "Liste de corrections", cases: "Export des cas de test", alerts: "Alertes de changement", credentials: "Revue connectée" }
  },
  it: {
    subject: "La tua ricevuta di QA-lab URL Review: {item}, US${amount}",
    title: "Pagamento ricevuto",
    lead: "PayPal ha confermato il tuo pagamento il {date}. Questa è la tua ricevuta.",
    item: "Voce", site: "Sito", amount: "Importo pagato", list: "Prezzo di listino", coupon: "Coupon",
    date: "Data", number: "Numero di ricevuta", order: "Ordine PayPal", capture: "Transazione PayPal", seller: "Venditore",
    test: "Pagamento di prova nella sandbox di PayPal. Nessun denaro è stato spostato.",
    notInvoice: "Questa è una ricevuta di pagamento, non una fattura fiscale (factura electrónica). Scrivi a {mail} se ne hai bisogno.",
    button: "Apri QA-lab URL Review",
    why: "Ricevi questa ricevuta perché hai pagato su QA-lab URL Review.",
    items: { report: "Report completo", "new-run": "Revisione", pass: "Pass mensile", fixlist: "Lista delle correzioni", cases: "Esportazione dei casi di test", alerts: "Avvisi di modifica", credentials: "Revisione con accesso" }
  }
};

const SELLER = "Carlos A. Muñoz, " + POSTAL + ", " + DEEPER;

function usd(value) {
  return (Math.round((Number(value) || 0) * 100) / 100).toFixed(2);
}

// The receipt for one confirmed payment; `p` is the checkout as closed, with the PayPal ids.
function receiptMail(p) {
  const code = langOf(p && p.lang);
  const t = RECEIPT[code];
  const item = t.items[p.purpose] || t.items["new-run"];
  const date = dateOf(p.paidAt);
  const discounted = Number(p.listUsd) > Number(p.priceUsd);
  const rows = [
    [t.item, item],
    p.host ? [t.site, p.host] : null,
    discounted ? [t.list, "US$" + usd(p.listUsd)] : null,
    discounted && p.coupon ? [t.coupon, String(p.coupon) + (p.percent ? " (" + p.percent + "%)" : "")] : null,
    [t.amount, "US$" + usd(p.priceUsd)],
    [t.date, date],
    [t.number, p.reference],
    p.orderId ? [t.order, p.orderId] : null,
    p.captureId ? [t.capture, p.captureId] : null,
    [t.seller, SELLER]
  ].filter((row) => row && row[1]);
  const vars = { item, amount: usd(p.priceUsd), date, mail: DEEPER };
  const link = pageUrl(code, { utm_campaign: "receipt" });
  const why = t.why;
  const table = "<table role=\"presentation\" width=\"100%\" cellpadding=\"0\" cellspacing=\"0\" style=\"margin:0 0 18px;border-collapse:collapse;\">" +
    rows.map((row) => "<tr><td style=\"padding:8px 12px 8px 0;border-bottom:1px solid #e2e8f0;font-size:14px;line-height:20px;color:#64748b;vertical-align:top;\">" + esc(row[0]) +
      "</td><td style=\"padding:8px 0;border-bottom:1px solid #e2e8f0;font-size:14px;line-height:20px;color:#0f172a;font-weight:bold;\">" + esc(row[1]) + "</td></tr>").join("") +
    "</table>";
  const inner = "<tr><td bgcolor=\"#0f172a\" style=\"background:#0f172a;background-image:linear-gradient(135deg,#0f172a 0%,#0e7490 100%);border-radius:16px 16px 0 0;padding:30px 28px 24px;font-family:Arial,Helvetica,sans-serif;\">" +
    "<p style=\"margin:0 0 8px;font-size:12px;letter-spacing:0.12em;text-transform:uppercase;color:#7dd3fc;\">QA-lab URL Review</p>" +
    "<p style=\"margin:0;font-size:26px;line-height:32px;color:#ffffff;font-weight:bold;\">" + esc(t.title) + "</p>" +
    "</td></tr>" +
    "<tr><td bgcolor=\"#ffffff\" style=\"background:#ffffff;border-radius:0 0 16px 16px;padding:22px 28px 22px;font-family:Arial,Helvetica,sans-serif;\">" +
    "<p style=\"margin:0 0 16px;font-size:16px;line-height:25px;color:#334155;\">" + esc(fill(t.lead, vars)) + "</p>" +
    (p.test ? "<p style=\"margin:0 0 16px;font-size:14px;line-height:21px;color:#b45309;font-weight:bold;\">" + esc(t.test) + "</p>" : "") +
    table +
    "<p style=\"margin:0 0 20px;font-size:13px;line-height:19px;color:#64748b;\">" + esc(fill(t.notInvoice, vars)) + "</p>" +
    button(link, t.button, true) +
    "</td></tr>";
  return {
    lang: code,
    subject: fill(t.subject, vars),
    text: [t.title, "", fill(t.lead, vars), p.test ? "\n" + t.test : "", "", rows.map((row) => row[0] + ": " + row[1]).join("\n"), "", fill(t.notInvoice, vars), "", t.button + ": " + link, "", footerText(COPY[code], why)].join("\n"),
    html: shell(code, fill(t.lead, vars), inner, footerHtml(COPY[code], why))
  };
}

function stopPage(lang, state, email) {
  const code = langOf(lang);
  const t = COPY[code].page;
  const body = state === "ask"
    ? "<h1>" + esc(t[0]) + "</h1><form method=\"post\"><button type=\"submit\">" + esc(t[1]) + "</button></form>"
    : "<h1>" + esc(state === "done" ? fill(t[2], { email }) : t[3]) + "</h1><p><a href=\"" + SITE + "/" + PAGE_FOR[code] + "\">QA-lab URL Review</a></p>";
  return "<!DOCTYPE html><html lang=\"" + code + "\"><head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\"><meta name=\"robots\" content=\"noindex\"><title>QA-lab URL Review</title>" +
    "<style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#e8eef4;font-family:Arial,Helvetica,sans-serif;color:#0f172a}main{background:#fff;border-radius:16px;padding:32px;max-width:440px;margin:16px;text-align:center}h1{font-size:22px;line-height:1.3;font-weight:normal}button{background:#0e7490;color:#fff;border:0;border-radius:10px;padding:13px 22px;font-size:15px;font-weight:bold;cursor:pointer}a{color:#0e7490}</style></head>" +
    "<body><main>" + body + "</main></body></html>";
}

module.exports = { SITE, POSTAL, LANGS, AREAS, langOf, esc, fill, button, shell, scoreColor, frost, reportFacts, reportMail, reportPdf, noteMail, signInMail, sharedOpenMail, receiptMail, stopPage, pageUrl };
