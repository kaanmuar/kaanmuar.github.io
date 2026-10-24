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
      localStorage.setItem('cv-preferred-lang', code);
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
});
