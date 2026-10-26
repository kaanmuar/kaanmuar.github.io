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
  const pages = box.locator('.multi-sec[data-sec="pages"] .multi-cell').nth(0).locator('tbody tr:visible');
  await expect(pages).toHaveCount(own.pages.length);
  expect(own.counts).toBeUndefined();
  await expect(box.locator('.multi-sec[data-sec="cover"] .multi-cell').nth(0).locator('.kpi b').nth(3)).toHaveText(String(own.pages.length));
  await expect(box.locator('.multi-cell .fade-line')).toHaveCount(0);
  await expect(box.locator('#multi-locked')).toBeHidden();

  const filters = box.locator('.multi-sec[data-sec="findings"] .multi-cell').nth(0);
  await filters.locator('[data-verdict="pass"]').click();
  await expect(filters.locator('[data-verdict="pass"]')).toHaveClass('on');
  await expect(box.locator('.multi-sec[data-sec="findings"] .multi-cell').nth(1).locator('[data-verdict="open"]')).toHaveClass('on');

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
  await expect(printed.locator('.multi-sec[data-sec="exec"] .multi-cell').first()).toBeVisible();
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
  await expect(box.locator('.multi-sec[data-sec="exec"] .multi-cell').first()).toBeVisible();
  await toggle.focus();
  await page.keyboard.press('Enter');
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  const edges = (sec, part) => box.locator('.multi-sec[data-sec="' + sec + '"] .multi-cell > ' + part).evaluateAll((els) => els.map((el) => Math.round(el.getBoundingClientRect().bottom)));
  expect(new Set(await edges('exec', '.card')).size).toBe(1);
  expect(new Set(await edges('cases', '.card')).size).toBe(1);
  const empty = box.locator('.multi-sec[data-sec="security"] .multi-cell').first();
  await expect(empty.locator('.multi-empty')).toHaveText('Nothing here for this site.');
  await expect(empty.locator('.card')).toBeHidden();

  await box.getByRole('button', { name: 'Collapse all' }).click();
  await expect(box.locator('.multi-sec .fold-toggle[aria-expanded="true"]')).toHaveCount(0);
  await expect(box.getByRole('button', { name: 'Expand all' })).toHaveAttribute('aria-expanded', 'false');
  await page.evaluate(() => document.body.classList.add('printing-multi'));
  await page.emulateMedia({ media: 'print' });
  expect(await health.locator('.multi-row').evaluate((row) => getComputedStyle(row).display)).toBe('grid');
  await expect(health.locator('.multi-cell').first()).toBeVisible();
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
    await expect(cells.first(), key).toHaveClass(/is-note/);
    const [note, tallest] = await cells.evaluateAll((els) => [els[0].lastElementChild.offsetHeight, Math.max(...els.map((el) => el.offsetHeight))]);
    expect(note, key).toBeLessThan(140);
    expect(tallest, key).toBeGreaterThan(note);
  }
  await expect(box.locator('.multi-sec[data-sec="observed"] .multi-cell').first()).not.toHaveClass(/is-note/);
});

