const { test, expect } = require('@playwright/test');
const fs = require('fs');
const sample = require('../assets/qa-review-sample.json');

const TERMS = fs.readFileSync(require('path').join(__dirname, '../js/qa-review.js'), 'utf8').match(/TERMS_VERSION = "([^"]+)"/)[1];
const ID = 'bl12cd34ef56';
const CLEAR = 'h1, h2, h3, h4, th, button, label, input, select, textarea, script, style, svg, time, .filters, .fade-line, #kpis, #paid-line, #compare-ask, #rivals > p, .rivals-pick, #case-note, #alarm-note, #tool-note, #unlock-offer';

async function openUnpaid(page, extra) {
  await page.addInitScript((version) => {
    try {
      sessionStorage.setItem('qa-review-terms', version);
      localStorage.setItem('hasSeenReviewTour', 'true');
      localStorage.setItem('qa-review-analytics', 'necessary');
    } catch (e) { /* storage is optional */ }
  }, TERMS);
  await page.route(/ipwho\.is/, (route) => route.fulfill({ contentType: 'application/json', body: '{"success":false}' }));
  await page.route('http://127.0.0.1:8768/**', (route) => {
    const req = route.request();
    const path = new URL(req.url()).pathname;
    const cors = { 'access-control-allow-origin': req.headers().origin || '*', 'access-control-allow-credentials': 'true', 'access-control-allow-headers': 'content-type' };
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: Object.assign({ 'access-control-allow-methods': 'GET,POST' }, cors) });
    const json = (data) => route.fulfill({ status: 200, contentType: 'application/json', headers: cors, body: JSON.stringify(data) });
    if (path === '/review/open') return json(Object.assign({ report: Object.assign({}, sample.report, { id: ID }), frameworks: sample.frameworks, paid: false }, extra || {}));
    return json(path === '/auth/providers' ? { providers: [{ id: 'email' }] } : { items: [] });
  });
  await page.goto('/qa-review.html?report=' + ID);
  await expect(page.locator('#cases .case').first()).toBeVisible();
}

async function exported(page, id) {
  await page.locator('#export-toggle').click();
  const [file] = await Promise.all([page.waitForEvent('download'), page.locator('#' + id).click()]);
  return fs.readFileSync(await file.path(), 'utf8');
}

test.describe('An unpaid report is blurred in every section, and its files cut where the blur starts', () => {
  test('no line longer than a short label is left in the clear outside headings, controls and scores', async ({ page }) => {
    await openUnpaid(page);
    await expect(page.locator('body')).toHaveClass(/preview-copy/);
    const open = await page.evaluate((clear) => {
      const left = [];
      const walker = document.createTreeWalker(document.getElementById('report'), NodeFilter.SHOW_TEXT);
      while (walker.nextNode()) {
        const node = walker.currentNode;
        if (node.parentElement.closest(clear)) continue;
        const line = node.nodeValue.trim();
        if (line.length > 16 && line.split(/\s+/).length >= 4) left.push(line.slice(0, 80));
      }
      return left;
    }, CLEAR);
    expect(open).toEqual([]);
    for (const id of ['exec', 'health', 'security', 'observed', 'report-log', 'report-visuals', 'cases']) {
      expect(await page.locator('#' + id + ' .case-fade').count(), id).toBeGreaterThan(0);
    }
  });

  test('the two prices sit in the clear above the frost: a 5 USD fix list and the full report', async ({ page }) => {
    await openUnpaid(page);
    const offers = page.locator('#unlock-offer a.offer');
    await expect(offers).toHaveCount(2);
    await expect(offers.nth(0)).toContainText('Fix list · 5 USD');
    await expect(offers.nth(0)).toHaveAttribute('href', /purpose=fixlist&reportId=bl12cd34ef56/);
    const full = Number((await offers.nth(1).locator('b').textContent()).match(/Full report · (\d+) USD/)[1]);
    expect((full - 19) % 5).toBe(0);
    expect(full).toBeGreaterThanOrEqual(19 + 5 * (sample.frameworks.length - 1));
    await expect(offers.nth(1)).toHaveAttribute('href', /purpose=report/);
  });

  test('a bought fix list clears the scores and findings, keeps the cases frosted, and leaves only the full report to buy', async ({ page }) => {
    await openUnpaid(page, { addons: ['fixlist'] });
    await expect(page.locator('body')).toHaveClass(/fix-open/);
    await expect(page.locator('#findings .case-fade')).toHaveCount(0);
    await expect(page.locator('#exec .case-fade')).toHaveCount(0);
    expect(await page.locator('#cases .case-fade').count()).toBeGreaterThan(0);
    const offers = page.locator('#unlock-offer a.offer');
    await expect(offers).toHaveCount(1);
    await expect(offers.first()).toHaveAttribute('href', /purpose=report/);
  });

  test('the JSON and the text file keep the readable opening and cut the rest', async ({ page }) => {
    await openUnpaid(page);
    const card = page.locator('#cases .case').first();
    const caseId = (await card.locator('.id').textContent()).trim();
    const shown = (await card.locator('strong .fade-line').evaluate((line) => line.firstChild.nodeValue)).trimEnd();
    const full = sample.report.cases.find((item) => item.id === caseId);
    expect(full.title.startsWith(shown)).toBe(true);

    const json = JSON.parse(await exported(page, 'download-json'));
    const item = json.report.cases.find((one) => one.id === caseId);
    expect(item.title).toBe(shown + ' …');
    const longest = JSON.stringify(json.report).match(/"[^"]{200,}"/g) || [];
    expect(longest.filter((text) => text.split(/\s+/).length >= 4 && !/ …"$/.test(text))).toEqual([]);

    const text = await exported(page, 'download-text');
    expect(text).toContain(caseId + ' [' + item.layer + '] ' + shown + ' … — ');
    expect(text).not.toContain(full.title);
  });
});
