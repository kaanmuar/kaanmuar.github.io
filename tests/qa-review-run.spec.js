const { test, expect } = require('@playwright/test');
const auth = require('../functions/url-review-auth');
const sample = { frameworks: require('../functions/url-review-core').FRAMEWORKS, report: require('./unit/fixtures/review-carlosandmunoz.json') };

const TERMS = require('fs').readFileSync(require('path').join(__dirname, '../js/qa-review.js'), 'utf8').match(/TERMS_VERSION = "([^"]+)"/)[1];
const ID = 'ab12cd34ef56';
const ANA = 'a'.repeat(64);
const SHOTS = process.env.RUN_SHOTS || '';

async function shot(page, name, at) {
  if (!SHOTS) return;
  await page.locator(at || '#report-tabs').scrollIntoViewIfNeeded();
  await page.screenshot({ path: require('path').join(SHOTS, name + '.png') });
}

// The stub answers /review/run/* with the real owner rule and a run that moves queued → running → done as the page polls.
async function open(page, who, script) {
  const store = auth.memoryStore();
  const started = await auth.startEmail(store, { email: 'ana@example.com', deviceKey: ANA, ip: '1.1.1.1' });
  const ana = Object.assign({ email: 'ana@example.com', deviceKey: ANA }, await auth.finishEmail(store, { id: started.id, code: started.code, deviceKey: ANA }));
  const row = { email: 'ana@example.com', paid: true, frameworks: sample.frameworks, report: Object.assign({}, sample.report, { id: ID }) };
  const me = who === 'ana' ? ana : null;
  const calls = [];
  await page.addInitScript(({ version, me }) => {
    try {
      sessionStorage.setItem('qa-review-terms', version);
      localStorage.setItem('hasSeenReviewTour', 'true');
      localStorage.setItem('qa-review-analytics', 'necessary');
      if (me) {
        localStorage.setItem('qa-review-session', JSON.stringify({ session: me.session, email: me.email, provider: 'email' }));
        localStorage.setItem('qa-review-device-key', JSON.stringify(me.deviceKey));
      }
    } catch (e) { /* storage is optional */ }
  }, { version: TERMS, me });
  await page.route(/ipwho\.is/, (route) => route.fulfill({ contentType: 'application/json', body: '{"success":false}' }));
  await page.route('http://127.0.0.1:8768/**', async (route) => {
    const req = route.request();
    const path = new URL(req.url()).pathname;
    const cors = { 'access-control-allow-origin': req.headers().origin || '*', 'access-control-allow-credentials': 'true', 'access-control-allow-headers': 'content-type' };
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: Object.assign({ 'access-control-allow-methods': 'GET,POST' }, cors) });
    const body = req.postData() ? JSON.parse(req.postData()) : {};
    const json = (status, data) => route.fulfill({ status, contentType: 'application/json', headers: cors, body: JSON.stringify(data) });
    if (path === '/auth/session') {
      const signed = await auth.checkSession(store, Object.assign({}, body, { deviceKey: me && me.deviceKey }));
      return json(signed.ok ? 200 : signed.status, signed);
    }
    if (path === '/review/open') {
      const access = await auth.reportAccess(store, body, row, false);
      return access.ok ? json(200, { report: row.report, frameworks: row.frameworks, paid: true }) : json(access.status, { error: access.error, signIn: true, locked: true });
    }
    if (path === '/review/run/status' || path === '/review/run/sample') {
      calls.push(path);
      const access = await auth.runAccess(store, body, row);
      if (!access.ok) return json(access.status, { error: access.error, code: access.code, signIn: !!access.signIn });
      const out = script(path, calls);
      return json(out.status || 200, out.body);
    }
    return json(200, path === '/auth/providers' ? { providers: [{ id: 'email' }] } : { items: [] });
  });
  await page.goto('/qa-review.html?report=' + ID + '#run');
  return calls;
}

