/**
 * The report's Run tab (#1945, #2514): the free sample of the report's cases, the Cube's live log
 * while it runs, and one row per case when it ends. Runs live server-side in url_review_runs;
 * this tab reads them through reviewUrl /review/run/status and starts the sample through /review/run/sample.
 */
(function (root) {
  "use strict";

  const POLL_MS = 3000;
  const REST_SHOWN = 10;
  const T = {
    en: {
      tabReport: "Report", tabRun: "Run", eyebrow: "Run", title: "Run these cases in a real browser",
      lede: "The Cube runs this report's cases in Playwright against {host}, from our servers. Read-only: nothing is sent, bought or signed up for.",
      sampleTitle: "Free sample", sampleBody: "{n} cases, once a day per site, for the account that ran this report.",
      sampleGo: "Run {n} cases free", sampleSignIn: "Sign in to run {n} cases free", sampleUsed: "The free sample for {host} already ran today. The next one opens {when}.",
      fullTitle: "Every case", fullBody: "All {total} cases in Playwright: 29 USD, or 19 USD in the launch month. Each extra framework adds 9 USD, and re-running the failures is 9 USD.",
      fullSoon: "Checkout opens soon",
      queued: "Waiting for a runner…", running: "Running {n} cases on {host} · {elapsed}", logTitle: "Live log", logEmpty: "The first lines appear once the browser starts.",
      doneTitle: "Results", doneLine: "Ran {n} cases on {host} in {elapsed}.", failedTitle: "The run stopped", failedSample: "The free sample is open again, so you can try once more.",
      kPassed: "Passed", kFailed: "Failed", kFlaky: "Passed on retry", kSkipped: "Left to a person",
      s_passed: "Passed", s_failed: "Failed", s_flaky: "Passed on retry", s_skipped: "Left to a person",
      t_site: "The site's problem", t_disagree: "Disagrees with the review, which passed it", t_unreachable: "The page did not answer",
      restTitle_one: "{n} more case not in the sample", restTitle_other: "{n} more cases not in the sample", restNote: "They run with Every case.", notRun: "Not run", restMore: "And {n} more.",
      notOwner: "Only the account that ran this report can run its cases.", expired: "Your sign-in has expired. Sign in again with the account that ran this report.",
      failed: "The run did not load. Try again in a moment.", starting: "Starting…"
    },
    es: {
      tabReport: "Informe", tabRun: "Ejecución", eyebrow: "Ejecución", title: "Ejecuta estos casos en un navegador real",
      lede: "El Cube ejecuta los casos de este informe en Playwright contra {host}, desde nuestros servidores. Solo lectura: no se envía, compra ni registra nada.",
      sampleTitle: "Muestra gratis", sampleBody: "{n} casos, una vez al día por sitio, para la cuenta que hizo este informe.",
      sampleGo: "Ejecutar {n} casos gratis", sampleSignIn: "Inicia sesión para ejecutar {n} casos gratis", sampleUsed: "La muestra gratis de {host} ya se ejecutó hoy. La próxima se abre {when}.",
      fullTitle: "Todos los casos", fullBody: "Los {total} casos en Playwright: 29 USD, o 19 USD en el mes de lanzamiento. Cada framework extra suma 9 USD, y volver a ejecutar los fallos cuesta 9 USD.",
      fullSoon: "El pago abre pronto",
      queued: "Esperando un ejecutor…", running: "Ejecutando {n} casos en {host} · {elapsed}", logTitle: "Registro en vivo", logEmpty: "Las primeras líneas aparecen cuando arranca el navegador.",
      doneTitle: "Resultados", doneLine: "Se ejecutaron {n} casos en {host} en {elapsed}.", failedTitle: "La ejecución se detuvo", failedSample: "La muestra gratis vuelve a estar disponible, así que puedes intentarlo otra vez.",
      kPassed: "Pasaron", kFailed: "Fallaron", kFlaky: "Pasaron al reintentar", kSkipped: "Para una persona",
      s_passed: "Pasó", s_failed: "Falló", s_flaky: "Pasó al reintentar", s_skipped: "Para una persona",
      t_site: "Problema del sitio", t_disagree: "No coincide con el informe, que lo dio por bueno", t_unreachable: "La página no respondió",
      restTitle_one: "{n} caso más fuera de la muestra", restTitle_other: "{n} casos más fuera de la muestra", restNote: "Se ejecutan con Todos los casos.", notRun: "Sin ejecutar", restMore: "Y {n} más.",
      notOwner: "Solo la cuenta que hizo este informe puede ejecutar sus casos.", expired: "Tu sesión expiró. Vuelve a iniciar sesión con la cuenta que hizo este informe.",
      failed: "La ejecución no cargó. Inténtalo de nuevo en un momento.", starting: "Iniciando…"
    },
    pt: {
      tabReport: "Relatório", tabRun: "Execução", eyebrow: "Execução", title: "Execute estes casos em um navegador real",
      lede: "O Cube executa os casos deste relatório no Playwright contra {host}, a partir dos nossos servidores. Somente leitura: nada é enviado, comprado ou cadastrado.",
      sampleTitle: "Amostra grátis", sampleBody: "{n} casos, uma vez por dia por site, para a conta que gerou este relatório.",
      sampleGo: "Executar {n} casos grátis", sampleSignIn: "Entre para executar {n} casos grátis", sampleUsed: "A amostra grátis de {host} já foi executada hoje. A próxima abre {when}.",
      fullTitle: "Todos os casos", fullBody: "Os {total} casos no Playwright: 29 USD, ou 19 USD no mês de lançamento. Cada framework extra soma 9 USD, e reexecutar as falhas custa 9 USD.",
      fullSoon: "O pagamento abre em breve",
      queued: "Aguardando um executor…", running: "Executando {n} casos em {host} · {elapsed}", logTitle: "Registro ao vivo", logEmpty: "As primeiras linhas aparecem quando o navegador inicia.",
      doneTitle: "Resultados", doneLine: "{n} casos executados em {host} em {elapsed}.", failedTitle: "A execução parou", failedSample: "A amostra grátis está disponível de novo, então você pode tentar outra vez.",
      kPassed: "Passaram", kFailed: "Falharam", kFlaky: "Passaram na nova tentativa", kSkipped: "Para uma pessoa",
      s_passed: "Passou", s_failed: "Falhou", s_flaky: "Passou na nova tentativa", s_skipped: "Para uma pessoa",
      t_site: "Problema do site", t_disagree: "Diverge do relatório, que o aprovou", t_unreachable: "A página não respondeu",
      restTitle_one: "Mais {n} caso fora da amostra", restTitle_other: "Mais {n} casos fora da amostra", restNote: "Eles rodam com Todos os casos.", notRun: "Não executado", restMore: "E mais {n}.",
      notOwner: "Só a conta que gerou este relatório pode executar os casos.", expired: "Sua sessão expirou. Entre de novo com a conta que gerou este relatório.",
      failed: "A execução não carregou. Tente de novo em instantes.", starting: "Iniciando…"
    },
    de: {
      tabReport: "Bericht", tabRun: "Lauf", eyebrow: "Lauf", title: "Diese Fälle in einem echten Browser ausführen",
      lede: "Der Cube führt die Fälle dieses Berichts in Playwright gegen {host} aus, von unseren Servern. Nur lesend: Es wird nichts gesendet, gekauft oder registriert.",
      sampleTitle: "Kostenlose Probe", sampleBody: "{n} Fälle, einmal pro Tag und Website, für das Konto, das diesen Bericht erstellt hat.",
      sampleGo: "{n} Fälle kostenlos ausführen", sampleSignIn: "Anmelden, um {n} Fälle kostenlos auszuführen", sampleUsed: "Die kostenlose Probe für {host} lief heute schon. Die nächste öffnet {when}.",
      fullTitle: "Alle Fälle", fullBody: "Alle {total} Fälle in Playwright: 29 USD, im Startmonat 19 USD. Jedes weitere Framework kostet 9 USD, ein erneuter Lauf der Fehlschläge 9 USD.",
      fullSoon: "Bezahlung öffnet bald",
      queued: "Wartet auf einen Runner…", running: "{n} Fälle laufen auf {host} · {elapsed}", logTitle: "Live-Protokoll", logEmpty: "Die ersten Zeilen erscheinen, sobald der Browser startet.",
      doneTitle: "Ergebnisse", doneLine: "{n} Fälle auf {host} in {elapsed} ausgeführt.", failedTitle: "Der Lauf wurde abgebrochen", failedSample: "Die kostenlose Probe ist wieder frei, Sie können es noch einmal versuchen.",
      kPassed: "Bestanden", kFailed: "Fehlgeschlagen", kFlaky: "Beim zweiten Versuch bestanden", kSkipped: "Für eine Person",
      s_passed: "Bestanden", s_failed: "Fehlgeschlagen", s_flaky: "Beim zweiten Versuch bestanden", s_skipped: "Für eine Person",
      t_site: "Problem der Website", t_disagree: "Widerspricht dem Bericht, der ihn bestanden hatte", t_unreachable: "Die Seite hat nicht geantwortet",
      restTitle_one: "{n} weiterer Fall außerhalb der Probe", restTitle_other: "{n} weitere Fälle außerhalb der Probe", restNote: "Sie laufen mit Alle Fälle.", notRun: "Nicht ausgeführt", restMore: "Und {n} weitere.",
      notOwner: "Nur das Konto, das diesen Bericht erstellt hat, kann seine Fälle ausführen.", expired: "Ihre Anmeldung ist abgelaufen. Melden Sie sich erneut mit dem Konto an, das diesen Bericht erstellt hat.",
      failed: "Der Lauf wurde nicht geladen. Versuchen Sie es gleich noch einmal.", starting: "Startet…"
    },
    fr: {
      tabReport: "Rapport", tabRun: "Exécution", eyebrow: "Exécution", title: "Exécuter ces cas dans un vrai navigateur",
      lede: "Le Cube exécute les cas de ce rapport dans Playwright sur {host}, depuis nos serveurs. En lecture seule : rien n’est envoyé, acheté ni inscrit.",
      sampleTitle: "Échantillon gratuit", sampleBody: "{n} cas, une fois par jour et par site, pour le compte qui a lancé ce rapport.",
      sampleGo: "Exécuter {n} cas gratuitement", sampleSignIn: "Connectez-vous pour exécuter {n} cas gratuitement", sampleUsed: "L’échantillon gratuit de {host} a déjà tourné aujourd’hui. Le prochain ouvre {when}.",
      fullTitle: "Tous les cas", fullBody: "Les {total} cas dans Playwright : 29 USD, ou 19 USD le mois du lancement. Chaque framework en plus ajoute 9 USD, et relancer les échecs coûte 9 USD.",
      fullSoon: "Le paiement ouvre bientôt",
      queued: "En attente d’un exécuteur…", running: "{n} cas en cours sur {host} · {elapsed}", logTitle: "Journal en direct", logEmpty: "Les premières lignes apparaissent quand le navigateur démarre.",
      doneTitle: "Résultats", doneLine: "{n} cas exécutés sur {host} en {elapsed}.", failedTitle: "L’exécution s’est arrêtée", failedSample: "L’échantillon gratuit est de nouveau libre, vous pouvez réessayer.",
      kPassed: "Réussis", kFailed: "Échoués", kFlaky: "Réussis au 2e essai", kSkipped: "Pour une personne",
      s_passed: "Réussi", s_failed: "Échoué", s_flaky: "Réussi au 2e essai", s_skipped: "Pour une personne",
      t_site: "Problème du site", t_disagree: "Contredit le rapport, qui l’avait validé", t_unreachable: "La page n’a pas répondu",
      restTitle_one: "{n} autre cas hors échantillon", restTitle_other: "{n} autres cas hors échantillon", restNote: "Ils tournent avec Tous les cas.", notRun: "Non exécuté", restMore: "Et {n} de plus.",
      notOwner: "Seul le compte qui a lancé ce rapport peut exécuter ses cas.", expired: "Votre session a expiré. Reconnectez-vous avec le compte qui a lancé ce rapport.",
      failed: "L’exécution ne s’est pas chargée. Réessayez dans un instant.", starting: "Démarrage…"
    },
    it: {
      tabReport: "Report", tabRun: "Esecuzione", eyebrow: "Esecuzione", title: "Esegui questi casi in un browser vero",
      lede: "Il Cube esegue i casi di questo report in Playwright su {host}, dai nostri server. Sola lettura: niente viene inviato, comprato o registrato.",
      sampleTitle: "Campione gratuito", sampleBody: "{n} casi, una volta al giorno per sito, per l’account che ha creato questo report.",
      sampleGo: "Esegui {n} casi gratis", sampleSignIn: "Accedi per eseguire {n} casi gratis", sampleUsed: "Il campione gratuito di {host} è già stato eseguito oggi. Il prossimo apre {when}.",
      fullTitle: "Tutti i casi", fullBody: "Tutti i {total} casi in Playwright: 29 USD, o 19 USD nel mese di lancio. Ogni framework in più aggiunge 9 USD, e rieseguire i fallimenti costa 9 USD.",
      fullSoon: "Il pagamento apre presto",
      queued: "In attesa di un esecutore…", running: "{n} casi in corso su {host} · {elapsed}", logTitle: "Log in diretta", logEmpty: "Le prime righe compaiono quando parte il browser.",
      doneTitle: "Risultati", doneLine: "{n} casi eseguiti su {host} in {elapsed}.", failedTitle: "L’esecuzione si è fermata", failedSample: "Il campione gratuito è di nuovo libero, puoi riprovare.",
      kPassed: "Superati", kFailed: "Falliti", kFlaky: "Superati al 2° tentativo", kSkipped: "Per una persona",
      s_passed: "Superato", s_failed: "Fallito", s_flaky: "Superato al 2° tentativo", s_skipped: "Per una persona",
      t_site: "Problema del sito", t_disagree: "In disaccordo con il report, che l’aveva superato", t_unreachable: "La pagina non ha risposto",
      restTitle_one: "Ancora {n} caso fuori dal campione", restTitle_other: "Ancora {n} casi fuori dal campione", restNote: "Girano con Tutti i casi.", notRun: "Non eseguito", restMore: "E altri {n}.",
      notOwner: "Solo l’account che ha creato questo report può eseguirne i casi.", expired: "La sessione è scaduta. Accedi di nuovo con l’account che ha creato questo report.",
      failed: "L’esecuzione non si è caricata. Riprova tra un momento.", starting: "Avvio…"
    }
  };

  const lang = () => {
    const code = String((root.document && document.documentElement.lang) || "en").slice(0, 2).toLowerCase();
    return T[code] ? code : "en";
  };

  function t(key, vars) {
    const book = T[lang()];
    let name = key;
    if (vars && typeof vars.n === "number" && (book[key + "_one"] || T.en[key + "_one"])) name = key + (vars.n === 1 ? "_one" : "_other");
    const text = book[name] != null ? book[name] : T.en[name];
    return String(text == null ? key : text).replace(/\{(\w+)\}/g, (match, slot) => (vars && vars[slot] != null ? String(vars[slot]) : match));
  }

  function esc(value) {
    return String(value == null ? "" : value).replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" })[ch]);
  }

  function elapsed(ms) {
    const s = Math.max(0, Math.round(ms / 1000));
    return s < 60 ? s + " s" : Math.floor(s / 60) + " min " + String(s % 60).padStart(2, "0") + " s";
  }

  function when(iso) {
    const at = new Date(iso);
    if (isNaN(at)) return "";
    try {
      return new Intl.DateTimeFormat(document.documentElement.lang || "en", { weekday: "short", hour: "2-digit", minute: "2-digit" }).format(at);
    } catch (error) {
      return at.toISOString().slice(0, 16).replace("T", " ") + " UTC";
    }
  }

  const live = (status) => status === "queued" || status === "running";

  // Pure view of the tab, so it is tested without a page.
  function view(state) {
    const report = state.report || {};
    const host = report.host || "";
    const total = (report.cases || []).length;
    const size = state.size || 5;
    const run = state.run;
    const parts = ['<p class="eyebrow">' + esc(t("eyebrow")) + "</p><h2>" + esc(t("title")) + '</h2><p class="run-lede">' + esc(t("lede", { host })) + "</p>"];
    if (state.error) parts.push('<p class="run-error" role="alert">' + esc(state.error) + "</p>");
    if (run) parts.push(runView(run, report, state.now || Date.now(), state.paid));
    if (!run || !live(run.status)) {
      let sample;
      if (!state.signedIn) sample = '<button class="btn btn-primary" type="button" data-run="sign-in">' + esc(t("sampleSignIn", { n: size })) + "</button>";
      else if (state.owner === false) sample = '<p class="muted">' + esc(t("notOwner")) + "</p>";
      else if (state.sample && state.sample.used) sample = '<p class="muted run-used">' + esc(t("sampleUsed", { host, when: when(state.sample.next) })) + "</p>";
      else sample = '<button class="btn btn-primary" type="button" data-run="sample"' + (state.busy ? " disabled" : "") + ">" + esc(state.busy ? t("starting") : t("sampleGo", { n: size })) + "</button>";
      parts.push('<div class="run-offers"><article class="run-offer"><h3>' + esc(t("sampleTitle")) + "</h3><p>" + esc(t("sampleBody", { n: size })) + "</p>" + sample + "</article>" +
        '<article class="run-offer"><h3>' + esc(t("fullTitle")) + "</h3><p>" + esc(t("fullBody", { total })) + '</p><button class="btn btn-ghost" type="button" disabled>' + esc(t("fullSoon")) + "</button></article></div>");
    }
    return parts.join("");
  }

  function runView(run, report, now, paid) {
    const host = run.host || report.host || "";
    const started = Date.parse(run.startedAt || run.at);
    const ended = Date.parse(run.finishedAt) || now;
    const took = elapsed(isNaN(started) ? 0 : ended - started);
    const out = [];
    if (live(run.status)) {
      out.push('<p class="run-status" role="status"><span class="run-dot" aria-hidden="true"></span><span data-run-status>' + esc(run.status === "queued" ? t("queued") : t("running", { n: run.cases, host, elapsed: took })) + "</span></p>");
    } else if (run.status === "failed") {
      out.push('<h3 class="run-failed">' + esc(t("failedTitle")) + '</h3><p class="run-error">' + esc(run.error) + "</p>" + (run.source === "sample" ? '<p class="muted">' + esc(t("failedSample")) + "</p>" : ""));
    } else if (run.status === "done") {
      const s = run.summary || {};
      out.push("<h3>" + esc(t("doneTitle")) + '</h3><p class="muted">' + esc(t("doneLine", { n: s.total || 0, host, elapsed: took })) + "</p>");
      out.push('<div class="kpis run-kpis">' + [["passed", "kPassed"], ["failed", "kFailed"], ["flaky", "kFlaky"], ["skipped", "kSkipped"]].map((pair) =>
        '<div class="kpi run-k-' + pair[0] + '"><b>' + esc(s[pair[0]] || 0) + "</b><span>" + esc(t(pair[1])) + "</span></div>").join("") + "</div>");
      out.push('<ol class="run-results">' + (run.results || []).map((row) =>
        '<li class="run-row run-' + esc(row.status) + '"><div class="run-row-head"><span class="id">' + esc(row.id) + "</span> <strong>" + esc(row.title) + '</strong><span class="badge run-badge">' + esc(t("s_" + row.status)) + '</span><span class="muted run-ms">' + esc(elapsed(row.ms || 0)) + "</span></div>" +
        (row.triage ? '<p class="run-triage run-t-' + esc(row.triage) + '">' + esc(t("t_" + row.triage)) + "</p>" : "") +
        (row.error ? '<pre class="run-err">' + esc(row.error) + "</pre>" : "") + "</li>").join("") + "</ol>");
      const ran = new Set((run.results || []).map((row) => row.id));
      const rest = run.source === "sample" ? (report.cases || []).filter((item) => !ran.has(item.id)) : [];
      if (rest.length) {
        const fade = root.QAReviewSections && root.QAReviewSections.fade ? root.QAReviewSections.fade : (text) => esc(text);
        out.push('<h3 class="run-rest">' + esc(t("restTitle", { n: rest.length })) + '</h3><p class="muted">' + esc(t("restNote")) + '</p><ol class="run-results run-locked">' + rest.slice(0, REST_SHOWN).map((item) =>
          '<li class="run-row"><div class="run-row-head"><span class="id">' + esc(item.id) + "</span> <strong>" + fade((item.msg && item.msg.title) || item.title, !!paid) + '</strong><span class="badge">' + esc(t("notRun")) + "</span></div></li>").join("") + "</ol>" +
          (rest.length > REST_SHOWN ? '<p class="muted">' + esc(t("restMore", { n: rest.length - REST_SHOWN })) + "</p>" : ""));
      }
    }
    if (live(run.status) || run.status === "failed") {
      const log = run.log || [];
      out.push('<h3 class="run-log-title">' + esc(t("logTitle")) + '</h3><ol class="log run-log" data-run-log aria-live="off">' +
        (log.length ? log.map((line) => "<li>" + esc(line) + "</li>").join("") : '<li class="muted">' + esc(t("logEmpty")) + "</li>") + "</ol>");
    }
    return '<section class="run-now">' + out.join("") + "</section>";
  }

  function mount() {
    const doc = root.document;
    const tabs = doc.getElementById("report-tabs");
    const panel = doc.getElementById("cube-panel");
    const report = doc.getElementById("report");
    if (!tabs || !panel || !report) return null;
    const auth = () => root.ReviewAuth;
    const endpoint = () => (root.QAReviewSections && root.QAReviewSections.endpoint ? root.QAReviewSections.endpoint() : "https://us-central1-carlosm-interactive-cv.cloudfunctions.net/reviewUrl");
    const state = { report: null, payload: null, run: null, sample: null, size: 5, signedIn: false, owner: null, error: "", busy: false, paid: false };
    let tab = "report";
    let timer = 0;
    let shownKey = "";

    tabs.innerHTML = '<button type="button" role="tab" id="tab-report" aria-controls="report" data-tab="report">' + esc(t("tabReport")) + "</button>" +
      '<button type="button" role="tab" id="tab-run" aria-controls="cube-panel" data-tab="run">' + esc(t("tabRun")) + "</button>";

    function select(next, fromHash) {
      tab = next === "run" ? "run" : "report";
      tabs.querySelectorAll("[data-tab]").forEach((button) => {
        const on = button.getAttribute("data-tab") === tab;
        button.setAttribute("aria-selected", on ? "true" : "false");
        button.tabIndex = on ? 0 : -1;
      });
      report.hidden = tab === "run";
      panel.hidden = tab !== "run";
      if (!fromHash && root.history && root.history.replaceState) root.history.replaceState(null, "", location.pathname + location.search + (tab === "run" ? "#run" : ""));
      clearTimeout(timer);
      if (tab === "run") load();
    }

    function paint() {
      state.signedIn = !!(auth() && auth().signedIn());
      const key = [state.run && state.run.id, state.run && state.run.status, state.signedIn, state.owner, state.sample && state.sample.used, state.error, state.busy].join("|");
      const log = panel.querySelector("[data-run-log]");
      if (key === shownKey && log && state.run && live(state.run.status)) {
        const pinned = log.scrollHeight - log.scrollTop - log.clientHeight < 24;
        const lines = state.run.log || [];
        if (lines.length) log.innerHTML = lines.map((line) => "<li>" + esc(line) + "</li>").join("");
        if (pinned) log.scrollTop = log.scrollHeight;
        const status = panel.querySelector("[data-run-status]");
        const fresh = doc.createElement("div");
        fresh.innerHTML = runView(state.run, state.report, Date.now(), state.paid);
        const next = fresh.querySelector("[data-run-status]");
        if (status && next) status.textContent = next.textContent;
        return;
      }
      shownKey = key;
      panel.innerHTML = view(Object.assign({}, state, { now: Date.now() }));
      const fresh = panel.querySelector("[data-run-log]");
      if (fresh) fresh.scrollTop = fresh.scrollHeight;
    }

    async function call(path) {
      const res = await fetch(endpoint() + path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(Object.assign({}, auth() ? auth().proof() : {}, { id: state.report.id }))
      });
      const body = await res.json().catch(() => ({}));
      return { status: res.status, body };
    }

    function settle(out) {
      const body = out.body || {};
      state.error = "";
      if (out.status === 401 || body.signIn) {
        if (state.signedIn && auth() && auth().expire) auth().expire(t("expired"));
        state.run = null;
        return;
      }
      if (body.code === "not-owner") {
        state.owner = false;
        return;
      }
      if (body.code === "sample-used") {
        state.sample = { used: true, next: body.next };
        return;
      }
      if (out.status !== 200) {
        state.error = body.error || t("failed");
        return;
      }
      state.owner = true;
      state.run = body.run || null;
      state.sample = body.sample || null;
      state.size = body.size || state.size;
    }

    async function load() {
      clearTimeout(timer);
      if (!state.report || tab !== "run") return;
      if (!(auth() && auth().signedIn())) {
        paint();
        return;
      }
      const id = state.report.id;
      try {
        const out = await call("/review/run/status");
        if (!state.report || state.report.id !== id) return;
        settle(out);
      } catch (error) {
        state.error = t("failed");
      }
      paint();
      if (state.run && live(state.run.status) && tab === "run") timer = setTimeout(load, POLL_MS);
    }

    async function startSample() {
      state.busy = true;
      paint();
      try {
        settle(await call("/review/run/sample"));
      } catch (error) {
        state.error = t("failed");
      }
      state.busy = false;
      paint();
      if (state.run && live(state.run.status)) timer = setTimeout(load, POLL_MS);
    }

    tabs.addEventListener("click", (event) => {
      const button = event.target.closest("[data-tab]");
      if (button) select(button.getAttribute("data-tab"));
    });
    tabs.addEventListener("keydown", (event) => {
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
      select(tab === "run" ? "report" : "run");
      tabs.querySelector('[data-tab="' + tab + '"]').focus();
    });
    panel.addEventListener("click", (event) => {
      const button = event.target.closest("[data-run]");
      if (!button) return;
      if (button.getAttribute("data-run") === "sign-in" && auth()) auth().focus();
      if (button.getAttribute("data-run") === "sample") startSample();
    });
    if (auth() && auth().onChange) auth().onChange(() => { state.owner = null; state.run = null; shownKey = ""; if (tab === "run") load(); });
    doc.addEventListener("visibilitychange", () => { if (!doc.hidden && tab === "run" && state.run && live(state.run.status)) load(); });

    return {
      show(payload) {
        const next = payload && payload.report;
        if (!next || payload.sample) {
          tabs.hidden = true;
          state.report = null;
          select("report", true);
          return;
        }
        tabs.hidden = false;
        state.paid = !!payload.paid;
        if (state.report && state.report.id === next.id) {
          state.report = next;
          return;
        }
        state.report = next;
        state.run = null;
        state.sample = null;
        state.owner = null;
        state.error = "";
        shownKey = "";
        select(location.hash === "#run" ? "run" : "report", true);
      },
      hide() {
        clearTimeout(timer);
        state.report = null;
        select("report", true);
      }
    };
  }

  const api = { view, runView, t, elapsed };
  if (typeof module === "object" && module.exports) module.exports = api;
  else {
    let mounted = null;
    root.QAReviewRun = Object.assign(api, {
      show(payload) { mounted = mounted || mount(); if (mounted) mounted.show(payload); },
      hide() { if (mounted) mounted.hide(); }
    });
  }
})(typeof window !== "undefined" ? window : globalThis);
