/* Copy for the QA-lab URL Review post studio. Every claim here matches the live review:
   it reads a public https page and proposes cases. It does not run them, sign in, submit forms,
   or generate load, and the page text is not sent to a model vendor, so nothing here says AI. */

const LANGS = ["en", "es", "pt", "de", "fr", "it"];

const SITE = "https://carlosandmunoz.com";
const PAGES = {
  en: "/qa-review.html",
  es: "/qa-review-es.html",
  pt: "/qa-review-pt.html",
  de: "/qa-review-de.html",
  fr: "/qa-review-fr.html",
  it: "/qa-review-it.html"
};

const UI = {
  en: {
    cta: "Try it on a public URL",
    ctaShort: "Run your first review",
    included: "First review included · 20 pages · 2 links deep",
    price: "The report shows once at no charge. Keeping, downloading, or sharing it starts at 19 USD, and the amount is shown before you confirm.",
    honest: "It proposes test cases from a public read. It does not run them, sign in, submit forms, or generate load.",
    footnote: "Proposes cases · Does not run them · Not a certification",
    bio: "Link in bio.",
    swipe: "Swipe",
    example: "Real case IDs from the review",
    url: "https://your-site.com",
    review: "Review",
    endTitle: ["Paste a public address.", "*Leave with the test list.*"],
    by: "by Carlos Muñoz",
    cases: "Proposed cases",
    present: "Present",
    missing: "Missing",
    file: "File"
  },
  es: {
    cta: "Pruébalo con una URL pública",
    ctaShort: "Haz tu primera revisión",
    included: "Primera revisión incluida · 20 páginas · 2 enlaces de profundidad",
    price: "El informe se muestra una vez sin costo. Guardarlo, descargarlo o compartirlo cuesta desde 19 USD, y el monto aparece antes de confirmar.",
    honest: "Propone casos de prueba a partir de una lectura pública. No los ejecuta, no inicia sesión, no envía formularios ni genera carga.",
    footnote: "Propone casos · No los ejecuta · No es una certificación",
    bio: "Enlace en la bio.",
    swipe: "Desliza",
    example: "IDs de casos reales de la revisión",
    url: "https://tu-sitio.com",
    review: "Revisar",
    endTitle: ["Pega una dirección pública.", "*Llévate la lista de pruebas.*"],
    by: "por Carlos Muñoz",
    cases: "Casos propuestos",
    present: "Presente",
    missing: "Falta",
    file: "Archivo"
  },
  pt: {
    cta: "Teste com uma URL pública",
    ctaShort: "Faça sua primeira revisão",
    included: "Primeira revisão incluída · 20 páginas · 2 links de profundidade",
    price: "O relatório aparece uma vez sem custo. Guardar, baixar ou compartilhar custa a partir de 19 USD, e o valor aparece antes de confirmar.",
    honest: "Propõe casos de teste a partir de uma leitura pública. Não os executa, não faz login, não envia formulários nem gera carga.",
    footnote: "Propõe casos · Não os executa · Não é uma certificação",
    bio: "Link na bio.",
    swipe: "Deslize",
    example: "IDs de casos reais da revisão",
    url: "https://seu-site.com",
    review: "Revisar",
    endTitle: ["Cole um endereço público.", "*Saia com a lista de testes.*"],
    by: "por Carlos Muñoz",
    cases: "Casos propostos",
    present: "Presente",
    missing: "Ausente",
    file: "Arquivo"
  },
  de: {
    cta: "Mit einer öffentlichen URL testen",
    ctaShort: "Erste Prüfung starten",
    included: "Erste Prüfung inklusive · 20 Seiten · 2 Links tief",
    price: "Der Bericht erscheint einmal kostenlos. Behalten, Herunterladen oder Teilen ab 19 USD, und der Betrag wird vor der Bestätigung angezeigt.",
    honest: "Sie schlägt Testfälle aus einer öffentlichen Lesung vor. Sie führt sie nicht aus, meldet sich nicht an, sendet keine Formulare und erzeugt keine Last.",
    footnote: "Schlägt Fälle vor · Führt sie nicht aus · Keine Zertifizierung",
    bio: "Link in der Bio.",
    swipe: "Wischen",
    example: "Echte Fall-IDs aus der Prüfung",
    url: "https://ihre-seite.de",
    review: "Prüfen",
    endTitle: ["Öffentliche Adresse einfügen.", "*Mit der Testliste gehen.*"],
    by: "von Carlos Muñoz",
    cases: "Vorgeschlagene Fälle",
    present: "Vorhanden",
    missing: "Fehlt",
    file: "Datei"
  },
  fr: {
    cta: "Essayez avec une URL publique",
    ctaShort: "Lancez votre première revue",
    included: "Première revue incluse · 20 pages · 2 liens de profondeur",
    price: "Le rapport s’affiche une fois sans frais. Le garder, le télécharger ou le partager coûte à partir de 19 USD, montant affiché avant de confirmer.",
    honest: "Elle propose des cas de test à partir d’une lecture publique. Elle ne les exécute pas, ne se connecte pas, n’envoie pas de formulaires et ne génère pas de charge.",
    footnote: "Propose des cas · Ne les exécute pas · Pas une certification",
    bio: "Lien en bio.",
    swipe: "Glissez",
    example: "Vrais identifiants de cas de la revue",
    url: "https://votre-site.fr",
    review: "Revoir",
    endTitle: ["Collez une adresse publique.", "*Repartez avec la liste de tests.*"],
    by: "par Carlos Muñoz",
    cases: "Cas proposés",
    present: "Présent",
    missing: "Absent",
    file: "Fichier"
  },
  it: {
    cta: "Provalo con un URL pubblico",
    ctaShort: "Fai la prima revisione",
    included: "Prima revisione inclusa · 20 pagine · 2 link di profondità",
    price: "Il rapporto si vede una volta senza costi. Tenerlo, scaricarlo o condividerlo parte da 19 USD, e l’importo appare prima di confermare.",
    honest: "Propone casi di test da una lettura pubblica. Non li esegue, non fa login, non invia moduli e non genera carico.",
    footnote: "Propone casi · Non li esegue · Non è una certificazione",
    bio: "Link in bio.",
    swipe: "Scorri",
    example: "ID di casi reali dalla revisione",
    url: "https://tuo-sito.it",
    review: "Rivedi",
    endTitle: ["Incolla un indirizzo pubblico.", "*Esci con la lista dei test.*"],
    by: "di Carlos Muñoz",
    cases: "Casi proposti",
    present: "Presente",
    missing: "Assente",
    file: "File"
  }
};

