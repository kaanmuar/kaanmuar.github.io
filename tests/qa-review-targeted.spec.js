const { test, expect } = require('./net-guard');
const fs = require('fs');
const sample = require('../assets/qa-review-sample.json');

const TERMS = fs
	.readFileSync(require('path').join(__dirname, '../js/qa-review.js'), 'utf8')
	.match(/TERMS_VERSION = ['"]([^'"]+)['"]/)[1];
const ID = 'tg12cd34ef56';

const SAMPLE_TARGETED = {
	host: 'example.org',
	checkedAt: '2026-11-19T12:00:00Z',
	status: 'high',
	level: 'high',
	hosting: { ip: '198.51.100.42', country: 'NL', asn: 24940, asName: 'Hetzner Online GmbH' },
	context: { country: 'NL', cyberMentions15m: 3, kevCatalogCount: 1200 },
	items: [
		{
			level: 'high',
			kind: 'known-exploit-software',
			role: 'site_hit',
			confidence: 'inferred',
			subject: 'nginx@1.18.0 (CVE-2021-23017)',
			source: 'CISA KEV',
			source_ref: 'https://www.cisa.gov/known-exploited-vulnerabilities-catalog',
			evidence: 'CVE-2021-23017 listed in CISA KEV (EPSS 84%)',
			first_seen: '2021-05-25T00:00:00Z',
			last_seen: '2026-11-18T00:00:00Z',
		},
		{
			level: 'high',
			kind: 'c2-indicator',
			role: 'host_used',
			confidence: 'third_party',
			subject: '198.51.100.42',
			source: 'DROP network list',
			evidence: 'Hosting IP 198.51.100.42 falls inside hijacked/cybercrime prefix 198.51.100.0/24',
			first_seen: '2026-11-01T00:00:00Z',
			last_seen: '2026-11-19T00:00:00Z',
		},
	],
	sourcesRead: ['CISA KEV', 'OSV.dev', 'FIRST EPSS', 'Network DROP', 'GDELT Project'],
	sourcesSkipped: ['CertSpotter CT (no key)'],
	attributions: ['IP Geolocation by DB-IP', 'EPSS data provided by FIRST.org', 'GDELT Project (https://www.gdeltproject.org/)'],
};

async function openReport(page, { path = '/qa-review.html', paid = false, report = null } = {}) {
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
		const reqPath = new URL(req.url()).pathname;
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
		if (reqPath === '/review/open') {
			return json({
				report: report || Object.assign({}, sample.report, { id: ID, targeted: SAMPLE_TARGETED }),
				frameworks: sample.frameworks,
				paid,
			});
		}
		return json(reqPath === '/auth/providers' ? { providers: [{ id: 'email' }] } : { items: [] });
	});
	await page.goto(path + '?report=' + ID);
	await expect(page.locator('#cases .case').first()).toBeVisible();
}

test.describe('Was it targeted? section is paid-only and localized (#3818)', () => {
	test('stays completely hidden and empty on unpaid and preview reports', async ({ page }) => {
		await openReport(page, { paid: false });
		await expect(page.locator('#targeted-head')).toBeHidden();
		await expect(page.locator('#targeted')).toBeHidden();
		await expect(page.locator('#targeted')).toBeEmpty();
		const checksTitle = await page.locator('#report-index a[data-index-group="checks"]').getAttribute('title');
		expect(checksTitle || '').not.toContain('Was it targeted?');

		const previewReport = Object.assign({}, sample.report, {
			id: ID,
			preview: true,
			targeted: SAMPLE_TARGETED,
		});
		await openReport(page, { paid: true, report: previewReport });
		await expect(page.locator('#targeted-head')).toBeHidden();
		await expect(page.locator('#targeted')).toBeHidden();
		await expect(page.locator('#targeted')).toBeEmpty();
	});

	test('renders host context, items, CVE link, attributions and stays compliant on paid reports', async ({ page }) => {
		await openReport(page, { paid: true });
		await expect(page.locator('#targeted-head')).toBeVisible();
		await expect(page.locator('#targeted-head')).toHaveText('Was it targeted?');
		await expect(page.locator('#targeted')).toBeVisible();
		await expect(page.locator('#report-index a[data-index-group="checks"]')).toHaveAttribute(
			'title',
			/Was it targeted\?/
		);

		const text = await page.locator('#targeted').innerText();
		expect(text.toLowerCase()).toContain('high-risk targeting signals found');
		expect(text).toContain('198.51.100.42');
		expect(text).toContain('AS24940');
		expect(text).not.toContain('ASAS24940');
		expect(text).toContain('CVE-2021-23017');
		expect(text).toContain('DROP network list');
		expect(text).toContain('GDELT Project');
		expect(text).toContain('IP Geolocation by DB-IP');
		expect(text.toLowerCase()).not.toContain('spam' + 'haus');
		expect(text.toLowerCase()).not.toContain('url' + 'haus');
		expect(text.toLowerCase()).not.toContain('phish' + 'stats');

		const cveLink = page.locator('#targeted a[href="https://www.cve.org/CVERecord?id=CVE-2021-23017"]').first();
		await expect(cveLink).toBeVisible();
	});

	test('renders localized Spanish copy cleanly without overflow on phone viewports', async ({ page }) => {
		await page.setViewportSize({ width: 390, height: 844 });
		await openReport(page, { path: '/qa-review-es.html', paid: true });
		await expect(page.locator('#targeted-head')).toBeVisible();
		await expect(page.locator('#targeted-head')).toHaveText('¿Fue atacado?');
		await expect(page.locator('#targeted')).toContainText('Se encontraron señales de ataque de riesgo alto');
		const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
		expect(overflow).toBeLessThanOrEqual(1);
	});
});
