(function () {
  "use strict";

  const section = document.getElementById("live-reports");
  if (!section) return;

  const BASE = "assets/live-reports/";
  const AREAS = ["SEO", "GEO", "Analytics", "Security", "Accessibility", "Performance"];
  const SHORT = { SEO: "SEO", GEO: "GEO", Analytics: "Analytics", Security: "Security", Accessibility: "A11y", Performance: "Speed" };
  const HUES = { government: 186, health: 160, media: 18, banking: 42, fintech: 280, transit: 140, opensource: 205, devdocs: 225, science: 255, highered: 330, education: 300, humanitarian: 0, international: 196, culture: 32, knowledge: 172, retail: 50, telecom: 268, energy: 58, travel: 120, airline: 210, insurance: 152, infrastructure: 24, standards: 240, sports: 100, apps: 12, rights: 350 };
  const STOP = new Set(["de", "del", "la", "el", "los", "las", "of", "the", "y", "and", "du", "da"]);

  const T = {
    en: {
      eyebrow: "Live reports", title: "Real sites. Real reads.", titleEm: "Open any of them.",
      lede: "<b>{n} public sites</b>, read by the same review anyone can run: government portals, newsrooms, banks, universities, open-source projects, and transit systems. Turn the ring, filter by sector or country, and open a report. View and share only.",
      explore: "Explore {n} live reports", gateLine: "Real reviews of public sites, from GOV.UK to Bogotá city hall. View and share only.",
      back: "Back", prev: "Previous report", next: "Next report", pause: "Pause rotation", play: "Play rotation", open: "Open report",
      carousel: "Live reports carousel", all: "All", sector: "Sector", scope: "Scope", country: "Country", focus: "Test focus",
      worldwide: "Worldwide", national: "National", local: "Local", global: "Global",
      status: "{i} of {n}: {name}, {score} out of 100, grade {grade}.", slide: "{i} of {n}: {name}",
      none: "No report matches these filters.", clear: "Clear filters", loading: "Loading live reports…", failed: "The live reports could not be loaded.",
      read: "Read {date}", page: "{n} page", pages: "{n} pages", hint: "Drag, swipe, or use the arrow keys. Select a card to open it.",
      close: "Close", share: "Share", copy: "Copy link", copied: "Link copied. It opens this report.", shareOn: "Share on {net}", email: "Email",
      viewOnly: "View only. This live report can be opened and shared, not downloaded, printed, or exported.",
      blocked: "View only. Share the link instead.", shot: "Screenshots cannot be blocked by a page. The watermark stays on the picture.",
      printNote: "Live reports are view-only and are not printed.", printLink: "Open or share it here:",
      fair: "One automated read of public pages on {date}. A starting point, not a verdict.", own: "Review your own site",
      rank: "<b>#{r}</b> of {n} in this series", rankSector: "<b>#{r}</b> of {n} in {sector}",
      hHeadline: "What the read found", hLesson: "The lesson", hAreas: "Six areas · gold tick is the series average", hFix: "Fix first", hWorks: "Already working",
      hAi: "AI crawlers", hSpeed: "Real-visitor speed", hSec: "Security headers", hCoverage: "Proposed coverage", hTags: "Tags",
      gWho: "Who", gScore: "How it scored", gStand: "Standouts", gTested: "Tested for", gBuilt: "Built with",
      openFail: "This report could not be opened.", visit: "Visit site"
    },
    es: {
      eyebrow: "Informes en vivo", title: "Sitios reales. Lecturas reales.", titleEm: "Abre cualquiera.",
      lede: "<b>{n} sitios públicos</b>, leídos por la misma revisión que cualquiera puede correr: portales de gobierno, medios, bancos, universidades, proyectos de código abierto y sistemas de transporte. Gira el anillo, filtra por sector o país y abre un informe. Solo ver y compartir.",
      explore: "Explorar {n} informes en vivo", gateLine: "Revisiones reales de sitios públicos, de GOV.UK a la Alcaldía de Bogotá. Solo ver y compartir.",
      back: "Volver", prev: "Informe anterior", next: "Informe siguiente", pause: "Pausar giro", play: "Reanudar giro", open: "Abrir informe",
      carousel: "Carrusel de informes en vivo", all: "Todos", sector: "Sector", scope: "Alcance", country: "País", focus: "Tipo de prueba",
      worldwide: "Mundial", national: "Nacional", local: "Local", global: "Global",
      status: "{i} de {n}: {name}, {score} de 100, nota {grade}.", slide: "{i} de {n}: {name}",
      none: "Ningún informe coincide con estos filtros.", clear: "Quitar filtros", loading: "Cargando informes en vivo…", failed: "No se pudieron cargar los informes en vivo.",
      read: "Leído el {date}", page: "{n} página", pages: "{n} páginas", hint: "Arrastra, desliza o usa las flechas. Elige una tarjeta para abrirla.",
      close: "Cerrar", share: "Compartir", copy: "Copiar enlace", copied: "Enlace copiado. Abre este informe.", shareOn: "Compartir en {net}", email: "Correo",
      viewOnly: "Solo lectura. Este informe en vivo se puede abrir y compartir, no descargar, imprimir ni exportar.",
      blocked: "Solo lectura. Comparte el enlace.", shot: "Una página no puede bloquear las capturas. La marca de agua queda en la imagen.",
      printNote: "Los informes en vivo son de solo lectura y no se imprimen.", printLink: "Ábrelo o compártelo aquí:",
      fair: "Una lectura automática de páginas públicas el {date}. Un punto de partida, no un veredicto.", own: "Revisa tu propio sitio",
      rank: "<b>#{r}</b> de {n} en esta serie", rankSector: "<b>#{r}</b> de {n} en {sector}",
      hHeadline: "Lo que encontró la lectura", hLesson: "La lección", hAreas: "Seis áreas · la marca dorada es el promedio de la serie", hFix: "Arreglar primero", hWorks: "Ya funciona",
      hAi: "Rastreadores de IA", hSpeed: "Velocidad para visitantes reales", hSec: "Cabeceras de seguridad", hCoverage: "Cobertura propuesta", hTags: "Etiquetas",
      gWho: "Quién", gScore: "Puntaje", gStand: "Destacados", gTested: "Probado en", gBuilt: "Hecho con",
      openFail: "No se pudo abrir este informe.", visit: "Visitar sitio"
    },
    pt: {
      eyebrow: "Relatórios ao vivo", title: "Sites reais. Leituras reais.", titleEm: "Abra qualquer um.",
      lede: "<b>{n} sites públicos</b>, lidos pela mesma revisão que qualquer pessoa pode rodar: portais de governo, redações, bancos, universidades, projetos de código aberto e sistemas de transporte. Gire o anel, filtre por setor ou país e abra um relatório. Só ver e compartilhar.",
      explore: "Explorar {n} relatórios ao vivo", gateLine: "Revisões reais de sites públicos, do GOV.UK à Prefeitura de Bogotá. Só ver e compartilhar.",
      back: "Voltar", prev: "Relatório anterior", next: "Próximo relatório", pause: "Pausar giro", play: "Retomar giro", open: "Abrir relatório",
      carousel: "Carrossel de relatórios ao vivo", all: "Todos", sector: "Setor", scope: "Alcance", country: "País", focus: "Tipo de teste",
      worldwide: "Mundial", national: "Nacional", local: "Local", global: "Global",
      status: "{i} de {n}: {name}, {score} de 100, nota {grade}.", slide: "{i} de {n}: {name}",
      none: "Nenhum relatório corresponde a estes filtros.", clear: "Limpar filtros", loading: "Carregando relatórios ao vivo…", failed: "Não foi possível carregar os relatórios ao vivo.",
      read: "Lido em {date}", page: "{n} página", pages: "{n} páginas", hint: "Arraste, deslize ou use as setas. Escolha um cartão para abri-lo.",
      close: "Fechar", share: "Compartilhar", copy: "Copiar link", copied: "Link copiado. Ele abre este relatório.", shareOn: "Compartilhar no {net}", email: "E-mail",
      viewOnly: "Só leitura. Este relatório ao vivo pode ser aberto e compartilhado, não baixado, impresso nem exportado.",
      blocked: "Só leitura. Compartilhe o link.", shot: "Uma página não consegue bloquear capturas de tela. A marca d’água fica na imagem.",
      printNote: "Relatórios ao vivo são só leitura e não são impressos.", printLink: "Abra ou compartilhe aqui:",
      fair: "Uma leitura automática de páginas públicas em {date}. Um ponto de partida, não um veredito.", own: "Revise o seu site",
      rank: "<b>#{r}</b> de {n} nesta série", rankSector: "<b>#{r}</b> de {n} em {sector}",
      hHeadline: "O que a leitura encontrou", hLesson: "A lição", hAreas: "Seis áreas · a marca dourada é a média da série", hFix: "Corrigir primeiro", hWorks: "Já funciona",
      hAi: "Rastreadores de IA", hSpeed: "Velocidade para visitantes reais", hSec: "Cabeçalhos de segurança", hCoverage: "Cobertura proposta", hTags: "Etiquetas",
      gWho: "Quem", gScore: "Pontuação", gStand: "Destaques", gTested: "Testado em", gBuilt: "Feito com",
      openFail: "Não foi possível abrir este relatório.", visit: "Visitar site"
    },
    de: {
      eyebrow: "Live-Berichte", title: "Echte Websites. Echte Prüfungen.", titleEm: "Öffnen Sie jede.",
      lede: "<b>{n} öffentliche Websites</b>, gelesen von derselben Prüfung, die jeder starten kann: Regierungsportale, Redaktionen, Banken, Universitäten, Open-Source-Projekte und Verkehrsbetriebe. Drehen Sie den Ring, filtern Sie nach Branche oder Land und öffnen Sie einen Bericht. Nur ansehen und teilen.",
      explore: "{n} Live-Berichte ansehen", gateLine: "Echte Prüfungen öffentlicher Websites, von GOV.UK bis zum Rathaus von Bogotá. Nur ansehen und teilen.",
      back: "Zurück", prev: "Vorheriger Bericht", next: "Nächster Bericht", pause: "Drehung pausieren", play: "Drehung fortsetzen", open: "Bericht öffnen",
      carousel: "Karussell der Live-Berichte", all: "Alle", sector: "Branche", scope: "Reichweite", country: "Land", focus: "Testart",
      worldwide: "Weltweit", national: "National", local: "Lokal", global: "Global",
      status: "{i} von {n}: {name}, {score} von 100, Note {grade}.", slide: "{i} von {n}: {name}",
      none: "Kein Bericht passt zu diesen Filtern.", clear: "Filter löschen", loading: "Live-Berichte werden geladen…", failed: "Die Live-Berichte konnten nicht geladen werden.",
      read: "Gelesen am {date}", page: "{n} Seite", pages: "{n} Seiten", hint: "Ziehen, wischen oder Pfeiltasten nutzen. Eine Karte wählen, um sie zu öffnen.",
      close: "Schließen", share: "Teilen", copy: "Link kopieren", copied: "Link kopiert. Er öffnet diesen Bericht.", shareOn: "Auf {net} teilen", email: "E-Mail",
      viewOnly: "Nur ansehen. Dieser Live-Bericht kann geöffnet und geteilt, aber nicht heruntergeladen, gedruckt oder exportiert werden.",
      blocked: "Nur ansehen. Teilen Sie stattdessen den Link.", shot: "Eine Seite kann Screenshots nicht verhindern. Das Wasserzeichen bleibt im Bild.",
      printNote: "Live-Berichte sind nur zum Ansehen und werden nicht gedruckt.", printLink: "Hier öffnen oder teilen:",
      fair: "Eine automatische Lesung öffentlicher Seiten am {date}. Ein Ausgangspunkt, kein Urteil.", own: "Eigene Website prüfen",
      rank: "<b>#{r}</b> von {n} in dieser Serie", rankSector: "<b>#{r}</b> von {n} in {sector}",
      hHeadline: "Was die Prüfung fand", hLesson: "Die Lehre", hAreas: "Sechs Bereiche · die goldene Marke ist der Serienschnitt", hFix: "Zuerst beheben", hWorks: "Funktioniert bereits",
      hAi: "KI-Crawler", hSpeed: "Tempo für echte Besucher", hSec: "Sicherheits-Header", hCoverage: "Vorgeschlagene Abdeckung", hTags: "Tags",
      gWho: "Wer", gScore: "Bewertung", gStand: "Highlights", gTested: "Geprüft auf", gBuilt: "Gebaut mit",
      openFail: "Dieser Bericht konnte nicht geöffnet werden.", visit: "Website besuchen"
    },
    fr: {
      eyebrow: "Rapports en direct", title: "De vrais sites. De vraies lectures.", titleEm: "Ouvrez celui que vous voulez.",
      lede: "<b>{n} sites publics</b>, lus par la même revue que tout le monde peut lancer : portails publics, rédactions, banques, universités, projets open source et réseaux de transport. Faites tourner l’anneau, filtrez par secteur ou pays, puis ouvrez un rapport. Consultation et partage uniquement.",
      explore: "Explorer {n} rapports en direct", gateLine: "De vraies revues de sites publics, de GOV.UK à la mairie de Bogotá. Consultation et partage uniquement.",
      back: "Retour", prev: "Rapport précédent", next: "Rapport suivant", pause: "Mettre la rotation en pause", play: "Reprendre la rotation", open: "Ouvrir le rapport",
      carousel: "Carrousel des rapports en direct", all: "Tous", sector: "Secteur", scope: "Portée", country: "Pays", focus: "Type de test",
      worldwide: "Mondial", national: "National", local: "Local", global: "Mondial",
      status: "{i} sur {n} : {name}, {score} sur 100, note {grade}.", slide: "{i} sur {n} : {name}",
      none: "Aucun rapport ne correspond à ces filtres.", clear: "Effacer les filtres", loading: "Chargement des rapports en direct…", failed: "Les rapports en direct n’ont pas pu être chargés.",
      read: "Lu le {date}", page: "{n} page", pages: "{n} pages", hint: "Faites glisser, balayez ou utilisez les flèches. Choisissez une carte pour l’ouvrir.",
      close: "Fermer", share: "Partager", copy: "Copier le lien", copied: "Lien copié. Il ouvre ce rapport.", shareOn: "Partager sur {net}", email: "E-mail",
      viewOnly: "Consultation seule. Ce rapport en direct peut être ouvert et partagé, pas téléchargé, imprimé ni exporté.",
      blocked: "Consultation seule. Partagez plutôt le lien.", shot: "Une page ne peut pas bloquer les captures d’écran. Le filigrane reste sur l’image.",
      printNote: "Les rapports en direct sont en consultation seule et ne s’impriment pas.", printLink: "Ouvrez-le ou partagez-le ici :",
      fair: "Une lecture automatique de pages publiques le {date}. Un point de départ, pas un verdict.", own: "Faire la revue de votre site",
      rank: "<b>#{r}</b> sur {n} dans cette série", rankSector: "<b>#{r}</b> sur {n} en {sector}",
      hHeadline: "Ce que la lecture a trouvé", hLesson: "La leçon", hAreas: "Six domaines · le repère doré est la moyenne de la série", hFix: "À corriger d’abord", hWorks: "Ce qui fonctionne déjà",
      hAi: "Robots d’IA", hSpeed: "Vitesse pour de vrais visiteurs", hSec: "En-têtes de sécurité", hCoverage: "Couverture proposée", hTags: "Étiquettes",
      gWho: "Qui", gScore: "Score", gStand: "Points forts", gTested: "Testé pour", gBuilt: "Construit avec",
      openFail: "Ce rapport n’a pas pu être ouvert.", visit: "Visiter le site"
    },
    it: {
      eyebrow: "Report dal vivo", title: "Siti veri. Letture vere.", titleEm: "Aprine uno qualsiasi.",
      lede: "<b>{n} siti pubblici</b>, letti dalla stessa revisione che chiunque può avviare: portali pubblici, redazioni, banche, università, progetti open source e trasporti. Gira l’anello, filtra per settore o paese e apri un report. Solo visualizzazione e condivisione.",
      explore: "Esplora {n} report dal vivo", gateLine: "Revisioni reali di siti pubblici, da GOV.UK al comune di Bogotá. Solo visualizzazione e condivisione.",
      back: "Indietro", prev: "Report precedente", next: "Report successivo", pause: "Metti in pausa la rotazione", play: "Riprendi la rotazione", open: "Apri il report",
      carousel: "Carosello dei report dal vivo", all: "Tutti", sector: "Settore", scope: "Portata", country: "Paese", focus: "Tipo di test",
      worldwide: "Mondiale", national: "Nazionale", local: "Locale", global: "Globale",
      status: "{i} di {n}: {name}, {score} su 100, voto {grade}.", slide: "{i} di {n}: {name}",
      none: "Nessun report corrisponde a questi filtri.", clear: "Azzera i filtri", loading: "Caricamento dei report dal vivo…", failed: "Non è stato possibile caricare i report dal vivo.",
      read: "Letto il {date}", page: "{n} pagina", pages: "{n} pagine", hint: "Trascina, scorri o usa le frecce. Scegli una scheda per aprirla.",
      close: "Chiudi", share: "Condividi", copy: "Copia link", copied: "Link copiato. Apre questo report.", shareOn: "Condividi su {net}", email: "E-mail",
      viewOnly: "Solo visualizzazione. Questo report dal vivo si può aprire e condividere, non scaricare, stampare o esportare.",
      blocked: "Solo visualizzazione. Condividi il link.", shot: "Una pagina non può bloccare gli screenshot. La filigrana resta nell’immagine.",
      printNote: "I report dal vivo sono solo da visualizzare e non si stampano.", printLink: "Aprilo o condividilo qui:",
      fair: "Una lettura automatica di pagine pubbliche il {date}. Un punto di partenza, non un verdetto.", own: "Fai la revisione del tuo sito",
      rank: "<b>#{r}</b> su {n} in questa serie", rankSector: "<b>#{r}</b> su {n} in {sector}",
      hHeadline: "Cosa ha trovato la lettura", hLesson: "La lezione", hAreas: "Sei aree · la tacca dorata è la media della serie", hFix: "Da sistemare prima", hWorks: "Funziona già",
      hAi: "Crawler IA", hSpeed: "Velocità per visitatori reali", hSec: "Header di sicurezza", hCoverage: "Copertura proposta", hTags: "Tag",
      gWho: "Chi", gScore: "Punteggio", gStand: "In evidenza", gTested: "Testato per", gBuilt: "Fatto con",
      openFail: "Non è stato possibile aprire questo report.", visit: "Visita il sito"
    }
  };

  const SECTOR_T = {
    es: { government: "Gobierno", health: "Salud pública", media: "Noticias y medios", banking: "Banca y finanzas", fintech: "Fintech", transit: "Transporte y movilidad", opensource: "Código abierto", devdocs: "Documentación técnica", science: "Espacio y ciencia", highered: "Educación superior", education: "Educación", humanitarian: "Humanitario", international: "Organismos internacionales", culture: "Museos, bibliotecas y cultura", knowledge: "Conocimiento abierto", retail: "Comercio y e-commerce", telecom: "Telecomunicaciones", energy: "Energía y servicios públicos", travel: "Viajes y turismo", airline: "Aerolínea", insurance: "Seguros y salud", infrastructure: "Infraestructura de internet", standards: "Estándares web", sports: "Deporte y recreación", apps: "Apps y domicilios", rights: "Derechos humanos y digitales" },
    pt: { government: "Governo", health: "Saúde pública", media: "Notícias e mídia", banking: "Bancos e finanças", fintech: "Fintech", transit: "Transporte e mobilidade", opensource: "Código aberto", devdocs: "Documentação técnica", science: "Espaço e ciência", highered: "Ensino superior", education: "Educação", humanitarian: "Humanitário", international: "Organismos internacionais", culture: "Museus, bibliotecas e cultura", knowledge: "Conhecimento aberto", retail: "Varejo e e-commerce", telecom: "Telecomunicações", energy: "Energia e serviços públicos", travel: "Viagens e turismo", airline: "Companhia aérea", insurance: "Seguros e planos de saúde", infrastructure: "Infraestrutura de internet", standards: "Padrões web", sports: "Esporte e lazer", apps: "Apps e delivery", rights: "Direitos humanos e digitais" },
    de: { government: "Regierung", health: "Öffentliche Gesundheit", media: "Nachrichten und Medien", banking: "Banken und Finanzen", fintech: "Fintech", transit: "Verkehr und Mobilität", opensource: "Open Source", devdocs: "Entwicklerdokumentation", science: "Raumfahrt und Wissenschaft", highered: "Hochschulen", education: "Bildung", humanitarian: "Humanitäre Hilfe", international: "Internationale Organisationen", culture: "Museen, Bibliotheken und Kultur", knowledge: "Freies Wissen", retail: "Handel und E-Commerce", telecom: "Telekommunikation", energy: "Energie und Versorgung", travel: "Reisen und Tourismus", airline: "Fluggesellschaft", insurance: "Versicherungen und Krankenkassen", infrastructure: "Internet-Infrastruktur", standards: "Webstandards", sports: "Sport und Freizeit", apps: "Apps und Lieferdienste", rights: "Menschen- und Digitalrechte" },
    fr: { government: "Gouvernement", health: "Santé publique", media: "Presse et médias", banking: "Banque et finance", fintech: "Fintech", transit: "Transports et mobilité", opensource: "Open source", devdocs: "Documentation développeurs", science: "Espace et science", highered: "Enseignement supérieur", education: "Éducation", humanitarian: "Humanitaire", international: "Organisations internationales", culture: "Musées, bibliothèques et culture", knowledge: "Savoir ouvert", retail: "Commerce et e-commerce", telecom: "Télécoms", energy: "Énergie et services publics", travel: "Voyage et tourisme", airline: "Compagnie aérienne", insurance: "Assurance et santé", infrastructure: "Infrastructure internet", standards: "Standards du web", sports: "Sport et loisirs", apps: "Applis et livraison", rights: "Droits humains et numériques" },
    it: { government: "Governo", health: "Sanità pubblica", media: "Notizie e media", banking: "Banche e finanza", fintech: "Fintech", transit: "Trasporti e mobilità", opensource: "Open source", devdocs: "Documentazione tecnica", science: "Spazio e scienza", highered: "Università", education: "Istruzione", humanitarian: "Umanitario", international: "Organizzazioni internazionali", culture: "Musei, biblioteche e cultura", knowledge: "Conoscenza aperta", retail: "Retail ed e-commerce", telecom: "Telecomunicazioni", energy: "Energia e servizi pubblici", travel: "Viaggi e turismo", airline: "Compagnia aerea", insurance: "Assicurazioni e sanità", infrastructure: "Infrastruttura internet", standards: "Standard web", sports: "Sport e tempo libero", apps: "App e consegne", rights: "Diritti umani e digitali" }
  };
  const FOCUS_T = {
    es: { seo: "SEO", geo: "GEO · búsqueda con IA", schema: "Datos estructurados", a11y: "Accesibilidad", security: "Cabeceras de seguridad", performance: "Rendimiento · Core Web Vitals", analytics: "Analítica y consentimiento", i18n: "Internacionalización" },
    pt: { seo: "SEO", geo: "GEO · busca com IA", schema: "Dados estruturados", a11y: "Acessibilidade", security: "Cabeçalhos de segurança", performance: "Desempenho · Core Web Vitals", analytics: "Analytics e consentimento", i18n: "Internacionalização" },
    de: { seo: "SEO", geo: "GEO · KI-Suche", schema: "Strukturierte Daten", a11y: "Barrierefreiheit", security: "Sicherheits-Header", performance: "Performance · Core Web Vitals", analytics: "Analytics und Einwilligung", i18n: "Internationalisierung" },
    fr: { seo: "SEO", geo: "GEO · recherche IA", schema: "Données structurées", a11y: "Accessibilité", security: "En-têtes de sécurité", performance: "Performance · Core Web Vitals", analytics: "Analytics et consentement", i18n: "Internationalisation" },
    it: { seo: "SEO", geo: "GEO · ricerca IA", schema: "Dati strutturati", a11y: "Accessibilità", security: "Header di sicurezza", performance: "Prestazioni · Core Web Vitals", analytics: "Analytics e consenso", i18n: "Internazionalizzazione" }
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
    cache: new Map(), openId: "", opener: null, suppressUntil: 0
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
    if (rank) out.push(chip(rank.t, "t-rank"));
    r.tags.filter((x) => x.g === "badge").slice(0, rank ? 2 : 3).forEach((b) => out.push(chip(b.t, "t-" + b.tone)));
    return out.join("");
  }
  function cardHtml(r) {
    const head = (r.headline || []).map((line) => (line.em ? "<em>" + esc(line.t) + "</em>" : esc(line.t))).join(" ");
    const areas = AREAS.map((a) => '<li><span>' + SHORT[a] + '</span><i><u style="width:' + r.areas[a] + "%;background:" + color(r.areas[a]) + '"></u></i><b>' + r.areas[a] + "</b></li>").join("");
    return '<div class="lc-top"><span class="lc-mono" aria-hidden="true">' + esc(monogram(r.name)) + '</span><div class="lc-id"><b class="lc-name">' + esc(r.name) + '</b><span class="lc-host notranslate">' + esc(r.host) + '</span></div><span class="lc-scope s-' + r.scope.toLowerCase() + '"' + nt() + ">" + esc(t(r.scope.toLowerCase())) + "</span></div>" +
      '<p class="lc-headline">' + head + "</p>" +
      '<div class="lc-score"><div class="lc-ring">' + ringSvg(r.overall, 92, 8) + "<b>" + r.overall + "<small>" + esc(r.grade) + '</small></b></div><ul class="lc-areas">' + areas + "</ul></div>" +
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
      if (group === "scope") values = ["worldwide", "national", "local"].filter((v) => totals.has(v));
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
      return '<div class="live-frow" role="group" aria-label="' + esc(t(group)) + '"><span class="live-flabel"' + nt() + ">" + esc(t(group)) + '</span><div class="live-chips">' + buttons.join("") + "</div></div>";
    }).join("");
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
      state.filters[group] = state.filters[group] === value ? "" : value;
      track("qa_review_live_filter", group + ":" + (state.filters[group] || "all"));
      stopAuto();
      applyFilters();
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
    const first = filtersEl.querySelector("button");
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
      '<header class="lv-bar"><div class="lv-brand"><img src="assets/qa-review-mark.svg?v=20261013c" alt="" width="28" height="28"><span>QA-lab · Live report</span></div><div class="lv-actions"></div></header>' +
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
    if (!r) return "QA-lab URL Review live report";
    return r.name + " scored " + r.overall + "/100 (" + r.grade + ") in a QA-lab URL Review live report: " + AREAS.map((a) => SHORT[a] + " " + r.areas[a]).join(" · ");
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
    const actions = viewer.querySelector(".lv-actions");
    const native = navigator.share ? '<button class="lv-btn primary" type="button" data-act="native"' + nt() + ">" + ICONS.share + "<span>" + esc(t("share")) + "</span></button>" : "";
    const nets = NETS.map(([net, label]) => {
      const name = label || t("email");
      return '<button class="lv-btn icon" type="button" data-act="net" data-net="' + net + '" aria-label="' + esc(t("shareOn", { net: name })) + '" title="' + esc(t("shareOn", { net: name })) + '">' + ICONS[net] + "</button>";
    }).join("");
    actions.innerHTML = native + nets +
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
    if (back && document.contains(back) && back.focus) back.focus({ preventScroll: true });
  }

  function ms(value) { return value >= 1000 ? (value / 1000).toFixed(1) + " s" : Math.round(value) + " ms"; }
  function catClass(cat) { return cat === "FAST" ? "c-good" : cat === "AVERAGE" ? "c-mid" : cat === "SLOW" ? "c-bad" : ""; }
  function catText(cat) { return cat === "FAST" ? "good" : cat === "AVERAGE" ? "needs work" : cat === "SLOW" ? "poor" : "—"; }

  function viewerHtml(d) {
    const avg = (state.index && state.index.averages && state.index.averages.areas) || {};
    const head = (d.headline || []).map((line) => (line.em ? "<em>" + esc(line.t) + "</em>" : esc(line.t))).join(" ");
    const place = d.flag + " " + (d.city ? esc(d.city) + ", " : "") + esc(countryName(d.country));
    const rank = d.rank ? '<p class="lv-rank"' + nt() + ">" + t("rank", { r: d.rank.overall.rank, n: d.rank.overall.of }) +
      (d.rank.sector.of > 1 ? "<br>" + t("rankSector", { r: d.rank.sector.rank, n: d.rank.sector.of, sector: esc(sectorLabel(d.sector)) }) : "") + "</p>" : "";

    const areas = AREAS.map((a) => {
      const s = d.score.areas[a];
      const mean = avg[a];
      return '<div class="lv-area"><div class="lv-area-top"><span>' + esc(a) + "</span><b>" + s.score + '</b></div><i><u style="width:' + s.score + "%;background:" + color(s.score) + '"></u>' +
        (mean ? '<s style="left:' + mean + '%" title="Series average ' + mean + '"></s>' : "") + "</i><small>" + s.fail + " fail · " + s.risk + " at risk · " + s.pass + " pass</small></div>";
    }).join("");

    const fix = (d.fix || []).map((f) => '<li><strong><span class="lv-sev sev-' + esc(f.severity) + '">' + esc(f.severity) + '</span><span class="lv-area-tag">' + esc(f.area) + "</span>" + esc(f.title) + "</strong>" +
      (f.evidence ? "<p>" + esc(f.evidence) + "</p>" : "") + (f.fix ? '<p class="fix">' + esc(f.fix) + (f.effort ? " <small>· " + esc(f.effort) + "</small>" : "") + "</p>" : "") + "</li>").join("");
    const works = (d.works || []).map((w) => "<li><span>" + esc(w.title) + "<small>" + esc(w.area) + "</small></span></li>").join("");

    const g = d.geo || {};
    const blocked = g.answersBlocked || [];
    const ai = '<div class="lv-kv"><span>Answer bots allowed</span><b class="' + (blocked.length ? "c-mid" : "c-good") + '">' + (g.answersAllowed || 0) + "</b></div>" +
      '<div class="lv-kv"><span>Answer bots blocked</span><b class="' + (blocked.length ? "c-bad" : "") + '">' + (blocked.length || "none") + "</b></div>" +
      (blocked.length ? '<div class="lv-chips lv-bots">' + blocked.map((b) => '<span class="lchip t-warn notranslate">' + esc(b) + "</span>").join("") + "</div>" : "") +
      '<div class="lv-kv"><span>Training bots opted out</span><b>' + (g.trainingBlocked && g.trainingBlocked.length ? g.trainingBlocked.length : "none") + "</b></div>" +
      '<div class="lv-kv"><span>llms.txt</span><b class="' + (g.llms ? "c-good" : "") + '">' + (g.llms ? "published" : "not found") + "</b></div>" +
      '<div class="lv-kv"><span>HTML without JavaScript</span><b class="' + (g.jsOnly ? "c-bad" : "c-good") + '">' + (g.jsOnly ? "almost empty" : (g.words || 0) + " words") + "</b></div>" +
      (g.schema && g.schema.length ? '<div class="lv-kv"><span>Structured data</span><b>' + esc(g.schema.slice(0, 4).join(", ")) + "</b></div>" : "");

    const sp = d.speed;
    let speed = '<div class="lv-kv"><span>PageSpeed Insights</span><b>not available</b></div>';
    if (sp) {
      speed = '<div class="lv-kv"><span>Lighthouse, mobile</span><b style="color:' + color(sp.lighthouse) + '">' + sp.lighthouse + "/100</b></div>";
      const f = sp.field;
      if (f && (f.lcp || f.inp || f.cls)) {
        if (f.lcp) speed += '<div class="lv-kv"><span>LCP · 75th pct.</span><b class="' + catClass(f.lcp.category) + '">' + ms(f.lcp.p75) + " · " + catText(f.lcp.category) + "</b></div>";
        if (f.inp) speed += '<div class="lv-kv"><span>INP · 75th pct.</span><b class="' + catClass(f.inp.category) + '">' + ms(f.inp.p75) + " · " + catText(f.inp.category) + "</b></div>";
        if (f.cls) speed += '<div class="lv-kv"><span>CLS · 75th pct.</span><b class="' + catClass(f.cls.category) + '">' + f.cls.p75 + " · " + catText(f.cls.category) + "</b></div>";
      } else {
        speed += '<div class="lv-kv"><span>Real visitors</span><b>not enough Chrome data</b></div>';
      }
      if (sp.lab && sp.lab.lcp) speed += '<div class="lv-kv"><span>Lab LCP · TBT</span><b>' + ms(sp.lab.lcp) + " · " + ms(sp.lab.tbt || 0) + "</b></div>";
    }

    const sec = '<div class="lv-sec">' + (d.security || []).map((h) => '<span class="st-' + esc(h.state) + '" title="' + esc(h.state) + '">' + esc(h.label) + "</span>").join("") + "</div>";

    const layers = Object.entries((d.coverage && d.coverage.layers) || {}).sort((a, b) => b[1] - a[1]).map(([k, v]) => '<span class="lchip">' + esc(k) + " · " + v + "</span>").join("");

    const groups = [
      ["gWho", ["sector", "org", "scope", "place", "region"]],
      ["gScore", ["grade", "band", "rank"]],
      ["gStand", ["badge"]],
      ["gTested", ["focus", "tests", "pages"]],
      ["gBuilt", ["hosting", "tech", "analytics", "consent", "lang"]]
    ];
    const tagLabel = (tag) => {
      if (tag.g === "sector") return sectorLabel(tag.k);
      if (tag.g === "scope") return t(tag.k);
      if (tag.g === "place") return place.replace(/&amp;/g, "&");
      if (tag.g === "focus") return focusLabel(tag.k);
      return tag.t;
    };
    const tagCls = (tag) => (tag.g === "rank" ? "t-rank" : tag.g === "sector" ? "t-sector" : tag.tone ? "t-" + tag.tone : "");
    const tags = groups.map(([label, list]) => {
      const items = (d.tags || []).filter((tag) => list.includes(tag.g));
      if (!items.length) return "";
      return '<div class="lv-tg"><span' + nt() + ">" + esc(t(label)) + '</span><div class="lv-chips">' + items.map((tag) => '<span class="lchip ' + tagCls(tag) + '">' + esc(tagLabel(tag)) + "</span>").join("") + "</div></div>";
    }).join("");

    return '<div class="lv-hero"><div>' +
      '<p class="lv-meta"><span class="lv-scope s-' + esc(d.scope.toLowerCase()) + '"' + nt() + ">" + esc(t(d.scope.toLowerCase())) + "</span><span" + nt() + ">" + place + "</span><span>·</span><span" + nt() + ">" + esc(sectorLabel(d.sector)) + "</span><span>·</span><span" + nt() + ">" + esc(t("read", { date: dateText(d.read) })) + " · " + esc(t(d.pages === 1 ? "page" : "pages", { n: d.pages })) + "</span></p>" +
      '<h2 class="lv-name" id="lv-name">' + esc(d.name) + "</h2>" +
      '<p class="lv-host"><span class="notranslate">' + esc(d.host) + '</span><a href="' + esc(d.url) + '" target="_blank" rel="noopener noreferrer nofollow"' + nt() + ">" + esc(t("visit")) + " ↗</a></p>" +
      '<p class="lv-headline">' + head + "</p>" +
      (d.body ? '<p class="lv-body-text">' + esc(d.body) + "</p>" : "") +
      (d.lesson ? '<p class="lv-lesson"><b' + nt() + ">" + esc(t("hLesson")) + "</b>" + esc(d.lesson) + "</p>" : "") +
      '</div><div class="lv-scorebox"><div class="lv-ring">' + ringSvg(d.overall, 200, 14) + "<b>" + d.overall + "<small>GRADE " + esc(d.grade) + "</small></b></div>" + rank + "</div></div>" +
      '<p class="lv-h"' + nt() + ">" + esc(t("hAreas")) + '</p><div class="lv-areas">' + areas + "</div>" +
      '<div class="lv-cols" style="margin-top:16px"><section class="lv-card"><h3 class="lv-h"' + nt() + ">" + esc(t("hFix")) + '</h3><ol class="lv-fix">' + fix + "</ol></section>" +
      '<section class="lv-card"><h3 class="lv-h"' + nt() + ">" + esc(t("hWorks")) + '</h3><ul class="lv-works">' + works + "</ul></section></div>" +
      '<div class="lv-tiles"><section class="lv-card"><h3 class="lv-h"' + nt() + ">" + esc(t("hAi")) + "</h3>" + ai + "</section>" +
      '<section class="lv-card"><h3 class="lv-h"' + nt() + ">" + esc(t("hSpeed")) + "</h3>" + speed + "</section>" +
      '<section class="lv-card"><h3 class="lv-h"' + nt() + ">" + esc(t("hSec")) + "</h3>" + sec + "</section></div>" +
      '<p class="lv-h"' + nt() + ">" + esc(t("hCoverage")) + " · " + ((d.coverage && d.coverage.cases) || 0) + '</p><div class="lv-chips">' + layers + "</div>" +
      '<p class="lv-h"' + nt() + ">" + esc(t("hTags")) + '</p><div class="lv-taggroups">' + tags + "</div>" +
      '<div class="lv-foot"><div><p class="lv-fair"' + nt() + ">" + esc(t("fair", { date: dateText(d.read) })) + '</p><p class="lv-note"' + nt() + ">" + esc(t("viewOnly")) + '</p><div class="lv-copybox"><input type="text" readonly aria-label="' + esc(t("copy")) + '"></div></div>' +
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
    openReport(id, null, "link");
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
