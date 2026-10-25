const { test, expect } = require('@playwright/test');
const auth = require('../functions/url-review-auth');
const multi = require('../functions/url-review-multi');
const compare = require('../functions/url-review-compare');
const offers = require('../functions/url-review-offers');
const sample = require('../assets/qa-review-sample.json');
const own = require('./unit/fixtures/review-wordpress.json');
const rival = require('./unit/fixtures/review-excalidraw.json');

const TERMS = require('fs').readFileSync(require('path').join(__dirname, '../js/qa-review.js'), 'utf8').match(/TERMS_VERSION = "([^"]+)"/)[1];
const ANA = 'a'.repeat(64);
const EMAIL = 'ana@example.com';

function recordsWith(thirdPaid) {
  return [
    { id: 'ab12', email: EMAIL, status: 'complete', paid: true, createdAt: '2026-10-24T10:00:00Z', report: Object.assign({}, own, { id: 'ab12' }) },
    { id: 'cd34', email: EMAIL, status: 'complete', paid: true, createdAt: '2026-10-23T10:00:00Z', report: Object.assign({}, rival, { id: 'cd34' }) },
    { id: 'ef56', email: EMAIL, status: 'complete', paid: thirdPaid, createdAt: '2026-10-22T10:00:00Z', report: Object.assign({}, sample.report, { id: 'ef56' }) }
  ];
}

async function signIn(page, records, file, seen) {
  const store = auth.memoryStore();
  const started = await auth.startEmail(store, { email: EMAIL, deviceKey: ANA, ip: '1.1.1.1' });
  const signed = await auth.finishEmail(store, { id: started.id, code: started.code, deviceKey: ANA });
  const saved = { cmp1: { email: EMAIL, ids: ['ab12', 'cd34', 'ef56'], hosts: records.map((row) => row.report.host), from: 'account', createdAt: '2026-10-24T12:00:00Z' } };
  await page.addInitScript(({ version, session }) => {
    sessionStorage.setItem('qa-review-terms', version);
    localStorage.setItem('hasSeenReviewTour', 'true');
    localStorage.setItem('qa-review-analytics', 'necessary');
    localStorage.setItem('qa-review-session', JSON.stringify({ session, email: 'ana@example.com', provider: 'email' }));
    localStorage.setItem('qa-review-device-key', JSON.stringify('a'.repeat(64)));
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
    const file = offers.accountFile(records, EMAIL, Date.parse('2026-10-24T12:00:00Z'));
    const open = new Set(file.runs.filter((run) => run.open).map((run) => run.id));
    if (path === '/account/runs') return json(200, Object.assign(file, { comparisons: multi.listOf(Object.entries(saved).map(([id, doc]) => Object.assign({ id }, doc)), EMAIL) }));
    if (path === '/review/open') {
      const comparisons = [{ id: 'cd34', at: '2026-10-24T11:00:00Z', baseId: 'ab12', ownHost: own.host, rivalHost: rival.host, own: own.insights.score.overall, rival: rival.insights.score.overall }];
      return json(200, { report: Object.assign({}, records[0].report, { comparisons }), frameworks: [], paid: true });
    }
    if (path === '/account/compare') {
      const made = compare.savedComparison(records, EMAIL, body.ids, (row) => open.has(row.id));
      return json(made.error ? 400 : 200, made);
    }
    if (path === '/account/comparison/save') {
      seen.saved.push(body.ids);
      const picked = multi.pickProblem(records, EMAIL, body.ids);
      if (picked.error) return json(400, picked);
      saved.cmp2 = multi.savedRecord(EMAIL, picked, body.from, Date.parse('2026-10-24T13:00:00Z'));
      return json(200, { ok: true, id: 'cmp2' });
    }
    if (path === '/account/comparison/delete') {
      seen.deleted.push(body.id);
      delete saved[body.id];
      return json(200, { ok: true });
    }
    const made = saved[body.id] ? multi.payloadOf(body.id, saved[body.id], records, (row) => open.has(row.id)) : null;
    if (path === '/account/comparison/open') return made ? json(200, made) : json(404, { error: 'That comparison is not saved under this account.' });
    if (path === '/account/comparison/pdf') {
      seen.pdf.push(body.html);
      const problem = multi.pdfProblem(made, body.html);
      return problem ? json(made && made.paid ? 400 : 402, { error: problem }) : json(200, { ok: true, pdf: Buffer.from('%PDF-1.4 test').toString('base64'), filename: multi.pdfName(made) });
    }
    return json(200, path === '/auth/providers' ? { providers: [{ id: 'email' }] } : { items: [] });
  });
  await page.goto(file);
}

