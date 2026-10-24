const { test, expect } = require('@playwright/test');
const auth = require('../functions/url-review-auth');
const compare = require('../functions/url-review-compare');
const sample = require('../assets/qa-review-sample.json');
const own = require('./unit/fixtures/review-wordpress.json');

const TERMS = require('fs').readFileSync(require('path').join(__dirname, '../js/qa-review.js'), 'utf8').match(/TERMS_VERSION = "([^"]+)"/)[1];
const ID = 'cd34ef56ab12';
const ANA = 'a'.repeat(64);
const days = (start, step) => Array.from({ length: 30 }, (item, index) => ({ date: '2026-09-' + String(index + 1).padStart(2, '0'), rank: start + index * step }));

async function open(page, cmp, review) {
  const store = auth.memoryStore();
  const started = await auth.startEmail(store, { email: 'ana@example.com', deviceKey: ANA, ip: '1.1.1.1' });
  const signed = await auth.finishEmail(store, { id: started.id, code: started.code, deviceKey: ANA });
  const row = { email: 'ana@example.com', paid: true, frameworks: sample.frameworks, report: Object.assign({}, sample.report, { id: ID, compare: cmp }) };
  await page.addInitScript(({ version, session }) => {
    try {
      sessionStorage.setItem('qa-review-terms', version);
      localStorage.setItem('hasSeenReviewTour', 'true');
      localStorage.setItem('qa-review-analytics', 'necessary');
      localStorage.setItem('qa-review-session', JSON.stringify({ session, email: 'ana@example.com', provider: 'email' }));
      localStorage.setItem('qa-review-device-key', JSON.stringify('a'.repeat(64)));
    } catch (e) { /* storage is optional */ }
  }, { version: TERMS, session: signed.session });
  await page.route(/ipwho\.is/, (route) => route.fulfill({ contentType: 'application/json', body: '{"success":false}' }));
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
    if (path === '/review/open') return json(200, { report: row.report, frameworks: row.frameworks, paid: true });
    if (path === '/review' && review) {
      const answer = review(body);
      return typeof answer === 'string' ? route.fulfill({ status: 200, contentType: 'application/x-ndjson', headers: cors, body: answer }) : json(400, answer);
    }
    return json(200, path === '/auth/providers' ? { providers: [{ id: 'email' }] } : { items: [] });
  });
  await page.goto('/qa-review.html?report=' + ID);
  const card = page.locator(cmp ? '#compare-result' : '#compare-ask');
  await expect(card).toBeVisible({ timeout: 20000 });
  await card.scrollIntoViewIfNeeded();
  return card;
}

