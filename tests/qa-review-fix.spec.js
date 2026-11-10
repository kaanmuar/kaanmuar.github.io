const path = require('path');
const { test, expect } = require('./net-guard');
const auth = require('../functions/url-review-auth');
const fixOffers = require('../functions/url-review-fix-offers');
const sample = { frameworks: require('../functions/url-review-core').FRAMEWORKS, report: require('./unit/fixtures/review-carlosandmunoz.json') };

const TERMS = require('fs').readFileSync(path.join(__dirname, '../js/qa-review.js'), 'utf8').match(/TERMS_VERSION = "([^"]+)"/)[1];
const ID = 'ab12cd34ef56';
const ANA = 'a'.repeat(64);
// Phone screenshots for review: FIX_SHOTS=<dir> npx playwright test tests/qa-review-fix.spec.js
const SHOTS = process.env.FIX_SHOTS || '';

// The stub answers /review/fix/* with the real access rule and request record, so the page sees what the server decides.
async function open(page, { lang = 'en', signedIn = true } = {}) {
  const store = auth.memoryStore();
  const started = await auth.startEmail(store, { email: 'ana@example.com', deviceKey: ANA, ip: '1.1.1.1' });
  const me = Object.assign(await auth.finishEmail(store, { id: started.id, code: started.code, deviceKey: ANA }), { email: 'ana@example.com', deviceKey: ANA });
  const row = { email: 'ana@example.com', paid: true, frameworks: sample.frameworks, report: Object.assign({}, sample.report, { id: ID }) };
  const sent = [];
  await page.addInitScript(({ version, me, lang, signedIn }) => {
    try {
      sessionStorage.setItem('qa-review-terms', version);
      localStorage.setItem('hasSeenReviewTour', 'true');
      localStorage.setItem('qa-review-analytics', 'necessary');
      localStorage.setItem('cv-preferred-lang', lang);
      if (signedIn) {
        localStorage.setItem('qa-review-session', JSON.stringify({ session: me.session, email: me.email, provider: 'email' }));
        localStorage.setItem('qa-review-device-key', JSON.stringify(me.deviceKey));
      }
    } catch (e) { /* storage is optional */ }
  }, { version: TERMS, me, lang, signedIn });
  await page.route(/ipwho\.is/, (route) => route.fulfill({ contentType: 'application/json', body: '{"success":false}' }));
  await page.route('http://127.0.0.1:8768/**', async (route) => {
    const req = route.request();
    const where = new URL(req.url()).pathname;
    const cors = { 'access-control-allow-origin': req.headers().origin || '*', 'access-control-allow-credentials': 'true', 'access-control-allow-headers': 'content-type' };
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: Object.assign({ 'access-control-allow-methods': 'GET,POST' }, cors) });
    const body = req.postData() ? JSON.parse(req.postData()) : {};
    const json = (status, data) => route.fulfill({ status, contentType: 'application/json', headers: cors, body: JSON.stringify(data) });
    if (where === '/auth/session') {
      const signed = await auth.checkSession(store, Object.assign({}, body, { deviceKey: ANA }));
      return json(signed.ok ? 200 : signed.status, signed);
    }
    if (where === '/review/open') return json(200, { report: row.report, frameworks: row.frameworks, paid: true });
    if (where === '/review/ask') {
      const access = await auth.askAccess(store, body, row, false);
      return json(access.ok ? 200 : access.status, access.ok ? { ok: true } : { error: access.error });
    }
    if (where === '/review/fix/offers') return json(200, { packages: fixOffers.publicPackages() });
    if (where === '/review/fix/request') {
      const access = await auth.askAccess(store, body, row, true);
      if (!access.ok) return json(access.status, { error: access.error, code: access.code || '', signIn: !!access.signIn });
      const record = fixOffers.requestRecord(body, row, access.email, Date.now());
      if (record.error) return json(400, { error: record.error });
      sent.push(record);
      return json(200, { ok: true, id: 'fix1', email: record.email, status: record.status });
    }
    return json(200, where === '/auth/providers' ? { providers: [{ id: 'email' }] } : { items: [] });
  });
  await page.goto((lang === 'en' ? '/qa-review.html' : '/qa-review-' + lang + '.html') + '?report=' + ID);
  await expect(page.locator('body')).toHaveClass(/paid-copy/);
  return sent;
}

async function shot(target, name) {
  if (SHOTS) await target.screenshot({ path: path.join(SHOTS, name) });
}

