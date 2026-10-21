/**
 * Browser pass for the URL review: one headless Chromium visit per page.
 * Records which tracking requests and cookies appear before a choice and after Reject,
 * runs axe-core, compares the HTML text with the rendered text, checks a phone width,
 * checks a tablet width, and keeps three small screenshots. The only click is a cookie banner's reject button.
 */
const fs = require("fs");
const dns = require("dns").promises;

const AGENT_TAG = "CarlosMunozReview/1.0 (+https://carlosandmunoz.com/qa-review.html)";
const NAV_MS = 20000;
const IDLE_MS = 5000;
const HTML_MAX = 2000000;
const AXE_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

const VENDORS = [
  ["Google Analytics", /(^|\.)(google-analytics\.com|analytics\.google\.com)$/],
  ["Google Ads", /(^|\.)(doubleclick\.net|googleadservices\.com|googlesyndication\.com|googletagservices\.com)$/],
  ["Google Tag Manager", /(^|\.)googletagmanager\.com$/],
  ["Meta Pixel", /(^|\.)(facebook\.com|facebook\.net)$/],
  ["LinkedIn Insight", /(^|\.)(px\.ads\.linkedin\.com|snap\.licdn\.com)$/],
  ["TikTok Pixel", /(^|\.)analytics\.tiktok\.com$/],
  ["Microsoft Clarity", /(^|\.)clarity\.ms$/],
  ["Microsoft Ads", /(^|\.)bat\.bing\.com$/],
  ["Hotjar", /(^|\.)(hotjar\.com|hotjar\.io)$/],
  ["X Ads", /(^|\.)(ads-twitter\.com|analytics\.twitter\.com)$/],
  ["Pinterest Tag", /(^|\.)ct\.pinterest\.com$/],
  ["Reddit Pixel", /(^|\.)(alb\.reddit\.com|pixel-config\.reddit\.com)$/],
  ["Snap Pixel", /(^|\.)tr\.snapchat\.com$/],
  ["Yandex Metrica", /(^|\.)mc\.yandex\.(ru|com)$/],
  ["Criteo", /(^|\.)(criteo\.com|criteo\.net)$/],
  ["Taboola", /(^|\.)taboola\.com$/],
  ["Outbrain", /(^|\.)outbrain\.com$/],
  ["Quantcast", /(^|\.)(quantserve\.com|quantcount\.com)$/],
  ["HubSpot", /(^|\.)(hs-analytics\.net|track\.hubspot\.com|hsadspixel\.net|hs-scripts\.com)$/],
  ["Segment", /(^|\.)(api\.segment\.io|cdn\.segment\.com)$/],
  ["Mixpanel", /(^|\.)(api-js\.mixpanel\.com|api\.mixpanel\.com)$/],
  ["Amplitude", /(^|\.)(api2?\.amplitude\.com)$/],
  ["Heap", /(^|\.)heapanalytics\.com$/],
  ["FullStory", /(^|\.)(fullstory\.com|rs\.fullstory\.com)$/],
  ["Adobe Analytics", /(\.omtrdc\.net|\.2o7\.net|(^|\.)demdex\.net)$/]
];
const TRACKING_COOKIE = /^(_ga|_gid|_gat|_gcl_|_fbp|_fbc|_uet|_clck|_clsk|_hj|_tt_|_ttp|_pin_|_scid|_rdt_|_ym|li_|bcookie|lidc|IDE$|test_cookie$|NID$|MUID$|ANONCHK$|_mkto_trk|hubspotutk|__hs|ajs_|mp_|amp_|_derived_epik|_parsely|s_cc$|s_sq$|AMCV_|demdex)/i;
const CONSENT_COOKIE = /^(OptanonConsent|OptanonAlertBoxClosed|CookieConsent|euconsent|didomi|cmplz_|cookieyes|uc_|_iub|osano|notice_|cookielawinfo|cookie_consent|cookieconsent|axeptio|borlabs|klaro|consent)/i;

