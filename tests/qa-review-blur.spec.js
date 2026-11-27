const { test, expect } = require('./net-guard');
const fs = require('fs');
const sample = require('../assets/qa-review-sample.json');

const TERMS = fs
	.readFileSync(require('path').join(__dirname, '../js/qa-review.js'), 'utf8')
	.match(/TERMS_VERSION = ['"]([^'"]+)['"]/)[1];
const ID = 'bl12cd34ef56';
const CLEAR =
	'h1, h2, h3, h4, th, button, label, input, select, textarea, script, style, svg, time, .filters, .fade-line, #kpis, #paid-line, #compare-ask, #rivals > p, .rivals-pick, #case-note, #alarm-note, #tool-note, #unlock-offer, .case-sample, #report-index';

async function openUnpaid(page, extra) {
	await page.addInitScript((version) => {
		try {
			sessionStorage.setItem('qa-review-terms', version);
			localStorage.setItem('hasSeenReviewTour', 'true');
			localStorage.setItem('qa-review-analytics', 'necessary');
		} catch (e) {
			/* storage is optional */
		}
	}, TERMS);
	await page.route(/ipwho\.is/, (route) =>
		route.fulfill({ contentType: 'application/json', body: '{"success":false}' })
	);
	await page.route('http://127.0.0.1:8768/**', (route) => {
		const req = route.request();
		const path = new URL(req.url()).pathname;
		const cors = {
			'access-control-allow-origin': req.headers().origin || '*',
			'access-control-allow-credentials': 'true',
			'access-control-allow-headers': 'content-type',
		};
		if (req.method() === 'OPTIONS')
			return route.fulfill({
				status: 204,
				headers: Object.assign({ 'access-control-allow-methods': 'GET,POST' }, cors),
			});
		const json = (data) =>
			route.fulfill({ status: 200, contentType: 'application/json', headers: cors, body: JSON.stringify(data) });
		if (path === '/review/open')
			return json(
				Object.assign(
					{ report: Object.assign({}, sample.report, { id: ID }), frameworks: sample.frameworks, paid: false },
					extra || {}
				)
			);
		return json(path === '/auth/providers' ? { providers: [{ id: 'email' }] } : { items: [] });
	});
	await page.goto('/qa-review.html?report=' + ID);
	await expect(page.locator('#cases .case').first()).toBeVisible();
}

