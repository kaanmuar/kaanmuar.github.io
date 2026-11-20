const { test, expect } = require('./net-guard');

// live.html: the Live reports ring on its own, as a Telegram Mini App and in the Reddit app (#2549).
// The page talks to Telegram through the self-hosted tma.js SDK (#3841): launch parameters come in the URL hash and every
// bridge call goes to window.TelegramWebviewProxy, which only exists in Telegram's web view, so it is stubbed here.
function telegram(page, { lang = 'es', start = '' } = {}) {
	const init = new URLSearchParams({
		query_id: 'x',
		user: JSON.stringify({ id: 1, first_name: 'T', language_code: lang }),
		auth_date: '1',
		hash: 'x',
		signature: 'x',
	});
	if (start) init.set('start_param', start);
	const hash = new URLSearchParams({
		tgWebAppData: init.toString(),
		tgWebAppVersion: '8.0',
		tgWebAppPlatform: 'android',
		tgWebAppThemeParams: '{}',
	}).toString();
	return page
		.addInitScript(() => {
			window.__tg = { opened: [], back: false, swipes: true, sent: [] };
			window.TelegramWebviewProxy = {
				postEvent(name, raw) {
					const data = raw ? JSON.parse(raw) : {};
					__tg.sent.push(name);
					if (name === 'web_app_setup_back_button') __tg.back = data.is_visible;
					if (name === 'web_app_setup_swipe_behavior') __tg.swipes = data.allow_vertical_swipe;
					if (name === 'web_app_open_link') __tg.opened.push(data.url);
					if (name === 'web_app_open_tg_link') __tg.opened.push('https://t.me' + data.path_full);
				},
			};
		})
		.then(() => '#' + hash);
}

function watch(page) {
	const errors = [];
	page.on('console', (msg) => {
		if (/Content Security Policy|Refused to/i.test(msg.text())) errors.push(msg.text());
	});
	page.on('pageerror', (err) => errors.push('pageerror ' + err.message));
	return errors;
}

test.describe('Live reports app page', () => {
	test('on the web it shows the ring, and filters fold away on phones', async ({ page }) => {
		const errors = watch(page);
		await page.setViewportSize({ width: 390, height: 760 });
		await page.goto('/live.html');
		await expect(page.locator('#live-reports .live-card:not([hidden])').first()).toBeVisible();
		await expect(page.locator('html')).toHaveAttribute('data-live-host', 'web');
		await expect(page.locator('.live-filters')).toBeHidden();
		await page.locator('[data-lapp-filters] > summary').click();
		await expect(page.locator('.live-filters')).toBeVisible();
		await expect(page.locator('.live-next')).toBeInViewport();
		expect(errors).toEqual([]);
	});

	test('in Telegram it speaks the user language, opens the startapp report, and leaves through Telegram', async ({
		page,
	}) => {
		const errors = watch(page);
		const hash = await telegram(page, { lang: 'es', start: 'govuk' });
		await page.goto('/live.html' + hash);
		await expect(page.locator('html')).toHaveAttribute('lang', 'es');
		await expect(page.locator('html')).toHaveAttribute('data-live-host', 'telegram');
		await expect(page.locator('#lv-name')).toHaveText('GOV.UK');
		expect(await page.evaluate(() => ({ back: __tg.back, swipes: __tg.swipes }))).toEqual({
			back: true,
			swipes: false,
		});
		expect(await page.evaluate(() => __tg.sent)).toEqual(expect.arrayContaining(['web_app_ready', 'web_app_expand']));

		await page.locator('.lv-host a').click();
		expect(await page.evaluate(() => __tg.opened.pop())).toBe('https://www.gov.uk/');
		await page.locator('[data-act="native"]').click();
		expect(await page.evaluate(() => __tg.opened.pop())).toMatch(
			/^https:\/\/t\.me\/share\/url\?url=https%3A%2F%2Ft\.me%2Fqalab_live_bot%2Flive%3Fstartapp%3Dgovuk&/
		);
		await page.locator('[data-act="own"]').click();
		expect(await page.evaluate(() => __tg.opened.pop())).toBe(
			'https://carlosandmunoz.com/qa-review-es.html?utm_source=telegram&utm_medium=app&utm_campaign=live-reports#intake'
		);

		await page.evaluate(() => tmajs.sdk.emitEvent('back_button_pressed'));
		await expect(page.locator('#lv-name')).toBeHidden();
		expect(await page.evaluate(() => __tg.back)).toBe(false);
		expect(errors).toEqual([]);
	});

	test('a host that sets LIVE_HOST_OPEN, like the Reddit app, gets every link', async ({ page }) => {
		// reddit/live-reports/scripts/build.mjs marks its copy of live.html the same way.
		await page.route('**/live.html?*', async (route) => {
			const res = await route.fetch();
			route.fulfill({
				response: res,
				body: (await res.text()).replace('<html lang="en">', '<html lang="en" data-live-host="reddit">'),
			});
		});
		await page.addInitScript(() => {
			window.__opened = [];
			window.LIVE_HOST_OPEN = (url) => window.__opened.push(url);
		});
		await page.goto('/live.html?live=govuk');
		await expect(page.locator('#lv-name')).toHaveText('GOV.UK');
		await page.locator('[data-act="net"][data-net="linkedin"]').click();
		expect(await page.evaluate(() => window.__opened.pop())).toMatch(
			/^https:\/\/www\.linkedin\.com\/sharing\/share-offsite\/\?url=https%3A%2F%2Fcarlosandmunoz\.com%2Fqa-review\.html%3Flive%3Dgovuk/
		);
		await expect(page).toHaveURL(/live\.html/);
	});
});
