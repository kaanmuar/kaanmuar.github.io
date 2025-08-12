const { test, expect } = require('@playwright/test');
const { CVPage } = require('./CVPage.js');
const { AdminPage } = require('./AdminPage.js');

// --- Main Test Suite ---
test.describe('Interactive CV & Admin - Full QA Coverage', () => {

  // These tests run on a DESKTOP viewport
  test.describe('Desktop Scenarios', () => {

    test.beforeEach(async ({ page }) => {
      const cvPage = new CVPage(page);
      await cvPage.visit();
    });

    test('[Positive] should correctly toggle dark mode and persist the setting', async ({ page }) => {
      const cvPage = new CVPage(page);
      await expect(cvPage.html).not.toHaveClass(/dark-mode/);
      await cvPage.themeToggle.click();
      await expect(cvPage.html).toHaveClass(/dark-mode/);

      await page.reload();
      await expect(cvPage.html).toHaveClass(/dark-mode/);
    });

    test('[Positive] should filter the toolkit by clicking a dynamic radar chart label', async ({ page }) => {
      const cvPage = new CVPage(page);
      await cvPage.competenciesRadarChart.locator('g.radar-label:has-text("QA & Automation")').click();

      await expect(page.locator('#toolkit-heading')).toBeInViewport();
      await expect(page.locator('.tech-tag:has-text("Selenium")')).toHaveClass(/selected/);
      await expect(page.locator('.tech-tag:has-text("Cypress")')).toHaveClass(/selected/);
    });
  });

  // These tests run on a MOBILE viewport
  test.describe('Mobile Scenarios', () => {
    // Use a mobile viewport for all tests in this suite
    test.use({ viewport: { width: 375, height: 667 } });

    test.beforeEach(async ({ page }) => {
      const cvPage = new CVPage(page);
      await cvPage.visit();
    });

    test('[Positive][Mobile] should display the mobile toolbar and hide the desktop controls', async ({ page }) => {
      const cvPage = new CVPage(page);
      await expect(cvPage.mobileToolbar).toBeVisible();
      await expect(cvPage.themeToggle).not.toBeVisible();
    });

    test('[Positive][Mobile] should make the mobile toolbar sticky on scroll', async ({ page }) => {
      const cvPage = new CVPage(page);
      await expect(cvPage.mobileToolbar).not.toHaveClass(/is-sticky/);
      await page.evaluate(() => window.scrollTo(0, 200));
      await expect(cvPage.mobileToolbar).toHaveClass(/is-sticky/);
    });
  });

  // These tests cover the Admin Panel functionality
  test.describe('Admin Panel Scenarios', () => {
    // For admin tests, we need a valid login. Replace with your credentials.
    // It's best to use environment variables for this in a real project.
    const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'kaanmuar@gmail.com';
    const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'your-admin-password';

    test.beforeEach(async ({ page }) => {
      const adminPage = new AdminPage(page);
      // Check if login credentials are provided before running tests
      if (!ADMIN_PASSWORD || ADMIN_PASSWORD === 'your-admin-password') {
        test.skip(true, 'Admin password not set. Skipping admin tests.');
        return;
      }
      await adminPage.login(ADMIN_EMAIL, ADMIN_PASSWORD);
    });

    test('[Positive] should approve a rating and make it a public testimonial with a response', async ({ page }) => {
      const adminPage = new AdminPage(page);
      const cvPage = new CVPage(page);

      // Step 1: Create a new rating to test with
      const ratingComment = `A fantastic rating from Playwright! ${Date.now()}`;
      await cvPage.visit();
      await page.locator('#contact-widget-fab').click();
      await page.locator('#rating-tab').click();
      await page.locator('#rater-name').type('Playwright User');
      await page.locator('#rater-email').type(`playwright_${Date.now()}@test.com`);
      await page.locator('.star[data-value="5"]').click();
      await page.locator('#rater-comment').type(ratingComment);
      await page.locator('#send-rating-btn').click();
      await expect(page.locator('#widget-status-container:has-text("Rating Submitted!")')).toBeVisible();

      // Step 2: Go to the admin panel and approve it
      await page.goto('/admin.html');
      await adminPage.navigateToTab('ratings');
      await adminPage.performActionOnCard('#ratings-pane', ratingComment, 'approve');
      const approvedCard = await adminPage.findCardByContent('#ratings-pane', ratingComment);
      await expect(approvedCard.locator(':has-text("Approved")')).toBeVisible();

      // Step 3: Respond and make it public
      const responseText = 'Thank you from the Playwright test suite!';
      await adminPage.respondToCard('#ratings-pane', ratingComment, { response: responseText, isPublic: true });

      // Step 4: Verify it appears on the public CV
      await cvPage.visit();
      await cvPage.testimonialsSection.scrollIntoViewIfNeeded();
      const testimonialCard = page.locator(`.testimonial-card:has-text("${ratingComment}")`);
      await expect(testimonialCard).toBeVisible();
      await expect(testimonialCard.locator('.testimonial-stars')).toContainText('★★★★★');
      await expect(testimonialCard.locator('.admin-response')).toContainText(responseText);
    });
  });
});