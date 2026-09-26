const { test, expect } = require('@playwright/test');
const { openCV, openAdmin, runAxe } = require('./helpers.js');

test.describe('Accessibility', () => {
  test('CV has no serious WCAG 2 A/AA axe violations outside the widget', async ({ page }) => {
    await openCV(page, { theme: 'light' });
    const results = await runAxe(page, { exclude: ['#contact-widget', '.skiptranslate'] });
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

  test('CV tour card is a labelled dialog and takes focus', async ({ page }) => {
    await openCV(page);
    await page.locator('#tour-start-btn').first().click();
    const card = page.locator('#tour-tooltip');
    await expect(card).toBeVisible();
    await expect(card).toHaveAttribute('role', 'dialog');
    await expect(card).toBeFocused();
    await expect(page.locator('#tour-title')).not.toHaveText('');
    await expect(page.locator('#tour-description')).not.toHaveText('');
    await expect(page.locator('#tour-close-btn')).toHaveText('Close');
    await expect(page.locator('#tour-next-btn')).toHaveText('Next');
    const tourAxe = await runAxe(page, { include: '#tour-tooltip', contrast: true });
    const serious = tourAxe.violations.filter((v) => ['serious', 'critical'].includes(v.impact));
    expect(serious, JSON.stringify(serious.map((v) => v.id))).toEqual([]);
    await page.keyboard.press('Escape');
    await expect(card).toBeHidden();
  });

  test('studio tour card is a labelled dialog and takes focus', async ({ page }) => {
    await page.addInitScript(() => sessionStorage.setItem('hasSeenStudioTour', 'true'));
    await page.goto('/simulador.html');
    await page.locator('#tour-start-btn').click();
    const card = page.locator('#site-tour-tooltip');
    await expect(card).toBeVisible();
    await expect(card).toHaveAttribute('role', 'dialog');
    await expect(card).toBeFocused();
    await expect(page.locator('#site-tour-title')).toHaveText('Sprint views');
    await expect(page.locator('#site-tour-body')).not.toHaveText('');
    await page.keyboard.press('Escape');
    await expect(card).toBeHidden();
  });

  test('lab tour card is a labelled dialog and takes focus', async ({ page }) => {
    await page.addInitScript(() => {
      sessionStorage.setItem('hasSeenLabTour', 'true');
      sessionStorage.setItem('qa-lab-fw-asked', '1');
    });
    await page.goto('/qa-lab.html');
    await page.locator('#tour-start-btn').click();
    const card = page.locator('#site-tour-tooltip');
    await expect(card).toBeVisible();
    await expect(card).toHaveAttribute('role', 'dialog');
    await expect(card).toBeFocused();
    await expect(page.locator('#site-tour-title')).toHaveText('The catalog');
    await expect(page.locator('#site-tour-body')).not.toHaveText('');
    await page.keyboard.press('Escape');
    await expect(card).toBeHidden();
  });

  test('admin login form has labels', async ({ page }) => {
    await openAdmin(page);
    await expect(page.locator('label[for="email"]')).toBeVisible();
    await expect(page.locator('label[for="password"]')).toBeVisible();
  });
});
