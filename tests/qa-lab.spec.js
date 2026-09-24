const { test, expect } = require('@playwright/test');

test.describe('CV regression lab', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('theme', 'light'));
    await page.goto('/qa-lab.html');
  });

  test('lists the catalog with where/when/how for a case', async ({ page }) => {
    await expect(page.getByRole('heading', { name: /The suite I run on this CV/i })).toBeVisible();
    await expect(page.locator('.case-row').first()).toBeVisible();
    await expect(page.locator('.case-row')).toHaveCount(37);
    await expect(page.locator('#case-detail')).toContainText('Where');
    await expect(page.locator('#case-detail')).toContainText('When');
    await expect(page.locator('#case-detail')).toContainText('How');
    await expect(page.locator('#dash-charts .chart-card')).not.toHaveCount(0);
    await expect(page.locator('#homeBtn')).toBeVisible();
    await expect(page.locator('#langToggle')).toBeVisible();
    await expect(page.locator('[data-pace="1"]')).toHaveClass(/on/);
    await expect(page.locator('[data-view="watch"]')).toHaveClass(/on/);
    await expect(page.locator('#sut')).toBeVisible();
    await expect(page.locator('[data-filter="Mobile"]')).toBeVisible();
    await expect(page.getByRole('button', { name: /MOB-01/ })).toBeVisible();
    const source = page.locator('.src-link').first();
    await expect(source).toBeVisible();
    await expect(source).toHaveAttribute('href', /github\.com\/kaanmuar\/kaanmuar\.github\.io\/blob\/main\/js\/qa-lab\.js#L/);
    await expect(page.locator('.case-item:not(:has(.src-link))')).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'Suite repo' })).toHaveAttribute('href', 'https://github.com/kaanmuar/kaanmuar.github.io');
  });

  test('pace control switches hold and persists', async ({ page }) => {
    await page.locator('[data-pace="2"]').click();
    await expect(page.locator('[data-pace="2"]')).toHaveClass(/on/);
    await expect(page.locator('[data-pace="1"]')).not.toHaveClass(/on/);
    await page.reload();
    await expect(page.locator('[data-pace="2"]')).toHaveClass(/on/);
  });

  test('actions default to Watch and can hide to Background', async ({ page }) => {
    await expect(page.locator('html')).toHaveClass(/lab-watch/);
    await expect(page.locator('#sut')).toBeVisible();
    await page.locator('[data-view="background"]').click();
    await expect(page.locator('[data-view="background"]')).toHaveClass(/on/);
    await expect(page.locator('[data-view="watch"]')).not.toHaveClass(/on/);
    await expect(page.locator('html')).toHaveClass(/lab-background/);
    await expect(page.locator('#sut')).toBeHidden();
    await expect(page.locator('.sut-bg-note')).toBeVisible();
    await page.reload();
    await expect(page.locator('[data-view="background"]')).toHaveClass(/on/);
    await expect(page.locator('html')).toHaveClass(/lab-background/);
    await page.locator('[data-view="watch"]').click();
    await expect(page.locator('#sut')).toBeVisible();
  });

  test('ships full SEO chrome', async ({ page }) => {
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', /qa-lab\.html/);
    await expect(page.locator('meta[property="og:title"]')).toHaveCount(1);
    await expect(page.locator('meta[name="twitter:card"]')).toHaveAttribute('content', 'summary_large_image');
    await expect(page.locator('link[hreflang="es"]')).toHaveAttribute('href', /lang=es/);
    const jsonLd = await page.locator('script[type="application/ld+json"]').textContent();
    expect(jsonLd).toContain('WebApplication');
    expect(jsonLd).toContain('BreadcrumbList');
  });

  test('back control returns to the CV', async ({ page }) => {
    await page.locator('#homeBtn').click();
    await expect(page).toHaveURL(/index\.html/);
    await expect(page.locator('.main-container')).toBeVisible();
  });

  test('runs a smoke case and records PASS in the log and report', async ({ page }) => {
    await page.getByRole('button', { name: /SMK-01/ }).click();
    await page.getByRole('button', { name: 'Run this case' }).click();
    await expect(page.locator('#run-log')).toContainText('PASS', { timeout: 30000 });
    await expect(page.locator('#report-body')).toContainText('SMK-01');
    await expect(page.locator('#kpi-pass')).toHaveText('1');
  });
});
