const { test, expect } = require('@playwright/test');
const { openCV } = require('./helpers.js');

test.describe('Smoke and assets', () => {
  test('public pages return 200', async ({ request }) => {
    for (const path of ['/index.html', '/simulador.html', '/qa-lab.html', '/admin.html', '/style.css', '/css/cv.css', '/js/cv-data.js', '/js/cv-app.js', '/favicon.svg', '/site.webmanifest', '/robots.txt', '/sitemap.xml']) {
      const res = await request.get(path);
      expect(res.status(), path).toBe(200);
    }
  });

  test('CV document has expected title and Harbor skin', async ({ page }) => {
    await openCV(page);
    await expect(page).toHaveTitle(/Carlos Muñoz/i);
    await expect(page.locator('html')).toHaveAttribute('data-skin', 'harbor');
  });

  test('critical scripts and stylesheet load', async ({ page }) => {
    const failed = [];
    page.on('requestfailed', (req) => {
      if (/\.(css|js)$/i.test(req.url()) && !req.url().includes('google-analytics') && !req.url().includes('gtag')) {
        failed.push(req.url());
      }
    });
    await openCV(page);
    expect(failed).toEqual([]);
  });
});
