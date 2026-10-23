/**
 * Read-only review of a public https URL.
 * Fetches HTML, records what the response showed, and proposes test cases.
 * It does not click, submit, sign in, probe, or generate load.
 */
const dns = require("dns").promises;
const http = require("http");
const https = require("https");
const net = require("net");
const zlib = require("zlib");
const crypto = require("crypto");
const { URL } = require("url");
const insights = require("./url-review-insights");
const { legalLinks, germanSpeaking } = require("./url-review-legal");
const { fromUrl: libraryFromUrl } = require("./url-review-libraries");
const caseRank = require("./url-review-cases");
const { siteLabel } = caseRank;

const TERMS_VERSION = "2026-10-22.2";
// A page loaded before a terms change still sends the version before it.
const PREVIOUS_TERMS_VERSION = "2026-10-22";
const PRICE_PER_FRAMEWORK = 19;
const PRICE_USD = PRICE_PER_FRAMEWORK;

function discountForIndex(index) {
  if (index <= 1) return 0;
  if (index <= 3) return 10;
  if (index <= 5) return 15;
  if (index <= 7) return 20;
  if (index <= 9) return 25;
  if (index <= 11) return 30;
  if (index <= 13) return 35;
  return 40;
}

function centsForIndex(index) {
  return Math.round(PRICE_PER_FRAMEWORK * 100 * (100 - discountForIndex(index)) / 100);
}

function scheduleCents(count) {
  let total = 0;
  for (let index = 1; index <= count; index += 1) total += centsForIndex(index);
  return total;
}

const PAGE_CHOICES = [20, 40, 60, 80, 100];
const DEPTH_CHOICES = [2, 3, 4, 5];
const PAGE_CENTS = { 20: 0, 40: 500, 60: 900, 80: 1200, 100: 1500 };
const DEPTH_CENTS = { 2: 0, 3: 400, 4: 700, 5: 1000 };
const INCLUDED_PAGES = 20;
const INCLUDED_DEPTH = 2;
const PAGE_LANGS = ["en", "es", "pt", "de", "fr", "it"];
const PAGE_LANG_LABEL = { en: "English", es: "Spanish", pt: "Portuguese", de: "German", fr: "French", it: "Italian" };

function normalizePageLang(value) {
  const code = String(value || "").trim().toLowerCase();
  return PAGE_LANGS.indexOf(code) === -1 ? "" : code;
}

function sectionPrefix(url) {
  try {
    const path = new URL(url).pathname || "/";
    if (path === "/") return "";
    return path.replace(/\/+$/, "");
  } catch (error) {
    return "";
  }
}

function underSection(url, prefix) {
  if (!prefix) return true;
  try {
    const path = new URL(url).pathname.replace(/\/+$/, "") || "/";
    return path === prefix || path.startsWith(prefix + "/");
  } catch (error) {
    return false;
  }
}

function priceMatches(usd) {
  const cents = Math.round(Number(usd) * 100);
  if (!Number.isFinite(cents) || cents <= 0) return false;
  const scopes = [];
  PAGE_CHOICES.forEach((pages) => {
    DEPTH_CHOICES.forEach((depth) => scopes.push(PAGE_CENTS[pages] + DEPTH_CENTS[depth]));
  });
  if (scopes.indexOf(cents) !== -1) return true;
  for (let count = 1; count <= FRAMEWORKS.length + SPECIALIST_TOOLS.length; count += 1) {
    const base = scheduleCents(count);
    const lists = [base].concat(count <= FRAMEWORKS.length ? scopes.map((extra) => base + extra) : []);
    const floor = count * Math.round(PRICE_PER_FRAMEWORK * 50);
    if (lists.some((list) => cents >= floor && cents <= list)) return true;
  }
  return false;
}
const REASONS = [
  { id: "own", label: "I own this site and want a test plan" },
  { id: "client", label: "A client asked me to propose coverage before a release" },
  { id: "redesign", label: "I am comparing this page with a redesign" },
  { id: "release", label: "I need a case list before a release" },
  { id: "tech", label: "I want the public technologies named" },
  { id: "a11y", label: "I am preparing an accessibility review" },
  { id: "security", label: "I am preparing a review of the public security headers" },
  { id: "performance", label: "I need a performance and load case list" },
  { id: "teaching", label: "I am teaching or learning how a page could be tested" },
  { id: "allowed", label: "I am checking a page I am allowed to review" },
  { id: "verify", label: "I want QA-lab to run a verification" },
  { id: "credentials", label: "I have a username and password for this site" },
  { id: "compare", label: "I am comparing my site with a competitor" },
  { id: "other", label: "Other" }
];
const BROWSER_FW = ["Playwright", "Cypress", "Robot", "Selenium", "WebdriverIO", "CodeceptJS", "Selenide", "TestNG", "Watir", "Cucumber", "Behave", "Reqnroll", "Jest", "Vitest", "Mocha"];
const MOBILE_FW = ["Appium", "Maestro"];
const LOAD_FW = ["JMeter", "Gatling", "k6"];
const FRAMEWORKS = BROWSER_FW.concat(MOBILE_FW, LOAD_FW);
const SPECIALIST_TOOLS = ["axe-core", "Lighthouse", "BrowserStack", "Applitools", "Percy", "Provar", "Copado"];
const LAYERS = ["Functional", "Content", "Links", "Accessibility", "Security", "Privacy", "SEO", "GEO", "Performance", "Load", "Mobile", "Internationalization", "Resilience", "Compatibility", "Media", "Analytics", "Commerce", "Forms", "Visual", "Platform", "API"];
const USER_AGENT = "CarlosMunozReview/1.0 (+https://carlosandmunoz.com/qa-review.html)";
const MAX_PAGES = 100;
const MAX_DEPTH = 5;
const MAX_BYTES = 2000000;
const PAGE_TIMEOUT_MS = 8000;
const TOTAL_MS = 170000;
// A start page whose HTML lists fewer same-host links than this is crawled from its rendered links.
const SHELL_LINKS = 3;
const SHELL_WAIT_MS = 45000;
// Lighthouse mobile runs often outlast a short crawl's budget; reviewUrl's 180 s timeout leaves room.
const SPEED_WAIT_MS = 80000;
const RETAIN_MS = 365 * 24 * 60 * 60 * 1000;
// Colombian tax support (Ley 962 de 2005, art. 46): five years from January 1 after the payment.
const PAYMENT_YEARS = 5;

function paymentExpireAt(at) {
  const paid = new Date(at || Date.now());
  const year = isNaN(paid.getTime()) ? new Date().getUTCFullYear() : paid.getUTCFullYear();
  return new Date(Date.UTC(year + 1 + PAYMENT_YEARS, 0, 1));
}

const TECH = [
  ["WordPress", "CMS", /wp-content|wp-includes|generator" content="wordpress/i],
  ["Drupal", "CMS", /drupal-settings-json|sites\/default\/files/i],
  ["Joomla", "CMS", /\/media\/jui\/|joomla/i],
  ["Shopify", "Commerce", /cdn\.shopify\.com|shopify\.theme/i],
  ["Magento", "Commerce", /\/static\/version\d|Magento_|mage\/cookies|x-magento-|magento-init|requirejs-config\.js/i],
  ["WooCommerce", "Commerce", /woocommerce/i],
  ["Salesforce", "Platform", /salesforce\.com|force\.com|lightning\.force|visualforce|sfdcstatic|siteforce|experience\.cloud|my\.site\.com|\/sfsites\//i],
  ["SAP", "Platform", /sapui5|sap-ui-core|hana\.ondemand/i],
  ["ServiceNow", "Platform", /servicenow\.com|service-now\.com/i],
  ["Wix", "Site builder", /wix\.com|x-wix/i],
  ["Squarespace", "Site builder", /squarespace/i],
  ["Webflow", "Site builder", /webflow/i],
  ["Next.js", "Framework", /\/_next\/|__NEXT_DATA__/i],
  ["Nuxt", "Framework", /\/_nuxt\/|__NUXT__/i],
  ["Gatsby", "Framework", /\/page-data\/|___gatsby/i],
  ["React", "Library", /react-dom|data-reactroot|reactroot/i],
  ["Vue", "Library", /vue(?:\.runtime)?(?:\.min)?\.js|data-v-[a-f0-9]/i],
  ["Angular", "Framework", /ng-version|angular(?:\.min)?\.js/i],
  ["Svelte", "Framework", /svelte/i],
  ["jQuery", "Library", /jquery(?:-\d|\.min)?\.js/i],
  ["Bootstrap", "CSS", /bootstrap(?:\.min)?\.(?:css|js)/i],
  ["Tailwind", "CSS", /tailwind/i],
  ["Google Tag Manager", "Analytics", /googletagmanager\.com/i],
  ["Google Analytics", "Analytics", /google-analytics\.com|gtag\/js/i],
  ["Google Fonts", "Fonts", /fonts\.googleapis\.com|fonts\.gstatic\.com/i],
  ["Stripe", "Payments", /js\.stripe\.com/i],
  ["reCAPTCHA", "Bot check", /google\.com\/recaptcha|grecaptcha/i],
  ["hCaptcha", "Bot check", /hcaptcha\.com/i],
  ["HubSpot", "Marketing", /hs-scripts\.com|hubspot/i],
  ["Intercom", "Support", /widget\.intercom\.io/i],
  ["Hotjar", "Analytics", /static\.hotjar\.com/i],
  ["Segment", "Analytics", /cdn\.segment\.com/i],
  ["Sentry", "Monitoring", /browser\.sentry-cdn\.com|sentry\.io/i],
  ["Cloudflare", "Edge", /cdnjs\.cloudflare\.com|challenges\.cloudflare\.com/i],
  ["jsDelivr", "CDN", /cdn\.jsdelivr\.net/i],
  ["unpkg", "CDN", /unpkg\.com/i]
];

function ipv4ToInt(ip) {
  const parts = String(ip).split(".");
  if (parts.length !== 4) return null;
  const nums = parts.map((part) => Number(part));
  if (nums.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return null;
  return (((nums[0] * 16777216) + (nums[1] * 65536) + (nums[2] * 256) + nums[3]) >>> 0);
}

function inRange(ip, start, end) {
  const n = ipv4ToInt(ip);
  if (n == null) return false;
  return n >= ipv4ToInt(start) && n <= ipv4ToInt(end);
}

function ipBlocked(raw) {
  let ip = String(raw || "").toLowerCase().replace(/^\[|\]$/g, "");
  if (ip.startsWith("::ffff:")) ip = ip.slice(7);
  if (net.isIP(ip) === 4) {
    return inRange(ip, "0.0.0.0", "0.255.255.255")
      || inRange(ip, "10.0.0.0", "10.255.255.255")
      || inRange(ip, "100.64.0.0", "100.127.255.255")
      || inRange(ip, "127.0.0.0", "127.255.255.255")
      || inRange(ip, "169.254.0.0", "169.254.255.255")
      || inRange(ip, "172.16.0.0", "172.31.255.255")
      || inRange(ip, "192.0.2.0", "192.0.2.255")
      || inRange(ip, "192.168.0.0", "192.168.255.255")
      || inRange(ip, "198.51.100.0", "198.51.100.255")
      || inRange(ip, "203.0.113.0", "203.0.113.255")
      || inRange(ip, "224.0.0.0", "255.255.255.255");
  }
  if (net.isIP(ip) !== 6) return true;
  if (ip === "::1" || ip === "::") return true;
  if (ip.startsWith("fc") || ip.startsWith("fd")) return true;
  if (ip.startsWith("fe8") || ip.startsWith("fe9") || ip.startsWith("fea") || ip.startsWith("feb")) return true;
  return false;
}

function hostBlocked(hostname) {
  const host = String(hostname || "").replace(/\.$/, "").toLowerCase();
  if (!host || host === "localhost" || host.endsWith(".localhost")) return true;
  if (host.endsWith(".local") || host.endsWith(".internal")) return true;
  if (host === "metadata.google.internal") return true;
  return false;
}

function clean(value, max) {
  return String(value == null ? "" : value).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "").trim().slice(0, max);
}

const EMAIL_RE = /^[a-z0-9._%+\-]+@[a-z0-9](?:[a-z0-9.\-]*[a-z0-9])?\.[a-z]{2,}$/;
const MULTI_TLDS = ["co.uk", "org.uk", "ac.uk", "gov.uk", "nhs.uk", "com.co", "net.co", "org.co", "edu.co", "gov.co", "mil.co",
  "com.mx", "org.mx", "edu.mx", "gob.mx", "com.br", "org.br", "edu.br", "gov.br", "com.au", "org.au", "edu.au", "gov.au",
  "co.jp", "ac.jp", "or.jp", "go.jp", "co.za", "org.za", "ac.za", "gov.za", "com.ar", "org.ar", "edu.ar", "gob.ar",
  "com.pe", "org.pe", "edu.pe", "gob.pe", "com.ec", "org.ec", "edu.ec", "gob.ec", "com.uy", "org.uy", "edu.uy", "gub.uy",
  "co.nz", "org.nz", "ac.nz", "govt.nz", "com.tr", "org.tr", "edu.tr", "gov.tr"];

function emailSyntax(email) {
  const value = String(email || "");
  if (!EMAIL_RE.test(value) || value.includes("..")) return false;
  return value.split("@")[1].split(".").every(Boolean);
}

function mailOf(value) {
  const address = String(value || "").replace(/^\s*mailto:/i, "").split("?")[0].split(",")[0];
  let decoded = address;
  try { decoded = decodeURIComponent(address); } catch (error) { decoded = address; }
  const email = decoded.trim().toLowerCase();
  return emailSyntax(email) ? email : "";
}

// Addresses written out in text, including "name [at] site [dot] com" spellings.
function emailsInText(text, max) {
  const out = [];
  const plain = String(text || "")
    .replace(/\s*(?:\[at\]|\(at\)|\{at\}|\[arroba\]|\(arroba\))\s*/gi, "@")
    .replace(/\s*(?:\[dot\]|\(dot\)|\{dot\}|\[punto\]|\(punto\))\s*/gi, ".");
  (plain.match(/[a-z0-9._%+-]+@[a-z0-9-]+(?:\.[a-z0-9-]+)*\.[a-z]{2,}/gi) || []).forEach((raw) => {
    const email = mailOf(raw.replace(/^[._%+-]+/, ""));
    if (email && !/\.(png|jpe?g|gif|webp|svg)$/.test(email) && out.indexOf(email) === -1 && out.length < (max || 5)) out.push(email);
  });
  return out;
}

function registrable(hostname) {
  const host = String(hostname || "").replace(/\.$/, "").replace(/^www\./, "").toLowerCase();
  const parts = host.split(".").filter(Boolean);
  if (parts.length < 2) return host;
  const lastTwo = parts.slice(-2).join(".");
  if (MULTI_TLDS.indexOf(lastTwo) !== -1 && parts.length >= 3) return parts.slice(-3).join(".");
  return lastTwo;
}

function mailboxMatchesHost(email, hostname) {
  const domain = String(email || "").split("@")[1] || "";
  return !!domain && registrable(domain) === registrable(hostname);
}

async function emailCanReceive(email) {
  const domain = String(email || "").toLowerCase().split("@")[1] || "";
  if (!domain || hostBlocked(domain) || net.isIP(domain)) return false;
  try {
    const mx = await dns.resolveMx(domain);
    if (mx && mx.length) return true;
  } catch (error) {
    if (!error || (error.code !== "ENODATA" && error.code !== "ENOTFOUND")) return false;
  }
  try {
    const records = await dns.lookup(domain, { all: true });
    return records.length > 0;
  } catch (error) {
    return false;
  }
}

function humanCheck(body, headers) {
  const src = body || {};
  if (clean(src.company, 200)) return { ok: false, message: "This review is for a person using a browser." };
  const ua = String((headers && (headers["user-agent"] || headers["User-Agent"])) || "");
  if (ua.length < 12 || /curl\/|wget\/|python-requests|scrapy|go-http-client|libwww|httpclient|phantomjs|headlesschrome|puppeteer/i.test(ua)) {
    return { ok: false, message: "This review is for a person using a browser." };
  }
  const opened = Number(src.openedAt);
  const age = Date.now() - opened;
  if (!Number.isFinite(opened) || age < 1200 || age > 12 * 60 * 60 * 1000) {
    return { ok: false, message: "Wait a moment on the form, then start the review." };
  }
  return { ok: true };
}

function fieldError(errors, field, message) {
  errors.push({ field, message });
}

function preformatUrl(input) {
  let raw = clean(input, 2000);
  if (!raw) throw new Error("Enter a URL.");
  raw = raw.replace(/^https?:\/\//i, "").replace(/^\/+/, "");
  return normalizeUrl("https://" + raw);
}

function validateIntake(body) {
  const src = body || {};
  const errors = [];
  if (src.termsAccepted !== true || (src.termsVersion !== TERMS_VERSION && src.termsVersion !== PREVIOUS_TERMS_VERSION)) fieldError(errors, "terms", "Accept the terms first.");
  const name = clean(src.name, 120);
  const email = clean(src.email, 120).toLowerCase();
  const reasonCode = clean(src.reasonCode, 40);
  const reasonText = clean(src.reason, 500);
  const known = REASONS.find((item) => item.id === reasonCode);
  if (name.length < 2 || !/\p{L}/u.test(name)) fieldError(errors, "name", "Enter your name.");
  if (!emailSyntax(email)) fieldError(errors, "email", "Enter a valid email.");
  if (!known) fieldError(errors, "reason", "Choose a reason.");
  if (known && known.id === "other" && reasonText.length < 8) fieldError(errors, "reason", "Write the reason in a sentence.");
  let clientName = "";
  let clientEmail = "";
  let clientUrl = "";
  if (known && known.id === "client") {
    clientName = clean(src.clientName, 120);
    clientEmail = clean(src.clientEmail, 120).toLowerCase();
    if (clientName.length < 2 || !/\p{L}/u.test(clientName)) fieldError(errors, "clientName", "Enter the client's name.");
    if (!emailSyntax(clientEmail)) fieldError(errors, "clientEmail", "Enter the client's email.");
    try {
      clientUrl = preformatUrl(src.clientUrl).toString();
    } catch (error) {
      fieldError(errors, "clientUrl", error.message || "Enter the client's website.");
    }
  }
  const picked = Array.isArray(src.frameworks) ? src.frameworks.filter((fw) => FRAMEWORKS.includes(fw)) : [];
  if (!picked.length) fieldError(errors, "frameworks", "Choose at least one framework for the proposed cases.");
  const scope = normalizeScope(src.pages == null ? INCLUDED_PAGES : src.pages, src.depth == null ? INCLUDED_DEPTH : src.depth);
  if (!scope) fieldError(errors, "scope", "Choose 20, 40, 60, 80, or 100 pages, and 2, 3, 4, or 5 links deep.");
  let target = null;
  try {
    target = preformatUrl(src.url);
  } catch (error) {
    fieldError(errors, "url", error.message);
  }
  if (known && known.id === "own" && target && emailSyntax(email) && !mailboxMatchesHost(email, target.hostname)) {
    fieldError(errors, "email", "Use an email at the same domain as the site. That shows the mailbox is on that host. It does not prove legal ownership.");
  }
  const compareWith = known && known.id === "compare" ? String(src.compareWith || "").replace(/[^a-f0-9]/g, "").slice(0, 32) : "";
  if (known && known.id === "compare" && !compareWith) fieldError(errors, "reason", "Start a comparison from one of your reports.");
  const reason = known && known.id === "other" ? reasonText : (known ? known.label : "");
  return {
    errors,
    value: !errors.length && target ? {
      name,
      email,
      reason,
      reasonCode,
      frameworks: picked,
      pages: scope ? scope.pages : INCLUDED_PAGES,
      depth: scope ? scope.depth : INCLUDED_DEPTH,
      url: target.toString(),
      termsVersion: src.termsVersion,
      deviceId: clean(src.deviceId, 80),
      clientName,
      clientEmail,
      clientUrl,
      ownership: known && known.id === "own" ? "mailbox-domain" : "",
      lang: ["en", "es", "pt", "de", "fr", "it"].indexOf(String(src.lang || "").slice(0, 2).toLowerCase()) === -1 ? "" : String(src.lang).slice(0, 2).toLowerCase(),
      pageLang: normalizePageLang(src.pageLang),
      section: src.section === true,
      followUp: src.followUp === true,
      unlisted: src.unlisted === true,
      compareWith
    } : null
  };
}

async function screenIntake(body, headers, options) {
  const intake = validateIntake(body);
  if (intake.errors.length) {
    return { ok: false, status: 400, error: intake.errors[0].message, fields: intake.errors };
  }
  const human = options && options.trusted ? { ok: true } : humanCheck(body, headers);
  if (!human.ok) return { ok: false, status: 403, error: human.message, fields: [] };
  if (!(await emailCanReceive(intake.value.email))) {
    return { ok: false, status: 400, error: "That email domain does not accept mail.", fields: [{ field: "email", message: "That email domain does not accept mail." }] };
  }
  if (intake.value.reasonCode === "client" && !(await emailCanReceive(intake.value.clientEmail))) {
    return {
      ok: false,
      status: 400,
      error: "The client email domain does not accept mail.",
      fields: [{ field: "clientEmail", message: "The client email domain does not accept mail." }]
    };
  }
  return { ok: true, value: intake.value };
}

function normalizeFrameworks(list) {
  const source = Array.isArray(list) ? list : String(list || "").split(",");
  const seen = new Set();
  const picked = [];
  source.forEach((item) => {
    const name = FRAMEWORKS.find((fw) => fw.toLowerCase() === String(item || "").trim().toLowerCase());
    if (name && !seen.has(name)) {
      seen.add(name);
      picked.push(name);
    }
  });
  return picked;
}

function normalizeTools(list) {
  const source = Array.isArray(list) ? list : String(list || "").split(",");
  const seen = new Set();
  const picked = [];
  source.forEach((item) => {
    const name = SPECIALIST_TOOLS.find((tool) => tool.toLowerCase() === String(item || "").trim().toLowerCase());
    if (name && !seen.has(name)) {
      seen.add(name);
      picked.push(name);
    }
  });
  return picked;
}

function priceFor(list, tools) {
  const frameworks = normalizeFrameworks(list && list.frameworks != null && !Array.isArray(list) ? list.frameworks : list);
  const named = normalizeTools(list && list.tools != null && !Array.isArray(list) ? list.tools : tools);
  if (!frameworks.length) {
    const error = new Error("Choose at least one framework.");
    error.status = 400;
    throw error;
  }
  const items = frameworks.concat(named);
  const count = items.length;
  const cents = scheduleCents(count);
  return {
    frameworks,
    tools: named,
    count,
    cents,
    usd: cents / 100,
    each: Math.round(cents / count) / 100,
    discount: items.map((name, index) => ({ name, framework: name, n: index + 1, percent: discountForIndex(index + 1), usd: centsForIndex(index + 1) / 100 }))
  };
}

function normalizeLayers(list) {
  const source = Array.isArray(list) ? list : String(list || "").split(",");
  const seen = new Set();
  const picked = [];
  source.forEach((item) => {
    const name = LAYERS.find((layer) => layer.toLowerCase() === String(item || "").trim().toLowerCase());
    if (name && !seen.has(name)) {
      seen.add(name);
      picked.push(name);
    }
  });
  return picked;
}

function priceForLayers(list) {
  const layers = normalizeLayers(list);
  if (!layers.length) {
    const error = new Error("Choose at least one kind of test case.");
    error.status = 400;
    throw error;
  }
  const count = layers.length;
  const cents = scheduleCents(count);
  return {
    layers,
    count,
    cents,
    usd: cents / 100,
    each: Math.round(cents / count) / 100
  };
}

function normalizeScope(pages, depth) {
  const pageCount = PAGE_CHOICES.find((item) => item === Number(pages));
  const depthCount = DEPTH_CHOICES.find((item) => item === Number(depth));
  if (!pageCount || !depthCount) return null;
  return { pages: pageCount, depth: depthCount };
}

function priceForScope(pages, depth) {
  const scope = normalizeScope(pages, depth);
  if (!scope) {
    const error = new Error("Choose 20, 40, 60, 80, or 100 pages, and 2, 3, 4, or 5 links deep.");
    error.status = 400;
    throw error;
  }
  const pageCents = PAGE_CENTS[scope.pages];
  const depthCents = DEPTH_CENTS[scope.depth];
  const cents = pageCents + depthCents;
  return {
    pages: scope.pages,
    depth: scope.depth,
    pageCents,
    depthCents,
    cents,
    usd: cents / 100,
    pageUsd: pageCents / 100,
    depthUsd: depthCents / 100
  };
}

function budgetMs(pages) {
  return Math.min(TOTAL_MS, 15000 + Number(pages) * 1500);
}

function priceForRun(options) {
  const src = options || {};
  const scope = priceForScope(src.pages, src.depth);
  const billing = src.billing === "scope" ? "scope" : "run";
  const frameworks = normalizeFrameworks(src.frameworks);
  const tools = normalizeTools(src.tools);
  if (!frameworks.length) {
    const error = new Error("Choose at least one framework.");
    error.status = 400;
    throw error;
  }
  const items = frameworks.concat(billing === "scope" ? [] : tools);
  const frameworkCents = billing === "scope" ? 0 : scheduleCents(items.length);
  const cents = frameworkCents + scope.cents;
  if (!cents) {
    const error = new Error("This review is included. No charge was made.");
    error.status = 400;
    throw error;
  }
  return {
    billing,
    frameworks,
    tools: billing === "scope" ? [] : tools,
    pages: scope.pages,
    depth: scope.depth,
    count: items.length,
    frameworkUsd: frameworkCents / 100,
    discount: items.map((name, index) => ({ name, n: index + 1, percent: discountForIndex(index + 1), usd: centsForIndex(index + 1) / 100 })),
    scopeUsd: scope.usd,
    pageUsd: scope.pageUsd,
    depthUsd: scope.depthUsd,
    cents,
    usd: cents / 100
  };
}

function signReport(report) {
  const lines = (report.cases || []).map((item) => [item.id, item.layer, item.title].join("|"));
  const body = ["QA-lab URL Review", "https://carlosandmunoz.com", report.id, report.fetchedAt, report.host].concat(lines).join("\n");
  const sha256 = crypto.createHash("sha256").update(body).digest("hex");
  const mark = "⟨QA⟩ " + sha256.slice(0, 16).replace(/(.{4})/g, "$1·").replace(/·$/, "");
  return { alg: "SHA-256", sha256, mark, issuer: "QA-lab URL Review", origin: "https://carlosandmunoz.com" };
}

function sameFrameworks(left, right) {
  const a = normalizeFrameworks(left).slice().sort().join("|");
  const b = normalizeFrameworks(right).slice().sort().join("|");
  return a.length > 0 && a === b;
}

function sameTools(left, right) {
  return normalizeTools(left).slice().sort().join("|") === normalizeTools(right).slice().sort().join("|");
}

function toolsForCharge(applicable, asked) {
  const allowed = normalizeTools((applicable || []).map((item) => item && item.name ? item.name : item));
  if (asked == null) return allowed;
  const wanted = new Set(normalizeTools(asked));
  return allowed.filter((name) => wanted.has(name));
}

function priceForCredentials() {
  const cents = scheduleCents(2);
  return { usd: cents / 100, cents, count: 2, frameworks: [], layers: [] };
}

function priceForAlerts(count) {
  const n = Math.round(Number(count));
  if (!Number.isInteger(n) || n < 1 || n > 8) {
    const error = new Error("Choose the signals this payment opens.");
    error.status = 400;
    throw error;
  }
  const cents = scheduleCents(n);
  return { usd: cents / 100, cents, count: n, alertCount: n, frameworks: [], layers: [] };
}

function chargedUsd(options) {
  const purpose = options && options.purpose;
  const priced = purpose === "cases"
    ? priceForLayers(options.layers)
    : purpose === "credentials"
      ? priceForCredentials()
      : purpose === "alerts"
        ? priceForAlerts(options.alertCount)
        : purpose === "new-run"
          ? priceForRun(options)
          : priceFor(options && options.frameworks, options && options.tools);
  const usd = Number(options && options.priceUsd);
  const list = options && options.listUsd != null ? Number(options.listUsd) : usd;
  if (Math.round(list * 100) !== priced.cents) {
    const error = new Error(purpose === "cases"
      ? "The charge does not match the selected kinds of test cases."
      : purpose === "new-run"
        ? "The charge does not match this review."
        : "The charge does not match the selected frameworks.");
    error.status = 400;
    throw error;
  }
  const cents = Math.round(usd * 100);
  if (cents === priced.cents) return priced;
  const floor = Math.min(priced.cents, (Number(priced.count) || 0) * Math.round(PRICE_PER_FRAMEWORK * 50));
  if (!(cents < priced.cents && cents >= floor)) {
    const error = new Error("The discount on this charge is out of range. No charge was made.");
    error.status = 400;
    throw error;
  }
  return Object.assign({}, priced, { cents, usd: cents / 100 });
}

function sameScope(row, scope) {
  const pages = PAGE_CHOICES.indexOf(Number(row && row.pages)) === -1 ? INCLUDED_PAGES : Number(row.pages);
  const depth = DEPTH_CHOICES.indexOf(Number(row && row.depth)) === -1 ? INCLUDED_DEPTH : Number(row.depth);
  return pages === scope.pages && depth === scope.depth;
}

function judgeAttempts(rows, identity, request) {
  const now = Date.now();
  const day = 24 * 60 * 60 * 1000;
  const deviceId = identity && identity.deviceId;
  const frameworks = Array.isArray(request) ? request : (request && request.frameworks);
  const tools = !Array.isArray(request) && request ? request.tools : [];
  const askedPages = !Array.isArray(request) && request && request.pages != null ? request.pages : INCLUDED_PAGES;
  const askedDepth = !Array.isArray(request) && request && request.depth != null ? request.depth : INCLUDED_DEPTH;
  const mine = (rows || []).filter((row) => row && (row.deviceId === deviceId || (identity.ip && row.ip === identity.ip)));
  const stops = mine.filter((row) => row.status === "stopped" && now - Date.parse(row.createdAt || 0) < day);
  if (stops.length >= 3) {
    return { ok: false, code: "stopped", message: "This browser or network stopped three reviews in the last day." };
  }
  let scope = null;
  let frameworksPriced = null;
  try {
    scope = priceForScope(askedPages, askedDepth);
    frameworksPriced = priceFor(frameworks, tools);
  } catch (error) {
    return { ok: false, code: "invalid", message: error.message || "Choose the size of the review." };
  }
  const used = new Set(mine.filter((row) => row.status === "run-credit-used").map((row) => row.creditId));
  const credit = mine.find((row) => row.status === "run-credit" && !used.has(row.id) && sameFrameworks(row.frameworks, frameworksPriced.frameworks) && sameTools(row.tools, frameworksPriced.tools) && sameScope(row, scope));
  // A comparison is priced as a second review, whichever device ran the first.
  const compare = !Array.isArray(request) && !!(request && request.compareWith);
  const completed = compare || mine.some((row) => row.status === "complete");
  if (!completed && scope.cents === 0) return { ok: true };
  if (credit) return { ok: true, consumeId: credit.id };
  const billing = completed ? "run" : "scope";
  const priced = priceForRun({ frameworks, tools, pages: scope.pages, depth: scope.depth, billing });
  return {
    ok: false,
    code: "payment",
    message: compare
      ? "A comparison is priced as a second review and asks for payment before it starts."
      : completed
        ? "Another review asks for payment before it starts."
        : "A wider or deeper review asks for payment before it starts.",
    priceUsd: priced.usd,
    count: priced.count,
    frameworks: priced.frameworks,
    tools: priced.tools,
    pages: priced.pages,
    depth: priced.depth,
    billing: priced.billing,
    frameworkUsd: priced.frameworkUsd,
    scopeUsd: priced.scopeUsd,
    pageUsd: priced.pageUsd,
    depthUsd: priced.depthUsd
  };
}

function normalizeUrl(input) {
  let parsed;
  try {
    parsed = new URL(clean(input, 2000));
  } catch (error) {
    throw new Error("Enter a valid https URL.");
  }
  if (parsed.protocol !== "https:") throw new Error("Only https URLs can be reviewed.");
  if (parsed.username || parsed.password) throw new Error("Remove the username and password from the URL.");
  if (parsed.port && parsed.port !== "443") throw new Error("Only the standard https port can be reviewed.");
  if (hostBlocked(parsed.hostname) || (net.isIP(parsed.hostname) && ipBlocked(parsed.hostname))) {
    throw new Error("That address is not a public website.");
  }
  parsed.hash = "";
  return parsed;
}

async function assertPublic(hostname) {
  if (hostBlocked(hostname)) throw new Error("That address is not a public website.");
  if (net.isIP(hostname)) {
    if (ipBlocked(hostname)) throw new Error("That address is not a public website.");
    return hostname;
  }
  let records = [];
  try {
    records = await dns.lookup(hostname, { all: true, verbatim: true });
  } catch (error) {
    throw new Error("The host name did not resolve.");
  }
  if (!records.length) throw new Error("The host name did not resolve.");
  records.forEach((record) => {
    if (ipBlocked(record.address)) throw new Error("That host points at a private address.");
  });
  return records[0].address;
}

// Inflates at most MAX_BYTES * 5; past that it keeps the start of the input, so a huge file still yields its first part.
function inflateWithin(buffer, run) {
  let input = buffer;
  for (let tries = 0; tries < 8 && input.length; tries += 1) {
    try { return run(input, { maxOutputLength: MAX_BYTES * 5 }); }
    catch (error) {
      if (!error || error.code !== "ERR_BUFFER_TOO_LARGE") throw error;
      input = input.subarray(0, Math.floor(input.length / 2));
    }
  }
  return Buffer.alloc(0);
}

function gunzip(buffer) {
  return inflateWithin(buffer, (input, limit) => zlib.gunzipSync(input, Object.assign({ finishFlush: zlib.constants.Z_SYNC_FLUSH }, limit)));
}

// Some servers compress the response even though the request sends no accept-encoding,
// and .gz files (sitemaps) arrive as gzip bytes with no content-encoding at all.
function decodeBody(buffer, encoding) {
  const kind = String(encoding || "").trim().toLowerCase();
  const gzipped = (bytes) => bytes.length > 2 && bytes[0] === 0x1f && bytes[1] === 0x8b;
  try {
    let bytes = buffer;
    if (kind === "gzip" || kind === "x-gzip") bytes = gunzip(buffer);
    else if (kind === "deflate") {
      try { bytes = inflateWithin(buffer, (input, limit) => zlib.inflateSync(input, Object.assign({ finishFlush: zlib.constants.Z_SYNC_FLUSH }, limit))); }
      catch (error) { bytes = inflateWithin(buffer, (input, limit) => zlib.inflateRawSync(input, Object.assign({ finishFlush: zlib.constants.Z_SYNC_FLUSH }, limit))); }
    } else if (kind === "br") bytes = inflateWithin(buffer, (input, limit) => zlib.brotliDecompressSync(input, Object.assign({ finishFlush: zlib.constants.BROTLI_OPERATION_FLUSH }, limit)));
    if (gzipped(bytes)) bytes = gunzip(bytes);
    return bytes.toString("utf8");
  } catch (error) {
    return "";
  }
}

function requestOnce(target, pinned, isStopped, keepPartial, acceptLanguage) {
  return new Promise((resolve, reject) => {
    const lib = target.protocol === "https:" ? https : http;
    let settled = false;
    let watch = null;
    let deadline = null;
    let haltError = null;
    const finish = (fn, value) => {
      if (settled) return;
      settled = true;
      clearInterval(watch);
      clearTimeout(deadline);
      fn(value);
    };
    const giveUp = (error) => {
      haltError = error;
      req.destroy(error);
      finish(reject, error);
    };
    let keepArrived = null;
    const slow = () => {
      if (!settled && keepArrived && keepArrived()) return;
      giveUp(new Error("The page took too long."));
    };
    const req = lib.request({
      protocol: target.protocol,
      hostname: target.hostname,
      port: target.port || (target.protocol === "http:" ? 80 : 443),
      path: target.pathname + target.search,
      method: "GET",
      timeout: PAGE_TIMEOUT_MS,
      headers: Object.assign({
        "user-agent": USER_AGENT,
        accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8",
        connection: "close"
      }, acceptLanguage ? { "accept-language": acceptLanguage } : {}),
      lookup: (hostname, options, callback) => {
        if (typeof options === "function") {
          callback = options;
          options = {};
        }
        const family = net.isIP(pinned);
        if (options && options.all) callback(null, [{ address: pinned, family }]);
        else callback(null, pinned, family);
      }
    }, (res) => {
      const chunks = [];
      let size = 0;
      let failed = null;
      let cert = null;
      try {
        const peer = res.socket && res.socket.getPeerCertificate ? res.socket.getPeerCertificate() : null;
        if (peer && peer.valid_to) cert = { validTo: peer.valid_to, issuer: clean((peer.issuer && (peer.issuer.O || peer.issuer.CN)) || "", 80) };
      } catch (error) { cert = null; }
      const encoding = res.headers["content-encoding"];
      // A start page still arriving at the deadline is kept once its body has begun.
      if (keepPartial) keepArrived = () => {
        const body = decodeBody(Buffer.concat(chunks), encoding);
        if (!/<body[\s>]/i.test(body)) return false;
        req.destroy();
        finish(resolve, { status: res.statusCode || 0, headers: res.headers, body, cert, truncated: true, slow: true });
        return true;
      };
      res.on("data", (chunk) => {
        size += chunk.length;
        if (size > MAX_BYTES) {
          if (keepPartial) {
            chunks.push(chunk.subarray(0, chunk.length - (size - MAX_BYTES)));
            req.destroy();
            finish(resolve, { status: res.statusCode || 0, headers: res.headers, body: decodeBody(Buffer.concat(chunks), encoding), cert, truncated: true });
            return;
          }
          failed = new Error("The page is larger than the review limit.");
          giveUp(failed);
          return;
        }
        chunks.push(chunk);
      });
      res.on("end", () => {
        if (failed) finish(reject, failed);
        else finish(resolve, { status: res.statusCode || 0, headers: res.headers, body: decodeBody(Buffer.concat(chunks), encoding), cert });
      });
      res.on("error", (error) => finish(reject, error));
    });
    watch = setInterval(() => {
      if (isStopped && isStopped()) {
        haltError = new Error("stopped");
        haltError.code = "STOPPED";
        req.destroy();
        finish(reject, haltError);
      }
    }, 150);
    deadline = setTimeout(slow, PAGE_TIMEOUT_MS);
    req.on("timeout", slow);
    req.on("error", (error) => finish(reject, haltError || error));
    req.end();
  });
}

async function fetchPublic(raw, isStopped, onPulse, keepPartial, acceptLanguage) {
  let current = normalizeUrl(raw);
  const started = Date.now();
  let pulses = 0;
  const timer = setInterval(() => {
    if (!onPulse || pulses >= 4) return;
    pulses += 1;
    const seconds = Math.max(1, Math.round((Date.now() - started) / 1000));
    onPulse("Waiting for " + current.hostname + " (" + seconds + "s).");
  }, 2000);
  try {
    for (let hop = 0; hop < 5; hop += 1) {
      if (isStopped && isStopped()) {
        const error = new Error("stopped");
        error.code = "STOPPED";
        throw error;
      }
      const pinned = await assertPublic(current.hostname);
      if (onPulse) onPulse("The name " + current.hostname + " resolved. Requesting the page.");
      let res;
      try {
        res = await requestOnce(current, pinned, isStopped, keepPartial, acceptLanguage);
      } catch (error) {
        if (error && typeof error === "object" && !error.url) error.url = current.toString();
        throw error;
      }
      const location = res.headers.location;
      if ([301, 302, 303, 307, 308].includes(res.status) && location) {
        if (onPulse) onPulse("The page redirected. Following the next public https address.");
        const next = new URL(location, current);
        if (next.protocol === "http:") throw new Error("The site redirected to " + clean(next.href, 160) + ", an http:// address. The review only follows https.");
        current = normalizeUrl(next.toString());
        continue;
      }
      return {
        url: current.toString(),
        requested: String(raw),
        hops: hop,
        status: res.status,
        headers: res.headers,
        body: res.body,
        truncated: !!res.truncated,
        slow: !!res.slow,
        cert: res.cert,
        ms: Date.now() - started
      };
    }
    throw new Error("The page redirected too many times.");
  } finally {
    clearInterval(timer);
  }
}

function header(headers, name) {
  const value = headers[name.toLowerCase()];
  if (Array.isArray(value)) return value.join(", ");
  return value ? String(value) : "";
}

function setCookies(headers) {
  const raw = headers["set-cookie"];
  if (!raw) return [];
  return (Array.isArray(raw) ? raw : [raw]).map((line) => {
    const parts = String(line).split(";").map((part) => part.trim());
    const pair = parts[0] || "";
    const name = pair.split("=")[0];
    const flags = parts.slice(1).map((part) => part.toLowerCase());
    return {
      name: clean(name, 80),
      secure: flags.some((flag) => flag === "secure"),
      httpOnly: flags.some((flag) => flag === "httponly"),
      sameSite: (flags.find((flag) => flag.startsWith("samesite=")) || "").split("=")[1] || ""
    };
  }).filter((cookie) => cookie.name);
}

function decode(value) {
  const text = String(value || "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&quot;/gi, "\"")
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#x([0-9a-f]+);/gi, (entity, hex) => {
      const code = parseInt(hex, 16);
      return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : entity;
    })
    .replace(/&#(\d+);/g, (entity, dec) => {
      const code = Number(dec);
      return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : entity;
    })
    .replace(/&amp;/gi, "&");
  return text.replace(/\s+/g, " ").trim();
}

