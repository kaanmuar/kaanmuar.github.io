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
  const saved = { cmp1: { email: EMAIL, ids: records.map((row) => row.id), hosts: records.map((row) => row.report.host), from: 'account', createdAt: '2026-10-24T12:00:00Z' } };
  await page.addInitScript(({ version, session }) => {
    sessionStorage.setItem('qa-review-terms', version);
    localStorage.setItem('hasSeenReviewTour', 'true');
    localStorage.setItem('qa-review-analytics', 'necessary');
    localStorage.setItem('qa-review-session', JSON.stringify({ session, email: 'ana@example.com', provider: 'email' }));
    localStorage.setItem('qa-review-device-key', JSON.stringify('a'.repeat(64)));
  }, { version: TERMS, session: signed.session });
  await page.route(/ipwho\.is/, (route) => route.fulfill({ contentType: 'application/json', body: '{"success":false}' }));
  await page.route(/^https:\/\/[^/]+\/[^?]*\.(ico|svg|png)$/, (route) => route.fulfill((seen && seen.icons && seen.icons[route.request().url()]) || { status: 404, body: '' }));
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
    if (path === '/account/comparison/open') return made ? json(200, made) : json(404, { error: 'That comparison is not saved under this account.', code: 'comparisonNotSaved' });
    if (path === '/account/comparison/pdf') {
      seen.pdf.push(body.html);
      const problem = multi.pdfProblem(made, body.html);
      if (problem) return json(made && made.paid ? 400 : 402, { error: problem });
      return json(200, seen.pdfUrl ? { ok: true, url: seen.pdfUrl, filename: multi.pdfName(made) } : { ok: true, pdf: Buffer.from('%PDF-1.4 test').toString('base64'), filename: multi.pdfName(made) });
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
  await expect(box.locator('#multi-title')).toHaveAttribute('aria-label', hosts.slice(0, 2).concat('Carlos A. Muñoz').join(' vs '));
  const table = box.locator('.multi-table');
  await expect(table.locator('thead th')).toHaveCount(4);
  await expect(table.locator('tbody tr').first().locator('th')).toHaveText('Overall');
  await expect(table.locator('tbody tr').first().locator('td').last()).toHaveText(String(own.insights.score.overall));
  await expect(table.locator('.multi-wins td')).toHaveCount(3);
  await expect(box.locator('.multi-sec > h2')).toHaveCount(22);
  for (const [key, title] of [['exec', 'One-page summary'], ['health', 'Health score'], ['fix', 'Fix first'], ['geo', 'What AI sees'], ['security', 'Security and email'], ['findings', 'Every check, with its verdict'], ['pages', 'Pages analyzed'], ['cases', 'Cases that could be run']]) {
    const sec = box.locator('.multi-sec[data-sec="' + key + '"]');
    await expect(sec.locator('> h2')).toHaveText(title);
    await expect(sec.locator('.multi-cell')).toHaveCount(3);
  }
  const health = box.locator('.multi-sec[data-sec="health"] .multi-cell');
  await expect(health.nth(1).locator('.ring')).toHaveAttribute('aria-label', new RegExp('Health score ' + rival.insights.score.overall + ' '));
  const pages = box.locator('.multi-sec[data-sec="pages"] .multi-cell[data-col="0"]').locator('tbody tr:visible');
  await expect(pages).toHaveCount(own.pages.length);
  expect(own.counts).toBeUndefined();
  await expect(box.locator('.multi-sec[data-sec="cover"] .multi-cell[data-col="0"]').locator('.kpi b').nth(3)).toHaveText(String(own.pages.length));
  await expect(box.locator('.multi-cell .fade-line')).toHaveCount(0);
  await expect(box.locator('#multi-locked')).toBeHidden();

  const filters = box.locator('.multi-sec[data-sec="findings"] .multi-cell[data-col="0"]');
  await filters.locator('[data-verdict="pass"]').click();
  await expect(filters.locator('[data-verdict="pass"]')).toHaveClass('on');
  await expect(box.locator('.multi-sec[data-sec="findings"] .multi-cell[data-col="1"]').locator('[data-verdict="open"]')).toHaveClass('on');

  if (process.env.MULTI_SHOT) {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.screenshot({ path: process.env.MULTI_SHOT + '/multi-top.png' });
    for (const part of ['bench-top', 'bench-why', 'bench-areas', 'bench-kpis']) {
      await box.locator('.' + part).scrollIntoViewIfNeeded();
      await page.screenshot({ path: process.env.MULTI_SHOT + '/multi-' + part + '.png' });
    }
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

test('the comparison title shows each site as its logo with its name below, a letter when the logo does not load, and the PDF gets the logos from the server (#1507)', async ({ page }) => {
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64');
  const icons = {
    'https://wordpress.org/logo-test.png': { contentType: 'image/png', body: png },
    'https://carlosandmunoz.com/favicon.svg': { contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1"><rect width="1" height="1"/></svg>' }
  };
  const seen = { saved: [], deleted: [], pdf: [], icons };
  const records = recordsWith(true);
  ['https://wordpress.org/logo-test.png', 'https://excalidraw.com/logo-missing.png'].forEach((icon, index) => {
    records[index].report.insights = Object.assign({}, records[index].report.insights, { previews: { google: { icon } } });
  });
  records[1].report.host = 'www.excalidraw.com';
  await page.setViewportSize({ width: 1280, height: 900 });
  await signIn(page, records, '/qa-review.html?comparison=cmp1', seen);
  const title = page.locator('#multi-title');
  await expect(title.locator('.multi-site')).toHaveCount(3, { timeout: 20000 });
  await expect(title.locator('.multi-vs')).toHaveText(['vs', 'vs']);
  expect(await title.evaluate((el) => [...el.children].map((site) => site.className + ':' + !!site.querySelector(':scope > .multi-vs')))).toEqual(['multi-site:false', 'multi-site:true', 'multi-site:true']);
  const [first, second, third] = [0, 1, 2].map((i) => title.locator('.multi-site').nth(i));
  await expect(first.locator('.multi-site-name')).toHaveText('wordpress.org');
  await expect(first.locator('small')).toHaveCount(0);
  await expect(first.locator('img.multi-logo')).toBeVisible();
  expect(await first.locator('img.multi-logo').evaluate((img) => img.complete && img.naturalWidth)).toBeGreaterThan(0);
  await expect(second.locator('img')).toHaveCount(0);
  await expect(second.locator('.multi-site-name')).toHaveText('excalidraw.com');
  await expect(second.locator('.multi-mark > span')).toHaveText('E');
  await expect(second.locator('.multi-mark > span')).toBeVisible();
  await expect(third.locator('.multi-site-name')).toHaveText('Carlos A. Muñoz');
  await expect(third.locator('small')).toHaveText('carlosandmunoz.com');
  expect(await third.locator('small').innerHTML()).toBe('carlosandmunoz.<wbr>com');
  await expect(third.locator('img.multi-logo')).toBeVisible();
  const boxes = await Promise.all([first, second, third].map((site) => site.locator('.multi-mark').boundingBox()));
  expect(new Set(boxes.map((box) => Math.round(box.y))).size).toBe(1);
  const nameBox = await third.locator('.multi-site-name').boundingBox();
  expect(nameBox.y).toBeGreaterThan(boxes[2].y + boxes[2].height - 1);

  // The side-by-side table heads each column with the logo and name, not the address, so the column stays narrow (#1596).
  const heads = page.locator('#multi-overlay .multi-table thead th:not(:first-child)');
  await expect(heads.locator('.multi-col-name')).toHaveText(['wordpress', 'excalidraw', 'Carlos A. Muñoz']);
  await expect(heads.nth(1)).toHaveAttribute('title', 'excalidraw.com');
  await expect(heads.nth(0).locator('img.multi-logo')).toBeVisible();
  await expect(heads.nth(1).locator('img')).toHaveCount(0);
  await expect(heads.nth(1).locator('.multi-col-mark > span')).toHaveText('E');
  for (const width of await heads.evaluateAll((cells) => cells.map((cell) => cell.getBoundingClientRect().width))) expect(width).toBeLessThan(140);
  if (process.env.MULTI_SHOT) await page.locator('#multi-overlay .multi-summary').screenshot({ path: process.env.MULTI_SHOT + '/multi-table.png' });

  await page.evaluate(() => document.documentElement.classList.add('dark-mode'));
  await page.locator('#multi-overlay').getByRole('button', { name: 'Download PDF' }).click();
  await expect(page.locator('#multi-status')).toHaveText('The PDF is downloaded.');
  expect(seen.pdf[0]).not.toMatch(/<html[^>]*dark-mode/);
  expect(seen.pdf[0]).toContain('<img class="multi-logo" data-logo="0">');
  expect(seen.pdf[0]).toContain('<img class="multi-logo" data-logo="2">');
  expect(seen.pdf[0]).not.toContain('data-logo="1"');
  expect(seen.pdf[0]).not.toMatch(/logo-test|favicon/);
  expect(seen.pdf[0]).toContain('<title>' + [own.host, 'www.excalidraw.com', sample.report.host].join(' vs ') + '</title>');
  const filled = multi.withLogos(seen.pdf[0], ['data:image/png;base64,' + png.toString('base64'), '', '']);
  expect(filled).toContain('<img class="multi-logo" src="data:image/png;base64,');
  expect(filled).not.toContain('data-logo="2"');

  // The server prints what the page sends, with JavaScript off and outside requests blocked (#1533).
  const printed = await page.context().newPage();
  await printed.route(/^https?:/, (route) => route.abort());
  await printed.emulateMedia({ media: 'print' });
  await printed.setContent(filled, { waitUntil: 'load' });
  await expect(printed.locator('#multi-title')).toBeVisible();
  await expect(printed.locator('.multi-sec[data-sec="exec"] .multi-cell[data-col="0"]')).toBeVisible();
  expect(await printed.evaluate(() => document.documentElement.classList.contains('dark-mode'))).toBe(false);
  await printed.close();
});

test('a PDF too large to send back is downloaded from the link to the stored file, and only a Storage link is followed (#1549)', async ({ page }) => {
  const stored = 'https://firebasestorage.googleapis.com/v0/b/carlosm-interactive-cv.firebasestorage.app/o/comparison-pdfs%2Fabc.pdf?alt=media&token=abc';
  const seen = { saved: [], deleted: [], pdf: [], pdfUrl: stored };
  const name = 'qa-review-comparison-' + hosts.join('-vs-') + '-2026-10-24.pdf';
  await page.route(/^https:\/\/firebasestorage\.googleapis\.com\//, (route) => route.fulfill({ contentType: 'application/pdf', headers: { 'content-disposition': 'attachment; filename="' + name + '"' }, body: '%PDF-1.4 big' }));
  await signIn(page, recordsWith(true), '/qa-review.html?comparison=cmp1', seen);
  const box = page.locator('#multi-overlay');
  await expect(box.locator('.multi-site')).toHaveCount(3, { timeout: 20000 });
  const download = page.waitForEvent('download');
  await box.getByRole('button', { name: 'Download PDF' }).click();
  expect((await download).suggestedFilename()).toBe(name);
  await expect(box.locator('#multi-status')).toHaveText('The PDF is downloaded.');
  expect(page.url()).toContain('?comparison=cmp1');

  seen.pdfUrl = 'https://evil.example/x.pdf';
  await box.getByRole('button', { name: 'Download PDF' }).click();
  await expect(box.locator('#multi-status')).not.toHaveText('The PDF is downloaded.');
  await expect(box.locator('#multi-status')).toHaveClass(/bad/);
});

test('six sites fit a 1920px window side by side without scrolling sideways (#1475)', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  const more = ['gh78', 'ij90', 'kl12'].map((id, index) => {
    const base = [own, rival, sample.report][index];
    return { id, email: EMAIL, status: 'complete', paid: true, createdAt: '2026-10-21T10:00:00Z', report: Object.assign({}, base, { id, host: 'site' + (index + 4) + '.example' }) };
  });
  await signIn(page, recordsWith(true).concat(more), '/qa-review.html?comparison=cmp1', { saved: [], deleted: [], pdf: [] });
  const box = page.locator('#multi-overlay');
  await expect(box.locator('.multi-sec[data-sec="cover"] .multi-cell')).toHaveCount(6, { timeout: 20000 });
  const sizes = await box.locator('.multi-scroll.multi-grid').evaluate((grid) => ({
    scroll: grid.scrollWidth,
    client: grid.clientWidth,
    column: grid.querySelector('.multi-sec .multi-row > .multi-cell').getBoundingClientRect().width
  }));
  expect(sizes.scroll).toBeLessThanOrEqual(sizes.client);
  expect(sizes.column).toBeGreaterThanOrEqual(250);
});

test('a long host wraps inside its cover card when six sites sit side by side (#1581)', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  const records = recordsWith(true).concat(['gh78', 'ij90', 'kl12'].map((id, index) => {
    const base = [own, rival, sample.report][index];
    return { id, email: EMAIL, status: 'complete', paid: true, createdAt: '2026-10-21T10:00:00Z', report: Object.assign({}, base, { id }) };
  }));
  ['www.hotelestequendama.com', 'www.movichhotels.com', 'www.ghlhoteles.com', 'www.universidadcatolicadecolombia.edu.co', 'ciedi.edu.co', 'montessori.edu.co']
    .forEach((host, index) => { records[index].report.host = host; });
  await signIn(page, records, '/qa-review.html?comparison=cmp1', { saved: [], deleted: [], pdf: [] });
  const covers = page.locator('#multi-overlay .multi-sec[data-sec="cover"] .report-cover');
  await expect(covers).toHaveCount(6, { timeout: 20000 });
  const spill = await covers.evaluateAll((list) => list.map((cover) => {
    const heading = cover.querySelector('h2');
    return { host: heading.textContent, over: heading.scrollWidth - heading.clientWidth, right: heading.getBoundingClientRect().right - cover.getBoundingClientRect().right };
  }));
  for (const row of spill) {
    expect(row.over, row.host).toBeLessThanOrEqual(0);
    expect(row.right, row.host).toBeLessThanOrEqual(0);
  }
});

// The spread across columns of the top, and for a tile the height, of each matching box of a section.
function drift(root = document) {
  const boxes = [['health', '.health-summary'], ['health', '.verdict-chips:not([aria-label])'], ['health', '.verdict-chips[aria-label]'], ['health', '.health .meta-line'],
    ...['SEO', 'GEO', 'Analytics', 'Security', 'Accessibility', 'Performance'].map((name) => ['health', '.area[data-area="' + name + '"]', true]),
    ['exec', '.card > .exec-head'], ['exec', '.card > .meta-line'], ['exec', '.exec-cols > :nth-child(1)'], ['exec', '.exec-cols > :nth-child(2)'], ['exec', '.exec-cols > :nth-child(3)']];
  const overlaps = [...root.querySelectorAll('.multi-sec[data-sec="health"] .multi-cell')].flatMap((cell, col) => {
    const tiles = [...cell.querySelectorAll('.area')].map((tile) => [tile.dataset.area, tile.getBoundingClientRect()]);
    return tiles.flatMap(([name, a], i) => tiles.slice(i + 1).filter(([, b]) => a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1)
      .map(([other]) => ({ box: 'column ' + col + ': ' + name + ' over ' + other })));
  });
  return overlaps.concat(boxes.map(([sec, selector, tile]) => {
    const rects = [...root.querySelectorAll('.multi-sec[data-sec="' + sec + '"] .multi-cell')].map((cell) => cell.querySelector(selector).getBoundingClientRect());
    const spread = (key) => Math.max(...rects.map((r) => r[key])) - Math.min(...rects.map((r) => r[key]));
    return { box: selector, columns: rects.length, top: spread('top'), height: tile ? spread('height') : 0 };
  }).filter((row) => row.columns < 2 || row.top > 1 || row.height > 1));
}

test('the boxes of the health score and the one-page summary line up across sites, on the page, in print and in the PDF (#1601)', async ({ page }) => {
  const seen = { saved: [], deleted: [], pdf: [] };
  const records = recordsWith(true);
  const ins = records[1].report.insights;
  records[1].report.insights = Object.assign({}, ins, { summary: 'The site answered slowly and two pages timed out while they were read, so some checks used fewer pages. ' + ins.summary });
  await page.setViewportSize({ width: 1440, height: 900 });
  await signIn(page, records, '/qa-review.html?comparison=cmp1', seen);
  const box = page.locator('#multi-overlay');
  const health = box.locator('.multi-sec[data-sec="health"] .multi-cell');
  await expect(health.nth(2).locator('.area')).toHaveCount(6, { timeout: 20000 });
  const heights = await health.locator('.health-summary').evaluateAll((els) => els.map((el) => { const range = document.createRange(); range.selectNodeContents(el); return Math.round(range.getBoundingClientRect().height); }));
  expect(new Set(heights).size).toBeGreaterThan(1);
  expect(await page.evaluate(drift)).toEqual([]);
  const pair = await health.first().evaluate((cell) => ['SEO', 'GEO'].map((name) => Math.round(cell.querySelector('.area[data-area="' + name + '"]').getBoundingClientRect().top)));
  expect(pair[0]).toBe(pair[1]);
  if (process.env.MULTI_SHOT) {
    await box.locator('.multi-sec[data-sec="health"]').scrollIntoViewIfNeeded();
    await page.screenshot({ path: process.env.MULTI_SHOT + '/multi-health-1440.png' });
    await page.setViewportSize({ width: 1024, height: 900 });
    await box.locator('.multi-sec[data-sec="health"]').scrollIntoViewIfNeeded();
    await page.screenshot({ path: process.env.MULTI_SHOT + '/multi-health-1024.png' });
    await box.locator('.multi-sec[data-sec="exec"]').scrollIntoViewIfNeeded();
    await page.screenshot({ path: process.env.MULTI_SHOT + '/multi-exec-1024.png' });
    expect(await page.evaluate(drift)).toEqual([]);
    await page.setViewportSize({ width: 1440, height: 900 });
  }

  await page.evaluate(() => document.body.classList.add('printing-multi'));
  await page.emulateMedia({ media: 'print' });
  expect(await page.evaluate(drift)).toEqual([]);
  await page.emulateMedia({ media: 'screen' });
  await page.evaluate(() => document.body.classList.remove('printing-multi'));

  await box.getByRole('button', { name: 'Download PDF' }).click();
  await expect(box.locator('#multi-status')).toHaveText('The PDF is downloaded.');
  const printed = await page.context().newPage();
  await printed.route(/^https?:/, (route) => route.abort());
  await printed.emulateMedia({ media: 'print' });
  await printed.setContent(seen.pdf[0], { waitUntil: 'load' });
  await expect(printed.locator('.multi-sec[data-sec="health"] div.area')).toHaveCount(18);
  expect(await printed.evaluate(drift)).toEqual([]);
  if (process.env.MULTI_SHOT) await printed.pdf({ path: process.env.MULTI_SHOT + '/multi-health-print.pdf', preferCSSPageSize: true, printBackground: true });
  await printed.close();
});

test('six sites side by side keep one area tile per row level across columns (#1601)', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  const records = recordsWith(true).concat(['gh78', 'ij90', 'kl12'].map((id, index) => {
    const base = [own, rival, sample.report][index];
    return { id, email: EMAIL, status: 'complete', paid: true, createdAt: '2026-10-21T10:00:00Z', report: Object.assign({}, base, { id }) };
  }));
  ['www.hotelestequendama.com', 'www.movichhotels.com', 'www.ghlhoteles.com', 'www.cgb.edu.co', 'ciedi.edu.co', 'montessori.edu.co']
    .forEach((host, index) => { records[index].report.host = host; });
  records[3].report.insights = Object.assign({}, records[3].report.insights, { summary: 'Two pages timed out while they were read. ' + records[3].report.insights.summary });
  await signIn(page, records, '/qa-review.html?comparison=cmp1', { saved: [], deleted: [], pdf: [] });
  const health = page.locator('#multi-overlay .multi-sec[data-sec="health"] .multi-cell');
  await expect(health).toHaveCount(6, { timeout: 20000 });
  await expect(health.nth(5).locator('.area')).toHaveCount(6);
  expect(await page.evaluate(drift)).toEqual([]);
  const [seo, geo] = await health.first().evaluate((cell) => ['SEO', 'GEO'].map((name) => cell.querySelector('.area[data-area="' + name + '"]').getBoundingClientRect()));
  expect(geo.top).toBeGreaterThanOrEqual(seo.bottom);
  if (process.env.MULTI_SHOT) {
    await page.locator('#multi-overlay .multi-sec[data-sec="health"]').scrollIntoViewIfNeeded();
    await page.screenshot({ path: process.env.MULTI_SHOT + '/multi-health-6.png' });
  }
});

test('"What AI sees" keeps its boxes in one order and lined up in every column, its lists compact, and nothing spills out of a cell at 1024px (#1605)', async ({ page, browser }) => {
  await page.setViewportSize({ width: 1024, height: 900 });
  const seen = { saved: [], deleted: [], pdf: [] };
  const records = recordsWith(true).concat(['gh78', 'ij90', 'kl12'].map((id, index) => {
    const base = [own, rival, sample.report][index];
    return { id, email: EMAIL, status: 'complete', paid: true, createdAt: '2026-10-21T10:00:00Z', report: Object.assign({}, base, { id, host: 'site' + (index + 4) + '.example' }) };
  }));
  await signIn(page, records, '/qa-review.html?comparison=cmp1', seen);
  const box = page.locator('#multi-overlay');
  const sec = box.locator('.multi-sec[data-sec="geo"]');
  await expect(sec.locator('.multi-cell')).toHaveCount(6, { timeout: 20000 });

  if (process.env.MULTI_SHOT) {
    test.setTimeout(180000);
    for (const width of [1024, 1440]) {
      for (const dark of [false, true]) {
        await page.setViewportSize({ width, height: 1000 });
        await page.evaluate((on) => { if (document.documentElement.classList.contains('dark-mode') !== on) SiteTheme.toggle(); }, dark);
        await sec.evaluate((el) => el.scrollIntoView());
        await page.screenshot({ path: process.env.MULTI_SHOT + '/geo-' + width + (dark ? '-dark' : '-light') + '.png' });
        await sec.locator('.multi-cell').first().locator('[data-part="crawlers"]').evaluate((el) => el.scrollIntoView({ block: 'end' }));
        await page.screenshot({ path: process.env.MULTI_SHOT + '/geo-' + width + (dark ? '-dark' : '-light') + '-crawlers.png' });
      }
    }
    await page.evaluate(() => { if (document.documentElement.classList.contains('dark-mode')) SiteTheme.toggle(); });
    await page.setViewportSize({ width: 1024, height: 900 });
  }

  const cells = await sec.locator('.multi-cell').evaluateAll((list) => list.map((cell) => {
    const edge = cell.getBoundingClientRect();
    const parts = [...cell.querySelectorAll('[data-part]')];
    return {
      host: cell.dataset.host,
      parts: parts.map((part) => part.dataset.part),
      tops: parts.map((part) => Math.round(part.getBoundingClientRect().top)),
      spill: [...cell.querySelectorAll('*')].filter((el) => {
        const r = el.getBoundingClientRect();
        return r.width && (r.right > edge.right + 1 || r.left < edge.left - 1);
      }).map((el) => el.className || el.tagName),
      wide: parts.filter((part) => part.scrollWidth > part.clientWidth + 1).map((part) => part.dataset.part),
      chip: Math.max(...[...cell.querySelectorAll('[data-part="crawlers"] .bot')].map((bot) => bot.getBoundingClientRect().height))
    };
  }));
  for (const cell of cells) {
    expect(cell.parts, cell.host).toEqual(['facts', 'excerpt', 'headings', 'crawlers']);
    expect(cell.spill, cell.host).toEqual([]);
    expect(cell.wide, cell.host).toEqual([]);
    expect(cell.chip, cell.host).toBeLessThan(30);
  }
  for (const index of [0, 1, 2, 3]) expect(new Set(cells.map((cell) => cell.tops[index])).size, cells[0].parts[index]).toBe(1);
  expect(await sec.evaluate((el) => el.getBoundingClientRect().height)).toBeLessThan(1700);
  await expect(sec.locator('.multi-cell').nth(2).locator('[data-part="crawlers"] .bot-group').first()).toHaveText(/✓ \d+ ✕ \d+$/);

  await page.evaluate(() => document.body.classList.add('printing-multi'));
  await page.emulateMedia({ media: 'print' });
  const outline = sec.locator('.multi-cell').nth(2).locator('.ai-outline li:visible');
  await expect(outline).toHaveCount(13);
  await expect(outline.last()).toHaveText('…and ' + (sample.report.insights.geo.aiView.outline.length - 12) + ' more, in the report on the page.');
  if (process.env.MULTI_SHOT) {
    await page.setViewportSize({ width: 1047, height: 900 });
    await sec.screenshot({ path: process.env.MULTI_SHOT + '/geo-print.png' });
  }
  await page.emulateMedia({ media: 'screen' });
  await page.evaluate(() => document.body.classList.remove('printing-multi'));
  const download = page.waitForEvent('download');
  await box.getByRole('button', { name: 'Download PDF' }).click();
  await download;
  expect(seen.pdf[0]).toContain('data-part="crawlers"');
  const still = await (await browser.newContext({ javaScriptEnabled: false, viewport: { width: 1047, height: 900 } })).newPage();
  await still.setContent(seen.pdf[0]);
  await still.emulateMedia({ media: 'print' });
  const printed = await still.locator('.multi-sec[data-sec="geo"] .multi-cell').evaluateAll((list) => list.map((cell) => [...cell.querySelectorAll('[data-part]')].map((part) => Math.round(part.getBoundingClientRect().top))));
  expect(printed).toHaveLength(6);
  for (const index of [0, 1, 2, 3]) expect(new Set(printed.map((tops) => tops[index])).size).toBe(1);
});

test('one toggle per section folds it for every site together, the boxes of a row end level, and print and the PDF show every section open (#1459)', async ({ page }) => {
  const seen = { saved: [], deleted: [], pdf: [] };
  await signIn(page, recordsWith(true), '/qa-review.html?comparison=cmp1', seen);
  const box = page.locator('#multi-overlay');
  const health = box.locator('.multi-sec[data-sec="health"]');
  const toggle = health.getByRole('button', { name: 'Health score' });
  await expect(toggle).toHaveAttribute('aria-expanded', 'true', { timeout: 20000 });
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await expect(health.locator('.multi-cell')).toHaveCount(3);
  for (const index of [0, 1, 2]) await expect(health.locator('.multi-cell').nth(index)).toBeHidden();
  await expect(box.locator('.multi-sec[data-sec="exec"] .multi-cell[data-col="0"]')).toBeVisible();
  await toggle.focus();
  await page.keyboard.press('Enter');
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  const edges = (sec, part) => box.locator('.multi-sec[data-sec="' + sec + '"] .multi-cell > ' + part).evaluateAll((els) => els.map((el) => Math.round(el.getBoundingClientRect().bottom)));
  expect(new Set(await edges('exec', '.card')).size).toBe(1);
  expect(new Set(await edges('cases', '.card')).size).toBe(1);
  const empty = box.locator('.multi-sec[data-sec="security"] .multi-cell[data-col="0"]');
  await expect(empty.locator('.multi-empty')).toHaveText('Nothing here for this site.');
  await expect(empty.locator('.card')).toBeHidden();

  await box.getByRole('button', { name: 'Collapse all' }).click();
  await expect(box.locator('.multi-sec .fold-toggle[aria-expanded="true"]')).toHaveCount(0);
  await expect(box.getByRole('button', { name: 'Expand all' })).toHaveAttribute('aria-expanded', 'false');
  await page.evaluate(() => document.body.classList.add('printing-multi'));
  await page.emulateMedia({ media: 'print' });
  expect(await health.locator('.multi-row').evaluate((row) => getComputedStyle(row).display)).toBe('grid');
  await expect(health.locator('.multi-cell[data-col="0"]')).toBeVisible();
  await page.emulateMedia({ media: 'screen' });
  await page.evaluate(() => document.body.classList.remove('printing-multi'));

  const download = page.waitForEvent('download');
  await box.getByRole('button', { name: 'Download PDF' }).click();
  await download;
  expect(seen.pdf[0]).toContain('<h2 translate="no"><span>Health score</span></h2>');
  expect(seen.pdf[0]).not.toMatch(/<div class="multi-row fold-panel"[^>]*\shidden/);
  await box.getByRole('button', { name: 'Expand all' }).click();
  await expect(box.locator('.multi-sec .fold-toggle[aria-expanded="false"]')).toHaveCount(0);
});

test('a cell holding only a placeholder line keeps its own height beside a tall cell (#1477)', async ({ page }) => {
  await signIn(page, recordsWith(true), '/qa-review.html?comparison=cmp1', { saved: [], deleted: [], pdf: [] });
  const box = page.locator('#multi-overlay');
  await expect(box.locator('.multi-sec[data-sec="graph"] .multi-cell')).toHaveCount(3, { timeout: 20000 });
  for (const key of ['graph', 'layers', 'mentions']) {
    const cells = box.locator('.multi-sec[data-sec="' + key + '"] .multi-cell');
    await expect(cells.and(page.locator('[data-col="0"]')), key).toHaveClass(/is-note/);
    const [note, tallest] = await cells.evaluateAll((els) => [els.find((el) => el.dataset.col === '0').lastElementChild.offsetHeight, Math.max(...els.map((el) => el.offsetHeight))]);
    expect(note, key).toBeLessThan(140);
    expect(tallest, key).toBeGreaterThan(note);
  }
  await expect(box.locator('.multi-sec[data-sec="observed"] .multi-cell[data-col="0"]')).not.toHaveClass(/is-note/);
});

test('in print a long list stops after twelve rows with a line counting the rest (#1476)', async ({ page }) => {
  const seen = { saved: [], deleted: [], pdf: [] };
  await signIn(page, recordsWith(true), '/qa-review.html?comparison=cmp1', seen);
  const box = page.locator('#multi-overlay');
  const rows = box.locator('.multi-sec[data-sec="pages"] .multi-cell[data-col="0"]').locator('tbody tr:visible');
  await expect(rows).toHaveCount(own.pages.length, { timeout: 20000 });
  await page.evaluate(() => document.body.classList.add('printing-multi'));
  await page.emulateMedia({ media: 'print' });
  await expect(rows).toHaveCount(13);
  await expect(rows.last()).toHaveText('…and ' + (own.pages.length - 12) + ' more, in the report on the page.');
  await page.emulateMedia({ media: 'screen' });
  await page.evaluate(() => document.body.classList.remove('printing-multi'));
  const download = page.waitForEvent('download');
  await box.getByRole('button', { name: 'Download PDF' }).click();
  await download;
  expect(seen.pdf[0]).toContain('<tr class="print-more">');
});

// One site sends most headers on its start page and drops some on 39 more pages, one sends every header on all
// its pages, and the sample sends none.
function recordsWithHeaders() {
  const tiles = (extra) => ['HTTPS redirect', 'HSTS', 'Content-Security-Policy', 'Frame protection', 'X-Content-Type-Options', 'Referrer-Policy', 'Permissions-Policy',
    'Cross-Origin-Opener-Policy', 'TLS certificate', 'security.txt', 'SPF', 'DMARC', 'CAA', 'Safe Browsing', 'Domain expiry'].concat(extra).map((label, i) => ({ label, state: ['pass', 'risk', 'fail'][i % 3] }));
  const page = (path, on, cookies) => Object.assign({ path, hsts: false, csp: false, frame: false, nosniff: false, referrer: false, permissions: false, cookies: cookies || 0, looseCookies: 0 }, on);
  const all = { hsts: true, csp: true, frame: true, nosniff: true, referrer: true, permissions: true };
  const ownPages = [page('/', { hsts: true, csp: true, frame: true, nosniff: true, referrer: true }, 2)].concat(Array.from({ length: 39 }, (x, i) => page(
    '/blog/2026/10/' + (i + 1) + '/a-rather-long-article-slug-that-wraps-in-a-narrow-column?utm_source=newsletter',
    { hsts: i % 3 !== 0, csp: i % 5 !== 0, frame: true, nosniff: i % 7 !== 0, referrer: i > 2, permissions: i === 4 }, i % 4 === 0 ? 1 : 0)));
  ownPages[6].looseCookies = 1;
  const records = recordsWith(true);
  const security = [
    { headers: tiles(['MTA-STS', 'TLS-RPT', 'Accessibility statement']), tls: { validTo: '2027-01-01', daysLeft: 67, issuer: "Let's Encrypt" }, pages: ownPages },
    { headers: tiles(['Privacy notice']), pages: ['/', '/about', '/pricing'].map((path) => page(path, all)) },
    sample.report.insights.security
  ];
  records.forEach((row, index) => { row.report.insights = Object.assign({}, row.report.insights, { security: security[index] }); });
  return records;
}

test('the security headers line up across sites: one coverage row per header in the same order and at the same height, then only the pages that differ (#1607)', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const seen = { saved: [], deleted: [], pdf: [] };
  await signIn(page, recordsWithHeaders(), '/qa-review.html?comparison=cmp1', seen);
  const sec = page.locator('#multi-overlay .multi-sec[data-sec="security"]');
  const cells = sec.locator('.multi-cell');
  await expect(cells.locator('[data-header]')).toHaveCount(21, { timeout: 20000 });
  const keys = ['hsts', 'csp', 'frame', 'nosniff', 'referrer', 'permissions', 'cookies'];
  const rows = await cells.evaluateAll((list) => list.map((cell) => [...cell.querySelectorAll('[data-header]')].map((row) => [row.dataset.header, Math.round(row.getBoundingClientRect().top), Math.round(row.getBoundingClientRect().height)])));
  for (const column of rows) expect(column.map(([key]) => key)).toEqual(keys);
  keys.forEach((key, i) => {
    const tops = rows.map((column) => column[i][1]);
    expect(Math.max(...tops) - Math.min(...tops), key).toBeLessThanOrEqual(1);
    expect(new Set(rows.map((column) => column[i][2])).size, key).toBe(1);
  });
  const checks = await cells.evaluateAll((list) => list.map((cell) => [...cell.querySelectorAll('[data-check]')].map((row) => [row.dataset.check, Math.round(row.getBoundingClientRect().top)])));
  expect(checks[0].length).toBeGreaterThan(15);
  for (const column of checks) expect(column.map(([key]) => key)).toEqual(checks[0].map(([key]) => key));
  checks[0].forEach(([key], i) => expect(Math.max(...checks.map((column) => column[i][1])) - Math.min(...checks.map((column) => column[i][1])), key).toBeLessThanOrEqual(1));

  const [ownCell, rivalCell, sampleCell] = [0, 1, 2].map((i) => cells.nth(i));
  await expect(ownCell.locator('[data-header="hsts"]')).toHaveText(/HSTS\s*✗ 27 of 40 pages/);
  await expect(ownCell.locator('[data-header="hsts"]')).toHaveClass(/risk/);
  await expect(ownCell.locator('[data-header="frame"]')).toHaveText(/✓ All 40 pages/);
  await expect(ownCell.locator('[data-header="permissions"]')).toHaveText(/✗ 1 of 40 pages/);
  await expect(ownCell.locator('[data-header="cookies"]')).toHaveText(/1 without Secure/);
  await expect(rivalCell.locator('[data-header="hsts"]')).toHaveClass(/pass/);
  await expect(rivalCell.locator('.sec-diff')).toHaveText('Every page analyzed sends the headers the start page sends.');
  await expect(sampleCell.locator('[data-header="hsts"]')).toHaveText(/✗ Not sent/);
  await expect(sampleCell.locator('[data-header="hsts"]')).toHaveClass(/fail/);
  await expect(sampleCell.locator('.sec-diff')).toHaveText('The start page sends none of these headers, so there is nothing to compare page by page.');
});

