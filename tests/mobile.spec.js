const { test, expect } = require('@playwright/test');
const { prepareCV } = require('./helpers.js');

test.describe('Mobile — CV, Studio, QA Lab, Admin', () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

  test.beforeEach(async ({ page }) => {
    await prepareCV(page, { theme: 'light' });
  });

  test('CV shows the phone toolbar with studio and lab launchers', async ({ page }) => {
    await page.goto('/index.html');
    await expect(page.locator('.mobile-toolbar')).toBeVisible();
    await expect(page.locator('#sim-launch-btn-mobile')).toBeVisible();
    await expect(page.locator('#qa-lab-btn-mobile')).toBeVisible();
    await expect(page.locator('#theme-toggle')).toBeHidden();
    await expect(page.locator('#theme-toggle-mobile .sun-icon')).toBeHidden();
    await expect(page.locator('#theme-toggle-mobile .moon-icon')).toBeVisible();
    const info = page.locator('.info-icon-container > svg').first();
    await expect(info).toBeVisible();
    const infoBox = await info.boundingBox();
    expect(infoBox.width).toBeLessThanOrEqual(24);
    expect(infoBox.height).toBeLessThanOrEqual(24);
    const icons = await page.evaluate(() => {
      const tb = document.querySelector('.mobile-toolbar');
      const vw = window.innerWidth;
      return [...tb.children].map((el) => {
        const r = el.getBoundingClientRect();
        const mark = el.querySelector('svg:not([style*="display: none"]), img.lang-flag, svg.moon-icon, svg.sun-icon, img');
        const vis = [...el.querySelectorAll('svg, img')].filter((n) => {
          const cs = getComputedStyle(n);
          return cs.display !== 'none' && cs.visibility !== 'hidden' && n.getBoundingClientRect().width > 0;
        });
        const ir = vis[0] ? vis[0].getBoundingClientRect() : null;
        return {
          id: el.id,
          overflow: r.right > vw + 1,
          iconW: ir ? Math.round(ir.width) : 0,
          iconH: ir ? Math.round(ir.height) : 0,
          visibleMarks: vis.length
        };
      });
    });
    expect(icons).toHaveLength(8);
    for (const icon of icons) {
      expect(icon.overflow, icon.id).toBeFalsy();
      expect(icon.visibleMarks, icon.id).toBe(1);
      expect(icon.iconW, icon.id).toBeGreaterThanOrEqual(16);
      expect(icon.iconH, icon.id).toBeGreaterThanOrEqual(16);
    }
    const extra = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(extra).toBeLessThanOrEqual(2);
  });

  test('CV mobile theme toggle applies dark-mode', async ({ page }) => {
    await page.goto('/index.html');
    await expect(page.locator('html')).not.toHaveClass(/dark-mode/);
    await page.locator('#theme-toggle-mobile').click();
    await expect(page.locator('html')).toHaveClass(/dark-mode/);
  });

  test('Studio stacks the header without clipping Run', async ({ page }) => {
    await page.goto('/simulador.html');
    await expect(page.locator('#homeBtn')).toBeVisible();
    await expect(page.locator('#runBtn')).toBeVisible();
    await expect(page.locator('#runBtn')).toBeInViewport();
    const layout = await page.evaluate(() => {
      const bar = document.querySelector('.topbar');
      const run = document.getElementById('runBtn');
      const br = bar.getBoundingClientRect();
      const rr = run.getBoundingClientRect();
      return {
        barH: br.height,
        clipped: rr.bottom > br.bottom + 2,
        overflowY: getComputedStyle(document.body).overflowY
      };
    });
    expect(layout.clipped).toBeFalsy();
    expect(layout.barH).toBeGreaterThan(56);
    expect(['auto', 'scroll', 'visible']).toContain(layout.overflowY);
  });

  test('QA lab header stays above the heading', async ({ page }) => {
    await page.goto('/qa-lab.html');
    await expect(page.locator('#homeBtn')).toBeVisible();
    await expect(page.locator('[data-pace="1"]')).toBeVisible();
    await expect(page.locator('[data-view="watch"]')).toBeVisible();
    await expect(page.locator('#sut')).toBeVisible();
    await expect(page.locator('[data-filter="Mobile"]')).toBeVisible();
    const overlap = await page.evaluate(() => {
      const bar = document.querySelector('.topbar');
      const h1 = document.querySelector('.intro h1');
      return h1.getBoundingClientRect().top < bar.getBoundingClientRect().bottom - 1;
    });
    expect(overlap).toBeFalsy();
    await expect(page.getByRole('heading', { name: /The suite I run on this CV/i })).toBeInViewport();
  });

  test('Admin login overlay and back link fit the phone', async ({ page }) => {
    await page.goto('/admin.html');
    await expect(page.locator('#login-overlay')).toBeVisible();
    await expect(page.locator('#admin-home')).toBeVisible();
    const width = await page.evaluate(() => document.getElementById('login-overlay').getBoundingClientRect().width);
    expect(width).toBeGreaterThanOrEqual(300);
    await page.locator('#admin-home').click();
    await expect(page).toHaveURL(/index\.html/);
  });
});