test.describe('An unpaid report is blurred in every section, and its files cut where the blur starts', () => {
	test('no line longer than a short label is left in the clear outside headings, controls and scores', async ({
		page,
	}) => {
		await openUnpaid(page);
		await expect(page.locator('body')).toHaveClass(/preview-copy/);
		const open = await page.evaluate((clear) => {
			const left = [];
			const walker = document.createTreeWalker(document.getElementById('report'), NodeFilter.SHOW_TEXT);
			while (walker.nextNode()) {
				const node = walker.currentNode;
				if (node.parentElement.closest(clear)) continue;
				const line = node.nodeValue.trim();
				if (line.length > 16 && line.split(/\s+/).length >= 4) left.push(line.slice(0, 80));
			}
			return left;
		}, CLEAR);
		expect(open).toEqual([]);
		for (const id of ['exec', 'health', 'security', 'observed', 'report-log', 'report-visuals', 'cases']) {
			expect(await page.locator('#' + id + ' .case-fade').count(), id).toBeGreaterThan(0);
		}
	});

	test('the top case is shown in full as a sample, with its step, what is expected, and one script', async ({
		page,
	}) => {
		await openUnpaid(page);
		const cards = page.locator('#cases .case');
		const card = cards.first();
		await expect(card).toHaveClass(/case-sample/);
		await expect(page.locator('#cases .case-sample')).toHaveCount(1);
		await expect(card.locator('.case-sample-label')).toHaveText('Sample case, shown in full');
		await expect(card.locator('.case-fade')).toHaveCount(0);
		const top = sample.report.cases[0];
		await expect(card.locator('.id')).toHaveText(top.id);
		await expect(card.locator('strong')).toHaveText(top.title);
		await expect(card.locator('.case-split dt')).toHaveText(['Step', 'Expected']);
		await expect(card.locator('.case-split dd').first()).toHaveText(top.why.slice(0, top.why.indexOf('. ') + 1));
		await expect(card.locator('pre.case-script')).toHaveCount(1);
		await expect(card.locator('pre.case-script code')).not.toBeEmpty();
		await expect(card.locator('.case-script-fw')).toHaveText(/\S/);
		expect(await cards.nth(1).locator('.case-fade').count()).toBeGreaterThan(0);
		await expect(page.locator('#case-note')).toContainText('The top case is shown in full as a sample.');
	});

	test('a paid report has no sample card', async ({ page }) => {
		await openUnpaid(page, { paid: true });
		await expect(page.locator('body')).toHaveClass(/paid-copy/);
		await expect(page.locator('#cases .case-sample')).toHaveCount(0);
		await expect(page.locator('#cases .case-sample-label')).toHaveCount(0);
	});

	test('the fix list is the only primary offer; the full report is a line below', async ({ page }) => {
		await openUnpaid(page);
		const primary = page.locator('#unlock-offer a.offer');
		await expect(primary).toHaveCount(1);
		await expect(primary).toHaveClass(/offer-full/);
		await expect(primary).toContainText('Fix list · 5 USD');
		await expect(primary).toHaveAttribute('href', /purpose=fixlist&reportId=bl12cd34ef56/);
		const fullLine = page.locator('#unlock-offer .offer-secondary a[data-offer="report"]');
		await expect(fullLine).toHaveAttribute('href', /purpose=report/);
		await expect(fullLine).toContainText('Full report: 19 USD');
		await expect(page.locator('#unlock-offer .offer-local-compare')).toHaveCount(0);
	});

	test('a bought fix list clears the scores and findings, keeps the cases frosted, and leaves only the full report to buy', async ({
		page,
	}) => {
		await openUnpaid(page, { addons: ['fixlist'] });
		await expect(page.locator('body')).toHaveClass(/fix-open/);
		await expect(page.locator('#findings .case-fade')).toHaveCount(0);
		await expect(page.locator('#exec .case-fade')).toHaveCount(0);
		expect(await page.locator('#cases .case-fade').count()).toBeGreaterThan(0);
		const offers = page.locator('#unlock-offer a.offer');
		await expect(offers).toHaveCount(1);
		await expect(offers.first()).toHaveClass(/offer-full/);
		await expect(offers.first()).toHaveAttribute('href', /purpose=report/);
	});

	test('a local unpaid report adds the compare line under the fix-list offer', async ({ page }) => {
		const local = Object.assign({}, sample.report, {
			id: ID,
			insights: Object.assign({}, sample.report.insights, {
				findings: (sample.report.insights.findings || []).concat([
					{ key: 'local-profile', verdict: 'person', severity: 'low', msg: { title: { id: 'local-profile.title' } } },
				]),
			}),
		});
		await openUnpaid(page, { report: local });
		await expect(page.locator('#unlock-offer .offer-local-compare a[data-offer="compare"]')).toHaveAttribute(
			'href',
			'#compare'
		);
		await expect(page.locator('#unlock-offer .offer-local-compare')).toContainText('BrightLocal');
	});

	test('export on an unpaid report opens the checkout sheet instead of downloading (#4432)', async ({ page }) => {
		await openUnpaid(page);
		await page.locator('#export-toggle').click();
		const pay = page.locator('#pay');
		await expect(pay).toBeVisible();
		await expect(pay.locator('#pay-options .offer')).toHaveCount(1, { timeout: 5000 });
		await expect(page.locator('#export-menu')).toBeHidden();
	});
});

test('a report saved without counts still opens checkout when export is tapped unpaid (#1482, #4432)', async ({
	page,
}) => {
	const report = Object.assign({}, sample.report, { id: ID, counts: undefined });
	await openUnpaid(page, { report });
	const read = (report.limits && report.limits.pagesRead) || report.pages.length;
	expect(read).toBeGreaterThan(0);
	await page.locator('#export-toggle').click();
	await expect(page.locator('#pay')).toBeVisible();
});
