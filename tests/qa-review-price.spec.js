const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const auth = require('../functions/url-review-auth');
const sample = require('../assets/qa-review-sample.json');

const TERMS = fs.readFileSync(path.join(__dirname, '../js/qa-review.js'), 'utf8').match(/TERMS_VERSION = "([^"]+)"/)[1];
const ANA = 'a'.repeat(64);
const ID = 'pr12ce34ab56';
const RETURNING = { billing: 'run', free: false, percent: 10 };
const FIRST = { billing: 'scope', free: false, percent: 0 };

// The server is mocked: /standing says how this browser is billed and /checkout/quote prices the run.
async function open(page, { standing, quote, review, query = '', file = '/qa-review.html' }) {
  const store = auth.memoryStore();
  const started = await auth.startEmail(store, { email: 'ana@example.com', deviceKey: ANA, ip: '1.1.1.1' });
  const signed = await auth.finishEmail(store, { id: started.id, code: started.code, deviceKey: ANA });
  await page.addInitScript(({ version, session }) => {
    try {
      sessionStorage.setItem('qa-review-terms', version);
      localStorage.setItem('hasSeenReviewTour', 'true');
      localStorage.setItem('qa-review-analytics', 'necessary');
      localStorage.setItem('qa-review-session', JSON.stringify({ session, email: 'ana@example.com', provider: 'email' }));
      localStorage.setItem('qa-review-device-key', JSON.stringify('a'.repeat(64)));
    } catch (e) { /* storage is optional */ }
  }, { version: TERMS, session: signed.session });
  const seen = { runs: [], quotes: [], standing: 0 };
  await page.route(/ipwho\.is/, (route) => route.fulfill({ contentType: 'application/json', body: '{"success":false}' }));
  await page.route('**/qa-review-pay.html**', (route) => route.fulfill({ contentType: 'text/html', body: '<p>pay</p>' }));
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
    if (url.pathname === '/standing') {
      seen.standing += 1;
      return json(200, standing);
    }
    if (url.pathname === '/checkout/quote') {
      seen.quotes.push(Object.fromEntries(url.searchParams));
      return json(200, quote);
    }
    if (url.pathname === '/review/open') return json(200, { report: Object.assign({}, sample.report, { id: ID }), frameworks: sample.frameworks, paid: true });
    if (url.pathname === '/review') {
      seen.runs.push(body);
      return review ? review(body, json) : json(400, { error: 'No run in this test.' });
    }
    return json(200, url.pathname === '/auth/providers' ? { providers: [{ id: 'email' }] } : { items: [] });
  });
  await page.goto(file + query);
  await expect.poll(() => seen.standing).toBe(1);
  return seen;
}

// Leaves only these frameworks ticked, in page order.
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

const tag = (page, name, value) => page.locator(`#${name === 'fw' ? 'fw-picker' : name === 'pages' ? 'page-picker' : 'depth-picker'} label:has(input[value="${value}"]) .price-tag [aria-hidden="true"]`);

test.describe('Price tags on the review form', () => {
  test('a returning browser sees +$19 on the first ticked framework and +$5 on each after it, and the scope it picked', async ({ page }) => {
    await open(page, { standing: RETURNING });
    await expect(page.locator('#fw-picker .price-tag')).toHaveCount(await page.locator('#fw-picker input[name="fw"]:checked').count());
    await keepFrameworks(page, ['Cypress', 'Jest', 'Playwright']);
    await expect(page.locator('#fw-picker .price-tag')).toHaveCount(3);
    await expect(tag(page, 'fw', 'Playwright')).toHaveText('+$19');
    await expect(tag(page, 'fw', 'Cypress')).toHaveText('+$5');
    await expect(tag(page, 'fw', 'Jest')).toHaveText('+$5');
    await expect(page.locator('#fw-picker label:has(input[value="Selenium"]) .price-tag')).toHaveCount(0);
    await page.locator('#req-cases > summary').click();
    await expect(page.getByRole('checkbox', { name: /Cypress.*adds 5 US dollars/ })).toBeChecked();
    await expect(page.locator('#page-picker .price-tag, #depth-picker .price-tag')).toHaveCount(0);
    await page.locator('#page-picker label:has(input[value="60"])').click();
    await page.locator('#depth-picker label:has(input[value="4"])').click();
    await expect(tag(page, 'pages', '60')).toHaveText('+$9');
    await expect(tag(page, 'depth', '4')).toHaveText('+$7');
    await expect(page.locator('#page-picker .price-tag')).toHaveCount(1);
    await page.locator('#page-picker label:has(input[value="20"])').click();
    await expect(page.locator('#page-picker .price-tag')).toHaveCount(0);
  });

  test('a first run tags no framework, only a wider or deeper read', async ({ page }) => {
    await open(page, { standing: FIRST });
    await page.locator('#page-picker label:has(input[value="40"])').click();
    await expect(tag(page, 'pages', '40')).toHaveText('+$5');
    await expect(page.locator('#fw-picker .price-tag')).toHaveCount(0);
  });

  test('a free account sees no tag at all', async ({ page }) => {
    await open(page, { standing: { billing: 'run', free: true, percent: 0 } });
    await page.locator('#page-picker label:has(input[value="100"])').click();
    await expect(page.locator('#review-form .price-tag')).toHaveCount(0);
  });
});

