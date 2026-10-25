"use strict";

const { URL } = require("url");
const libraries = require("./url-review-libraries");
const { germanSpeaking } = require("./url-review-legal");
const { say, some, english } = require("./url-review-findings-en");

const BROWSER_READ_NOTE = english(say("warn.browserRead"));
const UNTAGGED_READ_NOTE = english(say("warn.untaggedRead"));
const CUT_NOTE = english(say("warn.cut"));
const SLOW_READ_NOTE = english(say("warn.slowRead"));
const SLOW_CUT_NOTE = english(say("warn.slowCut"));
const SHELL_NOTE = english(say("warn.shell"));

function botCheck(vendor) {
  return (/^[aeiou]/i.test(vendor) ? "an " : "a ") + vendor + " bot check";
}

const AI_BOTS = [
  { token: "OAI-SearchBot", owner: "OpenAI", product: "ChatGPT search", role: "answers" },
  { token: "ChatGPT-User", owner: "OpenAI", product: "ChatGPT, when a person asks it to open a page", role: "answers" },
  { token: "GPTBot", owner: "OpenAI", product: "OpenAI model training", role: "training" },
  { token: "Claude-SearchBot", owner: "Anthropic", product: "Claude search", role: "answers" },
  { token: "Claude-User", owner: "Anthropic", product: "Claude, when a person asks it to open a page", role: "answers" },
  { token: "ClaudeBot", owner: "Anthropic", product: "Anthropic model training", role: "training" },
  { token: "PerplexityBot", owner: "Perplexity", product: "Perplexity answers", role: "answers" },
  { token: "Perplexity-User", owner: "Perplexity", product: "Perplexity, when a person asks it to open a page", role: "answers" },
  { token: "Googlebot", owner: "Google", product: "Google Search and AI Overviews", role: "search" },
  { token: "Google-Extended", owner: "Google", product: "Gemini training and grounding", role: "training" },
  { token: "Bingbot", owner: "Microsoft", product: "Bing and Copilot", role: "search" },
  { token: "Applebot", owner: "Apple", product: "Siri and Spotlight", role: "search" },
  { token: "Applebot-Extended", owner: "Apple", product: "Apple Intelligence training", role: "training" },
  { token: "Amazonbot", owner: "Amazon", product: "Alexa answers", role: "answers" },
  { token: "DuckAssistBot", owner: "DuckDuckGo", product: "DuckAssist answers", role: "answers" },
  { token: "MistralAI-User", owner: "Mistral", product: "Le Chat, when a person asks it to open a page", role: "answers" },
  { token: "Meta-ExternalAgent", owner: "Meta", product: "Meta AI training", role: "training" },
  { token: "CCBot", owner: "Common Crawl", product: "Open dataset used by many models", role: "training" },
  { token: "Bytespider", owner: "ByteDance", product: "ByteDance model training", role: "training" }
];

const AREAS = ["SEO", "GEO", "Analytics", "Security", "Accessibility", "Performance"];
const AREA_WEIGHT = { SEO: 1, GEO: 1, Analytics: 0.8, Security: 1.2, Accessibility: 1, Performance: 1 };
const SEVERITY_POINTS = { critical: 50, high: 30, medium: 15, low: 6, info: 0 };
const LOW_RISK_CAP = 15;
const SEVERITY_RANK = { critical: 5, high: 4, medium: 3, low: 2, info: 1 };
const EFFORT_COST = { minutes: 1, hours: 1.25, days: 1.6 };
const VERDICT_ORDER = { fail: 4, risk: 3, person: 2, pass: 1 };

const REQUIRED_PROPS = {
  Organization: ["name", "url"],
  LocalBusiness: ["name", "address"],
  Person: ["name"],
  WebSite: ["name", "url"],
  Article: ["headline", "author", "datePublished"],
  BlogPosting: ["headline", "author", "datePublished"],
  NewsArticle: ["headline", "author", "datePublished"],
  Product: ["name", ["offers", "review", "aggregateRating"]],
  BreadcrumbList: ["itemListElement"],
  FAQPage: ["mainEntity"],
  Event: ["name", "startDate", "location"],
  Recipe: ["name", "image"],
  JobPosting: ["title", "datePosted", "hiringOrganization"],
  SoftwareApplication: ["name", ["offers", "aggregateRating"]],
  VideoObject: ["name", "thumbnailUrl", "uploadDate"]
};

const COOKIELESS = ["Plausible", "Fathom", "Cloudflare Web Analytics", "Umami", "Vercel Analytics"];
const NO_SRI_HOSTS = /(^|\.)(googletagmanager\.com|google-analytics\.com|google\.com|gstatic\.com|facebook\.net|doubleclick\.net|hotjar\.com|clarity\.ms|licdn\.com|hs-scripts\.com|hs-analytics\.net|stripe\.com|paypal\.com|recaptcha\.net|cloudflareinsights\.com|youtube\.com|twitter\.com|x\.com|tiktok\.com|bing\.com)$/i;
const ANALYTICS_CONNECT = {
  "Google Analytics 4": ["https://*.google-analytics.com", "https://*.analytics.google.com", "https://*.googletagmanager.com"],
  "Google Tag Manager": ["https://*.googletagmanager.com", "https://*.google-analytics.com"],
  "Google Ads": ["https://*.doubleclick.net", "https://*.google.com"],
  "Meta Pixel": ["https://www.facebook.com"],
  "LinkedIn Insight": ["https://px.ads.linkedin.com"],
  "Hotjar": ["https://*.hotjar.com", "https://*.hotjar.io", "wss://*.hotjar.com"],
  "Microsoft Clarity": ["https://*.clarity.ms"],
  "Plausible": ["https://plausible.io"],
  "PostHog": ["https://*.posthog.com"],
  "Segment": ["https://api.segment.io"],
  "Mixpanel": ["https://api-js.mixpanel.com"],
  "Cloudflare Web Analytics": ["https://cloudflareinsights.com"]
};

function hostOf(value) {
  try { return new URL(value).hostname.toLowerCase(); } catch (error) { return ""; }
}

function normal(value) {
  try {
    const url = new URL(value);
    url.hash = "";
    let path = url.pathname.replace(/\/index\.html?$/i, "/");
    if (path.length > 1) path = path.replace(/\/+$/, "");
    return url.protocol + "//" + url.host.toLowerCase() + path + url.search;
  } catch (error) {
    return String(value || "");
  }
}

function pathOf(value) {
  try {
    const url = new URL(value);
    return url.pathname + url.search;
  } catch (error) {
    return String(value || "");
  }
}

// The path alone when the address stays on the page's scheme, host, and port; otherwise the whole URL.
function shownAgainst(value, base) {
  try {
    const url = new URL(value);
    return url.origin === new URL(base).origin ? url.pathname + url.search : url.toString();
  } catch (error) {
    return pathOf(value);
  }
}

// Answers aimed at automated readers: a bot check, a refusal, or a rate limit. They say nothing about the page.
function blockedAnswer(page) {
  return !!page.challenge || page.status === 403 || page.status === 429 || (page.status === 503 && !!page.retryAfter);
}

function blockedReason(page) {
  if (page.challenge) return botCheck(page.challenge);
  if (page.status === 429) return "429, rate limited";
  if (page.status === 503) return "503 with Retry-After";
  return page.status + ", refused";
}

function botCheckSaid(vendor) {
  return say(/^[aeiou]/i.test(vendor) ? "botCheck.an" : "botCheck.a", { vendor });
}

function blockedReasonSaid(page) {
  if (page.challenge) return botCheckSaid(page.challenge);
  if (page.status === 429) return say("blocked.429");
  if (page.status === 503) return say("blocked.503");
  return say("blocked.refused", { status: page.status });
}

function plural(count, one, many) {
  return count + " " + (count === 1 ? one : (many || one + "s"));
}

function sample(list, max) {
  const items = (list || []).slice(0, max || 3);
  const rest = (list || []).length - items.length;
  return items.join(", ") + (rest > 0 ? " and " + rest + " more" : "");
}

function parseRobotsFull(text) {
  const groups = [];
  const sitemaps = [];
  let current = null;
  String(text || "").split(/\r?\n/).forEach((line) => {
    const cleanLine = line.split("#")[0].trim();
    const at = cleanLine.indexOf(":");
    if (at < 1) return;
    const key = cleanLine.slice(0, at).trim().toLowerCase();
    const value = cleanLine.slice(at + 1).trim();
    if (key === "sitemap") {
      if (value && sitemaps.length < 10) sitemaps.push(value);
      return;
    }
    if (key === "user-agent") {
      if (!current || current.rules.length) {
        current = { agents: [], rules: [] };
        groups.push(current);
      }
      current.agents.push(value.toLowerCase());
      return;
    }
    if (!current) return;
    if (key === "allow" || key === "disallow") current.rules.push({ allow: key === "allow", path: value });
  });
  return { groups, sitemaps };
}

function ruleMatches(path, rule) {
  if (!rule) return false;
  const anchored = rule.endsWith("$");
  const body = anchored ? rule.slice(0, -1) : rule;
  const pattern = "^" + body.split("*").map((part) => part.replace(/[.+?^${}()|[\]\\]/g, "\\$&")).join(".*") + (anchored ? "$" : "");
  try { return new RegExp(pattern).test(path); } catch (error) { return path.startsWith(body); }
}

function robotsVerdict(token, path, groups) {
  const name = token.toLowerCase();
  const specific = groups.filter((group) => group.agents.some((agent) => agent === name));
  const chosen = specific.length ? specific : groups.filter((group) => group.agents.includes("*"));
  let match = null;
  chosen.forEach((group) => {
    group.rules.forEach((rule) => {
      if (!rule.path) return;
      if (!ruleMatches(path, rule.path)) return;
      const length = rule.path.replace(/\*|\$$/g, "").length;
      if (!match || length > match.length || (length === match.length && rule.allow)) match = { allow: rule.allow, length, path: rule.path };
    });
  });
  return { allowed: !match || match.allow, rule: match ? (match.allow ? "Allow: " : "Disallow: ") + match.path : "", named: specific.length > 0 };
}

function cspDirectives(value) {
  const map = {};
  String(value || "").split(";").forEach((part) => {
    const bits = part.trim().split(/\s+/).filter(Boolean);
    if (!bits.length) return;
    const name = bits[0].toLowerCase();
    if (!map[name]) map[name] = bits.slice(1);
  });
  return map;
}

function framesGuarded(xfo) {
  return !!xfo && !/allow-from/i.test(xfo);
}

const IMAGE_MIN = 30720;
const OLD_IMAGE = /^image\/(jpeg|png|gif)$/i;

function imageName(src) {
  let name = String(src || "");
  try { name = decodeURIComponent(new URL(name).pathname.split("/").filter(Boolean).pop() || name); } catch (error) { /* keep the raw address */ }
  return name.length > 40 ? name.slice(0, 39) + "…" : name;
}

function kbOf(bytes) {
  return Math.round((bytes || 0) / 1024) + " KB";
}

// One row per image address across the browsed pages, with every page it was seen on.
function browsedImages(browsed) {
  const seen = new Map();
  const lists = [[(browsed.start && browsed.start.finalPath) || "/", browsed.start && browsed.start.images]].concat((browsed.pages || []).map((page) => [page.path, page.images]));
  lists.forEach(([path, rows]) => (rows || []).forEach((row) => {
    if (seen.has(row.src)) seen.get(row.src).pages.push(path);
    else seen.set(row.src, Object.assign({ pages: [path] }, row));
  }));
  return [...seen.values()];
}

const COOP_GUARDED = ["same-origin", "same-origin-allow-popups", "noopener-allow-popups"];
const ISOLATING_COEP = ["require-corp", "credentialless"];

// "same-origin; report-to=\"coop\"" reads as same-origin.
function policyOf(value) {
  return String(value || "").split(";")[0].trim().toLowerCase();
}

const BFCACHE_BLOCKERS = {
  UnloadHandlerExistsInMainFrame: "unload",
  UnloadHandlerExistsInSubFrame: "unloadFrame",
  MainResourceHasCacheControlNoStore: "noStore",
  JsNetworkRequestReceivedCacheControlNoStoreResource: "noStoreFetch",
  WebSocket: "socket",
  WebRTC: "rtc",
  WebTransport: "transport",
  BroadcastChannel: "channel",
  WebLocks: "locks",
  OutstandingNetworkRequestFetch: "pending",
  OutstandingNetworkRequestXHR: "pending",
  IndexedDBEvent: "idb"
};

function bfcacheBlocker(reason) {
  return BFCACHE_BLOCKERS[reason] ? [say("bfcache.name." + reason), BFCACHE_BLOCKERS[reason]] : [String(reason).replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase(), ""];
}

function grade(score) {
  if (score >= 90) return "A";
  if (score >= 80) return "B";
  if (score >= 70) return "C";
  if (score >= 55) return "D";
  return "F";
}

function hostingHint(technologies, headers) {
  const names = (technologies || []).map((item) => String(item.name || "").toLowerCase());
  const server = String((headers && headers.server) || "").toLowerCase();
  if (names.some((name) => name.includes("netlify"))) return "Netlify";
  if (names.some((name) => name.includes("vercel"))) return "Vercel";
  if (server.includes("github")) return "GitHub Pages";
  if (names.some((name) => name.includes("firebase")) || server.includes("firebase") || server.includes("google frontend")) return "Firebase Hosting";
  if (names.some((name) => name.includes("cloudflare"))) return "Cloudflare";
  if (server.includes("nginx")) return "nginx";
  if (server.includes("apache")) return "Apache";
  return "";
}

const AXE_CASES = {
  "image-alt": ["A11Y-01"], "role-img-alt": ["A11Y-01"], "input-image-alt": ["A11Y-01"], "svg-img-alt": ["A11Y-01"],
  "landmark-one-main": ["A11Y-02"], "bypass": ["A11Y-02"], "region": ["A11Y-02"],
  "heading-order": ["A11Y-03"], "page-has-heading-one": ["A11Y-03"], "empty-heading": ["A11Y-03"],
  "color-contrast": ["A11Y-04"], "frame-title": ["A11Y-05"],
  "label": ["FM-01"], "select-name": ["FM-01"], "html-has-lang": ["FN-04"], "html-lang-valid": ["FN-04"],
  "meta-viewport": ["MB-01"], "target-size": ["MB-01"]
};
const AXE_RAW = { "image-alt": "a11y-alt", "frame-title": "a11y-frames", "html-has-lang": "a11y-lang", "landmark-one-main": "a11y-main", "label": "a11y-labels", "meta-viewport": "a11y-zoom" };
const AXE_FIX = new Set(["color-contrast", "button-name", "link-name", "image-alt", "role-img-alt", "label", "label-content-name-mismatch", "target-size", "heading-order", "list", "listitem", "scrollable-region-focusable", "aria-hidden-focus", "duplicate-id-aria", "nested-interactive"]);
const AXE_SEVERITY = { critical: ["fail", "medium"], serious: ["fail", "low"], moderate: ["risk", "low"], minor: ["risk", "low"] };

function bannerLine(consent) {
  if (!consent || !consent.banner) return say("an.banner.none");
  return consent.banner === "A cookie banner" ? say("an.banner.generic") : say("an.banner.named", { name: consent.banner });
}

// Chat widgets and AI chatbots: consent, weight on the start page, and the launcher and open widget on a phone.
function chatChecks(chat, consent, add) {
  const rows = chat.found;
  const requests = rows.reduce((sum, row) => sum + row.requests, 0);
  const cookies = chat.cookies || [];
  const chats = some(rows.map((row) => row.ai ? say("an-chat.ai", { name: row.name }) : row.name), 3);
  const one = rows.length === 1 ? rows[0].name : say("an-chat.it");
  const box = rows.length === 1 ? say("an-chat.widgetNamed", { name: rows[0].name }) : say("an-chat.widget");
  const sent = say("an.requests", { n: requests });
  const banner = consent && consent.banner ? bannerLine(consent) : "";

  if (cookies.length && banner) add("Analytics", "risk", "medium", "an-chat-consent", say("an-chat-consent.before.title"),
    say("an-chat-consent.before.evidence", { banner, chats, requests: sent, cookies: some(cookies, 4) }),
    say("an-chat-consent.before.fix"), { effort: "hours", cases: ["CHAT-02", "PR-03"], count: cookies.length });
  else if (cookies.length) add("Analytics", "risk", "low", "an-chat-consent", say("an-chat-consent.load.title"),
    say("an-chat-consent.load.evidence", { chats, requests: sent, cookies: some(cookies, 4) }),
    say("an-chat-consent.load.fix"), { effort: "hours", cases: ["CHAT-02", "PR-03"], count: cookies.length });
  else if (banner) add("Analytics", "risk", "low", "an-chat-consent", say("an-chat-consent.early.title"),
    say("an-chat-consent.early.evidence", { banner, chats, requests: sent }),
    say("an-chat-consent.early.fix"), { effort: "hours", cases: ["CHAT-02", "PR-03"] });
  else add("Analytics", "pass", "info", "an-chat-consent", say("an-chat-consent.pass.title"), say("an-chat-consent.pass.evidence", { chats, requests: sent }), "", { cases: ["CHAT-02"] });

  if (consent && consent.rejected && chat.after) {
    const after = chat.after;
    const label = consent.rejectLabel;
    if (after.cookies.length) add("Analytics", "risk", "medium", "an-chat-reject", say("an-chat-reject.cookies.title"),
      say("an-chat-reject.cookies.evidence", { label, it: one, cookies: some(after.cookies, 4) }),
      say("an-chat-reject.cookies.fix"), { effort: "hours", cases: ["CHAT-02", "PR-03"] });
    else if (after.requests) add("Analytics", "risk", "low", "an-chat-reject", say("an-chat-reject.requests.title"),
      say("an-chat-reject.requests.evidence", { label, it: one, requests: say("an.requests", { n: after.requests }) }),
      say("an-chat-reject.requests.fix"), { effort: "hours", cases: ["CHAT-02"] });
    else add("Analytics", "pass", "info", "an-chat-reject", say("an-chat-reject.pass.title"), say("an-chat-reject.pass.evidence", { label, it: one }), "", { cases: ["CHAT-02"] });
  }

  const open = chat.open || {};
  if (open.privacy === false) add("Analytics", "risk", "low", "an-chat-privacy", say("an-chat-privacy.title"),
    say("an-chat-privacy.evidence", { widget: box }),
    say("an-chat-privacy.fix"), { effort: "minutes", cases: ["CHAT-03", "PR-01"] });
  else if (open.privacy === true) add("Analytics", "pass", "info", "an-chat-privacy", say("an-chat-privacy.pass.title"), say("an-chat-privacy.pass.evidence", { widget: box }), "", { cases: ["CHAT-03", "PR-01"] });

  const kb = Math.round(rows.reduce((sum, row) => sum + row.bytes, 0) / 1024);
  const ms = rows.reduce((sum, row) => sum + row.ms, 0);
  const cost = say("pf-chat.evidence", { chats, requests: sent, kb, ms: ms ? say("pf-chat.ms", { ms }) : "" });
  const lighter = say("pf-chat.fix");
  if (kb > 500 || ms > 250) add("Performance", "risk", "medium", "pf-chat", say("pf-chat.title", { kb }), cost, lighter, { effort: "hours", cases: ["PF-02"] });
  else if (kb > 200 || ms > 100) add("Performance", "risk", "low", "pf-chat", say("pf-chat.title", { kb }), cost, lighter, { effort: "hours", cases: ["PF-02"] });
  else add("Performance", "pass", "info", "pf-chat", say("pf-chat.pass.title"), cost, "", { cases: ["PF-02"] });

  const launcher = chat.launcher || {};
  const pad = say(rows.length === 1 ? "a11y-chat.launcherNamed" : "a11y-chat.launcher", { name: rows[0].name });
  const enter = open.keyboard ? say("a11y-chat.withEnter") : "";
  if (launcher.found) {
    const covers = launcher.covers || [];
    const onBanner = covers.filter((row) => row.banner);
    if (covers.length) add("Accessibility", "fail", onBanner.length ? "high" : "medium", "a11y-chat-cover", say(onBanner.length ? "a11y-chat-cover.banner.title" : "a11y-chat-cover.title"),
      say("a11y-chat-cover.evidence", { launcher: pad, list: some(covers.map((row) => say(row.banner ? "a11y-chat-cover.inBanner" : "a11y-chat-cover.label", { label: row.label })), 3) }),
      say(onBanner.length ? "a11y-chat-cover.banner.fix" : "a11y-chat-cover.fix"), { effort: "hours", cases: ["CHAT-01", "MB-01"] });
    else add("Accessibility", "pass", "info", "a11y-chat-cover", say("a11y-chat-cover.pass.title"), say(launcher.banner ? "a11y-chat-cover.pass.evidenceBanner" : "a11y-chat-cover.pass.evidence", { launcher: pad }), "", { cases: ["CHAT-01"] });
    if (launcher.known && !launcher.name) add("Accessibility", "fail", "medium", "a11y-chat-name", say("a11y-chat-name.title"),
      say("a11y-chat-name.evidence", { launcher: pad }),
      say("a11y-chat-name.fix"), { effort: "minutes", cases: ["CHAT-01", "FN-05"] });
    else if (launcher.known) add("Accessibility", "pass", "info", "a11y-chat-name", say("a11y-chat-name.pass.title"), say("a11y-chat-name.pass.evidence", { launcher: pad, name: launcher.name }), "", { cases: ["CHAT-01", "FN-05"] });
  }
  if (open.opened && open.moved === false) add("Accessibility", "risk", open.tabbed ? "low" : "medium", "a11y-chat-focus", say("a11y-chat-focus.title"),
    say(open.keyboard ? "a11y-chat-focus.evidence.keyboard" : "a11y-chat-focus.evidence.click", { launcher: pad, rest: say(open.tabbed ? "a11y-chat-focus.tabbed" : "a11y-chat-focus.lost") }),
    say("a11y-chat-focus.fix"), { effort: "hours", cases: ["CHAT-03", "A11Y-04"] });
  if (open.opened && open.trapped) add("Accessibility", "fail", "high", "a11y-chat-trap", say("a11y-chat-trap.title"),
    say("a11y-chat-trap.evidence", { it: one, enter, presses: say("a11y-chat-trap.presses", { n: open.tabs }) }),
    say("a11y-chat-trap.fix"), { effort: "hours", cases: ["CHAT-03", "A11Y-04"] });
  else if (open.opened && open.exit) add("Accessibility", "pass", "info", "a11y-chat-trap", say("a11y-chat-trap.pass.title"),
    say("a11y-chat-trap.pass.evidence", { it: one, enter, exit: say("a11y-chat-trap.exit." + open.exit) }), "", { cases: ["CHAT-03", "A11Y-04"] });
  else if (open.opened) add("Accessibility", "person", "info", "a11y-chat-trap", say("a11y-chat-trap.person.title"),
    say("a11y-chat-trap.person.evidence", { why: say(open.entered ? "a11y-chat-trap.person.frame" : "a11y-chat-trap.person.blocked", { it: one }), enter: open.keyboard ? "" : say("a11y-chat-trap.person.noEnter") }), "", { cases: ["CHAT-03"] });
}

