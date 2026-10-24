(function () {
  "use strict";

  const section = document.getElementById("live-reports");
  if (!section) return;

  const BASE = "assets/live-reports/";
  const AREAS = ["SEO", "GEO", "Analytics", "Security", "Accessibility", "Performance"];
  const SHORT = { SEO: "SEO", GEO: "GEO", Analytics: "Analytics", Security: "Security", Accessibility: "A11y", Performance: "Speed" };
  const HUES = { government: 186, health: 160, media: 18, banking: 42, fintech: 280, transit: 140, opensource: 205, devdocs: 225, science: 255, highered: 330, education: 300, humanitarian: 0, international: 196, culture: 32, knowledge: 172, retail: 50, telecom: 268, energy: 58, travel: 120, airline: 210, insurance: 152, infrastructure: 24, standards: 240, sports: 100, apps: 12, rights: 350, environment: 88 };
  const STOP = new Set(["de", "del", "la", "el", "los", "las", "of", "the", "y", "and", "du", "da"]);

  // A review analyzes a site; it never "reads" it. Spanish is Latin American (tú), Portuguese is Brazilian (você).
  const T = {
    en: {
      eyebrow: "Live reports", title: "Real sites. Real reviews.", titleEm: "Open any of them.",
      lede: "<b>{n} public sites</b>, analyzed by the same review anyone can run: government portals, newsrooms, banks, universities, open-source projects, and transit systems. Turn the ring, filter by sector or country, and open a report. Reviews people request are added in a daily batch. View and share only.",
      explore: "Explore {n} live reports", gateLine: "Real reviews of public sites, from GOV.UK to Bogotá city hall. View and share only.",
      back: "Back", hub: "Back to Social", prev: "Previous report", next: "Next report", pause: "Pause rotation", play: "Play rotation", open: "Open report",
      carousel: "Live reports carousel", all: "All", sector: "Sector", scope: "Scope", country: "Country", focus: "Test focus",
      worldwide: "Worldwide", national: "National", regional: "Regional", local: "Local", requested: "Requested", global: "Global",
      status: "{i} of {n}: {name}, {score} out of 100, grade {grade}.", slide: "{i} of {n}: {name}",
      none: "No report matches these filters.", clear: "Clear filters", loading: "Loading live reports…", failed: "The live reports could not be loaded.",
      read: "Analyzed {date}", page: "{n} page", pages: "{n} pages", hint: "Drag, swipe, or use the arrow keys. Select a card to open it.",
      close: "Close", share: "Share", copy: "Copy link", copied: "Link copied. It opens this report.", shareOn: "Share on {net}", email: "Email",
      viewOnly: "View only. This live report can be opened and shared, not downloaded, printed, or exported.",
      blocked: "View only. Share the link instead.", shot: "Screenshots cannot be blocked by a page. The watermark stays on the picture.",
      printNote: "Live reports are view-only and are not printed.", printLink: "Open or share it here:",
      fair: "One automated analysis of public pages on {date}. A starting point, not a verdict.", own: "Review your own site",
      remove: "Own this site? Ask to remove it",
      rank: "<b>#{r}</b> of {n} in this series", rankSector: "<b>#{r}</b> of {n} in {sector}",
      hHeadline: "What the review found", hLesson: "The lesson", hAreas: "Six areas · gold tick is the series average", hFix: "Fix first", hWorks: "Already working",
      hAi: "AI crawlers", hSpeed: "Real-visitor speed", hSec: "Security checks", hCoverage: "Proposed coverage", hTags: "Tags",
      gWho: "Who", gScore: "How it scored", gStand: "Standouts", gTested: "Tested for", gBuilt: "Built with",
      openFail: "This report could not be opened.", visit: "Visit site",
      brand: "QA-lab · Live report", gradeWord: "Grade", average: "Series average {n}", areaLine: "{fail} fail · {risk} at risk · {pass} pass",
      botsAllowed: "Answer bots allowed", botsBlocked: "Answer bots blocked", trainingOut: "Training bots opted out", none0: "none",
      published: "published", notFound: "not found", noJs: "HTML without JavaScript", almostEmpty: "almost empty", words: "{n} words", schema: "Structured data",
      notAvailable: "not available", lhMobile: "Lighthouse, mobile", p75: "75th pct.", good: "good", needsWork: "needs work", poor: "poor",
      realVisitors: "Real visitors", noField: "not enough Chrome data", labTiming: "Lab LCP · TBT", pass: "pass", risk: "at risk", fail: "fail",
      filterBy: "Filter by {group}", shareLine: "{name} scored {score}/100 ({grade}) in a QA-lab URL Review live report"
    },
    es: {
      eyebrow: "Informes en vivo", title: "Sitios reales. Análisis reales.", titleEm: "Abre el informe que quieras.",
      lede: "<b>{n} sitios públicos</b>, analizados con la misma revisión que cualquiera puede ejecutar: portales de gobierno, medios de noticias, bancos, universidades, proyectos de código abierto y sistemas de transporte. Recorre el carrusel, filtra por sector o país y abre un informe. Las revisiones que la gente solicita se suman en un lote diario. Solo para ver y compartir.",
      explore: "Explorar {n} informes en vivo", gateLine: "Análisis reales de sitios públicos, desde GOV.UK hasta la Alcaldía de Bogotá. Solo para ver y compartir.",
      back: "Volver", hub: "Volver a Social", prev: "Informe anterior", next: "Informe siguiente", pause: "Pausar el carrusel", play: "Reanudar el carrusel", open: "Abrir informe",
      carousel: "Carrusel de informes en vivo", all: "Todos", sector: "Sector", scope: "Alcance", country: "País", focus: "Tipo de prueba",
      worldwide: "Mundial", national: "Nacional", regional: "Regional", local: "Local", requested: "Solicitado", global: "Global",
      status: "{i} de {n}: {name}, {score} de 100, nota {grade}.", slide: "{i} de {n}: {name}",
      none: "Ningún informe coincide con estos filtros.", clear: "Quitar filtros", loading: "Cargando informes en vivo…", failed: "No se pudieron cargar los informes en vivo.",
      read: "Analizado el {date}", page: "{n} página", pages: "{n} páginas", hint: "Arrastra, desliza o usa las flechas del teclado. Elige una tarjeta para abrirla.",
      close: "Cerrar", share: "Compartir", copy: "Copiar enlace", copied: "Enlace copiado. Abre este informe.", shareOn: "Compartir en {net}", email: "Correo",
      viewOnly: "Solo para ver. Este informe en vivo se puede abrir y compartir, pero no descargar, imprimir ni exportar.",
      blocked: "Solo para ver. Comparte el enlace.", shot: "Una página no puede bloquear las capturas de pantalla. La marca de agua queda en la imagen.",
      printNote: "Los informes en vivo son solo para ver y no se imprimen.", printLink: "Ábrelo o compártelo aquí:",
      fair: "Un análisis automático de páginas públicas del {date}. Un punto de partida, no un veredicto.", own: "Analiza tu propio sitio",
      remove: "¿Es tu sitio? Pide que lo retiremos",
      rank: "<b>#{r}</b> de {n} en esta serie", rankSector: "<b>#{r}</b> de {n} en {sector}",
      hHeadline: "Lo que encontró el análisis", hLesson: "La lección", hAreas: "Seis áreas · la marca dorada es el promedio de la serie", hFix: "Corregir primero", hWorks: "Ya funciona",
      hAi: "Rastreadores de IA", hSpeed: "Velocidad para visitantes reales", hSec: "Controles de seguridad", hCoverage: "Cobertura propuesta", hTags: "Etiquetas",
      gWho: "Quién", gScore: "Puntaje", gStand: "Destacados", gTested: "Qué se probó", gBuilt: "Hecho con",
      openFail: "No se pudo abrir este informe.", visit: "Visitar el sitio",
      brand: "QA-lab · Informe en vivo", gradeWord: "Nota", average: "Promedio de la serie: {n}", areaLine: "{fail} fallan · {risk} en riesgo · {pass} pasan",
      botsAllowed: "Bots de respuesta permitidos", botsBlocked: "Bots de respuesta bloqueados", trainingOut: "Bots de entrenamiento excluidos", none0: "ninguno",
      published: "publicado", notFound: "no encontrado", noJs: "HTML sin JavaScript", almostEmpty: "casi vacío", words: "{n} palabras", schema: "Datos estructurados",
      notAvailable: "no disponible", lhMobile: "Lighthouse, móvil", p75: "percentil 75", good: "bueno", needsWork: "mejorable", poor: "deficiente",
      realVisitors: "Visitantes reales", noField: "no hay suficientes datos de Chrome", labTiming: "LCP · TBT de laboratorio", pass: "pasa", risk: "en riesgo", fail: "falla",
      filterBy: "Filtrar por {group}", shareLine: "{name} obtuvo {score}/100 ({grade}) en un informe en vivo de QA-lab URL Review"
    },
    pt: {
      eyebrow: "Relatórios ao vivo", title: "Sites reais. Análises reais.", titleEm: "Abra o relatório que quiser.",
      lede: "<b>{n} sites públicos</b>, analisados pela mesma revisão que qualquer pessoa pode executar: portais de governo, veículos de imprensa, bancos, universidades, projetos de código aberto e sistemas de transporte. Percorra o carrossel, filtre por setor ou país e abra um relatório. As revisões que as pessoas solicitam entram em um lote diário. Só para ver e compartilhar.",
      explore: "Explorar {n} relatórios ao vivo", gateLine: "Análises reais de sites públicos, do GOV.UK à Prefeitura de Bogotá. Só para ver e compartilhar.",
      back: "Voltar", hub: "Voltar ao Social", prev: "Relatório anterior", next: "Próximo relatório", pause: "Pausar o carrossel", play: "Retomar o carrossel", open: "Abrir relatório",
      carousel: "Carrossel de relatórios ao vivo", all: "Todos", sector: "Setor", scope: "Alcance", country: "País", focus: "Tipo de teste",
      worldwide: "Mundial", national: "Nacional", regional: "Regional", local: "Local", requested: "Solicitado", global: "Global",
      status: "{i} de {n}: {name}, {score} de 100, nota {grade}.", slide: "{i} de {n}: {name}",
      none: "Nenhum relatório corresponde a estes filtros.", clear: "Limpar filtros", loading: "Carregando relatórios ao vivo…", failed: "Não foi possível carregar os relatórios ao vivo.",
      read: "Analisado em {date}", page: "{n} página", pages: "{n} páginas", hint: "Arraste, deslize ou use as setas do teclado. Escolha um cartão para abri-lo.",
      close: "Fechar", share: "Compartilhar", copy: "Copiar link", copied: "Link copiado. Ele abre este relatório.", shareOn: "Compartilhar no {net}", email: "E-mail",
      viewOnly: "Só para ver. Este relatório ao vivo pode ser aberto e compartilhado, mas não baixado, impresso nem exportado.",
      blocked: "Só para ver. Compartilhe o link.", shot: "Uma página não consegue bloquear capturas de tela. A marca d’água fica na imagem.",
      printNote: "Relatórios ao vivo são só para ver e não são impressos.", printLink: "Abra ou compartilhe aqui:",
      fair: "Uma análise automática de páginas públicas em {date}. Um ponto de partida, não um veredito.", own: "Analise o seu site",
      remove: "Este site é seu? Peça a remoção",
      rank: "<b>#{r}</b> de {n} nesta série", rankSector: "<b>#{r}</b> de {n} em {sector}",
      hHeadline: "O que a análise encontrou", hLesson: "A lição", hAreas: "Seis áreas · a marca dourada é a média da série", hFix: "Corrigir primeiro", hWorks: "Já funciona",
      hAi: "Rastreadores de IA", hSpeed: "Velocidade para visitantes reais", hSec: "Verificações de segurança", hCoverage: "Cobertura proposta", hTags: "Etiquetas",
      gWho: "Quem", gScore: "Pontuação", gStand: "Destaques", gTested: "O que foi testado", gBuilt: "Feito com",
      openFail: "Não foi possível abrir este relatório.", visit: "Visitar o site",
      brand: "QA-lab · Relatório ao vivo", gradeWord: "Nota", average: "Média da série: {n}", areaLine: "{fail} falham · {risk} em risco · {pass} passam",
      botsAllowed: "Bots de resposta permitidos", botsBlocked: "Bots de resposta bloqueados", trainingOut: "Bots de treinamento excluídos", none0: "nenhum",
      published: "publicado", notFound: "não encontrado", noJs: "HTML sem JavaScript", almostEmpty: "quase vazio", words: "{n} palavras", schema: "Dados estruturados",
      notAvailable: "indisponível", lhMobile: "Lighthouse, celular", p75: "percentil 75", good: "bom", needsWork: "precisa melhorar", poor: "ruim",
      realVisitors: "Visitantes reais", noField: "dados do Chrome insuficientes", labTiming: "LCP · TBT de laboratório", pass: "passa", risk: "em risco", fail: "falha",
      filterBy: "Filtrar por {group}", shareLine: "{name} fez {score}/100 ({grade}) em um relatório ao vivo do QA-lab URL Review"
    },
    de: {
      eyebrow: "Live-Berichte", title: "Echte Websites. Echte Prüfungen.", titleEm: "Öffnen Sie jeden Bericht.",
      lede: "<b>{n} öffentliche Websites</b>, analysiert mit derselben Prüfung, die jeder starten kann: Regierungsportale, Redaktionen, Banken, Universitäten, Open-Source-Projekte und Verkehrsbetriebe. Blättern Sie durch das Karussell, filtern Sie nach Branche oder Land und öffnen Sie einen Bericht. Von Nutzern angefragte Prüfungen kommen täglich gesammelt hinzu. Nur ansehen und teilen.",
      explore: "{n} Live-Berichte ansehen", gateLine: "Echte Prüfungen öffentlicher Websites, von GOV.UK bis zum Rathaus von Bogotá. Nur ansehen und teilen.",
      back: "Zurück", hub: "Zurück zu Social", prev: "Vorheriger Bericht", next: "Nächster Bericht", pause: "Karussell anhalten", play: "Karussell fortsetzen", open: "Bericht öffnen",
      carousel: "Karussell der Live-Berichte", all: "Alle", sector: "Branche", scope: "Reichweite", country: "Land", focus: "Testart",
      worldwide: "Weltweit", national: "National", regional: "Regional", local: "Lokal", requested: "Angefragt", global: "Global",
      status: "{i} von {n}: {name}, {score} von 100, Note {grade}.", slide: "{i} von {n}: {name}",
      none: "Kein Bericht passt zu diesen Filtern.", clear: "Filter löschen", loading: "Live-Berichte werden geladen…", failed: "Die Live-Berichte konnten nicht geladen werden.",
      read: "Geprüft am {date}", page: "{n} Seite", pages: "{n} Seiten", hint: "Ziehen, wischen oder Pfeiltasten nutzen. Eine Karte wählen, um sie zu öffnen.",
      close: "Schließen", share: "Teilen", copy: "Link kopieren", copied: "Link kopiert. Er öffnet diesen Bericht.", shareOn: "Auf {net} teilen", email: "E-Mail",
      viewOnly: "Nur ansehen. Dieser Live-Bericht kann geöffnet und geteilt, aber nicht heruntergeladen, gedruckt oder exportiert werden.",
      blocked: "Nur ansehen. Teilen Sie stattdessen den Link.", shot: "Eine Seite kann Screenshots nicht verhindern. Das Wasserzeichen bleibt im Bild.",
      printNote: "Live-Berichte sind nur zum Ansehen und werden nicht gedruckt.", printLink: "Hier öffnen oder teilen:",
      fair: "Eine automatische Prüfung öffentlicher Seiten am {date}. Ein Ausgangspunkt, kein Urteil.", own: "Eigene Website prüfen",
      remove: "Ihre Website? Bitten Sie um Entfernung",
      rank: "<b>#{r}</b> von {n} in dieser Serie", rankSector: "<b>#{r}</b> von {n} in {sector}",
      hHeadline: "Was die Prüfung fand", hLesson: "Die Lehre", hAreas: "Sechs Bereiche · die goldene Marke ist der Serienschnitt", hFix: "Zuerst beheben", hWorks: "Funktioniert bereits",
      hAi: "KI-Crawler", hSpeed: "Tempo für echte Besucher", hSec: "Sicherheitsprüfungen", hCoverage: "Vorgeschlagene Abdeckung", hTags: "Tags",
      gWho: "Wer", gScore: "Bewertung", gStand: "Highlights", gTested: "Geprüft auf", gBuilt: "Gebaut mit",
      openFail: "Dieser Bericht konnte nicht geöffnet werden.", visit: "Website besuchen",
      brand: "QA-lab · Live-Bericht", gradeWord: "Note", average: "Serienschnitt {n}", areaLine: "{fail} durchgefallen · {risk} gefährdet · {pass} bestanden",
      botsAllowed: "Antwort-Bots erlaubt", botsBlocked: "Antwort-Bots gesperrt", trainingOut: "Trainings-Bots ausgeschlossen", none0: "keine",
      published: "veröffentlicht", notFound: "nicht gefunden", noJs: "HTML ohne JavaScript", almostEmpty: "fast leer", words: "{n} Wörter", schema: "Strukturierte Daten",
      notAvailable: "nicht verfügbar", lhMobile: "Lighthouse, mobil", p75: "75. Perzentil", good: "gut", needsWork: "verbesserungswürdig", poor: "schlecht",
      realVisitors: "Echte Besucher", noField: "zu wenige Chrome-Daten", labTiming: "Labor-LCP · TBT", pass: "bestanden", risk: "gefährdet", fail: "durchgefallen",
      filterBy: "Nach {group} filtern", shareLine: "{name} erreicht {score}/100 ({grade}) in einem Live-Bericht von QA-lab URL Review"
    },
    fr: {
      eyebrow: "Rapports en direct", title: "De vrais sites. De vraies analyses.", titleEm: "Ouvrez le rapport de votre choix.",
      lede: "<b>{n} sites publics</b>, analysés par le même outil que chacun peut lancer : portails publics, rédactions, banques, universités, projets open source et réseaux de transport. Parcourez le carrousel, filtrez par secteur ou pays, puis ouvrez un rapport. Les analyses demandées par les visiteurs s’ajoutent chaque jour, par lot. Consultation et partage uniquement.",
      explore: "Explorer {n} rapports en direct", gateLine: "De vraies analyses de sites publics, de GOV.UK à la mairie de Bogotá. Consultation et partage uniquement.",
      back: "Retour", hub: "Retour à Social", prev: "Rapport précédent", next: "Rapport suivant", pause: "Mettre le carrousel en pause", play: "Relancer le carrousel", open: "Ouvrir le rapport",
      carousel: "Carrousel des rapports en direct", all: "Tous", sector: "Secteur", scope: "Portée", country: "Pays", focus: "Type de test",
      worldwide: "Mondial", national: "National", regional: "Régional", local: "Local", requested: "Demandé", global: "Mondial",
      status: "{i} sur {n} : {name}, {score} sur 100, note {grade}.", slide: "{i} sur {n} : {name}",
      none: "Aucun rapport ne correspond à ces filtres.", clear: "Effacer les filtres", loading: "Chargement des rapports en direct…", failed: "Les rapports en direct n’ont pas pu être chargés.",
      read: "Analysé le {date}", page: "{n} page", pages: "{n} pages", hint: "Faites glisser, balayez ou utilisez les flèches du clavier. Choisissez une carte pour l’ouvrir.",
      close: "Fermer", share: "Partager", copy: "Copier le lien", copied: "Lien copié. Il ouvre ce rapport.", shareOn: "Partager sur {net}", email: "E-mail",
      viewOnly: "Consultation seule. Ce rapport en direct peut être ouvert et partagé, mais pas téléchargé, imprimé ni exporté.",
      blocked: "Consultation seule. Partagez plutôt le lien.", shot: "Une page ne peut pas bloquer les captures d’écran. Le filigrane reste sur l’image.",
      printNote: "Les rapports en direct sont en consultation seule et ne s’impriment pas.", printLink: "Ouvrez-le ou partagez-le ici :",
      fair: "Une analyse automatique de pages publiques le {date}. Un point de départ, pas un verdict.", own: "Analyser votre site",
      remove: "C’est votre site ? Demandez son retrait",
      rank: "<b>#{r}</b> sur {n} dans cette série", rankSector: "<b>#{r}</b> sur {n} en {sector}",
      hHeadline: "Ce que l’analyse a trouvé", hLesson: "La leçon", hAreas: "Six domaines · le repère doré est la moyenne de la série", hFix: "À corriger d’abord", hWorks: "Ce qui fonctionne déjà",
      hAi: "Robots d’IA", hSpeed: "Vitesse pour de vrais visiteurs", hSec: "Contrôles de sécurité", hCoverage: "Couverture proposée", hTags: "Étiquettes",
      gWho: "Qui", gScore: "Score", gStand: "Points forts", gTested: "Testé pour", gBuilt: "Construit avec",
      openFail: "Ce rapport n’a pas pu être ouvert.", visit: "Visiter le site",
      brand: "QA-lab · Rapport en direct", gradeWord: "Note", average: "Moyenne de la série : {n}", areaLine: "{fail} en échec · {risk} à risque · {pass} réussis",
      botsAllowed: "Robots de réponse autorisés", botsBlocked: "Robots de réponse bloqués", trainingOut: "Robots d’entraînement exclus", none0: "aucun",
      published: "publié", notFound: "introuvable", noJs: "HTML sans JavaScript", almostEmpty: "presque vide", words: "{n} mots", schema: "Données structurées",
      notAvailable: "indisponible", lhMobile: "Lighthouse, mobile", p75: "75e centile", good: "bon", needsWork: "à améliorer", poor: "mauvais",
      realVisitors: "Visiteurs réels", noField: "pas assez de données Chrome", labTiming: "LCP · TBT en labo", pass: "réussi", risk: "à risque", fail: "en échec",
      filterBy: "Filtrer par {group}", shareLine: "{name} obtient {score}/100 ({grade}) dans un rapport en direct de QA-lab URL Review"
    },
    it: {
      eyebrow: "Report dal vivo", title: "Siti veri. Analisi vere.", titleEm: "Apri il report che vuoi.",
      lede: "<b>{n} siti pubblici</b>, analizzati con la stessa revisione che chiunque può avviare: portali pubblici, redazioni, banche, università, progetti open source e trasporti. Scorri il carosello, filtra per settore o paese e apri un report. Le revisioni richieste dagli utenti si aggiungono ogni giorno, in un unico lotto. Solo visualizzazione e condivisione.",
      explore: "Esplora {n} report dal vivo", gateLine: "Analisi reali di siti pubblici, da GOV.UK al comune di Bogotá. Solo visualizzazione e condivisione.",
      back: "Indietro", hub: "Torna a Social", prev: "Report precedente", next: "Report successivo", pause: "Metti in pausa il carosello", play: "Riprendi il carosello", open: "Apri il report",
      carousel: "Carosello dei report dal vivo", all: "Tutti", sector: "Settore", scope: "Portata", country: "Paese", focus: "Tipo di test",
      worldwide: "Mondiale", national: "Nazionale", regional: "Regionale", local: "Locale", requested: "Richiesto", global: "Globale",
      status: "{i} di {n}: {name}, {score} su 100, voto {grade}.", slide: "{i} di {n}: {name}",
      none: "Nessun report corrisponde a questi filtri.", clear: "Azzera i filtri", loading: "Caricamento dei report dal vivo…", failed: "Non è stato possibile caricare i report dal vivo.",
      read: "Analizzato il {date}", page: "{n} pagina", pages: "{n} pagine", hint: "Trascina, scorri o usa le frecce della tastiera. Scegli una scheda per aprirla.",
      close: "Chiudi", share: "Condividi", copy: "Copia link", copied: "Link copiato. Apre questo report.", shareOn: "Condividi su {net}", email: "E-mail",
      viewOnly: "Solo visualizzazione. Questo report dal vivo si può aprire e condividere, ma non scaricare, stampare o esportare.",
      blocked: "Solo visualizzazione. Condividi il link.", shot: "Una pagina non può bloccare gli screenshot. La filigrana resta nell’immagine.",
      printNote: "I report dal vivo sono solo da visualizzare e non si stampano.", printLink: "Aprilo o condividilo qui:",
      fair: "Un’analisi automatica di pagine pubbliche il {date}. Un punto di partenza, non un verdetto.", own: "Analizza il tuo sito",
      remove: "È il tuo sito? Chiedi di rimuoverlo",
      rank: "<b>#{r}</b> su {n} in questa serie", rankSector: "<b>#{r}</b> su {n} in {sector}",
      hHeadline: "Cosa ha trovato l’analisi", hLesson: "La lezione", hAreas: "Sei aree · la tacca dorata è la media della serie", hFix: "Da sistemare prima", hWorks: "Funziona già",
      hAi: "Crawler IA", hSpeed: "Velocità per visitatori reali", hSec: "Controlli di sicurezza", hCoverage: "Copertura proposta", hTags: "Tag",
      gWho: "Chi", gScore: "Punteggio", gStand: "In evidenza", gTested: "Testato per", gBuilt: "Fatto con",
      openFail: "Non è stato possibile aprire questo report.", visit: "Visita il sito",
      brand: "QA-lab · Report dal vivo", gradeWord: "Voto", average: "Media della serie: {n}", areaLine: "{fail} falliti · {risk} a rischio · {pass} superati",
      botsAllowed: "Bot di risposta ammessi", botsBlocked: "Bot di risposta bloccati", trainingOut: "Bot di addestramento esclusi", none0: "nessuno",
      published: "pubblicato", notFound: "non trovato", noJs: "HTML senza JavaScript", almostEmpty: "quasi vuoto", words: "{n} parole", schema: "Dati strutturati",
      notAvailable: "non disponibile", lhMobile: "Lighthouse, mobile", p75: "75° percentile", good: "buono", needsWork: "da migliorare", poor: "scarso",
      realVisitors: "Visitatori reali", noField: "dati Chrome insufficienti", labTiming: "LCP · TBT di laboratorio", pass: "superato", risk: "a rischio", fail: "fallito",
      filterBy: "Filtra per {group}", shareLine: "{name} ottiene {score}/100 ({grade}) in un report dal vivo di QA-lab URL Review"
    }
  };

  const AREA_T = {
    es: { full: { Analytics: "Analítica", Security: "Seguridad", Accessibility: "Accesibilidad", Performance: "Rendimiento" }, short: { Analytics: "Analítica", Security: "Seguridad", Accessibility: "Accesib.", Performance: "Velocidad" } },
    pt: { full: { Analytics: "Analytics", Security: "Segurança", Accessibility: "Acessibilidade", Performance: "Desempenho" }, short: { Security: "Segurança", Accessibility: "Acessib.", Performance: "Rapidez" } },
    de: { full: { Analytics: "Analytics", Security: "Sicherheit", Accessibility: "Barrierefreiheit", Performance: "Performance" }, short: { Security: "Sicherheit", Accessibility: "Zugängl.", Performance: "Tempo" } },
    fr: { full: { Analytics: "Analytics", Security: "Sécurité", Accessibility: "Accessibilité", Performance: "Performance" }, short: { Security: "Sécurité", Accessibility: "Access.", Performance: "Vitesse" } },
    it: { full: { Analytics: "Analytics", Security: "Sicurezza", Accessibility: "Accessibilità", Performance: "Prestazioni" }, short: { Security: "Sicurezza", Accessibility: "Access.", Performance: "Velocità" } }
  };

  // Report tags arrive in English from the build; these give each one a native label.
  const TAG_RULES = [
    ["versions", /^(\d+) language versions$/], ["lighthouse", /^Lighthouse (\d+) mobile$/], ["gradeTag", /^Grade ([A-F]) · (\d+)$/],
    ["onePage", /^1 page analyzed$/], ["pagesRead", /^(\d+) pages analyzed$/], ["tests", /^(\d+) proposed cases · (\d+) test types$/],
    ["top", /^Top (\d+) of (\d+)$/], ["best", /^Best (\w+) in the series$/], ["inSector", /^#(\d+) in (.+)$/]
  ];
  const TAG_T = {
    es: {
      versions: "{1} versiones de idioma", lighthouse: "Lighthouse {1} en móvil", gradeTag: "Nota {1} · {2}", onePage: "1 página analizada", pagesRead: "{1} páginas analizadas",
      tests: "{1} casos propuestos · {2} tipos de prueba", top: "Top {1} de {2}", best: "Mejor {area} de la serie", inSector: "#{1} en {sector}",
      fixed: {
        "AI-search ready": "Listo para búsqueda con IA", "Blocks AI answer bots": "Bloquea bots de respuesta de IA", "Core Web Vitals pass": "Aprueba Core Web Vitals",
        "JS-only HTML": "HTML que depende de JS", "JSON-LD that does not parse": "JSON-LD con errores", "No page language": "Sin idioma de página",
        "Opts out of AI training": "Excluido del entrenamiento de IA", "Pinch-zoom blocked": "Zoom táctil bloqueado", "Strict CSP": "CSP estricta",
        "Zero failing checks": "Ninguna verificación fallida", "llms.txt published": "llms.txt publicado",
        "Top tier · 90+": "Excelente · 90+", "Strong · 80–89": "Muy bueno · 80–89", "Solid · 70–79": "Bueno · 70–79", "Fair · 60–69": "Aceptable · 60–69", "Needs work · under 60": "Por mejorar · menos de 60",
        "Company": "Empresa", "City government": "Gobierno local", "Public agency": "Entidad pública", "Nonprofit": "Sin ánimo de lucro", "Intergovernmental": "Intergubernamental",
        "Open-source project": "Proyecto de código abierto", "State-owned company": "Empresa estatal", "University": "Universidad", "National government": "Gobierno nacional",
        "Public broadcaster": "Medio público", "Regional government": "Gobierno regional",
        "Latin America": "América Latina", "North America": "Norteamérica", "Europe": "Europa", "Middle East": "Medio Oriente", "Asia-Pacific": "Asia-Pacífico", "Africa": "África", "Caribbean": "Caribe", "Global": "Global"
      }
    },
    pt: {
      versions: "{1} versões de idioma", lighthouse: "Lighthouse {1} no celular", gradeTag: "Nota {1} · {2}", onePage: "1 página analisada", pagesRead: "{1} páginas analisadas",
      tests: "{1} casos propostos · {2} tipos de teste", top: "Top {1} de {2}", best: "Melhor {area} da série", inSector: "#{1} em {sector}",
      fixed: {
        "AI-search ready": "Pronto para busca com IA", "Blocks AI answer bots": "Bloqueia bots de resposta de IA", "Core Web Vitals pass": "Aprovado nos Core Web Vitals",
        "JS-only HTML": "HTML que depende de JS", "JSON-LD that does not parse": "JSON-LD com erros", "No page language": "Sem idioma da página",
        "Opts out of AI training": "Fora do treinamento de IA", "Pinch-zoom blocked": "Zoom de pinça bloqueado", "Strict CSP": "CSP estrita",
        "Zero failing checks": "Nenhuma verificação com falha", "llms.txt published": "llms.txt publicado",
        "Top tier · 90+": "Excelente · 90+", "Strong · 80–89": "Muito bom · 80–89", "Solid · 70–79": "Bom · 70–79", "Fair · 60–69": "Regular · 60–69", "Needs work · under 60": "Precisa melhorar · abaixo de 60",
        "Company": "Empresa", "City government": "Prefeitura", "Public agency": "Órgão público", "Nonprofit": "Sem fins lucrativos", "Intergovernmental": "Intergovernamental",
        "Open-source project": "Projeto de código aberto", "State-owned company": "Empresa estatal", "University": "Universidade", "National government": "Governo nacional",
        "Public broadcaster": "Emissora pública", "Regional government": "Governo regional",
        "Latin America": "América Latina", "North America": "América do Norte", "Europe": "Europa", "Middle East": "Oriente Médio", "Asia-Pacific": "Ásia-Pacífico", "Africa": "África", "Caribbean": "Caribe", "Global": "Global"
      }
    },
    de: {
      versions: "{1} Sprachversionen", lighthouse: "Lighthouse {1} mobil", gradeTag: "Note {1} · {2}", onePage: "1 Seite geprüft", pagesRead: "{1} Seiten geprüft",
      tests: "{1} vorgeschlagene Fälle · {2} Testarten", top: "Top {1} von {2}", best: "{area}: Bestwert der Serie", inSector: "#{1} in {sector}",
      fixed: {
        "AI-search ready": "Bereit für KI-Suche", "Blocks AI answer bots": "Sperrt KI-Antwort-Bots", "Core Web Vitals pass": "Core Web Vitals bestanden",
        "JS-only HTML": "HTML nur mit JS", "JSON-LD that does not parse": "Fehlerhaftes JSON-LD", "No page language": "Keine Seitensprache",
        "Opts out of AI training": "Kein KI-Training", "Pinch-zoom blocked": "Zoomen gesperrt", "Strict CSP": "Strenge CSP",
        "Zero failing checks": "Keine fehlgeschlagene Prüfung", "llms.txt published": "llms.txt veröffentlicht",
        "Top tier · 90+": "Spitzenklasse · 90+", "Strong · 80–89": "Stark · 80–89", "Solid · 70–79": "Solide · 70–79", "Fair · 60–69": "Ausreichend · 60–69", "Needs work · under 60": "Ausbaufähig · unter 60",
        "Company": "Unternehmen", "City government": "Stadtverwaltung", "Public agency": "Behörde", "Nonprofit": "Gemeinnützig", "Intergovernmental": "Zwischenstaatlich",
        "Open-source project": "Open-Source-Projekt", "State-owned company": "Staatsunternehmen", "University": "Universität", "National government": "Nationale Regierung",
        "Public broadcaster": "Öffentlich-rechtlicher Sender", "Regional government": "Regionalregierung",
        "Latin America": "Lateinamerika", "North America": "Nordamerika", "Europe": "Europa", "Middle East": "Naher Osten", "Asia-Pacific": "Asien-Pazifik", "Africa": "Afrika", "Caribbean": "Karibik", "Global": "Global"
      }
    },
    fr: {
      versions: "{1} versions linguistiques", lighthouse: "Lighthouse {1} sur mobile", gradeTag: "Note {1} · {2}", onePage: "1 page analysée", pagesRead: "{1} pages analysées",
      tests: "{1} cas proposés · {2} types de test", top: "Top {1} sur {2}", best: "Meilleur score {area} de la série", inSector: "#{1} en {sector}",
      fixed: {
        "AI-search ready": "Prêt pour la recherche IA", "Blocks AI answer bots": "Bloque les robots de réponse IA", "Core Web Vitals pass": "Core Web Vitals réussis",
        "JS-only HTML": "HTML uniquement en JS", "JSON-LD that does not parse": "JSON-LD invalide", "No page language": "Langue de page absente",
        "Opts out of AI training": "Refuse l’entraînement IA", "Pinch-zoom blocked": "Zoom tactile bloqué", "Strict CSP": "CSP stricte",
        "Zero failing checks": "Aucun contrôle en échec", "llms.txt published": "llms.txt publié",
        "Top tier · 90+": "Excellence · 90+", "Strong · 80–89": "Très bon · 80–89", "Solid · 70–79": "Solide · 70–79", "Fair · 60–69": "Correct · 60–69", "Needs work · under 60": "À améliorer · moins de 60",
        "Company": "Entreprise", "City government": "Municipalité", "Public agency": "Organisme public", "Nonprofit": "Association", "Intergovernmental": "Intergouvernemental",
        "Open-source project": "Projet open source", "State-owned company": "Entreprise publique", "University": "Université", "National government": "Gouvernement national",
        "Public broadcaster": "Média public", "Regional government": "Gouvernement régional",
        "Latin America": "Amérique latine", "North America": "Amérique du Nord", "Europe": "Europe", "Middle East": "Moyen-Orient", "Asia-Pacific": "Asie-Pacifique", "Africa": "Afrique", "Caribbean": "Caraïbes", "Global": "Mondial"
      }
    },
    it: {
      versions: "{1} versioni linguistiche", lighthouse: "Lighthouse {1} su mobile", gradeTag: "Voto {1} · {2}", onePage: "1 pagina analizzata", pagesRead: "{1} pagine analizzate",
      tests: "{1} casi proposti · {2} tipi di test", top: "Top {1} su {2}", best: "Miglior {area} della serie", inSector: "#{1} in {sector}",
      fixed: {
        "AI-search ready": "Pronto per la ricerca IA", "Blocks AI answer bots": "Blocca i bot di risposta IA", "Core Web Vitals pass": "Core Web Vitals superati",
        "JS-only HTML": "HTML solo con JS", "JSON-LD that does not parse": "JSON-LD non valido", "No page language": "Lingua della pagina assente",
        "Opts out of AI training": "Escluso dall’addestramento IA", "Pinch-zoom blocked": "Zoom bloccato", "Strict CSP": "CSP rigorosa",
        "Zero failing checks": "Nessun controllo fallito", "llms.txt published": "llms.txt pubblicato",
        "Top tier · 90+": "Eccellente · 90+", "Strong · 80–89": "Molto buono · 80–89", "Solid · 70–79": "Buono · 70–79", "Fair · 60–69": "Discreto · 60–69", "Needs work · under 60": "Da migliorare · sotto 60",
        "Company": "Azienda", "City government": "Comune", "Public agency": "Ente pubblico", "Nonprofit": "Non profit", "Intergovernmental": "Intergovernativo",
        "Open-source project": "Progetto open source", "State-owned company": "Azienda statale", "University": "Università", "National government": "Governo nazionale",
        "Public broadcaster": "Emittente pubblica", "Regional government": "Governo regionale",
        "Latin America": "America Latina", "North America": "Nord America", "Europe": "Europa", "Middle East": "Medio Oriente", "Asia-Pacific": "Asia-Pacifico", "Africa": "Africa", "Caribbean": "Caraibi", "Global": "Globale"
      }
    }
  };
  const SEV_T = {
    es: { critical: "crítico", high: "alto", medium: "medio", low: "bajo", info: "info" },
    pt: { critical: "crítico", high: "alto", medium: "médio", low: "baixo", info: "info" },
    de: { critical: "kritisch", high: "hoch", medium: "mittel", low: "niedrig", info: "Info" },
    fr: { critical: "critique", high: "élevé", medium: "moyen", low: "faible", info: "info" },
    it: { critical: "critico", high: "alto", medium: "medio", low: "basso", info: "info" }
  };
  const NAME_TAGS = new Set(["hosting", "tech", "analytics", "consent", "lang"]);

  const SECTOR_T = {
    es: { government: "Gobierno", health: "Salud pública", media: "Noticias y medios", banking: "Banca y finanzas", fintech: "Fintech", transit: "Transporte y movilidad", opensource: "Código abierto", devdocs: "Documentación técnica", science: "Espacio y ciencia", highered: "Educación superior", education: "Educación", humanitarian: "Humanitario", international: "Organismos internacionales", culture: "Museos, bibliotecas y cultura", knowledge: "Conocimiento abierto", retail: "Comercio y e-commerce", telecom: "Telecomunicaciones", energy: "Energía y servicios públicos", travel: "Viajes y turismo", airline: "Aerolínea", insurance: "Seguros y salud", infrastructure: "Infraestructura de internet", standards: "Estándares web", sports: "Deporte y recreación", apps: "Apps y domicilios", rights: "Derechos humanos y digitales", environment: "Medio ambiente y clima" },
    pt: { government: "Governo", health: "Saúde pública", media: "Notícias e mídia", banking: "Bancos e finanças", fintech: "Fintech", transit: "Transporte e mobilidade", opensource: "Código aberto", devdocs: "Documentação técnica", science: "Espaço e ciência", highered: "Ensino superior", education: "Educação", humanitarian: "Humanitário", international: "Organismos internacionais", culture: "Museus, bibliotecas e cultura", knowledge: "Conhecimento aberto", retail: "Varejo e e-commerce", telecom: "Telecomunicações", energy: "Energia e serviços públicos", travel: "Viagens e turismo", airline: "Companhia aérea", insurance: "Seguros e planos de saúde", infrastructure: "Infraestrutura de internet", standards: "Padrões web", sports: "Esporte e lazer", apps: "Apps e delivery", rights: "Direitos humanos e digitais", environment: "Meio ambiente e clima" },
    de: { government: "Regierung", health: "Öffentliche Gesundheit", media: "Nachrichten und Medien", banking: "Banken und Finanzen", fintech: "Fintech", transit: "Verkehr und Mobilität", opensource: "Open Source", devdocs: "Entwicklerdokumentation", science: "Raumfahrt und Wissenschaft", highered: "Hochschulen", education: "Bildung", humanitarian: "Humanitäre Hilfe", international: "Internationale Organisationen", culture: "Museen, Bibliotheken und Kultur", knowledge: "Freies Wissen", retail: "Handel und E-Commerce", telecom: "Telekommunikation", energy: "Energie und Versorgung", travel: "Reisen und Tourismus", airline: "Fluggesellschaft", insurance: "Versicherungen und Krankenkassen", infrastructure: "Internet-Infrastruktur", standards: "Webstandards", sports: "Sport und Freizeit", apps: "Apps und Lieferdienste", rights: "Menschen- und Digitalrechte", environment: "Umwelt und Klima" },
    fr: { government: "Gouvernement", health: "Santé publique", media: "Presse et médias", banking: "Banque et finance", fintech: "Fintech", transit: "Transports et mobilité", opensource: "Open source", devdocs: "Documentation développeurs", science: "Espace et science", highered: "Enseignement supérieur", education: "Éducation", humanitarian: "Humanitaire", international: "Organisations internationales", culture: "Musées, bibliothèques et culture", knowledge: "Savoir ouvert", retail: "Commerce et e-commerce", telecom: "Télécoms", energy: "Énergie et services publics", travel: "Voyage et tourisme", airline: "Compagnie aérienne", insurance: "Assurance et santé", infrastructure: "Infrastructure internet", standards: "Standards du web", sports: "Sport et loisirs", apps: "Applis et livraison", rights: "Droits humains et numériques", environment: "Environnement et climat" },
    it: { government: "Governo", health: "Sanità pubblica", media: "Notizie e media", banking: "Banche e finanza", fintech: "Fintech", transit: "Trasporti e mobilità", opensource: "Open source", devdocs: "Documentazione tecnica", science: "Spazio e scienza", highered: "Università", education: "Istruzione", humanitarian: "Umanitario", international: "Organizzazioni internazionali", culture: "Musei, biblioteche e cultura", knowledge: "Conoscenza aperta", retail: "Retail ed e-commerce", telecom: "Telecomunicazioni", energy: "Energia e servizi pubblici", travel: "Viaggi e turismo", airline: "Compagnia aerea", insurance: "Assicurazioni e sanità", infrastructure: "Infrastruttura internet", standards: "Standard web", sports: "Sport e tempo libero", apps: "App e consegne", rights: "Diritti umani e digitali", environment: "Ambiente e clima" }
  };
  const FOCUS_T = {
    es: { seo: "SEO", geo: "GEO · búsqueda con IA", schema: "Datos estructurados", a11y: "Accesibilidad", security: "Controles de seguridad", performance: "Rendimiento · Core Web Vitals", analytics: "Analítica y consentimiento", i18n: "Internacionalización" },
    pt: { seo: "SEO", geo: "GEO · busca com IA", schema: "Dados estruturados", a11y: "Acessibilidade", security: "Verificações de segurança", performance: "Desempenho · Core Web Vitals", analytics: "Analytics e consentimento", i18n: "Internacionalização" },
    de: { seo: "SEO", geo: "GEO · KI-Suche", schema: "Strukturierte Daten", a11y: "Barrierefreiheit", security: "Sicherheitsprüfungen", performance: "Performance · Core Web Vitals", analytics: "Analytics und Einwilligung", i18n: "Internationalisierung" },
    fr: { seo: "SEO", geo: "GEO · recherche IA", schema: "Données structurées", a11y: "Accessibilité", security: "Contrôles de sécurité", performance: "Performance · Core Web Vitals", analytics: "Analytics et consentement", i18n: "Internationalisation" },
    it: { seo: "SEO", geo: "GEO · ricerca IA", schema: "Dati strutturati", a11y: "Accessibilità", security: "Controlli di sicurezza", performance: "Prestazioni · Core Web Vitals", analytics: "Analytics e consenso", i18n: "Internazionalizzazione" }
  };

  const ICONS = {
    prev: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 18l-6-6 6-6"/></svg>',
    next: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 18l6-6-6-6"/></svg>',
    pause: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/></svg>',
    play: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M7 5l12 7-12 7z"/></svg>',
    share: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="M8.6 13.5l6.8 4M15.4 6.5l-6.8 4"/></svg>',
    linkedin: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M4.98 3.5a2.5 2.5 0 11-.02 5 2.5 2.5 0 01.02-5zM3 9h4v12H3zM9 9h3.8v1.7h.05c.53-1 1.84-2.05 3.78-2.05C20.6 8.65 21 11 21 14v7h-4v-6.2c0-1.5-.03-3.4-2.07-3.4-2.08 0-2.4 1.62-2.4 3.3V21H9z"/></svg>',
    x: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M17.75 3h3.07l-6.7 7.66L22 21h-6.17l-4.83-6.32L5.47 21H2.4l7.17-8.2L2 3h6.33l4.37 5.78zm-1.08 16.2h1.7L7.4 4.7H5.58z"/></svg>',
    whatsapp: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2a10 10 0 00-8.6 15.1L2 22l5-1.3A10 10 0 1012 2zm0 18.2a8.2 8.2 0 01-4.2-1.15l-.3-.18-3 .78.8-2.9-.2-.3A8.2 8.2 0 1112 20.2zm4.5-6.1c-.25-.12-1.46-.72-1.69-.8-.23-.08-.39-.12-.55.12-.16.25-.63.8-.78.97-.14.16-.29.18-.53.06a6.7 6.7 0 01-3.33-2.9c-.25-.43.25-.4.72-1.33.08-.16.04-.3-.02-.42-.06-.12-.55-1.33-.76-1.82-.2-.48-.4-.41-.55-.42h-.47a.9.9 0 00-.65.3 2.73 2.73 0 00-.85 2.03 4.75 4.75 0 001 2.5 10.86 10.86 0 004.15 3.67c1.55.67 2.15.73 2.93.61.47-.07 1.46-.6 1.66-1.17.2-.58.2-1.07.14-1.17-.06-.1-.22-.16-.47-.28z"/></svg>',
    facebook: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M13.5 21v-7.5H16l.4-3h-2.9V8.6c0-.87.25-1.46 1.5-1.46h1.6V4.46A21.6 21.6 0 0014.27 4.3c-2.3 0-3.87 1.4-3.87 3.98v2.22H7.8v3h2.6V21z"/></svg>',
    email: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/></svg>',
    link: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10 13a5 5 0 007.07 0l3-3a5 5 0 00-7.07-7.07l-1.5 1.5"/><path d="M14 11a5 5 0 00-7.07 0l-3 3a5 5 0 007.07 7.07l1.5-1.5"/></svg>',
    close: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>'
  };
  const NETS = [["linkedin", "LinkedIn"], ["x", "X"], ["whatsapp", "WhatsApp"], ["facebook", "Facebook"], ["email", ""]];

  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
  const state = {
    lang: "en", index: null, all: [], list: [], active: 0, drag: 0, dragging: false,
    filters: { sector: "", scope: "", country: "", focus: "" },
    auto: !reduced.matches, hover: false, focusIn: false, visible: false,
    cw: 300, R: 600, step: 30, vis: 2.6, flat: reduced.matches,
    cache: new Map(), openId: "", opener: null, suppressUntil: 0, hub: false
  };
  const cards = new Map();
  const lastD = new Map();

  let stage, ring, empty, countEl, statusEl, playBtn, filtersEl, viewer, vbody, vmark, toastEl, printNote;

  function esc(value) {
    return String(value == null ? "" : value).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }
  function pickLang() {
    const code = String(document.documentElement.lang || "en").slice(0, 2).toLowerCase();
    return T[code] ? code : "en";
  }
  function t(key, vars) {
    let text = (T[state.lang] && T[state.lang][key]) || T.en[key] || key;
    if (vars) text = text.replace(/\{(\w+)\}/g, (all, k) => (vars[k] != null ? vars[k] : all));
    return text;
  }
  function nt() { return state.lang === "en" ? "" : ' translate="no"'; }
  function areaName(area, short) {
    const book = AREA_T[state.lang];
    if (!book) return short ? SHORT[area] : area;
    return (short ? book.short[area] || book.full[area] || SHORT[area] : book.full[area]) || area;
  }
  function sevName(sev) {
    return (SEV_T[state.lang] && SEV_T[state.lang][sev]) || sev;
  }
  function localTag(tag) {
    const book = TAG_T[state.lang];
    if (!book) return null;
    if (book.fixed[tag.t]) return book.fixed[tag.t];
    for (const [key, re] of TAG_RULES) {
      const m = re.exec(tag.t);
      if (!m) continue;
      let sector = "";
      if (key === "inSector" && state.index) {
        const k = Object.keys(state.index.sectors || {}).find((s) => state.index.sectors[s] === m[2]);
        if (!k) return null;
        sector = sectorLabel(k);
      }
      return book[key].replace(/\{(\d)\}/g, (all, i) => m[i]).replace("{area}", areaName(m[1])).replace("{sector}", sector);
    }
    return null;
  }
  function tagText(tag) {
    if (tag.g === "sector") return sectorLabel(tag.k);
    if (tag.g === "scope") return t(tag.k);
    if (tag.g === "focus") return focusLabel(tag.k);
    return localTag(tag) || tag.t;
  }
  function tagKeep(tag) {
    return state.lang !== "en" && (NAME_TAGS.has(tag.g) || ["sector", "scope", "focus"].includes(tag.g) || !!localTag(tag));
  }
  function headlineHtml(lines) {
    return (lines || []).map((line) => (line.em ? "<em>" + esc(line.t) + "</em>" : esc(line.t))).join(" ");
  }
  function sectorLabel(key) {
    const local = SECTOR_T[state.lang] && SECTOR_T[state.lang][key];
    return local || (state.index && state.index.sectors[key]) || key;
  }
  function focusLabel(key) {
    const local = FOCUS_T[state.lang] && FOCUS_T[state.lang][key];
    return local || (state.index && state.index.focus[key]) || key;
  }
  function countryName(code) {
    if (!code || code === "global") return t("global");
    try { return new Intl.DisplayNames([state.lang], { type: "region" }).of(code) || code; } catch (error) { return code; }
  }
  function flagOf(code) {
    if (!/^[A-Z]{2}$/.test(code || "")) return "🌐";
    return String.fromCodePoint(...[...code].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65));
  }
  function dateText(iso) {
    try { return new Intl.DateTimeFormat(state.lang, { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(iso + "T12:00:00Z")); } catch (error) { return iso; }
  }
  function color(score) {
    if (score >= 90) return "#6fe3b1";
    if (score >= 80) return "#7ef6fb";
    if (score >= 70) return "#e2c48a";
    if (score >= 60) return "#f2b37a";
    return "#f39a8b";
  }
  function monogram(name) {
    const words = String(name).replace(/[^\p{L}\p{N}\s.]/gu, " ").split(/\s+/).filter((w) => w && !STOP.has(w.toLowerCase()));
    if (!words.length) return "QA";
    if (words.length === 1) return words[0].replace(/\./g, "").slice(0, 2).toUpperCase();
    return (words[0][0] + words[1][0]).toUpperCase();
  }
  function ringSvg(score, size, stroke) {
    const r = (size - stroke) / 2;
    const c = 2 * Math.PI * r;
    const off = c * (1 - Math.max(0, Math.min(100, score)) / 100);
    return '<svg viewBox="0 0 ' + size + " " + size + '" aria-hidden="true"><circle cx="' + size / 2 + '" cy="' + size / 2 + '" r="' + r + '" stroke="rgba(255,255,255,.09)" stroke-width="' + stroke + '"/>' +
      '<circle cx="' + size / 2 + '" cy="' + size / 2 + '" r="' + r + '" stroke="' + color(score) + '" stroke-width="' + stroke + '" stroke-linecap="round" stroke-dasharray="' + c.toFixed(2) + '" stroke-dashoffset="' + off.toFixed(2) + '"/></svg>';
  }
  function track(name, label) {
    if (window.SiteAnalytics) SiteAnalytics.trackEvent(name, "URL Review", String(label || "").slice(0, 80));
  }
  function trackOnce(key, name, label) {
    if (window.SiteAnalytics && SiteAnalytics.once) SiteAnalytics.once(key, name, "URL Review", label);
  }

  /* ---------- carousel ---------- */

  function chip(text, cls, extra) {
    return '<li class="lchip ' + (cls || "") + '"' + (extra || "") + ">" + esc(text) + "</li>";
  }
  function cardChips(r) {
    const out = [chip(r.flag + " " + (r.city || countryName(r.country)), "", nt())];
    if (r.sector) out.push(chip(sectorLabel(r.sector), "t-sector", nt()));
    const rank = r.tags.find((x) => x.g === "rank");
    if (rank) out.push(chip(tagText(rank), "t-rank", tagKeep(rank) ? nt() : ""));
    r.tags.filter((x) => x.g === "badge").slice(0, rank ? 2 : 3).forEach((b) => out.push(chip(tagText(b), "t-" + b.tone, tagKeep(b) ? nt() : "")));
    return out.join("");
  }
  function cardHtml(r) {
    const head = headlineHtml(r.headline);
    const areas = AREAS.map((a) => '<li><span' + nt() + ">" + esc(areaName(a, true)) + '</span><i><u style="width:' + r.areas[a] + "%;background:" + color(r.areas[a]) + '"></u></i><b>' + r.areas[a] + "</b></li>").join("");
    return '<div class="lc-top"><span class="lc-mono notranslate" translate="no" aria-hidden="true">' + esc(monogram(r.name)) + '</span><div class="lc-id"><b class="lc-name notranslate" translate="no">' + esc(r.name) + '</b><span class="lc-host notranslate">' + esc(r.host) + '</span></div><span class="lc-scope s-' + r.scope.toLowerCase() + '"' + nt() + ">" + esc(t(r.scope.toLowerCase())) + "</span></div>" +
      '<p class="lc-headline">' + head + "</p>" +
      '<div class="lc-score"><div class="lc-ring">' + ringSvg(r.overall, 92, 8) + '<b class="notranslate" translate="no">' + r.overall + "<small>" + esc(r.grade) + '</small></b></div><ul class="lc-areas">' + areas + "</ul></div>" +
      '<ul class="lc-tags">' + cardChips(r) + "</ul>" +
      '<div class="lc-foot"><span' + nt() + ">" + esc(t("read", { date: dateText(r.read) })) + " · " + esc(t(r.pages === 1 ? "page" : "pages", { n: r.pages })) + '</span><button class="lc-open" type="button" tabindex="-1"' + nt() + ">" + esc(t("open")) + " →</button></div>";
  }

  function buildShell() {
    section.querySelector("[data-live-title]").innerHTML = esc(t("title")) + " <em>" + esc(t("titleEm")) + "</em>";
    section.querySelector("[data-live-eyebrow]").textContent = t("eyebrow");
    section.querySelector("[data-live-lede]").innerHTML = t("lede", { n: state.all.length || "100+" });
    section.querySelectorAll("[data-live-title], [data-live-eyebrow], [data-live-lede]").forEach((el) => {
      if (state.lang === "en") el.removeAttribute("translate"); else el.setAttribute("translate", "no");
    });
    const back = document.getElementById("live-back");
    if (back) { back.textContent = t("back"); if (state.lang !== "en") back.setAttribute("translate", "no"); }
    const gateBtn = document.getElementById("live-open-gate");
    if (gateBtn) {
      gateBtn.textContent = t("explore", { n: state.all.length || "" }).replace(/\s+/g, " ");
      if (state.lang !== "en") gateBtn.setAttribute("translate", "no");
    }
    const gateLine = document.getElementById("live-gate-copy");
    if (gateLine) { gateLine.textContent = t("gateLine"); if (state.lang !== "en") gateLine.setAttribute("translate", "no"); }
    stage.setAttribute("aria-label", t("carousel"));
    section.querySelector(".live-prev").setAttribute("aria-label", t("prev"));
    section.querySelector(".live-next").setAttribute("aria-label", t("next"));
    section.querySelector(".live-hint").textContent = t("hint");
    paintPlay();
  }

  function paintPlay() {
    if (!playBtn) return;
    playBtn.hidden = state.flat;
    playBtn.innerHTML = state.auto ? ICONS.pause : ICONS.play;
    playBtn.setAttribute("aria-label", state.auto ? t("pause") : t("play"));
    playBtn.setAttribute("aria-pressed", state.auto ? "false" : "true");
  }

  function buildCards() {
    ring.innerHTML = "";
    cards.clear();
    lastD.clear();
    state.all.forEach((r) => {
      const el = document.createElement("article");
      el.className = "live-card";
      el.dataset.id = r.id;
      el.setAttribute("role", "group");
      el.setAttribute("aria-roledescription", "slide");
      el.style.setProperty("--h", HUES[r.sector] || 186);
      el.innerHTML = cardHtml(r);
      ring.appendChild(el);
      cards.set(r.id, el);
    });
  }

  const GROUPS = [
    ["sector", (r) => r.sector],
    ["scope", (r) => r.scope.toLowerCase()],
    ["country", (r) => r.country || "global"],
    ["focus", (r) => r.focus || []]
  ];
  function matches(r, skip) {
    return GROUPS.every(([g, fn]) => g === skip || !state.filters[g] || [].concat(fn(r)).includes(state.filters[g]));
  }
  function valueLabel(group, value) {
    if (group === "sector") return sectorLabel(value);
    if (group === "scope") return t(value);
    if (group === "country") return flagOf(value === "global" ? "" : value) + " " + countryName(value);
    if (group === "focus") return focusLabel(value);
    return value;
  }
  function renderFilters() {
    filtersEl.innerHTML = GROUPS.map(([group, fn]) => {
      const totals = new Map();
      state.all.forEach((r) => [].concat(fn(r)).filter(Boolean).forEach((v) => totals.set(v, (totals.get(v) || 0) + 1)));
      let values = [...totals.keys()];
      if (group === "scope") values = ["worldwide", "national", "regional", "local"].filter((v) => totals.has(v));
      else values.sort((a, b) => totals.get(b) - totals.get(a) || String(valueLabel(group, a)).localeCompare(valueLabel(group, b)));
      const live = new Map();
      state.all.forEach((r) => { if (matches(r, group)) [].concat(fn(r)).filter(Boolean).forEach((v) => live.set(v, (live.get(v) || 0) + 1)); });
      const allCount = state.all.filter((r) => matches(r, group)).length;
      const buttons = ['<button type="button" data-g="' + group + '" data-v="" aria-pressed="' + (!state.filters[group]) + '"' + nt() + ">" + esc(t("all")) + "<small>" + allCount + "</small></button>"]
        .concat(values.map((v) => {
          const n = live.get(v) || 0;
          const on = state.filters[group] === v;
          return '<button type="button" data-g="' + group + '" data-v="' + esc(v) + '" aria-pressed="' + on + '"' + (n || on ? "" : " disabled") + nt() + ">" + esc(valueLabel(group, v)) + "<small>" + n + "</small></button>";
        }));
      const options = ['<option value=""' + (state.filters[group] ? "" : " selected") + ">" + esc(t("all")) + " (" + allCount + ")</option>"]
        .concat(values.map((v) => {
          const n = live.get(v) || 0;
          const on = state.filters[group] === v;
          return '<option value="' + esc(v) + '"' + (on ? " selected" : "") + (n || on ? "" : " disabled") + ">" + esc(valueLabel(group, v)) + " (" + n + ")</option>";
        }));
      const id = "live-f-" + group;
      return '<div class="live-frow" role="group" aria-label="' + esc(t(group)) + '"><label class="live-flabel" for="' + id + '"' + nt() + ">" + esc(t(group)) + "</label>" +
        '<div class="live-chips">' + buttons.join("") + "</div>" +
        '<select class="live-fselect" id="' + id + '" data-g="' + group + '"' + (state.filters[group] ? ' data-on=""' : "") + nt() + ">" + options.join("") + "</select></div>";
    }).join("");
  }
  function chooseFilter(group, value, method) {
    state.filters[group] = value;
    track("qa_review_live_filter", group + ":" + (value || "all") + (method ? ":" + method : ""));
    stopAuto();
    applyFilters();
  }

  function applyFilters(keepId) {
    const before = state.list[state.active] && state.list[state.active].id;
    state.list = state.all.filter((r) => matches(r));
    const target = keepId || before;
    const at = state.list.findIndex((r) => r.id === target);
    state.active = at >= 0 ? at : 0;
    state.all.forEach((r) => {
      const el = cards.get(r.id);
      const shown = state.list.includes(r);
      if (el.hidden === shown) lastD.delete(r.id);
      el.hidden = !shown;
      if (!shown) el.classList.remove("is-active");
    });
    empty.hidden = state.list.length > 0;
    renderFilters();
    layout();
    announce();
  }

  function geometry() {
    const width = stage.clientWidth || window.innerWidth;
    const probe = getComputedStyle(section).getPropertyValue("--cw");
    state.cw = parseFloat(probe) || 300;
    state.step = width < 520 ? 34 : 30;
    const gap = width < 520 ? 10 : 22;
    state.R = Math.round((state.cw / 2 + gap) / Math.tan((state.step / 2) * Math.PI / 180));
    state.vis = width < 520 ? 1.6 : width < 980 ? 2.2 : 2.7;
  }

  function wrap(d, n) {
    if (n <= 1) return d;
    while (d > n / 2) d -= n;
    while (d < -n / 2) d += n;
    return d;
  }

  function layout() {
    const n = state.list.length;
    state.list.forEach((r, i) => {
      const el = cards.get(r.id);
      const btn = el.querySelector(".lc-open");
      const d = wrap(i - state.active + state.drag, n);
      const ad = Math.abs(d);
      const front = ad < 0.5;
      el.classList.toggle("is-active", front);
      el.setAttribute("aria-label", t("slide", { i: i + 1, n, name: r.name }));
      el.setAttribute("aria-hidden", state.flat || front ? "false" : "true");
      btn.tabIndex = state.flat || front ? 0 : -1;
      if (state.flat) {
        el.style.transform = "";
        el.style.opacity = "";
        el.style.visibility = "";
        return;
      }
      const prev = lastD.get(r.id);
      const jump = prev == null || Math.abs(prev - d) > 1.5;
      lastD.set(r.id, d);
      el.style.transition = jump || state.dragging ? "none" : "";
      el.style.transform = "rotateY(" + (d * state.step).toFixed(2) + "deg) translateZ(" + state.R + "px)";
      const shown = ad <= state.vis;
      el.style.opacity = shown ? String(Math.max(0, 1 - ad * 0.26).toFixed(3)) : "0";
      el.style.setProperty("--shade", Math.min(0.72, ad * 0.32).toFixed(2));
      el.style.visibility = ad <= state.vis + 1 ? "visible" : "hidden";
      el.style.pointerEvents = shown ? "" : "none";
    });
    ring.style.transform = state.flat ? "" : "translateZ(" + -state.R + "px)";
    countEl.innerHTML = n ? "<b>" + (state.active + 1) + "</b> / " + n : "0 / 0";
  }

  function announce() {
    const r = state.list[state.active];
    statusEl.setAttribute("aria-live", state.auto && state.visible ? "off" : "polite");
    statusEl.textContent = r ? t("status", { i: state.active + 1, n: state.list.length, name: r.name, score: r.overall, grade: r.grade }) : t("none");
  }

  function goTo(i, method) {
    const n = state.list.length;
    if (!n) return;
    state.active = ((i % n) + n) % n;
    if (method) {
      if (method !== "auto") stopAuto();
      trackOnce("live-nav-" + method, "qa_review_live_nav", method);
    }
    layout();
    announce();
    if (state.flat) {
      const el = cards.get(state.list[state.active].id);
      if (el && method && method !== "auto") el.scrollIntoView({ block: "nearest", inline: "center" });
    }
  }

  function focusActive() {
    const r = state.list[state.active];
    const el = r && cards.get(r.id);
    if (el) el.querySelector(".lc-open").focus({ preventScroll: true });
  }

  function stopAuto() {
    if (!state.auto) return;
    state.auto = false;
    paintPlay();
  }

  function canAuto() {
    return state.auto && !state.flat && !state.hover && !state.focusIn && !state.dragging && state.visible &&
      viewer.hidden && document.visibilityState === "visible" && state.list.length > 1;
  }

  function bindCarousel() {
    section.querySelector(".live-prev").addEventListener("click", () => goTo(state.active - 1, "button"));
    section.querySelector(".live-next").addEventListener("click", () => goTo(state.active + 1, "button"));
    playBtn.addEventListener("click", () => {
      state.auto = !state.auto;
      paintPlay();
      announce();
    });
    filtersEl.addEventListener("click", (event) => {
      const button = event.target.closest("button[data-g]");
      if (!button || button.disabled) return;
      const group = button.dataset.g;
      const value = button.dataset.v;
      chooseFilter(group, state.filters[group] === value ? "" : value);
    });
    filtersEl.addEventListener("change", (event) => {
      const select = event.target.closest("select[data-g]");
      if (!select) return;
      const group = select.dataset.g;
      chooseFilter(group, select.value, "select");
      const again = filtersEl.querySelector('select[data-g="' + group + '"]');
      if (again) again.focus({ preventScroll: true });
    });
    empty.querySelector("button").addEventListener("click", () => {
      Object.keys(state.filters).forEach((k) => { state.filters[k] = ""; });
      applyFilters();
    });

    stage.addEventListener("click", (event) => {
      if (Date.now() < state.suppressUntil) { event.preventDefault(); return; }
      const card = event.target.closest(".live-card");
      if (!card) return;
      const i = state.list.findIndex((r) => r.id === card.dataset.id);
      if (i < 0) return;
      if (state.flat || i === state.active) openReport(card.dataset.id, card.querySelector(".lc-open"), "card");
      else goTo(i, "card");
    });

    let startX = 0;
    let startY = 0;
    let pointer = null;
    stage.addEventListener("pointerdown", (event) => {
      if (state.flat || (event.pointerType === "mouse" && event.button !== 0)) return;
      pointer = event.pointerId;
      startX = event.clientX;
      startY = event.clientY;
    });
    stage.addEventListener("pointermove", (event) => {
      if (pointer !== event.pointerId) return;
      const dx = event.clientX - startX;
      if (!state.dragging) {
        if (Math.abs(dx) < 8 || Math.abs(dx) < Math.abs(event.clientY - startY)) return;
        state.dragging = true;
        stage.classList.add("is-dragging");
        try { stage.setPointerCapture(event.pointerId); } catch (error) { /* capture is optional */ }
        stopAuto();
      }
      state.drag = dx / (state.cw * 0.85);
      layout();
    });
    const endDrag = (event) => {
      if (pointer !== event.pointerId) return;
      pointer = null;
      if (!state.dragging) return;
      const shift = Math.round(state.drag);
      state.dragging = false;
      state.drag = 0;
      stage.classList.remove("is-dragging");
      state.suppressUntil = Date.now() + 350;
      goTo(state.active - shift, event.pointerType === "touch" ? "swipe" : "drag");
    };
    stage.addEventListener("pointerup", endDrag);
    stage.addEventListener("pointercancel", endDrag);
    stage.addEventListener("dragstart", (event) => event.preventDefault());

    let wheelSum = 0;
    let wheelAt = 0;
    stage.addEventListener("wheel", (event) => {
      if (state.flat || Math.abs(event.deltaX) <= Math.abs(event.deltaY)) return;
      event.preventDefault();
      const now = Date.now();
      if (now - wheelAt < 380) return;
      wheelSum += event.deltaX;
      if (Math.abs(wheelSum) > 50) {
        goTo(state.active + (wheelSum > 0 ? 1 : -1), "wheel");
        wheelSum = 0;
        wheelAt = now;
      }
    }, { passive: false });

    section.addEventListener("keydown", (event) => {
      if (!event.target.closest(".live-stage, .live-controls")) return;
      const keys = { ArrowLeft: -1, ArrowRight: 1 };
      let next = null;
      if (keys[event.key]) next = state.active + keys[event.key];
      else if (event.key === "Home") next = 0;
      else if (event.key === "End") next = state.list.length - 1;
      if (next == null) return;
      event.preventDefault();
      const inCard = !!event.target.closest(".live-card");
      goTo(next, "key");
      if (inCard || event.target === stage) focusActive();
    });

    stage.addEventListener("pointerenter", (event) => { if (event.pointerType === "mouse") state.hover = true; });
    stage.addEventListener("pointerleave", () => { state.hover = false; });
    section.addEventListener("focusin", () => { state.focusIn = true; });
    section.addEventListener("focusout", (event) => { if (!section.contains(event.relatedTarget)) state.focusIn = false; });

    if ("IntersectionObserver" in window) {
      new IntersectionObserver((entries) => {
        state.visible = entries.some((e) => e.isIntersecting);
        announce();
      }, { threshold: 0.35 }).observe(stage);
    } else {
      state.visible = true;
    }
    window.setInterval(() => { if (canAuto()) goTo(state.active + 1, "auto"); }, 5200);

    const relayout = () => { geometry(); lastD.clear(); layout(); };
    if ("ResizeObserver" in window) new ResizeObserver(relayout).observe(stage);
    else window.addEventListener("resize", relayout);

    const motion = () => {
      state.flat = reduced.matches;
      stage.classList.toggle("is-flat", state.flat);
      if (state.flat) state.auto = false;
      paintPlay();
      relayout();
    };
    if (reduced.addEventListener) reduced.addEventListener("change", motion);
    motion();
  }

  /* ---------- dock over the disclaimers ---------- */

  function dock() {
    section.classList.add("is-docked");
    document.body.style.overflow = "hidden";
    geometry();
    lastD.clear();
    layout();
    section.scrollTop = 0;
    const first = [...filtersEl.querySelectorAll("button, select")].find((el) => el.offsetParent !== null);
    if (first) first.focus({ preventScroll: true });
  }
  function undock() {
    if (!section.classList.contains("is-docked")) return;
    section.classList.remove("is-docked");
    document.body.style.overflow = "";
    if (location.hash === "#live-reports") history.replaceState(history.state, "", location.pathname + location.search);
    const gateBtn = document.getElementById("live-open-gate");
    if (gateBtn) gateBtn.focus({ preventScroll: true });
  }

  /* ---------- viewer ---------- */

  function buildViewer() {
    viewer = document.createElement("div");
    viewer.className = "live-viewer";
    viewer.id = "live-viewer";
    viewer.hidden = true;
    viewer.setAttribute("role", "dialog");
    viewer.setAttribute("aria-modal", "true");
    viewer.setAttribute("aria-labelledby", "lv-name");
    viewer.innerHTML = '<div class="lv-panel" tabindex="-1"><div class="lv-mark" aria-hidden="true"></div>' +
      '<header class="lv-bar"><div class="lv-brand"><img src="assets/qa-review-mark.svg?v=20261013c" alt="" width="28" height="28"><span class="lv-brand-text"></span></div><div class="lv-actions"></div></header>' +
      '<div class="lv-body"></div></div>';
    document.body.appendChild(viewer);
    vbody = viewer.querySelector(".lv-body");
    vmark = viewer.querySelector(".lv-mark");
    toastEl = document.createElement("div");
    toastEl.className = "lv-toast";
    toastEl.setAttribute("role", "status");
    document.body.appendChild(toastEl);
    printNote = document.createElement("div");
    printNote.className = "lv-print-note";
    document.body.appendChild(printNote);

    viewer.addEventListener("click", (event) => {
      if (event.target === viewer) { closeReport(); return; }
      const action = event.target.closest("[data-act]");
      if (!action) return;
      const act = action.dataset.act;
      if (act === "close") closeReport();
      else if (act === "hub") { event.preventDefault(); closeReport(); }
      else if (act === "copy") copyLink();
      else if (act === "native") nativeShare();
      else if (act === "own") reviewOwn();
      else if (act === "net") shareTo(action.dataset.net);
    });
    ["contextmenu", "copy", "cut", "dragstart", "selectstart"].forEach((type) => {
      viewer.addEventListener(type, (event) => {
        if (event.target.closest && event.target.closest(".lv-copybox")) return;
        event.preventDefault();
        if (type === "contextmenu" || type === "copy") toast(t("blocked"));
      });
    });
    document.addEventListener("keydown", (event) => {
      if (viewer.hidden) {
        if (event.key === "Escape" && section.classList.contains("is-docked")) undock();
        return;
      }
      const key = String(event.key || "").toLowerCase();
      if ((event.ctrlKey || event.metaKey) && ["p", "s", "c", "a", "x"].includes(key) && !(event.target.closest && event.target.closest(".lv-copybox"))) {
        event.preventDefault();
        event.stopPropagation();
        toast(t("blocked"));
        return;
      }
      if (event.metaKey && event.shiftKey && ["3", "4", "5"].includes(key)) toast(t("shot"));
      if (event.key === "Escape") { event.preventDefault(); closeReport(); return; }
      if (event.key === "Tab") trapFocus(event);
    }, true);
    document.addEventListener("keyup", (event) => {
      if (!viewer.hidden && event.key === "PrintScreen") toast(t("shot"));
    });
    window.addEventListener("beforeprint", () => {
      if (!viewer.hidden) paintPrintNote();
    });
  }

  function trapFocus(event) {
    const items = [...viewer.querySelectorAll("button, a[href], input, [tabindex]:not([tabindex='-1'])")].filter((el) => el.offsetParent !== null || el === document.activeElement);
    if (!items.length) return;
    const first = items[0];
    const last = items[items.length - 1];
    if (event.shiftKey && (document.activeElement === first || !viewer.contains(document.activeElement))) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  }

  let toastTimer = 0;
  function toast(text) {
    toastEl.textContent = text;
    toastEl.classList.add("on");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove("on"), 2600);
  }

  function shareBase() {
    const canonical = document.querySelector('link[rel="canonical"]');
    try { return new URL(canonical ? canonical.href : location.href).origin + new URL(canonical ? canonical.href : location.href).pathname; } catch (error) { return location.origin + location.pathname; }
  }
  function shareUrl(net, id) {
    const key = id || state.openId;
    return shareBase() + "?live=" + encodeURIComponent(key) + "&utm_source=" + encodeURIComponent(net) + "&utm_medium=share&utm_campaign=live-reports&utm_content=" + encodeURIComponent(key);
  }
  function shareText() {
    const r = state.all.find((x) => x.id === state.openId);
    if (!r) return t("brand");
    return t("shareLine", { name: r.name, score: r.overall, grade: r.grade }) + ": " + AREAS.map((a) => areaName(a, true) + " " + r.areas[a]).join(" · ");
  }
  function shareTo(net) {
    const url = shareUrl(net);
    const text = shareText();
    const targets = {
      linkedin: "https://www.linkedin.com/sharing/share-offsite/?url=" + encodeURIComponent(url),
      x: "https://twitter.com/intent/tweet?url=" + encodeURIComponent(url) + "&text=" + encodeURIComponent(text),
      whatsapp: "https://wa.me/?text=" + encodeURIComponent(text + " " + url),
      facebook: "https://www.facebook.com/sharer/sharer.php?u=" + encodeURIComponent(url),
      email: "mailto:?subject=" + encodeURIComponent(text.split(":")[0]) + "&body=" + encodeURIComponent(text + "\n\n" + url)
    };
    track("qa_review_share", "live:" + net + ":" + state.openId);
    if (net === "email") { location.href = targets.email; return; }
    window.open(targets[net], "_blank", "noopener,noreferrer");
  }
  function nativeShare() {
    if (!navigator.share) { copyLink(); return; }
    track("qa_review_share", "live:native:" + state.openId);
    navigator.share({ title: "QA-lab URL Review · Live report", text: shareText(), url: shareUrl("native") }).catch(() => {});
  }
  async function copyLink() {
    const url = shareUrl("copy");
    track("qa_review_share", "live:copy:" + state.openId);
    try {
      await navigator.clipboard.writeText(url);
      toast(t("copied"));
    } catch (error) {
      const box = viewer.querySelector(".lv-copybox");
      if (!box) return;
      box.classList.add("on");
      const input = box.querySelector("input");
      input.value = url;
      input.focus();
      input.select();
    }
  }
  function reviewOwn() {
    closeReport();
    undock();
    const gate = document.getElementById("gate");
    if (gate && !gate.hidden) {
      const form = document.getElementById("terms-form");
      if (form) form.scrollIntoView({ block: "start" });
      const all = document.getElementById("terms-all");
      if (all) all.focus({ preventScroll: true });
      return;
    }
    const intake = document.getElementById("intake");
    if (intake) intake.scrollIntoView({ block: "start" });
    const name = document.getElementById("name");
    if (name) name.focus({ preventScroll: true });
  }

  function setUrl(id) {
    try {
      const url = new URL(location.href);
      if (id) url.searchParams.set("live", id); else url.searchParams.delete("live");
      if (/^#live=/.test(url.hash)) url.hash = "";
      history.replaceState(history.state, "", url.pathname + url.search + url.hash);
    } catch (error) { /* the address bar keeps its value */ }
  }

  function watermark(id) {
    const line = "QA-lab · carlosandmunoz.com · live report · " + id + " · view only";
    const svg = "<svg xmlns='http://www.w3.org/2000/svg' width='460' height='200'><text x='14' y='110' fill='rgba(126,246,251,0.075)' font-size='13' font-family='Inter, sans-serif' font-weight='600' transform='rotate(-20 230 100)'>" + line + "</text></svg>";
    vmark.style.backgroundImage = 'url("data:image/svg+xml;utf8,' + encodeURIComponent(svg) + '")';
  }

  function paintActions() {
    const brand = viewer.querySelector(".lv-brand-text");
    brand.textContent = t("brand");
    if (state.lang !== "en") brand.setAttribute("translate", "no"); else brand.removeAttribute("translate");
    const actions = viewer.querySelector(".lv-actions");
    const native = navigator.share ? '<button class="lv-btn primary" type="button" data-act="native"' + nt() + ">" + ICONS.share + "<span>" + esc(t("share")) + "</span></button>" : "";
    const nets = NETS.map(([net, label]) => {
      const name = label || t("email");
      return '<button class="lv-btn icon" type="button" data-act="net" data-net="' + net + '" aria-label="' + esc(t("shareOn", { net: name })) + '" title="' + esc(t("shareOn", { net: name })) + '">' + ICONS[net] + "</button>";
    }).join("");
    const hub = state.hub ? '<a class="lv-btn" data-act="hub" href="' + hubUrl() + '"' + nt() + ">" + ICONS.prev + "<span>" + esc(t("hub")) + "</span></a>" : "";
    actions.innerHTML = hub + native + nets +
      '<button class="lv-btn" type="button" data-act="copy"' + nt() + ">" + ICONS.link + "<span>" + esc(t("copy")) + "</span></button>" +
      '<button class="lv-btn icon close" type="button" data-act="close" aria-label="' + esc(t("close")) + '">' + ICONS.close + "</button>";
  }

  function paintPrintNote() {
    printNote.innerHTML = "<b>" + esc(t("printNote")) + "</b>" + esc(t("printLink")) + " " + esc(shareUrl("print"));
  }

  async function load(id) {
    if (state.cache.has(id)) return state.cache.get(id);
    const res = await fetch(BASE + encodeURIComponent(id) + ".json", { cache: "no-cache" });
    if (!res.ok) throw new Error("status " + res.status);
    const body = await res.json();
    state.cache.set(id, body);
    return body;
  }

  async function openReport(id, opener, source) {
    const card = state.all.find((r) => r.id === id);
    if (!card) return;
    state.openId = id;
    state.opener = opener || document.activeElement;
    stopAuto();
    paintActions();
    watermark(id);
    paintPrintNote();
    vbody.innerHTML = '<p class="lv-loading"' + nt() + ">" + esc(t("loading")) + "</p>";
    viewer.hidden = false;
    document.body.classList.add("live-viewing");
    viewer.scrollTop = 0;
    viewer.querySelector(".lv-panel").focus({ preventScroll: true });
    setUrl(id);
    track("qa_review_live_open", id + ":" + (source || "card"));
    try {
      const detail = await load(id);
      if (state.openId !== id) return;
      vbody.innerHTML = viewerHtml(detail);
      const close = viewer.querySelector('[data-act="close"]');
      if (close) close.focus({ preventScroll: true });
    } catch (error) {
      vbody.innerHTML = '<p class="lv-loading"' + nt() + ">" + esc(t("openFail")) + "</p>";
    }
  }

  function closeReport() {
    if (viewer.hidden) return;
    viewer.hidden = true;
    document.body.classList.remove("live-viewing");
    state.openId = "";
    setUrl("");
    const back = state.opener;
    state.opener = null;
    if (state.hub) { backToHub(); return; }
    if (back && document.contains(back) && back.focus) back.focus({ preventScroll: true });
  }

  function hubUrl() {
    const match = location.pathname.match(/qa-review(-[a-z]{2})?(?:\.html)?$/);
    return "qa-review-social" + (match && match[1] ? match[1] : "") + ".html";
  }
  // Going back keeps the hub's filters, "Show more" and scroll. The referrer can be qa-review.html when it
  // replaced itself with a language page; a report opened in a new tab has no hub behind it.
  function backToHub() {
    state.hub = false;
    let ref = null;
    try { ref = new URL(document.referrer); } catch (error) { /* no referrer */ }
    if (ref && ref.origin === location.origin && history.length > 1) history.back();
    else location.href = hubUrl();
  }

  function ms(value) { return value >= 1000 ? (value / 1000).toFixed(1) + " s" : Math.round(value) + " ms"; }
  function catClass(cat) { return cat === "FAST" ? "c-good" : cat === "AVERAGE" ? "c-mid" : cat === "SLOW" ? "c-bad" : ""; }
  function catText(cat) { return cat === "FAST" ? t("good") : cat === "AVERAGE" ? t("needsWork") : cat === "SLOW" ? t("poor") : "—"; }
  function kv(label, value, cls, style) {
    return '<div class="lv-kv"' + nt() + "><span>" + esc(label) + '</span><b' + (cls ? ' class="' + cls + '"' : "") + (style ? ' style="' + style + '"' : "") + ">" + value + "</b></div>";
  }

  function viewerHtml(d) {
    const avg = (state.index && state.index.averages && state.index.averages.areas) || {};
    const head = headlineHtml(d.headline);
    const place = d.flag + " " + (d.city ? esc(d.city) + ", " : "") + esc(countryName(d.country));
    const rank = d.rank ? '<p class="lv-rank"' + nt() + ">" + t("rank", { r: d.rank.overall.rank, n: d.rank.overall.of }) +
      (d.sector && d.rank.sector.of > 1 ? "<br>" + t("rankSector", { r: d.rank.sector.rank, n: d.rank.sector.of, sector: esc(sectorLabel(d.sector)) }) : "") + "</p>" : "";

    const areas = AREAS.map((a) => {
      const s = d.score.areas[a];
      const mean = avg[a];
      return '<div class="lv-area"' + nt() + '><div class="lv-area-top"><span>' + esc(areaName(a)) + "</span><b>" + s.score + '</b></div><i><u style="width:' + s.score + "%;background:" + color(s.score) + '"></u>' +
        (mean ? '<s style="left:' + mean + '%" title="' + esc(t("average", { n: mean })) + '"></s>' : "") + "</i><small>" + esc(t("areaLine", { fail: s.fail, risk: s.risk, pass: s.pass })) + "</small></div>";
    }).join("");

    const fix = (d.fix || []).map((f) => '<li><strong><span class="lv-sev sev-' + esc(f.severity) + '"' + nt() + ">" + esc(sevName(f.severity)) + '</span><span class="lv-area-tag"' + nt() + ">" + esc(areaName(f.area)) + "</span>" + esc(f.title) + "</strong>" +
      (f.evidence ? "<p>" + esc(f.evidence) + "</p>" : "") + (f.fix ? '<p class="fix">' + esc(f.fix) + (f.effort ? " <small>· " + esc(f.effort) + "</small>" : "") + "</p>" : "") + "</li>").join("");
    const works = (d.works || []).map((w) => "<li><span>" + esc(w.title) + "<small" + nt() + ">" + esc(areaName(w.area)) + "</small></span></li>").join("");

    const g = d.geo || {};
    const blocked = g.answersBlocked || [];
    const ai = kv(t("botsAllowed"), g.answersAllowed || 0, blocked.length ? "c-mid" : "c-good") +
      kv(t("botsBlocked"), blocked.length || esc(t("none0")), blocked.length ? "c-bad" : "") +
      (blocked.length ? '<div class="lv-chips lv-bots">' + blocked.map((b) => '<span class="lchip t-warn notranslate">' + esc(b) + "</span>").join("") + "</div>" : "") +
      kv(t("trainingOut"), g.trainingBlocked && g.trainingBlocked.length ? g.trainingBlocked.length : esc(t("none0"))) +
      kv("llms.txt", esc(g.llms ? t("published") : t("notFound")), g.llms ? "c-good" : "") +
      kv(t("noJs"), esc(g.jsOnly ? t("almostEmpty") : t("words", { n: g.words || 0 })), g.jsOnly ? "c-bad" : "c-good") +
      (g.schema && g.schema.length ? kv(t("schema"), esc(g.schema.slice(0, 4).join(", "))) : "");

    const sp = d.speed;
    let speed = kv("PageSpeed Insights", esc(t("notAvailable")));
    if (sp) {
      speed = kv(t("lhMobile"), sp.lighthouse + "/100", "", "color:" + color(sp.lighthouse));
      const f = sp.field;
      if (f && (f.lcp || f.inp || f.cls)) {
        if (f.lcp) speed += kv("LCP · " + t("p75"), ms(f.lcp.p75) + " · " + esc(catText(f.lcp.category)), catClass(f.lcp.category));
        if (f.inp) speed += kv("INP · " + t("p75"), ms(f.inp.p75) + " · " + esc(catText(f.inp.category)), catClass(f.inp.category));
        if (f.cls) speed += kv("CLS · " + t("p75"), f.cls.p75 + " · " + esc(catText(f.cls.category)), catClass(f.cls.category));
      } else {
        speed += kv(t("realVisitors"), esc(t("noField")));
      }
      if (sp.lab && sp.lab.lcp) speed += kv(t("labTiming"), ms(sp.lab.lcp) + " · " + ms(sp.lab.tbt || 0));
    }

    const sec = '<div class="lv-sec">' + (d.security || []).map((h) => '<span class="st-' + esc(h.state) + '" title="' + esc(t(h.state) || h.state) + '">' + esc(h.label) + "</span>").join("") + "</div>";

    const layers = Object.entries((d.coverage && d.coverage.layers) || {}).sort((a, b) => b[1] - a[1]).map(([k, v]) => '<span class="lchip">' + esc(k) + " · " + v + "</span>").join("");

    const groups = [
      ["gWho", ["sector", "org", "scope", "place", "region"]],
      ["gScore", ["grade", "band", "rank"]],
      ["gStand", ["badge"]],
      ["gTested", ["focus", "tests", "pages"]],
      ["gBuilt", ["hosting", "tech", "analytics", "consent", "lang"]]
    ];
    const tagLabel = (tag) => (tag.g === "place" ? place.replace(/&amp;/g, "&") : tagText(tag));
    const tagCls = (tag) => (tag.g === "rank" ? "t-rank" : tag.g === "sector" ? "t-sector" : tag.tone ? "t-" + tag.tone : "");
    const tags = groups.map(([label, list]) => {
      const items = (d.tags || []).filter((tag) => list.includes(tag.g));
      if (!items.length) return "";
      return '<div class="lv-tg"><span' + nt() + ">" + esc(t(label)) + '</span><div class="lv-chips">' + items.map((tag) => '<span class="lchip ' + tagCls(tag) + '"' + (tagKeep(tag) || tag.g === "place" ? nt() : "") + ">" + esc(tagLabel(tag)) + "</span>").join("") + "</div></div>";
    }).join("");

    return '<div class="lv-hero"><div>' +
      '<p class="lv-meta"><span class="lv-scope s-' + esc(d.scope.toLowerCase()) + '"' + nt() + ">" + esc(t(d.scope.toLowerCase())) + "</span><span" + nt() + ">" + place + "</span><span>·</span>" + (d.sector ? "<span" + nt() + ">" + esc(sectorLabel(d.sector)) + "</span><span>·</span>" : "") + "<span" + nt() + ">" + esc(t("read", { date: dateText(d.read) })) + " · " + esc(t(d.pages === 1 ? "page" : "pages", { n: d.pages })) + "</span></p>" +
      '<h2 class="lv-name notranslate" id="lv-name" translate="no">' + esc(d.name) + "</h2>" +
      '<p class="lv-host"><span class="notranslate">' + esc(d.host) + '</span><a href="' + esc(d.url) + '" target="_blank" rel="noopener noreferrer nofollow"' + nt() + ">" + esc(t("visit")) + " ↗</a></p>" +
      '<p class="lv-headline">' + head + "</p>" +
      (d.body ? '<p class="lv-body-text">' + esc(d.body) + "</p>" : "") +
      (d.lesson ? '<p class="lv-lesson"><b' + nt() + ">" + esc(t("hLesson")) + "</b>" + esc(d.lesson) + "</p>" : "") +
      '</div><div class="lv-scorebox"><div class="lv-ring">' + ringSvg(d.overall, 200, 14) + '<b class="notranslate" translate="no">' + d.overall + "<small>" + esc(t("gradeWord")) + " " + esc(d.grade) + "</small></b></div>" + rank + "</div></div>" +
      '<p class="lv-h"' + nt() + ">" + esc(t("hAreas")) + '</p><div class="lv-areas">' + areas + "</div>" +
      '<div class="lv-cols" style="margin-top:16px"><section class="lv-card"><h3 class="lv-h"' + nt() + ">" + esc(t("hFix")) + '</h3><ol class="lv-fix">' + fix + "</ol></section>" +
      '<section class="lv-card"><h3 class="lv-h"' + nt() + ">" + esc(t("hWorks")) + '</h3><ul class="lv-works">' + works + "</ul></section></div>" +
      '<div class="lv-tiles"><section class="lv-card"><h3 class="lv-h"' + nt() + ">" + esc(t("hAi")) + "</h3>" + ai + "</section>" +
      '<section class="lv-card"><h3 class="lv-h"' + nt() + ">" + esc(t("hSpeed")) + "</h3>" + speed + "</section>" +
      '<section class="lv-card"><h3 class="lv-h"' + nt() + ">" + esc(t("hSec")) + "</h3>" + sec + "</section></div>" +
      '<p class="lv-h"' + nt() + ">" + esc(t("hCoverage")) + " · " + ((d.coverage && d.coverage.cases) || 0) + '</p><div class="lv-chips">' + layers + "</div>" +
      '<p class="lv-h"' + nt() + ">" + esc(t("hTags")) + '</p><div class="lv-taggroups">' + tags + "</div>" +
      '<div class="lv-foot"><div><p class="lv-fair"' + nt() + ">" + esc(t("fair", { date: dateText(d.read) })) + '</p><p class="lv-note"' + nt() + ">" + esc(t("viewOnly")) + '</p><p class="lv-note"' + nt() + '><a href="mailto:qa@carlosandmunoz.com?subject=' + encodeURIComponent("Remove the live report for " + (d.host || d.name || "")) + '">' + esc(t("remove")) + '</a></p><div class="lv-copybox"><input type="text" readonly aria-label="' + esc(t("copy")) + '"></div></div>' +
      '<button class="live-cta" type="button" data-act="own"' + nt() + ">" + esc(t("own")) + "</button></div>";
  }

  /* ---------- boot ---------- */

  function mount() {
    const shell = section.querySelector("[data-live-app]");
    shell.innerHTML =
      '<div class="live-filters" id="live-filters"></div>' +
      '<div class="live-stage" id="live-stage" tabindex="0" role="region" aria-roledescription="carousel"><div class="live-ring"></div>' +
      '<p class="live-loading">' + esc(t("loading")) + '</p><div class="live-empty" hidden><p></p><button type="button"></button></div></div>' +
      '<div class="live-controls"><button class="live-nav live-prev" type="button">' + ICONS.prev + '</button><span class="live-count" aria-hidden="true"></span>' +
      '<button class="live-nav live-play" type="button"></button><button class="live-nav live-next" type="button">' + ICONS.next + "</button></div>" +
      '<p class="live-hint"></p><p class="live-status" role="status" aria-live="polite"></p>';
    stage = shell.querySelector(".live-stage");
    ring = shell.querySelector(".live-ring");
    empty = shell.querySelector(".live-empty");
    countEl = shell.querySelector(".live-count");
    statusEl = shell.querySelector(".live-status");
    playBtn = shell.querySelector(".live-play");
    filtersEl = shell.querySelector(".live-filters");
    const slot = section.querySelector("[data-live-filters]");
    if (slot) slot.appendChild(filtersEl);
  }

  function paintEmpty() {
    empty.querySelector("p").textContent = t("none");
    empty.querySelector("button").textContent = t("clear");
  }

  function relabel() {
    state.lang = pickLang();
    buildShell();
    paintEmpty();
    if (!state.all.length) return;
    state.all.forEach((r) => { cards.get(r.id).innerHTML = cardHtml(r); });
    renderFilters();
    layout();
    announce();
    if (!viewer.hidden && state.openId && state.cache.has(state.openId)) {
      paintActions();
      vbody.innerHTML = viewerHtml(state.cache.get(state.openId));
    }
  }

  function deepLink() {
    let id = new URLSearchParams(location.search).get("live");
    if (!id) {
      const match = location.hash.match(/^#live=([\w-]+)/);
      if (match) id = match[1];
    }
    if (!id) return;
    const at = state.list.findIndex((r) => r.id === id);
    if (at < 0) return;
    state.active = at;
    layout();
    announce();
    state.hub = new URLSearchParams(location.search).get("from") === "social";
    openReport(id, null, state.hub ? "social" : "link");
  }

  async function boot() {
    state.lang = pickLang();
    mount();
    buildViewer();
    buildShell();
    paintEmpty();
    const gateBtn = document.getElementById("live-open-gate");
    if (gateBtn) gateBtn.addEventListener("click", dock);
    const back = document.getElementById("live-back");
    if (back) back.addEventListener("click", undock);
    try {
      const res = await fetch(BASE + "index.json", { cache: "no-cache" });
      if (!res.ok) throw new Error("status " + res.status);
      state.index = await res.json();
      state.all = (state.index.reports || []).slice();
    } catch (error) {
      stage.querySelector(".live-loading").textContent = t("failed");
      return;
    }
    stage.querySelector(".live-loading").remove();
    buildShell();
    buildCards();
    geometry();
    bindCarousel();
    applyFilters();
    deepLink();
    const gated = () => { const gate = document.getElementById("gate"); return !!gate && !gate.hidden; };
    if (location.hash === "#live-reports" && gated()) dock();
    window.addEventListener("hashchange", () => {
      if (location.hash === "#live-reports") { if (gated()) dock(); return; }
      const match = location.hash.match(/^#live=([\w-]+)/);
      if (match && state.all.some((r) => r.id === match[1])) openReport(match[1], null, "link");
    });
    if (window.SiteI18n && SiteI18n.follow) SiteI18n.follow(() => relabel());
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
