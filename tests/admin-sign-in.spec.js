const { test, expect } = require('@playwright/test');

test.describe('admin sign-in', () => {
  test('offers email and password or an emailed link, and no Google', async ({ page }) => {
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto('/admin.html');
    await expect(page.locator('#login-form')).toBeVisible();
    await expect(page.locator('#login-link')).toHaveText('Email me a sign-in link');
    await expect(page.locator('#link-form')).toBeHidden();
    await expect(page.locator('#login-overlay')).not.toContainText(/google/i);
    await page.locator('#login-link').click();
    await expect(page.locator('#login-note')).toHaveText('');
    expect(await page.locator('#email').evaluate((input) => input.validity.valid)).toBe(false);
    expect(errors).toEqual([]);
  });

  test('a link opened in a browser that did not ask for it asks which email it went to', async ({ page }) => {
    await page.goto('/admin.html?mode=signIn&oobCode=abc&apiKey=AIzaSyA2-6WkecV3GoAK4qlsdGtH3jisjk3bK0w');
    await expect(page.locator('#link-form')).toBeVisible();
    await expect(page.locator('#login-form')).toBeHidden();
  });
});