const CMPS = [
  ["OneTrust", "#onetrust-banner-sdk", "#onetrust-reject-all-handler"],
  ["Cookiebot", "#CybotCookiebotDialog", "#CybotCookiebotDialogBodyButtonDecline, #CybotCookiebotDialogBodyLevelButtonLevelOptinDeclineAll"],
  ["Didomi", "#didomi-notice, #didomi-popup", "#didomi-notice-disagree-button, .didomi-continue-without-agreeing"],
  ["Usercentrics", "#usercentrics-root, #usercentrics-cmp-ui", ""],
  ["Quantcast Choice", ".qc-cmp2-container", ""],
  ["CookieYes", ".cky-consent-container", ".cky-btn-reject"],
  ["Complianz", ".cmplz-cookiebanner", ".cmplz-deny"],
  ["Termly", "#termly-code-snippet-support", "[data-tid=banner-decline]"],
  ["iubenda", "#iubenda-cs-banner", ".iubenda-cs-reject-btn"],
  ["Osano", ".osano-cm-window", ".osano-cm-denyAll"],
  ["TrustArc", "#truste-consent-track, #consent_blackbar", "#truste-consent-required"],
  ["Klaro", ".klaro .cookie-notice", ".cn-decline"],
  ["Borlabs", "#BorlabsCookieBox", "[data-cookie-refuse]"],
  ["Axeptio", "#axeptio_overlay", "#axeptio_btn_dismiss"],
  ["Google consent message", ".fc-consent-root", ".fc-cta-do-not-consent"],
  ["Sourcepoint", "iframe[id^='sp_message_iframe']", ""]
];
const REJECT_TEXT = "^(reject|reject all|reject cookies|decline|decline all|deny|deny all|refuse|refuse all|disagree|rechazar|rechazar todo|rechazar todas|recusar|rejeitar|rejeitar todos|ablehnen|alle ablehnen|refuser|tout refuser|rifiuta|rifiuta tutto)\\b|\\b(only|just|solo|s[oó]lo|s[oó]|nur|seulement|uniquement|strict|strictly|apenas|somente|soltanto)(?![a-z]).{0,30}(neces|essential|essenz|required|requerid|erforderlich|n[oö]tig|notwendig|n[ée]cessaire)|\\b(necessary|essential|required)( cookies)? only\\b|continue without|continuar sin|continuer sans|weiter ohne|continua senza|continuar sem";

let axeSource = "";
function axeScript() {
  if (!axeSource) axeSource = fs.readFileSync(require.resolve("axe-core/axe.min.js"), "utf8");
  return axeSource;
}

function blockedHost(raw) {
  let url;
  try { url = new URL(raw); } catch (error) { return true; }
  if (url.protocol === "data:" || url.protocol === "blob:") return false;
  if (url.protocol !== "http:" && url.protocol !== "https:") return true;
  const host = url.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".internal") || host === "metadata" || host.endsWith(".local")) return true;
  const v4 = host.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (v4) {
    const [a, b] = [Number(v4[1]), Number(v4[2])];
    return a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224;
  }
  if (host.includes(":")) return host === "::1" || host === "::" || /^f[cd]/.test(host) || /^fe[89ab]/.test(host) || host.startsWith("::ffff:");
  return false;
}

const resolved = new Map();
function privateAddress(host) {
  if (!resolved.has(host)) {
    resolved.set(host, dns.lookup(host, { all: true }).then((list) => list.some((row) => blockedHost("https://" + (row.family === 6 ? "[" + row.address + "]" : row.address) + "/"))).catch(() => false));
  }
  return resolved.get(host);
}

function vendorOf(host) {
  const found = VENDORS.find((row) => row[1].test(host));
  return found ? found[0] : "";
}

function siteOf(host) {
  const parts = String(host || "").replace(/^www\./, "").split(".");
  if (parts.length > 2 && parts[parts.length - 1].length === 2 && /^(co|com|org|net|gov|ac|edu|or|ne)$/.test(parts[parts.length - 2])) return parts.slice(-3).join(".");
  return parts.slice(-2).join(".");
}

function trim(text, max) {
  const value = String(text == null ? "" : text).replace(/\s+/g, " ").trim();
  return value.length > max ? value.slice(0, max - 1) + "…" : value;
}

function shortUrl(raw) {
  try {
    const url = new URL(raw);
    return trim(url.host + url.pathname, 120);
  } catch (error) {
    return trim(raw, 120);
  }
}

function pathOf(raw) {
  try {
    const url = new URL(raw);
    return url.pathname + url.search;
  } catch (error) {
    return String(raw || "");
  }
}

function words(text) {
  return (String(text || "").match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu) || []).length;
}