test.describe('The total before a paid run', () => {
  const quote = {
    usd: 26.1, listUsd: 29, percent: 10, discountSource: 'return', billing: 'run', count: 3,
    frameworks: ['Playwright', 'Cypress', 'Jest'], tools: [], pages: 20, depth: 2, pageUsd: 0, depthUsd: 0,
    discount: [{ name: 'Playwright', n: 1, usd: 19 }, { name: 'Cypress', n: 2, usd: 5 }, { name: 'Jest', n: 3, usd: 5 }]
  };

  test('Run shows the server total, and Cancel or Escape starts nothing and gives focus back', async ({ page }) => {
    const seen = await open(page, { standing: RETURNING, quote });
    await keepFrameworks(page, ['Playwright', 'Cypress', 'Jest']);
    await fillRequest(page);
    await page.locator('#review-btn').click();
    const box = page.locator('#run-total');
    await expect(box).toBeVisible();
    await expect(page.getByRole('dialog', { name: 'The total for this review' })).toBeVisible();
    const lines = box.locator('#run-total-lines li');
    await expect(lines).toHaveText(['Playwright$19', 'Cypress$5', 'Jest$5', '20 pages$0', '2 links deep$0', 'Total$29', 'Return discount 10%−$2.90', 'To pay$26.10']);
    await expect(box.locator('#run-total-saved')).toHaveText('Saved in Your reviews for 12 months.');
    await expect(page.locator('#run-total-pay')).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(page.locator('#run-total-cancel')).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(page.locator('#run-total-pay')).toBeFocused();
    expect(seen.quotes[0]).toMatchObject({ frameworks: 'Playwright,Cypress,Jest', pages: '20', depth: '2', billing: 'run' });
    expect(seen.quotes[0].deviceId).toMatch(/^[a-f0-9]{16}$/);
    await page.locator('#run-total-cancel').click();
    await expect(box).toBeHidden();
    await expect(page.locator('#review-btn')).toBeFocused();
    await page.locator('#review-btn').click();
    await expect(box).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(box).toBeHidden();
    expect(seen.runs).toHaveLength(0);
    await expect(page.locator('#form-status')).toHaveText('Nothing was started or charged.');
  });

  test('Pay and run asks the server, and the payment it asks for opens the pay page for that run', async ({ page }) => {
    const seen = await open(page, {
      standing: RETURNING,
      quote,
      review: (body, json) => json(402, { paymentRequired: true, purpose: 'new-run', priceUsd: 26.1, listUsd: 29, percent: 10, billing: 'run', frameworks: body.frameworks, pages: 20, depth: 2 })
    });
    await keepFrameworks(page, ['Playwright', 'Cypress', 'Jest']);
    await fillRequest(page);
    await page.locator('#review-btn').click();
    await page.locator('#run-total-pay').click();
    await page.waitForURL(/qa-review-pay\.html\?purpose=new-run/);
    expect(seen.runs).toHaveLength(1);
    const asked = new URL(page.url()).searchParams;
    expect(asked.get('frameworks')).toBe('Playwright,Cypress,Jest');
    expect(asked.get('billing')).toBe('run');
  });

  test('a free first run starts at once, with no total and no quote', async ({ page }) => {
    const seen = await open(page, { standing: FIRST, quote });
    await fillRequest(page);
    await page.locator('#review-btn').click();
    await expect.poll(() => seen.runs.length).toBe(1);
    await expect(page.locator('#run-total')).toBeHidden();
    expect(seen.quotes).toHaveLength(0);
  });
});