const hosts = [own.host, rival.host, sample.report.host];

test('a saved comparison sets the summary and every report section side by side, one column per URL', async ({ page }) => {
  const seen = { saved: [], deleted: [], pdf: [] };
  await signIn(page, recordsWith(true), '/qa-review.html?comparison=cmp1', seen);
  const box = page.locator('#multi-overlay');
  await expect(box).toBeVisible({ timeout: 20000 });
  await expect(box.locator('#multi-title')).toHaveText(hosts.join(' vs '));
  const table = box.locator('.multi-table');
  await expect(table.locator('thead th')).toHaveCount(4);
  await expect(table.locator('tbody tr').first().locator('th')).toHaveText('Overall');
  await expect(table.locator('tbody tr').first().locator('td').nth(0)).toHaveText(String(own.insights.score.overall));
  await expect(table.locator('.multi-wins td')).toHaveCount(3);
  await expect(box.locator('.multi-sec > h2')).toHaveCount(22);
  for (const [key, title] of [['exec', 'One-page summary'], ['health', 'Health score'], ['fix', 'Fix first'], ['geo', 'What AI sees'], ['security', 'Security and email'], ['findings', 'Every check, with its verdict'], ['pages', 'Pages analyzed'], ['cases', 'Cases that could be run']]) {
    const sec = box.locator('.multi-sec[data-sec="' + key + '"]');
    await expect(sec.locator('> h2')).toHaveText(title);
    await expect(sec.locator('.multi-cell')).toHaveCount(3);
  }
  const health = box.locator('.multi-sec[data-sec="health"] .multi-cell');
  await expect(health.nth(1).locator('.ring')).toHaveAttribute('aria-label', new RegExp('Health score ' + rival.insights.score.overall + ' '));
  const pages = box.locator('.multi-sec[data-sec="pages"] .multi-cell').nth(0).locator('tbody tr');
  await expect(pages).toHaveCount(own.pages.length);
  await expect(box.locator('.multi-cell .fade-line')).toHaveCount(0);
  await expect(box.locator('#multi-locked')).toBeHidden();

  const filters = box.locator('.multi-sec[data-sec="findings"] .multi-cell').nth(0);
  await filters.locator('[data-verdict="pass"]').click();
  await expect(filters.locator('[data-verdict="pass"]')).toHaveClass('on');
  await expect(box.locator('.multi-sec[data-sec="findings"] .multi-cell').nth(1).locator('[data-verdict="open"]')).toHaveClass('on');

  if (process.env.MULTI_SHOT) {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.screenshot({ path: process.env.MULTI_SHOT + '/multi-top.png' });
    await box.locator('.multi-sec[data-sec="health"]').scrollIntoViewIfNeeded();
    await page.screenshot({ path: process.env.MULTI_SHOT + '/multi-health.png' });
    await page.evaluate(() => document.body.classList.add('printing-multi'));
    await page.emulateMedia({ media: 'print' });
    await page.pdf({ path: process.env.MULTI_SHOT + '/multi-print.pdf', preferCSSPageSize: true, printBackground: true });
    await page.emulateMedia({ media: 'screen' });
    await page.evaluate(() => document.body.classList.remove('printing-multi'));
  }
  await page.evaluate(() => { window.print = () => { window.printedWith = document.body.className; }; });
  await box.getByRole('button', { name: 'Print', exact: true }).click();
  expect(await page.evaluate(() => window.printedWith)).toContain('printing-multi');

  const download = page.waitForEvent('download');
  await box.getByRole('button', { name: 'Download PDF' }).click();
  expect((await download).suggestedFilename()).toBe('qa-review-comparison-' + hosts.join('-vs-') + '-2026-10-24.pdf');
  await expect(box.locator('#multi-status')).toHaveText('The PDF is downloaded.');
  expect(seen.pdf[0]).toContain('multi-modal');
  expect(seen.pdf[0]).not.toContain('<script');
  expect(seen.pdf[0]).not.toContain('<button');
});

