const { test, expect } = require('./net-guard');
const fs = require('fs');
const path = require('path');
const auth = require('../functions/url-review-auth');

const TERMS = fs.readFileSync(path.join(__dirname, '../js/qa-review.js'), 'utf8').match(/TERMS_VERSION = "([^"]+)"/)[1];
const ANA = 'a'.repeat(64);
const PHONE = { width: 390, height: 844 };
const INCONCLUSIVE = { type: 'error', error: 'Headless Chrome did not finish the page in time.', code: 'inconclusive', email: 'ana@example.com', coupon: 'SORRY-ABCD2345', percent: 20 };

// A free run whose stream ends on `last`, as runReview writes it.
async function openReview(page, file, last) {
  const store = auth.memoryStore();
  const started = await auth.startEmail(store, { email: 'ana@example.com', deviceKey: ANA, ip: '1.1.1.1' });
  const done = await auth.finishEmail(store, { id: started.id, code: started.code, deviceKey: ANA });
  await page.addInitScript(({ version, session }) => {
    try {
      sessionStorage.setItem('qa-review-terms', version);
      localStorage.setItem('hasSeenReviewTour', 'true');
      localStorage.setItem('qa-review-analytics', 'necessary');
      localStorage.setItem('qa-review-session', JSON.stringify({ session, email: 'ana@example.com', provider: 'email' }));
      localStorage.setItem('qa-review-device-key', JSON.stringify('a'.repeat(64)));
    } catch (e) { /* storage is optional */ }
  }, { version: TERMS, session: done.session });
  await page.route(/ipwho\.is/, (route) => route.fulfill({ contentType: 'application/json', body: '{"success":false}' }));
  const seen = { standing: 0, runs: 0 };
  await page.route('http://127.0.0.1:8768/**', async (route) => {
    const req = route.request();
    const where = new URL(req.url()).pathname;
    const cors = { 'access-control-allow-origin': req.headers().origin || '*', 'access-control-allow-credentials': 'true', 'access-control-allow-headers': 'content-type' };
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: Object.assign({ 'access-control-allow-methods': 'GET,POST' }, cors) });
    const body = req.postData() ? JSON.parse(req.postData()) : {};
    const json = (status, data) => route.fulfill({ status, contentType: 'application/json', headers: cors, body: JSON.stringify(data) });
    if (where === '/auth/session') {
      const checked = await auth.checkSession(store, Object.assign({}, body, { deviceKey: ANA }));
      return json(checked.ok ? 200 : checked.status, checked);
    }
    if (where === '/standing') {
      seen.standing += 1;
      return json(200, { billing: 'run', free: true, percent: 0 });
    }
    if (where === '/review') {
      seen.runs += 1;
      const lines = [{ type: 'log', text: 'Opening the start page.' }, last];
      return route.fulfill({ status: 200, contentType: 'application/x-ndjson', headers: cors, body: lines.map((line) => JSON.stringify(line)).join('\n') + '\n' });
    }
    return json(200, where === '/auth/providers' ? { providers: [{ id: 'email' }] } : { items: [] });
  });
  await page.setViewportSize(PHONE);
  await page.goto(file);
  await expect.poll(() => seen.standing).toBeGreaterThan(0);
  await page.evaluate(() => {
    document.getElementById('name').value = 'Ana Pérez';
    document.getElementById('email').value = 'ana@example.com';
    document.querySelector('input[name="reasonCode"][value="teaching"]').checked = true;
    document.getElementById('url').value = 'example.com';
  });
  await page.locator('#review-btn').click();
  await expect.poll(() => seen.runs).toBe(1);
  return seen;
}

async function shot(page, name) {
  if (!process.env.INCON_SHOT) return;
  fs.mkdirSync(process.env.INCON_SHOT, { recursive: true });
  await page.screenshot({ path: path.join(process.env.INCON_SHOT, name + '.png') });
}

test.describe('A review that could not be concluded (#3079)', () => {
  test('shows the splash with the email, the code and its percent, copies the code, and closes on Escape', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await openReview(page, '/qa-review.html', INCONCLUSIVE);
    const box = page.getByRole('dialog', { name: 'We could not conclude this review right now' });
    await expect(box).toBeVisible();
    await expect(box).toHaveAttribute('aria-modal', 'true');
    await expect(box.locator('#incon-mail')).toHaveText('We will email the report to ana@example.com as soon as it is ready.');
    await expect(box.locator('#incon-percent')).toHaveText('20%');
    await expect(box.locator('#incon-code-note')).toHaveText('For the trouble, 20% off your next review with this code:');
    await expect(box.locator('#incon-code')).toHaveText('SORRY-ABCD2345');
    await expect(box.locator('#incon-applied')).toBeVisible();
    await expect(box.locator('#incon-copy')).toBeFocused();
    expect(await page.evaluate(() => sessionStorage.getItem('qa-review-coupon'))).toBe('SORRY-ABCD2345');
    const width = await box.evaluate((node) => node.getBoundingClientRect().width);
    expect(width).toBeLessThanOrEqual(PHONE.width);
    await shot(page, 'splash-en');
    for (let step = 0; step < 4; step += 1) {
      await page.keyboard.press('Tab');
      expect(await page.evaluate(() => !!document.activeElement.closest('#inconclusive'))).toBe(true);
    }
    await box.locator('#incon-copy').click();
    await expect(box.locator('#incon-note')).toHaveText(/^(Code copied\.|Select the code and copy it\.)$/);
    await page.keyboard.press('Escape');
    await expect(page.locator('#inconclusive')).toBeHidden();
    await expect(page.locator('#form-status')).toContainText('The review could not be concluded right now.');
    await expect(page.locator('#review-btn')).toBeFocused();
  });

  test('on the German page the splash reads in German, kept out of machine translation, and the X closes it', async ({ page }) => {
    await openReview(page, '/qa-review-de.html', INCONCLUSIVE);
    const box = page.locator('#inconclusive .pay-card');
    await expect(box).toBeVisible();
    await expect(box).toHaveAttribute('lang', 'de');
    await expect(box).toHaveAttribute('translate', 'no');
    await expect(box.locator('#incon-title')).toHaveText('Wir konnten diese Prüfung gerade nicht abschließen');
    await expect(box.locator('#incon-mail')).toHaveText('Wir senden den Bericht an ana@example.com, sobald er fertig ist.');
    await expect(box.locator('#incon-percent')).toHaveText(/^20\s%$/);
    await expect(box.locator('#incon-x')).toHaveAttribute('aria-label', 'Schließen');
    await shot(page, 'splash-de');
    await box.locator('#incon-x').click();
    await expect(page.locator('#inconclusive')).toBeHidden();
  });

  test('a site-side failure keeps its own message and shows no splash', async ({ page }) => {
    await openReview(page, '/qa-review.html', { type: 'error', error: 'The host name did not resolve.' });
    await expect(page.locator('#form-status')).toContainText('did not resolve');
    await expect(page.locator('#inconclusive')).toBeHidden();
    expect(await page.evaluate(() => sessionStorage.getItem('qa-review-coupon'))).toBeNull();
  });
});
