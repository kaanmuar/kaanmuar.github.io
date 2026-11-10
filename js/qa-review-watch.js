/**
 * The "Keep it clean" subsection of the Cases card (#3391): retests for the newer security, mail and accessibility checks,
 * regression pins for a paid fix, and the scripts for each tool (dig, curl, checkdmarc, OWASP ZAP, Nuclei, axe, Pa11y,
 * Playwright and a GitHub Actions workflow). The facts come from report.watch (functions/url-review-watch.js).
 * Every value a script embeds is checked against a strict pattern first, because it was read from a public site.
 */
(function (root) {
  "use strict";

  const TOOL_GROUPS = [
    ["security", ["OWASP ZAP", "Nuclei", "checkdmarc", "dig", "curl"]],
    ["a11y", ["axe", "Pa11y"]],
    ["schedule", ["GitHub Actions"]]
  ];
  const LOGOS = {
    "OWASP ZAP": "zap.png", Nuclei: "nuclei.png", checkdmarc: "checkdmarc.svg", dig: "dig.svg", curl: "curl.svg",
    axe: "axe.svg", Pa11y: "pa11y.png", "GitHub Actions": "github-actions.svg", Playwright: "playwright.svg"
  };
  const LOGO_VERSION = "20261110";
  const KINDS = ["lists", "linked", "hacked", "lookalike", "exposed", "mail", "blocklist", "headers", "tls", "a11y"];
  const WARN_DAYS = 21;
  const BOT_UA = "Mozilla/5.0 (Linux; Android 6.0.1; Nexus 5X Build/MMB29P) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.6723.116 Mobile Safari/537.36 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)";
  const WEB_UA = "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36";
  // ZAP baseline passive rules that report what each flagged finding names.
  const ZAP_RULES = {
    "sec-csp": [["10038", "Content Security Policy (CSP) Header Not Set"]],
    "sec-frame": [["10020", "Missing Anti-clickjacking Header"]],
    "sec-nosniff": [["10021", "X-Content-Type-Options Header Missing"]],
    "sec-hsts": [["10035", "Strict-Transport-Security Header Not Set"]],
    "sec-cookies": [["10010", "Cookie No HttpOnly Flag"], ["10011", "Cookie Without Secure Flag"], ["10054", "Cookie without SameSite Attribute"]],
    "sec-mixed": [["10040", "Secure Pages Include Mixed Content"]],
    "sec-mixed-live": [["10040", "Secure Pages Include Mixed Content"]],
    "sec-permissions": [["10063", "Permissions Policy Header Not Set"]],
    "sec-version": [["10036", "Server Leaks Version Information via Server HTTP Response Header Field"]],
    "sec-coop": [["90004", "Insufficient Site Isolation Against Spectre Vulnerability"]],
    "sec-isolation": [["90004", "Insufficient Site Isolation Against Spectre Vulnerability"]]
  };

  const COPY = {
    en: {
      and: "and",
      title: "Keep it clean: retests for security, mail and accessibility",
      intro: "Written only because this review found the problem. Each case passes once the problem is gone and fails the build if it comes back. None of them was run against the site.",
      groups: { security: "Security and mail", a11y: "Accessibility", schedule: "Schedule" },
      kind: { lists: "Phishing and malware lists", linked: "Linked hosts", hacked: "Hacked-site signs", lookalike: "Lookalike domains", exposed: "Exposed files", mail: "Mail authentication", blocklist: "Spam blocklists", headers: "Security baseline", tls: "Certificate and uptime", a11y: "Accessibility", regression: "Fix regression" },
      verdict: { fail: "fails", risk: "at risk", person: "needs a person", pass: "passes", gone: "no longer flagged" },
      owners: "Owners only",
      lists: ["Off {lists} after the cleanup", "This review found {host} on a phishing or malware list. Clean the site, then ask each list for a review at its link. The case fails while any list still names the site."],
      listsAny: "Off every phishing and malware list after the cleanup",
      review: "Ask {name} for a review",
      scan: "What {name} shows now",
      linked: ["Every third-party host on {host} stays clean", "Google's Safe Browsing list flagged {n} {n:host|hosts} linked from the pages{hosts}. The case collects every script, iframe, form and link host on the same pages, checks them again and fails the build if a flagged host returns."],
      hacked: ["No hacked-site signs on {domain}", "This review saw signs of a hacked site. The case checks that a site: search shows no spam pages, that Googlebot and a visitor get the same title and scripts, and that no hidden link points to spam{terms}."],
      terms: " (terms: {list})",
      lookalike: ["Watch {n} lookalike {n:domain|domains} of {domain}", "These registered names imitate {domain}. The case records what each one serves today and alerts when one starts serving a website or mail."],
      serves: { web: "website", mx: "mail", nothing: "nothing yet" },
      exposed: ["Private files on {host} stay closed", "This review read {n} {n:file|files} that should never be public. The case requests each path and passes only on 401, 403, 404 or 410."],
      mail: ["SPF, DKIM and DMARC for {domain} parse and meet policy", "The case expects one SPF record within 10 DNS lookups that ends in -all or ~all, one DMARC record with p=quarantine or p=reject and a report address, and a DKIM key on each selector you name."],
      blocklist: ["{domain} and its servers stay off the spam blocklists", "The case asks {lists} about {targets} and fails on any listing. Barracuda answers only registered resolvers, so a silent answer from it is not a pass."],
      listedOn: "Listed now: {list}",
      headers: ["Passive security baseline for {host}", "OWASP ZAP's baseline scan and Nuclei's exposure and misconfiguration templates recheck the headers and cookies this review flagged. Both run only with the owner's written permission."],
      tls: ["The certificate on {host} renews in time and the site answers", "The case fails when fewer than 21 days are left on the certificate{date}, when the chain is incomplete, or when the start page stops answering."],
      date: " (it expires on {date})",
      a11y: ["Accessibility retest with axe and Pa11y on {n} {n:page|pages}", "axe-core, through @axe-core/playwright, and Pa11y rerun WCAG 2.1 AA on the pages where this review found problems{rules}. Any violation fails the build."],
      rules: " (axe rules: {list})",
      fixTitle: "Fixed by your fix package: keep it fixed",
      fixIntro: "The re-review marked these findings fixed. Each pin reruns its cases every day, so a fix cannot quietly come undone.",
      keep: "Keep fixed: {title}",
      beforeAfter: "Before the fix: {before}. Now: {after}.",
      runs: "Cases to rerun: {cases}",
      download: "Download the watch scripts (.zip)",
      locked: "The scripts open with the full report.",
      schedule: "The download includes a GitHub Actions workflow that runs every check each day. OWASP ZAP and Nuclei run only when the repository variable OWNER_APPROVED is yes.",
      readmeIntro: "Watch scripts for {base}, written from a public analysis by QA-lab URL Review. They were not run by QA-lab.",
      readmeRun: "How to run",
      readmeEnv: "Optional settings",
      readmeEnvText: "WEBRISK_KEY (Google Web Risk), URLHAUS_AUTH_KEY, BRAVE_API_KEY (search for spam pages) and DKIM_SELECTORS are read from the environment; without them those checks print a NOTE. OWNER_APPROVED=yes starts OWASP ZAP and Nuclei; set it only with the owner's written permission.",
      readmePins: "Fix regressions"
    },
    de: {
      and: "und",
      title: "Sauber bleiben: Nachtests für Sicherheit, E-Mail und Barrierefreiheit",
      intro: "Nur geschrieben, weil diese Prüfung das Problem gefunden hat. Jeder Fall besteht, sobald das Problem weg ist, und lässt den Build scheitern, wenn es zurückkommt. Keiner davon wurde gegen die Website ausgeführt.",
      groups: { security: "Sicherheit und E-Mail", a11y: "Barrierefreiheit", schedule: "Zeitplan" },
      kind: { lists: "Phishing- und Malware-Listen", linked: "Verlinkte Hosts", hacked: "Anzeichen eines Hacks", lookalike: "Ähnliche Domains", exposed: "Offene Dateien", mail: "E-Mail-Authentifizierung", blocklist: "Spam-Blocklisten", headers: "Sicherheits-Basisscan", tls: "Zertifikat und Erreichbarkeit", a11y: "Barrierefreiheit", regression: "Rückfall nach Behebung" },
      verdict: { fail: "fehlgeschlagen", risk: "gefährdet", person: "braucht eine Person", pass: "bestanden", gone: "nicht mehr gemeldet" },
      owners: "Nur für Inhaber",
      lists: ["Nach der Bereinigung nicht mehr auf {lists}", "Diese Prüfung hat {host} auf einer Phishing- oder Malware-Liste gefunden. Bereinigen Sie die Website und beantragen Sie dann bei jeder Liste über ihren Link eine Überprüfung. Der Fall schlägt fehl, solange eine Liste die Website noch nennt."],
      listsAny: "Nach der Bereinigung auf keiner Phishing- oder Malware-Liste mehr",
      review: "Überprüfung bei {name} beantragen",
      scan: "Was {name} jetzt zeigt",
      linked: ["Jeder Drittanbieter-Host auf {host} bleibt sauber", "Googles Safe-Browsing-Liste hat {n} von den Seiten {n:verlinkten Host|verlinkte Hosts} markiert{hosts}. Der Fall sammelt jeden Script-, iframe-, Formular- und Link-Host auf denselben Seiten, prüft sie erneut und lässt den Build scheitern, wenn ein markierter Host zurückkehrt."],
      hacked: ["Keine Anzeichen eines Hacks auf {domain}", "Diese Prüfung hat Anzeichen einer gehackten Website gesehen. Der Fall prüft, dass eine site:-Suche keine Spam-Seiten zeigt, dass Googlebot und Besucher denselben Titel und dieselben Scripts erhalten und dass kein versteckter Link auf Spam zeigt{terms}."],
      terms: " (Begriffe: {list})",
      lookalike: ["{n} ähnliche {n:Domain|Domains} von {domain} beobachten", "Diese registrierten Namen ahmen {domain} nach. Der Fall hält fest, was jede heute bereitstellt, und schlägt Alarm, wenn eine beginnt, eine Website oder E-Mail zu bedienen."],
      serves: { web: "Website", mx: "E-Mail", nothing: "noch nichts" },
      exposed: ["Private Dateien auf {host} bleiben geschlossen", "Diese Prüfung hat {n} {n:Datei|Dateien} gelesen, die nie öffentlich sein dürften. Der Fall ruft jeden Pfad ab und besteht nur bei 401, 403, 404 oder 410."],
      mail: ["SPF, DKIM und DMARC für {domain} sind gültig und erfüllen die Richtlinie", "Der Fall erwartet genau einen SPF-Eintrag mit höchstens 10 DNS-Abfragen, der auf -all oder ~all endet, genau einen DMARC-Eintrag mit p=quarantine oder p=reject und einer Berichtsadresse sowie einen DKIM-Schlüssel für jeden Selektor, den Sie nennen."],
      blocklist: ["{domain} und seine Server bleiben von den Spam-Blocklisten fern", "Der Fall fragt {lists} nach {targets} und schlägt bei jedem Eintrag fehl. Barracuda antwortet nur registrierten Resolvern, eine stumme Antwort von dort ist also kein Bestehen."],
      listedOn: "Aktuell gelistet: {list}",
      headers: ["Passiver Sicherheits-Basisscan für {host}", "Der Baseline-Scan von OWASP ZAP und die Exposure- und Misconfiguration-Vorlagen von Nuclei prüfen erneut die Header und Cookies, die diese Prüfung bemängelt hat. Beide laufen nur mit der schriftlichen Erlaubnis des Inhabers."],
      tls: ["Das Zertifikat von {host} wird rechtzeitig erneuert und die Website antwortet", "Der Fall schlägt fehl, wenn das Zertifikat weniger als 21 Tage gültig ist{date}, wenn die Kette unvollständig ist oder wenn die Startseite nicht mehr antwortet."],
      date: " (es läuft am {date} ab)",
      a11y: ["Barrierefreiheit erneut prüfen mit axe und Pa11y auf {n} {n:Seite|Seiten}", "axe-core über @axe-core/playwright und Pa11y prüfen WCAG 2.1 AA erneut auf den Seiten, auf denen diese Prüfung Probleme gefunden hat{rules}. Jeder Verstoß lässt den Build scheitern."],
      rules: " (axe-Regeln: {list})",
      fixTitle: "Durch Ihr Behebungspaket behoben: so soll es bleiben",
      fixIntro: "Die erneute Prüfung hat diese Befunde als behoben markiert. Jede Fixierung führt ihre Fälle täglich erneut aus, damit eine Behebung nicht unbemerkt verloren geht.",
      keep: "Behoben halten: {title}",
      beforeAfter: "Vor der Behebung: {before}. Jetzt: {after}.",
      runs: "Erneut auszuführende Fälle: {cases}",
      download: "Watch-Skripte herunterladen (.zip)",
      locked: "Die Skripte öffnen sich mit dem vollständigen Bericht.",
      schedule: "Der Download enthält einen GitHub-Actions-Workflow, der jede Prüfung täglich ausführt. OWASP ZAP und Nuclei laufen nur, wenn die Repository-Variable OWNER_APPROVED auf yes steht.",
      readmeIntro: "Watch-Skripte für {base}, geschrieben aus einer öffentlichen Analyse von QA-lab URL Review. QA-lab hat sie nicht ausgeführt.",
      readmeRun: "So führen Sie sie aus",
      readmeEnv: "Optionale Einstellungen",
      readmeEnvText: "WEBRISK_KEY (Google Web Risk), URLHAUS_AUTH_KEY, BRAVE_API_KEY (Suche nach Spam-Seiten) und DKIM_SELECTORS werden aus der Umgebung gelesen; ohne sie geben diese Prüfungen einen NOTE-Hinweis aus. OWNER_APPROVED=yes startet OWASP ZAP und Nuclei; setzen Sie es nur mit der schriftlichen Erlaubnis des Inhabers.",
      readmePins: "Rückfälle nach Behebung"
    },
    es: {
      and: "y",
      title: "Mantenerlo limpio: repruebas de seguridad, correo y accesibilidad",
      intro: "Escritas solo porque esta revisión encontró el problema. Cada caso pasa cuando el problema desaparece y hace fallar el build si vuelve. Ninguno se ejecutó contra el sitio.",
      groups: { security: "Seguridad y correo", a11y: "Accesibilidad", schedule: "Programación" },
      kind: { lists: "Listas de phishing y malware", linked: "Hosts enlazados", hacked: "Señales de hackeo", lookalike: "Dominios parecidos", exposed: "Archivos expuestos", mail: "Autenticación del correo", blocklist: "Listas negras de spam", headers: "Línea base de seguridad", tls: "Certificado y disponibilidad", a11y: "Accesibilidad", regression: "Regresión de un arreglo" },
      verdict: { fail: "falla", risk: "en riesgo", person: "necesita a una persona", pass: "pasa", gone: "ya no aparece" },
      owners: "Solo propietarios",
      lists: ["Fuera de {lists} tras la limpieza", "Esta revisión encontró {host} en una lista de phishing o malware. Limpia el sitio y luego pide a cada lista una revisión en su enlace. El caso falla mientras alguna lista siga nombrando el sitio."],
      listsAny: "Fuera de toda lista de phishing y malware tras la limpieza",
      review: "Pedir una revisión a {name}",
      scan: "Lo que muestra {name} ahora",
      linked: ["Cada host de terceros en {host} sigue limpio", "La lista de Navegación segura de Google marcó {n} {n:host enlazado|hosts enlazados} desde las páginas{hosts}. El caso reúne cada host de scripts, iframes, formularios y enlaces de esas mismas páginas, los vuelve a comprobar y hace fallar el build si vuelve un host marcado."],
      hacked: ["Sin señales de hackeo en {domain}", "Esta revisión vio señales de un sitio hackeado. El caso comprueba que una búsqueda site: no muestre páginas de spam, que Googlebot y un visitante reciban el mismo título y los mismos scripts, y que ningún enlace oculto apunte a spam{terms}."],
      terms: " (términos: {list})",
      lookalike: ["Vigilar {n} {n:dominio parecido|dominios parecidos} a {domain}", "Estos nombres registrados imitan a {domain}. El caso anota lo que sirve cada uno hoy y avisa cuando uno empieza a servir una web o correo."],
      serves: { web: "web", mx: "correo", nothing: "nada por ahora" },
      exposed: ["Los archivos privados de {host} siguen cerrados", "Esta revisión leyó {n} {n:archivo|archivos} que nunca deberían ser públicos. El caso pide cada ruta y solo pasa con 401, 403, 404 o 410."],
      mail: ["SPF, DKIM y DMARC de {domain} se leen bien y cumplen la política", "El caso espera un solo registro SPF con 10 consultas DNS como máximo que termine en -all o ~all, un solo registro DMARC con p=quarantine o p=reject y una dirección de informes, y una clave DKIM en cada selector que indiques."],
      blocklist: ["{domain} y sus servidores siguen fuera de las listas negras de spam", "El caso consulta {lists} sobre {targets} y falla ante cualquier inclusión. Barracuda solo responde a resolvers registrados, así que su silencio no cuenta como aprobado."],
      listedOn: "En lista ahora: {list}",
      headers: ["Línea base de seguridad pasiva de {host}", "El escaneo baseline de OWASP ZAP y las plantillas de exposición y mala configuración de Nuclei vuelven a comprobar los encabezados y cookies que señaló esta revisión. Ambos se ejecutan solo con el permiso por escrito del propietario."],
      tls: ["El certificado de {host} se renueva a tiempo y el sitio responde", "El caso falla cuando al certificado le quedan menos de 21 días{date}, cuando la cadena está incompleta o cuando la página de inicio deja de responder."],
      date: " (vence el {date})",
      a11y: ["Reprueba de accesibilidad con axe y Pa11y en {n} {n:página|páginas}", "axe-core, mediante @axe-core/playwright, y Pa11y vuelven a pasar WCAG 2.1 AA en las páginas donde esta revisión encontró problemas{rules}. Cualquier infracción hace fallar el build."],
      rules: " (reglas de axe: {list})",
      fixTitle: "Arreglado con tu paquete: que siga arreglado",
      fixIntro: "La nueva revisión marcó estos hallazgos como arreglados. Cada fijación vuelve a ejecutar sus casos cada día, para que un arreglo no se deshaga sin que nadie lo note.",
      keep: "Mantener arreglado: {title}",
      beforeAfter: "Antes del arreglo: {before}. Ahora: {after}.",
      runs: "Casos que se vuelven a ejecutar: {cases}",
      download: "Descargar los scripts de vigilancia (.zip)",
      locked: "Los scripts se abren con el informe completo.",
      schedule: "La descarga incluye un workflow de GitHub Actions que ejecuta cada comprobación a diario. OWASP ZAP y Nuclei solo se ejecutan cuando la variable del repositorio OWNER_APPROVED vale yes.",
      readmeIntro: "Scripts de vigilancia para {base}, escritos a partir de un análisis público de QA-lab URL Review. QA-lab no los ejecutó.",
      readmeRun: "Cómo ejecutarlos",
      readmeEnv: "Ajustes opcionales",
      readmeEnvText: "WEBRISK_KEY (Google Web Risk), URLHAUS_AUTH_KEY, BRAVE_API_KEY (búsqueda de páginas de spam) y DKIM_SELECTORS se leen del entorno; sin ellas, esas comprobaciones imprimen un NOTE. OWNER_APPROVED=yes inicia OWASP ZAP y Nuclei; actívala solo con el permiso por escrito del propietario.",
      readmePins: "Regresiones de arreglos"
    },
    fr: {
      and: "et",
      title: "Rester propre : contre-tests sécurité, e-mail et accessibilité",
      intro: "Écrits uniquement parce que cette analyse a trouvé le problème. Chaque cas passe une fois le problème disparu et fait échouer le build s’il revient. Aucun n’a été lancé contre le site.",
      groups: { security: "Sécurité et e-mail", a11y: "Accessibilité", schedule: "Planification" },
      kind: { lists: "Listes de phishing et de malware", linked: "Hôtes liés", hacked: "Signes de piratage", lookalike: "Domaines sosies", exposed: "Fichiers exposés", mail: "Authentification des e-mails", blocklist: "Listes noires de spam", headers: "Base de sécurité", tls: "Certificat et disponibilité", a11y: "Accessibilité", regression: "Régression d’un correctif" },
      verdict: { fail: "échoue", risk: "à risque", person: "demande une personne", pass: "réussit", gone: "n’est plus signalé" },
      owners: "Propriétaires uniquement",
      lists: ["Retiré de {lists} après le nettoyage", "Cette analyse a trouvé {host} sur une liste de phishing ou de malware. Nettoyez le site, puis demandez à chaque liste un réexamen via son lien. Le cas échoue tant qu’une liste nomme encore le site."],
      listsAny: "Retiré de toute liste de phishing et de malware après le nettoyage",
      review: "Demander un réexamen à {name}",
      scan: "Ce que {name} affiche maintenant",
      linked: ["Chaque hôte tiers de {host} reste sain", "La liste Safe Browsing de Google a signalé {n} {n:hôte lié|hôtes liés} depuis les pages{hosts}. Le cas relève chaque hôte de script, d’iframe, de formulaire et de lien sur ces mêmes pages, les revérifie et fait échouer le build si un hôte signalé revient."],
      hacked: ["Aucun signe de piratage sur {domain}", "Cette analyse a vu des signes de site piraté. Le cas vérifie qu’une recherche site: ne montre aucune page de spam, que Googlebot et un visiteur reçoivent le même titre et les mêmes scripts, et qu’aucun lien caché ne mène vers du spam{terms}."],
      terms: " (termes : {list})",
      lookalike: ["Surveiller {n} {n:domaine sosie|domaines sosies} de {domain}", "Ces noms enregistrés imitent {domain}. Le cas note ce que chacun sert aujourd’hui et alerte quand l’un commence à servir un site ou des e-mails."],
      serves: { web: "site web", mx: "e-mail", nothing: "rien pour l’instant" },
      exposed: ["Les fichiers privés de {host} restent fermés", "Cette analyse a lu {n} {n:fichier|fichiers} qui ne devraient jamais être publics. Le cas demande chaque chemin et ne passe qu’avec 401, 403, 404 ou 410."],
      mail: ["SPF, DKIM et DMARC de {domain} sont valides et respectent la politique", "Le cas attend un seul enregistrement SPF d’au plus 10 requêtes DNS se terminant par -all ou ~all, un seul enregistrement DMARC avec p=quarantine ou p=reject et une adresse de rapport, et une clé DKIM pour chaque sélecteur que vous indiquez."],
      blocklist: ["{domain} et ses serveurs restent hors des listes noires de spam", "Le cas interroge {lists} sur {targets} et échoue à la moindre inscription. Barracuda ne répond qu’aux résolveurs enregistrés : son silence ne vaut pas réussite."],
      listedOn: "Inscrit en ce moment : {list}",
      headers: ["Base de sécurité passive pour {host}", "Le scan baseline d’OWASP ZAP et les modèles d’exposition et de mauvaise configuration de Nuclei revérifient les en-têtes et cookies signalés par cette analyse. Les deux ne tournent qu’avec l’autorisation écrite du propriétaire."],
      tls: ["Le certificat de {host} est renouvelé à temps et le site répond", "Le cas échoue quand il reste moins de 21 jours au certificat{date}, quand la chaîne est incomplète ou quand la page d’accueil ne répond plus."],
      date: " (il expire le {date})",
      a11y: ["Contre-test d’accessibilité avec axe et Pa11y sur {n} {n:page|pages}", "axe-core, via @axe-core/playwright, et Pa11y relancent WCAG 2.1 AA sur les pages où cette analyse a trouvé des problèmes{rules}. La moindre violation fait échouer le build."],
      rules: " (règles axe : {list})",
      fixTitle: "Corrigé par votre forfait : que ça le reste",
      fixIntro: "La nouvelle analyse a marqué ces constats comme corrigés. Chaque épingle relance ses cas chaque jour, pour qu’un correctif ne se défasse pas en silence.",
      keep: "Garder corrigé : {title}",
      beforeAfter: "Avant le correctif : {before}. Maintenant : {after}.",
      runs: "Cas à relancer : {cases}",
      download: "Télécharger les scripts de surveillance (.zip)",
      locked: "Les scripts s’ouvrent avec le rapport complet.",
      schedule: "Le téléchargement contient un workflow GitHub Actions qui lance chaque vérification tous les jours. OWASP ZAP et Nuclei ne tournent que si la variable de dépôt OWNER_APPROVED vaut yes.",
      readmeIntro: "Scripts de surveillance pour {base}, écrits à partir d’une analyse publique de QA-lab URL Review. QA-lab ne les a pas exécutés.",
      readmeRun: "Comment les lancer",
      readmeEnv: "Réglages facultatifs",
      readmeEnvText: "WEBRISK_KEY (Google Web Risk), URLHAUS_AUTH_KEY, BRAVE_API_KEY (recherche de pages de spam) et DKIM_SELECTORS sont lus dans l’environnement ; sans eux, ces vérifications affichent un NOTE. OWNER_APPROVED=yes lance OWASP ZAP et Nuclei ; ne le définissez qu’avec l’autorisation écrite du propriétaire.",
      readmePins: "Régressions des correctifs"
    },
    it: {
      and: "e",
      title: "Tenerlo pulito: ritest di sicurezza, e-mail e accessibilità",
      intro: "Scritti solo perché questa revisione ha trovato il problema. Ogni caso passa quando il problema sparisce e fa fallire la build se ritorna. Nessuno è stato eseguito contro il sito.",
      groups: { security: "Sicurezza ed e-mail", a11y: "Accessibilità", schedule: "Pianificazione" },
      kind: { lists: "Liste di phishing e malware", linked: "Host collegati", hacked: "Segni di un sito violato", lookalike: "Domini sosia", exposed: "File esposti", mail: "Autenticazione della posta", blocklist: "Blocklist anti-spam", headers: "Base di sicurezza", tls: "Certificato e disponibilità", a11y: "Accessibilità", regression: "Regressione di una correzione" },
      verdict: { fail: "fallisce", risk: "a rischio", person: "richiede una persona", pass: "passa", gone: "non più segnalato" },
      owners: "Solo proprietari",
      lists: ["Fuori da {lists} dopo la pulizia", "Questa revisione ha trovato {host} in una lista di phishing o malware. Pulisci il sito, poi chiedi a ogni lista una revisione dal suo link. Il caso fallisce finché una lista nomina ancora il sito."],
      listsAny: "Fuori da ogni lista di phishing e malware dopo la pulizia",
      review: "Chiedi una revisione a {name}",
      scan: "Cosa mostra {name} adesso",
      linked: ["Ogni host di terze parti su {host} resta pulito", "La lista Navigazione sicura di Google ha segnalato {n} {n:host collegato|host collegati} dalle pagine{hosts}. Il caso raccoglie ogni host di script, iframe, moduli e link nelle stesse pagine, li ricontrolla e fa fallire la build se torna un host segnalato."],
      hacked: ["Nessun segno di violazione su {domain}", "Questa revisione ha visto segni di un sito violato. Il caso controlla che una ricerca site: non mostri pagine di spam, che Googlebot e un visitatore ricevano lo stesso titolo e gli stessi script, e che nessun link nascosto punti allo spam{terms}."],
      terms: " (termini: {list})",
      lookalike: ["Sorveglia {n} {n:dominio sosia|domini sosia} di {domain}", "Questi nomi registrati imitano {domain}. Il caso annota cosa serve ciascuno oggi e avvisa quando uno inizia a servire un sito o la posta."],
      serves: { web: "sito", mx: "posta", nothing: "niente per ora" },
      exposed: ["I file privati di {host} restano chiusi", "Questa revisione ha letto {n} file che non dovrebbero mai essere pubblici. Il caso richiede ogni percorso e passa solo con 401, 403, 404 o 410."],
      mail: ["SPF, DKIM e DMARC di {domain} sono validi e rispettano la policy", "Il caso si aspetta un solo record SPF entro 10 query DNS che termini con -all o ~all, un solo record DMARC con p=quarantine o p=reject e un indirizzo per i report, e una chiave DKIM per ogni selettore che indichi."],
      blocklist: ["{domain} e i suoi server restano fuori dalle blocklist anti-spam", "Il caso interroga {lists} su {targets} e fallisce a ogni inserimento. Barracuda risponde solo ai resolver registrati, quindi un suo silenzio non vale come superato."],
      listedOn: "In lista ora: {list}",
      headers: ["Base di sicurezza passiva per {host}", "La scansione baseline di OWASP ZAP e i template di esposizione e configurazione errata di Nuclei ricontrollano gli header e i cookie segnalati da questa revisione. Entrambi girano solo con il permesso scritto del proprietario."],
      tls: ["Il certificato di {host} si rinnova in tempo e il sito risponde", "Il caso fallisce quando al certificato restano meno di 21 giorni{date}, quando la catena è incompleta o quando la pagina iniziale smette di rispondere."],
      date: " (scade il {date})",
      a11y: ["Ritest di accessibilità con axe e Pa11y su {n} {n:pagina|pagine}", "axe-core, tramite @axe-core/playwright, e Pa11y ripetono WCAG 2.1 AA sulle pagine dove questa revisione ha trovato problemi{rules}. Qualsiasi violazione fa fallire la build."],
      rules: " (regole axe: {list})",
      fixTitle: "Corretto con il tuo pacchetto: che resti corretto",
      fixIntro: "La nuova revisione ha segnato questi rilievi come corretti. Ogni blocco riesegue i suoi casi ogni giorno, così una correzione non si annulla in silenzio.",
      keep: "Mantieni corretto: {title}",
      beforeAfter: "Prima della correzione: {before}. Ora: {after}.",
      runs: "Casi da rieseguire: {cases}",
      download: "Scarica gli script di sorveglianza (.zip)",
      locked: "Gli script si aprono con il report completo.",
      schedule: "Il download include un workflow GitHub Actions che esegue ogni controllo ogni giorno. OWASP ZAP e Nuclei girano solo quando la variabile del repository OWNER_APPROVED vale yes.",
      readmeIntro: "Script di sorveglianza per {base}, scritti a partire da un’analisi pubblica di QA-lab URL Review. QA-lab non li ha eseguiti.",
      readmeRun: "Come eseguirli",
      readmeEnv: "Impostazioni facoltative",
      readmeEnvText: "WEBRISK_KEY (Google Web Risk), URLHAUS_AUTH_KEY, BRAVE_API_KEY (ricerca di pagine di spam) e DKIM_SELECTORS vengono letti dall’ambiente; senza di essi quei controlli stampano un NOTE. OWNER_APPROVED=yes avvia OWASP ZAP e Nuclei; impostalo solo con il permesso scritto del proprietario.",
      readmePins: "Regressioni delle correzioni"
    },
    pt: {
      and: "e",
      title: "Manter limpo: retestes de segurança, e-mail e acessibilidade",
      intro: "Escritos só porque esta revisão encontrou o problema. Cada caso passa quando o problema some e faz o build falhar se ele voltar. Nenhum foi executado contra o site.",
      groups: { security: "Segurança e e-mail", a11y: "Acessibilidade", schedule: "Agendamento" },
      kind: { lists: "Listas de phishing e malware", linked: "Hosts vinculados", hacked: "Sinais de invasão", lookalike: "Domínios parecidos", exposed: "Arquivos expostos", mail: "Autenticação de e-mail", blocklist: "Listas de bloqueio de spam", headers: "Linha de base de segurança", tls: "Certificado e disponibilidade", a11y: "Acessibilidade", regression: "Regressão de uma correção" },
      verdict: { fail: "falha", risk: "em risco", person: "precisa de uma pessoa", pass: "passa", gone: "não aparece mais" },
      owners: "Só proprietários",
      lists: ["Fora de {lists} após a limpeza", "Esta revisão encontrou {host} em uma lista de phishing ou malware. Limpe o site e depois peça a cada lista uma revisão pelo link dela. O caso falha enquanto alguma lista ainda citar o site."],
      listsAny: "Fora de toda lista de phishing e malware após a limpeza",
      review: "Pedir uma revisão a {name}",
      scan: "O que {name} mostra agora",
      linked: ["Cada host de terceiros em {host} continua limpo", "A lista de Navegação segura do Google marcou {n} {n:host vinculado|hosts vinculados} a partir das páginas{hosts}. O caso reúne cada host de scripts, iframes, formulários e links nas mesmas páginas, verifica de novo e faz o build falhar se um host marcado voltar."],
      hacked: ["Nenhum sinal de invasão em {domain}", "Esta revisão viu sinais de um site invadido. O caso verifica que uma busca site: não mostra páginas de spam, que o Googlebot e um visitante recebem o mesmo título e os mesmos scripts, e que nenhum link oculto aponta para spam{terms}."],
      terms: " (termos: {list})",
      lookalike: ["Vigiar {n} {n:domínio parecido|domínios parecidos} com {domain}", "Estes nomes registrados imitam {domain}. O caso registra o que cada um serve hoje e avisa quando um começa a servir um site ou e-mail."],
      serves: { web: "site", mx: "e-mail", nothing: "nada por enquanto" },
      exposed: ["Os arquivos privados de {host} continuam fechados", "Esta revisão leu {n} {n:arquivo|arquivos} que nunca deveriam ser públicos. O caso pede cada caminho e só passa com 401, 403, 404 ou 410."],
      mail: ["SPF, DKIM e DMARC de {domain} são válidos e cumprem a política", "O caso espera um único registro SPF com no máximo 10 consultas DNS terminando em -all ou ~all, um único registro DMARC com p=quarantine ou p=reject e um endereço de relatórios, e uma chave DKIM em cada seletor que você indicar."],
      blocklist: ["{domain} e seus servidores continuam fora das listas de bloqueio de spam", "O caso consulta {lists} sobre {targets} e falha em qualquer listagem. O Barracuda só responde a resolvedores registrados, então o silêncio dele não conta como aprovado."],
      listedOn: "Listado agora: {list}",
      headers: ["Linha de base de segurança passiva para {host}", "O scan baseline do OWASP ZAP e os templates de exposição e má configuração do Nuclei verificam de novo os cabeçalhos e cookies que esta revisão apontou. Os dois só rodam com a permissão por escrito do proprietário."],
      tls: ["O certificado de {host} é renovado a tempo e o site responde", "O caso falha quando restam menos de 21 dias no certificado{date}, quando a cadeia está incompleta ou quando a página inicial para de responder."],
      date: " (ele vence em {date})",
      a11y: ["Reteste de acessibilidade com axe e Pa11y em {n} {n:página|páginas}", "O axe-core, via @axe-core/playwright, e o Pa11y repetem a WCAG 2.1 AA nas páginas onde esta revisão encontrou problemas{rules}. Qualquer violação faz o build falhar."],
      rules: " (regras do axe: {list})",
      fixTitle: "Corrigido pelo seu pacote: que continue corrigido",
      fixIntro: "A nova revisão marcou estes achados como corrigidos. Cada fixação executa os seus casos todo dia, para que uma correção não se desfaça sem ninguém ver.",
      keep: "Manter corrigido: {title}",
      beforeAfter: "Antes da correção: {before}. Agora: {after}.",
      runs: "Casos a executar de novo: {cases}",
      download: "Baixar os scripts de vigilância (.zip)",
      locked: "Os scripts abrem com o relatório completo.",
      schedule: "O download inclui um workflow do GitHub Actions que executa cada verificação todo dia. O OWASP ZAP e o Nuclei só rodam quando a variável do repositório OWNER_APPROVED é yes.",
      readmeIntro: "Scripts de vigilância para {base}, escritos a partir de uma análise pública do QA-lab URL Review. O QA-lab não os executou.",
      readmeRun: "Como executar",
      readmeEnv: "Configurações opcionais",
      readmeEnvText: "WEBRISK_KEY (Google Web Risk), URLHAUS_AUTH_KEY, BRAVE_API_KEY (busca de páginas de spam) e DKIM_SELECTORS são lidos do ambiente; sem eles, essas verificações imprimem um NOTE. OWNER_APPROVED=yes inicia o OWASP ZAP e o Nuclei; defina-o só com a permissão por escrito do proprietário.",
      readmePins: "Regressões de correções"
    }
  };

  function bookFor(lang) {
    return COPY[String(lang || "en").slice(0, 2).toLowerCase()] || COPY.en;
  }

  function fill(template, vars) {
    return String(template)
      .replace(/\{(\w+):([^|{}]*)\|([^{}]*)\}/g, (match, key, one, other) => (vars && vars[key] != null ? (Number(vars[key]) === 1 ? one : other) : match))
      .replace(/\{(\w+)\}/g, (match, key) => (vars && vars[key] != null ? String(vars[key]) : match));
  }

  function esc(value) {
    return String(value == null ? "" : value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  function joined(items, book) {
    const list = (items || []).filter(Boolean);
    if (list.length < 2) return list.join("");
    return list.slice(0, -1).join(", ") + " " + book.and + " " + list[list.length - 1];
  }

  // Values a script may embed. Anything else from the report is dropped, never quoted around.
  const SAFE = {
    host: (v) => /^(?=.{1,253}$)[a-z0-9-]+(\.[a-z0-9-]+)+$/i.test(String(v || "")),
    ip: (v) => /^(25[0-5]|2[0-4]\d|1?\d?\d)(\.(25[0-5]|2[0-4]\d|1?\d?\d)){3}$/.test(String(v || "")),
    path: (v) => /^\/[A-Za-z0-9._~!$&()*+,;=:@%\/-]{0,300}$/.test(String(v || "")) && !/'/.test(String(v)),
    zone: (v) => /^[a-z0-9.-]+$/.test(String(v || "")),
    term: (v) => /^[\p{L}\p{N} -]{2,40}$/u.test(String(v || "")),
    key: (v) => /^[a-z0-9-]+$/.test(String(v || "")),
    base: (v) => /^https:\/\/[a-z0-9.-]+(:\d+)?$/i.test(String(v || "")),
    url: (v) => /^https:\/\/[^\s"'<>]+$/.test(String(v || ""))
  };

  function keep(list, test, max) {
    const out = [];
    (list || []).forEach((item) => { if (test(item) && out.indexOf(item) === -1) out.push(item); });
    return out.slice(0, max || 12);
  }

  function watchOf(report) {
    const watch = (report && report.watch) || {};
    const host = SAFE.host(watch.host) ? watch.host : (SAFE.host(report && report.host) ? report.host : "example.com");
    return {
      host,
      base: SAFE.base(watch.base) ? watch.base : "https://" + host,
      domain: SAFE.host(watch.domain) ? watch.domain : host,
      cases: (watch.cases || []).filter((item) => item && KINDS.indexOf(item.kind) !== -1),
      regressions: watch.regressions || []
    };
  }

  // The words of one case in the page language. A frosted preview has no data, so counts fall back to item.count.
  function words(item, watch, book) {
    const data = item.data || {};
    const pair = book[item.kind];
    const count = (list) => (list ? list.length : item.count || 0);
    const vars = { host: watch.host, domain: data.domain || watch.domain };
    if (item.kind === "lists") {
      const names = (data.lists || []).map((row) => row.name);
      return { title: names.length ? fill(pair[0], { lists: joined(names, book) }) : book.listsAny, why: fill(pair[1], vars) };
    }
    if (item.kind === "linked") {
      const hosts = (data.hosts || []).map((row) => row.host);
      return { title: fill(pair[0], vars), why: fill(pair[1], { n: count(data.hosts), hosts: hosts.length ? ": " + hosts.slice(0, 4).join(", ") : "" }) };
    }
    if (item.kind === "hacked") return { title: fill(pair[0], vars), why: fill(pair[1], { terms: (data.terms || []).length ? fill(book.terms, { list: data.terms.slice(0, 5).join(", ") }) : "" }) };
    if (item.kind === "lookalike") return { title: fill(pair[0], Object.assign({ n: count(data.rows) }, vars)), why: fill(pair[1], vars) };
    if (item.kind === "exposed") return { title: fill(pair[0], vars), why: fill(pair[1], { n: count(data.paths) }) };
    if (item.kind === "blocklist") {
      const lists = (data.lists || []).filter((row) => row.kind === "ip").map((row) => row.name);
      const targets = (data.targets || []).map((row) => row.ip).concat(vars.domain ? [vars.domain] : []);
      return { title: fill(pair[0], vars), why: fill(pair[1], { lists: lists.length ? joined(lists, book) : "SpamCop, Barracuda, Mailspike, PSBL, 0spam, NordSpam", targets: joined(targets, book) || vars.domain }) };
    }
    if (item.kind === "tls") return { title: fill(pair[0], vars), why: fill(pair[1], { date: data.validTo ? fill(book.date, { date: data.validTo }) : "" }) };
    if (item.kind === "a11y") return { title: fill(pair[0], { n: count(data.paths) }), why: fill(pair[1], { rules: (data.rules || []).length ? fill(book.rules, { list: data.rules.join(", ") }) : "" }) };
    return { title: fill(pair[0], vars), why: fill(pair[1], vars) };
  }

  function chip(name) {
    const file = LOGOS[name];
    return '<span class="fw-name" translate="no">' + (file ? '<img class="fw-logo" src="assets/frameworks/' + file + "?v=" + LOGO_VERSION + '" alt="" width="16" height="16" decoding="async">' : "") + esc(name) + "</span>";
  }

  function details(item, book) {
    const data = item.data || {};
    if (item.kind === "lists" && (data.lists || []).length) {
      return '<ul class="watch-links">' + data.lists.map((row) => "<li>" + (SAFE.url(row.review) ? '<a href="' + esc(row.review) + '" target="_blank" rel="noopener noreferrer">' + esc(fill(book.review, { name: row.name })) + "</a>" : esc(row.name)) +
        (SAFE.url(row.scan) ? ' · <a href="' + esc(row.scan) + '" target="_blank" rel="noopener noreferrer">' + esc(fill(book.scan, { name: row.name })) + "</a>" : "") + "</li>").join("") + "</ul>";
    }
    if (item.kind === "lookalike" && (data.rows || []).length) {
      return '<ul class="watch-rows">' + data.rows.map((row) => {
        const what = [row.web ? book.serves.web : "", row.mx ? book.serves.mx : ""].filter(Boolean);
        return '<li><span translate="no">' + esc(row.shown || row.domain) + "</span>: " + esc(what.length ? what.join(" + ") : book.serves.nothing) + "</li>";
      }).join("") + "</ul>";
    }
    if (item.kind === "blocklist" && (data.listed || []).length) {
      const names = {};
      (data.lists || []).forEach((row) => { names[row.id] = row.name; });
      return '<p class="muted watch-note">' + esc(fill(book.listedOn, { list: data.listed.map((hit) => hit.target + " · " + (names[hit.list] || hit.list)).join("; ") })) + "</p>";
    }
    if ((item.kind === "exposed" || item.kind === "a11y") && (data.paths || []).length) {
      return '<p class="muted case-pages" translate="no">' + esc(data.paths.join(", ")) + "</p>";
    }
    return "";
  }

  function badge(verdict, book) {
    return '<span class="tag watch-verdict watch-' + esc(verdict) + '">' + esc(book.verdict[verdict] || verdict) + "</span>";
  }

  /**
   * The subsection's HTML, or "" when the report has nothing to watch.
   * opts: { lang, paid, fade(text) -> html for a frosted line, line(msg, fallback) -> translated finding title }
   */
  function html(report, options) {
    const opts = options || {};
    const watch = watchOf(report);
    if (!watch.cases.length && !watch.regressions.length) return "";
    const book = bookFor(opts.lang);
    const open = !!opts.paid && !(report && report.preview);
    const fade = typeof opts.fade === "function" ? opts.fade : esc;
    const line = typeof opts.line === "function" ? opts.line : (msg, fallback) => fallback;
    const used = new Set();
    watch.cases.forEach((item) => (item.tools || []).forEach((tool) => used.add(tool)));
    watch.regressions.forEach((item) => (item.tools || []).forEach((tool) => used.add(tool)));
    const groups = TOOL_GROUPS.map(([group, tools]) => '<div class="fw-group"><span class="fw-group-name">' + esc(book.groups[group]) + "</span>" +
      tools.map((tool) => '<span class="watch-tool' + (used.has(tool) || group === "schedule" ? " on" : "") + '">' + chip(tool) + "</span>").join("") + "</div>").join("");
    const cards = watch.cases.map((item) => {
      const said = words(item, watch, book);
      return '<article class="case watch-case" data-kind="' + esc(item.kind) + '"><div><span class="id">' + esc(item.id) + "</span> " + esc(book.kind[item.kind]) + badge(item.verdict, book) +
        (item.owners ? '<span class="tag watch-owners">' + esc(book.owners) + "</span>" : "") + "</div><strong>" + fade(said.title) + '</strong><p class="muted">' + fade(said.why) + "</p>" +
        (open ? details(item, book) : "") + '<p class="muted fw-line">' + (item.tools || []).map(chip).join("") + "</p></article>";
    }).join("");
    const pins = watch.regressions.length ? '<h4 class="watch-sub">' + esc(book.fixTitle) + '</h4><p class="muted">' + esc(book.fixIntro) + "</p>" + watch.regressions.map((item) => {
      const title = line(item.titleMsg, item.title || item.key);
      const tools = (item.tools || []).concat((item.cases || []).length ? ["Playwright"] : []);
      return '<article class="case watch-case watch-pin" data-kind="regression"><div><span class="id">' + esc(item.id) + "</span> " + esc(book.kind.regression) + badge(item.after === "gone" ? "gone" : "pass", book) + "</div><strong>" +
        fade(fill(book.keep, { title })) + '</strong><p class="muted">' + fade(fill(book.beforeAfter, { before: book.verdict[item.before] || item.before, after: book.verdict[item.after === "gone" ? "gone" : "pass"] })) + "</p>" +
        ((item.cases || []).length ? '<p class="muted case-pages" translate="no">' + esc(fill(book.runs, { cases: item.cases.join(", ") })) + "</p>" : "") +
        '<p class="muted fw-line">' + [...new Set(tools)].map(chip).join("") + "</p></article>";
    }).join("") : "";
    const action = open
      ? '<button type="button" class="btn btn-ghost watch-download" id="watch-download">' + esc(book.download) + "</button>"
      : '<p class="muted watch-locked">' + esc(book.locked) + "</p>";
    return '<h3 class="watch-title" id="watch-title">' + esc(book.title) + '</h3><p class="muted watch-intro">' + esc(book.intro) + '</p><div class="watch-tools">' + groups + "</div>" + cards + pins +
      '<div class="watch-foot">' + action + '<p class="muted watch-schedule">' + esc(book.schedule) + "</p></div>";
  }

  // ---- Scripts ----

  function sh(value) {
    return "'" + String(value).replace(/'/g, "'\\''") + "'";
  }

  function shArray(name, list) {
    return name + "=(" + list.map(sh).join(" ") + ")";
  }

  function q(value) {
    return JSON.stringify(String(value));
  }

  function ere(term) {
    return String(term).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  // Every case and every pin that carries facts, by kind; the first one of a kind names the section.
  function sections(watch) {
    const out = {};
    watch.cases.concat(watch.regressions.filter((pin) => pin.data && KINDS.indexOf(pin.kind) !== -1)).forEach((item) => {
      if (!item.data) return;
      (out[item.kind] = out[item.kind] || []).push(item);
    });
    return out;
  }

  function ids(list) {
    return list.map((item) => item.id).join(", ");
  }

  const SH_HEAD = [
    "set -u",
    "",
    "FAILED=0",
    "pass() { printf 'PASS %s\\n' \"$1\"; }",
    "fail() {",
    "  printf 'FAIL %s\\n' \"$1\"",
    "  FAILED=1",
    "}",
    "note() { printf 'NOTE %s\\n' \"$1\"; }"
  ];

  function digScript(watch, by, line) {
    const lines = ["#!/usr/bin/env bash", "# " + line + " · DNS, blocklist and lookalike checks for " + watch.domain, "# Needs dig and curl. Prints PASS, FAIL or NOTE per check and exits 1 when one fails."].concat(SH_HEAD, [
      "ask() { dig +short +time=3 +tries=2 \"$@\" 2>/dev/null | grep -v '^;' || true; }",
      "reverse() { printf '%s' \"$1\" | awk -F. '{ print $4 \".\" $3 \".\" $2 \".\" $1 }'; }",
      "# Only 127.0.0.2-127.0.0.254 means listed; other answers are refusals or rewritten NXDOMAIN.",
      "listed() { ask \"$1\" A | grep -E '^127\\.0\\.0\\.([2-9]|[1-9][0-9]|1[0-9][0-9]|2[0-4][0-9]|25[0-4])$' | head -n 1; }",
      "",
      "DOMAIN=" + sh(watch.domain)
    ]);
    (by.blocklist || []).slice(0, 1).forEach((item) => {
      const data = item.data;
      const lists = (data.lists || []).filter((row) => SAFE.zone(row.zone));
      const ipZones = lists.filter((row) => row.kind === "ip").map((row) => row.zone);
      const domainZones = lists.filter((row) => row.kind === "domain").map((row) => row.zone);
      const ips = keep((data.targets || []).map((row) => row.ip), SAFE.ip, 4);
      lines.push("", "# " + ids(by.blocklist) + " · Spam blocklists: " + lists.map((row) => row.name).join(", "),
        "# A list is read only after its always-listed test point (RFC 5782) answers, so a refused resolver never passes.",
        "healthy() { [ -n \"$(listed \"$1\")\" ]; }");
      if (ips.length && ipZones.length) {
        lines.push(shArray("IPS", ips), shArray("IP_ZONES", ipZones), "for zone in \"${IP_ZONES[@]}\"; do",
          "  if ! healthy \"2.0.0.127.$zone\"; then", "    note \"$zone did not answer its test point from this resolver; not read\"", "    continue", "  fi",
          "  for ip in \"${IPS[@]}\"; do", "    hit=$(listed \"$(reverse \"$ip\").$zone\")",
          "    if [ -n \"$hit\" ]; then fail \"$ip is listed on $zone ($hit)\"; else pass \"$ip is not listed on $zone\"; fi", "  done", "done");
      }
      if (domainZones.length) {
        lines.push(shArray("DOMAIN_ZONES", domainZones), "for zone in \"${DOMAIN_ZONES[@]}\"; do",
          "  if ! healthy \"test.$zone\"; then", "    note \"$zone did not answer its test point from this resolver; not read\"", "    continue", "  fi",
          "  hit=$(listed \"$DOMAIN.$zone\")",
          "  if [ -n \"$hit\" ]; then fail \"$DOMAIN is listed on $zone ($hit)\"; else pass \"$DOMAIN is not listed on $zone\"; fi", "done");
      }
    });
    (by.lookalike || []).slice(0, 1).forEach((item) => {
      const rows = (item.data.rows || []).filter((row) => SAFE.host(row.domain)).slice(0, 12);
      if (!rows.length) return;
      lines.push("", "# " + ids(by.lookalike) + " · Lookalike domains of " + watch.domain + ": name, website and mail at review time",
        "while read -r name had_web had_mail; do",
        "  [ -n \"$name\" ] || continue",
        "  web=no",
        "  code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 8 \"http://$name/\" || true)",
        "  if [ -n \"$code\" ] && [ \"$code\" != 000 ]; then web=yes; fi",
        "  mail=no",
        "  if [ -n \"$(ask \"$name\" MX)\" ]; then mail=yes; fi",
        "  if [ \"$had_web\" = no ] && [ \"$web\" = yes ]; then fail \"$name started serving a website\"; fi",
        "  if [ \"$had_mail\" = no ] && [ \"$mail\" = yes ]; then fail \"$name started accepting mail\"; fi",
        "  if [ \"$web\" = no ] && [ \"$mail\" = no ]; then pass \"$name serves neither a website nor mail\"; else note \"$name serves website=$web mail=$mail; report it to its registrar if it imitates you\"; fi",
        "done <<'LOOKALIKES'");
      rows.forEach((row) => lines.push(row.domain + " " + (row.web ? "yes" : "no") + " " + (row.mx ? "yes" : "no")));
      lines.push("LOOKALIKES");
    });
    if (by.mail) {
      lines.push("", "# " + ids(by.mail) + " · SPF, DKIM and DMARC for " + watch.domain,
        "spf=$(ask \"$DOMAIN\" TXT | tr -d '\"' | grep -i '^v=spf1' || true)",
        "spf_count=$(printf '%s' \"$spf\" | grep -c . || true)",
        "if [ \"$spf_count\" = 1 ]; then pass \"$DOMAIN has one SPF record\"; else fail \"$DOMAIN has $spf_count SPF records; it needs exactly one\"; fi",
        "if printf '%s' \"$spf\" | grep -Eq '[~-]all[[:space:]]*$'; then pass 'SPF ends in -all or ~all'; else fail 'SPF does not end in -all or ~all'; fi",
        "dmarc=$(ask \"_dmarc.$DOMAIN\" TXT | tr -d '\"' | grep -i '^v=DMARC1' || true)",
        "dmarc_count=$(printf '%s' \"$dmarc\" | grep -c . || true)",
        "if [ \"$dmarc_count\" = 1 ]; then pass \"$DOMAIN has one DMARC record\"; else fail \"$DOMAIN has $dmarc_count DMARC records; it needs exactly one\"; fi",
        "if printf '%s' \"$dmarc\" | grep -Eiq '(^|;)[[:space:]]*p=(quarantine|reject)'; then pass 'DMARC policy is quarantine or reject'; else fail 'DMARC policy is not quarantine or reject'; fi",
        "if printf '%s' \"$dmarc\" | grep -iq 'rua=mailto:'; then pass 'DMARC names a report address'; else fail 'DMARC has no rua report address'; fi",
        "if [ -z \"${DKIM_SELECTORS:-}\" ]; then note 'Set DKIM_SELECTORS=\"selector1 google\" to check DKIM keys.'; fi",
        "for selector in ${DKIM_SELECTORS:-}; do",
        "  key=$(ask \"$selector._domainkey.$DOMAIN\" TXT | tr -d '\" ')",
        "  if printf '%s' \"$key\" | grep -Eq '(^|;)p=[A-Za-z0-9+/]'; then pass \"DKIM key published for $selector\"; else fail \"no DKIM key for selector $selector\"; fi",
        "done",
        "note 'checkdmarc/check_mail.py also counts the SPF DNS lookups (limit 10).'");
    }
    lines.push("", "exit \"$FAILED\"");
    return lines.join("\n") + "\n";
  }

  function webRisk(uriExpr, label) {
    return [
      "  answer=$(curl -s --max-time 20 -G 'https://webrisk.googleapis.com/v1/uris:search' --data-urlencode \"uri=" + uriExpr + "\" -d threatTypes=MALWARE -d threatTypes=SOCIAL_ENGINEERING -d threatTypes=UNWANTED_SOFTWARE -d \"key=$WEBRISK_KEY\" || true)",
      "  if printf '%s' \"$answer\" | grep -q '\"threat\"'; then fail \"Google Web Risk still lists " + label + "\"",
      "  elif printf '%s' \"$answer\" | grep -q '\"error\"'; then note \"Google Web Risk refused the lookup for " + label + "\"",
      "  else pass \"Google Web Risk does not list " + label + "\"; fi"
    ];
  }

  function curlScript(watch, by, line) {
    const lines = ["#!/usr/bin/env bash", "# " + line + " · HTTP checks for " + watch.base, "# Needs curl and openssl. Prints PASS, FAIL or NOTE per check and exits 1 when one fails."].concat(SH_HEAD, [
      "status() { curl -s -o /dev/null -w '%{http_code}' --max-time 20 \"$@\" || true; }",
      "",
      "BASE=" + sh(watch.base),
      "HOST=" + sh(watch.host),
      "DOMAIN=" + sh(watch.domain)
    ]);
    (by.lists || []).slice(0, 1).forEach((item) => {
      const lists = item.data.lists || [];
      lines.push("", "# " + ids(by.lists) + " · Phishing and malware lists for $HOST", "if [ -n \"${WEBRISK_KEY:-}\" ]; then");
      lines.push(...webRisk("$BASE/", "$BASE/"));
      lines.push("else", "  note 'Set WEBRISK_KEY to ask Google Web Risk.'", "fi");
      if (lists.some((row) => row.id === "urlhaus")) {
        lines.push("if [ -n \"${URLHAUS_AUTH_KEY:-}\" ]; then",
          "  answer=$(curl -s --max-time 20 -H \"Auth-Key: $URLHAUS_AUTH_KEY\" --data-urlencode \"host=$HOST\" 'https://urlhaus-api.abuse.ch/v1/host/' || true)",
          "  if printf '%s' \"$answer\" | grep -Eq '\"url_status\": *\"(online|unknown)\"'; then fail 'URLhaus still lists an active malware address on the host'",
          "  elif printf '%s' \"$answer\" | grep -Eq '\"query_status\": *\"(ok|no_results)\"'; then pass 'URLhaus lists no active malware address on the host'",
          "  else note 'URLhaus did not answer'; fi",
          "else", "  note 'Set URLHAUS_AUTH_KEY to ask URLhaus.'", "fi");
      }
      lists.filter((row) => SAFE.url(row.review)).forEach((row) => lines.push("note " + sh("Ask " + row.name + " for a review: " + row.review)));
    });
    (by.linked || []).slice(0, 1).forEach((item) => {
      const hosts = keep((item.data.hosts || []).map((row) => row.host), SAFE.host, 12);
      if (!hosts.length) return;
      lines.push("", "# " + ids(by.linked) + " · Linked hosts Google flagged; playwright/qa-lab-watch.spec.js fails if one returns to the pages", shArray("LINKED_HOSTS", hosts),
        "if [ -n \"${WEBRISK_KEY:-}\" ]; then", "  for host in \"${LINKED_HOSTS[@]}\"; do");
      lines.push(...webRisk("https://$host/", "$host").map((row) => "  " + row));
      lines.push("  done", "else", "  note 'Set WEBRISK_KEY to recheck the linked hosts with Google Web Risk.'", "fi");
    });
    (by.hacked || []).slice(0, 1).forEach((item) => {
      const data = item.data;
      const terms = keep(data.terms || [], SAFE.term, 8);
      const cloak = keep(data.cloaking || [], SAFE.path, 6);
      const linkPaths = keep(data.links || [], SAFE.path, 6);
      lines.push("", "# " + ids(by.hacked) + " · Hacked-site signs on $DOMAIN", "BOT_UA=" + sh(BOT_UA), "WEB_UA=" + sh(WEB_UA), "SPAM=" + sh(terms.map(ere).join("|")),
        "fingerprint() { curl -sL --max-time 25 -A \"$1\" \"$BASE$2\" | tr -s '[:space:]' ' ' | grep -Eio '<title[^<]*</title>|<script[^>]*src=\"[^\"]*\"' | sort -u; }");
      if (cloak.length) {
        lines.push(shArray("CLOAK_PATHS", cloak), "for path in \"${CLOAK_PATHS[@]}\"; do",
          "  if [ \"$(fingerprint \"$BOT_UA\" \"$path\")\" = \"$(fingerprint \"$WEB_UA\" \"$path\")\" ]; then pass \"Googlebot and a visitor get the same title and scripts on $path\"; else fail \"Googlebot gets a different title or scripts on $path\"; fi",
          "  if [ -n \"$SPAM\" ] && curl -sL --max-time 25 -A \"$BOT_UA\" \"$BASE$path\" | grep -Eiq \"$SPAM\"; then fail \"spam terms are served to Googlebot on $path\"; fi",
          "done");
      }
      if (linkPaths.length && terms.length) {
        lines.push(shArray("LINK_PATHS", linkPaths), "for path in \"${LINK_PATHS[@]}\"; do",
          "  if curl -sL --max-time 25 -A \"$WEB_UA\" \"$BASE$path\" | grep -Eio '<a [^>]*>[^<]*' | grep -Eiq \"$SPAM\"; then fail \"a link with spam terms is still on $path\"; else pass \"no link with spam terms on $path\"; fi",
          "done");
      }
      if (data.search && terms.length) {
        lines.push("if [ -n \"${BRAVE_API_KEY:-}\" ]; then",
          "  found=$(curl -s --max-time 20 -G 'https://api.search.brave.com/res/v1/web/search' -H 'Accept: application/json' -H \"X-Subscription-Token: $BRAVE_API_KEY\" --data-urlencode " + sh("q=site:" + watch.domain + " " + terms.join(" OR ")) + " | grep -Eio '\"url\": *\"https?://[^\"]*' | grep -Fi \"$DOMAIN\" | grep -Eic \"$SPAM\" || true)",
          "  if [ \"${found:-0}\" -gt 0 ]; then fail \"search still shows $found spam page(s) under $DOMAIN\"; else pass \"search shows no spam page under $DOMAIN\"; fi",
          "else", "  note 'Set BRAVE_API_KEY to search for spam pages under the domain.'", "fi");
      }
    });
    (by.exposed || []).slice(0, 1).forEach((item) => {
      const paths = keep(item.data.paths || [], SAFE.path, 12);
      if (!paths.length) return;
      lines.push("", "# " + ids(by.exposed) + " · Files that must stay closed (owners only)", shArray("EXPOSED", paths), "for path in \"${EXPOSED[@]}\"; do", "  code=$(status \"$BASE$path\")",
        "  case \"$code\" in", "    401 | 403 | 404 | 410) pass \"$path answers $code\" ;;", "    *) fail \"$path answers $code; it must answer 403 or 404\" ;;", "  esac", "done");
    });
    if (by.tls) {
      lines.push("", "# " + ids(by.tls) + " · Certificate and uptime for $HOST", "WARN_DAYS=" + WARN_DAYS,
        "cert=$(echo | openssl s_client -connect \"$HOST:443\" -servername \"$HOST\" 2>/dev/null | openssl x509 2>/dev/null || true)",
        "if [ -z \"$cert\" ]; then",
        "  fail \"no certificate was read from $HOST:443\"",
        "elif printf '%s\\n' \"$cert\" | openssl x509 -noout -checkend $((WARN_DAYS * 86400)) >/dev/null; then",
        "  pass \"the certificate is valid for more than $WARN_DAYS days ($(printf '%s\\n' \"$cert\" | openssl x509 -noout -enddate | cut -d= -f2))\"",
        "else",
        "  fail \"the certificate expires within $WARN_DAYS days\"",
        "fi",
        "if curl -sS -o /dev/null --max-time 20 \"$BASE/\" 2>/dev/null; then pass 'the certificate chain verifies'; else fail \"curl could not verify the chain or reach $BASE/\"; fi",
        "code=$(status -L \"$BASE/\")",
        "case \"$code\" in", "  2?? | 3??) pass \"$BASE/ answers $code\" ;;", "  *) fail \"$BASE/ answers $code\" ;;", "esac");
    }
    lines.push("", "exit \"$FAILED\"");
    return lines.join("\n") + "\n";
  }

  function mailPython(watch, by, line) {
    return [
      "#!/usr/bin/env python3",
      "\"\"\"" + line + " · SPF, DKIM and DMARC for " + watch.domain + " (" + ids(by.mail) + ").",
      "",
      "pip install checkdmarc, then: python checkdmarc/check_mail.py",
      "Set DKIM_SELECTORS=\"selector1 google\" to check DKIM keys. Exits 1 when a check fails.",
      "\"\"\"",
      "import json",
      "import os",
      "import re",
      "import shutil",
      "import subprocess",
      "import sys",
      "",
      "DOMAIN = " + q(watch.domain),
      "LOOKUP_LIMIT = 10",
      "FAILED = []",
      "",
      "",
      "def check(ok, text):",
      "    print((\"PASS \" if ok else \"FAIL \") + text)",
      "    if not ok:",
      "        FAILED.append(text)",
      "",
      "",
      "def read_domain():",
      "    tool = shutil.which(\"checkdmarc\")",
      "    if not tool:",
      "        sys.exit(\"checkdmarc is not installed: pip install checkdmarc\")",
      "    out = subprocess.run([tool, DOMAIN, \"-f\", \"json\"], capture_output=True, text=True, check=False)",
      "    data = json.loads(out.stdout or \"{}\")",
      "    return data[0] if isinstance(data, list) else data",
      "",
      "",
      "def dkim_key(selector):",
      "    try:",
      "        import dns.resolver",
      "    except ImportError:",
      "        return None",
      "    try:",
      "        answer = dns.resolver.resolve(selector + \"._domainkey.\" + DOMAIN, \"TXT\")",
      "    except Exception:",
      "        return \"\"",
      "    return \"\".join(b\"\".join(row.strings).decode(\"utf-8\", \"replace\") for row in answer)",
      "",
      "",
      "def main():",
      "    data = read_domain()",
      "    spf = data.get(\"spf\") or {}",
      "    record = spf.get(\"record\") or \"\"",
      "    spf_error = \"\" if spf.get(\"valid\") else str(spf.get(\"error\") or \"\")",
      "    check(bool(spf.get(\"valid\")), \"SPF parses: \" + (record or \"no record\") + (\" (\" + spf_error + \")\" if spf_error else \"\"))",
      "    lookups = spf.get(\"dns_lookups\")",
      "    if lookups is not None:",
      "        check(int(lookups) <= LOOKUP_LIMIT, \"SPF uses %s of %d DNS lookups\" % (lookups, LOOKUP_LIMIT))",
      "    check(bool(re.search(r\"[~-]all\\s*$\", record)), \"SPF ends in -all or ~all\")",
      "    dmarc = data.get(\"dmarc\") or {}",
      "    tags = dmarc.get(\"tags\") or {}",
      "    policy = str((tags.get(\"p\") or {}).get(\"value\") or \"\").lower()",
      "    check(bool(dmarc.get(\"valid\")), \"DMARC parses: \" + (dmarc.get(\"record\") or str(dmarc.get(\"error\", \"no record\"))))",
      "    check(policy in (\"quarantine\", \"reject\"), \"DMARC policy is quarantine or reject (p=%s)\" % (policy or \"none\"))",
      "    check(bool((tags.get(\"rua\") or {}).get(\"value\")), \"DMARC names a report address (rua)\")",
      "    selectors = os.environ.get(\"DKIM_SELECTORS\", \"\").split()",
      "    if not selectors:",
      "        print(\"NOTE Set DKIM_SELECTORS to check DKIM keys, for example DKIM_SELECTORS=\\\"selector1 google\\\".\")",
      "    for selector in selectors:",
      "        key = dkim_key(selector)",
      "        if key is None:",
      "            print(\"NOTE pip install dnspython to check DKIM keys.\")",
      "            break",
      "        check(bool(re.search(r\"(^|;)\\s*p=[A-Za-z0-9+/]\", key)), \"DKIM key published for selector \" + selector)",
      "    return 1 if FAILED else 0",
      "",
      "",
      "if __name__ == \"__main__\":",
      "    sys.exit(main())",
      ""
    ].join("\n");
  }

  const OWNER_GATE = [
    "if [ \"${OWNER_APPROVED:-}\" != yes ]; then",
    "  echo 'SKIP Set OWNER_APPROVED=yes only with the site owner'\"'\"'s written permission.'",
    "  exit 0",
    "fi"
  ];

  function zapFiles(watch, by, line) {
    const rules = [];
    [].concat(...by.headers.map((item) => item.data.keys || [])).forEach((key) => (ZAP_RULES[key] || []).forEach((rule) => { if (!rules.some((row) => row[0] === rule[0])) rules.push(rule); }));
    const script = ["#!/usr/bin/env bash", "# " + line + " · OWASP ZAP baseline scan of " + watch.base + " (" + ids(by.headers) + ")",
      "# Passive: ZAP spiders the site for a minute and reads the answers; it sends no attack. Needs Docker.", "set -euo pipefail", "cd \"$(dirname \"$0\")\""].concat(OWNER_GATE, [
      "chmod a+w . || true",
      "docker run --rm -v \"$(pwd):/zap/wrk:rw\" ghcr.io/zaproxy/zaproxy:stable zap-baseline.py -t " + sh(watch.base) + " -m 1 -c qa-lab-rules.tsv -I -r zap-report.html -J zap-report.json"
    ]).join("\n") + "\n";
    const tsv = "# The rules this review flagged fail the scan; every other rule stays a warning.\n" + rules.map((rule) => rule[0] + "\tFAIL\t(" + rule[1] + ")").join("\n") + "\n";
    return [{ path: "zap/zap-baseline.sh", content: script }, { path: "zap/qa-lab-rules.tsv", content: tsv }];
  }

  function nucleiFiles(watch, by, line) {
    const paths = by.exposed ? keep([].concat(...by.exposed.map((item) => item.data.paths || [])), SAFE.path, 12) : [];
    const runs = [];
    if (by.headers) runs.push("run -u " + sh(watch.base) + " -tags exposure,misconfig -severity low,medium,high,critical -rl 10 -c 5 -timeout 10 -silent -jsonl -o nuclei-misconfig.jsonl");
    if (paths.length) runs.push("run -u " + sh(watch.base) + " -t qa-lab-exposed.yaml -rl 10 -silent -jsonl -o nuclei-exposed.jsonl");
    if (!runs.length) return [];
    const script = ["#!/usr/bin/env bash", "# " + line + " · Nuclei exposure and misconfiguration templates against " + watch.base,
      "# Uses a local nuclei binary, or the projectdiscovery/nuclei Docker image.", "set -uo pipefail", "cd \"$(dirname \"$0\")\" || exit 1"].concat(OWNER_GATE, [
      "run() {",
      "  if command -v nuclei >/dev/null 2>&1; then nuclei \"$@\"; else docker run --rm -v \"$(pwd):/w\" -w /w projectdiscovery/nuclei:latest \"$@\"; fi",
      "}",
      "rm -f nuclei-*.jsonl"
    ], runs, [
      "found=$(cat nuclei-*.jsonl 2>/dev/null | wc -l | tr -d ' ')",
      "if [ \"${found:-0}\" -gt 0 ]; then",
      "  echo \"FAIL Nuclei matched $found time(s); see nuclei-*.jsonl\"",
      "  exit 1",
      "fi",
      "echo 'PASS Nuclei matched nothing'"
    ]).join("\n") + "\n";
    const files = [{ path: "nuclei/nuclei.sh", content: script }];
    if (paths.length) {
      files.push({
        path: "nuclei/qa-lab-exposed.yaml",
        content: ["id: qa-lab-exposed-files", "", "info:", "  name: " + q("Files QA-lab read on " + watch.host), "  author: qa-lab", "  severity: high",
          "  description: " + q("Each path gave out content during the review (" + ids(by.exposed) + "). The template matches while one still answers 200."), "  tags: exposure,qa-lab", "",
          "http:", "  - method: GET", "    path:"].concat(paths.map((path) => "      - " + q("{{BaseURL}}" + path)), ["    stop-at-first-match: false", "    matchers:", "      - type: status", "        status:", "          - 200", ""]).join("\n")
      });
    }
    return files;
  }

  function a11yFiles(watch, by, line) {
    const item = by.a11y[0];
    const paths = keep(item.data.paths || [], SAFE.path, 6);
    if (!paths.length) paths.push("/");
    const rules = keep(item.data.rules || [], SAFE.key, 10);
    const spec = [
      "// " + line + " · axe-core WCAG 2.1 AA retest for " + watch.base + " (" + ids(by.a11y) + ")",
      "// npm i -D @playwright/test @axe-core/playwright && npx playwright install chromium && npx playwright test axe/",
      "const { test, expect } = require(\"@playwright/test\");",
      "const AxeBuilder = require(\"@axe-core/playwright\").default;",
      "",
      "const BASE = " + q(watch.base) + ";",
      "const PAGES = " + JSON.stringify(paths) + ";",
      "const TAGS = [\"wcag2a\", \"wcag2aa\", \"wcag21a\", \"wcag21aa\"];",
      "// The rules this review saw broken; the tags above already include them.",
      "const SEEN = " + JSON.stringify(rules) + ";",
      "",
      "for (const path of PAGES) {",
      "  test(" + q(item.id + " · axe WCAG 2.1 AA on ") + " + path, async ({ page }) => {",
      "    await page.goto(BASE + path, { waitUntil: \"domcontentloaded\" });",
      "    const result = await new AxeBuilder({ page }).withTags(TAGS).analyze();",
      "    const found = result.violations.map((rule) => (SEEN.includes(rule.id) ? \"again: \" : \"\") + rule.id + \" (\" + rule.nodes.length + \"): \" + rule.help);",
      "    expect(found, \"axe violations on \" + path).toEqual([]);",
      "  });",
      "}",
      ""
    ].join("\n");
    const config = JSON.stringify({ defaults: { standard: "WCAG2AA", runners: ["axe", "htmlcs"], timeout: 60000, chromeLaunchConfig: { args: ["--no-sandbox"] } }, urls: paths.map((path) => watch.base + path) }, null, 2) + "\n";
    const runner = [
      "// " + line + " · Pa11y WCAG 2.1 AA retest for " + watch.base + " (" + ids(by.a11y) + ")",
      "// npm i -D pa11y && node pa11y/qa-lab-pa11y.js   (or: npx pa11y-ci --config pa11y/.pa11yci.json)",
      "const pa11y = require(\"pa11y\");",
      "const config = require(\"./.pa11yci.json\");",
      "",
      "(async () => {",
      "  let failed = 0;",
      "  for (const url of config.urls) {",
      "    const result = await pa11y(url, config.defaults);",
      "    const errors = result.issues.filter((issue) => issue.type === \"error\");",
      "    errors.forEach((issue) => console.log(\"FAIL \" + url + \" \" + issue.code + \" \" + issue.selector + \": \" + issue.message));",
      "    if (!errors.length) console.log(\"PASS \" + url);",
      "    failed += errors.length;",
      "  }",
      "  process.exitCode = failed ? 1 : 0;",
      "})();",
      ""
    ].join("\n");
    return [{ path: "axe/qa-lab-axe.spec.js", content: spec }, { path: "pa11y/.pa11yci.json", content: config }, { path: "pa11y/qa-lab-pa11y.js", content: runner }];
  }

  function playwrightWatch(watch, by, line) {
    const tests = [];
    const linked = by.linked ? keep([].concat(...by.linked.map((item) => (item.data.hosts || []).map((row) => row.host))), SAFE.host, 12) : [];
    const linkedPages = by.linked ? keep([].concat(...by.linked.map((item) => item.data.pages || [])), SAFE.path, 6) : [];
    if (linked.length) {
      tests.push(
        "const FLAGGED = " + JSON.stringify(linked) + ";",
        "for (const path of " + JSON.stringify(linkedPages.length ? linkedPages : ["/"]) + ") {",
        "  test(" + q(ids(by.linked) + " · no flagged third-party host on ") + " + path, async ({ page }) => {",
        "    const seen = new Set();",
        "    page.on(\"request\", (req) => { try { seen.add(new URL(req.url()).hostname); } catch (error) { /* not a URL */ } });",
        "    await page.goto(BASE + path, { waitUntil: \"load\" });",
        "    const linkedHosts = await page.evaluate(() => [...document.querySelectorAll(\"script[src], iframe[src], form[action], a[href]\")].map((el) => {",
        "      try { return new URL(el.getAttribute(\"src\") || el.getAttribute(\"action\") || el.getAttribute(\"href\"), location.href).hostname; } catch (error) { return \"\"; }",
        "    }));",
        "    linkedHosts.forEach((host) => seen.add(host));",
        "    const back = FLAGGED.filter((flagged) => [...seen].some((host) => host === flagged || host.endsWith(\".\" + flagged)));",
        "    expect(back, \"flagged hosts back on \" + path).toEqual([]);",
        "  });",
        "}",
        ""
      );
    }
    const hacked = by.hacked && by.hacked[0];
    const terms = hacked ? keep(hacked.data.terms || [], SAFE.term, 8) : [];
    const linkPaths = hacked ? keep(hacked.data.links || [], SAFE.path, 6) : [];
    if (terms.length && linkPaths.length) {
      tests.push(
        "const SPAM = " + q(terms.map(ere).join("|")) + ";",
        "for (const path of " + JSON.stringify(linkPaths) + ") {",
        "  test(" + q(ids(by.hacked) + " · no hidden or spam links on ") + " + path, async ({ page }) => {",
        "    await page.goto(BASE + path, { waitUntil: \"load\" });",
        "    const bad = await page.evaluate((source) => {",
        "      const spam = new RegExp(source, \"i\");",
        "      return [...document.querySelectorAll(\"a[href]\")].filter((link) => spam.test(link.textContent + \" \" + link.href)).map((link) => {",
        "        const style = getComputedStyle(link);",
        "        const box = link.getBoundingClientRect();",
        "        const hidden = style.display === \"none\" || style.visibility === \"hidden\" || Number(style.opacity) === 0 || box.width < 2 || box.height < 2 || box.right < 0 || box.bottom < 0;",
        "        return (hidden ? \"hidden \" : \"\") + link.href;",
        "      });",
        "    }, SPAM);",
        "    expect(bad, \"spam links on \" + path).toEqual([]);",
        "  });",
        "}",
        ""
      );
    }
    if (!tests.length) return [];
    return [{
      path: "playwright/qa-lab-watch.spec.js",
      content: ["// " + line + " · linked hosts and spam links on " + watch.base, "// npm i -D @playwright/test && npx playwright install chromium && npx playwright test playwright/qa-lab-watch.spec.js",
        "const { test, expect } = require(\"@playwright/test\");", "", "const BASE = " + q(watch.base) + ";", ""].concat(tests).join("\n")
    }];
  }

  // The pinned cases of a paid fix, as the Playwright suite qa-review-scripts.js writes for them.
  function pinnedSuite(report, watch, scripts) {
    const wanted = new Set([].concat(...watch.regressions.map((pin) => pin.cases || [])));
    if (!wanted.size || !scripts || typeof scripts.bundle !== "function") return [];
    const cases = ((report && report.cases) || []).filter((item) => wanted.has(item.id));
    if (!cases.length) return [];
    const pack = scripts.bundle(report, cases, ["Playwright"]);
    const suite = pack.files.find((file) => file.path === "playwright/qa-lab.spec.ts");
    return suite ? [{ path: "regressions/qa-lab-fixed.spec.ts", content: suite.content }] : [];
  }

  function workflowFile(watch, present) {
    const job = (id, name, steps, gate) => ["  " + id + ":", "    name: " + name].concat(gate ? ["    if: vars.OWNER_APPROVED == 'yes'"] : [], ["    runs-on: ubuntu-latest", "    timeout-minutes: 20", "    steps:", "      - uses: actions/checkout@v4"], steps);
    const node = ["      - uses: actions/setup-node@v4", "        with:", "          node-version: 20"];
    const lines = ["# QA-lab watch for " + watch.base, "# Copy this folder to the root of a repository. Secrets and variables are optional; see README.md.", "name: QA-lab watch", "on:", "  workflow_dispatch:", "  schedule:", "    - cron: \"41 5 * * *\"", "jobs:"];
    if (present["dig/qa-lab-dns.sh"]) lines.push(...job("dns", "DNS, mail and blocklists", ["      - run: bash dig/qa-lab-dns.sh", "        env:", "          DKIM_SELECTORS: ${{ vars.DKIM_SELECTORS }}"]));
    if (present["curl/qa-lab-http.sh"]) {
      lines.push(...job("http", "Lists, hosts, files and certificate", ["      - run: bash curl/qa-lab-http.sh", "        env:", "          WEBRISK_KEY: ${{ secrets.WEBRISK_KEY }}", "          URLHAUS_AUTH_KEY: ${{ secrets.URLHAUS_AUTH_KEY }}", "          BRAVE_API_KEY: ${{ secrets.BRAVE_API_KEY }}"]));
    }
    if (present["checkdmarc/check_mail.py"]) {
      lines.push(...job("mail", "checkdmarc", ["      - uses: actions/setup-python@v5", "        with:", "          python-version: \"3.12\"", "      - run: pip install checkdmarc", "      - run: python checkdmarc/check_mail.py", "        env:", "          DKIM_SELECTORS: ${{ vars.DKIM_SELECTORS }}"]));
    }
    const specs = ["playwright/qa-lab-watch.spec.js", "axe/qa-lab-axe.spec.js", "regressions/qa-lab-fixed.spec.ts"].filter((path) => present[path]);
    if (specs.length) {
      lines.push(...job("browser", "Playwright and axe", node.concat(["      - run: npm init -y && npm i -D @playwright/test @axe-core/playwright", "      - run: npx playwright install --with-deps chromium", "      - run: npx playwright test " + specs.join(" ")])));
    }
    if (present["pa11y/.pa11yci.json"]) lines.push(...job("pa11y", "Pa11y", node.concat(["      - run: npm i -g pa11y-ci", "      - run: pa11y-ci --config pa11y/.pa11yci.json"])));
    const owner = ["        env:", "          OWNER_APPROVED: ${{ vars.OWNER_APPROVED }}"];
    if (present["zap/zap-baseline.sh"]) lines.push(...job("zap", "OWASP ZAP baseline", ["      - run: bash zap/zap-baseline.sh"].concat(owner), true));
    if (present["nuclei/nuclei.sh"]) lines.push(...job("nuclei", "Nuclei", ["      - run: bash nuclei/nuclei.sh"].concat(owner), true));
    return lines.join("\n") + "\n";
  }

  const HOW = {
    "dig/qa-lab-dns.sh": "bash dig/qa-lab-dns.sh",
    "curl/qa-lab-http.sh": "bash curl/qa-lab-http.sh",
    "checkdmarc/check_mail.py": "pip install checkdmarc && python checkdmarc/check_mail.py",
    "zap/zap-baseline.sh": "OWNER_APPROVED=yes bash zap/zap-baseline.sh   # Docker",
    "nuclei/nuclei.sh": "OWNER_APPROVED=yes bash nuclei/nuclei.sh   # nuclei or Docker",
    "playwright/qa-lab-watch.spec.js": "npm i -D @playwright/test && npx playwright install chromium && npx playwright test playwright/qa-lab-watch.spec.js",
    "axe/qa-lab-axe.spec.js": "npm i -D @playwright/test @axe-core/playwright && npx playwright test axe/qa-lab-axe.spec.js",
    "pa11y/qa-lab-pa11y.js": "npm i -D pa11y && node pa11y/qa-lab-pa11y.js   # or: npx pa11y-ci --config pa11y/.pa11yci.json",
    "regressions/qa-lab-fixed.spec.ts": "npm i -D @playwright/test && npx playwright test regressions/qa-lab-fixed.spec.ts"
  };

  /**
   * Every watch script for the report, as { path, content } rows for QAReviewScripts.zip.
   * opts: { lang, scripts: QAReviewScripts (for the pinned cases of a fix) }
   */
  function files(report, options) {
    const opts = options || {};
    const watch = watchOf(report);
    const by = sections(watch);
    const sign = (report && report.signature && report.signature.mark) || "";
    const line = "QA-lab URL Review · " + watch.host + (sign ? " · " + sign : "");
    const out = [];
    if (by.blocklist || by.lookalike || by.mail) out.push({ path: "dig/qa-lab-dns.sh", content: digScript(watch, by, line) });
    if (by.lists || by.linked || by.hacked || by.exposed || by.tls) out.push({ path: "curl/qa-lab-http.sh", content: curlScript(watch, by, line) });
    if (by.mail) out.push({ path: "checkdmarc/check_mail.py", content: mailPython(watch, by, line) });
    if (by.headers) out.push(...zapFiles(watch, by, line));
    if (by.headers || by.exposed) out.push(...nucleiFiles(watch, by, line));
    if (by.a11y) out.push(...a11yFiles(watch, by, line));
    out.push(...playwrightWatch(watch, by, line));
    out.push(...pinnedSuite(report, watch, opts.scripts));
    if (!out.length) return [];
    const present = {};
    out.forEach((file) => { present[file.path] = true; });
    out.push({ path: ".github/workflows/qa-lab-watch.yml", content: workflowFile(watch, present) });
    const book = bookFor(opts.lang);
    const readme = ["# " + line, "", fill(book.readmeIntro, { base: watch.base }), "", "## " + book.readmeRun, ""];
    out.forEach((file) => { if (HOW[file.path]) readme.push("    " + HOW[file.path]); });
    readme.push("", "## " + book.readmeEnv, "", book.readmeEnvText, "");
    if (watch.regressions.length) {
      readme.push("## " + book.readmePins, "");
      watch.regressions.forEach((pin) => readme.push("- " + pin.id + " · " + (pin.title || pin.key) + ((pin.cases || []).length ? " (" + pin.cases.join(", ") + ")" : "")));
      readme.push("");
    }
    out.unshift({ path: "README.md", content: readme.join("\n") });
    return out;
  }

  const api = { html, files, words, bookFor, TOOL_GROUPS, LOGOS, COPY, KINDS, ZAP_RULES };
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.QAReviewWatch = api;
})(typeof window !== "undefined" ? window : globalThis);
