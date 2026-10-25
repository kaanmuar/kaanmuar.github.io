const { test, expect } = require('@playwright/test');
const auth = require('../functions/url-review-auth');

const ANA = 'a'.repeat(64);

const items = Array.from({ length: 6 }, (_, i) => ({ href: 'https://example.com/' + i, title: 'Headline ' + (i + 1), meta: 'Desk · ' + (i + 1) + 'h ago' }));

const TERMS = require('fs').readFileSync(require('path').join(__dirname, '../js/qa-review.js'), 'utf8').match(/TERMS_VERSION = "([^"]+)"/)[1];

async function prime(page, { terms = true } = {}) {
  await page.addInitScript(({ accepted, version }) => {
    try {
      if (accepted) sessionStorage.setItem('qa-review-terms', version);
      localStorage.setItem('hasSeenReviewTour', 'true');
      localStorage.setItem('qa-review-analytics', 'necessary');
      localStorage.setItem('cv-preferred-lang', 'en');
    } catch (e) { /* storage is optional */ }
  }, { accepted: terms, version: TERMS });
  await page.route(/\/news\?/, (route) => route.fulfill({ contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ items }) }));
  await page.route(/ipwho\.is/, (route) => route.fulfill({ contentType: 'application/json', body: '{"success":false}' }));
}

test.describe('Review page top', () => {
  test('the wire, the hero, and the live reports come before the request', async ({ page }) => {
    await prime(page);
    await page.goto('/qa-review.html');
    const order = await page.evaluate(() => ['.wire', '.stage', '#live-reports', '#review-app'].map((s) => document.querySelector(s).getBoundingClientRect().top + scrollY));
    expect(order).toEqual([...order].sort((a, b) => a - b));
    await expect(page.locator('.wire')).not.toHaveAttribute('inert', '');
    await expect(page.locator('.stage')).not.toHaveAttribute('inert', '');
  });

  test('the wire fills each row with no gap and pauses on hover', async ({ page }) => {
    await prime(page);
    await page.goto('/qa-review.html');
    await expect(page.locator('.wire-track.run')).toHaveCount(2);
    const rows = await page.evaluate(() => [...document.querySelectorAll('.wire-row')].map((row) => {
      const sets = row.querySelectorAll('.wire-set');
      return { sets: sets.length, same: sets[0].scrollWidth === sets[1].scrollWidth, covers: sets[0].scrollWidth >= row.clientWidth, hidden: sets[1].getAttribute('aria-hidden') };
    }));
    for (const row of rows) expect(row).toEqual({ sets: 2, same: true, covers: true, hidden: 'true' });
    const state = () => page.evaluate(() => getComputedStyle(document.querySelector('.wire-track')).animationPlayState);
    expect(await state()).toBe('running');
    await page.locator('.wire').hover();
    expect(await state()).toBe('paused');
  });

  test('live reports sit in two columns on wide screens and stack on narrow ones', async ({ page }) => {
    await prime(page);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/qa-review.html');
    await expect(page.locator('.live-card.is-active')).toBeVisible();
    const wide = await page.evaluate(() => {
      const f = document.querySelector('#live-filters').getBoundingClientRect();
      const s = document.querySelector('#live-stage').getBoundingClientRect();
      return { filtersLeft: f.right <= s.left, sideBySide: Math.abs(f.top - s.top) < s.height };
    });
    expect(wide).toEqual({ filtersLeft: true, sideBySide: true });
    await page.setViewportSize({ width: 1024, height: 900 });
    const narrow = await page.evaluate(() => document.querySelector('#live-filters').getBoundingClientRect().bottom <= document.querySelector('#live-stage').getBoundingClientRect().top);
    expect(narrow).toBe(true);
  });

  test('the hero link scrolls to live reports without covering the page', async ({ page }) => {
    await prime(page);
    await page.goto('/qa-review.html');
    await expect(page.locator('.live-card.is-active')).toBeVisible();
    await page.locator('.live-jump').click();
    await expect(page).toHaveURL(/#live-reports$/);
    await expect(page.locator('#gate')).toBeHidden();
  });
});

async function signedIn(page) {
  const store = auth.memoryStore();
  const started = await auth.startEmail(store, { email: 'ana@example.com', deviceKey: ANA, ip: '1.1.1.1' });
  const signed = await auth.finishEmail(store, { id: started.id, code: started.code, deviceKey: ANA });
  await page.addInitScript(({ session }) => {
    localStorage.setItem('qa-review-session', JSON.stringify({ session, email: 'ana@example.com', provider: 'email' }));
    localStorage.setItem('qa-review-device-key', JSON.stringify('a'.repeat(64)));
  }, { session: signed.session });
  return store;
}

// Records each call to the local review service; /auth/session answers from `store` when there is one.
async function backend(page, store) {
  const calls = [];
  await page.route('http://127.0.0.1:8768/**', async (route) => {
    const req = route.request();
    const path = new URL(req.url()).pathname;
    const cors = { 'access-control-allow-origin': req.headers().origin || '*', 'access-control-allow-credentials': 'true', 'access-control-allow-headers': 'content-type' };
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: Object.assign({ 'access-control-allow-methods': 'GET,POST' }, cors) });
    calls.push(path);
    const json = (status, data) => route.fulfill({ status, contentType: 'application/json', headers: cors, body: JSON.stringify(data) });
    if (path === '/auth/session' && store) {
      const checked = await auth.checkSession(store, Object.assign({}, JSON.parse(req.postData() || '{}'), { deviceKey: ANA }));
      return json(checked.ok ? 200 : checked.status, checked);
    }
    if (path === '/auth/providers') return json(200, { providers: [] });
    return json(503, { error: 'not in this test' });
  });
  return calls;
}