const SHOP_PATH = /\/(cart|checkout|basket|warenkorb|kasse|carrito|cesta|panier|carrello|carrinho)(\/|$|\?)/i;
const LIB_SEVERITY = { critical: ["fail", "high"], high: ["risk", "high"], medium: ["risk", "medium"], low: ["risk", "low"] };

// Links to the accessibility statement, the privacy notice and the imprint, on any page read or the rendered start page.
const FINGERPRINT_KINDS = ["canvas", "fonts", "webgl", "audio"];

// Browser fingerprinting, session recorders, and typed text sent before submit: before a choice and after Reject.
function watchChecks(watch, consent, add) {
  const before = watch.before;
  const after = consent && consent.rejected && watch.after ? watch.after : null;
  const label = after ? consent.rejectLabel : "";
  const banner = bannerLine(consent);
  const hosts = (row) => [...new Set([].concat(...FINGERPRINT_KINDS.map((key) => row.fingerprint[key] || [])))];
  const list = (row) => ({ items: hosts(row).map((host) => say("an-fingerprint.host", {
    host, hows: { items: FINGERPRINT_KINDS.filter((key) => (row.fingerprint[key] || []).indexOf(host) !== -1).map((key) => say("an-fingerprint.how." + key)), join: "andSerial" }
  })), sep: "; " });
  const guarded = (row) => hosts(row).length > 0 && hosts(row).every((host) => (row.guards || []).indexOf(host) !== -1);
  const printed = hosts(before).length > 0;

  if (printed && guarded(before)) {
    add("Analytics", "risk", "low", "an-fingerprint", say("an-fingerprint.bot.title"),
      say("an-fingerprint.bot.evidence", { banner, list: list(before) }),
      say("an-fingerprint.bot.fix"), { effort: "minutes", cases: ["PR-02"] });
  } else if (printed) {
    add("Analytics", consent && consent.banner ? "fail" : "risk", "high", "an-fingerprint", say(consent && consent.banner ? "an-fingerprint.before.title" : "an-fingerprint.load.title"),
      say("an-fingerprint.evidence", { banner, list: list(before) }),
      say("an-fingerprint.fix"), { effort: "hours", cases: ["PR-02", "PR-03"], count: hosts(before).length });
  } else {
    add("Analytics", "pass", "info", "an-fingerprint", say("an-fingerprint.pass.title"),
      say("an-fingerprint.pass.evidence"), "", { cases: ["PR-02"] });
  }
  if (after && hosts(after).length && !guarded(after)) {
    add("Analytics", "fail", "high", "an-fingerprint-reject", say("an-fingerprint-reject.title"), say("an-fingerprint-reject.evidence", { label, list: list(after) }),
      say("an-fingerprint-reject.fix"), { effort: "hours", cases: ["PR-02", "PR-03"] });
  } else if (after && printed && !guarded(before)) {
    add("Analytics", "pass", "info", "an-fingerprint-reject", say("an-fingerprint-reject.pass.title"), say("an-fingerprint-reject.pass.evidence", { label }), "", { cases: ["PR-03"] });
  }

  const recording = (row) => (row.recorders || []).filter((rr) => rr.sent).map((rr) => rr.name);
  if (recording(before).length) {
    add("Analytics", consent && consent.banner ? "fail" : "risk", "medium", "an-recording", say(consent && consent.banner ? "an-recording.before.title" : "an-recording.load.title"),
      say("an-recording.evidence", { banner, names: { items: recording(before) } }),
      say("an-recording.fix"), { effort: "hours", cases: ["PR-03"] });
  } else if ((before.recorders || []).length) {
    add("Analytics", "pass", "info", "an-recording", say("an-recording.pass.title"), say("an-recording.pass.evidence", { names: { items: before.recorders.map((rr) => rr.name) } }), "", { cases: ["PR-03"] });
  }
  if (after && recording(after).length) {
    add("Analytics", "fail", "medium", "an-recording-reject", say("an-recording-reject.title"), say("an-recording-reject.evidence", { label, names: { items: recording(after) } }),
      say("an-recording-reject.fix"), { effort: "hours", cases: ["PR-03"] });
  } else if (after && (before.recorders || []).length) {
    add("Analytics", "pass", "info", "an-recording-reject", say("an-recording-reject.pass.title"), say("an-recording-reject.pass.evidence", { label }), "", { cases: ["PR-03"] });
  }

  const typed = before.typed || (after && after.typed);
  if (!typed) return;
  const sentTo = (row) => (row && row.typed ? row.typed.sent : []).map((s) => say("pathNote", { path: s.host, note: s.how }));
  const listening = before.listeners && before.listeners.length ? say("sec-typed.listening", { list: { items: before.listeners.slice(0, 4) } }) : "";
  if (sentTo(before).length || sentTo(after).length) {
    const sent = [sentTo(before).length ? say("sec-typed.before", { list: { items: sentTo(before) } }) : "",
      sentTo(after).length ? say("sec-typed.after", { label: consent.rejectLabel, list: { items: sentTo(after) } }) : ""].filter(Boolean);
    add("Security", "fail", "high", "sec-typed", say("sec-typed.title"),
      say("sec-typed.evidence", { field: typed.field, sent: { items: sent, sep: " " }, listening }),
      say("sec-typed.fix"), { effort: "hours", cases: ["PR-02"] });
  } else {
    add("Security", "pass", "info", "sec-typed", say("sec-typed.pass.title"),
      say("sec-typed.pass.evidence", { field: typed.field, listening }), "", { cases: ["PR-02"] });
  }
}

function legalChecks(ctx, add) {
  const { read, browsed, face, origin, home } = ctx;
  const dom = browsed && browsed.start && browsed.start.dom;
  if (face.signals && face.signals.appShell && !dom) return;
  const at = (kind) => {
    for (const page of read) {
      const hit = page.inspect.legal && page.inspect.legal[kind];
      if (hit) return Object.assign({ path: page.path }, hit);
    }
    return dom && dom.legal && dom.legal[kind] ? Object.assign({ path: browsed.start.finalPath || "/" }, dom.legal[kind]) : null;
  };
  const linkedMsg = (hit) => say(hit.text ? "legal.linked.text" : "legal.linked", { text: hit.text, path: hit.path, href: shownAgainst(hit.href, origin) });
  const noneMsg = (what) => say(dom ? "legal.none.rendered" : "legal.none", { pages: say("pagesN", { n: read.length }), what });

  const statement = at("accessibility");
  const techs = [].concat.apply([], read.map((page) => page.inspect.technologies || []));
  const seller = techs.find((item) => /^(Commerce|Payments)$/.test(item.group));
  const products = read.some((page) => ((page.inspect.schema || {}).items || []).some((item) => item.types.some((type) => /^(Product|Offer|AggregateOffer|Store|OnlineStore)$/.test(type))));
  const cart = read.concat(dom ? [{ inspect: { links: dom.links } }] : []).some((page) => (page.inspect.links || []).some((url) => SHOP_PATH.test(url)));
  const shop = seller ? seller.name : products ? say("a11y-statement.shop.products") : cart ? say("a11y-statement.shop.cart") : "";
  if (statement) add("Accessibility", "pass", "info", "a11y-statement", say("a11y-statement.pass.title"), linkedMsg(statement), "", { cases: ["A11Y-06"] });
  else if (shop) add("Accessibility", "risk", "medium", "a11y-statement", say("a11y-statement.title"),
    say("a11y-statement.evidence", { shop, none: noneMsg(say("a11y-statement.what")) }),
    say("a11y-statement.fix"), { effort: "hours", cases: ["A11Y-06"] });
  else add("Accessibility", "person", "info", "a11y-statement", say("a11y-statement.person.title"),
    say("a11y-statement.person.evidence", { none: noneMsg(say("a11y-statement.what")) }), "", { cases: ["A11Y-06"] });

  const privacy = at("privacy");
  if (privacy) add("Analytics", "pass", "info", "an-privacy", say("an-privacy.pass.title"), linkedMsg(privacy), "", { cases: ["PR-01"] });
  else {
    const cookies = read.some((page) => (page.inspect.cookies || []).length) || !!(browsed && browsed.consent && browsed.consent.before && browsed.consent.before.cookieCount);
    const forms = read.reduce((sum, page) => sum + (page.inspect.forms || 0), 0);
    const why = [cookies ? say("an-privacy.why.cookies") : "", (ctx.tags || []).length ? say("an-privacy.why.tags", { list: some(ctx.tags.map((tag) => tag.name), 3) }) : "", forms ? say("an-privacy.why.forms", { n: forms }) : ""].filter(Boolean);
    add("Analytics", "risk", why.length ? "medium" : "low", "an-privacy", say("an-privacy.title"),
      say("an-privacy.evidence", { none: noneMsg(say("an-privacy.what")), yet: why.length ? say("an-privacy.yet", { list: { items: why } }) : "" }),
      say("an-privacy.fix"), { effort: "hours", cases: ["PR-01"] });
  }

  const imprint = at("imprint");
  const german = germanSpeaking(face.lang, face.textLang, home.url);
  if (imprint) add("Analytics", "pass", "info", "an-imprint", say("an-imprint.pass.title"), linkedMsg(imprint), "", { cases: ["PR-04"] });
  else if (german) add("Analytics", "risk", "medium", "an-imprint", say("an-imprint.title"),
    say("an-imprint.evidence", {
      why: /^de\b/i.test(face.lang || "") ? say("an-imprint.why.declared", { lang: face.lang }) : face.textLang === "de" ? say("an-imprint.why.written") : say("an-imprint.why.domain"),
      none: noneMsg(say("an-imprint.what"))
    }),
    say("an-imprint.fix"), { effort: "hours", cases: ["PR-04"] });
}

// Front-end libraries named by script addresses, banners or page globals, against the bundled retire.js list.
function libraryRows(read, browsed) {
  return libraries.assess([].concat.apply([], read.map((page) => page.inspect.libraries || [])).concat((browsed && browsed.libraries) || []));
}

function libraryChecks(ctx, add) {
  const { read, browsed, origin } = ctx;
  const rows = libraryRows(read, browsed);
  if (!rows.length) return;
  const flawed = rows.filter((row) => row.flaws);
  const source = say("sec-libraries.source", { date: libraries.LIST_DATE });
  if (!flawed.length) {
    add("Security", "pass", "info", "sec-libraries", say("sec-libraries.pass.title"), say("sec-libraries.pass.evidence", { list: some(rows.map((row) => row.name + " " + row.version), 5), source }), "", { cases: ["SEC-10"] });
    return;
  }
  const where = (row) => row.via === "global" ? say("sec-libraries.page") : row.via === "banner" ? say("sec-libraries.banner", { url: shownAgainst(row.url, origin) }) : shownAgainst(row.url, origin);
  const worst = (row) => LIB_SEVERITY[row.worst] ? say("sec-libraries.worst." + row.worst) : row.worst;
  const [verdict, severity] = LIB_SEVERITY[flawed[0].worst] || LIB_SEVERITY.medium;
  const evidence = say("sec-libraries.evidence", {
    rows: { items: flawed.slice(0, 4).map((row, index) => say("sec-libraries.row", { name: row.name, version: row.version, where: where(row), flaws: say("sec-libraries.flaws", { n: row.flaws }), worst: worst(row),
      ids: row.ids.length ? say("sec-libraries.ids", { list: { items: row.ids } }) : "", summary: index === 0 && row.summary ? " " + row.summary.replace(/\.?$/, ".") : "" })), sep: " " },
    more: flawed.length > 4 ? say("sec-libraries.more", { n: flawed.length - 4 }) : "",
    source
  });
  const steps = flawed.slice(0, 4).map((row, index) => row.ended
    ? say("sec-libraries.ended" + (index ? "" : ".first"), { name: row.name, major: row.version.split(".")[0] })
    : say("sec-libraries.upgrade" + (index ? "" : ".first"), { name: row.name, fixed: row.fixed }));
  const fix = say("sec-libraries.fix", { steps: { items: steps, sep: "; " }, jump: flawed.some((row) => row.majorJump) ? say("sec-libraries.jump") : "" });
  add("Security", verdict, severity, "sec-libraries", flawed.length === 1 ? say("sec-libraries.one.title", { name: flawed[0].name, version: flawed[0].version, n: flawed[0].flaws }) : say("sec-libraries.title", { n: flawed.length }),
    evidence, fix, { effort: flawed.some((row) => row.majorJump) ? "days" : "hours", count: flawed.length, cases: ["SEC-10"] });
}

