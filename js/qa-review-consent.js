(function (root) {
  const KEY = "qa-review-analytics";
  const listeners = [];

  function choice() {
    try { return localStorage.getItem(KEY) || localStorage.getItem("site-analytics") || ""; } catch (error) { return ""; }
  }

  function allowed() {
    return choice() === "allow";
  }

  // Sign-in links and OAuth returns carry one-time tokens; a saved report id reopens that report.
  const PRIVATE_PARAMS = ["report", "signin", "key", "state", "code", "scope", "error", "error_description", "error_uri", "iss"];

  function scrubbed(href) {
    const page = new URL(href);
    PRIVATE_PARAMS.forEach((name) => page.searchParams.delete(name));
    return page;
  }

  function loadAnalytics() {
    if (!allowed() || root.__qaReviewAnalytics) return;
    root.__qaReviewAnalytics = true;
    root.dataLayer = root.dataLayer || [];
    root.gtag = root.gtag || function () { root.dataLayer.push(arguments); };
    root.gtag("consent", "default", { ad_storage: "denied", ad_user_data: "denied", ad_personalization: "denied", analytics_storage: "granted" });
    root.gtag("js", new Date());
    const page = scrubbed(location.href);
    root.gtag("config", "G-J8GNF5380F", {
      anonymize_ip: true,
      send_page_view: true,
      page_title: document.title,
      page_path: location.pathname,
      page_location: page.href,
      content_group: "QA-lab URL Review"
    });
    const script = document.createElement("script");
    script.async = true;
    script.src = "https://www.googletagmanager.com/gtag/js?id=G-J8GNF5380F";
    document.head.appendChild(script);
    if (root.SiteAnalytics) {
      root.SiteAnalytics.bind("review");
      root.SiteAnalytics.noteVisit();
    }
    listeners.splice(0).forEach((fn) => fn());
  }

  function remember(value) {
    try {
      localStorage.setItem(KEY, value);
      localStorage.setItem("site-analytics", value);
    } catch (error) { /* the choice applies for this view */ }
    const bar = document.getElementById("cookie-note");
    if (bar) bar.hidden = true;
    if (value === "allow") loadAnalytics();
    root.dispatchEvent(new CustomEvent("site-consent", { detail: value }));
  }

  const COPY = {
    en: ["This review stores a device id and your language choice. Those are required for the one-run limit. Opening a review page records the IP address, browser, approximate city, time zone, languages and referring site to count visits, kept 12 months. Once you sign in, a session key with your name, email and photo is stored in this browser. Google Analytics and Google Translate set Google cookies, so both stay off until you allow them. Picking a language from the menu also turns translation on.", "Keep only what is required", "Allow analytics and translation"],
    es: ["Esta revisión guarda un identificador del dispositivo y tu idioma. Son necesarios para el límite de una ejecución. Abrir una página de revisión registra la dirección IP, el navegador, la ciudad aproximada, la zona horaria, los idiomas y el sitio de origen para contar visitas, y se guarda 12 meses. Al iniciar sesión, este navegador guarda una clave de sesión con tu nombre, correo y foto. Google Analytics y Google Translate ponen cookies de Google, así que ambos quedan apagados hasta que los permitas. Elegir un idioma en el menú también activa la traducción.", "Solo lo necesario", "Permitir analítica y traducción"],
    pt: ["Esta revisão guarda um identificador do dispositivo e o seu idioma. Eles são necessários para o limite de uma execução. Abrir uma página de revisão registra o endereço IP, o navegador, a cidade aproximada, o fuso horário, os idiomas e o site de origem para contar visitas, guardados por 12 meses. Ao entrar, este navegador guarda uma chave de sessão com seu nome, e-mail e foto. O Google Analytics e o Google Tradutor colocam cookies do Google, então os dois ficam desligados até você permitir. Escolher um idioma no menu também liga a tradução.", "Só o necessário", "Permitir analytics e tradução"],
    de: ["Diese Prüfung speichert eine Geräte-ID und Ihre Sprache. Beides ist für das Limit von einem Lauf nötig. Beim Öffnen einer Prüfseite werden IP-Adresse, Browser, ungefähre Stadt, Zeitzone, Sprachen und verweisende Website erfasst, um Besuche zu zählen, und 12 Monate aufbewahrt. Nach der Anmeldung speichert dieser Browser einen Sitzungsschlüssel mit Ihrem Namen, Ihrer E-Mail-Adresse und Ihrem Foto. Google Analytics und Google Übersetzer setzen Google-Cookies und bleiben daher aus, bis Sie sie erlauben. Eine Sprache im Menü zu wählen, schaltet die Übersetzung ebenfalls ein.", "Nur das Nötige", "Analytics und Übersetzung erlauben"],
    fr: ["Cette revue garde un identifiant d’appareil et votre langue. Ils sont nécessaires pour la limite d’une exécution. Ouvrir une page de revue enregistre l’adresse IP, le navigateur, la ville approximative, le fuseau horaire, les langues et le site d’origine pour compter les visites, conservés 12 mois. Une fois connecté, ce navigateur garde une clé de session avec votre nom, votre e-mail et votre photo. Google Analytics et Google Traduction déposent des cookies Google : les deux restent coupés tant que vous ne les autorisez pas. Choisir une langue dans le menu active aussi la traduction.", "Le strict nécessaire", "Autoriser l’analyse et la traduction"],
    it: ["Questa revisione salva un identificativo del dispositivo e la lingua. Servono per il limite di un’esecuzione. Aprire una pagina di revisione registra indirizzo IP, browser, città approssimativa, fuso orario, lingue e sito di provenienza per contare le visite, conservati 12 mesi. Dopo l’accesso, questo browser salva una chiave di sessione con nome, email e foto. Google Analytics e Google Traduttore impostano cookie di Google, quindi restano spenti finché non li consenti. Scegliere una lingua dal menu attiva anche la traduzione.", "Solo il necessario", "Consenti analytics e traduzione"]
  };

  function mount() {
    if (document.getElementById("cookie-note")) return;
    const bar = document.createElement("div");
    bar.id = "cookie-note";
    bar.className = "cookie-note notranslate";
    bar.setAttribute("role", "dialog");
    bar.setAttribute("aria-label", "Cookies");
    bar.innerHTML = '<p></p><div class="cookie-actions"><button type="button" id="cookie-necessary"></button><button type="button" id="cookie-allow"></button></div>';
    const label = () => {
      const text = COPY[String(document.documentElement.lang || "en").slice(0, 2).toLowerCase()] || COPY.en;
      bar.querySelector("p").textContent = text[0];
      bar.querySelector("#cookie-necessary").textContent = text[1];
      bar.querySelector("#cookie-allow").textContent = text[2];
    };
    label();
    new MutationObserver(label).observe(document.documentElement, { attributes: true, attributeFilter: ["lang"] });
    document.body.appendChild(bar);
    document.getElementById("cookie-necessary").addEventListener("click", () => remember("necessary"));
    document.getElementById("cookie-allow").addEventListener("click", () => remember("allow"));
    if (choice()) bar.hidden = true;
  }

  // The first page of the visit keeps its tags and referrer, so a review started pages later still names its source.
  const LANDING_KEY = "qa-review-landing";

  function keepLanding() {
    try {
      if (sessionStorage.getItem(LANDING_KEY)) return;
      let referrerHost = "";
      try { referrerHost = document.referrer ? new URL(document.referrer).host : ""; } catch (error) { referrerHost = ""; }
      sessionStorage.setItem(LANDING_KEY, JSON.stringify({ query: scrubbed(root.location.href).search.slice(0, 400), referrerHost: referrerHost.slice(0, 80) }));
    } catch (error) { /* storage is off */ }
  }

  function landing() {
    try { return JSON.parse(sessionStorage.getItem(LANDING_KEY) || "null"); } catch (error) { return null; }
  }

  root.QaConsent = {
    allowed: allowed,
    landing: landing,
    onAllow: function (fn) { if (allowed()) fn(); else listeners.push(fn); }
  };

  function noteOpen() {
    if (root.top !== root.self || navigator.webdriver) return;
    const host = root.location.hostname;
    if (host === "localhost" || host === "127.0.0.1" || host === "0.0.0.0") return;
    try {
      if (sessionStorage.getItem("qa-review-open-noted") === "1") return;
      sessionStorage.setItem("qa-review-open-noted", "1");
    } catch (error) { return; }
    const page = (root.location.pathname.split("/").pop() || "qa-review.html").slice(0, 80);
    let referrerHost = "";
    try { referrerHost = document.referrer ? new URL(document.referrer).host : ""; } catch (error) { referrerHost = ""; }
    const query = scrubbed(root.location.href).search.slice(0, 120);
    const zone = (Intl.DateTimeFormat().resolvedOptions().timeZone || "").slice(0, 60);
    const languages = (navigator.languages || []).slice(0, 6).join(",").slice(0, 80);
    fetch("https://us-central1-carlosm-interactive-cv.cloudfunctions.net/reviewUrl/opened", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "omit",
      keepalive: true,
      body: JSON.stringify({
        page: page,
        query: query,
        lang: String(document.documentElement.lang || "en").slice(0, 12),
        referrerHost: referrerHost.slice(0, 80),
        screen: (root.innerWidth || 0) < 768 ? "phone" : "desktop",
        timezone: zone,
        languages: languages,
        title: String(document.title || "").slice(0, 120)
      })
    }).catch(function () {});
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mount);
  else mount();
  if (allowed()) loadAnalytics();
  keepLanding();
  noteOpen();
})(window);
