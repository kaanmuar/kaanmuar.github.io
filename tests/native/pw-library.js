const path = require('path');
require('../../scripts/playwright-sandbox');
const { chromium, firefox, webkit } = require('playwright');
const { ensureServer, BASE } = require('./server');

const CHECKS = path.join(__dirname, '..', '..', 'js', 'catalog-checks.js');

function prime() {
  sessionStorage.setItem('hasSeenTour', 'true');
  sessionStorage.setItem('hasSeenStudioTour', 'true');
  sessionStorage.setItem('hasSeenLabTour', 'true');
  localStorage.setItem('qa-lab-fw-asked', '1');
  localStorage.setItem('theme', 'light');
}

function ready() {
  return document.readyState === 'complete' && (!!window.CarlosMunozCV || !!document.getElementById('login-overlay') || !!document.getElementById('runBtn') || !!document.querySelector('h1'));
}

async function launch() {
  await ensureServer();
  const name = process.env.PW_BROWSER || 'chromium';
  const type = name === 'firefox' ? firefox : (name === 'webkit' ? webkit : chromium);
  const options = { headless: true };
  if (type === chromium && process.env.PW_CHANNEL) options.channel = process.env.PW_CHANNEL;
  return type.launch(options);
}

async function openPage(browser, file, phone) {
  const context = await browser.newContext({
    locale: 'en-US',
    viewport: phone ? { width: 390, height: 844 } : { width: 1280, height: 800 }
  });
  const page = await context.newPage();
  await page.goto(BASE + '/' + file);
  await page.evaluate(prime);
  await page.reload();
  return { context, page };
}

async function runCheckOn(page, id) {
  await page.waitForFunction(ready, null, { timeout: 15000 });
  await page.addScriptTag({ path: CHECKS });
  return String(await page.evaluate(async (caseId) => {
    const check = window.CatalogChecks && window.CatalogChecks[caseId];
    if (!check) return 'FAIL: missing ' + caseId;
    try { return String(await check() || 'ok'); } catch (err) { return 'FAIL: ' + (err && err.message ? err.message : err); }
  }, id));
}

async function runCheck(browser, row) {
  const { context, page } = await openPage(browser, row.path, row.phone);
  try {
    return await runCheckOn(page, row.id);
  } finally {
    await context.close();
  }
}

function failure(message) {
  return String(message).indexOf('FAIL:') === 0 ? String(message).slice(5).trim() : '';
}

module.exports = { launch, openPage, runCheckOn, runCheck, failure, prime, ready, BASE };
