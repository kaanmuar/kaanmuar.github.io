const { test, expect } = require('@playwright/test');

const ONLINE = ['www.google.com', 'carlosandmunoz.com', 'gooogle.com'];
const SITEMAPS = { 'carlosandmunoz.com': ['/qa-lab', '/pricing', '/checkout', '/qa-review', '/blog/checkout-tips'] };
const TERMS = require('fs').readFileSync(require('path').join(__dirname, '../js/qa-review.js'), 'utf8').match(/TERMS_VERSION = "([^"]+)"/)[1];

async function open(page) {
  await page.addInitScript((version) => {
    try {
      sessionStorage.setItem('qa-review-terms', version);
      localStorage.setItem('hasSeenReviewTour', 'true');
      localStorage.setItem('qa-review-analytics', 'necessary');
      localStorage.setItem('cv-preferred-lang', 'en');
    } catch (e) { /* storage is optional */ }
  }, TERMS);
  await page.route(/\/news\?/, (route) => route.fulfill({ contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: '{"items":[]}' }));
  await page.route(/ipwho\.is/, (route) => route.fulfill({ contentType: 'application/json', body: '{"success":false}' }));
  await page.route(/dns\.google\/resolve/, (route) => {
    const name = new URL(route.request().url()).searchParams.get('name');
    const body = ONLINE.includes(name) ? { Status: 0, Answer: [{ data: '203.0.113.7' }] } : { Status: 3 };
    route.fulfill({ contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(body) });
  });
  await page.route(/\/paths\?host=/, (route) => {
    const host = new URL(route.request().url()).searchParams.get('host');
    route.fulfill({ contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ host, paths: SITEMAPS[host] || [] }) });
  });
  await page.goto('/qa-review.html');
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
