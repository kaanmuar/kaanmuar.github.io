/* The many-URL comparison report: qa-review.html?comparison=<id> opens a comparison saved by the account,
   with the benchmark (js/qa-review-benchmark.js) and a summary table on top and then every section of the review report, one column per URL. Each column
   is drawn by the report's own painters (QAReviewSections in js/qa-review.js). A report the account has not
   paid comes under the frost, and Print and Download PDF open once every report in it is paid. */
(function () {
  "use strict";

  const COPY = {
    en: {
      kicker: "Comparison report", saved: "Saved on {date}", vs: "vs", print: "Print", pdf: "Download PDF", close: "Close",
      unlockToPrint: "Unlock to print", unlock: "Unlock {site}", pdfBusy: "Preparing the PDF…", pdfDone: "The PDF is downloaded.",
      pdfFailed: "The PDF did not download. Try again, or use Print.",
      locked_one: "{n} report in this comparison is not paid. Its wording stays blurred, and Print and Download PDF open once it is paid.",
      locked_other: "{n} reports in this comparison are not paid. Their wording stays blurred, and Print and Download PDF open once they are paid.",
      summary: "Side by side", indicator: "Indicator", wins: "Indicators won", leadNote: "Shaded cells lead their line. Scores come from automated reviews, a starting point and not a verdict.",
      missing: "This review was deleted after the comparison was saved.", opening: "Opening the comparison…",
      failedRuns: "Not in this comparison, because their review did not finish:",
      signIn: "Sign in with the account that saved this comparison to open it.", failed: "The comparison did not open. Try again in a moment.",
      saving: "Saving the comparison…", saveFailed: "The comparison was not saved. Try again in a moment.",
      nothing: "Nothing here for this site.", more: "…and {n} more, in the report on the page.",
      seoBlocked: "Pages not indexable, by reason", seoCanonical: "Canonical to another page",
      sections: {
        cover: "Cover and key figures", exec: "One-page summary", health: "Health score", fix: "Fix first", browser: "In a real browser",
        previews: "How it looks in Google and when shared", geo: "What AI sees", analytics: "Analytics and consent", seo: "Search visibility",
        graph: "Map of the pages analyzed", security: "Security and email", findings: "Every check, with its verdict", fixkit: "Fix kit",
        glance: "At a glance", layers: "Proposed cases by layer", tech: "Technologies seen", alarm: "What the public response left in the open",
        mentions: "Public write-ups", observed: "What the response showed", pages: "Pages analyzed", log: "Review log kept with this run",
        cases: "Cases that could be run"
      }
    },
    es: {
      kicker: "Informe comparativo", saved: "Guardado el {date}", vs: "vs", print: "Imprimir", pdf: "Descargar PDF", close: "Cerrar",
      unlockToPrint: "Desbloquear para imprimir", unlock: "Desbloquear {site}", pdfBusy: "Preparando el PDF…", pdfDone: "El PDF se ha descargado.",
      pdfFailed: "El PDF no se descargó. Inténtalo de nuevo o usa Imprimir.",
      locked_one: "{n} informe de esta comparación no está pagado. Su texto sigue difuminado, e Imprimir y Descargar PDF se abren cuando se pague.",
      locked_other: "{n} informes de esta comparación no están pagados. Su texto sigue difuminado, e Imprimir y Descargar PDF se abren cuando se paguen.",
      summary: "Lado a lado", indicator: "Indicador", wins: "Indicadores ganados", leadNote: "Las celdas sombreadas encabezan su línea. Las puntuaciones salen de revisiones automáticas: un punto de partida, no un veredicto.",
      missing: "Esta revisión se eliminó después de guardar la comparación.", opening: "Abriendo la comparación…",
      failedRuns: "No están en esta comparación porque su revisión no terminó:",
      signIn: "Inicia sesión con la cuenta que guardó esta comparación para abrirla.", failed: "La comparación no se abrió. Inténtalo de nuevo en un momento.",
      saving: "Guardando la comparación…", saveFailed: "La comparación no se guardó. Inténtalo de nuevo en un momento.",
      nothing: "Nada aquí para este sitio.", more: "…y {n} más, en el informe de la página.",
      seoBlocked: "Páginas no indexables, por motivo", seoCanonical: "Canonical hacia otra página",
      sections: {
        cover: "Portada y cifras clave", exec: "Resumen en una página", health: "Puntuación de salud", fix: "Corregir primero", browser: "En un navegador real",
        previews: "Cómo se ve en Google y al compartirse", geo: "Lo que ve la IA", analytics: "Analítica y consentimiento", seo: "Visibilidad en buscadores",
        graph: "Mapa de las páginas analizadas", security: "Seguridad y correo", findings: "Cada comprobación, con su veredicto", fixkit: "Kit de corrección",
        glance: "De un vistazo", layers: "Casos propuestos por capa", tech: "Tecnologías detectadas", alarm: "Lo que la respuesta pública dejó a la vista",
        mentions: "Artículos públicos", observed: "Lo que mostró la respuesta", pages: "Páginas analizadas", log: "Registro de la revisión",
        cases: "Casos que se podrían ejecutar"
      }
    },
    pt: {
      kicker: "Relatório comparativo", saved: "Salvo em {date}", vs: "vs", print: "Imprimir", pdf: "Baixar PDF", close: "Fechar",
      unlockToPrint: "Desbloquear para imprimir", unlock: "Desbloquear {site}", pdfBusy: "Preparando o PDF…", pdfDone: "O PDF foi baixado.",
      pdfFailed: "O PDF não foi baixado. Tente de novo ou use Imprimir.",
      locked_one: "{n} relatório desta comparação não está pago. O texto continua desfocado, e Imprimir e Baixar PDF abrem quando for pago.",
      locked_other: "{n} relatórios desta comparação não estão pagos. O texto continua desfocado, e Imprimir e Baixar PDF abrem quando forem pagos.",
      summary: "Lado a lado", indicator: "Indicador", wins: "Indicadores ganhos", leadNote: "As células sombreadas lideram a sua linha. As pontuações vêm de revisões automáticas: um ponto de partida, não um veredicto.",
      missing: "Esta revisão foi apagada depois que a comparação foi salva.", opening: "Abrindo a comparação…",
      failedRuns: "Não estão nesta comparação porque a revisão não terminou:",
      signIn: "Entre com a conta que salvou esta comparação para abri-la.", failed: "A comparação não abriu. Tente de novo em instantes.",
      saving: "Salvando a comparação…", saveFailed: "A comparação não foi salva. Tente de novo em instantes.",
      nothing: "Nada aqui para este site.", more: "…e mais {n}, no relatório da página.",
      seoBlocked: "Páginas não indexáveis, por motivo", seoCanonical: "Canonical para outra página",
      sections: {
        cover: "Capa e números principais", exec: "Resumo em uma página", health: "Pontuação de saúde", fix: "Corrigir primeiro", browser: "Em um navegador real",
        previews: "Como aparece no Google e ao compartilhar", geo: "O que a IA vê", analytics: "Analytics e consentimento", seo: "Visibilidade nas pesquisas",
        graph: "Mapa das páginas analisadas", security: "Segurança e email", findings: "Cada verificação, com o seu veredicto", fixkit: "Kit de correção",
        glance: "Visão geral", layers: "Casos propostos por camada", tech: "Tecnologias encontradas", alarm: "O que a resposta pública deixou à vista",
        mentions: "Artigos públicos", observed: "O que a resposta mostrou", pages: "Páginas analisadas", log: "Registro da revisão",
        cases: "Casos que podem ser executados"
      }
    },
    de: {
      kicker: "Vergleichsbericht", saved: "Gespeichert am {date}", vs: "vs.", print: "Drucken", pdf: "PDF herunterladen", close: "Schließen",
      unlockToPrint: "Zum Drucken freischalten", unlock: "{site} freischalten", pdfBusy: "Das PDF wird erstellt…", pdfDone: "Das PDF ist heruntergeladen.",
      pdfFailed: "Das PDF wurde nicht heruntergeladen. Versuchen Sie es erneut oder nutzen Sie Drucken.",
      locked_one: "{n} Bericht in diesem Vergleich ist nicht bezahlt. Sein Text bleibt unscharf, und Drucken und PDF herunterladen öffnen sich, sobald er bezahlt ist.",
      locked_other: "{n} Berichte in diesem Vergleich sind nicht bezahlt. Ihr Text bleibt unscharf, und Drucken und PDF herunterladen öffnen sich, sobald sie bezahlt sind.",
      summary: "Nebeneinander", indicator: "Kennzahl", wins: "Gewonnene Kennzahlen", leadNote: "Schattierte Zellen führen ihre Zeile an. Die Werte stammen aus automatischen Prüfungen: ein Ausgangspunkt, kein Urteil.",
      missing: "Diese Prüfung wurde gelöscht, nachdem der Vergleich gespeichert wurde.", opening: "Der Vergleich wird geöffnet…",
      failedRuns: "Nicht in diesem Vergleich, weil ihre Prüfung nicht fertig wurde:",
      signIn: "Melden Sie sich mit dem Konto an, das diesen Vergleich gespeichert hat, um ihn zu öffnen.", failed: "Der Vergleich wurde nicht geöffnet. Versuchen Sie es gleich noch einmal.",
      saving: "Der Vergleich wird gespeichert…", saveFailed: "Der Vergleich wurde nicht gespeichert. Versuchen Sie es gleich noch einmal.",
      nothing: "Für diese Website nichts.", more: "…und {n} weitere, im Bericht auf der Seite.",
      seoBlocked: "Nicht indexierbare Seiten, nach Grund", seoCanonical: "Canonical auf eine andere Seite",
      sections: {
        cover: "Deckblatt und Kennzahlen", exec: "Zusammenfassung auf einer Seite", health: "Gesundheitswert", fix: "Zuerst beheben", browser: "In einem echten Browser",
        previews: "So sieht es bei Google und beim Teilen aus", geo: "Was KI sieht", analytics: "Analytics und Einwilligung", seo: "Sichtbarkeit in der Suche",
        graph: "Karte der geprüften Seiten", security: "Sicherheit und E-Mail", findings: "Jede Prüfung mit ihrem Ergebnis", fixkit: "Fix-Kit",
        glance: "Auf einen Blick", layers: "Vorgeschlagene Fälle nach Ebene", tech: "Erkannte Technologien", alarm: "Was die öffentliche Antwort offenlegte",
        mentions: "Öffentliche Artikel", observed: "Was die Antwort zeigte", pages: "Geprüfte Seiten", log: "Protokoll dieser Prüfung",
        cases: "Ausführbare Fälle"
      }
    },
    fr: {
      kicker: "Rapport comparatif", saved: "Enregistré le {date}", vs: "vs", print: "Imprimer", pdf: "Télécharger le PDF", close: "Fermer",
      unlockToPrint: "Débloquer pour imprimer", unlock: "Débloquer {site}", pdfBusy: "Préparation du PDF…", pdfDone: "Le PDF est téléchargé.",
      pdfFailed: "Le PDF ne s'est pas téléchargé. Réessayez ou utilisez Imprimer.",
      locked_one: "{n} rapport de cette comparaison n'est pas payé. Son texte reste flouté, et Imprimer et Télécharger le PDF s'ouvrent une fois qu'il est payé.",
      locked_other: "{n} rapports de cette comparaison ne sont pas payés. Leur texte reste flouté, et Imprimer et Télécharger le PDF s'ouvrent une fois qu'ils sont payés.",
      summary: "Côte à côte", indicator: "Indicateur", wins: "Indicateurs gagnés", leadNote: "Les cellules ombrées mènent leur ligne. Les scores viennent de revues automatiques : un point de départ, pas un verdict.",
      missing: "Cette revue a été supprimée après l'enregistrement de la comparaison.", opening: "Ouverture de la comparaison…",
      failedRuns: "Absents de cette comparaison, car leur analyse n’a pas abouti :",
      signIn: "Connectez-vous avec le compte qui a enregistré cette comparaison pour l'ouvrir.", failed: "La comparaison ne s'est pas ouverte. Réessayez dans un instant.",
      saving: "Enregistrement de la comparaison…", saveFailed: "La comparaison n'a pas été enregistrée. Réessayez dans un instant.",
      nothing: "Rien ici pour ce site.", more: "…et {n} de plus, dans le rapport en ligne.",
      seoBlocked: "Pages non indexables, par motif", seoCanonical: "Canonical vers une autre page",
      sections: {
        cover: "Couverture et chiffres clés", exec: "Résumé en une page", health: "Score de santé", fix: "À corriger d'abord", browser: "Dans un vrai navigateur",
        previews: "L'aperçu dans Google et en partage", geo: "Ce que voit l'IA", analytics: "Analytics et consentement", seo: "Visibilité dans la recherche",
        graph: "Carte des pages analysées", security: "Sécurité et e-mail", findings: "Chaque contrôle, avec son verdict", fixkit: "Kit de correction",
        glance: "En un coup d'œil", layers: "Cas proposés par couche", tech: "Technologies repérées", alarm: "Ce que la réponse publique a laissé à découvert",
        mentions: "Articles publics", observed: "Ce que la réponse a montré", pages: "Pages analysées", log: "Journal de la revue",
        cases: "Cas qui pourraient être exécutés"
      }
    },
    it: {
      kicker: "Report comparativo", saved: "Salvato il {date}", vs: "vs", print: "Stampa", pdf: "Scarica PDF", close: "Chiudi",
      unlockToPrint: "Sblocca per stampare", unlock: "Sblocca {site}", pdfBusy: "Preparazione del PDF…", pdfDone: "Il PDF è stato scaricato.",
      pdfFailed: "Il PDF non è stato scaricato. Riprova o usa Stampa.",
      locked_one: "{n} report di questo confronto non è pagato. Il testo resta sfocato, e Stampa e Scarica PDF si aprono quando è pagato.",
      locked_other: "{n} report di questo confronto non sono pagati. Il testo resta sfocato, e Stampa e Scarica PDF si aprono quando sono pagati.",
      summary: "Fianco a fianco", indicator: "Indicatore", wins: "Indicatori vinti", leadNote: "Le celle ombreggiate guidano la loro riga. I punteggi vengono da revisioni automatiche: un punto di partenza, non un verdetto.",
      missing: "Questa revisione è stata eliminata dopo aver salvato il confronto.", opening: "Apertura del confronto…",
      failedRuns: "Non sono in questo confronto perché la revisione non è terminata:",
      signIn: "Accedi con l'account che ha salvato questo confronto per aprirlo.", failed: "Il confronto non si è aperto. Riprova tra un momento.",
      saving: "Salvataggio del confronto…", saveFailed: "Il confronto non è stato salvato. Riprova tra un momento.",
      nothing: "Niente qui per questo sito.", more: "…e altri {n}, nel report sulla pagina.",
      seoBlocked: "Pagine non indicizzabili, per motivo", seoCanonical: "Canonical verso un'altra pagina",
      sections: {
        cover: "Copertina e cifre chiave", exec: "Riepilogo in una pagina", health: "Punteggio di salute", fix: "Da correggere prima", browser: "In un browser reale",
        previews: "Come appare su Google e quando è condiviso", geo: "Cosa vede l'IA", analytics: "Analytics e consenso", seo: "Visibilità nella ricerca",
        graph: "Mappa delle pagine analizzate", security: "Sicurezza ed email", findings: "Ogni controllo, con il suo verdetto", fixkit: "Kit di correzione",
        glance: "In breve", layers: "Casi proposti per livello", tech: "Tecnologie rilevate", alarm: "Cosa la risposta pubblica ha lasciato in vista",
        mentions: "Articoli pubblici", observed: "Cosa ha mostrato la risposta", pages: "Pagine analizzate", log: "Registro della revisione",
        cases: "Casi che si potrebbero eseguire"
      }
    }
  };

  // Each section: its title key and the cells the painters fill, as in the report on this page.
  const SECTIONS = [
    ["cover", '<header class="report-cover" data-slot="report-cover"></header><div class="kpis" data-slot="kpis"></div>'],
    ["exec", '<article class="card" data-slot="exec"></article>'],
    ["health", '<div data-slot="health"></div>'],
    ["fix", '<article class="card" data-slot="fix-first"></article>'],
    ["browser", '<div data-slot="browser-pass"></div>'],
    ["previews", '<div class="previews" data-slot="previews"></div>'],
    ["geo", '<div data-slot="geo"></div>'],
    ["analytics", '<div data-slot="analytics"></div>'],
    ["seo", '<div data-slot="seo"></div>'],
    ["graph", '<article class="card" data-slot="site-graph"></article>'],
    ["security", '<article class="card" data-slot="security"></article>'],
    ["findings", '<div class="filters no-print" data-slot="finding-filters"></div><article class="card" data-slot="findings"></article>'],
    ["fixkit", '<article class="card" data-slot="fixkit"></article>'],
    ["glance", '<div class="visuals" data-slot="report-visuals"></div>'],
    ["layers", '<article class="card"><div data-slot="layers"></div></article>'],
    ["tech", '<article class="card"><div class="pills" data-slot="tech"></div></article>'],
    ["alarm", '<section class="alarm" data-slot="alarm"><p class="alarm-note" data-slot="alarm-note"></p><ol class="alarm-list" data-slot="alarm-list"></ol></section>'],
    ["mentions", '<article class="card"><section class="mentions"><ol data-slot="mentions"></ol></section></article>'],
    ["observed", '<article class="card" data-slot="observed"></article>'],
    ["pages", '<article class="card"><p class="muted" data-slot="pages-found" hidden></p><table class="page-table"><thead><tr><th>Path</th><th>Status</th><th>ms</th><th>Title</th></tr></thead><tbody data-slot="pages"></tbody></table></article>'],
    ["log", '<article class="card"><ol class="log" data-slot="report-log"></ol></article>'],
    ["cases", '<article class="card" data-slot="cases"></article>']
  ];

  const code = String(document.documentElement.lang || "en").slice(0, 2).toLowerCase();
  const book = COPY[code] || COPY.en;
  const cc = window.QAReviewCompareCopy;

  function t(key, vars) {
    const plural = vars && typeof vars.n === "number" && book[key + "_one"] ? key + (vars.n === 1 ? "_one" : "_other") : key;
    const template = book[plural] != null ? book[plural] : COPY.en[plural];
    return String(template).replace(/\{(\w+)\}/g, (match, name) => (vars && vars[name] != null ? String(vars[name]) : match));
  }

  function esc(value) {
    return String(value == null ? "" : value).replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" }[ch]));
  }

  function endpoint() {
    if (location.hostname === "127.0.0.1" || location.hostname === "localhost") return "http://127.0.0.1:8768";
    return "https://us-central1-carlosm-interactive-cv.cloudfunctions.net/reviewUrl";
  }

  function post(path, extra) {
    return fetch(endpoint() + path, {
      method: "POST",
      cache: "no-store",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(Object.assign({}, extra || {}, window.ReviewAuth ? ReviewAuth.proof() : {}))
    });
  }

  function payHref(col) {
    return "qa-review-pay.html?purpose=report&reportId=" + encodeURIComponent(col.id) + "&frameworks=" + encodeURIComponent((col.frameworks || []).join(","));
  }

  let overlay = null;
  let made = null;

  function shell() {
    if (overlay) return overlay;
    overlay = document.createElement("div");
    overlay.className = "dash-overlay multi-overlay";
    overlay.id = "multi-overlay";
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true");
    overlay.setAttribute("aria-labelledby", "multi-title");
    overlay.innerHTML = '<div class="dash-modal multi-modal">' +
      '<div class="dash-modal-head multi-head"><div><p class="report-kicker" translate="no">' + esc(t("kicker")) + '</p><h2 id="multi-title" translate="no"></h2><p class="muted" id="multi-when" translate="no"></p></div>' +
      '<div class="multi-actions no-print" translate="no"><button class="btn btn-primary" type="button" id="multi-print"></button><button class="btn btn-ghost" type="button" id="multi-pdf"></button><button class="btn btn-ghost" type="button" id="multi-close">' + esc(t("close")) + "</button></div></div>" +
      '<p id="multi-status" role="status" class="no-print" translate="no"></p><div id="multi-locked" class="multi-locked no-print" translate="no" hidden></div>' +
      '<div id="multi-failed" class="multi-locked multi-failed no-print" role="note" translate="no" hidden></div>' +
      '<div id="multi-body"></div></div>';
    document.body.appendChild(overlay);
    overlay.querySelector("#multi-close").addEventListener("click", close);
    overlay.querySelector("#multi-body").addEventListener("click", fold);
    overlay.querySelector("#multi-print").addEventListener("click", () => (made && made.paid ? print() : pay()));
    overlay.querySelector("#multi-pdf").addEventListener("click", () => (made && made.paid ? download() : pay()));
    overlay.addEventListener("keydown", (event) => { if (event.key === "Escape") close(); });
    return overlay;
  }

  function say(message, bad) {
    const status = shell().querySelector("#multi-status");
    status.textContent = message || "";
    status.classList.toggle("bad", !!bad);
  }

  function close() {
    if (!overlay) return;
    overlay.classList.remove("open");
    document.body.style.overflow = "";
    const params = new URLSearchParams(location.search);
    if (params.has("comparison")) {
      params.delete("comparison");
      history.replaceState(null, "", location.pathname + (params.toString() ? "?" + params : "") + location.hash);
    }
  }

  function pay() {
    const first = made && made.locked && made.locked[0];
    if (first) location.href = payHref(first);
  }

  function label(row) {
    if (row.area) return cc ? cc.area(row.area) : row.area;
    if (row.key === "overall") return cc ? cc.t("overall") : row.label;
    return cc ? cc.kpi({ key: row.key, label: row.label }) : row.label;
  }

  function value(row, raw) {
    if (raw == null) return "–";
    if (row.unit === "bytes") return raw >= 1e6 ? (raw / 1e6).toFixed(1) + " MB" : Math.round(raw / 1e3) + " KB";
    if (row.unit === "ms") return Math.round(raw) + " ms";
    if (row.unit === "%") return raw + "%";
    return String(row.key === "cls" ? Math.round(raw * 1000) / 1000 : raw);
  }

  function summaryHtml(data) {
    const S = window.QAReviewSections;
    const cols = data.columns;
    const head = "<tr><th scope=\"col\">" + esc(t("indicator")) + "</th>" + cols.map((col) => '<th scope="col" translate="no">' + esc(col.host).replace(/\./g, ".<wbr>") + "</th>").join("") + "</tr>";
    const rows = data.summary.rows.map((row) => "<tr><th scope=\"row\">" + esc(label(row)) + (row.better === "low" && cc ? ' <small class="muted">' + esc(cc.t("lower")) + "</small>" : "") + "</th>" +
      row.values.map((raw, index) => {
        const lead = row.leads.length === 1 && row.leads[0] === index;
        const shown = row.kind === "score" && raw != null ? '<b style="color:' + S.scoreColor(raw) + '">' + esc(raw) + "</b>" : esc(value(row, raw));
        return "<td" + (lead ? ' class="lead"' : "") + ">" + shown + "</td>";
      }).join("") + "</tr>").join("");
    const wins = "<tr class=\"multi-wins\"><th scope=\"row\">" + esc(t("wins")) + "</th>" + data.summary.wins.map((n) => "<td>" + n + "</td>").join("") + "</tr>";
    return '<section class="multi-summary"><h2 translate="no">' + esc(t("summary")) + '</h2><div class="multi-scroll"><table class="compare-table multi-table">' +
      "<thead>" + head + "</thead><tbody>" + rows + wins + "</tbody></table></div><p class=\"meta-line\" translate=\"no\">" + esc(t("leadNote")) + "</p></section>";
  }

  // A column of the grid as the painters see it: its cells in every section row.
  function columnRoot(grid, index, payload) {
    const cells = () => [...grid.querySelectorAll('.multi-cell[data-col="' + index + '"]')];
    return {
      payload,
      cells,
      querySelector(selector) {
        for (const cell of cells()) {
          const hit = cell.querySelector(selector);
          if (hit) return hit;
        }
        return null;
      }
    };
  }

  const siteColor = (index) => (window.QAReviewBenchmark && QAReviewBenchmark.color ? QAReviewBenchmark.color(index) : "var(--own)");

  function bodyHtml(data) {
    const n = data.columns.length;
    const rc = window.QAReviewReportCopy;
    const hosts = '<div class="multi-hosts-bar"><div class="multi-row multi-hosts">' + data.columns.map((col, index) =>
      '<div class="multi-cell" style="--site:' + siteColor(index) + '"><p class="multi-host" translate="no">' + esc(col.host).replace(/\./g, ".<wbr>") + "</p>" +
      (col.missing ? "" : '<p class="meta-line" translate="no">' + esc(col.at ? new Date(col.at).toLocaleDateString(code) : "") + (col.paid ? "" : ' · <a class="no-print" href="' + esc(payHref(col)) + '">' + esc(t("unlock", { site: col.host })) + "</a>") + "</p>") + "</div>").join("") + "</div></div>";
    const foldAll = rc ? '<div class="fold-bar no-print"><button class="btn btn-ghost" type="button" id="multi-fold-all" aria-expanded="true" translate="no">' + esc(rc.t("collapseAll")) + "</button></div>" : "";
    const bench = window.QAReviewBenchmark ? QAReviewBenchmark.html(data) : "";
    return bench + summaryHtml(data) + '<div class="multi-sheet" style="--cols:' + n + '">' + foldAll + hosts + '<div class="multi-scroll multi-grid">' + SECTIONS.map(([key, cell]) => {
      const title = esc(book.sections[key] || COPY.en.sections[key]);
      return '<section class="multi-sec" data-sec="' + key + '"><h2 translate="no"><button class="fold-toggle" type="button" id="multi-toggle-' + key + '" aria-expanded="true" aria-controls="multi-row-' + key + '"><span>' + title +
        '</span><span class="fold-icon" aria-hidden="true"></span></button></h2><div class="multi-row fold-panel" id="multi-row-' + key + '" role="region" aria-labelledby="multi-toggle-' + key + '">' +
        data.columns.map((col, index) => '<div class="multi-cell' + (col.paid ? "" : " is-frost") + '" data-col="' + index + '" data-host="' + esc(col.host) + '" style="--site:' + siteColor(index) + '">' +
          (col.missing ? '<p class="muted">' + esc(t("missing")) + "</p>" : cell) + "</div>").join("") +
        "</div></section>";
    }).join("") + "</div></div>";
  }

  // Only sentences, maybe in plain wrappers. Inside a card they must be the muted line a painter leaves when it
  // has nothing to show, so a card of real text keeps its box.
  function sentencesOnly(el, card) {
    return [...el.children].filter((kid) => !kid.hidden && kid.textContent.trim()).every((kid) =>
      card && kid.classList.contains("muted") ? true
        : kid.tagName === "P" ? !card
          : /^(DIV|SECTION|OL|UL)$/.test(kid.tagName) && sentencesOnly(kid, card));
  }

  // A cell the painters left empty or hidden says so, and a section empty for every site is left out.
  // A cell holding only sentences is drawn as a note box at its own height, not stretched to its neighbours'.
  function settle(grid) {
    grid.querySelectorAll(".multi-sec").forEach((sec) => {
      let filled = 0;
      sec.querySelectorAll(".multi-cell").forEach((cell) => {
        const shown = [...cell.children].filter((child) => !child.hidden && child.textContent.trim());
        if (shown.length) {
          filled += 1;
          if (shown.every((child) => child.matches(".card") ? child.querySelector(".muted") && sentencesOnly(child, true) : sentencesOnly(child, false))) cell.classList.add("is-note");
          return;
        }
        [...cell.children].forEach((child) => { child.hidden = true; });
        cell.classList.add("is-empty");
        cell.insertAdjacentHTML("beforeend", '<p class="multi-empty" translate="no">' + esc(t("nothing")) + "</p>");
      });
      sec.hidden = !filled;
    });
  }

  // In print a long list stops after PRINT_ROWS with a line counting the rest, as the screen stops it in a
  // scroll box, so one long column does not leave the others blank for pages.
  const PRINT_ROWS = 12;
  function capForPrint(grid) {
    grid.querySelectorAll('[data-slot="pages"], [data-slot="report-log"]').forEach((list) => {
      const rows = [...list.children].filter((row) => !row.hidden);
      if (rows.length <= PRINT_ROWS) return;
      rows.slice(PRINT_ROWS).forEach((row) => row.classList.add("print-cut"));
      const text = esc(t("more", { n: rows.length - PRINT_ROWS }));
      list.insertAdjacentHTML("beforeend", list.tagName === "TBODY" ? '<tr class="print-more"><td colspan="4">' + text + "</td></tr>" : '<li class="print-more">' + text + "</li>");
    });
  }

  // The reason a page cannot be indexed, from the server's English line: unpaid reports come without reasonMsg.
  function seoReason(row) {
    const why = String(row.reason || "");
    const status = why.match(/^Status (\d+)/);
    if (status) return { key: "status-" + status[1], msg: { id: "reason.status", vars: { status: status[1] } }, en: "Status " + status[1] };
    if (/^Canonical points to /.test(why)) return { key: "canonical", label: t("seoCanonical") };
    if (why === "noindex") return { key: "noindex", label: "noindex" };
    if (/^Blocked for Googlebot/.test(why)) return { key: "googlebot", msg: { id: "reason.googlebot" }, en: why };
    const bot = why.match(/^(.+) bot check$/);
    if (bot) return { key: "bot-" + bot[1], msg: { id: "reason.botCheck", vars: { vendor: bot[1] } }, en: why };
    return { key: "unread", msg: { id: "reason.notRead" }, en: "Not read" };
  }

  // Search visibility in a column: its figures, then the pages that cannot be indexed summed by reason with the
  // first SEO_ROWS of them, one of each reason first, then the notes, each in its own box. data-part names the
  // boxes in the same order in every column.
  const SEO_ROWS = 5;
  function tidySeo(grid, data) {
    const fc = window.QAReviewFindingsCopy || { line: (message, fallback) => fallback };
    grid.querySelectorAll('.multi-sec[data-sec="seo"] .multi-cell').forEach((cell) => {
      const col = data.columns[Number(cell.dataset.col)];
      const slot = cell.querySelector('[data-slot="seo"]');
      const stats = slot && slot.querySelector(":scope > .stat-row");
      const card = slot && slot.querySelector(":scope > .card");
      if (!col || col.missing || !stats || !card) return;
      stats.dataset.part = "stats";
      card.dataset.part = "unindexable";
      const notes = [...card.querySelectorAll(":scope > .meta-line")];
      if (notes.length) {
        const box = document.createElement("article");
        box.className = "card multi-seo-notes";
        box.dataset.part = "notes";
        notes.forEach((note) => { note.title = note.textContent; box.appendChild(note); });
        card.after(box);
      }
      const all = (((col.report || {}).insights || {}).seo || {}).indexability || [];
      const blocked = all.filter((row) => !row.indexable).map((row) => Object.assign({ why: seoReason(row) }, row));
      const lone = card.querySelector(":scope > .muted");
      if (lone) lone.title = lone.textContent;
      if (!blocked.length) return;
      const groups = new Map();
      blocked.forEach((row) => {
        if (!groups.has(row.why.key)) groups.set(row.why.key, { why: row.why, rows: [] });
        groups.get(row.why.key).rows.push(row);
      });
      const ranked = [...groups.values()].sort((a, b) => b.rows.length - a.rows.length);
      const firsts = ranked.map((group) => group.rows[0]);
      const shown = firsts.concat(blocked.filter((row) => !firsts.includes(row))).slice(0, SEO_ROWS);
      const label = (why) => why.label || fc.line(why.msg, why.en);
      card.innerHTML = '<h3 class="multi-seo-head" translate="no">' + esc(t("seoBlocked")) + "</h3>" +
        '<ul class="multi-seo-reasons" translate="no">' + ranked.map((group) => "<li><span>" + esc(label(group.why)) + "</span> <b>" + group.rows.length + "</b></li>").join("") + "</ul>" +
        '<ul class="multi-seo-pages">' + shown.map((row) => {
          const why = fc.line(row.reasonMsg, row.reason);
          return '<li><span class="notranslate" translate="no" title="' + esc(row.path) + '">' + esc(row.path) + '</span><small title="' + esc(why) + '">' + esc(why) + "</small></li>";
        }).join("") + "</ul>" +
        (blocked.length > shown.length ? '<p class="multi-seo-more" translate="no">' + esc(t("more", { n: blocked.length - shown.length })) + "</p>" : "");
    });
  }

  function setFold(sec, open) {
    sec.querySelector(".multi-row").hidden = !open;
    sec.querySelector(".fold-toggle").setAttribute("aria-expanded", String(open));
    sec.classList.toggle("is-folded", !open);
  }

  function paintFoldAll(body) {
    const all = body.querySelector("#multi-fold-all");
    if (!all) return;
    const anyOpen = [...body.querySelectorAll(".multi-sec:not([hidden]) .multi-row")].some((row) => !row.hidden);
    all.textContent = QAReviewReportCopy.t(anyOpen ? "collapseAll" : "expandAll");
    all.setAttribute("aria-expanded", String(anyOpen));
  }

  // One toggle per section opens or closes it for every site at once, so the columns stay level.
  function fold(event) {
    const body = event.currentTarget;
    const toggle = event.target.closest(".multi-sec > h2 .fold-toggle");
    const all = event.target.closest("#multi-fold-all");
    if (toggle) {
      const sec = toggle.closest(".multi-sec");
      setFold(sec, sec.querySelector(".multi-row").hidden);
    } else if (all) {
      const open = all.getAttribute("aria-expanded") !== "true";
      body.querySelectorAll(".multi-sec").forEach((sec) => setFold(sec, open));
    } else return;
    paintFoldAll(body);
  }

  // A site in the title: its logo, with a letter under it that shows when there is no logo or it fails to load,
  // then its name, and its address when the name is more than the address.
  function bareHost(host) {
    return String(host || "").replace(/^www\./i, "");
  }

  // An address breaks only after a dot, never inside a word.
  function hostHtml(host) {
    return esc(bareHost(host)).replace(/\./g, ".<wbr>");
  }

  // Each "vs" stays with the site after it, so a wrapped row never starts or ends on a lone "vs".
  function siteBadge(col, index) {
    const name = col.name || bareHost(col.host);
    const letter = (name.match(/[\p{L}\p{N}]/u) || ["?"])[0].toUpperCase();
    const logo = col.icon ? '<img class="multi-logo" src="' + esc(col.icon) + '" alt="" referrerpolicy="no-referrer" decoding="async" data-logo="' + index + '">' : "";
    return '<span class="multi-site" style="--site:' + siteColor(index) + '">' + (index ? '<span class="multi-vs">' + esc(t("vs")) + "</span>" : "") +
      '<span class="multi-badge"><span class="multi-mark" aria-hidden="true">' + logo + "<span>" + esc(letter) + "</span></span>" +
      '<span class="multi-site-name">' + (col.name ? esc(name) : hostHtml(col.host)) + "</span>" + (col.name ? "<small>" + hostHtml(col.host) + "</small>" : "") + "</span></span>";
  }

  function paint(data) {
    made = data;
    const root = shell();
    const S = window.QAReviewSections;
    const title = root.querySelector("#multi-title");
    title.innerHTML = data.columns.map(siteBadge).join("");
    title.setAttribute("aria-label", data.columns.map((col) => col.name || bareHost(col.host)).join(" " + t("vs") + " "));
    title.querySelectorAll("img.multi-logo").forEach((img) => img.addEventListener("error", () => img.remove(), { once: true }));
    root.querySelector("#multi-when").textContent = data.at ? t("saved", { date: new Date(data.at).toLocaleDateString(code) }) : "";
    const printBtn = root.querySelector("#multi-print");
    const pdfBtn = root.querySelector("#multi-pdf");
    printBtn.textContent = data.paid ? t("print") : "🔒 " + t("unlockToPrint");
    pdfBtn.textContent = data.paid ? t("pdf") : "🔒 " + t("pdf");
    const locked = root.querySelector("#multi-locked");
    locked.hidden = data.paid;
    locked.innerHTML = data.paid ? "" : "<p>" + esc(t("locked", { n: data.locked.length })) + "</p><p>" +
      data.locked.map((col) => '<a class="btn btn-ghost" href="' + esc(payHref(col)) + '">' + esc(t("unlock", { site: col.host })) + "</a>").join(" ") + "</p>";
    const body = root.querySelector("#multi-body");
    body.innerHTML = bodyHtml(data);
    const grid = body.querySelector(".multi-grid");
    data.columns.forEach((col, index) => {
      if (col.missing) return;
      try {
        S.paint({ report: col.report, paid: col.paid, frameworks: col.frameworks || [] }, columnRoot(grid, index, null));
      } catch (error) {
        console.error("A comparison column did not draw:", error);
      }
    });
    grid.querySelectorAll(".report-cover h2").forEach((heading) => { heading.innerHTML = esc(heading.textContent).replace(/\./g, ".<wbr>"); });
    tidySeo(grid, data);
    settle(grid);
    capForPrint(grid);
    const bar = body.querySelector(".multi-hosts-bar");
    grid.addEventListener("scroll", () => { bar.scrollLeft = grid.scrollLeft; }, { passive: true });
    say("");
  }

  function open() {
    shell().classList.add("open");
    document.body.style.overflow = "hidden";
  }

  // extra.failed: the competitors of the run that just ended that did not finish, with why, so the comparison
  // says who was asked for and is missing.
  function paintFailed(failed) {
    const box = shell().querySelector("#multi-failed");
    box.hidden = !failed.length;
    box.innerHTML = failed.length ? "<p>" + esc(t("failedRuns")) + "</p><ul>" + failed.map((row) =>
      '<li><b translate="no">' + esc(row.host) + "</b>" + (row.note ? " · " + esc(row.note) : "") + "</li>").join("") + "</ul>" : "";
  }

  async function load(id, extra) {
    open();
    paintFailed((extra && extra.failed) || []);
    say(t("opening"));
    if (!window.ReviewAuth || !ReviewAuth.signedIn()) {
      say(t("signIn"), true);
      return;
    }
    try {
      const response = await post("/account/comparison/open", { id });
      const data = await response.json().catch(() => ({}));
      if (response.status === 401) {
        say(t("signIn"), true);
        return;
      }
      if (!response.ok || data.error) {
        say(QAReviewReportCopy.error(data, t("failed")), true);
        return;
      }
      paint(data);
      if (window.SiteAnalytics) SiteAnalytics.trackEvent("qa_review_multi_open", "URL Review", String(data.columns.length));
    } catch (error) {
      say(t("failed"), true);
    }
  }

  function print() {
    document.body.classList.add("printing-multi");
    if (window.SiteAnalytics) SiteAnalytics.trackEvent("qa_review_multi_print", "URL Review", "print");
    window.print();
  }

  // The browser's own print command prints an open, paid comparison too; an unpaid one stays out of print.
  window.addEventListener("beforeprint", () => {
    if (overlay && overlay.classList.contains("open") && made && made.paid) document.body.classList.add("printing-multi");
  });
  window.addEventListener("afterprint", () => document.body.classList.remove("printing-multi"));

  // The PDF is printed on the server from the comparison as drawn here, with the page's styles inlined.
  function snapshot() {
    const css = [...document.styleSheets].map((sheet) => {
      try { return [...sheet.cssRules].map((rule) => rule.cssText).join("\n"); } catch (error) { return ""; }
    }).join("\n");
    const copy = overlay.querySelector(".multi-modal").cloneNode(true);
    copy.querySelectorAll(".multi-sec > h2 .fold-toggle").forEach((toggle) => toggle.replaceWith(toggle.firstChild));
    copy.querySelectorAll(".multi-row[hidden]").forEach((row) => { row.hidden = false; });
    copy.querySelectorAll(".no-print, script, button").forEach((node) => node.remove());
    copy.querySelectorAll("img").forEach((img) => {
      if (!img.matches("#multi-title img.multi-logo")) return img.remove();
      const mark = document.createElement("img");
      mark.className = "multi-logo";
      mark.setAttribute("data-logo", img.getAttribute("data-logo"));
      img.replaceWith(mark);
    });
    const theme = [...document.documentElement.attributes].filter((attr) => attr.name !== "style").map((attr) => " " + attr.name + '="' + esc(attr.name === "class" ? attr.value.replace(/\bdark-mode\b/g, "").trim() : attr.value) + '"').join("");
    return "<!doctype html><html" + theme + '><head><meta charset="utf-8"><title>' + esc(made.columns.map((col) => col.host).join(" " + t("vs") + " ")) + "</title><style>" + css.replace(/<\/style/gi, "<\\/style") +
      "</style></head><body class=\"" + esc(document.body.className) + ' printing-multi multi-pdf"><div class="dash-overlay multi-overlay open" id="multi-overlay">' + copy.outerHTML + "</div></body></html>";
  }

  async function download() {
    const button = overlay.querySelector("#multi-pdf");
    button.disabled = true;
    say(t("pdfBusy"));
    try {
      const response = await post("/account/comparison/pdf", { id: made.id, html: snapshot() });
      const data = await response.json().catch(() => ({}));
      const stored = /^https:\/\/firebasestorage\.googleapis\.com\//.test(data.url || "");
      if (!response.ok || (!data.pdf && !stored)) {
        say(QAReviewReportCopy.error(data, t("pdfFailed")), true);
        return;
      }
      // A large PDF comes as a link to the stored file, which is sent as an attachment under its own name.
      const link = document.createElement("a");
      link.href = stored ? data.url : URL.createObjectURL(new Blob([Uint8Array.from(atob(data.pdf), (ch) => ch.charCodeAt(0))], { type: "application/pdf" }));
      link.download = data.filename || "qa-review-comparison.pdf";
      document.body.appendChild(link);
      link.click();
      link.remove();
      if (!stored) setTimeout(() => URL.revokeObjectURL(link.href), 1000);
      say(t("pdfDone"));
      if (window.SiteAnalytics) SiteAnalytics.trackEvent("qa_review_multi_pdf", "URL Review", "pdf");
    } catch (error) {
      say(t("pdfFailed"), true);
    } finally {
      button.disabled = false;
    }
  }

  // Saves reviews of this account as one comparison and opens it. ids: the asker's own review first.
  async function save(ids, from, status) {
    const note = (message, bad) => {
      if (!status) return;
      status.textContent = message;
      status.classList.toggle("bad", !!bad);
    };
    note(t("saving"));
    try {
      const response = await post("/account/comparison/save", { ids, from });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.id) {
        note(QAReviewReportCopy.error(data, t("saveFailed")), true);
        return "";
      }
      note("");
      return data.id;
    } catch (error) {
      note(t("saveFailed"), true);
      return "";
    }
  }

  document.addEventListener("click", async (event) => {
    const button = event.target.closest("[data-multi-save]");
    if (!button) return;
    button.disabled = true;
    const status = button.parentElement.querySelector(".multi-save-status");
    const id = await save(button.getAttribute("data-multi-save").split(","), "review", status);
    button.disabled = false;
    if (!id) return;
    history.pushState(null, "", location.pathname + "?comparison=" + encodeURIComponent(id));
    load(id);
  });

  window.QAReviewMulti = { t, save, load };

  const asked = new URLSearchParams(location.search).get("comparison");
  if (asked) {
    const start = () => load(String(asked).replace(/[^A-Za-z0-9]/g, "").slice(0, 40));
    if (window.ReviewAuth && ReviewAuth.onChange) {
      let done = false;
      ReviewAuth.onChange((on) => {
        if (done) return;
        if (on) done = true;
        start();
      });
    } else start();
  }
})();
