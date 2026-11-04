const { test, expect } = require('@playwright/test');

async function firestoreHits(page) {
  const hits = [];
  await page.route('https://firestore.googleapis.com/**', (route) => { hits.push(route.request().url()); return route.abort(); });
  await page.addInitScript(() => { sessionStorage.setItem('hasSeenTour', 'true'); });
  await page.goto('/');
  await page.waitForFunction(() => document.documentElement.dataset.cvSettled, null, { timeout: 20000 });
  await page.waitForTimeout(2000);
  return hits;
}

test.describe('CV page under test automation', () => {
  test('opens no Firestore reads', async ({ page }) => {
    expect(await page.evaluate(() => navigator.webdriver)).toBe(true);
    expect(await firestoreHits(page)).toEqual([]);
    await expect(page.locator('#testimonials-section')).toBeHidden();
  });

  test.describe('in Cypress Electron, which leaves navigator.webdriver false', () => {
    test.use({ userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Cypress/14.5.2 Chrome/130.0.0.0 Electron/33.2.1 Safari/537.36' });

    test('opens no Firestore reads', async ({ page }) => {
      await page.addInitScript(() => { Object.defineProperty(navigator, 'webdriver', { get: () => false }); });
      expect(await firestoreHits(page)).toEqual([]);
    });
  });
});
