const { test, expect } = require('./net-guard');
const fs = require('fs');
const sample = require('../assets/qa-review-sample.json');

// IR playbooks on the paid "Was it targeted?" report page (#3958).
const TERMS = fs
	.readFileSync(require('path').join(__dirname, '../js/qa-review.js'), 'utf8')
	.match(/TERMS_VERSION = ['"]([^'"]+)['"]/)[1];
const ID = 'bf21cd34ef78';

const TARGETED = {
	host: 'example.org',
	checkedAt: '2026-11-19T12:00:00Z',
	status: 'critical',
	level: 'critical',
	hosting: { ip: '198.51.100.42', country: 'NL', asn: 24940, asName: 'Hetzner Online GmbH' },
	items: [
		{
			level: 'critical',
			kind: 'c2-indicator',
			role: 'host_used',
			confidence: 'third_party',
			subject: '198.51.100.42',
			source: 'Feodo Tracker',
			evidence: 'Feodo Tracker lists 198.51.100.42 as an active C2 endpoint',
		},
	],
	sourcesRead: ['Feodo Tracker'],
	sourcesSkipped: [],
	attributions: ['abuse.ch Feodo Tracker'],
};

function reportWith(key) {
	const report = JSON.parse(JSON.stringify(sample.report));
	report.id = ID;
	report.targeted = TARGETED;
	report.insights.findings = [
		{
			key,
			area: 'Security',
			verdict: 'fail',
			severity: 'critical',
			title: 'Attack finding',
			evidence: 'Listed.',
			fix: 'Fix it.',
		},
	].concat(report.insights.findings);
	return report;
}

async function openReport(page, { path = '/qa-review.html', paid = true, report }) {
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
		if (reqPath === '/review/open') return json({ report, frameworks: sample.frameworks, paid });
		return json(reqPath === '/auth/providers' ? { providers: [{ id: 'email' }] } : { items: [] });
	});
	await page.goto(path + '?report=' + ID);
	await expect(page.locator('#cases .case').first()).toBeVisible();
}

test.describe('IR playbooks on the paid Was-it-targeted report (#3958)', () => {
	test('EN shows the matching playbook and the CC BY attribution', async ({ page }) => {
		await openReport(page, { report: reportWith('sec-feodo') });
		const box = page.locator('#targeted [data-playbooks]');
		await expect(box).toBeVisible();
		await expect(box).toContainText('What to do if it was targeted');
		await expect(box).toContainText('Malicious network behaviour');
		await expect(box).toContainText('CC BY 3.0');
		await expect(box).toContainText('CERT Société Générale');
		await expect(box.locator('[data-playbook="network"]')).toHaveCount(1);
	});

	test('ES and FR use their playbook copy; DE keeps English with a note', async ({ page }) => {
		await openReport(page, { path: '/qa-review-es.html', report: reportWith('sec-kev') });
		await expect(page.locator('#targeted [data-playbooks]')).toContainText('Qué hacer si fue un ataque dirigido');
		await expect(page.locator('#targeted [data-playbooks]')).toContainText('Intrusión en el servidor');

		await openReport(page, { path: '/qa-review-fr.html', report: reportWith('sec-kev') });
		await expect(page.locator('#targeted [data-playbooks]')).toContainText('Que faire en cas');
		await expect(page.locator('#targeted [data-playbooks]')).toContainText('Intrusion sur le serveur');

		await openReport(page, { path: '/qa-review-de.html', report: reportWith('sec-feodo') });
		const de = page.locator('#targeted [data-playbooks]');
		await expect(de).toContainText('Malicious network behaviour');
		await expect(de).toContainText(/native review|English for now/i);
	});

	test('an unpaid report hides the playbooks with the targeted card', async ({ page }) => {
		await openReport(page, { paid: false, report: reportWith('sec-feodo') });
		await expect(page.locator('#targeted')).toBeHidden();
		await expect(page.locator('[data-playbooks]')).toHaveCount(0);
	});
});
