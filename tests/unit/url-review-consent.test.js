/**
 * Cookie banners and consent: which banner the browser pass names, the log line it writes,
 * and how Consent Mode defaults and cookieless pings are reported.
 *
 *   npm run test:review
 */
const test = require("node:test");
const assert = require("node:assert/strict");

const core = require("../../functions/url-review-core");
const insights = require("../../functions/url-review-insights");
const browser = require("../../functions/url-review-browser");

const URL_ = "https://www.example.org/";
const HEADERS = { "content-type": "text/html" };
const GTM = "<script src=\"https://www.googletagmanager.com/gtm.js?id=GTM-M7H54VD\"></script>";
const EU_COOKIE = "<script src=\"/modules/contrib/eu_cookie_compliance/js/eu_cookie_compliance.min.js?v=10\"></script>";

// A node as findBanner sees it: its box, its computed style, its text, and the buttons inside it.
function node(tag, { rect = [0, 0, 0, 0], css = {}, text = "", buttons = [] } = {}) {
  const attrs = {};
  return {
    tagName: tag,
    innerText: text,
    css: Object.assign({ display: "block", visibility: "visible", opacity: "1", position: "static" }, css),
    getBoundingClientRect: () => ({ x: rect[0], y: rect[1], width: rect[2], height: rect[3] }),
    getAttribute: (name) => (name in attrs ? attrs[name] : null),
    setAttribute: (name, value) => { attrs[name] = value; },
    querySelectorAll: (selector) => (selector === "*" ? [] : buttons),
    attrs
  };
}

// Runs findBanner's page function against a page whose selectors answer from `nodes`; the generic banner search gets `generic`.
async function bannerOn(nodes, generic = []) {
  const saved = { document: global.document, getComputedStyle: global.getComputedStyle };
  global.document = { querySelectorAll: (selector) => nodes[selector] || (/\[role=alertdialog\]/.test(selector) ? generic : []) };
  global.getComputedStyle = (target) => target.css;
  try {
    return await browser.findBanner({ evaluate: (fn, ...args) => fn(...args) });
  } finally {
    Object.assign(global, saved);
  }
}

const browsed = (consent) => ({ ok: true, start: { status: 200, finalPath: "/", requests: 40, vitals: { lcp: 1200, cls: 0, tbt: 0 } }, consent });
const review = (html, browser) => insights.analyze({ pages: [{ url: URL_, path: "/", status: 200, ms: 120, depth: 0, inspect: core.analyzeHtml(html, HEADERS, URL_) }], browser });
const finding = (result, key) => result.findings.find((item) => item.key === key) || {};

test("gavi.org's EU Cookie Compliance banner is named even though a hidden node matches its selector first", async () => {
  const reject = node("BUTTON", { rect: [909, 697, 203, 34], text: "ACCEPT ONLY NECESSARY" });
  const banner = await bannerOn({
    "#sliding-popup, .eu-cookie-compliance-banner": [
      node("DIV", { css: { display: "none", position: "fixed" } }),
      node("DIV", { rect: [0, 621, 1280, 179], css: { position: "fixed" }, buttons: [reject] }),
      node("DIV", { rect: [0, 621, 1280, 179], css: { position: "relative" } })
    ],
    "#sliding-popup .decline-button, #sliding-popup .eu-cookie-compliance-reject-button, #sliding-popup .eu-cookie-compliance-accept-only-neccesary-button": [
      node("BUTTON", { css: { display: "none" }, text: "Decline" }),
      reject
    ]
  });
  assert.deepEqual(banner, { found: true, name: "EU Cookie Compliance", rejectLabel: "ACCEPT ONLY NECESSARY", clicked: false });
  assert.equal(reject.attrs["data-qa-reject"], "1");
});

test("a banner no known tool matches has no name, and the log says it found a cookie banner", async () => {
  const reject = node("BUTTON", { rect: [10, 700, 120, 30], text: "Reject all" });
  const box = node("DIV", { rect: [0, 600, 1280, 200], css: { position: "fixed" }, text: "We use cookies to measure visits. Reject all", buttons: [reject] });
  const banner = await bannerOn({}, [box]);
  assert.deepEqual(banner, { found: true, name: "", rejectLabel: "Reject all", clicked: false });
  const cookies = [{ name: "_ga", tracking: true }, { name: "cookie-agreed", tracking: false }];
  assert.equal(browser.bannerSay(banner, cookies), "Found a cookie banner with a \"Reject all\" button. 2 cookies were set before any choice, 1 of them for tracking.");
  assert.equal(browser.bannerSay({ found: true, name: "OneTrust", rejectLabel: "" }, cookies.slice(1)), "Found the OneTrust cookie banner with no reject button. 1 cookie was set before any choice, none of them for tracking.");
  assert.equal(browser.bannerSay({ found: false, name: "", rejectLabel: "" }, []), "No cookie banner was found. 0 cookies were set on the first visit.");
  assert.deepEqual(await bannerOn({}, []), { found: false, name: "", rejectLabel: "", clicked: false });
});

