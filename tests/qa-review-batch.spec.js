const { test, expect } = require('./net-guard');
const auth = require('../functions/url-review-auth');
const batch = require('../functions/url-review-batch');

const TERMS = require('fs')
	.readFileSync(require('path').join(__dirname, '../js/qa-review.js'), 'utf8')
	.match(/TERMS_VERSION = ['"]([^'"]+)['"]/)[1];
const ANA = 'a'.repeat(64);

async function openReview(page, { runsLeft = 6, startDelayMs = 0 } = {}) {
	const store = auth.memoryStore();
	const started = await auth.startEmail(store, { email: 'ana@example.com', deviceKey: ANA, ip: '1.1.1.1' });
	const signed = await auth.finishEmail(store, { id: started.id, code: started.code, deviceKey: ANA });
	const startedBodies = [];
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
			} catch (error) {
				/* storage optional */
			}
		},
		{ version: TERMS, session: signed.session }
	);
	await page.route(/ipwho\.is/, (route) =>
		route.fulfill({ contentType: 'application/json', body: '{"success":false}' })
	);
	await page.route('http://127.0.0.1:8768/**', async (route) => {
		const req = route.request();
		const path = new URL(req.url()).pathname;
		const cors = {
			'access-control-allow-origin': req.headers().origin || '*',
			'access-control-allow-credentials': 'true',
			'access-control-allow-headers': 'content-type',
		};
		if (req.method() === 'OPTIONS') {
			return route.fulfill({
				status: 204,
				headers: Object.assign({ 'access-control-allow-methods': 'GET,POST' }, cors),
			});
		}
		const body = req.postData() ? JSON.parse(req.postData()) : {};
		const json = (status, data) =>
			route.fulfill({ status, contentType: 'application/json', headers: cors, body: JSON.stringify(data) });
		if (path === '/auth/session') {
			const checked = await auth.checkSession(store, Object.assign({}, body, { deviceKey: ANA }));
			return json(checked.ok ? 200 : checked.status, checked);
		}
		if (path.endsWith('/standing')) {
			return json(200, {
				billing: 'run',
				free: false,
				percent: 0,
				compareUsd: 9,
				pass: {
					id: 'pass1',
					plan: 'team',
					name: 'Team',
					runsLeft,
					paidUntil: '2099-01-01T00:00:00Z',
					frameworks: 20,
					tools: true,
					pages: 20,
					depth: 2,
				},
				lastPlan: 'team',
				plans: [],
				softLeft: 5,
				softCap: 5,
				softSignedIn: true,
			});
		}
		if (path.endsWith('/account/batch/start')) {
			startedBodies.push(body);
			if (startDelayMs) await new Promise((resolve) => setTimeout(resolve, startDelayMs));
			const parsed = batch.parseList(body.text, { leadUrl: body.leadUrl });
			if (parsed.error) return json(400, parsed);
			const credit = batch.creditProblem(runsLeft, parsed.urls.length);
			if (credit) return json(402, credit);
			const saved = batch.savedRecord('ana@example.com', parsed, body);
			return json(200, { ok: true, batch: batch.payloadOf('batch1', saved) });
		}
		if (
			path.endsWith('/account/batch/row') ||
			path.endsWith('/account/batch/stop') ||
			path.endsWith('/account/batch/open')
		) {
			return json(200, { id: 'batch1', status: 'done', rows: [], doneIds: [], canCompare: false });
		}
		return json(200, path === '/auth/providers' ? { providers: [{ id: 'email' }] } : { items: [] });
	});
	await page.goto('/qa-review.html');
	await expect(page.locator('#url-mode')).toBeVisible({ timeout: 20000 });
	await expect(page.locator('#sign-in-done')).toBeVisible({ timeout: 15000 });
	await expect(page.locator('#review-btn')).toBeEnabled();
	return { startedBodies };
}

test('Many URLs mode shows paste, hard-blocks duplicates, and highlights the lead', async ({ page }) => {
	await openReview(page);
	await page.locator('[data-url-mode="many"]').click();
	await expect(page.locator('#url-mode-many')).toBeVisible();
	await expect(page.locator('#url-mode-one')).toBeHidden();
	await page.locator('#batch-text').fill('https://one.example/\nhttps://www.one.example/path');
	await expect(page.locator('#batch-error')).not.toHaveText('');
	await expect(page.locator('#batch-preview li')).toHaveCount(0);

	await page.locator('#batch-text').fill('https://lead.example/\nhttps://two.example/');
	await expect(page.locator('#batch-error')).toHaveText('');
	await expect(page.locator('#batch-preview li')).toHaveCount(2);
	await expect(page.locator('#batch-preview li').first()).toHaveClass(/is-lead/);
	await expect(page.locator('#batch-preview li').first()).toContainText('Lead');
});

test('a short pass blocks starting a bulk review', async ({ page }) => {
	const { startedBodies } = await openReview(page, { runsLeft: 1 });
	await page.locator('[data-url-mode="many"]').click();
	await page.locator('#batch-text').fill('https://a.example/\nhttps://b.example/');
	await expect(page.locator('#batch-preview li')).toHaveCount(2);
	await page.locator('#name').fill('Ana');
	await page.locator('input[name="reasonCode"][value="redesign"]').check({ force: true });
	await page.locator('#review-btn').click();
	await expect(page.locator('#form-status')).toContainText(
		/credits|pass|ejecuciones|créditos|crédits|Credits|Läufe|passe/i,
		{ timeout: 10000 }
	);
	expect(startedBodies).toEqual([]);
});

test('pressing Start shows the panel, the meter, and a held button before the server answers (#3932)', async ({ page }) => {
	const { startedBodies } = await openReview(page, { startDelayMs: 4000 });
	await page.locator('[data-url-mode="many"]').click();
	await page.locator('#batch-text').fill('https://a.example/\nhttps://b.example/');
	await expect(page.locator('#batch-preview li')).toHaveCount(2);
	await page.locator('#name').fill('Ana');
	await page.locator('input[name="reasonCode"][value="redesign"]').check({ force: true });
	await page.locator('#review-btn').click();
	await expect(page.locator('#batch-panel')).toBeVisible({ timeout: 2000 });
	await expect(page.locator('#batch-panel-rows li')).toHaveCount(2);
	await expect(page.locator('#batch-panel-status')).not.toHaveText('');
	await expect(page.locator('#review-btn')).toBeDisabled();
	await expect(page.locator('#run-panel.rp-on')).toBeVisible();
	await expect.poll(() => startedBodies.length).toBe(1);
});