test.describe('Terms on submit (#1090)', () => {
  test('a first visit shows the hero, the request and live reports, with no terms in the way', async ({ page }) => {
    await prime(page, { terms: false });
    await page.goto('/qa-review.html');
    await expect(page.locator('#gate')).toBeHidden();
    await expect(page.locator('#studio-title')).toBeVisible();
    await expect(page.locator('#review-app')).not.toHaveAttribute('inert', '');
    await expect(page.locator('.live-card.is-active')).toBeVisible();
    await page.locator('#url').fill('example.com');
    await expect(page.locator('#url')).toHaveValue('example.com');
    await expect(page.locator('#stage-sample-open')).toBeVisible();
    await expect(page.locator('#stage-guide')).toHaveAttribute('href', 'qa-review-guide.html');
  });

  test('signing in asks for the terms first, and goes on once they are accepted', async ({ page }) => {
    await prime(page, { terms: false });
    const calls = await backend(page);
    await page.goto('/qa-review.html');
    await page.locator('#sign-in-email').fill('ana@example.com');
    await page.locator('#sign-in-send').click();
    await expect(page.locator('#gate')).toBeVisible();
    await expect(page.locator('#gate .gate-card')).toBeFocused();
    await expect(page.locator('#gate-waiting')).toBeHidden();
    await page.keyboard.press('Escape');
    await expect(page.locator('#gate')).toBeHidden();
    await expect(page.locator('#sign-in-send')).toBeFocused();
    expect(calls).not.toContain('/auth/email');

    await page.locator('#sign-in-send').click();
    await page.locator('#terms-all').check();
    const sent = page.waitForRequest((req) => req.url().endsWith('/auth/email') && req.method() === 'POST');
    await page.locator('#accept').click();
    await sent;
    await expect(page.locator('#gate')).toBeHidden();
  });

  test('a review asks for the terms with its address kept, and runs once they are accepted', async ({ page }) => {
    await prime(page, { terms: false });
    const store = await signedIn(page);
    await backend(page, store);
    await page.goto('/qa-review.html');
    await page.locator('#name').fill('Ana');
    await page.locator('#url').fill('example.com/docs');
    await expect(page.locator('#review-btn')).toBeEnabled();
    await page.locator('#review-btn').click();
    await expect(page.locator('#gate')).toBeVisible();
    await expect(page.locator('#gate-waiting')).toHaveText('The review of example.com/docs starts as soon as you accept.');
    await expect(page.locator('.stage')).toHaveAttribute('inert', '');
    await expect(page.locator('#form-status')).toHaveText('');

    await page.locator('#terms-all').check();
    await page.locator('#accept').click();
    await expect(page.locator('#gate')).toBeHidden();
    await expect(page.locator('.stage')).not.toHaveAttribute('inert', '');
    await expect(page.locator('#url')).toHaveValue('example.com/docs');
    await expect(page.locator('#form-status')).not.toHaveText('');
    expect(await page.evaluate(() => sessionStorage.getItem('qa-review-terms'))).toBe(TERMS);
  });

  test('a shared report opens without the terms', async ({ page }) => {
    await prime(page, { terms: false });
    const calls = await backend(page);
    await page.goto('/qa-review.html?report=cd34ef56ab12');
    await expect.poll(() => calls.includes('/review/open')).toBe(true);
    await expect(page.locator('#gate')).toBeHidden();
  });
});