function htmlText(html) {
  return String(html || "")
    .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
    .replace(/<template\b[\s\S]*?<\/template>/gi, " ")
    .replace(/<noscript\b[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&[a-z#0-9]+;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normal(text) {
  return String(text || "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

function recorder(pageHttps) {
  const state = { phase: "before", vendors: {}, errors: [], errorCount: 0, failed: [], failedCount: 0, mixed: [], requests: 0, hosts: new Set() };
  const vendorRow = (phase, name) => {
    const bucket = state.vendors[phase] || (state.vendors[phase] = {});
    return bucket[name] || (bucket[name] = { name, loads: 0, hits: 0, denied: 0, signals: [] });
  };
  return {
    state,
    request(req) {
      const raw = req.url();
      if (/^(data|blob):/.test(raw)) return;
      state.requests += 1;
      let url;
      try { url = new URL(raw); } catch (error) { return; }
      state.hosts.add(url.hostname);
      if (pageHttps && url.protocol === "http:" && state.mixed.length < 6) state.mixed.push(shortUrl(raw));
      const name = vendorOf(url.hostname);
      if (!name) return;
      const row = vendorRow(state.phase, name);
      const type = req.resourceType();
      if (type === "script" || type === "stylesheet" || type === "document" || name === "Google Tag Manager") {
        row.loads += 1;
        return;
      }
      const gcs = url.searchParams.get("gcs") || "";
      if (gcs && row.signals.indexOf(gcs) === -1 && row.signals.length < 4) row.signals.push(gcs);
      if (/^G1[0-]0$/.test(gcs) || /^G100/.test(gcs)) row.denied += 1;
      else row.hits += 1;
    },
    response(res) {
      const status = res.status();
      if (status < 400) return;
      state.failedCount += 1;
      if (state.failed.length < 6) state.failed.push({ url: shortUrl(res.url()), status, type: res.request().resourceType() });
    },
    failed(req) {
      const reason = (req.failure() && req.failure().errorText) || "";
      if (/ERR_ABORTED|blockedbyclient|ERR_BLOCKED_BY_CLIENT/i.test(reason)) return;
      state.failedCount += 1;
      if (state.failed.length < 6) state.failed.push({ url: shortUrl(req.url()), status: 0, error: trim(reason, 60), type: req.resourceType() });
    },
    console(message) {
      const text = message.text();
      if (/Mixed Content/i.test(text) && state.mixed.length < 6) state.mixed.push(trim(text.replace(/^.*?requested an insecure \w+ '([^']+)'.*$/i, "$1"), 120));
      if (message.type() !== "error") return;
      if (/Failed to load resource/i.test(text)) return;
      const plain = text.replace(/%[cdsoOif]/g, "").replace(/\b(font-size|color|background)\s*:[^;]*;?/gi, "").replace(/\bNaN\b/g, "").trim();
      if (!plain) return;
      state.errorCount += 1;
      if (state.errors.length < 5) state.errors.push(trim(plain, 200));
    },
    pageError(error) {
      state.errorCount += 1;
      if (state.errors.length < 5) state.errors.push(trim(error && error.message ? error.message : error, 200));
    },
    vendors(phase) {
      return Object.values(state.vendors[phase] || {}).sort((a, b) => (b.hits - a.hits) || (b.loads - a.loads));
    }
  };
}

const VITALS = `(() => {
  const v = window.__qaVitals = { lcp: 0, cls: 0, tbt: 0, fcp: 0 };
  const watch = (type, fn) => { try { new PerformanceObserver((list) => list.getEntries().forEach(fn)).observe({ type, buffered: true }); } catch (e) {} };
  watch("largest-contentful-paint", (e) => { v.lcp = Math.round(e.renderTime || e.loadTime || e.startTime); });
  watch("layout-shift", (e) => { if (!e.hadRecentInput) v.cls += e.value; });
  watch("longtask", (e) => { v.tbt += Math.max(0, Math.round(e.duration - 50)); });
  watch("paint", (e) => { if (e.name === "first-contentful-paint") v.fcp = Math.round(e.startTime); });
})();`;

async function settle(page) {
  try { await page.waitForNetworkIdle({ idleTime: 700, timeout: IDLE_MS }); } catch (error) { /* busy pages keep polling */ }
}

async function prepare(context, ua, rec, viewport) {
  const page = await context.newPage();
  await page.setViewport(viewport);
  await page.setUserAgent(ua);
  await page.setExtraHTTPHeaders({ "accept-language": "en-US,en;q=0.9" });
  await page.evaluateOnNewDocument(() => { Object.defineProperty(Navigator.prototype, "webdriver", { get: () => false }); });
  await page.setRequestInterception(true);
  page.on("request", async (req) => {
    const raw = req.url();
    let hidden = blockedHost(raw);
    if (!hidden && /^https?:/i.test(raw)) {
      const host = new URL(raw).hostname;
      if (!/^[\d.]+$|:/.test(host)) hidden = await privateAddress(host);
    }
    if (hidden) {
      req.abort("blockedbyclient").catch(() => {});
      return;
    }
    if (rec) rec.request(req);
    req.continue().catch(() => {});
  });
  if (rec) {
    page.on("response", (res) => rec.response(res));
    page.on("requestfailed", (req) => rec.failed(req));
    page.on("console", (message) => rec.console(message));
    page.on("pageerror", (error) => rec.pageError(error));
  }
  page.setDefaultNavigationTimeout(NAV_MS);
  return page;
}

// A JS bot check answers 403 and then reloads into the site, so the last main-frame document says whether the page got through.
async function open(page, url) {
  let last = null;
  const watch = (res) => {
    try { if (res.request().isNavigationRequest() && res.frame() === page.mainFrame()) last = res; } catch (error) { /* detached frame */ }
  };
  page.on("response", watch);
  try {
    const res = await page.goto(url, { waitUntil: "load" });
    await settle(page);
    let raw = "";
    try { raw = res ? await res.text() : ""; } catch (error) { raw = ""; }
    const doc = last || res;
    return { status: res ? res.status() : 0, finalUrl: page.url(), raw, docStatus: doc ? doc.status() : 0, docHeaders: doc ? doc.headers() : {} };
  } finally {
    page.off("response", watch);
  }
}

function headersOf(raw) {
  const out = {};
  Object.entries(raw || {}).forEach(([key, value]) => {
    const name = key.toLowerCase();
    out[name] = name === "set-cookie" ? String(value).split("\n") : String(value);
  });
  return out;
}

async function rendered(page) {
  return page.evaluate(() => ({
    text: document.body ? document.body.innerText || "" : "",
    h1: Array.from(document.querySelectorAll("h1")).map((node) => (node.innerText || "").trim()).filter(Boolean).slice(0, 3)
  }));
}

async function domFacts(page) {
  return page.evaluate(() => {
    const here = location.hostname;
    const links = new Set();
    document.querySelectorAll("a[href]").forEach((node) => {
      try {
        const url = new URL(node.getAttribute("href"), location.href);
        if (url.hostname === here && /^https?:$/.test(url.protocol)) { url.hash = ""; links.add(url.href); }
      } catch (error) { /* skip odd hrefs */ }
    });
    const startPath = location.pathname;
    const nav = [];
    const seen = new Set();
    const visible = (node) => {
      const rect = node.getBoundingClientRect();
      const style = getComputedStyle(node);
      return rect.width > 0 && rect.height > 0 && style.visibility !== "hidden" && style.display !== "none";
    };
    const unique = (selector) => { try { return document.querySelectorAll(selector).length === 1; } catch (error) { return false; } };
    document.querySelectorAll("nav a[href], header a[href], [role=navigation] a[href], main a[href]").forEach((node) => {
      if (nav.length >= 8) return;
      const raw = node.getAttribute("href") || "";
      if (!raw || /['\\#]/.test(raw) || /^(mailto|tel|javascript):/i.test(raw) || node.target === "_blank" || node.hasAttribute("download")) return;
      let url;
      try { url = new URL(raw, location.href); } catch (error) { return; }
      if (url.hostname !== here || url.pathname === startPath || seen.has(url.pathname) || /\/(wp-)?admin|log-?out|sign-?out|\.(pdf|zip|docx?|xlsx?)$/i.test(url.pathname)) return;
      if (/\/(19|20)\d{2}[\/-](0?[1-9]|1[0-2]|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[\/-]/i.test(url.pathname)) return;
      const bits = [];
      const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT);
      while (walker.nextNode()) bits.push(walker.currentNode.nodeValue);
      const text = bits.join(" ").replace(/\s+/g, " ").trim();
      if (text.length < 2 || text.length > 60 || !/\p{L}{2}/u.test(text) || !visible(node)) return;
      const value = raw.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
      const options = [node.id && /^[A-Za-z][\w-]*$/.test(node.id) ? "#" + node.id : "", 'a[href="' + value + '"]', 'header a[href="' + value + '"]', 'nav a[href="' + value + '"]', 'main a[href="' + value + '"]'].filter(Boolean);
      const selector = options.find((option) => unique(option) && document.querySelector(option) === node);
      if (!selector) return;
      seen.add(url.pathname);
      nav.push({ text, target: url.pathname, selector, where: node.closest("main") ? "main" : "navigation" });
    });
    const named = (node) => node.labels && node.labels.length || node.getAttribute("aria-label") || node.getAttribute("aria-labelledby") || node.getAttribute("title");
    const exposed = (node) => node.getClientRects().length > 0 && getComputedStyle(node).visibility !== "hidden" && !node.closest("[aria-hidden=true], [inert]");
    const controls = Array.from(document.querySelectorAll("input:not([type=hidden]):not([type=submit]):not([type=button]), select, textarea")).filter(exposed);
    return {
      title: (document.title || "").trim().slice(0, 160),
      lang: document.documentElement.getAttribute("lang") || "",
      h1: Array.from(document.querySelectorAll("h1")).map((node) => (node.innerText || "").trim()).filter(Boolean).slice(0, 3),
      links: Array.from(links).slice(0, 200),
      forms: document.querySelectorAll("form").length,
      unlabeled: controls.filter((node) => !named(node)).length,
      buttons: document.querySelectorAll("button, [role=button]").length,
      iframes: document.querySelectorAll("iframe").length,
      images: document.querySelectorAll("img").length,
      missingAlt: document.querySelectorAll("img:not([alt])").length,
      nav
    };
  });
}

async function runAxe(page, rules) {
  try {
    const loaded = await page.evaluate(`(() => { if (window.axe && window.axe.run) return true; const define = undefined, module = undefined, exports = undefined; ${axeScript()}; if (!window.axe && typeof axe !== "undefined") window.axe = axe; return !!(window.axe && window.axe.run); })()`);
    if (!loaded) return { ran: false, violations: [] };
    const out = await Promise.race([
      page.evaluate(async (tags, only) => {
        const runOnly = only && only.length ? { type: "rule", values: only } : { type: "tag", values: tags };
        const result = await window.axe.run(document, { runOnly, resultTypes: ["violations"] });
        return {
          version: window.axe.version,
          passes: (result.passes || []).length,
          violations: result.violations.map((rule) => ({
            id: rule.id,
            impact: rule.impact || "minor",
            help: rule.help,
            helpUrl: rule.helpUrl,
            nodes: rule.nodes.length,
            targets: rule.nodes.slice(0, 3).map((node) => String((node.target || []).join(" ")).slice(0, 120))
          }))
        };
      }, AXE_TAGS, rules || null),
      new Promise((resolve) => setTimeout(() => resolve(null), 15000))
    ]);
    if (!out) return { ran: false, violations: [] };
    return { ran: true, version: out.version, violations: out.violations.slice(0, 20) };
  } catch (error) {
    return { ran: false, violations: [], error: trim(error.message, 120) };
  }
}

async function findBanner(page) {
  return page.evaluate((cmps, rejectText) => {
    const visible = (node) => {
      if (!node || !node.getBoundingClientRect) return false;
      const rect = node.getBoundingClientRect();
      const style = getComputedStyle(node);
      return rect.width > 0 && rect.height > 0 && style.visibility !== "hidden" && style.display !== "none" && Number(style.opacity) > 0.05;
    };
    const pattern = new RegExp(rejectText, "i");
    const label = (node) => (node.innerText || node.value || node.getAttribute("aria-label") || "").replace(/\s+/g, " ").trim();
    const buttonsIn = (root) => {
      const out = [];
      const walk = (scope) => {
        scope.querySelectorAll("button, a[role=button], [role=button], input[type=button], input[type=submit], a").forEach((node) => out.push(node));
        scope.querySelectorAll("*").forEach((node) => { if (node.shadowRoot) walk(node.shadowRoot); });
      };
      walk(root);
      return out;
    };
    let name = "";
    let root = null;
    let reject = null;
    for (const [cmp, box, button] of cmps) {
      const node = document.querySelector(box);
      if (!node) continue;
      if (node.tagName !== "IFRAME" && !visible(node) && !node.shadowRoot) continue;
      name = cmp;
      root = node;
      if (button) {
        const hit = document.querySelector(button);
        if (hit && visible(hit)) reject = hit;
      }
      break;
    }
    if (!root) {
      const candidates = Array.from(document.querySelectorAll("[id*=cookie i], [class*=cookie i], [id*=consent i], [class*=consent i], [aria-label*=cookie i], [role=dialog], [role=alertdialog]"));
      root = candidates.find((node) => {
        if (!visible(node)) return false;
        const style = getComputedStyle(node);
        const text = (node.innerText || "").slice(0, 2000);
        return (style.position === "fixed" || style.position === "sticky" || /dialog/.test(node.getAttribute("role") || "")) && /cookie|consent|privacy|analytics|galleta|privacidad|datenschutz|confidentialit|riservatezza/i.test(text);
      }) || null;
      if (root) name = "A cookie banner";
    }
    if (root && !reject && root.tagName !== "IFRAME") {
      reject = buttonsIn(root.shadowRoot || root).find((node) => visible(node) && pattern.test(label(node))) || null;
    }
    if (!root) return { name: "", rejectLabel: "", clicked: false };
    const rejectLabel = reject ? label(reject).slice(0, 60) : "";
    if (reject) reject.setAttribute("data-qa-reject", "1");
    return { name, rejectLabel, clicked: false };
  }, CMPS, REJECT_TEXT);
}

async function cookiesOf(context, page, host) {
  let list = [];
  try {
    if (typeof context.cookies === "function") list = await context.cookies();
    else {
      const client = await page.createCDPSession();
      list = (await client.send("Network.getAllCookies")).cookies || [];
    }
  } catch (error) {
    list = [];
  }
  const site = siteOf(host);
  return list.map((cookie) => {
    const domain = String(cookie.domain || "").replace(/^\./, "");
    const third = !(domain === site || domain.endsWith("." + site));
    const consent = CONSENT_COOKIE.test(cookie.name);
    return { name: trim(cookie.name, 40), domain: trim(domain, 60), third, tracking: !consent && (TRACKING_COOKIE.test(cookie.name) || third) };
  });
}

async function mobileCheck(page) {
  return page.evaluate(() => {
    const width = window.innerWidth;
    const overflow = Math.max(0, document.documentElement.scrollWidth - width);
    const label = (node) => {
      let text = node.tagName.toLowerCase();
      if (node.id) text += "#" + node.id;
      else if (typeof node.className === "string" && node.className.trim()) text += "." + node.className.trim().split(/\s+/).slice(0, 2).join(".");
      return text.slice(0, 80);
    };
    const offenders = [];
    if (overflow > 2) {
      const all = document.body ? document.body.querySelectorAll("*") : [];
      for (let i = 0; i < all.length && offenders.length < 3; i += 1) {
        const rect = all[i].getBoundingClientRect();
        if (rect.right > width + 2 && rect.width > 0 && rect.width <= document.documentElement.scrollWidth) {
          const parentRect = all[i].parentElement ? all[i].parentElement.getBoundingClientRect() : null;
          if (!parentRect || parentRect.right <= width + 2) offenders.push(label(all[i]));
        }
      }
    }
    return { width, overflow, offenders };
  });
}

async function launch() {
  const puppeteer = (await import("puppeteer-core")).default;
  const local = process.env.CHROME_PATH;
  if (local) {
    return puppeteer.launch({ executablePath: local, headless: true, args: ["--no-first-run", "--hide-scrollbars", "--mute-audio", "--disable-extensions"] });
  }
  const chromium = (await import("@sparticuz/chromium")).default;
  chromium.setGraphicsMode = false;
  const unsafe = /^--(single-process|disable-web-security|allow-running-insecure-content|disable-site-isolation-trials|in-process-gpu|ignore-gpu-blocklist|enable-unsafe-swiftshader|use-gl=.*|use-angle=.*)$/;
  const args = chromium.args.filter((arg) => !unsafe.test(arg)).concat(["--hide-scrollbars", "--mute-audio", "--disable-dev-shm-usage", "--disable-gpu"]);
  return puppeteer.launch({ executablePath: await chromium.executablePath(), headless: "shell", args });
}

async function printPdf(html) {
  const browser = await launch();
  try {
    const page = await browser.newPage();
    await page.setJavaScriptEnabled(false);
    await page.setRequestInterception(true);
    page.on("request", (req) => (req.url().startsWith("data:") ? req.continue() : req.abort()));
    await page.setContent(String(html || ""), { waitUntil: "load", timeout: 20000 });
    const pdf = await page.pdf({ format: "A4", printBackground: true, preferCSSPageSize: true, timeout: 30000 });
    return { ok: true, pdf: Buffer.from(pdf).toString("base64") };
  } finally {
    await browser.close().catch(() => {});
  }
}

async function browse(job, log) {
  const say = typeof log === "function" ? (text) => { try { log(text); } catch (error) { /* a closed log must not stop the pass */ } } : () => {};
  const started = Date.now();
  const budget = Math.min(110000, Math.max(30000, Number(job && job.budgetMs) || 85000));
  const left = () => budget - (Date.now() - started);
  const start = String((job && job.url) || "");
  if (!/^https:\/\//i.test(start) || blockedHost(start) || await privateAddress(new URL(start).hostname)) return { ok: false, error: "The start address was refused." };
  const extra = ((job && job.paths) || []).filter((url) => /^https:\/\//i.test(url) && !blockedHost(url)).slice(0, 2);
  const timing = {};
  let mark = Date.now();
  const lap = (name) => { const now = Date.now(); timing[name] = now - mark; mark = now; };
  const skip = (step, need) => say(step + " was skipped: " + Math.round(left() / 1000) + " s were left of the browser's budget, and it needs " + Math.round(need / 1000) + " s.");
  say("Starting headless Chromium.");
  const browser = await launch();
  lap("launch");
  try {
    const version = await browser.version();
    const plainUa = (await browser.userAgent()).replace(/HeadlessChrome/g, "Chrome");
    let ua = plainUa + " " + AGENT_TAG;
    const host = new URL(start).hostname;
    const result = { ok: true, engine: version.replace("HeadlessChrome", "Chromium"), at: new Date().toISOString(), pages: [] };
    say(result.engine + " is up. Loading " + pathOf(start) + " at 1280×800 with no stored cookies.");

    // Cold visit on a desktop width: no stored choice, nothing clicked.
    let coldContext, rec, page, first;
    const visit = async () => {
      coldContext = await browser.createBrowserContext();
      rec = recorder(true);
      page = await prepare(coldContext, ua, rec, { width: 1280, height: 800 });
      await page.evaluateOnNewDocument(VITALS);
      first = await open(page, start);
    };
    await visit();
    // Some bot managers refuse a browser that names the review; only the start-page read for a refused plain read retries without the tag.
    if (job.html && first.docStatus >= 400) {
      say("The site refused Chrome with the review tag in its user agent (status " + first.docStatus + "). Loading " + pathOf(start) + " again as plain Chrome.");
      await coldContext.close();
      ua = plainUa;
      result.untagged = true;
      await visit();
    }
    lap("load");
    say(pathOf(first.finalUrl) + " loaded with status " + first.status + " in " + Math.round(timing.load / 100) / 10 + " s, after " + rec.state.requests + " requests to " + rec.state.hosts.size + " hosts.");
    const view = await rendered(page);
    let dom = null;
    try { dom = await domFacts(page); } catch (error) { dom = null; }
    lap("read");
    say("Read the rendered page: " + words(view.text) + " words, compared with " + words(htmlText(first.raw)) + " in the raw HTML.");
    const rawText = htmlText(first.raw);
    const renderedWords = words(view.text);
    const rawWords = words(rawText);
    const rawNormal = normal(rawText);
    let vitals = {};
    try { vitals = await page.evaluate(() => window.__qaVitals || {}); } catch (error) { vitals = {}; }
    result.start = {
      url: start,
      finalPath: pathOf(first.finalUrl),
      status: first.status,
      renderedWords,
      rawWords,
      share: renderedWords ? Math.min(100, Math.round((rawWords / renderedWords) * 100)) : 100,
      h1: (view.h1[0] || "").slice(0, 120),
      h1InHtml: view.h1[0] ? rawNormal.includes(normal(view.h1[0])) : null,
      vitals: { lcp: vitals.lcp || 0, cls: Math.round((vitals.cls || 0) * 1000) / 1000, tbt: vitals.tbt || 0, fcp: vitals.fcp || 0 },
      requests: rec.state.requests,
      hosts: rec.state.hosts.size,
      dom
    };
    if (job.html) {
      let html = "";
      try { html = await page.content(); } catch (error) { html = ""; }
      Object.assign(result.start, { finalUrl: first.finalUrl, docStatus: first.docStatus, headers: headersOf(first.docHeaders), html: html.slice(0, HTML_MAX), htmlCut: html.length > HTML_MAX });
    }
    try {
      result.shots = { desktop: "data:image/jpeg;base64," + await page.screenshot({ type: "jpeg", quality: 50, encoding: "base64", optimizeForSpeed: true, clip: { x: 0, y: 0, width: 1280, height: 800, scale: 0.5 } }) };
    } catch (error) {
      result.shots = {};
    }
    lap("shot");
    say("Core Web Vitals in the lab: LCP " + result.start.vitals.lcp + " ms, CLS " + result.start.vitals.cls + ", TBT " + result.start.vitals.tbt + " ms. Took the desktop screenshot.");
    const banner = await findBanner(page);
    const beforeCookies = await cookiesOf(coldContext, page, host);
    say(banner.name
      ? "Found the " + banner.name + " cookie banner" + (banner.rejectLabel ? " with a \"" + banner.rejectLabel + "\" button" : " with no reject button") + ". " + beforeCookies.length + " cookies were set before any choice."
      : "No cookie banner was found. " + beforeCookies.length + " cookies were set on the first visit.");
    const consent = {
      banner: banner.name,
      rejectLabel: banner.rejectLabel,
      rejected: false,
      before: { vendors: rec.vendors("before"), cookies: beforeCookies.filter((cookie) => cookie.tracking).slice(0, 20), cookieCount: beforeCookies.length },
      after: null
    };
    if (left() > 25000) {
      say("Running axe-core on " + pathOf(first.finalUrl) + ".");
      const axe = await runAxe(page);
      lap("axe");
      result.axe = { ran: axe.ran, version: axe.version || "", tags: AXE_TAGS, pages: [{ path: pathOf(first.finalUrl), violations: axe.violations }] };
      say(axe.ran ? "axe-core " + axe.version + " found " + axe.violations.length + " rules broken on " + pathOf(first.finalUrl) + "." : "axe-core did not finish on " + pathOf(first.finalUrl) + (axe.error ? " (" + axe.error + ")" : "") + ".");
    } else skip("axe-core", 25000);
    if (banner.rejectLabel && left() <= 20000) skip("Pressing the reject button", 20000);
    if (banner.rejectLabel && left() > 20000) {
      say("Pressing \"" + banner.rejectLabel + "\" and reloading to see which trackers stay.");
      try {
        const before = new Set(beforeCookies.map((cookie) => cookie.name + "@" + cookie.domain));
        await page.evaluate(() => { const node = document.querySelector("[data-qa-reject]"); if (node) node.click(); });
        await settle(page);
        rec.state.phase = "after";
        await page.reload({ waitUntil: "load" });
        await settle(page);
        const afterCookies = await cookiesOf(coldContext, page, host);
        consent.rejected = true;
        lap("reject");
        consent.after = {
          vendors: rec.vendors("after"),
          cookies: afterCookies.filter((cookie) => cookie.tracking && !before.has(cookie.name + "@" + cookie.domain)).slice(0, 20),
          kept: afterCookies.filter((cookie) => cookie.tracking && before.has(cookie.name + "@" + cookie.domain)).length
        };
        say("After the reject: " + consent.after.cookies.length + " new tracking cookies, " + consent.after.kept + " kept from before.");
      } catch (error) {
        consent.rejectError = trim(error.message, 120);
        say("The reject button could not be pressed (" + consent.rejectError + ").");
      }
    }
    say(rec.state.errorCount + " console errors, " + rec.state.failedCount + " failed requests, and " + rec.state.mixed.length + " mixed-content requests on the desktop visit.");
    result.consent = consent;
    result.console = { errors: rec.state.errorCount, samples: rec.state.errors };
    result.failed = { count: rec.state.failedCount, samples: rec.state.failed };
    result.mixed = { count: rec.state.mixed.length, samples: rec.state.mixed };
    await coldContext.close();

    // Phone width.
    if (left() > 15000) {
      say("Loading " + pathOf(start) + " on a 390×844 phone (Android, touch).");
      const phoneContext = await browser.createBrowserContext();
      const phoneUa = ua.replace(/\([^)]*\)/, "(Linux; Android 14; Pixel 8)").replace(/Safari\//, "Mobile Safari/");
      const phone = await prepare(phoneContext, phoneUa, null, { width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 1 });
      try {
        await open(phone, start);
        lap("phoneLoad");
        result.mobile = await mobileCheck(phone);
        lap("phoneLayout");
        say(result.mobile.overflow > 2 ? "On the phone the page is " + result.mobile.overflow + " px wider than the screen" + (result.mobile.offenders.length ? ", from " + result.mobile.offenders.join(", ") : "") + "." : "On the phone the page fits the screen width.");
        const taps = await runAxe(phone, ["target-size"]);
        lap("phoneAxe");
        const rule = taps.violations[0];
        result.mobile.targetsChecked = taps.ran;
        result.mobile.smallTargets = rule ? rule.nodes : 0;
        result.mobile.targetSamples = rule ? rule.targets : [];
        say(taps.ran ? result.mobile.smallTargets + " tap targets are smaller than 24×24 px." : "The tap target check did not finish.");
        result.shots.mobile = "data:image/jpeg;base64," + await phone.screenshot({ type: "jpeg", quality: 50, encoding: "base64", captureBeyondViewport: false, optimizeForSpeed: true });
        lap("phoneShot");
        say("Took the phone screenshot.");
      } catch (error) {
        result.mobile = { error: trim(error.message, 120) };
        say("The phone visit failed (" + result.mobile.error + ").");
      }
      if (result.mobile && !result.mobile.error && left() <= 10000) skip("The tablet check", 10000);
      if (result.mobile && !result.mobile.error && left() > 10000) {
        say("Resizing to a 768×1024 tablet.");
        try {
          await phone.setViewport({ width: 768, height: 1024, isMobile: true, hasTouch: true, deviceScaleFactor: 1 });
          await new Promise((resolve) => setTimeout(resolve, 800));
          result.tablet = await mobileCheck(phone);
          result.shots.tablet = "data:image/jpeg;base64," + await phone.screenshot({ type: "jpeg", quality: 50, encoding: "base64", optimizeForSpeed: true, clip: { x: 0, y: 0, width: 768, height: 1024, scale: 0.5 } });
          say(result.tablet.overflow > 2 ? "On the tablet the page is " + result.tablet.overflow + " px wider than the screen. Took the tablet screenshot." : "On the tablet the page fits the screen width. Took the tablet screenshot.");
        } catch (error) {
          result.tablet = { error: trim(error.message, 120) };
          say("The tablet check failed (" + result.tablet.error + ").");
        }
        lap("tablet");
      }
      await phoneContext.close();
      lap("phone");
    } else skip("The phone and tablet checks", 15000);

    // Up to two more pages for axe and the text comparison.
    for (const url of extra) {
      if (left() < 20000) {
        skip("Opening " + pathOf(url), 20000);
        break;
      }
      say("Opening " + pathOf(url) + " for axe-core and the text comparison.");
      const context = await browser.createBrowserContext();
      const pageRec = recorder(true);
      const other = await prepare(context, ua, pageRec, { width: 1280, height: 800 });
      try {
        const got = await open(other, url);
        const seen = await rendered(other);
        const axe = left() > 15000 ? await runAxe(other) : { ran: false, violations: [] };
        const rw = words(seen.text);
        const hw = words(htmlText(got.raw));
        result.pages.push({ path: pathOf(got.finalUrl), status: got.status, renderedWords: rw, rawWords: hw, share: rw ? Math.min(100, Math.round((hw / rw) * 100)) : 100, errors: pageRec.state.errorCount });
        if (result.axe && axe.ran) result.axe.pages.push({ path: pathOf(got.finalUrl), violations: axe.violations });
        say(pathOf(got.finalUrl) + " answered " + got.status + ": " + rw + " rendered words, " + pageRec.state.errorCount + " console errors, " + (axe.ran ? axe.violations.length + " axe-core rules broken." : "axe-core not run."));
      } catch (error) {
        result.pages.push({ path: pathOf(url), status: 0, error: trim(error.message, 120) });
        say(pathOf(url) + " could not be opened (" + trim(error.message, 120) + ").");
      }
      await context.close();
    }
    lap("extra");
    say("Closing the browser.");
    result.timing = timing;
    result.ms = Date.now() - started;
    return result;
  } finally {
    await browser.close().catch(() => {});
  }
}

module.exports = { browse, printPdf, REJECT_TEXT, blockedHost, vendorOf, htmlText, words, siteOf };
