const { test, expect } = require('./net-guard');
const fs = require('fs');
const sample = require('../assets/qa-review-sample.json');

// The Deep attack-source check on a paid report (#3946): offered, run once after it is bought, shown in the Threat picture.
const TERMS = fs
	.readFileSync(require('path').join(__dirname, '../js/qa-review.js'), 'utf8')
	.match(/TERMS_VERSION = ['"]([^'"]+)['"]/)[1];
const ID = 'af12cd34ef56';

const TARGETED = {
	host: 'example.org',
	checkedAt: '2026-11-19T12:00:00Z',
	status: 'clear',
	level: 'info',
	hosting: { ip: '198.51.100.42', country: 'NL', asn: 24940, asName: 'Hetzner Online GmbH' },
	context: { country: 'NL', cyberMentions15m: 3, kevCatalogCount: 1200 },
	items: [],
	sourcesRead: ['CISA KEV', 'OSV.dev'],
	sourcesSkipped: [],
	attributions: [],
};

const DEEP_HIT = {
	checkedAt: '2026-11-19T15:30:00.000Z',
	host: 'example.org',
	level: 'medium',
	sourcesRead: ['CertSpotter CT', 'GDELT Project'],
	sourcesSkipped: [],
	findings: [
		{
			key: 'sec-cert-anomaly',
			verdict: 'risk',
			severity: 'medium',
			title: 'Unusual certificate activity for this domain',
			evidence: '30 unexpired certificates issued in the last 7 days for example.org.',
			fix: 'Check who is issuing certificates.',
		},
	],
};

const DEEP_CLEAN = {
	checkedAt: '2026-11-19T15:30:00.000Z',
	host: 'example.org',
	level: 'info',
	sourcesRead: ['CertSpotter CT', 'GDELT Project'],
	sourcesSkipped: [],
	findings: [{ key: 'sec-targeted', verdict: 'pass', severity: 'info', title: 'No hit', evidence: 'No hit.' }],
};

function paidReport() {
	const report = JSON.parse(JSON.stringify(sample.report));
	report.id = ID;
	report.targeted = TARGETED;
	return report;
}

async function openReport(
	page,
	{ path = '/qa-review.html', paid = true, addons = [], deep = null, runResult = DEEP_HIT, available = true }
) {
	const calls = [];
	await page.addInitScript((version) => {
		try {
			sessionStorage.setItem('qa-review-terms', version);
			localStorage.setItem('hasSeenReviewTour', 'true');
			localStorage.setItem('qa-review-analytics', 'necessary');
		} catch (e) {
			/* storage is optional */
		}
		// The mock stands in for a signed-in payer from the first paint: the real sign-in flow is covered elsewhere.
		let auth;
		Object.defineProperty(window, 'ReviewAuth', {
			configurable: true,
			get: () => auth,
			set: (value) => {
				auth = Object.assign(value || {}, { signedIn: () => true, proof: () => ({ session: 'mock' }) });
			},
		});
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
		if (reqPath === '/review/open') return json({ report: paidReport(), frameworks: sample.frameworks, paid, addons, deep, deepAvailable: available });
		if (reqPath === '/account/deep/run') return json({ ok: true, deep: runResult, ran: true });
		return json(reqPath === '/auth/providers' ? { providers: [{ id: 'email' }] } : { items: [] });
	});
	await page.goto(path + '?report=' + ID);
	await expect(page.locator('#cases .case').first()).toBeVisible();
	return calls;
}

test.describe('Deep attack-source check on a paid report (#3946)', () => {
	test('a paid report without it offers the add-on at 19 USD and sends nothing', async ({ page }) => {
		const calls = await openReport(page, {});
		const offer = page.locator('#targeted-deep [data-act="deep-offer"]');
		await expect(offer).toBeVisible();
		await expect(offer).toContainText('19');
		await expect(offer).toHaveAttribute('href', /qa-review-pay[^?]*\?purpose=deep&reportId=af12cd34ef56$/);
		await expect(page.locator('#targeted-deep')).toContainText(/certificate|news/i);
		expect(calls.filter((c) => c.path === '/account/deep/run')).toEqual([]);
	});

	test('once bought it runs one time and shows the result, with the sources read', async ({ page }) => {
		const calls = await openReport(page, { addons: ['deep'] });
		const box = page.locator('#targeted-deep');
		await expect(box).toContainText('Unusual certificate activity for this domain');
		await expect(box).toContainText('CertSpotter CT, GDELT Project');
		await expect(page.locator('[data-act="deep-offer"]')).toHaveCount(0);
		expect(calls.filter((c) => c.path === '/account/deep/run')).toHaveLength(1);
		expect(calls.find((c) => c.path === '/account/deep/run').body.id).toBe(ID);
	});

	test('a stored result is shown without running again; a clean result says so', async ({ page }) => {
		const calls = await openReport(page, { addons: ['deep'], deep: DEEP_CLEAN });
		await expect(page.locator('#targeted-deep')).toContainText(/returned nothing/i);
		await expect(page.locator('#targeted-deep')).not.toContainText('No hit');
		expect(calls.filter((c) => c.path === '/account/deep/run')).toEqual([]);
	});

	test('no offer is shown while the server cannot run the check (no CertSpotter key)', async ({ page }) => {
		await openReport(page, { available: false });
		await expect(page.locator('#targeted-deep')).toHaveCount(0);
		await expect(page.locator('[data-act="deep-offer"]')).toHaveCount(0);
	});

	test('an unpaid report shows no Deep block', async ({ page }) => {
		await openReport(page, { paid: false });
		await expect(page.locator('#targeted-deep')).toHaveCount(0);
	});

	test('the Spanish page offers it in Spanish', async ({ page }) => {
		await openReport(page, { path: '/qa-review-es.html' });
		const box = page.locator('#targeted-deep');
		await expect(box).toContainText('Revisión profunda');
		await expect(box).toContainText('19');
		await expect(box).not.toContainText('Add the Deep check');
	});
});