/* The first case of each layer, as the review engine writes it. */
const LAYERS = [
  ["FN-01", "The reviewed URL answers over https", { en: "Functional", es: "Funcional", pt: "Funcional", de: "Funktional", fr: "Fonctionnel", it: "Funzionale" }],
  ["CT-01", "The meta description is present and short enough to read", { en: "Content", es: "Contenido", pt: "Conteúdo", de: "Inhalt", fr: "Contenu", it: "Contenuti" }],
  ["LK-01", "Same-host links discovered from the start page resolve", { en: "Links", es: "Enlaces", pt: "Links", de: "Links", fr: "Liens", it: "Link" }],
  ["FM-01", "Visible fields have labels", { en: "Forms", es: "Formularios", pt: "Formulários", de: "Formulare", fr: "Formulaires", it: "Moduli" }],
  ["A11Y-01", "Images expose a text alternative", { en: "Accessibility", es: "Accesibilidad", pt: "Acessibilidade", de: "Barrierefreiheit", fr: "Accessibilité", it: "Accessibilità" }],
  ["SEC-01", "HTTPS is the only way in", { en: "Security", es: "Seguridad", pt: "Segurança", de: "Sicherheit", fr: "Sécurité", it: "Sicurezza" }],
  ["PR-01", "A privacy notice is linked from the page", { en: "Privacy", es: "Privacidad", pt: "Privacidade", de: "Datenschutz", fr: "Confidentialité", it: "Privacy" }],
  ["SEO-01", "Title, description, canonical, and social tags agree", { en: "SEO", es: "SEO", pt: "SEO", de: "SEO", fr: "SEO", it: "SEO" }],
  ["GEO-01", "AI answer and search crawlers may read the site", { en: "GEO", es: "GEO", pt: "GEO", de: "GEO", fr: "GEO", it: "GEO" }],
  ["PF-01", "The HTML document arrives inside a stated budget", { en: "Performance", es: "Rendimiento", pt: "Desempenho", de: "Performance", fr: "Performance", it: "Prestazioni" }],
  ["LD-01", "An authorised baseline could repeat the document fetch", { en: "Load", es: "Carga", pt: "Carga", de: "Last", fr: "Charge", it: "Carico" }],
  ["MB-01", "The layout holds at a phone width", { en: "Mobile", es: "Móvil", pt: "Mobile", de: "Mobil", fr: "Mobile", it: "Mobile" }],
  ["I18N-01", "The lang attribute matches the copy a person reads", { en: "Internationalization", es: "Internacionalización", pt: "Internacionalização", de: "Internationalisierung", fr: "Internationalisation", it: "Internazionalizzazione" }],
  ["RS-01", "A missing path returns a deliberate not-found page", { en: "Resilience", es: "Resiliencia", pt: "Resiliência", de: "Resilienz", fr: "Résilience", it: "Resilienza" }],
  ["CMP-01", "The page still explains itself when scripts do not run", { en: "Compatibility", es: "Compatibilidad", pt: "Compatibilidade", de: "Kompatibilität", fr: "Compatibilité", it: "Compatibilità" }],
  ["MED-01", "Video exposes captions or a transcript path", { en: "Media", es: "Multimedia", pt: "Mídia", de: "Medien", fr: "Médias", it: "Media" }],
  ["AN-01", "Analytics tags wait for a recorded choice when the page asks for consent", { en: "Analytics", es: "Analítica", pt: "Analytics", de: "Analytics", fr: "Analytics", it: "Analytics" }],
  ["CM-01", "A catalog or payment marker is covered without placing an order", { en: "Commerce", es: "Comercio", pt: "Comércio", de: "Commerce", fr: "Commerce", it: "Commercio" }],
  ["VIS-01", "Images reserve their box before they paint", { en: "Visual", es: "Visual", pt: "Visual", de: "Visuell", fr: "Visuel", it: "Visuale" }],
  ["PLAT-01", "The public Salesforce path stays available without an org login", { en: "Platform", es: "Plataforma", pt: "Plataforma", de: "Plattform", fr: "Plateforme", it: "Piattaforma" }],
  ["API-01", "A public API description is listed without calling the API", { en: "API", es: "API", pt: "API", de: "API", fr: "API", it: "API" }]
];

const FRAMEWORK_TILES = [
  ["Playwright", { en: "Browser · end to end", es: "Navegador · extremo a extremo", pt: "Navegador · ponta a ponta", de: "Browser · End-to-End", fr: "Navigateur · bout en bout", it: "Browser · end-to-end" }],
  ["Cypress", { en: "Front end, next to the app", es: "Interfaz, junto a la app", pt: "Interface, ao lado do app", de: "Frontend, neben der App", fr: "Front-end, à côté de l’app", it: "Front-end, accanto all’app" }],
  ["Robot", { en: "Keywords a mixed team reads", es: "Palabras clave para equipos mixtos", pt: "Palavras-chave para equipes mistas", de: "Schlüsselwörter für gemischte Teams", fr: "Mots-clés pour équipes mixtes", it: "Parole chiave per team misti" }],
  ["Selenium", { en: "WebDriver, your grid", es: "WebDriver, tu grilla", pt: "WebDriver, sua grade", de: "WebDriver, Ihr Grid", fr: "WebDriver, votre grille", it: "WebDriver, la tua griglia" }],
  ["WebdriverIO", { en: "JavaScript runner", es: "Ejecutor de JavaScript", pt: "Executor de JavaScript", de: "JavaScript-Runner", fr: "Moteur JavaScript", it: "Runner JavaScript" }],
  ["Appium", { en: "Mobile", es: "Móvil", pt: "Mobile", de: "Mobil", fr: "Mobile", it: "Mobile" }],
  ["JMeter", { en: "Load, for a later run", es: "Carga, para después", pt: "Carga, para depois", de: "Last, für später", fr: "Charge, pour plus tard", it: "Carico, per dopo" }],
  ["Gatling", { en: "Load as code", es: "Carga como código", pt: "Carga como código", de: "Last als Code", fr: "Charge en code", it: "Carico come codice" }]
];

const IMPORT_CSV = { en: "Import-ready CSV", es: "CSV listo para importar", pt: "CSV pronto para importar", de: "Importfertiges CSV", fr: "CSV prêt à importer", it: "CSV pronto da importare" };
const EXPORT_TILES = [
  ["Jira + Xray", { en: "Test issues in Jira", es: "Incidencias Test en Jira", pt: "Issues de Test no Jira", de: "Test-Issues in Jira", fr: "Tickets Test dans Jira", it: "Issue Test in Jira" }, ".csv"],
  ["TestRail", IMPORT_CSV, ".csv"],
  ["Zephyr", IMPORT_CSV, ".csv"],
  ["Azure DevOps", IMPORT_CSV, ".csv"],
  ["Mantis", IMPORT_CSV, ".csv"],
  ["Excel", { en: "Opens in a spreadsheet", es: "Se abre en una hoja", pt: "Abre numa planilha", de: "Öffnet in der Tabelle", fr: "S’ouvre dans un tableur", it: "Si apre in un foglio" }, ".csv"],
  ["JSON", { en: "Data for other tools", es: "Datos para otras herramientas", pt: "Dados para outras ferramentas", de: "Daten für andere Werkzeuge", fr: "Données pour d’autres outils", it: "Dati per altri strumenti" }, ".json"],
  ["PDF", { en: "Print it or file it", es: "Imprímelo o archívalo", pt: "Imprima ou arquive", de: "Drucken oder ablegen", fr: "À imprimer ou classer", it: "Stampalo o archivialo" }, ".pdf"]
];

