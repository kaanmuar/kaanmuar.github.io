const fs = require('fs');
const path = require('path');
const { test, expect } = require('./net-guard');
const { skipSiteTours } = require('./helpers.js');

const treeGridModule = path.join(__dirname, '..', 'js', 'runner-tree-grid.js');
const qaLabSrc = path.join(__dirname, '..', 'js', 'qa-lab.js');
const treeGridWired =
	fs.existsSync(treeGridModule) &&
	fs.existsSync(qaLabSrc) &&
	fs.readFileSync(qaLabSrc, 'utf8').includes('runner-tree-grid.js');

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

test.describe('Runner Tree-Grid smoke (#3832)', () => {
	test.skip(!treeGridWired, 'Tree-Grid module/wiring not on this branch yet (see PR #4161)');

	test.beforeEach(async ({ page }) => {
		await skipSiteTours(page);
		await page.addInitScript(() => {
			try {
				localStorage.setItem('theme', 'light');
				localStorage.setItem('cv-preferred-lang', 'en');
				localStorage.removeItem('qa-lab-runner-tree-grid');
			} catch (e) {
				/* ignore */
			}
		});
	});

	test('qa-lab ?treegrid=1 mounts role=treegrid without console errors', async ({ page }) => {
		const pageErrors = [];
		const consoleErrors = [];
		page.on('pageerror', (err) => pageErrors.push(String(err && err.message ? err.message : err)));
		page.on('console', (msg) => {
			if (msg.type() === 'error') consoleErrors.push(msg.text());
		});

		await page.goto('/qa-lab.html?treegrid=1');
		await page.locator('#runner-edge').click();
		await expect(page.locator('#runner-drawer.open')).toBeVisible({ timeout: 15000 });

		const gridRoot = page.locator('.runner-treegrid, [role="treegrid"]');
		await expect(gridRoot.first()).toBeVisible({ timeout: 15000 });
		await expect(page.getByRole('treegrid', { name: /Runner results/i })).toBeVisible();

		expect(pageErrors, 'pageerrors: ' + pageErrors.join(' | ')).toEqual([]);
		expect(consoleErrors, 'console errors: ' + consoleErrors.join(' | ')).toEqual([]);
	});
});
