const fs = require('fs');
const path = require('path');
const { test, expect } = require('@playwright/test');

// script-src has no 'unsafe-inline': an inline script without its hash (scripts/build-csp-hashes.js), an inline
// event handler or a javascript: URL is refused, and the page silently loses that behaviour.
const ROOT = path.join(__dirname, '..');
const PAGES = fs.readdirSync(ROOT).filter((name) => name.endsWith('.html')).concat(['social/runs-3/77-fiba-pt.html']);

async function watch(page, init) {
  await page.addInitScript(() => {
    window.__csp = [];
    document.addEventListener('securitypolicyviolation', (e) => window.__csp.push(`${e.violatedDirective} ${e.blockedURI} ${e.sourceFile || ''}:${e.lineNumber}`));
  });
  if (init) await page.addInitScript(init);
  const logged = [];
  page.on('console', (m) => { if (/Content Security Policy/.test(m.text())) logged.push(m.text().slice(0, 400)); });
  return async () => (await page.evaluate(() => window.__csp)).concat(logged);
}

test.describe('Content-Security-Policy', () => {
  for (const file of PAGES) {
    test(`${file} runs its scripts without a CSP violation`, async ({ page }) => {
      const violations = await watch(page, () => { sessionStorage.setItem('hasSeenTour', 'true'); sessionStorage.setItem('hasSeenStudioTour', 'true'); sessionStorage.setItem('hasSeenLabTour', 'true'); });
      await page.goto('/' + file, { waitUntil: 'load' });
      await page.waitForTimeout(1500);
      expect(await violations()).toEqual([]);
      expect(await page.evaluate(() => [...document.querySelectorAll('link[data-async-css]')].filter((l) => l.media !== 'all').length)).toBe(0);
    });
  }

  test('Google Translate runs under the CSP (its srcdoc frame script hash is current)', async ({ page }) => {
    test.setTimeout(60000);
    const violations = await watch(page, () => { localStorage.setItem('site-analytics', 'allow'); sessionStorage.setItem('hasSeenTour', 'true'); });
    await page.goto('/index.html?lang=ja', { waitUntil: 'load' });
    const loaded = await page.waitForFunction(() => document.documentElement.classList.contains('translated-ltr'), null, { timeout: 30000 }).then(() => true, () => false);
    const script = (await violations()).filter((v) => /script-src/.test(v));
    expect(script, "Google changed its inline script: copy the sha256 from Chrome's message into TRANSLATE in scripts/build-csp-hashes.js and scripts/csp_hashes.py, then run node scripts/build-csp-hashes.js").toEqual([]);
    test.skip(!loaded, 'translate.google.com did not answer');
  });
});