test('a site with many pages lists only the first pages that differ, with a line counting the rest, on the page, in print and in the PDF (#1607)', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const seen = { saved: [], deleted: [], pdf: [] };
  await signIn(page, recordsWithHeaders(), '/qa-review.html?comparison=cmp1', seen);
  const cells = page.locator('#multi-overlay .multi-sec[data-sec="security"] .multi-cell');
  const diff = cells.first().locator('.sec-diff');
  await expect(diff.locator('li:visible')).toHaveCount(6, { timeout: 20000 });
  await expect(diff.locator('summary')).toHaveText('+17 more');
  expect(await diff.evaluate((el) => el.querySelector('summary').getBoundingClientRect().bottom <= el.getBoundingClientRect().bottom)).toBe(true);
  await expect(diff.locator('li').first()).toHaveAttribute('title', /^\/blog\/2026\/10\/\d+\/a-rather-long/);
  const tallest = await cells.evaluateAll((list) => Math.max(...list.map((cell) => cell.getBoundingClientRect().height)));
  expect(tallest).toBeLessThan(1600);
  await diff.locator('summary').click();
  await expect(diff.locator('li:visible')).toHaveCount(23);
  expect(await diff.locator('.sec-more ol').evaluate((el) => el.scrollHeight > el.clientHeight && el.clientHeight < 300)).toBe(true);
  const spill = await cells.evaluateAll((list) => list.flatMap((cell) => {
    const edge = cell.getBoundingClientRect().right + 1;
    return [...cell.querySelectorAll('*')].filter((el) => el.getClientRects().length && el.getBoundingClientRect().right > edge).map((el) => el.className || el.tagName);
  }));
  expect(spill).toEqual([]);

  await page.evaluate(() => document.body.classList.add('printing-multi'));
  await page.emulateMedia({ media: 'print' });
  await expect(diff.locator('li:visible')).toHaveCount(6);
  await expect(diff.locator('summary')).toBeVisible();
  await page.emulateMedia({ media: 'screen' });
  await page.evaluate(() => document.body.classList.remove('printing-multi'));
  const download = page.waitForEvent('download');
  await page.locator('#multi-overlay').getByRole('button', { name: 'Download PDF' }).click();
  await download;
  expect(seen.pdf[0]).toContain('data-header="hsts"');
});

