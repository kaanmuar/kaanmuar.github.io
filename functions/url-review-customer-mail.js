/**
 * Mail to the asker: the blurred report after a run, and the return notes.
 * Findings are cut here, so the hidden part of a line never leaves in mail.
 */
const SITE = "https://carlosandmunoz.com";
const DEEPER = "qa@carlosandmunoz.com";
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
    outOf: "out of 100",
    pages: "pages analyzed",
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
    areas: { SEO: "SEO", GEO: "GEO", Analytics: "Analytics", Security: "Security", Accessibility: "Accessibility", Performance: "Performance" },
    page: ["Stop the follow-up notes?", "Stop them", "Done. No more follow-up notes go to {email}.", "This link no longer works."]
  },
  es: {
    subjects: ["{host} sacó {score}/100. El resto sigue empañado.", "{score}/100 para {host}. Aquí está a dónde se fueron los puntos.", "{host}: {score} de 100, y una lista que vale la pena leer."],
    subjectPlain: "La revisión de {host} está lista.",
    preheader: "Los seis puntajes están abiertos. {count} hallazgos esperan bajo el desenfoque.",
    title: "La revisión de {host} está lista.",
    lead: "Los seis puntajes están a la vista. Los hallazgos siguen empañados, con lo justo para saber cuáles importan.",
    outOf: "de 100",
    pages: "páginas analizadas",
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
    areas: { SEO: "SEO", GEO: "GEO", Analytics: "Analítica", Security: "Seguridad", Accessibility: "Accesibilidad", Performance: "Rendimiento" },
    page: ["¿Dejar de recibir las notas?", "Sí, detenerlas", "Listo. No llegarán más notas a {email}.", "Este enlace ya no sirve."]
  },
  pt: {
    subjects: ["{host} tirou {score}/100. O resto está embaçado.", "{score}/100 para {host}. Veja para onde foram os pontos.", "{host}: {score} de 100, e uma lista que vale a leitura."],
    subjectPlain: "A revisão de {host} está pronta.",
    preheader: "As seis notas estão abertas. {count} achados esperam sob o desfoque.",
    title: "A revisão de {host} está pronta.",
    lead: "As seis notas estão à vista. Os achados seguem embaçados, com o suficiente para saber quais importam.",
    outOf: "de 100",
    pages: "páginas analisadas",
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
    areas: { SEO: "SEO", GEO: "GEO", Analytics: "Analytics", Security: "Segurança", Accessibility: "Acessibilidade", Performance: "Desempenho" },
    page: ["Parar as notas?", "Sim, parar", "Pronto. Nenhuma nota a mais vai para {email}.", "Este link não vale mais."]
  },
  de: {
    subjects: ["{host} hat {score}/100. Der Rest liegt unter Milchglas.", "{score}/100 für {host}. Wo die Punkte verloren gingen.", "{host}: {score} von 100 und eine Liste, die sich lohnt."],
    subjectPlain: "Die Prüfung von {host} ist fertig.",
    preheader: "Die sechs Werte sind offen. {count} Befunde warten unter der Unschärfe.",
    title: "Die Prüfung von {host} ist fertig.",
    lead: "Die sechs Werte liegen offen. Die Befunde stehen unter Milchglas, gerade so sichtbar, dass man erkennt, welche zählen.",
    outOf: "von 100",
    pages: "geprüfte Seiten",
    cases: "vorgeschlagene Testfälle",
    findings: "Was zuerst zu beheben ist",
    more: "+{n} weitere Befunde im vollständigen Bericht",
    open: "Vollständigen Bericht freischalten",
    openNote: "Dort kannst du ihn herunterladen, die Testfälle exportieren oder drucken.",
    reopen: "Letzten Bericht öffnen",
    another: "Eine andere URL prüfen",
    deeper: "Willst du tiefer gehen?",
    deeperLines: ["Mehr Seiten, mehr Links oder mehr Websites prüfen?", "Echte, vollständige Testfälle in einem oder allen Automatisierungs-Frameworks ausführen?"],
    deeperCta: "Schreib an qa@carlosandmunoz.com",
    deeperSubject: "Tiefer gehen mit {host}",
    why: "Du bekommst diese Nachricht, weil mit dieser Adresse eine Prüfung von {host} auf carlosandmunoz.com gestartet wurde.",
    stop: "Keine Notizen mehr",
    areas: { SEO: "SEO", GEO: "GEO", Analytics: "Analytics", Security: "Sicherheit", Accessibility: "Barrierefreiheit", Performance: "Leistung" },
    page: ["Keine Notizen mehr?", "Ja, stoppen", "Erledigt. An {email} gehen keine Notizen mehr.", "Dieser Link gilt nicht mehr."]
  },
  fr: {
    subjects: ["{host} obtient {score}/100. Le reste est sous verre dépoli.", "{score}/100 pour {host}. Voici où sont partis les points.", "{host} : {score} sur 100, et une liste qui vaut la lecture."],
    subjectPlain: "La revue de {host} est prête.",
    preheader: "Les six notes sont ouvertes. {count} constats attendent sous le flou.",
    title: "La revue de {host} est prête.",
    lead: "Les six notes sont à découvert. Les constats restent sous verre dépoli, juste assez visibles pour savoir lesquels comptent.",
    outOf: "sur 100",
    pages: "pages analysées",
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
    areas: { SEO: "SEO", GEO: "GEO", Analytics: "Analytics", Security: "Sécurité", Accessibility: "Accessibilité", Performance: "Performance" },
    page: ["Arrêter les notes ?", "Oui, arrêter", "C'est fait. Plus aucune note n'ira à {email}.", "Ce lien n'est plus valide."]
  },
  it: {
    subjects: ["{host} ha preso {score}/100. Il resto è sotto vetro smerigliato.", "{score}/100 per {host}. Ecco dove sono finiti i punti.", "{host}: {score} su 100, e una lista che vale la pena leggere."],
    subjectPlain: "La revisione di {host} è pronta.",
    preheader: "I sei punteggi sono aperti. {count} rilievi aspettano sotto la sfocatura.",
    title: "La revisione di {host} è pronta.",
    lead: "I sei punteggi sono in chiaro. I rilievi restano sotto vetro smerigliato, quanto basta per capire quali contano.",
    outOf: "su 100",
    pages: "pagine analizzate",
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
    areas: { SEO: "SEO", GEO: "GEO", Analytics: "Analytics", Security: "Sicurezza", Accessibility: "Accessibilità", Performance: "Prestazioni" },
    page: ["Fermare le note?", "Sì, fermale", "Fatto. Nessun'altra nota arriverà a {email}.", "Questo link non è più valido."]
  }
};