function browserChecks(b, add, ctx) {
  const start = b.start || {};
  const consent = b.consent || null;

  // Analytics: what fires before a choice, and after Reject.
  if (consent) {
    const live = (rows) => (rows || []).filter((row) => row.hits > 0);
    const quiet = (rows) => (rows || []).filter((row) => row.denied > 0 && !row.hits);
    const listHits = (rows) => ({ items: rows.map((row) => say("pathNote", { path: row.name, note: say("an.requests", { n: row.hits }) })) });
    const listCookies = (rows) => ({ items: rows.slice(0, 6).map((row) => row.third ? say("an.cookieOn", { name: row.name, domain: row.domain }) : row.name) });
    const beforeHits = live(consent.before.vendors);
    const beforeCookies = consent.before.cookies || [];
    const denied = quiet(consent.before.vendors);
    const banner = bannerLine(consent);
    if (beforeHits.length || beforeCookies.length) {
      const seen = [beforeHits.length ? listHits(beforeHits) : "", beforeCookies.length ? say("an-firing.cookies", { list: listCookies(beforeCookies) }) : ""].filter(Boolean);
      add("Analytics", consent.banner ? "fail" : "risk", "high", "an-firing", say(consent.banner ? "an-firing.before.title" : "an-firing.load.title"),
        say("an-firing.evidence", { banner, seen: { items: seen, join: "andSerial" } }),
        say("an-firing.fix"), { effort: "hours", cases: ["AN-01", "PR-03"], count: beforeHits.length + beforeCookies.length });
    } else if (consent.before.vendors.length || ctx.tags.length || ctx.consentTools.length) {
      add("Analytics", "pass", "info", "an-firing", say(denied.length ? "an-firing.pings.title" : "an-firing.pass.title"),
        denied.length ? say("an-firing.pings.evidence", { banner, names: { items: denied.map((row) => row.name) } }) : say("an-firing.pass.evidence", { banner }), "", { cases: ["AN-01"] });
    }
    if (consent.rejected && consent.after) {
      const afterHits = live(consent.after.vendors);
      const afterCookies = consent.after.cookies || [];
      const label = consent.rejectLabel;
      if (afterHits.length || afterCookies.length) {
        const seen = [afterHits.length ? listHits(afterHits) : "", afterCookies.length ? say("an-reject.cookies", { list: listCookies(afterCookies) }) : ""].filter(Boolean);
        add("Analytics", "fail", "high", "an-reject", say("an-reject.title"),
          say("an-reject.evidence", { label, seen: { items: seen, join: "andSerial" } }),
          say("an-reject.fix"), { effort: "hours", cases: ["AN-01", "PR-03"] });
      } else {
        add("Analytics", "pass", "info", "an-reject", say("an-reject.pass.title"), say("an-reject.pass.evidence", { label }), "", { cases: ["AN-01", "PR-03"] });
      }
    } else if (consent.banner && consent.banner !== "Sourcepoint" && !consent.rejectLabel) {
      add("Analytics", "risk", "medium", "an-reject", say("an-reject.nobutton.title"),
        say("an-reject.nobutton.evidence", { name: consent.banner }),
        say("an-reject.nobutton.fix"), { effort: "minutes", cases: ["PR-03"] });
    }
  }

  if (b.chat && (b.chat.found || []).length) chatChecks(b.chat, consent, add);
  if (b.watch && b.watch.before) watchChecks(b.watch, consent, add);

  // Accessibility: axe-core on the rendered pages, and the phone width.
  const axe = b.axe && b.axe.ran ? b.axe : null;
  if (axe) {
    const rules = new Map();
    axe.pages.forEach((page) => (page.violations || []).forEach((rule) => {
      const row = rules.get(rule.id) || { id: rule.id, impact: rule.impact, help: rule.help, helpUrl: rule.helpUrl, nodes: 0, pages: [], targets: rule.targets || [] };
      row.nodes += rule.nodes;
      if (row.pages.indexOf(page.path) === -1) row.pages.push(page.path);
      const order = ["minor", "moderate", "serious", "critical"];
      if (order.indexOf(rule.impact) > order.indexOf(row.impact)) row.impact = rule.impact;
      rules.set(rule.id, row);
    }));
    const order = { critical: 4, serious: 3, moderate: 2, minor: 1 };
    const list = [...rules.values()].sort((x, y) => (order[y.impact] - order[x.impact]) || (y.nodes - x.nodes)).slice(0, 10);
    list.forEach((rule) => {
      const raw = AXE_RAW[rule.id];
      if (raw && ctx.findings.some((item) => item.key === raw && item.verdict !== "pass")) return;
      const [verdict, severity] = AXE_SEVERITY[rule.impact] || AXE_SEVERITY.minor;
      add("Accessibility", verdict, severity, "ax-" + rule.id, rule.help,
        say("ax.evidence", { version: axe.version, elements: say("a11y.elements", { n: rule.nodes }), pages: some(rule.pages, 3), example: rule.targets.length ? say("a11y.example", { list: { items: rule.targets.slice(0, 2), join: "and" } }) : "", impact: say("ax.impact." + rule.impact) }),
        AXE_FIX.has(rule.id) ? say("ax-fix." + rule.id) : say("ax.guide", { url: rule.helpUrl }), { pages: rule.pages, count: rule.nodes, effort: rule.nodes > 20 ? "hours" : "minutes", cases: AXE_CASES[rule.id] || [] });
    });
    const checked = axe.pages.length;
    if (!rules.has("color-contrast")) add("Accessibility", "pass", "info", "a11y-contrast", say("a11y-contrast.pass.title"), say("a11y-contrast.pass.evidence", { pages: say("pagesN", { n: checked }) }), "", { cases: ["A11Y-04"] });
    if (!rules.size) add("Accessibility", "pass", "info", "ax-clean", say("ax-clean.title"), say("ax-clean.evidence", { pages: say("a11y.renderedPages", { n: checked }) }), "");
  }
  const mobile = b.mobile && !b.mobile.error ? b.mobile : null;
  if (mobile) {
    const widest = (list) => (list || []).length ? say("a11y-reflow.widest", { list: { items: list } }) : "";
    if (mobile.overflow > 2) add("Accessibility", "fail", "medium", "a11y-reflow", say("a11y-reflow.title"),
      say("a11y-reflow.evidence", { width: mobile.width, overflow: mobile.overflow, widest: widest(mobile.offenders) }),
      say("a11y-reflow.fix"), { effort: "hours", cases: ["MB-01", "VIS-02"] });
    else add("Accessibility", "pass", "info", "a11y-reflow", say("a11y-reflow.pass.title", { width: mobile.width }), say("a11y-reflow.pass.evidence"), "", { cases: ["MB-01", "VIS-02"] });
    const tablet = b.tablet || {};
    if (tablet.width && tablet.overflow > 2) add("Accessibility", "fail", "low", "a11y-reflow-tablet", say("a11y-reflow-tablet.title"),
      say("a11y-reflow-tablet.evidence", { width: tablet.width, overflow: tablet.overflow, widest: widest(tablet.offenders) }),
      say("a11y-reflow-tablet.fix"), { effort: "hours", cases: ["MB-02", "VIS-02"] });
    else if (tablet.width) add("Accessibility", "pass", "info", "a11y-reflow-tablet", say("a11y-reflow-tablet.pass.title", { width: tablet.width }), say("a11y-reflow-tablet.pass.evidence"), "", { cases: ["MB-02"] });
    if (mobile.smallTargets && !(axe && axe.pages.some((page) => (page.violations || []).some((rule) => rule.id === "target-size")))) {
      add("Accessibility", "risk", "low", "a11y-targets", say("a11y-targets.title", { n: mobile.smallTargets }),
        say("a11y-targets.evidence", { width: mobile.width, example: mobile.targetSamples.length ? say("a11y.example", { list: { items: mobile.targetSamples.slice(0, 2), join: "and" } }) : "" }),
        say("ax-fix.target-size"), { count: mobile.smallTargets, effort: "hours", cases: ["MB-01"] });
    }
  }

  // GEO: the HTML compared with the rendered page.
  if (start.renderedWords > 150) {
    const thin = [{ path: start.finalPath || "/", share: start.share }].concat((b.pages || []).filter((page) => page.renderedWords > 150).map((page) => ({ path: page.path, share: page.share }))).filter((page) => page.share < 40);
    if (thin.length) add("GEO", "risk", "medium", "geo-rendered", say("geo-rendered.title"),
      say("geo-rendered.evidence", { list: { items: thin.slice(0, 3).map((page) => say("pathPercent", { path: page.path, share: page.share })) } }),
      say("fix.serverRender"), { pages: thin.map((page) => page.path), effort: "days", cases: ["GEO-03"] });
    else add("GEO", "pass", "info", "geo-rendered", say("geo-rendered.pass.title"), say("geo-rendered.pass.evidence", { share: start.share }), "", { cases: ["GEO-03"] });
    const dom = start.dom;
    const rawLinks = ((ctx.face && ctx.face.links) || []).length;
    if (dom && dom.links.length >= 5 && rawLinks < Math.max(3, dom.links.length / 4)) add("SEO", "risk", "medium", "seo-links-js", say("seo-links-js.title"),
      say("seo-links-js.evidence", { links: say("seo-links-js.links", { n: rawLinks }), rendered: dom.links.length, tail: say(ctx.renderedCrawl ? "seo-links-js.followed" : "seo-links-js.notFollowed") }),
      say("seo-links-js.fix"), { effort: "days", cases: ["LK-01", "SEO-03"] });
    if (start.h1 && start.h1InHtml === false) add("GEO", "risk", "low", "geo-h1-rendered", say("geo-h1-rendered.title"), say("geo-h1-rendered.evidence", { h1: start.h1 }), say("geo-h1-rendered.fix"), { effort: "hours", cases: ["GEO-03"] });
  }

  // Performance: lab vitals and what broke while loading.
  const vitals = start.vitals || {};
  const lab = say("pf.lab");
  const good = (value) => say("pf.withGood", { lab, good: value });
  if (vitals.lcp) {
    const secs = (vitals.lcp / 1000).toFixed(1);
    if (vitals.lcp > 4000) add("Performance", "fail", "medium", "pf-lcp", say("pf-lcp.title", { secs }), lab, say("pf-lcp.fix"), { effort: "days" });
    else if (vitals.lcp > 2500) add("Performance", "risk", "low", "pf-lcp", say("pf-lcp.title", { secs }), good("2.5 s"), say("pf-lcp.risk.fix"), { effort: "hours" });
    else add("Performance", "pass", "info", "pf-lcp", say("pf-lcp.pass.title", { secs }), lab, "");
  }
  if (vitals.cls != null && start.status) {
    if (vitals.cls > 0.25) add("Performance", "fail", "medium", "pf-cls-lab", say("pf-cls-lab.title", { cls: vitals.cls }), good("0.1"), say("pf-cls-lab.fix"), { effort: "hours", cases: ["VIS-01"] });
    else if (vitals.cls > 0.1) add("Performance", "risk", "low", "pf-cls-lab", say("pf-cls-lab.title", { cls: vitals.cls }), good("0.1"), say("pf-cls-lab.fix"), { effort: "hours", cases: ["VIS-01"] });
    else add("Performance", "pass", "info", "pf-cls-lab", say("pf-cls-lab.pass.title"), say("pf-cls-lab.pass.evidence", { cls: vitals.cls, lab }), "", { cases: ["VIS-01"] });
  }
  if (vitals.tbt > 600) add("Performance", "risk", "low", "pf-tbt", say("pf-tbt.title", { ms: vitals.tbt }), say("pf-tbt.evidence", { ms: vitals.tbt, lab }), say("pf-tbt.fix"), { effort: "days", cases: ["PF-02"] });
  const failed = b.failed || {};
  if (failed.count) {
    const broken = (failed.samples || []).some((row) => row.type === "script" || row.type === "stylesheet" || row.status >= 500);
    add("Performance", "risk", broken ? "medium" : "low", "pf-failed", say("pf-failed.title", { n: failed.count }),
      say("listDot", { list: { items: (failed.samples || []).slice(0, 3).map((row) => say("pathNote", { path: row.url, note: row.status || row.error })) } }), say("pf-failed.fix"), { count: failed.count, effort: "minutes" });
  }
  const errors = b.console || {};
  if (errors.errors) add("Performance", "risk", "low", "pf-console", say("pf-console.title", { n: errors.errors }),
    say("listDot", { list: { items: (errors.samples || []).slice(0, 2), sep: " | " } }), say("pf-console.fix"), { count: errors.errors, effort: "hours" });

  // Security: what the browser actually requested over plain http.
  const mixed = b.mixed || {};
  if (mixed.count) add("Security", "fail", "medium", "sec-mixed-live", say("sec-mixed-live.title"), say("listDot", { list: some(mixed.samples, 3) }), say("sec-mixed-live.fix"), { count: mixed.count, effort: "minutes", cases: ["SEC-09"] });
  else if (start.status) add("Security", "pass", "info", "sec-mixed-live", say("sec-mixed-live.pass.title"), say("sec-mixed-live.pass.evidence", { n: start.requests || 0 }), "", { cases: ["SEC-09"] });
}

const FIELD_CASES = { lcp: "PF-01", inp: "PF-02", cls: "VIS-01" };
const FIELD_BANDS = { lcp: [2500, 4000], inp: [200, 500], cls: [0.1, 0.25] };
const BAND_WORDS = ["FAST", "AVERAGE", "SLOW"];
const FORMS = ["phone", "desktop"];
const TREND_EDGE = 4;
const TREND_MIN_POINTS = 8;
const TREND_CHANGE = 0.25;
const SPARK = "▁▂▃▄▅▆▇█";

const THREAT_WORDS = { MALWARE: "malware", SOCIAL_ENGINEERING: "phishing", UNWANTED_SOFTWARE: "unwanted software" };

// Safe Browsing status, the domain's registration, and how mail to the domain is protected in transit.
function domainChecks(extras, dnsInfo, dnsRead, add) {
  const end = (text) => String(text).replace(/\.*$/, ".");
  const sb = extras.safeBrowsing;
  if (sb && sb.ok) {
    const words = sb.threats.map((item) => THREAT_WORDS[item] ? say("threat." + item) : item.toLowerCase().replace(/_/g, " "));
    const threats = { items: words, join: "and" };
    if (words.length) add("Security", "fail", "critical", "sec-safebrowsing", say("sec-safebrowsing.title", { threats }),
      say("sec-safebrowsing.evidence", { url: sb.url, threats }),
      say("sec-safebrowsing.fix"), { effort: "days", cases: ["SEC-11"] });
    else add("Security", "pass", "info", "sec-safebrowsing", say("sec-safebrowsing.pass.title"), say("sec-safebrowsing.pass.evidence", { url: sb.url }), "", { cases: ["SEC-11"] });
  }
  const dom = extras.domain;
  if (dom && dom.read) {
    const registrar = dom.registrar ? String(dom.registrar).replace(/\.*$/, "") : "";
    const held = dom.registrar ? say("sec-domain.held", { domain: dom.domain, registrar: dom.registrar }) : dom.domain;
    if (dom.expires && dom.daysLeft < 0) add("Security", "fail", "high", "sec-domain-expiry", say("sec-domain-expiry.expired.title"),
      say("sec-domain-expiry.expired.evidence", { held, date: dom.expires }), say("sec-domain-expiry.expired.fix"), { effort: "minutes", cases: ["SEC-12"] });
    else if (dom.expires && dom.daysLeft < 30) add("Security", "risk", dom.daysLeft < 7 ? "high" : "medium", "sec-domain-expiry", say("sec-domain-expiry.soon.title", { n: dom.daysLeft }),
      say("sec-domain-expiry.soon.evidence", { held, date: dom.expires }), say("sec-domain-expiry.soon.fix"), { effort: "minutes", cases: ["SEC-12"] });
    else if (dom.expires) add("Security", "pass", "info", "sec-domain-expiry", say("sec-domain-expiry.pass.title", { n: dom.daysLeft }), say("sec-domain-expiry.pass.evidence", { held, date: dom.expires }), "", { cases: ["SEC-12"] });
    if (dom.locked === false) add("Security", "risk", "low", "sec-domain-lock", say("sec-domain-lock.title"),
      say("sec-domain-lock.evidence", { domain: dom.domain, status: dom.status.length ? { items: dom.status } : say("sec-domain-lock.empty") }),
      registrar ? say("sec-domain-lock.fixAt", { registrar }) : say("sec-domain-lock.fix"), { effort: "minutes", cases: ["SEC-12"] });
    else if (dom.locked) add("Security", "pass", "info", "sec-domain-lock", say("sec-domain-lock.pass.title"), say("sec-domain-lock.pass.evidence", { domain: dom.domain, status: { items: dom.status.filter((item) => /transfer/i.test(item)) } }), "", { cases: ["SEC-12"] });
  }
  if (!dnsInfo || !dnsInfo.domain || !dnsRead("mx") || !(dnsInfo.mx || []).length) return;
  const domain = dnsInfo.domain;
  if (dnsRead("mta-sts")) {
    const policy = dnsInfo.mtaStsPolicy || {};
    if (!dnsInfo.mtaSts) add("Security", "risk", "low", "sec-mta-sts", say("sec-mta-sts.none.title"),
      say("sec-mta-sts.none.evidence", { domain }), say("sec-mta-sts.none.fix"), { effort: "hours", cases: ["SEC-13"] });
    else if (!policy.mode) add("Security", "risk", "low", "sec-mta-sts", say("sec-mta-sts.unread.title"),
      say("sec-mta-sts.unread.evidence", { domain, record: dnsInfo.mtaSts, url: policy.url || say("sec-mta-sts.policyFile"), error: policy.error ? end(policy.error) : say("listDot", { list: say("noAnswer") }) }),
      say("sec-mta-sts.unread.fix", { domain }), { effort: "hours", cases: ["SEC-13"] });
    else if (policy.mode === "enforce") add("Security", "pass", "info", "sec-mta-sts", say("sec-mta-sts.pass.title"), say("sec-mta-sts.pass.evidence", { url: policy.url }), "", { cases: ["SEC-13"] });
    else add("Security", "risk", "low", "sec-mta-sts", say(policy.mode === "testing" ? "sec-mta-sts.testing.title" : "sec-mta-sts.off.title"),
      say("sec-mta-sts.weak.evidence", { url: policy.url, mode: policy.mode }), say("sec-mta-sts.weak.fix"), { effort: "minutes", cases: ["SEC-13"] });
  }
  if (dnsRead("tlsrpt")) {
    if (dnsInfo.tlsRpt) add("Security", "pass", "info", "sec-tlsrpt", say("sec-tlsrpt.pass.title"), say("listDot", { list: dnsInfo.tlsRpt.slice(0, 120) }), "", { cases: ["SEC-13"] });
    else add("Security", "risk", "low", "sec-tlsrpt", say("sec-tlsrpt.title"),
      say("sec-tlsrpt.evidence", { domain }), say("sec-tlsrpt.fix", { domain }), { effort: "minutes", cases: ["SEC-13"] });
  }
}

// Sustainable Web Design model v4: 0.3 kWh per GB across data centres, networks and devices, at the 494 g/kWh global grid average.
const CARBON_KWH_PER_GB = 0.3;
const CARBON_GRID_G_PER_KWH = 494;
const CARBON_RATINGS = [["A+", 0.04], ["A", 0.079], ["B", 0.145], ["C", 0.209], ["D", 0.278], ["E", 0.359]];

function carbonEstimate(bytes, source) {
  if (!(bytes > 0)) return null;
  const grams = (bytes / 1e9) * CARBON_KWH_PER_GB * CARBON_GRID_G_PER_KWH;
  return { bytes: Math.round(bytes), grams: Math.round(grams * 1000) / 1000, rating: (CARBON_RATINGS.find(([, max]) => grams <= max) || ["F"])[0], source };
}

function speedChecks(psi, add) {
  const field = psi.field;
  const show = (key, metric) => key === "cls" ? String(metric.p75) : key === "inp" ? metric.p75 + " ms" : (metric.p75 / 1000).toFixed(1) + " s";
  if (field) {
    const keys = ["lcp", "inp", "cls"].filter((key) => field[key]);
    const slow = keys.filter((key) => field[key].category === "SLOW");
    const average = keys.filter((key) => field[key].category === "AVERAGE");
    const evidence = say("pf-field.evidence", {
      scope: say(field.scope === "page" ? "pf-field.scope.page" : "pf-field.scope.site"),
      list: { items: keys.map((key) => say("pf-field.metric", { name: say("cwv." + key), value: show(key, field[key]), band: say("cwv." + (["FAST", "AVERAGE", "SLOW"].includes(field[key].category) ? field[key].category : "unrated")) })) }
    });
    const worst = slow.concat(average);
    const fix = worst.length ? { items: worst.map((key) => say("cwv.fix." + key)), sep: " " } : "";
    const cases = (worst.length ? worst : keys).map((key) => FIELD_CASES[key]);
    if (slow.length) add("Performance", "fail", "medium", "pf-field", say("pf-field.fail.title"), evidence, fix, { effort: "days", cases });
    else if (average.length) add("Performance", "risk", "low", "pf-field", say("pf-field.risk.title"), evidence, fix, { effort: "hours", cases });
    else add("Performance", "pass", "info", "pf-field", say("pf-field.pass.title"), evidence, "", { cases });
  } else {
    add("Performance", "person", "info", "pf-field", say("pf-field.person.title"), say("pf-field.person.evidence"), "");
  }
  const lab = psi.lab || {};
  const parts = [];
  if (lab.lcp != null) parts.push(say("pf-lighthouse.part", { name: say("cwv.lcp"), value: (lab.lcp / 1000).toFixed(1) + " s" }));
  if (lab.tbt != null) parts.push(say("pf-lighthouse.part", { name: say("cwv.tbt"), value: Math.round(lab.tbt) + " ms" }));
  if (lab.cls != null) parts.push(say("pf-lighthouse.part", { name: say("cwv.cls"), value: lab.cls }));
  if (lab.si != null) parts.push(say("pf-lighthouse.part", { name: say("cwv.si"), value: (lab.si / 1000).toFixed(1) + " s" }));
  const evidence = say("pf-lighthouse.evidence", { version: psi.version, parts: parts.length ? say("pf-lighthouse.parts", { list: { items: parts } }) : "" });
  const title = say("pf-lighthouse.title", { score: psi.score });
  const fix = say("pf-lighthouse.fix");
  if (psi.score < 50) add("Performance", "fail", "medium", "pf-lighthouse", title, evidence, fix, { effort: "days", cases: ["PF-01", "PF-02"] });
  else if (psi.score < 90) add("Performance", "risk", "low", "pf-lighthouse", title, evidence, fix, { effort: "hours", cases: ["PF-01", "PF-02"] });
  else add("Performance", "pass", "info", "pf-lighthouse", title, evidence, "", { cases: ["PF-01", "PF-02"] });
}

function fieldBand(key, value) {
  return value <= FIELD_BANDS[key][0] ? 0 : value <= FIELD_BANDS[key][1] ? 1 : 2;
}

function fieldValue(key, value) {
  return key === "cls" ? value.toFixed(2) : key === "inp" ? Math.round(value) + " ms" : (value / 1000).toFixed(1) + " s";
}

// Bars are drawn against the poor line, so a small wobble well inside good stays flat.
function sparkline(key, points) {
  const top = Math.max(FIELD_BANDS[key][1], ...points);
  return points.map((value) => SPARK[Math.min(SPARK.length - 1, Math.round((value / top) * (SPARK.length - 1)))]).join("");
}

// Compares the mean of the first and last four weekly points of one p75 series.
function fieldTrend(key, series) {
  const points = (series || []).filter((value) => typeof value === "number");
  if (points.length < TREND_MIN_POINTS) return null;
  const mean = (list) => list.reduce((sum, value) => sum + value, 0) / list.length;
  const before = mean(points.slice(0, TREND_EDGE));
  const now = mean(points.slice(-TREND_EDGE));
  const was = fieldBand(key, before);
  const is = fieldBand(key, now);
  const change = before > 0 ? (now - before) / before : now > 0 ? Infinity : 0;
  const direction = is > was || (is > 0 && change >= TREND_CHANGE) ? "worse" : is < was || (was > 0 && change <= -TREND_CHANGE) ? "better" : "steady";
  return { key, before, now, was, is, direction, spark: sparkline(key, points) };
}

function trendChecks(crux, add) {
  const rows = [];
  let from = "";
  let to = "";
  FORMS.forEach((form) => {
    const history = crux[form];
    if (!history) return;
    ["lcp", "inp", "cls"].forEach((key) => {
      const trend = fieldTrend(key, history[key]);
      if (!trend) return;
      rows.push(Object.assign(trend, { form, scope: history.scope }));
      if (history.from && (!from || history.from < from)) from = history.from;
      if (history.to > to) to = history.to;
    });
  });
  if (!rows.length) return;
  const day = (iso) => say("date", { month: say("month." + Number(iso.slice(5, 7))), day: Number(iso.slice(8, 10)), year: iso.slice(0, 4) });
  const range = from && to ? say("pf-trend.range", { from: day(from), to: day(to) }) : "";
  const line = (row) => say("pf-trend.line", {
    name: say("cwv." + row.key), form: say("pf-trend.form." + row.form), scope: say(row.scope === "page" ? "pf-trend.scope.page" : "pf-trend.scope.site"),
    before: fieldValue(row.key, row.before), now: fieldValue(row.key, row.now),
    bands: row.was === row.is ? say("cwv." + BAND_WORDS[row.is]) : say("pf-trend.bands", { from: say("cwv." + BAND_WORDS[row.was]), to: say("cwv." + BAND_WORDS[row.is]) }),
    spark: row.spark
  });
  const evidence = (list) => say("pf-trend.evidence", { range, lines: { items: list.map(line), sep: ". " } });
  const named = (list, verb) => {
    const metrics = [...new Set(list.map((row) => row.key))];
    const forms = [...new Set(list.map((row) => row.form))];
    const who = say("pf-trend.who." + (forms.length === 1 ? forms[0] : "all"));
    return metrics.length === 1 ? say("pf-trend." + verb + ".one", { metric: say("cwv." + metrics[0]), who }) : say("pf-trend." + verb + ".many", { n: metrics.length, who });
  };
  const worse = rows.filter((row) => row.direction === "worse");
  const better = rows.filter((row) => row.direction === "better");
  const cases = (list) => [...new Set(list.map((row) => FIELD_CASES[row.key]))];
  if (worse.length) {
    const poor = worse.some((row) => row.is === 2);
    add("Performance", "risk", poor ? "high" : "medium", "pf-trend", named(worse, "worse"), evidence(worse),
      say("pf-trend.fix", { fixes: { items: [...new Set(worse.map((row) => row.key))].map((key) => say("cwv.fix." + key)), sep: " " } }), { count: worse.length, effort: "days", cases: cases(worse) });
  } else {
    const steady = rows.filter((row) => row.direction === "steady");
    if (steady.length) add("Performance", "pass", "info", "pf-trend", say("pf-trend.steady.title"), evidence(steady), "", { cases: cases(steady) });
  }
  if (better.length) add("Performance", "pass", "info", "pf-trend-better", named(better, "better"), evidence(better), "", { cases: cases(better) });
}

