/* Hand-written copy for bulk URL reviews (#3737). Templates hold {name} slots; they never contain <, > or &. */
(function () {
  "use strict";

  const COPY = {
    en: {
      modeOne: "One URL",
      modeMany: "Many URLs",
      publicPage: "Public page",
      listLabel: "Addresses to review",
      listHint: "One https address per line, or load a .txt / .csv with a url column. Up to {n}. The first is the lead.",
      fileLabel: "Load a file",
      leadReport: "Use the open report’s URL as the lead",
      leadReportOff: "Open one of your reports first to use it as the lead.",
      leadBadge: "Lead",
      previewTitle: "Ready to run",
      signIn: "Sign in to run a bulk review.",
      needCredits: "This batch needs {need} runs; your pass has {left} left. Add credits, then try again.",
      needCreditsNone: "A pass with enough runs is needed for a bulk review. Add credits, then try again.",
      fixList: "Fix the list before starting.",
      space: "Line {n} has a space in it: {url}",
      invalid: "Line {n} is not a valid https address: {url}",
      duplicate: "Line {n} repeats {host}.",
      needTwo: "Enter at least two https addresses.",
      tooMany: "Review up to {max} addresses at a time.",
      busy: "Wait until the review that is running ends.",
      starting: "Starting the bulk review…",
      running: "Reviewing {n} of {total}: {host}",
      stopping: "Stopping. Finished reports stay; waiting ones are skipped.",
      stop: "Stop batch",
      done: "Bulk review finished. {ready} ready" + ", {failed} did not finish.",
      doneAll: "Bulk review finished. All {n} reports are ready.",
      stopped: "Bulk review stopped. {ready} ready; the rest were not started.",
      openReport: "Open report",
      saveCompare: "Save comparison",
      saveCompareHint: "Save the finished reports side by side.",
      savingCompare: "Saving the comparison…",
      panelTitle: "Bulk review",
      rowState: { waiting: "Waiting", running: "Running", done: "Ready", failed: "Did not finish", stopped: "Stopped", skipped: "Not started", rescue: "In rescue" },
      mailed: "A summary was emailed to you.",
      retrying: "Retry {n} of {max}",
      retryingHost: "Retrying {host} ({n} of {max})",
      rescueNote: "Handed to rescue; the report will arrive by email."
    },
    es: {
      modeOne: "Una URL",
      modeMany: "Varias URL",
      publicPage: "Página pública",
      listLabel: "Direcciones a revisar",
      listHint: "Una dirección https por línea, o carga un .txt / .csv con una columna url. Hasta {n}. La primera es la principal.",
      fileLabel: "Cargar un archivo",
      leadReport: "Usar la URL del informe abierto como principal",
      leadReportOff: "Abre primero uno de tus informes para usarlo como principal.",
      leadBadge: "Principal",
      previewTitle: "Listo para ejecutar",
      signIn: "Inicia sesión para ejecutar una revisión masiva.",
      needCredits: "Este lote necesita {need} ejecuciones; tu pase tiene {left}. Agrega créditos e inténtalo de nuevo.",
      needCreditsNone: "Se necesita un pase con suficientes ejecuciones para una revisión masiva. Agrega créditos e inténtalo de nuevo.",
      fixList: "Corrige la lista antes de empezar.",
      space: "La línea {n} tiene un espacio: {url}",
      invalid: "La línea {n} no es una dirección https válida: {url}",
      duplicate: "La línea {n} repite {host}.",
      needTwo: "Ingresa al menos dos direcciones https.",
      tooMany: "Revisa hasta {max} direcciones a la vez.",
      busy: "Espera a que termine la revisión en curso.",
      starting: "Iniciando la revisión masiva…",
      running: "Revisando {n} de {total}: {host}",
      stopping: "Deteniendo. Los informes listos se conservan; los que esperan se omiten.",
      stop: "Detener el lote",
      done: "Revisión masiva lista. {ready} listos, {failed} no terminaron.",
      doneAll: "Revisión masiva lista. Los {n} informes están listos.",
      stopped: "Revisión masiva detenida. {ready} listos; el resto no se inició.",
      openReport: "Abrir informe",
      saveCompare: "Guardar comparación",
      saveCompareHint: "Guarda los informes terminados lado a lado.",
      savingCompare: "Guardando la comparación…",
      panelTitle: "Revisión masiva",
      rowState: { waiting: "En espera", running: "En curso", done: "Listo", failed: "No terminó", stopped: "Detenido", skipped: "No iniciado", rescue: "En rescate" },
      mailed: "Te enviamos un resumen por correo.",
      retrying: "Reintento {n} de {max}",
      retryingHost: "Reintentando {host} ({n} de {max})",
      rescueNote: "Pasó a rescate; el informe llegará por correo."
    },
    pt: {
      modeOne: "Uma URL",
      modeMany: "Várias URLs",
      publicPage: "Página pública",
      listLabel: "Endereços para revisar",
      listHint: "Um endereço https por linha, ou carregue um .txt / .csv com uma coluna url. Até {n}. O primeiro é o principal.",
      fileLabel: "Carregar um arquivo",
      leadReport: "Usar a URL do relatório aberto como principal",
      leadReportOff: "Abra primeiro um dos seus relatórios para usá-lo como principal.",
      leadBadge: "Principal",
      previewTitle: "Pronto para executar",
      signIn: "Entre para executar uma revisão em lote.",
      needCredits: "Este lote precisa de {need} execuções; seu passe tem {left}. Adicione créditos e tente de novo.",
      needCreditsNone: "É preciso um passe com execuções suficientes para uma revisão em lote. Adicione créditos e tente de novo.",
      fixList: "Corrija a lista antes de começar.",
      space: "A linha {n} tem um espaço: {url}",
      invalid: "A linha {n} não é um endereço https válido: {url}",
      duplicate: "A linha {n} repete {host}.",
      needTwo: "Digite pelo menos dois endereços https.",
      tooMany: "Revise até {max} endereços de uma vez.",
      busy: "Espere a revisão em andamento terminar.",
      starting: "Iniciando a revisão em lote…",
      running: "Revisando {n} de {total}: {host}",
      stopping: "Interrompendo. Relatórios prontos ficam; os que esperam são pulados.",
      stop: "Parar o lote",
      done: "Revisão em lote pronta. {ready} prontos, {failed} não terminaram.",
      doneAll: "Revisão em lote pronta. Os {n} relatórios estão prontos.",
      stopped: "Revisão em lote interrompida. {ready} prontos; o restante não foi iniciado.",
      openReport: "Abrir relatório",
      saveCompare: "Salvar comparação",
      saveCompareHint: "Salve os relatórios concluídos lado a lado.",
      savingCompare: "Salvando a comparação…",
      panelTitle: "Revisão em lote",
      rowState: { waiting: "Na fila", running: "Em andamento", done: "Pronto", failed: "Não terminou", stopped: "Interrompido", skipped: "Não iniciado", rescue: "Em resgate" },
      mailed: "Enviamos um resumo por email.",
      retrying: "Tentativa {n} de {max}",
      retryingHost: "Tentando de novo {host} ({n} de {max})",
      rescueNote: "Enviado ao resgate; o relatório chegará por email."
    },
    de: {
      modeOne: "Eine URL",
      modeMany: "Mehrere URLs",
      publicPage: "Öffentliche Seite",
      listLabel: "Zu prüfende Adressen",
      listHint: "Eine https-Adresse pro Zeile, oder eine .txt / .csv mit einer url-Spalte laden. Bis zu {n}. Die erste ist die Leitadresse.",
      fileLabel: "Datei laden",
      leadReport: "URL des offenen Berichts als Leitadresse verwenden",
      leadReportOff: "Öffnen Sie zuerst einen Ihrer Berichte, um ihn als Leitadresse zu nutzen.",
      leadBadge: "Leitadresse",
      previewTitle: "Bereit zum Start",
      signIn: "Melden Sie sich an, um eine Sammelprüfung zu starten.",
      needCredits: "Dieser Stapel braucht {need} Läufe; Ihr Pass hat {left}. Credits hinzufügen und erneut versuchen.",
      needCreditsNone: "Für eine Sammelprüfung braucht es einen Pass mit genug Läufen. Credits hinzufügen und erneut versuchen.",
      fixList: "Korrigieren Sie die Liste vor dem Start.",
      space: "Zeile {n} enthält ein Leerzeichen: {url}",
      invalid: "Zeile {n} ist keine gültige https-Adresse: {url}",
      duplicate: "Zeile {n} wiederholt {host}.",
      needTwo: "Geben Sie mindestens zwei https-Adressen ein.",
      tooMany: "Prüfen Sie höchstens {max} Adressen auf einmal.",
      busy: "Warten Sie, bis die laufende Prüfung endet.",
      starting: "Die Sammelprüfung startet…",
      running: "Prüfung {n} von {total}: {host}",
      stopping: "Wird gestoppt. Fertige Berichte bleiben; wartende werden übersprungen.",
      stop: "Stapel stoppen",
      done: "Sammelprüfung fertig. {ready} bereit, {failed} nicht fertig.",
      doneAll: "Sammelprüfung fertig. Alle {n} Berichte sind bereit.",
      stopped: "Sammelprüfung gestoppt. {ready} bereit; der Rest wurde nicht gestartet.",
      openReport: "Bericht öffnen",
      saveCompare: "Vergleich speichern",
      saveCompareHint: "Speichern Sie die fertigen Berichte nebeneinander.",
      savingCompare: "Der Vergleich wird gespeichert…",
      panelTitle: "Sammelprüfung",
      rowState: { waiting: "Wartend", running: "Läuft", done: "Bereit", failed: "Nicht fertig", stopped: "Gestoppt", skipped: "Nicht gestartet", rescue: "In Rettung" },
      mailed: "Eine Zusammenfassung wurde Ihnen per E-Mail gesendet.",
      retrying: "Versuch {n} von {max}",
      retryingHost: "Erneuter Versuch für {host} ({n} von {max})",
      rescueNote: "An die Rettung übergeben; der Bericht kommt per E-Mail."
    },
    fr: {
      modeOne: "Une URL",
      modeMany: "Plusieurs URL",
      publicPage: "Page publique",
      listLabel: "Adresses à analyser",
      listHint: "Une adresse https par ligne, ou chargez un .txt / .csv avec une colonne url. Jusqu’à {n}. La première est la principale.",
      fileLabel: "Charger un fichier",
      leadReport: "Utiliser l’URL du rapport ouvert comme principale",
      leadReportOff: "Ouvrez d’abord un de vos rapports pour l’utiliser comme principale.",
      leadBadge: "Principale",
      previewTitle: "Prêt à lancer",
      signIn: "Connectez-vous pour lancer une analyse groupée.",
      needCredits: "Ce lot demande {need} exécutions ; votre passe en a {left}. Ajoutez des crédits, puis réessayez.",
      needCreditsNone: "Un passe avec assez d’exécutions est nécessaire pour une analyse groupée. Ajoutez des crédits, puis réessayez.",
      fixList: "Corrigez la liste avant de commencer.",
      space: "La ligne {n} contient un espace : {url}",
      invalid: "La ligne {n} n’est pas une adresse https valide : {url}",
      duplicate: "La ligne {n} répète {host}.",
      needTwo: "Saisissez au moins deux adresses https.",
      tooMany: "Analysez jusqu’à {max} adresses à la fois.",
      busy: "Attendez la fin de l’analyse en cours.",
      starting: "Démarrage de l’analyse groupée…",
      running: "Analyse {n} sur {total} : {host}",
      stopping: "Arrêt en cours. Les rapports terminés restent ; ceux en attente sont ignorés.",
      stop: "Arrêter le lot",
      done: "Analyse groupée terminée. {ready} prêts, {failed} non terminés.",
      doneAll: "Analyse groupée terminée. Les {n} rapports sont prêts.",
      stopped: "Analyse groupée arrêtée. {ready} prêts ; le reste n’a pas démarré.",
      openReport: "Ouvrir le rapport",
      saveCompare: "Enregistrer la comparaison",
      saveCompareHint: "Enregistrez les rapports terminés côte à côte.",
      savingCompare: "Enregistrement de la comparaison…",
      panelTitle: "Analyse groupée",
      rowState: { waiting: "En attente", running: "En cours", done: "Prêt", failed: "Non terminé", stopped: "Arrêté", skipped: "Non démarré", rescue: "En secours" },
      mailed: "Un résumé vous a été envoyé par e-mail.",
      retrying: "Essai {n} sur {max}",
      retryingHost: "Nouvel essai pour {host} ({n} sur {max})",
      rescueNote: "Remis au secours ; le rapport arrivera par e-mail."
    },
    it: {
      modeOne: "Una URL",
      modeMany: "Più URL",
      publicPage: "Pagina pubblica",
      listLabel: "Indirizzi da analizzare",
      listHint: "Un indirizzo https per riga, oppure carica un .txt / .csv con una colonna url. Fino a {n}. Il primo è il principale.",
      fileLabel: "Carica un file",
      leadReport: "Usa l’URL del report aperto come principale",
      leadReportOff: "Apri prima uno dei tuoi report per usarlo come principale.",
      leadBadge: "Principale",
      previewTitle: "Pronto da avviare",
      signIn: "Accedi per avviare una revisione in blocco.",
      needCredits: "Questo lotto richiede {need} esecuzioni; il tuo pass ne ha {left}. Aggiungi crediti e riprova.",
      needCreditsNone: "Serve un pass con abbastanza esecuzioni per una revisione in blocco. Aggiungi crediti e riprova.",
      fixList: "Correggi l’elenco prima di iniziare.",
      space: "La riga {n} contiene uno spazio: {url}",
      invalid: "La riga {n} non è un indirizzo https valido: {url}",
      duplicate: "La riga {n} ripete {host}.",
      needTwo: "Inserisci almeno due indirizzi https.",
      tooMany: "Analizza al massimo {max} indirizzi alla volta.",
      busy: "Attendi che finisca la revisione in corso.",
      starting: "Avvio della revisione in blocco…",
      running: "Revisione {n} di {total}: {host}",
      stopping: "Arresto in corso. I report pronti restano; quelli in attesa vengono saltati.",
      stop: "Ferma il lotto",
      done: "Revisione in blocco conclusa. {ready} pronti, {failed} non conclusi.",
      doneAll: "Revisione in blocco conclusa. Tutti i {n} report sono pronti.",
      stopped: "Revisione in blocco fermata. {ready} pronti; il resto non è stato avviato.",
      openReport: "Apri report",
      saveCompare: "Salva confronto",
      saveCompareHint: "Salva i report conclusi uno accanto all’altro.",
      savingCompare: "Salvataggio del confronto…",
      panelTitle: "Revisione in blocco",
      rowState: { waiting: "In attesa", running: "In corso", done: "Pronto", failed: "Non concluso", stopped: "Fermato", skipped: "Non avviato", rescue: "In recupero" },
      mailed: "Ti abbiamo inviato un riepilogo via email.",
      retrying: "Tentativo {n} di {max}",
      retryingHost: "Nuovo tentativo per {host} ({n} di {max})",
      rescueNote: "Passato al recupero; il report arriverà via email."
    }
  };

  function langOf() {
    const lang = String((document.documentElement && document.documentElement.lang) || "en").toLowerCase().slice(0, 2);
    return COPY[lang] ? lang : "en";
  }

  const book = COPY[langOf()] || COPY.en;

  function pageBook() {
    return COPY[langOf()] || COPY.en;
  }

  function fill(text, vars) {
    return String(text || "").replace(/\{(\w+)\}/g, (_, key) => (vars && vars[key] != null ? String(vars[key]) : ""));
  }

  function t(key, vars) {
    const parts = String(key || "").split(".");
    let node = pageBook();
    for (const part of parts) {
      if (!node || typeof node !== "object") return key;
      node = node[part];
    }
    if (node == null) {
      node = COPY.en;
      for (const part of parts) {
        if (!node || typeof node !== "object") { node = key; break; }
        node = node[part];
      }
    }
    return fill(node == null ? key : node, vars);
  }

  function paint() {
    document.querySelectorAll("[data-batch-copy]").forEach((node) => {
      const key = node.getAttribute("data-batch-copy");
      const text = t(key, { n: 6, max: 6 });
      if (node.tagName === "INPUT" || node.tagName === "TEXTAREA") {
        if (node.hasAttribute("placeholder")) node.placeholder = text;
        else node.value = text;
      } else {
        node.textContent = text;
      }
    });
  }

  window.QAReviewBatchCopy = { COPY, t, paint, langOf, max: 6 };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", paint);
  else paint();
})();