test('the benchmark ranks every site by its health score and reads where the first site stands, on the page and in the PDF (#1438)', async ({ page }) => {
  const seen = { saved: [], deleted: [], pdf: [] };
  await signIn(page, recordsWith(true), '/qa-review.html?comparison=cmp1', seen);
  const bench = page.locator('#multi-overlay .bench');
  await expect(bench).toBeVisible({ timeout: 20000 });
  const scores = [own, rival, sample.report].map((report) => report.insights.score.overall);
  const order = scores.map((score, index) => ({ score, index })).sort((a, b) => b.score - a.score);
  const cards = bench.locator('.bench-card');
  await expect(cards).toHaveCount(3);
  for (const [place, item] of order.entries()) {
    await expect(cards.nth(place).locator('.bench-host')).toHaveText(hosts[item.index].replace(/^www\./, ''));
    await expect(cards.nth(place).locator('.bench-ring')).toHaveAttribute('aria-label', new RegExp(String(item.score)));
  }
  await expect(bench.locator('.bench-card.is-you .bench-tag')).toHaveText('Your site');
  await expect(bench.locator('.bench-headline')).toContainText('on the health score');
  await expect(bench.locator('.bench-box')).toHaveCount(3);
  await expect(bench.locator('.bench-radar .bench-shape')).toHaveCount(3);
  await expect(bench.locator('.bench-radar .bench-shape.is-you')).toHaveCount(1);
  await expect(bench.locator('.bench-heat thead th')).toHaveCount(6);
  expect(await bench.locator('.bench-kpi').count()).toBeGreaterThan(2);
  await expect(bench.locator('.bench-kpi').first().locator('.bench-bar')).toHaveCount(3);

  const download = page.waitForEvent('download');
  await page.locator('#multi-overlay').getByRole('button', { name: 'Download PDF' }).click();
  await download;
  expect(seen.pdf[0]).toContain('bench-podium');
  expect(seen.pdf[0]).toContain('bench-radar');
});

