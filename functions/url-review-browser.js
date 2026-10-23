/**
 * Browser pass for the URL review: one headless Chromium visit per page.
 * Records which tracking requests and cookies appear before a choice and after Reject,
 * runs axe-core, compares the HTML text with the rendered text, checks a phone width,
 * checks a tablet width, and keeps three small screenshots. The only click is a cookie banner's reject button.
 * It watches the canvas, WebGL, audio and font calls scripts make, and types a test address into one form field
 * without submitting; any request carrying that address is blocked, so nothing typed leaves the browser.
 */
const fs = require("fs");
const crypto = require("crypto");
const dns = require("dns").promises;
const { legalLinks, LEGAL_ANY } = require("./url-review-legal");
const { fromUrl: libraryFromUrl, fromContent: libraryFromContent, fromGlobals: libraryFromGlobals, PROBE: LIBRARY_PROBE } = require("./url-review-libraries");

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
  ["Mouseflow", /(^|\.)mouseflow\.com$/],
  ["Smartlook", /(^|\.)(smartlook\.com|smartlook\.cloud)$/],
  ["LogRocket", /(^|\.)(logrocket\.io|logrocket\.com|lr-ingest\.io|lr-in\.com|lr-in-prod\.com|lr-ingest\.com)$/],
  ["Inspectlet", /(^|\.)inspectlet\.com$/],
  ["Lucky Orange", /(^|\.)(luckyorange\.com|luckyorange\.net)$/],
  ["Contentsquare", /(^|\.)(contentsquare\.net|contentsquare\.com)$/],
  ["Adobe Analytics", /(\.omtrdc\.net|\.2o7\.net|(^|\.)demdex\.net)$/]
];
const RECORDERS = ["Hotjar", "FullStory", "Microsoft Clarity", "Mouseflow", "Smartlook", "LogRocket", "Inspectlet", "Lucky Orange", "Contentsquare"];
const BOT_GUARDS = /(^|\.)(challenges\.cloudflare\.com|recaptcha\.net|hcaptcha\.com|perimeterx\.net|px-cdn\.net|px-cloud\.net|captcha-delivery\.com|datadome\.co|arkoselabs\.com|funcaptcha\.com|kasada\.io|incapsula\.com|imperva\.com|sift\.com|siftscience\.com|forter\.com|riskified\.com|signifyd\.com)$/;
// [name, request hosts, launcher, widget roots, AI chatbot]
const CHATS = [
  ["Intercom", /(^|\.)(intercom\.io|intercomcdn\.com|intercomassets\.com)$/, ".intercom-lightweight-app-launcher, .intercom-launcher, iframe[name=intercom-launcher-frame], iframe.intercom-launcher-frame", "#intercom-container, .intercom-lightweight-app, .intercom-app, #intercom-frame, iframe[name^=intercom]"],
  ["Drift", /(^|\.)(drift\.com|driftt\.com|driftcdn\.com)$/, "#drift-frame-controller, iframe#drift-widget, #drift-widget-container iframe", "#drift-frame-controller, #drift-frame-chat, #drift-widget-container"],
  ["Zendesk Messaging", /(^|\.)(zdassets\.com|zendesk\.com|zopim\.com|zopim\.io)$/, "iframe#launcher, iframe[title*='messaging window' i]", "iframe#launcher, iframe#webWidget, iframe[title*='messaging' i], iframe[name*=messaging i]"],
  ["HubSpot Chat", /(^|\.)usemessages\.com$/, "#hubspot-messages-iframe-container iframe", "#hubspot-messages-iframe-container"],
  ["Tawk.to", /(^|\.)(tawk\.to|tawk\.link|tawk\.help)$/, "iframe[title='chat widget' i], .tawk-min-container, .tawk-button", "iframe[title='chat widget' i], .tawk-min-container, .tawk-chat-panel"],
  ["Crisp", /(^|\.)(crisp\.chat|crisp\.im)$/, ".crisp-client [role=button], #crisp-chatbox [role=button]", ".crisp-client, #crisp-chatbox"],
  ["LiveChat", /(^|\.)(livechatinc\.com|livechat\.com|livechat-static\.com|lc\.chat)$/, "#chat-widget-minimized, #chat-widget-container iframe", "#chat-widget-container, #chat-widget"],
  ["Tidio", /(^|\.)(tidio\.co|tidiochat\.com)$/, "#tidio-chat iframe, #tidio-chat-iframe", "#tidio-chat, #tidio-chat-iframe"],
  ["Freshchat", /(^|\.)freshchat\.com$/, "#fc_frame, #fc_widget", "#fc_frame, #fc_push_frame"],
  ["Olark", /(^|\.)olark\.com$/, ".olark-launch-button, #olark-wrapper [role=button]", "#olark-wrapper, #olark-container, #olark-box-container"],
  ["Ada", /(^|\.)ada\.support$/, "#ada-button-frame, #ada-chat-button", "#ada-button-frame, #ada-chat-frame, #ada-entry"],
  ["Gorgias", /(^|\.)(gorgias\.chat|gorgias\.io|gorgias\.help)$/, "#gorgias-chat-container #chat-button, #chat-button", "#gorgias-chat-container"],
  ["Chatbase", /(^|\.)chatbase\.co$/, "#chatbase-bubble-button", "#chatbase-bubble-button, #chatbase-bubble-window", true],
  ["Voiceflow", /(^|\.)voiceflow\.com$/, "#voiceflow-chat", "#voiceflow-chat", true],
  ["Botpress", /(^|\.)(botpress\.cloud|bpcontent\.cloud)$/, "#bp-web-widget-container iframe, .bpFab, #fab-root", "#bp-web-widget-container, .bpWebchat, #fab-root, #webchat-root", true],
  ["Landbot", /(^|\.)landbot\.io$/, ".LandbotLivechat iframe, .LandbotPopup", ".LandbotLivechat, .LandbotPopup", true],
  ["Kommunicate", /(^|\.)kommunicate\.io$/, "#kommunicate-widget-iframe", "#kommunicate-widget-iframe", true],
  ["OpenAI API", /(^|\.)(api\.openai\.com|openai\.azure\.com)$/, "", "", true],
  ["Anthropic API", /(^|\.)api\.anthropic\.com$/, "", "", true],
  ["Gemini API", /(^|\.)generativelanguage\.googleapis\.com$/, "", "", true],
  ["Mistral API", /(^|\.)api\.mistral\.ai$/, "", "", true],
  ["Cohere API", /(^|\.)api\.cohere\.(ai|com)$/, "", "", true],
  ["Groq API", /(^|\.)api\.groq\.com$/, "", "", true]
];
const CHAT_LAUNCHER = "[class*=launcher i], [id*=launcher i], [aria-label*=chat i], [title*=chat i], [id*=chat-widget i], [class*=chat-widget i], [id*=chatbot i], [class*=chatbot i]";
const CHAT_FRAME = "intercom|drift|launcher|webwidget|messaging|hubspot-messages|tawk|chat|tidio|fc_|olark|ada-|gorgias|botpress|landbot|kommunicate|voiceflow";
const CHAT_COOKIE = /^(intercom-|driftt?_|drift_|__zlcmid|ZD-|__zd|TawkConnectionTime|__tawkuuid|twk_|crisp-client|__lc_|__lc2_|lc_window_state|tidio_|messagesUtk|hblid|olfsk|wcsid|_okbk|_okdetect|_oklv|_okac|_okck|_ok$|gorgias|fc_|freshchat|chatbase|voiceflow|bp-|landbot|kommunicate)/i;
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

