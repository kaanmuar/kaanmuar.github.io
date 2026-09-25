const { test, expect } = require('@playwright/test');
const { skipSiteTours } = require('./helpers.js');

test.describe('CV regression lab', () => {
  test.beforeEach(async ({ page }) => {
    await skipSiteTours(page);
    await page.addInitScript(() => localStorage.setItem('theme', 'light'));
    await page.goto('/qa-lab.html');
  });

  test('lists the catalog with where/when/how for a case', async ({ page }) => {
    await expect(page.getByRole('heading', { name: /The suite I run on this CV/i })).toBeVisible();
    await expect(page.locator('.case-row').first()).toBeVisible();
    await expect(page.locator('.case-row')).toHaveCount(53);
    await expect(page.locator('#case-detail')).toContainText('Where');
    await expect(page.locator('#case-detail')).toContainText('When');
    await expect(page.locator('#case-detail')).toContainText('How');
    await expect(page.locator('#dash-charts .chart-card')).not.toHaveCount(0);
    await expect(page.locator('#dash-overlay')).not.toHaveClass(/open/);
    await expect(page.locator('#dash-open')).toBeVisible();
    await expect(page.locator('#tour-start-btn')).toBeVisible();
    await expect(page.locator('#homeBtn')).toBeVisible();
    await expect(page.locator('#langToggle')).toBeVisible();
    await expect(page.locator('[data-pace="1"]')).toHaveClass(/on/);
    await expect(page.locator('[data-view="watch"]')).toHaveClass(/on/);
    await expect(page.locator('#sut')).toBeVisible();
    await expect(page.locator('[data-filter="Mobile"]')).toBeVisible();
    await expect(page.getByRole('button', { name: /MOB-01/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /FN-15/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /FN-22/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /FN-23/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /FN-28/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /STU-03/ })).toBeVisible();
    const chip = await page.locator('#case-detail .src-link').first().boundingBox();
    expect(chip.height).toBeLessThan(28);
    expect(chip.width).toBeLessThan(140);
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

  test('runs a smoke case, keeps it in the catalog, and opens the dashboard popup', async ({ page }) => {
    await page.getByRole('button', { name: /SMK-01/ }).click();
    await page.getByRole('button', { name: 'Run this case' }).click();
    await expect(page.locator('#run-log')).toContainText('PASS', { timeout: 30000 });
    await expect(page.locator('#report-body')).toContainText('SMK-01');
    await expect(page.locator('#kpi-pass')).toHaveText('1');
    await expect(page.locator('#dash-overlay')).toHaveClass(/open/);
    await expect(page.locator('#dash-title')).toBeVisible();
    await page.locator('#dash-close').click();
    await expect(page.locator('#dash-overlay')).not.toHaveClass(/open/);
  });

  test('Dashboard control opens the splash without scrolling the page', async ({ page }) => {
    await page.locator('#dash-open').click();
    await expect(page.locator('#dash-overlay')).toHaveClass(/open/);
    await expect(page.locator('#dash-title')).toBeInViewport();
    await page.keyboard.press('Escape');
    await expect(page.locator('#dash-overlay')).not.toHaveClass(/open/);
  });

  test('catalog keeps the selected case scrolled into the list', async ({ page }) => {
    await page.getByRole('button', { name: /MOB-01/ }).click();
    await page.evaluate(() => window.QALab.focusCase('MOB-01'));
    const inView = await page.evaluate(() => {
      const row = document.querySelector('.case-row[data-id="MOB-01"]');
      const list = document.getElementById('case-list');
      const rr = row.getBoundingClientRect();
      const lr = list.getBoundingClientRect();
      return rr.top >= lr.top - 2 && rr.bottom <= lr.bottom + 2;
    });
    expect(inView).toBeTruthy();
  });

  test('guided tour walks the lab controls', async ({ page }) => {
    await page.locator('#tour-start-btn').click();
    await expect(page.locator('#site-tour-overlay')).toHaveClass(/on/);
    await expect(page.locator('#site-tour-title')).toHaveText('The catalog');
    await expect(page.locator('#case-list')).toHaveClass(/site-tour-hit/);
    await page.locator('#site-tour-close').click();
    await expect(page.locator('#site-tour-overlay')).not.toHaveClass(/on/);
  });

  test('lab tour Next advances after the demo hold', async ({ page }) => {
    await page.locator('#tour-start-btn').click();
    await expect(page.locator('#site-tour-next')).toBeDisabled();
    await expect(page.locator('#site-tour-next')).toBeEnabled({ timeout: 4000 });
    await page.locator('#site-tour-next').click();
    await expect(page.locator('#site-tour-title')).toHaveText('Filter by type');
    await page.locator('#site-tour-close').click();
  });

  test('closing the dashboard splash by clicking the backdrop', async ({ page }) => {
    await page.locator('#dash-open').click();
    await expect(page.locator('#dash-overlay')).toHaveClass(/open/);
    await page.locator('#dash-overlay').click({ position: { x: 4, y: 4 } });
    await expect(page.locator('#dash-overlay')).not.toHaveClass(/open/);
  });

  test('Mobile filter narrows the catalog', async ({ page }) => {
    const all = await page.locator('.case-row').count();
    await page.locator('[data-filter="Mobile"]').click();
    await expect(page.locator('[data-filter="Mobile"]')).toHaveClass(/on/);
    const mobile = await page.locator('.case-row').count();
    expect(mobile).toBeGreaterThan(0);
    expect(mobile).toBeLessThan(all);
    await expect(page.getByRole('button', { name: /MOB-01/ })).toBeVisible();
  });

  test('Functional filter still lists competency cases', async ({ page }) => {
    await page.locator('[data-filter="Functional"]').click();
    await expect(page.getByRole('button', { name: /FN-15/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /FN-22/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /SMK-01/ })).toHaveCount(0);
  });

  test('theme, language, share, print, and download cases pass', async ({ page }) => {
    test.setTimeout(90000);
    await page.evaluate(() => {
      localStorage.setItem('qa-lab-pace', '0.5');
      localStorage.setItem('qa-lab-view', 'background');
    });
    const ids = ['FN-23', 'FN-24', 'FN-25', 'FN-26', 'FN-27', 'FN-28'];
    const results = await page.evaluate(async (caseIds) => {
      await window.QALab.runIds(caseIds);
      return window.QALab.results
        .filter((row) => caseIds.includes(row.id))
        .map((row) => ({ id: row.id, ok: row.ok, error: row.error || '', detail: row.detail || '' }));
    }, ids);
    expect(results.map((row) => row.id).sort()).toEqual(ids.slice().sort());
    const failed = results.filter((row) => !row.ok);
    expect(failed, JSON.stringify(failed, null, 2)).toEqual([]);
  });

  test('clicking inside the dashboard modal does not close it', async ({ page }) => {
    await page.locator('#dash-open').click();
    await expect(page.locator('#dash-overlay')).toHaveClass(/open/);
    await page.locator('.dash-modal').click();
    await expect(page.locator('#dash-overlay')).toHaveClass(/open/);
    await page.locator('#dash-close').click();
  });
});
