const { test, expect } = require('./net-guard');
const { fulfillSoftPreview } = require('./soft-gate');

const ONLINE = ['www.google.com', 'carlosandmunoz.com', 'gooogle.com', 'www.nibo.com.br'];
const SITEMAPS = {
	'carlosandmunoz.com': ['/qa-lab', '/pricing', '/checkout', '/qa-review', '/blog/checkout-tips'],
	'www.nibo.com.br': ['/mercado', '/ofertas', '/1a', '/3m', '/a1/zapatos'],
};
const TERMS = require('fs')
	.readFileSync(require('path').join(__dirname, '../js/qa-review.js'), 'utf8')
	.match(/TERMS_VERSION = ['"]([^'"]+)['"]/)[1];

async function open(page, lang = '') {
	await page.addInitScript(
		(args) => {
			try {
				sessionStorage.setItem('qa-review-terms', args.version);
				localStorage.setItem('hasSeenReviewTour', 'true');
				localStorage.setItem('qa-review-analytics', 'necessary');
				localStorage.setItem('cv-preferred-lang', args.lang || 'en');
			} catch (e) {
				/* storage is optional */
			}
		},
		{ version: TERMS, lang }
	);
	await page.route(/\/news\?/, (route) =>
		route.fulfill({
			contentType: 'application/json',
			headers: { 'access-control-allow-origin': '*' },
			body: '{"items":[]}',
		})
	);
	await page.route(/ipwho\.is/, (route) =>
		route.fulfill({ contentType: 'application/json', body: '{"success":false}' })
	);
	await page.route(/dns\.google\/resolve/, (route) => {
		const name = new URL(route.request().url()).searchParams.get('name');
		const body = ONLINE.includes(name) ? { Status: 0, Answer: [{ data: '203.0.113.7' }] } : { Status: 3 };
		route.fulfill({
			contentType: 'application/json',
			headers: { 'access-control-allow-origin': '*' },
			body: JSON.stringify(body),
		});
	});
	// Soft-gate catch-all first; /paths must register after so it is not shadowed (last match wins).
	await page.route('http://127.0.0.1:8768/**', async (route) => {
		const req = route.request();
		const url = new URL(req.url());
		const path = url.pathname;
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
		if (path === '/paths') {
			const host = url.searchParams.get('host');
			return route.fulfill({
				status: 200,
				contentType: 'application/json',
				headers: cors,
				body: JSON.stringify({ host, paths: SITEMAPS[host] || [] }),
			});
		}
		if (path === '/review/preview') return fulfillSoftPreview(route, cors);
		if (path === '/standing')
			return route.fulfill({
				status: 200,
				contentType: 'application/json',
				headers: cors,
				body: '{"billing":"run","free":true,"percent":0,"softLeft":4,"softCap":5}',
			});
		return route.fulfill({
			status: 200,
			contentType: 'application/json',
			headers: cors,
			body: path === '/auth/providers' ? '{"providers":[{"id":"email"}]}' : '{"items":[]}',
		});
	});
	await page.route(/\/paths\?host=/, (route) => {
		const host = new URL(route.request().url()).searchParams.get('host');
		route.fulfill({
			contentType: 'application/json',
			headers: { 'access-control-allow-origin': '*' },
			body: JSON.stringify({ host, paths: SITEMAPS[host] || [] }),
		});
	});
	await page.goto(lang ? '/qa-review-' + lang + '.html' : '/qa-review.html');
	const box = page.locator('#url');
	await expect(box).toBeEnabled();
	return box;
}

