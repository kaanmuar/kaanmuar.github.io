/**
 * Read-only review of a public https URL.
 * Fetches HTML, records what the response showed, and proposes test cases.
 * It does not click, submit, sign in, probe, or generate load.
 */
const dns = require("dns").promises;
const http = require("http");
const https = require("https");
const net = require("net");
const crypto = require("crypto");
const { URL } = require("url");

const TERMS_VERSION = "2026-10-20";
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
    if (base === cents) return true;
    if (count <= FRAMEWORKS.length && scopes.some((extra) => base + extra === cents)) return true;
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
  { id: "other", label: "Other" }
];
const BROWSER_FW = ["Playwright", "Cypress", "Robot", "Selenium", "WebdriverIO", "CodeceptJS", "Selenide", "TestNG", "Watir", "Cucumber", "Behave", "Reqnroll", "Jest", "Vitest", "Mocha"];
const MOBILE_FW = ["Appium", "Maestro"];
const LOAD_FW = ["JMeter", "Gatling", "k6"];
const FRAMEWORKS = BROWSER_FW.concat(MOBILE_FW, LOAD_FW);
const SPECIALIST_TOOLS = ["axe-core", "Lighthouse", "BrowserStack", "Applitools", "Percy", "Provar", "Copado"];
const LAYERS = ["Functional", "Content", "Links", "Accessibility", "Security", "Privacy", "SEO", "Performance", "Load", "Mobile", "Internationalization", "Resilience", "Compatibility", "Media", "Analytics", "Commerce", "Forms", "Visual", "Platform", "API"];
const USER_AGENT = "CarlosMunozReview/1.0 (+https://carlosandmunoz.com/qa-review.html)";
const MAX_PAGES = 100;
const MAX_DEPTH = 5;
const MAX_BYTES = 2000000;
const PAGE_TIMEOUT_MS = 8000;
const TOTAL_MS = 170000;
const RETAIN_MS = 365 * 24 * 60 * 60 * 1000;

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
const MULTI_TLDS = ["co.uk", "org.uk", "ac.uk", "com.co", "net.co", "com.mx", "com.br", "com.au", "co.jp", "co.za", "com.ar", "com.pe", "com.ec", "com.uy", "co.nz", "com.tr"];