test.describe('Comparisons at 9 USD per competitor', () => {
  test('each typed competitor shows +$9, and Compare shows n × $9 before anything starts', async ({ page }) => {
    const seen = await open(page, {
      standing: RETURNING,
      quote: { usd: 18, billing: 'compare', competitors: 2, eachUsd: 9, frameworks: sample.frameworks, tools: [], pages: 20, depth: 2 },
      query: '?report=' + ID
    });
    const ask = page.locator('#compare-ask');
    await expect(ask).toBeVisible({ timeout: 20000 });
    await expect(ask.locator('.price-tag')).toHaveCount(0);
    await ask.locator('#compare-url').fill('one.example');
    await ask.locator('#compare-add').click();
    await ask.locator('#compare-url-2').fill('two.example');
    await expect(ask.locator('.price-tag [aria-hidden="true"]')).toHaveText(['+$9', '+$9']);
    await expect(ask.locator('#compare-url-2')).toHaveAccessibleDescription('this competitor adds 9 US dollars');
    await page.evaluate(() => { document.getElementById('name').value = 'Ana Pérez'; });
    await ask.locator('#compare-go').click();
    const box = page.locator('#run-total');
    await expect(box).toBeVisible();
    await expect(box.locator('#run-total-title')).toHaveText('The total for this comparison');
    await expect(box.locator('#run-total-lines li')).toHaveText(['Competitor: one.example$9', 'Competitor: two.example$9', 'Total$18', 'To pay$18']);
    await expect(box.locator('#run-total-saved')).toHaveText('Saved in Your reviews for 12 months.');
    expect(seen.quotes[0]).toMatchObject({ compareWith: ID, competitors: '2' });
    await page.locator('#run-total-cancel').click();
    await expect(box).toBeHidden();
    expect(seen.runs).toHaveLength(0);
  });
});

test.describe('The static price list is gone', () => {
  test('no review page carries the Prices section', async ({ page }) => {
    for (const lang of ['', '-es', '-pt', '-de', '-fr', '-it']) {
      const html = fs.readFileSync(path.join(__dirname, '../qa-review' + lang + '.html'), 'utf8');
      expect(html, 'qa-review' + lang + '.html').not.toContain('id="prices"');
    }
    await open(page, { standing: RETURNING });
    await expect(page.locator('#prices')).toHaveCount(0);
    await expect(page.locator('#service-facts')).toHaveCount(1);
  });

  test('on the Spanish page the tags and the total speak Spanish', async ({ page }) => {
    const quote = { usd: 21.6, listUsd: 24, percent: 10, discountSource: 'return', billing: 'run', count: 2, frameworks: ['Playwright', 'Cypress'], tools: [], pages: 20, depth: 2, pageUsd: 0, depthUsd: 0, discount: [{ name: 'Playwright', n: 1, usd: 19 }, { name: 'Cypress', n: 2, usd: 5 }] };
    await open(page, { standing: RETURNING, quote, file: '/qa-review-es.html' });
    await keepFrameworks(page, ['Playwright', 'Cypress']);
    await page.locator('#req-cases > summary').click();
    await expect(page.getByRole('checkbox', { name: /Cypress.*suma 5 dólares estadounidenses/ })).toBeChecked();
    await fillRequest(page);
    await page.locator('#review-btn').click();
    const box = page.locator('#run-total');
    await expect(box.locator('#run-total-title')).toHaveText('El total de esta revisión');
    await expect(box.locator('#run-total-saved')).toHaveText('Se guarda en Tus revisiones durante 12 meses.');
    await expect(box.locator('.total-off')).toHaveText('Descuento por volver 10 %−$2.40');
    await expect(page.locator('#run-total-pay')).toHaveText('Pagar y revisar');
    await expect(page.locator('#run-total-cancel')).toHaveText('Cancelar');
  });
});