test('every list of sites after the ranking keeps its order, and every column lists the areas as the table does (#1603)', async ({ page }) => {
  await signIn(page, recordsWith(true), '/qa-review.html?comparison=cmp1', { saved: [], deleted: [], pdf: [] });
  const box = page.locator('#multi-overlay');
  await expect(box.locator('.multi-sec[data-sec="health"] .ring')).toHaveCount(3, { timeout: 20000 });
  const scores = [own, rival, sample.report].map((report) => report.insights.score.overall);
  const ranked = scores.map((score, index) => ({ score, index })).sort((a, b) => b.score - a.score);
  expect(ranked.map((item) => item.index)).not.toEqual([0, 1, 2]);
  const bare = ranked.map((item) => hosts[item.index].replace(/^www\./, ''));
  const full = ranked.map((item) => hosts[item.index]);
  const texts = (selector) => box.locator(selector).evaluateAll((els) => els.map((el) => el.textContent.trim()));

  expect(await texts('.bench-card .bench-host')).toEqual(bare);
  expect(await texts('.bench-legend > span')).toEqual(bare);
  expect(await texts('.bench-heat thead th[style]')).toEqual(bare);
  expect(await texts('.bench-kpi:first-of-type .bench-bar > span:first-child')).toEqual(bare);
  expect(await texts('.multi-table thead th[translate="no"]')).toEqual(full);
  expect(await texts('.multi-table tbody tr:first-child td')).toEqual(ranked.map((item) => String(item.score)));
  expect(await texts('.multi-hosts .multi-host')).toEqual(full);
  for (const sec of await box.locator('.multi-sec').all()) {
    expect(await sec.locator('.multi-cell').evaluateAll((els) => els.map((el) => el.dataset.host))).toEqual(full);
  }
  const rings = await box.locator('.multi-sec[data-sec="health"] .ring').evaluateAll((els) => els.map((el) => Number(el.getAttribute('aria-label').match(/\d+/)[0])));
  expect(rings).toEqual(ranked.map((item) => item.score));
  await expect(box.locator('.multi-hosts .multi-cell').last()).toHaveAttribute('style', /--site:var\(--own\)/);
  await expect(box.locator('.bench-heat tbody td.is-you').first()).toHaveText(String(own.insights.score.overall));

  const areaRows = await texts('.multi-table tbody th[scope="row"]');
  const areaOrder = ['SEO', 'GEO', 'Analytics', 'Security', 'Accessibility', 'Performance'];
  expect(areaRows.filter((row) => areaOrder.includes(row))).toEqual(areaOrder);
  for (const cell of await box.locator('.multi-sec[data-sec="health"] .multi-cell').all()) {
    expect(await cell.locator('.area').evaluateAll((els) => els.map((el) => el.dataset.area))).toEqual(areaOrder);
  }
});

