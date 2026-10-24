const { test, expect } = require('@playwright/test');
const auth = require('../functions/url-review-auth');
const compare = require('../functions/url-review-compare');
const offers = require('../functions/url-review-offers');
const sample = require('../assets/qa-review-sample.json');
const own = require('./unit/fixtures/review-wordpress.json');

const ANA = 'a'.repeat(64);

test('the account page links a comparison to its base review, and the base review to its comparison', async ({ page }) => {
  const store = auth.memoryStore();
  const started = await auth.startEmail(store, { email: 'ana@example.com', deviceKey: ANA, ip: '1.1.1.1' });
  const signed = await auth.finishEmail(store, { id: started.id, code: started.code, deviceKey: ANA });
  const base = { id: 'ab12', email: 'ana@example.com', status: 'complete', paid: true, createdAt: '2026-10-19T10:00:00Z', report: Object.assign({}, own, { id: 'ab12' }) };
  const cmp = compare.compareSites(base.report, sample.report);
  const rival = { id: 'cd34', email: 'ana@example.com', status: 'complete', paid: true, createdAt: '2026-10-24T10:00:00Z', compareWith: 'ab12', report: Object.assign({}, sample.report, { id: 'cd34', compare: cmp }) };
  await page.addInitScript(({ session }) => {
    localStorage.setItem('qa-review-analytics', 'necessary');
    localStorage.setItem('qa-review-session', JSON.stringify({ session, email: 'ana@example.com', provider: 'email' }));
    localStorage.setItem('qa-review-device-key', JSON.stringify('a'.repeat(64)));
  }, { session: signed.session });
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
    if (path === '/account/runs') return json(200, offers.accountFile([base, rival], 'ana@example.com', Date.parse('2026-10-24T12:00:00Z')));
    return json(200, path === '/auth/providers' ? { providers: [{ id: 'email' }] } : { items: [] });
  });
  await page.goto('/qa-review-account.html');
  const rivalCard = page.locator('.run[data-id="cd34"] .run-compare');
  const baseCard = page.locator('.run[data-id="ab12"] .run-compare');
  await expect(rivalCard).toHaveText('Compared with your review of ' + own.host + ': ' + own.host + ' ' + cmp.overall.own + ', ' + sample.report.host + ' ' + cmp.overall.rival + '.', { timeout: 20000 });
  await expect(rivalCard.locator('a')).toHaveAttribute('href', 'qa-review.html?report=ab12');
  await expect(baseCard).toHaveText('Compared with ' + sample.report.host + ': ' + own.host + ' ' + cmp.overall.own + ', ' + sample.report.host + ' ' + cmp.overall.rival + '.');
  await expect(baseCard.locator('a')).toHaveAttribute('href', 'qa-review.html?report=cd34');
});