test('an unpaid report in the comparison comes blurred and locks Print and Download PDF behind its payment', async ({ page }) => {
  const seen = { saved: [], deleted: [], pdf: [] };
  await signIn(page, recordsWith(false), '/qa-review.html?comparison=cmp1', seen);
  const box = page.locator('#multi-overlay');
  await expect(box).toBeVisible({ timeout: 20000 });
  await expect(box.locator('#multi-locked')).toContainText('1 report in this comparison is not paid');
  await expect(box.locator('#multi-locked a')).toHaveAttribute('href', /qa-review-pay\.html\?purpose=report&reportId=ef56/);
  await expect(box.locator('.multi-cell[data-col="2"] .fade-line').first()).toBeVisible();
  await expect(box.locator('.multi-cell[data-col="0"] .fade-line')).toHaveCount(0);
  await expect(box.locator('#multi-pdf')).toContainText('🔒');
  await page.route('**/qa-review-pay.html**', (route) => route.fulfill({ contentType: 'text/html', body: '<p>pay</p>' }));
  await box.locator('#multi-print').click();
  await expect(page).toHaveURL(/qa-review-pay\.html\?purpose=report&reportId=ef56/);
  expect(seen.pdf).toHaveLength(0);
});

test('the comparison speaks the page language', async ({ page }) => {
  const seen = { saved: [], deleted: [], pdf: [] };
  await signIn(page, recordsWith(true), '/qa-review-es.html?comparison=cmp1', seen);
  const box = page.locator('#multi-overlay');
  await expect(box).toBeVisible({ timeout: 20000 });
  await expect(box.locator('.report-kicker').first()).toHaveText('Informe comparativo');
  await expect(box.locator('.multi-sec[data-sec="exec"] h2')).toHaveText('Resumen en una página');
  await expect(box.getByRole('button', { name: 'Descargar PDF' })).toBeVisible();
  const chip = box.locator('.multi-sec[data-sec="health"] .area[data-area="Security"]').first();
  await expect(chip).toContainText('Seguridad');
  await expect(chip.locator('small')).toContainText(/^Fallan: \d+ · En riesgo: \d+ · Pasan: \d+ — Cabeceras, TLS/);
  await expect(box.locator('.multi-sec[data-sec="health"] .vchip.v-fail').first()).toContainText('Falla ahora');
});

test('the account page saves the reviews it compares as a full comparison and lists, opens and deletes saved ones', async ({ page }) => {
  const seen = { saved: [], deleted: [], pdf: [] };
  await signIn(page, recordsWith(true), '/qa-review-account.html', seen);
  const savedList = page.locator('#saved-cmps');
  await expect(savedList).toBeVisible({ timeout: 20000 });
  await expect(savedList.locator('li a')).toHaveText(hosts.join(' vs '));
  await expect(savedList.locator('li a')).toHaveAttribute('href', 'qa-review.html?comparison=cmp1');
  await savedList.getByRole('button', { name: 'Delete' }).click();
  await expect(savedList).toBeHidden();
  expect(seen.deleted).toEqual(['cmp1']);

  const panel = page.locator('#compare');
  await panel.scrollIntoViewIfNeeded();
  await panel.locator('#cmp-picks input').first().check();
  await panel.locator('#cmp-go').click();
  const full = panel.getByRole('button', { name: 'Open the full comparison report' });
  await expect(full).toBeVisible();
  await full.click();
  await expect(page).toHaveURL(/qa-review\.html\?comparison=cmp2/);
  expect(seen.saved[0].length).toBe(2);
  await expect(page.locator('#multi-overlay .multi-sec[data-sec="health"] .multi-cell')).toHaveCount(2, { timeout: 20000 });
});

test('a review that comparisons were made from opens them all as one full comparison report', async ({ page }) => {
  const seen = { saved: [], deleted: [], pdf: [] };
  await signIn(page, recordsWith(true), '/qa-review.html?report=ab12', seen);
  const card = page.locator('#compare-result');
  await expect(card).toBeVisible({ timeout: 20000 });
  await card.getByRole('button', { name: 'Open the full comparison report' }).click();
  await expect(page).toHaveURL(/\?comparison=cmp2$/);
  expect(seen.saved).toEqual([['ab12', 'cd34']]);
  const box = page.locator('#multi-overlay');
  await expect(box.locator('#multi-title')).toHaveText(own.host + ' vs ' + rival.host, { timeout: 20000 });
  await expect(box.locator('.multi-sec[data-sec="exec"] .multi-cell')).toHaveCount(2);
});
