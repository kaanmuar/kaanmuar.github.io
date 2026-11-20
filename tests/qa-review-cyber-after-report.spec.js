const { test, expect } = require('./net-guard');
const fs = require('fs');
const sample = require('../assets/qa-review-sample.json');

// A mocked paid report with a critical attack-source finding. It exercises the two after-report options of #3850
// that Carlos asked to check by hand: the evidence PDF (#3925) and the owner-notice offer (#3926).
const TERMS = fs
	.readFileSync(require('path').join(__dirname, '../js/qa-review.js'), 'utf8')
	.match(/TERMS_VERSION = ['"]([^'"]+)['"]/)[1];
const ID = 'af12cd34ef56';
// The smallest valid-looking PDF; the browser only has to turn it into a download.
const TINY_PDF = Buffer.from('%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF').toString('base64');

const TARGETED = {
	host: 'example.org',
	checkedAt: '2026-11-19T12:00:00Z',
	status: 'critical',
	level: 'critical',
	hosting: { ip: '198.51.100.42', country: 'NL', asn: 24940, asName: 'Hetzner Online GmbH' },
	context: { country: 'NL', cyberMentions15m: 3, kevCatalogCount: 1200 },
	items: [
		{
			level: 'critical',
			kind: 'c2-indicator',
			role: 'host_used',
			confidence: 'third_party',
			subject: '198.51.100.42',
			source: 'Feodo Tracker',
			evidence: 'Feodo Tracker lists 198.51.100.42 as an active C2 endpoint',
			first_seen: '2026-11-18T00:00:00Z',
			last_seen: '2026-11-19T00:00:00Z',
		},
	],
	sourcesRead: ['Feodo Tracker', 'CISA KEV', 'OSV.dev'],
	sourcesSkipped: [],
	attributions: ['abuse.ch Feodo Tracker'],
};

function finding(key, severity, title) {
	return { key, area: 'Security', verdict: 'fail', severity, title, evidence: title + '.', fix: 'Fix it.' };
}

function reportWith(level) {
	const report = JSON.parse(JSON.stringify(sample.report));
	report.id = ID;
	report.targeted = TARGETED;
	const row = finding('sec-feodo', level, 'The host IP is listed as a botnet command-and-control indicator');
	report.insights.findings = [row].concat(report.insights.findings);
	return report;
}

async function openReport(page, { path = '/qa-review.html', paid = true, report }) {
	const calls = [];
	await page.addInitScript((version) => {
		try {
			sessionStorage.setItem('qa-review-terms', version);
			localStorage.setItem('hasSeenReviewTour', 'true');
			localStorage.setItem('qa-review-analytics', 'necessary');
		} catch (e) {
			/* storage is optional */
		}
	}, TERMS);
	await page.route(/ipwho\.is/, (route) => route.fulfill({ contentType: 'application/json', body: '{"success":false}' }));
	await page.route('http://127.0.0.1:8768/**', (route) => {
		const req = route.request();
		const reqPath = new URL(req.url()).pathname;
		const cors = {
			'access-control-allow-origin': req.headers().origin || '*',
			'access-control-allow-credentials': 'true',
			'access-control-allow-headers': 'content-type',
		};
		if (req.method() === 'OPTIONS')
			return route.fulfill({ status: 204, headers: Object.assign({ 'access-control-allow-methods': 'GET,POST' }, cors) });
		const json = (data) =>
			route.fulfill({ status: 200, contentType: 'application/json', headers: cors, body: JSON.stringify(data) });
		if (req.method() === 'POST') calls.push({ path: reqPath, body: req.postDataJSON() });
		if (reqPath === '/review/open') return json({ report, frameworks: sample.frameworks, paid });
		if (reqPath === '/review/owner-notice') return json({ ok: true });
		if (reqPath === '/account/evidence/pdf') return json({ pdf: TINY_PDF, filename: 'qa-lab-attack-evidence.pdf' });
		return json(reqPath === '/auth/providers' ? { providers: [{ id: 'email' }] } : { items: [] });
	});
	await page.goto(path + '?report=' + ID);
	await expect(page.locator('#cases .case').first()).toBeVisible();
	// The mock stands in for a signed-in payer: the real sign-in flow is covered elsewhere.
	await page.evaluate(() => {
		window.ReviewAuth = Object.assign(window.ReviewAuth || {}, {
			signedIn: () => true,
			proof: () => ({ session: 'mock' }),
		});
	});
	return calls;
}

