(function (root) {
  const KEY = "site-analytics";
  const REVIEW_KEY = "qa-review-analytics";
  const COPY = {
    en: { note: "This site stores your language and theme. Google Analytics runs without cookies until you allow it, and counts visits in aggregate. Google Translate sets Google cookies, so it loads only after you allow it or pick a language from the menu.", keep: "Keep only what is required", allow: "Allow analytics and translation", settings: "Cookie settings" },
    es: { note: "Este sitio guarda tu idioma y tu tema. Google Analytics funciona sin cookies hasta que lo permitas, y cuenta las visitas en conjunto. Google Translate pone cookies de Google, así que solo carga cuando lo permites o eliges un idioma en el menú.", keep: "Solo lo necesario", allow: "Permitir analítica y traducción", settings: "Configuración de cookies" },
    pt: { note: "Este site guarda o seu idioma e o seu tema. O Google Analytics funciona sem cookies até você permitir e conta as visitas em conjunto. O Google Tradutor coloca cookies do Google, então só carrega quando você permite ou escolhe um idioma no menu.", keep: "Só o necessário", allow: "Permitir analytics e tradução", settings: "Configurações de cookies" },
    de: { note: "Diese Website speichert Ihre Sprache und Ihr Design. Google Analytics läuft ohne Cookies, bis Sie es erlauben, und zählt Besuche nur gesammelt. Google Übersetzer setzt Google-Cookies und lädt daher erst, wenn Sie es erlauben oder im Menü eine Sprache wählen.", keep: "Nur das Nötige", allow: "Analytics und Übersetzung erlauben", settings: "Cookie-Einstellungen" },
    fr: { note: "Ce site garde votre langue et votre thème. Google Analytics fonctionne sans cookies tant que vous ne l’autorisez pas, et compte les visites de façon agrégée. Google Traduction dépose des cookies Google : il ne se charge que si vous l’autorisez ou choisissez une langue dans le menu.", keep: "Le strict nécessaire", allow: "Autoriser l’analyse et la traduction", settings: "Paramètres des cookies" },
    it: { note: "Questo sito salva la lingua e il tema. Google Analytics funziona senza cookie finché non lo consenti e conta le visite in forma aggregata. Google Traduttore imposta cookie di Google, quindi si carica solo se lo consenti o scegli una lingua dal menu.", keep: "Solo il necessario", allow: "Consenti analytics e traduzione", settings: "Impostazioni cookie" }
  };

  function read(key) {
    try { return localStorage.getItem(key) || ""; } catch (error) { return ""; }
  }

  function choice() {
    return read(KEY) || read(REVIEW_KEY);
  }

  function copy() {
    const lang = String(document.documentElement.lang || "en").slice(0, 2).toLowerCase();
    return COPY[lang] || COPY.en;
  }

  function apply(value) {
    if (typeof root.gtag !== "function") return;
    root.gtag("consent", "update", { analytics_storage: value === "allow" ? "granted" : "denied" });
  }

  function remember(value) {
    try {
      localStorage.setItem(KEY, value);
      localStorage.setItem(REVIEW_KEY, value);
    } catch (error) { /* the choice applies for this view */ }
    apply(value);
    const bar = document.getElementById("site-consent");
    if (bar) bar.hidden = true;
    root.dispatchEvent(new CustomEvent("site-consent", { detail: value }));
  }

  function style() {
    if (document.getElementById("site-consent-style")) return;
    const css = document.createElement("style");
    css.id = "site-consent-style";
    css.textContent = [
      "#site-consent{position:fixed;z-index:9990;left:16px;right:16px;bottom:16px;max-width:680px;margin:0 auto;padding:14px 16px;border-radius:16px;background:#fff;color:#12181f;border:1px solid #d5dce3;box-shadow:0 18px 50px rgba(8,14,18,.28);font:14px/1.45 system-ui,-apple-system,Segoe UI,sans-serif}",
      "#site-consent[hidden]{display:none}",
      "#site-consent p{margin:0 0 10px}",
      "#site-consent .sc-actions{display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap}",
      "#site-consent button{border-radius:999px;padding:7px 14px;font:inherit;font-weight:700;cursor:pointer}",
      "#site-consent .sc-keep{background:transparent;color:inherit;border:1px solid #9aa5b1}",
      "#site-consent .sc-allow{background:#0d6e76;color:#fff;border:0}",
      ".dark-mode #site-consent{background:#1a2430;color:#e8eef2;border-color:#2a3440}",
      ".dark-mode #site-consent .sc-allow{background:#4db3bb;color:#0c1118}",
      "[data-cookie-settings]{background:none;border:0;padding:0;font:inherit;color:inherit;text-decoration:underline;cursor:pointer}",
      "@media print{#site-consent{display:none!important}}"
    ].join("");
    document.head.appendChild(css);
  }

  function label() {
    const text = copy();
    const bar = document.getElementById("site-consent");
    if (bar) {
      bar.querySelector("p").textContent = text.note;
      bar.querySelector(".sc-keep").textContent = text.keep;
      bar.querySelector(".sc-allow").textContent = text.allow;
    }
    document.querySelectorAll("[data-cookie-settings]").forEach((node) => { node.textContent = text.settings; });
  }

  function mount() {
    style();
    let bar = document.getElementById("site-consent");
    if (!bar) {
      bar = document.createElement("div");
      bar.id = "site-consent";
      bar.className = "no-print";
      bar.setAttribute("role", "dialog");
      bar.setAttribute("aria-label", "Cookies");
      bar.innerHTML = '<p></p><div class="sc-actions"><button type="button" class="sc-keep"></button><button type="button" class="sc-allow"></button></div>';
      document.body.appendChild(bar);
      bar.querySelector(".sc-keep").addEventListener("click", () => remember("necessary"));
      bar.querySelector(".sc-allow").addEventListener("click", () => remember("allow"));
    }
    bar.hidden = !!choice() || navigator.webdriver === true;
    document.querySelectorAll("[data-cookie-settings]").forEach((node) => {
      node.addEventListener("click", open);
    });
    label();
    new MutationObserver(label).observe(document.documentElement, { attributes: true, attributeFilter: ["lang"] });
  }

  function open() {
    const bar = document.getElementById("site-consent");
    if (!bar) return;
    bar.hidden = false;
    bar.querySelector(".sc-allow").focus();
  }

  root.SiteConsent = { choice: choice, open: open };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mount);
  else mount();
}(window));
