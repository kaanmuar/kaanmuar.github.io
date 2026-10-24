const { test, expect } = require('@playwright/test');
const auth = require('../functions/url-review-auth');
const compare = require('../functions/url-review-compare');
const offers = require('../functions/url-review-offers');
const sample = require('../assets/qa-review-sample.json');
const own = require('./unit/fixtures/review-wordpress.json');

const ANA = 'a'.repeat(64);

test('the account page leads back to the review and Social, picks a language, and compares saved reviews', async ({ page }) => {
  const store = auth.memoryStore();
  const started = await auth.startEmail(store, { email: 'ana@example.com', deviceKey: ANA, ip: '1.1.1.1' });
  const signed = await auth.finishEmail(store, { id: started.id, code: started.code, deviceKey: ANA });
  const records = [
    { id: 'ab12', email: 'ana@example.com', status: 'complete', paid: true, createdAt: '2026-10-24T10:00:00Z', report: Object.assign({}, own, { id: 'ab12' }) },
    { id: 'cd34', email: 'ana@example.com', status: 'complete', paid: true, createdAt: '2026-10-23T10:00:00Z', report: Object.assign({}, sample.report, { id: 'cd34' }) },
    { id: 'ef56', email: 'ana@example.com', status: 'complete', createdAt: '2026-10-22T10:00:00Z', report: Object.assign({}, sample.report, { id: 'ef56', host: 'shut.example.org' }) }
  ];
  const at = Date.parse('2026-10-24T12:00:00Z');
  const asked = [];
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
    const file = offers.accountFile(records, 'ana@example.com', at);
    if (path === '/account/runs') return json(200, file);
    if (path === '/account/compare') {
      asked.push(body.ids);
      const open = new Set(file.runs.filter((run) => run.open).map((run) => run.id));
      const made = compare.savedComparison(records, 'ana@example.com', body.ids, (row) => open.has(row.id));
      return json(made.error ? 400 : 200, made);
    }
    return json(200, path === '/auth/providers' ? { providers: [{ id: 'email' }] } : { items: [] });
  });
  await page.goto('/qa-review-account.html');

  const nav = page.getByRole('navigation', { name: 'QA-lab URL Review' });
  await expect(nav.getByRole('link', { name: 'URL Review' })).toHaveAttribute('href', 'qa-review.html');
  await expect(nav.getByRole('link', { name: 'Live Reports' })).toHaveAttribute('href', 'qa-review.html#live-reports');
  await expect(nav.getByRole('link', { name: 'Social' })).toHaveAttribute('href', 'qa-review-social.html');
  await page.locator('#langToggle').click();
  await expect(page.locator('#langMenu .lang-option').first()).toBeVisible();
  await expect(page.locator('#langMenu .lang-option', { hasText: 'Español' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('#langMenu')).toBeHidden();

  const panel = page.locator('#compare');
  await expect(panel).toBeVisible({ timeout: 20000 });
  await expect(page.locator('#cmp-base')).toHaveValue('ab12');
  await expect(page.locator('#cmp-go')).toBeDisabled();
  await panel.locator('.cmp-pick', { hasText: sample.report.host }).click();
  await panel.locator('.cmp-pick', { hasText: 'shut.example.org' }).click();
  await page.locator('#cmp-go').click();
  await expect(panel.locator('.cmp-table thead th')).toHaveText(['Indicator', own.host, sample.report.host, 'shut.example.org']);
  const cmp = compare.compareSites(records[0].report, records[1].report);
  const health = panel.locator('.cmp-table tbody tr').first();
  await expect(health.locator('td').nth(0)).toHaveText(String(cmp.overall.own));
  await expect(health.locator('td').nth(1)).toHaveText(String(cmp.overall.rival));
  await expect(health.locator('td').nth(2)).toHaveText('Opens in full once this report is paid.');
  await expect(panel.getByRole('link', { name: 'Full comparison' })).toHaveAttribute('href', 'qa-review.html?report=ab12&vs=cd34');
  await expect(panel.getByRole('link', { name: 'Unlock' })).toHaveAttribute('href', /purpose=report&reportId=ef56/);
  await expect(page.locator('#cmp-status')).toHaveText('1 of 2 reviews are compared. The others say why below.');
  if (process.env.ACCOUNT_SHOT) {
    for (const [theme, size] of [['dark', { width: 1280, height: 860 }], ['light', { width: 1280, height: 860 }], ['dark', { width: 390, height: 844 }]]) {
      await page.evaluate((dark) => document.documentElement.classList.toggle('dark-mode', dark), theme === 'dark');
      await page.setViewportSize(size);
      const name = process.env.ACCOUNT_SHOT + '/account-' + theme + '-' + size.width;
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.screenshot({ path: name + '-top.png' });
      await panel.screenshot({ path: name + '-compare.png' });
    }
    await page.setViewportSize({ width: 1280, height: 720 });
  }

  await page.locator('#select-all').check();
  await page.locator('#bulk-compare').click();
  await expect.poll(() => asked.length).toBe(2);
  expect(asked[1]).toEqual(['ab12', 'cd34', 'ef56']);

  await page.locator('#compare-url').fill('https://competitor.example.com/');
  await page.locator('#cmp-new-go').click();
  await expect(page).toHaveURL(/qa-review(-\w\w)?\.html\?report=ab12&compare=competitor\.example\.com%2F/);
});

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
