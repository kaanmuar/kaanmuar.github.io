const { test, expect } = require('./net-guard');
const { skipSiteTours } = require('./helpers.js');

test.describe('Landmark preview wire (#3832)', () => {
	test.beforeEach(async ({ page }) => {
		await skipSiteTours(page);
		await page.addInitScript(() => {
			try {
				localStorage.setItem('theme', 'light');
				localStorage.setItem('cv-preferred-lang', 'en');
				localStorage.removeItem('qa-landmarks');
			} catch (e) {
				/* ignore */
			}
		});
	});

	test('qa-lab hides the panel by default and shows it with ?landmarks=1', async ({ page }) => {
		await page.goto('/qa-lab.html');
		await expect(page.locator('#landmark-preview-panel')).toHaveCount(0);

		await page.goto('/qa-lab.html?landmarks=1');
		const panel = page.locator('#landmark-preview-panel');
		await expect(panel).toBeVisible({ timeout: 15000 });
		await expect(panel.locator('.landmark-preview__lines li').first()).toBeVisible();
		await expect(panel.getByText('Landmark preview')).toBeVisible();
	});

	test('qa-review shows the panel with ?landmarks=1', async ({ page }) => {
		await page.goto('/qa-review.html?landmarks=1');
		const panel = page.locator('#landmark-preview-panel');
		await expect(panel).toBeVisible({ timeout: 15000 });
		await expect(panel.locator('.landmark-preview__lines li, .landmark-preview__empty').first()).toBeVisible();
	});
});
