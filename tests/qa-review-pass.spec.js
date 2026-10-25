const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const auth = require('../functions/url-review-auth');
const offers = require('../functions/url-review-offers');

const TERMS = fs.readFileSync(path.join(__dirname, '../js/qa-review.js'), 'utf8').match(/TERMS_VERSION = "([^"]+)"/)[1];
const ANA = 'a'.repeat(64);
const PLANS = offers.passPlans();
const FREELANCER = { id: 'pass-1', plan: 'freelancer', name: 'Freelancer', usd: 29, runs: 10, runsLeft: 4, paidUntil: '2026-11-20T00:00:00Z', frameworks: 3, tools: false, pages: 20, depth: 2, credentials: false, charged: true };

async function signIn(page, signed = true) {
  const store = auth.memoryStore();
  const started = await auth.startEmail(store, { email: 'ana@example.com', deviceKey: ANA, ip: '1.1.1.1' });
  const done = await auth.finishEmail(store, { id: started.id, code: started.code, deviceKey: ANA });
  await page.addInitScript(({ version, session }) => {
    try {
      sessionStorage.setItem('qa-review-terms', version);
      localStorage.setItem('hasSeenReviewTour', 'true');
      localStorage.setItem('qa-review-analytics', 'necessary');
      if (session) {
        localStorage.setItem('qa-review-session', JSON.stringify({ session, email: 'ana@example.com', provider: 'email' }));
        localStorage.setItem('qa-review-device-key', JSON.stringify('a'.repeat(64)));
      }
    } catch (e) { /* storage is optional */ }
  }, { version: TERMS, session: signed ? done.session : '' });
  await page.route(/ipwho\.is/, (route) => route.fulfill({ contentType: 'application/json', body: '{"success":false}' }));
  return store;
}

// The server is mocked; `answer(path, body, query)` returns [status, data] for the routes a test cares about.
async function mock(page, store, answer) {
  const seen = { quotes: [], runs: [], checkouts: [], standing: 0 };
  await page.route('http://127.0.0.1:8768/**', async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const cors = { 'access-control-allow-origin': req.headers().origin || '*', 'access-control-allow-credentials': 'true', 'access-control-allow-headers': 'content-type' };
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: Object.assign({ 'access-control-allow-methods': 'GET,POST' }, cors) });
    const body = req.postData() ? JSON.parse(req.postData()) : {};
    const json = (status, data) => route.fulfill({ status, contentType: 'application/json', headers: cors, body: JSON.stringify(data) });
    if (url.pathname === '/auth/session') {
      const checked = await auth.checkSession(store, Object.assign({}, body, { deviceKey: ANA }));
      return json(checked.ok ? 200 : checked.status, checked);
    }
    if (url.pathname === '/standing') seen.standing += 1;
    if (url.pathname === '/checkout/quote') seen.quotes.push(Object.fromEntries(url.searchParams));
    if (url.pathname === '/review') seen.runs.push(body);
    if (url.pathname === '/checkout') seen.checkouts.push(body);
    const given = answer(url.pathname, body, url.searchParams);
    if (given) return json(given[0], given[1]);
    return json(200, url.pathname === '/auth/providers' ? { providers: [{ id: 'email' }] } : { items: [] });
  });
  return seen;
}

async function keepFrameworks(page, names) {
  await page.evaluate((keep) => {
    document.querySelectorAll('#fw-picker input[name="fw"]').forEach((box) => {
      box.checked = keep.includes(box.value);
      box.dispatchEvent(new Event('change', { bubbles: true }));
    });
  }, names);
}

async function fillRequest(page) {
  await page.evaluate(() => {
    document.getElementById('name').value = 'Ana Pérez';
    document.getElementById('email').value = 'ana@example.com';
    document.querySelector('input[name="reasonCode"][value="teaching"]').checked = true;
    document.getElementById('url').value = 'example.com';
  });
}

async function openReview(page, standing, answer = () => null) {
  const store = await signIn(page);
  await page.route('**/qa-review-pay.html**', (route) => route.fulfill({ contentType: 'text/html', body: '<p>pay</p>' }));
  const seen = await mock(page, store, (where, body, query) => (where === '/standing' ? [200, standing] : answer(where, body, query)));
  await page.goto('/qa-review.html');
  await expect.poll(() => seen.standing).toBe(1);
  return seen;
}

const ON_PASS = { billing: 'run', free: false, percent: 0, pass: FREELANCER, lastPlan: 'freelancer', plans: PLANS };
const FOUR = ['Playwright', 'Cypress', 'Jest', 'Selenium'];

