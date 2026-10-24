"use strict";

const { URL } = require("url");
const libraries = require("./url-review-libraries");
const { germanSpeaking } = require("./url-review-legal");

const BROWSER_READ_NOTE = "The site's bot protection refused the plain request; the page was analyzed in headless Chrome.";
const UNTAGGED_READ_NOTE = "The site's bot protection refused the plain request and headless Chrome while it carried the review tag; the page was analyzed in headless Chrome without the tag.";
const CUT_NOTE = "The start page is larger than 2 MB, so the review analyzed its first 2 MB.";
const SLOW_READ_NOTE = "The plain request for the start page took longer than 8 s; the page was analyzed in headless Chrome.";
const SLOW_CUT_NOTE = "The start page was still arriving after 8 s, so the review analyzed the part that had arrived.";
const SHELL_NOTE = "The start page's HTML lists almost no same-host links, so the review followed the links on the page rendered in headless Chrome.";

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
const AXE_FIX = {
  "color-contrast": "Darken the text or lighten the background until normal text reaches 4.5:1 and large text 3:1.",
  "button-name": "Give each icon button visible text or an aria-label.",
  "link-name": "Give each link text, or an aria-label when it only holds an icon.",
  "image-alt": "Describe informative images. Give decorative ones alt=\"\".",
  "role-img-alt": "Add aria-label or aria-labelledby to elements with role=\"img\".",
  "label": "Pair each control with <label for>, wrap it in a label, or add aria-label.",
  "label-content-name-mismatch": "Start the aria-label with the words that are visible on the control.",
  "target-size": "Make tap targets at least 24 by 24 px, or leave that much space around them.",
  "heading-order": "Step headings down one level at a time.",
  "list": "Keep only li, script, or template directly inside ul and ol.",
  "listitem": "Put each li inside a ul or ol.",
  "scrollable-region-focusable": "Add tabindex=\"0\" to scrollable areas so keyboard users can scroll them.",
  "aria-hidden-focus": "Remove focusable elements from aria-hidden containers, or drop aria-hidden.",
  "duplicate-id-aria": "Give every element that ARIA points to a unique id.",
  "nested-interactive": "Do not put links or buttons inside other links or buttons."
};
const AXE_SEVERITY = { critical: ["fail", "medium"], serious: ["fail", "low"], moderate: ["risk", "low"], minor: ["risk", "low"] };

// Chat widgets and AI chatbots: consent, weight on the start page, and the launcher and open widget on a phone.
function chatChecks(chat, consent, add) {
  const rows = chat.found;
  const names = rows.map((row) => row.name + (row.ai ? " (AI chatbot)" : ""));
  const named = sample(names, 3);
  const it = rows.length === 1 ? rows[0].name : "the chat";
  const widget = rows.length === 1 ? rows[0].name + " " : "chat ";
  const requests = rows.reduce((sum, row) => sum + row.requests, 0);
  const cookies = chat.cookies || [];
  const banner = consent && consent.banner ? (consent.banner === "A cookie banner" ? "A cookie banner" : consent.banner) + " was showing" : "";

  if (cookies.length && banner) add("Analytics", "risk", "medium", "an-chat-consent", "The chat sets cookies before the visitor chooses",
    banner + ". Before any choice, " + named + " sent " + plural(requests, "request") + " and set " + sample(cookies, 4) + ".",
    "Put the chat in a consent category and load it only once that category is accepted, or show a plain chat button that loads the widget on the first click.", { effort: "hours", cases: ["CHAT-02", "PR-03"], count: cookies.length });
  else if (cookies.length) add("Analytics", "risk", "low", "an-chat-consent", "The chat sets cookies on load and no banner asks first",
    named + " sent " + plural(requests, "request") + " and set " + sample(cookies, 4) + " on the first visit.",
    "Show a plain chat button that loads the widget on the first click, so nothing is stored until a visitor asks for help.", { effort: "hours", cases: ["CHAT-02", "PR-03"], count: cookies.length });
  else if (banner) add("Analytics", "risk", "low", "an-chat-consent", "The chat loads before the visitor chooses",
    banner + ". Before any choice, " + named + " sent " + plural(requests, "request") + ", but set no cookie the browser could see.",
    "Load the chat after consent, or on the first click of a plain chat button.", { effort: "hours", cases: ["CHAT-02", "PR-03"] });
  else add("Analytics", "pass", "info", "an-chat-consent", "The chat sets no cookie on load", named + " sent " + plural(requests, "request") + " and set no cookie the browser could see.", "", { cases: ["CHAT-02"] });

  if (consent && consent.rejected && chat.after) {
    const after = chat.after;
    if (after.cookies.length) add("Analytics", "risk", "medium", "an-chat-reject", "The chat keeps setting cookies after Reject",
      "After pressing \"" + consent.rejectLabel + "\" and reloading, " + it + " set " + sample(after.cookies, 4) + ".",
      "Map the chat to a consent category and block it when that category is refused.", { effort: "hours", cases: ["CHAT-02", "PR-03"] });
    else if (after.requests) add("Analytics", "risk", "low", "an-chat-reject", "The chat still loads after Reject",
      "After pressing \"" + consent.rejectLabel + "\" and reloading, " + it + " sent " + plural(after.requests, "request") + " but set no new cookie.",
      "If the chat is not strictly needed, block it when its consent category is refused.", { effort: "hours", cases: ["CHAT-02"] });
    else add("Analytics", "pass", "info", "an-chat-reject", "The chat stops after Reject", "After pressing \"" + consent.rejectLabel + "\" and reloading, " + it + " sent no request.", "", { cases: ["CHAT-02"] });
  }

  const open = chat.open || {};
  if (open.privacy === false) add("Analytics", "risk", "low", "an-chat-privacy", "The open chat shows no privacy link",
    "The opened " + widget + "widget links no privacy notice, so a visitor typing personal data cannot see how it is used.",
    "Link the privacy notice from the chat's welcome screen or pre-chat form.", { effort: "minutes", cases: ["CHAT-03", "PR-01"] });
  else if (open.privacy === true) add("Analytics", "pass", "info", "an-chat-privacy", "The open chat links the privacy notice", "The opened " + widget + "widget links a privacy notice.", "", { cases: ["CHAT-03", "PR-01"] });

  const kb = Math.round(rows.reduce((sum, row) => sum + row.bytes, 0) / 1024);
  const ms = rows.reduce((sum, row) => sum + row.ms, 0);
  const cost = named + " added " + plural(requests, "request") + ", " + kb + " KB over the network" + (ms ? " and " + ms + " ms of script time in long frames" : "") + " to the start page before anyone opened it. Measured once in Chromium with no network throttling.";
  const lighter = "Show a plain chat button and load the widget on its first click, or after the page is idle.";
  if (kb > 500 || ms > 250) add("Performance", "risk", "medium", "pf-chat", "The chat adds " + kb + " KB to the start page", cost, lighter, { effort: "hours", cases: ["PF-02"] });
  else if (kb > 200 || ms > 100) add("Performance", "risk", "low", "pf-chat", "The chat adds " + kb + " KB to the start page", cost, lighter, { effort: "hours", cases: ["PF-02"] });
  else add("Performance", "pass", "info", "pf-chat", "The chat is light on the start page", cost, "", { cases: ["PF-02"] });

  const launcher = chat.launcher || {};
  if (launcher.found) {
    const covers = launcher.covers || [];
    const onBanner = covers.filter((row) => row.banner);
    if (covers.length) add("Accessibility", "fail", onBanner.length ? "high" : "medium", "a11y-chat-cover", onBanner.length ? "The chat button covers the cookie banner on a phone" : "The chat button covers a button on a phone",
      "At 390 px the " + widget + "launcher sits over " + sample(covers.map((row) => "\"" + row.label + "\"" + (row.banner ? " in the cookie banner" : "")), 3) + ".",
      onBanner.length ? "Hide the launcher until the visitor answers the banner, or raise the banner above it." : "Keep the launcher clear of sticky and call-to-action buttons: offset it, or reserve space for it at the bottom of the page.", { effort: "hours", cases: ["CHAT-01", "MB-01"] });
    else add("Accessibility", "pass", "info", "a11y-chat-cover", "The chat button covers no button on a phone", "At 390 px the " + widget + "launcher overlaps no " + (launcher.banner ? "cookie banner or " : "") + "call-to-action button.", "", { cases: ["CHAT-01"] });
    if (launcher.known && !launcher.name) add("Accessibility", "fail", "medium", "a11y-chat-name", "The chat button has no accessible name",
      "A screen reader announces the " + widget + "launcher only as a button, with no words.",
      "Give the launcher an aria-label such as \"Open chat\".", { effort: "minutes", cases: ["CHAT-01", "FN-05"] });
    else if (launcher.known) add("Accessibility", "pass", "info", "a11y-chat-name", "The chat button has a name", "The " + widget + "launcher is announced as \"" + launcher.name + "\".", "", { cases: ["CHAT-01", "FN-05"] });
  }
  if (open.opened && open.moved === false) add("Accessibility", "risk", open.tabbed ? "low" : "medium", "a11y-chat-focus", "Opening the chat leaves keyboard focus on the page",
    "After " + (open.keyboard ? "pressing Enter on" : "clicking") + " the " + widget + "launcher, the chat opened but focus stayed outside it" + (open.tabbed ? " until Tab was pressed" : ", and the next Tab went to the page instead of the chat") + ". A screen reader user hears nothing about the open chat.",
    "Move focus to the chat's first control or heading when it opens, and back to the launcher when it closes.", { effort: "hours", cases: ["CHAT-03", "A11Y-04"] });
  if (open.opened && open.trapped) add("Accessibility", "fail", "high", "a11y-chat-trap", "Keyboard focus is trapped in the open chat",
    "After opening " + it + (open.keyboard ? " with Enter" : "") + ", " + plural(open.tabs, "press", "presses") + " of Tab kept focus inside it, no close button was reached, and Escape did not close it.",
    "Let Escape close the chat and return focus to the launcher, and keep the close button in the Tab order.", { effort: "hours", cases: ["CHAT-03", "A11Y-04"] });
  else if (open.opened && open.exit) add("Accessibility", "pass", "info", "a11y-chat-trap", "Keyboard focus can leave the open chat",
    "After opening " + it + (open.keyboard ? " with Enter" : "") + ", focus left it by " + { tab: "Tab", close: "reaching its close button", escape: "Escape" }[open.exit] + ".", "", { cases: ["CHAT-03", "A11Y-04"] });
  else if (open.opened) add("Accessibility", "person", "info", "a11y-chat-trap", "Keyboard focus in the open chat needs a person",
    (open.entered ? "Focus went into a frame of " + it + " that this review cannot read" : "Focus could not be moved into " + it) + (open.keyboard ? "" : ", and Enter on the launcher did not open it") + ", so the trap check could not finish.", "", { cases: ["CHAT-03"] });
}

const SHOP_PATH = /\/(cart|checkout|basket|warenkorb|kasse|carrito|cesta|panier|carrello|carrinho)(\/|$|\?)/i;
const LIB_SEVERITY = { critical: ["fail", "high"], high: ["risk", "high"], medium: ["risk", "medium"], low: ["risk", "low"] };

// Links to the accessibility statement, the privacy notice and the imprint, on any page read or the rendered start page.
const FINGERPRINT_KINDS = [["canvas", "drew hidden text on a canvas and read it back"], ["fonts", "measured which fonts are installed"], ["webgl", "read the graphics card name"], ["audio", "rendered a silent audio tone"]];

