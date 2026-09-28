const { test, expect } = require('@playwright/test');
const { AdminPage } = require('./AdminPage.js');

const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'kaanmuar@gmail.com';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '';

test.describe('Admin panel', () => {
  test('shows login overlay when unauthenticated', async ({ page }) => {
    const admin = new AdminPage(page);
    await admin.goto();
    await expect(admin.loginOverlay).toBeVisible();
    await expect(admin.dashboard).toBeHidden();
    await expect(page.locator('#admin-home')).toBeVisible();
  });

  test('rejects an empty login attempt', async ({ page }) => {
    const admin = new AdminPage(page);
    await admin.goto();
    await admin.submitButton.click();
    await expect(admin.emailInput).toHaveJSProperty('validity.valueMissing', true);
  });

  test('rejects invalid credentials without opening the dashboard', async ({ page }) => {
    const admin = new AdminPage(page);
    await admin.goto();
    await admin.emailInput.fill('nobody@example.com');
    await admin.passwordInput.fill('wrong-password-000');
    await admin.submitButton.click();
    await expect(admin.dashboard).toBeHidden();
    await expect(admin.loginOverlay).toBeVisible();
  });

  test.describe('authenticated flows', () => {
    test.skip(!ADMIN_PASSWORD, 'Set ADMIN_PASSWORD to run live admin tests.');

    test('keeps the dashboard behind the authenticator', async ({ page }) => {
      const admin = new AdminPage(page);
      await admin.login(ADMIN_EMAIL, ADMIN_PASSWORD);
      await expect(page.locator('#login-form')).toBeHidden();
      await expect(page.locator('#messages-tab-btn')).toBeHidden();
    });

    test('asks for a 6-digit code on the authenticator step', async ({ page }) => {
      const admin = new AdminPage(page);
      await admin.login(ADMIN_EMAIL, ADMIN_PASSWORD);
      const step = admin.authenticatorStep();
      await expect(step.locator('label')).toContainText('Authenticator code');
      await expect(step.locator('input[inputmode="numeric"]')).toBeVisible();
    });

    test('a short code stays on the authenticator step', async ({ page }) => {
      const admin = new AdminPage(page);
      await admin.login(ADMIN_EMAIL, ADMIN_PASSWORD);
      const step = admin.authenticatorStep();
      await step.locator('input[inputmode="numeric"]').fill('12');
      await step.locator('button[type="submit"]').click();
      await expect(admin.dashboard).toBeHidden();
      await expect(step.locator('#mfa-error, #mfa-enroll-error')).not.toHaveText('');
    });
  });
});
