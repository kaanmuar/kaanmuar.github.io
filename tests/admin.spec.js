const { test, expect } = require('@playwright/test');
const { AdminPage } = require('./AdminPage.js');
const { openCV } = require('./helpers.js');

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

    test('logs in and shows dashboard tabs', async ({ page }) => {
      const admin = new AdminPage(page);
      await admin.login(ADMIN_EMAIL, ADMIN_PASSWORD);
      await expect(page.locator('#messages-tab-btn')).toBeVisible();
      await expect(page.locator('#ratings-tab-btn')).toBeVisible();
      await expect(page.locator('#rejected-tab-btn')).toBeVisible();
      await expect(page.locator('#blocked-tab-btn')).toBeVisible();
      await expect(page.locator('#stats-tab-btn')).toBeVisible();
    });

    test('can switch between admin tabs', async ({ page }) => {
      const admin = new AdminPage(page);
      await admin.login(ADMIN_EMAIL, ADMIN_PASSWORD);
      await admin.navigateToTab('ratings');
      await admin.navigateToTab('stats');
      await admin.navigateToTab('messages');
    });

    test('approves a rating and publishes a testimonial', async ({ page }) => {
      const admin = new AdminPage(page);
      const ratingComment = `Playwright rating ${Date.now()}`;
      await openCV(page, { theme: 'light' });
      await page.locator('#contact-widget-fab').click();
      await page.locator('#rating-tab').click();
      await page.locator('#rater-name').fill('Playwright User');
      await page.locator('#rater-email').fill(`pw_${Date.now()}@example.com`);
      await page.locator('.star[data-value="5"]').click();
      await page.locator('#rater-comment').fill(ratingComment);
      await page.locator('#send-rating-btn').click();
      await expect(page.locator('#widget-status-container')).toContainText(/Rating Submitted|Submitted|Sent/i);

      await admin.login(ADMIN_EMAIL, ADMIN_PASSWORD);
      await admin.navigateToTab('ratings');
      await admin.performActionOnCard('#ratings-pane', ratingComment, 'approve');
      const approved = await admin.findCardByContent('#ratings-pane', ratingComment);
      await expect(approved).toContainText(/Approved/i);
      await admin.respondToCard('#ratings-pane', ratingComment, {
        response: 'Thanks from Playwright.',
        isPublic: true
      });

      await openCV(page, { theme: 'light' });
      await page.locator('#testimonials-section').scrollIntoViewIfNeeded();
      const card = page.locator(`.testimonial-card:has-text("${ratingComment}")`);
      await expect(card).toBeVisible();
      await expect(card.locator('.admin-response')).toContainText('Thanks from Playwright.');
    });
  });
});
