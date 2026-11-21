const { test, expect } = require('./net-guard');

const TERMS = require('fs')
	.readFileSync(require('path').join(__dirname, '../js/qa-review.js'), 'utf8')
	.match(/TERMS_VERSION = ['"]([^'"]+)['"]/)[1];

async function prime(page, skin) {
	await page.addInitScript(
		({ version, skin }) => {
			try {
				sessionStorage.setItem('qa-review-terms', version);
				localStorage.setItem('hasSeenReviewTour', 'true');
				localStorage.setItem('qa-review-analytics', 'necessary');
				if (skin) sessionStorage.setItem('qa-review-arena-skin', skin);
			} catch (e) {
				/* storage is optional */
			}
		},
		{ version: TERMS, skin }
	);
	await page.route(/\/news\?/, (route) =>
		route.fulfill({
			contentType: 'application/json',
			headers: { 'access-control-allow-origin': '*' },
			body: '{"items":[]}',
		})
	);
	await page.route(/ipwho\.is/, (route) =>
		route.fulfill({ contentType: 'application/json', body: '{"success":false}' })
	);
}

const snap = (page) => page.evaluate(() => window.ReviewArena.snapshot());

test.describe('Review arena live facts', () => {
	test('WIP while a stage runs; tick only after it passes', async ({ page }) => {
		await prime(page, 'lab');
		await page.goto('/qa-review.html');
		await page.evaluate(() => {
			ReviewProgress.start({ host: 'example.com', pages: 5 });
			ReviewProgress.line('Reading robots.txt.');
		});
		let s = await snap(page);
		expect(s.stages.robots).toBe('wip');
		await expect(page.locator('.ra--lab .ra-canvas')).toBeVisible();
		expect(s.items.robots).toBe('wip');
		await page.evaluate(() => {
			ReviewProgress.line('12 same-host links were listed. This review opens at most 5 HTML pages and 2 links deep.');
		});
		s = await snap(page);
		expect(s.stages.robots).toBe('done');
		expect(s.stages.crawl).toBe('done');
		expect(s.items.robots).toBe('done');
		expect(s.items.crawl).toBe('done');
	});

	test('console lanes show live status and stay out of the internal tool name', async ({ page }) => {
		await prime(page, 'console');
		await page.goto('/qa-review.html');
		await page.evaluate(() => {
			ReviewProgress.start({ host: 'example.com', pages: 5 });
			ReviewProgress.line('Checking that the address is public https.');
			ReviewProgress.line('Opening the first page.');
			ReviewProgress.line('Reading robots.txt.');
		});
		await expect(page.locator('.ra--console .rc')).toBeVisible();
		await page.waitForFunction(() => window.ReviewArena.snapshot().ready);
		const s = await snap(page);
		expect(s.skin).toBe('console');
		expect(s.items.fields).toBe('done');
		expect(s.items.robots).toBe('wip');
		expect(s.items.save).toBe('idle');
		await expect(page.locator('.ln[data-id="robots"]').first()).toHaveClass(/s-wip/);
		await expect(page.locator('.ln[data-id="fields"]').first()).toHaveClass(/s-done/);
		// a real DOM, not a picture: no canvas, and the plain log stays only for screen readers
		await expect(page.locator('.ra .ra-canvas')).toHaveCount(0);
		const hidden = await page.evaluate(() => document.getElementById('run-log').getBoundingClientRect().height);
		expect(hidden).toBeLessThanOrEqual(1);
		// the internal tool name never shows to the customer
		const text = await page.evaluate(() => document.querySelector('.ra .rc-host').shadowRoot.textContent + document.querySelector('.ra').textContent);
		expect(text.toLowerCase()).not.toContain('jarvis');
		const img = await page.evaluate(() => Array.from(document.querySelector('.ra .rc-host').shadowRoot.querySelectorAll('img')).map((i) => i.getAttribute('src')));
		expect(img.join()).not.toMatch(/jarvis/i);
	});

	test('every console view opens and shows its own content', async ({ page }) => {
		await prime(page, 'console');
		await page.goto('/qa-review.html');
		await page.evaluate(() => {
			ReviewProgress.start({ host: 'example.com', pages: 5 });
			ReviewProgress.line('Checking that the address is public https.');
			ReviewProgress.line('Waiting for PageSpeed Insights, up to 20 s.');
			ReviewProgress.line("PageSpeed Insights did not answer (no answer). The browser's lab values stand in.");
		});
		await expect(page.locator('.rc')).toBeVisible();
		const views = {
			overview: '.v-overview .ring',
			systems: '.v-systems .sys',
			processes: '.v-processes .lane',
			agents: '.v-agents .ag',
			workflows: '.v-workflows .wf-step',
			infrastructure: '.v-infra .in',
			logs: '.v-logs .lg-row',
			alerts: '.v-alerts .al-row',
			settings: '.v-settings .seg',
		};
		for (const [id, marker] of Object.entries(views)) {
			await page.locator(`.rc [data-nav="${id}"]`).click();
			await expect(page.locator(`.rc-view[data-v="${id}"]`)).toBeVisible();
			await expect(page.locator(`.rc ${marker}`).first()).toBeVisible();
			await expect(page.locator('.rc .rc-h')).toHaveText(new RegExp(id === 'infrastructure' ? 'Infrastructure' : id, 'i'));
		}
		// the alert badge counts the failed PageSpeed read
		await expect(page.locator('.rc .rc-badge')).toHaveText('1');
	});

	test('View All Processes, the system filter, auto-refresh and Update do what they say', async ({ page }) => {
		await prime(page, 'console');
		await page.goto('/qa-review.html');
		await page.evaluate(() => {
			ReviewProgress.start({ host: 'example.com', pages: 5 });
			ReviewProgress.line('Reading robots.txt.');
		});
		await page.locator('.rc [data-nav="processes"]').click();
		await expect(page.locator('.rc .v-processes .pt-row:not([hidden])')).toHaveCount(1);
		await page.getByRole('button', { name: 'View All Processes' }).click();
		await expect(page.locator('.rc-view[data-v="all"]')).toBeVisible();
		await expect(page.locator('.rc .v-all .pt-row:not([hidden])')).toHaveCount(23);
		await page.getByRole('button', { name: 'Back to Processes' }).click();
		await expect(page.locator('.rc-view[data-v="processes"]')).toBeVisible();

		// the system filter narrows the table to one system
		await page.getByRole('button', { name: 'System filter' }).click();
		await page.getByRole('option', { name: 'Security' }).click();
		await expect(page.locator('.rc .v-processes .pt-row:not([hidden])')).toHaveCount(0);
		await page.getByRole('button', { name: 'System filter' }).click();
		await page.getByRole('option', { name: 'Crawl' }).click();
		await expect(page.locator('.rc .v-processes .pt-row:not([hidden])')).toHaveCount(1);
		await page.getByRole('button', { name: 'System filter' }).click();
		await page.getByRole('option', { name: 'All Systems' }).click();

		// auto-refresh off freezes the view; Update catches up
		await page.getByRole('switch', { name: 'Auto-refresh' }).click();
		await expect(page.locator('.rc .rc-paused')).toBeVisible();
		await page.evaluate(() => ReviewProgress.line('robots.txt was read.'));
		await expect(page.locator('.rc .ln[data-id="robots"]').first()).toHaveClass(/s-wip/);
		await page.getByRole('button', { name: 'Update' }).click();
		await expect(page.locator('.rc .ln[data-id="robots"]').first()).toHaveClass(/s-done/);
		await page.getByRole('switch', { name: 'Auto-refresh' }).click();
		await expect(page.locator('.rc .rc-paused')).toBeHidden();
	});

	test('full screen toggles on the console', async ({ page }) => {
		await prime(page, 'console');
		await page.goto('/qa-review.html');
		await page.evaluate(() => ReviewProgress.start({ host: 'example.com', pages: 5 }));
		const button = page.locator('.rc button[title="Full screen"]');
		await button.click();
		await expect(page.locator('.rc')).toHaveClass(/is-(pseudo)?full/);
		await page.locator('.rc button[aria-pressed="true"]').click();
		await expect(page.locator('.rc')).not.toHaveClass(/is-full|is-pseudofull/);
	});

	test('PageSpeed miss fails lighthouse without a pass tick', async ({ page }) => {
		await prime(page, 'lab');
		await page.goto('/qa-review.html');
		await page.evaluate(() => {
			ReviewProgress.start({ host: 'example.com', pages: 5 });
			ReviewProgress.line('Waiting for PageSpeed Insights, up to 20 s.');
			ReviewProgress.line("PageSpeed Insights did not answer (no answer). The browser's lab values stand in.");
		});
		const s = await snap(page);
		expect(s.stages.lighthouse).toBe('fail');
		expect(s.anomaly).toBe('fail');
		expect(s.items.lighthouse).toBe('fail');
	});

	test('core review lines are recognized by FACTS', async ({ page }) => {
		await prime(page, 'lab');
		await page.goto('/qa-review.html');
		const missed = await page.evaluate(() => {
			const samples = [
				'Checking that the address is public https.',
				'Soft preview: this run reads only the pasted URL (1 page), then frosts the rest.',
				'Opening the first page.',
				'Asking PageSpeed Insights for a mobile Lighthouse run in the background.',
				'Searching for public write-ups about example.com in the background.',
				'Reading robots.txt.',
				'Opening the start page in a headless browser alongside the analysis.',
				'First page answered 200 in 420 ms. Title: Example. 12000 bytes.',
				'12 same-host links were listed. This review opens at most 8 HTML pages and 2 links deep.',
				'Opening /about.',
				'Analyzed 5 pages. Writing the proposed cases now.',
				'Waiting for the headless browser to finish.',
				'Proposed 14 test cases across 6 layers.',
				'Waiting for the background checks to finish.',
				"Google's Safe Browsing lists do not flag the site.",
				'Spam blocklists: zen.spamhaus.org answered; nothing listed.',
				'Lookalike domains: 2 of 40 checked exist, 0 with a website or mail and no tie to the site.',
				'WordPress 6.4: 3 plugins and themes seen, 2 with a version.',
				'DNS for example.com: SPF found, DMARC found, 1 MX, 0 CAA, MTA-STS missing, TLS-RPT missing, BIMI missing.',
				'Hacked-site checks: no planted spam paths; search clean.',
				'Reading attack and exploit sources for example.com.',
				'Attack and exploit sources read: CISA KEV, OSV.dev.',
				'Checked 12 well-known paths for exposed files; none gave out content.',
				'Waiting for PageSpeed Insights, up to 12 s.',
				'PageSpeed Insights answered: Lighthouse performance 78/100 on mobile, without enough real-user Chrome data.',
				'The browser pass finished in 18 s: 3 pages checked with axe-core.',
				'Scoring the checks from the pages analyzed.',
				'Scored 42 checks: 2 fail, 5 at risk, 35 pass. Health 86/100.',
				'Signed the report.',
				'Stop requested.',
				'The time budget ended with 3 pages saved. This review was capped at 20.',
			];
			return samples.filter((line) => !window.ReviewArenaFacts.matchFact(line));
		});
		expect(missed).toEqual([]);
	});
});