test.describe('Runs on a pass', () => {
  test('only what is past the plan is tagged: the fourth framework and a wider read', async ({ page }) => {
    await openReview(page, ON_PASS);
    await keepFrameworks(page, ['Playwright', 'Cypress', 'Jest']);
    await expect(page.locator('#fw-picker .price-tag')).toHaveCount(0);
    await keepFrameworks(page, FOUR);
    await expect(page.locator('#fw-picker .price-tag')).toHaveCount(1);
    await expect(page.locator('#fw-picker .price-tag [aria-hidden="true"]')).toHaveText('+$5');
    await page.locator('#page-picker label:has(input[value="40"])').click();
    await expect(page.locator('#page-picker label:has(input[value="40"]) .price-tag [aria-hidden="true"]')).toHaveText('+$5');
    await expect(page.locator('#depth-picker .price-tag')).toHaveCount(0);
  });

  test('a run inside the plan starts at once, with no total and no quote', async ({ page }) => {
    const seen = await openReview(page, ON_PASS);
    await keepFrameworks(page, ['Playwright', 'Cypress']);
    await fillRequest(page);
    await page.locator('#review-btn').click();
    await expect.poll(() => seen.runs.length).toBe(1);
    await expect(page.locator('#run-total')).toBeHidden();
    expect(seen.quotes).toHaveLength(0);
  });

  test('a run past the plan shows the pass run at $0 and charges only the extras, then pays on the pass', async ({ page }) => {
    const quote = { usd: 5, billing: 'pass', count: 4, frameworks: FOUR, tools: [], pages: 20, depth: 2, pageUsd: 0, depthUsd: 0,
      discount: [{ name: 'Playwright', usd: 0 }, { name: 'Cypress', usd: 0 }, { name: 'Jest', usd: 0 }, { name: 'Selenium', usd: 5 }] };
    const seen = await openReview(page, ON_PASS, (where, body) => (where === '/checkout/quote' ? [200, quote]
      : where === '/review' ? [402, { paymentRequired: true, purpose: 'new-run', priceUsd: 5, billing: 'pass', pass: 'freelancer', frameworks: body.frameworks, tools: [], pages: 20, depth: 2 }] : null));
    await keepFrameworks(page, FOUR);
    await fillRequest(page);
    await page.locator('#review-btn').click();
    const box = page.locator('#run-total');
    await expect(box).toBeVisible();
    await expect(box.locator('#run-total-lines li')).toHaveText(['Pass run, 3 left after this one$0', 'Playwright$0', 'Cypress$0', 'Jest$0', 'Selenium$5', '20 pages$0', '2 links deep$0', 'Total$5', 'To pay$5']);
    await expect(box.locator('#run-total-offer')).toBeHidden();
    expect(seen.quotes[0]).toMatchObject({ pass: 'freelancer', pages: '20', depth: '2' });
    expect(seen.quotes[0].coupon).toBeUndefined();
    await page.locator('#run-total-pay').click();
    await page.waitForURL(/qa-review-pay\.html\?purpose=new-run/);
    const asked = new URL(page.url()).searchParams;
    expect(asked.get('pass')).toBe('freelancer');
    expect(asked.get('billing')).toBe('pass');
  });
});

test.describe('The pass offered beside a paid total', () => {
  const quote = {
    usd: 26.1, listUsd: 29, percent: 10, discountSource: 'return', billing: 'run', count: 3,
    frameworks: ['Playwright', 'Cypress', 'Jest'], tools: [], pages: 20, depth: 2, pageUsd: 0, depthUsd: 0,
    discount: [{ name: 'Playwright', n: 1, usd: 19 }, { name: 'Cypress', n: 2, usd: 5 }, { name: 'Jest', n: 3, usd: 5 }]
  };

  test('a returning browser is offered the cheapest pass that covers the run, and its button opens pass checkout', async ({ page }) => {
    await openReview(page, { billing: 'run', free: false, percent: 10, pass: null, lastPlan: '', plans: PLANS }, (where) => (where === '/checkout/quote' ? [200, quote] : null));
    await keepFrameworks(page, ['Playwright', 'Cypress', 'Jest']);
    await fillRequest(page);
    await page.locator('#review-btn').click();
    const offer = page.locator('#run-total-offer');
    await expect(offer).toBeVisible();
    await expect(offer.locator('#run-total-offer-text')).toHaveText('Or 10 runs for 29 USD with the Freelancer pass, for 30 days.');
    await expect(page.locator('#run-total-pay')).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(page.locator('#run-total-offer-go')).toBeFocused();
    await page.locator('#run-total-offer-go').click();
    await page.waitForURL(/qa-review-pay\.html\?purpose=pass&plan=freelancer$/);
  });

  test('a used-up pass offers the next plan up', async ({ page }) => {
    await openReview(page, { billing: 'run', free: false, percent: 10, pass: Object.assign({}, FREELANCER, { runsLeft: 0 }), lastPlan: 'freelancer', plans: PLANS },
      (where) => (where === '/checkout/quote' ? [200, quote] : null));
    await keepFrameworks(page, ['Playwright', 'Cypress', 'Jest']);
    await fillRequest(page);
    await page.locator('#review-btn').click();
    await expect(page.locator('#fw-picker .price-tag')).toHaveCount(3);
    await expect(page.locator('#run-total-offer-text')).toHaveText('Your pass is used up or ended. Or 25 runs for 79 USD with the Team pass, for 30 days.');
    await expect(page.locator('#run-total-offer-go')).toHaveText('Get the Team pass');
  });
});

