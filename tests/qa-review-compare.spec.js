const { test, expect } = require('@playwright/test');
const auth = require('../functions/url-review-auth');
const compare = require('../functions/url-review-compare');
const multi = require('../functions/url-review-multi');
const sample = require('../assets/qa-review-sample.json');
const own = require('./unit/fixtures/review-wordpress.json');

const TERMS = require('fs').readFileSync(require('path').join(__dirname, '../js/qa-review.js'), 'utf8').match(/TERMS_VERSION = "([^"]+)"/)[1];
const ID = 'cd34ef56ab12';
const ANA = 'a'.repeat(64);
const days = (start, step) => Array.from({ length: 30 }, (item, index) => ({ date: '2026-09-' + String(index + 1).padStart(2, '0'), rank: start + index * step }));

async function open(page, cmp, review, file = '/qa-review.html', extra = {}, from = {}) {
  const store = auth.memoryStore();
  const started = await auth.startEmail(store, { email: 'ana@example.com', deviceKey: ANA, ip: '1.1.1.1' });
  const signed = await auth.finishEmail(store, { id: started.id, code: started.code, deviceKey: ANA });
  const row = { email: 'ana@example.com', paid: true, frameworks: sample.frameworks, report: Object.assign({}, sample.report, { id: ID, compare: cmp }, extra) };
  await page.addInitScript(({ version, session }) => {
    try {
      if (version) sessionStorage.setItem('qa-review-terms', version);
      localStorage.setItem('hasSeenReviewTour', 'true');
      localStorage.setItem('qa-review-analytics', 'necessary');
      localStorage.setItem('qa-review-session', JSON.stringify({ session, email: 'ana@example.com', provider: 'email' }));
      localStorage.setItem('qa-review-device-key', JSON.stringify('a'.repeat(64)));
    } catch (e) { /* storage is optional */ }
  }, { version: from.terms === false ? '' : TERMS, session: signed.session });
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
    if (path === '/review/open') return json(200, Object.assign({ report: row.report, frameworks: row.frameworks, paid: true }, from.versus && body.vs === 'ab12' ? { versus: from.versus } : {}));
    if (path === '/review' && review) {
      const answer = await review(body);
      return typeof answer === 'string' ? route.fulfill({ status: 200, contentType: 'application/x-ndjson', headers: cors, body: answer }) : json(400, answer);
    }
    return json(200, path === '/auth/providers' ? { providers: [{ id: 'email' }] } : { items: [] });
  });
  await page.goto(file + '?report=' + ID + (from.query || ''));
  const card = page.locator(cmp || from.versus ? '#compare-result' : '#compare-ask');
  await expect(card).toBeVisible({ timeout: 20000 });
  await card.scrollIntoViewIfNeeded();
  return card;
}

