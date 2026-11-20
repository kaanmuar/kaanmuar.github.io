// Bulk review end to end against a mocked API (#3932): terms gate, start, every row, and the no-pass case.
const { test, expect } = require('./net-guard');
const fs = require('fs');
const path = require('path');
const auth = require('../functions/url-review-auth');
const batch = require('../functions/url-review-batch');
const sample = require('../assets/qa-review-sample.json');

const ANA = 'a'.repeat(64);
const OUT = path.join(__dirname, '..', 'test-results', 'batch-run');
const SHOTS = !!process.env.BATCH_SHOTS;

test.use({ viewport: { width: 1280, height: 900 }, video: SHOTS ? 'on' : 'off' });

async function open(page, { runsLeft = 10, free = false } = {}) {
	const store = auth.memoryStore();
	const started = await auth.startEmail(store, { email: 'ana@example.com', deviceKey: ANA, ip: '1.1.1.1' });
	const signed = await auth.finishEmail(store, { id: started.id, code: started.code, deviceKey: ANA });
	await page.addInitScript(
		({ session }) => {
			localStorage.setItem('hasSeenReviewTour', 'true');
			localStorage.setItem('qa-review-analytics', 'necessary');
			localStorage.setItem('qa-review-session', JSON.stringify({ session, email: 'ana@example.com', provider: 'email' }));
			localStorage.setItem('qa-review-device-key', JSON.stringify('a'.repeat(64)));
		},
		{ session: signed.session }
	);
	await page.route(/ipwho\.is/, (route) => route.fulfill({ contentType: 'application/json', body: '{"success":false}' }));
	let doc = null;
	const calls = [];
	await page.route('http://127.0.0.1:8768/**', async (route) => {
		const req = route.request();
		const p = new URL(req.url()).pathname;
		const cors = {
			'access-control-allow-origin': req.headers().origin || '*',
			'access-control-allow-credentials': 'true',
			'access-control-allow-headers': 'content-type',
		};
		if (req.method() === 'OPTIONS')
			return route.fulfill({ status: 204, headers: Object.assign({ 'access-control-allow-methods': 'GET,POST' }, cors) });
		const body = req.postData() ? JSON.parse(req.postData()) : {};
		calls.push([Date.now(), p, body.state || '']);
		const json = (status, data) =>
			route.fulfill({ status, contentType: 'application/json', headers: cors, body: JSON.stringify(data) });
		if (p === '/auth/session') {
			const checked = await auth.checkSession(store, Object.assign({}, body, { deviceKey: ANA }));
			return json(checked.ok ? 200 : checked.status, checked);
		}
		if (p.endsWith('/standing')) {
			return json(200, {
				billing: 'run',
				free,
				percent: 0,
				compareUsd: 9,
				pass: free ? null : { id: 'p', plan: 'team', name: 'Team', runsLeft, paidUntil: '2099-01-01T00:00:00Z', frameworks: 20, tools: true, pages: 20, depth: 2 },
				lastPlan: 'team',
				plans: [],
				softLeft: 20,
				softCap: 20,
				softSignedIn: true,
			});
		}
		if (p.endsWith('/account/batch/start')) {
			await new Promise((r) => setTimeout(r, 4000));
			const parsed = batch.parseList(body.text, { leadUrl: body.leadUrl });
			if (parsed.error) return json(400, parsed);
			doc = batch.savedRecord('ana@example.com', parsed, body);
			return json(200, { ok: true, batch: batch.payloadOf('batch1', doc) });
		}
		if (p.endsWith('/account/batch/row')) {
			const patch = Object.assign({}, body);
			const next = batch.applyRow(doc, Number(body.index), {
				state: patch.state,
				reviewId: patch.reviewId || '',
				overall: patch.overall == null ? null : patch.overall,
				note: patch.note || '',
			});
			Object.assign(doc, next);
			return json(200, batch.payloadOf('batch1', doc));
		}
		if (p.endsWith('/account/batch/stop')) {
			Object.assign(doc, batch.stopBatch(doc));
			return json(200, batch.payloadOf('batch1', doc));
		}
		if (p.endsWith('/account/batch/open')) return json(200, batch.payloadOf('batch1', doc));
		if (p.endsWith('/review')) {
			await new Promise((r) => setTimeout(r, 2500));
			const host = new URL(body.url.indexOf('://') === -1 ? 'https://' + body.url : body.url).hostname;
			const report = Object.assign({}, sample.report, { id: 'r' + host.replace(/\W/g, ''), host, requestedUrl: body.url });
			const lines = [
				'Checking that the address is public https.',
				'Reading robots.txt.',
				'Opening /.',
				'Analyzed 3 pages. Writing the proposed cases now.',
			]
				.map((text) => JSON.stringify({ type: 'log', text }))
				.concat(JSON.stringify({ type: 'done', report, frameworks: sample.frameworks, paid: true }));
			return route.fulfill({ status: 200, contentType: 'application/x-ndjson', headers: cors, body: lines.join('\n') + '\n' });
		}
		return json(200, p === '/auth/providers' ? { providers: [{ id: 'email' }] } : { items: [] });
	});
	await page.goto('/qa-review.html');
	await expect(page.locator('#sign-in-done')).toBeVisible({ timeout: 15000 });
	return calls;
}

