const { test, expect } = require('@playwright/test');
const auth = require('../functions/url-review-auth');
const rivals = require('../functions/url-review-rivals');
const sample = require('../assets/qa-review-sample.json');
const own = require('./unit/fixtures/review-wordpress.json');

const TERMS = require('fs').readFileSync(require('path').join(__dirname, '../js/qa-review.js'), 'utf8').match(/TERMS_VERSION = "([^"]+)"/)[1];
const ID = 'ab12cd34ef56';
const ANA = 'a'.repeat(64);
const FOUND = { at: '2026-10-24T03:00:00Z', ownRank: { read: true, rank: 1500 }, list: [
  { host: 'rival-one.com', rank: { read: true, rank: 900 } },
  { host: 'rival-two.com', rank: { read: true, rank: 2100 } },
  { host: 'rival-three.com', rank: null }
] };

// The page asks /review/rivals after the report opens; the server answers in full only when it is paid.
async function open(page, paid) {
  const store = auth.memoryStore();
  const started = await auth.startEmail(store, { email: 'ana@example.com', deviceKey: ANA, ip: '1.1.1.1' });
  const signed = await auth.finishEmail(store, { id: started.id, code: started.code, deviceKey: ANA });
  const report = Object.assign({}, own, { id: ID });
  const records = [{ id: 'r1', report: Object.assign({}, sample.report, { host: 'rival-one.com' }) }, { id: 'r2', report: Object.assign({}, sample.report, { host: 'rival-two.com' }) }, null];
  const answer = rivals.payload(report, FOUND, records, paid);
  await page.addInitScript(({ version, session }) => {
    try {
      sessionStorage.setItem('qa-review-terms', version);
      localStorage.setItem('hasSeenReviewTour', 'true');
      localStorage.setItem('qa-review-analytics', 'necessary');
      localStorage.setItem('qa-review-session', JSON.stringify({ session, email: 'ana@example.com', provider: 'email' }));
      localStorage.setItem('qa-review-device-key', JSON.stringify('a'.repeat(64)));
    } catch (e) { /* storage is optional */ }
  }, { version: TERMS, session: signed.session });
  await page.route(/ipwho\.is/, (route) => route.fulfill({ contentType: 'application/json', body: '{"success":false}' }));
  await page.route('http://127.0.0.1:8768/**', async (route) => {
    const req = route.request();
    const path = new URL(req.url()).pathname;
    const cors = { 'access-control-allow-origin': req.headers().origin || '*', 'access-control-allow-credentials': 'true', 'access-control-allow-headers': 'content-type' };
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: Object.assign({ 'access-control-allow-methods': 'GET,POST' }, cors) });
    const body = req.postData() ? JSON.parse(req.postData()) : {};
    const json = (status, data) => route.fulfill({ status, contentType: 'application/json', headers: cors, body: JSON.stringify(data) });
    if (path === '/auth/session') {
      const checked = await auth.checkSession(store, Object.assign({}, body, { deviceKey: ANA }));
      return json(checked.ok ? 200 : checked.status, checked);
    }
    if (path === '/review/open') {
      return paid ? json(200, { report, frameworks: sample.frameworks, paid: true })
        : json(402, { paymentRequired: true, priceUsd: 9, frameworks: sample.frameworks, id: ID, host: report.host, preview: Object.assign({}, report, { preview: true }) });
    }
    if (path === '/review/rivals') return json(body.id === ID ? 200 : 404, { rivals: answer });
    return json(200, path === '/auth/providers' ? { providers: [{ id: 'email' }] } : { items: [] });
  });
  await page.goto('/qa-review.html?report=' + ID);
  const box = page.locator('#rivals');
  await expect(box.locator('.rivals-pick')).toBeVisible({ timeout: 20000 });
  await box.scrollIntoViewIfNeeded();
  return box;
}

test.describe('Natural competitors in the comparison section', () => {
  test('a paid report shows the reviewed competitors in clear and lets the reader pick any or many', async ({ page }) => {
    const box = await open(page, true);
    const table = box.locator('.rivals-table');
    await expect(table.locator('thead th')).toHaveText(['Indicator', own.host, 'rival-one.com', 'rival-two.com']);
    await expect(table.locator('.rival-frost')).toHaveCount(0);
    await expect(table.locator('tbody tr').first().locator('td').nth(1)).toHaveText(String(sample.report.insights.score.overall));
    await box.locator('summary').click();
    await box.getByLabel('rival-one.com').uncheck();
    await expect(table.locator('thead th')).toHaveText(['Indicator', own.host, 'rival-two.com']);
    await box.getByLabel(/rival-three\.com/).check();
    await expect(table.locator('thead th')).toHaveText(['Indicator', own.host, 'rival-two.com', 'rival-three.com']);
    await expect(table.locator('[data-rival-run="rival-three.com"]')).toBeVisible();
    await table.locator('[data-rival-full="rival-two.com"]').click();
    await expect(page.locator('#compare-result')).toContainText('rival-two.com');
  });

  test('an unpaid report keeps the competitor names readable and their scores under the frost', async ({ page }) => {
    const box = await open(page, false);
    const table = box.locator('.rivals-table');
    await expect(table.locator('thead th')).toHaveText(['Indicator', own.host, 'rival-one.com', 'rival-two.com']);
    await expect(table.locator('.rival-frost').first()).toHaveCSS('filter', /blur/);
    await expect(table).not.toContainText(String(sample.report.insights.score.overall));
    await expect(box).toContainText('open in full once this report is paid');
    await expect(table.locator('[data-rival-full], [data-rival-run]')).toHaveCount(0);
  });
});