const PDF_COPY = {
  en: { badge: "Blurred preview", note: "The opening of each line is readable. The rest stays blurred until the report is unlocked.", findings: "Findings", cases: "Proposed test cases", moreCases: "+{n} more cases in the full report", unlock: "Unlock the full report", attached: "The blurred report is attached as a PDF.", fails: "fail now", risks: "at risk", read: "Analyzed on {date}", file: "blurred-report", sev: { critical: "critical", high: "high", medium: "medium", low: "low" } },
  es: { badge: "Vista previa empañada", note: "El comienzo de cada línea se puede leer. El resto sigue empañado hasta desbloquear el informe.", findings: "Hallazgos", cases: "Casos de prueba propuestos", moreCases: "+{n} casos más en el informe completo", unlock: "Desbloquear el informe completo", attached: "El informe empañado va adjunto en PDF.", fails: "fallan ahora", risks: "en riesgo", read: "Analizado el {date}", file: "informe-empanado", sev: { critical: "crítico", high: "alto", medium: "medio", low: "bajo" } },
  pt: { badge: "Prévia embaçada", note: "O início de cada linha pode ser lido. O resto fica embaçado até o relatório ser desbloqueado.", findings: "Achados", cases: "Casos de teste propostos", moreCases: "+{n} casos a mais no relatório completo", unlock: "Desbloquear o relatório completo", attached: "O relatório embaçado vai anexado em PDF.", fails: "falham agora", risks: "em risco", read: "Analisado em {date}", file: "relatorio-embacado", sev: { critical: "crítico", high: "alto", medium: "médio", low: "baixo" } },
  de: { badge: "Verschwommene Vorschau", note: "Der Anfang jeder Zeile ist lesbar. Der Rest bleibt verschwommen, bis der Bericht freigeschaltet ist.", findings: "Befunde", cases: "Vorgeschlagene Testfälle", moreCases: "+{n} weitere Fälle im vollständigen Bericht", unlock: "Vollständigen Bericht freischalten", attached: "Der verschwommene Bericht liegt als PDF bei.", fails: "schlagen fehl", risks: "gefährdet", read: "Geprüft am {date}", file: "verschwommener-bericht", sev: { critical: "kritisch", high: "hoch", medium: "mittel", low: "niedrig" } },
  fr: { badge: "Aperçu flouté", note: "Le début de chaque ligne est lisible. Le reste reste flou jusqu'au déverrouillage du rapport.", findings: "Constats", cases: "Cas de test proposés", moreCases: "+{n} cas de plus dans le rapport complet", unlock: "Déverrouiller le rapport complet", attached: "Le rapport flouté est joint en PDF.", fails: "échouent", risks: "à risque", read: "Analysé le {date}", file: "rapport-floute", sev: { critical: "critique", high: "élevé", medium: "moyen", low: "faible" } },
  it: { badge: "Anteprima sfocata", note: "L'inizio di ogni riga è leggibile. Il resto resta sfocato finché il rapporto non viene sbloccato.", findings: "Risultati", cases: "Casi di test proposti", moreCases: "+{n} casi in più nel rapporto completo", unlock: "Sblocca il rapporto completo", attached: "Il rapporto sfocato è allegato in PDF.", fails: "falliscono ora", risks: "a rischio", read: "Analizzato il {date}", file: "rapporto-sfocato", sev: { critical: "critico", high: "alto", medium: "medio", low: "basso" } }
};
const PDF_CASES = 24;
const FILLER_WORDS = "lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod tempor incididunt ut labore et dolore magna aliqua".split(" ");

