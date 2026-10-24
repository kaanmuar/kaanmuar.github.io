const { test, expect } = require('@playwright/test');
const auth = require('../functions/url-review-auth');
const compare = require('../functions/url-review-compare');
const sample = require('../assets/qa-review-sample.json');
const own = require('./unit/fixtures/review-wordpress.json');

const TERMS = require('fs').readFileSync(require('path').join(__dirname, '../js/qa-review.js'), 'utf8').match(/TERMS_VERSION = "([^"]+)"/)[1];
const ID = 'cd34ef56ab12';
const ANA = 'a'.repeat(64);
const days = (start, step) => Array.from({ length: 30 }, (item, index) => ({ date: '2026-09-' + String(index + 1).padStart(2, '0'), rank: start + index * step }));

async function open(page, cmp, review, file = '/qa-review.html', extra = {}) {
  const store = auth.memoryStore();
  const started = await auth.startEmail(store, { email: 'ana@example.com', deviceKey: ANA, ip: '1.1.1.1' });
  const signed = await auth.finishEmail(store, { id: started.id, code: started.code, deviceKey: ANA });
  const row = { email: 'ana@example.com', paid: true, frameworks: sample.frameworks, report: Object.assign({}, sample.report, { id: ID, compare: cmp }, extra) };
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
      const answer = await review(body);
      return typeof answer === 'string' ? route.fulfill({ status: 200, contentType: 'application/x-ndjson', headers: cors, body: answer }) : json(400, answer);
    }
    return json(200, path === '/auth/providers' ? { providers: [{ id: 'email' }] } : { items: [] });
  });
  await page.goto(file + '?report=' + ID);
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

  test('on the Spanish page the card has its own Spanish copy and is kept out of machine translation', async ({ page }) => {
    const cmp = compare.compareSites(Object.assign({}, own, { limits: { pagesFound: 1800 } }), sample.report, {
      ranks: { own: { read: true, rank: 1310, ranks: days(1400, -3), change: 87 }, rival: { read: true, rank: null, ranks: [], change: null } }
    });
    const card = await open(page, cmp, null, '/qa-review-es.html');
    await expect(card).toHaveAttribute('translate', 'no');
    await expect(card).toHaveAttribute('lang', 'es');
    await expect(card.locator('.compare-table:not(.cmp-signals) thead')).toContainText('Tu ventaja');
    await expect(card.locator('.compare-table:not(.cmp-signals) tbody')).toContainText('Rendimiento');
    await expect(card.locator('.cmp-board + .cmp-verdict')).toContainText('indicadores');
    await expect(card.locator('.cmp-presence.cmp-own')).toContainText('87 puestos en 30 días');
    await expect(card.locator('.cmp-presence.cmp-rival .cmp-rank')).toContainText('Fuera del millón principal de Tranco');
    await expect(card.locator('.cmp-signals thead')).toContainText('Señal');
    const english = await card.evaluate((node) => node.textContent.match(/Your lead|Performance|indicators|Market presence|Head to head|None\./g));
    expect(english).toBeNull();
    if (process.env.COMPARE_SHOT) {
      await page.setViewportSize({ width: 1100, height: 900 });
      await card.evaluate((node) => node.scrollIntoView({ block: 'start' }));
      await page.screenshot({ path: process.env.COMPARE_SHOT + '-es.png' });
    }
    await expect(page.locator('#compare-note')).toHaveText(/^Cada competidor tiene el precio de una segunda revisión, y se revisan uno tras otro\. El descuento por volver se aplica cuando comparas desde el dispositivo/);
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

  test('on the Spanish page the earlier-reviews and emailing log lines are written in Spanish', async ({ page }) => {
    const lines = [{ type: 'log', text: 'Looking for your earlier reviews of rival.example.' }, { type: 'log', text: 'Report saved. Emailing a copy to ana@example.com.' }, { type: 'error', error: 'The site did not answer' }];
    const ask = await open(page, null, () => lines.map((line) => JSON.stringify(line)).join('\n') + '\n', '/qa-review-es.html');
    await page.evaluate(() => { document.getElementById('name').value = 'Ana Pérez'; });
    await ask.locator('#compare-url').fill('rival.example');
    await ask.locator('#compare-go').click();
    await expect(page.locator('#compare-error')).toContainText('rival.example');
    const log = page.locator('#run-log li');
    await expect(log.filter({ hasText: 'Buscando tus revisiones anteriores de rival.example.' })).toHaveAttribute('translate', 'no');
    await expect(log.filter({ hasText: 'Informe guardado. Enviando una copia a ana@example.com.' })).toHaveAttribute('lang', 'es');
    await expect(log.filter({ hasText: /Looking for|Emailing/ })).toHaveCount(0);
  });

  test('while a comparison runs, the log leads back to the report and the report says it is running', async ({ page }) => {
    let answer;
    const held = new Promise((resolve) => { answer = resolve; });
    const ask = await open(page, null, () => held);
    await page.evaluate(() => { document.getElementById('name').value = 'Ana Pérez'; });
    await ask.locator('#compare-url').fill('rival.example');
    await ask.locator('#compare-go').click();
    await expect(page.locator('#dash-overlay')).not.toHaveClass(/open/);
    await expect(page.locator('#compare-run')).toBeVisible();
    await expect(page.locator('#compare-run-text')).toContainText('with rival.example');
    if (process.env.COMPARE_SHOT) await page.locator('#run-panel').screenshot({ path: process.env.COMPARE_SHOT + '-running-log.png' });
    await page.locator('#compare-back').click();
    await expect(page.locator('#dash-overlay')).toHaveClass(/open/);
    await expect(page.locator('#compare-running')).toBeVisible();
    await expect(page.locator('#compare-running-text')).toContainText('The comparison with rival.example is running');
    await expect(page.locator('#compare-go')).toBeDisabled();
    await expect(page.locator('#compare-stop')).toBeDisabled();
    if (process.env.COMPARE_SHOT) await page.locator('#compare-ask').screenshot({ path: process.env.COMPARE_SHOT + '-running-card.png' });
    answer(JSON.stringify({ type: 'error', error: 'The site did not answer' }) + '\n');
    await expect(page.locator('#compare-error')).toContainText('did not finish');
    await expect(page.locator('#compare-running')).toBeHidden();
    await expect(page.locator('#compare-run')).toBeHidden();
    await expect(page.locator('#compare-go')).toBeEnabled();
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

  test('up to four more competitor boxes open one at a time behind https://, and a removed box closes', async ({ page }) => {
    const ask = await open(page, null, null);
    const add = ask.locator('#compare-add');
    await expect(ask.locator('[data-compare-more]:visible')).toHaveCount(0);
    await expect(add).toContainText('(4 left)');
    for (const [n, host] of [[2, 'two.example'], [3, 'three.example'], [4, 'four.example'], [5, 'five.example']]) {
      await add.click();
      await expect(ask.locator('#compare-url-' + n)).toBeFocused();
      await expect(ask.locator('#compare-url-' + n + '-field span')).toHaveText('https://');
      await ask.locator('#compare-url-' + n).fill('https://' + host);
      await expect(ask.locator('#compare-url-' + n)).toHaveValue(host);
    }
    await expect(add).toBeHidden();
    await ask.getByRole('button', { name: 'Remove the third competitor' }).click();
    await expect(ask.locator('[data-compare-more]:visible')).toHaveCount(3);
    await expect(ask.locator('#compare-url-3')).toHaveValue('four.example');
    await expect(ask.locator('#compare-url-4')).toHaveValue('five.example');
    await expect(add).toContainText('(1 left)');
  });

  test('several competitors run one after another against the same report, and a failed one does not stop the rest', async ({ page }) => {
    const sent = [];
    const ask = await open(page, null, (body) => {
      sent.push(body);
      return JSON.stringify({ type: 'error', error: 'The site did not answer' }) + '\n';
    });
    await page.evaluate(() => { document.getElementById('name').value = 'Ana Pérez'; });
    await ask.locator('#compare-url').fill('one.example');
    await ask.locator('#compare-add').click();
    await ask.locator('#compare-url-2').fill('two.example');
    await ask.locator('#compare-add').click();
    await ask.locator('#compare-url-3').fill('www.one.example');
    await ask.locator('#compare-add').click();
    await ask.locator('#compare-url-4').fill('three.example');
    await ask.locator('#compare-go').click();
    await expect(page.locator('#form-status')).toContainText('These did not finish: one.example, two.example, three.example.', { timeout: 20000 });
    expect(sent.map((body) => body.url)).toEqual(['one.example', 'two.example', 'three.example']);
    expect(sent.every((body) => body.compareWith === ID && body.reasonCode === 'compare')).toBe(true);
    await expect(page.locator('#compare-go')).toBeEnabled();
  });

  test('the report\'s own site is refused as a competitor', async ({ page }) => {
    const ask = await open(page, null, () => { throw new Error('no run expected'); });
    await ask.locator('#compare-url').fill('www.' + sample.report.host.replace(/^www\./, ''));
    await ask.locator('#compare-go').click();
    await expect(page.locator('#compare-error')).toContainText('is the site of this report');
  });

  test('a base report links the comparisons made from it', async ({ page }) => {
    const made = [{ id: 'ab12cd', at: '2026-10-24T10:00:00Z', baseId: ID, ownHost: sample.report.host, rivalHost: 'rival.example', own: 78, rival: 86 }];
    const ask = await open(page, null, null, '/qa-review.html', { comparisons: made });
    await expect(ask).toBeVisible();
    const list = page.locator('#compare-result');
    await expect(list).toBeVisible();
    await expect(list.locator('.cmp-h')).toHaveText('Comparisons from this review');
    await expect(list.locator('.cmp-made a')).toHaveAttribute('href', '?report=ab12cd');
    await expect(list.locator('.cmp-made a')).toHaveText('rival.example');
    await expect(list.locator('.cmp-made li')).toContainText(sample.report.host + ' 78 vs rival.example 86');
  });

  test('a comparison names its base review as a link', async ({ page }) => {
    const cmp = compare.compareSites(Object.assign({}, own, { id: 'fe98' }), sample.report);
    const card = await open(page, cmp);
    await expect(card.locator('p').first().locator('a[href="?report=fe98"]')).toHaveText(own.host);
  });

  test('printed, a report with no comparison leaves the empty card out, and a comparison keeps its bar colors', async ({ page }) => {
    await open(page, null);
    await page.emulateMedia({ media: 'print' });
    await expect(page.locator('#compare')).toBeHidden();
    await expect(page.locator('h2:has(+ #compare)')).toBeHidden();
    await page.emulateMedia({ media: 'screen' });
    const cmp = compare.compareSites(own, sample.report);
    const card = await open(page, cmp);
    await page.emulateMedia({ media: 'print' });
    await expect(card).toBeVisible();
    expect(await card.locator('.cmp-split i').first().evaluate((node) => getComputedStyle(node).printColorAdjust)).toBe('exact');
  });
});
