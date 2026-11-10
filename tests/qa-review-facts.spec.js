const fs = require('fs');
const path = require('path');
const { test, expect } = require('./net-guard');
const reviewPromise = require('../functions/url-review-promise');

const TERMS = fs.readFileSync(path.join(__dirname, '../js/qa-review.js'), 'utf8').match(/TERMS_VERSION = "([^"]+)"/)[1];
const PHONE = { width: 390, height: 844 };
// Phone screenshots for review: FACTS_SHOTS=<dir> npx playwright test tests/qa-review-facts.spec.js
const SHOTS = process.env.FACTS_SHOTS || '';

async function open(page, file) {
  await page.addInitScript((version) => {
    try {
      sessionStorage.setItem('qa-review-terms', version);
      localStorage.setItem('hasSeenReviewTour', 'true');
      localStorage.setItem('qa-review-analytics', 'necessary');
    } catch (e) { /* storage is optional */ }
  }, TERMS);
  await page.route(/ipwho\.is/, (route) => route.fulfill({ contentType: 'application/json', body: '{"success":false}' }));
  await page.route('http://127.0.0.1:8768/**', (route) => route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: '{"items":[]}' }));
  await page.setViewportSize(PHONE);
  await page.goto(file);
  const facts = page.locator('#service-facts');
  await facts.locator('summary').click();
  await expect(facts).toHaveAttribute('open', '');
  return facts;
}

async function shot(page, facts, term, name) {
  if (!SHOTS) return;
  await facts.locator('dt', { hasText: term }).evaluate((el) => window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY - 150));
  await page.screenshot({ path: path.join(SHOTS, name) });
}

test.describe('What a review is: the new checks, the 48-hour promise and the fix packages (#3326)', () => {
  test('the English page lists the safety checks, the promise from the server deadline, and the packages', async ({ page }) => {
    const facts = await open(page, '/qa-review.html');
    const answer = (term) => facts.locator('dt', { hasText: term }).locator('xpath=following-sibling::dd[1]');
    await expect(answer('Safety checks')).toContainText('Cloudflare URL Scanner');
    await expect(answer('Safety checks')).toContainText('lookalike domains');
    await expect(answer('Safety checks')).toContainText('Once you prove you own the site');
    await expect(answer('If a review cannot finish')).toContainText('within ' + reviewPromise.PROMISE_DEADLINE_H + ' hours');
    await expect(facts.locator('[data-promise-hours]')).toHaveText([String(reviewPromise.PROMISE_DEADLINE_H), String(reviewPromise.PROMISE_DEADLINE_H)]);
    await expect(answer('After the report')).toContainText('security headers US$99 (about 3 working days)');
    await expect(answer('After the report')).toContainText('You pay with PayPal');
    expect(await facts.evaluate((el) => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
    await shot(page, facts, 'Safety checks', 'facts-safety-en.png');
    await shot(page, facts, 'If a review cannot finish', 'facts-promise-packages-en.png');
  });

  test('the Spanish page says the same in Spanish, kept out of machine translation', async ({ page }) => {
    const facts = await open(page, '/qa-review-es.html');
    const term = facts.locator('dt', { hasText: 'Si una revisión no puede terminar' });
    await expect(term).toHaveAttribute('translate', 'no');
    await expect(term.locator('xpath=following-sibling::dd[1]')).toContainText('en un plazo de 48 horas');
    await expect(facts.locator('dt', { hasText: 'Después del informe' }).locator('xpath=following-sibling::dd[1]')).toContainText('Paquetes a precio de lanzamiento');
    await shot(page, facts, 'Comprobaciones de seguridad', 'facts-safety-es.png');
  });
});