test.describe('From the account page', () => {
  test('?vs= shows the pair of saved reviews the server built', async ({ page }) => {
    const versus = compare.compareSites(Object.assign({}, sample.report, { id: ID }), own);
    const card = await open(page, null, null, '/qa-review.html', {}, { query: '&vs=ab12', versus });
    await expect(card.locator('.cmp-ring')).toHaveCount(2);
    await expect(card).toContainText(own.host);
    await expect(page.locator('#compare-ask')).toBeHidden();
  });

  test('?compare= puts the competitor in the box and the Compare button in focus, without starting a run', async ({ page }) => {
    let runs = 0;
    const card = await open(page, null, () => { runs += 1; return { error: 'no' }; }, '/qa-review.html', {}, { query: '&compare=rival.example.com' });
    await expect(card.locator('#compare-url')).toHaveValue('rival.example.com');
    await expect(card.locator('#compare-go')).toBeFocused();
    expect(runs).toBe(0);
  });
});

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
    await expect(page.locator('#compare-note')).toHaveText(/^Cada competidor cuesta 9 USD, y se revisan uno tras otro\. Ves el total antes de pagar\./);
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

  test('several competitors run against the same report, and when none finish the report reopens with the reasons', async ({ page }) => {
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
    await expect(page.locator('#form-status')).toContainText('The comparison did not finish. Your report is open again.', { timeout: 20000 });
    await expect(page.locator('#compare-error')).toContainText('None of the competitor reviews finished. one.example: The site did not answer. two.example: The site did not answer. three.example: The site did not answer.');
    expect(sent.map((body) => body.url).sort()).toEqual(['one.example', 'three.example', 'two.example']);
    expect(sent.every((body) => body.compareWith === ID && body.reasonCode === 'compare')).toBe(true);
    await expect(page.locator('#compare-go')).toBeEnabled();
  });

  test('two or more finished competitors open with the report as one comparison, not only the last pair', async ({ page }) => {
    const rivals = { 'one.example': 'c1c1c1', 'two.example': 'c2c2c2' };
    const records = [{ id: ID, email: 'ana@example.com', report: Object.assign({}, sample.report, { id: ID }) }]
      .concat(Object.entries(rivals).map(([host, id]) => ({ id, email: 'ana@example.com', report: Object.assign({}, own, { id, host }) })));
    const ask = await open(page, null, (body) => {
      const report = records.find((row) => row.id === rivals[body.url]).report;
      const cmp = compare.compareSites(Object.assign({}, sample.report, { id: ID }), report);
      return JSON.stringify({ type: 'done', report: Object.assign({}, report, { compare: cmp }), frameworks: sample.frameworks, paid: true }) + '\n';
    });
    const saved = [];
    await page.route('http://127.0.0.1:8768/account/comparison/**', async (route) => {
      const req = route.request();
      const headers = { 'access-control-allow-origin': req.headers().origin || '*', 'access-control-allow-credentials': 'true', 'access-control-allow-headers': 'content-type' };
      if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: Object.assign({ 'access-control-allow-methods': 'GET,POST' }, headers) });
      const body = JSON.parse(req.postData() || '{}');
      const picked = multi.pickProblem(records, 'ana@example.com', body.ids || saved[0]);
      if (req.url().endsWith('/save')) saved.push(body.ids);
      const made = req.url().endsWith('/save') ? { ok: true, id: 'cmp9' } : multi.payloadOf('cmp9', multi.savedRecord('ana@example.com', picked, 'review'), records, () => true);
      return route.fulfill({ status: 200, contentType: 'application/json', headers, body: JSON.stringify(made) });
    });
    await page.evaluate(() => { document.getElementById('name').value = 'Ana Pérez'; });
    await ask.locator('#compare-url').fill('one.example');
    await ask.locator('#compare-add').click();
    await ask.locator('#compare-url-2').fill('two.example');
    await ask.locator('#compare-go').click();
    const overlay = page.locator('#multi-overlay');
    await expect(overlay).toHaveClass(/open/, { timeout: 20000 });
    expect(saved).toEqual([[ID, 'c1c1c1', 'c2c2c2']]);
    await expect(page).toHaveURL(/[?&]comparison=cmp9/);
    await expect(overlay).toContainText('one.example');
    await expect(overlay).toContainText('two.example');
  });

  test('five competitors run three at a time with a row each, and all that finish open side by side', async ({ page }) => {
    const hosts = ['one.example', 'two.example', 'three.example', 'four.example', 'five.example'];
    const ids = { 'one.example': 'd1d1d1', 'two.example': 'd2d2d2', 'three.example': 'd3d3d3', 'four.example': 'd4d4d4', 'five.example': 'd5d5d5' };
    const records = [{ id: ID, email: 'ana@example.com', report: Object.assign({}, sample.report, { id: ID }) }]
      .concat(hosts.filter((host) => host !== 'four.example').map((host) => ({ id: ids[host], email: 'ana@example.com', report: Object.assign({}, own, { id: ids[host], host }) })));
    let running = 0;
    let most = 0;
    const ask = await open(page, null, async (body) => {
      running += 1;
      most = Math.max(most, running);
      await new Promise((resolve) => setTimeout(resolve, 400));
      running -= 1;
      if (body.url === 'four.example') return JSON.stringify({ type: 'error', error: 'The site did not answer' }) + '\n';
      const report = records.find((row) => row.id === ids[body.url]).report;
      const cmp = compare.compareSites(Object.assign({}, sample.report, { id: ID }), report);
      return JSON.stringify({ type: 'log', text: 'Reading ' + body.url }) + '\n' + JSON.stringify({ type: 'done', report: Object.assign({}, report, { compare: cmp }), frameworks: sample.frameworks, paid: true }) + '\n';
    });
    const saved = [];
    await page.route('http://127.0.0.1:8768/account/comparison/**', async (route) => {
      const req = route.request();
      const headers = { 'access-control-allow-origin': req.headers().origin || '*', 'access-control-allow-credentials': 'true', 'access-control-allow-headers': 'content-type' };
      if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: Object.assign({ 'access-control-allow-methods': 'GET,POST' }, headers) });
      const body = JSON.parse(req.postData() || '{}');
      if (req.url().endsWith('/save')) saved.push(body.ids);
      const picked = multi.pickProblem(records, 'ana@example.com', body.ids || saved[0]);
      const made = req.url().endsWith('/save') ? { ok: true, id: 'cmp5' } : multi.payloadOf('cmp5', multi.savedRecord('ana@example.com', picked, 'review'), records, () => true);
      return route.fulfill({ status: 200, contentType: 'application/json', headers, body: JSON.stringify(made) });
    });
    await page.evaluate(() => { document.getElementById('name').value = 'Ana Pérez'; });
    await ask.locator('#compare-url').fill(hosts[0]);
    for (const [index, host] of hosts.slice(1).entries()) {
      await ask.locator('#compare-add').click();
      await ask.locator('#compare-url-' + (index + 2)).fill(host);
    }
    await ask.locator('#compare-go').click();
    const rows = page.locator('#compare-rows li');
    await expect(rows).toHaveCount(5);
    await expect(rows.filter({ hasText: 'Running' })).toHaveCount(3);
    await expect(page.locator('#run-log .log-host').first()).toBeVisible();
    const overlay = page.locator('#multi-overlay');
    await expect(overlay).toHaveClass(/open/, { timeout: 20000 });
    expect(most).toBe(3);
    expect(saved).toHaveLength(1);
    expect(saved[0][0]).toBe(ID);
    expect(saved[0].slice(1).sort()).toEqual(['d1d1d1', 'd2d2d2', 'd3d3d3', 'd5d5d5']);
    await expect(page.locator('#form-status')).toContainText('These did not finish: four.example.');
    await expect(page.locator('#compare-rows')).toBeHidden();
  });

  test('Compare with an empty Name takes the account email or says so on the comparison, and the terms name every competitor (#1425, #1426)', async ({ page }) => {
    const sent = [];
    const ask = await open(page, null, (body) => {
      sent.push(body);
      return JSON.stringify({ type: 'error', error: 'The site did not answer' }) + '\n';
    }, '/qa-review.html', {}, { terms: false });
    await expect(page.locator('#name')).toHaveValue('');
    await ask.locator('#compare-url').fill('one.example');
    await ask.locator('#compare-add').click();
    await ask.locator('#compare-url-2').fill('two.example');
    await page.evaluate(() => { window.whoWas = ReviewAuth.who; ReviewAuth.who = () => ({ name: '', email: '' }); });
    await ask.locator('#compare-go').click();
    await expect(page.locator('#compare-error')).toHaveText('Enter your name in the review form above, then press Compare again.');
    await expect(page.locator('#dash-overlay')).toHaveClass(/open/);
    await expect(page.locator('#gate')).toBeHidden();

    await page.evaluate(() => { ReviewAuth.who = window.whoWas; });
    await ask.locator('#compare-go').click();
    await expect(page.locator('#gate')).toBeVisible();
    await expect(page.locator('#gate-waiting')).toHaveText('The reviews of one.example, two.example start as soon as you accept.');
    await expect(page.locator('#name')).toHaveValue('ana@example.com');
    await page.locator('#terms-all').check();
    await page.locator('#accept').click();
    await expect(page.locator('#compare-error')).toContainText('None of the competitor reviews finished.', { timeout: 20000 });
    expect(sent.map((body) => body.name)).toEqual(['ana@example.com', 'ana@example.com']);
  });

  test('a comparison brings its progress into view, names the competitor that failed, and closes onto your own report (#1427, #1429, #1430, #1432)', async ({ page }) => {
    const ids = { 'one.example': 'e1e1e1', 'two.example': 'e2e2e2' };
    const records = [{ id: ID, email: 'ana@example.com', report: Object.assign({}, sample.report, { id: ID }) }]
      .concat(Object.entries(ids).map(([host, id]) => ({ id, email: 'ana@example.com', report: Object.assign({}, own, { id, host }) })));
    let release;
    const held = new Promise((resolve) => { release = resolve; });
    const ask = await open(page, null, async (body) => {
      await held;
      if (!ids[body.url]) return JSON.stringify({ type: 'error', error: "The site's bot protection refused the review (status 403)" }) + '\n';
      const report = records.find((row) => row.id === ids[body.url]).report;
      const cmp = compare.compareSites(Object.assign({}, sample.report, { id: ID }), report);
      return JSON.stringify({ type: 'done', report: Object.assign({}, report, { compare: cmp }), frameworks: sample.frameworks, paid: true }) + '\n';
    });
    const saved = [];
    await page.route('http://127.0.0.1:8768/account/comparison/**', async (route) => {
      const req = route.request();
      const headers = { 'access-control-allow-origin': req.headers().origin || '*', 'access-control-allow-credentials': 'true', 'access-control-allow-headers': 'content-type' };
      if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: Object.assign({ 'access-control-allow-methods': 'GET,POST' }, headers) });
      const body = JSON.parse(req.postData() || '{}');
      if (req.url().endsWith('/save')) saved.push(body.ids);
      const picked = multi.pickProblem(records, 'ana@example.com', body.ids || saved[0]);
      const made = req.url().endsWith('/save') ? { ok: true, id: 'cmp7' } : multi.payloadOf('cmp7', multi.savedRecord('ana@example.com', picked, 'review'), records, () => true);
      return route.fulfill({ status: 200, contentType: 'application/json', headers, body: JSON.stringify(made) });
    });
    await page.evaluate(() => { document.getElementById('name').value = 'Ana Pérez'; });
    await ask.locator('#compare-url').fill('one.example');
    for (const [index, host] of ['two.example', 'three.example'].entries()) {
      await ask.locator('#compare-add').click();
      await ask.locator('#compare-url-' + (index + 2)).fill(host);
    }
    await ask.locator('#compare-go').click();
    await expect(page.locator('#compare-rows li')).toHaveCount(3);
    await expect(page.locator('#compare-rows')).toBeInViewport();
    await expect(page.locator('#compare-run')).toBeFocused();
    release();

    const overlay = page.locator('#multi-overlay');
    await expect(overlay).toHaveClass(/open/, { timeout: 20000 });
    expect(saved).toEqual([[ID, 'e1e1e1', 'e2e2e2']]);
    await expect(page).toHaveURL(new RegExp('\\?report=' + ID + '&comparison=cmp7$'));
    await expect(overlay.locator('#multi-failed')).toContainText("three.example · The site's bot protection refused the review (status 403).");
    await expect(page.locator('#compare-running')).toBeHidden();
    await expect(page.locator('#compare-running-text')).toHaveText('');
    await expect(page.locator('#form-status')).toContainText('The comparisons are done.');

    await overlay.locator('#multi-close').click();
    await expect(page).toHaveURL(new RegExp('\\?report=' + ID + '$'));
    await expect(page.locator('#dash-overlay')).toHaveClass(/open/);
    await expect(page.locator('#report-cover h2')).toHaveText(sample.report.host);
    await expect(page.locator('#compare-running')).toBeHidden();
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