const BASE_TAGS = {
  en: ["#SoftwareTesting", "#QA", "#TestAutomation", "#QualityEngineering", "#WebTesting"],
  es: ["#PruebasDeSoftware", "#QA", "#AutomatizaciónDePruebas", "#CalidadDeSoftware", "#Testing"],
  pt: ["#TesteDeSoftware", "#QA", "#AutomaçãoDeTestes", "#QualidadeDeSoftware", "#Testing"],
  de: ["#Softwaretest", "#QA", "#Testautomatisierung", "#Qualitätssicherung", "#Testing"],
  fr: ["#TestLogiciel", "#QA", "#AutomatisationDesTests", "#QualitéLogicielle", "#Testing"],
  it: ["#TestSoftware", "#QA", "#AutomazioneDeiTest", "#QualitàDelSoftware", "#Testing"]
};

/* clip: the recorded picture plus the narration key used for its voice and captions. */
const POSTS = [
  {
    id: "talking",
    art: "prism",
    layout: "hero",
    clip: { picture: "path-first", line: ["LINES", "path-first"] },
    cards: ["FN-01", "SEC-01", "A11Y-01"],
    tags: ["#TestCases", "#Playwright"],
    copy: {
      en: { kicker: "From one public URL", title: ["The page is", "*already talking.*"], sub: "We write the test list. Bring an address the world can open, and leave with the cases a release would want written down.", bullets: ["21 kinds of cases", "Scripts for 20 frameworks", "1 public address to begin"], hook: "Every public page already tells you what to test. Most teams never write it down.", body: "QA-lab URL Review reads a public https page, describes the response, and proposes the test cases, named for the framework your team already uses." },
      es: { kicker: "Desde una URL pública", title: ["La página", "*ya está hablando.*"], sub: "Nosotros escribimos la lista de pruebas. Trae una dirección pública y llévate los casos que una entrega querría por escrito.", bullets: ["21 tipos de casos", "Scripts para 20 frameworks", "1 dirección pública para empezar"], hook: "Cada página pública ya te dice qué probar. La mayoría de los equipos nunca lo escribe.", body: "QA-lab URL Review lee una página https pública, describe la respuesta y propone los casos de prueba, con el nombre del framework que tu equipo ya usa." },
      pt: { kicker: "De uma URL pública", title: ["A página", "*já está falando.*"], sub: "Nós escrevemos a lista de testes. Traga um endereço público e saia com os casos que uma entrega gostaria de ter por escrito.", bullets: ["21 tipos de casos", "Scripts para 20 frameworks", "1 endereço público para começar"], hook: "Toda página pública já diz o que testar. A maioria das equipes nunca escreve isso.", body: "O QA-lab URL Review lê uma página https pública, descreve a resposta e propõe os casos de teste, com o nome do framework que sua equipe já usa." },
      de: { kicker: "Aus einer öffentlichen URL", title: ["Die Seite", "*redet schon.*"], sub: "Wir schreiben die Testliste. Bringen Sie eine öffentliche Adresse mit und gehen Sie mit den Fällen, die ein Release schriftlich haben will.", bullets: ["21 Arten von Fällen", "Skripte für 20 Frameworks", "1 öffentliche Adresse genügt"], hook: "Jede öffentliche Seite sagt schon, was zu testen ist. Die meisten Teams schreiben es nie auf.", body: "QA-lab URL Review liest eine öffentliche https-Seite, beschreibt die Antwort und schlägt die Testfälle vor, benannt nach dem Framework, das Ihr Team schon nutzt." },
      fr: { kicker: "D’une URL publique", title: ["La page", "*parle déjà.*"], sub: "Nous écrivons la liste de tests. Apportez une adresse publique, repartez avec les cas qu’une livraison voudrait voir écrits.", bullets: ["21 sortes de cas", "Scripts pour 20 frameworks", "1 adresse publique pour commencer"], hook: "Chaque page publique dit déjà quoi tester. La plupart des équipes ne l’écrivent jamais.", body: "QA-lab URL Review lit une page https publique, décrit la réponse et propose les cas de test, nommés pour le framework que votre équipe utilise déjà." },
      it: { kicker: "Da un URL pubblico", title: ["La pagina", "*sta già parlando.*"], sub: "Noi scriviamo la lista dei test. Porta un indirizzo pubblico ed esci con i casi che un rilascio vorrebbe per iscritto.", bullets: ["21 tipi di casi", "Script per 20 framework", "1 indirizzo pubblico per iniziare"], hook: "Ogni pagina pubblica dice già cosa testare. La maggior parte dei team non lo scrive mai.", body: "QA-lab URL Review legge una pagina https pubblica, descrive la risposta e propone i casi di test, con il nome del framework che il team usa già." }
    }
  },
  {
    id: "first-read",
    art: "field",
    layout: "offer",
    clip: { picture: "scope-20x2", line: ["SCOPES", "20x2"] },
    tags: ["#TestCases", "#QAtools"],
    copy: {
      en: { kicker: "Included first review", title: ["Your first review", "*is included.*"], sub: "Paste a public URL and watch the report get written in front of you.", stats: [["20", "pages read"], ["2", "links deep"], ["19 USD", "to keep it"]], bullets: ["Report shown once at no charge", "Keep, download, or share from 19 USD", "Amount shown before you confirm"], hook: "Your first review is included: 20 pages, 2 links deep.", body: "Paste a public URL, accept what the review will and will not do, and watch the report get written. Keep it only if it earns its place." },
      es: { kicker: "Primera revisión incluida", title: ["Tu primera revisión", "*está incluida.*"], sub: "Pega una URL pública y mira cómo el informe se escribe delante de ti.", stats: [["20", "páginas leídas"], ["2", "enlaces de profundidad"], ["19 USD", "para guardarlo"]], bullets: ["El informe se muestra una vez sin costo", "Guardar, descargar o compartir desde 19 USD", "El monto aparece antes de confirmar"], hook: "Tu primera revisión está incluida: 20 páginas, 2 enlaces de profundidad.", body: "Pega una URL pública, acepta lo que la revisión hará y no hará, y mira cómo se escribe el informe. Guárdalo solo si vale la pena." },
      pt: { kicker: "Primeira revisão incluída", title: ["Sua primeira revisão", "*está incluída.*"], sub: "Cole uma URL pública e veja o relatório ser escrito na sua frente.", stats: [["20", "páginas lidas"], ["2", "links de profundidade"], ["19 USD", "para guardar"]], bullets: ["O relatório aparece uma vez sem custo", "Guardar, baixar ou compartilhar a partir de 19 USD", "O valor aparece antes de confirmar"], hook: "Sua primeira revisão está incluída: 20 páginas, 2 links de profundidade.", body: "Cole uma URL pública, aceite o que a revisão faz e não faz, e veja o relatório ser escrito. Guarde só se valer a pena." },
      de: { kicker: "Erste Prüfung inklusive", title: ["Ihre erste Prüfung", "*ist inklusive.*"], sub: "Öffentliche URL einfügen und zusehen, wie der Bericht vor Ihnen entsteht.", stats: [["20", "Seiten gelesen"], ["2", "Links tief"], ["19 USD", "zum Behalten"]], bullets: ["Bericht einmal kostenlos sichtbar", "Behalten, Laden oder Teilen ab 19 USD", "Betrag vor der Bestätigung sichtbar"], hook: "Ihre erste Prüfung ist inklusive: 20 Seiten, 2 Links tief.", body: "Öffentliche URL einfügen, annehmen, was die Prüfung tut und was nicht, und zusehen, wie der Bericht entsteht. Behalten Sie ihn nur, wenn er sich lohnt." },
      fr: { kicker: "Première revue incluse", title: ["Votre première revue", "*est incluse.*"], sub: "Collez une URL publique et regardez le rapport s’écrire sous vos yeux.", stats: [["20", "pages lues"], ["2", "liens de profondeur"], ["19 USD", "pour le garder"]], bullets: ["Rapport affiché une fois sans frais", "Garder, télécharger ou partager dès 19 USD", "Montant affiché avant de confirmer"], hook: "Votre première revue est incluse : 20 pages, 2 liens de profondeur.", body: "Collez une URL publique, acceptez ce que la revue fera et ne fera pas, et regardez le rapport s’écrire. Gardez-le seulement s’il le mérite." },
      it: { kicker: "Prima revisione inclusa", title: ["La tua prima revisione", "*è inclusa.*"], sub: "Incolla un URL pubblico e guarda il rapporto scriversi davanti a te.", stats: [["20", "pagine lette"], ["2", "link di profondità"], ["19 USD", "per tenerlo"]], bullets: ["Rapporto visibile una volta senza costi", "Tenere, scaricare o condividere da 19 USD", "Importo visibile prima di confermare"], hook: "La tua prima revisione è inclusa: 20 pagine, 2 link di profondità.", body: "Incolla un URL pubblico, accetta cosa farà e non farà la revisione, e guarda il rapporto scriversi. Tienilo solo se ne vale la pena." }
    }
  },
  {
    id: "frameworks",
    art: "layers",
    layout: "tiles",
    tiles: "frameworks",
    carousel: "frameworks",
    clip: { picture: "framework-playwright", line: ["FRAMEWORKS", "Playwright"] },
    tags: ["#Playwright", "#Cypress", "#Selenium", "#RobotFramework"],
    copy: {
      en: { kicker: "20 frameworks", title: ["Cases named for", "*the tools you already run.*"], sub: "Playwright, Cypress, Robot, Selenium, WebdriverIO, Appium, JMeter, Gatling, and 12 more.", bullets: ["Pick one, or all twenty", "Each added framework is discounted", "Nothing is launched. You leave with the list."], hook: "Stop translating generic test ideas into your framework by hand.", body: "Choose Playwright, Cypress, Robot, Selenium, WebdriverIO, Appium, JMeter, Gatling, or twelve more, from Cucumber to k6, and the proposed cases come out in that shape." },
      es: { kicker: "20 frameworks", title: ["Casos con el nombre", "*de tus herramientas.*"], sub: "Playwright, Cypress, Robot, Selenium, WebdriverIO, Appium, JMeter, Gatling y 12 más.", bullets: ["Elige uno, o los veinte", "Cada framework adicional tiene descuento", "Nada se ejecuta. Te llevas la lista."], hook: "Deja de traducir a mano ideas de prueba genéricas a tu framework.", body: "Elige Playwright, Cypress, Robot, Selenium, WebdriverIO, Appium, JMeter, Gatling u otros doce, de Cucumber a k6, y los casos propuestos salen con esa forma." },
      pt: { kicker: "20 frameworks", title: ["Casos com o nome", "*das suas ferramentas.*"], sub: "Playwright, Cypress, Robot, Selenium, WebdriverIO, Appium, JMeter, Gatling e mais 12.", bullets: ["Escolha um, ou os vinte", "Cada framework adicional tem desconto", "Nada é executado. Você leva a lista."], hook: "Pare de traduzir à mão ideias de teste genéricas para o seu framework.", body: "Escolha Playwright, Cypress, Robot, Selenium, WebdriverIO, Appium, JMeter, Gatling ou outros doze, de Cucumber a k6, e os casos propostos saem nesse formato." },
      de: { kicker: "20 Frameworks", title: ["Fälle für die Werkzeuge,", "*die Sie schon nutzen.*"], sub: "Playwright, Cypress, Robot, Selenium, WebdriverIO, Appium, JMeter, Gatling und 12 weitere.", bullets: ["Eines wählen, oder alle zwanzig", "Jedes weitere Framework ist rabattiert", "Nichts wird gestartet. Sie nehmen die Liste mit."], hook: "Schluss damit, generische Testideen von Hand in Ihr Framework zu übersetzen.", body: "Wählen Sie Playwright, Cypress, Robot, Selenium, WebdriverIO, Appium, JMeter, Gatling oder zwölf weitere, von Cucumber bis k6, und die vorgeschlagenen Fälle kommen in dieser Form." },
      fr: { kicker: "20 frameworks", title: ["Des cas nommés", "*pour vos outils.*"], sub: "Playwright, Cypress, Robot, Selenium, WebdriverIO, Appium, JMeter, Gatling et 12 autres.", bullets: ["Choisissez-en un, ou les vingt", "Chaque framework ajouté est remisé", "Rien n’est lancé. Vous repartez avec la liste."], hook: "Arrêtez de traduire à la main des idées de test génériques dans votre framework.", body: "Choisissez Playwright, Cypress, Robot, Selenium, WebdriverIO, Appium, JMeter, Gatling ou douze autres, de Cucumber à k6, et les cas proposés sortent dans cette forme." },
      it: { kicker: "20 framework", title: ["Casi con il nome", "*dei tuoi strumenti.*"], sub: "Playwright, Cypress, Robot, Selenium, WebdriverIO, Appium, JMeter, Gatling e altri 12.", bullets: ["Scegline uno, o tutti e venti", "Ogni framework aggiunto è scontato", "Niente viene avviato. Esci con la lista."], hook: "Smetti di tradurre a mano idee di test generiche nel tuo framework.", body: "Scegli Playwright, Cypress, Robot, Selenium, WebdriverIO, Appium, JMeter, Gatling o altri dodici, da Cucumber a k6, e i casi proposti escono in quella forma." }
    }
  },
  {
    id: "release",
    art: "path",
    layout: "problem",
    clip: { picture: "reason-release", line: ["LINES", "reason-release"] },
    cards: ["FN-01", "LK-01", "MB-01"],
    tags: ["#RegressionTesting", "#ReleaseManagement"],
    copy: {
      en: { kicker: "Release week", title: ["Shipping Friday.", "*No written cases?*"], sub: "Turn the public page into the list you would want on paper before you ship.", bullets: ["Functional, links, content, mobile", "Accessibility, security, performance", "Ready to hand to the team"], hook: "The release is close and nobody has written the test cases. Sound familiar?", body: "Point QA-lab URL Review at the public page. It proposes the cases you would want on paper before shipping, so the team starts from a list instead of a blank doc." },
      es: { kicker: "Semana de entrega", title: ["Sale el viernes.", "*¿Y los casos escritos?*"], sub: "Convierte la página pública en la lista que querrías en papel antes de publicar.", bullets: ["Funcional, enlaces, contenido, móvil", "Accesibilidad, seguridad, rendimiento", "Lista para entregar al equipo"], hook: "La entrega está cerca y nadie ha escrito los casos de prueba. ¿Te suena?", body: "Apunta QA-lab URL Review a la página pública. Propone los casos que querrías en papel antes de publicar, para que el equipo empiece con una lista y no con un documento en blanco." },
      pt: { kicker: "Semana de entrega", title: ["Sai na sexta.", "*E os casos escritos?*"], sub: "Transforme a página pública na lista que você queria no papel antes de publicar.", bullets: ["Funcional, links, conteúdo, mobile", "Acessibilidade, segurança, desempenho", "Pronta para entregar à equipe"], hook: "A entrega está perto e ninguém escreveu os casos de teste. Soa familiar?", body: "Aponte o QA-lab URL Review para a página pública. Ele propõe os casos que você queria no papel antes de publicar, para a equipe começar com uma lista e não com um documento em branco." },
      de: { kicker: "Release-Woche", title: ["Release am Freitag.", "*Keine Testfälle?*"], sub: "Machen Sie aus der öffentlichen Seite die Liste, die Sie vor dem Release auf Papier wollen.", bullets: ["Funktion, Links, Inhalt, Mobil", "Barrierefreiheit, Sicherheit, Performance", "Bereit für das Team"], hook: "Das Release steht an und niemand hat die Testfälle geschrieben. Kommt Ihnen bekannt vor?", body: "Richten Sie QA-lab URL Review auf die öffentliche Seite. Es schlägt die Fälle vor, die Sie vor dem Release auf Papier wollen, und das Team startet mit einer Liste statt mit einem leeren Dokument." },
      fr: { kicker: "Semaine de livraison", title: ["Livraison vendredi.", "*Aucun cas écrit ?*"], sub: "Transformez la page publique en liste que vous voudriez sur papier avant de livrer.", bullets: ["Fonctionnel, liens, contenu, mobile", "Accessibilité, sécurité, performance", "Prête à confier à l’équipe"], hook: "La livraison approche et personne n’a écrit les cas de test. Ça vous parle ?", body: "Pointez QA-lab URL Review vers la page publique. Il propose les cas que vous voudriez sur papier avant de livrer, pour que l’équipe parte d’une liste et non d’un document vide." },
      it: { kicker: "Settimana di rilascio", title: ["Si rilascia venerdì.", "*Nessun caso scritto?*"], sub: "Trasforma la pagina pubblica nella lista che vorresti su carta prima del rilascio.", bullets: ["Funzionale, link, contenuti, mobile", "Accessibilità, sicurezza, prestazioni", "Pronta da passare al team"], hook: "Il rilascio è vicino e nessuno ha scritto i casi di test. Ti suona familiare?", body: "Punta QA-lab URL Review sulla pagina pubblica. Propone i casi che vorresti su carta prima del rilascio, così il team parte da una lista e non da un documento vuoto." }
    }
  },
  {
    id: "inherited",
    art: "nodes",
    layout: "problem",
    clip: { picture: "reason-tech", line: ["LINES", "reason-tech"] },
    cards: ["CMP-01", "LK-01", "SEO-01"],
    tags: ["#LegacyCode", "#RegressionTesting"],
    copy: {
      en: { kicker: "Inherited site", title: ["Nobody wrote down", "*how it was built.*"], sub: "The report names the technologies it can see in public, so the team starts from facts.", bullets: ["Technologies seen in public", "The real links, followed", "First cases for regression"], hook: "You inherited a site. No docs, no tests, no idea what is under the hood.", body: "A public-page analysis names the technologies it can see, follows the real links, and proposes the first cases, so you start from facts instead of guesses." },
      es: { kicker: "Sitio heredado", title: ["Nadie anotó", "*cómo se construyó.*"], sub: "El informe nombra las tecnologías que se ven en público, para que el equipo empiece por los hechos.", bullets: ["Tecnologías visibles en público", "Los enlaces reales, recorridos", "Primeros casos de regresión"], hook: "Heredaste un sitio. Sin documentación, sin pruebas, sin idea de qué hay por dentro.", body: "Un análisis de la página pública nombra las tecnologías que se ven, sigue los enlaces reales y propone los primeros casos, para que empieces por los hechos y no por suposiciones." },
      pt: { kicker: "Site herdado", title: ["Ninguém anotou", "*como foi feito.*"], sub: "O relatório nomeia as tecnologias visíveis em público, para a equipe começar pelos fatos.", bullets: ["Tecnologias visíveis em público", "Os links reais, percorridos", "Primeiros casos de regressão"], hook: "Você herdou um site. Sem documentação, sem testes, sem ideia do que tem por dentro.", body: "Uma análise da página pública nomeia as tecnologias visíveis, segue os links reais e propõe os primeiros casos, para você começar pelos fatos e não por palpites." },
      de: { kicker: "Geerbte Website", title: ["Niemand hat notiert,", "*wie sie gebaut wurde.*"], sub: "Der Bericht nennt die öffentlich sichtbaren Technologien, und das Team beginnt bei Fakten.", bullets: ["Öffentlich sichtbare Technologien", "Die echten Links, abgelaufen", "Erste Regressionsfälle"], hook: "Sie haben eine Website geerbt. Keine Doku, keine Tests, keine Ahnung, was drinsteckt.", body: "Eine Analyse der öffentlichen Seite nennt die sichtbaren Technologien, folgt den echten Links und schlägt die ersten Fälle vor. Sie beginnen bei Fakten statt bei Vermutungen." },
      fr: { kicker: "Site hérité", title: ["Personne n’a noté", "*comment il a été construit.*"], sub: "Le rapport nomme les technologies visibles en public, pour que l’équipe parte des faits.", bullets: ["Technologies visibles en public", "Les vrais liens, parcourus", "Premiers cas de régression"], hook: "Vous avez hérité d’un site. Pas de doc, pas de tests, aucune idée de ce qu’il y a dessous.", body: "Une analyse de la page publique nomme les technologies visibles, suit les vrais liens et propose les premiers cas, pour partir des faits plutôt que de suppositions." },
      it: { kicker: "Sito ereditato", title: ["Nessuno ha scritto", "*come è stato costruito.*"], sub: "Il rapporto nomina le tecnologie visibili in pubblico, così il team parte dai fatti.", bullets: ["Tecnologie visibili in pubblico", "I link reali, percorsi", "Primi casi di regressione"], hook: "Hai ereditato un sito. Niente documentazione, niente test, nessuna idea di cosa c’è sotto.", body: "Un’analisi della pagina pubblica nomina le tecnologie visibili, segue i link reali e propone i primi casi, così parti dai fatti e non dalle ipotesi." }
    }
  },
  {
    id: "a11y",
    art: "portal",
    layout: "problem",
    clip: { picture: "reason-a11y", line: ["LINES", "reason-a11y"] },
    cards: ["A11Y-01", "FM-01", "I18N-01"],
    tags: ["#Accessibility", "#a11y", "#axecore"],
    copy: {
      en: { kicker: "Accessibility", title: ["Keyboard. Screen reader.", "*Where do you start?*"], sub: "The accessibility cases for your public page, with axe-core named where it fits.", bullets: ["Keyboard and focus cases", "Labels, alt text, language", "axe-core named, not launched"], hook: "Someone asked whether the site works with a keyboard and a screen reader. Where would you even start?", body: "QA-lab URL Review proposes the accessibility cases for a public page and names axe-core where it applies. You leave with the list your team can run." },
      es: { kicker: "Accesibilidad", title: ["Teclado. Lector de pantalla.", "*¿Por dónde empiezas?*"], sub: "Los casos de accesibilidad de tu página pública, con axe-core nombrado donde aplica.", bullets: ["Casos de teclado y foco", "Etiquetas, texto alternativo, idioma", "axe-core nombrado, no ejecutado"], hook: "Te preguntaron si el sitio funciona con teclado y lector de pantalla. ¿Por dónde empezarías?", body: "QA-lab URL Review propone los casos de accesibilidad de una página pública y nombra axe-core donde aplica. Te llevas la lista que tu equipo puede ejecutar." },
      pt: { kicker: "Acessibilidade", title: ["Teclado. Leitor de tela.", "*Por onde começar?*"], sub: "Os casos de acessibilidade da sua página pública, com axe-core nomeado onde se aplica.", bullets: ["Casos de teclado e foco", "Rótulos, texto alternativo, idioma", "axe-core nomeado, não executado"], hook: "Perguntaram se o site funciona com teclado e leitor de tela. Por onde você começaria?", body: "O QA-lab URL Review propõe os casos de acessibilidade de uma página pública e nomeia o axe-core onde se aplica. Você leva a lista que sua equipe pode executar." },
      de: { kicker: "Barrierefreiheit", title: ["Tastatur. Screenreader.", "*Wo fangen Sie an?*"], sub: "Die Barrierefreiheitsfälle für Ihre öffentliche Seite, mit axe-core, wo es passt.", bullets: ["Fälle für Tastatur und Fokus", "Labels, Alternativtext, Sprache", "axe-core genannt, nicht gestartet"], hook: "Jemand fragt, ob die Website mit Tastatur und Screenreader funktioniert. Wo würden Sie anfangen?", body: "QA-lab URL Review schlägt die Barrierefreiheitsfälle für eine öffentliche Seite vor und nennt axe-core, wo es passt. Sie gehen mit der Liste, die Ihr Team ausführen kann." },
      fr: { kicker: "Accessibilité", title: ["Clavier. Lecteur d’écran.", "*Par où commencer ?*"], sub: "Les cas d’accessibilité de votre page publique, avec axe-core nommé là où il s’applique.", bullets: ["Cas clavier et focus", "Libellés, texte alternatif, langue", "axe-core nommé, pas lancé"], hook: "On vous demande si le site marche au clavier et avec un lecteur d’écran. Par où commenceriez-vous ?", body: "QA-lab URL Review propose les cas d’accessibilité d’une page publique et nomme axe-core là où il s’applique. Vous repartez avec la liste que votre équipe peut exécuter." },
      it: { kicker: "Accessibilità", title: ["Tastiera. Lettore di schermo.", "*Da dove inizi?*"], sub: "I casi di accessibilità della tua pagina pubblica, con axe-core nominato dove serve.", bullets: ["Casi di tastiera e focus", "Etichette, testo alternativo, lingua", "axe-core nominato, non avviato"], hook: "Ti chiedono se il sito funziona con tastiera e lettore di schermo. Da dove inizieresti?", body: "QA-lab URL Review propone i casi di accessibilità di una pagina pubblica e nomina axe-core dove serve. Esci con la lista che il team può eseguire." }
    }
  },
  {
    id: "security",
    art: "streams",
    layout: "signals",
    clip: { picture: "reason-security", line: ["LINES", "reason-security"] },
    marks: [["HTTPS", true], ["HSTS", false], ["CSP", false], ["nosniff", false]],
    tags: ["#WebSecurity", "#HTTPHeaders"],
    copy: {
      en: { kicker: "Public signals", title: ["Missing HSTS? Missing CSP?", "*Signals, not proof.*"], sub: "See what a public response leaves in the open, before anyone calls it a break-in.", bullets: ["HTTPS, HSTS, CSP, nosniff", "Found in the public response", "A signal for a later check"], hook: "Your public response headers say more than you think.", body: "The review lists the security marks a public response shows, like HTTPS, HSTS, CSP, and nosniff, as signals for a later check. It is not a penetration test and not proof of a break-in." },
      es: { kicker: "Señales públicas", title: ["¿Falta HSTS? ¿Falta CSP?", "*Señales, no pruebas.*"], sub: "Mira qué deja abierto una respuesta pública, antes de que alguien lo llame intrusión.", bullets: ["HTTPS, HSTS, CSP, nosniff", "Hallado en la respuesta pública", "Una señal para revisar después"], hook: "Las cabeceras de tu respuesta pública dicen más de lo que crees.", body: "La revisión lista las marcas de seguridad que muestra una respuesta pública, como HTTPS, HSTS, CSP y nosniff, como señales para revisar después. No es una prueba de penetración ni la prueba de una intrusión." },
      pt: { kicker: "Sinais públicos", title: ["Falta HSTS? Falta CSP?", "*Sinais, não provas.*"], sub: "Veja o que uma resposta pública deixa à vista, antes de alguém chamar isso de invasão.", bullets: ["HTTPS, HSTS, CSP, nosniff", "Encontrado na resposta pública", "Um sinal para checar depois"], hook: "Os cabeçalhos da sua resposta pública dizem mais do que você imagina.", body: "A revisão lista as marcas de segurança que uma resposta pública mostra, como HTTPS, HSTS, CSP e nosniff, como sinais para checar depois. Não é um teste de invasão nem prova de invasão." },
      de: { kicker: "Öffentliche Signale", title: ["HSTS fehlt? CSP fehlt?", "*Signale, keine Beweise.*"], sub: "Sehen Sie, was eine öffentliche Antwort offenlässt, bevor jemand es einen Einbruch nennt.", bullets: ["HTTPS, HSTS, CSP, nosniff", "In der öffentlichen Antwort gefunden", "Ein Signal für eine spätere Prüfung"], hook: "Die Header Ihrer öffentlichen Antwort verraten mehr, als Sie denken.", body: "Die Prüfung listet die Sicherheitsmerkmale einer öffentlichen Antwort, etwa HTTPS, HSTS, CSP und nosniff, als Signale für eine spätere Prüfung. Kein Penetrationstest und kein Beweis für einen Einbruch." },
      fr: { kicker: "Signaux publics", title: ["HSTS absent ? CSP absent ?", "*Des signaux, pas des preuves.*"], sub: "Voyez ce qu’une réponse publique laisse ouvert, avant que quelqu’un parle d’intrusion.", bullets: ["HTTPS, HSTS, CSP, nosniff", "Trouvé dans la réponse publique", "Un signal pour un contrôle plus tard"], hook: "Les en-têtes de votre réponse publique en disent plus que vous ne pensez.", body: "La revue liste les marques de sécurité d’une réponse publique, comme HTTPS, HSTS, CSP et nosniff, comme signaux pour un contrôle plus tard. Ce n’est ni un test d’intrusion ni la preuve d’une intrusion." },
      it: { kicker: "Segnali pubblici", title: ["Manca HSTS? Manca CSP?", "*Segnali, non prove.*"], sub: "Guarda cosa lascia in vista una risposta pubblica, prima che qualcuno lo chiami intrusione.", bullets: ["HTTPS, HSTS, CSP, nosniff", "Trovato nella risposta pubblica", "Un segnale per un controllo successivo"], hook: "Le intestazioni della tua risposta pubblica dicono più di quanto pensi.", body: "La revisione elenca i segni di sicurezza di una risposta pubblica, come HTTPS, HSTS, CSP e nosniff, come segnali per un controllo successivo. Non è un penetration test né la prova di un’intrusione." }
    }
  },
  {
    id: "performance",
    art: "field",
    layout: "chart",
    clip: { picture: "reason-performance", line: ["LINES", "reason-performance"] },
    bars: [["/", 180], ["/about", 140], ["/pricing", 310], ["/blog", 220], ["/contact", 120], ["/docs", 260]],
    tags: ["#PerformanceTesting", "#LoadTesting"],
    copy: {
      en: { kicker: "Performance", title: ["“It feels slow”", "*is not a budget.*"], sub: "Response time for every page analyzed, plus performance and load cases for a later run.", chart: "Response time across the pages analyzed · example", bullets: ["Response time per page analyzed", "Performance and load cases", "No load is generated"], hook: "“It feels slow” is not a performance budget.", body: "The report charts the response time of each page it analyzed and proposes performance and load cases, naming JMeter, Gatling, k6, or Lighthouse where they fit. Nothing is generated against your site." },
      es: { kicker: "Rendimiento", title: ["“Se siente lento”", "*no es un presupuesto.*"], sub: "Tiempo de respuesta de cada página analizada, más casos de rendimiento y carga para después.", chart: "Tiempo de respuesta por página analizada · ejemplo", bullets: ["Tiempo de respuesta por página", "Casos de rendimiento y carga", "No se genera carga"], hook: "“Se siente lento” no es un presupuesto de rendimiento.", body: "El informe grafica el tiempo de respuesta de cada página analizada y propone casos de rendimiento y carga, nombrando JMeter, Gatling, k6 o Lighthouse donde aplican. No se genera carga contra tu sitio." },
      pt: { kicker: "Desempenho", title: ["“Parece lento”", "*não é um orçamento.*"], sub: "Tempo de resposta de cada página analisada, mais casos de desempenho e carga para depois.", chart: "Tempo de resposta por página analisada · exemplo", bullets: ["Tempo de resposta por página", "Casos de desempenho e carga", "Nenhuma carga é gerada"], hook: "“Parece lento” não é um orçamento de desempenho.", body: "O relatório mostra o tempo de resposta de cada página analisada e propõe casos de desempenho e carga, nomeando JMeter, Gatling, k6 ou Lighthouse onde se aplicam. Nenhuma carga é gerada contra o seu site." },
      de: { kicker: "Performance", title: ["„Fühlt sich langsam an“", "*ist kein Budget.*"], sub: "Antwortzeit jeder analysierten Seite, dazu Performance- und Lastfälle für später.", chart: "Antwortzeit der analysierten Seiten · Beispiel", bullets: ["Antwortzeit pro Seite", "Performance- und Lastfälle", "Es wird keine Last erzeugt"], hook: "„Fühlt sich langsam an“ ist kein Performance-Budget.", body: "Der Bericht zeigt die Antwortzeit jeder analysierten Seite und schlägt Performance- und Lastfälle vor, mit JMeter, Gatling, k6 oder Lighthouse, wo sie passen. Gegen Ihre Website wird keine Last erzeugt." },
      fr: { kicker: "Performance", title: ["« Ça semble lent »", "*n’est pas un budget.*"], sub: "Le temps de réponse de chaque page analysée, plus des cas de performance et de charge pour plus tard.", chart: "Temps de réponse des pages analysées · exemple", bullets: ["Temps de réponse par page", "Cas de performance et de charge", "Aucune charge n’est générée"], hook: "« Ça semble lent » n’est pas un budget de performance.", body: "Le rapport trace le temps de réponse de chaque page analysée et propose des cas de performance et de charge, en nommant JMeter, Gatling, k6 ou Lighthouse quand ils conviennent. Aucune charge n’est générée contre votre site." },
      it: { kicker: "Prestazioni", title: ["“Sembra lento”", "*non è un budget.*"], sub: "Il tempo di risposta di ogni pagina analizzata, più casi di prestazioni e carico per dopo.", chart: "Tempo di risposta delle pagine analizzate · esempio", bullets: ["Tempo di risposta per pagina", "Casi di prestazioni e carico", "Nessun carico generato"], hook: "“Sembra lento” non è un budget di prestazioni.", body: "Il rapporto mostra il tempo di risposta di ogni pagina analizzata e propone casi di prestazioni e carico, nominando JMeter, Gatling, k6 o Lighthouse dove servono. Nessun carico viene generato contro il tuo sito." }
    }
  },
  {
    id: "exports",
    art: "layers",
    layout: "tiles",
    tiles: "exports",
    carousel: "exports",
    clip: { picture: "export-jira", line: ["EXPORTS", "jira"] },
    tags: ["#Jira", "#TestRail", "#Xray", "#AzureDevOps"],
    copy: {
      en: { kicker: "Exports", title: ["From one URL", "*to your tracker.*"], sub: "Import-ready files for Jira with Xray, TestRail, Zephyr, Azure DevOps, Mantis, and Excel.", bullets: ["A CSV shaped for each tool", "JSON, text, and PDF too", "The signature stays on the file"], hook: "Test cases only matter once they are in the tool your team opens every day.", body: "Export the proposed cases as files ready to import into Jira with Xray, TestRail, Zephyr, Azure DevOps, Mantis, or Excel, or as JSON, text, and PDF." },
      es: { kicker: "Exportaciones", title: ["De una URL", "*a tu gestor de pruebas.*"], sub: "Archivos listos para importar en Jira con Xray, TestRail, Zephyr, Azure DevOps, Mantis y Excel.", bullets: ["Un CSV con la forma de cada herramienta", "También JSON, texto y PDF", "La firma queda en el archivo"], hook: "Los casos de prueba solo sirven cuando están en la herramienta que tu equipo abre cada día.", body: "Exporta los casos propuestos como archivos listos para importar en Jira con Xray, TestRail, Zephyr, Azure DevOps, Mantis o Excel, o como JSON, texto y PDF." },
      pt: { kicker: "Exportações", title: ["De uma URL", "*para o seu gerenciador.*"], sub: "Arquivos prontos para importar no Jira com Xray, TestRail, Zephyr, Azure DevOps, Mantis e Excel.", bullets: ["Um CSV no formato de cada ferramenta", "Também JSON, texto e PDF", "A assinatura fica no arquivo"], hook: "Casos de teste só servem quando estão na ferramenta que sua equipe abre todo dia.", body: "Exporte os casos propostos como arquivos prontos para importar no Jira com Xray, TestRail, Zephyr, Azure DevOps, Mantis ou Excel, ou como JSON, texto e PDF." },
      de: { kicker: "Exporte", title: ["Von einer URL", "*in Ihr Testmanagement.*"], sub: "Importfertige Dateien für Jira mit Xray, TestRail, Zephyr, Azure DevOps, Mantis und Excel.", bullets: ["Ein CSV im Format jedes Werkzeugs", "Auch JSON, Text und PDF", "Die Signatur bleibt auf der Datei"], hook: "Testfälle zählen erst, wenn sie in dem Werkzeug sind, das Ihr Team täglich öffnet.", body: "Exportieren Sie die vorgeschlagenen Fälle als importfertige Dateien für Jira mit Xray, TestRail, Zephyr, Azure DevOps, Mantis oder Excel, oder als JSON, Text und PDF." },
      fr: { kicker: "Exports", title: ["D’une URL", "*à votre outil de test.*"], sub: "Des fichiers prêts à importer dans Jira avec Xray, TestRail, Zephyr, Azure DevOps, Mantis et Excel.", bullets: ["Un CSV au format de chaque outil", "Aussi JSON, texte et PDF", "La signature reste sur le fichier"], hook: "Les cas de test ne comptent qu’une fois dans l’outil que votre équipe ouvre chaque jour.", body: "Exportez les cas proposés en fichiers prêts à importer dans Jira avec Xray, TestRail, Zephyr, Azure DevOps, Mantis ou Excel, ou en JSON, texte et PDF." },
      it: { kicker: "Export", title: ["Da un URL", "*al tuo strumento di test.*"], sub: "File pronti da importare in Jira con Xray, TestRail, Zephyr, Azure DevOps, Mantis ed Excel.", bullets: ["Un CSV nel formato di ogni strumento", "Anche JSON, testo e PDF", "La firma resta sul file"], hook: "I casi di test contano solo quando sono nello strumento che il team apre ogni giorno.", body: "Esporta i casi proposti come file pronti da importare in Jira con Xray, TestRail, Zephyr, Azure DevOps, Mantis o Excel, oppure come JSON, testo e PDF." }
    }
  },
  {
    id: "layers",
    art: "nodes",
    layout: "layers",
    carousel: "layers",
    clip: { picture: "case-kinds", line: ["LINES", "case-kinds"] },
    tags: ["#TestCoverage", "#TestDesign"],
    copy: {
      en: { kicker: "21 kinds of cases", title: ["One address.", "*Every layer.*"], sub: "From functional and links to accessibility, security, SEO, GEO, performance, and resilience.", bullets: ["Keep only the kinds you will run", "The price follows what you keep", "Each case says why it is there"], hook: "Most test plans cover functional and forget the other twenty kinds.", body: "From one public address, QA-lab URL Review proposes cases across 21 kinds: functional, content, links, forms, accessibility, security, privacy, SEO, GEO, performance, load, mobile, internationalization, resilience, compatibility, media, analytics, commerce, visual, platform, and API." },
      es: { kicker: "21 tipos de casos", title: ["Una dirección.", "*Todas las capas.*"], sub: "De funcional y enlaces a accesibilidad, seguridad, SEO, GEO, rendimiento y resiliencia.", bullets: ["Quédate solo con lo que vas a ejecutar", "El precio sigue lo que conservas", "Cada caso dice por qué está"], hook: "La mayoría de los planes de prueba cubren lo funcional y olvidan los otros veinte tipos.", body: "Desde una dirección pública, QA-lab URL Review propone casos en 21 tipos: funcional, contenido, enlaces, formularios, accesibilidad, seguridad, privacidad, SEO, GEO, rendimiento, carga, móvil, internacionalización, resiliencia, compatibilidad, multimedia, analítica, comercio, visual, plataforma y API." },
      pt: { kicker: "21 tipos de casos", title: ["Um endereço.", "*Todas as camadas.*"], sub: "Do funcional e links à acessibilidade, segurança, SEO, GEO, desempenho e resiliência.", bullets: ["Fique só com o que vai executar", "O preço segue o que você mantém", "Cada caso diz por que está ali"], hook: "A maioria dos planos de teste cobre o funcional e esquece os outros vinte tipos.", body: "A partir de um endereço público, o QA-lab URL Review propõe casos em 21 tipos: funcional, conteúdo, links, formulários, acessibilidade, segurança, privacidade, SEO, GEO, desempenho, carga, mobile, internacionalização, resiliência, compatibilidade, mídia, analytics, comércio, visual, plataforma e API." },
      de: { kicker: "21 Arten von Fällen", title: ["Eine Adresse.", "*Jede Ebene.*"], sub: "Von Funktion und Links bis Barrierefreiheit, Sicherheit, SEO, GEO, Performance und Resilienz.", bullets: ["Nur behalten, was Sie ausführen", "Der Preis folgt dem, was Sie behalten", "Jeder Fall sagt, warum er da ist"], hook: "Die meisten Testpläne decken das Funktionale ab und vergessen die anderen zwanzig Arten.", body: "Aus einer öffentlichen Adresse schlägt QA-lab URL Review Fälle in 21 Arten vor: Funktion, Inhalt, Links, Formulare, Barrierefreiheit, Sicherheit, Datenschutz, SEO, GEO, Performance, Last, Mobil, Internationalisierung, Resilienz, Kompatibilität, Medien, Analytics, Commerce, Visuell, Plattform und API." },
      fr: { kicker: "21 sortes de cas", title: ["Une adresse.", "*Toutes les couches.*"], sub: "Du fonctionnel et des liens à l’accessibilité, la sécurité, le SEO, GEO, la performance et la résilience.", bullets: ["Gardez seulement ce que vous exécuterez", "Le prix suit ce que vous gardez", "Chaque cas dit pourquoi il est là"], hook: "La plupart des plans de test couvrent le fonctionnel et oublient les vingt autres sortes.", body: "À partir d’une adresse publique, QA-lab URL Review propose des cas dans 21 sortes : fonctionnel, contenu, liens, formulaires, accessibilité, sécurité, confidentialité, SEO, GEO, performance, charge, mobile, internationalisation, résilience, compatibilité, médias, analytics, commerce, visuel, plateforme et API." },
      it: { kicker: "21 tipi di casi", title: ["Un indirizzo.", "*Ogni livello.*"], sub: "Da funzionale e link ad accessibilità, sicurezza, SEO, GEO, prestazioni e resilienza.", bullets: ["Tieni solo ciò che eseguirai", "Il prezzo segue ciò che tieni", "Ogni caso dice perché c’è"], hook: "La maggior parte dei piani di test copre il funzionale e dimentica gli altri venti tipi.", body: "Da un indirizzo pubblico, QA-lab URL Review propone casi in 21 tipi: funzionale, contenuti, link, moduli, accessibilità, sicurezza, privacy, SEO, GEO, prestazioni, carico, mobile, internazionalizzazione, resilienza, compatibilità, media, analytics, commercio, visuale, piattaforma e API." }
    }
  }
];

module.exports = { LANGS, SITE, PAGES, UI, LAYERS, FRAMEWORK_TILES, EXPORT_TILES, BASE_TAGS, POSTS };