// Browser fingerprinting, session recorders, and typed text sent before submit: before a choice and after Reject.
function watchChecks(watch, consent, add) {
  const before = watch.before;
  const after = consent && consent.rejected && watch.after ? watch.after : null;
  const rejected = after ? "After pressing \"" + consent.rejectLabel + "\" and reloading, " : "";
  const banner = consent && consent.banner ? (consent.banner === "A cookie banner" ? "A cookie banner" : consent.banner) + " was showing. " : "No cookie banner appeared. ";
  const hosts = (row) => [...new Set([].concat(...FINGERPRINT_KINDS.map(([key]) => row.fingerprint[key] || [])))];
  const list = (row) => hosts(row).map((host) => {
    const hows = FINGERPRINT_KINDS.filter(([key]) => (row.fingerprint[key] || []).indexOf(host) !== -1).map(([, how]) => how);
    return host + " " + (hows.length > 1 ? hows.slice(0, -1).join(", ") + ", and " + hows[hows.length - 1] : hows[0]);
  }).join("; ");
  const guarded = (row) => hosts(row).length > 0 && hosts(row).every((host) => (row.guards || []).indexOf(host) !== -1);
  const printed = hosts(before).length > 0;

  if (printed && guarded(before)) {
    add("Analytics", "risk", "low", "an-fingerprint", "A bot check fingerprints the browser on load",
      banner + "Before any choice, " + list(before) + ". These hosts run bot or fraud protection.",
      "Name the bot protection and what it reads in the privacy notice. It can run without consent only while it is strictly needed for security.", { effort: "minutes", cases: ["PR-02"] });
  } else if (printed) {
    add("Analytics", consent && consent.banner ? "fail" : "risk", "high", "an-fingerprint", consent && consent.banner ? "Scripts fingerprint the browser before the visitor chooses" : "Scripts fingerprint the browser on load and no banner asks first",
      banner + "Before any choice, " + list(before) + ". Read together, these give the browser an ID that survives clearing cookies.",
      "Find the tag behind each host and hold it until consent, like a tracking cookie. If it is fraud or bot protection, name it in the privacy notice.", { effort: "hours", cases: ["PR-02", "PR-03"], count: hosts(before).length });
  } else {
    add("Analytics", "pass", "info", "an-fingerprint", "No browser fingerprinting was seen",
      "Before any choice, no script read back a canvas with text on it, measured 50 or more fonts, read the graphics card name, or rendered a silent audio tone.", "", { cases: ["PR-02"] });
  }
  if (after && hosts(after).length && !guarded(after)) {
    add("Analytics", "fail", "high", "an-fingerprint-reject", "Fingerprinting continues after Reject", rejected + list(after) + ".",
      "Block the fingerprinting tag when the visitor refuses, or remove it.", { effort: "hours", cases: ["PR-02", "PR-03"] });
  } else if (after && printed && !guarded(before)) {
    add("Analytics", "pass", "info", "an-fingerprint-reject", "Fingerprinting stops after Reject", rejected + "no script repeated the fingerprinting calls.", "", { cases: ["PR-03"] });
  }

  const recording = (row) => (row.recorders || []).filter((rr) => rr.sent).map((rr) => rr.name);
  if (recording(before).length) {
    add("Analytics", consent && consent.banner ? "fail" : "risk", "medium", "an-recording", consent && consent.banner ? "A session recorder runs before the visitor chooses" : "A session recorder runs on load and no banner asks first",
      banner + "Before any choice, " + recording(before).join(", ") + " sent recording data. Session recorders replay clicks, scrolling, and anything typed into fields they do not mask.",
      "Load the recorder only after consent, and mask every form field in its settings.", { effort: "hours", cases: ["PR-03"] });
  } else if ((before.recorders || []).length) {
    add("Analytics", "pass", "info", "an-recording", "The session recorder waits for consent", before.recorders.map((rr) => rr.name).join(", ") + " loaded but sent no recording data before a choice.", "", { cases: ["PR-03"] });
  }
  if (after && recording(after).length) {
    add("Analytics", "fail", "medium", "an-recording-reject", "Session recording continues after Reject", rejected + recording(after).join(", ") + " still sent recording data.",
      "Map the recorder to a consent category and block it when that category is refused.", { effort: "hours", cases: ["PR-03"] });
  } else if (after && (before.recorders || []).length) {
    add("Analytics", "pass", "info", "an-recording-reject", "Session recording stops after Reject", rejected + "no session recorder sent data.", "", { cases: ["PR-03"] });
  }

  const typed = before.typed || (after && after.typed);
  if (!typed) return;
  const sentTo = (row) => (row && row.typed ? row.typed.sent : []).map((s) => s.host + " (" + s.how + ")").join(", ");
  const listening = before.listeners && before.listeners.length ? " Scripts from " + before.listeners.slice(0, 4).join(", ") + " listen to typing on the page." : "";
  if (sentTo(before) || sentTo(after)) {
    add("Security", "fail", "high", "sec-typed", "Typed text is sent before the form is submitted",
      "The review typed a test address into the \"" + typed.field + "\" field and did not submit. " +
      [sentTo(before) ? "Before any choice it was sent to " + sentTo(before) + "." : "", sentTo(after) ? rejected + "it was sent to " + sentTo(after) + "." : ""].filter(Boolean).join(" ") +
      " The review blocked those requests, so the test address did not leave the browser." + listening,
      "Turn off form-field capture in the tags that send it, such as automatic advanced matching, form analytics, or an unmasked session recorder, or send the data only on submit and after consent.", { effort: "hours", cases: ["PR-02"] });
  } else {
    add("Security", "pass", "info", "sec-typed", "Typing in a form sends nothing before submit",
      "The review typed a test address into the \"" + typed.field + "\" field without submitting, and no other site received it." + listening, "", { cases: ["PR-02"] });
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
  const linked = (hit) => (hit.text ? "\"" + hit.text + "\"" : "A link") + " on " + hit.path + " leads to " + shownAgainst(hit.href, origin) + ".";
  const none = "None of the " + plural(read.length, "page") + " analyzed" + (dom ? ", nor the rendered start page," : "") + " links ";

  const statement = at("accessibility");
  const techs = [].concat.apply([], read.map((page) => page.inspect.technologies || []));
  const seller = techs.find((item) => /^(Commerce|Payments)$/.test(item.group));
  const products = read.some((page) => ((page.inspect.schema || {}).items || []).some((item) => item.types.some((type) => /^(Product|Offer|AggregateOffer|Store|OnlineStore)$/.test(type))));
  const cart = read.concat(dom ? [{ inspect: { links: dom.links } }] : []).some((page) => (page.inspect.links || []).some((url) => SHOP_PATH.test(url)));
  const shop = seller ? seller.name : products ? "product markup" : cart ? "a cart or checkout link" : "";
  if (statement) add("Accessibility", "pass", "info", "a11y-statement", "An accessibility statement is linked", linked(statement), "", { cases: ["A11Y-06"] });
  else if (shop) add("Accessibility", "risk", "medium", "a11y-statement", "No accessibility statement is linked",
    "The site sells online (" + shop + "). " + none + "an accessibility statement. Since 28 June 2025 the European Accessibility Act requires one from shops that sell to consumers in the EU, unless the business is a micro-enterprise.",
    "Publish an accessibility statement that says how the shop meets EN 301 549 (WCAG 2.1 AA), lists known gaps, and gives a contact for access problems. Link it from the footer of every page.", { effort: "hours", cases: ["A11Y-06"] });
  else add("Accessibility", "person", "info", "a11y-statement", "Whether an accessibility statement is required needs a person",
    none + "an accessibility statement, and the review saw no shop. The European Accessibility Act requires one from shops and from services such as banking, transport and e-books sold to consumers in the EU, and EU public-sector sites need one too.", "", { cases: ["A11Y-06"] });

  const privacy = at("privacy");
  if (privacy) add("Analytics", "pass", "info", "an-privacy", "A privacy notice is linked", linked(privacy), "", { cases: ["PR-01"] });
  else {
    const cookies = read.some((page) => (page.inspect.cookies || []).length) || !!(browsed && browsed.consent && browsed.consent.before && browsed.consent.before.cookieCount);
    const forms = read.reduce((sum, page) => sum + (page.inspect.forms || 0), 0);
    const why = [cookies ? "sets cookies" : "", (ctx.tags || []).length ? "loads " + sample(ctx.tags.map((tag) => tag.name), 3) : "", forms ? "has " + plural(forms, "form") : ""].filter(Boolean);
    add("Analytics", "risk", why.length ? "medium" : "low", "an-privacy", "No privacy notice is linked",
      none + "a privacy notice" + (why.length ? ", yet the site " + why.join(", ") : "") + ". Visitors cannot see who handles their data or why.",
      "Publish a privacy notice that names who controls the data, what is collected, why, and the visitor's rights, and link it from the footer of every page.", { effort: "hours", cases: ["PR-01"] });
  }

  const imprint = at("imprint");
  const german = germanSpeaking(face.lang, face.textLang, home.url);
  if (imprint) add("Analytics", "pass", "info", "an-imprint", "An imprint is linked", linked(imprint), "", { cases: ["PR-04"] });
  else if (german) add("Analytics", "risk", "medium", "an-imprint", "No imprint (Impressum) is linked",
    "The site is " + (/^de\b/i.test(face.lang || "") ? "declared German (lang=\"" + face.lang + "\")" : face.textLang === "de" ? "written in German" : "on a German-speaking domain") + ". " + none + "an Impressum, which business sites in Germany (§ 5 DDG) and Austria (§ 5 ECG) must show.",
    "Publish an Impressum with the provider's name, postal address, email, and register and VAT numbers, and link it from the footer of every page.", { effort: "hours", cases: ["PR-04"] });
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
  const list = "the retire.js list of " + libraries.LIST_DATE;
  if (!flawed.length) {
    add("Security", "pass", "info", "sec-libraries", "Front-end libraries have no known flaw", sample(rows.map((row) => row.name + " " + row.version), 5) + ", checked against " + list + ".", "", { cases: ["SEC-10"] });
    return;
  }
  const where = (row) => row.via === "global" ? "read from the page" : (row.via === "banner" ? "banner of " : "") + shownAgainst(row.url, origin);
  const [verdict, severity] = LIB_SEVERITY[flawed[0].worst] || LIB_SEVERITY.medium;
  const evidence = flawed.slice(0, 4).map((row, index) => row.name + " " + row.version + " (" + where(row) + "): " + plural(row.flaws, "known flaw") + ", the worst rated " + row.worst +
    (row.ids.length ? ", such as " + row.ids.join(", ") : "") + (index === 0 && row.summary ? ". " + row.summary.replace(/\.?$/, ".") : ".")).join(" ") + (flawed.length > 4 ? " " + plural(flawed.length - 4, "more library", "more libraries") + " also have flaws." : "") + " Checked against " + list + ".";
  const steps = flawed.slice(0, 4).map((row) => row.ended ? "move " + row.name + " off " + row.version.split(".")[0] + ".x, which gets no more fixes" : "upgrade " + row.name + " to " + row.fixed + " or later");
  const fix = steps.join("; ").replace(/^./, (c) => c.toUpperCase()) + "." + (flawed.some((row) => row.majorJump) ? " A major upgrade changes behavior, so retest the pages that use it." : "");
  add("Security", verdict, severity, "sec-libraries", flawed.length === 1 ? flawed[0].name + " " + flawed[0].version + (flawed[0].flaws === 1 ? " has a known flaw" : " has known flaws") : plural(flawed.length, "front-end library has", "front-end libraries have") + " known flaws",
    evidence, fix, { effort: flawed.some((row) => row.majorJump) ? "days" : "hours", count: flawed.length, cases: ["SEC-10"] });
}

function browserChecks(b, add, ctx) {
  const where = "Chromium from an EU address (Belgium)";
  const start = b.start || {};
  const consent = b.consent || null;

  // Analytics: what fires before a choice, and after Reject.
  if (consent) {
    const live = (rows) => (rows || []).filter((row) => row.hits > 0);
    const quiet = (rows) => (rows || []).filter((row) => row.denied > 0 && !row.hits);
    const listHits = (rows) => rows.map((row) => row.name + " (" + plural(row.hits, "request") + ")").join(", ");
    const listCookies = (rows) => rows.slice(0, 6).map((row) => row.name + (row.third ? " on " + row.domain : "")).join(", ");
    const beforeHits = live(consent.before.vendors);
    const beforeCookies = consent.before.cookies || [];
    const denied = quiet(consent.before.vendors);
    const bannerText = consent.banner ? (consent.banner === "A cookie banner" ? "A cookie banner was showing" : consent.banner + " was showing") : "No cookie banner appeared";
    if (beforeHits.length || beforeCookies.length) {
      const evidence = bannerText + ". Before any choice, " + where + " saw " +
        [beforeHits.length ? listHits(beforeHits) : "", beforeCookies.length ? "cookies " + listCookies(beforeCookies) : ""].filter(Boolean).join(", and ") + ".";
      add("Analytics", consent.banner ? "fail" : "risk", "high", "an-firing", consent.banner ? "Tracking starts before the visitor chooses" : "Tracking starts on load and no banner asks first", evidence,
        "Hold every tag until consent, or set Google Consent Mode v2 defaults to denied before any tag loads. Block third-party embeds until the visitor agrees.", { effort: "hours", cases: ["AN-01", "PR-03"], count: beforeHits.length + beforeCookies.length });
    } else if (consent.before.vendors.length || ctx.tags.length || ctx.consentTools.length) {
      add("Analytics", "pass", "info", "an-firing", "No tracking request or cookie before a choice",
        bannerText + ". " + (denied.length ? denied.map((row) => row.name).join(", ") + " only sent pings with Consent Mode denied, which store no cookie." : "No request reached a known tracking host and no tracking cookie was set."), "", { cases: ["AN-01"] });
    }
    if (consent.rejected && consent.after) {
      const afterHits = live(consent.after.vendors);
      const afterCookies = consent.after.cookies || [];
      if (afterHits.length || afterCookies.length) {
        add("Analytics", "fail", "high", "an-reject", "Tracking continues after Reject",
          "After pressing \"" + consent.rejectLabel + "\" and reloading, " + [afterHits.length ? listHits(afterHits) : "", afterCookies.length ? "new cookies " + listCookies(afterCookies) : ""].filter(Boolean).join(", and ") + " still appeared.",
          "Map every tag in the consent tool to a category and block it until that category is accepted.", { effort: "hours", cases: ["AN-01", "PR-03"] });
      } else {
        add("Analytics", "pass", "info", "an-reject", "Reject stops tracking", "After pressing \"" + consent.rejectLabel + "\" and reloading, no tracking request or new tracking cookie appeared.", "", { cases: ["AN-01", "PR-03"] });
      }
    } else if (consent.banner && consent.banner !== "Sourcepoint" && !consent.rejectLabel) {
      add("Analytics", "risk", "medium", "an-reject", "The banner shows no reject button on its first layer",
        consent.banner + " was showing, but no button labelled reject, decline, deny, or only necessary was found on it.",
        "Put Reject all next to Accept all, at the same size and weight.", { effort: "minutes", cases: ["PR-03"] });
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
        "axe-core " + (axe.version || "") + " found " + plural(rule.nodes, "element") + " on " + sample(rule.pages, 3) + (rule.targets.length ? ", for example " + rule.targets.slice(0, 2).join(" and ") : "") + ". Impact: " + rule.impact + ".",
        AXE_FIX[rule.id] || "Follow the rule guide at " + rule.helpUrl + ".", { pages: rule.pages, count: rule.nodes, effort: rule.nodes > 20 ? "hours" : "minutes", cases: AXE_CASES[rule.id] || [] });
    });
    const checked = axe.pages.length;
    if (!rules.has("color-contrast")) add("Accessibility", "pass", "info", "a11y-contrast", "Text contrast passes axe-core", "No contrast failure on " + plural(checked, "page") + ". Keyboard focus order still needs a person.", "", { cases: ["A11Y-04"] });
    if (!rules.size) add("Accessibility", "pass", "info", "ax-clean", "axe-core found no WCAG 2.2 AA violation", plural(checked, "rendered page") + " passed every automated rule. Automated rules catch about a third of real issues.", "");
  }
  const mobile = b.mobile && !b.mobile.error ? b.mobile : null;
  if (mobile) {
    if (mobile.overflow > 2) add("Accessibility", "fail", "medium", "a11y-reflow", "The page scrolls sideways on a phone",
      "At " + mobile.width + " px the page is " + mobile.overflow + " px wider than the screen" + (mobile.offenders.length ? ". Widest elements: " + mobile.offenders.join(", ") : "") + ".",
      "Give wide elements max-width: 100%, let tables scroll inside their own box, and avoid fixed widths.", { effort: "hours", cases: ["MB-01", "VIS-02"] });
    else add("Accessibility", "pass", "info", "a11y-reflow", "The page fits a " + mobile.width + " px phone screen", "No sideways scroll in a phone-sized Chromium window.", "", { cases: ["MB-01", "VIS-02"] });
    const tablet = b.tablet || {};
    if (tablet.width && tablet.overflow > 2) add("Accessibility", "fail", "low", "a11y-reflow-tablet", "The page scrolls sideways on a tablet",
      "At " + tablet.width + " px the page is " + tablet.overflow + " px wider than the screen" + ((tablet.offenders || []).length ? ". Widest elements: " + tablet.offenders.join(", ") : "") + ". Layouts often break between the phone and desktop breakpoints.",
      "Check the breakpoints between 600 and 1024 px, and give wide elements max-width: 100%.", { effort: "hours", cases: ["MB-02", "VIS-02"] });
    else if (tablet.width) add("Accessibility", "pass", "info", "a11y-reflow-tablet", "The page fits a " + tablet.width + " px tablet screen", "No sideways scroll at tablet width.", "", { cases: ["MB-02"] });
    if (mobile.smallTargets && !(axe && axe.pages.some((page) => (page.violations || []).some((rule) => rule.id === "target-size")))) {
      add("Accessibility", "risk", "low", "a11y-targets", plural(mobile.smallTargets, "tap target is", "tap targets are") + " too small on a phone",
        "axe-core target-size at " + mobile.width + " px" + (mobile.targetSamples.length ? ", for example " + mobile.targetSamples.slice(0, 2).join(" and ") : "") + ".",
        AXE_FIX["target-size"], { count: mobile.smallTargets, effort: "hours", cases: ["MB-01"] });
    }
  }

  // GEO: the HTML compared with the rendered page.
  if (start.renderedWords > 150) {
    const thin = [{ path: start.finalPath || "/", share: start.share }].concat((b.pages || []).filter((page) => page.renderedWords > 150).map((page) => ({ path: page.path, share: page.share }))).filter((page) => page.share < 40);
    if (thin.length) add("GEO", "risk", "medium", "geo-rendered", "AI crawlers see only part of the text people see",
      thin.map((page) => page.path + " (" + page.share + "%)").slice(0, 3).join(", ") + ". The share is words in the HTML compared with words on the rendered page. Most AI crawlers do not run JavaScript.",
      "Render the main content on the server or pre-render it at build time.", { pages: thin.map((page) => page.path), effort: "days", cases: ["GEO-03"] });
    else add("GEO", "pass", "info", "geo-rendered", "The HTML carries the text people see", "The start page HTML holds " + start.share + "% of the words on the rendered page.", "", { cases: ["GEO-03"] });
    const dom = start.dom;
    const rawLinks = ((ctx.face && ctx.face.links) || []).length;
    if (dom && dom.links.length >= 5 && rawLinks < Math.max(3, dom.links.length / 4)) add("SEO", "risk", "medium", "seo-links-js", "Most links appear only after JavaScript runs",
      "The HTML lists " + plural(rawLinks, "same-host link") + "; the rendered page lists " + dom.links.length + ". Crawlers that skip JavaScript cannot find the other pages" + (ctx.renderedCrawl ? "; this review followed the rendered links instead." : ", and this review's crawl could not follow them either."),
      "Render navigation as plain <a href> links in the server HTML, and keep the sitemap complete.", { effort: "days", cases: ["LK-01", "SEO-03"] });
    if (start.h1 && start.h1InHtml === false) add("GEO", "risk", "low", "geo-h1-rendered", "The main heading appears only after JavaScript", "\"" + start.h1 + "\" is on the rendered page but not in the HTML.", "Put the h1 in the server HTML.", { effort: "hours", cases: ["GEO-03"] });
  }

  // Performance: lab vitals and what broke while loading.
  const vitals = start.vitals || {};
  const lab = "Measured once in " + where + " with no network throttling. A phone on mobile data will be slower.";
  if (vitals.lcp) {
    const secs = (vitals.lcp / 1000).toFixed(1) + " s";
    if (vitals.lcp > 4000) add("Performance", "fail", "medium", "pf-lcp", "The largest element paints after " + secs, lab, "Serve the hero image in a modern format at the shown size, preload it, and cut render-blocking scripts.", { effort: "days" });
    else if (vitals.lcp > 2500) add("Performance", "risk", "low", "pf-lcp", "The largest element paints after " + secs, lab + " Good is under 2.5 s.", "Preload the hero image and defer scripts that do not affect the first view.", { effort: "hours" });
    else add("Performance", "pass", "info", "pf-lcp", "The largest element paints in " + secs, lab, "");
  }
  if (vitals.cls != null && start.status) {
    if (vitals.cls > 0.25) add("Performance", "fail", "medium", "pf-cls-lab", "The layout shifts by " + vitals.cls + " while loading", lab + " Good is under 0.1.", "Reserve space for images, ads, embeds, and late banners.", { effort: "hours", cases: ["VIS-01"] });
    else if (vitals.cls > 0.1) add("Performance", "risk", "low", "pf-cls-lab", "The layout shifts by " + vitals.cls + " while loading", lab + " Good is under 0.1.", "Reserve space for images, ads, embeds, and late banners.", { effort: "hours", cases: ["VIS-01"] });
    else add("Performance", "pass", "info", "pf-cls-lab", "The layout holds still while loading", "Cumulative Layout Shift " + vitals.cls + ". " + lab, "", { cases: ["VIS-01"] });
  }
  if (vitals.tbt > 600) add("Performance", "risk", "low", "pf-tbt", "Scripts block the page for " + vitals.tbt + " ms", "Long tasks while loading add up to " + vitals.tbt + " ms of blocking time. " + lab, "Split large bundles and defer third-party scripts.", { effort: "days", cases: ["PF-02"] });
  const failed = b.failed || {};
  if (failed.count) {
    const broken = (failed.samples || []).some((row) => row.type === "script" || row.type === "stylesheet" || row.status >= 500);
    add("Performance", "risk", broken ? "medium" : "low", "pf-failed", plural(failed.count, "resource fails", "resources fail") + " to load",
      (failed.samples || []).slice(0, 3).map((row) => row.url + " (" + (row.status || row.error) + ")").join(", ") + ".", "Fix or remove the broken references.", { count: failed.count, effort: "minutes" });
  }
  const errors = b.console || {};
  if (errors.errors) add("Performance", "risk", "low", "pf-console", plural(errors.errors, "JavaScript error", "JavaScript errors") + " while loading",
    (errors.samples || []).slice(0, 2).join(" | ") + ".", "Open the browser console on the start page and fix the errors in order.", { count: errors.errors, effort: "hours" });

  // Security: what the browser actually requested over plain http.
  const mixed = b.mixed || {};
  if (mixed.count) add("Security", "fail", "medium", "sec-mixed-live", "The browser requested plain http resources", sample(mixed.samples, 3) + ".", "Load every resource over https.", { count: mixed.count, effort: "minutes", cases: ["SEC-09"] });
  else if (start.status) add("Security", "pass", "info", "sec-mixed-live", "Every request in the browser used https", plural(start.requests || 0, "request") + " on the start page.", "", { cases: ["SEC-09"] });
}

