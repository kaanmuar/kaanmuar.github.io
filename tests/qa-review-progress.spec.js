const { test, expect } = require('@playwright/test');

const TERMS = require('fs').readFileSync(require('path').join(__dirname, '../js/qa-review.js'), 'utf8').match(/TERMS_VERSION = "([^"]+)"/)[1];

async function prime(page) {
  await page.addInitScript((version) => {
    try {
      sessionStorage.setItem('qa-review-terms', version);
      localStorage.setItem('hasSeenReviewTour', 'true');
      localStorage.setItem('qa-review-analytics', 'necessary');
    } catch (e) { /* storage is optional */ }
  }, TERMS);
  await page.route(/\/news\?/, (route) => route.fulfill({ contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: '{"items":[]}' }));
  await page.route(/ipwho\.is/, (route) => route.fulfill({ contentType: 'application/json', body: '{"success":false}' }));
}

const feed = (page, lines) => page.evaluate((all) => all.forEach((text) => window.ReviewProgress.line(text)), lines);
const percent = (page) => page.locator('.rp-stage').getAttribute('aria-valuenow').then(Number);

test.describe('Review progress', () => {
  test('stays hidden until a review starts', async ({ page }) => {
    await prime(page);
    await page.goto('/qa-review.html');
    await expect(page.locator('#run-panel .rp')).toBeHidden();
  });

  test('follows the server lines through the pages and ends at 100 with the report', async ({ page }) => {
    await prime(page);
    await page.goto('/qa-review.html');
    await page.evaluate(() => window.ReviewProgress.start({ host: 'example.com/path', pages: 5 }));
    await expect(page.locator('.rp')).toBeVisible();
    await expect(page.locator('.rp-phase')).toHaveText('Connecting');
    await feed(page, ['Checking that the address is public https.', 'Reading robots.txt.', '9 same-host links were listed. This read opens at most 5 HTML pages and 2 links deep.', 'Opening /a.', 'Opening /b.']);
    await expect(page.locator('.rp-phase')).toHaveText('Reading pages · 3 of 5');
    await expect.poll(() => percent(page)).toBeGreaterThanOrEqual(38);
    await feed(page, ['Read 3 pages. Writing the proposed cases now.', 'Proposed 12 cases.']);
    await expect(page.locator('.rp-phase')).toHaveText('Writing cases');
    await expect(page.locator('.rp-sky .rp-msg').first()).toBeAttached();
    await page.evaluate(() => window.ReviewProgress.finish('ready'));
    await expect(page.locator('.rp-phase')).toHaveText('Report ready');
    await expect.poll(() => percent(page)).toBe(100);
    await expect(page.locator('.rp')).toHaveClass(/is-done/);
  });

  test('never moves back and marks an early end', async ({ page }) => {
    await prime(page);
    await page.goto('/qa-review.html');
    await page.evaluate(() => window.ReviewProgress.start({ host: 'example.com', pages: 20 }));
    await feed(page, ['Scoring the checks from the pages read.']);
    await expect.poll(() => percent(page)).toBeGreaterThanOrEqual(92);
    await feed(page, ['Opening the first page.']);
    expect(await percent(page)).toBeGreaterThanOrEqual(92);
    await page.evaluate(() => window.ReviewProgress.fail());
    await expect(page.locator('.rp-phase')).toHaveText('The review ended early');
    await expect(page.locator('.rp-sky')).toHaveClass(/is-off/);
  });

  test('speaks the page language', async ({ page }) => {
    await prime(page);
    await page.goto('/qa-review-de.html');
    await page.evaluate(() => window.ReviewProgress.start({ host: 'beispiel.de', pages: 20 }));
    await expect(page.locator('.rp-phase')).toHaveText('Verbinden');
    await expect(page.locator('.rp-phase')).toHaveAttribute('translate', 'no');
  });
});