test.describe('URL Review page box predictions', () => {
	test('typing the start of a popular host lists it first, and Enter picks it', async ({ page }) => {
		const box = await open(page);
		await box.pressSequentially('goo');
		await expect(page.locator('#url-suggest li').first()).toHaveText('www.google.com');
		await expect(box).toHaveAttribute('aria-expanded', 'true');
		await box.press('ArrowDown');
		await expect(box).toHaveAttribute('aria-activedescendant', 'url-opt-0');
		await box.press('Enter');
		await expect(box).toHaveValue('www.google.com');
		await expect(page.locator('#url-suggest')).toBeHidden();
		await expect(page.locator('#url-hint')).toContainText('is online and is one of the most visited sites');
	});

	test('a host with a path stops predicting hosts, and Escape closes the list', async ({ page }) => {
		const box = await open(page);
		await box.pressSequentially('amaz');
		await expect(page.locator('#url-suggest')).toBeVisible();
		await box.press('Escape');
		await expect(page.locator('#url-suggest')).toBeHidden();
		await box.pressSequentially('on.com/gp');
		await expect(page.locator('#url-suggest')).toBeHidden();
	});

	test('a misspelt host that does not exist offers the popular one', async ({ page }) => {
		const box = await open(page);
		await box.fill('gogle.com');
		await expect(page.locator('#url-hint')).toContainText('does not exist');
		await page.locator('#url-hint .url-fix').click();
		await expect(box).toHaveValue('www.google.com');
	});

	test('a lookalike that is online is flagged, and a small real site is just online', async ({ page }) => {
		const box = await open(page);
		await box.fill('gooogle.com');
		await expect(page.locator('#url-hint')).toHaveClass(/warn/);
		await expect(page.locator('#url-hint .url-fix')).toHaveText('www.google.com');
		await box.fill('carlosandmunoz.com/qa-lab');
		await expect(page.locator('#url-hint')).toHaveText('carlosandmunoz.com is online.');
	});

	test('a short name under a long country suffix is not offered a popular site two letters away', async ({ page }) => {
		const box = await open(page);
		await box.fill('www.nibo.com.br');
		await expect(page.locator('#url-hint')).toHaveText('www.nibo.com.br is online.');
	});

	test('the address check speaks the page language and keeps the host out of translation', async ({ page }) => {
		const box = await open(page, 'es');
		await box.fill('carlosandmunoz.com');
		const hint = page.locator('#url-hint');
		await expect(hint).toHaveText('carlosandmunoz.com está en línea.');
		await expect(hint).toHaveAttribute('lang', 'es');
		await expect(hint).toHaveAttribute('translate', 'no');
		await box.fill('gogle.com');
		await expect(hint).toHaveText('gogle.com no existe. ¿Quisiste decir www.google.com?');
	});

	test('after an online host and a slash, its sitemap paths are listed and filtered as you type', async ({ page }) => {
		const box = await open(page);
		const items = page.locator('#url-suggest li');
		await box.fill('carlosandmunoz.com/');
		await expect(items).toHaveText(SITEMAPS['carlosandmunoz.com']);
		await expect(page.locator('#url-suggest')).toHaveAttribute('aria-label', 'Suggested pages');
		await box.pressSequentially('che');
		await expect(items).toHaveText(['/checkout', '/blog/checkout-tips']);
		await box.press('ArrowDown');
		await box.press('Enter');
		await expect(box).toHaveValue('carlosandmunoz.com/checkout');
		await expect(page.locator('#url-suggest')).toBeHidden();
	});

	test('after a bare slash, code paths like /1a are left out until a character after the slash asks for them', async ({
		page,
	}) => {
		const box = await open(page);
		const items = page.locator('#url-suggest li');
		await box.fill('www.nibo.com.br/');
		await expect(items).toHaveText(['/mercado', '/ofertas']);
		await box.pressSequentially('1');
		await expect(items).toHaveText(['/1a']);
	});

	test('a site without a sitemap lists no paths and shows no error', async ({ page }) => {
		const box = await open(page);
		const paths = page.waitForRequest(/\/paths\?host=www\.google\.com/);
		await box.fill('https://www.google.com/');
		await paths;
		await expect(page.locator('#url-suggest')).toBeHidden();
		await expect(page.locator('#url-hint')).toContainText('is online');
		await expect(page.locator('#url-error')).toBeEmpty();
	});
});