test('a long host in the health score summary wraps inside its card instead of running past it (#1608)', async ({ page }) => {
  const records = recordsWith(true);
  const long = 'www.hotelestequendamabogotacolombia.com.co';
  records[0].report.insights = Object.assign({}, records[0].report.insights, { summary: long + ' scores 34 out of 100 (F). 17 checks fail now, 42 are at risk, and 26 pass. Fix first: 2021 form controls have no label.' });
  await page.setViewportSize({ width: 1024, height: 800 });
  await signIn(page, records, '/qa-review.html?comparison=cmp1', { saved: [], deleted: [], pdf: [] });
  const card = page.locator('#multi-overlay .multi-sec[data-sec="health"] .multi-cell[data-col="0"] .card');
  const line = card.locator('.health-summary');
  await expect(line).toContainText(long, { timeout: 20000 });
  const [lineBox, cardBox] = await Promise.all([line.boundingBox(), card.boundingBox()]);
  expect(lineBox.x + lineBox.width).toBeLessThanOrEqual(cardBox.x + cardBox.width);
  expect(await line.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
});

test('the benchmark speaks the language of the review page (#1438)', async ({ page }) => {
  const seen = { saved: [], deleted: [], pdf: [] };
  await signIn(page, recordsWith(true), '/qa-review-es.html?comparison=cmp1', seen);
  const bench = page.locator('#multi-overlay .bench');
  await expect(bench).toBeVisible({ timeout: 20000 });
  await expect(bench.locator('.bench-top > h3')).toHaveText('Clasificación por puntuación de salud');
  await expect(bench.locator('.bench-card.is-you .bench-tag')).toHaveText('Tu sitio');
  await expect(bench.locator('.bench-why > h3')).toHaveText('Qué significa para ti');
  await expect(bench.locator('.bench-headline')).toContainText('en puntuación de salud');
  await expect(bench.locator('.bench-kpis > h3')).toHaveText('Velocidad, peso y otros indicadores');
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
  const records = recordsWith(true);
  const report = records[0].report;
  const msgs = {
    'seo-description-missing': { title: { id: 'seo-description-missing.title', vars: { n: 6 } }, fix: { id: 'seo-description-missing.fix', vars: {} } },
    'sec-cookies': { title: { id: 'sec-cookies.insecure', vars: { n: 1 } }, fix: { id: 'sec-cookies.fix', vars: {} } },
    'an-consent': { title: { id: 'an-consent.title', vars: {} }, fix: { id: 'an-consent.fix', vars: {} } },
    'a11y-h1': { title: { id: 'a11y-h1.title', vars: { n: 3 } }, fix: { id: 'a11y-h1.fix', vars: {} } },
    'pf-cache': { title: { id: 'pf-cache.title', vars: {} }, fix: { id: 'pf-cache.fix', vars: {} } },
    'a11y-alt': { title: { id: 'a11y-alt.title', vars: { n: 100 } } }
  };
  records[0].report = Object.assign({}, report, { insights: Object.assign({}, report.insights, {
    summary: 'The start page is larger than 2 MB, so the review analyzed its first 2 MB. ' + report.insights.summary,
    findings: report.insights.findings.map((item) => msgs[item.key] ? Object.assign({}, item, { msg: msgs[item.key] }) : item)
  }) });
  await signIn(page, records, '/qa-review-es.html?comparison=cmp1', seen);
  const box = page.locator('#multi-overlay');
  await expect(box).toBeVisible({ timeout: 20000 });
  await expect(box.locator('.report-kicker').first()).toHaveText('Informe comparativo');
  await expect(box.locator('.multi-sec[data-sec="exec"] h2')).toHaveText('Resumen en una página');
  await expect(box.getByRole('button', { name: 'Descargar PDF' })).toBeVisible();
  const chip = box.locator('.multi-sec[data-sec="health"] .area[data-area="Security"]').first();
  await expect(chip).toContainText('Seguridad');
  await expect(chip.locator('small')).toContainText(/^Fallan: \d+ · En riesgo: \d+ · Pasan: \d+ — Encabezados, TLS/);
  await expect(box.locator('.multi-sec[data-sec="health"] .vchip.v-fail').first()).toContainText('Falla ahora');
  const health = box.locator('.multi-sec[data-sec="health"] .multi-cell[data-col="0"]');
  await expect(health.locator('.ring')).toHaveAttribute('aria-label', /^Puntuación de salud \d+ de 100, nota [A-F]$/);
  await expect(health.locator('.ring small')).toHaveText(/^Nota [A-F]$/);
  await expect(health.locator('.health-summary')).toContainText(/obtiene \d+ de 100 \([A-F]\)\. \d+ controles fallan ahora/);
  await expect(health.locator('.health-summary')).not.toContainText('scores');
  await expect(health.locator('.health-summary')).toContainText(/^La página de inicio pesa más de 2 MB, así que la revisión analizó sus primeros 2 MB\. wordpress\.org obtiene/);
  await expect(health.locator('.health-summary')).toContainText(/pasan\. Arregla primero: 100 imágenes no tienen atributo alt\.$/);
  await expect(health.locator('.vchip.s-critical, .vchip.s-low').first()).toContainText(/crítico|bajo/);
  await expect(health.locator('.meta-line')).toContainText('Los controles marcados con «Necesita una persona»');
  const exec = box.locator('.multi-sec[data-sec="exec"] .multi-cell[data-col="0"]');
  await expect(exec.locator('h3')).toHaveText(['Mayores riesgos', 'Mejoras rápidas', 'Ya sólido']);
  await expect(exec.locator('.meta-line').first()).toContainText(/\d+ críticos · \d+ altos · \d+ medios · \d+ bajos · \d+ páginas? analizadas?/);
  const cells = box.locator('.multi-sec[data-sec="browser"] .multi-cell');
  await expect(cells.and(page.locator('[data-col="0"]'))).toContainText('Esta revisión se hizo sin el navegador sin interfaz');
  const browser = cells.and(page.locator('[data-col="2"]'));
  await expect(browser.locator('.check-tile b').first()).toHaveText('Antes de elegir');
  await expect(browser).toContainText('Seguimiento antes y después de elegir');
  await expect(browser).toContainText(/desde una dirección de la UE \(Bélgica\)/);
  await expect(browser).not.toContainText(/Before a choice|Tracking before and after|from an EU address/);
  const filters = box.locator('.multi-sec[data-sec="findings"] .multi-cell[data-col="0"]').locator('.filters button');
  await expect(filters.first()).toHaveText('Todas');
  await expect(filters.filter({ hasText: 'Fallas y riesgos' })).toHaveCount(1);
  await expect(filters.filter({ hasText: 'Seguridad' })).toHaveCount(1);
  const findings = box.locator('.multi-sec[data-sec="findings"] .multi-cell[data-col="0"]');
  await expect(findings).toContainText('6 páginas no tienen meta description');
  await expect(findings).toContainText('Escribe para cada página una descripción de 50 a 160 caracteres');
  await expect(findings).not.toContainText('6 pages have no meta description');
  await expect(findings).toContainText('12 indexable pages are missing from the sitemap');
  await expect(findings).toContainText('1 cookie se envía sin Secure');
  await expect(findings).toContainText('Pon Secure en todas las cookies');
  await expect(findings).not.toContainText('1 cookie is sent without Secure');
  await expect(findings).toContainText('Las etiquetas de seguimiento cargan sin una herramienta de consentimiento en la página');
  await expect(findings).toContainText('Agrega una plataforma de consentimiento');
  await expect(findings).not.toContainText('Tracking tags load with no consent tool in the page');
  await expect(findings).toContainText('3 páginas no tienen exactamente un h1');
  await expect(findings).toContainText('Dale a cada página un h1 que la nombre.');
  await expect(findings).not.toContainText('3 pages do not have exactly one h1');
  await expect(findings).toContainText('La página de inicio no envía cache-control');
  await expect(findings).toContainText('Envía cache-control en el HTML (por ejemplo max-age=0, must-revalidate)');
  await expect(findings).not.toContainText('The start page sends no cache-control');
  const geo = box.locator('.multi-sec[data-sec="geo"] .multi-cell[data-col="0"]');
  await expect(geo).toContainText('El texto que recibe un rastreador de IA');
  await expect(geo).not.toContainText(/The text an AI crawler|Who may read/);
  await expect(box.locator('.multi-sec[data-sec="seo"] .multi-cell[data-col="0"]').locator('.stat span').first()).toHaveText('Páginas indexables');
  await expect(box.locator('.multi-sec[data-sec="fixkit"] .multi-cell[data-col="0"]')).toContainText('El ZIP de scripts ahora trae una carpeta fix-kit/');
  await expect(box.locator('.multi-sec[data-sec="fixkit"] .multi-cell[data-col="0"]')).not.toContainText(/Security headers|The scripts ZIP/);
});

test('a long host in the one-page summary wraps inside its card instead of running past it', async ({ page }) => {
  const seen = { saved: [], deleted: [], pdf: [] };
  const records = recordsWith(true);
  const long = 'www.hotelestequendamabogotacolombia.com.co';
  records[0].report.insights = Object.assign({}, records[0].report.insights, { summary: long + ' scores 34 out of 100 (F). 6 checks fail now, 42 are at risk, and 26 pass.' });
  await page.setViewportSize({ width: 1024, height: 800 });
  await signIn(page, records, '/qa-review.html?comparison=cmp1', seen);
  const card = page.locator('#multi-overlay .multi-sec[data-sec="exec"] .multi-cell').first().locator('[data-slot="exec"]');
  const line = card.locator('.exec-head p');
  await expect(line).toContainText(long, { timeout: 20000 });
  const [lineBox, cardBox] = await Promise.all([line.boundingBox(), card.boundingBox()]);
  expect(lineBox.x + lineBox.width).toBeLessThanOrEqual(cardBox.x + cardBox.width);
  expect(await line.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
});

test('a comparison the account no longer has is refused in the page language', async ({ page }) => {
  const seen = { saved: [], deleted: [], pdf: [] };
  await signIn(page, recordsWith(true), '/qa-review-es.html?comparison=gone', seen);
  await expect(page.locator('#multi-overlay')).toContainText('Esa comparación no está guardada en esta cuenta.', { timeout: 20000 });
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
  await expect(panel).toContainText('next to up to five others');
  await panel.locator('#cmp-picks input').first().check();
  await expect(panel.locator('#cmp-count')).toHaveText('(1 of 5)');
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
  await expect(box.locator('#multi-title')).toHaveAttribute('aria-label', own.host + ' vs ' + rival.host, { timeout: 20000 });
  await expect(box.locator('.multi-sec[data-sec="exec"] .multi-cell')).toHaveCount(2);
});