const FIELD_NAMES = { lcp: "Largest Contentful Paint", inp: "Interaction to Next Paint", cls: "Cumulative Layout Shift" };
const FIELD_FIX = {
  lcp: "Make the largest element arrive sooner: preload the hero image, serve it at the shown size in a modern format, and cut render-blocking scripts.",
  inp: "Break up long JavaScript tasks behind clicks and taps, and defer third-party scripts.",
  cls: "Reserve space for images, embeds, ads, and late banners."
};
const FIELD_CASES = { lcp: "PF-01", inp: "PF-02", cls: "VIS-01" };
const FIELD_WORD = { FAST: "good", AVERAGE: "needs improvement", SLOW: "poor" };

const THREAT_WORDS = { MALWARE: "malware", SOCIAL_ENGINEERING: "phishing", UNWANTED_SOFTWARE: "unwanted software" };

// Safe Browsing status, the domain's registration, and how mail to the domain is protected in transit.
function domainChecks(extras, dnsInfo, dnsRead, add) {
  const end = (text) => String(text).replace(/\.*$/, ".");
  const sb = extras.safeBrowsing;
  if (sb && sb.ok) {
    const words = sb.threats.map((item) => THREAT_WORDS[item] || item.toLowerCase().replace(/_/g, " "));
    if (words.length) add("Security", "fail", "critical", "sec-safebrowsing", "Google lists the site as " + words.join(" and "),
      "Google's Safe Browsing lists, read through the Web Risk API, match " + sb.url + " as " + words.join(" and ") + ". Chrome, Firefox and Safari show a red warning page instead of the site, and Google Search can label it.",
      "Find and remove the cause using the Security issues report in Google Search Console, then request a review there.", { effort: "days", cases: ["SEC-11"] });
    else add("Security", "pass", "info", "sec-safebrowsing", "Google's Safe Browsing lists do not flag the site", "The Web Risk API found " + sb.url + " on no malware, phishing or unwanted-software list.", "", { cases: ["SEC-11"] });
  }
  const dom = extras.domain;
  if (dom && dom.read) {
    const at = dom.registrar ? " at " + dom.registrar : "";
    const held = dom.domain + (dom.registrar ? ", held with " + dom.registrar + "," : "");
    if (dom.expires && dom.daysLeft < 0) add("Security", "fail", "high", "sec-domain-expiry", "The domain registration has expired",
      held + " expired on " + dom.expires + ", according to the registry's RDAP record. The site and its mail stop working when the grace period ends, and anyone can then register the name.", "Renew the domain now and turn on automatic renewal.", { effort: "minutes", cases: ["SEC-12"] });
    else if (dom.expires && dom.daysLeft < 30) add("Security", "risk", dom.daysLeft < 7 ? "high" : "medium", "sec-domain-expiry", "The domain expires in " + plural(dom.daysLeft, "day"),
      held + " is registered until " + dom.expires + ", according to the registry's RDAP record.", "Confirm that automatic renewal is on and the payment method on file is valid.", { effort: "minutes", cases: ["SEC-12"] });
    else if (dom.expires) add("Security", "pass", "info", "sec-domain-expiry", "The domain is registered for " + plural(dom.daysLeft, "more day"), held + " is registered until " + dom.expires + ".", "", { cases: ["SEC-12"] });
    if (dom.locked === false) add("Security", "risk", "low", "sec-domain-lock", "The domain has no transfer lock",
      "The RDAP status of " + dom.domain + " is " + (dom.status.join(", ") || "empty") + ", with no clientTransferProhibited. A hijacked registrar account or a forged request can move the domain away.", end("Turn on the transfer lock" + at), { effort: "minutes", cases: ["SEC-12"] });
    else if (dom.locked) add("Security", "pass", "info", "sec-domain-lock", "The domain is locked against transfer", "The RDAP status of " + dom.domain + " includes " + dom.status.filter((item) => /transfer/i.test(item)).join(", ") + ".", "", { cases: ["SEC-12"] });
  }
  if (!dnsInfo || !dnsInfo.domain || !dnsRead("mx") || !(dnsInfo.mx || []).length) return;
  const domain = dnsInfo.domain;
  if (dnsRead("mta-sts")) {
    const policy = dnsInfo.mtaStsPolicy || {};
    if (!dnsInfo.mtaSts) add("Security", "risk", "low", "sec-mta-sts", "No MTA-STS policy protects mail sent to the domain",
      domain + " receives mail but publishes no _mta-sts TXT record. Sending servers fall back to unencrypted delivery if an attacker on the path strips STARTTLS.", "Publish an MTA-STS policy in mode: testing with a TLS-RPT address, then move to enforce once reports are clean.", { effort: "hours", cases: ["SEC-13"] });
    else if (!policy.mode) add("Security", "risk", "low", "sec-mta-sts", "MTA-STS is announced but its policy could not be read",
      "_mta-sts." + domain + " publishes " + dnsInfo.mtaSts + ", but " + (policy.url || "the policy file") + " could not be used: " + end(policy.error || "no answer") + " Senders ignore a policy they cannot fetch.", "Serve the policy as text over https at mta-sts." + domain + "/.well-known/mta-sts.txt, without a redirect.", { effort: "hours", cases: ["SEC-13"] });
    else if (policy.mode === "enforce") add("Security", "pass", "info", "sec-mta-sts", "MTA-STS makes senders use TLS for mail to the domain", "The policy at " + policy.url + " is in enforce mode.", "", { cases: ["SEC-13"] });
    else add("Security", "risk", "low", "sec-mta-sts", policy.mode === "testing" ? "MTA-STS only reports and does not enforce" : "MTA-STS is switched off",
      "The policy at " + policy.url + " is in " + policy.mode + " mode, so senders still deliver without TLS when STARTTLS is stripped.", "Move the policy to mode: enforce once TLS-RPT reports show no failures.", { effort: "minutes", cases: ["SEC-13"] });
  }
  if (dnsRead("tlsrpt")) {
    if (dnsInfo.tlsRpt) add("Security", "pass", "info", "sec-tlsrpt", "TLS-RPT sends reports of failed secure deliveries", dnsInfo.tlsRpt.slice(0, 120) + ".", "", { cases: ["SEC-13"] });
    else add("Security", "risk", "low", "sec-tlsrpt", "No TLS-RPT address receives reports of failed secure deliveries",
      "_smtp._tls." + domain + " has no v=TLSRPTv1 record, so nobody hears when senders cannot deliver mail over TLS.", "Publish TXT \"v=TLSRPTv1; rua=mailto:tlsrpt@" + domain + "\" at _smtp._tls." + domain + ".", { effort: "minutes", cases: ["SEC-13"] });
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
    const evidence = "Real Chrome users over the last 28 days" + (field.scope === "page" ? " on this page" : " across the whole site, because this page has too little traffic on its own") + ", at the 75th percentile: " +
      keys.map((key) => FIELD_NAMES[key] + " " + show(key, field[key]) + " (" + (FIELD_WORD[field[key].category] || "unrated") + ")").join(", ") + ". Source: Chrome UX Report through PageSpeed Insights.";
    const worst = slow.concat(average);
    const fix = worst.map((key) => FIELD_FIX[key]).join(" ");
    const cases = (worst.length ? worst : keys).map((key) => FIELD_CASES[key]);
    if (slow.length) add("Performance", "fail", "medium", "pf-field", "Core Web Vitals fail for real visitors", evidence, fix, { effort: "days", cases });
    else if (average.length) add("Performance", "risk", "low", "pf-field", "Core Web Vitals need improvement for real visitors", evidence, fix, { effort: "hours", cases });
    else add("Performance", "pass", "info", "pf-field", "Core Web Vitals pass for real visitors", evidence, "", { cases });
  } else {
    add("Performance", "person", "info", "pf-field", "Too few Chrome visits for real-user Core Web Vitals", "The Chrome UX Report publishes numbers only after a page or site has enough traffic over 28 days. The Lighthouse lab run below stands in.", "");
  }
  const lab = psi.lab || {};
  const parts = [];
  if (lab.lcp != null) parts.push("Largest Contentful Paint " + (lab.lcp / 1000).toFixed(1) + " s");
  if (lab.tbt != null) parts.push("Total Blocking Time " + Math.round(lab.tbt) + " ms");
  if (lab.cls != null) parts.push("Cumulative Layout Shift " + lab.cls);
  if (lab.si != null) parts.push("Speed Index " + (lab.si / 1000).toFixed(1) + " s");
  const evidence = "Lighthouse " + (psi.version || "") + " on a simulated mid-range phone over slow 4G" + (parts.length ? ": " + parts.join(", ") : "") + ".";
  const title = "Lighthouse scores performance " + psi.score + "/100 on mobile";
  const fix = "Open PageSpeed Insights for this URL and work through its opportunities, largest savings first.";
  if (psi.score < 50) add("Performance", "fail", "medium", "pf-lighthouse", title, evidence, fix, { effort: "days", cases: ["PF-01", "PF-02"] });
  else if (psi.score < 90) add("Performance", "risk", "low", "pf-lighthouse", title, evidence, fix, { effort: "hours", cases: ["PF-01", "PF-02"] });
  else add("Performance", "pass", "info", "pf-lighthouse", title, evidence, "", { cases: ["PF-01", "PF-02"] });
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
  const add = (area, verdict, severity, key, title, evidence, fix, opts) => {
    const extra = opts || {};
    findings.push({
      key,
      area,
      verdict,
      severity: verdict === "pass" ? "info" : severity,
      title,
      evidence,
      fix: fix || "",
      effort: extra.effort || "hours",
      pages: (extra.pages || []).slice(0, 12),
      count: extra.count == null ? (extra.pages || []).length : extra.count,
      cases: extra.cases || []
    });
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
    if (!f) return { path, status: page.status || 0, indexable: false, reason: page.challenge ? page.challenge + " bot check" : page.error || "Not read" };
    const directives = [f.seo && f.seo.robots, f.seo && f.seo.googlebot, f.seo && f.seo.xRobots].filter(Boolean).join(", ").toLowerCase();
    const noindex = /\bnoindex\b|(^|[\s,])none([\s,]|$)/.test(directives);
    const canonical = f.seo && f.seo.canonicalAbs ? normal(f.seo.canonicalAbs) : "";
    const canonicalElsewhere = !!canonical && canonical !== normal(page.url);
    const canonicalShown = canonical ? shownAgainst(f.seo.canonicalAbs, page.url) : "";
    const googleBlocked = robots.groups.length ? !robotsVerdict("googlebot", pathOf(page.url), robots.groups).allowed : false;
    let reason = "Indexable";
    if (page.status < 200 || page.status >= 300) reason = "Status " + page.status;
    else if (page.challenge) reason = page.challenge + " bot check";
    else if (noindex) reason = "noindex";
    else if (googleBlocked) reason = "Blocked for Googlebot in robots.txt";
    else if (canonicalElsewhere) reason = "Canonical points to " + canonicalShown;
    return {
      path,
      status: page.status,
      indexable: reason === "Indexable",
      reason,
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
    add("SEO", "person", "info", "seo-unanswered-links", plural(unanswered.length, "internal link", "internal links") + " did not answer in time",
      unanswered.slice(0, 5).map((page) => (page.path || page.url) + ": " + (page.error || "no answer")).join(". ") + ". A slow answer in one analysis is not proof the page is broken.",
      "Open each address again. If it stays slow, look at the server or cache for that path.",
      { pages: unanswered.map((page) => page.path || page.url), cases: ["FN-06", "LK-01"] });
  }
  if (blocked.length) {
    add("SEO", "person", "info", "seo-blocked-links", plural(blocked.length, "internal link was", "internal links were") + " blocked for this reader",
      sample(blocked.map((page) => (page.path || page.url) + " (" + blockedReason(page) + ")"), 4) + ". A block aimed at automated readers is not proof the page is broken, and those pages were not scored.",
      "Open each address in a browser. If people get through, only automated readers are stopped; allow verified crawlers if search and AI answers should reach those pages.",
      { pages: blocked.map((page) => page.path || page.url), cases: ["FN-06", "LK-01"] });
  }
  const partialRead = linked.length >= 2 && blocked.length * 2 > linked.length;
  const warnings = [];
  if (home.readInBrowser) warnings.push(home.readInBrowser === "untagged" ? UNTAGGED_READ_NOTE : home.readInBrowser === "slow" ? SLOW_READ_NOTE : BROWSER_READ_NOTE);
  if (home.slow) warnings.push(SLOW_CUT_NOTE);
  else if (home.cut) warnings.push(CUT_NOTE);
  if (home.renderedLinks) warnings.push(SHELL_NOTE);
  if (home.challenge) warnings.push("The start page answered with " + botCheck(home.challenge) + " instead of the site, so these scores describe that check page.");
  if (partialRead) warnings.push("Partial analysis: " + blocked.length + " of " + plural(linked.length, "linked page") + " answered with a bot check or a block, so the scores rest mostly on the start page.");
  if (broken.length) {
    add("SEO", "fail", "high", "seo-broken-links", plural(broken.length, "internal link leads", "internal links lead") + " to an error",
      broken.slice(0, 5).map(({ page, index }) => (page.path || page.url) + " answered " + (page.status || page.error || "nothing") + (sources.get(index) ? ", linked from " + sample(sources.get(index), 2) : "")).join(". ") + ".",
      "Fix or remove each link, or redirect the old address with a 301 to the closest live page.",
      { pages: broken.map(({ page }) => page.path || page.url), effort: "hours", cases: ["FN-06", "LK-01"] });
  } else if (pages.length > 1 && !unanswered.length && !blocked.length) {
    add("SEO", "pass", "info", "seo-broken-links", "Every internal link that was opened answered", plural(pages.length - 1, "linked page") + " answered without an error.", "", { cases: ["FN-06", "LK-01"] });
  }

  const redirected = pages.filter((page) => page.depth > 0 && page.hops > 0 && !blockedAnswer(page));
  if (redirected.length) {
    add("SEO", "risk", "low", "seo-internal-redirects", plural(redirected.length, "internal link goes", "internal links go") + " through a redirect",
      redirected.slice(0, 4).map((page) => pathOf(page.requested || "") + " → " + page.path).join(", ") + ". Each hop costs crawl budget and a little speed.",
      "Point the links straight at the final address.", { pages: redirected.map((page) => page.path), effort: "minutes" });
  }

  if ((home.hops || 0) >= 2) {
    add("SEO", "risk", "low", "seo-redirect-chain", "The start address takes " + home.hops + " redirects to answer",
      "The address you entered redirected " + home.hops + " times before " + home.path + " answered.",
      "Redirect the old address in one hop to the final https URL.", { effort: "minutes" });
  }

  const noindexRows = indexability.filter((row) => row.reason === "noindex");
  if (noindexRows.length) {
    const homeBlocked = noindexRows.some((row) => row.path === home.path);
    add("SEO", homeBlocked ? "fail" : "risk", homeBlocked ? "critical" : "medium", "seo-noindex", homeBlocked ? "The start page tells search engines not to index it" : plural(noindexRows.length, "page asks", "pages ask") + " search engines not to index it",
      sample(noindexRows.map((row) => row.path + " (" + row.robots + ")"), 4) + ".",
      "Remove noindex from pages that should be found, and keep it only on private or duplicate pages.", { pages: noindexRows.map((row) => row.path), effort: "minutes", cases: ["SEO-04"] });
  }

  const canonicalAway = indexability.filter((row) => /^Canonical points/.test(row.reason) && row.path.indexOf("?") === -1);
  if (canonicalAway.length) {
    add("SEO", "risk", "medium", "seo-canonical-away", plural(canonicalAway.length, "page names", "pages name") + " another URL as canonical",
      sample(canonicalAway.map((row) => row.path + " → " + row.canonical), 4) + ". Search engines will usually index the other URL instead.",
      "Make each page's canonical point at itself unless it is a real duplicate.", { pages: canonicalAway.map((row) => row.path), effort: "minutes", cases: ["CT-02"] });
  }
  const noCanonical = read.filter((page) => !(page.inspect.seo && page.inspect.seo.canonicalAbs));
  if (noCanonical.length && read.length) {
    add("SEO", "risk", "low", "seo-canonical-missing", plural(noCanonical.length, "page has", "pages have") + " no canonical link",
      sample(noCanonical.map((page) => page.path), 4) + ". Without it, tracking parameters and trailing slashes can split ranking signals.",
      "Add <link rel=\"canonical\" href=\"…\"> with the page's own https URL.", { pages: noCanonical.map((page) => page.path), effort: "minutes", cases: ["CT-02"] });
  }

  const untitled = read.filter((page) => !page.inspect.title);
  if (untitled.length) {
    add("SEO", "fail", "high", "seo-title-missing", plural(untitled.length, "page has", "pages have") + " no title", sample(untitled.map((page) => page.path), 4) + ".",
      "Give every page a unique title of about 30 to 60 characters.", { pages: untitled.map((page) => page.path), effort: "minutes", cases: ["FN-02", "FN-07"] });
  }
  else if (read.length) add("SEO", "pass", "info", "seo-title-missing", "Every page has a title", plural(read.length, "page") + " checked.", "", { cases: ["FN-02", "FN-07"] });
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
    add("SEO", "risk", "medium", "seo-duplicate-titles", plural(dupTitles.length, "title is", "titles are") + " shared by more than one page",
      dupTitles.slice(0, 3).map((item) => "\"" + item.value.slice(0, 70) + "\" on " + sample(item.paths, 3)).join(". ") + ".",
      "Write a title that names what is different about each page.", { pages: [].concat.apply([], dupTitles.map((item) => item.paths)), effort: "hours", cases: ["FN-08"] });
  }
  const noDescription = read.filter((page) => !page.inspect.description);
  if (noDescription.length) {
    add("SEO", "risk", "medium", "seo-description-missing", plural(noDescription.length, "page has", "pages have") + " no meta description",
      sample(noDescription.map((page) => page.path), 4) + ". Google and AI answers then write their own snippet from whatever text they find.",
      "Write a 50 to 160 character description for each page that says what a reader gets.", { pages: noDescription.map((page) => page.path), effort: "hours", cases: ["CT-01"] });
  }
  else if (read.length) add("SEO", "pass", "info", "seo-description-missing", "Every page has a meta description", plural(read.length, "page") + " checked.", "", { cases: ["CT-01"] });
  if (dupDescriptions.length) {
    add("SEO", "risk", "low", "seo-duplicate-descriptions", plural(dupDescriptions.length, "description is", "descriptions are") + " shared by more than one page",
      dupDescriptions.slice(0, 2).map((item) => "\"" + item.value.slice(0, 70) + "…\" on " + sample(item.paths, 3)).join(". ") + ".",
      "Describe each page on its own.", { pages: [].concat.apply([], dupDescriptions.map((item) => item.paths)), effort: "hours", cases: ["CT-01"] });
  }
  const longTitles = read.filter((page) => (page.inspect.title || "").length > 65);
  if (longTitles.length) {
    add("SEO", "risk", "low", "seo-title-length", plural(longTitles.length, "title runs", "titles run") + " past about 60 characters",
      sample(longTitles.map((page) => page.path + " (" + page.inspect.title.length + ")"), 4) + ". Google cuts them with an ellipsis.",
      "Lead with the words that matter and keep titles near 60 characters.", { pages: longTitles.map((page) => page.path), effort: "minutes" });
  }
  const thin = read.filter((page) => page.depth > 0 && indexablePaths.has(page.path) && (page.inspect.words || 0) < 150);
  if (thin.length) {
    add("SEO", "risk", "low", "seo-thin", plural(thin.length, "indexable page carries", "indexable pages carry") + " fewer than 150 words in the HTML",
      sample(thin.map((page) => page.path + " (" + (page.inspect.words || 0) + " words)"), 4) + ".",
      "Add useful copy, merge thin pages, or mark them noindex.", { pages: thin.map((page) => page.path), effort: "days" });
  }

  // Sitemap compared with the crawl.
  const sitemap = extras.sitemap || {};
  const sitemapSet = new Set((sitemap.urls || []).map(normal));
  const sitemapReport = { found: !!(sitemap.urls && sitemap.urls.length), source: sitemap.source || "", count: (sitemap.urls || []).length, status: sitemap.status || 0, partial: !!sitemap.partial, notListed: [], listedNotIndexable: [], notLinked: [], offHost: 0 };
  if (sitemapReport.found) {
    sitemapReport.offHost = (sitemap.urls || []).filter((url) => hostOf(url) !== host).length;
    // A partial read cannot prove a page is absent from the rest of the sitemap.
    if (!sitemapReport.partial) sitemapReport.notListed = indexable.filter((row) => !sitemapSet.has(normal(origin + row.path))).map((row) => row.path).slice(0, 40);
    sitemapReport.listedNotIndexable = indexability.filter((row) => !row.indexable && sitemapSet.has(normal(origin + row.path))).map((row) => row.path + " (" + row.reason + ")").slice(0, 40);
    const linked = new Set();
    pages.forEach((page) => ((page.inspect && page.inspect.links) || []).forEach((link) => linked.add(normal(link))));
    linked.add(normal(home.url));
    sitemapReport.notLinked = (sitemap.urls || []).filter((url) => hostOf(url) === host && !linked.has(normal(url))).map(pathOf).slice(0, 40);
    if (sitemapReport.listedNotIndexable.length) {
      add("SEO", "risk", "medium", "seo-sitemap-dirty", "The sitemap lists " + plural(sitemapReport.listedNotIndexable.length, "page") + " search engines should not index",
        sample(sitemapReport.listedNotIndexable, 4) + ".", "List only live, canonical, indexable URLs in the sitemap.", { pages: sitemapReport.listedNotIndexable, effort: "minutes", cases: ["SEO-03"] });
    }
    if (sitemapReport.notListed.length) {
      add("SEO", "risk", "low", "seo-sitemap-missing-pages", plural(sitemapReport.notListed.length, "indexable page is", "indexable pages are") + " missing from the sitemap",
        sample(sitemapReport.notListed, 4) + ".", "Add them to the sitemap or regenerate it on each deploy.", { pages: sitemapReport.notListed, effort: "minutes", cases: ["SEO-03"] });
    }
    if (sitemapReport.offHost) {
      const offHosts = {};
      (sitemap.urls || []).map(hostOf).filter((name) => name !== host).forEach((name) => { offHosts[name || "an unreadable URL"] = (offHosts[name || "an unreadable URL"] || 0) + 1; });
      add("SEO", "risk", "medium", "seo-sitemap-offhost", plural(sitemapReport.offHost, "sitemap URL points", "sitemap URLs point") + " at another host or scheme",
        "In " + pathOf(sitemapReport.source) + ": " + sample(Object.keys(offHosts).sort((a, b) => offHosts[b] - offHosts[a]).map((name) => name + " (" + offHosts[name] + ")"), 3) + ". The sitemap should list only URLs on https://" + host + ".", "Regenerate the sitemap with the production https host.", { count: sitemapReport.offHost, effort: "minutes", cases: ["SEO-03"] });
    }
    if (!sitemapReport.listedNotIndexable.length && !sitemapReport.notListed.length && !sitemapReport.offHost) {
      if (sitemapReport.partial) add("SEO", "pass", "info", "seo-sitemap", "A sitemap answers with valid URLs", "The first " + plural(sitemapReport.count, "URL") + " from " + pathOf(sitemapReport.source) + " were analyzed; the sitemap is larger than one review analyzes.", "", { cases: ["SEO-03"] });
      else add("SEO", "pass", "info", "seo-sitemap", "The sitemap matches the pages that were analyzed", plural(sitemapReport.count, "URL") + " in " + pathOf(sitemapReport.source) + ".", "", { cases: ["SEO-03"] });
    }
  } else {
    add("SEO", "risk", "medium", "seo-sitemap", "No sitemap was found",
      (robots.sitemaps.length ? "robots.txt names " + robots.sitemaps[0] + " but it did not return URLs." : "robots.txt names no sitemap and /sitemap.xml returned " + (sitemap.status || "nothing") + "."),
      "Publish /sitemap.xml and add a Sitemap: line to robots.txt.", { effort: "hours", cases: ["SEO-03"] });
  }

  // Language alternates.
  const hreflangIssues = [];
  read.forEach((page) => {
    const alts = (page.inspect.seo && page.inspect.seo.hreflang) || [];
    if (!alts.length || !indexablePaths.has(page.path)) return;
    const selfRef = alts.some((alt) => normal(alt.href) === normal(page.url));
    if (!selfRef) hreflangIssues.push(page.path + " has no self reference");
    alts.forEach((alt) => {
      if (!/^(x-default|[a-z]{2,3}(-[a-z]{4})?(-[a-z0-9]{2,4})?)$/i.test(alt.lang)) hreflangIssues.push(page.path + " uses an invalid code \"" + alt.lang + "\"");
      const target = byUrl.get(normal(alt.href));
      if (!target || !target.inspect || target === page || !indexablePaths.has(target.path)) return;
      const back = ((target.inspect.seo && target.inspect.seo.hreflang) || []).some((other) => normal(other.href) === normal(page.url));
      if (!back) hreflangIssues.push(target.path + " does not link back to " + page.path);
    });
  });
  if (hreflangIssues.length) {
    add("SEO", "risk", "medium", "seo-hreflang", plural(hreflangIssues.length, "language alternate problem"), sample(hreflangIssues, 3) + ".",
      "Each language version must list every version, itself included, and each must link back.", { count: hreflangIssues.length, effort: "hours", cases: ["SEO-02"] });
  } else if (read.some((page) => ((page.inspect.seo && page.inspect.seo.hreflang) || []).length)) {
    add("SEO", "pass", "info", "seo-hreflang", "Language alternates point at each other", "Every alternate that was analyzed links back.", "", { cases: ["SEO-02"] });
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
          .map((prop) => Array.isArray(prop) ? prop.join(" or ") : prop);
        if (missing.length) schemaGaps.push(page.path + " " + type + " lacks " + missing.join(", "));
      });
    });
  });
  if (schemaErrors) {
    const brokenOn = read.filter((page) => page.inspect.schema && page.inspect.schema.errors).map((page) => page.path);
    add("SEO", "fail", "medium", "seo-schema-parse", plural(schemaErrors, "JSON-LD block does", "JSON-LD blocks do") + " not parse",
      "On " + sample(brokenOn, 4) + ". A block that is not valid JSON is ignored by Google and by AI crawlers.", "Validate each block with the Schema Markup Validator and fix the JSON.", { pages: brokenOn, count: schemaErrors, effort: "minutes", cases: ["CT-04"] });
  }
  if (schemaGaps.length) {
    add("SEO", "risk", "medium", "seo-schema-props", plural(schemaGaps.length, "structured data item misses", "structured data items miss") + " a property Google expects",
      sample(schemaGaps, 3) + ".", "Fill the missing properties so the item qualifies for rich results.", { count: schemaGaps.length, effort: "hours", cases: ["CT-04"] });
  }
  if (!schemaTypes.size) {
    add("SEO", "risk", "low", "seo-schema", "No structured data was found", "No JSON-LD block was found on the pages that were analyzed.",
      "Add Organization or Person, WebSite, and BreadcrumbList JSON-LD. The fix kit has a draft.", { effort: "hours", cases: ["CT-04"] });
  } else if (!schemaErrors && !schemaGaps.length) {
    add("SEO", "pass", "info", "seo-schema", "Structured data parses and carries the expected properties", "Types: " + sample([...schemaTypes], 6) + ".", "", { cases: ["CT-04"] });
  }

  // Social previews.
  const social = face.social || {};
  const socialMissing = [];
  if (!social.ogTitle) socialMissing.push("og:title");
  if (!social.ogDescription) socialMissing.push("og:description");
  if (!social.ogImage) socialMissing.push("og:image");
  if (!social.ogUrl) socialMissing.push("og:url");
  if (!social.twitterCard) socialMissing.push("twitter:card");
  if (social.ogImage && !/^https:\/\//i.test(social.ogImage)) socialMissing.push("an https og:image");
  if (socialMissing.length) {
    add("SEO", "risk", socialMissing.indexOf("og:image") !== -1 ? "medium" : "low", "seo-social", "Share cards are missing " + sample(socialMissing, 5),
      "LinkedIn, WhatsApp, Slack, and X build the preview from these tags. The preview in this report shows what they would show today.",
      "Add the missing Open Graph and Twitter tags to every page template.", { effort: "minutes", cases: ["CT-03"] });
  } else {
    add("SEO", "pass", "info", "seo-social", "Share cards have a title, description, image, and URL", "og:title, og:description, og:image, og:url, and twitter:card are present.", "", { cases: ["CT-03"] });
  }
  if (!face.icon) add("SEO", "risk", "low", "seo-favicon", "No favicon is declared", "Google shows a favicon next to each mobile result.", "Add <link rel=\"icon\" href=\"/favicon.svg\"> with a square icon.", { effort: "minutes" });

  const soft = extras.soft404 || {};
  if (soft.status === 200) {
    add("SEO", "risk", "medium", "seo-soft-404", "A missing page answers 200 instead of 404",
      "A made-up path answered 200" + (soft.title ? " with the title \"" + soft.title + "\"" : "") + ". Search engines call this a soft 404 and may index empty pages.",
      "Return status 404 (or 410) for unknown paths, with a helpful page.", { effort: "hours", cases: ["RS-01"] });
  } else if (soft.status === 404 || soft.status === 410) {
    add("SEO", "pass", "info", "seo-soft-404", "Unknown paths answer " + soft.status, "A made-up path answered " + soft.status + ".", "", { cases: ["RS-01"] });
  }

  if (!(face.signals && face.signals.viewport)) {
    add("SEO", "fail", "high", "seo-viewport", "The start page has no viewport tag", "Without it, phones render the desktop layout zoomed out. Google indexes the mobile version first.",
      "Add <meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">.", { effort: "minutes", cases: ["MB-01", "VIS-02"] });
  } else {
    add("SEO", "pass", "info", "seo-viewport", "The start page sets a mobile viewport", "A viewport meta tag is present.", "", { cases: ["MB-01", "VIS-02"] });
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
    add("GEO", "fail", "high", "geo-crawlers", plural(answerBlocked.length, "AI answer or search crawler is", "AI answer or search crawlers are") + " blocked",
      answerBlocked.map((bot) => bot.token + " (" + bot.product + ")" + (bot.rule ? " by " + bot.rule : "")).slice(0, 5).join(", ") + ". These bots fetch pages to cite them in answers. Blocked means the site is not quoted there.",
      "Allow the answer bots in robots.txt. Training bots can stay blocked if that is the policy.", { cases: ["GEO-01"], count: answerBlocked.length, effort: "minutes" });
  } else {
    add("GEO", "pass", "info", "geo-crawlers", "AI answer and search crawlers may read the start page",
      robots.groups.length ? "robots.txt does not block ChatGPT search, Claude, Perplexity, Google, or Bing at the root." : "No robots.txt rules were found, so every crawler is allowed by default.", "", { cases: ["GEO-01"] });
  }
  if (partly.length) {
    add("GEO", "risk", "medium", "geo-crawlers-partial", "Some pages are closed to AI answer crawlers",
      partly.slice(0, 4).map((bot) => bot.token + " cannot read " + plural(bot.blockedPages, "page")).join(", ") + ".",
      "Check that the closed paths are meant to stay out of AI answers.", { cases: ["GEO-01"], count: partly.length, effort: "minutes" });
  }
  if (trainingBlocked.length) {
    add("GEO", "pass", "info", "geo-training", "Model-training crawlers are blocked by choice",
      trainingBlocked.map((bot) => bot.token).join(", ") + " are disallowed. That does not stop answer bots from citing the site.", "");
  }
  const homeText = input.homeText || { text: "", chars: 0, outline: [] };
  const appShell = !!(face.signals && face.signals.appShell);
  if ((homeText.chars || 0) < 300) {
    add("GEO", "fail", "high", "geo-js-only", "AI crawlers see an almost empty start page",
      "The HTML carries " + (homeText.chars || 0) + " characters of readable text" + (appShell ? " and an empty app root, so the content is drawn by JavaScript" : "") + ". Most AI crawlers do not run JavaScript.",
      "Render the main content on the server or pre-render it at build time.", { cases: ["GEO-03", "CMP-01"], effort: "days" });
  } else if ((homeText.chars || 0) < 900) {
    add("GEO", "risk", "medium", "geo-js-only", "AI crawlers see little text on the start page",
      "The HTML carries " + homeText.chars + " characters of readable text. AI answers quote what they can read without scripts.",
      "Put the key facts (what, who, where, price, contact) in plain HTML text.", { cases: ["GEO-03", "CMP-01"], effort: "hours" });
  } else {
    add("GEO", "pass", "info", "geo-js-only", "The start page reads well without JavaScript", homeText.chars + " characters of text are in the HTML.", "", { cases: ["GEO-03", "CMP-01"] });
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
    if (!llmsReport.summary) gaps.push("a > summary line");
    if (!llmsReport.links && !llmsReport.bareLinks) gaps.push("links to key pages");
    else if (!llmsReport.links) gaps.push("Markdown [title](url) links");
    llmsReport.complete = !gaps.length;
    add("GEO", gaps.length ? "risk" : "pass", "low", "geo-llms", gaps.length ? "llms.txt exists but lacks " + gaps.join(" and ") : "llms.txt is published",
      "/llms.txt has " + plural(llmsReport.sections, "section") + " and " + plural(llmsReport.links || llmsReport.bareLinks || 0, "link") + (llmsReport.full ? ", and /llms-full.txt is present." : "."),
      gaps.length ? "Follow the llmstxt.org layout: # name, > summary, then ## sections of [title](url): note." : "", { cases: ["GEO-02"], effort: "minutes" });
  } else if (llms.status === 200 && llms.html) {
    add("GEO", "risk", "low", "geo-llms", "/llms.txt answers with an HTML page", "The address returns a web page, which usually means a catch-all route.",
      "Serve a plain-text /llms.txt. The fix kit has a draft built from this review.", { cases: ["GEO-02"], effort: "minutes" });
  } else {
    add("GEO", "risk", "low", "geo-llms", "No llms.txt was found", "/llms.txt returned " + (llms.status || "nothing") + ". It is a proposed convention that some AI tools read to find the pages that matter.",
      "Publish /llms.txt. The fix kit has a draft built from this review.", { cases: ["GEO-02"], effort: "minutes" });
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
      .map((prop) => Array.isArray(prop) ? prop.join(" or ") : prop);
    const unlisted = socialLinks.filter((link) => (entity.sameAs || []).map(normal).indexOf(normal(link)) === -1);
    if (missing.length || unlisted.length) {
      add("GEO", "pass", "info", "geo-entity-present", "A " + entity.types[0] + " entity names who is behind the site", "It is published on " + pathOf(entityPage.url) + ".", "", { cases: ["GEO-04"] });
      add("GEO", "risk", "low", "geo-entity", "The " + entity.types[0] + " entity is incomplete",
        (missing.length ? "It lacks " + missing.join(", ") + ". " : "") + (unlisted.length ? plural(unlisted.length, "profile linked on the page is", "profiles linked on the page are") + " not in sameAs (" + sample(unlisted.map(hostOf), 3) + ")." : ""),
        "Complete the entity so AI answers connect the brand to its profiles. The fix kit has a draft.", { effort: "minutes" });
    } else {
      add("GEO", "pass", "info", "geo-entity", "The " + entity.types[0] + " entity is complete", "name, url, image, and sameAs are present.", "", { cases: ["GEO-04"] });
    }
  } else {
    add("GEO", "risk", "medium", "geo-entity", "No Organization or Person entity describes who is behind the site",
      "AI answers lean on this to name the brand, its logo, and its profiles." + (socialLinks.length ? " The page links " + plural(socialLinks.length, "profile") + " that could go in sameAs." : ""),
      "Add Organization (or Person) JSON-LD with name, url, logo, and sameAs. The fix kit has a draft.", { cases: ["GEO-04"], effort: "minutes" });
  }
  const questionHeads = read.reduce((sum, page) => sum + (page.inspect.questionHeadings || 0), 0);
  const answerPage = read.find((page) => (page.inspect.questionHeadings || 0) > 0 || ((page.inspect.schema && page.inspect.schema.items) || []).some((item) => (item.types || []).some((type) => /^(FAQPage|QAPage)$/.test(type))));
  const faq = schemaTypes.has("FAQPage") || schemaTypes.has("QAPage") || schemaTypes.has("HowTo");
  if (questionHeads || faq) {
    add("GEO", "pass", "info", "geo-answers", "Some content is shaped as questions and answers",
      (faq ? "FAQ or HowTo structured data is present. " : "") + (questionHeads ? plural(questionHeads, "heading is", "headings are") + " phrased as a question." : ""), "", { cases: ["GEO-05"] });
  } else {
    add("GEO", "risk", "low", "geo-answers", "No content is shaped as questions and answers",
      "No heading on the pages analyzed is a question and no FAQ data was found. AI answers favour short, direct answers under a question.",
      "Add an FAQ block with the questions customers ask, answered in two or three sentences each.", { cases: ["GEO-05"], effort: "hours" });
  }
  const itemsOf = (page) => (page.inspect.schema && page.inspect.schema.items) || [];
  const datedPage = read.find((page) => page.inspect.dated || itemsOf(page).some((item) => item.props.indexOf("dateModified") !== -1 || item.props.indexOf("datePublished") !== -1));
  const dated = !!datedPage;
  const authored = read.some((page) => page.inspect.author) || allItems.some((item) => item.props.indexOf("author") !== -1);
  if (!dated || !authored) {
    if (dated) add("GEO", "pass", "info", "geo-dated", "Pages show when they were published or changed", "A date was found on " + pathOf(datedPage.url) + ".", "", { cases: ["GEO-06"] });
    add("GEO", "risk", "low", "geo-trust", "Pages do not say " + [!authored ? "who wrote them" : "", !dated ? "when they were updated" : ""].filter(Boolean).join(" or "),
      "Author and date signals help search engines and AI answers judge whether a page is current and credible.",
      "Show an author and a last-updated date on content pages, and add them to the JSON-LD.", { cases: dated ? [] : ["GEO-06"], effort: "hours" });
  } else {
    add("GEO", "pass", "info", "geo-trust", "Pages carry author and date signals", "An author and a published or modified date were found.", "", { cases: ["GEO-06"] });
  }
  const noai = read.filter((page) => /noai|noimageai/i.test([page.inspect.seo && page.inspect.seo.robots, page.inspect.seo && page.inspect.seo.xRobots].join(",")));
  if (noai.length) {
    add("GEO", "pass", "info", "geo-noai", plural(noai.length, "page opts", "pages opt") + " out of AI use with noai", sample(noai.map((page) => page.path), 3) + ". Few crawlers honour this tag; robots.txt is the rule they follow.", "");
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
  const homeTags = new Set(((face.analytics && face.analytics.tags) || []).map((tag) => tag.name));
  const untagged = homeTags.size ? read.filter((page) => !((page.inspect.analytics && page.inspect.analytics.tags) || []).length && !(page.inspect.analytics && page.inspect.analytics.loader)).map((page) => page.path) : [];
  if (!tags.length && consentTools.length) {
    if (!browsed) add("Analytics", "person", "info", "an-none", "Tags are probably loaded by a script", consentTools.join(", ") + " manages consent, but none of 26 known analytics tools is written in the HTML. The browser run lists what loads after the page starts.", "", { cases: ["AN-01"] });
  } else if (!tags.length) {
    add("Analytics", "risk", "low", "an-none", "No known analytics tag is in the HTML", "None of 26 known analytics tools appeared in the HTML of the pages analyzed. A tag injected later by a script would not show here.",
      "If visits matter, add a measurement tool. A cookieless one such as Plausible or Cloudflare Web Analytics avoids a consent banner.", { effort: "hours", cases: ["AN-01"] });
  } else {
    add("Analytics", "pass", "info", "an-inventory", plural(tags.length, "measurement tool was", "measurement tools were") + " found", tags.map((tag) => tag.name + (tag.ids.length ? " (" + tag.ids.join(", ") + ")" : "")).join(", ") + ".", "");
  }
  if (untagged.length) {
    add("Analytics", "risk", "medium", "an-gaps", plural(untagged.length, "page has", "pages have") + " no measurement tag while the start page does",
      sample(untagged, 4) + ". Visits to those pages are invisible in the reports.", "Load the same tag from the shared layout on every page.", { pages: untagged, effort: "minutes" });
  }
  const multiGa = read.filter((page) => ((page.inspect.analytics && page.inspect.analytics.ga4) || []).length > 1);
  const doubleLoad = read.filter((page) => (page.inspect.analytics && page.inspect.analytics.gtagLoads) > 1);
  if (multiGa.length || doubleLoad.length) {
    add("Analytics", "risk", "medium", "an-duplicate", "Analytics may count some visits twice",
      (multiGa.length ? plural(multiGa.length, "page sends", "pages send") + " to more than one GA4 property. " : "") + (doubleLoad.length ? plural(doubleLoad.length, "page loads", "pages load") + " gtag.js more than once." : ""),
      "Keep one GA4 property per site and load gtag.js once, or manage it only inside Tag Manager.", { pages: multiGa.concat(doubleLoad).map((page) => page.path), effort: "minutes" });
  }
  if (tagPages["Google Tag Manager"] && tagPages["Google Analytics 4"]) {
    add("Analytics", "risk", "low", "an-gtm-and-gtag", "GA4 is loaded directly and Tag Manager is also present",
      "If the Tag Manager container also fires a GA4 tag, page views are sent twice.", "Check the container in Tag Manager preview and keep GA4 in one place.", { effort: "minutes" });
  }
  if (tagPages["Universal Analytics"]) {
    add("Analytics", "risk", "low", "an-ua", "Universal Analytics code is still on the page", "Google stopped processing Universal Analytics data in July 2024. The code adds weight and collects nothing.",
      "Remove the UA- tag and keep GA4.", { pages: tagPages["Universal Analytics"], effort: "minutes" });
  }
  if (tracking.length && !consentTools.length && !consentMode) {
    add("Analytics", "risk", "high", "an-consent", "Tracking tags load with no consent tool in the page",
      tracking.map((tag) => tag.name).join(", ") + (tracking.length === 1 ? " appears" : " appear") + " in the HTML and no consent platform or Google Consent Mode default was found. In the EU, the UK, Brazil, and Colombia this is a legal exposure.",
      "Add a consent platform and set Google Consent Mode v2 defaults to denied before any tag loads.", { effort: "hours", cases: ["PR-03", "AN-01"] });
  } else if (googleTags.length && consentTools.length && !consentMode) {
    add("Analytics", "risk", "medium", "an-consent-mode", consentTools.join(", ") + " is present but Google Consent Mode defaults were not found",
      "Without Consent Mode v2 defaults, Google tags can fire before the visitor chooses, and Google Ads loses modelled conversions.",
      "Call gtag('consent','default',{ad_storage:'denied',analytics_storage:'denied',ad_user_data:'denied',ad_personalization:'denied'}) before the tags.", { effort: "minutes", cases: ["PR-03", "AN-01"] });
  } else if (consentMode) {
    const v2 = consentMode.v2;
    const denied = consentMode.analytics === "denied";
    add("Analytics", denied && v2 ? "pass" : "risk", denied ? "low" : "medium", "an-consent-mode",
      denied ? (v2 ? "Consent Mode v2 starts in denied" : "Consent Mode starts in denied, without the v2 signals") : "Consent Mode default grants analytics before a choice",
      "gtag consent default sets analytics_storage to " + (consentMode.analytics || "unset") + (v2 ? " and includes ad_user_data and ad_personalization." : "."),
      denied && v2 ? "" : "Default every storage type to denied and add ad_user_data and ad_personalization.", { effort: "minutes", cases: ["PR-03", "AN-01"] });
  } else if (consentTools.length) {
    add("Analytics", "pass", "info", "an-consent", "A consent tool is present", consentTools.join(", ") + " was found in the HTML.", "", { cases: ["PR-03"] });
  }
  if (tracking.length && !browsed) {
    add("Analytics", "person", "info", "an-firing", "Whether tags fire before a choice needs a browser run",
      "A raw HTML analysis can see the tags but not the requests they send. The browser run records every hit before and after consent.", "", { cases: ["AN-01"] });
  }
  const utm = extras.utm || null;
  if (utm && utm.status) {
    if (utm.kept) add("Analytics", "pass", "info", "an-utm", "Campaign parameters survive the redirects", "A visit with utm_source, utm_medium, and utm_campaign kept them on " + pathOf(utm.finalUrl) + ".", "");
    else add("Analytics", "fail", "medium", "an-utm", "Redirects strip campaign parameters",
      "A visit with ?utm_source=… ended on " + pathOf(utm.finalUrl) + " without them. Paid and email campaigns will show up as direct traffic.",
      "Keep the query string when redirecting (for example $request_uri in nginx, or :splat with query in Netlify).", { effort: "minutes" });
  }
  const pii = read.filter((page) => (page.inspect.piiLinks || 0) > 0);
  if (pii.length) {
    add("Analytics", "fail", "high", "an-pii", "Links carry email addresses in the URL",
      plural(pii.reduce((sum, page) => sum + page.inspect.piiLinks, 0), "link") + " on " + sample(pii.map((page) => page.path), 3) + " put an email address in the query string. Analytics tools record full URLs, and Google's terms forbid sending personal data.",
      "Move the email out of the URL (POST it, or use an opaque token).", { pages: pii.map((page) => page.path), effort: "hours" });
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
      cookies: jar.length,
      looseCookies: jar.filter((cookie) => !cookie.secure).length
    };
  });
  const spread = (key) => {
    const missing = headerRows.filter((row) => !row[key]);
    const text = headerRows.length < 2 ? "" : missing.length === headerRows.length ? " Missing on all " + headerRows.length + " pages analyzed." : " Missing on " + missing.length + " of " + headerRows.length + " pages analyzed.";
    return { text, pages: missing.map((row) => row.path) };
  };
  const HEADER_LABEL = { hsts: "HSTS", csp: "Content-Security-Policy", frame: "frame protection", nosniff: "X-Content-Type-Options", referrer: "Referrer-Policy", permissions: "Permissions-Policy" };
  const uneven = Object.keys(HEADER_LABEL).map((key) => {
    const missing = headerRows.filter((row) => !row[key]);
    return { key, missing, homeHas: headerRows.length ? headerRows[0][key] : false };
  }).filter((item) => item.homeHas && item.missing.length);
  if (uneven.length) {
    const lacking = [...new Set([].concat.apply([], uneven.map((item) => item.missing.map((row) => row.path))))];
    add("Security", "risk", "medium", "sec-headers-uneven", "Security headers on the start page are missing on other pages",
      uneven.map((item) => HEADER_LABEL[item.key] + " on " + plural(item.missing.length, "page")).join(", ") + ", out of " + plural(headerRows.length, "page") + " analyzed. Attackers pick the weakest page.",
      "Set the headers once at the server, CDN, or host config so every response carries them.", { pages: lacking, count: lacking.length, effort: "minutes", cases: ["SEC-02", "SEC-03", "SEC-04"] });
  }
  const httpCheck = extras.httpRedirect || null;
  if (httpCheck) {
    const hops = httpCheck.statuses && httpCheck.statuses.length ? httpCheck.statuses : [httpCheck.status];
    const answered = "http:// answered " + hops.join(" → ") + " to " + httpCheck.location + ".";
    if (httpCheck.error) add("Security", "pass", "info", "sec-http", "Plain http does not serve the site", "Port 80 did not answer, so nothing is served without encryption.", "", { cases: ["SEC-01"] });
    else if (hops.every((code) => [301, 308].indexOf(code) !== -1) && /^https:/i.test(httpCheck.location || "")) add("Security", "pass", "info", "sec-http", "Plain http redirects permanently to https", answered, "", { cases: ["SEC-01"] });
    else if (hops.every((code) => [301, 302, 303, 307, 308].indexOf(code) !== -1) && /^https:/i.test(httpCheck.location || "")) add("Security", "risk", "low", "sec-http", "Plain http redirects to https with a temporary code", answered + " A 301 or 308 tells browsers and search engines the move is permanent.", "Use a 301 redirect from http to https.", { effort: "minutes", cases: ["SEC-01"] });
    else add("Security", "fail", "high", "sec-http", "Plain http serves the site without redirecting", "http:// answered " + httpCheck.status + (httpCheck.location ? " to " + httpCheck.location : "") + ". Visitors who type the address stay unencrypted.", "Redirect every http request to https with a 301, then add HSTS.", { effort: "minutes", cases: ["SEC-01"] });
  }
  if (!hdr.hsts) add("Security", "fail", "medium", "sec-hsts", "HSTS is not sent", "strict-transport-security was absent on the start page." + spread("hsts").text + " A first visit over http can be intercepted.", "Send Strict-Transport-Security: max-age=31536000; includeSubDomains.", { pages: spread("hsts").pages, effort: "minutes", cases: ["SEC-02"] });
  else {
    const age = Number((String(hdr.hsts).match(/max-age\s*=\s*(\d+)/i) || [])[1] || 0);
    if (age < 15552000) add("Security", "risk", "low", "sec-hsts", "HSTS max-age is shorter than six months", "max-age=" + age + ".", "Raise max-age to at least 15552000 (one year is 31536000).", { effort: "minutes", cases: ["SEC-02"] });
    else add("Security", "pass", "info", "sec-hsts", "HSTS is sent with a long max-age", hdr.hsts + ".", "", { cases: ["SEC-02"] });
  }
  const csp = cspDirectives(hdr.csp);
  if (!hdr.csp) {
    add("Security", "risk", "medium", "sec-csp", "No content security policy", "content-security-policy was absent on the start page." + spread("csp").text + " Injected scripts are not limited by the browser.",
      "Start with the Report-Only policy in the fix kit, watch the reports for a week, then enforce it.", { pages: spread("csp").pages, effort: "hours", cases: ["SEC-03"] });
  } else {
    const scriptSrc = csp["script-src"] || csp["default-src"] || [];
    const issues = [];
    if (!csp["default-src"] && !csp["script-src"]) issues.push("no default-src or script-src");
    if (scriptSrc.indexOf("'unsafe-inline'") !== -1 && !scriptSrc.some((token) => /^'(nonce|sha256|sha384|sha512)-/.test(token) || token === "'strict-dynamic'")) issues.push("script-src allows 'unsafe-inline'");
    if (scriptSrc.indexOf("'unsafe-eval'") !== -1) issues.push("script-src allows 'unsafe-eval'");
    if (scriptSrc.indexOf("*") !== -1 || scriptSrc.indexOf("https:") !== -1) issues.push("script-src allows any host");
    if (!csp["object-src"] && !(csp["default-src"] || []).some((token) => token === "'none'")) issues.push("object-src is not 'none'");
    if (!csp["base-uri"]) issues.push("base-uri is not set");
    if (issues.length) add("Security", "risk", issues.some((issue) => /any host|unsafe-inline/.test(issue)) ? "medium" : "low", "sec-csp", "The content security policy has gaps", sample(issues, 5) + ".",
      "Replace 'unsafe-inline' with nonces or hashes, limit hosts, and add object-src 'none' and base-uri 'self'.", { count: issues.length, effort: "hours", cases: ["SEC-03"] });
    else add("Security", "pass", "info", "sec-csp", "The content security policy is strict", "No unsafe-inline, unsafe-eval, or wildcard was found in script-src.", "", { cases: ["SEC-03"] });
  }
  const allowFrom = hdr.frame && !framesGuarded(hdr.frame) ? "X-Frame-Options: " + hdr.frame + " was sent, but current browsers ignore ALLOW-FROM" : "";
  if (!framesGuarded(hdr.frame) && !csp["frame-ancestors"]) add("Security", "risk", "medium", "sec-frame", "Other sites can frame the page", (allowFrom ? allowFrom + " and no CSP frame-ancestors was sent" : "Neither X-Frame-Options nor CSP frame-ancestors was sent") + ", so the page can be framed for clickjacking." + spread("frame").text, allowFrom ? "Send Content-Security-Policy: frame-ancestors 'self' plus each origin allowed to frame the page, in place of ALLOW-FROM." : "Send Content-Security-Policy: frame-ancestors 'self' (and X-Frame-Options: SAMEORIGIN for old browsers).", { pages: spread("frame").pages, effort: "minutes", cases: ["SEC-04"] });
  else add("Security", "pass", "info", "sec-frame", "Framing is limited", (framesGuarded(hdr.frame) ? "X-Frame-Options: " + hdr.frame : "frame-ancestors " + csp["frame-ancestors"].join(" ")) + "." + (allowFrom ? " " + allowFrom + "." : ""), "", { cases: ["SEC-04"] });
  if (!hdr.nosniff) add("Security", "risk", "low", "sec-nosniff", "X-Content-Type-Options is not sent", "Browsers may guess a file's type and run it as script." + spread("nosniff").text, "Send X-Content-Type-Options: nosniff.", { pages: spread("nosniff").pages, effort: "minutes", cases: ["SEC-04"] });
  if (!hdr.referrer) add("Security", "risk", "low", "sec-referrer", "Referrer-Policy is not sent", "Browsers fall back to their default. An explicit policy keeps full URLs from leaking to other sites." + spread("referrer").text, "Send Referrer-Policy: strict-origin-when-cross-origin.", { pages: spread("referrer").pages, effort: "minutes", cases: ["SEC-05"] });
  if (!rawHeaders.permissions) add("Security", "risk", "low", "sec-permissions", "Permissions-Policy is not sent", "Embedded content can ask for the camera, microphone, or location." + spread("permissions").text, "Send Permissions-Policy: camera=(), microphone=(), geolocation=().", { pages: spread("permissions").pages, effort: "minutes", cases: ["SEC-08"] });
  const cookieNames = (list) => [...new Set(list.map((cookie) => cookie.name))];
  const jar = [].concat.apply([], read.map((page) => (page.inspect.cookies || []).map((cookie) => Object.assign({ path: page.path }, cookie))));
  const insecure = cookieNames(jar.filter((cookie) => !cookie.secure));
  const exposedSession = cookieNames(jar.filter((cookie) => !cookie.httpOnly && /sess|sid$|^sid|auth|token|login|jwt|csrf/i.test(cookie.name)));
  const cookiePages = [...new Set(jar.filter((cookie) => !cookie.secure || (!cookie.httpOnly && /sess|sid$|^sid|auth|token|login|jwt|csrf/i.test(cookie.name))).map((cookie) => cookie.path))];
  if (insecure.length || exposedSession.length) {
    add("Security", "risk", exposedSession.length ? "high" : "medium", "sec-cookies",
      [insecure.length ? plural(insecure.length, "cookie is", "cookies are") + " sent without Secure" : "", exposedSession.length ? plural(exposedSession.length, "session cookie is", "session cookies are") + " readable by scripts" : ""].filter(Boolean).join(", and "),
      (insecure.length ? "Without Secure: " + sample(insecure, 4) + ". " : "") + (exposedSession.length ? "Without HttpOnly: " + sample(exposedSession, 4) + ". A script injected into the page could steal the session. " : "") + "Set on " + sample(cookiePages, 3) + ".",
      "Set Secure on every cookie, and HttpOnly plus SameSite=Lax on session cookies.", { pages: cookiePages, count: insecure.length + exposedSession.length, effort: "minutes", cases: ["SEC-06"] });
  } else if (jar.length) {
    add("Security", "pass", "info", "sec-cookies", "Cookies are Secure, and session cookies are HttpOnly", plural(cookieNames(jar).length, "cookie") + " checked across " + plural(new Set(jar.map((cookie) => cookie.path)).size, "page") + ".", "", { cases: ["SEC-06"] });
  }
  const version = [hdr.server, rawHeaders.poweredBy].filter((value) => /\d+\.\d+/.test(value || ""));
  if (version.length) add("Security", "risk", "low", "sec-version", "Headers reveal a software version", version.join(", ") + ". Version numbers make it easier to match known flaws.", "Hide version numbers (server_tokens off, expose_php = Off).", { effort: "minutes", cases: ["SEC-07"] });
  const noSri = [];
  read.forEach((page) => ((page.inspect.sri && page.inspect.sri.missing) || []).forEach((h) => { if (!NO_SRI_HOSTS.test(h) && noSri.indexOf(h) === -1) noSri.push(h); }));
  if (noSri.length) add("Security", "risk", "low", "sec-sri", plural(noSri.length, "script host is", "script hosts are") + " loaded without integrity checks", sample(noSri, 4) + ". If that CDN is compromised, its code runs on the site.", "Add integrity=\"sha384-…\" and crossorigin=\"anonymous\" to fixed-version CDN scripts.", { count: noSri.length, effort: "minutes" });
  const mixed = read.filter((page) => (page.inspect.signals && page.inspect.signals.mixed) > 0);
  if (mixed.length) add("Security", "risk", "medium", "sec-mixed", plural(mixed.length, "page references", "pages reference") + " plain http resources", sample(mixed.map((page) => page.path + " (" + page.inspect.signals.mixed + ")"), 3) + ".", "Change the references to https or protocol-relative paths.", { pages: mixed.map((page) => page.path), effort: "minutes", cases: ["SEC-09"] });
  const tls = extras.tls || null;
  if (tls && tls.validTo) {
    const days = tls.daysLeft;
    if (days < 0) add("Security", "fail", "critical", "sec-tls", "The TLS certificate has expired", "It expired on " + tls.validTo + ".", "Renew the certificate now and turn on automatic renewal.", { effort: "minutes" });
    else if (days < 14) add("Security", "fail", "high", "sec-tls", "The TLS certificate expires in " + plural(days, "day"), "Valid until " + tls.validTo + (tls.issuer ? ", issued by " + tls.issuer : "") + ".", "Renew now and check that automatic renewal works.", { effort: "minutes" });
    else if (days < 30) add("Security", "risk", "medium", "sec-tls", "The TLS certificate expires in " + plural(days, "day"), "Valid until " + tls.validTo + (tls.issuer ? ", issued by " + tls.issuer : "") + ".", "Confirm that automatic renewal is scheduled.", { effort: "minutes" });
    else add("Security", "pass", "info", "sec-tls", "The TLS certificate is valid for " + plural(days, "more day"), "Valid until " + tls.validTo + (tls.issuer ? ", issued by " + tls.issuer : "") + ".", "");
  }
  if (tls && tls.missingIntermediate) {
    add("Security", "risk", "medium", "sec-tls-chain", "The server leaves out its intermediate certificate",
      "It sends its certificate without " + tls.missingIntermediate + ". Browsers fetch the missing certificate themselves, but apps, API clients, payment and webhook callers, curl and many crawlers refuse the connection with \"unable to verify the first certificate\".",
      "Install the full chain on the server: the site certificate followed by the intermediate bundle from the certificate authority.", { effort: "minutes" });
  }
  const sec = extras.securityTxt || null;
  if (sec) {
    if (sec.status === 200 && !sec.html && /contact\s*:/i.test(sec.body || "")) {
      const expires = ((sec.body || "").match(/^\s*expires\s*:\s*(.+)$/im) || [])[1];
      const past = expires && !isNaN(Date.parse(expires)) && Date.parse(expires) < Date.now();
      if (past) add("Security", "risk", "medium", "sec-securitytxt", "security.txt has expired", "Expires: " + expires.trim() + ". Researchers may ignore an expired file.", "Update the Expires field.", { effort: "minutes" });
      else add("Security", "pass", "info", "sec-securitytxt", "security.txt tells researchers how to report a flaw", "/.well-known/security.txt has a Contact line.", "");
    } else {
      add("Security", "risk", "low", "sec-securitytxt", "No security.txt", "/.well-known/security.txt " + (sec.status === 200 && sec.html ? "answered with a web page instead of a text file" : "returned " + (sec.status || "nothing")) + ". Researchers who find a flaw have no published way to report it.", "Publish /.well-known/security.txt with Contact and Expires. The fix kit has a draft.", { effort: "minutes" });
    }
  }
  const dnsInfo = extras.dns || null;
  const dnsRead = (name) => !!(dnsInfo && dnsInfo.domain) && !(dnsInfo.unread || []).includes(name);
  if (dnsInfo && dnsInfo.domain) {
    const sendsMail = (dnsInfo.mx || []).length > 0;
    const unread = dnsInfo.unread || [];
    // A lookup that timed out says nothing about the record, so it gets no finding either way.
    const mailRead = dnsRead("spf") && dnsRead("mx");
    if (mailRead && sendsMail && !dnsInfo.spf) add("Security", "risk", "medium", "sec-spf", "The domain receives mail but publishes no SPF record", dnsInfo.domain + " has MX records and no v=spf1 TXT record. Anyone can send mail that claims to be from it.", "Publish an SPF record that lists the services that send your mail.", { effort: "minutes" });
    if (mailRead && !sendsMail && !dnsInfo.spf) {
      if (dnsInfo.nullMx && /p\s*=\s*(reject|quarantine)/i.test(dnsInfo.dmarc || "")) add("Security", "pass", "info", "sec-spf", "The domain says it handles no mail", dnsInfo.domain + " publishes a null MX (MX 0 .), so it accepts no mail, and its DMARC policy turns away mail sent in its name.", "");
      else if (dnsInfo.nullMx) add("Security", "risk", "low", "sec-spf", "The domain refuses mail but does not say it sends none", dnsInfo.domain + " publishes a null MX (MX 0 .), so it accepts no mail, but it has no SPF record that rejects mail sent in its name.", "Publish TXT \"v=spf1 -all\" next to the null MX.", { effort: "minutes" });
      else add("Security", "risk", "low", "sec-spf", "The domain does not say it sends no mail", dnsInfo.domain + " has no MX and no SPF record.", "Publish TXT \"v=spf1 -all\" so mail claiming to come from it is rejected.", { effort: "minutes" });
    }
    if (!dnsInfo.dmarc && !unread.includes("dmarc")) add("Security", "risk", sendsMail ? "medium" : "low", "sec-dmarc", "No DMARC policy", "_dmarc." + dnsInfo.domain + " has no v=DMARC1 record. Spoofed mail from this domain is not rejected, and Gmail and Yahoo now expect DMARC from bulk senders.", "Start with p=none and a rua address, then move to quarantine or reject.", { effort: "minutes" });
    else if (/p\s*=\s*none/i.test(dnsInfo.dmarc)) add("Security", "risk", "low", "sec-dmarc", "DMARC only monitors", "The policy is p=none, so spoofed mail is still delivered.", "Move to p=quarantine, then p=reject, once reports look clean.", { effort: "hours" });
    else if (dnsInfo.dmarc) add("Security", "pass", "info", "sec-dmarc", "DMARC rejects or quarantines spoofed mail", dnsInfo.dmarc.slice(0, 120) + ".", "");
    if (dnsInfo.spf && sendsMail) add("Security", "pass", "info", "sec-spf", "SPF is published", dnsInfo.spf.slice(0, 120) + ".", "");
    if (!(dnsInfo.caa || []).length && !unread.includes("caa")) add("Security", "risk", "low", "sec-caa", "No CAA record limits who may issue certificates", dnsInfo.domain + " has no CAA record, so any certificate authority may issue for it.", "Add a CAA record for the authority you use, for example 0 issue \"letsencrypt.org\".", { effort: "minutes" });
    if (dnsInfo.bimi) add("Security", "pass", "info", "sec-bimi", "BIMI publishes the brand logo for inboxes", dnsInfo.bimi.slice(0, 160) + ".", "");
  }
  domainChecks(extras, dnsInfo, dnsRead, add);
  (input.alerts || []).filter((alert) => alert.level === "Leak").forEach((alert, index) => {
    add("Security", "fail", "critical", "sec-leak-" + index, alert.title, alert.detail, "Remove it from the page and rotate the secret.", { effort: "hours" });
  });

  // Accessibility
  const altPages = read.filter((page) => (page.inspect.missingAlt || 0) > 0);
  const altCount = altPages.reduce((sum, page) => sum + page.inspect.missingAlt, 0);
  if (altCount) add("Accessibility", "risk", "medium", "a11y-alt", plural(altCount, "image has", "images have") + " no alt attribute", "On " + sample(altPages.map((page) => page.path), 4) + ".", "Describe informative images. Give decorative ones alt=\"\".", { pages: altPages.map((page) => page.path), count: altCount, effort: "hours", cases: ["A11Y-01"] });
  else if (read.some((page) => page.inspect.images)) add("Accessibility", "pass", "info", "a11y-alt", "Every image has an alt attribute", "No image without alt was found.", "", { cases: ["A11Y-01"] });
  const unlabeledPages = read.filter((page) => (page.inspect.unlabeled || 0) > 0);
  if (unlabeledPages.length) add("Accessibility", "fail", "medium", "a11y-labels", plural(unlabeledPages.reduce((sum, page) => sum + page.inspect.unlabeled, 0), "form control has", "form controls have") + " no label", "On " + sample(unlabeledPages.map((page) => page.path), 4) + ". Screen readers announce them as an unnamed field.", "Pair each control with <label for>, wrap it in a label, or add aria-label.", { pages: unlabeledPages.map((page) => page.path), effort: "minutes", cases: ["FM-01"] });
  const LANG_NAMES = { en: "English", es: "Spanish", pt: "Portuguese", fr: "French", de: "German", it: "Italian" };
  const declared = String(face.lang || "").toLowerCase().split("-")[0];
  if (!face.lang) add("Accessibility", "fail", "medium", "a11y-lang", "The start page does not declare its language", "Screen readers pick the wrong voice and browsers offer the wrong translation.", "Set <html lang=\"…\">.", { effort: "minutes", cases: ["FN-04", "I18N-01"] });
  else if (LANG_NAMES[declared] && LANG_NAMES[face.textLang] && face.textLang !== declared) add("Accessibility", "risk", "medium", "a11y-lang", "The declared language does not match the text",
    "The start page declares lang=\"" + face.lang + "\" (" + LANG_NAMES[declared] + "), but its text reads as " + LANG_NAMES[face.textLang] + ". Screen readers would read it with the wrong voice.",
    "Set <html lang=\"" + face.textLang + "\">, or the variant with the region, on pages written in " + LANG_NAMES[face.textLang] + ".", { effort: "minutes", cases: ["FN-04", "I18N-01"] });
  else add("Accessibility", "pass", "info", "a11y-lang", "The start page declares its language", "lang=\"" + face.lang + "\".", "", { cases: ["FN-04", "I18N-01"] });
  if (face.signals && face.signals.zoomBlocked) add("Accessibility", "fail", "medium", "a11y-zoom", "The viewport stops people from zooming", "The viewport tag sets user-scalable=no or maximum-scale=1.", "Remove user-scalable=no and maximum-scale from the viewport tag.", { effort: "minutes" });
  const noMain = read.filter((page) => !(page.inspect.signals && page.inspect.signals.main));
  if (noMain.length) add("Accessibility", "risk", "low", "a11y-main", plural(noMain.length, "page has", "pages have") + " no main landmark", sample(noMain.map((page) => page.path), 4) + ".", "Wrap the primary content in <main>.", { pages: noMain.map((page) => page.path), effort: "minutes", cases: ["A11Y-02"] });
  const h1Off = read.filter((page) => (page.inspect.h1 || []).length !== 1);
  if (h1Off.length) add("Accessibility", "risk", "low", "a11y-h1", plural(h1Off.length, "page does", "pages do") + " not have exactly one h1", sample(h1Off.map((page) => page.path + " (" + (page.inspect.h1 || []).length + ")"), 4) + ".", "Give each page one h1 that names it.", { pages: h1Off.map((page) => page.path), effort: "minutes", cases: ["FN-03"] });
  const frames = read.filter((page) => (page.inspect.signals && page.inspect.signals.untitledFrames) > 0);
  if (frames.length) add("Accessibility", "risk", "low", "a11y-frames", "Embedded frames have no title", "On " + sample(frames.map((page) => page.path), 3) + ".", "Add title=\"…\" to each iframe.", { pages: frames.map((page) => page.path), effort: "minutes", cases: ["A11Y-05"] });
  const tabs = read.filter((page) => (page.inspect.signals && page.inspect.signals.positiveTabindex) > 0);
  if (tabs.length) add("Accessibility", "risk", "low", "a11y-tabindex", "Positive tabindex reorders the keyboard path", "On " + sample(tabs.map((page) => page.path), 3) + ".", "Use tabindex=\"0\" or the natural order.", { pages: tabs.map((page) => page.path), effort: "minutes" });
  if (!(browsed && browsed.axe && browsed.axe.ran)) add("Accessibility", "person", "info", "a11y-render", "Contrast, focus order, and screen-reader output need a rendered page", "These are measured in the browser run with axe-core and a keyboard pass.", "", { cases: ["A11Y-04"] });

  // Performance
  const homeMs = home.ms || 0;
  if (homeMs > 1800) add("Performance", "fail", "medium", "pf-home", "The start page took " + homeMs + " ms to arrive", "That is the HTML alone, before images and scripts.", "Cache the HTML at the edge, or speed up the server render.", { effort: "days", cases: ["PF-01"] });
  else if (homeMs > 800) add("Performance", "risk", "low", "pf-home", "The start page took " + homeMs + " ms to arrive", "Good sites deliver the HTML in under 800 ms.", "Cache the HTML at the edge.", { effort: "hours", cases: ["PF-01"] });
  else add("Performance", "pass", "info", "pf-home", "The start page arrived in " + homeMs + " ms", "Under the 800 ms budget for the HTML.", "", { cases: ["PF-01"] });
  const slow = read.filter((page) => page.depth > 0 && page.ms > 1800);
  if (slow.length) add("Performance", "risk", "medium", "pf-slow", plural(slow.length, "page took", "pages took") + " longer than 1.8 s", sample(slow.map((page) => page.path + " (" + page.ms + " ms)"), 4) + ".", "Profile those templates; they are slower than the rest of the site.", { pages: slow.map((page) => page.path), effort: "days", cases: ["PF-03"] });
  const heavy = read.filter((page) => (page.inspect.bytes || 0) > 500000);
  if (heavy.length) add("Performance", "risk", "low", "pf-weight", plural(heavy.length, "HTML document is", "HTML documents are") + " heavier than 500 KB", sample(heavy.map((page) => page.path + " (" + Math.round(page.inspect.bytes / 1024) + " KB)"), 3) + ".", "Move inline data and SVG out of the HTML.", { pages: heavy.map((page) => page.path), effort: "hours" });
  const blocking = face.signals ? face.signals.blockingScripts || 0 : 0;
  if (blocking > 2) add("Performance", "risk", "low", "pf-blocking", plural(blocking, "script blocks", "scripts block") + " the first paint", "They sit in <head> without async or defer.", "Add defer to scripts that do not need to run before the page shows.", { count: blocking, effort: "minutes", cases: ["PF-02"] });
  const noSize = face.signals ? face.signals.imgNoSize || 0 : 0;
  if (noSize > 3) add("Performance", "risk", "low", "pf-cls", plural(noSize, "image has", "images have") + " no width or height", "The layout jumps when they load, which hurts Cumulative Layout Shift.", "Set width and height (or aspect-ratio) on images.", { count: noSize, effort: "hours", cases: ["VIS-01"] });
  if (face.signals && !face.signals.cacheControl) add("Performance", "risk", "low", "pf-cache", "The start page sends no cache-control", "Browsers and CDNs guess how long to keep it.", "Send cache-control on HTML (for example max-age=0, must-revalidate) and long max-age on hashed assets.", { effort: "minutes", cases: ["RS-03"] });
  const thirdHosts = face.signals ? (face.signals.thirdParty || []).length : 0;
  if (thirdHosts > 8) add("Performance", "risk", "low", "pf-third", plural(thirdHosts, "other host serves", "other hosts serve") + " scripts on the start page", "Each host adds a DNS lookup and a connection.", "Remove tags nobody reads and self-host the rest.", { count: thirdHosts, effort: "hours" });
  if (input.pagespeed) speedChecks(input.pagespeed, add);
  else if (!(browsed && browsed.start && browsed.start.vitals && browsed.start.vitals.lcp)) add("Performance", "person", "info", "pf-cwv", "Core Web Vitals need a rendered page", "Largest Contentful Paint, Interaction to Next Paint, and layout shift are measured by PageSpeed Insights or the browser run.", "");
  if (limits.timedOut) add("Performance", "person", "info", "coverage", "The time budget ended before every page was analyzed", plural(limits.pagesRead || pages.length, "page") + " of " + (limits.maxPages || "?") + " were analyzed. Slow responses use up the budget.", "");

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
    (top ? " Fix first: " + (/^[A-Z][a-z]/.test(top.title) ? top.title.charAt(0).toLowerCase() + top.title.slice(1) : top.title) + "." : "");

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
    launcher: chatLauncher.found ? { name: chatLauncher.name || "", known: !!chatLauncher.known, covers: (chatLauncher.covers || []).length } : null,
    opened: !!chatOpen.opened,
    states: { consent: findingState("an-chat-consent"), reject: findingState("an-chat-reject"), weight: findingState("pf-chat"), cover: findingState("a11y-chat-cover"), name: findingState("a11y-chat-name"), focus: findingState("a11y-chat-focus"), trap: findingState("a11y-chat-trap"), privacy: findingState("an-chat-privacy") }
  } : null;

  return {
    version: 1,
    score: { overall, grade: grade(overall), areas, totals, severities },
    summary,
    warnings,
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
    { name: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), interest-cohort=()", missing: !raw.permissions }
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

module.exports = { analyze, parseRobotsFull, robotsVerdict, AI_BOTS, AREAS, BROWSER_READ_NOTE, UNTAGGED_READ_NOTE, CUT_NOTE, SLOW_READ_NOTE, SLOW_CUT_NOTE, SHELL_NOTE, botCheck };
