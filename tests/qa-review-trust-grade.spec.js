const { test, expect } = require('./net-guard');
const sample = require('../assets/qa-review-sample.json');

// The trust grade card in the fix kit (#3958): the letter, the fix-first rows and the helmet snippet.
const TERMS = require('fs')
	.readFileSync(require('path').join(__dirname, '../js/qa-review.js'), 'utf8')
	.match(/TERMS_VERSION = ['"]([^'"]+)['"]/)[1];

function withTrust() {
	const copy = JSON.parse(JSON.stringify(sample));
	const ins = copy.report.insights;
	const first = ins.findings.find((item) => item.verdict === 'fail' || item.verdict === 'risk') || ins.findings[0];
	ins.trust = { score: 72, grade: 'B', capped: false, rows: [{ key: first.key, severity: first.severity, points: 20 }], bonus: [] };
	ins.fixkit = Object.assign({}, ins.fixkit, { helmet: 'const helmet = require("helmet");\napp.use(helmet({}));\n' });
	return { copy, firstKey: first.key };
}

async function open(page, body) {
	await page.addInitScript((version) => {
		try {
			sessionStorage.setItem('qa-review-terms', version);
			localStorage.setItem('hasSeenReviewTour', 'true');
			localStorage.setItem('qa-review-analytics', 'necessary');
			localStorage.setItem('cv-preferred-lang', 'en');
		} catch (e) {
			/* storage is optional */
		}
	}, TERMS);
	await page.route(/ipwho\.is/, (route) => route.fulfill({ contentType: 'application/json', body: '{"success":false}' }));
	await page.route(/qa-review-sample(\.[a-z]{2})?\.json/, (route) =>
		route.fulfill({ contentType: 'application/json', body: JSON.stringify(body) })
	);
	await page.goto('/qa-review.html');
	await page.locator('#stage-sample-open').click();
	await expect(page.locator('#report-index')).toBeVisible();
}

test.describe('Trust grade card (#3958)', () => {
	test('the fix kit shows the grade, the fix-first rows and the helmet snippet', async ({ page }) => {
		const { copy } = withTrust();
		await open(page, copy);
		const card = page.locator('#fixkit [data-trust-grade="B"]');
		await expect(card).toBeVisible();
		await expect(card.locator('.trust-letter')).toHaveText('B');
		await expect(card.locator('[data-kit="trust-fix"] li')).toHaveCount(1);
		await expect(page.locator('#fixkit [data-trust-helmet]')).toContainText('helmet');
	});

	test('a report without a trust grade shows no card', async ({ page }) => {
		await open(page, sample);
		await expect(page.locator('#fixkit [data-trust-grade]')).toHaveCount(0);
	});
});
