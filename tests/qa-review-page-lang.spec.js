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
    await expect(page.locator('#stage-sample-open')).toHaveText('Ver un informe de ejemplo');
  });

  test('an English choice translated by the browser into Spanish is offered the Spanish page, until closed', async ({ page }) => {
    await prime(page, 'en');
    await page.goto('/qa-review.html?live=abc#top');
    await page.waitForFunction(() => window.langApplied);
    await expect(page.locator('#lang-offer')).toHaveCount(0);
    await page.evaluate(() => { document.documentElement.lang = 'es'; document.documentElement.classList.add('translated-ltr'); });
    const offer = page.locator('#lang-offer');
    await expect(offer).toHaveAttribute('translate', 'no');
    await expect(offer).toContainText('Esta página también existe en español, sin traducción automática.');
    await expect(offer.locator('a')).toHaveAttribute('href', 'qa-review-es.html?live=abc&lang=es#top');
    await offer.getByRole('button', { name: 'Cerrar' }).click();
    await expect(offer).toHaveCount(0);
    await page.reload();
    await page.evaluate(() => { document.documentElement.lang = 'es'; document.documentElement.classList.add('translated-ltr'); });
    await expect(page.locator('#lang-offer')).toHaveCount(0);
  });

  test('the address hint keeps the space after the host even when the text after it is trimmed', async ({ page }) => {
    await prime(page, 'en');
    await page.route(/dns\.google\/resolve/, (route) => route.fulfill({ contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: '{"Status":0,"Answer":[{"data":"203.0.113.7"}]}' }));
    await page.goto('/qa-review.html');
    await page.locator('#url').fill('carlosandmunoz.com');
    const host = page.locator('#url-hint b.notranslate');
    await expect(host).toHaveText('carlosandmunoz.com ', { useInnerText: false });
    await expect(page.locator('#url-hint')).toHaveText('carlosandmunoz.com is online.');
  });

  test.describe('with a Spanish browser and English saved', () => {
    test.use({ locale: 'es-ES' });

    test('the English page offers the Spanish page instead of leaving it to machine translation', async ({ page }) => {
      await prime(page, 'en');
      await page.goto('/qa-review.html');
      const offer = page.locator('#lang-offer');
      await expect(offer.locator('a')).toHaveText('Abrir en español');
      await offer.locator('a').click();
      await expect(page).toHaveURL(/\/qa-review-es\.html\?lang=es$/);
      await expect.poll(() => page.evaluate(() => localStorage.getItem('cv-preferred-lang'))).toBe('es');
    });
  });

  test.describe('with a Spanish browser and no saved choice', () => {
    test.use({ locale: 'es-ES' });

    test('the English gate is never shown half in Spanish: the visitor lands on the Spanish page', async ({ page }) => {
      await prime(page, null);
      await page.goto('/qa-review.html');
      await expect(page).toHaveURL(/\/qa-review-es\.html$/);
      await expect(page.locator('#gate-title')).toHaveText('Antes de analizar una sola dirección.');
      await expect(page.locator('#langFlagGate')).toHaveAttribute('alt', 'Español');
      await expect(page.locator('#stage-sample-open')).toHaveText('Ver un informe de ejemplo');
      await expect(page.locator('#gate-close')).toHaveAttribute('aria-label', 'Cerrar');
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
    await expect(page.locator('#pay-copy')).toContainText('Esta revisión cuesta 19 USD. 1 framework: 19 USD el primero y 5 USD cada uno de los siguientes.');
    await expect(page.locator('#pay-lines li')).toHaveText(['1 · Playwright · precio completo19 USD']);
    await expect(page.locator('#pay-note')).toHaveText(/^No se pudo cargar el precio en pesos/);
    await expect(page.locator('#charge')).toHaveText('Continuar a PayPal');
    await expect(page.locator('#charge')).toHaveAttribute('translate', 'no');
    await expect(page.locator('.actions a')).toHaveAttribute('href', 'qa-review-es.html');
    const checkout = page.waitForRequest((request) => request.url().endsWith('/checkout') && request.method() === 'POST');
    await page.locator('#charge').click();
    expect((await checkout).postDataJSON().lang).toBe('es');
  });

  test('the return price ticket is written in the payment page language', async ({ page }) => {
    await prime(page, 'es');
    await page.route('http://127.0.0.1:8768/**', (route) => route.fulfill({ contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ cop: 62000, rate: 4100, usd: 15.2, listUsd: 19, percent: 20 }) }));
    await page.goto('/qa-review-pay-es.html?purpose=new-run&frameworks=Playwright');
    await expect(page.locator('.deal-eyebrow')).toHaveText('Qué bueno verte de nuevo');
    await expect(page.locator('.deal-foot')).toContainText('Te ahorras 3.80 USD.');
    await expect(page.locator('#pay-deal .deal')).toHaveAttribute('translate', 'no');
  });

  test('an English choice keeps the English payment page', async ({ page }) => {
    await prime(page, 'en');
    await page.route('http://127.0.0.1:8768/**', (route) => route.fulfill({ status: 503, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: '{"error":"down"}' }));
    await page.goto('/qa-review-pay.html?purpose=report');
    await expect(page.locator('#pay-heading')).toHaveText('The full report');
    await expect(page).toHaveURL(/\/qa-review-pay\.html\?purpose=report$/);
    await expect(page.locator('#charge')).toHaveText('Continue to PayPal');
  });

  test('a fix list is priced at 5 USD on the Spanish payment page', async ({ page }) => {
    await prime(page, 'es');
    await page.route('http://127.0.0.1:8768/**', (route) => route.fulfill({ status: 503, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: '{"error":"down"}' }));
    await page.goto('/qa-review-pay-es.html?purpose=fixlist&reportId=abc123');
    await expect(page.locator('#pay-heading')).toHaveText('La lista de arreglos');
    await expect(page.locator('#pay-copy')).toContainText('La lista de arreglos cuesta 5 USD.');
    await expect(page.locator('#pay-amount')).toHaveText('5 USD');
    await expect(page.locator('#pay-lines')).toBeHidden();
  });

  test('the report dashboard is written in the page language without machine translation', async ({ page }) => {
    await page.goto('/qa-review-de.html');
    await expect(page.locator('#dash-title')).toHaveText('Bericht', { useInnerText: false });
    await expect(page.locator('#dash-title')).toHaveAttribute('translate', 'no');
    await expect(page.locator('[data-report-copy="healthTitle"]')).toHaveText('Gesundheitswert', { useInnerText: false });
    await expect(page.locator('#compare-go')).toHaveText('Vergleichen', { useInnerText: false });
    await expect(page.locator('[data-report-copy="compareAdd"]')).toHaveText('+ Weiteren Mitbewerber hinzufügen', { useInnerText: false });
    await page.goto('/qa-review.html');
    await expect(page.locator('#dash-title')).toHaveText('Report', { useInnerText: false });
    await expect(page.locator('#dash-title')).not.toHaveAttribute('translate', 'no');
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
