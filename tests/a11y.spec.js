const { test, expect } = require('@playwright/test');
const { openCV, openAdmin, runAxe } = require('./helpers.js');

test.describe('Accessibility', () => {
  test('CV has no serious WCAG 2 A/AA axe violations outside the widget', async ({ page }) => {
    await openCV(page, { theme: 'light' });
    const results = await runAxe(page, { exclude: ['#contact-widget', '#tour-tooltip', '.skiptranslate'] });
    const serious = results.violations.filter((v) => ['serious', 'critical'].includes(v.impact));
    expect(serious, JSON.stringify(serious.map((v) => v.id))).toEqual([]);
  });

  test('primary landmark and skippable name heading exist', async ({ page }) => {
    await openCV(page);
    await expect(page.locator('main.main-content, main')).toHaveCount(1);
    await expect(page.getByRole('heading', { name: /Carlos/i }).first()).toBeVisible();
  });

  test('interactive controls are keyboard-focusable', async ({ page }) => {
    await openCV(page);
    await page.locator('#theme-toggle').focus();
    await expect(page.locator('#theme-toggle')).toBeFocused();
    await page.keyboard.press('Tab');
  });

  test('images that convey content have accessible names', async ({ page }) => {
    await openCV(page);
    await expect(page.locator('#profile-photo')).toHaveAttribute('alt', /.+/);
  });

  test('admin login form has labels', async ({ page }) => {
    await openAdmin(page);
    await expect(page.locator('label[for="email"]')).toBeVisible();
    await expect(page.locator('label[for="password"]')).toBeVisible();
  });
});