test.describe('Pass checkout', () => {
  const teamQuote = { usd: 79, cop: 316000, rate: 4000, count: 1, frameworks: [], tools: [], plan: 'team', pass: PLANS[1] };

  test('a signed-in buyer pays the flat plan price with no code, and a paid pass opens the account page', async ({ page }) => {
    const store = await signIn(page);
    await page.route('**/qa-review-account.html', (route) => route.fulfill({ contentType: 'text/html', body: '<p>account</p>' }));
    const seen = await mock(page, store, (where) => (where === '/checkout/quote' ? [200, teamQuote]
      : where === '/checkout' ? [200, { url: '/qa-review-pay.html?purpose=pass&plan=team&result=success&reference=abc&token=PP-1' }]
      : where === '/checkout/confirm' ? [200, { paid: true, purpose: 'pass' }] : null));
    await page.goto('/qa-review-pay.html?purpose=pass&plan=team');
    await expect(page.locator('#pay-heading')).toHaveText('The Team pass');
    await expect(page.locator('#pay-item')).toHaveText('25 runs over 30 days');
    await expect(page.locator('#pay-copy')).toHaveText('One payment of 79 USD for 25 runs over 30 days, up to 100 pages and 5 links deep, with up to 8 frameworks or tools in each run. Each run includes the full report, the fix list, the case export and alerts. It does not renew by itself.');
    await expect(page.locator('#charge')).toBeEnabled();
    expect(seen.quotes[0]).toMatchObject({ purpose: 'pass', plan: 'team' });
    expect(seen.quotes[0].coupon).toBeUndefined();
    await page.locator('#charge').click();
    await page.waitForURL(/qa-review-account\.html$/);
    expect(seen.checkouts[0]).toMatchObject({ purpose: 'pass', plan: 'team', pass: '' });
  });

  test('a visitor who is not signed in is asked to sign in first and cannot pay', async ({ page }) => {
    const store = await signIn(page, false);
    await mock(page, store, (where) => (where === '/checkout/quote' ? [200, teamQuote] : null));
    await page.goto('/qa-review-pay.html?purpose=pass&plan=team');
    await expect(page.locator('#pay-note')).toHaveText('Sign in on the review page first. A pass belongs to the address you sign in with.');
    await expect(page.locator('#charge')).toBeDisabled();
  });

  test('the extras of a pass run are paid on the pass, with no code', async ({ page }) => {
    const store = await signIn(page);
    const seen = await mock(page, store, (where) => (where === '/checkout/quote' ? [200, { usd: 5, cop: 20000, rate: 4000, billing: 'pass', frameworks: FOUR, tools: [], pages: 20, depth: 2 }]
      : where === '/checkout' ? [400, { error: 'stop here' }] : null));
    await page.goto('/qa-review-pay.html?purpose=new-run&frameworks=' + FOUR.join(',') + '&pages=20&depth=2&billing=pass&pass=freelancer');
    await expect(page.locator('#pay-heading')).toHaveText('Over your pass');
    await expect(page.locator('#pay-copy')).toHaveText(/^This run uses one of your Freelancer pass runs\. The 5 USD is only for what it asks beyond the plan/);
    expect(seen.quotes[0]).toMatchObject({ pass: 'freelancer', billing: 'pass' });
    await page.locator('#charge').click();
    await expect.poll(() => seen.checkouts.length).toBe(1);
    expect(seen.checkouts[0]).toMatchObject({ purpose: 'new-run', pass: 'freelancer', billing: 'pass', coupon: '' });
  });
});

test.describe('The pass card on the account page', () => {
  async function openAccount(page, records) {
    const store = await signIn(page);
    const at = Date.parse('2026-10-24T12:00:00Z');
    await mock(page, store, (where) => (where === '/account/runs' ? [200, offers.accountFile(records, 'ana@example.com', at)] : null));
    await page.goto('/qa-review-account.html');
    return page.locator('#pass-card');
  }

  test('an open pass shows its plan, runs left, end date, and renew and upgrade', async ({ page }) => {
    const card = await openAccount(page, [{ id: 'pass-abc', email: 'ana@example.com', status: 'monthly-pass', plan: 'freelancer', paid: true, runs: 10, runsUsed: 3, paidUntil: '2026-11-20T00:00:00Z' }]);
    await expect(card).toBeVisible({ timeout: 20000 });
    await expect(card.locator('h3')).toHaveText('Your Freelancer pass');
    await expect(card).toContainText('7 of 10 runs left, until');
    await expect(card.getByRole('link', { name: 'Renew the Freelancer pass' })).toHaveAttribute('href', 'qa-review-pay.html?purpose=pass&plan=freelancer');
    await expect(card.getByRole('link', { name: 'Upgrade to Team' })).toHaveAttribute('href', 'qa-review-pay.html?purpose=pass&plan=team');
  });

  test('with no open pass the three passes are offered', async ({ page }) => {
    const card = await openAccount(page, []);
    await expect(card).toBeVisible({ timeout: 20000 });
    await expect(card.locator('h3')).toHaveText('30-day passes');
    await expect(card.getByRole('link', { name: /^Buy / })).toHaveText(['Buy Freelancer', 'Buy Team', 'Buy Pro']);
  });
});