function attr(tag, name) {
  const match = String(tag).match(new RegExp("[\\s\"'/]" + name + "\\s*=\\s*(\"([^\"]*)\"|'([^']*)'|([^\\s>]+))", "i"));
  return match ? decode(match[2] || match[3] || match[4] || "") : "";
}

// True for a bare attribute too (<img alt>), and never for the name inside another attribute's value.
function hasAttr(tag, name) {
  const bare = String(tag).replace(/"[^"]*"|'[^']*'/g, "\"\"");
  return new RegExp("[\\s\"'/]" + name + "(?=[\\s=/>]|$)", "i").test(bare);
}

// Controls a browser does not render or expose, such as honeypots and toggled-off widgets.
// Visually hidden classes (sr-only) stay counted: screen readers still reach those controls.
function hiddenTag(tag) {
  if (hasAttr(tag, "hidden") || hasAttr(tag, "inert")) return true;
  if (attr(tag, "aria-hidden").toLowerCase() === "true") return true;
  if (/(?:^|;)\s*(?:display\s*:\s*none|visibility\s*:\s*hidden)\b/i.test(attr(tag, "style"))) return true;
  const classes = attr(tag, "class").split(/\s+/).filter(Boolean);
  return classes.some((name) => /^(?:d-none|hidden|is-hidden)$/.test(name)) &&
    !classes.some((name) => /^(?:d-(?:sm|md|lg|xl|xxl)-|(?:sm|md|lg|xl|2xl):)/.test(name));
}

function collect(html, name) {
  return String(html || "").match(new RegExp("<" + name + "\\b[^>]*>", "gi")) || [];
}

function textOf(html, name) {
  const match = String(html || "").match(new RegExp("<" + name + "\\b[^>]*>([\\s\\S]*?)</" + name + ">", "i"));
  return match ? decode(match[1].replace(/<[^>]+>/g, " ")) : "";
}

function sameHost(from, href) {
  try {
    const next = new URL(href, from);
    const base = new URL(from);
    if (next.protocol !== "https:") return "";
    if (next.hostname !== base.hostname) return "";
    if (next.port && next.port !== "443") return "";
    next.hash = "";
    [...next.searchParams.keys()].forEach((key) => {
      if (/^(utm_[a-z]+|gclid|fbclid|msclkid|mc_cid|mc_eid|intcmp|cmp|_ga|_gl|yclid|igshid)$/i.test(key)) next.searchParams.delete(key);
    });
    return next.toString();
  } catch (error) {
    return "";
  }
}

