/* Hand-written copy for the report dashboard, so it is not left to machine translation, which only loads after analytics consent.
   Elements marked data-report-copy="<key>" get the page language's text; templates hold {name} slots and never contain <, > or &. */
(function () {
  "use strict";

  const COPY = {
    en: {
      dashEyebrow: "Run dashboard", dashTitle: "Report", captureNote: "This sheet does not include the report. The attempt is recorded with the review.",
      copyLink: "Copy link (opens for you)", caseExport: "Export and print test cases", export: "Export", text: "Text", printPdf: "Print or save as PDF",
      share: "Share", email: "Email", shareSheet: "Share sheet", close: "Close",
      shareNote: "This link opens in full only for you, signed in. Anyone else sees a blurred preview.",
      execTitle: "One-page summary", compareTitle: "Next to a competitor", healthTitle: "Health score", fixTitle: "Fix first", browserTitle: "In a real browser",
      snippetTitle: "How it looks in Google and when shared", aiTitle: "What AI sees", analyticsTitle: "Analytics and consent", searchTitle: "Search visibility",
      mapTitle: "Map of the pages analyzed", securityTitle: "Security and email", checksTitle: "Every check, with its verdict", fixKitTitle: "Fix kit",
      compareIntro: "Run the same review on a competitor's site and see who wins each indicator: the six areas as a radar and 3D columns, speed and page weight head to head, your advantages and theirs, the common ground, the open problems only one site has, and how present each site is in the market, from its Tranco rank and 30-day trend.",
      compareLabel: "Competitor's address", compareGo: "Compare", compareAdd: "+ Add another competitor", left: "({n} left)", compareStop: "Stop the comparison",
      ring: "Health score {n} out of 100, grade {g}", grade: "Grade {g}", sevAria: "Open problems by severity",
      measured: "Every check below was measured from the public response, not guessed. Checks marked “{person}” are judgments a machine should not make for you.",
      delta: "Change since your last review",
      summary: "{host} scores {overall} out of 100 ({grade}). {fail} checks fail now, {risk} are at risk, and {pass} pass.", outOf: "{n} out of 100.",
      kpiHealth: "Health score", kpiFail: "Fail now", kpiRisk: "At risk", kpiPages: "Pages analyzed", kpiTech: "Technologies", kpiCases: "Proposed cases", kpiFirst: "First response",
      sevLine: "{critical} critical · {high} high · {medium} medium · {low} low",
      read_one: "{n} page analyzed", read_other: "{n} pages analyzed", readOf_one: "{n} page analyzed of {found} found", readOf_other: "{n} pages analyzed of {found} found",
      headless: "checked in a headless browser", risks: "Biggest risks", quick: "Quick wins", solid: "Already solid", noneFound: "None found.",
      noSolid: "No area scores B or better yet.", printSummary: "Print this summary", expandAll: "Expand all", collapseAll: "Collapse all",
      offerTitle: "Read the rest", offerFix: "Fix list · {usd} USD", offerFixBody: "Scores, every finding, the top 10 fixes in plain language, and a PDF of the summary.", offerFull: "Full report · {usd} USD", offerFullBody: "19 USD, plus 5 USD for each extra framework or tool. Every case and layer, the signals, the exports, and the scripts.", offerCredit: "The 5 USD fix list is already taken off.", offerFixOpen: "Your fix list is open: scores and findings read in full. The cases stay blurred until the full report is paid.",
      errors: {
        pickTwo: "Pick at least two of your reviews to compare.", tooMany: "Compare up to {max} reviews at a time.",
        reviewsNotSaved: "One of those reviews is not saved under this account.", reviewNotSaved: "That review is not saved under this account.",
        comparisonNotSaved: "That comparison is not saved under this account.",
        stoppedOne: "The review of {host} stopped early. Compare finished reviews.", stoppedBase: "The review of {host} stopped early. Compare from a finished review.",
        noScores: "The review of {host} is not saved with scores, so there is nothing to compare.",
        notOpen: "The report of {host} is not open in full yet. Unlock it to compare from it."
      }
    },
    es: {
      dashEyebrow: "Panel de la revisión", dashTitle: "Informe", captureNote: "Esta hoja no incluye el informe. El intento queda registrado con la revisión.",
      copyLink: "Copiar enlace (se abre para ti)", caseExport: "Exportar e imprimir casos de prueba", export: "Exportar", text: "Texto", printPdf: "Imprimir o guardar como PDF",
      share: "Compartir", email: "Correo", shareSheet: "Menú para compartir", close: "Cerrar",
      shareNote: "Este enlace se abre completo solo para ti, con tu sesión iniciada. Cualquier otra persona ve una vista previa difuminada.",
      execTitle: "Resumen en una página", compareTitle: "Frente a un competidor", healthTitle: "Puntuación de salud", fixTitle: "Arreglar primero", browserTitle: "En un navegador real",
      snippetTitle: "Cómo se ve en Google y al compartirlo", aiTitle: "Lo que ve la IA", analyticsTitle: "Analítica y consentimiento", searchTitle: "Visibilidad en buscadores",
      mapTitle: "Mapa de las páginas analizadas", securityTitle: "Seguridad y correo", checksTitle: "Cada control, con su veredicto", fixKitTitle: "Kit de arreglos",
      compareIntro: "Haz la misma revisión del sitio de un competidor y mira quién gana cada indicador: las seis áreas en un radar y en columnas 3D, velocidad y peso de página cara a cara, tus ventajas y las suyas, lo que tenéis en común, los problemas abiertos que solo tiene un sitio y la presencia de cada uno en el mercado, según su posición en Tranco y su tendencia de 30 días.",
      compareLabel: "Dirección del competidor", compareGo: "Comparar", compareAdd: "+ Añadir otro competidor", left: "(quedan {n})", compareStop: "Detener la comparación",
      ring: "Puntuación de salud {n} de 100, nota {g}", grade: "Nota {g}", sevAria: "Problemas abiertos por gravedad",
      measured: "Cada control de abajo se midió a partir de la respuesta pública, sin suposiciones. Los controles marcados con «{person}» son juicios que una máquina no debería hacer por ti.",
      delta: "Cambio desde tu última revisión",
      summary: "{host} obtiene {overall} de 100 ({grade}). {fail} controles fallan ahora, {risk} están en riesgo y {pass} pasan.", outOf: "{n} de 100.",
      kpiHealth: "Puntuación de salud", kpiFail: "Fallan ahora", kpiRisk: "En riesgo", kpiPages: "Páginas analizadas", kpiTech: "Tecnologías", kpiCases: "Casos propuestos", kpiFirst: "Primera respuesta",
      sevLine: "{critical} críticos · {high} altos · {medium} medios · {low} bajos",
      read_one: "{n} página analizada", read_other: "{n} páginas analizadas", readOf_one: "{n} página analizada de {found} encontradas", readOf_other: "{n} páginas analizadas de {found} encontradas",
      headless: "revisado en un navegador sin interfaz", risks: "Mayores riesgos", quick: "Mejoras rápidas", solid: "Ya sólido", noneFound: "No se encontró ninguno.",
      noSolid: "Ninguna área tiene todavía B o más.", printSummary: "Imprimir este resumen", expandAll: "Desplegar todo", collapseAll: "Plegar todo",
      offerTitle: "Leer el resto", offerFix: "Lista de arreglos · {usd} USD", offerFixBody: "Puntuaciones, todos los hallazgos, los 10 primeros arreglos en palabras claras y un PDF del resumen.", offerFull: "Informe completo · {usd} USD", offerFullBody: "19 USD y 5 USD por cada framework o herramienta extra. Todos los casos y capas, las señales, las exportaciones y los scripts.", offerCredit: "Los 5 USD de la lista de arreglos ya están descontados.", offerFixOpen: "Tu lista de arreglos está abierta: puntuaciones y hallazgos se leen completos. Los casos siguen borrosos hasta pagar el informe completo.",
      errors: {
        pickTwo: "Elige al menos dos de tus revisiones para compararlas.", tooMany: "Compara hasta {max} revisiones a la vez.",
        reviewsNotSaved: "Una de esas revisiones no está guardada en esta cuenta.", reviewNotSaved: "Esa revisión no está guardada en esta cuenta.",
        comparisonNotSaved: "Esa comparación no está guardada en esta cuenta.",
        stoppedOne: "La revisión de {host} se detuvo antes de terminar. Compara revisiones terminadas.", stoppedBase: "La revisión de {host} se detuvo antes de terminar. Compara desde una revisión terminada.",
        noScores: "La revisión de {host} no está guardada con puntuaciones, así que no hay nada que comparar.",
        notOpen: "El informe de {host} todavía no está abierto completo. Desbloquéalo para comparar desde él."
      }
    },
    pt: {
      dashEyebrow: "Painel da revisão", dashTitle: "Relatório", captureNote: "Esta folha não inclui o relatório. A tentativa fica registada com a revisão.",
      copyLink: "Copiar link (abre para si)", caseExport: "Exportar e imprimir casos de teste", export: "Exportar", text: "Texto", printPdf: "Imprimir ou guardar como PDF",
      share: "Partilhar", email: "Email", shareSheet: "Menu de partilha", close: "Fechar",
      shareNote: "Este link abre por completo só para si, com sessão iniciada. Qualquer outra pessoa vê uma pré-visualização desfocada.",
      execTitle: "Resumo numa página", compareTitle: "Ao lado de um concorrente", healthTitle: "Pontuação de saúde", fixTitle: "Corrigir primeiro", browserTitle: "Num navegador real",
      snippetTitle: "Como aparece no Google e ao partilhar", aiTitle: "O que a IA vê", analyticsTitle: "Analítica e consentimento", searchTitle: "Visibilidade na pesquisa",
      mapTitle: "Mapa das páginas analisadas", securityTitle: "Segurança e email", checksTitle: "Todas as verificações, com o seu veredicto", fixKitTitle: "Kit de correções",
      compareIntro: "Faça a mesma revisão ao site de um concorrente e veja quem ganha cada indicador: as seis áreas num radar e em colunas 3D, velocidade e peso da página frente a frente, as suas vantagens e as dele, o que têm em comum, os problemas abertos que só um site tem e a presença de cada um no mercado, pela posição no Tranco e pela tendência de 30 dias.",
      compareLabel: "Endereço do concorrente", compareGo: "Comparar", compareAdd: "+ Adicionar outro concorrente", left: "(faltam {n})", compareStop: "Parar a comparação",
      ring: "Pontuação de saúde {n} de 100, nota {g}", grade: "Nota {g}", sevAria: "Problemas abertos por gravidade",
      measured: "Cada verificação abaixo foi medida a partir da resposta pública, sem suposições. As verificações marcadas com «{person}» são juízos que uma máquina não deve fazer por si.",
      delta: "Variação desde a sua última revisão",
      summary: "{host} tem {overall} de 100 ({grade}). {fail} verificações falham agora, {risk} estão em risco e {pass} passam.", outOf: "{n} de 100.",
      kpiHealth: "Pontuação de saúde", kpiFail: "Falham agora", kpiRisk: "Em risco", kpiPages: "Páginas analisadas", kpiTech: "Tecnologias", kpiCases: "Casos propostos", kpiFirst: "Primeira resposta",
      sevLine: "{critical} críticos · {high} altos · {medium} médios · {low} baixos",
      read_one: "{n} página analisada", read_other: "{n} páginas analisadas", readOf_one: "{n} página analisada de {found} encontradas", readOf_other: "{n} páginas analisadas de {found} encontradas",
      headless: "verificado num navegador sem interface", risks: "Maiores riscos", quick: "Ganhos rápidos", solid: "Já sólido", noneFound: "Nenhum encontrado.",
      noSolid: "Nenhuma área tem ainda B ou melhor.", printSummary: "Imprimir este resumo", expandAll: "Expandir tudo", collapseAll: "Recolher tudo",
      offerTitle: "Ler o resto", offerFix: "Lista de correções · {usd} USD", offerFixBody: "Pontuações, todas as constatações, as 10 primeiras correções em palavras simples e um PDF do resumo.", offerFull: "Relatório completo · {usd} USD", offerFullBody: "19 USD e mais 5 USD por framework ou ferramenta extra. Todos os casos e camadas, os sinais, as exportações e os scripts.", offerCredit: "Os 5 USD da lista de correções já estão descontados.", offerFixOpen: "Sua lista de correções está aberta: pontuações e constatações aparecem completas. Os casos seguem borrados até o relatório completo ser pago.",
      errors: {
        pickTwo: "Escolha pelo menos duas das suas revisões para comparar.", tooMany: "Compare até {max} revisões de cada vez.",
        reviewsNotSaved: "Uma dessas revisões não está guardada nesta conta.", reviewNotSaved: "Essa revisão não está guardada nesta conta.",
        comparisonNotSaved: "Essa comparação não está guardada nesta conta.",
        stoppedOne: "A revisão de {host} parou antes do fim. Compare revisões terminadas.", stoppedBase: "A revisão de {host} parou antes do fim. Compare a partir de uma revisão terminada.",
        noScores: "A revisão de {host} não está guardada com pontuações, por isso não há nada para comparar.",
        notOpen: "O relatório de {host} ainda não está aberto por completo. Desbloqueie-o para comparar a partir dele."
      }
    },
    de: {
      dashEyebrow: "Prüfungs-Dashboard", dashTitle: "Bericht", captureNote: "Dieses Blatt enthält den Bericht nicht. Der Versuch wird mit der Prüfung gespeichert.",
      copyLink: "Link kopieren (öffnet sich für Sie)", caseExport: "Testfälle exportieren und drucken", export: "Exportieren", text: "Text", printPdf: "Drucken oder als PDF speichern",
      share: "Teilen", email: "E-Mail", shareSheet: "Teilen-Menü", close: "Schließen",
      shareNote: "Dieser Link öffnet sich vollständig nur für Sie, wenn Sie angemeldet sind. Alle anderen sehen eine unscharfe Vorschau.",
      execTitle: "Zusammenfassung auf einer Seite", compareTitle: "Im Vergleich mit einem Mitbewerber", healthTitle: "Gesundheitswert", fixTitle: "Zuerst beheben", browserTitle: "In einem echten Browser",
      snippetTitle: "So erscheint die Seite bei Google und beim Teilen", aiTitle: "Was KI sieht", analyticsTitle: "Analytics und Einwilligung", searchTitle: "Sichtbarkeit in der Suche",
      mapTitle: "Karte der analysierten Seiten", securityTitle: "Sicherheit und E-Mail", checksTitle: "Jede Prüfung mit ihrem Ergebnis", fixKitTitle: "Behebungs-Kit",
      compareIntro: "Führen Sie dieselbe Prüfung für die Website eines Mitbewerbers durch und sehen Sie, wer welchen Indikator gewinnt: die sechs Bereiche als Radar und als 3D-Säulen, Geschwindigkeit und Seitengewicht im direkten Vergleich, Ihre Vorteile und seine, die Gemeinsamkeiten, die offenen Probleme, die nur eine Website hat, und wie präsent jede Website am Markt ist, nach ihrem Tranco-Rang und dem 30-Tage-Trend.",
      compareLabel: "Adresse des Mitbewerbers", compareGo: "Vergleichen", compareAdd: "+ Weiteren Mitbewerber hinzufügen", left: "(noch {n})", compareStop: "Vergleich stoppen",
      ring: "Gesundheitswert {n} von 100, Note {g}", grade: "Note {g}", sevAria: "Offene Probleme nach Schweregrad",
      measured: "Jede Prüfung unten wurde an der öffentlichen Antwort gemessen, nicht geschätzt. Prüfungen mit „{person}“ sind Urteile, die eine Maschine nicht für Sie fällen sollte.",
      delta: "Veränderung seit Ihrer letzten Prüfung",
      summary: "{host} erreicht {overall} von 100 ({grade}). {fail} Prüfungen scheitern jetzt, {risk} sind gefährdet und {pass} bestehen.", outOf: "{n} von 100.",
      kpiHealth: "Gesundheitswert", kpiFail: "Scheitern jetzt", kpiRisk: "Gefährdet", kpiPages: "Analysierte Seiten", kpiTech: "Technologien", kpiCases: "Vorgeschlagene Fälle", kpiFirst: "Erste Antwort",
      sevLine: "{critical} kritisch · {high} hoch · {medium} mittel · {low} niedrig",
      read_one: "{n} Seite analysiert", read_other: "{n} Seiten analysiert", readOf_one: "{n} Seite von {found} gefundenen analysiert", readOf_other: "{n} Seiten von {found} gefundenen analysiert",
      headless: "in einem Headless-Browser geprüft", risks: "Größte Risiken", quick: "Schnelle Erfolge", solid: "Bereits solide", noneFound: "Keine gefunden.",
      noSolid: "Noch kein Bereich erreicht B oder besser.", printSummary: "Diese Zusammenfassung drucken", expandAll: "Alle aufklappen", collapseAll: "Alle zuklappen",
      offerTitle: "Den Rest lesen", offerFix: "Fix-Liste · {usd} USD", offerFixBody: "Bewertungen, alle Befunde, die 10 wichtigsten Korrekturen in klaren Worten und ein PDF der Zusammenfassung.", offerFull: "Vollständiger Bericht · {usd} USD", offerFullBody: "19 USD und 5 USD für jedes weitere Framework oder Werkzeug. Alle Testfälle und Ebenen, die Signale, die Exporte und die Skripte.", offerCredit: "Die 5 USD der Fix-Liste sind bereits abgezogen.", offerFixOpen: "Ihre Fix-Liste ist offen: Bewertungen und Befunde sind vollständig lesbar. Die Testfälle bleiben unscharf, bis der vollständige Bericht bezahlt ist.",
      errors: {
        pickTwo: "Wählen Sie mindestens zwei Ihrer Prüfungen zum Vergleichen.", tooMany: "Vergleichen Sie bis zu {max} Prüfungen auf einmal.",
        reviewsNotSaved: "Eine dieser Prüfungen ist nicht unter diesem Konto gespeichert.", reviewNotSaved: "Diese Prüfung ist nicht unter diesem Konto gespeichert.",
        comparisonNotSaved: "Dieser Vergleich ist nicht unter diesem Konto gespeichert.",
        stoppedOne: "Die Prüfung von {host} wurde vorzeitig beendet. Vergleichen Sie abgeschlossene Prüfungen.", stoppedBase: "Die Prüfung von {host} wurde vorzeitig beendet. Vergleichen Sie von einer abgeschlossenen Prüfung aus.",
        noScores: "Die Prüfung von {host} ist ohne Werte gespeichert, daher gibt es nichts zu vergleichen.",
        notOpen: "Der Bericht von {host} ist noch nicht vollständig freigeschaltet. Schalten Sie ihn frei, um von ihm aus zu vergleichen."
      }
    },
    fr: {
      dashEyebrow: "Tableau de bord de l’analyse", dashTitle: "Rapport", captureNote: "Cette feuille n’inclut pas le rapport. La tentative est enregistrée avec l’analyse.",
      copyLink: "Copier le lien (s’ouvre pour vous)", caseExport: "Exporter et imprimer les cas de test", export: "Exporter", text: "Texte", printPdf: "Imprimer ou enregistrer en PDF",
      share: "Partager", email: "E-mail", shareSheet: "Menu de partage", close: "Fermer",
      shareNote: "Ce lien s’ouvre en entier uniquement pour vous, une fois connecté. Toute autre personne voit un aperçu flouté.",
      execTitle: "Résumé sur une page", compareTitle: "Face à un concurrent", healthTitle: "Score de santé", fixTitle: "À corriger d’abord", browserTitle: "Dans un vrai navigateur",
      snippetTitle: "L’aspect dans Google et lors d’un partage", aiTitle: "Ce que voit l’IA", analyticsTitle: "Analytics et consentement", searchTitle: "Visibilité dans la recherche",
      mapTitle: "Carte des pages analysées", securityTitle: "Sécurité et e-mail", checksTitle: "Chaque contrôle, avec son verdict", fixKitTitle: "Kit de correction",
      compareIntro: "Lancez la même analyse sur le site d’un concurrent et voyez qui gagne chaque indicateur : les six domaines en radar et en colonnes 3D, vitesse et poids des pages face à face, vos avantages et les siens, les points communs, les problèmes ouverts qu’un seul site a, et la présence de chaque site sur le marché, d’après son rang Tranco et sa tendance sur 30 jours.",
      compareLabel: "Adresse du concurrent", compareGo: "Comparer", compareAdd: "+ Ajouter un autre concurrent", left: "(encore {n})", compareStop: "Arrêter la comparaison",
      ring: "Score de santé {n} sur 100, note {g}", grade: "Note {g}", sevAria: "Problèmes ouverts par gravité",
      measured: "Chaque contrôle ci-dessous a été mesuré à partir de la réponse publique, sans supposition. Les contrôles marqués « {person} » sont des jugements qu’une machine ne devrait pas porter à votre place.",
      delta: "Évolution depuis votre dernière analyse",
      summary: "{host} obtient {overall} sur 100 ({grade}). {fail} contrôles échouent, {risk} sont à risque et {pass} réussissent.", outOf: "{n} sur 100.",
      kpiHealth: "Score de santé", kpiFail: "Échouent", kpiRisk: "À risque", kpiPages: "Pages analysées", kpiTech: "Technologies", kpiCases: "Cas proposés", kpiFirst: "Première réponse",
      sevLine: "{critical} critiques · {high} élevés · {medium} moyens · {low} faibles",
      read_one: "{n} page analysée", read_other: "{n} pages analysées", readOf_one: "{n} page analysée sur {found} trouvées", readOf_other: "{n} pages analysées sur {found} trouvées",
      headless: "contrôlé dans un navigateur sans interface", risks: "Plus grands risques", quick: "Gains rapides", solid: "Déjà solide", noneFound: "Aucun trouvé.",
      noSolid: "Aucun domaine n’obtient encore B ou mieux.", printSummary: "Imprimer ce résumé", expandAll: "Tout déplier", collapseAll: "Tout replier",
      offerTitle: "Lire la suite", offerFix: "Liste de corrections · {usd} USD", offerFixBody: "Les scores, tous les constats, les 10 premières corrections en mots simples et un PDF du résumé.", offerFull: "Rapport complet · {usd} USD", offerFullBody: "19 USD, puis 5 USD par framework ou outil en plus. Tous les cas et toutes les couches, les signaux, les exports et les scripts.", offerCredit: "Les 5 USD de la liste de corrections sont déjà déduits.", offerFixOpen: "Votre liste de corrections est ouverte : les scores et les constats se lisent en entier. Les cas restent flous jusqu’au paiement du rapport complet.",
      errors: {
        pickTwo: "Choisissez au moins deux de vos analyses à comparer.", tooMany: "Comparez jusqu’à {max} analyses à la fois.",
        reviewsNotSaved: "L’une de ces analyses n’est pas enregistrée sous ce compte.", reviewNotSaved: "Cette analyse n’est pas enregistrée sous ce compte.",
        comparisonNotSaved: "Cette comparaison n’est pas enregistrée sous ce compte.",
        stoppedOne: "L’analyse de {host} s’est arrêtée avant la fin. Comparez des analyses terminées.", stoppedBase: "L’analyse de {host} s’est arrêtée avant la fin. Comparez à partir d’une analyse terminée.",
        noScores: "L’analyse de {host} n’est pas enregistrée avec des scores, il n’y a donc rien à comparer.",
        notOpen: "Le rapport de {host} n’est pas encore ouvert en entier. Débloquez-le pour comparer à partir de lui."
      }
    },
    it: {
      dashEyebrow: "Pannello della revisione", dashTitle: "Report", captureNote: "Questo foglio non include il report. Il tentativo viene registrato con la revisione.",
      copyLink: "Copia link (si apre per te)", caseExport: "Esporta e stampa i casi di test", export: "Esporta", text: "Testo", printPdf: "Stampa o salva come PDF",
      share: "Condividi", email: "Email", shareSheet: "Menu di condivisione", close: "Chiudi",
      shareNote: "Questo link si apre per intero solo per te, con l’accesso effettuato. Chiunque altro vede un’anteprima sfocata.",
      execTitle: "Riepilogo in una pagina", compareTitle: "Accanto a un concorrente", healthTitle: "Punteggio di salute", fixTitle: "Da sistemare prima", browserTitle: "In un browser reale",
      snippetTitle: "Come appare su Google e quando viene condiviso", aiTitle: "Cosa vede l’IA", analyticsTitle: "Analytics e consenso", searchTitle: "Visibilità nella ricerca",
      mapTitle: "Mappa delle pagine analizzate", securityTitle: "Sicurezza ed email", checksTitle: "Ogni controllo, con il suo esito", fixKitTitle: "Kit di correzione",
      compareIntro: "Esegui la stessa revisione sul sito di un concorrente e scopri chi vince ogni indicatore: le sei aree in un radar e in colonne 3D, velocità e peso delle pagine testa a testa, i tuoi vantaggi e i suoi, i punti in comune, i problemi aperti che ha un solo sito e quanto è presente ciascun sito sul mercato, secondo la posizione Tranco e l’andamento a 30 giorni.",
      compareLabel: "Indirizzo del concorrente", compareGo: "Confronta", compareAdd: "+ Aggiungi un altro concorrente", left: "(ne restano {n})", compareStop: "Ferma il confronto",
      ring: "Punteggio di salute {n} su 100, voto {g}", grade: "Voto {g}", sevAria: "Problemi aperti per gravità",
      measured: "Ogni controllo qui sotto è stato misurato dalla risposta pubblica, senza supposizioni. I controlli segnati come «{person}» sono giudizi che una macchina non dovrebbe dare al posto tuo.",
      delta: "Variazione dall’ultima revisione",
      summary: "{host} ottiene {overall} su 100 ({grade}). {fail} controlli falliscono ora, {risk} sono a rischio e {pass} passano.", outOf: "{n} su 100.",
      kpiHealth: "Punteggio di salute", kpiFail: "Falliscono ora", kpiRisk: "A rischio", kpiPages: "Pagine analizzate", kpiTech: "Tecnologie", kpiCases: "Casi proposti", kpiFirst: "Prima risposta",
      sevLine: "{critical} critici · {high} alti · {medium} medi · {low} bassi",
      read_one: "{n} pagina analizzata", read_other: "{n} pagine analizzate", readOf_one: "{n} pagina analizzata su {found} trovate", readOf_other: "{n} pagine analizzate su {found} trovate",
      headless: "controllato in un browser headless", risks: "Rischi maggiori", quick: "Interventi rapidi", solid: "Già solido", noneFound: "Nessuno trovato.",
      noSolid: "Nessuna area ha ancora B o più.", printSummary: "Stampa questo riepilogo", expandAll: "Espandi tutto", collapseAll: "Comprimi tutto",
      offerTitle: "Leggi il resto", offerFix: "Lista delle correzioni · {usd} USD", offerFixBody: "Punteggi, tutti i rilievi, le prime 10 correzioni in parole semplici e un PDF del riepilogo.", offerFull: "Report completo · {usd} USD", offerFullBody: "19 USD più 5 USD per ogni framework o strumento in più. Tutti i casi e i livelli, i segnali, gli export e gli script.", offerCredit: "I 5 USD della lista delle correzioni sono già scalati.", offerFixOpen: "La tua lista delle correzioni è aperta: punteggi e rilievi si leggono per intero. I casi restano sfocati finché il report completo non è pagato.",
      errors: {
        pickTwo: "Scegli almeno due delle tue revisioni da confrontare.", tooMany: "Confronta fino a {max} revisioni alla volta.",
        reviewsNotSaved: "Una di quelle revisioni non è salvata in questo account.", reviewNotSaved: "Quella revisione non è salvata in questo account.",
        comparisonNotSaved: "Quel confronto non è salvato in questo account.",
        stoppedOne: "La revisione di {host} si è fermata prima della fine. Confronta revisioni concluse.", stoppedBase: "La revisione di {host} si è fermata prima della fine. Confronta a partire da una revisione conclusa.",
        noScores: "La revisione di {host} non è salvata con i punteggi, quindi non c’è niente da confrontare.",
        notOpen: "Il report di {host} non è ancora aperto per intero. Sbloccalo per confrontare a partire da esso."
      }
    }
  };

  const code = String(document.documentElement.lang || "en").slice(0, 2).toLowerCase();
  const book = COPY[code] || COPY.en;
  const english = !COPY[code] || code === "en";

  function fill(template, vars) {
    return String(template).replace(/\{(\w+)\}/g, (match, name) => (vars && vars[name] != null ? String(vars[name]) : match));
  }

  // t("read", { n }) picks read_one or read_other when the key has plural forms.
  function t(key, vars) {
    const plural = vars && typeof vars.n === "number" && (book[key + "_one"] || COPY.en[key + "_one"]) ? key + (vars.n === 1 ? "_one" : "_other") : key;
    return fill(book[plural] != null ? book[plural] : COPY.en[plural], vars);
  }

  // A server error in the page language when its code is known, else the server's own English sentence.
  function error(body, fallback) {
    const known = body && body.code && book.errors[body.code];
    if (known) return fill(known, body);
    return (body && body.error) || fallback || "";
  }

  if (!english) {
    document.querySelectorAll("[data-report-copy]").forEach((node) => {
      const text = book[node.getAttribute("data-report-copy")];
      if (text == null) return;
      node.textContent = text;
      node.setAttribute("lang", code);
      node.setAttribute("translate", "no");
    });
  }

  window.QAReviewReportCopy = { lang: code, english: english, t: t, error: error };
})();