test.describe('Bulk list predictions and checks (#3988)', () => {
	async function openList(page, lang) {
		await open(page, lang);
		await page.locator('[data-url-mode="many"]').click();
		const list = page.locator('#batch-text');
		await expect(list).toBeEnabled();
		return list;
	}

	test('the line under the caret predicts hosts, and Enter picks one for that line only', async ({ page }) => {
		const list = await openList(page);
		await list.pressSequentially('carlosandmunoz.com');
		await list.press('Enter');
		await list.pressSequentially('goo');
		await expect(page.locator('#batch-text-suggest li').first()).toHaveText('www.google.com');
		await list.press('ArrowDown');
		await expect(list).toHaveAttribute('aria-activedescendant', 'batch-text-opt-0');
		await list.press('Enter');
		await expect(list).toHaveValue('carlosandmunoz.com\nwww.google.com');
		await expect(page.locator('#batch-text-suggest')).toBeHidden();
		await expect(page.locator('#batch-text-hint')).toContainText('is online and is one of the most visited sites');
		await list.press('Enter');
		await expect(list).toHaveValue('carlosandmunoz.com\nwww.google.com\n');
	});

	test('a line with a slash lists that site’s sitemap pages', async ({ page }) => {
		const list = await openList(page);
		await list.fill('www.google.com\n');
		await list.press('End');
		await list.pressSequentially('carlosandmunoz.com/che');
		await expect(page.locator('#batch-text-suggest li')).toHaveText(['/checkout', '/blog/checkout-tips']);
		await list.press('ArrowDown');
		await list.press('Enter');
		await expect(list).toHaveValue('www.google.com\ncarlosandmunoz.com/checkout');
	});

	test('every row in Ready to run is checked, and Did you mean fixes that row', async ({ page }) => {
		const list = await openList(page);
		await list.fill('carlosandmunoz.com\ngogle.com/maps\nhttps://www.nibo.com.br/');
		const checks = page.locator('#batch-preview .batch-check');
		await expect(checks).toHaveCount(3);
		await expect(checks.nth(0)).toHaveText('carlosandmunoz.com is online.');
		await expect(checks.nth(1)).toHaveClass(/bad/);
		await expect(checks.nth(1)).toContainText('gogle.com does not exist.');
		await expect(checks.nth(2)).toHaveText('www.nibo.com.br is online.');
		await checks.nth(1).locator('.url-fix').click();
		await expect(list).toHaveValue('carlosandmunoz.com\nwww.google.com/maps\nhttps://www.nibo.com.br/');
		await expect(checks.nth(1)).toContainText('is online and is one of the most visited sites');
	});

	test('the row check speaks the page language and keeps hosts out of translation', async ({ page }) => {
		const list = await openList(page, 'es');
		await list.fill('carlosandmunoz.com\ngogle.com');
		const checks = page.locator('#batch-preview .batch-check');
		await expect(checks.nth(0)).toHaveText('carlosandmunoz.com está en línea.');
		await expect(checks.nth(1)).toHaveText('gogle.com no existe. ¿Quisiste decir www.google.com?');
		await expect(checks.nth(1)).toHaveAttribute('translate', 'no');
	});
});

test.describe('Bulk list: text or file, not both (#3999)', () => {
	const CSV = {
		name: 'sites.csv',
		mimeType: 'text/csv',
		buffer: Buffer.from('url\nhttps://a.example/\nhttps://b.example/\n'),
	};

	async function openList(page, lang) {
		await open(page, lang);
		await page.locator('[data-url-mode="many"]').click();
		const list = page.locator('#batch-text');
		await expect(list).toBeEnabled();
		await expect(page.locator('#batch-file')).toBeEnabled();
		return list;
	}

	test('typing addresses disables the file picker, and emptying the box frees it', async ({ page }) => {
		const list = await openList(page);
		await list.fill('a.example\nb.example');
		await expect(page.locator('#batch-file')).toBeDisabled();
		await expect(page.locator('#batch-source-note')).toHaveText('Clear the text box to load a file instead.');
		await list.fill('  \n');
		await expect(page.locator('#batch-file')).toBeEnabled();
		await expect(page.locator('#batch-source-note')).toHaveText('');
	});

	test('a loaded file fills the list and disables the text box until the file is removed', async ({ page }) => {
		const list = await openList(page);
		await page.locator('#batch-file').setInputFiles(CSV);
		await expect(page.locator('#batch-preview li')).toHaveCount(2);
		await expect(list).toBeDisabled();
		await expect(page.locator('#batch-file')).toBeEnabled();
		await expect(page.locator('#batch-source-note')).toHaveText(
			'Loaded sites.csv. Remove the file to type addresses.'
		);
		await page.locator('#batch-file-clear').click();
		await expect(list).toBeEnabled();
		await expect(list).toHaveValue('');
		await expect(list).toBeFocused();
		await expect(page.locator('#batch-file-clear')).toBeHidden();
		await expect(page.locator('#batch-preview li')).toHaveCount(0);
		await list.fill('c.example\nd.example');
		await expect(page.locator('#batch-file')).toBeDisabled();
	});

	test('a loaded file can be replaced by another file', async ({ page }) => {
		await openList(page);
		await page.locator('#batch-file').setInputFiles(CSV);
		await expect(page.locator('#batch-preview li')).toHaveCount(2);
		await page.locator('#batch-file').setInputFiles({
			name: 'more.txt',
			mimeType: 'text/plain',
			buffer: Buffer.from('c.example\nd.example\ne.example\n'),
		});
		await expect(page.locator('#batch-preview li')).toHaveCount(3);
		await expect(page.locator('#batch-source-note')).toContainText('more.txt');
	});

	test('the lock notes speak the page language', async ({ page }) => {
		const list = await openList(page, 'es');
		await list.fill('a.example');
		await expect(page.locator('#batch-source-note')).toHaveText('Vacía el cuadro de texto para cargar un archivo.');
		await list.fill('');
		await page.locator('#batch-file').setInputFiles(CSV);
		await expect(page.locator('#batch-file-clear')).toHaveText('Quitar el archivo');
	});
});