test.describe('After-report options on a paid report with attack-source findings (#3850)', () => {
	test('a critical finding offers both the evidence PDF and the owner notice; each click does one thing', async ({
		page,
	}) => {
		const calls = await openReport(page, { report: reportWith('critical') });
		await expect(page.locator('#targeted')).toBeVisible();
		const owner = page.locator('[data-act="owner-notice-offer"]');
		const pdf = page.locator('#targeted-evidence-pdf');
		await expect(owner).toBeVisible();
		// Both after-report buttons are outlined the same way (the owner one once rendered with no border).
		const borders = await Promise.all([owner, pdf].map((el) => el.evaluate((n) => getComputedStyle(n).borderTopWidth)));
		expect(borders[0]).toBe(borders[1]);
		expect(borders[0]).not.toBe('0px');
		await expect(pdf).toBeVisible();
		// Nothing is sent until a click: the page load made no owner-notice or PDF request.
		expect(calls.filter((c) => c.path === '/review/owner-notice' || c.path === '/account/evidence/pdf')).toEqual([]);

		const [download] = await Promise.all([page.waitForEvent('download'), pdf.click()]);
		expect(download.suggestedFilename()).toBe('qa-lab-attack-evidence.pdf');
		const pdfCall = calls.find((c) => c.path === '/account/evidence/pdf');
		expect(pdfCall.body.id).toBe(ID);
		expect(calls.some((c) => c.path === '/review/owner-notice')).toBe(false);

		await owner.click();
		await expect(page.locator('.targeted-owner-status')).toContainText(/sent|owner/i);
		const sent = calls.find((c) => c.path === '/review/owner-notice');
		expect(sent.body.attackOffer).toBe(true);
		expect(sent.body.send).toBe(true);
		expect(sent.body.id).toBe(ID);
		expect(calls.filter((c) => c.path === '/review/owner-notice')).toHaveLength(1);
		await expect(owner).toBeHidden();
	});

	test('a high finding gets the evidence PDF but no owner-notice offer', async ({ page }) => {
		await openReport(page, { report: reportWith('high') });
		await expect(page.locator('#targeted-evidence-pdf')).toBeVisible();
		await expect(page.locator('[data-act="owner-notice-offer"]')).toHaveCount(0);
	});

	test('an unpaid report shows neither option', async ({ page }) => {
		await openReport(page, { paid: false, report: reportWith('critical') });
		await expect(page.locator('#targeted')).toBeHidden();
		await expect(page.locator('#targeted-evidence-pdf')).toHaveCount(0);
		await expect(page.locator('[data-act="owner-notice-offer"]')).toHaveCount(0);
	});

	test('the Spanish page labels both options in Spanish and does not overflow a phone', async ({ page }) => {
		await page.setViewportSize({ width: 390, height: 844 });
		await openReport(page, { path: '/qa-review-es.html', report: reportWith('critical') });
		const owner = page.locator('[data-act="owner-notice-offer"]');
		const pdf = page.locator('#targeted-evidence-pdf');
		await expect(owner).toBeVisible();
		await expect(pdf).toBeVisible();
		expect(await owner.innerText()).not.toMatch(/Send this to the site owner/);
		expect(await pdf.innerText()).not.toMatch(/evidence/i);
		const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
		expect(overflow).toBeLessThanOrEqual(1);
	});
});
