(function (root) {
  const KEY = "qa-review-analytics";
  const listeners = [];

  function choice() {
    try { return localStorage.getItem(KEY) || ""; } catch (error) { return ""; }
  }

  function allowed() {
    return choice() === "allow";
  }

  function loadAnalytics() {
    if (!allowed() || root.__qaReviewAnalytics) return;
    root.__qaReviewAnalytics = true;
    root.dataLayer = root.dataLayer || [];
    root.gtag = root.gtag || function () { root.dataLayer.push(arguments); };
    root.gtag("js", new Date());
    root.gtag("config", "G-J8GNF5380F", {
      anonymize_ip: true,
      send_page_view: true,
      page_title: document.title,
      page_path: location.pathname,
      page_location: location.href
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
    try { localStorage.setItem(KEY, value); } catch (error) { /* the choice applies for this view */ }
    const bar = document.getElementById("cookie-note");
    if (bar) bar.hidden = true;
    if (value === "allow") loadAnalytics();
  }

  function mount() {
    if (document.getElementById("cookie-note")) return;
    const bar = document.createElement("div");
    bar.id = "cookie-note";
    bar.className = "cookie-note";
    bar.setAttribute("role", "dialog");
    bar.setAttribute("aria-label", "Cookies");
    bar.innerHTML = '<p>This review stores a device id and your language choice. Those are required for the one-run limit. Google Analytics is optional and stays off until you allow it.</p><div class="cookie-actions"><button type="button" id="cookie-necessary">Keep only what is required</button><button type="button" id="cookie-allow">Allow analytics</button></div>';
    document.body.appendChild(bar);
    document.getElementById("cookie-necessary").addEventListener("click", () => remember("necessary"));
    document.getElementById("cookie-allow").addEventListener("click", () => remember("allow"));
    if (choice()) bar.hidden = true;
  }

  root.QaConsent = {
    allowed: allowed,
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
    const query = String(root.location.search || "").slice(0, 120);
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
  noteOpen();
})(window);