test('in print a long list stops after twelve rows with a line counting the rest (#1476)', async ({ page }) => {
  const seen = { saved: [], deleted: [], pdf: [] };
  await signIn(page, recordsWith(true), '/qa-review.html?comparison=cmp1', seen);
  const box = page.locator('#multi-overlay');
  const rows = box.locator('.multi-sec[data-sec="pages"] .multi-cell').nth(0).locator('tbody tr:visible');
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

// A large site whose run found 40 pages that cannot be indexed, beside sites with none or one.
function manyUnindexable() {
  const records = recordsWith(true).concat(['gh78', 'ij90', 'kl12'].map((id, index) => {
    const base = [own, rival, sample.report][index];
    return { id, email: EMAIL, status: 'complete', paid: true, createdAt: '2026-10-21T10:00:00Z', report: Object.assign({}, base, { id, host: 'site' + (index + 4) + '.example' }) };
  }));
  const reasons = (i) => (i < 30 ? 'Canonical points to /landing/a-very-long-canonical-target-for-campaign-' + i : i < 36 ? 'Status 404' : i < 38 ? 'noindex' : 'Status 500');
  const blocked = Array.from({ length: 40 }, (_, i) => ({ path: '/category/a-long-section-name/subsection/article-with-a-long-slug-' + i + '?utm_source=newsletter', status: reasons(i).startsWith('Status') ? Number(reasons(i).slice(7)) : 200, indexable: false, reason: reasons(i) }));
  const open = Array.from({ length: 10 }, (_, i) => ({ path: '/ok-' + i, status: 200, indexable: true, reason: 'Indexable' }));
  const list = Array.from({ length: 14 }, (_, i) => '/sitemap-only/a-long-path-name-' + i);
  records[0].report = Object.assign({}, records[0].report, { insights: Object.assign({}, records[0].report.insights, { seo: {
    indexable: 10, indexability: blocked.concat(open), duplicates: { titles: [] }, schemaTypes: ['Organization', 'WebSite', 'BreadcrumbList', 'Article', 'Person', 'ImageObject'],
    sitemap: { found: true, count: 120, notListed: list, listedNotIndexable: list, notLinked: list }
  } }) });
  return records;
}

test('Search visibility sums the pages that cannot be indexed by reason and shows the first five, so a large site stays short beside the others (#1606)', async ({ page, browser }) => {
  if (process.env.SEO_SHOT) test.setTimeout(180000);
  const seen = { saved: [], deleted: [], pdf: [] };
  await page.setViewportSize({ width: 1024, height: 900 });
  await signIn(page, manyUnindexable(), '/qa-review.html?comparison=cmp1', seen);
  const box = page.locator('#multi-overlay');
  const cells = box.locator('.multi-sec[data-sec="seo"] .multi-cell');
  await expect(cells).toHaveCount(6, { timeout: 20000 });
  if (process.env.SEO_SHOT) {
    for (const [width, dark] of [[1024, false], [1024, true], [1440, false], [1440, true]]) {
      await page.setViewportSize({ width, height: 900 });
      await page.evaluate((on) => { if (document.documentElement.classList.contains('dark-mode') !== on) document.getElementById('theme-toggle').click(); }, dark);
      await page.waitForTimeout(400);
      await box.locator('.multi-sec[data-sec="seo"]').evaluate((sec) => sec.scrollIntoView());
      await page.screenshot({ path: process.env.SEO_SHOT + '/seo-' + width + (dark ? '-dark' : '') + '.png' });
    }
    await page.evaluate(() => document.getElementById('theme-toggle').click());
    await page.setViewportSize({ width: 1047, height: 900 });
    await page.evaluate(() => document.body.classList.add('printing-multi'));
    await page.emulateMedia({ media: 'print' });
    await box.locator('.multi-sec[data-sec="seo"]').screenshot({ path: process.env.SEO_SHOT + '/seo-print.png' });
    await page.emulateMedia({ media: 'screen' });
    await page.evaluate(() => document.body.classList.remove('printing-multi'));
    await page.setViewportSize({ width: 1024, height: 900 });
  }
  const big = cells.nth(0);
  await expect(big.locator('[data-part]')).toHaveCount(3);
  expect(await big.locator('[data-part]').evaluateAll((els) => els.map((el) => el.dataset.part))).toEqual(['stats', 'unindexable', 'notes']);
  await expect(big.locator('.multi-seo-reasons li')).toHaveText(['Canonical to another page 30', 'Status 404 6', 'noindex 2', 'Status 500 2']);
  await expect(big.locator('.multi-seo-pages li')).toHaveCount(5);
  await expect(big.locator('.multi-seo-pages li [title]').first()).toHaveAttribute('title', /^\/category\/a-long-section-name\/subsection\/article-with-a-long-slug-0\?utm_source=newsletter$/);
  await expect(big.locator('.multi-seo-more')).toHaveText('…and 35 more, in the report on the page.');
  await expect(cells.nth(5).locator('.multi-seo-reasons li')).toHaveText(['Canonical to another page 1']);
  await expect(cells.nth(5).locator('.multi-seo-more')).toHaveCount(0);
  await expect(cells.nth(1).locator('[data-part="unindexable"] .multi-seo-reasons')).toHaveCount(0);

  const measure = () => cells.evaluateAll((list) => list.map((cell) => {
    const edge = cell.getBoundingClientRect();
    const spill = [...cell.querySelectorAll('*')].filter((el) => el.getClientRects().length && (el.getBoundingClientRect().right > edge.right + 0.5 || el.scrollWidth > el.clientWidth + 1 && getComputedStyle(el).overflowX === 'visible'));
    return { height: Math.round(edge.height), spill: spill.map((el) => el.tagName + '.' + el.className).slice(0, 3) };
  }));
  const shown = await measure();
  expect(shown[0].height).toBeLessThan(900);
  shown.forEach((cell) => expect(cell.spill).toEqual([]));

  await page.evaluate(() => document.body.classList.add('printing-multi'));
  await page.emulateMedia({ media: 'print' });
  await expect(big.locator('.multi-seo-pages li')).toHaveCount(5);
  await expect(big.locator('.multi-seo-more')).toBeVisible();
  (await measure()).forEach((cell) => expect(cell.spill).toEqual([]));
  await page.emulateMedia({ media: 'screen' });
  await page.evaluate(() => document.body.classList.remove('printing-multi'));

  await box.getByRole('button', { name: 'Download PDF' }).click();
  await expect(box.locator('#multi-status')).toHaveText('The PDF is downloaded.');
  const off = await browser.newContext({ javaScriptEnabled: false });
  const printed = await off.newPage();
  await printed.route(/^https?:/, (route) => route.abort());
  await printed.emulateMedia({ media: 'print' });
  await printed.setContent(seen.pdf[0], { waitUntil: 'load' });
  const copy = printed.locator('.multi-sec[data-sec="seo"] .multi-cell').first();
  await expect(copy.locator('.multi-seo-reasons li')).toHaveCount(4);
  await expect(copy.locator('.multi-seo-pages li')).toHaveCount(5);
  await expect(copy.locator('.multi-seo-more')).toBeVisible();
  await off.close();
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
  const health = box.locator('.multi-sec[data-sec="health"] .multi-cell').first();
  await expect(health.locator('.ring')).toHaveAttribute('aria-label', /^Puntuación de salud \d+ de 100, nota [A-F]$/);
  await expect(health.locator('.ring small')).toHaveText(/^Nota [A-F]$/);
  await expect(health.locator('.health-summary')).toContainText(/obtiene \d+ de 100 \([A-F]\)\. \d+ controles fallan ahora/);
  await expect(health.locator('.health-summary')).not.toContainText('scores');
  await expect(health.locator('.health-summary')).toContainText(/^La página de inicio pesa más de 2 MB, así que la revisión analizó sus primeros 2 MB\. wordpress\.org obtiene/);
  await expect(health.locator('.health-summary')).toContainText(/pasan\. Arregla primero: 100 imágenes no tienen atributo alt\.$/);
  await expect(health.locator('.vchip.s-critical, .vchip.s-low').first()).toContainText(/crítico|bajo/);
  await expect(health.locator('.meta-line')).toContainText('Los controles marcados con «Necesita una persona»');
  const exec = box.locator('.multi-sec[data-sec="exec"] .multi-cell').first();
  await expect(exec.locator('h3')).toHaveText(['Mayores riesgos', 'Mejoras rápidas', 'Ya sólido']);
  await expect(exec.locator('.meta-line').first()).toContainText(/\d+ críticos · \d+ altos · \d+ medios · \d+ bajos · \d+ páginas? analizadas?/);
  const cells = box.locator('.multi-sec[data-sec="browser"] .multi-cell');
  await expect(cells.first()).toContainText('Esta revisión se hizo sin el navegador sin interfaz');
  const browser = cells.nth(2);
  await expect(browser.locator('.check-tile b').first()).toHaveText('Antes de elegir');
  await expect(browser).toContainText('Seguimiento antes y después de elegir');
  await expect(browser).toContainText(/desde una dirección de la UE \(Bélgica\)/);
  await expect(browser).not.toContainText(/Before a choice|Tracking before and after|from an EU address/);
  const filters = box.locator('.multi-sec[data-sec="findings"] .multi-cell').first().locator('.filters button');
  await expect(filters.first()).toHaveText('Todas');
  await expect(filters.filter({ hasText: 'Fallas y riesgos' })).toHaveCount(1);
  await expect(filters.filter({ hasText: 'Seguridad' })).toHaveCount(1);
  const findings = box.locator('.multi-sec[data-sec="findings"] .multi-cell').first();
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
  const geo = box.locator('.multi-sec[data-sec="geo"] .multi-cell').first();
  await expect(geo).toContainText('El texto que recibe un rastreador de IA');
  await expect(geo).not.toContainText(/The text an AI crawler|Who may read/);
  await expect(box.locator('.multi-sec[data-sec="seo"] .multi-cell').first().locator('.stat span').first()).toHaveText('Páginas indexables');
  await expect(box.locator('.multi-sec[data-sec="fixkit"] .multi-cell').first()).toContainText('El ZIP de scripts ahora trae una carpeta fix-kit/');
  await expect(box.locator('.multi-sec[data-sec="fixkit"] .multi-cell').first()).not.toContainText(/Security headers|The scripts ZIP/);
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
