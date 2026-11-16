const { test, expect } = require('./net-guard');
const { skipSiteTours, runAxe } = require('./helpers.js');

const PAGES = [
  { url: '/qalaburlreview.html', handle: '@qalaburlreview', other: 'qaurlreview.html', skip: 'Skip to main content' },
  { url: '/qaurlreview.html', handle: '@qaurlreview', other: 'qalaburlreview.html', skip: 'Saltar al contenido principal' }
];

test.describe('Face landing pages', () => {
  for (const { url, handle, other, skip } of PAGES) {
    for (const theme of ['light', 'dark']) {
      test(`${url} has no serious axe violations in the ${theme} theme`, async ({ page }) => {
        await skipSiteTours(page);
        await page.goto(url);
        await page.evaluate((dark) => document.documentElement.classList.toggle('dark-mode', dark), theme === 'dark');
        const results = await runAxe(page, { contrast: true, exclude: ['.cookie-note'] });
        const serious = results.violations.filter((v) => ['serious', 'critical'].includes(v.impact));
        expect(serious, JSON.stringify(serious.map((v) => v.id + ' ' + v.nodes.map((n) => n.target).join(' ')))).toEqual([]);
      });
    }

    test(`${url} names the face, links the other one and fits a phone`, async ({ page }) => {
      await skipSiteTours(page);
      await page.setViewportSize({ width: 390, height: 844 });
      await page.goto(url);
      await expect(page.locator('.face-handle')).toHaveText(handle);
      await expect(page.locator(`main a[href="${other}"]`)).toHaveCount(1);
      await expect(page.locator('.skip-link')).toHaveText(skip);
      const extra = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(extra).toBeLessThanOrEqual(2);
    });
  }

  test('the English face verifies its Mastodon profile with rel="me"', async ({ page }) => {
    await page.goto('/qalaburlreview.html');
    await expect(page.locator('link[rel="me"]')).toHaveAttribute('href', 'https://mastodon.social/@qalaburlreview');
    await expect(page.locator('a[data-net="mastodon"]')).toHaveAttribute('rel', /\bme\b/);
  });
});
