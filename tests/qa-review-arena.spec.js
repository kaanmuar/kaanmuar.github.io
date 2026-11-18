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

	test('Jarvis lanes show live status on the painted board', async ({ page }) => {
		await prime(page, 'jarvis');
		await page.goto('/qa-review.html');
		await page.evaluate(() => {
			ReviewProgress.start({ host: 'example.com', pages: 5 });
			ReviewProgress.line('Checking that the address is public https.');
			ReviewProgress.line('Opening the first page.');
			ReviewProgress.line('Reading robots.txt.');
		});
		await expect(page.locator('.ra--jarvis .ra-canvas')).toBeVisible();
		await page.waitForFunction(() => window.ReviewArena.snapshot().ready);
		const s = await snap(page);
		expect(s.items.fields).toBe('done');
		expect(s.items.robots).toBe('wip');
		expect(s.items.save).toBe('idle');
		// the board is painted: the canvas is not blank
		const painted = await page.evaluate(() => {
			const c = document.querySelector('.ra-canvas');
			const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
			let lit = 0;
			for (let i = 0; i < d.length; i += 400) if (d[i] + d[i + 1] + d[i + 2] > 60) lit++;
			return lit;
		});
		expect(painted).toBeGreaterThan(200);
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