function chatOf(host) {
  const found = CHATS.find((row) => row[1].test(String(host || "").toLowerCase()));
  return found ? { name: found[0], launcher: found[2], root: found[3], ai: !!found[4] } : null;
}

// Hosts recorded in the browser, folded into one row per chat with what it cost the start page.
function chatsFrom(hosts, scripts) {
  const rows = new Map();
  (hosts || []).forEach((item) => {
    const hit = chatOf(item.host);
    if (!hit) return;
    const row = rows.get(hit.name) || { name: hit.name, ai: hit.ai, hosts: [], requests: 0, bytes: 0, ms: 0 };
    if (row.hosts.indexOf(item.host) === -1 && row.hosts.length < 4) row.hosts.push(item.host);
    row.requests += item.requests || 0;
    row.bytes += item.bytes || 0;
    rows.set(hit.name, row);
  });
  Object.entries(scripts || {}).forEach(([host, ms]) => {
    const hit = chatOf(host);
    if (hit && rows.has(hit.name)) rows.get(hit.name).ms += Math.round(ms) || 0;
  });
  return [...rows.values()].sort((a, b) => b.bytes - a.bytes || b.requests - a.requests);
}

// A target counts as covered when the launcher is the top element over it, or, when that could not be read, when it hides a fifth of it.
function coveredBy(box, targets) {
  if (!box || !(box.w > 0) || !(box.h > 0)) return [];
  return (targets || []).filter((target) => {
    const r = target.rect || {};
    if (!(r.w > 0) || !(r.h > 0)) return false;
    const w = Math.min(box.x + box.w, r.x + r.w) - Math.max(box.x, r.x);
    const h = Math.min(box.y + box.h, r.y + r.h) - Math.max(box.y, r.y);
    if (w <= 0 || h <= 0) return false;
    if (target.under === true || target.under === false) return target.under;
    return (w * h) / (r.w * r.h) >= 0.2;
  });
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

function plural(count, one, many) {
  return count + " " + (count === 1 ? one : (many || one + "s"));
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

function recorder(pageHttps, readLibraries) {
  const state = { phase: "before", vendors: {}, chats: {}, wires: new Map(), libs: new Map(), reads: [], errors: [], errorCount: 0, failed: [], failedCount: 0, mixed: [], requests: 0, bytes: 0, hosts: new Set(), canaries: [], typed: [] };
  const addLib = (row) => {
    const key = row.name + "@" + row.version;
    if (!state.libs.has(key) && state.libs.size < 20) state.libs.set(key, row);
  };
  const vendorRow = (phase, name) => {
    const bucket = state.vendors[phase] || (state.vendors[phase] = {});
    return bucket[name] || (bucket[name] = { name, loads: 0, hits: 0, denied: 0, signals: [] });
  };
  const chatRow = (phase, host) => {
    const bucket = state.chats[phase] || (state.chats[phase] = {});
    return bucket[host] || (bucket[host] = { host, requests: 0, bytes: 0 });
  };
  return {
    state,
    wire(id, raw) {
      let host = "";
      try { host = new URL(raw).hostname; } catch (error) { return; }
      if (chatOf(host)) state.wires.set(id, chatRow(state.phase, host));
    },
    done(id, bytes) {
      if (state.phase === "before") state.bytes += Math.max(0, Math.round(bytes) || 0);
      const row = state.wires.get(id);
      if (!row) return;
      row.bytes += Math.max(0, Math.round(bytes) || 0);
      state.wires.delete(id);
    },
    chats(phase, scripts) {
      return chatsFrom(Object.values(state.chats[phase] || {}), scripts);
    },
    // True when the request carries a typed test address, which the caller then blocks.
    typed(req) {
      if (!state.canaries.length) return false;
      const body = req.url() + " " + (req.postData() || "");
      for (const canary of state.canaries) {
        const form = canary.forms.find((row) => body.includes(row[1]));
        if (!form) continue;
        let host = "";
        try { host = new URL(req.url()).hostname; } catch (error) { host = ""; }
        if (!state.typed.some((row) => row.host === host && row.phase === canary.phase) && state.typed.length < 12) state.typed.push({ host, how: form[0], phase: canary.phase });
        return true;
      }
      return false;
    },
    // Script banners still being read are given a few seconds, then the list is closed.
    async libraries(globals, pageUrl) {
      await Promise.race([Promise.all(state.reads), new Promise((resolve) => setTimeout(resolve, 3000))]);
      libraryFromGlobals(globals, pageUrl).forEach(addLib);
      return [...state.libs.values()];
    },
    request(req) {
      const raw = req.url();
      if (/^(data|blob):/.test(raw)) return;
      state.requests += 1;
      let url;
      try { url = new URL(raw); } catch (error) { return; }
      state.hosts.add(url.hostname);
      if (pageHttps && url.protocol === "http:" && state.mixed.length < 6) state.mixed.push(shortUrl(raw));
      if (chatOf(url.hostname)) chatRow(state.phase, url.hostname).requests += 1;
      if (readLibraries && state.phase === "before" && req.resourceType() === "script") libraryFromUrl(raw).forEach(addLib);
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
      if (readLibraries && status === 200 && state.phase === "before" && state.reads.length < 40 && res.request().resourceType() === "script") {
        state.reads.push(res.text().then((text) => libraryFromContent(text, res.url()).forEach(addLib)).catch(() => {}));
      }
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
  const v = window.__qaVitals = { lcp: 0, cls: 0, tbt: 0, fcp: 0, scripts: {} };
  const watch = (type, fn) => { try { new PerformanceObserver((list) => list.getEntries().forEach(fn)).observe({ type, buffered: true }); } catch (e) {} };
  watch("largest-contentful-paint", (e) => { v.lcp = Math.round(e.renderTime || e.loadTime || e.startTime); });
  watch("layout-shift", (e) => { if (!e.hadRecentInput) v.cls += e.value; });
  watch("longtask", (e) => { v.tbt += Math.max(0, Math.round(e.duration - 50)); });
  watch("paint", (e) => { if (e.name === "first-contentful-paint") v.fcp = Math.round(e.startTime); });
  watch("long-animation-frame", (e) => (e.scripts || []).forEach((s) => {
    try { const h = new URL(s.sourceURL).hostname; v.scripts[h] = (v.scripts[h] || 0) + s.duration; } catch (x) {}
  }));
})();`;

// Runs in every frame before the page's own scripts. Logs the calls fingerprinting scripts make, by the host of the calling script.
// Same-origin iframes a script creates (where font lists are often measured) are watched into the parent's log.
function watchCalls(win, shared) {
  const w = win || window;
  let log = shared || { canvas: [], fonts: {}, webgl: {}, audio: [], listen: {} };
  const natives = new WeakMap();
  const marks = new WeakMap();
  const tones = new WeakSet();
  const fonts = new Set();
  const who = () => {
    const urls = String(new Error().stack || "").match(/https?:\/\/[^\s)]+/g) || [];
    try { return new URL(urls[0] || location.href).hostname; } catch (e) { return location.hostname; }
  };
  const swap = (proto, name, make) => {
    const d = proto && Object.getOwnPropertyDescriptor(proto, name);
    if (!d) return;
    const key = d.get ? "get" : "value";
    if (typeof d[key] !== "function") return;
    const fake = make(d[key]);
    natives.set(fake, d[key]);
    Object.defineProperty(proto, name, Object.assign({}, d, { [key]: fake }));
  };
  const wrap = (proto, name, seen) => swap(proto, name, (real) => ({ [name](...args) { try { seen(this, args); } catch (e) { /* never break the page */ } return real.apply(this, args); } })[name]);
  const font = (value) => {
    const name = String(value || "").trim();
    if (!name || fonts.size >= 400 || fonts.has(name)) return;
    fonts.add(name);
    const host = who();
    log.fonts[host] = (log.fonts[host] || 0) + 1;
  };
  const markOf = (canvas) => marks.get(canvas) || (marks.set(canvas, { chars: new Set(), colors: new Set() }), marks.get(canvas));
  const text = (style) => (ctx, args) => {
    if (!ctx.canvas) return;
    const mark = markOf(ctx.canvas);
    Array.from(String(args[0]).slice(0, 200)).forEach((c) => mark.chars.add(c));
    if (mark.colors.size < 8) mark.colors.add(String(ctx[style]));
  };
  const paint = (ctx) => { const mark = ctx.canvas && marks.get(ctx.canvas); if (mark && mark.colors.size < 8) mark.colors.add(String(ctx.fillStyle)); };
  const read = (canvas, type) => {
    const mark = marks.get(canvas);
    if (mark && log.canvas.length < 20) log.canvas.push({ host: who(), w: canvas.width, h: canvas.height, chars: mark.chars.size, colors: mark.colors.size, type: String(type || "image/png") });
  };
  [w.CanvasRenderingContext2D, w.OffscreenCanvasRenderingContext2D].forEach((C) => {
    if (!C) return;
    wrap(C.prototype, "fillText", text("fillStyle"));
    wrap(C.prototype, "strokeText", text("strokeStyle"));
    wrap(C.prototype, "fillRect", paint);
    wrap(C.prototype, "getImageData", (ctx) => read(ctx.canvas, ""));
    wrap(C.prototype, "measureText", (ctx) => font(ctx.font));
  });
  if (w.HTMLCanvasElement) {
    wrap(w.HTMLCanvasElement.prototype, "toDataURL", (canvas, args) => read(canvas, args[0]));
    wrap(w.HTMLCanvasElement.prototype, "toBlob", (canvas, args) => read(canvas, args[1]));
  }
  if (w.OffscreenCanvas) wrap(w.OffscreenCanvas.prototype, "convertToBlob", (canvas, args) => read(canvas, args[0] && args[0].type));
  if (w.FontFaceSet) wrap(w.FontFaceSet.prototype, "check", (set, args) => font(args[0]));
  ["offsetWidth", "offsetHeight"].forEach((name) => swap(w.HTMLElement.prototype, name, (real) => Object.getOwnPropertyDescriptor({
    get [name]() { try { if (this.style && this.style.fontFamily) font(this.style.fontFamily); } catch (e) { /* never break the page */ } return real.call(this); }
  }, name).get));
  [w.WebGLRenderingContext, w.WebGL2RenderingContext].forEach((G) => {
    if (G) wrap(G.prototype, "getParameter", (gl, args) => {
      if (args[0] !== 0x9245 && args[0] !== 0x9246) return;
      const host = who();
      log.webgl[host] = (log.webgl[host] || 0) + 1;
    });
  });
  if (w.BaseAudioContext) wrap(w.BaseAudioContext.prototype, "createOscillator", (ctx) => tones.add(ctx));
  if (w.OfflineAudioContext) wrap(w.OfflineAudioContext.prototype, "startRendering", (ctx) => { if (log.audio.length < 10) log.audio.push({ host: who(), oscillator: tones.has(ctx) }); });
  const typing = /^(keydown|keyup|keypress|beforeinput|input|change|paste)$/;
  wrap(w.EventTarget.prototype, "addEventListener", (target, args) => {
    const type = String(args[0]);
    if (!typing.test(type)) return;
    if (!(target instanceof w.HTMLInputElement || target instanceof w.HTMLTextAreaElement || target instanceof w.HTMLFormElement || target instanceof w.HTMLBodyElement || target instanceof w.Document || target === w)) return;
    const host = who();
    const row = log.listen[host] || (Object.keys(log.listen).length < 30 ? (log.listen[host] = []) : null);
    if (row && row.indexOf(type) === -1) row.push(type);
  });
  swap(w.Function.prototype, "toString", (real) => ({ toString() { return real.call(natives.get(this) || this); } }).toString);
  ["contentWindow", "contentDocument"].forEach((name) => swap(w.HTMLIFrameElement.prototype, name, (real) => Object.getOwnPropertyDescriptor({
    get [name]() {
      const out = real.call(this);
      try {
        const child = out && (out.defaultView || out);
        if (child && child !== w) child.__qaWatch ? child.__qaWatch.adopt(log) : watchCalls(child, log);
      } catch (e) { /* cross-origin frames get their own copy */ }
      return out;
    }
  }, name).get));
  const dump = () => JSON.parse(JSON.stringify(log));
  dump.adopt = (other) => { log = other; };
  Object.defineProperty(w, "__qaWatch", { value: dump });
}

// Frame logs are merged by host; a script repeated in several frames keeps its largest count.
async function watchLog(page) {
  const out = { canvas: [], fonts: {}, webgl: {}, audio: [], listen: {} };
  const logs = await Promise.all(page.frames().slice(0, 20).map((frame) => Promise.race([
    frame.evaluate(() => (window.__qaWatch ? window.__qaWatch() : null)).catch(() => null),
    new Promise((resolve) => setTimeout(() => resolve(null), 1500))
  ])));
  logs.filter(Boolean).forEach((log) => {
    out.canvas.push(...(log.canvas || []));
    out.audio.push(...(log.audio || []));
    ["fonts", "webgl"].forEach((key) => Object.entries(log[key] || {}).forEach(([host, count]) => { out[key][host] = Math.max(out[key][host] || 0, count); }));
    Object.entries(log.listen || {}).forEach(([host, types]) => { out.listen[host] = [...new Set((out.listen[host] || []).concat(types))]; });
  });
  return out;
}

/**
 * Classifies one phase's call log, vendor rows and typing probe.
 * Canvas: text with 10 or more distinct characters drawn in two or more colours on a 16×16 or larger canvas and read back
 * losslessly; one colour is a watermark or an emoji check.
 * Fonts: 50 or more font families measured by one script. WebGL: the unmasked graphics card name read.
 * Audio: an offline audio context rendered after an oscillator was made on it.
 */
function watchFrom(log, vendors, typed, pageHost) {
  const raw = log || {};
  const site = siteOf(pageHost);
  const hosts = (list) => [...new Set(list.filter(Boolean))].slice(0, 6);
  const fingerprint = {
    canvas: hosts((raw.canvas || []).filter((row) => row.w >= 16 && row.h >= 16 && row.chars >= 10 && row.colors >= 2 && !/jpe?g|webp/i.test(row.type || "")).map((row) => row.host)),
    fonts: hosts(Object.keys(raw.fonts || {}).filter((host) => raw.fonts[host] >= 50)),
    webgl: hosts(Object.keys(raw.webgl || {}).filter((host) => raw.webgl[host] > 0)),
    audio: hosts((raw.audio || []).filter((row) => row.oscillator).map((row) => row.host))
  };
  const all = hosts([].concat(fingerprint.canvas, fingerprint.fonts, fingerprint.webgl, fingerprint.audio));
  return {
    fingerprint,
    guards: all.filter((host) => BOT_GUARDS.test(host)),
    recorders: (vendors || []).filter((row) => RECORDERS.indexOf(row.name) !== -1 && (row.hits || row.loads)).map((row) => ({ name: row.name, sent: row.hits > 0 })),
    listeners: hosts(Object.keys(raw.listen || {}).filter((host) => siteOf(host) !== site)),
    typed: typed && typed.field ? { field: typed.field, sent: (typed.sent || []).filter((row) => siteOf(row.host) !== site).slice(0, 6) } : null
  };
}

function canaryOf() {
  const token = "qa" + crypto.randomBytes(5).toString("hex");
  const email = token + "@example.com";
  const hash = (kind) => crypto.createHash(kind).update(email).digest("hex");
  return { email, forms: [["as typed", token], ["as a SHA-256 hash", hash("sha256")], ["as an MD5 hash", hash("md5")], ["as a SHA-1 hash", hash("sha1")], ["in Base64", Buffer.from(email).toString("base64").replace(/=+$/, "")]] };
}

// Types a test address into one contact field without submitting, then blurs it. Requests carrying it are blocked in prepare().
async function typeProbe(page, rec, phase) {
  const handle = await page.evaluateHandle(() => {
    const hint = /mail|name|nombre|nome|phone|tel|first|last|vorname|prenom|cognome|apellido/i;
    const search = /search|query|^q$|buscar|busca|suche|recherche|cerca|pesquis/i;
    const usable = (el) => {
      const r = el.getBoundingClientRect();
      const s = getComputedStyle(el);
      if (r.width < 20 || r.height < 8 || s.visibility === "hidden" || s.display === "none" || el.disabled || el.readOnly) return false;
      if (el.closest("[role=search], [role=dialog][aria-modal=true]") || el.getAttribute("role") === "combobox") return false;
      return !search.test([el.name, el.id, el.placeholder, el.getAttribute("aria-label")].join(" "));
    };
    const fields = Array.from(document.querySelectorAll("input")).filter(usable);
    const named = (el) => hint.test([el.name, el.id, el.placeholder, el.autocomplete, el.getAttribute("aria-label")].join(" "));
    return fields.find((el) => el.type === "email") || fields.find((el) => /^(text|tel|)$/.test(el.type) && named(el)) || null;
  });
  const field = handle.asElement();
  if (!field) return null;
  const label = await field.evaluate((el) => ((el.labels && el.labels[0] && el.labels[0].innerText) || el.placeholder || el.getAttribute("aria-label") || el.name || el.type).replace(/\s+/g, " ").trim().slice(0, 40));
  const canary = canaryOf();
  rec.state.canaries.push({ forms: canary.forms, phase });
  try {
    await field.type(canary.email, { delay: 25 });
    await new Promise((resolve) => setTimeout(resolve, 2000));
    await field.evaluate((el) => el.blur());
    await new Promise((resolve) => setTimeout(resolve, 1500));
    await field.evaluate((el) => { el.value = ""; });
  } finally {
    await field.dispose().catch(() => {});
  }
  return { field: label, sent: rec.state.typed.filter((row) => row.phase === phase) };
}

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
    if (rec && rec.typed(req)) {
      req.abort("blockedbyclient").catch(() => {});
      return;
    }
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
    return { name: trim(cookie.name, 40), domain: trim(domain, 60), third, tracking: !consent && (TRACKING_COOKIE.test(cookie.name) || third), chat: CHAT_COOKIE.test(cookie.name) || !!chatOf(domain) };
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

// Rendered links whose words or address may name a legal page; legalLinks() picks the real ones.
async function legalAnchors(page) {
  return page.evaluate((source) => {
    const re = new RegExp(source, "i");
    return Array.from(document.querySelectorAll("a[href]")).map((node) => ({
      href: node.getAttribute("href") || "",
      text: (node.innerText || node.textContent || "").replace(/\s+/g, " ").trim().slice(0, 120),
      label: [node.getAttribute("aria-label") || "", node.getAttribute("title") || ""].join(" ").trim().slice(0, 120)
    })).filter((anchor) => re.test(anchor.text) || re.test(anchor.label) || re.test(anchor.href)).slice(0, 60);
  }, LEGAL_ANY);
}

// The chat launcher on the phone: its name, its box, and the banner or call-to-action buttons it overlaps.
async function launcherFacts(page, launchers, generic) {
  return page.evaluate((launchers, generic, boxes) => {
    const visible = (node) => {
      if (!node || !node.getBoundingClientRect) return false;
      const rect = node.getBoundingClientRect();
      const style = getComputedStyle(node);
      return rect.width > 0 && rect.height > 0 && style.visibility !== "hidden" && style.display !== "none" && Number(style.opacity) > 0.05;
    };
    const pinned = (node) => {
      for (let n = node; n && n !== document.documentElement; n = n.parentElement) if (getComputedStyle(n).position === "fixed") return n;
      return null;
    };
    const pick = (selector) => { try { return Array.from(document.querySelectorAll(selector)); } catch (error) { return []; } };
    const small = (node) => { const rect = node.getBoundingClientRect(); return rect.top > innerHeight / 2 && rect.width < innerWidth * 0.6; };
    let launcher = null;
    for (const selector of launchers) {
      launcher = pick(selector).find((node) => visible(node) && pinned(node));
      if (launcher) break;
    }
    if (!launcher) launcher = pick(generic).find((node) => visible(node) && pinned(node) && small(node)) || null;
    if (!launcher) return { found: false };
    if (!/^(BUTTON|A|IFRAME)$/.test(launcher.tagName) && launcher.getAttribute("role") !== "button") {
      const inner = Array.from(launcher.querySelectorAll("button, [role=button], a[href], iframe")).find(visible);
      if (inner) launcher = inner;
    }
    const root = pinned(launcher) || launcher;
    const text = (node) => (node.innerText || node.value || "").replace(/\s+/g, " ").trim();
    const nameOf = (node, doc) => {
      const by = (node.getAttribute("aria-labelledby") || "").split(/\s+/).filter(Boolean).map((id) => { const hit = doc.getElementById(id); return hit ? text(hit) : ""; }).join(" ").trim();
      const img = node.querySelector("img[alt], [role=img][aria-label]");
      return (node.getAttribute("aria-label") || by || text(node) || node.getAttribute("title") || (img ? img.getAttribute("alt") || img.getAttribute("aria-label") : "") || "").trim();
    };
    let name = "";
    let known = true;
    if (launcher.tagName === "IFRAME") {
      let doc = null;
      try { doc = launcher.contentDocument; } catch (error) { doc = null; }
      const button = doc && Array.from(doc.querySelectorAll("button, [role=button], a[href]"))[0];
      if (button) name = nameOf(button, doc);
      else known = false;
    } else name = nameOf(launcher, document);
    launcher.setAttribute("data-qa-chat", "1");
    root.setAttribute("data-qa-chat-root", "1");
    const r = launcher.getBoundingClientRect();
    let banner = null;
    for (const selector of boxes) {
      banner = pick(selector).find(visible);
      if (banner) break;
    }
    if (!banner) banner = pick("[id*=cookie i], [class*=cookie i], [id*=consent i], [class*=consent i], [role=dialog], [role=alertdialog]")
      .find((node) => visible(node) && pinned(node) && !root.contains(node) && /cookie|consent|galleta|datenschutz|confidentialit|riservatezza/i.test((node.innerText || "").slice(0, 2000))) || null;
    const list = [];
    if (banner) banner.querySelectorAll("button, [role=button], input[type=submit], input[type=button], a[href]").forEach((node) => list.push([node, true]));
    pick("button, [role=button], input[type=submit], a[class*=btn i], a[class*=button i], a[class*=cta i]").forEach((node) => { if (!banner || !banner.contains(node)) list.push([node, false]); });
    const targets = [];
    for (const [node, inBanner] of list) {
      if (targets.length >= 12) break;
      if (root.contains(node) || !visible(node)) continue;
      const t = node.getBoundingClientRect();
      if (t.right <= r.left || t.left >= r.right || t.bottom <= r.top || t.top >= r.bottom) continue;
      const label = nameOf(node, document).slice(0, 60);
      if (!label) continue;
      const hit = document.elementFromPoint((Math.max(t.left, r.left) + Math.min(t.right, r.right)) / 2, (Math.max(t.top, r.top) + Math.min(t.bottom, r.bottom)) / 2);
      targets.push({ label, banner: inBanner, under: hit ? root.contains(hit) : null, rect: { x: Math.round(t.left), y: Math.round(t.top), w: Math.round(t.width), h: Math.round(t.height) } });
    }
    return { found: true, name: name.slice(0, 80), known, tag: launcher.tagName.toLowerCase(), banner: !!banner, box: { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) }, targets };
  }, launchers, generic, CMPS.map((row) => row[1]));
}

function chatArea(roots, frameRe) {
  const re = new RegExp(frameRe, "i");
  let parts = [];
  try { parts = Array.from(document.querySelectorAll(roots || "[data-qa-chat-root]")); } catch (error) { parts = []; }
  parts = parts.concat(Array.from(document.querySelectorAll("[data-qa-chat-root], iframe")).filter((node) => node.tagName !== "IFRAME" || re.test([node.name, node.id, node.title, node.getAttribute("src") || ""].join(" "))));
  return parts.reduce((best, node) => {
    const rect = node.getBoundingClientRect();
    const style = getComputedStyle(node);
    return style.visibility === "hidden" || style.display === "none" ? best : Math.max(best, Math.round(rect.width * rect.height));
  }, 0);
}

function chatFocus(roots, frameRe) {
  const re = new RegExp(frameRe, "i");
  let node = document.activeElement;
  if (!node || node === document.body || node === document.documentElement) return { where: "none", name: "", blind: false };
  let inside = false;
  try { inside = !!(roots && node.closest(roots)); } catch (error) { inside = false; }
  inside = inside || !!node.closest("[data-qa-chat-root]") || (node.tagName === "IFRAME" && re.test([node.name, node.id, node.title, node.getAttribute("src") || ""].join(" ")));
  let blind = false;
  for (let depth = 0; node && node.tagName === "IFRAME" && depth < 3; depth += 1) {
    let doc = null;
    try { doc = node.contentDocument; } catch (error) { doc = null; }
    if (!doc) { blind = true; break; }
    node = doc.activeElement;
  }
  const name = node && !blind ? (node.getAttribute("aria-label") || node.innerText || node.getAttribute("title") || "").replace(/\s+/g, " ").trim().slice(0, 60) : "";
  return { where: inside ? "chat" : "page", name, blind };
}

function privacyLinks(roots, frameRe) {
  const re = new RegExp(frameRe, "i");
  const words = /privacy|privacidad|privacidade|datenschutz|confidentialit|riservatezza|gdpr|data protection|personal data/i;
  let scopes = [];
  try { scopes = Array.from(document.querySelectorAll(roots || "[data-qa-chat-root]")); } catch (error) { scopes = []; }
  scopes = scopes.concat(Array.from(document.querySelectorAll("[data-qa-chat-root]")));
  let blind = 0;
  Array.from(document.querySelectorAll("iframe")).filter((node) => re.test([node.name, node.id, node.title, node.getAttribute("src") || ""].join(" ")) || scopes.some((scope) => scope.contains(node))).forEach((node) => {
    let doc = null;
    try { doc = node.contentDocument; } catch (error) { doc = null; }
    if (doc && doc.body) scopes.push(doc.body);
    else blind += 1;
  });
  const found = scopes.some((scope) => Array.from(scope.querySelectorAll("a[href]")).some((link) => words.test([link.innerText, link.getAttribute("aria-label") || "", link.getAttribute("href")].join(" "))));
  return { found, read: scopes.length, blind };
}

function placeFocus(roots, frameRe) {
  const re = new RegExp(frameRe, "i");
  let parts = [];
  try { parts = Array.from(document.querySelectorAll(roots || "[data-qa-chat-root]")); } catch (error) { parts = []; }
  parts = parts.concat(Array.from(document.querySelectorAll("iframe")).filter((node) => re.test([node.name, node.id, node.title, node.getAttribute("src") || ""].join(" "))));
  const size = (node) => { const rect = node.getBoundingClientRect(); return rect.width * rect.height; };
  const open = parts.filter((node) => size(node) > 40000).sort((a, b) => size(b) - size(a));
  for (const node of open) {
    let scope = node;
    if (node.tagName === "IFRAME") {
      try { scope = node.contentDocument; } catch (error) { scope = null; }
    }
    const hit = scope && scope.querySelector("button, [href], input:not([type=hidden]), textarea, select, [tabindex]:not([tabindex='-1']), [contenteditable=true]");
    if (!hit) continue;
    if (node.tagName === "IFRAME") node.focus();
    hit.focus();
    return true;
  }
  return false;
}

const CLOSE_TEXT = /close|minimi[sz]e|dismiss|hide|cerrar|minimizar|fechar|schlie(ß|ss)en|fermer|r[ée]duire|chiudi|riduci/i;

// Opens the launcher with the keyboard (a click if Enter does nothing), then reads the privacy link and whether Tab, a close button, or Escape leaves it.
async function openChat(page, roots) {
  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const out = { opened: false, keyboard: false, moved: false, entered: false, trapped: false, exit: "", tabs: 0, privacy: null };
  const handle = await page.$("[data-qa-chat]");
  if (!handle) return out;
  let target = handle;
  if (await handle.evaluate((node) => node.tagName === "IFRAME")) {
    const frame = await handle.contentFrame();
    const inner = frame && await frame.$("button, [role=button], a[href]");
    if (inner) target = inner;
  }
  const area = () => page.evaluate(chatArea, roots, CHAT_FRAME).catch(() => 0);
  const focus = () => page.evaluate(chatFocus, roots, CHAT_FRAME).catch(() => ({ where: "none", name: "", blind: true }));
  const closed = await area();
  try { await target.focus(); await page.keyboard.press("Enter"); } catch (error) { /* not focusable */ }
  await wait(2500);
  let open = await area();
  out.keyboard = open > Math.max(40000, closed * 1.5);
  if (!out.keyboard) {
    await target.evaluate((node) => node.click()).catch(() => {});
    await wait(2500);
    open = await area();
  }
  out.opened = open > Math.max(40000, closed * 1.5);
  if (!out.opened) return out;
  const links = await page.evaluate(privacyLinks, roots, CHAT_FRAME).catch(() => ({ found: false, read: 0, blind: 1 }));
  let { found, blind } = links;
  for (const frame of page.frames()) {
    if (found || !blind) break;
    let host = "";
    try { host = new URL(frame.url()).hostname; } catch (error) { continue; }
    if (!chatOf(host)) continue;
    const hit = await frame.evaluate((source) => Array.from(document.querySelectorAll("a[href]")).some((link) => new RegExp(source, "i").test([link.innerText, link.getAttribute("aria-label") || "", link.getAttribute("href")].join(" "))), "privacy|privacidad|privacidade|datenschutz|confidentialit|riservatezza|gdpr|data protection|personal data").catch(() => null);
    if (hit === null) continue;
    blind -= 1;
    found = hit;
  }
  out.privacy = found ? true : blind > 0 ? null : false;
  let now = await focus();
  out.moved = now.where === "chat";
  if (!out.moved) {
    await page.keyboard.press("Tab");
    out.tabs += 1;
    now = await focus();
    out.tabbed = now.where === "chat";
  }
  if (now.where !== "chat" && await page.evaluate(placeFocus, roots, CHAT_FRAME).catch(() => false)) {
    out.placed = true;
    now = await focus();
  }
  out.entered = now.where === "chat";
  if (!out.entered) return out;
  let unseen = now.blind;
  for (let i = 0; i < 25 && !out.exit; i += 1) {
    await page.keyboard.press("Tab");
    out.tabs += 1;
    now = await focus();
    unseen = unseen || now.blind;
    if (now.where !== "chat") out.exit = "tab";
    else if (CLOSE_TEXT.test(now.name)) out.exit = "close";
  }
  if (!out.exit) {
    await page.keyboard.press("Escape");
    await wait(800);
    now = await focus();
    if (now.where !== "chat" || await area() < open / 1.5) out.exit = "escape";
  }
  out.trapped = !out.exit && !unseen;
  return out;
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

// A recovery read (job.html) only needs the document. Once that document is still refused,
// axe-core, screenshots and the phone visit cannot become the review, and they can keep
// running until the caller aborts at 100 s ("The operation was aborted due to timeout").
function stopForRefusal(job, docStatus) {
  return !!(job && job.html && Number(docStatus) >= 400);
}

async function browse(job, log, onStart) {
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
      rec = recorder(true, true);
      page = await prepare(coldContext, ua, rec, { width: 1280, height: 800 });
      try {
        const cdp = await page.createCDPSession();
        cdp.on("Network.requestWillBeSent", (event) => rec.wire(event.requestId, event.request.url));
        cdp.on("Network.loadingFinished", (event) => rec.done(event.requestId, event.encodedDataLength));
        await cdp.send("Network.enable");
      } catch (error) { /* chat and page bytes stay at zero */ }
      await page.evaluateOnNewDocument(VITALS);
      await page.evaluateOnNewDocument(watchCalls);
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
    if (dom) {
      try { dom.legal = legalLinks(await legalAnchors(page), first.finalUrl); } catch (error) { /* the HTML read still has its links */ }
    }
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
      bytes: rec.state.bytes,
      dom
    };
    // The crawl of a start page that is an empty shell waits for these links, not for axe-core and the phone.
    if (typeof onStart === "function") {
      try { onStart({ finalPath: result.start.finalPath, status: first.status, dom: { links: (dom && dom.links) || [] } }); } catch (error) { /* a closed stream must not stop the pass */ }
    }
    if (job.html) {
      let html = "";
      try { html = await page.content(); } catch (error) { html = ""; }
      Object.assign(result.start, { finalUrl: first.finalUrl, docStatus: first.docStatus, headers: headersOf(first.docHeaders), html: html.slice(0, HTML_MAX), htmlCut: html.length > HTML_MAX });
    }
    if (job.probe) {
      result.timing = timing;
      return result;
    }
    if (stopForRefusal(job, first.docStatus)) {
      say(pathOf(first.finalUrl) + " is still status " + first.docStatus + " in plain Chrome, so this pass stops before axe-core and the phone.");
      result.timing = timing;
      result.ms = Date.now() - started;
      return result;
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
    let scripts = vitals.scripts;
    try { scripts = await page.evaluate(() => (window.__qaVitals || {}).scripts || {}); } catch (error) { /* keep the first read */ }
    let globals = {};
    try { globals = await page.evaluate(LIBRARY_PROBE); } catch (error) { globals = {}; }
    result.libraries = await rec.libraries(globals, first.finalUrl);
    lap("libraries");
    if (result.libraries.length) say("Front-end libraries on the start page: " + result.libraries.map((row) => row.name + " " + row.version).join(", ") + ".");
    const chats = rec.chats("before", scripts);
    const chatRows = CHATS.filter((row) => chats.some((chat) => chat.name === row[0]));
    let chatAfter = null;
    const watchPhase = async (phase, need) => {
      let typed = null;
      if (left() > need) {
        try { typed = await typeProbe(page, rec, phase); } catch (error) { typed = null; }
      }
      const row = watchFrom(await watchLog(page), rec.vendors(phase), typed, host);
      const f = row.fingerprint;
      const kinds = [["canvas", f.canvas], ["font list", f.fonts], ["WebGL", f.webgl], ["audio", f.audio]].filter((kind) => kind[1].length);
      say((phase === "before" ? "Before a choice: " : "After the reject: ") +
        (kinds.length ? kinds.map((kind) => kind[0] + " fingerprinting by " + kind[1].join(", ")).join("; ") : "no fingerprinting call") + ". " +
        (row.recorders.length ? "Session recorders: " + row.recorders.map((rr) => rr.name + (rr.sent ? " sent data" : " loaded")).join(", ") + ". " : "") +
        (row.typed ? "Typing a test address into \"" + row.typed.field + "\" " + (row.typed.sent.length ? "sent it to " + row.typed.sent.map((s) => s.host).join(", ") + " before submit; the requests were blocked." : "sent nothing before submit.") : "No contact field was typed into."));
      return row;
    };
    const watched = { before: await watchPhase("before", 28000), after: null };
    lap("watchBefore");
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
        if (chats.length) chatAfter = { requests: rec.chats("after").reduce((sum, row) => sum + row.requests, 0), cookies: afterCookies.filter((cookie) => cookie.chat && !before.has(cookie.name + "@" + cookie.domain)).map((cookie) => cookie.name).slice(0, 8) };
        say("After the reject: " + consent.after.cookies.length + " new tracking cookies, " + consent.after.kept + " kept from before.");
        watched.after = await watchPhase("after", 18000);
        lap("watchAfter");
      } catch (error) {
        consent.rejectError = trim(error.message, 120);
        say("The reject button could not be pressed (" + consent.rejectError + ").");
      }
    }
    say(rec.state.errorCount + " console errors, " + rec.state.failedCount + " failed requests, and " + rec.state.mixed.length + " mixed-content requests on the desktop visit.");
    result.consent = consent;
    result.watch = watched;
    if (chats.length) {
      result.chat = { found: chats, cookies: beforeCookies.filter((cookie) => cookie.chat).map((cookie) => cookie.name).slice(0, 8), after: chatAfter };
      say("Chat on the start page: " + chats.map((row) => row.name + " (" + plural(row.requests, "request") + ", " + Math.round(row.bytes / 1024) + " KB)").join(", ") + ", with " + plural(result.chat.cookies.length, "chat cookie") + " before any choice.");
    }
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
        if (result.chat) {
          const launcher = await launcherFacts(phone, chatRows.map((row) => row[2]).filter(Boolean), CHAT_LAUNCHER).catch((error) => ({ found: false, error: trim(error.message, 120) }));
          result.chat.launcher = { found: launcher.found, name: launcher.name || "", known: !!launcher.known, banner: !!launcher.banner, box: launcher.box || null, covers: coveredBy(launcher.box, launcher.targets).map((row) => ({ label: row.label, banner: row.banner })) };
          lap("chatLauncher");
          say(launcher.found
            ? "The chat launcher is " + (launcher.known ? (launcher.name ? "named \"" + launcher.name + "\"" : "unnamed") : "inside a frame this review cannot read") + (result.chat.launcher.covers.length ? " and covers " + result.chat.launcher.covers.map((row) => "\"" + row.label + "\"").join(", ") : " and covers no button") + " on the phone."
            : "No chat launcher was found on the phone.");
        }
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
      if (result.chat && result.chat.launcher && result.chat.launcher.found && left() <= 12000) skip("Opening the chat", 12000);
      if (result.chat && result.chat.launcher && result.chat.launcher.found && left() > 12000) {
        say("Opening the chat on the phone with the keyboard to check its privacy link and whether focus can leave it. No message is sent.");
        try {
          await phone.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 1 });
          await new Promise((resolve) => setTimeout(resolve, 500));
          result.chat.open = await openChat(phone, chatRows.map((row) => row[3]).filter(Boolean).join(", "));
          const open = result.chat.open;
          say(!open.opened ? "The chat did not open." : "The chat opened " + (open.keyboard ? "with Enter" : "with a click") + ". " +
            (open.privacy === true ? "It links a privacy notice. " : open.privacy === false ? "It shows no privacy link. " : "") +
            (open.moved ? "" : open.tabbed ? "Focus stayed on the page until Tab was pressed. " : "Focus stayed on the page and Tab did not reach it" + (open.placed ? ", so the review moved focus into it. " : ". ")) +
            (!open.entered ? "Focus did not move into it." : open.trapped ? "Focus stayed inside after " + plural(open.tabs, "Tab press", "Tab presses") + " and Escape." : "Focus left it by " + { tab: "Tab", close: "its close button", escape: "Escape" }[open.exit] + "."));
        } catch (error) {
          result.chat.open = { opened: false, error: trim(error.message, 120) };
          say("The chat could not be opened (" + result.chat.open.error + ").");
        }
        lap("chatOpen");
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

module.exports = { browse, printPdf, stopForRefusal, REJECT_TEXT, blockedHost, vendorOf, chatOf, chatsFrom, coveredBy, htmlText, words, siteOf, watchFrom, watchCalls, canaryOf };