test.describe('Report competitor box predictions', () => {
	async function openCompare(page) {
		await open(page);
		await page.evaluate(() => {
			document.getElementById('dash-overlay').classList.add('open');
			document.getElementById('compare-ask').hidden = false;
		});
		const box = page.locator('#compare-url');
		await expect(box).toBeVisible();
		return box;
	}

	test('https:// sits in front of the box and a pasted scheme is dropped', async ({ page }) => {
		const box = await openCompare(page);
		await expect(page.locator('#compare-url-field span')).toHaveText('https://');
		await box.fill('https://carlosandmunoz.com/pricing');
		await expect(box).toHaveValue('carlosandmunoz.com/pricing');
		await box.fill('http:///www.google.com');
		await expect(box).toHaveValue('www.google.com');
	});

	test('hosts and paths are predicted, and Enter on a suggestion picks it without starting the comparison', async ({
		page,
	}) => {
		const box = await openCompare(page);
		await box.pressSequentially('goo');
		await expect(page.locator('#compare-url-suggest li').first()).toHaveText('www.google.com');
		await box.press('ArrowDown');
		await expect(box).toHaveAttribute('aria-activedescendant', 'compare-url-opt-0');
		await box.press('Enter');
		await expect(box).toHaveValue('www.google.com');
		await expect(page.locator('#compare-url-hint')).toContainText('is online and is one of the most visited sites');
		await expect(page.locator('#dash-overlay')).toHaveClass(/open/);
		await box.fill('carlosandmunoz.com/che');
		await expect(page.locator('#compare-url-suggest li')).toHaveText(['/checkout', '/blog/checkout-tips']);
		await expect(page.locator('#url-suggest')).toBeHidden();
	});

	test('a misspelt competitor host offers the popular one', async ({ page }) => {
		const box = await openCompare(page);
		await box.fill('gogle.com');
		await expect(page.locator('#compare-url-hint')).toContainText('does not exist');
		await page.locator('#compare-url-hint .url-fix').click();
		await expect(box).toHaveValue('www.google.com');
	});
});

test.describe('The hero address box (#2785)', () => {
	test('predicts hosts, checks the host, and fills the request without opening its list', async ({ page }) => {
		await open(page);
		const hero = page.locator('#stage-url');
		await hero.pressSequentially('https://goo');
		await expect(hero).toHaveValue('goo');
		await expect(page.locator('#stage-url-suggest li').first()).toHaveText('www.google.com');
		await hero.press('ArrowDown');
		await hero.press('Enter');
		await expect(hero).toHaveValue('www.google.com');
		await expect(page.locator('#stage-url-hint')).toContainText('is online and is one of the most visited sites');
		await expect(page.locator('#url')).toHaveValue('');
		await page.locator('#stage-start button[type="submit"]').click();
		await expect(page.locator('#url')).toHaveValue('www.google.com');
		await expect(page.locator('#url-hint')).toContainText('is online');
		await expect(page.locator('#url-suggest')).toBeHidden();
	});

	test('offers the popular host for a misspelling, and lists sitemap pages after a slash', async ({ page }) => {
		await open(page);
		const hero = page.locator('#stage-url');
		await hero.fill('gogle.com');
		await expect(page.locator('#stage-url-hint')).toContainText('does not exist');
		await page.locator('#stage-url-hint .url-fix').click();
		await expect(hero).toHaveValue('www.google.com');
		await hero.fill('');
		await hero.pressSequentially('carlosandmunoz.com/qa');
		await expect(page.locator('#stage-url-suggest li')).toHaveText(['/qa-lab', '/qa-review']);
	});

	test('an empty or spaced address says what to enter, in the page language', async ({ page }) => {
		await open(page, 'es');
		await page.locator('#stage-start button[type="submit"]').click();
		await expect(page.locator('#stage-url-error')).toHaveText('Escribe una página pública después de https://.');
		await expect(page.locator('#stage-url-field')).toHaveClass(/invalid/);
		await page.locator('#stage-url').fill('example.com/a b');
		await expect(page.locator('#stage-url-error')).toHaveText('');
		await page.locator('#stage-start button[type="submit"]').click();
		await expect(page.locator('#stage-url-error')).not.toHaveText('');
	});

	test('stays in step with the request box', async ({ page }) => {
		const box = await open(page);
		await box.fill('example.com/docs');
		await expect(page.locator('#stage-url')).toHaveValue('example.com/docs');
	});
});