const host = sample.report.host;
const ids = sample.report.cases.slice(0, 5).map((item) => item.id);
const next = '2026-11-04T00:00:00.000Z';
const base = { id: 'run1', source: 'sample', host, frameworks: ['Playwright'], cases: 5, at: new Date(Date.now() - 70000).toISOString() };
const running = (lines) => Object.assign({}, base, { status: 'running', startedAt: new Date(Date.now() - 65000).toISOString(), only: ids, log: lines });
const done = Object.assign({}, base, {
  status: 'done', only: ids, startedAt: new Date(Date.now() - 65000).toISOString(), finishedAt: new Date().toISOString(),
  summary: { total: 5, passed: 3, failed: 1, flaky: 1, skipped: 0 },
  results: ids.map((id, at) => ({ id, title: sample.report.cases[at].title, status: ['passed', 'failed', 'passed', 'flaky', 'passed'][at], ms: 800 + at * 300, triage: at === 1 ? 'site' : '', error: at === 1 ? 'Error: expect(received).toBeGreaterThanOrEqual(expected)\nExpected: >= 1\nReceived: 0' : '' }))
});

test.describe('The report\'s Run tab', () => {
  test.use({ viewport: { width: 420, height: 900 } });

  test('the owner runs the free sample, follows the log, then reads the results', async ({ page }) => {
    const calls = await open(page, 'ana', (path, seen) => {
      const polls = seen.filter((p) => p === '/review/run/status').length;
      const began = seen.indexOf('/review/run/sample') !== -1;
      if (!began) return { body: { run: null, sample: { used: false, next }, size: 5 } };
      if (path === '/review/run/sample') return { body: { run: Object.assign({}, base, { status: 'queued' }), sample: { used: true, next }, size: 5 } };
      if (polls <= 2) return { body: { run: running(['Running 5 tests using 4 workers', '  ✓  ' + ids[0] + ' · ' + sample.report.cases[0].title + ' (812ms)', '  ✘  ' + ids[1] + ' · ' + sample.report.cases[1].title + ' (1.1s)']), sample: { used: true, next }, size: 5 } };
      return { body: { run: done, sample: { used: true, next }, size: 5 } };
    });
    const panel = page.locator('#cube-panel');
    await expect(page.locator('#tab-run')).toHaveAttribute('aria-selected', 'true');
    await expect(page.locator('#report')).toBeHidden();
    await expect(panel.locator('[data-run="sample"]')).toHaveText('Run 5 cases free');
    await expect(panel).toContainText('29 USD, or 19 USD in the launch month');
    await shot(page, '1-ready');
    await panel.locator('[data-run="sample"]').click();
    await expect(panel.locator('.run-log')).toContainText('Running 5 tests using 4 workers');
    await expect(panel.locator('.run-status')).toContainText('Running 5 cases on ' + host);
    await shot(page, '2-running');
    await expect(panel.locator('.run-results').first()).toBeVisible({ timeout: 15000 });
    await expect(panel.locator('.run-row.run-failed')).toContainText('The site\'s problem');
    await expect(panel).toContainText('more cases not in the sample');
    await expect(panel.locator('.run-locked .run-row')).toHaveCount(10);
    await shot(page, '3-done', '.run-kpis');
    await shot(page, '3b-done-rest', '.run-rest');
    expect(calls[0]).toBe('/review/run/status');
    await page.locator('#tab-report').click();
    await expect(page.locator('#report')).toBeVisible();
    await expect(panel).toBeHidden();
    expect(new URL(page.url()).hash).toBe('');
  });

  test('signed out, a paid report stays closed, so there is no Run tab and no run call', async ({ page }) => {
    const calls = await open(page, null, () => ({ body: {} }));
    await expect(page.locator('#form-status')).toContainText(/sign in/i);
    await expect(page.locator('#report-tabs')).toBeHidden();
    expect(calls).toEqual([]);
  });

  test('a site whose sample already ran today says when the next one opens', async ({ page }) => {
    await open(page, 'ana', () => ({ body: { run: null, sample: { used: true, next }, size: 5 } }));
    await expect(page.locator('#cube-panel .run-used')).toContainText('already ran today');
    await expect(page.locator('#cube-panel [data-run="sample"]')).toHaveCount(0);
    await shot(page, '4-used');
  });
});
