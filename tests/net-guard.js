const fs = require('fs');
const path = require('path');
const { test: base, expect } = require('@playwright/test');

const ROOT = path.join(__dirname, '..');
const LOOPBACK = ['127.0.0.1', 'localhost', '[::1]'];
const CORS = { 'access-control-allow-origin': '*' };
const FLAG_SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><circle cx="256" cy="256" r="256" fill="#d9d9d9"/></svg>';
const json = (body, status = 200) => ({ status, contentType: 'application/json', headers: CORS, body: JSON.stringify(body) });

// Names the real resolver answers NXDOMAIN for in the specs: reserved TLDs and made-up example.* subdomains.
const NO_SUCH_HOST = /(\.(example|test|invalid|localhost)|\.example\.(com|net|org))\.?$/;

function dns(url) {
  const name = new URL(url).searchParams.get('name') || '';
  if (NO_SUCH_HOST.test(name)) return json({ Status: 3 });
  return json({ Status: 0, Answer: [{ name: name + '.', type: 1, TTL: 300, data: '192.0.2.1' }] });
}

function live(url) {
  const file = path.join(ROOT, decodeURIComponent(new URL(url).pathname));
  if (file.startsWith(ROOT + path.sep) && fs.existsSync(file) && fs.statSync(file).isFile()) return { path: file };
  return { status: 404, body: '' };
}

// Answered here instead of the network: [pattern, reply].
const STUBS = [
  // Google Fonts: an empty stylesheet, so text falls back to the system fonts and no font file is asked for.
  [/^https:\/\/fonts\.googleapis\.com\//, () => ({ contentType: 'text/css', headers: CORS, body: '' })],
  [/^https:\/\/fonts\.gstatic\.com\//, () => ({ status: 204, headers: CORS })],
  // The language picker's circle-flags: one plain disc for every flag.
  [/^https:\/\/hatscripts\.github\.io\/circle-flags\//, () => ({ contentType: 'image/svg+xml', headers: CORS, body: FLAG_SVG })],
  // Analytics beacons: never send test traffic to Google Analytics.
  [/^https:\/\/(www\.google-analytics\.com|www\.google\.com)\/g\/collect/, () => ({ status: 204, headers: CORS })],
  [/^https:\/\/www\.googletagmanager\.com\/(a|td)\b/, () => ({ status: 204, headers: CORS })],
  [/^https:\/\/www\.googletagmanager\.com\/gtag\/js/, () => ({ contentType: 'text/javascript', body: '' })],
  [/^https:\/\/telegram\.org\//, () => ({ contentType: 'text/javascript', body: '' })],
  // Visitor country: unknown, as prime() in qa-review-top.spec.js answers.
  [/^https:\/\/ipwho\.is\//, () => json({ success: false })],
  [/^https:\/\/dns\.google\/resolve/, dns],
  // axe-core, which the catalog and lab pages load from jsDelivr: the copy in node_modules.
  [/^https:\/\/cdn\.jsdelivr\.net\/npm\/axe-core@[\d.]+\/axe\.min\.js$/, () => ({ path: require.resolve('axe-core/axe.min.js'), contentType: 'text/javascript', headers: CORS })],
  // Firebase Auth refuses every sign-in, so no test signs in to the real project.
  [/^https:\/\/(identitytoolkit|securetoken)\.googleapis\.com\//, () => json({ error: { code: 400, message: 'INVALID_LOGIN_CREDENTIALS' } }, 400)],
  [/^https:\/\/[^/]+\.cloudfunctions\.net\//, () => json({ error: 'offline in tests' }, 503)],
  // The live site is this checkout.
  [/^https:\/\/carlosandmunoz\.com\//, live]
];

// Reached over the real network: [pattern, reason, spec files it is limited to (all when absent)].
const ALLOW = [
  [/^https:\/\/www\.gstatic\.com\/firebasejs\//, 'Pinned Firebase SDK modules the pages import from Google; there is no local copy.'],
  [/^https:\/\/cdnjs\.cloudflare\.com\/ajax\/libs\/(font-awesome|jspdf|html2canvas)\//, 'Pinned Font Awesome, jsPDF and html2canvas; the icons and the PDF and JPG exports need them and there is no local copy.'],
  [/^https:\/\/challenges\.cloudflare\.com\//, 'Turnstile with the always-pass test sitekey; the guarded forms wait for its token.'],
  [/^https:\/\/www\.googletagmanager\.com\/gtag\/js/, 'The CSP test counts the hits the real gtag.js sends (its collect calls are routed there).', ['cv.spec.js']],
  [/^https:\/\/(translate\.google\.com|translate(-pa)?\.googleapis\.com|www\.gstatic\.com\/(_\/translate_http|images\/branding)|www\.google\.com\/images\/cleardot)/, 'The Google Translate CSP test needs the real widget and skips when Google does not answer.', ['csp.spec.js']]
];

function local(url, origin) {
  const u = new URL(url);
  return u.origin === origin || LOOPBACK.includes(u.hostname);
}

async function guard(context, origin, spec, blocked) {
  const allowed = ALLOW.filter(([, , specs]) => !specs || specs.includes(spec)).map(([pattern]) => pattern);
  // Only outside addresses come through here, so the test server's own requests keep their timing.
  await context.route((u) => /^https?:$/.test(u.protocol) && !local(u.href, origin), (route) => {
    const request = route.request();
    const url = request.url();
    if (allowed.some((pattern) => pattern.test(url))) return route.fallback();
    const stub = STUBS.find(([pattern]) => pattern.test(url));
    if (stub) return route.fulfill(stub[1](url));
    // Images in the content under test (news cards, report screenshots) come from any host: they fail to load.
    if (request.resourceType() === 'image') return route.fulfill({ status: 404, body: '' });
    // A link a test follows or opens in a new tab (a company's site, a profile): a blank page at that address.
    if (request.resourceType() === 'document') return route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>' + new URL(url).hostname + '</title>' });
    blocked.push(url);
    return route.abort('blockedbyclient');
  });
}

// Every test runs offline apart from the test server, loopback mocks and ALLOW (#2995). Any other
// request is aborted and fails the test, so a new third-party dependency shows up here first.
// Routes a spec adds on its page, or later on its context, run before this one.
const test = base.extend({
  _netGuard: [async ({ browser, context, baseURL }, use, testInfo) => {
    const origin = new URL(baseURL).origin;
    const spec = path.basename(testInfo.file);
    const blocked = [];
    await guard(context, origin, spec, blocked);
    const open = browser.newContext;
    browser.newContext = async function (...args) {
      const extra = await open.apply(this, args);
      await guard(extra, origin, spec, blocked);
      return extra;
    };
    try {
      await use();
    } finally {
      delete browser.newContext;
    }
    expect([...new Set(blocked)], 'requests to hosts outside STUBS and ALLOW in tests/net-guard.js').toEqual([]);
  }, { auto: true }]
});

module.exports = { test, expect };