function analyze(input) {
  const pages = input.pages || [];
  const home = pages[0] || {};
  const face = home.inspect || {};
  const extras = input.extras || {};
  const limits = input.limits || {};
  const browsed = input.browser && input.browser.ok ? input.browser : null;
  const origin = (() => { try { return new URL(home.url).origin; } catch (error) { return ""; } })();
  const host = hostOf(home.url);
  const findings = [];
  // title, evidence and fix are English strings or say() messages; messages are kept so the page can translate them.
  const add = (area, verdict, severity, key, title, evidence, fix, opts) => {
    const extra = opts || {};
    const msg = {};
    const text = (value, field) => {
      if (!value || typeof value !== "object") return value || "";
      msg[field] = value;
      return english(value);
    };
    const finding = {
      key,
      area,
      verdict,
      severity: verdict === "pass" ? "info" : severity,
      title: text(title, "title"),
      evidence: text(evidence, "evidence"),
      fix: text(fix, "fix"),
      effort: extra.effort || "hours",
      pages: (extra.pages || []).slice(0, 12),
      count: extra.count == null ? (extra.pages || []).length : extra.count,
      cases: extra.cases || []
    };
    if (Object.keys(msg).length) finding.msg = msg;
    findings.push(finding);
  };

  const read = pages.filter((page) => page.inspect && page.status >= 200 && page.status < 300 && (!page.challenge || page === home));
  const byUrl = new Map();
  pages.forEach((page) => {
    byUrl.set(normal(page.url), page);
    if (page.requested) byUrl.set(normal(page.requested), page);
  });
  const robots = parseRobotsFull(input.robotsText || "");

  // Indexability for every page that was opened.
  const indexability = pages.map((page) => {
    const f = page.inspect;
    const path = page.path || pathOf(page.url);
    if (!f) {
      const reasonMsg = page.challenge ? say("reason.botCheck", { vendor: page.challenge }) : page.error ? null : say("reason.notRead");
      return Object.assign({ path, status: page.status || 0, indexable: false, reason: page.challenge ? page.challenge + " bot check" : page.error || "Not read" }, reasonMsg ? { reasonMsg } : {});
    }
    const directives = [f.seo && f.seo.robots, f.seo && f.seo.googlebot, f.seo && f.seo.xRobots].filter(Boolean).join(", ").toLowerCase();
    const noindex = /\bnoindex\b|(^|[\s,])none([\s,]|$)/.test(directives);
    const canonical = f.seo && f.seo.canonicalAbs ? normal(f.seo.canonicalAbs) : "";
    const canonicalElsewhere = !!canonical && canonical !== normal(page.url);
    const canonicalShown = canonical ? shownAgainst(f.seo.canonicalAbs, page.url) : "";
    const googleBlocked = robots.groups.length ? !robotsVerdict("googlebot", pathOf(page.url), robots.groups).allowed : false;
    let reason = "Indexable";
    let reasonMsg = say("reason.indexable");
    if (page.status < 200 || page.status >= 300) { reason = "Status " + page.status; reasonMsg = say("reason.status", { status: page.status }); }
    else if (page.challenge) { reason = page.challenge + " bot check"; reasonMsg = say("reason.botCheck", { vendor: page.challenge }); }
    else if (noindex) { reason = "noindex"; reasonMsg = "noindex"; }
    else if (googleBlocked) { reason = "Blocked for Googlebot in robots.txt"; reasonMsg = say("reason.googlebot"); }
    else if (canonicalElsewhere) { reason = "Canonical points to " + canonicalShown; reasonMsg = say("reason.canonical", { url: canonicalShown }); }
    return {
      path,
      status: page.status,
      indexable: reason === "Indexable",
      reason,
      reasonMsg,
      canonical: canonicalShown,
      robots: directives,
      redirected: !!page.hops,
      depth: page.depth || 0
    };
  });
  const indexable = indexability.filter((row) => row.indexable);
  const indexablePaths = new Set(indexable.map((row) => row.path));

  // Link graph among the pages that were opened.
  const nodes = pages.map((page) => ({
    path: page.path || pathOf(page.url),
    status: page.status || 0,
    ms: page.ms || 0,
    depth: page.depth || 0,
    title: page.title || "",
    from: page.from || "",
    inbound: 0,
    issues: 0
  }));
  const nodeIndex = new Map(nodes.map((node, index) => [node.path, index]));
  const edges = [];
  const sources = new Map();
  pages.forEach((page, index) => {
    const links = (page.inspect && page.inspect.links) || [];
    links.forEach((link) => {
      const target = byUrl.get(normal(link));
      if (!target) return;
      const to = nodeIndex.get(target.path || pathOf(target.url));
      if (to == null || to === index) return;
      if (edges.length < 1200) edges.push({ s: index, t: to });
      nodes[to].inbound += 1;
      if (!sources.has(to)) sources.set(to, []);
      const list = sources.get(to);
      if (list.length < 6 && list.indexOf(nodes[index].path) === -1) list.push(nodes[index].path);
    });
  });

  // SEO
  const linked = pages.filter((page) => page.depth > 0);
  const blocked = linked.filter(blockedAnswer);
  const broken = pages.map((page, index) => ({ page, index })).filter(({ page }) => page.depth > 0 && page.status >= 400 && !blockedAnswer(page));
  const unanswered = pages.filter((page) => page.depth > 0 && !page.status && !page.challenge);
  if (unanswered.length) {
    add("SEO", "person", "info", "seo-unanswered-links", say("seo-unanswered-links.title", { n: unanswered.length }),
      say("seo-unanswered-links.evidence", { list: { items: unanswered.slice(0, 5).map((page) => say("pathError", { path: page.path || page.url, error: page.error || say("noAnswer") })), sep: ". " } }),
      say("seo-unanswered-links.fix"),
      { pages: unanswered.map((page) => page.path || page.url), cases: ["FN-06", "LK-01"] });
  }
  if (blocked.length) {
    add("SEO", "person", "info", "seo-blocked-links", say("seo-blocked-links.title", { n: blocked.length }),
      say("seo-blocked-links.evidence", { list: some(blocked.map((page) => say("pathNote", { path: page.path || page.url, note: blockedReasonSaid(page) })), 4) }),
      say("seo-blocked-links.fix"),
      { pages: blocked.map((page) => page.path || page.url), cases: ["FN-06", "LK-01"] });
  }
  const partialRead = linked.length >= 2 && blocked.length * 2 > linked.length;
  const warningMsgs = [];
  if (home.readInBrowser) warningMsgs.push(say(home.readInBrowser === "untagged" ? "warn.untaggedRead" : home.readInBrowser === "slow" ? "warn.slowRead" : "warn.browserRead"));
  if (home.slow) warningMsgs.push(say("warn.slowCut"));
  else if (home.cut) warningMsgs.push(say("warn.cut"));
  if (home.renderedLinks) warningMsgs.push(say("warn.shell"));
  if (home.challenge) warningMsgs.push(say("warn.challenge", { check: botCheckSaid(home.challenge) }));
  if (partialRead) warningMsgs.push(say("warn.partial", { blocked: blocked.length, linked: say("linkedPagesN", { n: linked.length }) }));
  const warnings = warningMsgs.map(english);
  if (broken.length) {
    add("SEO", "fail", "high", "seo-broken-links", say("seo-broken-links.title", { n: broken.length }),
      say("listDot", { list: { items: broken.slice(0, 5).map(({ page, index }) => say("seo-broken-links.row", {
        path: page.path || page.url,
        status: page.status || page.error || say("nothing"),
        from: sources.get(index) ? say("linkedFrom", { list: some(sources.get(index), 2) }) : ""
      })), sep: ". " } }),
      say("seo-broken-links.fix"),
      { pages: broken.map(({ page }) => page.path || page.url), effort: "hours", cases: ["FN-06", "LK-01"] });
  } else if (pages.length > 1 && !unanswered.length && !blocked.length) {
    add("SEO", "pass", "info", "seo-broken-links", say("seo-broken-links.pass.title"), say("seo-broken-links.pass.evidence", { n: pages.length - 1 }), "", { cases: ["FN-06", "LK-01"] });
  }
  const outbound = extras.outbound;
  if (outbound && (outbound.checked || outbound.httpCount)) {
    const ofKind = (kind) => (outbound.rows || []).filter((row) => row.kind === kind);
    const linkedFrom = (row) => row.from && row.from.length ? say("linkedFrom", { list: some(row.from, 2) }) : "";
    const fromPages = (list) => [...new Set([].concat.apply([], list.map((row) => row.from || [])))];
    const checked = say("seo-external.checked", { n: outbound.checked, of: outbound.found > outbound.checked ? say("seo-external.of", { found: outbound.found }) : "" });
    const dead = ofKind("broken");
    if (dead.length) add("SEO", "risk", "medium", "seo-external-links", say("seo-external-links.title", { n: dead.length }),
      say("seo-external-links.evidence", { list: { items: dead.slice(0, 5).map((row) => row.error
        ? say("seo-external.gave", { url: row.url, error: row.error, from: linkedFrom(row) })
        : say("seo-external.answered", { url: row.url, status: row.status, from: linkedFrom(row) })), sep: ". " }, checked }),
      say("seo-external-links.fix"), { pages: fromPages(dead), count: dead.length, effort: "hours" });
    else if (outbound.checked) add("SEO", "pass", "info", "seo-external-links", say("seo-external-links.pass.title"), say("seo-external-links.pass.evidence", { n: outbound.ok || 0, checked }), "");
    const moved = ofKind("moved");
    if (moved.length) add("SEO", "risk", "low", "seo-external-moved", say("seo-external-moved.title", { n: moved.length }),
      say("seo-external-moved.evidence", { list: some(moved.map((row) => say("seo-external-moved.row", { url: row.url, final: row.final || say("seo-external-moved.http"), from: linkedFrom(row) })), 4) }),
      say("seo-external-moved.fix"), { pages: fromPages(moved), count: moved.length, effort: "hours" });
    const refused = ofKind("blocked");
    if (refused.length) add("SEO", "person", "info", "seo-external-blocked", say("seo-external-blocked.title", { n: refused.length }),
      say("seo-external-blocked.evidence", { list: some(refused.map((row) => say("seo-external.answered", { url: row.url, status: row.status, from: "" })), 4) }),
      say("seo-external-blocked.fix"), { pages: fromPages(refused), count: refused.length });
    if (outbound.httpCount) add("SEO", "risk", "low", "seo-external-http", say("seo-external-http.title", { n: outbound.httpCount }),
      say("seo-external-http.evidence", { list: some((outbound.http || []).map((row) => say("urlFrom", { url: row.url, from: linkedFrom(row) })), 4) }),
      say("seo-external-http.fix"), { pages: fromPages(outbound.http || []), count: outbound.httpCount, effort: "minutes" });
  }

  const redirected = pages.filter((page) => page.depth > 0 && page.hops > 0 && !blockedAnswer(page));
  if (redirected.length) {
    add("SEO", "risk", "low", "seo-internal-redirects", say("seo-internal-redirects.title", { n: redirected.length }),
      say("seo-internal-redirects.evidence", { list: { items: redirected.slice(0, 4).map((page) => say("pathArrow", { from: pathOf(page.requested || ""), to: page.path })) } }),
      say("seo-internal-redirects.fix"), { pages: redirected.map((page) => page.path), effort: "minutes" });
  }

  if ((home.hops || 0) >= 2) {
    add("SEO", "risk", "low", "seo-redirect-chain", say("seo-redirect-chain.title", { hops: home.hops }),
      say("seo-redirect-chain.evidence", { hops: home.hops, path: home.path }),
      say("seo-redirect-chain.fix"), { effort: "minutes" });
  }

  const allNoindex = indexability.filter((row) => row.reason === "noindex");
  const fullSitemap = extras.sitemap && !extras.sitemap.partial && (extras.sitemap.urls || []).length ? new Set(extras.sitemap.urls.map(normal)) : null;
  // A noindex page with no canonical that a complete sitemap also leaves out is kept from search on purpose.
  const keptOut = (row) => !!fullSitemap && row.path !== home.path && !row.canonical && !fullSitemap.has(normal(origin + row.path));
  const noindexRows = allNoindex.filter((row) => !keptOut(row));
  const privateRows = allNoindex.filter(keptOut);
  if (noindexRows.length) {
    const homeBlocked = noindexRows.some((row) => row.path === home.path);
    const robotsNotes = (rows) => some(rows.map((row) => say("pathNote", { path: row.path, note: row.robots })), 4);
    add("SEO", homeBlocked ? "fail" : "risk", homeBlocked ? "critical" : "medium", "seo-noindex", homeBlocked ? say("seo-noindex.home.title") : say("seo-noindex.title", { n: noindexRows.length }),
      say("listDot", { list: robotsNotes(noindexRows) }),
      say("seo-noindex.fix"), { pages: noindexRows.map((row) => row.path), effort: "minutes", cases: ["SEO-04"] });
  } else if (privateRows.length) {
    add("SEO", "pass", "info", "seo-noindex", say("seo-noindex.pass.title", { n: privateRows.length }),
      say("seo-noindex.pass.evidence", { list: some(privateRows.map((row) => say("pathNote", { path: row.path, note: row.robots })), 4) }), "", { pages: privateRows.map((row) => row.path), cases: ["SEO-04"] });
  }

  const canonicalAway = indexability.filter((row) => /^Canonical points/.test(row.reason) && row.path.indexOf("?") === -1);
  if (canonicalAway.length) {
    add("SEO", "risk", "medium", "seo-canonical-away", say("seo-canonical-away.title", { n: canonicalAway.length }),
      say("seo-canonical-away.evidence", { list: some(canonicalAway.map((row) => say("pathArrow", { from: row.path, to: row.canonical })), 4) }),
      say("seo-canonical-away.fix"), { pages: canonicalAway.map((row) => row.path), effort: "minutes", cases: ["CT-02"] });
  }
  const noindexPaths = new Set(allNoindex.map((row) => row.path));
  const noCanonical = read.filter((page) => !(page.inspect.seo && page.inspect.seo.canonicalAbs) && !noindexPaths.has(page.path || pathOf(page.url)));
  if (noCanonical.length && read.length) {
    add("SEO", "risk", "low", "seo-canonical-missing", say("seo-canonical-missing.title", { n: noCanonical.length }),
      say("seo-canonical-missing.evidence", { list: some(noCanonical.map((page) => page.path), 4) }),
      say("seo-canonical-missing.fix"), { pages: noCanonical.map((page) => page.path), effort: "minutes", cases: ["CT-02"] });
  }

  const untitled = read.filter((page) => !page.inspect.title);
  if (untitled.length) {
    add("SEO", "fail", "high", "seo-title-missing", say("seo-title-missing.title", { n: untitled.length }), say("listDot", { list: some(untitled.map((page) => page.path), 4) }),
      say("seo-title-missing.fix"), { pages: untitled.map((page) => page.path), effort: "minutes", cases: ["FN-02", "FN-07"] });
  }
  else if (read.length) add("SEO", "pass", "info", "seo-title-missing", say("seo-title-missing.pass.title"), say("pagesChecked", { n: read.length }), "", { cases: ["FN-02", "FN-07"] });
  const groupBy = (getter) => {
    const map = new Map();
    read.forEach((page) => {
      if (!indexablePaths.has(page.path)) return;
      const value = getter(page);
      if (!value) return;
      if (!map.has(value)) map.set(value, { paths: [], urls: new Set() });
      const entry = map.get(value);
      entry.paths.push(page.path);
      entry.urls.add(normal(page.url));
    });
    return [...map.entries()].filter((pair) => pair[1].urls.size > 1).map(([value, entry]) => ({ value, paths: entry.paths }));
  };
  const dupTitles = groupBy((page) => page.inspect.title);
  const dupDescriptions = groupBy((page) => page.inspect.description);
  if (dupTitles.length) {
    add("SEO", "risk", "medium", "seo-duplicate-titles", say("seo-duplicate-titles.title", { n: dupTitles.length }),
      say("listDot", { list: { items: dupTitles.slice(0, 3).map((item) => say("seo-duplicate.row", { value: item.value.slice(0, 70), pages: some(item.paths, 3) })), sep: ". " } }),
      say("seo-duplicate-titles.fix"), { pages: [].concat.apply([], dupTitles.map((item) => item.paths)), effort: "hours", cases: ["FN-08"] });
  }
  const noDescription = read.filter((page) => !page.inspect.description);
  if (noDescription.length) {
    add("SEO", "risk", "medium", "seo-description-missing", say("seo-description-missing.title", { n: noDescription.length }),
      say("seo-description-missing.evidence", { list: some(noDescription.map((page) => page.path), 4) }),
      say("seo-description-missing.fix"), { pages: noDescription.map((page) => page.path), effort: "hours", cases: ["CT-01"] });
  }
  else if (read.length) add("SEO", "pass", "info", "seo-description-missing", say("seo-description-missing.pass.title"), say("pagesChecked", { n: read.length }), "", { cases: ["CT-01"] });
  if (dupDescriptions.length) {
    add("SEO", "risk", "low", "seo-duplicate-descriptions", say("seo-duplicate-descriptions.title", { n: dupDescriptions.length }),
      say("listDot", { list: { items: dupDescriptions.slice(0, 2).map((item) => say("seo-duplicate.rowCut", { value: item.value.slice(0, 70), pages: some(item.paths, 3) })), sep: ". " } }),
      say("seo-duplicate-descriptions.fix"), { pages: [].concat.apply([], dupDescriptions.map((item) => item.paths)), effort: "hours", cases: ["CT-01"] });
  }
  const longTitles = read.filter((page) => (page.inspect.title || "").length > 65);
  if (longTitles.length) {
    add("SEO", "risk", "low", "seo-title-length", say("seo-title-length.title", { n: longTitles.length }),
      say("seo-title-length.evidence", { list: some(longTitles.map((page) => say("pathNote", { path: page.path, note: page.inspect.title.length })), 4) }),
      say("seo-title-length.fix"), { pages: longTitles.map((page) => page.path), effort: "minutes" });
  }
  const thin = read.filter((page) => page.depth > 0 && indexablePaths.has(page.path) && (page.inspect.words || 0) < 150);
  if (thin.length) {
    add("SEO", "risk", "low", "seo-thin", say("seo-thin.title", { n: thin.length }),
      say("listDot", { list: some(thin.map((page) => say("pathNote", { path: page.path, note: say("wordsN", { n: page.inspect.words || 0 }) })), 4) }),
      say("seo-thin.fix"), { pages: thin.map((page) => page.path), effort: "days" });
  }

  // Sitemap compared with the crawl.
  const sitemap = extras.sitemap || {};
  const sitemapSet = new Set((sitemap.urls || []).map(normal));
  const sitemapReport = { found: !!(sitemap.urls && sitemap.urls.length), source: sitemap.source || "", count: (sitemap.urls || []).length, status: sitemap.status || 0, partial: !!sitemap.partial, notListed: [], listedNotIndexable: [], notLinked: [], offHost: 0 };
  if (sitemapReport.found) {
    sitemapReport.offHost = (sitemap.urls || []).filter((url) => hostOf(url) !== host).length;
    // A partial read cannot prove a page is absent from the rest of the sitemap.
    if (!sitemapReport.partial) sitemapReport.notListed = indexable.filter((row) => !sitemapSet.has(normal(origin + row.path))).map((row) => row.path).slice(0, 40);
    const listedRows = indexability.filter((row) => !row.indexable && sitemapSet.has(normal(origin + row.path))).slice(0, 40);
    sitemapReport.listedNotIndexable = listedRows.map((row) => row.path + " (" + row.reason + ")");
    const linked = new Set();
    pages.forEach((page) => ((page.inspect && page.inspect.links) || []).forEach((link) => linked.add(normal(link))));
    linked.add(normal(home.url));
    sitemapReport.notLinked = (sitemap.urls || []).filter((url) => hostOf(url) === host && !linked.has(normal(url))).map(pathOf).slice(0, 40);
    if (sitemapReport.listedNotIndexable.length) {
      add("SEO", "risk", "medium", "seo-sitemap-dirty", say("seo-sitemap-dirty.title", { n: listedRows.length }),
        say("listDot", { list: some(listedRows.map((row) => say("pathNote", { path: row.path, note: row.reasonMsg || row.reason })), 4) }),
        say("seo-sitemap-dirty.fix"), { pages: sitemapReport.listedNotIndexable, effort: "minutes", cases: ["SEO-03"] });
    }
    if (sitemapReport.notListed.length) {
      add("SEO", "risk", "low", "seo-sitemap-missing-pages", say("seo-sitemap-missing-pages.title", { n: sitemapReport.notListed.length }),
        say("listDot", { list: some(sitemapReport.notListed, 4) }), say("seo-sitemap-missing-pages.fix"), { pages: sitemapReport.notListed, effort: "minutes", cases: ["SEO-03"] });
    }
    if (sitemapReport.offHost) {
      const offHosts = {};
      (sitemap.urls || []).map(hostOf).filter((name) => name !== host).forEach((name) => { offHosts[name] = (offHosts[name] || 0) + 1; });
      const offRows = Object.keys(offHosts).sort((a, b) => offHosts[b] - offHosts[a]).map((name) => say("pathNote", { path: name || say("seo-sitemap-offhost.unreadable"), note: offHosts[name] }));
      add("SEO", "risk", "medium", "seo-sitemap-offhost", say("seo-sitemap-offhost.title", { n: sitemapReport.offHost }),
        say("seo-sitemap-offhost.evidence", { source: pathOf(sitemapReport.source), list: some(offRows, 3), host }), say("seo-sitemap-offhost.fix"), { count: sitemapReport.offHost, effort: "minutes", cases: ["SEO-03"] });
    }
    if (!sitemapReport.listedNotIndexable.length && !sitemapReport.notListed.length && !sitemapReport.offHost) {
      if (sitemapReport.partial) add("SEO", "pass", "info", "seo-sitemap", say("seo-sitemap.partial.title"), say("seo-sitemap.partial.evidence", { n: sitemapReport.count, source: pathOf(sitemapReport.source) }), "", { cases: ["SEO-03"] });
      else add("SEO", "pass", "info", "seo-sitemap", say("seo-sitemap.pass.title"), say("seo-sitemap.pass.evidence", { n: sitemapReport.count, source: pathOf(sitemapReport.source) }), "", { cases: ["SEO-03"] });
    }
  } else {
    add("SEO", "risk", "medium", "seo-sitemap", say("seo-sitemap.title"),
      robots.sitemaps.length ? say("seo-sitemap.named", { url: robots.sitemaps[0] }) : say("seo-sitemap.none"),
      say("seo-sitemap.fix"), { effort: "hours", cases: ["SEO-03"] });
  }

  // Language alternates.
  const hreflangIssues = [];
  read.forEach((page) => {
    const alts = (page.inspect.seo && page.inspect.seo.hreflang) || [];
    if (!alts.length || !indexablePaths.has(page.path)) return;
    const selfRef = alts.some((alt) => normal(alt.href) === normal(page.url));
    if (!selfRef) hreflangIssues.push(say("seo-hreflang.noSelf", { path: page.path }));
    alts.forEach((alt) => {
      if (!/^(x-default|[a-z]{2,3}(-[a-z]{4})?(-[a-z0-9]{2,4})?)$/i.test(alt.lang)) hreflangIssues.push(say("seo-hreflang.badCode", { path: page.path, code: alt.lang }));
      const target = byUrl.get(normal(alt.href));
      if (!target || !target.inspect || target === page || !indexablePaths.has(target.path)) return;
      const back = ((target.inspect.seo && target.inspect.seo.hreflang) || []).some((other) => normal(other.href) === normal(page.url));
      if (!back) hreflangIssues.push(say("seo-hreflang.noBack", { target: target.path, path: page.path }));
    });
  });
  if (hreflangIssues.length) {
    add("SEO", "risk", "medium", "seo-hreflang", say("seo-hreflang.title", { n: hreflangIssues.length }), say("listDot", { list: some(hreflangIssues, 3) }),
      say("seo-hreflang.fix"), { count: hreflangIssues.length, effort: "hours", cases: ["SEO-02"] });
  } else if (read.some((page) => ((page.inspect.seo && page.inspect.seo.hreflang) || []).length)) {
    add("SEO", "pass", "info", "seo-hreflang", say("seo-hreflang.pass.title"), say("seo-hreflang.pass.evidence"), "", { cases: ["SEO-02"] });
  }

  // Structured data.
  const schemaErrors = read.reduce((sum, page) => sum + ((page.inspect.schema && page.inspect.schema.errors) || 0), 0);
  const schemaGaps = [];
  const schemaTypes = new Set();
  read.forEach((page) => {
    ((page.inspect.schema && page.inspect.schema.items) || []).forEach((item) => {
      (item.types || []).forEach((type) => schemaTypes.add(type));
      (item.types || []).forEach((type) => {
        const need = REQUIRED_PROPS[type];
        if (!need) return;
        const missing = need.filter((prop) => Array.isArray(prop) ? !prop.some((one) => item.props.indexOf(one) !== -1) : item.props.indexOf(prop) === -1)
          .map((prop) => Array.isArray(prop) ? { items: prop, join: "or" } : prop);
        if (missing.length) schemaGaps.push(say("seo-schema.gap", { path: page.path, type, props: { items: missing } }));
      });
    });
  });
  if (schemaErrors) {
    const brokenOn = read.filter((page) => page.inspect.schema && page.inspect.schema.errors).map((page) => page.path);
    add("SEO", "fail", "medium", "seo-schema-parse", say("seo-schema-parse.title", { n: schemaErrors }),
      say("seo-schema-parse.evidence", { list: some(brokenOn, 4) }), say("seo-schema-parse.fix"), { pages: brokenOn, count: schemaErrors, effort: "minutes", cases: ["CT-04"] });
  }
  if (schemaGaps.length) {
    add("SEO", "risk", "medium", "seo-schema-props", say("seo-schema-props.title", { n: schemaGaps.length }),
      say("listDot", { list: some(schemaGaps, 3) }), say("seo-schema-props.fix"), { count: schemaGaps.length, effort: "hours", cases: ["CT-04"] });
  }
  if (!schemaTypes.size) {
    add("SEO", "risk", "low", "seo-schema", say("seo-schema.title"), say("seo-schema.evidence"),
      say("seo-schema.fix"), { effort: "hours", cases: ["CT-04"] });
  } else if (!schemaErrors && !schemaGaps.length) {
    add("SEO", "pass", "info", "seo-schema", say("seo-schema.pass.title"), say("seo-schema.pass.evidence", { list: some([...schemaTypes], 6) }), "", { cases: ["CT-04"] });
  }

  // Social previews.
  const social = face.social || {};
  const socialMissing = [];
  if (!social.ogTitle) socialMissing.push("og:title");
  if (!social.ogDescription) socialMissing.push("og:description");
  if (!social.ogImage) socialMissing.push("og:image");
  if (!social.ogUrl) socialMissing.push("og:url");
  if (!social.twitterCard) socialMissing.push("twitter:card");
  if (social.ogImage && !/^https:\/\//i.test(social.ogImage)) socialMissing.push(say("seo-social.httpsImage"));
  if (socialMissing.length) {
    add("SEO", "risk", socialMissing.indexOf("og:image") !== -1 ? "medium" : "low", "seo-social", say("seo-social.title", { list: some(socialMissing, 5) }),
      say("seo-social.evidence"),
      say("seo-social.fix"), { effort: "minutes", cases: ["CT-03"] });
  } else {
    add("SEO", "pass", "info", "seo-social", say("seo-social.pass.title"), say("seo-social.pass.evidence"), "", { cases: ["CT-03"] });
  }
  if (!face.icon) add("SEO", "risk", "low", "seo-favicon", say("seo-favicon.title"), say("seo-favicon.evidence"), say("seo-favicon.fix"), { effort: "minutes" });

  const soft = extras.soft404 || {};
  if (soft.status === 200) {
    add("SEO", "risk", "medium", "seo-soft-404", say("seo-soft-404.title"),
      say("seo-soft-404.evidence", { titled: soft.title ? say("seo-soft-404.titled", { title: soft.title }) : "" }),
      say("seo-soft-404.fix"), { effort: "hours", cases: ["RS-01"] });
  } else if (soft.status === 404 || soft.status === 410) {
    add("SEO", "pass", "info", "seo-soft-404", say("seo-soft-404.pass.title", { status: soft.status }), say("seo-soft-404.pass.evidence", { status: soft.status }), "", { cases: ["RS-01"] });
  }

  if (!(face.signals && face.signals.viewport)) {
    add("SEO", "fail", "high", "seo-viewport", say("seo-viewport.title"), say("seo-viewport.evidence"),
      say("seo-viewport.fix"), { effort: "minutes", cases: ["MB-01", "VIS-02"] });
  } else {
    add("SEO", "pass", "info", "seo-viewport", say("seo-viewport.pass.title"), say("seo-viewport.pass.evidence"), "", { cases: ["MB-01", "VIS-02"] });
  }

  // GEO
  const crawlers = AI_BOTS.map((bot) => {
    const verdict = robots.groups.length ? robotsVerdict(bot.token, "/", robots.groups) : { allowed: true, rule: "", named: false };
    const blockedPages = robots.groups.length ? read.filter((page) => !robotsVerdict(bot.token, pathOf(page.url), robots.groups).allowed).length : 0;
    return Object.assign({}, bot, { allowed: verdict.allowed, rule: verdict.rule, named: verdict.named, blockedPages });
  });
  const answerBlocked = crawlers.filter((bot) => bot.role !== "training" && !bot.allowed);
  const trainingBlocked = crawlers.filter((bot) => bot.role === "training" && !bot.allowed);
  const partly = crawlers.filter((bot) => bot.role !== "training" && bot.allowed && bot.blockedPages > 0);
  if (answerBlocked.length) {
    add("GEO", "fail", "high", "geo-crawlers", say("geo-crawlers.title", { n: answerBlocked.length }),
      say("geo-crawlers.evidence", { list: { items: answerBlocked.slice(0, 5).map((bot) => say("geo-crawlers.row", { token: bot.token, product: bot.product, rule: bot.rule ? say("geo-crawlers.by", { rule: bot.rule }) : "" })) } }),
      say("geo-crawlers.fix"), { cases: ["GEO-01"], count: answerBlocked.length, effort: "minutes" });
  } else {
    add("GEO", "pass", "info", "geo-crawlers", say("geo-crawlers.pass.title"),
      say(robots.groups.length ? "geo-crawlers.pass.rules" : "geo-crawlers.pass.noRules"), "", { cases: ["GEO-01"] });
  }
  if (partly.length) {
    add("GEO", "risk", "medium", "geo-crawlers-partial", say("geo-crawlers-partial.title"),
      say("listDot", { list: { items: partly.slice(0, 4).map((bot) => say("geo-crawlers-partial.row", { token: bot.token, pages: say("pagesN", { n: bot.blockedPages }) })) } }),
      say("geo-crawlers-partial.fix"), { cases: ["GEO-01"], count: partly.length, effort: "minutes" });
  }
  if (trainingBlocked.length) {
    add("GEO", "pass", "info", "geo-training", say("geo-training.title"),
      say("geo-training.evidence", { list: trainingBlocked.map((bot) => bot.token).join(", ") }), "");
  }
  const homeText = input.homeText || { text: "", chars: 0, outline: [] };
  const appShell = !!(face.signals && face.signals.appShell);
  if ((homeText.chars || 0) < 300) {
    add("GEO", "fail", "high", "geo-js-only", say("geo-js-only.title"),
      say("geo-js-only.evidence", { chars: homeText.chars || 0, shell: appShell ? say("geo-js-only.shell") : "" }),
      say("fix.serverRender"), { cases: ["GEO-03", "CMP-01"], effort: "days" });
  } else if ((homeText.chars || 0) < 900) {
    add("GEO", "risk", "medium", "geo-js-only", say("geo-js-only.risk.title"),
      say("geo-js-only.risk.evidence", { chars: homeText.chars }),
      say("geo-js-only.risk.fix"), { cases: ["GEO-03", "CMP-01"], effort: "hours" });
  } else {
    add("GEO", "pass", "info", "geo-js-only", say("geo-js-only.pass.title"), say("geo-js-only.pass.evidence", { chars: homeText.chars }), "", { cases: ["GEO-03", "CMP-01"] });
  }
  const llms = extras.llms || {};
  const llmsReport = { status: llms.status || 0, ok: false, title: "", summary: "", sections: 0, links: 0, full: !!(extras.llmsFull && extras.llmsFull.status === 200 && !extras.llmsFull.html) };
  if (llms.status === 200 && !llms.html && /^\s*#\s+\S/.test(llms.body || "")) {
    const body = llms.body || "";
    llmsReport.ok = true;
    llmsReport.title = ((body.match(/^\s*#\s+(.+)$/m) || [])[1] || "").slice(0, 120);
    llmsReport.summary = ((body.match(/^\s*>\s*(.+)$/m) || [])[1] || "").slice(0, 240);
    llmsReport.sections = (body.match(/^##\s+/gm) || []).length;
    llmsReport.links = (body.match(/\[[^\]]+\]\([^)]+\)/g) || []).length;
    llmsReport.bareLinks = (body.match(/(^|\s)https?:\/\/\S+/gm) || []).length;
    const gaps = [];
    if (!llmsReport.summary) gaps.push(say("geo-llms.gapSummary"));
    if (!llmsReport.links && !llmsReport.bareLinks) gaps.push(say("geo-llms.gapLinks"));
    else if (!llmsReport.links) gaps.push(say("geo-llms.gapMarkdown"));
    llmsReport.complete = !gaps.length;
    add("GEO", gaps.length ? "risk" : "pass", "low", "geo-llms", gaps.length ? say("geo-llms.lacks.title", { gaps: { items: gaps, join: "and" } }) : say("geo-llms.pass.title"),
      say("geo-llms.evidence", { sections: say("geo-llms.sections", { n: llmsReport.sections }), links: say("geo-llms.links", { n: llmsReport.links || llmsReport.bareLinks || 0 }), full: llmsReport.full ? say("geo-llms.full") : "." }),
      gaps.length ? say("geo-llms.lacks.fix") : "", { cases: ["GEO-02"], effort: "minutes" });
  } else if (llms.status === 200 && llms.html) {
    add("GEO", "risk", "low", "geo-llms", say("geo-llms.html.title"), say("geo-llms.html.evidence"),
      say("geo-llms.html.fix"), { cases: ["GEO-02"], effort: "minutes" });
  } else {
    add("GEO", "risk", "low", "geo-llms", say("geo-llms.title"), say("geo-llms.none.evidence", { status: llms.status || say("nothing") }),
      say("geo-llms.fix"), { cases: ["GEO-02"], effort: "minutes" });
  }
  const homeSchema = (face.schema && face.schema.items) || [];
  const allItems = [].concat.apply([], read.map((page) => (page.inspect.schema && page.inspect.schema.items) || []));
  const ENTITY = /^(\w*Organization|Corporation|LocalBusiness|Person|NGO|Store|Restaurant|ProfessionalService|OnlineBusiness)$/;
  const isEntity = (item) => (item.types || []).some((type) => ENTITY.test(type));
  const entityPage = homeSchema.some(isEntity) ? home : read.find((page) => ((page.inspect.schema && page.inspect.schema.items) || []).some(isEntity));
  const entity = entityPage ? ((entityPage.inspect.schema && entityPage.inspect.schema.items) || []).find(isEntity) : null;
  const socialLinks = face.socialLinks || [];
  if (entity) {
    const missing = ["name", "url", ["logo", "image"], "sameAs"].filter((prop) => Array.isArray(prop) ? !prop.some((one) => entity.props.indexOf(one) !== -1) : entity.props.indexOf(prop) === -1)
      .map((prop) => Array.isArray(prop) ? { items: prop, join: "or" } : prop);
    const unlisted = socialLinks.filter((link) => (entity.sameAs || []).map(normal).indexOf(normal(link)) === -1);
    const type = entity.types[0];
    if (missing.length || unlisted.length) {
      add("GEO", "pass", "info", "geo-entity-present", say("geo-entity-present.title", { type }), say("geo-entity-present.evidence", { path: pathOf(entityPage.url) }), "", { cases: ["GEO-04"] });
      add("GEO", "risk", "low", "geo-entity", say("geo-entity.title", { type }),
        say("geo-entity.evidence", {
          lacks: missing.length ? say("geo-entity.lacks", { props: { items: missing } }) : "",
          unlisted: unlisted.length ? say("geo-entity.unlisted", { n: unlisted.length, hosts: some(unlisted.map(hostOf), 3) }) : ""
        }),
        say("geo-entity.fix"), { effort: "minutes" });
    } else {
      add("GEO", "pass", "info", "geo-entity", say("geo-entity.pass.title", { type }), say("geo-entity.pass.evidence"), "", { cases: ["GEO-04"] });
    }
  } else {
    add("GEO", "risk", "medium", "geo-entity", say("geo-entity.none.title"),
      say("geo-entity.none.evidence", { profiles: socialLinks.length ? say("geo-entity.profiles", { n: socialLinks.length }) : "" }),
      say("geo-entity.none.fix"), { cases: ["GEO-04"], effort: "minutes" });
  }
  const questionHeads = read.reduce((sum, page) => sum + (page.inspect.questionHeadings || 0), 0);
  const answerPage = read.find((page) => (page.inspect.questionHeadings || 0) > 0 || ((page.inspect.schema && page.inspect.schema.items) || []).some((item) => (item.types || []).some((type) => /^(FAQPage|QAPage)$/.test(type))));
  const faq = schemaTypes.has("FAQPage") || schemaTypes.has("QAPage") || schemaTypes.has("HowTo");
  if (questionHeads || faq) {
    add("GEO", "pass", "info", "geo-answers", say("geo-answers.pass.title"),
      say("geo-answers.pass.evidence", { faq: faq ? say("geo-answers.faq") : "", heads: questionHeads ? say("geo-answers.heads", { n: questionHeads }) : "" }), "", { cases: ["GEO-05"] });
  } else {
    add("GEO", "risk", "low", "geo-answers", say("geo-answers.title"),
      say("geo-answers.evidence"),
      say("geo-answers.fix"), { cases: ["GEO-05"], effort: "hours" });
  }
  const itemsOf = (page) => (page.inspect.schema && page.inspect.schema.items) || [];
  const datedPage = read.find((page) => page.inspect.dated || itemsOf(page).some((item) => item.props.indexOf("dateModified") !== -1 || item.props.indexOf("datePublished") !== -1));
  const dated = !!datedPage;
  const authored = read.some((page) => page.inspect.author) || allItems.some((item) => item.props.indexOf("author") !== -1);
  if (!dated || !authored) {
    if (dated) add("GEO", "pass", "info", "geo-dated", say("geo-dated.title"), say("geo-dated.evidence", { path: pathOf(datedPage.url) }), "", { cases: ["GEO-06"] });
    add("GEO", "risk", "low", "geo-trust", say("geo-trust.title", { what: { items: [!authored ? say("geo-trust.who") : "", !dated ? say("geo-trust.when") : ""].filter(Boolean), join: "or" } }),
      say("geo-trust.evidence"),
      say("geo-trust.fix"), { cases: dated ? [] : ["GEO-06"], effort: "hours" });
  } else {
    add("GEO", "pass", "info", "geo-trust", say("geo-trust.pass.title"), say("geo-trust.pass.evidence"), "", { cases: ["GEO-06"] });
  }
  const noai = read.filter((page) => /noai|noimageai/i.test([page.inspect.seo && page.inspect.seo.robots, page.inspect.seo && page.inspect.seo.xRobots].join(",")));
  if (noai.length) {
    add("GEO", "pass", "info", "geo-noai", say("geo-noai.title", { n: noai.length }), say("geo-noai.evidence", { list: some(noai.map((page) => page.path), 3) }), "");
  }

  // Analytics
  const tagPages = {};
  const tagIds = {};
  read.forEach((page) => {
    ((page.inspect.analytics && page.inspect.analytics.tags) || []).forEach((tag) => {
      if (!tagPages[tag.name]) tagPages[tag.name] = [];
      if (tagPages[tag.name].indexOf(page.path) === -1) tagPages[tag.name].push(page.path);
      if (!tagIds[tag.name]) tagIds[tag.name] = [];
      (tag.ids || []).forEach((id) => { if (tagIds[tag.name].indexOf(id) === -1 && tagIds[tag.name].length < 6) tagIds[tag.name].push(id); });
    });
  });
  const tags = Object.keys(tagPages).map((name) => ({ name, ids: tagIds[name] || [], pages: tagPages[name].length, cookieless: COOKIELESS.indexOf(name) !== -1 }));
  const consentTools = [];
  let consentMode = null;
  read.forEach((page) => {
    const a = page.inspect.analytics || {};
    (a.consent || []).forEach((name) => { if (consentTools.indexOf(name) === -1) consentTools.push(name); });
    if (a.consentMode && !consentMode) consentMode = a.consentMode;
  });
  const tracking = tags.filter((tag) => !tag.cookieless);
  const googleTags = tags.filter((tag) => /^Google/.test(tag.name));
  const deniedPings = ((browsed && browsed.consent && browsed.consent.before && browsed.consent.before.vendors) || []).filter((row) => /^Google/.test(row.name) && row.denied > 0).map((row) => row.name);
  const homeTags = new Set(((face.analytics && face.analytics.tags) || []).map((tag) => tag.name));
  const untagged = homeTags.size ? read.filter((page) => !((page.inspect.analytics && page.inspect.analytics.tags) || []).length && !(page.inspect.analytics && page.inspect.analytics.loader)).map((page) => page.path) : [];
  const tools = { items: consentTools };
  if (!tags.length && consentTools.length) {
    if (!browsed) add("Analytics", "person", "info", "an-none", say("an-none.script.title"), say("an-none.script.evidence", { tools }), "", { cases: ["AN-01"] });
  } else if (!tags.length) {
    add("Analytics", "risk", "low", "an-none", say("an-none.title"), say("an-none.evidence"),
      say("an-none.fix"), { effort: "hours", cases: ["AN-01"] });
  } else {
    add("Analytics", "pass", "info", "an-inventory", say("an-inventory.title", { n: tags.length }), say("listDot", { list: { items: tags.map((tag) => tag.ids.length ? say("pathNote", { path: tag.name, note: { items: tag.ids } }) : tag.name) } }), "");
  }
  if (untagged.length) {
    add("Analytics", "risk", "medium", "an-gaps", say("an-gaps.title", { n: untagged.length }),
      say("an-gaps.evidence", { list: some(untagged, 4) }), say("an-gaps.fix"), { pages: untagged, effort: "minutes" });
  }
  const multiGa = read.filter((page) => ((page.inspect.analytics && page.inspect.analytics.ga4) || []).length > 1);
  const doubleLoad = read.filter((page) => (page.inspect.analytics && page.inspect.analytics.gtagLoads) > 1);
  if (multiGa.length || doubleLoad.length) {
    add("Analytics", "risk", "medium", "an-duplicate", say("an-duplicate.title"),
      say("an-duplicate.evidence", { multi: multiGa.length ? say("an-duplicate.multi", { n: multiGa.length }) : "", double: doubleLoad.length ? say("an-duplicate.double", { n: doubleLoad.length }) : "" }),
      say("an-duplicate.fix"), { pages: multiGa.concat(doubleLoad).map((page) => page.path), effort: "minutes" });
  }
  if (tagPages["Google Tag Manager"] && tagPages["Google Analytics 4"]) {
    add("Analytics", "risk", "low", "an-gtm-and-gtag", say("an-gtm-and-gtag.title"),
      say("an-gtm-and-gtag.evidence"), say("an-gtm-and-gtag.fix"), { effort: "minutes" });
  }
  if (tagPages["Universal Analytics"]) {
    add("Analytics", "risk", "low", "an-ua", say("an-ua.title"), say("an-ua.evidence"),
      say("an-ua.fix"), { pages: tagPages["Universal Analytics"], effort: "minutes" });
  }
  if (tracking.length && !consentTools.length && !consentMode) {
    add("Analytics", "risk", "high", "an-consent", say("an-consent.title"),
      say("an-consent.evidence", { n: tracking.length, list: { items: tracking.map((tag) => tag.name) } }),
      say("an-consent.fix"), { effort: "hours", cases: ["PR-03", "AN-01"] });
  } else if (googleTags.length && consentTools.length && !consentMode && deniedPings.length) {
    add("Analytics", "pass", "info", "an-consent-mode", say("an-consent-mode.runtime.title"),
      say("an-consent-mode.runtime.evidence", { pings: { items: deniedPings }, tools }), "", { cases: ["PR-03", "AN-01"] });
  } else if (googleTags.length && consentTools.length && !consentMode) {
    add("Analytics", "risk", "medium", "an-consent-mode", say("an-consent-mode.missing.title", { tools }),
      say("an-consent-mode.missing.evidence", { why: say(browsed && browsed.consent ? "an-consent-mode.missing.browsed" : "an-consent-mode.missing.raw") }),
      say("an-consent-mode.missing.fix"), { effort: "minutes", cases: ["PR-03", "AN-01"] });
  } else if (consentMode) {
    const v2 = consentMode.v2;
    const regions = consentMode.regions || [];
    const denied = consentMode.analytics === "denied" || regions.length > 0;
    const where = regions.length ? say("an-consent-mode.where", { n: regions.length }) : "";
    const value = consentMode.analytics || say("an-consent-mode.unset");
    add("Analytics", denied && v2 ? "pass" : "risk", denied ? "low" : "medium", "an-consent-mode",
      denied ? say(v2 ? "an-consent-mode.v2.title" : "an-consent-mode.v1.title", { where }) : say("an-consent-mode.granted.title"),
      regions.length
        ? say("an-consent-mode.regions", { regions: some(regions, 8), value, v2: v2 ? say("an-consent-mode.regions.v2") : "" })
        : say(v2 ? "an-consent-mode.plain.v2" : "an-consent-mode.plain", { value }),
      denied && v2 ? "" : say("an-consent-mode.fix"), { effort: "minutes", cases: ["PR-03", "AN-01"] });
  } else if (consentTools.length) {
    add("Analytics", "pass", "info", "an-consent", say("an-consent.pass.title"), say("an-consent.pass.evidence", { tools }), "", { cases: ["PR-03"] });
  }
  if (tracking.length && !browsed) {
    add("Analytics", "person", "info", "an-firing", say("an-firing.person.title"),
      say("an-firing.person.evidence"), "", { cases: ["AN-01"] });
  }
  const utm = extras.utm || null;
  if (utm && utm.status) {
    if (utm.kept) add("Analytics", "pass", "info", "an-utm", say("an-utm.pass.title"), say("an-utm.pass.evidence", { path: pathOf(utm.finalUrl) }), "");
    else add("Analytics", "fail", "medium", "an-utm", say("an-utm.title"),
      say("an-utm.evidence", { path: pathOf(utm.finalUrl) }),
      say("an-utm.fix"), { effort: "minutes" });
  }
  const pii = read.filter((page) => (page.inspect.piiLinks || 0) > 0);
  if (pii.length) {
    add("Analytics", "fail", "high", "an-pii", say("an-pii.title"),
      say("an-pii.evidence", { links: say("an-pii.links", { n: pii.reduce((sum, page) => sum + page.inspect.piiLinks, 0) }), pages: some(pii.map((page) => page.path), 3) }),
      say("an-pii.fix"), { pages: pii.map((page) => page.path), effort: "hours" });
  }

  legalChecks({ read, browsed, face, origin, home, tags }, add);

  // Security
  libraryChecks({ read, browsed, origin }, add);
  const hdr = face.headers || {};
  const rawHeaders = face.rawHeaders || {};
  const headerRows = read.map((page) => {
    const h = page.inspect.headers || {};
    const r = page.inspect.rawHeaders || {};
    const jar = page.inspect.cookies || [];
    return {
      path: page.path,
      hsts: !!h.hsts,
      csp: !!h.csp,
      frame: framesGuarded(h.frame) || /frame-ancestors/i.test(h.csp || ""),
      nosniff: !!h.nosniff,
      referrer: !!h.referrer,
      permissions: !!r.permissions,
      coop: !!h.coop,
      cookies: jar.length,
      looseCookies: jar.filter((cookie) => !cookie.secure).length
    };
  });
  const spread = (key) => {
    const missing = headerRows.filter((row) => !row[key]);
    const text = headerRows.length < 2 ? "" : missing.length === headerRows.length ? say("sec-spread.all", { n: headerRows.length }) : say("sec-spread.some", { missing: missing.length, n: headerRows.length });
    return { text, pages: missing.map((row) => row.path) };
  };
  const HEADER_LABEL = { hsts: "HSTS", csp: "Content-Security-Policy", frame: "frame protection", nosniff: "X-Content-Type-Options", referrer: "Referrer-Policy", permissions: "Permissions-Policy", coop: "Cross-Origin-Opener-Policy" };
  const uneven = Object.keys(HEADER_LABEL).map((key) => {
    const missing = headerRows.filter((row) => !row[key]);
    return { key, missing, homeHas: headerRows.length ? headerRows[0][key] : false };
  }).filter((item) => item.homeHas && item.missing.length);
  if (uneven.length) {
    const lacking = [...new Set([].concat.apply([], uneven.map((item) => item.missing.map((row) => row.path))))];
    add("Security", "risk", "medium", "sec-headers-uneven", say("sec-headers-uneven.title"),
      say("sec-headers-uneven.evidence", { list: { items: uneven.map((item) => say("sec-headers-uneven.row", { label: item.key === "frame" ? say("sec-headers.frame") : HEADER_LABEL[item.key], n: item.missing.length })) }, n: headerRows.length }),
      say("sec-headers-uneven.fix"), { pages: lacking, count: lacking.length, effort: "minutes", cases: ["SEC-02", "SEC-03", "SEC-04"] });
  }
  const httpCheck = extras.httpRedirect || null;
  if (httpCheck) {
    const hops = httpCheck.statuses && httpCheck.statuses.length ? httpCheck.statuses : [httpCheck.status];
    const answered = say("sec-http.answered", { hops: { items: hops, sep: " → " }, location: httpCheck.location });
    if (httpCheck.error) add("Security", "pass", "info", "sec-http", say("sec-http.closed.title"), say("sec-http.closed.evidence"), "", { cases: ["SEC-01"] });
    else if (hops.every((code) => [301, 308].indexOf(code) !== -1) && /^https:/i.test(httpCheck.location || "")) add("Security", "pass", "info", "sec-http", say("sec-http.pass.title"), answered, "", { cases: ["SEC-01"] });
    else if (hops.every((code) => [301, 302, 303, 307, 308].indexOf(code) !== -1) && /^https:/i.test(httpCheck.location || "")) add("Security", "risk", "low", "sec-http", say("sec-http.temporary.title"), say("sec-http.temporary.evidence", { answered }), say("sec-http.temporary.fix"), { effort: "minutes", cases: ["SEC-01"] });
    else add("Security", "fail", "high", "sec-http", say("sec-http.title"), say("sec-http.evidence", { status: httpCheck.status, to: httpCheck.location ? say("sec-http.to", { location: httpCheck.location }) : "" }), say("sec-http.fix"), { effort: "minutes", cases: ["SEC-01"] });
  }
  if (!hdr.hsts) add("Security", "fail", "medium", "sec-hsts", say("sec-hsts.title"), say("sec-hsts.evidence", { spread: spread("hsts").text }), say("sec-hsts.fix"), { pages: spread("hsts").pages, effort: "minutes", cases: ["SEC-02"] });
  else {
    const age = Number((String(hdr.hsts).match(/max-age\s*=\s*(\d+)/i) || [])[1] || 0);
    if (age < 15552000) add("Security", "risk", "low", "sec-hsts", say("sec-hsts.short.title"), say("sec-hsts.short.evidence", { age }), say("sec-hsts.short.fix"), { effort: "minutes", cases: ["SEC-02"] });
    else add("Security", "pass", "info", "sec-hsts", say("sec-hsts.pass.title"), say("listDot", { list: hdr.hsts }), "", { cases: ["SEC-02"] });
  }
  const csp = cspDirectives(hdr.csp);
  if (!hdr.csp) {
    add("Security", "risk", "medium", "sec-csp", say("sec-csp.title"), say("sec-csp.evidence", { spread: spread("csp").text }),
      say("sec-csp.fix"), { pages: spread("csp").pages, effort: "hours", cases: ["SEC-03"] });
  } else {
    const scriptSrc = csp["script-src"] || csp["default-src"] || [];
    const issues = [];
    if (!csp["default-src"] && !csp["script-src"]) issues.push("noDefault");
    if (scriptSrc.indexOf("'unsafe-inline'") !== -1 && !scriptSrc.some((token) => /^'(nonce|sha256|sha384|sha512)-/.test(token) || token === "'strict-dynamic'")) issues.push("unsafeInline");
    if (scriptSrc.indexOf("'unsafe-eval'") !== -1) issues.push("unsafeEval");
    if (scriptSrc.indexOf("*") !== -1 || scriptSrc.indexOf("https:") !== -1) issues.push("anyHost");
    if (!csp["object-src"] && !(csp["default-src"] || []).some((token) => token === "'none'")) issues.push("object");
    if (!csp["base-uri"]) issues.push("base");
    if (issues.length) add("Security", "risk", issues.some((issue) => issue === "anyHost" || issue === "unsafeInline") ? "medium" : "low", "sec-csp", say("sec-csp.gaps.title"), say("listDot", { list: some(issues.map((issue) => say("sec-csp.issue." + issue)), 5) }),
      say("sec-csp.gaps.fix"), { count: issues.length, effort: "hours", cases: ["SEC-03"] });
    else add("Security", "pass", "info", "sec-csp", say("sec-csp.pass.title"), say("sec-csp.pass.evidence"), "", { cases: ["SEC-03"] });
  }
  const allowFrom = hdr.frame && !framesGuarded(hdr.frame) ? say("sec-frame.allowFrom", { value: hdr.frame }) : "";
  if (!framesGuarded(hdr.frame) && !csp["frame-ancestors"]) add("Security", "risk", "medium", "sec-frame", say("sec-frame.title"), allowFrom ? say("sec-frame.evidenceAllow", { allowFrom, spread: spread("frame").text }) : say("sec-frame.evidence", { spread: spread("frame").text }), say(allowFrom ? "sec-frame.fixAllow" : "sec-frame.fix"), { pages: spread("frame").pages, effort: "minutes", cases: ["SEC-04"] });
  else add("Security", "pass", "info", "sec-frame", say("sec-frame.pass.title"), say("sec-frame.pass.evidence", { value: framesGuarded(hdr.frame) ? "X-Frame-Options: " + hdr.frame : "frame-ancestors " + csp["frame-ancestors"].join(" "), allow: allowFrom ? say("sec-frame.allowAfter", { allowFrom }) : "" }), "", { cases: ["SEC-04"] });
  if (!hdr.nosniff) add("Security", "risk", "low", "sec-nosniff", say("sec-nosniff.title"), say("sec-nosniff.evidence", { spread: spread("nosniff").text }), say("sec-nosniff.fix"), { pages: spread("nosniff").pages, effort: "minutes", cases: ["SEC-04"] });
  if (!hdr.referrer) add("Security", "risk", "low", "sec-referrer", say("sec-referrer.title"), say("sec-referrer.evidence", { spread: spread("referrer").text }), say("sec-referrer.fix"), { pages: spread("referrer").pages, effort: "minutes", cases: ["SEC-05"] });
  if (!rawHeaders.permissions) add("Security", "risk", "low", "sec-permissions", say("sec-permissions.title"), say("sec-permissions.evidence", { spread: spread("permissions").text }), say("sec-permissions.fix"), { pages: spread("permissions").pages, effort: "minutes", cases: ["SEC-08"] });
  const coop = policyOf(hdr.coop);
  const coep = policyOf(hdr.coep);
  if (COOP_GUARDED.indexOf(coop) !== -1) add("Security", "pass", "info", "sec-coop", say("sec-coop.pass.title"), say("sec-coop.pass.evidence", { value: hdr.coop }), "", { cases: ["SEC-16"] });
  else add("Security", "risk", "low", "sec-coop", coop ? say("sec-coop.is.title", { value: coop }) : say("sec-coop.title"),
    say("sec-coop.evidence", { spread: spread("coop").text }),
    say("sec-coop.fix"), { pages: spread("coop").pages, effort: "minutes", cases: ["SEC-16"] });
  const isolatedNow = browsed && browsed.backForward && browsed.backForward.ran ? browsed.backForward.isolated : null;
  const absent = say("sec-isolation.absent");
  const isolationFacts = say("sec-isolation.facts", { coop: hdr.coop || absent, coep: hdr.coep || absent, corp: hdr.corp || absent, browser: isolatedNow == null ? "" : say("sec-isolation.browser", { value: String(isolatedNow) }) });
  if (ISOLATING_COEP.indexOf(coep) !== -1 && coop !== "same-origin") {
    add("Security", "fail", "medium", "sec-isolation", say("sec-isolation.title"),
      say("sec-isolation.evidence", { facts: isolationFacts }),
      say("sec-isolation.fix"), { effort: "minutes", cases: ["SEC-16"] });
  } else if (ISOLATING_COEP.indexOf(coep) !== -1) add("Security", "pass", "info", "sec-isolation", say("sec-isolation.pass.title"), isolationFacts, "", { cases: ["SEC-16"] });
  else add("Security", "pass", "info", "sec-isolation", say("sec-isolation.none.title"), say("sec-isolation.none.evidence", { facts: isolationFacts }), "", { cases: ["SEC-16"] });
  const cookieNames = (list) => [...new Set(list.map((cookie) => cookie.name))];
  const jar = [].concat.apply([], read.map((page) => (page.inspect.cookies || []).map((cookie) => Object.assign({ path: page.path }, cookie))));
  const insecure = cookieNames(jar.filter((cookie) => !cookie.secure));
  const exposedSession = cookieNames(jar.filter((cookie) => !cookie.httpOnly && /sess|sid$|^sid|auth|token|login|jwt|csrf/i.test(cookie.name)));
  const cookiePages = [...new Set(jar.filter((cookie) => !cookie.secure || (!cookie.httpOnly && /sess|sid$|^sid|auth|token|login|jwt|csrf/i.test(cookie.name))).map((cookie) => cookie.path))];
  if (insecure.length || exposedSession.length) {
    const titleBits = {
      insecure: insecure.length ? say("sec-cookies.insecure", { n: insecure.length }) : "",
      exposed: exposedSession.length ? say("sec-cookies.exposed", { n: exposedSession.length }) : ""
    };
    add("Security", "risk", exposedSession.length ? "high" : "medium", "sec-cookies",
      titleBits.insecure && titleBits.exposed ? say("sec-cookies.both", titleBits) : titleBits.insecure || titleBits.exposed,
      say("sec-cookies.evidence", {
        secure: insecure.length ? say("sec-cookies.withoutSecure", { list: some(insecure, 4) }) : "",
        httpOnly: exposedSession.length ? say("sec-cookies.withoutHttpOnly", { list: some(exposedSession, 4) }) : "",
        pages: some(cookiePages, 3)
      }),
      say("sec-cookies.fix"), { pages: cookiePages, count: insecure.length + exposedSession.length, effort: "minutes", cases: ["SEC-06"] });
  } else if (jar.length) {
    add("Security", "pass", "info", "sec-cookies", say("sec-cookies.pass.title"), say("sec-cookies.pass.evidence", { cookies: say("sec-cookies.count", { n: cookieNames(jar).length }), pages: say("pagesN", { n: new Set(jar.map((cookie) => cookie.path)).size }) }), "", { cases: ["SEC-06"] });
  }
  const version = [hdr.server, rawHeaders.poweredBy].filter((value) => /\d+\.\d+/.test(value || ""));
  if (version.length) add("Security", "risk", "low", "sec-version", say("sec-version.title"), say("sec-version.evidence", { list: { items: version } }), say("sec-version.fix"), { effort: "minutes", cases: ["SEC-07"] });
  const noSri = [];
  read.forEach((page) => ((page.inspect.sri && page.inspect.sri.missing) || []).forEach((h) => { if (!NO_SRI_HOSTS.test(h) && noSri.indexOf(h) === -1) noSri.push(h); }));
  if (noSri.length) add("Security", "risk", "low", "sec-sri", say("sec-sri.title", { n: noSri.length }), say("sec-sri.evidence", { list: some(noSri, 4) }), say("sec-sri.fix"), { count: noSri.length, effort: "minutes" });
  const mixed = read.filter((page) => (page.inspect.signals && page.inspect.signals.mixed) > 0);
  if (mixed.length) add("Security", "risk", "medium", "sec-mixed", say("sec-mixed.title", { n: mixed.length }), say("listDot", { list: some(mixed.map((page) => say("pathNote", { path: page.path, note: page.inspect.signals.mixed })), 3) }), say("sec-mixed.fix"), { pages: mixed.map((page) => page.path), effort: "minutes", cases: ["SEC-09"] });
  const tls = extras.tls || null;
  if (tls && tls.validTo) {
    const days = tls.daysLeft;
    const valid = say("sec-tls.valid", { date: tls.validTo, issuer: tls.issuer ? say("sec-tls.issuer", { issuer: tls.issuer }) : "" });
    if (days < 0) add("Security", "fail", "critical", "sec-tls", say("sec-tls.expired.title"), say("sec-tls.expired.evidence", { date: tls.validTo }), say("sec-tls.expired.fix"), { effort: "minutes" });
    else if (days < 14) add("Security", "fail", "high", "sec-tls", say("sec-tls.expires.title", { n: days }), valid, say("sec-tls.urgent.fix"), { effort: "minutes" });
    else if (days < 30) add("Security", "risk", "medium", "sec-tls", say("sec-tls.expires.title", { n: days }), valid, say("sec-tls.soon.fix"), { effort: "minutes" });
    else add("Security", "pass", "info", "sec-tls", say("sec-tls.pass.title", { n: days }), valid, "");
  }
  if (tls && tls.missingIntermediate) {
    add("Security", "risk", "medium", "sec-tls-chain", say("sec-tls-chain.title"),
      say("sec-tls-chain.evidence", { name: tls.missingIntermediate }),
      say("sec-tls-chain.fix"), { effort: "minutes" });
  }
  const sec = extras.securityTxt || null;
  if (sec) {
    if (sec.status === 200 && !sec.html && /contact\s*:/i.test(sec.body || "")) {
      const expires = ((sec.body || "").match(/^\s*expires\s*:\s*(.+)$/im) || [])[1];
      const past = expires && !isNaN(Date.parse(expires)) && Date.parse(expires) < Date.now();
      if (past) add("Security", "risk", "medium", "sec-securitytxt", say("sec-securitytxt.expired.title"), say("sec-securitytxt.expired.evidence", { date: expires.trim() }), say("sec-securitytxt.expired.fix"), { effort: "minutes" });
      else add("Security", "pass", "info", "sec-securitytxt", say("sec-securitytxt.pass.title"), say("sec-securitytxt.pass.evidence"), "");
    } else {
      const answer = sec.status === 200 && sec.html ? say("sec-securitytxt.html") : say("sec-securitytxt.returned", { status: sec.status || say("nothing") });
      add("Security", "risk", "low", "sec-securitytxt", say("sec-securitytxt.title"), say("sec-securitytxt.evidence", { answer }), say("sec-securitytxt.fix"), { effort: "minutes" });
    }
  }
  const dnsInfo = extras.dns || null;
  const dnsRead = (name) => !!(dnsInfo && dnsInfo.domain) && !(dnsInfo.unread || []).includes(name);
  if (dnsInfo && dnsInfo.domain) {
    const sendsMail = (dnsInfo.mx || []).length > 0;
    const unread = dnsInfo.unread || [];
    // A lookup that timed out says nothing about the record, so it gets no finding either way.
    const mailRead = dnsRead("spf") && dnsRead("mx");
    const domain = dnsInfo.domain;
    if (mailRead && sendsMail && !dnsInfo.spf) add("Security", "risk", "medium", "sec-spf", say("sec-spf.missing.title"), say("sec-spf.missing.evidence", { domain }), say("sec-spf.missing.fix"), { effort: "minutes" });
    if (mailRead && !sendsMail && !dnsInfo.spf) {
      if (dnsInfo.nullMx && /p\s*=\s*(reject|quarantine)/i.test(dnsInfo.dmarc || "")) add("Security", "pass", "info", "sec-spf", say("sec-spf.nullOk.title"), say("sec-spf.nullOk.evidence", { domain }), "");
      else if (dnsInfo.nullMx) add("Security", "risk", "low", "sec-spf", say("sec-spf.nullNoSpf.title"), say("sec-spf.nullNoSpf.evidence", { domain }), say("sec-spf.nullNoSpf.fix"), { effort: "minutes" });
      else add("Security", "risk", "low", "sec-spf", say("sec-spf.none.title"), say("sec-spf.none.evidence", { domain }), say("sec-spf.none.fix"), { effort: "minutes" });
    }
    if (!dnsInfo.dmarc && !unread.includes("dmarc")) add("Security", "risk", sendsMail ? "medium" : "low", "sec-dmarc", say("sec-dmarc.title"), say("sec-dmarc.evidence", { domain }), say("sec-dmarc.fix"), { effort: "minutes" });
    else if (/p\s*=\s*none/i.test(dnsInfo.dmarc)) add("Security", "risk", "low", "sec-dmarc", say("sec-dmarc.monitor.title"), say("sec-dmarc.monitor.evidence"), say("sec-dmarc.monitor.fix"), { effort: "hours" });
    else if (dnsInfo.dmarc) add("Security", "pass", "info", "sec-dmarc", say("sec-dmarc.pass.title"), say("listDot", { list: dnsInfo.dmarc.slice(0, 120) }), "");
    if (dnsInfo.spf && sendsMail) add("Security", "pass", "info", "sec-spf", say("sec-spf.pass.title"), say("listDot", { list: dnsInfo.spf.slice(0, 120) }), "");
    if (!(dnsInfo.caa || []).length && !unread.includes("caa")) add("Security", "risk", "low", "sec-caa", say("sec-caa.title"), say("sec-caa.evidence", { domain }), say("sec-caa.fix"), { effort: "minutes" });
    if (dnsInfo.bimi) add("Security", "pass", "info", "sec-bimi", say("sec-bimi.pass.title"), say("listDot", { list: dnsInfo.bimi.slice(0, 160) }), "");
  }
  domainChecks(extras, dnsInfo, dnsRead, add);
  (input.alerts || []).filter((alert) => alert.level === "Leak").forEach((alert, index) => {
    add("Security", "fail", "critical", "sec-leak-" + index, alert.title, alert.detail, say("sec-leak.fix"), { effort: "hours" });
  });

  // Accessibility
  const altPages = read.filter((page) => (page.inspect.missingAlt || 0) > 0);
  const altCount = altPages.reduce((sum, page) => sum + page.inspect.missingAlt, 0);
  const on = (list, max) => say("a11y.on", { pages: some(list.map((page) => page.path), max) });
  if (altCount) add("Accessibility", "risk", "medium", "a11y-alt", say("a11y-alt.title", { n: altCount }), on(altPages, 4), say("ax-fix.image-alt"), { pages: altPages.map((page) => page.path), count: altCount, effort: "hours", cases: ["A11Y-01"] });
  else if (read.some((page) => page.inspect.images)) add("Accessibility", "pass", "info", "a11y-alt", say("a11y-alt.pass.title"), say("a11y-alt.pass.evidence"), "", { cases: ["A11Y-01"] });
  const unlabeledPages = read.filter((page) => (page.inspect.unlabeled || 0) > 0);
  if (unlabeledPages.length) add("Accessibility", "fail", "medium", "a11y-labels", say("a11y-labels.title", { n: unlabeledPages.reduce((sum, page) => sum + page.inspect.unlabeled, 0) }), say("a11y-labels.evidence", { pages: some(unlabeledPages.map((page) => page.path), 4) }), say("ax-fix.label"), { pages: unlabeledPages.map((page) => page.path), effort: "minutes", cases: ["FM-01"] });
  const LANG_NAMES = ["en", "es", "pt", "fr", "de", "it"];
  const declared = String(face.lang || "").toLowerCase().split("-")[0];
  if (!face.lang) add("Accessibility", "fail", "medium", "a11y-lang", say("a11y-lang.title"), say("a11y-lang.evidence"), say("a11y-lang.fix"), { effort: "minutes", cases: ["FN-04", "I18N-01"] });
  else if (LANG_NAMES.includes(declared) && LANG_NAMES.includes(face.textLang) && face.textLang !== declared) add("Accessibility", "risk", "medium", "a11y-lang", say("a11y-lang.mismatch.title"),
    say("a11y-lang.mismatch.evidence", { lang: face.lang, declared: say("lang." + declared), actual: say("lang." + face.textLang) }),
    say("a11y-lang.mismatch.fix", { code: face.textLang, actual: say("lang." + face.textLang) }), { effort: "minutes", cases: ["FN-04", "I18N-01"] });
  else add("Accessibility", "pass", "info", "a11y-lang", say("a11y-lang.pass.title"), say("a11y-lang.pass.evidence", { lang: face.lang }), "", { cases: ["FN-04", "I18N-01"] });
  if (face.signals && face.signals.zoomBlocked) add("Accessibility", "fail", "medium", "a11y-zoom", say("a11y-zoom.title"), say("a11y-zoom.evidence"), say("a11y-zoom.fix"), { effort: "minutes" });
  const noMain = read.filter((page) => !(page.inspect.signals && page.inspect.signals.main));
  if (noMain.length) add("Accessibility", "risk", "low", "a11y-main", say("a11y-main.title", { n: noMain.length }), say("listDot", { list: some(noMain.map((page) => page.path), 4) }), say("a11y-main.fix"), { pages: noMain.map((page) => page.path), effort: "minutes", cases: ["A11Y-02"] });
  const h1Off = read.filter((page) => (page.inspect.h1 || []).length !== 1);
  if (h1Off.length) add("Accessibility", "risk", "low", "a11y-h1", say("a11y-h1.title", { n: h1Off.length }), say("listDot", { list: some(h1Off.map((page) => say("pathNote", { path: page.path, note: (page.inspect.h1 || []).length })), 4) }), say("a11y-h1.fix"), { pages: h1Off.map((page) => page.path), effort: "minutes", cases: ["FN-03"] });
  const frames = read.filter((page) => (page.inspect.signals && page.inspect.signals.untitledFrames) > 0);
  if (frames.length) add("Accessibility", "risk", "low", "a11y-frames", say("a11y-frames.title"), on(frames, 3), say("a11y-frames.fix"), { pages: frames.map((page) => page.path), effort: "minutes", cases: ["A11Y-05"] });
  const tabs = read.filter((page) => (page.inspect.signals && page.inspect.signals.positiveTabindex) > 0);
  if (tabs.length) add("Accessibility", "risk", "low", "a11y-tabindex", say("a11y-tabindex.title"), on(tabs, 3), say("a11y-tabindex.fix"), { pages: tabs.map((page) => page.path), effort: "minutes" });
  if (!(browsed && browsed.axe && browsed.axe.ran)) add("Accessibility", "person", "info", "a11y-render", say("a11y-render.title"), say("a11y-render.evidence"), "", { cases: ["A11Y-04"] });

  // Performance
  const homeMs = home.ms || 0;
  if (homeMs > 1800) add("Performance", "fail", "medium", "pf-home", say("pf-home.title", { ms: homeMs }), say("pf-home.evidence"), say("pf-home.fix"), { effort: "days", cases: ["PF-01"] });
  else if (homeMs > 800) add("Performance", "risk", "low", "pf-home", say("pf-home.title", { ms: homeMs }), say("pf-home.risk.evidence"), say("pf-home.risk.fix"), { effort: "hours", cases: ["PF-01"] });
  else add("Performance", "pass", "info", "pf-home", say("pf-home.pass.title", { ms: homeMs }), say("pf-home.pass.evidence"), "", { cases: ["PF-01"] });
  const slow = read.filter((page) => page.depth > 0 && page.ms > 1800);
  if (slow.length) add("Performance", "risk", "medium", "pf-slow", say("pf-slow.title", { n: slow.length }), say("listDot", { list: some(slow.map((page) => say("pathNote", { path: page.path, note: page.ms + " ms" })), 4) }), say("pf-slow.fix"), { pages: slow.map((page) => page.path), effort: "days", cases: ["PF-03"] });
  const heavy = read.filter((page) => (page.inspect.bytes || 0) > 500000);
  if (heavy.length) add("Performance", "risk", "low", "pf-weight", say("pf-weight.title", { n: heavy.length }), say("listDot", { list: some(heavy.map((page) => say("pathNote", { path: page.path, note: Math.round(page.inspect.bytes / 1024) + " KB" })), 3) }), say("pf-weight.fix"), { pages: heavy.map((page) => page.path), effort: "hours" });
  const blocking = face.signals ? face.signals.blockingScripts || 0 : 0;
  if (blocking > 2) add("Performance", "risk", "low", "pf-blocking", say("pf-blocking.title", { n: blocking }), say("pf-blocking.evidence"), say("pf-blocking.fix"), { count: blocking, effort: "minutes", cases: ["PF-02"] });
  const noSize = face.signals ? face.signals.imgNoSize || 0 : 0;
  if (noSize > 3) add("Performance", "risk", "low", "pf-cls", say("pf-cls.title", { n: noSize }), say("pf-cls.evidence"), say("pf-cls.fix"), { count: noSize, effort: "hours", cases: ["VIS-01"] });
  if (browsed && browsed.start && Array.isArray(browsed.start.images)) {
    const imgs = browsedImages(browsed);
    const imgPages = (list) => [...new Set([].concat.apply([], list.map((row) => row.pages)))];
    const where = (row) => say("pf-img.where", { name: imageName(row.src), page: row.pages[0] });
    const checked = say("pagesN", { n: imgPages(imgs).length || 1 });
    const oversized = imgs.filter((row) => row.bytes >= IMAGE_MIN && row.nw > 2 * row.w)
      .map((row) => Object.assign({ save: Math.round(row.bytes * Math.max(0, 1 - (4 * row.w * row.h) / ((row.nw * row.nh) || 1))) }, row))
      .sort((a, b) => b.save - a.save);
    const sizeSave = oversized.reduce((sum, row) => sum + row.save, 0);
    if (oversized.length) add("Performance", "risk", sizeSave > 512000 ? "medium" : "low", "pf-img-size", say("pf-img-size.title", { n: oversized.length }),
      say("pf-img-size.evidence", { list: some(oversized.map((row) => say("pf-img-size.row", { where: where(row), nw: row.nw, nh: row.nh, w: row.w, h: row.h, kb: kbOf(row.bytes), save: kbOf(row.save) })), 4), save: kbOf(sizeSave) }),
      say("pf-img-size.fix"), { pages: imgPages(oversized), count: oversized.length, effort: "hours" });
    else add("Performance", "pass", "info", "pf-img-size", say("pf-img-size.pass.title"), say("pf-img-size.pass.evidence", { pages: checked }), "");
    const oldFormat = imgs.filter((row) => row.bytes >= IMAGE_MIN && OLD_IMAGE.test(row.mime))
      .map((row) => Object.assign({ save: Math.round(row.bytes * 0.3) }, row))
      .sort((a, b) => b.save - a.save);
    const formatSave = oldFormat.reduce((sum, row) => sum + row.save, 0);
    if (oldFormat.length) add("Performance", "risk", formatSave > 512000 ? "medium" : "low", "pf-img-format", say("pf-img-format.title", { n: oldFormat.length }),
      say("pf-img-format.evidence", { list: some(oldFormat.map((row) => say("pf-img-format.row", { where: where(row), type: row.mime.replace(/^image\//i, "").toUpperCase(), kb: kbOf(row.bytes) })), 4), save: kbOf(formatSave) }),
      say("pf-img-format.fix"), { pages: imgPages(oldFormat), count: oldFormat.length, effort: "hours" });
    else add("Performance", "pass", "info", "pf-img-format", say("pf-img-format.pass.title"), say("pf-img-format.pass.evidence", { pages: checked }), "");
    const lcpLazy = imgs.find((row) => row.lcp && row.lazy);
    const eager = imgs.filter((row) => row.top > row.fold && !row.lazy);
    const eagerText = say("pf-img-lazy.eager", { n: eager.length });
    if (lcpLazy) add("Performance", "risk", "medium", "pf-img-lazy", say("pf-img-lazy.title"),
      say("pf-img-lazy.evidence", { where: where(lcpLazy), also: eager.length > 3 ? say("pf-img-lazy.also", { eager: eagerText }) : "" }),
      say("pf-img-lazy.fix", { also: eager.length > 3 ? say("pf-img-lazy.alsoFix") : "" }), { pages: lcpLazy.pages, effort: "minutes" });
    else if (eager.length > 3) add("Performance", "risk", "low", "pf-img-lazy", eagerText,
      say("pf-img-lazy.eager.evidence", { list: some(eager.map(where), 4) }),
      say("pf-img-lazy.eager.fix"), { pages: imgPages(eager), count: eager.length, effort: "minutes" });
    else add("Performance", "pass", "info", "pf-img-lazy", say("pf-img-lazy.pass.title"), say("pf-img-lazy.pass.evidence", { eager: eager.length ? say("pf-img-lazy.within", { eager: eagerText }) : say("pf-img-lazy.none") }), "");
  }
  const back = browsed && browsed.backForward;
  if (back && back.ran) {
    const blockers = (back.reasons || []).filter((row) => row.type === "PageSupportNeeded").map((row) => bfcacheBlocker(row.reason));
    const fixes = [...new Set(blockers.map((row) => row[1]).filter(Boolean))];
    if (blockers.length) add("Performance", "risk", "low", "pf-bfcache", say("pf-bfcache.title"),
      say("pf-bfcache.evidence", { list: some(blockers.map((row) => row[0]), 4) }),
      say("pf-bfcache.fix", { fixes: fixes.length ? say("pf-bfcache.fixes", { list: { items: fixes.map((id) => say("bfcache.fix." + id)), sep: " " } }) : "" }), { count: blockers.length, effort: "hours", cases: ["PF-04"] });
    else add("Performance", "pass", "info", "pf-bfcache", say("pf-bfcache.pass.title"),
      say(back.restored ? "pf-bfcache.pass.restored" : "pf-bfcache.pass.evidence"), "", { cases: ["PF-04"] });
  }
  if (face.signals && !face.signals.cacheControl) add("Performance", "risk", "low", "pf-cache", say("pf-cache.title"), say("pf-cache.evidence"), say("pf-cache.fix"), { effort: "minutes", cases: ["RS-03"] });
  const thirdHosts = face.signals ? (face.signals.thirdParty || []).length : 0;
  if (thirdHosts > 8) add("Performance", "risk", "low", "pf-third", say("pf-third.title", { n: thirdHosts }), say("pf-third.evidence"), say("pf-third.fix"), { count: thirdHosts, effort: "hours" });
  if (input.pagespeed) speedChecks(input.pagespeed, add);
  if (input.crux) trendChecks(input.crux, add);
  else if (!(browsed && browsed.start && browsed.start.vitals && browsed.start.vitals.lcp)) add("Performance", "person", "info", "pf-cwv", say("pf-cwv.title"), say("pf-cwv.evidence"), "");
  if (limits.timedOut) add("Performance", "person", "info", "coverage", say("coverage.title"), say("coverage.evidence", { pages: say("pagesN", { n: limits.pagesRead || pages.length }), max: limits.maxPages || "?" }), "");

  if (browsed) browserChecks(browsed, add, { findings, tags, consentTools, face, renderedCrawl: !!home.renderedLinks });

  // Rank and score.
  const actionable = findings.filter((item) => item.verdict === "fail" || item.verdict === "risk");
  actionable.forEach((item) => {
    const reach = 1 + Math.log2((item.count || item.pages.length || 1) + 1) * 0.3;
    item.priority = Math.round((SEVERITY_RANK[item.severity] * 10 * (item.verdict === "fail" ? 1 : 0.6) * reach) / (EFFORT_COST[item.effort] || 1.6) * 10) / 10;
  });
  actionable.sort((a, b) => b.priority - a.priority || SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity]);
  actionable.forEach((item, index) => { item.rank = index + 1; });
  const ordered = actionable.concat(findings.filter((item) => item.verdict === "person"), findings.filter((item) => item.verdict === "pass"));
  ordered.forEach((item, index) => { item.id = "F-" + String(index + 1).padStart(2, "0"); });

  const areas = {};
  AREAS.forEach((area) => {
    const mine = findings.filter((item) => item.area === area);
    let score = 100;
    let lowRisk = 0;
    mine.forEach((item) => {
      if (item.verdict === "fail") score -= SEVERITY_POINTS[item.severity] || 0;
      if (item.verdict === "risk" && item.severity === "low") lowRisk += Math.round(SEVERITY_POINTS.low / 2);
      else if (item.verdict === "risk") score -= Math.round((SEVERITY_POINTS[item.severity] || 0) / 2);
    });
    score -= Math.min(LOW_RISK_CAP, lowRisk);
    score = Math.max(0, Math.min(100, score));
    areas[area] = {
      score,
      grade: grade(score),
      fail: mine.filter((item) => item.verdict === "fail").length,
      risk: mine.filter((item) => item.verdict === "risk").length,
      pass: mine.filter((item) => item.verdict === "pass").length,
      person: mine.filter((item) => item.verdict === "person").length
    };
  });
  const weightSum = AREAS.reduce((sum, area) => sum + AREA_WEIGHT[area], 0);
  const overall = Math.round(AREAS.reduce((sum, area) => sum + areas[area].score * AREA_WEIGHT[area], 0) / weightSum);
  const totals = { fail: 0, risk: 0, pass: 0, person: 0 };
  findings.forEach((item) => { totals[item.verdict] += 1; });
  const severities = { critical: 0, high: 0, medium: 0, low: 0 };
  actionable.forEach((item) => { if (severities[item.severity] != null) severities[item.severity] += 1; });
  const top = actionable[0];
  const summary = warnings.join(" ") + (warnings.length ? " " : "") + host + " scores " + overall + " out of 100 (" + grade(overall) + "). " +
    plural(totals.fail, "check fails", "checks fail") + " now, " + plural(totals.risk, "is", "are") + " at risk, and " + totals.pass + " pass." +
    (top ? " " + english(say("fixFirst", { title: /^[A-Z][a-z]/.test(top.title) ? top.title.charAt(0).toLowerCase() + top.title.slice(1) : top.title })) : "");

  const caseVerdicts = {};
  findings.forEach((item) => {
    item.cases.forEach((id) => {
      const prior = caseVerdicts[id];
      if (!prior || VERDICT_ORDER[item.verdict] > VERDICT_ORDER[prior.verdict] || (item.verdict === prior.verdict && SEVERITY_RANK[item.severity] > SEVERITY_RANK[prior.severity])) {
        caseVerdicts[id] = { verdict: item.verdict, severity: item.severity, finding: item.id };
      }
    });
  });

  const titleText = face.title || "";
  const description = face.description || "";
  const previews = {
    google: {
      title: titleText,
      titleCut: titleText.length > 60,
      url: host + (home.path && home.path !== "/" ? " › " + home.path.replace(/^\//, "").split(/[/?]/).filter(Boolean).join(" › ") : ""),
      site: social.ogSiteName || host,
      description,
      descriptionCut: description.length > 158,
      icon: face.icon || ""
    },
    social: {
      title: social.ogTitle || titleText,
      description: social.ogDescription || description,
      image: /^https:\/\//i.test(social.ogImage || "") ? social.ogImage : "",
      site: social.ogSiteName || host,
      host,
      card: social.twitterCard || "",
      fallback: !social.ogTitle || !social.ogImage
    }
  };

  const analytics = { tags, consentTools, consentMode, utm: utm && utm.status ? { kept: !!utm.kept, finalPath: pathOf(utm.finalUrl) } : null, untagged: untagged.slice(0, 20) };
  const geo = {
    crawlers: crawlers.map((bot) => ({ token: bot.token, owner: bot.owner, product: bot.product, role: bot.role, allowed: bot.allowed, rule: bot.rule, blockedPages: bot.blockedPages })),
    robotsFound: robots.groups.length > 0 || !!input.robotsText,
    llms: llmsReport,
    aiView: { text: (homeText.text || "").slice(0, 1600), chars: homeText.chars || 0, words: homeText.words || 0, outline: (homeText.outline || []).slice(0, 24), appShell },
    entity: entity ? { type: entity.types[0], props: entity.props.slice(0, 20), sameAs: (entity.sameAs || []).slice(0, 10) } : null,
    schemaTypes: [...schemaTypes].slice(0, 20),
    questionHeadings: questionHeads,
    entityPath: entityPage ? pathOf(entityPage.url) : "",
    answerPath: answerPage ? pathOf(answerPage.url) : "",
    datedPath: datedPage ? pathOf(datedPage.url) : ""
  };
  const seo = {
    indexability: indexability.slice(0, 100),
    indexable: indexable.length,
    sitemap: sitemapReport,
    duplicates: { titles: dupTitles.slice(0, 10), descriptions: dupDescriptions.slice(0, 10) },
    schemaTypes: [...schemaTypes].slice(0, 20)
  };
  const findingState = (key) => (findings.find((item) => item.key === key) || {}).verdict || "unknown";
  const pageBytes = browsed && browsed.start && browsed.start.bytes;
  const carbon = pageBytes ? carbonEstimate(pageBytes, "browser") : carbonEstimate(input.pagespeed && input.pagespeed.bytes, "lighthouse");
  const security = {
    headers: [
      { label: "HTTPS redirect", state: httpCheck ? ({ pass: "pass", risk: "risk" }[(findings.find((item) => item.key === "sec-http") || {}).verdict] || "fail") : "unknown" },
      { label: "HSTS", state: hdr.hsts ? "pass" : "fail" },
      { label: "Content-Security-Policy", state: hdr.csp ? (findings.some((item) => item.key === "sec-csp" && item.verdict === "risk") ? "risk" : "pass") : "risk" },
      { label: "Frame protection", state: framesGuarded(hdr.frame) || csp["frame-ancestors"] ? "pass" : "risk" },
      { label: "X-Content-Type-Options", state: hdr.nosniff ? "pass" : "risk" },
      { label: "Referrer-Policy", state: hdr.referrer ? "pass" : "risk" },
      { label: "Permissions-Policy", state: rawHeaders.permissions ? "pass" : "risk" },
      { label: "Cross-Origin-Opener-Policy", state: findingState("sec-coop") },
      { label: "TLS certificate", state: tls && tls.validTo ? (tls.daysLeft < 14 ? "fail" : tls.daysLeft < 30 ? "risk" : "pass") : "unknown" },
      { label: "security.txt", state: sec ? (findings.some((item) => item.key === "sec-securitytxt" && item.verdict === "pass") ? "pass" : "risk") : "unknown" },
      { label: "SPF", state: dnsRead("spf") ? (dnsInfo.spf || (findings.find((item) => item.key === "sec-spf") || {}).verdict === "pass" ? "pass" : "risk") : "unknown" },
      { label: "DMARC", state: dnsRead("dmarc") ? (dnsInfo.dmarc && !/p\s*=\s*none/i.test(dnsInfo.dmarc) ? "pass" : "risk") : "unknown" },
      { label: "CAA", state: dnsRead("caa") ? ((dnsInfo.caa || []).length ? "pass" : "risk") : "unknown" },
      { label: "Safe Browsing", state: findingState("sec-safebrowsing") },
      { label: "Domain expiry", state: findingState("sec-domain-expiry") }
    ].concat(dnsRead("mx") && (dnsInfo.mx || []).length ? [
      { label: "MTA-STS", state: findingState("sec-mta-sts") },
      { label: "TLS-RPT", state: findingState("sec-tlsrpt") }
    ] : []).concat([["Front-end libraries", "sec-libraries"], ["Privacy notice", "an-privacy"], ["Imprint", "an-imprint"], ["Accessibility statement", "a11y-statement"]]
      .filter(([, key]) => findingState(key) !== "unknown")
      .map(([label, key]) => findingState(key) === "person" ? { label, state: "unknown", person: true } : { label, state: findingState(key) })),
    tls: tls && tls.validTo ? { validTo: tls.validTo, daysLeft: tls.daysLeft, issuer: tls.issuer || "" } : null,
    domain: extras.domain && extras.domain.read ? { domain: extras.domain.domain, expires: extras.domain.expires, daysLeft: extras.domain.daysLeft, registrar: extras.domain.registrar, locked: extras.domain.locked } : null,
    bimi: dnsRead("bimi") ? { record: dnsInfo.bimi || "", eligible: /p\s*=\s*(reject|quarantine)/i.test(dnsInfo.dmarc || "") } : null,
    pages: headerRows.slice(0, 40)
  };
  const chatSeen = browsed && browsed.chat && (browsed.chat.found || []).length ? browsed.chat : null;
  const chatLauncher = (chatSeen && chatSeen.launcher) || {};
  const chatOpen = (chatSeen && chatSeen.open) || {};
  const chatConsent = browsed && browsed.consent;
  const chat = chatSeen ? {
    vendors: chatSeen.found.map((row) => ({ name: row.name, ai: !!row.ai })),
    requests: chatSeen.found.reduce((sum, row) => sum + row.requests, 0),
    kb: Math.round(chatSeen.found.reduce((sum, row) => sum + row.bytes, 0) / 1024),
    ms: chatSeen.found.reduce((sum, row) => sum + row.ms, 0),
    banner: !!(chatConsent && chatConsent.banner),
    cookies: (chatSeen.cookies || []).slice(0, 10),
    rejected: chatConsent && chatConsent.rejected && chatSeen.after ? { cookies: (chatSeen.after.cookies || []).slice(0, 10), requests: chatSeen.after.requests || 0 } : null,
    launcher: chatLauncher.found ? { name: chatLauncher.name || "", known: !!chatLauncher.known, covers: (chatLauncher.covers || []).length } : chatLauncher.hidden ? { hidden: true } : null,
    opened: !!chatOpen.opened,
    states: { consent: findingState("an-chat-consent"), reject: findingState("an-chat-reject"), weight: findingState("pf-chat"), cover: findingState("a11y-chat-cover"), name: findingState("a11y-chat-name"), focus: findingState("a11y-chat-focus"), trap: findingState("a11y-chat-trap"), privacy: findingState("an-chat-privacy") }
  } : null;

  return {
    version: 1,
    score: { overall, grade: grade(overall), areas, totals, severities },
    summary,
    warnings,
    warningMsgs,
    findings: ordered,
    caseVerdicts,
    previews,
    seo,
    geo,
    analytics,
    security,
    chat,
    carbon,
    graph: { nodes: nodes.slice(0, 120), edges: edges.filter((edge) => edge.s < 120 && edge.t < 120) },
    fixkit: fixKit({ home, face, read, indexable, origin, host, input, extras, tags, dnsInfo, entity, socialLinks, findings, browsed, chat })
  };
}

function fixKit(ctx) {
  const face = ctx.face || {};
  const sig = face.signals || {};
  const res = face.resources || {};
  const hosts = (list) => [...new Set((list || []).filter(Boolean))].slice(0, 30).map((h) => "https://" + h);
  const script = ["'self'"].concat(hosts(res.scripts));
  const style = ["'self'"].concat(hosts(res.styles));
  const font = ["'self'"];
  const img = ["'self'", "data:"].concat(hosts(res.images));
  const frame = hosts(res.frames);
  const connect = ["'self'"];
  (ctx.tags || []).forEach((tag) => (ANALYTICS_CONNECT[tag.name] || []).forEach((h) => { if (connect.indexOf(h) === -1) connect.push(h); }));
  if ((res.styles || []).some((h) => /fonts\.googleapis\.com/.test(h))) font.push("https://fonts.gstatic.com");
  if ((res.styles || []).some((h) => /use\.typekit\.net/.test(h))) font.push("https://use.typekit.net");
  if ((ctx.tags || []).some((tag) => /^Google/.test(tag.name))) {
    ["https://*.googletagmanager.com"].forEach((h) => { if (script.indexOf(h) === -1) script.push(h); });
    ["https://*.google-analytics.com", "https://*.googletagmanager.com"].forEach((h) => { if (img.indexOf(h) === -1) img.push(h); });
  }
  if (sig.inlineScripts) script.push("'unsafe-inline'");
  if (sig.inlineStyles) style.push("'unsafe-inline'");
  const directives = [
    "default-src 'self'",
    "script-src " + script.join(" "),
    "style-src " + style.join(" "),
    "img-src " + img.join(" "),
    "font-src " + font.join(" "),
    "connect-src " + connect.join(" "),
    frame.length ? "frame-src " + frame.join(" ") : "frame-src 'none'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'" + (res.forms && res.forms.length ? " " + hosts(res.forms).join(" ") : ""),
    "frame-ancestors 'self'",
    "upgrade-insecure-requests"
  ];
  const csp = directives.join("; ");
  const hdr = face.headers || {};
  const raw = face.rawHeaders || {};
  const headers = [
    { name: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains", missing: !hdr.hsts },
    { name: "Content-Security-Policy-Report-Only", value: csp, missing: !hdr.csp },
    { name: "X-Content-Type-Options", value: "nosniff", missing: !hdr.nosniff },
    { name: "X-Frame-Options", value: "SAMEORIGIN", missing: !framesGuarded(hdr.frame) },
    { name: "Referrer-Policy", value: "strict-origin-when-cross-origin", missing: !hdr.referrer },
    { name: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), interest-cohort=()", missing: !raw.permissions },
    { name: "Cross-Origin-Opener-Policy", value: "same-origin-allow-popups", missing: COOP_GUARDED.indexOf(policyOf(hdr.coop)) === -1 }
  ];
  const social = face.social || {};
  const name = social.ogSiteName || String(face.title || ctx.host).split(/\s+[|–—·-]\s+/)[0].trim() || ctx.host;
  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      Object.assign({
        "@type": "Organization",
        "@id": ctx.origin + "/#organization",
        name,
        url: ctx.origin + "/"
      }, face.icon || social.ogImage ? { logo: social.ogImage && /^https:/.test(social.ogImage) ? social.ogImage : face.icon } : {},
      face.description ? { description: face.description } : {},
      (ctx.socialLinks || []).length ? { sameAs: ctx.socialLinks } : {}),
      {
        "@type": "WebSite",
        "@id": ctx.origin + "/#website",
        name,
        url: ctx.origin + "/",
        publisher: { "@id": ctx.origin + "/#organization" }
      }
    ]
  };
  const pagesForLlms = (ctx.read || []).filter((page) => ctx.indexable.some((row) => row.path === page.path)).slice(0, 40);
  const llmsTxt = ["# " + name, "", "> " + (face.description || "Describe in one or two sentences what this site offers and who it is for."), "", "## Pages", ""]
    .concat(pagesForLlms.map((page) => "- [" + (page.inspect.title || page.path).replace(/[[\]]/g, "") + "](" + page.url + ")" + (page.inspect.description ? ": " + page.inspect.description : "")))
    .concat(["", "## Contact", "", "- [Home](" + ctx.origin + "/)"]).join("\n") + "\n";
  const expires = new Date(Date.now() + 365 * 24 * 3600 * 1000).toISOString().replace(/\.\d+Z$/, "Z");
  const securityTxt = ["Contact: mailto:security@" + ((ctx.dnsInfo && ctx.dnsInfo.domain) || ctx.host), "Expires: " + expires, "Preferred-Languages: " + (face.lang ? face.lang.split("-")[0] : "en"), "Canonical: " + ctx.origin + "/.well-known/security.txt", ""].join("\n");
  const domain = (ctx.dnsInfo && ctx.dnsInfo.domain) || ctx.host;
  const dnsRecords = [];
  if (ctx.dnsInfo && ctx.dnsInfo.domain) {
    const mail = (ctx.dnsInfo.mx || []).length > 0;
    const unread = ctx.dnsInfo.unread || [];
    if (!ctx.dnsInfo.spf && !unread.includes("spf") && !unread.includes("mx")) dnsRecords.push({ name: domain, type: "TXT", value: mail ? "v=spf1 include:<your mail provider> ~all" : "v=spf1 -all" });
    if (!ctx.dnsInfo.dmarc && !unread.includes("dmarc")) dnsRecords.push({ name: "_dmarc." + domain, type: "TXT", value: "v=DMARC1; p=none; rua=mailto:dmarc@" + domain });
    if (!(ctx.dnsInfo.caa || []).length && !unread.includes("caa")) dnsRecords.push({ name: domain, type: "CAA", value: "0 issue \"letsencrypt.org\"" });
    if (mail && !ctx.dnsInfo.tlsRpt && !unread.includes("tlsrpt") && !unread.includes("mx")) dnsRecords.push({ name: "_smtp._tls." + domain, type: "TXT", value: "v=TLSRPTv1; rua=mailto:tlsrpt@" + domain });
    if (mail && !ctx.dnsInfo.mtaSts && !unread.includes("mta-sts") && !unread.includes("mx")) dnsRecords.push({ name: "_mta-sts." + domain, type: "TXT", value: "v=STSv1; id=" + new Date().toISOString().slice(0, 10).replace(/-/g, "") + "01" });
  }
  const open = (key) => (ctx.findings || []).some((item) => item.key === key && (item.verdict === "fail" || item.verdict === "risk"));
  const mx = (ctx.dnsInfo && ctx.dnsInfo.mx) || [];
  const mtaSts = mx.length && open("sec-mta-sts") && !(ctx.dnsInfo.mtaStsPolicy || {}).mode
    ? ["version: STSv1", "mode: testing"].concat(mx.map((host) => "mx: " + host.replace(/\.$/, ""))).concat(["max_age: 86400", ""]).join("\n")
    : "";
  const libraryUpgrades = open("sec-libraries") ? libraryRows(ctx.read || [], ctx.browsed).filter((row) => row.flaws)
    .map((row) => ({ name: row.name, version: row.version, fixed: row.fixed || "", ended: !!row.ended, worst: row.worst, flaws: row.flaws })) : [];
  const legalOwner = name + " (" + ctx.origin + ")";
  const privacyNotice = open("an-privacy") ? ["# Privacy notice", "", "Who is responsible: " + legalOwner + ", <legal name>, <postal address>, <email>.", "",
    "## What we collect and why", "", "- Contact and form data: <fields>, to answer requests. Legal basis: <contract or legitimate interest>.",
    "- Analytics and cookies: " + ((ctx.tags || []).length ? ctx.tags.map((tag) => tag.name).slice(0, 6).join(", ") : "<tools>") + ", only after consent where the law requires it.",
    "", "## Who receives it", "", "- <hosting provider>, <analytics and chat vendors>, and where they process data (inside or outside the EU).",
    "", "## How long we keep it", "", "- <period for each kind of data>.",
    "", "## Your rights", "", "- Access, correction, deletion, restriction, objection, portability, and a complaint to <supervisory authority>. Write to <email>.",
    "", "Last updated: <date>", ""].join("\n") : "";
  const imprint = open("an-imprint") ? ["# Impressum", "", "<Name des Unternehmens und Rechtsform>", "<Straße und Hausnummer>", "<PLZ Ort>", "",
    "Vertreten durch: <Geschäftsführung>", "E-Mail: <adresse>", "Telefon: <nummer>", "",
    "Registergericht: <Gericht>, Registernummer: <HRB ...>", "Umsatzsteuer-ID: <DE...>", "",
    "Verantwortlich für den Inhalt: <Name, Anschrift>", ""].join("\n") : "";
  const statementState = ((ctx.findings || []).find((item) => item.key === "a11y-statement") || {}).verdict;
  const accessibilityStatement = statementState && statementState !== "pass" ? ["# Accessibility statement", "",
    legalOwner + " aims to meet EN 301 549, which includes WCAG 2.1 level AA.", "",
    "## How accessible this site is", "", "- Partly conformant. Known gaps: <list each gap and where it is>.", "",
    "## How we checked", "", "- <self-assessment or audit>, on <date>, with <tools> and manual testing.", "",
    "## Contact for access problems", "", "- <email> or <phone>. We answer within <days>.", "",
    "## Enforcement", "", "- If our answer does not help, contact <market surveillance or enforcement body>.", "",
    "Prepared on <date>. Reviewed on <date>.", ""].join("\n") : "";
  const chatNames = ctx.chat ? ctx.chat.vendors.map((row) => row.name) : [];
  const chatOpen = { Intercom: "window.Intercom(\"show\");", Crisp: "window.$crisp.push([\"do\", \"chat:open\"]);", "Tawk.to": "window.Tawk_API.maximize();", Drift: "window.drift.api.openChat();", "HubSpot Chat": "window.HubSpotConversations.widget.open();", "Zendesk Messaging": "window.zE(\"messenger\", \"open\");", Tidio: "window.tidioChatApi.open();" };
  const chatSnippet = chatNames.length && (open("an-chat-consent") || open("an-chat-reject")) ? [
    "<!-- Click-to-load chat: nothing from " + chatNames.join(", ") + " loads until a visitor asks for help. -->",
    "<!-- Remove the vendor's embed code from the page, and put its script address below. -->",
    "<button type=\"button\" id=\"chat-load\" aria-label=\"Open chat\">Chat with us</button>",
    "<script>",
    "  document.getElementById(\"chat-load\").addEventListener(\"click\", function () {",
    "    this.disabled = true;",
    "    var script = document.createElement(\"script\");",
    "    script.src = \"<the chat's embed script address>\";",
    "    script.async = true;",
    "    script.onload = function () { " + (chatOpen[chatNames[0]] || "/* open the widget with the vendor's API */") + " };",
    "    document.head.appendChild(script);",
    "  }, { once: true });",
    "</script>",
    ""].join("\n") : "";
  return {
    hosting: hostingHint(ctx.input && ctx.input.technologies, hdr),
    csp,
    headers,
    jsonLd: ctx.entity ? null : jsonLd,
    llmsTxt: (ctx.extras.llms && ctx.extras.llms.status === 200 && !ctx.extras.llms.html) ? "" : llmsTxt,
    securityTxt: (ctx.extras.securityTxt && ctx.extras.securityTxt.status === 200 && !ctx.extras.securityTxt.html) ? "" : securityTxt,
    dns: dnsRecords,
    mtaSts,
    libraries: libraryUpgrades,
    privacyNotice,
    imprint,
    accessibilityStatement,
    chatSnippet
  };
}

module.exports = { analyze, parseRobotsFull, robotsVerdict, NO_SRI_HOSTS, AI_BOTS, AREAS, BROWSER_READ_NOTE, UNTAGGED_READ_NOTE, CUT_NOTE, SLOW_READ_NOTE, SLOW_CUT_NOTE, SHELL_NOTE, botCheck };