test("Consent Mode defaults set at runtime are not reported as missing when Google pings came with Consent Mode denied", () => {
  const consent = {
    banner: "EU Cookie Compliance",
    rejectLabel: "ACCEPT ONLY NECESSARY",
    rejected: false,
    before: {
      vendors: [
        { name: "Google Tag Manager", loads: 1, hits: 0, denied: 0, signals: [] },
        { name: "Google Analytics", loads: 0, hits: 0, denied: 1, signals: ["G100"] },
        { name: "Google Ads", loads: 0, hits: 0, denied: 1, signals: ["G100"] }
      ],
      cookies: [],
      cookieCount: 3
    },
    after: null
  };
  const result = review(GTM + EU_COOKIE, browsed(consent));
  const mode = finding(result, "an-consent-mode");
  assert.equal(mode.title, "Consent Mode defaults are set when the page runs, not in the HTML");
  assert.equal(mode.verdict, "pass");
  assert.match(mode.evidence, /Google Analytics, Google Ads sent pings with Consent Mode denied, so EU Cookie Compliance or Tag Manager sets the defaults at runtime/);
  assert.equal(finding(result, "an-firing").title, "No tracking cookie before a choice, only cookieless pings");
  assert.equal(finding(result, "an-firing").verdict, "pass");

  const quiet = review(GTM + EU_COOKIE, browsed(Object.assign({}, consent, { before: { vendors: [consent.before.vendors[0]], cookies: [], cookieCount: 0 } })));
  assert.equal(finding(quiet, "an-consent-mode").title, "EU Cookie Compliance is present but Google Consent Mode defaults were not found");
  assert.match(finding(quiet, "an-consent-mode").evidence, /the browser run saw no Google ping with Consent Mode denied/);
  assert.match(finding(review(GTM + EU_COOKIE), "an-consent-mode").evidence, /may still set one when the page runs/);
});

test("Consent Mode defaults scoped to regions are read as denied there, not as granting analytics everywhere", () => {
  const gitlab = GTM + "<script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments)}" +
    "gtag('consent','default',{'analytics_storage':'granted','ad_storage':'granted','ad_user_data':'granted','ad_personalization':'granted'});" +
    "gtag('consent','default',{'analytics_storage':'denied','ad_storage':'denied','ad_user_data':'denied','ad_personalization':'denied','region':['AT','BE','GB','CO','KR','ca-qc'],'wait_for_update':500});</script>";
  assert.deepEqual(core.analyzeHtml(gitlab, HEADERS, URL_).analytics.consentMode, { analytics: "granted", v2: true, regions: ["AT", "BE", "GB", "CO", "KR", "CA-QC"] });
  const mode = finding(review(gitlab), "an-consent-mode");
  assert.equal(mode.title, "Consent Mode v2 starts in denied in 6 listed regions");
  assert.equal(mode.verdict, "pass");
  assert.equal(mode.evidence, "gtag consent default sets analytics_storage to denied for AT, BE, GB, CO, KR, CA-QC, and to granted elsewhere. The denied default includes ad_user_data and ad_personalization.");

  const granted = GTM + "<script>gtag('consent','default',{analytics_storage:'granted'});gtag('consent','default',{analytics_storage:'granted',region:['US']});</script>";
  assert.deepEqual(core.analyzeHtml(granted, HEADERS, URL_).analytics.consentMode, { analytics: "granted", v2: false });
  assert.equal(finding(review(granted), "an-consent-mode").title, "Consent Mode default grants analytics before a choice");

  const denied = GTM + "<script>gtag('consent', 'default', {analytics_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied'});</script>";
  assert.deepEqual(core.analyzeHtml(denied, HEADERS, URL_).analytics.consentMode, { analytics: "denied", v2: true });
  assert.equal(finding(review(denied), "an-consent-mode").title, "Consent Mode v2 starts in denied");
  assert.equal(finding(review(denied), "an-consent-mode").evidence, "gtag consent default sets analytics_storage to denied and includes ad_user_data and ad_personalization.");
});
