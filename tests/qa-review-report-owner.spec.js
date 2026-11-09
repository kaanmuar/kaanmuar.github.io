const { test, expect } = require('@playwright/test');
const auth = require('../functions/url-review-auth');
const core = require('../functions/url-review-core');
const offers = require('../functions/url-review-offers');
const sample = { frameworks: require('../functions/url-review-core').FRAMEWORKS, report: require('./unit/fixtures/review-carlosandmunoz.json') };

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
async function open(page, who, report, extra) {
  const store = auth.memoryStore();
  const people = { ana: await signIn(store, 'ana@example.com', ANA), ben: await signIn(store, 'ben@example.com', BEN) };
  const row = Object.assign({ email: 'ana@example.com', paid: true, frameworks: sample.frameworks, report: Object.assign({}, report || sample.report, { id: ID }) }, extra);
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
      if (access.status === 402 && offers.reopenFree(row, Date.now())) {
        return json(200, { report: core.previewReport(row.report), frameworks: row.frameworks, paid: false, free: false, addons: [], reopenUntil: offers.reopenFreeUntil(row), priceUsd: 19, creditUsd: 0, tools: [], id: ID, host: row.report.host });
      }
      if (access.status === 402) return json(402, { paymentRequired: true, priceUsd: 19, creditUsd: 0, frameworks: row.frameworks, tools: [], id: ID, host: row.report.host, addons: [], preview: core.previewReport(row.report) });
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

  test('on a desktop the pinned toolbar is one slim row, and every action stays one click away (#2829)', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await open(page, 'ana');
    await expect(page.locator('body')).toHaveClass(/paid-copy/);
    const bar = page.locator('#dash-overlay .report-toolbar');
    expect((await bar.boundingBox()).height).toBeLessThan(60);
    await page.locator('#dash-overlay').evaluate((el) => el.scrollTo(0, 1600));
    await expect.poll(async () => Math.round((await bar.boundingBox()).y)).toBe(0);
    await page.locator('#export-toggle').click();
    for (const id of ['#download-json', '#download-text', '#print-report', '#case-export-open']) await expect(page.locator(id)).toBeVisible();
    await page.locator('#share-toggle').click();
    await expect(page.locator('#export-menu')).toBeHidden();
    await expect(page.locator('#copy-link')).toBeVisible();
    await expect(page.locator('#share-menu [data-net="linkedin"]')).toBeVisible();
    await page.locator('#export-toggle').click();
    await page.locator('#case-export-open').click();
    await expect(page.locator('#case-export-title')).toBeVisible();
  });

  test('another signed-in account gets the blurred preview and a sign-in prompt', async ({ page }) => {
    const asked = await open(page, 'ben');
    await expect(page.locator('#form-status')).toContainText('belongs to another account');
    await expect(page.locator('body')).not.toHaveClass(/paid-copy/);
    await expect(page.locator('#pay')).toBeHidden();
    expect(asked[0]).toEqual({ id: ID, session: true });
  });

  test('Already solid leaves out the chat launcher when none was checked', async ({ page }) => {
    await open(page, 'ana');
    const cols = page.locator('.exec-cols');
    await expect(cols).toContainText('Markup, axe-core, phone layout, accessibility statement');
    await expect(cols).not.toContainText('chat launcher');
  });

  test('the chat card says what was seen when the chat set no cookie but still loaded', async ({ page }) => {
    const chat = {
      vendors: [{ name: 'HubSpot Chat', ai: false }], requests: 1, kb: 30, ms: 0, banner: true, cookies: [],
      rejected: { cookies: [], requests: 1 }, launcher: { hidden: true }, opened: false,
      states: { consent: 'risk', reject: 'risk', weight: 'pass', cover: 'unknown', name: 'unknown', focus: 'unknown', trap: 'unknown', privacy: 'unknown' }
    };
    await open(page, 'ana', Object.assign({}, sample.report, { insights: Object.assign({}, sample.report.insights, { chat }) }));
    const card = page.locator('article', { hasText: 'Chat widget' });
    await expect(card.locator('tr', { hasText: 'Before a choice' })).toContainText('No cookie · 1 request before a choice');
    await expect(card.locator('tr', { hasText: 'After Reject' })).toContainText('No cookie · 1 request');
    await expect(card.locator('tr', { hasText: 'Launcher on a phone' })).toContainText('Hidden on the phone');
    await expect(page.locator('.exec-cols')).not.toContainText('chat launcher');
  });

  test('the pages without an analytics tag show the first eight and open the rest with Show all (#1692)', async ({ page }) => {
    const untagged = Array.from({ length: 12 }, (_, i) => '/no-tag-' + i);
    const analytics = Object.assign({}, sample.report.insights.analytics, { untagged });
    await open(page, 'ana', Object.assign({}, sample.report, { insights: Object.assign({}, sample.report.insights, { analytics }) }));
    const note = page.locator('#analytics .meta-line', { hasText: 'Pages without a tag' });
    await expect(note.locator('.list-more')).toHaveText('Show all 12');
    expect(await note.innerText()).toContain('/no-tag-7');
    expect(await note.innerText()).not.toContain('/no-tag-8');
    await note.locator('.list-more').click();
    await expect(note).toContainText('/no-tag-11');
    await expect(note.locator('.list-more')).toHaveText('Show fewer');
  });

  test('within 7 days the owner reopens an unpaid report under the frost, with its sample case, and no payment dialog', async ({ page }) => {
    const ran = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();
    await open(page, 'ana', null, { paid: false, createdAt: ran });
    await expect(page.locator('#form-status')).toContainText('Opening it again is free until ' + offers.reopenFreeUntil({ createdAt: ran }).slice(0, 10));
    await expect(page.locator('body')).toHaveClass(/preview-copy/);
    await expect(page.locator('#pay')).toBeHidden();
    await expect(page.locator('#cases .case-sample')).toHaveCount(1);
    await expect(page.locator('#cases .case-sample .case-fade')).toHaveCount(0);
    await expect(page.locator('#cases .case-sample pre.case-script')).toHaveCount(1);
    expect(await page.locator('#cases .case:not(.case-sample) .case-fade').count()).toBeGreaterThan(0);
  });

  test('after 7 days the owner reopening an unpaid report is asked to pay', async ({ page }) => {
    await open(page, 'ana', null, { paid: false, createdAt: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString() });
    await expect(page.locator('#pay')).toBeVisible();
    await expect(page.locator('#form-status')).toContainText('The 7 days of free reopening have ended');
    await expect(page.locator('body')).not.toHaveClass(/paid-copy/);
  });

  test('an emailed link opened signed out shows the blurred preview and asks to sign in', async ({ page }) => {
    await open(page, null);
    await expect(page.locator('#form-status')).toContainText('Sign in with the account that ran this report');
    await expect(page.locator('body')).not.toHaveClass(/paid-copy/);
    await expect(page.locator('#pay')).toBeHidden();
    await expect(page.locator('#sign-in-email')).toBeFocused();
  });
});