function emailSyntax(email) {
  const value = String(email || "");
  if (!EMAIL_RE.test(value) || value.includes("..")) return false;
  return value.split("@")[1].split(".").every(Boolean);
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
  if (src.termsAccepted !== true || src.termsVersion !== TERMS_VERSION) fieldError(errors, "terms", "Accept the terms first.");
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
      termsVersion: TERMS_VERSION,
      deviceId: clean(src.deviceId, 80),
      clientName,
      clientEmail,
      clientUrl,
      ownership: known && known.id === "own" ? "mailbox-domain" : "",
      followUp: src.followUp === true
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
    const error = new Error("This read is included. No charge was made.");
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
  if (Math.round(usd * 100) !== priced.cents) {
    const error = new Error(purpose === "cases"
      ? "The charge does not match the selected kinds of test cases."
      : purpose === "new-run"
        ? "The charge does not match this read."
        : "The charge does not match the selected frameworks.");
    error.status = 400;
    throw error;
  }
  return priced;
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
    return { ok: false, code: "invalid", message: error.message || "Choose the size of the read." };
  }
  const used = new Set(mine.filter((row) => row.status === "run-credit-used").map((row) => row.creditId));
  const credit = mine.find((row) => row.status === "run-credit" && !used.has(row.id) && sameFrameworks(row.frameworks, frameworksPriced.frameworks) && sameTools(row.tools, frameworksPriced.tools) && sameScope(row, scope));
  const completed = mine.some((row) => row.status === "complete");
  if (!completed && scope.cents === 0) return { ok: true };
  if (credit) return { ok: true, consumeId: credit.id };
  const billing = completed ? "run" : "scope";
  const priced = priceForRun({ frameworks, tools, pages: scope.pages, depth: scope.depth, billing });
  return {
    ok: false,
    code: "payment",
    message: completed
      ? "Another review asks for payment before it starts."
      : "A wider or deeper read asks for payment before it starts.",
    priceUsd: priced.usd,
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

function requestOnce(target, pinned, isStopped) {
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
    const req = lib.request({
      protocol: target.protocol,
      hostname: target.hostname,
      port: target.port || 443,
      path: target.pathname + target.search,
      method: "GET",
      timeout: PAGE_TIMEOUT_MS,
      headers: {
        "user-agent": USER_AGENT,
        accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8",
        "accept-language": "en",
        connection: "close"
      },
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
      res.on("data", (chunk) => {
        size += chunk.length;
        if (size > MAX_BYTES) {
          failed = new Error("The page is larger than the review limit.");
          giveUp(failed);
          return;
        }
        chunks.push(chunk);
      });
      res.on("end", () => {
        if (failed) finish(reject, failed);
        else finish(resolve, { status: res.statusCode || 0, headers: res.headers, body: Buffer.concat(chunks).toString("utf8") });
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
    deadline = setTimeout(() => giveUp(new Error("The page took too long.")), PAGE_TIMEOUT_MS);
    req.on("timeout", () => giveUp(new Error("The page took too long.")));
    req.on("error", (error) => finish(reject, haltError || error));
    req.end();
  });
}

async function fetchPublic(raw, isStopped, onPulse) {
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
      const res = await requestOnce(current, pinned, isStopped);
      const location = res.headers.location;
      if ([301, 302, 303, 307, 308].includes(res.status) && location) {
        if (onPulse) onPulse("The page redirected. Following the next public https address.");
        current = normalizeUrl(new URL(location, current).toString());
        continue;
      }
      return {
        url: current.toString(),
        status: res.status,
        headers: res.headers,
        body: res.body,
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
  const match = String(tag).match(new RegExp(name + "\\s*=\\s*(\"([^\"]*)\"|'([^']*)'|([^\\s>]+))", "i"));
  return match ? decode(match[2] || match[3] || match[4] || "") : "";
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

function inspect(html, headers, pageUrl) {
  const title = textOf(html, "title");
  const description = collect(html, "meta").map((tag) => attr(tag, "name").toLowerCase() === "description" ? attr(tag, "content") : "").find(Boolean) || "";
  const canonical = collect(html, "link").map((tag) => attr(tag, "rel").toLowerCase() === "canonical" ? attr(tag, "href") : "").find(Boolean) || "";
  const htmlTag = (html.match(/<html\b[^>]*>/i) || [""])[0];
  const lang = attr(htmlTag, "lang");
  const h1 = (html.match(/<h1\b[^>]*>[\s\S]*?<\/h1>/gi) || []).map((tag) => decode(tag.replace(/<[^>]+>/g, " "))).filter(Boolean);
  const images = collect(html, "img");
  const missingAlt = images.filter((tag) => !attr(tag, "alt")).length;
  const forms = collect(html, "form").length;
  const password = /<input\b[^>]*type\s*=\s*["']?password/i.test(html);
  const buttons = (html.match(/<button\b/gi) || []).length;
  const unlabeled = (html.match(/<input\b[^>]*>/gi) || []).filter((tag) => {
    const type = attr(tag, "type").toLowerCase();
    return type !== "hidden" && type !== "submit" && !attr(tag, "aria-label") && !attr(tag, "id");
  }).length;
  const links = [];
  collect(html, "a").forEach((tag) => {
    const href = sameHost(pageUrl, attr(tag, "href"));
    if (href && links.length < 100) links.push(href);
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
  const signals = {
    viewport: /<meta\b[^>]*\bname\s*=\s*(?:["']viewport["']|viewport\b)/i.test(html),
    styled: /<style\b/i.test(html),
    openGraph: metas.some((tag) => /^og:/i.test(attr(tag, "property"))),
    twitter: metas.some((tag) => /^twitter:/i.test(attr(tag, "name"))),
    jsonLd: (html.match(/application\/ld\+json/gi) || []).length,
    iframes: (html.match(/<iframe\b/gi) || []).length,
    untitledFrames: (html.match(/<iframe\b[^>]*>/gi) || []).filter((tag) => !attr(tag, "title")).length,
    h2: (html.match(/<h2\b/gi) || []).length,
    mixed: (html.match(/\bhttp:\/\/[^"'>\s]+/gi) || []).length,
    hreflang: linksAll.filter((tag) => attr(tag, "rel").toLowerCase().indexOf("alternate") !== -1 && attr(tag, "hreflang")).length,
    skip: /<a\b[^>]*href\s*=\s*["']#[^"']+/i.test(html),
    main: /<main\b/i.test(html),
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
    imgNoSize: (html.match(/<img\b[^>]*>/gi) || []).filter((tag) => !attr(tag, "width") && !attr(tag, "height")).length,
    robotsMeta: metas.some((tag) => attr(tag, "name").toLowerCase() === "robots"),
    cacheControl: header(headers, "cache-control"),
    apiHint: /graphql|wp-json|openapi|swagger/i.test(html.slice(0, 200000)),
    manifest: linksAll.some((tag) => /manifest/i.test(attr(tag, "rel")))
  };
  return {
    title: clean(title, 180),
    description: clean(description, 240),
    canonical: clean(canonical, 300),
    lang: clean(lang, 16),
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
  ["axe-core", "This document can be opened in a browser. axe-core is named on the accessibility cases and is not run here."],
  ["Lighthouse", "A public document was read. Lighthouse would score the rendered page later. It is not run here."],
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

function propose(pages, robotsBlocked, limits) {
  const cases = [];
  const home = pages[0];
  const face = home.inspect || {};
  const sig = face.signals || {};
  const browser = BROWSER_FW;
  const names = techNames(pages);
  const stack = names.length ? names.slice(0, 6).join(", ") : "no named library";
  const fit = toolFit(face, sig, names);
  const named = (list) => list.filter((name) => fit[name]);
  const slow = pages.reduce((best, page) => (page.ms || 0) > (best.ms || 0) ? page : best, home);
  const failed = pages.filter((page) => page.status && (page.status < 200 || page.status >= 400));
  const untitled = pages.filter((page) => !page.title);
  const titles = pages.map((page) => page.title).filter(Boolean);
  const duplicateTitles = titles.filter((title, index) => titles.indexOf(title) !== index).length;
  const later = " A later run would open a real browser, keep the same host, and assert the step without submitting a form or generating load.";
  addCase(cases, { id: "FN-01", layer: "Functional", title: "The reviewed URL answers over https", why: "The final URL was " + home.url + " with status " + home.status + "." + later, fw: browser });
  addCase(cases, { id: "FN-02", layer: "Functional", title: "The document has a title", why: (face.title ? "A title is present: " + face.title + "." : "No title element was found.") + later, fw: browser });
  addCase(cases, { id: "FN-03", layer: "Functional", title: "The document has one clear h1", why: (face.h1.length === 1 ? "One h1 was found." : face.h1.length + " h1 elements were found.") + " Heading text would be compared with the visible hero, not only the tag count.", fw: browser });
  addCase(cases, { id: "FN-04", layer: "Functional", title: "The html element declares a language", why: (face.lang ? "lang=\"" + face.lang + "\" is present." : "No lang attribute was found.") + " The declared language would be checked against the visible copy.", fw: browser });
  addCase(cases, { id: "FN-05", layer: "Functional", title: "Primary controls have an accessible name", why: face.buttons + " button elements were counted." + later + " Empty buttons and icon-only controls would fail.", fw: browser });
  addCase(cases, { id: "FN-06", layer: "Functional", title: "Discovered pages keep a successful document status", why: failed.length ? failed.length + " saved pages were outside 200–399." : pages.length + " saved pages stayed in the success range." + " A regression run would fail on a new 404 or 500 inside the same path list.", fw: browser });
  addCase(cases, { id: "FN-07", layer: "Functional", title: "Each saved page keeps a title", why: (untitled.length ? untitled.length + " saved pages had no title." : "Every saved page had a title.") + " Titles would be asserted per path, including pages reached through one link.", fw: browser });
  if (duplicateTitles) addCase(cases, { id: "FN-08", layer: "Functional", title: "Titles stay distinct across the pages that were read", why: duplicateTitles + " titles repeated inside this read. A content regression would flag two indexable URLs that share one title.", fw: browser });
  addCase(cases, { id: "CT-01", layer: "Content", title: "The meta description is present and short enough to read", why: (face.description ? "A description of " + face.description.length + " characters is present." : "No meta description was found.") + " The useful band for a snippet is about 50 to 160 characters.", fw: browser });
  addCase(cases, { id: "CT-02", layer: "Content", title: "A canonical link points at the preferred URL", why: (face.canonical ? "Canonical is " + face.canonical + "." : "No canonical link was found.") + " The preferred URL would be compared with the final https address of this read.", fw: browser });
  addCase(cases, { id: "CT-03", layer: "Content", title: "Open Graph and Twitter cards describe the same page", why: (sig.openGraph ? "Open Graph tags are present." : "No Open Graph tag was found.") + (sig.twitter ? " A Twitter card tag is present." : " No Twitter card tag was found.") + " A later case would assert og:title, og:image, and the card type.", fw: browser });
  addCase(cases, { id: "CT-04", layer: "Content", title: "Structured data is valid when the page publishes it", why: (sig.jsonLd ? sig.jsonLd + " JSON-LD block(s) were found." : "No JSON-LD block was found.") + " The type would be checked against the visible page, for example an organization, article, or product.", fw: browser });
  addCase(cases, { id: "CT-05", layer: "Content", title: "The h1 and the title agree", why: (face.h1[0] ? "The first h1 is \"" + face.h1[0] + "\"." : "There is no h1 text to compare.") + " The title and the h1 do not have to be identical, and they should not describe different pages.", fw: browser });
  const capPages = (limits && limits.maxPages) || MAX_PAGES;
  const capDepth = (limits && limits.maxDepth) || MAX_DEPTH;
  addCase(cases, { id: "LK-01", layer: "Links", title: "Same-host links discovered from the start page resolve", why: face.links.length + " same-host links were listed. This review opened at most " + capPages + " of them and did not click them. A later run would request each href and accept only an HTML document on this host.", fw: browser });
  addCase(cases, { id: "LK-02", layer: "Links", title: "The crawl stays inside the page cap and the host", why: pages.length + " HTML pages were saved, " + capDepth + " links deep at most, with a cap of " + capPages + " pages. A regression would fail if a link left the host or if the cap stopped hiding a broken primary path.", fw: browser });
  addCase(cases, { id: "LK-03", layer: "Links", title: "A crawler honors robots.txt for linked pages", why: (robotsBlocked ? robotsBlocked + " linked URLs were skipped because robots.txt disallows them for this agent." : "No linked URL was skipped for robots.txt during this read.") + " The start URL is still fetched. A later crawler case would log each skipped path.", fw: browser });
  addCase(cases, { id: "LK-04", layer: "Links", title: "In-page anchors and repeated hrefs stay intentional", why: "Same-host hrefs were deduped before the crawl. A UI case would open repeated navigation items once and check that a hash target exists on the page.", fw: browser });
  if (face.forms) {
    addCase(cases, { id: "FM-01", layer: "Forms", title: "Visible fields have labels", why: face.forms + " form(s) are present. " + face.unlabeled + " inputs had neither an id nor an aria-label. Nothing was submitted. A later case would pair each control with its label.", fw: browser });
    addCase(cases, { id: "FM-02", layer: "Forms", title: "A later functional run uses a test account the owner provides", why: "Submitting the form is a different act from reading it. The account, the fixture data, and the expected confirmation stay outside this review.", fw: browser });
    addCase(cases, { id: "FM-04", layer: "Forms", title: "Required fields block an empty submit", why: sig.required + " inputs were marked required in the HTML. A browser case would submit the empty form and expect the constraint message, without creating a record.", fw: browser });
  }
  if (face.password) addCase(cases, { id: "FM-03", layer: "Forms", title: "The sign-in form is reviewed only with credentials the owner issued", why: "A password field is present. This review did not type in it. A later case would use a disposable account and would assert the error for a wrong password.", fw: browser });
  if (sig.search) addCase(cases, { id: "FM-05", layer: "Forms", title: "Search accepts a known term and an empty term", why: "A search control was detected in the HTML. The case would submit one known term and one empty term, and it would not scrape the result set.", fw: browser });
  if (sig.fileInput) addCase(cases, { id: "FM-06", layer: "Forms", title: "File inputs state an accepted type before a file is chosen", why: "A file input is present. The case would assert the accept attribute and would not upload a file during this proposal.", fw: browser });
  addCase(cases, { id: "A11Y-01", layer: "Accessibility", title: "Images expose a text alternative", why: face.images + " images, " + face.missingAlt + " without an alt attribute. Informative images need text. Decorative images need an empty alt.", fw: browser });
  addCase(cases, { id: "A11Y-02", layer: "Accessibility", title: "The page has a main landmark and a skip link", why: (sig.main ? "A main element is present." : "No main element was found.") + (sig.skip ? " A skip link was found." : " No skip link was found.") + (fit["axe-core"] ? " A later accessibility pass would open the page and run axe-core." : ""), fw: browser, also: named(["axe-core"]) });
  addCase(cases, { id: "A11Y-03", layer: "Accessibility", title: "Heading order follows h1 then h2", why: face.h1.length + " h1 and " + (sig.h2 || 0) + " h2 elements were counted. The order would be checked in the rendered accessibility tree.", fw: browser });
  addCase(cases, { id: "A11Y-04", layer: "Accessibility", title: "Text contrast and keyboard focus are checked on the rendered page", why: "A raw HTML read cannot measure contrast or focus order. The later case would tab from the top of the page and record the focus ring.", fw: browser });
  addCase(cases, { id: "A11Y-05", layer: "Accessibility", title: "Frames expose a title", why: (sig.iframes || 0) + " iframe(s), " + (sig.untitledFrames || 0) + " without a title attribute. Each embedded document needs a name a screen reader can announce.", fw: browser });
  addCase(cases, { id: "SEC-01", layer: "Security", title: "HTTPS is the only way in", why: "The review refused any URL that was not https on port 443. A browser case would also request the http address and expect a redirect to https.", fw: browser });
  addCase(cases, { id: "SEC-02", layer: "Security", title: "HSTS is set", why: (face.headers.hsts ? "strict-transport-security is present." : "strict-transport-security was absent.") + " The later assertion is max-age, includeSubDomains, and a fresh profile that stays on https.", fw: browser });
  addCase(cases, { id: "SEC-03", layer: "Security", title: "A content security policy is set", why: (face.headers.csp ? "content-security-policy is present." : "content-security-policy was absent.") + " The policy would be checked for script-src and frame-ancestors, not only for the header name.", fw: browser });
  addCase(cases, { id: "SEC-04", layer: "Security", title: "nosniff and a frame policy are set", why: "x-content-type-options: " + (face.headers.nosniff || "absent") + ". x-frame-options: " + (face.headers.frame || "absent") + ". A framed copy of the page would be expected to fail when a frame policy is present.", fw: browser });
  addCase(cases, { id: "SEC-05", layer: "Security", title: "Referrer-Policy is set", why: (face.headers.referrer ? "referrer-policy is " + face.headers.referrer + "." : "referrer-policy was absent.") + " The later case would open an outbound link and confirm the referrer is no wider than the policy.", fw: browser });
  if (face.cookies.length) {
    const loose = face.cookies.filter((cookie) => !cookie.secure || !cookie.httpOnly);
    const site = face.cookies.filter((cookie) => !cookie.sameSite);
    addCase(cases, { id: "SEC-06", layer: "Security", title: "Cookies are Secure and HttpOnly where they carry a session", why: face.cookies.length + " cookies were set. " + loose.length + " were missing Secure or HttpOnly. " + site.length + " had no SameSite attribute.", fw: browser });
  }
  addCase(cases, { id: "SEC-07", layer: "Security", title: "Response headers do not need to reveal the server build", why: (face.headers.server ? "Server header: " + face.headers.server + "." : "No Server header was sent.") + " The case records the header and does not treat a product name as a vulnerability by itself.", fw: browser });
  addCase(cases, { id: "SEC-08", layer: "Security", title: "A permissions policy limits powerful features", why: (sig.permissions ? "A permissions policy is present." : "No permissions-policy header was found.") + " Camera, microphone, and geolocation would be expected to stay disabled unless the page needs them.", fw: browser });
  addCase(cases, { id: "SEC-09", layer: "Security", title: "The HTML does not reference plain http resources", why: (sig.mixed || 0) + " http:// references were counted in the markup. Mixed content would be confirmed in a browser console, not by downloading those URLs here.", fw: browser });
  addCase(cases, { id: "PR-01", layer: "Privacy", title: "A privacy notice is linked from the page", why: (sig.privacyLink ? "The HTML mentions a privacy or legal destination." : "No privacy or legal wording was found in the markup.") + " Confirm the link in a browser before treating it as found.", fw: browser });
  addCase(cases, { id: "PR-02", layer: "Privacy", title: "Third-party scripts are named before they run", why: (sig.thirdParty || []).length + " other hosts were referenced by script src" + ((sig.thirdParty || []).length ? " (" + sig.thirdParty.slice(0, 4).join(", ") + ")." : ".") + " A privacy case would load the page with tags blocked and then with consent.", fw: browser });
  addCase(cases, { id: "PR-03", layer: "Privacy", title: "A consent notice is present when tags or cookies appear before a choice", why: (sig.consent ? "Cookie or consent wording was found in the HTML." : "No cookie or consent wording was found.") + " The case would assert the notice before analytics storage is written.", fw: browser });
  addCase(cases, { id: "SEO-01", layer: "SEO", title: "Title, description, canonical, and social tags agree", why: "Title and description were read from the HTML. Open Graph tags would be asserted in a later browser case against the same final URL.", fw: browser });
  addCase(cases, { id: "SEO-02", layer: "SEO", title: "Language alternates are explicit when the site has more than one language", why: (sig.hreflang || 0) + " hreflang alternate(s) were found. Each alternate would point at an https URL and include a self reference.", fw: browser });
  addCase(cases, { id: "SEO-03", layer: "SEO", title: "A sitemap is advertised from the page or robots.txt", why: (sig.sitemap ? "The word sitemap appears in the HTML." : "No sitemap reference was seen in the HTML.") + " This review does not fetch a sitemap and does not treat a missing link as a ranking claim.", fw: browser });
  addCase(cases, { id: "PF-01", layer: "Performance", title: "The HTML document arrives inside a stated budget", why: "This read took " + home.ms + " ms and " + face.bytes + " bytes. That is one fetch, not a load test. A budget case would fail above 800 ms or 1.5 MB for the document alone. Lighthouse would score the rendered page later. It is not run here.", fw: browser.concat(LOAD_FW), also: named(["Lighthouse"]) });
  addCase(cases, { id: "PF-02", layer: "Performance", title: "Script and stylesheet counts stay inside a budget", why: face.scripts + " external scripts and " + face.styles + " stylesheets were referenced. The later case would record the counts and the render-blocking ones.", fw: browser.concat(LOAD_FW) });
  addCase(cases, { id: "PF-03", layer: "Performance", title: "The slowest page in this read stays inside the same budget", why: "The slowest saved response was " + (slow.path || home.url) + " at " + (slow.ms || 0) + " ms. The trend across the crawl is the order the pages were opened, not a history of previous days.", fw: browser.concat(LOAD_FW) });
  addCase(cases, { id: "LD-01", layer: "Load", title: "An authorised baseline could repeat the document fetch", why: "JMeter, Gatling, or k6 would need written permission, a verified domain, and a scheduled window. This review did not open a single virtual user. The baseline would be one request per second for a few minutes.", fw: LOAD_FW });
  addCase(cases, { id: "LD-02", layer: "Load", title: "A ramp would add users only inside an agreed ceiling", why: "The proposal is a short ramp, then a hold, then a stop. Error rate and response time would be the gates. No profile is generated by this review.", fw: LOAD_FW });
  addCase(cases, { id: "LD-03", layer: "Load", title: "A spike would last seconds, not an open-ended flood", why: "A spike case belongs on a staging host or a window the owner schedules. The public read here is still one document at a time.", fw: LOAD_FW });
  addCase(cases, { id: "MB-01", layer: "Mobile", title: "The layout holds at a phone width", why: "A viewport meta tag " + (sig.viewport ? "is present." : "was not found.") + " Appium or Maestro would open a phone profile later and compare the same h1 and primary link.", fw: browser.concat(MOBILE_FW) });
  addCase(cases, { id: "MB-02", layer: "Mobile", title: "The same primary path works in a tablet width", why: "Width, orientation, and a touch scroll would be checked in Appium, Maestro, or a browser device profile. This HTML read did not resize a window.", fw: browser.concat(MOBILE_FW) });
  addCase(cases, { id: "I18N-01", layer: "Internationalization", title: "The lang attribute matches the copy a person reads", why: (face.lang ? "Declared language: " + face.lang + "." : "No language was declared.") + " A bilingual page would need hreflang plus a visible language switch.", fw: browser });
  addCase(cases, { id: "I18N-02", layer: "Internationalization", title: "Direction and locale formats stay with the language", why: (sig.hreflang || 0) + " alternate language links were counted. Dates, currency, and layout direction would be asserted only for locales the site claims.", fw: browser });
  addCase(cases, { id: "RS-01", layer: "Resilience", title: "A missing path returns a deliberate not-found page", why: (failed.length ? "This read already saved a non-success status." : "This read did not save a 404.") + " A later case would request one unknown path and expect a branded not-found document, not a stack trace.", fw: browser });
  addCase(cases, { id: "RS-02", layer: "Resilience", title: "A slow document fails the case instead of hanging the suite", why: "This review stops a single page at " + Math.round(PAGE_TIMEOUT_MS / 1000) + " seconds. A suite would use its own timeout and a screenshot of the last frame.", fw: browser });
  addCase(cases, { id: "RS-03", layer: "Resilience", title: "A repeat visit can reuse a cache policy the response already states", why: (sig.cacheControl ? "cache-control is present." : "No cache-control header was seen on the first response.") + " The later case would record the header. It would not flush a shared cache.", fw: browser });
  addCase(cases, { id: "CMP-01", layer: "Compatibility", title: "The page still explains itself when scripts do not run", why: (sig.noscript ? "A noscript element is present." : "No noscript element was found.") + " The case would disable JavaScript and check that the title and the main heading remain.", fw: browser });
  addCase(cases, { id: "CMP-02", layer: "Compatibility", title: "The named stack is recorded with the case", why: "Markers seen in this read: " + stack + ". The case list is filtered by the frameworks you select. Those tools are not launched. A later cross-browser pass could use BrowserStack. It is not started here.", fw: browser, also: named(["BrowserStack"]) });
  if (sig.manifest) addCase(cases, { id: "CMP-03", layer: "Compatibility", title: "An advertised manifest still leaves the page readable in a normal tab", why: "A manifest link is present. The case would open the page in a browser tab and confirm the title and the main heading. It would not install the app.", fw: browser });
  if (sig.video) addCase(cases, { id: "MED-01", layer: "Media", title: "Video exposes captions or a transcript path", why: sig.video + " video element(s) were counted. A later case would check tracks and would not download the media file.", fw: browser });
  if (hasTech(names, /Google Tag Manager|Google Analytics|HubSpot/i)) addCase(cases, { id: "AN-01", layer: "Analytics", title: "Analytics tags wait for a recorded choice when the page asks for consent", why: "An analytics marker was seen (" + stack + "). The case would compare a cold load with a load after consent, and it would not invent a consent click.", fw: browser });
  if (hasTech(names, /Shopify|Magento|WooCommerce|Stripe/i)) {
    const commerceTools = [];
    if (hasTech(names, /Shopify/i)) commerceTools.push("Theme Check");
    if (hasTech(names, /Magento/i)) commerceTools.push("MFTF");
    addCase(cases, { id: "CM-01", layer: "Commerce", title: "A catalog or payment marker is covered without placing an order", why: "A commerce or payment marker was seen (" + stack + "). The case would open the public listing and stop before payment. No card data is entered." + (commerceTools.length ? " " + commerceTools.join(" and ") + " would inspect the theme or the Magento suite later. Neither is launched here." : ""), fw: browser, also: commerceTools });
  }
  addCase(cases, { id: "VIS-01", layer: "Visual", title: "Images reserve their box before they paint", why: (sig.imgNoSize || 0) + " images had neither width nor height in the markup." + (named(["Applitools", "Percy"]).length ? " Applitools or Percy would own a later visual diff." : "") + " This review did not take a screenshot.", fw: browser, also: named(["Applitools", "Percy"]) });
  addCase(cases, { id: "VIS-02", layer: "Visual", title: "The first view stays inside the width the viewport asks for", why: (sig.viewport ? "A viewport meta tag is present." : "No viewport meta tag was found.") + " The later case would open that width and look for a horizontal scroll on the main content.", fw: browser, also: named(["Applitools", "Percy"]) });
  if (sig.robotsMeta) addCase(cases, { id: "SEO-04", layer: "SEO", title: "A robots meta tag matches the pages that should be indexed", why: "A robots meta tag is present. The later case would compare it with the canonical URL. This review does not submit the page to a search engine.", fw: browser });
  if (hasTech(names, /^Salesforce$/)) {
    addCase(cases, { id: "PLAT-01", layer: "Platform", title: "The public Salesforce path stays available without an org login", why: "Salesforce markers were seen (" + stack + "). Provar and Copado know Lightning, Visualforce, and Experience Cloud. This review did not open an org and did not sign in.", fw: browser, also: named(["Provar", "Copado"]) });
    addCase(cases, { id: "PLAT-02", layer: "Platform", title: "Salesforce controls expose a name Provar can store", why: "A later Provar or Copado case would read the accessible name of each public control. This HTML read did not click one.", fw: browser, also: named(["Provar", "Copado"]) });
  }
  if (hasTech(names, /^SAP$/)) addCase(cases, { id: "PLAT-03", layer: "Platform", title: "A public SAP page is named for Tosca, not exercised here", why: "SAP UI markers were seen (" + stack + "). Tricentis Tosca is the suite that scans SAP screens. This review did not sign in and did not start Tosca.", fw: browser, also: ["Tricentis Tosca"] });
  if (hasTech(names, /^ServiceNow$/)) addCase(cases, { id: "PLAT-04", layer: "Platform", title: "A public ServiceNow portal is separate from the instance test framework", why: "ServiceNow markers were seen (" + stack + "). ServiceNow ATF runs inside the instance the owner controls. This review only read the public page and did not sign in.", fw: browser, also: ["ServiceNow ATF"] });
  if (sig.apiHint) addCase(cases, { id: "API-01", layer: "API", title: "A public API description is listed without calling the API", why: "The HTML mentions an API description. Postman could hold that collection later. This review did not send an API request.", fw: browser, also: ["Postman"] });
  pages.slice(1, 8).forEach((page, index) => {
    addCase(cases, {
      id: "FN-" + String(20 + index),
      layer: "Functional",
      title: "Discovered page answers: " + page.path,
      why: "Status " + (page.status || page.error || "unread") + " in " + (page.ms || 0) + " ms. Title: " + (page.title || "none") + ". The path stays on the same host and is not clicked beyond the read.",
      fw: browser
    });
  });
  return cases.map((item, index) => Object.assign({ n: index + 1 }, item));
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
  if (/Traceback \(most recent call last\)|SQLSTATE\[|Fatal error:/.test(body)) push("Leak", "An error trace is in the public HTML", "The page " + path + " shows an error trace. A trace can name internal paths. This read did not follow it.");
  if (!headers.hsts) push("Exposure", "HSTS is absent", "The first response did not send strict-transport-security. A later visit can still be steered to plain http. This is a missing control. It is not proof that someone broke in.");
  if (!headers.csp) push("Exposure", "A content security policy is absent", "The first response did not send content-security-policy. Script sources are not limited by that header. This is a missing control. It is not proof of an intrusion.");
  const loose = ((inspect && inspect.cookies) || []).filter((cookie) => !cookie.secure || !cookie.httpOnly);
  if (loose.length) push("Exposure", "A cookie is missing Secure or HttpOnly", loose.length + " cookies on the first response lack Secure or HttpOnly. A session cookie in that state can be read by script or sent on plain http. This read did not use the cookie.");
  const mixed = inspect && inspect.signals && inspect.signals.mixed;
  if (mixed) push("Exposure", "The HTML names plain http resources", mixed + " http:// references were counted in the markup. A browser would warn on some of them. Those URLs were not downloaded here.");
  return alerts;
}

function mentionTone(text) {
  const value = String(text || "").toLowerCase();
  if (/breach|hack|ransomware|stolen|leak|lawsuit|outage|vulnerab|intrusion/.test(value)) return "Unfavorable";
  if (/award|launch|growth|funding|partnership|opens|named/.test(value)) return "Favorable";
  return "Mention";
}

function parseMentions(html, hostname) {
  const mentions = [];
  const seen = new Set();
  const block = String(html || "").slice(0, 250000);
  const links = block.match(/<a\b[^>]*class="result__a"[^>]*>[\s\S]*?<\/a>/gi) || [];
  links.forEach((anchor) => {
    if (mentions.length >= 4) return;
    const hrefMatch = anchor.match(/href="([^"]+)"/i);
    const title = anchor.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    if (!hrefMatch || !title) return;
    let href = hrefMatch[1];
    const wrapped = href.match(/[?&]uddg=([^&]+)/);
    if (wrapped) {
      try { href = decodeURIComponent(wrapped[1]); } catch (error) { href = ""; }
    }
    let host = "";
    try { host = new URL(href).hostname.replace(/^www\./, ""); } catch (error) { host = ""; }
    if (!host || host === hostname || seen.has(href)) return;
    seen.add(href);
    mentions.push({ title: title.slice(0, 180), href, tone: mentionTone(title) });
  });
  return mentions;
}

function lookupMentions(hostname) {
  return new Promise((resolve) => {
    const req = https.request({
      hostname: "html.duckduckgo.com",
      path: "/html/?q=" + encodeURIComponent('"' + hostname + '"'),
      method: "GET",
      headers: { "user-agent": USER_AGENT, accept: "text/html" },
      timeout: 6000
    }, (res) => {
      const chunks = [];
      res.on("data", (chunk) => { if (chunks.join("").length < 300000) chunks.push(chunk); });
      res.on("end", () => {
        try { resolve(parseMentions(Buffer.concat(chunks).toString("utf8"), hostname)); }
        catch (error) { resolve([]); }
      });
    });
    req.on("error", () => resolve([]));
    req.on("timeout", () => { req.destroy(); resolve([]); });
    req.end();
  });
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
  const deadline = Date.now() + budgetMs(chosen.pages);
  note("Checking that the address is public https.");
  let first;
  try {
    note("Opening the first page.");
    first = await fetchPublic(rawUrl, halt, note);
  } catch (error) {
    if (error && error.code === "STOPPED") {
      note("Stopped before the first page finished.");
      return stoppedReport(rawUrl, lines, null, chosen);
    }
    throw error;
  }
  const type = header(first.headers, "content-type");
  if (first.status >= 400) {
    const error = new Error("The URL returned status " + first.status + ".");
    error.status = 422;
    throw error;
  }
  if (!/text\/html|application\/xhtml\+xml/i.test(type) && !/<html[\s>]/i.test(first.body)) {
    const error = new Error("The URL did not return an HTML page.");
    error.status = 422;
    throw error;
  }
  const origin = new URL(first.url);
  const mentionsPromise = lookupMentions(origin.hostname);
  let robots = [];
  let robotsNote = "robots.txt was not read.";
  let stopped = halt();
  try {
    if (!stopped) {
      note("Reading robots.txt.");
      const robotsUrl = origin.origin + "/robots.txt";
      const robotsRes = await fetchPublic(robotsUrl, halt, note);
    if (robotsRes.status === 200) {
      robots = parseRobots(robotsRes.body);
      robotsNote = "robots.txt was read (" + robots.length + " rules). Linked pages that disallow this agent are skipped.";
    } else robotsNote = "robots.txt returned status " + robotsRes.status + ". Linked pages stay inside the page cap.";
    }
  } catch (error) {
    if (error && error.code === "STOPPED") stopped = true;
    else robotsNote = "robots.txt could not be read. Linked pages were still capped.";
  }
  const homeInspect = inspect(first.body, first.headers, first.url);
  const pages = [{
    url: first.url,
    path: pagePath(first.url),
    status: first.status,
    ms: first.ms,
    bytes: homeInspect.bytes,
    title: homeInspect.title,
    depth: 0,
    inspect: homeInspect,
    html: first.body
  }];
  const seen = new Set([first.url]);
  let robotsBlocked = 0;
  let cursor = 0;
  note("First page answered " + first.status + " in " + first.ms + " ms. Title: " + (homeInspect.title || "none") + ". " + homeInspect.bytes + " bytes.");
  note(robotsNote);
  const linkCount = (homeInspect.links || []).length;
  note(linkCount + " same-host links were listed. This read opens at most " + chosen.pages + " HTML pages and " + chosen.depth + " links deep.");
  if (!linkCount) note("No further pages to open on this host. The case list comes next.");
  while (!stopped && cursor < pages.length && pages.length < chosen.pages && Date.now() < deadline) {
    const page = pages[cursor];
    cursor += 1;
    if (page.depth >= chosen.depth) continue;
    const queue = (page.inspect && page.inspect.links) || [];
    for (let i = 0; i < queue.length && pages.length < chosen.pages && Date.now() < deadline; i += 1) {
      if (halt()) { stopped = true; break; }
      const next = queue[i];
      if (seen.has(next)) continue;
      seen.add(next);
      const path = pagePath(next);
      if (robots.length && !robotsAllows(path, robots)) {
        robotsBlocked += 1;
        continue;
      }
      try {
        note("Opening " + path + ".");
        const child = await fetchPublic(next, halt, note);
        const childType = header(child.headers, "content-type");
        if (!/text\/html|application\/xhtml\+xml/i.test(childType)) continue;
        const childInspect = inspect(child.body, child.headers, child.url);
        pages.push({
          url: child.url,
          path: pagePath(child.url),
          status: child.status,
          ms: child.ms,
          bytes: childInspect.bytes,
          title: childInspect.title,
          depth: page.depth + 1,
          inspect: childInspect,
          html: ""
        });
      } catch (error) {
        if (error && error.code === "STOPPED") { stopped = true; break; }
        pages.push({
          url: next,
          path: path,
          status: 0,
          ms: 0,
          bytes: 0,
          title: "",
          depth: page.depth + 1,
          error: clean(error.message, 160),
          inspect: null,
          html: ""
        });
      }
    }
  }
  if (stopped) note("Stopped. The report keeps the " + pages.length + " page" + (pages.length === 1 ? "" : "s") + " read before the stop.");
  else if (pages.length < chosen.pages && Date.now() >= deadline) note("The time budget ended with " + pages.length + " page" + (pages.length === 1 ? "" : "s") + " saved. This read was capped at " + chosen.pages + ".");
  else note("Read " + pages.length + " page" + (pages.length === 1 ? "" : "s") + ". Writing the proposed cases now.");
  const techMap = new Map();
  pages.forEach((page) => {
    ((page.inspect && page.inspect.technologies) || []).forEach((item) => {
      techMap.set(item.group + ":" + item.name, item);
    });
  });
  const technologiesFound = [...techMap.values()];
  const cases = propose(pages, robotsBlocked, { maxPages: chosen.pages, maxDepth: chosen.depth });
  const tools = toolsForPage(homeInspect, (homeInspect && homeInspect.signals) || {}, technologiesFound.map((item) => item.name));
  const byLayer = {};
  cases.forEach((item) => { byLayer[item.layer] = (byLayer[item.layer] || 0) + 1; });
  const reportId = crypto.randomBytes(9).toString("hex");
  const fetchedAt = new Date().toISOString();
  const signature = signReport({ id: reportId, fetchedAt, host: origin.hostname, cases });
  const alerts = buildAlerts(first.body, homeInspect, pagePath(first.url));
  let mentions = [];
  try { mentions = await mentionsPromise; } catch (error) { mentions = []; }
  note(mentions.length ? mentions.length + " public write-ups were listed for this host." : "No public write-up was retrieved on this pass.");
  note(alerts.length ? alerts.length + " public signals were listed. The tail of each one stays closed until that section is paid." : "No leak or missing control of the kinds this read watches was seen on the first page.");
  note(tools.length ? "Tools that apply: " + tools.map((item) => item.name).join(", ") + ". None of them are launched." : "None of axe-core, Lighthouse, k6, BrowserStack, Applitools, Percy, Provar, or Copado apply to this page.");
  const publishedPages = pages.map((page) => ({
    url: page.url,
    path: page.path,
    status: page.status,
    ms: page.ms,
    bytes: page.bytes,
    title: page.title,
    depth: page.depth,
    error: page.error || ""
  }));
  return {
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
      timedOut: Date.now() >= deadline
    },
    pages: publishedPages,
    technologies: technologiesFound,
    cases,
    tools,
    alerts,
    mentions,
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
      ? "This review was stopped. The cases below use only the pages read before the stop. None of them were executed."
      : "These cases are proposed from a public read. None of them were executed."
  };
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
    termsVersion: TERMS_VERSION,
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
    followUp: value.followUp === true,
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
    const error = new Error("Choose at least one framework.");
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
    reference: String(unit.custom_id || "").replace(/[^a-f0-9]/g, "").slice(0, 16),
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

module.exports = {
  TERMS_VERSION,
  PRICE_USD,
  PRICE_PER_FRAMEWORK,
  centsForIndex,
  scheduleCents,
  priceFor,
  priceForLayers,
  priceForScope,
  priceForRun,
  priceForCredentials,
  priceForAlerts,
  normalizeFrameworks,
  normalizeLayers,
  normalizeScope,
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
  preformatUrl,
  validateIntake,
  screenIntake,
  emailCanReceive,
  mailboxMatchesHost,
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
  toolsForPage,
  intakeRecord,
  analyzeHtml: inspect,
  ipBlocked,
  hostBlocked
};
