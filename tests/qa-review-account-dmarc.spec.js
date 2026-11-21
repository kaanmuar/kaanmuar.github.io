const { test, expect } = require('./net-guard');
const auth = require('../functions/url-review-auth');
const consent = require('../functions/url-review-dmarc-consent');

const ANA = 'a'.repeat(64);

test('account page shows DMARC consent notice, setup steps, and on/off (#3777)', async ({ page }) => {
	const store = auth.memoryStore();
	const started = await auth.startEmail(store, { email: 'ana@example.com', deviceKey: ANA, ip: '1.1.1.1' });
	const signed = await auth.finishEmail(store, { id: started.id, code: started.code, deviceKey: ANA });
	let consentOn = false;
	await page.addInitScript(
		({ session }) => {
			localStorage.setItem('qa-review-analytics', 'necessary');
			localStorage.setItem(
				'qa-review-session',
				JSON.stringify({ session, email: 'ana@example.com', provider: 'email' })
			);
			localStorage.setItem('qa-review-device-key', JSON.stringify('a'.repeat(64)));
		},
		{ session: signed.session }
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
		if (path === '/account/runs') return json(200, { items: [], comparisons: [], batches: [] });
		if (path === '/account/verify' || path === '/account/verify-check') {
			return json(200, { available: true, proofs: [] });
		}
		if (path === '/account/dmarc-consent') {
			const host = String(body.host || '');
			const proved = host === 'shop.example.com';
			return json(200, {
				ok: true,
				notice: consent.NOTICE,
				mailbox: consent.RUA_MAILBOX,
				host,
				proofKind: proved ? 'site' : '',
				consent: consentOn
					? {
							email: 'ana@example.com',
							host: 'shop.example.com',
							on: true,
							noticeVersion: consent.NOTICE_VERSION,
							at: '2026-11-20T12:00:00.000Z',
							until: '2027-11-20T12:00:00.000Z',
						}
					: null,
				on: !!(consentOn && proved),
			});
		}
		if (path === '/account/dmarc-consent-set') {
			const host = String(body.host || '');
			if (host !== 'shop.example.com') {
				return json(403, {
					error: 'Prove you own this domain before turning report reading on.',
					notice: consent.NOTICE,
					mailbox: consent.RUA_MAILBOX,
					proofKind: '',
				});
			}
			if (body.accept === true && body.noticeVersion !== consent.NOTICE_VERSION) {
				return json(400, {
					error: 'To turn this on, accept the current privacy notice (version ' + consent.NOTICE_VERSION + ').',
					notice: consent.NOTICE,
					mailbox: consent.RUA_MAILBOX,
					proofKind: 'site',
				});
			}
			consentOn = body.accept === true;
			return json(200, {
				ok: true,
				notice: consent.NOTICE,
				mailbox: consent.RUA_MAILBOX,
				consent: {
					email: 'ana@example.com',
					host: 'shop.example.com',
					on: consentOn,
					noticeVersion: consentOn ? consent.NOTICE_VERSION : '',
					at: '2026-11-20T12:00:00.000Z',
					until: '2027-11-20T12:00:00.000Z',
				},
				proofKind: 'site',
				deleted: consentOn ? 0 : 1,
			});
		}
		return json(200, path === '/auth/providers' ? { providers: [{ id: 'email' }] } : { items: [] });
	});

	await page.goto('/qa-review-account.html#dmarc');
	const section = page.locator('#dmarc');
	await expect(section).toBeVisible({ timeout: 20000 });
	await expect(section.locator('h2')).toHaveText(consent.NOTICE.title);
	await expect(section.locator('#dmarc-notice')).toContainText(consent.RUA_MAILBOX, { timeout: 20000 });

	await page.locator('#dmarc-host').fill('shop.example.com');
	await page.locator('#dmarc-load').click();
	await expect(page.locator('#dmarc-status')).toContainText('Reading is off');
	await expect(page.locator('#dmarc-steps')).toBeVisible();
	await expect(page.locator('#dmarc-rua')).toHaveText('rua=mailto:' + consent.RUA_MAILBOX);
	await expect(page.locator('#dmarc-tls')).toHaveText('v=TLSRPTv1; rua=mailto:' + consent.RUA_MAILBOX);
	await expect(page.locator('#dmarc-dmarc-host')).toHaveText('_dmarc.example.com');
	await expect(page.locator('#dmarc-tls-host')).toHaveText('_smtp._tls.example.com');

	await page.locator('#dmarc-accept').check();
	await page.locator('#dmarc-on').click();
	await expect(page.locator('#dmarc-status')).toContainText('Reading is on');
	await expect(page.locator('#dmarc-state')).toHaveText('On');

	await page.locator('#dmarc-off').click();
	await expect(page.locator('#dmarc-status')).toContainText('Stored report counts');
	await expect(page.locator('#dmarc-state')).toHaveText('Off');
});