test.describe('Fix what the report found (#3082)', () => {
  test('every open finding offers the fix and the request; a passing one does not', async ({ page }) => {
    await open(page);
    const card = page.locator('#findings .finding', { has: page.locator('.id', { hasText: /^F-01$/ }) });
    await expect(card.locator('[data-fix-get="F-01"]')).toHaveText('Get the fix');
    await expect(card.locator('[data-fix-request="F-01"]')).toHaveText('Fix this for me');
    await page.locator('#finding-filters [data-verdict="pass"]').click();
    await expect(page.locator('#findings .finding').first()).toBeVisible();
    await expect(page.locator('#findings [data-fix-request]')).toHaveCount(0);
  });

  test('Get the fix opens Ask the report on that finding\'s fix', async ({ page }) => {
    await open(page);
    await page.locator('[data-fix-get="F-01"]').click();
    await expect(page.locator('#ask-panel')).toBeVisible();
    await expect(page.locator('#ask-log .ask-me').last()).toHaveText(/fix for F-01/);
  });

  test('the report ends with the four paths, the packages its findings call for, and a call with them', async ({ page }) => {
    await open(page);
    const panel = page.locator('#fix-offer');
    await expect(panel).toBeVisible();
    await expect(panel.locator('.fix-path')).toHaveCount(4);
    await expect(panel.locator('.fix-packs li')).toHaveCount(fixOffers.offersFor(sample.report.insights.findings).length);
    await expect(panel.locator('[data-package="security-headers"] .fix-price')).toHaveText('US$149 · about 3 working days');
    const call = new URL(await panel.locator('[data-fix-call]').getAttribute('href'), 'https://carlosandmunoz.com/');
    expect(call.searchParams.get('review')).toBe(ID);
    expect(call.searchParams.get('findings')).toMatch(/^F-01,F-02,/);
  });

  test('Fix this for me opens the form on that finding and its package, and the request goes out', async ({ page }) => {
    const sent = await open(page);
    await page.locator('[data-fix-request="F-01"]').click();
    const sheet = page.locator('#fix-sheet');
    await expect(sheet).toBeVisible();
    await expect(sheet.locator('input[value="F-01"]')).toBeChecked();
    await expect(sheet.locator('input[value="F-02"]')).not.toBeChecked();
    await expect(sheet.locator('select[name=package]')).toHaveValue('security-headers');
    await expect(sheet.locator('.fix-price-note')).toContainText('US$149');
    await sheet.locator('select[name=package]').selectOption('');
    await sheet.locator('textarea[name=access]').fill('Cloudflare Pages, repo on GitHub');
    await sheet.locator('input[name=budget]').fill('300 USD');
    await sheet.getByRole('button', { name: 'Send the request' }).click();
    await expect(sheet).toContainText('We emailed a copy to ana@example.com');
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ kind: 'quote', package: '', budget: '300 USD', access: 'Cloudflare Pages, repo on GitHub', email: 'ana@example.com' });
    expect(sent[0].findings.map((f) => f.id)).toEqual(['F-01']);
  });

  test('ordering a package checks every finding it covers', async ({ page }) => {
    const sent = await open(page);
    await page.locator('[data-fix-package="email-dns"]').click();
    const sheet = page.locator('#fix-sheet');
    await expect(sheet.locator('select[name=package]')).toHaveValue('email-dns');
    await expect(sheet.locator('input[name=finding]:checked')).toHaveCount(2);
    await sheet.getByRole('button', { name: 'Send the request' }).click();
    await expect(sheet).toContainText('Request sent');
    expect(sent[0]).toMatchObject({ kind: 'package', package: 'email-dns', priceUsd: 129 });
  });

  test('on a phone the panel and the form fit the screen, in the page language', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await open(page, { lang: 'es' });
    const panel = page.locator('#fix-offer');
    await panel.scrollIntoViewIfNeeded();
    await expect(panel.locator('h2')).toHaveText('¿Cómo quieres arreglarlos?');
    const wide = await panel.evaluate((el) => el.scrollWidth > el.clientWidth + 1);
    expect(wide).toBe(false);
    await panel.evaluate((el) => { el.scrollIntoView({ block: 'start' }); document.getElementById('dash-overlay').scrollBy(0, -80); });
    await shot(page, 'fix-offer-panel-es.png');
    await panel.locator('.fix-packs').evaluate((el) => el.scrollIntoView({ block: 'start' }));
    await shot(page, 'fix-offer-packages-es.png');
    const card = page.locator('#findings .finding', { has: page.locator('.id', { hasText: /^F-01$/ }) });
    await card.evaluate((el) => el.scrollIntoView({ block: 'center' }));
    await shot(page, 'fix-finding-card-es.png');
    await page.locator('[data-fix-request="F-01"]').click();
    const sheet = page.locator('#fix-sheet');
    await expect(sheet.locator('h2')).toHaveText('Pídenos que lo arreglemos');
    const box = await sheet.boundingBox();
    expect(box.width).toBeLessThanOrEqual(390);
    await shot(page, 'fix-request-form-es.png');
  });
});
