const { test, expect } = require('@playwright/test');

const TERMS = require('fs').readFileSync(require('path').join(__dirname, '../js/qa-review.js'), 'utf8').match(/TERMS_VERSION = "([^"]+)"/)[1];

async function prime(page, country) {
  await page.addInitScript((version) => {
    Object.defineProperty(navigator, 'webdriver', { get: () => false });
    window.addEventListener('site-lang-applied', () => { window.langApplied = true; });
    try {
      sessionStorage.setItem('qa-review-terms', version);
      localStorage.setItem('hasSeenReviewTour', 'true');
      localStorage.setItem('qa-review-analytics', 'necessary');
    } catch (e) { /* storage is optional */ }
  }, TERMS);
  await page.route(/\/news\?/, (route) => route.fulfill({ contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: '{"items":[]}' }));
  await page.route(/ipwho\.is/, (route) => route.fulfill({ contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ success: true, country_code: country }) }));
}

test.describe('First visit language: an English browser', () => {
  test.use({ locale: 'en-US' });

  test('stays in English from a Belgian address', async ({ page }) => {
    await prime(page, 'BE');
    await page.goto('/qa-review.html');
    await page.waitForFunction(() => window.langApplied);
    await expect(page).toHaveURL(/\/qa-review\.html$/);
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  });
});

test.describe('First visit language: a Dutch browser', () => {
  test.use({ locale: 'nl-NL' });

  test('falls back to the address country when the browser language has no page of its own', async ({ page }) => {
    await prime(page, 'CO');
    await page.goto('/qa-review.html');
    await expect(page).toHaveURL(/\/qa-review-es\.html$/);
    await expect(page.locator('html')).toHaveAttribute('lang', 'es');
  });
});
