/* Runs live.html, the Live reports ring on its own, inside other apps (#2549): a Telegram Mini App, the Reddit app
   (reddit/live-reports: <html data-live-host="reddit">, and its module sets window.LIVE_HOST_OPEN), or any iframe.
   Loads in <head>, before js/qa-review-live.js boots, so the language and the report a link opens are already set.
   Inside an app every link leaves through that app, so the ring stays open behind it. */
(function () {
  "use strict";

  const LANGS = ["en", "es", "pt", "de", "fr", "it"];
  const SITE = "https://carlosandmunoz.com";
  const OWN = { en: "Review your own site", es: "Analiza tu propio sitio", pt: "Analise o seu site", de: "Eigene Website prüfen", fr: "Analyser votre site", it: "Analizza il tuo sito" };
  const FILTERS = { en: "Filters", es: "Filtros", pt: "Filtros", de: "Filter", fr: "Filtres", it: "Filtri" };

  const tg = window.Telegram && Telegram.WebApp && Telegram.WebApp.initData ? Telegram.WebApp : null;
  let framed = false;
  try { framed = window.self !== window.top; } catch (error) { framed = true; }
  const host = tg ? "telegram" : document.documentElement.dataset.liveHost || (framed ? "embed" : "web");
  const params = new URLSearchParams(location.search);
  const user = (tg && tg.initDataUnsafe && tg.initDataUnsafe.user) || {};

  function pick(code) {
    const two = String(code || "").slice(0, 2).toLowerCase();
    return LANGS.includes(two) ? two : "";
  }
  const lang = pick(params.get("lang")) || pick(user.language_code) || pick(navigator.language) || "en";
  document.documentElement.lang = lang;
  document.documentElement.dataset.liveHost = host;
  const page = SITE + "/qa-review" + (lang === "en" ? "" : "-" + lang) + ".html";

  // t.me/<bot>/<app>?startapp=<report id> and live.html?start=<report id> open that report.
  const start = (tg && tg.initDataUnsafe && tg.initDataUnsafe.start_param) || params.get("tgWebAppStartParam") || params.get("start") || "";
  if (/^[\w-]{1,64}$/.test(start) && !params.get("live")) {
    params.set("live", start);
    history.replaceState(history.state, "", location.pathname + "?" + params + location.hash);
  }

  function tagged(url) {
    try {
      const u = new URL(url, location.href);
      if (u.origin === SITE && !u.searchParams.has("utm_source")) {
        u.searchParams.set("utm_source", host);
        u.searchParams.set("utm_medium", "app");
        u.searchParams.set("utm_campaign", "live-reports");
      }
      return u.href;
    } catch (error) {
      return url;
    }
  }

  const nativeOpen = window.open.bind(window);
  function leave(url) {
    const href = tagged(url);
    // The Reddit module sets it after this file runs, so it is read on each link.
    if (typeof window.LIVE_HOST_OPEN === "function") { window.LIVE_HOST_OPEN(href); return; }
    if (tg) {
      if (/^https:\/\/t\.me\//.test(href)) tg.openTelegramLink(href); else tg.openLink(href);
      return;
    }
    if (host === "web") location.href = href; else nativeOpen(href, "_blank", "noopener,noreferrer");
  }

  if (host !== "web") window.open = (url) => { leave(String(url)); return null; };

  // Telegram's in-app browser has no share sheet: share through Telegram, as a link that opens the report in the app.
  function appLink(id) {
    const meta = document.querySelector('meta[name="live-telegram-app"]');
    const base = meta && meta.content;
    return base ? base + (id ? "?startapp=" + encodeURIComponent(id) : "") : "";
  }
  if (tg) {
    Object.defineProperty(navigator, "share", {
      configurable: true,
      value(data) {
        let id = "";
        try { id = new URL(data.url).searchParams.get("live") || ""; } catch (error) { /* no report id */ }
        const link = appLink(id) || data.url;
        tg.openTelegramLink("https://t.me/share/url?url=" + encodeURIComponent(link) + "&text=" + encodeURIComponent(data.text || data.title || ""));
        return Promise.resolve();
      }
    });
  }

  document.addEventListener("click", (event) => {
    if (!(event.target instanceof Element)) return;
    if (event.target.closest('[data-act="own"], [data-lapp-own]')) {
      event.preventDefault();
      event.stopImmediatePropagation();
      leave(page + "#intake");
      return;
    }
    if (host === "web") return;
    const a = event.target.closest("a[href]");
    if (!a) return;
    const href = a.getAttribute("href");
    if (!href || href.startsWith("#") || /^mailto:/i.test(href)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    leave(a.href);
  }, true);

  function closeReport() {
    const close = document.querySelector('.lv-actions [data-act="close"]');
    if (close) close.click();
  }

  if (tg) {
    tg.ready();
    tg.expand();
    const at = (v) => tg.isVersionAtLeast && tg.isVersionAtLeast(v);
    if (at("6.1")) { tg.setHeaderColor("#071116"); tg.setBackgroundColor("#071116"); }
    if (at("7.10") && tg.setBottomBarColor) tg.setBottomBarColor("#071116");
    // Dragging the ring down would otherwise close the Mini App.
    if (at("7.7")) tg.disableVerticalSwipes();
    if (at("6.1")) tg.BackButton.onClick(closeReport);
  }

  document.addEventListener("DOMContentLoaded", () => {
    const own = document.querySelector("[data-lapp-own]");
    if (own) { own.textContent = OWN[lang]; own.href = page + "#intake"; }
    const label = document.querySelector("[data-lapp-filters-label]");
    if (label) label.textContent = FILTERS[lang];
    const filters = document.querySelector("[data-lapp-filters]");
    if (filters && window.matchMedia("(min-width: 1100px)").matches) filters.open = true;
    if (tg && tg.isVersionAtLeast && tg.isVersionAtLeast("6.1")) {
      const sync = () => { if (document.body.classList.contains("live-viewing")) tg.BackButton.show(); else tg.BackButton.hide(); };
      new MutationObserver(sync).observe(document.body, { attributes: true, attributeFilter: ["class"] });
      sync();
    }
  });

  window.LiveHost = { host, lang, leave, appLink };
})();
