const { test, expect } = require('@playwright/test');

const TERMS = require('fs').readFileSync(require('path').join(__dirname, '../js/qa-review.js'), 'utf8').match(/TERMS_VERSION = "([^"]+)"/)[1];

async function prime(page, lang) {
  await page.addInitScript(([version, code]) => {
    Object.defineProperty(navigator, 'webdriver', { get: () => false });
    window.addEventListener('site-lang-applied', () => { window.langApplied = true; });
    try {
      sessionStorage.setItem('qa-review-terms', version);
      localStorage.setItem('hasSeenReviewTour', 'true');
      localStorage.setItem('qa-review-analytics', 'necessary');
      if (code) localStorage.setItem('cv-preferred-lang', code);
    } catch (e) { /* storage is optional */ }
  }, [TERMS, lang]);
  await page.route(/\/news\?/, (route) => route.fulfill({ contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: '{"items":[]}' }));
  await page.route(/ipwho\.is/, (route) => route.fulfill({ contentType: 'application/json', body: '{"success":false}' }));
}

test.describe('Review page language', () => {
  test('a Spanish visitor on the English page is sent to the Spanish page with the link intact', async ({ page }) => {
    await prime(page, 'es');
    await page.goto('/qa-review.html?live=abc#top');
    await expect(page).toHaveURL(/\/qa-review-es\.html\?live=abc#top$/);
    await expect(page.locator('html')).toHaveAttribute('lang', 'es');
  });

  test('an English choice stays on the English page', async ({ page }) => {
    await prime(page, 'en');
    await page.goto('/qa-review.html');
    await page.waitForFunction(() => window.langApplied);
    await expect(page.locator('#langFlag')).toHaveAttribute('alt', /English/);
    await expect(page).toHaveURL(/\/qa-review\.html$/);
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  });

  test('an English link to the Spanish page keeps it in Spanish, live chip included', async ({ page }) => {
    await prime(page, 'en');
    await page.goto('/qa-review-es.html?lang=en');
    await page.waitForFunction(() => window.langApplied);
    await expect(page.locator('#langFlag')).toHaveAttribute('alt', /Spanish|Español/);
    await expect(page).toHaveURL(/\/qa-review-es\.html\?lang=en$/);
    await expect(page.locator('html')).toHaveAttribute('lang', 'es');
    await expect(page.locator('#live-open-gate')).toContainText('Explorar');
  });

  test.describe('with a Spanish browser and no saved choice', () => {
    test.use({ locale: 'es-ES' });

    test('the English gate is never shown half in Spanish: the visitor lands on the Spanish page', async ({ page }) => {
      await prime(page, null);
      await page.goto('/qa-review.html');
      await expect(page).toHaveURL(/\/qa-review-es\.html$/);
      await expect(page.locator('#gate-title')).toHaveText('Antes de analizar una sola dirección.');
      await expect(page.locator('#langFlagGate')).toHaveAttribute('alt', 'Español');
      await expect(page.locator('#live-open-gate')).toContainText('Explorar');
    });
  });

  test('a review asked in Spanish is paid for on the Spanish payment page', async ({ page }) => {
    await prime(page, 'es');
    await page.route('http://127.0.0.1:8768/**', (route) => route.fulfill({ status: 503, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: '{"error":"down"}' }));
    await page.goto('/qa-review-es.html');
    await expect(page.locator('#go-pay')).toHaveAttribute('href', /^qa-review-pay-es\.html\?purpose=new-run/);
    await page.goto('/qa-review-pay.html?purpose=new-run&frameworks=Playwright');
    await expect(page).toHaveURL(/\/qa-review-pay-es\.html\?purpose=new-run&frameworks=Playwright$/);
    await expect(page.locator('html')).toHaveAttribute('lang', 'es');
    await expect(page.locator('#pay-heading')).toHaveText('Una revisión nueva');
    await expect(page.locator('#pay-copy')).toContainText('Esta revisión cuesta 19 USD. La tarifa de 19 USD se aplica a 1 framework.');
    await expect(page.locator('#pay-lines li')).toHaveText(['1 · Playwright · precio completo19 USD']);
    await expect(page.locator('#pay-note')).toHaveText(/^No se pudo cargar el precio en pesos/);
    await expect(page.locator('#charge')).toHaveText('Continuar a PayPal');
    await expect(page.locator('#charge')).toHaveAttribute('translate', 'no');
    await expect(page.locator('.actions a')).toHaveAttribute('href', 'qa-review-es.html');
  });

  test('an English choice keeps the English payment page', async ({ page }) => {
    await prime(page, 'en');
    await page.route('http://127.0.0.1:8768/**', (route) => route.fulfill({ status: 503, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: '{"error":"down"}' }));
    await page.goto('/qa-review-pay.html?purpose=report');
    await expect(page.locator('#pay-heading')).toHaveText('Open this report again');
    await expect(page).toHaveURL(/\/qa-review-pay\.html\?purpose=report$/);
    await expect(page.locator('#charge')).toHaveText('Continue to PayPal');
  });

  test('the hero stats are written in the page language', async ({ page }) => {
    await prime(page, 'fr');
    await page.goto('/qa-review-fr.html');
    const labels = page.locator('ul.facts li:not([hidden]) span');
    await expect(labels).toHaveText(['types de cas', 'frameworks que vous connaissez déjà', 'adresse pour commencer']);
    await expect(labels.first()).toHaveAttribute('translate', 'no');
    await expect(page.locator('.live-jump')).toHaveText('Voir les rapports en direct de vrais sites ↓');
  });
});
