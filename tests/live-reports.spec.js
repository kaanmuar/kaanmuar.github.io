const { test, expect } = require('@playwright/test');

async function prime(page, { terms = true } = {}) {
  await page.addInitScript((accepted) => {
    try {
      if (accepted) sessionStorage.setItem('qa-review-terms', '2026-10-20');
      localStorage.setItem('hasSeenReviewTour', 'true');
      localStorage.setItem('qa-review-analytics', 'necessary');
      localStorage.setItem('cv-preferred-lang', 'en');
    } catch (e) { /* storage is optional */ }
  }, terms);
}

function watchCsp(page) {
  const violations = [];
  page.on('console', (msg) => { if (/Content Security Policy|Refused to/i.test(msg.text())) violations.push(msg.text()); });
  page.on('pageerror', (err) => violations.push('pageerror ' + err.message));
  return violations;
}

test.describe('Live reports', () => {
  test('the ring renders, rotates, and stays inside the viewport', async ({ page }) => {
    const violations = watchCsp(page);
    await prime(page);
    await page.goto('/qa-review.html');
    const cards = page.locator('#live-reports .live-card:not([hidden])');
    await expect(cards.first()).toBeVisible();
    expect(await cards.count()).toBeGreaterThanOrEqual(10);
    const count = page.locator('.live-count');
    await expect(count).toContainText(/^1 \/ \d+/);
    await page.locator('.live-next').click();
    await expect(count).toContainText(/^2 \//);
    await page.locator('.live-stage').focus();
    await page.keyboard.press('ArrowRight');
    await expect(count).toContainText(/^3 \//);
    await page.locator('.live-prev').click();
    await expect(count).toContainText(/^2 \//);
    await expect(page.locator('.live-card.is-active')).toHaveCount(1);
    await expect(page.locator('.live-status')).toContainText(/out of 100/);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
    expect(violations).toEqual([]);
  });

  test('filters narrow the ring by scope and country', async ({ page }) => {
    await prime(page);
    await page.goto('/qa-review.html');
    await expect(page.locator('.live-card').first()).toBeAttached();
    const total = await page.locator('.live-card:not([hidden])').count();
    await page.locator('.live-chips button[data-g="scope"][data-v="local"]').click();
    await expect(page.locator('.live-chips button[data-g="scope"][data-v="local"]')).toHaveAttribute('aria-pressed', 'true');
    const local = page.locator('.live-card:not([hidden])');
    const localCount = await local.count();
    expect(localCount).toBeGreaterThan(0);
    expect(localCount).toBeLessThan(total);
    for (const scope of await local.locator('.lc-scope').allTextContents()) expect(scope.trim().toLowerCase()).toBe('local');
    await page.locator('.live-chips button[data-g="scope"][data-v=""]').click();
    await page.locator('.live-chips button[data-g="country"][data-v="GB"]').click();
    const gb = await page.locator('.live-card:not([hidden])').count();
    expect(gb).toBeGreaterThan(0);
    expect(gb).toBeLessThan(total);
    await expect(page.locator('.live-count')).toContainText('/ ' + gb);
  });

  test('a deep link opens one report, view and share only', async ({ page }) => {
    const violations = watchCsp(page);
    await prime(page);
    await page.goto('/qa-review.html?live=bbc');
    const viewer = page.locator('#live-viewer');
    await expect(viewer).toBeVisible();
    await expect(viewer.locator('#lv-name')).toHaveText('BBC');
    await expect(viewer.locator('.lv-fix li').first()).toBeVisible();
    await expect(viewer.locator('.lv-fair')).toContainText('A starting point, not a verdict.');
    await expect(viewer.locator('.lv-taggroups .lchip').first()).toBeVisible();
    await expect(viewer.locator('[data-act="net"]')).toHaveCount(5);
    await expect(viewer.locator('[data-act="copy"]')).toBeVisible();
    await expect(viewer.locator('button, a').filter({ hasText: /download|export|print|pdf|json/i })).toHaveCount(0);
    await expect(viewer.locator('a[href$=".json"], a[download]')).toHaveCount(0);
    const mark = await viewer.locator('.lv-mark').evaluate((el) => getComputedStyle(el).backgroundImage);
    expect(mark).toContain('data:image/svg+xml');
    expect(await viewer.evaluate((el) => getComputedStyle(el).userSelect)).toBe('none');
    await page.evaluate(() => { window.open = (url) => { window.__shared = url; return null; }; });
    await viewer.locator('[data-net="linkedin"]').click();
    const opened = await page.evaluate(() => window.__shared);
    expect(opened).toMatch(/^https:\/\/www\.linkedin\.com\//);
    const shared = decodeURIComponent(opened);
    expect(shared).toContain('live=bbc');
    expect(shared).toContain('utm_source=linkedin');
    expect(shared).toContain('utm_medium=share');
    expect(shared).toContain('utm_campaign=live-reports');
    expect(shared).toContain('utm_content=bbc');
    await page.keyboard.press('Escape');
    await expect(viewer).toBeHidden();
    expect(page.url()).not.toContain('live=');
    expect(violations).toEqual([]);
  });

  test('printing shows a message instead of the report', async ({ page }) => {
    await prime(page);
    await page.goto('/qa-review.html?live=govuk');
    await expect(page.locator('#live-viewer .lv-fix li').first()).toBeVisible();
    const prevented = await page.evaluate(() => {
      const event = new KeyboardEvent('keydown', { key: 'p', ctrlKey: true, bubbles: true, cancelable: true });
      document.body.dispatchEvent(event);
      return event.defaultPrevented;
    });
    expect(prevented).toBe(true);
    await page.emulateMedia({ media: 'print' });
    await expect(page.locator('.lv-print-note')).toBeVisible();
    await expect(page.locator('.lv-print-note')).toContainText('view-only');
    await expect(page.locator('#live-viewer')).toBeHidden();
    await expect(page.locator('#review-app')).toBeHidden();
  });

  test('the gate opens the ring before the disclaimers are accepted', async ({ page }) => {
    await prime(page, { terms: false });
    await page.goto('/qa-review.html');
    await expect(page.locator('#gate')).toBeVisible();
    await expect(page.locator('#live-open-gate')).toContainText(/Explore \d+ live reports/);
    await page.locator('#live-open-gate').click();
    await expect(page.locator('#live-reports.is-docked')).toBeVisible();
    await page.locator('.live-card.is-active .lc-open').click();
    await expect(page.locator('#live-viewer')).toBeVisible();
    await page.keyboard.press('Escape');
    await page.locator('#live-back').click();
    await expect(page.locator('#live-reports.is-docked')).toHaveCount(0);
    await expect(page.locator('#gate')).toBeVisible();
  });

  test('the Spanish page translates the controls', async ({ page }) => {
    await prime(page);
    await page.goto('/qa-review-es.html');
    await expect(page.locator('#live-title')).toContainText('Sitios reales');
    await expect(page.locator('.live-flabel').first()).toHaveText('Sector');
    await expect(page.locator('.live-next')).toHaveAttribute('aria-label', 'Informe siguiente');
  });

  test('public files carry no private fields and stay out of the sitemap', async ({ request }) => {
    const res = await request.get('/assets/live-reports/index.json');
    expect(res.ok()).toBeTruthy();
    const index = await res.json();
    expect(index.reports.length).toBeGreaterThanOrEqual(10);
    const one = await (await request.get('/assets/live-reports/' + index.reports[0].id + '.json')).text();
    for (const body of [JSON.stringify(index), one]) {
      expect(body).not.toMatch(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
      expect(body).not.toMatch(/"(signature|agent|log|observed|caseVerdicts|aiView|graph)"/);
    }
    const sitemap = await (await request.get('/sitemap.xml')).text();
    expect(sitemap).not.toContain('live-reports');
  });
});