function langOf(value) {
  const code = String(value || "").slice(0, 2).toLowerCase();
  return LANGS.indexOf(code) === -1 ? "en" : code;
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

function pageUrl(lang, params) {
  const url = new URL(SITE + "/" + PAGE_FOR[langOf(lang)]);
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

function reportFacts(record) {
  const report = (record && record.report) || {};
  const insights = report.insights || {};
  const score = insights.score || null;
  const actionable = (Array.isArray(insights.findings) ? insights.findings : [])
    .filter((item) => item && (item.verdict === "fail" || item.verdict === "risk"))
    .sort((a, b) => (a.rank || 999) - (b.rank || 999));
  const counts = report.counts || {};
  return {
    id: String((record && record.id) || report.id || ""),
    host: String(report.host || "").slice(0, 120) || "your site",
    score,
    pages: Number(counts.pages) || (Array.isArray(report.pages) ? report.pages.length : 0),
    cases: Number(counts.cases) || (Array.isArray(report.cases) ? report.cases.length : 0),
    findings: actionable.slice(0, SHOWN_FINDINGS).map((item) => Object.assign({ area: item.area || "", severity: item.severity || "low" }, frost(item.title))),
    moreCount: Math.max(0, actionable.length - SHOWN_FINDINGS),
    total: actionable.length
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

function footerHtml(t, host, stopUrl) {
  return esc(fill(t.why, { host })) + "<br>" +
    (stopUrl ? "<a href=\"" + esc(stopUrl) + "\" style=\"color:#0e7490;\">" + esc(t.stop) + "</a> &middot; " : "") +
    "<a href=\"" + SITE + "/qa-review.html\" style=\"color:#0e7490;\">QA-lab URL Review</a> &middot; Carlos Muñoz, Bogotá, Colombia";
}

function footerText(t, host, stopUrl) {
  return [fill(t.why, { host }), stopUrl ? t.stop + ": " + stopUrl : "", "QA-lab URL Review · " + SITE + "/qa-review.html"].filter(Boolean).join("\n");
}

function scoreBlock(t, facts) {
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
    "<p style=\"margin:0 0 18px;font-size:22px;line-height:28px;color:#ffffff;\">" + esc(fill(t.title, { host: facts.host })) + "</p>" +
    "<table role=\"presentation\" cellpadding=\"0\" cellspacing=\"0\"><tr>" +
    "<td style=\"font-size:64px;line-height:64px;font-weight:bold;color:#ffffff;padding-right:14px;\">" + overall + "</td>" +
    "<td style=\"vertical-align:bottom;padding-bottom:8px;\"><span style=\"display:inline-block;background:" + scoreColor(overall) + ";color:#ffffff;font-size:14px;font-weight:bold;padding:4px 10px;border-radius:999px;\">" + esc(facts.score.grade || "") + "</span><br><span style=\"font-size:13px;color:#cbd5e1;\">" + esc(t.outOf) + "</span></td>" +
    "</tr></table>" +
    "<p style=\"margin:14px 0 0;font-size:13px;color:#cbd5e1;\">" + facts.pages + " " + esc(t.pages) + " &middot; " + facts.cases + " " + esc(t.cases) + "</p>" +
    "</td></tr>" +
    "<tr><td bgcolor=\"#ffffff\" style=\"background:#ffffff;padding:20px 28px 8px;\"><table role=\"presentation\" width=\"100%\" cellpadding=\"0\" cellspacing=\"0\">" + bars + "</table></td></tr>";
}

function findingsBlock(t, facts) {
  if (!facts.findings.length) return "";
  const rows = facts.findings.map((item) =>
    "<tr><td style=\"padding:10px 0;border-top:1px solid #eef2f6;font-family:Arial,Helvetica,sans-serif;\">" +
    "<span style=\"display:inline-block;width:8px;height:8px;border-radius:8px;background:" + (SEVERITY_COLOR[item.severity] || SEVERITY_COLOR.low) + ";\"></span>&nbsp; " +
    "<span style=\"font-size:11px;letter-spacing:0.06em;text-transform:uppercase;color:#64748b;\">" + esc(t.areas[item.area] || item.area) + "</span><br>" +
    "<span style=\"font-size:15px;line-height:24px;color:#0f172a;\">" + esc(item.shown) + "</span> " +
    "<span aria-hidden=\"true\" style=\"display:inline-block;background:#d6dee8;color:#d6dee8;border-radius:5px;font-size:15px;line-height:18px;\">" + "&nbsp;".repeat(Math.min(34, item.hidden)) + "</span>" +
    "</td></tr>"
  ).join("");
  const more = facts.moreCount ? "<p style=\"margin:8px 0 0;font-family:Arial,Helvetica,sans-serif;font-size:13px;color:#64748b;\">" + esc(fill(t.more, { n: facts.moreCount })) + "</p>" : "";
  return "<tr><td bgcolor=\"#ffffff\" style=\"background:#ffffff;padding:14px 28px 6px;\">" +
    "<p style=\"margin:0 0 6px;font-family:Arial,Helvetica,sans-serif;font-size:13px;font-weight:bold;letter-spacing:0.08em;text-transform:uppercase;color:#0e7490;\">" + esc(t.findings) + "</p>" +
    "<table role=\"presentation\" width=\"100%\" cellpadding=\"0\" cellspacing=\"0\">" + rows + "</table>" + more +
    "</td></tr>";
}

function reportMail(record, options) {
  const opts = options || {};
  const lang = langOf(opts.lang || (record && record.lang));
  const t = COPY[lang];
  const facts = reportFacts(record);
  const openUrl = pageUrl(lang, { report: facts.id, utm_campaign: "report" });
  const anotherUrl = pageUrl(lang, { utm_campaign: "report-another" });
  const scoreHtml = scoreBlock(t, facts);
  const head = scoreHtml || "<tr><td bgcolor=\"#0f172a\" style=\"background:#0f172a;border-radius:16px 16px 0 0;padding:28px;font-family:Arial,Helvetica,sans-serif;font-size:22px;line-height:28px;color:#ffffff;\">" + esc(fill(t.title, { host: facts.host })) + "</td></tr>";
  const inner = head +
    "<tr><td bgcolor=\"#ffffff\" style=\"background:#ffffff;padding:16px 28px 4px;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:23px;color:#334155;\">" + esc(t.lead) + "</td></tr>" +
    findingsBlock(t, facts) +
    "<tr><td bgcolor=\"#ffffff\" style=\"background:#ffffff;border-radius:0 0 16px 16px;padding:18px 28px 22px;\">" +
    button(openUrl, t.open, true) + button(anotherUrl, t.another, false) +
    "<p style=\"margin:4px 0 0;font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:19px;color:#64748b;\">" + esc(t.openNote) + "</p>" +
    (opts.attached ? "<p style=\"margin:10px 0 0;font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:19px;color:#0e7490;font-weight:bold;\">&#128206; " + esc(PDF_COPY[lang].attached) + "</p>" : "") +
    "</td></tr>" +
    "<tr><td style=\"height:16px;line-height:16px;font-size:0;\">&nbsp;</td></tr>" +
    deeperBlock(t, facts.host, facts.id);
  const pick = Array.from(facts.id).reduce((sum, char) => sum + char.charCodeAt(0), 0) % t.subjects.length;
  const subject = facts.score
    ? fill(t.subjects[pick], { host: facts.host, score: Number(facts.score.overall) || 0 })
    : fill(t.subjectPlain, { host: facts.host });
  const findingLines = facts.findings.map((item) => "- " + item.shown + " …");
  const text = [
    fill(t.title, { host: facts.host }),
    facts.score ? (Number(facts.score.overall) || 0) + " " + t.outOf + " (" + (facts.score.grade || "") + ")" : "",
    facts.score ? AREAS.filter((area) => facts.score.areas && facts.score.areas[area]).map((area) => (t.areas[area] || area) + " " + facts.score.areas[area].score).join(" · ") : "",
    "",
    t.lead,
    findingLines.length ? "\n" + t.findings + "\n" + findingLines.join("\n") : "",
    facts.moreCount ? fill(t.more, { n: facts.moreCount }) : "",
    "",
    t.open + ": " + openUrl,
    opts.attached ? PDF_COPY[lang].attached : "",
    t.another + ": " + anotherUrl,
    "",
    t.deeper,
    t.deeperLines.join("\n"),
    t.deeperCta,
    "",
    footerText(t, facts.host, opts.stopUrl)
  ].filter((line, index, all) => line !== "" || all[index - 1] !== "").join("\n");
  return {
    lang,
    subject: subject.slice(0, 140),
    text: text.slice(0, 16000),
    html: shell(lang, fill(t.preheader, { count: facts.total }), inner, footerHtml(t, facts.host, opts.stopUrl))
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

const PDF_STYLE = "@page{size:A4;margin:12mm 0 0}@page:first{margin:0}*{box-sizing:border-box}html,body{margin:0;padding:0}" +
  "body{font-family:Inter,'Helvetica Neue',Arial,sans-serif;color:#0f172a;background:#fff;-webkit-print-color-adjust:exact;print-color-adjust:exact;font-size:10.5pt;line-height:1.45}" +
  ".foot{position:fixed;bottom:0;left:0;right:0;height:11mm;padding:3mm 16mm 0;font-size:8pt;color:#64748b;display:flex;justify-content:space-between;border-top:1px solid #dbe3ea;background:#fff;z-index:2}" +
  ".page{position:relative;z-index:1;padding:0 0 16mm}" +
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
  ".fz{display:inline-block;height:1.25em;vertical-align:-.28em;background-repeat:repeat-x;background-size:auto 2.3em}" +
  ".cases{display:grid;grid-template-columns:1fr 1fr;gap:2mm 5mm}" +
  ".case{background:#fff;border:1px solid #e2e8f0;border-radius:2.6mm;padding:2.4mm 3mm;font-size:9pt;break-inside:avoid}" +
  ".case code{font-family:Menlo,Consolas,monospace;font-size:7.8pt;color:#0e7490;margin-right:1.6mm}.case small{color:#64748b;font-size:7.8pt}" +
  ".more{font-size:9pt;color:#64748b;margin:2.6mm 0 0}" +
  ".cta{margin:8mm 16mm 0;border-radius:5mm;padding:7mm 8mm;color:#fff;background:#0f172a;background-image:linear-gradient(120deg,#0f172a 0%,#134e5e 100%);break-inside:avoid}" +
  ".cta h3{margin:0 0 2mm;font-size:15pt}.cta p{margin:0 0 1.6mm;color:#cfe3ea;font-size:10pt}" +
  ".btns{margin-top:4mm;display:flex;gap:3mm;flex-wrap:wrap}" +
  ".btn{display:inline-block;padding:2.8mm 5mm;border-radius:2.6mm;font-weight:700;text-decoration:none;font-size:10pt}" +
  ".btn.p{background:#5eead4;color:#0f172a}.btn.s{border:1px solid #5eead4;color:#99f6e4}";

// A print page for the mail attachment. Hidden words are filler, so the PDF never carries them.
function reportPdf(record, options) {
  const opts = options || {};
  const lang = langOf(opts.lang || (record && record.lang));
  const t = COPY[lang];
  const p = PDF_COPY[lang];
  const report = (record && record.report) || {};
  const ins = report.insights || {};
  const facts = reportFacts(record);
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
    "<p class=\"t\">" + frostedLine(item.title, index) + "</p>" +
    (item.evidence ? "<p class=\"e\">" + frostedLine(item.evidence, index + 3) + "</p>" : "") +
    "</div>"
  ).join("");
  const caseRows = (Array.isArray(report.cases) ? report.cases : []).slice(0, PDF_CASES).map((item, index) =>
    "<div class=\"case\"><code>" + esc(item.id || "") + "</code><small>" + esc(item.layer || "") + "</small><br>" + frostedLine(item.title, index + 7) + "</div>"
  ).join("");
  const moreCases = Math.max(0, facts.cases - PDF_CASES);
  const html = "<!DOCTYPE html><html lang=\"" + lang + "\"><head><meta charset=\"utf-8\"><title>QA-lab URL Review · " + esc(facts.host) + "</title><style>" + PDF_STYLE + ".fz{background-image:url(" + stripUrl() + ")}</style></head><body>" +
    "<div class=\"foot\"><span>QA-lab URL Review · carlosandmunoz.com/qa-review.html</span><span>" + esc(facts.id) + "</span></div>" +
    "<div class=\"page\">" +
    "<div class=\"hero\"><div class=\"who\"><p class=\"eyebrow\">QA-lab URL Review</p><p class=\"host\">" + esc(facts.host) + "</p>" +
    "<p class=\"meta\">" + esc(fill(p.read, { date })) + " · <code>" + esc(facts.id) + "</code></p><span class=\"badge\">" + esc(p.badge) + "</span></div>" +
    (facts.score ? "<div class=\"ring\" style=\"background:conic-gradient(" + ringColor + " " + overall * 3.6 + "deg,rgba(255,255,255,.14) 0)\"><div><b>" + overall + "</b><i>" + esc(t.outOf) + "</i><em style=\"background:" + ringColor + "\">" + esc(facts.score.grade || "") + "</em></div></div>" : "") +
    "</div>" +
    "<div class=\"stats\">" +
    "<div class=\"stat\"><b>" + facts.pages + "</b><span>" + esc(t.pages) + "</span></div>" +
    "<div class=\"stat\"><b>" + facts.cases + "</b><span>" + esc(t.cases) + "</span></div>" +
    "<div class=\"stat\"><b style=\"color:#b91c1c\">" + fails + "</b><span>" + esc(p.fails) + "</span></div>" +
    "<div class=\"stat\"><b style=\"color:#b45309\">" + (all.length - fails) + "</b><span>" + esc(p.risks) + "</span></div>" +
    "</div>" +
    (areas ? "<div class=\"sec\"><div class=\"areas\">" + areas + "</div></div>" : "") +
    (findings ? "<div class=\"sec\"><h2>" + esc(p.findings) + "</h2><p class=\"note\">" + esc(p.note) + "</p>" + findings + "</div>" : "") +
    (caseRows ? "<div class=\"sec\"><h2>" + esc(p.cases) + "</h2><div class=\"cases\">" + caseRows + "</div>" + (moreCases ? "<p class=\"more\">" + esc(fill(p.moreCases, { n: moreCases })) + "</p>" : "") + "</div>" : "") +
    "<div class=\"cta\"><h3>" + esc(t.deeper) + "</h3>" + t.deeperLines.map((line) => "<p>→ " + esc(line) + "</p>").join("") +
    "<div class=\"btns\"><a class=\"btn p\" href=\"" + esc(openUrl) + "\">" + esc(p.unlock) + "</a><a class=\"btn s\" href=\"" + esc(deeperUrl(t, facts.host, facts.id)) + "\">" + esc(t.deeperCta) + "</a></div></div>" +
    "</div></body></html>";
  const slug = facts.host.replace(/[^a-z0-9.-]/gi, "-").replace(/-+/g, "-").slice(0, 60);
  return { html, filename: "qa-lab-" + slug + "-" + p.file + ".pdf" };
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
    footerText(t, host, opts.stopUrl)
  ].filter((line, index, all) => line !== "" || all[index - 1] !== "").join("\n");
  return {
    lang,
    subject: String((note && note.subject) || "QA-lab URL Review").slice(0, 140),
    text: text.slice(0, 16000),
    html: shell(lang, (note && note.title) || "", inner, footerHtml(t, host, opts.stopUrl))
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
    subject: "{code} ist dein Anmeldecode für QA-lab",
    title: "Bei QA-lab URL Review anmelden",
    lead: "Gib diesen Code auf der Seite ein, auf der du ihn angefordert hast. Er gilt 15 Minuten.",
    link: "Oder öffne diesen Link im selben Browser auf demselben Gerät:",
    button: "Auf diesem Gerät anmelden",
    device: "Ein Code oder Link, der auf einem anderen Gerät oder Browser geöffnet wird, meldet niemanden an und startet keine Prüfung.",
    why: "Du bekommst diese E-Mail, weil auf carlosandmunoz.com eine Anmeldung mit dieser Adresse angefordert wurde. Warst du es nicht, ignoriere sie."
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

function signInMail(lang, sign) {
  const code = langOf(lang);
  const t = SIGN_IN[code];
  const link = pageUrl(code, { signin: sign.id, key: sign.token, utm_campaign: "sign-in" });
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
  const footer = esc(t.why) + "<br><a href=\"" + SITE + "/qa-review.html\" style=\"color:#0e7490;\">QA-lab URL Review</a> &middot; Carlos Muñoz, Bogotá, Colombia";
  return {
    lang: code,
    subject: fill(t.subject, { code: sign.code }),
    text: [t.title, "", t.lead, "", sign.code, "", t.link, link, "", t.device, "", t.why].join("\n"),
    html: shell(code, t.lead, inner, footer)
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

module.exports = { SITE, LANGS, AREAS, langOf, esc, fill, button, shell, scoreColor, frost, reportFacts, reportMail, reportPdf, noteMail, signInMail, stopPage, pageUrl };
