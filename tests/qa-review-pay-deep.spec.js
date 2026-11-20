const { test, expect } = require('./net-guard');

const REPORT_ID = 'abc123';

async function prime(page) {
	await page.addInitScript(() => {
		try {
			localStorage.setItem('qa-review-analytics', 'necessary');
		} catch (e) {
			/* storage is optional */
		}
	});
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

function mockCheckout(page, calls) {
	return page.route('http://127.0.0.1:8768/**', (route) => {
		const req = route.request();
		const url = new URL(req.url());
		const where = url.pathname.replace(/^\/reviewUrl/, '');
		const cors = { 'access-control-allow-origin': req.headers().origin || '*' };
		const json = (data) =>
			route.fulfill({ status: 200, contentType: 'application/json', headers: cors, body: JSON.stringify(data) });
		if (where === '/checkout/quote') {
			calls.quotes.push(url.search);
			return json({ cop: 76000, rate: 4000, usd: 19 });
		}
		if (where === '/checkout') {
			calls.checkouts.push(JSON.parse(req.postData() || '{}'));
			return json({ url: '/checkout-done' });
		}
		return json({ error: 'unexpected' });
	});
}

const cases = [
	{
		page: '/qa-review-pay.html',
		heading: 'The Deep attack-source check',
		item: 'Deep attack-source check for one report',
		copyRe: /separate one-off charge of 19 USD/,
	},
	{
		page: '/qa-review-pay-de.html',
		heading: 'Die Tiefenprüfung der Angriffsquellen',
		item: 'Tiefenprüfung der Angriffsquellen für einen Bericht',
		copyRe: /einmalige Gebühr von 19 USD/,
		englishLeak: /\b(The Deep|separate one-off|PayPal collects the payment|attack-source check for one report)\b/i,
	},
];

test.describe('Deep attack-source check payment page (#3946)', () => {
	for (const spec of cases) {
		test(spec.page + ' shows Deep copy and sends purpose=deep', async ({ page }) => {
			await prime(page);
			const calls = { quotes: [], checkouts: [] };
			await mockCheckout(page, calls);
			await page.goto(spec.page + '?purpose=deep&reportId=' + REPORT_ID);
			await expect(page.locator('#pay-heading')).toHaveText(spec.heading);
			await expect(page.locator('#pay-item')).toHaveText(spec.item);
			await expect(page.locator('#pay-copy')).toContainText('19');
			await expect(page.locator('#pay-copy')).toContainText(spec.copyRe);
			await expect(page.locator('#pay-amount')).toHaveText('19 USD');
			if (spec.englishLeak) await expect(page.locator('#pay-copy')).not.toContainText(spec.englishLeak);
			expect(calls.quotes[0]).toMatch(/purpose=deep/);
			expect(calls.quotes[0]).toMatch(/reportId=abc123/);
			await page.locator('#charge').click();
			await page.waitForTimeout(300);
			expect(calls.checkouts[0]).toMatchObject({ purpose: 'deep', reportId: REPORT_ID });
		});
	}
});