async function shot(page, name) {
	if (!SHOTS) return;
	fs.mkdirSync(OUT, { recursive: true });
	await page.screenshot({ path: path.join(OUT, name + '.png') });
}

async function runAll(page, name, count, fill, opts) {
	const calls = await open(page, opts);
	await page.locator('[data-url-mode="many"]').click();
	await fill();
	await expect(page.locator('#batch-preview li')).toHaveCount(count);
	await page.locator('#name').fill('Ana');
	await expect(page.locator('#review-needs button[data-step="page"]')).toHaveCount(0);
	await expect(page.locator('#review-btn')).not.toContainText('left');
	await page.locator('#review-btn').click();
	await expect(page.locator('#gate')).toBeVisible();
	await shot(page, name + '-1-terms');
	await page.locator('#gate input[type=checkbox]').first().check();
	await page.locator('#accept').click();
	await expect(page.locator('#batch-panel')).toBeVisible({ timeout: 3000 });
	await expect(page.locator('#batch-panel-rows li')).toHaveCount(count);
	await expect(page.locator('#review-btn')).toBeDisabled();
	await expect(page.locator('#run-panel.rp-on')).toBeVisible();
	await shot(page, name + '-2-starting');
	await expect(page.locator('#batch-panel-rows li').first()).toHaveAttribute('data-state', 'running', { timeout: 5000 });
	await expect(page.locator('#batch-panel-status')).toContainText('1 of ' + count);
	await expect(page.locator('#batch-panel-rows li').nth(1)).toHaveAttribute('data-state', 'running', { timeout: 15000 });
	await expect(page.locator('.dash-modal')).toBeHidden();
	await expect(page.locator('#batch-panel')).toBeInViewport();
	await shot(page, name + '-3-running');
	await expect(page.locator('#batch-panel-rows li[data-state="done"]')).toHaveCount(count, { timeout: 60000 });
	await expect(page.locator('.dash-modal')).toBeVisible();
	await expect(page.locator('#review-btn')).toBeEnabled();
	await expect(page.locator('#form-status')).toContainText(String(count));
	await expect(page.locator('#form-status')).not.toContainText('Reviewing');
	await shot(page, name + '-4-done');
	const reviews = calls.filter((c) => c[1].endsWith('/review')).length;
	expect(reviews).toBe(count);
}

test('pasting six addresses runs every one with the panel and meter moving', async ({ page }) => {
	test.setTimeout(120000);
	const urls = ['a', 'b', 'c', 'd', 'e', 'f'].map((x) => 'https://' + x + '.example/');
	await runAll(page, 'paste', 6, () => page.locator('#batch-text').fill(urls.join('\n')));
});

test('uploading a five-address file runs every one', async ({ page }) => {
	test.setTimeout(120000);
	await runAll(page, 'file', 5, () =>
		page.locator('#batch-file').setInputFiles({
			name: 'urls.csv',
			mimeType: 'text/csv',
			buffer: Buffer.from('url\nhttps://a.example/\nhttps://b.example/\nhttps://c.example/\nhttps://d.example/\nhttps://e.example/\n'),
		})
	);
});

test('without a pass, Run says so beside the list instead of looking frozen', async ({ page }) => {
	const calls = await open(page, { runsLeft: 0 });
	await page.locator('[data-url-mode="many"]').click();
	await page.locator('#batch-text').fill('https://a.example/\nhttps://b.example/\nhttps://c.example/\nhttps://d.example/\nhttps://e.example/');
	await page.locator('#name').fill('Ana');
	await expect(page.locator('#review-btn')).not.toContainText('left');
	await page.locator('#review-btn').click();
	await expect(page.locator('#batch-error')).toContainText(/pass|credits/i);
	await expect(page.locator('#batch-error')).toBeInViewport();
	await shot(page, 'nopass');
	expect(calls.filter((c) => /batch|review$/.test(c[1]))).toEqual([]);
});

test('a free-runs account starts a bulk review with no pass (#3972)', async ({ page }) => {
	test.setTimeout(120000);
	const urls = ['a', 'b', 'c', 'd', 'e'].map((x) => 'https://' + x + '.example/');
	await runAll(page, 'free', 5, () => page.locator('#batch-text').fill(urls.join('\n')), { free: true });
});
