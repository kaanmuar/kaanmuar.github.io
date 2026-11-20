const { test, expect } = require('./net-guard');
const fs = require('fs');
const path = require('path');
const auth = require('../functions/url-review-auth');
const { fulfillSoftPreview, softThenUnlock } = require('./soft-gate');

const TERMS = fs
	.readFileSync(path.join(__dirname, '../js/qa-review.js'), 'utf8')
	.match(/TERMS_VERSION = ['"]([^'"]+)['"]/)[1];
const ANA = 'a'.repeat(64);
const PHONE = { width: 390, height: 844 };
const DONE = { type: 'log', text: 'Opening the start page.' };

// A free run; `bodies` collects each /review request body the page sends (#3849).
async function openReview(page, file, uncheck) {
	const store = auth.memoryStore();
	const started = await auth.startEmail(store, { email: 'ana@example.com', deviceKey: ANA, ip: '1.1.1.1' });
	const done = await auth.finishEmail(store, { id: started.id, code: started.code, deviceKey: ANA });
	await page.addInitScript(
		({ version, session }) => {
			try {
				sessionStorage.setItem('qa-review-terms', version);
				localStorage.setItem('hasSeenReviewTour', 'true');
				localStorage.setItem('qa-review-analytics', 'necessary');
				localStorage.setItem(
					'qa-review-session',
					JSON.stringify({ session, email: 'ana@example.com', provider: 'email' })
				);
				localStorage.setItem('qa-review-device-key', JSON.stringify('a'.repeat(64)));
			} catch (e) {
				/* storage is optional */
			}
		},
		{ version: TERMS, session: done.session }
	);
	await page.route(/ipwho\.is/, (route) =>
		route.fulfill({ contentType: 'application/json', body: '{"success":false}' })
	);
	const seen = { standing: 0, runs: 0, bodies: [] };
	await page.route('http://127.0.0.1:8768/**', async (route) => {
		const req = route.request();
		const where = new URL(req.url()).pathname;
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
		const body = req.postData() ? JSON.parse(req.postData()) : {};
		const json = (status, data) =>
			route.fulfill({ status, contentType: 'application/json', headers: cors, body: JSON.stringify(data) });
		if (where === '/auth/session') {
			const checked = await auth.checkSession(store, Object.assign({}, body, { deviceKey: ANA }));
			return json(checked.ok ? 200 : checked.status, checked);
		}
		if (where === '/standing') {
			seen.standing += 1;
			return json(200, { billing: 'run', free: true, percent: 0 });
		}
		if (where === '/review/preview') return fulfillSoftPreview(route, cors);
		if (where === '/review') {
			seen.runs += 1;
			seen.bodies.push(body);
			const lines = [DONE];
			return route.fulfill({
				status: 200,
				contentType: 'application/x-ndjson',
				headers: cors,
				body: lines.map((line) => JSON.stringify(line)).join('\n') + '\n',
			});
		}
		return json(200, where === '/auth/providers' ? { providers: [{ id: 'email' }] } : { items: [] });
	});
	await page.setViewportSize(PHONE);
	await page.goto(file);
	await expect.poll(() => seen.standing).toBeGreaterThan(0);
	await page.evaluate(() => {
		document.getElementById('name').value = 'Ana Pérez';
		document.getElementById('email').value = 'ana@example.com';
		document.querySelector('input[name="reasonCode"][value="teaching"]').checked = true;
		document.getElementById('url').value = 'example.com';
	});
	if (uncheck) await page.locator('#cyber-sources').uncheck();
	await softThenUnlock(page, expect);
	await expect.poll(() => seen.runs).toBe(1);
	return seen;
}


test.describe('Attack and exploit source option (#3849)', () => {
	test('is on by default and a run sends targeted true', async ({ page }) => {
		const seen = await openReview(page, '/qa-review.html', false);
		await expect(page.locator('#cyber-sources')).toBeChecked();
		expect(seen.bodies[0].targeted).toBe(true);
	});

	test('unchecking it sends targeted false', async ({ page }) => {
		const seen = await openReview(page, '/qa-review.html', true);
		expect(seen.bodies[0].targeted).toBe(false);
	});

	for (const [file, label] of [
		['/qa-review-es.html', 'Incluir comprobaciones de fuentes de ataques y exploits'],
		['/qa-review-de.html', 'Prüfungen mit Angriffs- und Exploit-Quellen einbeziehen'],
	]) {
		test('reads in the page language on ' + file, async ({ page }) => {
			await openReview(page, file, false);
			await expect(page.locator('#cyber-row')).toContainText(label);
		});
	}
});