test.describe('The competitor comparison is drawn as charts', () => {
  test('indicators, radar, leads, 3D columns, edges, mixes, market presence and history all render', async ({ page }) => {
    const ownSide = Object.assign({}, own, { limits: { pagesFound: 1800 }, mentions: [1, 2, 3], observed: Object.assign({}, own.observed, { socialLinks: ['a', 'b', 'c', 'd'], registered: '2003-05-27' }) });
    const cmp = compare.compareSites(ownSide, sample.report, {
      ranks: { own: { read: true, rank: 1310, ranks: days(1400, -3), change: 87 }, rival: { read: true, rank: null, ranks: [], change: null } },
      trail: { own: [{ at: '2026-06-02', overall: 64 }, { at: '2026-08-14', overall: 71 }, { at: '2026-10-01', overall: 78 }], rival: [{ at: '2026-10-24', overall: sample.report.insights.score.overall }] }
    });
    const card = await open(page, cmp);
    await expect(card.locator('.cmp-ring')).toHaveCount(2);
    await expect(card.locator('.cmp-board + .cmp-verdict')).toContainText('indicators');
    await expect(card.locator('.cmp-kpi')).toHaveCount(cmp.kpis.length);
    await expect(card.locator('svg.cmp-radar .cmp-shape')).toHaveCount(2);
    await expect(card.locator('.cmp-lead')).toHaveCount(6);
    await expect(card.locator('.cmp-sky .cmp-col')).toHaveCount(12);
    await expect(card.locator('.cmp-edge')).toHaveCount(3);
    await expect(card.locator('.cmp-mix-row')).toHaveCount(4);
    await expect(card.locator('.cmp-presence')).toHaveCount(2);
    await expect(card.locator('.cmp-presence.cmp-own .cmp-rank')).toContainText('#1,310');
    await expect(card.locator('.cmp-presence.cmp-rival .cmp-rank')).toContainText('Outside the Tranco top million');
    await expect(card.locator('.cmp-presence.cmp-own')).toContainText('87 places in 30 days');
    await expect(card.locator('.cmp-signals tbody tr')).toHaveCount(7);
    await expect(card.locator('.cmp-line')).toHaveCount(2);
    if (process.env.COMPARE_SHOT) {
      await page.setViewportSize({ width: 1100, height: 900 });
      for (const [name, selector] of [['board', '.cmp-board'], ['areas', 'svg.cmp-radar'], ['sky', '.cmp-sky'], ['edges', '.cmp-edges'], ['market', '.cmp-h:has-text("Market presence")'], ['trail', '.cmp-trail'], ['dark', '.cmp-h:has-text("The six areas")']]) {
        if (name === 'dark') await page.evaluate(() => document.documentElement.classList.add('dark-mode'));
        await card.locator(selector).first().evaluate((node) => node.scrollIntoView({ block: 'start' }));
        await page.evaluate(() => window.scrollBy(0, -90));
        await page.screenshot({ path: process.env.COMPARE_SHOT + '-' + name + '.png' });
      }
    }
  });

  test('a comparison saved before the charts still shows its scores, leads and lists', async ({ page }) => {
    const full = compare.compareSites(own, sample.report);
    const old = { ownId: full.ownId, ownHost: full.ownHost, ownAt: full.ownAt, rivalHost: full.rivalHost, passive: true, overall: full.overall,
      areas: full.areas.map((row) => ({ area: row.area, own: row.own, rival: row.rival })), ownOnly: full.ownOnly, ownOnlyCount: full.ownOnlyCount, rivalOnly: full.rivalOnly, rivalOnlyCount: full.rivalOnlyCount, shared: full.shared };
    const card = await open(page, old);
    await expect(card.locator('.cmp-ring')).toHaveCount(2);
    await expect(card.locator('.cmp-kpi')).toHaveCount(0);
    await expect(card.locator('.cmp-lead')).toHaveCount(6);
    await expect(card.locator('.compare-table tbody tr')).toHaveCount(7);
    await expect(card.locator('.cmp-presence')).toHaveCount(0);
    await expect(card.locator('.cmp-line')).toHaveCount(0);
  });

  test('a competitor review that fails reopens the report on the comparison, ready for another address', async ({ page }) => {
    let sent = null;
    const ask = await open(page, null, (body) => {
      sent = body;
      return [{ type: 'log', text: 'Opening rival.example.' }, { type: 'error', error: 'The site did not answer' }].map((line) => JSON.stringify(line)).join('\n') + '\n';
    });
    await page.evaluate(() => { document.getElementById('name').value = 'Ana Pérez'; });
    await ask.locator('#compare-url').fill('rival.example');
    await ask.locator('#compare-go').click();
    await expect(page.locator('#compare-error')).toContainText('The review of rival.example did not finish: The site did not answer.');
    expect(sent.compareWith).toBe(ID);
    await expect(page.locator('#dash-overlay')).toHaveClass(/open/);
    await expect(page.locator('#compare-url')).toHaveValue('rival.example');
    await expect(page.locator('#compare-url')).toBeFocused();
    await expect(page.locator('#url-field')).not.toHaveClass(/invalid/);
    await expect(page.locator('#review-btn')).toBeEnabled();
  });

  test('a competitor address the server refuses is shown on the comparison, not on your own address', async ({ page }) => {
    const ask = await open(page, null, () => ({ error: 'Enter a public https address.', fields: [{ field: 'url', message: 'Enter a public https address.' }] }));
    await page.evaluate(() => { document.getElementById('name').value = 'Ana Pérez'; });
    await ask.locator('#compare-url').fill('localhost:3000');
    await ask.locator('#compare-go').click();
    await expect(page.locator('#compare-error')).toContainText('did not finish: Enter a public https address. Check the address');
    await expect(page.locator('#url-field')).not.toHaveClass(/invalid/);
    await expect(page.locator('#url-error')).toHaveText('');
  });
});
