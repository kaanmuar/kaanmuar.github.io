const { test, expect } = require('@playwright/test');
const { openCV, openAdmin, skipSiteTours } = require('./helpers.js');

test.describe('Security and SEO', () => {
  test('robots.txt allows the CV and disallows admin, tests, and cypress', async ({ request }) => {
    const res = await request.get('/robots.txt');
    expect(res.ok()).toBeTruthy();
    const body = await res.text();
    expect(body).toMatch(/Allow:\s*\//);
    expect(body).toMatch(/Disallow:\s*\/admin\.html/);
    expect(body).toMatch(/Disallow:\s*\/cypress\//);
    expect(body).toMatch(/Disallow:\s*\/tests\//);
    expect(body).toContain('Sitemap:');
  });

  test('sitemap lists CV and simulator and omits admin', async ({ request }) => {
    const res = await request.get('/sitemap.xml');
    expect(res.ok()).toBeTruthy();
    const xml = await res.text();
    expect(xml).toContain('kaanmuar.github.io/');
        expect(xml).toContain('simulador.html');
        expect(xml).toContain('qa-lab.html');
        expect(xml).toContain('qa-lab.html?lang=es');
        expect(xml).toContain('qa-lab.html?lang=it');
        expect(xml).not.toContain('admin.html');
  });

  test('admin is noindex', async ({ page }) => {
    await openAdmin(page);
    const robots = await page.locator('meta[name="robots"]').getAttribute('content');
    expect(robots).toMatch(/noindex/i);
  });

  test('CV is indexable and has canonical plus JSON-LD', async ({ page }) => {
    await openCV(page);
    const robots = await page.locator('meta[name="robots"]').getAttribute('content');
    expect(robots).toMatch(/index/i);
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', /kaanmuar\.github\.io/);
    const jsonLd = await page.locator('#person-structured-data').textContent();
    expect(jsonLd).toContain('Carlos');
    expect(jsonLd).toMatch(/18 (years|años)/i);
    const competenciesLd = await page.locator('#competencies-structured-data').textContent();
    expect(competenciesLd).toContain('IT Project Management');
    expect(competenciesLd).toContain('DefinedTerm');
    expect(competenciesLd).toContain('topic=pm');
  });

  test('external profile links use noopener noreferrer', async ({ page }) => {
    await openCV(page);
    const linkedin = page.locator('#contact-linkedin a');
    await expect(linkedin).toHaveAttribute('rel', /noopener/);
    await expect(linkedin).toHaveAttribute('target', '_blank');
  });

  test('lang query does not execute script payloads', async ({ page }) => {
    const hits = [];
    page.on('dialog', (dialog) => {
      hits.push(dialog.message());
      dialog.dismiss();
    });
    await page.goto('/index.html?lang=%3Cscript%3Ealert(1)%3C/script%3E');
    await expect(page.locator('.main-container')).toBeVisible();
    expect(hits).toEqual([]);
  });

  test('admin HTML is not linked from the public CV chrome', async ({ page }) => {
    await openCV(page);
    await expect(page.locator('a[href*="admin.html"]')).toHaveCount(0);
  });

  test('simulator does not expose admin routes', async ({ page }) => {
    await skipSiteTours(page);
    await page.goto('/simulador.html');
    await expect(page.locator('a[href*="admin.html"]')).toHaveCount(0);
  });
});
