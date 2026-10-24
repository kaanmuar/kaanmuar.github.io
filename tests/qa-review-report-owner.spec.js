const { test, expect } = require('@playwright/test');
const auth = require('../functions/url-review-auth');
const core = require('../functions/url-review-core');
const sample = require('../assets/qa-review-sample.json');

const TERMS = require('fs').readFileSync(require('path').join(__dirname, '../js/qa-review.js'), 'utf8').match(/TERMS_VERSION = "([^"]+)"/)[1];
const ID = 'ab12cd34ef56';
const ANA = 'a'.repeat(64);
const BEN = 'c'.repeat(64);

async function signIn(store, email, deviceKey) {
  const started = await auth.startEmail(store, { email, deviceKey, ip: '1.1.1.1' });
  const signed = await auth.finishEmail(store, { id: started.id, code: started.code, deviceKey });
  return { session: signed.session, email, deviceKey };
}

// The page talks to a stub that answers with the real access rule, so the browser sees what the server decides.
async function open(page, who) {
  const store = auth.memoryStore();
  const people = { ana: await signIn(store, 'ana@example.com', ANA), ben: await signIn(store, 'ben@example.com', BEN) };
  const row = { email: 'ana@example.com', paid: true, frameworks: sample.frameworks, report: Object.assign({}, sample.report, { id: ID }) };
  const asked = [];
  const me = people[who];
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
      asked.push({ id: body.id, session: !!body.session });
      const access = await auth.reportAccess(store, body, row, false);
      if (access.ok) return json(200, { report: row.report, frameworks: row.frameworks, paid: true });
      return json(access.status, { error: access.error, signIn: true, locked: true, id: ID, host: row.report.host, frameworks: row.frameworks, preview: core.previewReport(row.report) });
    }
    if (path === '/review' && req.method() === 'GET') return json(401, { error: 'Sign in with the account that ran this report to read it in full.', signIn: true, locked: true });
    return json(200, path === '/auth/providers' ? { providers: [{ id: 'email' }] } : { items: [] });
  });
  await page.goto('/qa-review.html?report=' + ID);
  return asked;
}

test.describe('A paid report opens only for the account that ran it', () => {
  test('the owner, signed in, reads the report in full', async ({ page }) => {
    const asked = await open(page, 'ana');
    await expect(page.locator('body')).toHaveClass(/paid-copy/);
    await expect(page.locator('#pay')).toBeHidden();
    expect(asked).toEqual([{ id: ID, session: true }]);
  });

  test('another signed-in account gets the blurred preview and a sign-in prompt', async ({ page }) => {
    const asked = await open(page, 'ben');
    await expect(page.locator('#form-status')).toContainText('belongs to another account');
    await expect(page.locator('body')).not.toHaveClass(/paid-copy/);
    await expect(page.locator('#pay')).toBeHidden();
    expect(asked[0]).toEqual({ id: ID, session: true });
  });

  test('an emailed link opened signed out shows the blurred preview and asks to sign in', async ({ page }) => {
    await open(page, null);
    await expect(page.locator('#form-status')).toContainText('Sign in with the account that ran this report');
    await expect(page.locator('body')).not.toHaveClass(/paid-copy/);
    await expect(page.locator('#pay')).toBeHidden();
    await expect(page.locator('#sign-in-email')).toBeFocused();
  });
});
