/* Review progress: a live meter driven by the streamed log lines, and messages drifting in depth behind the log. */
(function () {
  "use strict";

  const panel = document.getElementById("run-panel");
  const log = document.getElementById("run-log");
  if (!panel || !log) return;

  const T = {
    en: {
      label: "Review progress", elapsed: "Elapsed", live: "Live", pageOf: "{n} of {m}",
      just: "new line just now", ago: "last line {s} s ago",
      slow: "Still working. This step waits on the site.",
      slower: "Slow site, still running. Stop keeps the pages already saved.",
      ready: "Report ready", stopped: "Stopped", stopping: "Stopping…", failed: "The review ended early",
      phases: ["Connecting", "Analyzing pages", "Browser pass", "Writing cases", "Speed checks", "Scoring and signing"],
      lines: [
        ["Checking the front door: https, DNS, certificate.", "First impressions count. Opening {host}."],
        ["Following the links your visitors follow.", "Analyzing {host} page by page."],
        ["Real Chrome, real pixels, phone and tablet sizes.", "Checking what loads before anyone says yes to cookies."],
        ["Turning what was found into test cases.", "Matching cases to the frameworks you chose."],
        ["Lighthouse is timing the page on a phone.", "Speed is a feature. It is being measured now."],
        ["Scoring each check from the pages analyzed.", "Signing the report."]
      ],
      general: [
        "Quality is never an accident.",
        "Every bug found here is one your users never meet.",
        "Good tests turn guesses into facts.",
        "Slow sites take longer. Thorough beats fast.",
        "Shipping with confidence starts with a look like this.",
        "Each page analyzed is a test case taking shape.",
        "The best bug report is the one written before launch.",
        "Accessibility is quality for everyone."
      ]
    },
    es: {
      label: "Progreso de la revisión", elapsed: "Tiempo transcurrido", live: "En vivo", pageOf: "{n} de {m}",
      just: "nueva línea ahora mismo", ago: "última línea hace {s} s",
      slow: "Sigue trabajando. Este paso espera al sitio.",
      slower: "Sitio lento, sigue en marcha. Detener conserva las páginas ya guardadas.",
      ready: "Informe listo", stopped: "Detenido", stopping: "Deteniendo…", failed: "La revisión terminó antes de tiempo",
      phases: ["Conectando", "Analizando páginas", "Pasada del navegador", "Escribiendo casos", "Pruebas de velocidad", "Puntuando y firmando"],
      lines: [
        ["Revisando la puerta de entrada: https, DNS, certificado.", "La primera impresión cuenta. Abriendo {host}."],
        ["Siguiendo los enlaces que siguen tus visitantes.", "Analizando {host} página a página."],
        ["Chrome real, píxeles reales, en tamaño móvil y tableta.", "Comprobando qué se carga antes de que nadie acepte las cookies."],
        ["Convirtiendo lo encontrado en casos de prueba.", "Ajustando los casos a los frameworks elegidos."],
        ["Lighthouse está midiendo la página en un móvil.", "La velocidad es una función. Se está midiendo ahora."],
        ["Puntuando cada comprobación con las páginas analizadas.", "Firmando el informe."]
      ],
      general: [
        "La calidad nunca es un accidente.",
        "Cada fallo que se encuentra aquí es uno que tus usuarios nunca verán.",
        "Las buenas pruebas convierten suposiciones en hechos.",
        "Los sitios lentos tardan más. Mejor a fondo que rápido.",
        "Publicar con confianza empieza con una mirada como esta.",
        "Cada página analizada es un caso de prueba que toma forma.",
        "El mejor informe de fallo es el que se escribe antes del lanzamiento.",
        "La accesibilidad es calidad para todos."
      ],
      log: {
        fields: "Comprobando los campos, el dominio del correo y que esto es un navegador.", stop: "Detención solicitada.",
        earlier: "Buscando tus revisiones anteriores de {1}.", history: "Comparado con tu revisión de {1} del {2}: {3} corregidos, {4} nuevos.",
        none: "No hay una revisión anterior de {1} con este correo.", ranks: "Leyendo los rankings de Tranco y tu historial de puntuaciones de ambos sitios.",
        compare: "Comparado con tu revisión de {1}: {2} problemas abiertos solo los tiene {3}, {4} solo {5} y {6} ambos.",
        market: "Presencia en el mercado: {1}; {2}.", rank: "{1} ocupa el puesto #{2} en Tranco", out: "{1} está fuera del millón principal de Tranco", presence: ", presencia {1}/100",
        saving: "Guardando el informe.", saved: "Informe guardado. Enviando una copia a {1}."
      }
    },
    pt: {
      label: "Progresso da revisão", elapsed: "Tempo decorrido", live: "Ao vivo", pageOf: "{n} de {m}",
      just: "nova linha agora mesmo", ago: "última linha há {s} s",
      slow: "Ainda trabalhando. Esta etapa espera pelo site.",
      slower: "Site lento, ainda em andamento. Parar mantém as páginas já salvas.",
      ready: "Relatório pronto", stopped: "Parado", stopping: "Parando…", failed: "A revisão terminou antes do tempo",
      phases: ["Conectando", "Analisando páginas", "Passada do navegador", "Escrevendo casos", "Testes de velocidade", "Pontuando e assinando"],
      lines: [
        ["Verificando a porta de entrada: https, DNS, certificado.", "A primeira impressão conta. Abrindo {host}."],
        ["Seguindo os links que seus visitantes seguem.", "Analisando {host} página por página."],
        ["Chrome real, pixels reais, em tamanho de celular e tablet.", "Verificando o que carrega antes de alguém aceitar os cookies."],
        ["Transformando o que foi encontrado em casos de teste.", "Ajustando os casos aos frameworks escolhidos."],
        ["O Lighthouse está cronometrando a página num celular.", "Velocidade é um recurso. Está sendo medida agora."],
        ["Pontuando cada verificação com as páginas analisadas.", "Assinando o relatório."]
      ],
      general: [
        "Qualidade nunca é por acaso.",
        "Cada bug encontrado aqui é um que seus usuários nunca verão.",
        "Bons testes transformam palpites em fatos.",
        "Sites lentos levam mais tempo. Minucioso vence rápido.",
        "Lançar com confiança começa com um olhar como este.",
        "Cada página analisada é um caso de teste tomando forma.",
        "O melhor relatório de bug é o escrito antes do lançamento.",
        "Acessibilidade é qualidade para todos."
      ],
      log: {
        fields: "Verificando os campos, o domínio do e-mail e se isto é um navegador.", stop: "Parada solicitada.",
        earlier: "Procurando suas revisões anteriores de {1}.", history: "Comparado com sua revisão de {1} de {2}: {3} corrigidos, {4} novos.",
        none: "Nenhuma revisão anterior de {1} com este e-mail.", ranks: "Lendo os rankings do Tranco e seu histórico de pontuação dos dois sites.",
        compare: "Comparado com sua revisão de {1}: {2} problemas abertos só {3} tem, {4} só {5} tem, {6} os dois têm.",
        market: "Presença no mercado: {1}; {2}.", rank: "{1} está em #{2} no Tranco", out: "{1} está fora do top 1 milhão do Tranco", presence: ", presença {1}/100",
        saving: "Salvando o relatório.", saved: "Relatório salvo. Enviando uma cópia para {1}."
      }
    },
    de: {
      label: "Fortschritt der Prüfung", elapsed: "Verstrichene Zeit", live: "Live", pageOf: "{n} von {m}",
      just: "neue Zeile gerade eben", ago: "letzte Zeile vor {s} s",
      slow: "Läuft noch. Dieser Schritt wartet auf die Website.",
      slower: "Langsame Website, läuft weiter. Stopp behält die bereits gespeicherten Seiten.",
      ready: "Bericht fertig", stopped: "Gestoppt", stopping: "Wird gestoppt…", failed: "Die Prüfung endete vorzeitig",
      phases: ["Verbinden", "Seiten prüfen", "Browser-Durchlauf", "Fälle schreiben", "Tempo-Messung", "Bewerten und signieren"],
      lines: [
        ["Prüfung der Eingangstür: https, DNS, Zertifikat.", "Der erste Eindruck zählt. {host} wird geöffnet."],
        ["Den Links folgen, denen Ihre Besucher folgen.", "{host} wird Seite für Seite geprüft."],
        ["Echtes Chrome, echte Pixel, in Handy- und Tablet-Größe.", "Was lädt, bevor jemand Cookies zustimmt?"],
        ["Aus den Funden werden Testfälle.", "Die Fälle richten sich nach den gewählten Frameworks."],
        ["Lighthouse misst die Seite auf einem Handy.", "Tempo ist ein Feature. Es wird gerade gemessen."],
        ["Jede Prüfung wird anhand der geprüften Seiten bewertet.", "Der Bericht wird signiert."]
      ],
      general: [
        "Qualität ist nie ein Zufall.",
        "Jeder Fehler, der hier auffällt, erreicht Ihre Nutzer nie.",
        "Gute Tests machen aus Vermutungen Fakten.",
        "Langsame Websites brauchen länger. Gründlich schlägt schnell.",
        "Sicher veröffentlichen beginnt mit einem Blick wie diesem.",
        "Jede geprüfte Seite wird zu einem Testfall.",
        "Der beste Fehlerbericht entsteht vor dem Launch.",
        "Barrierefreiheit ist Qualität für alle."
      ],
      log: {
        fields: "Die Felder, die E-Mail-Domain und der Browser werden geprüft.", stop: "Stopp angefordert.",
        earlier: "Ihre früheren Prüfungen von {1} werden gesucht.", history: "Verglichen mit Ihrer Prüfung von {1} vom {2}: {3} behoben, {4} neu.",
        none: "Keine frühere Prüfung von {1} unter dieser E-Mail-Adresse.", ranks: "Die Tranco-Ränge und Ihr Punkteverlauf für beide Websites werden gelesen.",
        compare: "Verglichen mit Ihrer Prüfung von {1}: {2} offene Probleme hat nur {3}, {4} nur {5}, {6} haben beide.",
        market: "Marktpräsenz: {1}; {2}.", rank: "{1} steht bei Tranco auf Platz {2}", out: "{1} liegt außerhalb der Tranco-Top-Million", presence: ", Präsenz {1}/100",
        saving: "Der Bericht wird gespeichert.", saved: "Bericht gespeichert. Eine Kopie geht an {1}."
      }
    },
    fr: {
      label: "Progression de l’analyse", elapsed: "Temps écoulé", live: "En direct", pageOf: "{n} sur {m}",
      just: "nouvelle ligne à l’instant", ago: "dernière ligne il y a {s} s",
      slow: "Toujours en cours. Cette étape attend le site.",
      slower: "Site lent, toujours en cours. Arrêter garde les pages déjà enregistrées.",
      ready: "Rapport prêt", stopped: "Arrêté", stopping: "Arrêt en cours…", failed: "L’analyse s’est terminée plus tôt",
      phases: ["Connexion", "Analyse des pages", "Passage du navigateur", "Rédaction des cas", "Mesure de vitesse", "Notation et signature"],
      lines: [
        ["Vérification de la porte d’entrée : https, DNS, certificat.", "La première impression compte. Ouverture de {host}."],
        ["On suit les liens que suivent vos visiteurs.", "Analyse de {host}, page après page."],
        ["Vrai Chrome, vrais pixels, en format mobile et tablette.", "Ce qui se charge avant que quiconque accepte les cookies."],
        ["Ce qui a été trouvé devient des cas de test.", "Les cas s’alignent sur les frameworks choisis."],
        ["Lighthouse chronomètre la page sur mobile.", "La vitesse est une fonctionnalité. Elle est mesurée maintenant."],
        ["Chaque contrôle est noté à partir des pages analysées.", "Signature du rapport."]
      ],
      general: [
        "La qualité n’est jamais un accident.",
        "Chaque bug trouvé ici, vos utilisateurs ne le verront jamais.",
        "De bons tests transforment les suppositions en faits.",
        "Les sites lents prennent plus de temps. Mieux vaut minutieux que rapide.",
        "Publier en confiance commence par un regard comme celui-ci.",
        "Chaque page analysée est un cas de test qui prend forme.",
        "Le meilleur rapport de bug est celui écrit avant le lancement.",
        "L’accessibilité, c’est la qualité pour tous."
      ],
      log: {
        fields: "Vérification des champs, du domaine de l’e-mail et qu’il s’agit bien d’un navigateur.", stop: "Arrêt demandé.",
        earlier: "Recherche de vos analyses précédentes de {1}.", history: "Comparé à votre analyse de {1} du {2} : {3} corrigés, {4} nouveaux.",
        none: "Aucune analyse précédente de {1} avec cet e-mail.", ranks: "Lecture des rangs Tranco et de l’historique de vos scores pour les deux sites.",
        compare: "Comparé à votre analyse de {1} : {2} problèmes ouverts que seul {3} a, {4} que seul {5} a, {6} communs aux deux.",
        market: "Présence sur le marché : {1} ; {2}.", rank: "{1} est n° {2} sur Tranco", out: "{1} est hors du top million de Tranco", presence: ", présence {1}/100",
        saving: "Enregistrement du rapport.", saved: "Rapport enregistré. Envoi d’une copie à {1}."
      }
    },
    it: {
      label: "Avanzamento della revisione", elapsed: "Tempo trascorso", live: "In diretta", pageOf: "{n} di {m}",
      just: "nuova riga proprio ora", ago: "ultima riga {s} s fa",
      slow: "Ancora al lavoro. Questo passaggio attende il sito.",
      slower: "Sito lento, ancora in corso. Interrompi conserva le pagine già salvate.",
      ready: "Report pronto", stopped: "Interrotto", stopping: "Interruzione…", failed: "La revisione è finita in anticipo",
      phases: ["Connessione", "Analisi delle pagine", "Passaggio del browser", "Stesura dei casi", "Misura della velocità", "Punteggio e firma"],
      lines: [
        ["Controllo della porta d’ingresso: https, DNS, certificato.", "La prima impressione conta. Apertura di {host}."],
        ["Seguendo i link che seguono i tuoi visitatori.", "Analisi di {host} pagina per pagina."],
        ["Chrome vero, pixel veri, in formato telefono e tablet.", "Cosa si carica prima che qualcuno accetti i cookie."],
        ["Ciò che è stato trovato diventa casi di test.", "I casi si adattano ai framework scelti."],
        ["Lighthouse cronometra la pagina su un telefono.", "La velocità è una funzionalità. Si sta misurando ora."],
        ["Ogni controllo riceve un punteggio dalle pagine analizzate.", "Firma del report."]
      ],
      general: [
        "La qualità non è mai un caso.",
        "Ogni bug trovato qui è uno che i tuoi utenti non vedranno mai.",
        "I buoni test trasformano le ipotesi in fatti.",
        "I siti lenti richiedono più tempo. Meglio accurati che veloci.",
        "Pubblicare con fiducia inizia da uno sguardo come questo.",
        "Ogni pagina analizzata è un caso di test che prende forma.",
        "Il miglior bug report è quello scritto prima del lancio.",
        "L’accessibilità è qualità per tutti."
      ],
      log: {
        fields: "Controllo dei campi, del dominio dell’email e che si tratti di un browser.", stop: "Interruzione richiesta.",
        earlier: "Ricerca delle tue revisioni precedenti di {1}.", history: "Confronto con la tua revisione di {1} del {2}: {3} risolti, {4} nuovi.",
        none: "Nessuna revisione precedente di {1} con questa email.", ranks: "Lettura dei ranking Tranco e dello storico dei tuoi punteggi per entrambi i siti.",
        compare: "Confronto con la tua revisione di {1}: {2} problemi aperti solo su {3}, {4} solo su {5}, {6} su entrambi.",
        market: "Presenza sul mercato: {1}; {2}.", rank: "{1} è al n. {2} su Tranco", out: "{1} è fuori dal primo milione di Tranco", presence: ", presenza {1}/100",
        saving: "Salvataggio del report.", saved: "Report salvato. Invio di una copia a {1}."
      }
    }
  };

  // Where each phase starts on the bar; the last entry is where signing ends.
  const PHASE_AT = [0, 12, 60, 76, 84, 92, 99];
  const PAGES_FROM = 20;
  const PAGES_TO = 58;
  // Server lines are English on every page; the first match moves the bar forward, never back.
  const RULES = [
    [/^Checking the fields/, 2, 0],
    [/^Checking that the address is public https/, 5, 0],
    [/^Opening the first page/, 8, 0],
    [/^Asking PageSpeed Insights/, 10, 0],
    [/^Reading robots\.txt/, 12, 1],
    [/^Opening the start page in a headless browser/, 14, 1],
    [/^First page answered/, 17, 1],
    [/same-host links were listed/, PAGES_FROM, 1],
    [/^((?:Read|Analyzed) \d+ pages?\.|The time budget ended|Stopped\. The report keeps|No further pages)/, 60, 2],
    [/^Waiting for the headless browser/, 64, 2],
    [/^Proposed \d+/, 78, 3],
    [/^Waiting for the background (?:reads|checks)/, 84, 4],
    [/^Waiting for PageSpeed Insights/, 86, 4],
    [/^PageSpeed Insights (answered|did not answer)/, 89, 4],
    [/^The browser pass (finished|did not finish)/, 91, 4],
    [/^Scoring the checks/, 93, 5],
    [/^(Scored |The scored checks could not)/, 96, 5],
    [/^Signed the report/, 98, 5]
  ];
  // The fixed lines the page and functions/index.js write; the crawl's own notes stay English.
  const LOG = [
    [/^Checking the fields, the email domain, and that this is a browser\.$/, "fields"],
    [/^Stop requested\.$/, "stop"],
    [/^Looking for your earlier reviews of (\S+)\.$/, "earlier"],
    [/^Compared with your review of (\S+) from (\S+): (\d+) fixed, (\d+) new\.$/, "history"],
    [/^No earlier review of (\S+) under this email\.$/, "none"],
    [/^Reading the Tranco ranks and your score history for both sites\.$/, "ranks"],
    [/^Compared with your review of (\S+): (\d+) open problems only (\S+) has, (\d+) only (\S+) has, (\d+) both have\.$/, "compare"],
    [/^Market presence: ([^;]+); (.+)\.$/, "market"],
    [/^Saving the report\.$/, "saving"],
    [/^Report saved\. Emailing a copy to (\S+)\.$/, "saved"]
  ];

  const code = String(document.documentElement.lang || "en").slice(0, 2).toLowerCase();
  const book = T[code] || T.en;
  const nt = book === T.en ? "" : ' translate="no"';
  const motion = window.matchMedia("(prefers-reduced-motion: reduce)");

  const root = document.createElement("div");
  root.className = "rp";
  root.hidden = true;
  root.innerHTML =
    '<div class="rp-top">' +
      '<p class="rp-num" aria-hidden="true"><b>0</b><span>%</span></p>' +
      '<div class="rp-text">' +
        '<p class="rp-phase"' + nt + "></p>" +
        '<p class="rp-beat"' + nt + '><i class="rp-dot" aria-hidden="true"></i><span class="rp-live">' + book.live + '</span><span class="rp-ago"></span></p>' +
      "</div>" +
      '<time class="rp-clock" title="' + book.elapsed + '"' + nt + ">00:00</time>" +
    "</div>" +
    '<div class="rp-stage" role="progressbar" aria-label="' + book.label + '" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0">' +
      '<div class="rp-tube">' +
        '<div class="rp-fill"></div><i class="rp-head"></i>' +
        PHASE_AT.slice(1, -1).map((at, i) => '<i class="rp-bead" data-i="' + (i + 1) + '" style="--at:' + at + '%"></i>').join("") +
      "</div>" +
      '<div class="rp-floor" aria-hidden="true"></div>' +
    "</div>";
  log.parentNode.insertBefore(root, log);

  const sky = document.createElement("div");
  sky.className = "rp-sky";
  sky.setAttribute("aria-hidden", "true");
  panel.insertBefore(sky, panel.firstChild);

  const el = {
    num: root.querySelector(".rp-num b"),
    phase: root.querySelector(".rp-phase"),
    dot: root.querySelector(".rp-dot"),
    ago: root.querySelector(".rp-ago"),
    clock: root.querySelector(".rp-clock"),
    stage: root.querySelector(".rp-stage"),
    beads: Array.from(root.querySelectorAll(".rp-bead"))
  };

  const run = { state: "idle", host: "", pages: 20, opened: 0, phase: 0, target: 0, shown: 0, startedAt: 0, lastLine: 0, endedAt: 0, frame: 0, spawn: 0, lastMsg: "", turn: 0, painted: {} };

  function fill(text, vars) {
    return String(text).replace(/\{(\w+)\}/g, (m, key) => (vars[key] == null ? m : vars[key]));
  }

  function rankSide(text) {
    const m = text.match(/^(\S+) is (?:#([\d,]+) on Tranco|outside the Tranco top million)(?:, presence (\d+)\/100)?$/);
    if (!m) return "";
    const rank = m[2] ? Number(m[2].replace(/,/g, "")).toLocaleString(code) : "";
    return fill(m[2] ? book.log.rank : book.log.out, { 1: m[1], 2: rank }) + (m[3] ? fill(book.log.presence, { 1: m[3] }) : "");
  }

  function translate(text) {
    const value = String(text || "");
    const hit = book.log && LOG.find((rule) => rule[0].test(value));
    if (!hit) return value;
    const m = value.match(hit[0]);
    if (hit[1] !== "market") return fill(book.log[hit[1]], m);
    const sides = [rankSide(m[1]), rankSide(m[2])];
    return sides[0] && sides[1] ? fill(book.log.market, { 1: sides[0], 2: sides[1] }) : value;
  }

  function paint(key, node, value) {
    if (run.painted[key] === value) return;
    run.painted[key] = value;
    node.textContent = value;
  }

  function clock(ms) {
    const s = Math.max(0, Math.floor(ms / 1000));
    return String(Math.floor(s / 60)).padStart(2, "0") + ":" + String(s % 60).padStart(2, "0");
  }

  function phaseLabel() {
    if (run.state === "ready") return book.ready;
    if (run.state === "stopped") return book.stopped;
    if (run.state === "failed") return book.failed;
    if (run.state === "stopping") return book.stopping;
    const name = book.phases[run.phase];
    return run.phase === 1 && run.opened ? name + " · " + fill(book.pageOf, { n: Math.min(run.opened + 1, run.pages), m: run.pages }) : name;
  }

  function beatLabel(now) {
    if (run.state !== "running" && run.state !== "stopping") return "";
    const s = Math.floor((now - run.lastLine) / 1000);
    if (s < 2) return book.just;
    if (s < 20) return fill(book.ago, { s: s });
    return s < 75 ? book.slow : book.slower;
  }

  // Runs on a timer as well as on frames, so the clock and heartbeat stay true where frames are throttled.
  function texts() {
    const now = performance.now();
    paint("ago", el.ago, beatLabel(now));
    paint("clock", el.clock, clock((run.endedAt || Date.now()) - run.startedAt));
    root.classList.toggle("is-quiet", run.state === "running" && now - run.lastLine > 20000);
  }

  function tick(now) {
    run.frame = 0;
    const dt = Math.min(5, (now - (run.prev || now)) / 1000);
    run.prev = now;
    const end = run.state === "ready" || run.state === "stopped" ? 100 : run.target;
    if (run.shown < end) {
      run.shown += (end - run.shown) * (1 - Math.exp(-dt / 0.45));
      if (end - run.shown < 0.5) run.shown = end;
    } else if (run.state === "running") {
      // Between lines the bar keeps creeping, but never more than a few points past the last real milestone.
      const ceiling = Math.min(PHASE_AT[run.phase + 1] - 0.5, run.target + 12);
      if (ceiling > run.shown) run.shown += (ceiling - run.shown) * (1 - Math.exp(-dt / 26));
    }
    const pct = Math.floor(run.shown);
    root.style.setProperty("--p", run.shown.toFixed(2));
    paint("num", el.num, String(pct));
    if (run.painted.aria !== pct) {
      run.painted.aria = pct;
      el.stage.setAttribute("aria-valuenow", String(pct));
    }
    const label = phaseLabel();
    paint("phase", el.phase, label);
    if (run.painted.text !== label) {
      run.painted.text = label;
      el.stage.setAttribute("aria-valuetext", pct + "% · " + label);
    }
    texts();
    el.beads.forEach((bead) => bead.classList.toggle("is-past", run.shown >= PHASE_AT[Number(bead.getAttribute("data-i"))]));
    const settled = run.state !== "running" && run.state !== "stopping" && Math.abs(run.shown - end) < 0.05;
    if (!settled) run.frame = requestAnimationFrame(tick);
  }

  function wake() {
    if (!run.frame) {
      run.prev = 0;
      run.frame = requestAnimationFrame(tick);
    }
  }

  function pickMessage() {
    run.turn += 1;
    const situational = book.lines[run.phase] || [];
    const pool = run.turn % 2 ? situational : book.general;
    const options = pool.filter((text) => text !== run.lastMsg);
    const text = options[Math.floor(Math.random() * options.length)] || book.general[0];
    run.lastMsg = text;
    return fill(text, { host: run.host || "…" });
  }

  function spawn() {
    if (run.state !== "running" && run.state !== "stopping") return;
    if (document.hidden) return;
    const still = motion.matches;
    if (still) sky.querySelectorAll(".rp-msg").forEach((node) => node.classList.add("is-out"));
    if (sky.childElementCount > 3) sky.firstChild.remove();
    const msg = document.createElement("p");
    msg.className = "rp-msg";
    if (nt) msg.setAttribute("translate", "no");
    msg.textContent = pickMessage();
    const side = run.turn % 2 ? -1 : 1;
    msg.style.setProperty("--x", (side * (8 + Math.random() * 22)).toFixed(1) + "%");
    msg.style.setProperty("--y", (18 + Math.random() * 64).toFixed(1) + "%");
    msg.style.setProperty("--ry", (side * -(6 + Math.random() * 14)).toFixed(1) + "deg");
    msg.style.setProperty("--rz", ((Math.random() - 0.5) * 6).toFixed(1) + "deg");
    msg.style.setProperty("--hue", run.turn % 3 === 0 ? "var(--rp-gold)" : "var(--rp-cyan)");
    msg.addEventListener("animationend", (event) => {
      if (event.animationName === "rp-drift" || event.animationName === "rp-fade-out") msg.remove();
    });
    sky.appendChild(msg);
  }

  function startSky() {
    clearInterval(run.spawn);
    clearInterval(run.clock);
    run.clock = setInterval(texts, 1000);
    sky.textContent = "";
    sky.classList.remove("is-off");
    spawn();
    run.spawn = setInterval(spawn, motion.matches ? 6500 : 4300);
  }

  function stopSky() {
    clearInterval(run.spawn);
    clearInterval(run.clock);
    run.spawn = 0;
    texts();
    sky.classList.add("is-off");
    setTimeout(() => {
      if (run.state !== "running") sky.textContent = "";
    }, 1400);
  }

  function pulse() {
    el.dot.classList.remove("is-beat");
    void el.dot.offsetWidth;
    el.dot.classList.add("is-beat");
  }

  function line(text) {
    if (run.state !== "running" && run.state !== "stopping") return;
    const value = String(text || "");
    run.lastLine = performance.now();
    pulse();
    if (/^Stop requested/.test(value)) run.state = "stopping";
    const pages = value.match(/at most (\d+) HTML pages/);
    if (pages) run.pages = Math.max(1, Number(pages[1]));
    if (/^Opening \//.test(value)) {
      run.opened += 1;
      const share = Math.min(1, run.opened / Math.max(1, run.pages - 1));
      run.target = Math.max(run.target, PAGES_FROM + (PAGES_TO - PAGES_FROM) * share);
      run.phase = Math.max(run.phase, 1);
    }
    const rule = RULES.find((r) => r[0].test(value));
    if (rule) {
      run.target = Math.max(run.target, rule[1]);
      run.phase = Math.max(run.phase, rule[2]);
    } else {
      // Any other line is still a sign of life, so it nudges the bar inside the current phase.
      run.target = Math.min(PHASE_AT[run.phase + 1] - 0.5, Math.max(run.target, run.shown) + 0.4);
    }
    wake();
  }

  function start(options) {
    const opts = options || {};
    cancelAnimationFrame(run.frame);
    Object.assign(run, { state: "running", host: String(opts.host || "").replace(/^https?:\/\//, "").split("/")[0], pages: Math.max(1, Number(opts.pages) || 20), opened: 0, phase: 0, target: 0, shown: 0, startedAt: Date.now(), lastLine: performance.now(), endedAt: 0, frame: 0, lastMsg: "", turn: 0, painted: {} });
    root.hidden = false;
    root.classList.remove("is-done", "is-stopped", "is-failed", "is-quiet");
    panel.classList.add("rp-on");
    startSky();
    wake();
  }

  function finish(status) {
    if (run.state === "idle") return;
    run.state = status === "stopped" ? "stopped" : "ready";
    run.phase = PHASE_AT.length - 2;
    run.endedAt = Date.now();
    root.classList.add(run.state === "stopped" ? "is-stopped" : "is-done");
    stopSky();
    wake();
  }

  function fail() {
    if (run.state === "idle" || run.state === "ready" || run.state === "stopped") return;
    run.state = "failed";
    run.endedAt = Date.now();
    root.classList.add("is-failed");
    stopSky();
    wake();
  }

  function reset() {
    cancelAnimationFrame(run.frame);
    run.frame = 0;
    run.state = "idle";
    root.hidden = true;
    panel.classList.remove("rp-on");
    stopSky();
  }

  root.addEventListener("pointermove", (event) => {
    if (motion.matches) return;
    const box = root.getBoundingClientRect();
    root.style.setProperty("--tx", (((event.clientX - box.left) / box.width - 0.5) * 10).toFixed(2) + "deg");
    root.style.setProperty("--ty", (((event.clientY - box.top) / box.height - 0.5) * -8).toFixed(2) + "deg");
  });
  root.addEventListener("pointerleave", () => {
    root.style.removeProperty("--tx");
    root.style.removeProperty("--ty");
  });

  window.ReviewProgress = { start: start, line: line, finish: finish, fail: fail, reset: reset, translate: translate };
})();