function parseRobots(text) {
  const groups = [];
  let current = null;
  String(text || "").split(/\r?\n/).forEach((line) => {
    const cleanLine = line.split("#")[0].trim();
    const parts = cleanLine.split(":");
    if (parts.length < 2) return;
    const key = parts[0].trim().toLowerCase();
    const value = parts.slice(1).join(":").trim();
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
  return groups;
}

function robotsAllows(pathname, groups) {
  const specific = groups.filter((group) => group.agents.includes("carlosmunozreview"));
  const star = groups.filter((group) => group.agents.includes("*"));
  const chosen = specific.length ? specific : star;
  let match = null;
  chosen.forEach((group) => {
    group.rules.forEach((rule) => {
      if (!rule.path) return;
      if (pathname.startsWith(rule.path) && (!match || rule.path.length > match.path.length)) match = rule;
    });
  });
  return !match || match.allow;
}

// Markers that appear on the challenge or block page itself. Snippets these vendors also add to normal
// pages (Cloudflare's /cdn-cgi/challenge-platform/scripts/jsd, Radware ssConf, Incapsula resources, DataDome tags) are left out.
const CHALLENGES = [
  ["Cloudflare", /<title>\s*(?:Just a moment\.\.\.|Attention Required! \| Cloudflare)\s*<\/title>|window\._cf_chl_opt\b/i],
  ["Radware", /<title>\s*Radware (?:Bot Manager Captcha|Captcha Page|Page)\s*<\/title>/i],
  ["Akamai", /\/_sec\/cp_challenge\/|<title>\s*Access Denied\s*<\/title>[\s\S]{0,2000}errors\.edgesuite\.net/i],
  ["Imperva", /Incapsula incident ID|_Incapsula_Resource\?CWUDNSAI=/i],
  ["DataDome", /captcha-delivery\.com/i],
  ["PerimeterX", /id=["']px-captcha["']|<title>\s*Access to this page has been denied\.?\s*<\/title>/i],
  ["AWS WAF", /window\.gokuProps\s*=/],
  ["Sucuri", /<title>\s*Sucuri WebSite Firewall - Access Denied\s*<\/title>/i],
  ["Azure WAF", /<title>\s*Azure WAF\s*<\/title>/i]
];

function challengeOf(pageUrl, headers, body) {
  if (/^challenge$/i.test(header(headers || {}, "cf-mitigated"))) return "Cloudflare";
  try {
    const params = new URL(pageUrl).searchParams;
    if (params.has("ssa") && (params.has("ssb") || params.has("ssc"))) return "Radware";
  } catch (error) { /* not a URL */ }
  const head = String(body || "").slice(0, 200000);
  const found = CHALLENGES.find(([, pattern]) => pattern.test(head));
  return found ? found[0] : "";
}

function technologies(html, headers) {
  const haystack = html + "\n" + Object.entries(headers).map(([key, value]) => key + ": " + value).join("\n");
  const found = [];
  TECH.forEach(([name, group, pattern]) => {
    if (pattern.test(haystack)) found.push({ name, group, evidence: "Matched a public marker in the HTML or headers." });
  });
  const server = header(headers, "server");
  const powered = header(headers, "x-powered-by");
  if (server) found.push({ name: clean(server, 80), group: "Server", evidence: "Server response header." });
  if (powered) found.push({ name: clean(powered, 80), group: "Runtime", evidence: "X-Powered-By response header." });
  if (header(headers, "cf-ray")) found.push({ name: "Cloudflare", group: "Edge", evidence: "cf-ray response header." });
  if (header(headers, "x-vercel-id")) found.push({ name: "Vercel", group: "Host", evidence: "x-vercel-id response header." });
  if (header(headers, "x-nf-request-id")) found.push({ name: "Netlify", group: "Host", evidence: "Netlify response header." });
  const seen = new Set();
  return found.filter((item) => {
    const key = item.name.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function visibleText(html) {
  return decode(String(html || "")
    .replace(/<(script|style|noscript|template|svg|head)\b[\s\S]*?<\/\1>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<[^>]+>/g, " "));
}

const STOPWORDS = {
  en: "the and of to is for with that you are this from your our by be",
  es: "el los las del y para por es su al se como más sus lo este",
  pt: "os do da dos das não em um uma com ao são pelo pela você também",
  fr: "le les des du et est pour dans avec sur aux vous nous qui une au",
  de: "der die das und ist mit für auf den dem ein eine nicht sie wir zu",
  it: "il gli della delle che per sono nel alla dei degli questo anche più ed è"
};
const STOPWORD_SETS = Object.keys(STOPWORDS).map((code) => [code, new Set(STOPWORDS[code].split(" "))]);

// Names the language only when one clearly dominates: at least 40 common words and three times the runner-up.
function textLanguage(text) {
  const words = String(text || "").toLowerCase().match(/\p{L}+/gu) || [];
  if (words.length < 150) return "";
  const counts = STOPWORD_SETS.map(([code, set]) => [code, words.reduce((sum, word) => sum + (set.has(word) ? 1 : 0), 0)]).sort((a, b) => b[1] - a[1]);
  return counts[0][1] >= 40 && counts[0][1] >= counts[1][1] * 3 ? counts[0][0] : "";
}

function outline(html) {
  const heads = [];
  const re = /<h([1-3])\b[^>]*>([\s\S]*?)<\/h\1>/gi;
  let match;
  while ((match = re.exec(String(html || ""))) && heads.length < 30) {
    const text = decode(match[2].replace(/<[^>]+>/g, " "));
    if (text) heads.push({ level: Number(match[1]), text: clean(text, 120) });
  }
  return heads;
}

function homeText(html) {
  const text = visibleText(html);
  return { text: text.slice(0, 1600), chars: text.length, words: text ? text.split(/\s+/).length : 0, outline: outline(html) };
}

const ANALYTICS_TAGS = [
  ["Google Analytics 4", /gtag\(|googletagmanager\.com\/gtag\/js|google-analytics\.com\/g\//, /["'=](G-[A-Z0-9]{6,12})["'&]/g],
  ["Universal Analytics", /["'=]UA-\d{4,10}-\d{1,4}["'&]/, /["'=](UA-\d{4,10}-\d{1,4})["'&]/g],
  ["Google Tag Manager", /googletagmanager\.com\/gtm\.js|GTM-[A-Z0-9]{4,9}/, /(GTM-[A-Z0-9]{4,9})\b/g],
  ["Google Ads", /["'=]AW-\d{6,12}["'&]/, /["'=](AW-\d{6,12})["'&]/g],
  ["Meta Pixel", /connect\.facebook\.net\/[^"']*\/fbevents\.js|fbq\(\s*['"]init/, /fbq\(\s*['"]init['"]\s*,\s*['"]?(\d{8,20})/g],
  ["LinkedIn Insight", /snap\.licdn\.com|_linkedin_partner_id/, /_linkedin_partner_id\s*=\s*["']?(\d{3,12})/g],
  ["TikTok Pixel", /analytics\.tiktok\.com|ttq\.load\(/, /ttq\.load\(\s*['"]([A-Z0-9]{10,30})/g],
  ["X Pixel", /static\.ads-twitter\.com|twq\(\s*['"]config/, null],
  ["Pinterest Tag", /s\.pinimg\.com\/ct\/core\.js|pintrk\(/, null],
  ["Microsoft Ads UET", /bat\.bing\.com\/bat\.js/, /\bti\s*:\s*["']?(\d{5,12})/g],
  ["Hotjar", /static\.hotjar\.com|hjid\s*:/, /hjid\s*:\s*(\d{4,10})/g],
  ["Microsoft Clarity", /clarity\.ms\/tag|["']clarity["']\s*,\s*["']script["']/, /clarity\.ms\/tag\/([a-z0-9]{6,14})|["']clarity["']\s*,\s*["']script["']\s*,\s*["']([a-z0-9]{6,14})/g],
  ["HubSpot", /js\.hs-scripts\.com|js\.hs-analytics\.net/, /js\.hs-scripts\.com\/(\d{3,12})/g],
  ["Adobe Analytics", /assets\.adobedtm\.com|AppMeasurement/, null],
  ["Matomo", /matomo\.js|piwik\.js|_paq\.push/, null],
  ["Plausible", /plausible\.io\/js|\/js\/script\.js["'][^>]*data-domain/, null],
  ["Fathom", /cdn\.usefathom\.com/, null],
  ["Umami", /cloud\.umami\.is|\/umami\.js|data-website-id=/, null],
  ["PostHog", /posthog\.init|posthog-js|\.posthog\.com/, null],
  ["Segment", /cdn\.segment\.com|analytics\.load\(/, null],
  ["Mixpanel", /cdn\.mxpnl\.com|mixpanel\.init/, null],
  ["Amplitude", /cdn\.amplitude\.com|amplitude\.init|amplitude\.getInstance/, null],
  ["Heap", /cdn\.heapanalytics\.com|heap\.load\(/, null],
  ["Vercel Analytics", /\/_vercel\/insights\/script\.js|va\.vercel-scripts\.com/, null],
  ["Cloudflare Web Analytics", /static\.cloudflareinsights\.com\/beacon/, null],
  ["Yandex Metrica", /mc\.yandex\.ru\/metrika/, null]
];

const CONSENT_TOOLS = [
  ["OneTrust", /cdn\.cookielaw\.org|otSDKStub|optanon/i],
  ["Cookiebot", /consent\.cookiebot\.com|Cookiebot/],
  ["Usercentrics", /usercentrics/i],
  ["CookieYes", /cookieyes/i],
  ["iubenda", /iubenda/i],
  ["Didomi", /didomi/i],
  ["Termly", /termly\.io/i],
  ["Osano", /cmp\.osano\.com/i],
  ["Complianz", /complianz/i],
  ["Quantcast Choice", /quantcast\.mgr|cmp\.quantcast/i],
  ["TrustArc", /trustarc|consent\.truste/i],
  ["Klaro", /klaro(\.min)?\.js|klaroConfig/],
  ["CookieConsent", /cookieconsent(\.min)?\.js|CookieConsent\.run/i],
  ["Borlabs", /borlabs-cookie/i],
  ["Axeptio", /axeptio/i],
  ["Sourcepoint", /sp-prod\.net|sourcepoint/i],
  ["Google consent messages", /fundingchoicesmessages\.google\.com/i]
];

function analyticsScan(html) {
  const body = String(html || "");
  const tags = [];
  ANALYTICS_TAGS.forEach(([name, present, idPattern]) => {
    if (!present.test(body)) return;
    const ids = [];
    if (idPattern) {
      idPattern.lastIndex = 0;
      let match;
      while ((match = idPattern.exec(body)) && ids.length < 6) {
        const id = match[1] || match[2];
        if (id && ids.indexOf(id) === -1) ids.push(id);
      }
    }
    tags.push({ name, ids });
  });
  const consent = CONSENT_TOOLS.filter(([, pattern]) => pattern.test(body)).map(([name]) => name);
  let consentMode = null;
  const mode = body.match(/gtag\(\s*['"]consent['"]\s*,\s*['"]default['"]\s*,\s*\{([\s\S]{0,600}?)\}/);
  if (mode) {
    const analytics = (mode[1].match(/analytics_storage['"]?\s*:\s*['"](denied|granted)/) || [])[1] || "";
    consentMode = { analytics, v2: /ad_user_data/.test(mode[1]) && /ad_personalization/.test(mode[1]) };
  }
  const ga4 = (tags.find((tag) => tag.name === "Google Analytics 4") || { ids: [] }).ids;
  return {
    tags,
    consent,
    consentMode,
    ga4,
    gtagLoads: (body.match(/googletagmanager\.com\/gtag\/js/g) || []).length,
    loader: /<script\b[^>]*\ssrc\s*=\s*["'][^"']*(analytics|gtag|gtm|tracking|tagmanager)[^"']*["']/i.test(body),
    dataLayer: /dataLayer\s*=|dataLayer\.push/.test(body)
  };
}

function schemaScan(html) {
  const result = { errors: 0, items: [], emails: [] };
  const blocks = String(html || "").match(/<script\b[^>]*application\/ld\+json[^>]*>[\s\S]*?<\/script>/gi) || [];
  // A Person's email is a private address, so only organizations and contact points count.
  const keepEmails = (node, types) => {
    if (types.some((type) => /^Person$/i.test(type))) return;
    const points = Array.isArray(node.contactPoint) ? node.contactPoint : [node.contactPoint];
    [node.email].concat(points.map((point) => point && typeof point === "object" ? point.email : "")).forEach((value) => {
      const email = mailOf(Array.isArray(value) ? value[0] : value);
      if (email && result.emails.indexOf(email) === -1 && result.emails.length < 5) result.emails.push(email);
    });
  };
  const take = (node) => {
    if (!node || typeof node !== "object" || result.items.length >= 20) return;
    if (Array.isArray(node)) { node.forEach(take); return; }
    if (Array.isArray(node["@graph"])) node["@graph"].forEach(take);
    const raw = node["@type"];
    const types = (Array.isArray(raw) ? raw : raw ? [raw] : []).map((type) => clean(String(type).replace(/^https?:\/\/schema\.org\//, ""), 60)).filter(Boolean);
    if (!types.length) return;
    keepEmails(node, types);
    const sameAs = node.sameAs ? (Array.isArray(node.sameAs) ? node.sameAs : [node.sameAs]).filter((item) => typeof item === "string").slice(0, 12).map((item) => clean(item, 200)) : [];
    result.items.push({ types: types.slice(0, 4), props: Object.keys(node).filter((key) => key.charAt(0) !== "@").slice(0, 40), sameAs });
  };
  blocks.slice(0, 12).forEach((block) => {
    const text = block.replace(/^<script\b[^>]*>/i, "").replace(/<\/script>$/i, "").trim();
    if (!text) return;
    try { take(JSON.parse(text)); } catch (error) { result.errors += 1; }
  });
  return result;
}

const SOCIAL_HOSTS = /(^|\.)(linkedin\.com|twitter\.com|x\.com|facebook\.com|instagram\.com|github\.com|youtube\.com|tiktok\.com|threads\.net|bsky\.app|pinterest\.com|behance\.net|dribbble\.com|medium\.com|mastodon\.social|wa\.me|whatsapp\.com)$/i;

function inspect(html, headers, pageUrl) {
  const title = textOf(html, "title");
  const description = collect(html, "meta").map((tag) => attr(tag, "name").toLowerCase() === "description" ? attr(tag, "content") : "").find(Boolean) || "";
  const canonical = collect(html, "link").map((tag) => attr(tag, "rel").toLowerCase() === "canonical" ? attr(tag, "href") : "").find(Boolean) || "";
  const htmlTag = (html.match(/<html\b[^>]*>/i) || [""])[0];
  const markup = html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ").replace(/<template\b[\s\S]*?<\/template>/gi, " ");
  // The HTML parser copies attributes of a stray later <html> tag onto the root when the root lacks them.
  const lang = attr(htmlTag, "lang") || (hasAttr(htmlTag, "lang") ? "" : collect(markup.replace(/<!--[\s\S]*?-->/g, " "), "html").map((tag) => attr(tag, "lang")).find(Boolean) || "");
  const h1 = (markup.match(/<h1\b[^>]*>[\s\S]*?<\/h1>/gi) || []).map((tag) => decode(tag.replace(/<[^>]+>/g, " "))).filter(Boolean);
  const images = collect(markup, "img");
  const missingAlt = images.filter((tag) => !hasAttr(tag, "alt")).length;
  const forms = collect(markup, "form").length;
  const password = /<input\b[^>]*type\s*=\s*["']?password/i.test(markup);
  const buttons = (markup.match(/<button\b/gi) || []).length;
  const labelFor = new Set(collect(markup, "label").map((tag) => attr(tag, "for")).filter(Boolean));
  const unlabeled = (markup.replace(/<label\b[\s\S]*?<\/label>/gi, " ").match(/<(?:input|select|textarea)\b[^>]*>/gi) || []).filter((tag) => {
    const type = attr(tag, "type").toLowerCase();
    if (/^(hidden|submit|button|reset|image)$/.test(type)) return false;
    if (hiddenTag(tag)) return false;
    if (attr(tag, "aria-label") || attr(tag, "aria-labelledby") || attr(tag, "title")) return false;
    const id = attr(tag, "id");
    return !(id && labelFor.has(id));
  }).length;
  const links = [];
  collect(markup, "a").forEach((tag) => {
    const raw = attr(tag, "href");
    if (/\$\{|\{\{|%7B/i.test(raw)) return;
    const href = sameHost(pageUrl, raw);
    if (href && links.length < 100) links.push(href);
  });
  const mailtos = [];
  collect(markup, "a").forEach((tag) => {
    const href = attr(tag, "href");
    if (!/^\s*mailto:/i.test(href)) return;
    const email = mailOf(href);
    if (email && mailtos.indexOf(email) === -1 && mailtos.length < 5) mailtos.push(email);
  });
  const scripts = collect(html, "script").map((tag) => attr(tag, "src")).filter(Boolean);
  const styles = collect(html, "link").filter((tag) => attr(tag, "rel").toLowerCase().includes("stylesheet")).length;
  const generator = collect(html, "meta").map((tag) => attr(tag, "name").toLowerCase() === "generator" ? attr(tag, "content") : "").find(Boolean) || "";
  const metas = collect(html, "meta");
  const linksAll = collect(html, "link");
  let pageHost = "";
  try { pageHost = new URL(pageUrl).hostname; } catch (error) { pageHost = ""; }
  const scriptHosts = [];
  scripts.forEach((src) => {
    try {
      const host = new URL(src, pageUrl).hostname;
      if (host && host !== pageHost && scriptHosts.indexOf(host) === -1 && scriptHosts.length < 12) scriptHosts.push(host);
    } catch (error) { /* a relative script stays on this host */ }
  });
  const absolute = (href) => {
    if (!href) return "";
    try { return clean(new URL(href, pageUrl).toString(), 400); } catch (error) { return ""; }
  };
  const foreignHosts = (list, max) => {
    const out = [];
    list.forEach((href) => {
      try {
        const parsed = new URL(href, pageUrl);
        if (/^https?:$/.test(parsed.protocol) && parsed.hostname && parsed.hostname !== pageHost && out.indexOf(parsed.hostname) === -1 && out.length < max) out.push(parsed.hostname);
      } catch (error) { /* skip a malformed address */ }
    });
    return out;
  };
  const metaValue = (key) => metas.map((tag) => {
    const name = (attr(tag, "property") || attr(tag, "name")).toLowerCase();
    return name === key ? attr(tag, "content") : "";
  }).find(Boolean) || "";
  const viewportContent = metaValue("viewport").toLowerCase();
  const head = (html.match(/<head\b[\s\S]*?<\/head>/i) || [""])[0];
  const scriptTags = collect(html, "script");
  const crossScripts = scriptTags.filter((tag) => {
    const src = attr(tag, "src");
    if (!src) return false;
    try { return new URL(src, pageUrl).hostname !== pageHost; } catch (error) { return false; }
  });
  const sriMissing = foreignHosts(crossScripts.filter((tag) => !attr(tag, "integrity")).map((tag) => attr(tag, "src")), 20);
  const inlineScripts = (html.match(/<script\b[^>]*>[\s\S]*?<\/script>/gi) || []).filter((block) => {
    const open = block.match(/^<script\b[^>]*>/i)[0];
    if (attr(open, "src")) return false;
    const type = attr(open, "type").toLowerCase();
    if (type && !/javascript|module|^text\/babel$/.test(type)) return false;
    return /\S/.test(block.replace(/^<script\b[^>]*>/i, "").replace(/<\/script>$/i, ""));
  }).length + (html.match(/<[a-z][^>]*\son(?:click|load|error|submit|change|mouseover|focus|blur|input|keydown|keyup)\s*=/gi) || []).length;
  const inlineStyles = (html.match(/<style\b/gi) || []).length + (html.match(/<[a-z][^>]*\sstyle\s*=/gi) || []).length;
  const text = visibleText(html);
  const socialLinks = [];
  collect(markup, "a").forEach((tag) => {
    const href = absolute(attr(tag, "href"));
    try {
      const parsed = new URL(href);
      if (parsed.protocol === "https:" && SOCIAL_HOSTS.test(parsed.hostname) && parsed.pathname.length > 1 && !/\/(share|sharer|intent|shareArticle)/i.test(parsed.pathname) && socialLinks.indexOf(href) === -1 && socialLinks.length < 12) socialLinks.push(href);
    } catch (error) { /* not a profile link */ }
  });
  const anchors = (markup.match(/<a\b[^>]*>[\s\S]*?<\/a>/gi) || []).slice(0, 800).map((block) => {
    const open = block.match(/^<a\b[^>]*>/i)[0];
    return { href: attr(open, "href"), text: decode(block.replace(/<[^>]+>/g, " ")), label: [attr(open, "aria-label"), attr(open, "title")].join(" ") };
  });
  const libraries = [];
  scripts.slice(0, 60).forEach((src) => {
    let href = "";
    try { href = new URL(src, pageUrl).href; } catch (error) { return; }
    libraryFromUrl(href).forEach((row) => { if (libraries.length < 12) libraries.push(row); });
  });
  // Only links into the site's own domain: those URLs land in its analytics. An address inside a link
  // to another domain (a calendar id, a profile on another site) is not recorded as a page of this site.
  const piiLinks = collect(markup, "a").filter((tag) => {
    const href = attr(tag, "href");
    if (/^mailto:/i.test(href)) return false;
    let target;
    try { target = new URL(href, pageUrl); } catch (error) { return false; }
    if (!/^https?:$/.test(target.protocol) || registrable(target.hostname) !== registrable(pageHost)) return false;
    const values = [];
    target.searchParams.forEach((value) => values.push(value));
    return values.some((value) => /[^\s@]+@[^\s@]+\.[a-z]{2,}/i.test(value) && !/@(?:group|import|resource)\.calendar\.google\.com\b/i.test(value));
  }).length;
  const hreflang = linksAll.filter((tag) => attr(tag, "rel").toLowerCase().indexOf("alternate") !== -1 && attr(tag, "hreflang"))
    .slice(0, 30).map((tag) => ({ lang: clean(attr(tag, "hreflang").toLowerCase(), 16), href: absolute(attr(tag, "href")) }));
  const iconTag = linksAll.find((tag) => /(^|\s)(icon|shortcut icon|apple-touch-icon)(\s|$)/i.test(attr(tag, "rel")));
  const signals = {
    viewport: /<meta\b[^>]*\bname\s*=\s*(?:["']viewport["']|viewport\b)/i.test(html),
    styled: /<style\b/i.test(html),
    openGraph: metas.some((tag) => /^og:/i.test(attr(tag, "property"))),
    twitter: metas.some((tag) => /^twitter:/i.test(attr(tag, "name"))),
    jsonLd: (html.match(/application\/ld\+json/gi) || []).length,
    iframes: (html.match(/<iframe\b/gi) || []).length,
    untitledFrames: collect(markup.replace(/<noscript\b[\s\S]*?<\/noscript>/gi, " "), "iframe").filter((tag) => !attr(tag, "title") && !hiddenTag(tag)).length,
    h2: (html.match(/<h2\b/gi) || []).length,
    mixed: (markup.match(/<(?:script|img|iframe|source|video|audio|embed|track)\b[^>]*\ssrc\s*=\s*["']?http:\/\//gi) || []).length + linksAll.filter((tag) => /stylesheet|icon|preload|manifest/i.test(attr(tag, "rel")) && /^http:\/\//i.test(attr(tag, "href"))).length,
    hreflang: linksAll.filter((tag) => attr(tag, "rel").toLowerCase().indexOf("alternate") !== -1 && attr(tag, "hreflang")).length,
    skip: /<a\b[^>]*href\s*=\s*["']#[^"']+/i.test(html),
    main: /<main\b|\brole\s*=\s*["']?main\b/i.test(html),
    consent: /cookie|consent|gdpr|privacidad/i.test(html.slice(0, 120000)),
    privacyLink: /privacy|privacidad|legal|aviso/i.test(html),
    sitemap: /sitemap/i.test(html),
    noscript: /<noscript\b/i.test(html),
    fileInput: /type\s*=\s*["']file["']/i.test(html),
    search: /type\s*=\s*["']search["']|role\s*=\s*["']search["']/i.test(html),
    required: (html.match(/<input\b[^>]*\brequired\b/gi) || []).length,
    video: (html.match(/<video\b/gi) || []).length,
    permissions: header(headers, "permissions-policy") || header(headers, "feature-policy"),
    thirdParty: scriptHosts,
    imgNoSize: (markup.match(/<img\b[^>]*>/gi) || []).filter((tag) => !attr(tag, "width") && !attr(tag, "height")).length,
    robotsMeta: metas.some((tag) => attr(tag, "name").toLowerCase() === "robots"),
    cacheControl: header(headers, "cache-control"),
    apiHint: /graphql|wp-json|openapi|swagger/i.test(html.slice(0, 200000)),
    manifest: linksAll.some((tag) => /manifest/i.test(attr(tag, "rel"))),
    appShell: text.length < 300 && /<div\b[^>]*\bid\s*=\s*["'](root|app|__next|__nuxt|svelte|___gatsby)["'][^>]*>\s*<\/div>/i.test(html),
    zoomBlocked: /user-scalable\s*=\s*(no|0)\b/.test(viewportContent) || /maximum-scale\s*=\s*(1(\.0+)?|0?\.\d+)\b/.test(viewportContent),
    positiveTabindex: (html.match(/\btabindex\s*=\s*["']?[1-9]/gi) || []).length,
    blockingScripts: collect(head, "script").filter((tag) => attr(tag, "src") && !/\b(async|defer)\b/i.test(tag) && attr(tag, "type").toLowerCase() !== "module").length,
    inlineScripts,
    inlineStyles
  };
  return {
    title: clean(title, 180),
    description: clean(description, 240),
    canonical: clean(canonical, 300),
    lang: clean(lang, 16),
    textLang: textLanguage(text),
    h1: h1.slice(0, 4).map((item) => clean(item, 160)),
    images: images.length,
    missingAlt,
    forms,
    password,
    buttons,
    unlabeled,
    links: [...new Set(links)],
    scripts: scripts.length,
    styles,
    generator: clean(generator, 80),
    signals,
    bytes: Buffer.byteLength(html),
    technologies: technologies(html + " " + generator, headers),
    cookies: setCookies(headers),
    words: text ? text.split(/\s+/).length : 0,
    questionHeadings: outline(html).filter((item) => item.level > 1 && (/\?$/.test(item.text) || /^¿/.test(item.text))).length,
    author: clean(metaValue("author") || metaValue("article:author"), 120),
    dated: !!(metaValue("article:published_time") || metaValue("article:modified_time") || /<time\b[^>]*datetime\s*=/i.test(html)),
    icon: iconTag ? absolute(attr(iconTag, "href")) : "",
    seo: {
      robots: clean(metaValue("robots"), 160),
      googlebot: clean(metaValue("googlebot"), 160),
      xRobots: clean(header(headers, "x-robots-tag"), 160),
      canonicalAbs: absolute(canonical),
      hreflang
    },
    social: {
      ogTitle: clean(metaValue("og:title"), 200),
      ogDescription: clean(metaValue("og:description"), 300),
      ogImage: absolute(metaValue("og:image") || metaValue("og:image:url")),
      ogUrl: absolute(metaValue("og:url")),
      ogSiteName: clean(metaValue("og:site_name"), 120),
      ogType: clean(metaValue("og:type"), 40),
      twitterCard: clean(metaValue("twitter:card"), 40),
      twitterImage: absolute(metaValue("twitter:image"))
    },
    schema: schemaScan(html),
    analytics: analyticsScan(html),
    socialLinks,
    mailtos,
    textEmails: emailsInText(text, 5),
    legal: legalLinks(anchors, pageUrl),
    libraries,
    piiLinks,
    sri: { cross: crossScripts.length, missing: sriMissing },
    resources: {
      scripts: foreignHosts(scripts, 30),
      styles: foreignHosts(linksAll.filter((tag) => /stylesheet|preload/i.test(attr(tag, "rel"))).map((tag) => attr(tag, "href")), 20),
      images: foreignHosts(images.map((tag) => attr(tag, "src")), 20),
      frames: foreignHosts(collect(html, "iframe").map((tag) => attr(tag, "src")), 12),
      forms: foreignHosts(collect(html, "form").map((tag) => attr(tag, "action")), 8)
    },
    rawHeaders: {
      permissions: clean(header(headers, "permissions-policy") || header(headers, "feature-policy"), 300),
      poweredBy: clean(header(headers, "x-powered-by"), 120)
    },
    headers: {
      csp: header(headers, "content-security-policy"),
      hsts: header(headers, "strict-transport-security"),
      nosniff: header(headers, "x-content-type-options"),
      frame: header(headers, "x-frame-options"),
      referrer: header(headers, "referrer-policy"),
      server: header(headers, "server")
    }
  };
}

function addCase(cases, item) {
  cases.push(Object.assign({ status: "proposed" }, item));
}

function techNames(pages) {
  const names = [];
  pages.forEach((page) => {
    ((page.inspect && page.inspect.technologies) || []).forEach((item) => {
      if (names.indexOf(item.name) === -1) names.push(item.name);
    });
  });
  return names;
}

function hasTech(names, pattern) {
  return names.some((name) => pattern.test(name));
}

const REVIEW_TOOLS = [
  ["axe-core", "axe-core runs in this review's headless browser on up to three pages when that pass answers. Selecting it adds the same checks to the scripts, so your pipeline runs them on every build."],
  ["Lighthouse", "A public document was analyzed. Lighthouse scores the rendered start page on a mobile profile through PageSpeed Insights, in the Performance findings."],
  ["BrowserStack", "Browser cases are in this list. A later cross-browser pass could use BrowserStack. It is not started here."],
  ["Applitools", "The page has a visual surface. Applitools would compare a later screenshot. This review did not take one."],
  ["Percy", "The page has a visual surface. Percy would compare a later screenshot. This review did not take one."],
  ["Provar", "Salesforce markers were seen. Provar is named for a later pass. This review did not open an org."],
  ["Copado", "Salesforce markers were seen. Copado is named for a later pass. This review did not open an org."]
];

function toolFit(face, sig, names) {
  const html = (face.bytes || 0) > 0;
  const a11y = html && !!(face.title || (face.h1 || []).length || (face.images || 0) || (face.forms || 0) || (face.buttons || 0) || ((face.links || []).length) || sig.main || sig.styled);
  const visual = html && ((face.images || 0) > 0 || (face.styles || 0) > 0 || !!sig.viewport || !!sig.styled);
  const salesforce = hasTech(names, /^Salesforce$/);
  return {
    "axe-core": a11y,
    Lighthouse: html,
    BrowserStack: html,
    Applitools: visual,
    Percy: visual,
    Provar: salesforce,
    Copado: salesforce
  };
}

function toolsForPage(face, sig, names) {
  const fit = toolFit(face || {}, sig || {}, names || []);
  return REVIEW_TOOLS.filter((pair) => fit[pair[0]]).map((pair) => ({ name: pair[0], why: pair[1] }));
}

function withRendered(raw, dom) {
  if (!dom) return raw;
  const links = [...new Set((raw.links || []).concat(dom.links || []))];
  const sig = Object.assign({}, raw.signals || {}, { iframes: Math.max((raw.signals && raw.signals.iframes) || 0, dom.iframes || 0) });
  const legal = Object.assign({}, raw.legal || {});
  Object.keys(dom.legal || {}).forEach((kind) => { if (!legal[kind] && dom.legal[kind]) legal[kind] = dom.legal[kind]; });
  return Object.assign({}, raw, {
    links,
    legal,
    renderedLinks: links.length - (raw.links || []).length,
    forms: Math.max(raw.forms || 0, dom.forms || 0),
    unlabeled: (dom.forms || 0) > (raw.forms || 0) ? dom.unlabeled : raw.unlabeled,
    buttons: Math.max(raw.buttons || 0, dom.buttons || 0),
    signals: sig
  });
}

const DATED_PATH = /\/(19|20)\d{2}[\/-](0?[1-9]|1[0-2]|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[\/-]/i;

function lastingLink(link) {
  const text = String((link && link.text) || "");
  const selector = String((link && link.selector) || "");
  if (!/\p{L}{2}/u.test(text)) return false;
  if (/href="[^"]*#/.test(selector)) return false;
  return !DATED_PATH.test(String((link && link.target) || ""));
}

function journeys(pages, dom) {
  const byPath = new Map();
  pages.forEach((page) => {
    const path = String(page.path || "").split(/[?#]/)[0];
    if (path && !byPath.has(path)) byPath.set(path, page);
  });
  const start = String((pages[0] && pages[0].path) || "/");
  const heading = (page) => {
    const text = clean((page && page.inspect && page.inspect.h1 && page.inspect.h1[0]) || "", 200);
    if (!text) return "";
    return text.length > 40 ? text.slice(0, 40).replace(/\s+\S*$/, "") : text;
  };
  return ((dom && dom.nav) || [])
    .filter((link) => lastingLink(link))
    .map((link) => ({ link, page: byPath.get(link.target) }))
    .filter((row) => !row.page || (row.page.status >= 200 && row.page.status < 400))
    .sort((a, b) => ((b.page ? 2 : 0) + (b.link.where === "navigation" ? 1 : 0)) - ((a.page ? 2 : 0) + (a.link.where === "navigation" ? 1 : 0)))
    .slice(0, 4)
    .map((row) => ({ path: start, selector: row.link.selector, text: row.link.text, target: row.link.target, h1: heading(row.page), where: row.link.where }));
}

function propose(pages, robotsBlocked, limits, dom) {
  const cases = [];
  const home = pages[0];
  const face = withRendered(home.inspect || {}, dom);
  const sig = face.signals || {};
  const browser = BROWSER_FW;
  const origin = (() => { try { return new URL(home.url).origin; } catch (error) { return ""; } })();
  const host = origin.replace(/^https?:\/\//, "");
  const startPath = pagePath(home.url);
  const on = (path) => siteLabel(host, path);
  const here = on(startPath);
  const read = pages.filter((page) => page.inspect && page.status >= 200 && page.status < 300);
  const inspectOf = (page) => page === home ? face : page.inspect;
  const across = (test) => read.filter((page) => test(inspectOf(page), page)).map((page) => page.path);
  const most = (value) => read.reduce((best, page) => (value(inspectOf(page)) > (best ? value(inspectOf(best)) : 0) ? page : best), null);
  const sumOf = (value) => read.reduce((sum, page) => sum + (value(inspectOf(page)) || 0), 0);
  const listed = (paths, max) => {
    const shown = paths.slice(0, max || 3).map(on);
    return shown.join(", ") + (paths.length > shown.length ? " and " + (paths.length - shown.length) + " more" : "");
  };
  const names = techNames(pages);
  const stack = names.length ? names.slice(0, 6).join(", ") : "no named library";
  const fit = toolFit(face, sig, names);
  const named = (list) => list.filter((name) => fit[name]);
  const slow = pages.reduce((best, page) => (page.ms || 0) > (best.ms || 0) ? page : best, home);
  const failed = pages.filter((page) => page.status && (page.status < 200 || page.status >= 400));
  const untitled = pages.filter((page) => !page.title);
  const titles = pages.map((page) => page.title).filter(Boolean);
  const duplicateTitles = titles.filter((title, index) => titles.indexOf(title) !== index).length;
  const multilingual = (sig.hreflang || 0) > 0 || (face.links || []).some((url) => /\/(en|es|pt|de|fr|it|nl|ja|zh|ko|ru|ar)(-[a-z]{2})?(\/|$)|[?&](lang|hl|locale)=/i.test(url));
  const tracked = (sig.thirdParty || []).length > 0 || face.cookies.length > 0 || !!sig.consent || hasTech(names, /Google Tag Manager|Google Analytics|Meta Pixel|HubSpot|Hotjar|Clarity|Segment|Mixpanel/i);
  const later = " A later run would open " + here + " in a real browser, stay on " + host + ", and assert the step without submitting a form or generating load.";
  const elsewhere = (paths, what) => {
    const other = paths.filter((path) => path !== startPath);
    return other.length ? " " + what + " " + listed(other) + "." : "";
  };
  addCase(cases, { id: "FN-01", layer: "Functional", title: here + " answers over https", why: "The final URL was " + home.url + " with status " + home.status + "." + later, fw: browser });
  addCase(cases, { id: "FN-02", layer: "Functional", title: here + " has a title", why: (face.title ? "The title on " + here + " is \"" + face.title + "\"." : "No title element was found on " + here + ".") + later, fw: browser });
  const notOneH1 = across((page) => (page.h1 || []).length !== 1);
  addCase(cases, { id: "FN-03", layer: "Functional", title: here + " has one clear h1 above its h2 headings", why: face.h1.length + " h1 and " + (sig.h2 || 0) + " h2 elements were counted on " + here + "." + elsewhere(notOneH1, "Pages without exactly one h1:") + " Heading text would be compared with the visible hero, and the order checked in the rendered accessibility tree.", fw: browser, pages: notOneH1.slice(0, 12) });
  const noLang = across((page) => !page.lang);
  addCase(cases, { id: "FN-04", layer: "Functional", title: "The html element on " + here + " declares the language a person reads", why: (face.lang ? "lang=\"" + face.lang + "\" is declared on " + here + (face.textLang && face.lang.slice(0, 2).toLowerCase() !== face.textLang ? ", while the visible text reads as " + face.textLang : "") + "." : "No lang attribute was found on " + here + ".") + elsewhere(noLang, "Also without lang:") + " A bilingual site would need hreflang and a visible language switch as well.", fw: browser, pages: noLang.slice(0, 12) });
  addCase(cases, { id: "FN-05", layer: "Functional", title: "Buttons on " + here + " have an accessible name", why: face.buttons + " button elements were counted on " + here + "." + later + " Empty buttons and icon-only controls would fail.", fw: browser });
  addCase(cases, { id: "FN-06", layer: "Functional", title: "Every page analyzed on " + host + " keeps a successful status", why: failed.length ? failed.length + " of " + pages.length + " pages were outside 200–399: " + failed.slice(0, 4).map((page) => on(page.path) + " answered " + (page.status || page.error)).join(", ") + "." : pages.length + " pages on " + host + " stayed in the success range. A regression run would fail on a new 404 or 500 on the same paths.", fw: browser, pages: failed.map((page) => page.path).slice(0, 12) });
  addCase(cases, { id: "FN-07", layer: "Functional", title: "Each page on " + host + " keeps a title", why: (untitled.length ? untitled.length + " pages had no title: " + listed(untitled.map((page) => page.path)) + "." : "Every page analyzed on " + host + " had a title.") + " Titles would be asserted per path, including pages reached through one link.", fw: browser, pages: untitled.map((page) => page.path).slice(0, 12) });
  if (duplicateTitles) addCase(cases, { id: "FN-08", layer: "Functional", title: "Titles stay distinct across the pages analyzed on " + host, why: duplicateTitles + " titles repeated on " + host + ". A content regression would flag two indexable URLs that share one title.", fw: browser });
  const noDescription = across((page) => !page.description);
  addCase(cases, { id: "CT-01", layer: "Content", title: "The meta description on " + here + " is present and 50 to 160 characters", why: (face.description ? "The description on " + here + " has " + face.description.length + " characters." : "No meta description was found on " + here + ".") + elsewhere(noDescription, "Also without one:") + " The useful band for a snippet is about 50 to 160 characters.", fw: browser, pages: noDescription.slice(0, 12) });
  const canonicalAway = face.seo && face.seo.canonicalAbs && face.seo.canonicalAbs.replace(/\/$/, "") !== home.url.replace(/\/$/, "") ? face.seo.canonicalAbs : "";
  addCase(cases, { id: "CT-02", layer: "Content", title: "The canonical link on " + here + " points at the preferred URL", why: (face.canonical ? "Canonical is " + face.canonical + (canonicalAway ? ", which is not the final URL " + home.url : "") + "." : "No canonical link was found on " + here + ".") + " The preferred URL would be compared with " + home.url + ".", fw: browser });
  const social = face.social || {};
  addCase(cases, { id: "CT-03", layer: "Content", title: "Title, description, canonical, and social cards on " + here + " describe the same page", why: (sig.openGraph ? "Open Graph is present" + (social.ogImage ? " with an image" : " without og:image") + (social.ogUrl && social.ogUrl.replace(/\/$/, "") !== home.url.replace(/\/$/, "") ? ", and og:url is " + social.ogUrl : "") + "." : "No Open Graph tag was found on " + here + ".") + (social.twitterCard ? " The Twitter card is " + social.twitterCard + "." : sig.twitter ? " A Twitter card tag is present." : " No Twitter card tag was found.") + " A later case would assert og:title, og:image, og:url, and the card type against the title and canonical.", fw: browser });
  addCase(cases, { id: "CT-04", layer: "Content", title: "Structured data on " + here + " is valid when the page publishes it", why: (sig.jsonLd ? sig.jsonLd + " JSON-LD block(s) were found on " + here + "." : "No JSON-LD block was found on " + here + ".") + " The type would be checked against the visible page, for example an organization, article, or product.", fw: browser });
  addCase(cases, { id: "CT-05", layer: "Content", title: "The h1 and the title on " + here + " agree", why: (face.h1[0] ? "The first h1 is \"" + face.h1[0] + "\"" + (face.title ? " and the title is \"" + face.title + "\"" : "") + "." : "There is no h1 text on " + here + " to compare.") + " The two do not have to be identical, and they should not describe different pages.", fw: browser });
  const capPages = (limits && limits.maxPages) || MAX_PAGES;
  addCase(cases, { id: "LK-01", layer: "Links", title: "Links from " + here + " to other pages on " + host + " resolve", why: face.links.length + " same-host links were listed on " + here + (face.renderedLinks ? ", " + face.renderedLinks + " of them only after JavaScript ran" : "") + ". This review opened at most " + capPages + " of them and did not click them. A later run would request each href and accept only an HTML document on " + host + ".", fw: browser });
  if (robotsBlocked) addCase(cases, { id: "LK-03", layer: "Links", title: "robots.txt on " + host + " still lets crawlers reach the pages that matter", why: robotsBlocked + " linked URLs were skipped because robots.txt on " + host + " disallows them. A later crawler case would log each skipped path and flag any that the navigation promotes.", fw: browser });
  journeys(pages, dom).forEach((step, index) => {
    addCase(cases, {
      id: "JR-0" + (index + 1),
      layer: "Functional",
      title: "Clicking “" + step.text + "” on " + here + " opens " + on(step.target),
      why: here + " " + (step.where === "main" ? "content" : "navigation") + " links “" + step.text + "” to " + on(step.target) + " (" + step.selector + ")." +
        (step.h1 ? " The page analyzed there has the heading “" + step.h1 + "”." : "") +
        " A browser run would click the link at 1280 px, wait for " + step.target + (step.h1 ? ", and check the heading" : "") + ". Nothing is submitted." +
        (dom.banner ? " " + (dom.banner === "A cookie banner" ? "A cookie banner" : "The " + dom.banner + " banner") + " covers the first visit, so close it before the click." : ""),
      fw: browser,
      journey: step
    });
  });
  const formPages = across((page) => (page.forms || 0) > 0);
  if (formPages.length) {
    const worstForm = most((page) => (page.forms ? 1 : 0) + (page.unlabeled || 0) * 2) || home;
    const formAt = worstForm.path || startPath;
    const unlabeled = sumOf((page) => page.unlabeled);
    const requiredPages = across((page) => ((page.signals && page.signals.required) || 0) > 0);
    addCase(cases, { id: "FM-01", layer: "Forms", title: "Fields on " + on(formAt) + " have labels", why: "Forms were found on " + listed(formPages) + ". " + unlabeled + " controls across them had no label element, aria-label, aria-labelledby, or title" + ((inspectOf(worstForm).unlabeled || 0) ? ", " + inspectOf(worstForm).unlabeled + " of them on " + on(formAt) : "") + ". Nothing was submitted. A later case would pair each control with its label, using a test account the owner provides for anything behind a submit.", fw: browser, path: formAt, pages: formPages.slice(0, 12) });
    const requiredAt = requiredPages[0] || formAt;
    addCase(cases, { id: "FM-04", layer: "Forms", title: "Required fields on " + on(requiredAt) + " block an empty submit", why: sumOf((page) => page.signals && page.signals.required) + " inputs were marked required in the HTML" + (requiredPages.length ? " on " + listed(requiredPages) : "") + ". A browser case would submit the empty form and expect the constraint message, without creating a record.", fw: browser, path: requiredAt, pages: requiredPages.slice(0, 12) });
  }
  const passwordPages = across((page) => !!page.password);
  if (passwordPages.length) addCase(cases, { id: "FM-03", layer: "Forms", title: "The sign-in form on " + on(passwordPages[0]) + " is reviewed only with credentials the owner issued", why: "A password field is on " + listed(passwordPages) + ". This review did not type in it. A later case would use a disposable account and would assert the error for a wrong password.", fw: browser, path: passwordPages[0], pages: passwordPages.slice(0, 12) });
  const searchPages = across((page) => !!(page.signals && page.signals.search));
  if (searchPages.length) addCase(cases, { id: "FM-05", layer: "Forms", title: "Search on " + on(searchPages[0]) + " accepts a known term and an empty term", why: "A search control was found on " + listed(searchPages) + ". The case would submit one known term and one empty term, and it would not scrape the result set.", fw: browser, path: searchPages[0], pages: searchPages.slice(0, 12) });
  const filePages = across((page) => !!(page.signals && page.signals.fileInput));
  if (filePages.length) addCase(cases, { id: "FM-06", layer: "Forms", title: "File inputs on " + on(filePages[0]) + " state an accepted type before a file is chosen", why: "A file input is on " + listed(filePages) + ". The case would assert the accept attribute and would not upload a file.", fw: browser, path: filePages[0], pages: filePages.slice(0, 12) });
  const altPages = across((page) => (page.missingAlt || 0) > 0);
  const worstAlt = most((page) => page.missingAlt || 0);
  addCase(cases, { id: "A11Y-01", layer: "Accessibility", title: "Images on " + host + " expose a text alternative", why: face.images + " images on " + here + ", " + face.missingAlt + " without an alt attribute." + (altPages.length ? " " + sumOf((page) => page.missingAlt) + " images without alt across " + listed(altPages) + (worstAlt ? ", most on " + on(worstAlt.path) : "") + "." : "") + " Informative images need text. Decorative images need an empty alt.", fw: browser, path: worstAlt && worstAlt.path !== startPath ? worstAlt.path : undefined, pages: altPages.slice(0, 12) });
  addCase(cases, { id: "A11Y-02", layer: "Accessibility", title: here + " has a main landmark and a skip link", why: (sig.main ? "A main element is present on " + here + "." : "No main element was found on " + here + ".") + (sig.skip ? " A skip link was found." : " No skip link was found.") + (fit["axe-core"] ? " The review's headless browser runs axe-core on the rendered page." : ""), fw: browser, also: named(["axe-core"]) });
  addCase(cases, { id: "A11Y-04", layer: "Accessibility", title: "Text contrast and keyboard focus on " + here + " hold up", why: "Contrast is measured by axe-core in the review's headless browser. Focus order still needs a person: the case would tab from the top of " + here + " and record the focus ring.", fw: browser });
  const framePages = across((page) => ((page.signals && page.signals.untitledFrames) || 0) > 0);
  if (sig.iframes || framePages.length) addCase(cases, { id: "A11Y-05", layer: "Accessibility", title: "Frames on " + host + " expose a title", why: (sig.iframes || 0) + " iframe(s) on " + here + ", " + (sig.untitledFrames || 0) + " without a title attribute." + elsewhere(framePages, "Untitled frames also on:") + " Each embedded document needs a name a screen reader can announce.", fw: browser, pages: framePages.slice(0, 12) });
  const legal = face.legal || {};
  addCase(cases, { id: "A11Y-06", layer: "Accessibility", title: "An accessibility statement is linked from every page on " + host, why: (legal.accessibility ? here + " links \"" + (legal.accessibility.text || legal.accessibility.href) + "\"." : here + " links no accessibility statement.") + " The European Accessibility Act has required one from shops and services sold to EU consumers since June 2025. The case would follow the footer link on each template and check the page names a contact for access problems.", fw: browser });
  const zoomPages = across((page) => !!(page.signals && page.signals.zoomBlocked));
  if (zoomPages.length) addCase(cases, { id: "A11Y-07", layer: "Accessibility", title: "Pinch zoom is allowed on " + on(zoomPages[0]), why: "The viewport meta tag on " + listed(zoomPages) + " sets user-scalable=no or a maximum scale of 1. People with low vision cannot enlarge the text on a phone.", fw: browser, path: zoomPages[0], pages: zoomPages.slice(0, 12), keys: ["a11y-zoom"], verdict: "fail", severity: "medium", check: { kind: "count", path: zoomPages[0], selector: "meta[name=\"viewport\"][content*=\"user-scalable=no\" i], meta[name=\"viewport\"][content*=\"user-scalable=0\" i], meta[name=\"viewport\"][content*=\"maximum-scale=1\" i]", op: "eq", n: 0 } });
  const tabPages = across((page) => ((page.signals && page.signals.positiveTabindex) || 0) > 0);
  if (tabPages.length) addCase(cases, { id: "A11Y-08", layer: "Accessibility", title: "Keyboard order on " + on(tabPages[0]) + " follows the page, not a positive tabindex", why: sumOf((page) => page.signals && page.signals.positiveTabindex) + " elements set tabindex above 0 on " + listed(tabPages) + ". They jump the keyboard ahead of the rest of the page.", fw: browser, path: tabPages[0], pages: tabPages.slice(0, 12), keys: ["a11y-tabindex"], verdict: "risk", severity: "low", check: { kind: "count", path: tabPages[0], selector: "[tabindex]:not([tabindex=\"0\"]):not([tabindex^=\"-\"])", op: "eq", n: 0 } });
  addCase(cases, { id: "SEC-01", layer: "Security", title: "http://" + host + "/ redirects to https://" + host + "/", why: "The review read " + home.url + " over https. A browser case would request http://" + host + "/ and expect one redirect to the https address, with no page served over plain http.", fw: browser, keys: ["sec-http"] });
  addCase(cases, { id: "SEC-02", layer: "Security", title: here + " sets HSTS", why: (face.headers.hsts ? "strict-transport-security on " + here + " is " + face.headers.hsts + "." : "strict-transport-security was absent on " + here + ".") + " The later assertion is max-age, includeSubDomains, and a fresh profile that stays on https.", fw: browser });
  const csp = String(face.headers.csp || "");
  const cspGaps = csp ? [/'unsafe-inline'/.test(csp) && !/'nonce-|'sha(256|384|512)-|'strict-dynamic'/.test(csp) ? "'unsafe-inline' without a nonce or hash" : "", /'unsafe-eval'/.test(csp) ? "'unsafe-eval'" : "", !/frame-ancestors/.test(csp) ? "no frame-ancestors" : "", !/(default|script)-src/.test(csp) ? "no script-src or default-src" : "", /(default|script)-src[^;]*\s\*(\s|;|$)/.test(csp) ? "a wildcard script source" : ""].filter(Boolean) : [];
  addCase(cases, { id: "SEC-03", layer: "Security", title: here + " sends a content security policy that limits scripts", why: (csp ? "content-security-policy is present on " + here + (cspGaps.length ? ", with " + cspGaps.join(", ") : " and names script sources and frame-ancestors") + "." : "content-security-policy was absent on " + here + ".") + " The policy would be checked for script-src and frame-ancestors, not only for the header name.", fw: browser });
  addCase(cases, { id: "SEC-04", layer: "Security", title: here + " sets nosniff and a frame policy", why: "x-content-type-options: " + (face.headers.nosniff || "absent") + ". x-frame-options: " + (face.headers.frame || "absent") + ". A framed copy of " + here + " would be expected to fail when a frame policy is present.", fw: browser });
  addCase(cases, { id: "SEC-05", layer: "Security", title: here + " sets Referrer-Policy", why: (face.headers.referrer ? "referrer-policy on " + here + " is " + face.headers.referrer + "." : "referrer-policy was absent on " + here + ".") + " The later case would open an outbound link and confirm the referrer is no wider than the policy.", fw: browser });
  if (face.cookies.length) {
    const loose = face.cookies.filter((cookie) => !cookie.secure || !cookie.httpOnly);
    const site = face.cookies.filter((cookie) => !cookie.sameSite);
    const nameOf = (list) => list.slice(0, 4).map((cookie) => cookie.name).filter(Boolean).join(", ");
    addCase(cases, { id: "SEC-06", layer: "Security", title: "Cookies set by " + here + " are Secure and HttpOnly where they carry a session", why: face.cookies.length + " cookies were set by " + here + ". " + loose.length + " were missing Secure or HttpOnly" + (loose.length && nameOf(loose) ? " (" + nameOf(loose) + ")" : "") + ". " + site.length + " had no SameSite attribute" + (site.length && nameOf(site) ? " (" + nameOf(site) + ")" : "") + ".", fw: browser });
  }
  addCase(cases, { id: "SEC-07", layer: "Security", title: "Response headers from " + host + " do not reveal the server build", why: (face.headers.server ? "Server header: " + face.headers.server + "." : "No Server header was sent by " + host + ".") + ((face.rawHeaders && face.rawHeaders.poweredBy) ? " x-powered-by: " + face.rawHeaders.poweredBy + "." : "") + " The case records the header and does not treat a product name as a vulnerability by itself.", fw: browser });
  addCase(cases, { id: "SEC-08", layer: "Security", title: "A permissions policy on " + here + " limits powerful features", why: (sig.permissions ? "A permissions policy is present on " + here + "." : "No permissions-policy header was found on " + here + ".") + " Camera, microphone, and geolocation would be expected to stay disabled unless the page needs them.", fw: browser });
  const mixedPages = across((page) => ((page.signals && page.signals.mixed) || 0) > 0);
  addCase(cases, { id: "SEC-09", layer: "Security", title: "Pages on " + host + " load nothing over plain http", why: sumOf((page) => page.signals && page.signals.mixed) + " scripts, images, frames, or stylesheets load over plain http" + (mixedPages.length ? " on " + listed(mixedPages) : " on the pages analyzed") + ". Mixed content would be confirmed in a browser console, not by downloading those URLs here.", fw: browser, pages: mixedPages.slice(0, 12) });
  const libs = [...new Set(pages.reduce((all, page) => all.concat((page.inspect && page.inspect.libraries) || []), (dom && dom.libraries) || []).map((row) => row.name + " " + row.version))];
  if (libs.length) addCase(cases, { id: "SEC-10", layer: "Security", title: "Front-end libraries on " + host + " have no known flaw", why: "The review found " + libs.slice(0, 5).join(", ") + " from script addresses, banners or page globals. The case would compare each version with the retire.js list on every release.", fw: browser });
  const sriHosts = (face.sri && face.sri.missing) || [];
  if (sriHosts.length) addCase(cases, { id: "SEC-14", layer: "Security", title: "Scripts from other hosts on " + here + " carry an integrity hash", why: "Scripts from " + sriHosts.slice(0, 4).join(", ") + " load on " + here + " without an integrity attribute. A changed file on one of those hosts would run on " + host + " unchecked. The case would assert integrity and crossorigin on each pinned script.", fw: browser, keys: ["sec-sri"], verdict: "risk", severity: "low" });
  const formHosts = (face.resources && face.resources.forms) || [];
  if (formHosts.length) addCase(cases, { id: "SEC-15", layer: "Security", title: "Forms on " + here + " post only to hosts the owner names", why: "A form on " + here + " posts to " + formHosts.slice(0, 3).join(", ") + ", not to " + host + ". The case would check that the host is the owner's processor, uses https, and is named in the privacy notice. Nothing is submitted.", fw: browser });
  addCase(cases, { id: "PR-01", layer: "Privacy", title: "A privacy notice is linked from " + here, why: (legal.privacy ? here + " links \"" + (legal.privacy.text || legal.privacy.href) + "\"." : sig.privacyLink ? "The HTML of " + here + " mentions a privacy or legal destination, but no link to a privacy notice was found." : "No privacy or legal wording was found on " + here + ".") + " Confirm the link in a browser before treating it as found.", fw: browser });
  if (legal.imprint || germanSpeaking(face.lang, face.textLang, home.url)) addCase(cases, { id: "PR-04", layer: "Privacy", title: "An imprint on " + host + " names who runs the site", why: (legal.imprint ? here + " links \"" + (legal.imprint.text || legal.imprint.href) + "\"." : here + " links no imprint.") + " German-speaking sites must name the provider, an address and a contact (§ 5 DDG in Germany, § 5 ECG in Austria). The case would open the imprint from every template.", fw: browser });
  addCase(cases, { id: "PR-02", layer: "Privacy", title: "Third-party scripts on " + here + " are named before they run", why: (sig.thirdParty || []).length + " other hosts were referenced by script src on " + here + ((sig.thirdParty || []).length ? " (" + sig.thirdParty.slice(0, 4).join(", ") + ")." : ".") + " A privacy case would load the page with tags blocked and then with consent.", fw: browser });
  if (tracked) addCase(cases, { id: "PR-03", layer: "Privacy", title: "A consent notice on " + here + " appears before tags or cookies", why: (sig.consent ? "Cookie or consent wording was found on " + here + "." : "No cookie or consent wording was found on " + here + ".") + " The case would assert the notice before analytics storage is written.", fw: browser });
  if (multilingual) addCase(cases, { id: "SEO-02", layer: "SEO", title: "Language alternates on " + host + " are explicit", why: (sig.hreflang || 0) + " hreflang alternate(s) were found on " + here + ". Each alternate would point at an https URL on " + host + " and include a self reference.", fw: browser });
  addCase(cases, { id: "SEO-03", layer: "SEO", title: "A sitemap for " + host + " is advertised in robots.txt", why: (sig.sitemap ? "The word sitemap appears on " + here + "." : "No sitemap reference was seen on " + here + ".") + " The review fetches the sitemap from robots.txt or /sitemap.xml and compares it with the pages it read.", fw: browser });
  const types = [].concat.apply([], ((face.schema && face.schema.items) || []).map((item) => item.types || []));
  const entityType = types.find((type) => /^(\w*Organization|Corporation|LocalBusiness|Person|NGO|Store|Restaurant|ProfessionalService|OnlineBusiness)$/.test(type));
  addCase(cases, { id: "GEO-01", layer: "GEO", title: "AI answer and search crawlers may read " + host, why: "robots.txt on " + host + " would be read for OAI-SearchBot, ChatGPT-User, PerplexityBot, Perplexity-User, Claude-SearchBot, and Claude-User. A full Disallow for any of them keeps " + host + " out of the answers that product writes. Training crawlers are a separate choice and are not asserted here.", fw: browser });
  addCase(cases, { id: "GEO-02", layer: "GEO", title: host + "/llms.txt lists the pages that matter, under a one-line summary", why: "The case fetches https://" + host + "/llms.txt and expects a > summary line, the layout llmstxt.org proposes. It is a convention some AI tools read, not a ranking factor.", fw: browser });
  addCase(cases, { id: "GEO-03", layer: "GEO", title: "The main heading and text of " + here + " are in the HTML before scripts run", why: (face.words || 0) + " words of text were in the HTML " + host + " served for " + here + (sig.appShell ? ", around an empty app root." : ".") + " Most AI crawlers do not run JavaScript, so they quote only what the server sends.", fw: browser });
  addCase(cases, { id: "GEO-04", layer: "GEO", title: "An Organization or Person entity names who is behind " + host, why: (entityType ? "A " + entityType + " entity is published in JSON-LD on " + here + "." : types.length ? "JSON-LD on " + here + " is present (" + types.slice(0, 4).join(", ") + ") without an Organization or Person entity." : "No JSON-LD was found on " + here + ".") + " AI answers use the entity to name the brand, its logo, and its profiles.", fw: browser });
  addCase(cases, { id: "GEO-05", layer: "GEO", title: "Questions customers ask are answered on " + host + " under question headings or FAQ markup", why: (face.questionHeadings || 0) + " heading(s) on " + here + " are phrased as a question" + (types.indexOf("FAQPage") !== -1 ? ", and FAQPage data is present." : ".") + " Answer engines favour a short answer under the question it answers.", fw: browser });
  addCase(cases, { id: "GEO-06", layer: "GEO", title: "Content pages on " + host + " show when they were published or changed", why: (face.dated ? "A published or modified date is present on " + here + "." : "No published or modified date was found on " + here + ".") + (face.author ? " An author is named." : " No author is named, which the report lists separately.") + " Search engines and AI answers weigh whether a page is current.", fw: browser });
  const budgetMs = Math.max(800, Math.ceil(((home.ms || 0) * 1.5) / 100) * 100);
  addCase(cases, { id: "PF-01", layer: "Performance", title: here + " arrives inside an 800 ms and 1.5 MB budget", why: "This request for " + here + " took " + home.ms + " ms and " + face.bytes + " bytes. That is one fetch, not a load test, and a suite stops a page that hangs past its own timeout. A budget case would fail above 800 ms or 1.5 MB for the document alone. Lighthouse, through PageSpeed Insights, scores the rendered start page in the Performance findings.", fw: browser.concat(LOAD_FW), also: named(["Lighthouse"]) });
  addCase(cases, { id: "PF-02", layer: "Performance", title: "Scripts and stylesheets on " + here + " stay inside a budget", why: face.scripts + " external scripts and " + face.styles + " stylesheets were referenced on " + here + ((sig.blockingScripts || 0) ? ", and " + sig.blockingScripts + " script(s) in the head block rendering without async or defer" : "") + ". The later case would record the counts and the render-blocking ones.", fw: browser.concat(LOAD_FW) });
  if (slow !== home && (slow.ms || 0) > (home.ms || 0)) addCase(cases, { id: "PF-03", layer: "Performance", title: on(slow.path) + ", the slowest page analyzed, stays inside the same budget", why: "The slowest response on " + host + " was " + on(slow.path) + " at " + (slow.ms || 0) + " ms, against " + home.ms + " ms for " + here + ". The trend across the crawl is the order the pages were opened, not a history of previous days.", fw: browser.concat(LOAD_FW), path: slow.path });
  addCase(cases, { id: "LD-01", layer: "Load", title: "An authorised load run on " + here + " holds under " + budgetMs + " ms", why: here + " answered in " + home.ms + " ms to one request. JMeter, Gatling, or k6 would hold one request per second for a few minutes, ramp inside an agreed ceiling, and stop, failing above " + budgetMs + " ms at the 95th percentile or 1% errors. It needs written permission, a verified domain, and a scheduled window. This review did not open a single virtual user.", fw: LOAD_FW });
  addCase(cases, { id: "MB-01", layer: "Mobile", title: here + " holds its layout at a 390 px phone width", why: "A viewport meta tag " + (sig.viewport ? "is present on " + here + "." : "was not found on " + here + ".") + " Appium, Maestro, or a browser device profile would open the phone width, look for a horizontal scroll, and compare the same h1 and primary link.", fw: browser.concat(MOBILE_FW), also: named(["Applitools", "Percy"]) });
  addCase(cases, { id: "MB-02", layer: "Mobile", title: "The same primary path on " + here + " works at a 768 px tablet width", why: "Width, orientation, and a touch scroll would be checked in Appium, Maestro, or a browser device profile on " + here + ".", fw: browser.concat(MOBILE_FW) });
  if (multilingual) addCase(cases, { id: "I18N-02", layer: "Internationalization", title: "Direction and locale formats on " + host + " stay with the language", why: (sig.hreflang || 0) + " alternate language links were counted on " + here + ". Dates, currency, and layout direction would be asserted only for locales " + host + " claims.", fw: browser });
  addCase(cases, { id: "RS-01", layer: "Resilience", title: "A missing path on " + host + " returns a deliberate 404 page", why: (failed.length ? "This review already saw a non-success status on " + on(failed[0].path) + "." : "This review did not see a 404 among the pages it read.") + " A later case would request one unknown path on " + host + " and expect status 404 with a branded page, not a stack trace or a 200.", fw: browser, keys: ["seo-soft-404"] });
  addCase(cases, { id: "RS-03", layer: "Resilience", title: "A repeat visit to " + here + " can reuse its cache policy", why: (sig.cacheControl ? "cache-control on " + here + " is " + sig.cacheControl + "." : "No cache-control header was seen on " + here + ".") + " The later case would record the header. It would not flush a shared cache.", fw: browser });
  addCase(cases, { id: "CMP-01", layer: "Compatibility", title: here + " still explains itself when scripts do not run", why: (sig.noscript ? "A noscript element is present on " + here + "." : "No noscript element was found on " + here + ".") + " The case would disable JavaScript and check that the title and the main heading remain.", fw: browser });
  addCase(cases, { id: "CMP-02", layer: "Compatibility", title: here + " renders the same in Chromium, Firefox, and WebKit", why: "Markers seen on " + host + ": " + stack + ". The case would open " + here + " in each engine and compare the title, the h1, and the primary link. A later cross-browser pass could use BrowserStack. It is not started here.", fw: browser, also: named(["BrowserStack"]) });
  if (sig.manifest) addCase(cases, { id: "CMP-03", layer: "Compatibility", title: "The manifest on " + here + " still leaves the page readable in a normal tab", why: "A manifest link is present on " + here + ". The case would open the page in a browser tab and confirm the title and the main heading. It would not install the app.", fw: browser });
  const videoPages = across((page) => ((page.signals && page.signals.video) || 0) > 0);
  if (videoPages.length) addCase(cases, { id: "MED-01", layer: "Media", title: "Video on " + on(videoPages[0]) + " exposes captions or a transcript", why: sumOf((page) => page.signals && page.signals.video) + " video element(s) were counted on " + listed(videoPages) + ". A later case would check tracks and would not download the media file.", fw: browser, path: videoPages[0], pages: videoPages.slice(0, 12) });
  if (hasTech(names, /Google Tag Manager|Google Analytics|HubSpot/i)) addCase(cases, { id: "AN-01", layer: "Analytics", title: "Analytics tags on " + here + " wait for a recorded choice", why: "An analytics marker was seen on " + host + " (" + stack + "). The case would compare a cold load of " + here + " with a load after consent, and it would not invent a consent click.", fw: browser });
  const chat = dom && dom.chat && (dom.chat.found || []).length ? dom.chat : null;
  if (chat) {
    const chats = chat.found.map((row) => row.name).join(", ");
    addCase(cases, { id: "CHAT-01", layer: "Accessibility", title: "The chat button on " + here + " has a name and leaves the cookie banner and main buttons clear on a phone", why: chats + " loaded on " + here + " in the browser. The case would read the launcher's accessible name at 390 px and check that it sits over no banner or call-to-action button.", fw: browser });
    addCase(cases, { id: "CHAT-02", layer: "Privacy", title: "The chat on " + here + " waits for consent and stops after Reject", why: "The case would compare " + chats + " requests and cookies on a cold load of " + here + ", before a choice, and after Reject. It would not open a conversation.", fw: browser });
    addCase(cases, { id: "CHAT-03", layer: "Accessibility", title: "The open chat on " + here + " links the privacy notice and can be left with the keyboard", why: "The case would open the chat with Enter, look for a privacy link, and press Tab and Escape until focus leaves it. No message is sent.", fw: browser });
    if (chat.found.some((row) => row.ai)) addCase(cases, { id: "CHAT-04", layer: "Privacy", title: "The AI chatbot on " + here + " says it is an AI and offers a person", why: chat.found.filter((row) => row.ai).map((row) => row.name).join(", ") + " answers with a language model. A later run would open the chat and read the first message for an AI disclosure and a way to reach a person. It would not send a message in this review.", fw: browser });
  }
  if (hasTech(names, /Shopify|Magento|WooCommerce|Stripe/i)) {
    const commerceTools = [];
    if (hasTech(names, /Shopify/i)) commerceTools.push("Theme Check");
    if (hasTech(names, /Magento/i)) commerceTools.push("MFTF");
    addCase(cases, { id: "CM-01", layer: "Commerce", title: "The catalog on " + host + " is covered up to payment without placing an order", why: "A commerce or payment marker was seen on " + host + " (" + stack + "). The case would open the public listing and stop before payment. No card data is entered." + (commerceTools.length ? " " + commerceTools.join(" and ") + " would inspect the theme or the Magento suite later. Neither is launched here." : ""), fw: browser, also: commerceTools });
  }
  const sizePages = across((page) => ((page.signals && page.signals.imgNoSize) || 0) > 0);
  addCase(cases, { id: "VIS-01", layer: "Visual", title: "Images on " + host + " reserve their box before they paint", why: (sig.imgNoSize || 0) + " images on " + here + " had neither width nor height in the markup." + elsewhere(sizePages, "Unsized images also on:") + (named(["Applitools", "Percy"]).length ? " Applitools or Percy would own a later visual diff." : "") + " The review's headless browser measures layout shift on " + here + ".", fw: browser, also: named(["Applitools", "Percy"]), pages: sizePages.slice(0, 12) });
  if (sig.robotsMeta) addCase(cases, { id: "SEO-04", layer: "SEO", title: "The robots meta tag on " + here + " matches the pages that should be indexed", why: "The robots meta tag on " + here + " says " + ((face.seo && face.seo.robots) || "something") + ". The later case would compare it with the canonical URL. This review does not submit the page to a search engine.", fw: browser, keys: ["seo-noindex"] });
  if (hasTech(names, /^Salesforce$/)) {
    addCase(cases, { id: "PLAT-01", layer: "Platform", title: "The public Salesforce path on " + host + " stays available without an org login", why: "Salesforce markers were seen (" + stack + "). Provar and Copado know Lightning, Visualforce, and Experience Cloud. This review did not open an org and did not sign in.", fw: browser, also: named(["Provar", "Copado"]) });
    addCase(cases, { id: "PLAT-02", layer: "Platform", title: "Salesforce controls on " + here + " expose a name Provar can store", why: "A later Provar or Copado case would read the accessible name of each public control on " + here + ". This HTML analysis did not click one.", fw: browser, also: named(["Provar", "Copado"]) });
  }
  if (hasTech(names, /^SAP$/)) addCase(cases, { id: "PLAT-03", layer: "Platform", title: "A public SAP page on " + host + " is named for Tosca, not exercised here", why: "SAP UI markers were seen (" + stack + "). Tricentis Tosca is the suite that scans SAP screens. This review did not sign in and did not start Tosca.", fw: browser, also: ["Tricentis Tosca"] });
  if (hasTech(names, /^ServiceNow$/)) addCase(cases, { id: "PLAT-04", layer: "Platform", title: "The public ServiceNow portal on " + host + " is separate from the instance test framework", why: "ServiceNow markers were seen (" + stack + "). ServiceNow ATF runs inside the instance the owner controls. This review only analyzed the public page and did not sign in to it.", fw: browser, also: ["ServiceNow ATF"] });
  if (sig.apiHint) addCase(cases, { id: "API-01", layer: "API", title: "The public API description on " + host + " is listed without calling the API", why: "The HTML of " + here + " mentions an API description. Postman could hold that collection later. This review did not send an API request.", fw: browser, also: ["Postman"] });
  const notable = pages.slice(1).map((page) => {
    const inspect = page.inspect || {};
    const ok = page.status >= 200 && page.status < 400;
    if (!ok) return { page, severity: "high", issue: "answered " + (page.status || page.error || "nothing"), check: { kind: "status", path: page.path } };
    if (!page.title) return { page, severity: "medium", issue: "has no title", check: { kind: "title", path: page.path } };
    if (page.inspect && !(inspect.h1 || []).length) return { page, severity: "low", issue: "has no h1", check: { kind: "count", path: page.path, selector: "h1", op: "gte", n: 1 } };
    if ((page.ms || 0) > 1500) return { page, severity: "low", issue: "took " + page.ms + " ms", check: { kind: "budget", path: page.path, ms: 800, bytes: 1500000 } };
    return null;
  }).filter(Boolean).slice(0, 10);
  notable.forEach((row, index) => {
    const page = row.page;
    addCase(cases, {
      id: "FN-" + String(20 + index),
      layer: "Functional",
      title: on(page.path) + " " + row.issue,
      why: on(page.path) + " " + row.issue + " in this review (status " + (page.status || page.error || "unread") + ", " + (page.ms || 0) + " ms, title " + (page.title ? "\"" + page.title + "\"" : "none") + "). The case requests " + origin + page.path + " and fails until it answers with a title, an h1, and a success status inside 800 ms.",
      fw: browser,
      path: page.path,
      pages: [page.path],
      check: row.check,
      verdict: "fail",
      severity: row.severity
    });
  });
  return cases.map((item, index) => Object.assign({ n: index + 1 }, item));
}

function domainCases(cases, extras) {
  const dns = (extras && extras.dns) || {};
  const dom = extras && extras.domain;
  const sb = extras && extras.safeBrowsing;
  const more = [];
  if (sb) more.push({ id: "SEC-11", layer: "Security", title: "Google's Safe Browsing lists do not flag the site", why: "The Web Risk API was asked about " + sb.url + (sb.threats.length ? " and matched it as " + sb.threats.join(", ").toLowerCase().replace(/_/g, " ") + "." : " and matched no list.") + " A listed site is replaced by a red warning in Chrome, Firefox and Safari. The case would repeat the lookup after every release and after any report of a hacked page." });
  if (dom && dom.read) more.push({ id: "SEC-12", layer: "Security", title: "The domain renews in time and is locked against transfer", why: "The registry's RDAP record for " + dom.domain + (dom.expires ? " says it is registered until " + dom.expires : " publishes no expiry date") + (dom.locked == null ? "" : ", with the transfer lock " + (dom.locked ? "on" : "off")) + ". The case would read RDAP each month and fail under 30 days left or without clientTransferProhibited." });
  if (dns.domain && (dns.mx || []).length && !(dns.unread || []).includes("mx")) more.push({ id: "SEC-13", layer: "Security", title: "Mail to the domain is protected by MTA-STS and TLS-RPT", why: dns.domain + " receives mail. MTA-STS " + (dns.mtaSts ? "is announced" + (dns.mtaStsPolicy && dns.mtaStsPolicy.mode ? " in " + dns.mtaStsPolicy.mode + " mode" : ", but its policy could not be read") : "is not published") + ", and TLS-RPT " + (dns.tlsRpt ? "is published" : "is not") + ". The case would read _mta-sts and _smtp._tls, fetch https://mta-sts." + dns.domain + "/.well-known/mta-sts.txt, and expect mode: enforce." });
  if (!more.length) return cases;
  const at = cases.reduce((last, item, index) => /^SEC-/.test(item.id) ? index + 1 : last, cases.length);
  return cases.slice(0, at).concat(more.map((item) => Object.assign({ status: "proposed", fw: BROWSER_FW }, item)), cases.slice(at))
    .map((item, index) => Object.assign(item, { n: index + 1 }));
}

function pagePath(pageUrl) {
  try {
    const parsed = new URL(pageUrl);
    return parsed.pathname + parsed.search;
  } catch (error) {
    return pageUrl;
  }
}

function buildAlerts(html, inspect, path) {
  const alerts = [];
  const headers = (inspect && inspect.headers) || {};
  const body = String(html || "");
  const push = (level, title, detail) => {
    if (alerts.length >= 8) return;
    alerts.push({ id: "AL-" + String(alerts.length + 1).padStart(2, "0"), level, title, detail });
  };
  if (/AKIA[0-9A-Z]{16}/.test(body)) push("Leak", "A cloud-key shape is in the public HTML", "The page " + path + " contains a string shaped like a cloud access key. This report does not copy that string. If it is a real key, rotate it and take it off the page.");
  if (/-----BEGIN [A-Z ]*PRIVATE KEY-----/.test(body)) push("Leak", "A private-key block is in the public HTML", "The page " + path + " contains a private-key header. This report does not copy the block. Remove it and rotate anything it protected.");
  if (/sk_live_[0-9a-zA-Z]{8,}/.test(body)) push("Leak", "A live payment-key shape is in the public HTML", "The page " + path + " contains a string shaped like a live payment secret. This report does not copy it. Rotate the key and take it off the page.");
  if (/Traceback \(most recent call last\)|SQLSTATE\[|Fatal error:/.test(body)) push("Leak", "An error trace is in the public HTML", "The page " + path + " shows an error trace. A trace can name internal paths. This review did not follow it.");
  if (!headers.hsts) push("Exposure", "HSTS is absent", "The first response did not send strict-transport-security. A later visit can still be steered to plain http. This is a missing control. It is not proof that someone broke in.");
  if (!headers.csp) push("Exposure", "A content security policy is absent", "The first response did not send content-security-policy. Script sources are not limited by that header. This is a missing control. It is not proof of an intrusion.");
  const loose = ((inspect && inspect.cookies) || []).filter((cookie) => !cookie.secure || !cookie.httpOnly);
  if (loose.length) push("Exposure", "A cookie is missing Secure or HttpOnly", loose.length + " cookies on the first response lack Secure or HttpOnly. A session cookie in that state can be read by script or sent on plain http. This review did not use the cookie.");
  const mixed = inspect && inspect.signals && inspect.signals.mixed;
  if (mixed) push("Exposure", "The HTML names plain http resources", mixed + " scripts, images, frames, or stylesheets load over plain http. A browser would warn on some of them. Those URLs were not downloaded here.");
  return alerts;
}

function mentionTone(text) {
  const value = String(text || "").toLowerCase();
  if (/breach|hack|ransomware|stolen|leak|lawsuit|outage|vulnerab|intrusion/.test(value)) return "Unfavorable";
  if (/award|launch|growth|funding|partnership|opens|named/.test(value)) return "Favorable";
  return "Mention";
}

function parseMentions(results, hostname) {
  const mentions = [];
  const seen = new Set();
  (Array.isArray(results) ? results : []).forEach((result) => {
    if (mentions.length >= 4) return;
    const href = String((result && result.url) || "");
    const title = String((result && result.title) || "").replace(/\s+/g, " ").trim();
    if (!/^https?:\/\//i.test(href) || !title) return;
    let host = "";
    try { host = new URL(href).hostname.replace(/^www\./, ""); } catch (error) { host = ""; }
    if (!host || host === hostname || seen.has(href)) return;
    seen.add(href);
    mentions.push({ title: title.slice(0, 180), href, tone: mentionTone(title) });
  });
  return mentions;
}

function searchText(value) {
  let out = decode(String(value || ""));
  let before;
  do { before = out; out = out.replace(/<[^<>]*>/g, ""); } while (out !== before);
  return out.replace(/[<>]/g, "").replace(/\s+/g, " ").trim();
}

function searchResults(rows, pick) {
  return (Array.isArray(rows) ? rows : []).slice(0, 10).map((row) => {
    const [title, url, description] = pick(row || {});
    return { title: searchText(title).slice(0, 300), url: clean(url, 500), description: searchText(description).slice(0, 2000) };
  }).filter((item) => /^https?:\/\//i.test(item.url));
}

async function searchJson(url, init) {
  try {
    const res = await fetch(url, Object.assign({ signal: AbortSignal.timeout(6000) }, init));
    return res.ok ? await res.json() : null;
  } catch (error) {
    return null;
  }
}

// Free plan: $5 of credit a month, about 1,000 requests (https://api-dashboard.search.brave.com).
async function braveSearch(query, key) {
  const data = await searchJson("https://api.search.brave.com/res/v1/web/search?count=10&q=" + encodeURIComponent(query), {
    headers: { accept: "application/json", "x-subscription-token": key }
  });
  return searchResults(data && data.web && data.web.results,
    (row) => [row.title, row.url, [row.description].concat(row.extra_snippets || []).join(" ")]);
}

// Free plan: 1,000 credits a month, one per basic search (https://app.tavily.com).
async function tavilySearch(query, key) {
  const data = await searchJson("https://api.tavily.com/search", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: "Bearer " + key },
    body: JSON.stringify({ query, max_results: 10, search_depth: "basic" })
  });
  return searchResults(data && data.results, (row) => [row.title, row.url, row.content]);
}

// Web results as [{ title, url, description }]: Brave Search, then Tavily when Brave has no key, fails or
// finds nothing. Without either key the web search is off and answers [].
async function webSearch(query, keys = process.env) {
  if (keys.BRAVE_SEARCH_KEY) {
    const rows = await braveSearch(query, keys.BRAVE_SEARCH_KEY);
    if (rows.length) return rows;
  }
  return keys.TAVILY_API_KEY ? tavilySearch(query, keys.TAVILY_API_KEY) : [];
}

function lookupMentions(hostname) {
  return webSearch('"' + hostname + '"').then((results) => {
    try { return parseMentions(results, hostname); } catch (error) { return []; }
  });
}

function withTimeout(promise, ms, fallback) {
  let timer = null;
  return Promise.race([promise, new Promise((resolve) => { timer = setTimeout(() => resolve(fallback), ms); })]).finally(() => clearTimeout(timer));
}

async function fetchExtra(url, halt, keepPartial, acceptLanguage) {
  try {
    const res = await fetchPublic(url, halt, null, keepPartial, acceptLanguage);
    const type = header(res.headers, "content-type");
    const body = String(res.body || "");
    return {
      status: res.status,
      url: res.url,
      truncated: !!res.truncated || body.length > 600000,
      body: body.slice(0, 600000),
      html: /text\/html|application\/xhtml/i.test(type) || /^\s*<(!doctype|html)/i.test(res.body || "")
    };
  } catch (error) {
    if (error && error.code === "STOPPED") throw error;
    return { status: 0, error: clean(error.message, 120), body: "" };
  }
}

function sitemapCandidates(urls, startUrl, prefix, limit, already) {
  const skip = new Set(already || []);
  let startPath = "";
  try { startPath = pagePath(startUrl); } catch (error) { startPath = ""; }
  const out = [];
  (Array.isArray(urls) ? urls : []).forEach((raw) => {
    if (out.length >= limit) return;
    const next = sameHost(startUrl, raw);
    if (!next || skip.has(next) || out.indexOf(next) !== -1) return;
    if (startPath && pagePath(next) === startPath) return;
    if (/\.(pdf|zip|jpe?g|png|gif|webp|svg|mp4|mp3|docx?|xlsx?|xml|gz|css|js)(\?|$)/i.test(next)) return;
    if (prefix && !underSection(next, prefix)) return;
    out.push(next);
  });
  return out;
}

function sitemapLocs(xml) {
  const locs = [];
  const re = /<loc>\s*([\s\S]*?)\s*<\/loc>/gi;
  let match;
  while ((match = re.exec(String(xml || ""))) && locs.length < 5000) locs.push(decode(match[1].replace(/<!\[CDATA\[|\]\]>/g, "")));
  return locs;
}

async function readSitemap(origin, robotsText, halt, acceptLanguage) {
  const listed = [];
  let listedTotal = 0;
  String(robotsText || "").split(/\r?\n/).forEach((line) => {
    const match = line.match(/^\s*sitemap\s*:\s*(\S+)/i);
    if (match) listedTotal += 1;
    if (match && listed.length < 5) listed.push(match[1]);
  });
  const host = new URL(origin).hostname;
  const upgraded = listed.map((url) => {
    try {
      const parsed = new URL(url);
      if (parsed.protocol === "http:" && parsed.hostname === host) parsed.protocol = "https:";
      return parsed.toString();
    } catch (error) { return url; }
  });
  const candidates = upgraded.concat([origin + "/sitemap.xml"]).filter((url, index, all) => all.indexOf(url) === index && /^https:\/\//i.test(url));
  let last = { status: 0 };
  for (let i = 0; i < candidates.length && i < 3; i += 1) {
    const res = await fetchExtra(candidates[i], halt, true, acceptLanguage);
    last = res;
    if (res.status !== 200 || res.html) continue;
    let urls = sitemapLocs(res.body);
    let partial = !!res.truncated || listedTotal > 1;
    if (/<sitemapindex\b/i.test(res.body)) {
      const all = urls.filter((url) => /^https:\/\//i.test(url));
      const children = all.slice(0, 3);
      if (all.length > children.length || all.length < urls.length) partial = true;
      urls = [];
      for (let j = 0; j < children.length; j += 1) {
        const child = await fetchExtra(children[j], halt, true, acceptLanguage);
        if (child.status === 200 && !child.html) urls = urls.concat(sitemapLocs(child.body));
        if (child.truncated) partial = true;
        if (urls.length >= 5000) break;
      }
    }
    if (urls.length >= 5000) partial = true;
    if (urls.length) return { source: candidates[i], status: 200, urls: urls.slice(0, 5000), partial };
  }
  return { source: candidates[0] || "", status: last.status || 0, urls: [] };
}

const PATHS_SHOWN = 300;
const PATHS_DEADLINE_MS = 12000;
const PATHS_KEEP_MS = 6 * 3600 * 1000;
const PATHS_EMPTY_KEEP_MS = 30 * 60 * 1000;
const pathsCache = new Map();

function pathsHost(raw) {
  const host = String(raw || "").trim().toLowerCase().replace(/^https?:\/\//, "").split(/[/?#]/)[0].replace(/\.$/, "");
  if (host.length > 253 || !/^([a-z0-9-]+\.)+([a-z]{2,}|xn--[a-z0-9-]+)$/.test(host)) return "";
  if (net.isIP(host) || hostBlocked(host)) return "";
  return host;
}

// Same-site page paths from sitemap URLs, the shallowest and shortest first.
function sitemapPaths(urls, host, limit) {
  const bare = (name) => String(name || "").toLowerCase().replace(/^www\./, "");
  const seen = new Set();
  (Array.isArray(urls) ? urls : []).forEach((raw) => {
    let parsed;
    try { parsed = new URL(raw); } catch (error) { return; }
    if (!/^https?:$/.test(parsed.protocol) || bare(parsed.hostname) !== bare(host)) return;
    let path = parsed.pathname;
    try { path = decodeURI(path); } catch (error) { /* keep it encoded */ }
    if (path === "/" || path.length > 200 || /\.(pdf|zip|jpe?g|png|gif|webp|svg|mp4|mp3|docx?|xlsx?|xml|gz|css|js|json|txt)$/i.test(path)) return;
    seen.add(path);
  });
  const depth = (path) => path.replace(/\/$/, "").split("/").length;
  return Array.from(seen)
    .sort((a, b) => depth(a) - depth(b) || a.length - b.length || (a < b ? -1 : a > b ? 1 : 0))
    .slice(0, limit || PATHS_SHOWN);
}

async function readPaths(host) {
  const origin = "https://" + host;
  const stopAt = Date.now() + PATHS_DEADLINE_MS;
  const halt = () => Date.now() > stopAt;
  try {
    const robots = await fetchExtra(origin + "/robots.txt", halt, true);
    const robotsText = robots.status === 200 && !robots.html ? robots.body : "";
    const map = await readSitemap(origin, robotsText, halt);
    return { host, source: map.urls.length ? map.source : "", paths: sitemapPaths(map.urls, host) };
  } catch (error) {
    if (error && error.code === "STOPPED") return { host, source: "", paths: [] };
    throw error;
  }
}

// Page paths a site lists in its sitemap, for the URL Review box. Cached per host, so typing never reaches the site.
async function sitePaths(raw) {
  const host = pathsHost(raw);
  if (!host) {
    const error = new Error("Enter a public host name, like example.com.");
    error.code = "BAD_HOST";
    throw error;
  }
  const now = Date.now();
  const kept = pathsCache.get(host);
  if (kept && kept.until > now) return kept.result;
  const result = readPaths(host);
  pathsCache.set(host, { until: now + PATHS_KEEP_MS, result });
  if (pathsCache.size > 500) pathsCache.delete(pathsCache.keys().next().value);
  result.then((value) => {
    if (!value.paths.length) pathsCache.set(host, { until: Date.now() + PATHS_EMPTY_KEEP_MS, result });
  }, () => pathsCache.delete(host));
  return result;
}

async function dnsFacts(hostname) {
  const domain = registrable(hostname);
  // Only "no such data" means the record is absent; a timeout or server failure leaves it unread (null).
  const settle = (promise) => withTimeout(promise.catch((err) => (/^(ENODATA|ENOTFOUND)$/.test(err && err.code) ? [] : null)), 5000, null);
  const txt = (name) => settle(dns.resolveTxt(name).then((rows) => rows.map((parts) => parts.join(""))));
  const [soa, root, dmarc, mx, caa, mtaSts, tlsRpt, bimi] = await Promise.all([
    withTimeout(dns.resolveSoa(domain).catch(() => null), 5000, null),
    txt(domain),
    txt("_dmarc." + domain),
    settle(dns.resolveMx(domain)),
    settle(dns.resolveCaa(domain)),
    txt("_mta-sts." + domain),
    txt("_smtp._tls." + domain),
    txt("default._bimi." + domain)
  ]);
  const unread = [["spf", root], ["dmarc", dmarc], ["mx", mx], ["caa", caa], ["mta-sts", mtaSts], ["tlsrpt", tlsRpt], ["bimi", bimi]].filter(([, rows]) => !rows).map(([name]) => name);
  // RFC 7505: a single MX of "." (Node reports an empty exchange) means the domain accepts no mail.
  const nullMx = !!mx && mx.length === 1 && /^\.?$/.test(String(mx[0].exchange || ""));
  return {
    domain,
    spf: clean((root || []).find((row) => /^v=spf1/i.test(row)) || "", 300),
    dmarc: clean((dmarc || []).find((row) => /^v=DMARC1/i.test(row)) || "", 300),
    mx: nullMx ? [] : (mx || []).slice(0, 5).map((row) => clean(row.exchange, 120)),
    nullMx,
    caa: (caa || []).slice(0, 5).map((row) => clean(row.issue || row.issuewild || row.iodef || "", 120)),
    mtaSts: clean((mtaSts || []).find((row) => /^v=STSv1/i.test(row)) || "", 200),
    tlsRpt: clean((tlsRpt || []).find((row) => /^v=TLSRPTv1/i.test(row)) || "", 300),
    bimi: clean((bimi || []).find((row) => /^v=BIMI1/i.test(row)) || "", 300),
    // RFC 1035: the SOA RNAME is a mailbox with its first unescaped dot standing for the @.
    soaEmail: soa && soa.hostmaster ? mailOf(String(soa.hostmaster).replace(/^((?:[^.\\]|\\.)*)\./, "$1@").replace(/\\\./g, ".")) : "",
    unread
  };
}

// RFC 8461: the policy lives at a fixed https address and must not be reached through a redirect.
async function mtaStsPolicy(domain, halt) {
  const url = "https://mta-sts." + domain + "/.well-known/mta-sts.txt";
  const res = await fetchExtra(url, halt);
  if (res.error || res.status !== 200) return { url, status: res.status || 0, error: res.error || "status " + (res.status || "none") };
  if (res.url && res.url !== url) return { url, status: res.status, error: "it redirected to " + clean(res.url, 160) };
  const field = (name) => ((res.body.match(new RegExp("^\\s*" + name + "\\s*:\\s*(\\S+)", "im")) || [])[1] || "").toLowerCase();
  const mode = field("mode");
  if (field("version") !== "stsv1" || !/^(enforce|testing|none)$/.test(mode)) return { url, status: res.status, error: "it has no valid version and mode lines" };
  return { url, status: res.status, mode, maxAge: Number(field("max_age")) || 0 };
}

const RDAP_BOOTSTRAP = "https://data.iana.org/rdap/dns.json";
const RDAP_TTL_MS = 24 * 3600 * 1000;
let rdapServers = null;

// IANA's bootstrap file names the RDAP server for each TLD. Null means it could not be read; "" means the TLD has none.
async function rdapBase(tld, halt) {
  if (!rdapServers || Date.now() - rdapServers.at > RDAP_TTL_MS) {
    const res = await fetchExtra(RDAP_BOOTSTRAP, halt);
    const map = {};
    try {
      (JSON.parse(res.body).services || []).forEach(([tlds, urls]) => {
        const base = (urls || []).find((url) => /^https:\/\//.test(url));
        if (base) (tlds || []).forEach((name) => { map[String(name).toLowerCase()] = base.replace(/\/?$/, "/"); });
      });
    } catch (error) { /* an unreadable file is not cached */ }
    if (!Object.keys(map).length) return null;
    rdapServers = { at: Date.now(), map };
  }
  return rdapServers.map[tld] || "";
}

function readRdap(data, domain) {
  const events = Array.isArray(data && data.events) ? data.events : [];
  const expiry = events.find((event) => /^expiration$/i.test(event.eventAction || ""));
  const at = expiry && Date.parse(expiry.eventDate);
  const status = (Array.isArray(data && data.status) ? data.status : []).map((item) => clean(item, 60)).slice(0, 12);
  const registrarEntity = (Array.isArray(data && data.entities) ? data.entities : []).find((entity) => (entity.roles || []).includes("registrar"));
  const vcard = (registrarEntity && Array.isArray(registrarEntity.vcardArray) && registrarEntity.vcardArray[1]) || [];
  const fn = vcard.find((row) => Array.isArray(row) && row[0] === "fn");
  // Registrant, admin and tech emails, when the registry does not redact them or hide them behind a proxy.
  const contacts = [];
  const walk = (entities) => (Array.isArray(entities) ? entities : []).forEach((entity) => {
    const roles = (entity && entity.roles) || [];
    const card = (entity && Array.isArray(entity.vcardArray) && entity.vcardArray[1]) || [];
    const role = ["registrant", "administrative", "technical"].find((name) => roles.includes(name));
    if (role) {
      card.filter((row) => Array.isArray(row) && row[0] === "email").forEach((row) => {
        const email = mailOf(row[3]);
        if (email && !/redact|privacy|private|proxy|whois|protect|anonym|withheld|disclos|gdpr/i.test(email) && contacts.length < 4 && !contacts.some((item) => item.email === email)) contacts.push({ role, email });
      });
    }
    walk(entity && entity.entities);
  });
  walk(data && data.entities);
  return {
    domain,
    read: true,
    contacts,
    expires: at && !isNaN(at) ? new Date(at).toISOString().slice(0, 10) : "",
    daysLeft: at && !isNaN(at) ? Math.floor((at - Date.now()) / 86400000) : null,
    registrar: clean((fn && fn[3]) || "", 120),
    status,
    locked: status.length ? status.some((item) => /transfer ?prohibited/i.test(item.replace(/([a-z])([A-Z])/g, "$1 $2"))) : null
  };
}

async function domainFacts(hostname, halt) {
  const domain = registrable(hostname);
  const tld = domain.split(".").pop();
  const base = await rdapBase(tld, halt);
  if (base === null) return { domain, read: false, reason: "the IANA list of RDAP servers could not be read" };
  if (!base) return { domain, read: false, reason: "." + tld + " has no RDAP service" };
  const res = await fetchExtra(base + "domain/" + encodeURIComponent(domain), halt);
  if (res.status !== 200) return { domain, read: false, reason: "the registry's RDAP server answered " + (res.status || res.error || "nothing") };
  try {
    return readRdap(JSON.parse(res.body), domain);
  } catch (error) {
    return { domain, read: false, reason: "the registry's RDAP answer was not JSON" };
  }
}

// Web Risk is Google's commercial API over the Safe Browsing lists; the Safe Browsing API itself is licensed for non-commercial use only.
async function webRisk(url, key) {
  if (!key) return null;
  const api = "https://webrisk.googleapis.com/v1/uris:search?threatTypes=MALWARE&threatTypes=SOCIAL_ENGINEERING&threatTypes=UNWANTED_SOFTWARE&uri=" + encodeURIComponent(url) + "&key=" + encodeURIComponent(key);
  const res = await fetch(api, { signal: AbortSignal.timeout(10000) });
  if (!res.ok) return { ok: false, error: "status " + res.status };
  const data = await res.json();
  return { ok: true, url: clean(url, 300), threats: ((data && data.threat && data.threat.threatTypes) || []).map((item) => clean(item, 40)) };
}

// Follows plain-http hops (http://a → http://www.a → https://www.a) until one leaves for https.
async function plainHttp(hostname, halt) {
  const statuses = [];
  let current = new URL("http://" + hostname + "/");
  try {
    for (let hop = 0; hop < 5; hop += 1) {
      const pinned = await assertPublic(current.hostname);
      const res = await requestOnce(current, pinned, halt);
      const raw = header(res.headers, "location");
      statuses.push(res.status);
      if (![301, 302, 303, 307, 308].includes(res.status) || !raw) return { status: statuses[0], statuses, location: clean(raw, 300) };
      const next = new URL(raw, current);
      if (next.protocol !== "http:" || (next.port && next.port !== "80")) return { status: statuses[0], statuses, location: clean(next.toString(), 300) };
      current = next;
    }
    return { status: statuses[0], statuses, location: clean(current.toString(), 300) };
  } catch (error) {
    if (error && error.code === "STOPPED") throw error;
    if (statuses.length) return { status: statuses[0], statuses, location: clean(current.toString(), 300) };
    return { error: clean(error.message, 120) };
  }
}

// The failure diagnosis re-reads a start page the way the review does and keeps every hop, the size and any bot check.
async function probeRead(raw) {
  const started = Date.now();
  const hops = [];
  const took = () => Date.now() - started;
  let current;
  try {
    current = normalizeUrl(raw);
    for (let hop = 0; hop < 5; hop += 1) {
      const pinned = await assertPublic(current.hostname);
      const res = await requestOnce(current, pinned, null, true);
      const location = header(res.headers, "location");
      hops.push({ url: clean(current.toString(), 300), status: res.status, location: clean(location, 300) });
      if ([301, 302, 303, 307, 308].includes(res.status) && location) {
        const next = new URL(location, current);
        if (next.protocol === "http:") return { hops, httpRedirect: clean(next.href, 300), ms: took() };
        current = normalizeUrl(next.toString());
        continue;
      }
      const type = header(res.headers, "content-type");
      return {
        hops,
        url: current.toString(),
        status: res.status,
        contentType: clean(type, 120),
        server: clean(header(res.headers, "server"), 80),
        bytes: Buffer.byteLength(res.body || ""),
        truncated: !!res.truncated,
        html: /text\/html|application\/xhtml\+xml/i.test(type) || /<html[\s>]/i.test(res.body || ""),
        challenge: challengeOf(current.toString(), res.headers, res.body),
        ms: took()
      };
    }
    return { hops, error: "The page redirected too many times.", ms: took() };
  } catch (error) {
    return { hops, error: clean((error && error.message) || "The request failed.", 160), code: clean((error && error.code) || "", 40), ms: took() };
  }
}

function answered(name, res) {
  if (!res) return name + " was not read.";
  if (res.error) return name + " could not be read (" + res.error + ").";
  return name + " answered " + res.status + (res.html ? " with an HTML page" : "") + ".";
}

const CONTACT_PATH = /(contact|contacto|contato|contatti|kontakt|about|acerca|nosotros|quienes-somos|quem-somos|sobre|ueber-uns|uber-uns|a-propos|qui-sommes|chi-siamo|impressum|imprint|mentions-legales|aviso-legal|note-legali|legal-notice)/i;

// The addresses a site publishes for reaching it, for the owner notice (url-review-owner-notice.js).
// found: [{ email, source, url }]; profiles: linked GitHub accounts and paths: the site's own contact,
// legal and privacy links the crawl did not read, both looked at later by url-review-owner-contacts.js.
const OWNER_LINK_PATH = /(contact|contacto|contato|contatti|kontakt|about|acerca|nosotros|quienes-somos|quem-somos|sobre|a-propos|chi-siamo|impressum|imprint|mentions-legales|aviso-legal|note-legali|legal|privac|privad|habeas|datos-personales|tratamiento-de-datos|pqr|atencion|servicio-al-cliente|politica|policy|terminos|terms|gobierno-corporativo)/i;
function ownerContacts(pages, extras) {
  const more = extras || {};
  const found = [];
  const profiles = [];
  const paths = [];
  const add = (email, source, url) => {
    if (email && found.length < 40 && !found.some((row) => row.email === email && row.source === source)) found.push({ email, source, url: url || "" });
  };
  let origin = "";
  try { origin = new URL(((pages || [])[0] || {}).url).origin; } catch (error) { origin = ""; }
  const sec = more.securityTxt;
  if (sec && sec.status === 200 && !sec.html) {
    String(sec.body || "").split(/\r?\n/).forEach((line) => {
      const match = line.match(/^\s*Contact:\s*(mailto:\S+)/i);
      if (match) add(mailOf(match[1]), "security.txt", origin + "/.well-known/security.txt");
    });
  }
  const read = new Set((pages || []).map((page) => { try { return new URL(page.url).pathname.replace(/\/$/, ""); } catch (error) { return ""; } }));
  (pages || []).forEach((page) => {
    const seen = page.inspect || {};
    let path = "";
    try { path = new URL(page.url).pathname; } catch (error) { path = ""; }
    (seen.links || []).forEach((href) => {
      let link = null;
      try { link = new URL(href, page.url); } catch (error) { return; }
      const linkPath = link.pathname.replace(/\/$/, "");
      if (link.origin === origin && OWNER_LINK_PATH.test(linkPath) && !/formulario|form\b|login|signin|cart|checkout/i.test(linkPath) && !read.has(linkPath) && paths.length < 6 && paths.indexOf(linkPath) === -1) paths.push(linkPath);
    });
    const contactPage = CONTACT_PATH.test(path);
    ((seen.schema && seen.schema.emails) || []).forEach((email) => add(email, "schema", page.url));
    (seen.mailtos || []).forEach((email) => add(email, contactPage ? "contact-page" : "page", page.url));
    (seen.textEmails || []).forEach((email) => add(email, "page-text", page.url));
    const links = (seen.socialLinks || []).concat(...((seen.schema && seen.schema.items) || []).map((item) => item.sameAs || []));
    links.forEach((href) => {
      const match = String(href).match(/^https:\/\/github\.com\/([A-Za-z0-9-]{1,39})\/?$/);
      if (match && profiles.length < 3 && profiles.indexOf(match[1].toLowerCase()) === -1) profiles.push(match[1].toLowerCase());
    });
  });
  [["llms", more.llms, "/llms.txt"], ["llms", more.llmsFull, "/llms-full.txt"]].forEach(([source, file, path]) => {
    if (file && file.status === 200 && !file.html) emailsInText(file.body, 5).forEach((email) => add(email, source, origin + path));
  });
  ((more.domain && more.domain.contacts) || []).forEach((row) => add(row.email, "rdap", ""));
  const dmarc = (more.dns && more.dns.dmarc) || "";
  (dmarc.match(/mailto:[^,;\s!]+/gi) || []).forEach((raw) => add(mailOf(raw), "dmarc", ""));
  if (more.dns && more.dns.soaEmail) add(more.dns.soaEmail, "soa", "");
  return { found, profiles, paths };
}

async function gatherExtras(first, robotsText, robotsGroups, halt, note, lookups) {
  const say = typeof note === "function" ? note : () => {};
  const checkRisk = lookups && typeof lookups.webrisk === "function" ? lookups.webrisk : null;
  const done = (promise, line) => promise.then((value) => { say(line(value)); return value; });
  const origin = new URL(first.url);
  const allowed = (path) => !robotsGroups.length || robotsAllows(path, robotsGroups);
  const utmUrl = new URL(first.url);
  utmUrl.searchParams.set("utm_source", "qa-lab-review");
  utmUrl.searchParams.set("utm_medium", "audit");
  utmUrl.searchParams.set("utm_campaign", "redirect-check");
  const missingPath = "/qa-lab-review-" + crypto.randomBytes(4).toString("hex") + "-not-found";
  let validTo = first.cert && first.cert.validTo;
  const tls = validTo && !isNaN(Date.parse(validTo))
    ? { validTo: new Date(Date.parse(validTo)).toISOString().slice(0, 10), daysLeft: Math.floor((Date.parse(validTo) - Date.now()) / 86400000), issuer: first.cert.issuer || "" }
    : null;
  const acceptLanguage = (lookups && lookups.acceptLanguage) || "";
  const sitemapJob = lookups && lookups.sitemap ? lookups.sitemap : readSitemap(origin.origin, robotsText, halt, acceptLanguage).catch(() => ({ status: 0, urls: [] }));
  say("In the background: the sitemap, /llms.txt, /llms-full.txt, /.well-known/security.txt, the start page with UTM tags, a made-up path that should answer 404, plain http, the DNS records and the RDAP registration for " + registrable(origin.hostname) + (checkRisk ? ", and Google's Safe Browsing lists" : "") + ".");
  say(tls ? "The TLS certificate from " + (tls.issuer || "an unnamed issuer") + " is valid until " + tls.validTo + " (" + tls.daysLeft + " days left)." : "The TLS certificate did not give an expiry date.");
  const [sitemap, llms, llmsFull, securityTxt, utm, soft404, httpRedirect, dnsInfo, domainInfo, safeBrowsing] = await Promise.all([
    done(sitemapJob, (map) => map.urls && map.urls.length
      ? "The sitemap at " + pagePath(map.source) + " listed " + map.urls.length + " URLs" + (map.partial ? ", read in part" : "") + "."
      : "No sitemap with URLs was found (status " + (map.status || "none") + ")."),
    done(fetchExtra(origin.origin + "/llms.txt", halt, false, acceptLanguage), (res) => answered("/llms.txt", res)),
    done(fetchExtra(origin.origin + "/llms-full.txt", halt, false, acceptLanguage), (res) => answered("/llms-full.txt", res)),
    done(fetchExtra(origin.origin + "/.well-known/security.txt", halt, false, acceptLanguage), (res) => answered("/.well-known/security.txt", res)),
    allowed(pagePath(utmUrl.toString()))
      ? done(fetchPublic(utmUrl.toString(), halt, null, false, acceptLanguage).then((res) => ({ status: res.status, finalUrl: res.url, kept: new URL(res.url).searchParams.get("utm_source") === "qa-lab-review" })).catch(() => null), (res) => res
        ? "The start page with UTM tags answered " + res.status + " and " + (res.kept ? "kept" : "dropped") + " the tags."
        : "The start page with UTM tags could not be read.")
      : Promise.resolve(null).then(() => { say("The UTM check was skipped: robots.txt disallows that address."); return null; }),
    allowed(missingPath)
      ? done(fetchExtra(origin.origin + missingPath, halt, false, acceptLanguage).then((res) => ({ status: res.status, title: res.html ? clean(textOf(res.body, "title"), 120) : "" })), (res) => "The made-up path answered " + (res.status || "nothing") + (res.status === 404 ? ", as it should." : ". A missing page should answer 404."))
      : Promise.resolve(null).then(() => { say("The 404 check was skipped: robots.txt disallows that address."); return null; }),
    done(plainHttp(origin.hostname, halt), (res) => res.error
      ? "Plain http could not be read (" + res.error + ")."
      : "Plain http answered " + res.statuses.join(" → ") + (res.location ? ", ending at " + res.location : "") + "."),
    done(dnsFacts(origin.hostname).then(async (facts) => {
      if (facts.mtaSts) facts.mtaStsPolicy = await withTimeout(mtaStsPolicy(facts.domain, halt), 8000, { error: "no answer in time" });
      return facts;
    }).catch(() => null), (facts) => facts
      ? "DNS for " + facts.domain + ": SPF " + (facts.spf ? "found" : "missing") + ", DMARC " + (facts.dmarc ? "found" : "missing") + ", " + (facts.nullMx ? "a null MX (no mail)" : facts.mx.length + " MX") + ", " + facts.caa.length + " CAA" +
        ", MTA-STS " + (facts.mtaSts ? (facts.mtaStsPolicy && facts.mtaStsPolicy.mode ? "in " + facts.mtaStsPolicy.mode + " mode" : "announced, policy unread") : "missing") + ", TLS-RPT " + (facts.tlsRpt ? "found" : "missing") + ", BIMI " + (facts.bimi ? "found" : "missing") +
        (facts.unread.length ? ". Not answered in time: " + facts.unread.join(", ") : "") + "."
      : "The DNS records could not be read."),
    done(withTimeout(domainFacts(origin.hostname, halt), 10000, null).catch(() => null), (facts) => !facts
      ? "The RDAP registration did not answer in time."
      : !facts.read
        ? "The RDAP registration for " + facts.domain + " was not read: " + facts.reason + "."
        : "RDAP for " + facts.domain + ": " + (facts.registrar ? "registrar " + facts.registrar + ", " : "") + (facts.expires ? "expires " + facts.expires + " (" + facts.daysLeft + " days)" : "no expiry date published") + (facts.locked == null ? "" : ", transfer lock " + (facts.locked ? "on" : "off")) + "."),
    checkRisk
      ? done(Promise.resolve().then(() => checkRisk(first.url)).catch((error) => ({ ok: false, error: clean((error && error.message) || "", 120) })), (res) => !res || !res.ok
        ? "Google's Safe Browsing lists could not be read" + (res && res.error ? " (" + res.error + ")" : "") + "."
        : res.threats.length ? "Google's Safe Browsing lists flag the site: " + res.threats.join(", ") + "." : "Google's Safe Browsing lists do not flag the site.")
      : Promise.resolve(null)
  ]);
  const trim = (item) => item ? { status: item.status, html: !!item.html, body: String(item.body || "").slice(0, 20000) } : null;
  return { sitemap, llms: trim(llms), llmsFull: trim(llmsFull), securityTxt: trim(securityTxt), utm, soft404, httpRedirect, tls, dns: dnsInfo, domain: domainInfo, safeBrowsing: safeBrowsing && safeBrowsing.ok ? safeBrowsing : null };
}

async function reviewTarget(rawUrl, hooks) {
  const controls = hooks || {};
  const lines = [];
  const note = (text) => {
    lines.push({ at: new Date().toISOString(), text });
    if (controls.log) controls.log(text);
  };
  const halt = () => !!(controls.stopped && controls.stopped());
  const chosen = normalizeScope(controls.maxPages == null ? INCLUDED_PAGES : controls.maxPages, controls.maxDepth == null ? INCLUDED_DEPTH : controls.maxDepth) || { pages: INCLUDED_PAGES, depth: INCLUDED_DEPTH };
  const acceptLanguage = normalizePageLang(controls.pageLang);
  const begun = Date.now();
  let deadline = begun + budgetMs(chosen.pages);
  note("Checking that the address is public https.");
  note(acceptLanguage ? "Pages are requested in " + PAGE_LANG_LABEL[acceptLanguage] + "." : "Pages are requested in the site's own language.");
  let first;
  let slowFirst = false;
  try {
    note("Opening the first page.");
    first = await fetchPublic(rawUrl, halt, note, true, acceptLanguage);
  } catch (error) {
    if (error && error.code === "STOPPED") {
      note("Stopped before the first page finished.");
      return stoppedReport(rawUrl, lines, null, chosen);
    }
    if (!/took too long/.test((error && error.message) || "") || typeof controls.browse !== "function") throw error;
    slowFirst = true;
    first = { url: error.url || String(rawUrl), requested: String(rawUrl), hops: 0, status: 0, headers: {}, body: "", cert: null, ms: PAGE_TIMEOUT_MS };
  }
  let firstChallenge = challengeOf(first.url, first.headers, first.body);
  let readInBrowser = null;
  let speedPromise = null;
  let speedUntil = 0;
  const startSpeed = (url) => {
    if (speedPromise) return;
    speedUntil = Date.now() + SPEED_WAIT_MS;
    const canSpeed = !halt() && typeof controls.pagespeed === "function";
    if (canSpeed) note("Asking PageSpeed Insights for a mobile Lighthouse run in the background.");
    speedPromise = canSpeed
      ? Promise.resolve().then(() => controls.pagespeed(url)).catch((error) => ({ ok: false, error: clean((error && error.message) || "", 120) }))
      : Promise.resolve(null);
  };
  const browserLog = (text) => note("Browser: " + text);
  const refused = slowFirst || (first.status >= 400 && first.status < 500) || !!firstChallenge;
  if (refused && typeof controls.browse === "function") {
    note(slowFirst
      ? "The plain request took longer than " + PAGE_TIMEOUT_MS / 1000 + " s. Waiting for headless Chrome to open the page."
      : "The plain request was refused (status " + first.status + (firstChallenge ? ", " + insights.botCheck(firstChallenge) : "") + "). Waiting for headless Chrome to open the page.");
    startSpeed(first.url);
    const browsed = await Promise.resolve().then(() => controls.browse({ url: first.url, paths: [], html: true, acceptLanguage }, browserLog)).catch((error) => ({ ok: false, error: clean((error && error.message) || "", 120) }));
    if (halt()) {
      note("Stopped before the first page finished.");
      return stoppedReport(rawUrl, lines, null, chosen);
    }
    const view = browsed && browsed.ok && browsed.start ? browsed.start : null;
    let finalUrl = "";
    try { finalUrl = view && view.finalUrl ? normalizeUrl(view.finalUrl).toString() : ""; } catch (error) { finalUrl = ""; }
    const viewChallenge = view && view.html ? challengeOf(finalUrl || first.url, view.headers, view.html) : "";
    if (!view || !view.html || !finalUrl || view.docStatus >= 400 || viewChallenge) {
      const status = (view && view.docStatus) || first.status;
      const guarded = (code) => [401, 403, 429].includes(code);
      const where = slowFirst ? "in headless Chrome, after the plain request took too long" : "in the plain request and in headless Chrome";
      const error = new Error(slowFirst && !viewChallenge && (!browsed || !browsed.ok || !(status >= 400))
        ? "The page took too long in the plain request, and headless Chrome " + (browsed && browsed.ok ? "returned no page" : "could not open it either (" + ((browsed && browsed.error) || "no answer") + ")") + "."
        : !browsed || !browsed.ok
        ? (firstChallenge || guarded(first.status) ? "The site's bot protection refused the plain request" : "The URL returned status " + first.status + " to the plain request") +
          (firstChallenge || guarded(first.status) ? " (status " + first.status + ")" : "") + ", and headless Chrome did not finish (" + ((browsed && browsed.error) || "no answer") + ")."
        : (viewChallenge || firstChallenge || guarded(status))
          ? "The site's bot protection refused the review (status " + status + (viewChallenge || firstChallenge ? ", " + insights.botCheck(viewChallenge || firstChallenge) : "") + "), " + where + "."
          : "The URL returned status " + status + ", " + where + ".");
      error.status = 422;
      throw error;
    }
    first = {
      url: finalUrl,
      requested: first.requested,
      hops: first.hops,
      status: view.docStatus || 200,
      headers: view.headers || {},
      body: view.html,
      truncated: !!view.htmlCut,
      cert: first.cert,
      ms: (browsed.timing && browsed.timing.load) || first.ms
    };
    firstChallenge = "";
    readInBrowser = browsed;
    note(slowFirst ? insights.SLOW_READ_NOTE : browsed.untagged ? insights.UNTAGGED_READ_NOTE : insights.BROWSER_READ_NOTE);
  } else if (first.status >= 400) {
    const error = new Error(firstChallenge
      ? "The site answered with " + insights.botCheck(firstChallenge) + " (status " + first.status + ") instead of the page."
      : "The URL returned status " + first.status + ".");
    error.status = 422;
    throw error;
  }
  if (first.slow) note(insights.SLOW_CUT_NOTE);
  else if (first.truncated) note(insights.CUT_NOTE);
  const type = header(first.headers, "content-type");
  if (!/text\/html|application\/xhtml\+xml/i.test(type) && !/<html[\s>]/i.test(first.body)) {
    const error = new Error("The URL did not return an HTML page.");
    error.status = 422;
    throw error;
  }
  const origin = new URL(first.url);
  if (controls.mentions !== false) note("Searching for public write-ups about " + origin.hostname + " in the background.");
  const mentionsPromise = controls.mentions === false ? Promise.resolve([]) : lookupMentions(origin.hostname);
  let robots = [];
  let robotsText = "";
  let robotsNote = "robots.txt was not read.";
  let stopped = halt();
  try {
    if (!stopped) {
      note("Reading robots.txt.");
      const robotsUrl = origin.origin + "/robots.txt";
      const robotsRes = await fetchPublic(robotsUrl, halt, note, false, acceptLanguage);
    if (robotsRes.status === 200 && !/^\s*<(!doctype|html)/i.test(robotsRes.body)) {
      robotsText = robotsRes.body.slice(0, 200000);
      robots = parseRobots(robotsRes.body);
      robotsNote = "robots.txt was read (" + robots.length + " rules). Linked pages that disallow this agent are skipped.";
    } else robotsNote = "robots.txt returned status " + robotsRes.status + ". Linked pages stay inside the page cap.";
    }
  } catch (error) {
    if (error && error.code === "STOPPED") stopped = true;
    else robotsNote = "robots.txt could not be read. Linked pages were still capped.";
  }
  const prefix = controls.section === true ? sectionPrefix(first.url) : "";
  if (prefix) note("Later pages stay under " + prefix + ".");
  const keep = (url) => !prefix || underSection(url, prefix);
  const homeInspect = inspect(first.body, first.headers, first.url);
  const sitemapPromise = stopped ? Promise.resolve({ status: 0, urls: [] }) : readSitemap(origin.origin, robotsText, halt, acceptLanguage).catch(() => ({ status: 0, urls: [] }));
  const extrasPromise = stopped ? Promise.resolve({}) : gatherExtras(first, robotsText, robots, halt, note, { webrisk: controls.webrisk, sitemap: sitemapPromise, acceptLanguage }).catch(() => ({}));
  const canBrowse = !stopped && !readInBrowser && typeof controls.browse === "function";
  const browsePaths = (homeInspect.links || []).filter((url) => keep(url) && pagePath(url) !== pagePath(first.url) && !/\.(pdf|zip|jpe?g|png|gif|webp|svg|mp4|mp3|docx?|xlsx?)(\?|$)/i.test(url) && (!robots.length || robotsAllows(pagePath(url), robots))).slice(0, 2);
  if (canBrowse) note("Opening the start page in a headless browser alongside the analysis" + (browsePaths.length ? ", then " + browsePaths.map(pagePath).join(" and ") : "") + ".");
  let showStart = null;
  const renderedStart = new Promise((resolve) => { showStart = resolve; });
  const browserPromise = readInBrowser
    ? Promise.resolve(readInBrowser)
    : canBrowse
      ? Promise.resolve().then(() => controls.browse({ url: first.url, paths: browsePaths, acceptLanguage }, browserLog, (start) => showStart(start))).catch((error) => ({ ok: false, error: clean((error && error.message) || "", 120) }))
      : Promise.resolve(null);
  browserPromise.then((done) => showStart(done && done.ok ? done.start : null), () => showStart(null));
  if (!stopped) startSpeed(first.url);
  else speedPromise = speedPromise || Promise.resolve(null);
  let extrasSettled = false;
  let browserSettled = false;
  let speedSettled = false;
  extrasPromise.then(() => { extrasSettled = true; });
  browserPromise.then(() => { browserSettled = true; });
  speedPromise.then(() => { speedSettled = true; });
  const pages = [{
    url: first.url,
    requested: first.requested,
    hops: first.hops,
    path: pagePath(first.url),
    status: first.status,
    ms: first.ms,
    bytes: homeInspect.bytes,
    title: homeInspect.title,
    depth: 0,
    from: "",
    challenge: firstChallenge,
    readInBrowser: readInBrowser ? (slowFirst ? "slow" : readInBrowser.untagged ? "untagged" : "tagged") : "",
    cut: !!first.truncated,
    slow: !!first.slow,
    renderedLinks: 0,
    inspect: homeInspect,
    html: first.body
  }];
  const seen = new Set([first.url]);
  let robotsBlocked = 0;
  let cursor = 0;
  note("First page answered " + first.status + " in " + first.ms + " ms. Title: " + (homeInspect.title || "none") + ". " + homeInspect.bytes + " bytes.");
  if (firstChallenge) note("The start page is " + insights.botCheck(firstChallenge) + ", not the site's own page. The scores describe that check page.");
  note(robotsNote);
  const keptLinks = (homeInspect.links || []).filter(keep);
  let linkCount = keptLinks.length;
  let startQueue = prefix ? keptLinks : null;
  if (linkCount < SHELL_LINKS && canBrowse && !stopped && chosen.pages > 1) {
    note(linkCount + " same-host link" + (linkCount === 1 ? " is" : "s are") + " in the HTML. Waiting up to " + SHELL_WAIT_MS / 1000 + " s for headless Chrome's rendered start page and its links.");
    const waitFrom = Date.now();
    const shown = await withTimeout(renderedStart, SHELL_WAIT_MS, null);
    deadline = Math.min(deadline + (Date.now() - waitFrom), begun + TOTAL_MS);
    const links = [...new Set(((shown && shown.dom && shown.dom.links) || []).map((href) => sameHost(first.url, href)).filter(Boolean))]
      .filter((url) => keep(url) && !(homeInspect.links || []).includes(url) && pagePath(url) !== pagePath(first.url));
    if (links.length) {
      startQueue = (startQueue || keptLinks).concat(links);
      pages[0].renderedLinks = links.length;
      linkCount = startQueue.length;
      note(insights.SHELL_NOTE + " The rendered page adds " + links.length + ".");
    } else note(shown ? "The rendered start page adds no same-host links." : "Headless Chrome did not return the rendered start page.");
    stopped = stopped || halt();
  }
  if (linkCount < SHELL_LINKS && !stopped && chosen.pages > 1) {
    note("The start page lists few same-host links. Taking further pages from the sitemap.");
    const map = await sitemapPromise;
    const added = sitemapCandidates(map && map.urls, first.url, prefix, chosen.pages - 1, (startQueue || keptLinks).concat([first.url]));
    if (added.length) {
      startQueue = (startQueue || keptLinks).concat(added);
      linkCount = startQueue.length;
      note("The sitemap adds " + added.length + " page" + (added.length === 1 ? "" : "s") + (prefix ? " under " + prefix : "") + ".");
    } else note("The sitemap adds no further pages" + (prefix ? " under " + prefix : "") + ".");
  }
  note(linkCount + " same-host links were listed. This review opens at most " + chosen.pages + " HTML pages and " + chosen.depth + " links deep.");
  if (!linkCount) note("No further pages to open on this host. The case list comes next.");
  while (!stopped && cursor < pages.length && pages.length < chosen.pages && Date.now() < deadline) {
    const page = pages[cursor];
    cursor += 1;
    if (page.depth >= chosen.depth) continue;
    const queue = (page === pages[0] && startQueue) || (page.inspect && page.inspect.links) || [];
    for (let i = 0; i < queue.length && pages.length < chosen.pages && Date.now() < deadline; i += 1) {
      if (halt()) { stopped = true; break; }
      const next = queue[i];
      if (prefix && !underSection(next, prefix)) continue;
      if (seen.has(next)) continue;
      seen.add(next);
      const path = pagePath(next);
      if (robots.length && !robotsAllows(path, robots)) {
        robotsBlocked += 1;
        note("Skipping " + path + ": robots.txt disallows it.");
        continue;
      }
      try {
        note("Opening " + path + ".");
        const child = await fetchPublic(next, halt, note, true, acceptLanguage);
        const childType = header(child.headers, "content-type");
        if (!/text\/html|application\/xhtml\+xml/i.test(childType)) {
          note(path + " answered " + child.status + " with " + (childType.split(";")[0] || "no content type") + ", not an HTML page. It is not scored.");
          continue;
        }
        const challenge = challengeOf(child.url, child.headers, child.body);
        const childInspect = challenge ? null : inspect(child.body, child.headers, child.url);
        if (child.url !== next && seen.has(child.url)) {
          note(path + " redirected to " + pagePath(child.url) + ", which was already analyzed.");
          continue;
        }
        seen.add(child.url);
        if (challenge) note(path + " answered with " + insights.botCheck(challenge) + ". It is not scored.");
        else note(path + " answered " + child.status + " in " + child.ms + " ms. " + (childInspect.links || []).length + " same-host links." +
          (child.slow ? " It was still arriving after " + PAGE_TIMEOUT_MS / 1000 + " s, so the part that had arrived was analyzed." : child.truncated ? " It is larger than 2 MB, so its first 2 MB were analyzed." : ""));
        pages.push({
          url: child.url,
          requested: next,
          hops: child.hops,
          path: pagePath(child.url),
          status: child.status,
          ms: child.ms,
          bytes: childInspect ? childInspect.bytes : Buffer.byteLength(child.body || ""),
          title: childInspect ? childInspect.title : clean(textOf(child.body, "title"), 180),
          depth: page.depth + 1,
          from: page.path,
          challenge,
          retryAfter: !!header(child.headers, "retry-after"),
          inspect: childInspect,
          html: ""
        });
      } catch (error) {
        if (error && error.code === "STOPPED") { stopped = true; break; }
        note(path + " could not be read (" + clean(error.message, 160) + ").");
        pages.push({
          url: next,
          requested: next,
          hops: 0,
          path: path,
          status: 0,
          ms: 0,
          bytes: 0,
          title: "",
          depth: page.depth + 1,
          from: page.path,
          error: clean(error.message, 160),
          inspect: null,
          html: ""
        });
      }
    }
  }
  if (stopped) note("Stopped. The report keeps the " + pages.length + " page" + (pages.length === 1 ? "" : "s") + " analyzed before the stop.");
  else if (pages.length < chosen.pages && Date.now() >= deadline) note("The time budget ended with " + pages.length + " page" + (pages.length === 1 ? "" : "s") + " saved. This review was capped at " + chosen.pages + ".");
  else note("Analyzed " + pages.length + " page" + (pages.length === 1 ? "" : "s") + ". Writing the proposed cases now.");
  const techMap = new Map();
  pages.forEach((page) => {
    ((page.inspect && page.inspect.technologies) || []).forEach((item) => {
      techMap.set(item.group + ":" + item.name, item);
    });
  });
  const technologiesFound = [...techMap.values()];
  note(technologiesFound.length ? "Technologies seen: " + technologiesFound.map((item) => item.name).join(", ") + "." : "No known technology was named in the pages analyzed.");
  let browser = null;
  if (canBrowse && !browserSettled) note("Waiting for the headless browser to finish.");
  try { browser = await browserPromise; } catch (error) { browser = null; }
  const chat = browser && browser.ok && browser.chat ? browser.chat : null;
  if (chat) {
    chat.found.forEach((row) => {
      const known = technologiesFound.find((item) => item.name.toLowerCase() === row.name.toLowerCase());
      if (known) known.group = row.ai ? "AI chatbot" : "Chat";
      else technologiesFound.push({ name: row.name, group: row.ai ? "AI chatbot" : "Chat", evidence: "Requests to " + row.hosts.join(", ") + " in the browser." });
    });
    note("Chat seen in the browser: " + chat.found.map((row) => row.name).join(", ") + ".");
  }
  let cases = propose(pages, robotsBlocked, { maxPages: chosen.pages, maxDepth: chosen.depth }, browser && browser.ok && browser.start && browser.start.dom ? Object.assign({ banner: (browser.consent && browser.consent.banner) || "", chat, libraries: browser.libraries || [] }, browser.start.dom) : null);
  const tools = toolsForPage(homeInspect, (homeInspect && homeInspect.signals) || {}, technologiesFound.map((item) => item.name));
  note("Proposed " + cases.length + " test cases across " + Object.keys(caseRank.countLayers(cases)).length + " layers" + (robotsBlocked ? ". " + robotsBlocked + " linked page" + (robotsBlocked === 1 ? " was" : "s were") + " skipped for robots.txt" : "") + ".");
  const alerts = buildAlerts(first.body, homeInspect, pagePath(first.url));
  let extras = {};
  if (!extrasSettled) note("Waiting for the background checks to finish.");
  try { extras = await extrasPromise; } catch (error) { extras = {}; }
  cases = domainCases(cases, extras);
  let speed = null;
  let speedTimer = null;
  try {
    const wait = Math.max(3000, Math.max(deadline, speedUntil) - Date.now());
    if (canSpeed && !speedSettled) note("Waiting for PageSpeed Insights, up to " + Math.round(wait / 1000) + " s.");
    speed = await Promise.race([speedPromise, new Promise((resolve) => { speedTimer = setTimeout(() => resolve({ ok: false, error: "no answer in time" }), wait); })]);
  } catch (error) { speed = null; }
  clearTimeout(speedTimer);
  if (speed && speed.ok) note("PageSpeed Insights answered: Lighthouse performance " + speed.score + "/100 on mobile" + (speed.field ? ", with real-user Chrome data for the " + (speed.field.scope === "page" ? "page" : "whole site") : ", without enough real-user Chrome data") + ".");
  else if (speed) note("PageSpeed Insights did not answer (" + (speed.error || "no answer") + "). The browser's lab values stand in.");
  if (browser && browser.ok) note("The browser pass finished in " + Math.round((browser.ms || 0) / 1000) + " s: " + ((browser.axe && browser.axe.pages.length) || 1) + " page" + ((browser.axe && browser.axe.pages.length) > 1 ? "s" : "") + " checked with axe-core" + (browser.consent && browser.consent.rejected ? ", and the cookie banner's reject button was pressed once" : "") + ".");
  else if (browser) note("The browser pass did not finish (" + (browser.error || "no answer") + "). The report uses the HTML alone.");
  let analysis = null;
  note("Scoring the checks from the pages analyzed" + (browser && browser.ok ? ", the browser pass" : "") + (speed && speed.ok ? ", PageSpeed Insights" : "") + ", and the background checks.");
  try {
    analysis = insights.analyze({
      browser,
      pagespeed: speed && speed.ok ? speed : null,
      pages,
      robotsText,
      extras,
      alerts,
      technologies: technologiesFound,
      homeText: homeText(first.body),
      limits: { maxPages: chosen.pages, maxDepth: chosen.depth, pagesRead: pages.length, timedOut: Date.now() >= deadline }
    });
    note("Scored " + analysis.findings.length + " checks: " + analysis.score.totals.fail + " fail, " + analysis.score.totals.risk + " at risk, " + analysis.score.totals.pass + " pass. Health " + analysis.score.overall + "/100.");
  } catch (error) {
    console.error("URL review insights failed:", error);
    note("The scored checks could not be written for this review. The proposed cases are unaffected.");
  }
  try {
    cases = caseRank.refine(cases, { findings: (analysis && analysis.findings) || [], browser, origin: origin.origin, startPath: pagePath(first.url), fw: BROWSER_FW });
    const top = cases.filter((item) => item.priority === "P1").length;
    note("Ranked " + cases.length + " cases by risk on " + origin.hostname + ": " + top + " P1, " + cases.filter((item) => item.priority === "P2").length + " P2" + (top ? ". First: " + cases[0].id + " " + cases[0].title : "") + ".");
  } catch (error) {
    console.error("URL review case ranking failed:", error);
  }
  const byLayer = caseRank.countLayers(cases);
  const reportId = crypto.randomBytes(9).toString("hex");
  const fetchedAt = new Date().toISOString();
  const signature = signReport({ id: reportId, fetchedAt, host: origin.hostname, cases });
  note("Signed the report.");
  let mentions = [];
  try { mentions = await mentionsPromise; } catch (error) { mentions = []; }
  note(mentions.length ? mentions.length + " public write-ups were listed for this host." : "No public write-up was retrieved on this pass.");
  note(alerts.length ? alerts.length + " public signals were listed. The tail of each one stays closed until that section is paid." : "No leak or missing control of the kinds this review watches was seen on the first page.");
  note(tools.length ? "Tools that apply: " + tools.map((item) => item.name).join(", ") + "." + (browser && browser.ok && browser.axe && browser.axe.ran ? " axe-core ran in the headless browser." + (speed && speed.ok ? " Lighthouse ran through PageSpeed Insights." : "") + " The others are not launched." : (speed && speed.ok ? " Lighthouse ran through PageSpeed Insights. The others are not launched." : " None of them are launched.")) : "None of axe-core, Lighthouse, k6, BrowserStack, Applitools, Percy, Provar, or Copado apply to this page.");
  const publishedPages = pages.map((page) => ({
    url: page.url,
    path: page.path,
    status: page.status,
    ms: page.ms,
    bytes: page.bytes,
    title: page.title,
    depth: page.depth,
    from: page.from || "",
    error: page.error || "",
    challenge: page.challenge || ""
  }));
  const result = {
    id: reportId,
    fetchedAt,
    finalUrl: first.url,
    host: origin.hostname,
    agent: USER_AGENT,
    limits: {
      maxPages: chosen.pages,
      maxDepth: chosen.depth,
      pagesRead: pages.length,
      robotsBlocked,
      robotsNote,
      timedOut: Date.now() >= deadline,
      pageLang: acceptLanguage,
      section: prefix
    },
    pages: publishedPages,
    technologies: technologiesFound,
    cases,
    tools,
    alerts,
    mentions,
    insights: analysis,
    contacts: ownerContacts(pages, extras),
    browser: browser && browser.ok ? browser : (browser ? { ok: false, error: String(browser.error || "") } : null),
    pagespeed: speed && speed.ok ? speed : null,
    signature,
    counts: {
      pages: pages.length,
      technologies: technologiesFound.length,
      cases: cases.length,
      byLayer
    },
    observed: {
      title: homeInspect.title,
      description: homeInspect.description,
      lang: homeInspect.lang,
      h1: homeInspect.h1,
      forms: homeInspect.forms,
      password: homeInspect.password,
      images: homeInspect.images,
      missingAlt: homeInspect.missingAlt,
      scripts: homeInspect.scripts,
      styles: homeInspect.styles,
      cookies: homeInspect.cookies.map((cookie) => ({ name: cookie.name, secure: cookie.secure, httpOnly: cookie.httpOnly, sameSite: cookie.sameSite })),
      headers: homeInspect.headers,
      ms: first.ms,
      bytes: homeInspect.bytes,
      signals: homeInspect.signals || {}
    },
    log: lines,
    status: stopped ? "stopped" : "complete",
    statement: stopped
      ? "This review was stopped. The cases below use only the pages analyzed before the stop. None of them were executed."
      : "These cases are proposed from a public analysis. None of them were executed."
  };
  if (result.browser && result.browser.shots && JSON.stringify(result).length > 850000) delete result.browser.shots;
  return result;
}

function stoppedReport(rawUrl, lines, host, scope) {
  let parsedHost = host || "";
  try { parsedHost = parsedHost || new URL(preformatUrl(rawUrl)).hostname; } catch (error) { parsedHost = parsedHost || ""; }
  const chosen = scope || { pages: INCLUDED_PAGES, depth: INCLUDED_DEPTH };
  return {
    id: crypto.randomBytes(9).toString("hex"),
    fetchedAt: new Date().toISOString(),
    finalUrl: rawUrl,
    host: parsedHost,
    agent: USER_AGENT,
    limits: { maxPages: chosen.pages, maxDepth: chosen.depth, pagesRead: 0, robotsBlocked: 0, robotsNote: "Stopped.", timedOut: false },
    pages: [],
    technologies: [],
    cases: [],
    tools: [],
    counts: { pages: 0, technologies: 0, cases: 0, byLayer: {} },
    observed: { title: "", description: "", lang: "", h1: [], forms: 0, password: false, images: 0, missingAlt: 0, scripts: 0, styles: 0, cookies: [], headers: {}, ms: 0, bytes: 0 },
    log: lines,
    status: "stopped",
    statement: "This review was stopped before a page was saved. No cases were executed."
  };
}

function intakeRecord(value, report, meta) {
  const now = Date.now();
  return {
    id: report.id,
    createdAt: new Date(now).toISOString(),
    retainUntil: new Date(now + RETAIN_MS).toISOString(),
    expireAt: new Date(now + RETAIN_MS),
    termsVersion: value.termsVersion || TERMS_VERSION,
    name: value.name,
    email: value.email,
    reason: value.reason,
    reasonCode: value.reasonCode || "",
    clientName: value.clientName || "",
    clientEmail: value.clientEmail || "",
    clientUrl: value.clientUrl || "",
    ownership: value.ownership || "",
    frameworks: value.frameworks,
    pages: value.pages || INCLUDED_PAGES,
    depth: value.depth || INCLUDED_DEPTH,
    requestedUrl: value.url,
    deviceId: clean(meta.deviceId || value.deviceId, 80),
    status: report.status || "complete",
    paid: false,
    priceUsd: priceForRun({ frameworks: value.frameworks || [], pages: value.pages || INCLUDED_PAGES, depth: value.depth || INCLUDED_DEPTH, billing: "run" }).usd,
    ip: clean(meta.ip, 80),
    userAgent: clean(meta.userAgent, 300),
    acceptLanguage: clean(meta.acceptLanguage, 120),
    country: clean(meta.country, 8),
    region: clean(meta.region, 80),
    city: clean(meta.city, 80),
    lang: value.lang || "",
    pageLang: value.pageLang || "",
    section: value.section === true,
    followUp: value.followUp === true,
    unlisted: value.unlisted === true,
    compareWith: value.compareWith || "",
    report
  };
}

function stripeForm(params) {
  const body = new URLSearchParams();
  Object.keys(params || {}).forEach((key) => body.append(key, params[key] == null ? "" : String(params[key])));
  return body.toString();
}

function stripeRequest(secret, method, path, params) {
  const payload = method === "GET" ? "" : stripeForm(params);
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: "api.stripe.com",
      path: path,
      method: method,
      headers: {
        authorization: "Bearer " + secret,
        "content-type": "application/x-www-form-urlencoded",
        "content-length": Buffer.byteLength(payload)
      }
    }, (res) => {
      const chunks = [];
      res.on("data", (chunk) => chunks.push(chunk));
      res.on("end", () => {
        let parsed = {};
        try { parsed = JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}"); } catch (error) { parsed = {}; }
        if ((res.statusCode || 500) >= 400) {
          const failure = new Error((parsed.error && parsed.error.message) || "Stripe refused the request.");
          failure.status = 502;
          reject(failure);
          return;
        }
        resolve(parsed);
      });
    });
    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}

function testSecret(secret) {
  const value = String(secret || "");
  return value.startsWith("sk_test_") || value.startsWith("rk_test_");
}

async function createCheckout(options) {
  const secret = options && options.secret;
  if (!testSecret(secret)) {
    const error = new Error("A Stripe test secret key is not set. No charge was made.");
    error.status = 503;
    throw error;
  }
  const purpose = options.purpose === "report" ? "report" : "new-run";
  const priced = chargedUsd(options);
  return stripeRequest(secret, "POST", "/v1/checkout/sessions", {
    mode: "payment",
    success_url: options.successUrl,
    cancel_url: options.cancelUrl,
    "line_items[0][quantity]": "1",
    "line_items[0][price_data][currency]": "usd",
    "line_items[0][price_data][unit_amount]": String(priced.cents),
    "line_items[0][price_data][product_data][name]": productName(purpose, priced.frameworks),
    "metadata[purpose]": purpose,
    "metadata[reportId]": options.reportId || "",
    "metadata[deviceId]": options.deviceId || "",
    "metadata[priceUsd]": String(priced.usd),
    "metadata[frameworks]": priced.frameworks.join(",")
  });
}

async function readCheckout(secret, sessionId) {
  if (!testSecret(secret)) {
    const error = new Error("A Stripe test secret key is not set. No charge was made.");
    error.status = 503;
    throw error;
  }
  if (!/^cs_test_[A-Za-z0-9_]+$/.test(sessionId || "")) {
    const error = new Error("That payment session is not a Stripe test session.");
    error.status = 400;
    throw error;
  }
  return stripeRequest(secret, "GET", "/v1/checkout/sessions/" + sessionId);
}

function paymentChoice(value) {
  return String(value || "").toLowerCase() === "paypal" ? "paypal" : "";
}

function paymentProvider(value) {
  const choice = paymentChoice(value);
  return choice === "pse" ? "wompi" : choice;
}

function productName(purpose, frameworks, scope) {
  if (purpose === "credentials") return "QA-lab signed-in run";
  if (purpose === "alerts") return "QA-lab public signals · " + ((scope && scope.count) || "");
  const fw = purpose === "cases" ? normalizeLayers(frameworks) : normalizeFrameworks(frameworks);
  const toolNames = purpose === "cases" ? [] : normalizeTools(scope && scope.tools);
  let names = fw.join(", ");
  if (toolNames.length) {
    const withTools = (names ? names + ", " : "") + toolNames.join(", ");
    names = withTools.length <= 90 ? withTools : fw.length + " frameworks, " + toolNames.length + " tools";
  }
  const head = purpose === "report"
    ? "Open a QA-lab URL Review report again"
    : purpose === "cases"
      ? "QA-lab test case export"
      : "QA-lab URL Review run";
  const size = purpose === "new-run" && scope && scope.pages ? " · " + scope.pages + " pages, " + scope.depth + " links deep" : "";
  return (names ? head + " · " + names : head) + size;
}

function httpsJson(method, hostname, path, headers, body) {
  const allowed = hostname === "sandbox.wompi.co" || hostname === "api.mercadopago.com" || hostname === "open.er-api.com";
  if (!allowed) {
    const error = new Error("The payment service is not available. No charge was made.");
    error.status = 502;
    return Promise.reject(error);
  }
  const payload = body ? JSON.stringify(body) : "";
  const fallback = hostname === "open.er-api.com"
    ? "The peso price could not be loaded. No charge was made."
    : (hostname === "sandbox.wompi.co"
      ? "Wompi refused the checkout. No charge was made."
      : "Mercado Pago refused the checkout. No charge was made.");
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname,
      path,
      method,
      headers: Object.assign({
        accept: "application/json",
        "user-agent": "CarlosMunozReview/1.0",
        "content-length": Buffer.byteLength(payload)
      }, payload ? { "content-type": "application/json" } : {}, headers || {})
    }, (res) => {
      const chunks = [];
      res.on("data", (chunk) => chunks.push(chunk));
      res.on("end", () => {
        let parsed = {};
        try { parsed = JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}"); } catch (error) { parsed = {}; }
        if ((res.statusCode || 500) >= 400) {
          const failure = new Error(fallback);
          failure.status = 502;
          reject(failure);
          return;
        }
        resolve(parsed);
      });
    });
    req.setTimeout(8000, () => req.destroy(new Error(fallback)));
    req.on("error", () => {
      const failure = new Error(fallback);
      failure.status = 502;
      reject(failure);
    });
    if (payload) req.write(payload);
    req.end();
  });
}

let copCache = { at: 0, rate: 0 };

async function copQuote(usd) {
  const dollars = Number(usd);
  if (!priceMatches(dollars)) {
    const error = new Error("That amount is not a QA-lab price. No charge was made.");
    error.status = 400;
    throw error;
  }
  if (!copCache.rate || Date.now() - copCache.at >= 60 * 60 * 1000) {
    const body = await httpsJson("GET", "open.er-api.com", "/v6/latest/USD", {}, null);
    const rate = body.result === "success" ? Number(body.rates && body.rates.COP) : NaN;
    if (!Number.isFinite(rate) || rate < 2000 || rate > 10000) {
      const error = new Error("The peso price could not be loaded. No charge was made.");
      error.status = 503;
      throw error;
    }
    copCache = { at: Date.now(), rate };
  }
  const pesos = Math.round(dollars * copCache.rate);
  return { pesos, centavos: pesos * 100, rate: copCache.rate, usd: dollars };
}

function checkoutUrl(raw, hostnames) {
  let parsed = null;
  try { parsed = new URL(String(raw || "")); } catch (error) { parsed = null; }
  if (!parsed || parsed.protocol !== "https:" || hostnames.indexOf(parsed.hostname) === -1) return "";
  return parsed.toString();
}

async function startWompi(options, purpose) {
  const key = String(options.wompiKey || "");
  if (!/^prv_test_[A-Za-z0-9]+$/.test(key)) {
    const error = new Error("A Wompi sandbox private key is not set. No charge was made.");
    error.status = 503;
    throw error;
  }
  const priced = chargedUsd(options);
  const quote = options.cop && options.cop.centavos ? options.cop : await copQuote(priced.usd);
  const reference = String(options.reference || "").replace(/[^a-f0-9]/g, "").slice(0, 16);
  const created = await httpsJson("POST", "sandbox.wompi.co", "/v1/payment_links", {
    authorization: "Bearer " + key
  }, {
    name: productName(purpose, priced.frameworks),
    description: "QA-lab URL Review. " + priced.usd + " USD priced in Colombian pesos.",
    single_use: true,
    collect_shipping: false,
    currency: "COP",
    amount_in_cents: quote.centavos,
    redirect_url: options.successUrl,
    sku: reference
  });
  const id = created.data && created.data.id;
  const url = /^[A-Za-z0-9_-]{4,80}$/.test(String(id || ""))
    ? checkoutUrl("https://checkout.wompi.co/l/" + id, ["checkout.wompi.co"])
    : "";
  if (!url) {
    const error = new Error("Wompi did not return a test checkout. No charge was made.");
    error.status = 502;
    throw error;
  }
  return { url, id, provider: "wompi", currency: "COP", amount: quote.centavos, reference };
}

async function startMercadoPago(options, purpose) {
  const token = String(options.mercadoPagoToken || "");
  if (!/^TEST-[A-Za-z0-9_-]{20,}$/.test(token)) {
    const error = new Error("A Mercado Pago test access token is not set. No charge was made.");
    error.status = 503;
    throw error;
  }
  const priced = chargedUsd(options);
  const quote = options.cop && options.cop.pesos ? options.cop : await copQuote(priced.usd);
  const reference = String(options.reference || "").replace(/[^a-f0-9]/g, "").slice(0, 16);
  const payload = {
    items: [{
      title: productName(purpose, priced.frameworks),
      quantity: 1,
      currency_id: "COP",
      unit_price: quote.pesos
    }],
    external_reference: reference,
    metadata: {
      purpose,
      report_id: options.reportId || "",
      device_id: options.deviceId || ""
    },
    back_urls: {
      success: options.successUrl,
      failure: options.cancelUrl,
      pending: options.pendingUrl || options.cancelUrl
    }
  };
  if (String(options.successUrl || "").startsWith("https://")) payload.auto_return = "approved";
  const created = await httpsJson("POST", "api.mercadopago.com", "/checkout/preferences", {
    authorization: "Bearer " + token
  }, payload);
  const url = checkoutUrl(created.sandbox_init_point, ["sandbox.mercadopago.com", "sandbox.mercadopago.com.co"]);
  if (!url || !created.id) {
    const error = new Error("Mercado Pago did not return a test checkout. No charge was made.");
    error.status = 502;
    throw error;
  }
  return { url, id: String(created.id), provider: "mercadopago", currency: "COP", amount: quote.pesos, reference };
}

async function startCheckout(options) {
  const provider = paymentProvider(options && options.provider);
  const purpose = ["report", "cases", "credentials", "alerts", "new-run"].indexOf(options && options.purpose) === -1 ? "new-run" : options.purpose;
  if (provider !== "paypal") {
    const error = new Error("PayPal is the payment method for this review. No charge was made.");
    error.status = 400;
    throw error;
  }
  return startPayPal(options, purpose);
}

async function inspectWompi(options) {
  const key = String(options.wompiKey || "");
  const id = String(options.sessionId || "");
  if (!/^prv_test_[A-Za-z0-9]+$/.test(key)) {
    const error = new Error("A Wompi sandbox private key is not set. No charge was made.");
    error.status = 503;
    throw error;
  }
  if (!/^[A-Za-z0-9-]{6,80}$/.test(id)) {
    const error = new Error("That payment is not a Wompi transaction.");
    error.status = 400;
    throw error;
  }
  const tx = await httpsJson("GET", "sandbox.wompi.co", "/v1/transactions/" + encodeURIComponent(id), {
    authorization: "Bearer " + key
  }, null);
  const data = tx.data || {};
  const linkId = String(data.payment_link_id || "");
  let reference = "";
  if (/^[A-Za-z0-9_-]{4,80}$/.test(linkId)) {
    const link = await httpsJson("GET", "sandbox.wompi.co", "/v1/payment_links/" + encodeURIComponent(linkId), {
      authorization: "Bearer " + key
    }, null);
    reference = String((link.data && link.data.sku) || "").replace(/[^a-f0-9]/g, "").slice(0, 16);
  }
  const status = String(data.status || "");
  return {
    paid: status === "APPROVED",
    pending: status === "PENDING",
    provider: "wompi",
    sessionId: id,
    linkId,
    reference,
    amount: Number(data.amount_in_cents) || 0,
    currency: "COP"
  };
}

async function inspectMercadoPago(options) {
  const token = String(options.mercadoPagoToken || "");
  const id = String(options.sessionId || "");
  if (!/^TEST-[A-Za-z0-9_-]{20,}$/.test(token)) {
    const error = new Error("A Mercado Pago test access token is not set. No charge was made.");
    error.status = 503;
    throw error;
  }
  if (!/^\d{1,20}$/.test(id)) {
    const error = new Error("That payment is not a Mercado Pago test payment.");
    error.status = 400;
    throw error;
  }
  const payment = await httpsJson("GET", "api.mercadopago.com", "/v1/payments/" + id, {
    authorization: "Bearer " + token
  }, null);
  const status = String(payment.status || "");
  return {
    paid: status === "approved" && payment.live_mode === false,
    pending: status === "pending" || status === "in_process",
    provider: "mercadopago",
    sessionId: id,
    linkId: "",
    reference: String(payment.external_reference || "").replace(/[^a-f0-9]/g, "").slice(0, 16),
    amount: Number(payment.transaction_amount) || 0,
    currency: String(payment.currency_id || "COP")
  };
}

function testKeyMatches(given, expected) {
  const a = Buffer.from(String(given || ""));
  const b = Buffer.from(String(expected || ""));
  return b.length >= 24 && a.length === b.length && crypto.timingSafeEqual(a, b);
}

function paypalCredentials(options) {
  const id = String((options && options.paypalClientId) || "");
  const secret = String((options && options.paypalSecret) || "");
  const mode = options && options.paypalMode === "live" ? "live" : "sandbox";
  if (!/^[A-Za-z0-9_-]{20,120}$/.test(id) || !/^[A-Za-z0-9_-]{20,120}$/.test(secret)) {
    const error = new Error("PayPal is not set up on the server. No charge was made.");
    error.status = 503;
    throw error;
  }
  return { id, secret, mode, host: mode === "live" ? "api-m.paypal.com" : "api-m.sandbox.paypal.com" };
}

function paypalRequest(method, hostname, path, headers, body) {
  if (hostname !== "api-m.paypal.com" && hostname !== "api-m.sandbox.paypal.com") {
    const error = new Error("PayPal is not available. No charge was made.");
    error.status = 502;
    return Promise.reject(error);
  }
  const payload = body && typeof body === "object" ? JSON.stringify(body) : String(body || "");
  const fallback = "PayPal refused the checkout. No charge was made.";
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname,
      path,
      method,
      headers: Object.assign({
        accept: "application/json",
        "user-agent": "CarlosMunozReview/1.0",
        "content-length": Buffer.byteLength(payload)
      }, payload && typeof body === "object" ? { "content-type": "application/json" } : {}, headers || {})
    }, (res) => {
      const chunks = [];
      res.on("data", (chunk) => chunks.push(chunk));
      res.on("end", () => {
        let parsed = {};
        try { parsed = JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}"); } catch (error) { parsed = {}; }
        resolve({ status: res.statusCode || 500, body: parsed });
      });
    });
    req.setTimeout(12000, () => req.destroy(new Error(fallback)));
    req.on("error", () => {
      const failure = new Error(fallback);
      failure.status = 502;
      reject(failure);
    });
    if (payload) req.write(payload);
    req.end();
  });
}

let paypalTokens = {};

async function paypalAccessToken(creds) {
  const key = creds.mode + ":" + creds.id;
  const cached = paypalTokens[key];
  if (cached && cached.until > Date.now() + 60000) return cached.token;
  const basic = Buffer.from(creds.id + ":" + creds.secret).toString("base64");
  const response = await paypalRequest("POST", creds.host, "/v1/oauth2/token", {
    authorization: "Basic " + basic,
    "content-type": "application/x-www-form-urlencoded"
  }, "grant_type=client_credentials");
  const token = response.body && response.body.access_token;
  if (response.status >= 400 || !token) {
    const error = new Error("PayPal refused the checkout. No charge was made.");
    error.status = 502;
    throw error;
  }
  paypalTokens[key] = { token, until: Date.now() + (Number(response.body.expires_in) || 300) * 1000 };
  return token;
}

async function startPayPal(options, purpose) {
  const creds = paypalCredentials(options);
  const token = await paypalAccessToken(creds);
  const priced = chargedUsd(options);
  const reference = String(options.reference || "").replace(/[^a-f0-9]/g, "").slice(0, 16);
  const created = await paypalRequest("POST", creds.host, "/v2/checkout/orders", {
    authorization: "Bearer " + token,
    "content-type": "application/json",
    "paypal-request-id": reference
  }, {
    intent: "CAPTURE",
    purchase_units: [{
      custom_id: reference,
      description: productName(purpose, purpose === "cases" ? priced.layers : priced.frameworks, priced),
      amount: { currency_code: "USD", value: priced.usd.toFixed(2) }
    }],
    payment_source: {
      paypal: {
        experience_context: {
          brand_name: "QA-lab URL Review",
          shipping_preference: "NO_SHIPPING",
          user_action: "PAY_NOW",
          return_url: options.successUrl,
          cancel_url: options.cancelUrl
        }
      }
    }
  });
  const links = (created.body && created.body.links) || [];
  const approve = links.find((link) => link.rel === "payer-action") || links.find((link) => link.rel === "approve");
  const checkoutHost = creds.mode === "live" ? "www.paypal.com" : "www.sandbox.paypal.com";
  const url = checkoutUrl(approve && approve.href, [checkoutHost]);
  const id = String((created.body && created.body.id) || "");
  if (created.status >= 400 || !url || !/^[A-Z0-9]{10,22}$/.test(id)) {
    const error = new Error("PayPal did not return a checkout. No charge was made.");
    error.status = 502;
    throw error;
  }
  return { url, id, provider: "paypal", currency: "USD", amount: priced.usd, reference };
}

function paypalPaid(order) {
  const unit = (order.purchase_units || [])[0] || {};
  const captures = (unit.payments && unit.payments.captures) || [];
  const capture = captures[0] || {};
  const value = String((capture.amount && capture.amount.value) || "");
  const currency = String((capture.amount && capture.amount.currency_code) || "");
  const amount = Number(value);
  const paid = order.status === "COMPLETED" && capture.status === "COMPLETED" && currency === "USD" && priceMatches(amount);
  return {
    paid,
    pending: !paid && (order.status === "APPROVED" || order.status === "PAYER_ACTION_REQUIRED"),
    reference: String(unit.custom_id || capture.custom_id || "").replace(/[^a-f0-9]/g, "").slice(0, 16),
    amount: paid ? amount : 0
  };
}

async function inspectPayPal(options) {
  const creds = paypalCredentials(options);
  const id = String(options.sessionId || "");
  if (!/^[A-Z0-9]{10,22}$/.test(id)) {
    const error = new Error("That payment is not a PayPal order.");
    error.status = 400;
    throw error;
  }
  const token = await paypalAccessToken(creds);
  let response = await paypalRequest("POST", creds.host, "/v2/checkout/orders/" + id + "/capture", {
    authorization: "Bearer " + token,
    "content-type": "application/json",
    "paypal-request-id": "cap-" + id
  }, {});
  if (response.status >= 400) {
    response = await paypalRequest("GET", creds.host, "/v2/checkout/orders/" + id, {
      authorization: "Bearer " + token
    }, "");
  }
  if (response.status >= 400 || !response.body) {
    const error = new Error("PayPal has not confirmed this payment. No charge was recorded here.");
    error.status = 402;
    throw error;
  }
  const result = paypalPaid(response.body);
  return {
    paid: result.paid,
    pending: result.pending,
    provider: "paypal",
    sessionId: id,
    linkId: "",
    reference: result.reference,
    amount: result.amount,
    currency: "USD"
  };
}

async function inspectPayment(options) {
  const provider = paymentProvider(options && options.provider);
  if (provider !== "paypal") {
    const error = new Error("PayPal is the payment method for this review. No charge was recorded.");
    error.status = 400;
    throw error;
  }
  return inspectPayPal(options);
}

function compareRuns(previous, report) {
  const before = previous && previous.insights;
  const now = report && report.insights;
  if (!before || !now || !before.score || !now.score) return null;
  const open = (ins) => new Map((ins.findings || []).filter((item) => item.verdict === "fail" || item.verdict === "risk").map((item) => [item.key, item.title]));
  const was = open(before);
  const is = open(now);
  const fixed = [...was].filter(([key]) => !is.has(key)).map(([, title]) => title);
  const fresh = [...is].filter(([key]) => !was.has(key)).map(([, title]) => title);
  const areas = {};
  Object.keys(now.score.areas || {}).forEach((name) => {
    const old = (before.score.areas || {})[name];
    if (old) areas[name] = { before: old.score, now: now.score.areas[name].score };
  });
  return {
    previousId: previous.id || "",
    previousAt: previous.fetchedAt || "",
    before: before.score.overall || 0,
    now: now.score.overall || 0,
    areas,
    fixed: fixed.slice(0, 12),
    fixedCount: fixed.length,
    fresh: fresh.slice(0, 12),
    freshCount: fresh.length,
    still: [...is.keys()].filter((key) => was.has(key)).length
  };
}

const FIELD_METRICS = { lcp: "LARGEST_CONTENTFUL_PAINT_MS", inp: "INTERACTION_TO_NEXT_PAINT", cls: "CUMULATIVE_LAYOUT_SHIFT_SCORE", fcp: "FIRST_CONTENTFUL_PAINT_MS", ttfb: "EXPERIMENTAL_TIME_TO_FIRST_BYTE" };

function summarizePageSpeed(data) {
  const lh = (data && data.lighthouseResult) || {};
  const perf = lh.categories && lh.categories.performance;
  if (!perf || typeof perf.score !== "number") return { ok: false, error: (lh.runtimeError && lh.runtimeError.code) || "no Lighthouse score" };
  const audits = lh.audits || {};
  const num = (id) => (audits[id] && typeof audits[id].numericValue === "number" ? Math.round(audits[id].numericValue * (id === "cumulative-layout-shift" ? 1000 : 1)) / (id === "cumulative-layout-shift" ? 1000 : 1) : null);
  const field = (exp, scope) => {
    if (!exp || !exp.metrics) return null;
    const out = { scope, overall: exp.overall_category || "" };
    Object.keys(FIELD_METRICS).forEach((key) => {
      const metric = exp.metrics[FIELD_METRICS[key]];
      if (metric && typeof metric.percentile === "number") out[key] = { p75: key === "cls" ? metric.percentile / 100 : metric.percentile, category: metric.category || "" };
    });
    return out.lcp || out.inp || out.cls ? out : null;
  };
  const page = data.loadingExperience && !data.loadingExperience.origin_fallback ? field(data.loadingExperience, "page") : null;
  return {
    ok: true,
    strategy: "mobile",
    score: Math.round(perf.score * 100),
    lab: { lcp: num("largest-contentful-paint"), fcp: num("first-contentful-paint"), tbt: num("total-blocking-time"), cls: num("cumulative-layout-shift"), si: num("speed-index") },
    field: page || field(data.originLoadingExperience, "origin"),
    bytes: num("total-byte-weight"),
    version: String(lh.lighthouseVersion || ""),
    fetchedAt: String(lh.fetchTime || "")
  };
}

async function pageSpeed(url, key) {
  if (!key) return null;
  const api = "https://www.googleapis.com/pagespeedonline/v5/runPagespeed?strategy=mobile&category=performance&url=" + encodeURIComponent(url) + "&key=" + encodeURIComponent(key);
  const res = await fetch(api, { signal: AbortSignal.timeout(90000) });
  if (!res.ok) return { ok: false, error: res.status === 429 ? "the daily quota is used up" : "status " + res.status };
  return summarizePageSpeed(await res.json());
}

const FILLER = "loremipsumdolorsitametconsectetur";

function frostText(text) {
  const raw = String(text || "");
  const mark = raw.search(/[.!?](\s|$)/);
  let cut = mark === -1 ? Math.max(28, Math.floor(raw.length * 0.36)) : mark + 1;
  if (cut > raw.length - 12) cut = Math.max(16, Math.floor(raw.length * 0.42));
  if (cut >= raw.length) return raw;
  let at = 0;
  return raw.slice(0, cut) + raw.slice(cut).replace(/\S/g, () => FILLER[at++ % FILLER.length]);
}

// The page blurs a free report with CSS, so a paid reopen sends only this copy:
// the readable opening of each blurred line, filler for the rest, and no fix-kit files.
function previewReport(report) {
  const copy = JSON.parse(JSON.stringify(report || {}));
  (copy.cases || []).forEach((item) => {
    item.title = frostText(item.title);
    item.why = frostText(item.why);
    ["steps", "expected", "script", "scripts", "data", "selectors", "check"].forEach((key) => { delete item[key]; });
  });
  (copy.alerts || []).forEach((item) => {
    item.title = frostText(item.title);
    item.detail = frostText(item.detail);
  });
  const ins = copy.insights || {};
  (ins.findings || []).forEach((item) => {
    item.evidence = frostText(item.evidence);
    item.fix = frostText(item.fix);
  });
  if (ins.fixkit) {
    const kit = ins.fixkit;
    ins.fixkit = {
      hosting: kit.hosting || "",
      csp: frostText(kit.csp),
      headers: (kit.headers || []).map((row) => ({ name: row && row.name, missing: !!(row && row.missing) })),
      dns: (kit.dns || []).map((row) => ({ type: row && row.type })),
      jsonLd: !!kit.jsonLd,
      llmsTxt: !!kit.llmsTxt,
      securityTxt: !!kit.securityTxt
    };
  }
  copy.preview = true;
  return copy;
}

module.exports = {
  decodeBody,
  domainCases,
  compareRuns,
  testKeyMatches,
  pageSpeed,
  summarizePageSpeed,
  webRisk,
  domainFacts,
  readRdap,
  mtaStsPolicy,
  TERMS_VERSION,
  PRICE_USD,
  PRICE_PER_FRAMEWORK,
  centsForIndex,
  scheduleCents,
  priceFor,
  priceForLayers,
  priceForScope,
  priceForRun,
  chargedUsd,
  priceMatches,
  paypalPaid,
  previewReport,
  priceForCredentials,
  priceForAlerts,
  normalizeFrameworks,
  normalizeLayers,
  normalizeScope,
  normalizePageLang,
  sectionPrefix,
  underSection,
  sitemapCandidates,
  PAGE_LANGS,
  PAGE_CHOICES,
  DEPTH_CHOICES,
  INCLUDED_PAGES,
  INCLUDED_DEPTH,
  LAYERS,
  REASONS,
  FRAMEWORKS,
  SPECIALIST_TOOLS,
  normalizeTools,
  toolsForCharge,
  RETAIN_MS,
  PAYMENT_YEARS,
  paymentExpireAt,
  preformatUrl,
  validateIntake,
  screenIntake,
  emailCanReceive,
  mailboxMatchesHost,
  emailSyntax,
  registrable,
  ownerContacts,
  emailsInText,
  visibleText,
  fetchExtra,
  webSearch,
  parseMentions,
  humanCheck,
  createCheckout,
  readCheckout,
  paymentChoice,
  paymentProvider,
  copQuote,
  startCheckout,
  inspectPayment,
  judgeAttempts,
  reviewTarget,
  journeys,
  toolsForPage,
  intakeRecord,
  analyzeHtml: inspect,
  challengeOf,
  dnsFacts,
  plainHttp,
  probeRead,
  readSitemap,
  sitemapPaths,
  sitePaths,
  ipBlocked,
  hostBlocked
};
