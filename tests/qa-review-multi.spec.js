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

  const filters = box.locator('.multi-sec[data-sec="findings"] .multi-filters');
  await filters.locator('[data-verdict="pass"]').click();
  await expect(filters.locator('[data-verdict="pass"]')).toHaveClass('on');
  await expect(filters.locator('[data-verdict="open"]')).not.toHaveClass('on');
  for (const toggle of await box.locator('.multi-sec[data-sec="findings"] .multi-cell').first().locator('.group-toggle').all()) await toggle.click();
  for (const index of [0, 1, 2]) await expect(box.locator('.multi-sec[data-sec="findings"] .multi-cell').nth(index).locator('.finding[data-verdict="pass"]:visible').first()).toBeVisible();

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
  expect(await third.locator('small').innerHTML()).toBe('carlos<span class="multi-host-end">andmunoz.com</span>');
  await expect(third.locator('img.multi-logo')).toBeVisible();
  const boxes = await Promise.all([first, second, third].map((site) => site.locator('.multi-mark').boundingBox()));
  expect(new Set(boxes.map((box) => Math.round(box.y))).size).toBe(1);
  const nameBox = await third.locator('.multi-site-name').boundingBox();
  expect(nameBox.y).toBeGreaterThan(boxes[2].y + boxes[2].height - 1);

  // The side-by-side table heads each column with the logo and name, not the address, so the column stays narrow (#1596).
  const heads = page.locator('#multi-overlay .multi-table thead th:not(:first-child)');
  // The columns follow the podium (#1603), so each head is found by its site.
  const headOf = (host) => page.locator('#multi-overlay .multi-table thead th[title="' + host + '"]');
  await expect(heads).toHaveCount(3);
  await expect(headOf('wordpress.org').locator('.multi-col-name')).toHaveText('wordpress');
  await expect(headOf('excalidraw.com').locator('.multi-col-name')).toHaveText('excalidraw');
  await expect(headOf('carlosandmunoz.com').locator('.multi-col-name')).toHaveText('Carlos A. Muñoz');
  await expect(headOf('wordpress.org').locator('img.multi-logo')).toBeVisible();
  await expect(headOf('excalidraw.com').locator('img')).toHaveCount(0);
  await expect(headOf('excalidraw.com').locator('.multi-col-mark > span')).toHaveText('E');
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

test('with six sites each analyzed page is one short row: the path on one line, the title on two at most, and the intro stays in its card (#1614)', async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 900 });
  const records = recordsWith(true).concat(['gh78', 'ij90', 'kl12'].map((id, index) => {
    const base = [own, rival, sample.report][index];
    return { id, email: EMAIL, status: 'complete', paid: true, createdAt: '2026-10-21T10:00:00Z', report: Object.assign({}, base, { id }) };
  }));
  const pages = own.pages.map((row, index) => Object.assign({}, row, index ? {} : {
    path: '/convenios-empresariales-y-tarifas-corporativas.html',
    title: 'Tequendama Hoteles | Hoteles en Colombia | Web Oficial | Convenios empresariales y tarifas corporativas',
    status: 301,
    ms: 2400
  }));
  ['www.hotelestequendama.com.co', 'www.movichhotels.com', 'www.ghlhoteles.com', 'www.cgb.edu.co', 'ciedi.edu.co', 'montessori.edu.co'].forEach((host, index) => {
    Object.assign(records[index].report, { host, pages, limits: { maxPages: 100, maxDepth: 5, pagesRead: pages.length, pagesFound: 142 } });
  });
  await signIn(page, records, '/qa-review.html?comparison=cmp1', { saved: [], deleted: [], pdf: [] });
  const cells = page.locator('#multi-overlay .multi-sec[data-sec="pages"] .multi-cell');
  await expect(cells).toHaveCount(6, { timeout: 20000 });
  const seen = await cells.evaluateAll((list) => list.map((cell) => {
    const card = cell.querySelector('.card').getBoundingClientRect();
    const intro = cell.querySelector('[data-slot="pages-found"]');
    const row = cell.querySelector('tbody tr');
    const [path, status, ms, title] = row.cells;
    const line = (el) => parseFloat(getComputedStyle(el).lineHeight);
    return {
      host: cell.dataset.host,
      introOver: intro.scrollWidth - intro.clientWidth,
      introRight: intro.getBoundingClientRect().right - card.right,
      row: row.getBoundingClientRect().height,
      pathLines: Math.round(path.getBoundingClientRect().height / line(path)),
      pathTip: path.title,
      titleLines: Math.round(title.getBoundingClientRect().height / line(title)),
      status: status.className,
      ms: ms.className
    };
  }));
  for (const col of seen) {
    expect(col.introOver, col.host).toBeLessThanOrEqual(0);
    expect(col.introRight, col.host).toBeLessThanOrEqual(0);
    expect(col.pathLines, col.host).toBe(1);
    expect(col.pathTip, col.host).toBe(pages[0].path);
    expect(col.titleLines, col.host).toBeLessThanOrEqual(2);
    expect(col.row, col.host).toBeLessThan(60);
    expect(col.status, col.host).toContain('is-warn');
    expect(col.ms, col.host).toContain('is-slow');
  }
  const heights = await cells.evaluateAll((list) => list.map((cell) => [...cell.querySelectorAll('tbody tr')].map((row) => Math.round(row.getBoundingClientRect().height)).join()));
  expect(new Set(heights).size).toBe(1);
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
  const big = cells.and(page.locator('[data-col="0"]'));
  await expect(big.locator('[data-part]')).toHaveCount(3);
  expect(await big.locator('[data-part]').evaluateAll((els) => els.map((el) => el.dataset.part))).toEqual(['stats', 'unindexable', 'notes']);
  await expect(big.locator('.multi-seo-reasons li')).toHaveText(['Canonical to another page 30', 'Status 404 6', 'noindex 2', 'Status 500 2']);
  await expect(big.locator('.multi-seo-pages li')).toHaveCount(5);
  await expect(big.locator('.multi-seo-pages li [title]').first()).toHaveAttribute('title', /^\/category\/a-long-section-name\/subsection\/article-with-a-long-slug-0\?utm_source=newsletter$/);
  await expect(big.locator('.multi-seo-more')).toHaveText('…and 35 more, in the report on the page.');
  await expect(cells.and(page.locator('[data-col="5"]')).locator('.multi-seo-reasons li')).toHaveText(['Canonical to another page 1']);
  await expect(cells.and(page.locator('[data-col="5"]')).locator('.multi-seo-more')).toHaveCount(0);
  await expect(cells.and(page.locator('[data-col="1"]')).locator('[data-part="unindexable"] .multi-seo-reasons')).toHaveCount(0);

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
  const copy = printed.locator('.multi-sec[data-sec="seo"] .multi-cell[data-col="0"]');
  await expect(copy.locator('.multi-seo-reasons li')).toHaveCount(4);
  await expect(copy.locator('.multi-seo-pages li')).toHaveCount(5);
  await expect(copy.locator('.multi-seo-more')).toBeVisible();
  await off.close();
});

// A browser pass with many trackers, long cookie domains, and axe rules on five long paths.
function busyBrowser() {
  const b = JSON.parse(JSON.stringify(sample.report.browser));
  const tools = ['Google Tag Manager', 'Google Analytics 4', 'Meta Pixel', 'Hotjar', 'LinkedIn Insight Tag', 'TikTok Pixel', 'Microsoft Clarity', 'Google Ads Conversion Tracking', 'Bing Universal Event Tracking'];
  const cookies = (n) => Array.from({ length: n }, (_, i) => ({ name: '_ga_LONGCOOKIENAME' + i, domain: '.analytics-collector-' + i + '.very-long-third-party-domain.example.com', third: true }));
  b.consent = {
    banner: 'OneTrust', rejectLabel: 'Rechazar todas las cookies opcionales', rejected: true,
    before: { vendors: tools.map((name, i) => ({ name, loads: 1, hits: 3 + i, denied: i % 2, signals: [] })), cookies: cookies(9), cookieCount: 9 },
    after: { vendors: tools.slice(0, 5).map((name, i) => ({ name, loads: 1, hits: i, denied: 2, signals: [] })), cookies: cookies(4), kept: 4 }
  };
  const watch = { fingerprint: { canvas: ['fp.cdn-fingerprinting-service-hostname.example.net'], fonts: ['fonts.tracking-provider.example.org'] }, recorders: [{ name: 'Hotjar', sent: true }, { name: 'FullStory', sent: false }], typed: { sent: [{ host: 'collect.marketing-automation-platform.example.com' }] }, guards: [] };
  b.watch = { before: watch, after: watch };
  const paths = ['/', '/servicios/consultoria-de-aseguramiento-de-calidad-para-equipos-distribuidos.html', '/blog/2026/10/como-escribir-pruebas-de-extremo-a-extremo-que-no-fallan.html', '/contacto-y-solicitud-de-cotizacion-para-empresas.html', '/sobre-nosotros/equipo-y-certificaciones-profesionales.html'];
  const rules = ['color-contrast', 'landmark-complementary-is-top-level', 'scrollable-region-focusable', 'aria-allowed-attr', 'nested-interactive', 'link-in-text-block', 'image-alt', 'button-name', 'label-content-name-mismatch', 'heading-order', 'region', 'list'];
  const impacts = ['critical', 'serious', 'moderate', 'minor'];
  b.axe = { ran: true, version: '4.14.0', tags: ['wcag2a'], pages: paths.map((path, p) => ({ path, violations: rules.slice(p, p + 8).map((id, i) => ({ id, impact: impacts[(i + p) % 4], help: 'Elements must meet the rule ' + id + ' so assistive technology users can use them', helpUrl: 'https://dequeuniversity.com/rules/axe/4.14/' + id + '?application=axeAPI', nodes: 2 + i * 3 })) })) };
  b.pages = paths.slice(1).map((path, i) => ({ path, status: 200, renderedWords: 1200 + i * 300, rawWords: 100 + i * 40, share: 8 + i * 5, errors: 0 }));
  return b;
}

test('the "In a real browser" cells fit their column, read in the same order, and stay short when six sites sit side by side (#1604)', async ({ page, browser }) => {
  if (process.env.MULTI_SHOT) test.setTimeout(240000);
  await page.setViewportSize({ width: 1024, height: 900 });
  const records = recordsWith(true).concat(['gh78', 'ij90', 'kl12'].map((id, index) =>
    ({ id, email: EMAIL, status: 'complete', paid: true, createdAt: '2026-10-21T10:00:00Z', report: Object.assign({}, sample.report, { id, host: 'site' + (index + 4) + '.example', browser: busyBrowser() }) })));
  const seen = { saved: [], deleted: [], pdf: [] };
  await signIn(page, records, '/qa-review.html?comparison=cmp1', seen);
  const sec = page.locator('#multi-overlay .multi-sec[data-sec="browser"]');
  await expect(sec.locator('.multi-cell')).toHaveCount(6, { timeout: 20000 });
  if (process.env.MULTI_SHOT) {
    for (const [width, dark] of [[1024, false], [1024, true], [1440, false], [1440, true]]) {
      await page.setViewportSize({ width, height: 1000 });
      await page.evaluate((on) => { if (document.documentElement.classList.contains('dark-mode') !== on) document.querySelector('#theme-toggle').click(); }, dark);
      await sec.locator('.multi-cell[data-col="3"]').locator('.split').evaluate((el) => el.scrollIntoView({ block: 'start' }));
      await page.screenshot({ path: process.env.MULTI_SHOT + '/browser-' + width + (dark ? '-dark' : '') + '.png' });
      await sec.locator('.multi-cell[data-col="3"]').locator('[data-part="axe"]').evaluate((el) => el.scrollIntoView({ block: 'start' })).catch(() => {});
      await page.screenshot({ path: process.env.MULTI_SHOT + '/browser-axe-' + width + (dark ? '-dark' : '') + '.png' });
    }
    await page.evaluate(() => { if (document.documentElement.classList.contains('dark-mode')) document.querySelector('#theme-toggle').click(); });
    await page.evaluate(() => document.body.classList.add('printing-multi'));
    await page.emulateMedia({ media: 'print' });
    await page.pdf({ path: process.env.MULTI_SHOT + '/browser-print.pdf', preferCSSPageSize: true, printBackground: true });
    await page.emulateMedia({ media: 'screen' });
    await page.evaluate(() => document.body.classList.remove('printing-multi'));
    await page.setViewportSize({ width: 1024, height: 900 });
  }

  const spill = await sec.locator('.multi-cell').evaluateAll((cells) => cells.flatMap((cell) => {
    const box = cell.getBoundingClientRect();
    return [...cell.querySelectorAll('*')].filter((el) => el.getClientRects().length).map((el) => {
      const r = el.getBoundingClientRect();
      return { what: cell.dataset.host + ' ' + el.tagName + '.' + el.className + ' ' + el.textContent.slice(0, 40), over: Math.max(r.right - box.right, box.left - r.left, el.scrollWidth - el.clientWidth - (getComputedStyle(el).overflowX === 'visible' ? Infinity : 0)) };
    }).filter((row) => row.over > 1);
  }));
  expect(spill).toEqual([]);
  for (const index of [2, 3, 4, 5]) {
    await expect(sec.locator('.multi-cell[data-col="' + index + '"]').locator('[data-part]')).toHaveCount(3);
    expect(await sec.locator('.multi-cell[data-col="' + index + '"]').locator('[data-part]').evaluateAll((els) => els.map((el) => el.dataset.part))).toEqual(['tracking', 'text', 'axe']);
  }
  const tallest = await sec.locator('.multi-cell').evaluateAll((cells) => Math.max(...cells.map((cell) => [...cell.querySelectorAll('[data-part]')].reduce((sum, el) => sum + el.offsetHeight, 0))));
  expect(tallest).toBeLessThan(1800);

  await page.evaluate(() => document.body.classList.add('printing-multi'));
  await page.emulateMedia({ media: 'print' });
  const printed = sec.locator('.multi-cell[data-col="3"]').locator('[data-part="axe"] tbody tr:visible');
  expect(await printed.count()).toBeLessThanOrEqual(7);
  await page.emulateMedia({ media: 'screen' });
  await page.evaluate(() => document.body.classList.remove('printing-multi'));
  const download = page.waitForEvent('download');
  await page.locator('#multi-overlay').getByRole('button', { name: 'Download PDF' }).click();
  await download;
  expect(seen.pdf[0]).toContain('data-part="axe"');
  const off = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 1047, height: 1400 } });
  const pdf = await off.newPage();
  await pdf.setContent(seen.pdf[0]);
  await pdf.emulateMedia({ media: 'print' });
  const axe = pdf.locator('.multi-sec[data-sec="browser"] .multi-cell[data-col="3"]').locator('[data-part="axe"]');
  expect(await axe.locator('tbody tr:visible').count()).toBeLessThanOrEqual(7);
  await expect(axe.locator('tbody tr:visible').last()).toHaveText(/^…and \d+ more/);
  expect(await axe.locator('tbody tr').first().evaluate((row) => getComputedStyle(row).display)).toBe('flex');
  if (process.env.MULTI_SHOT) await pdf.locator('.multi-sec[data-sec="browser"]').screenshot({ path: process.env.MULTI_SHOT + '/browser-pdf.png' });
  await off.close();
});

function sixSites() {
  const records = recordsWith(true).concat(['gh78', 'ij90', 'kl12'].map((id, index) => {
    const base = [own, rival, sample.report][index];
    return { id, email: EMAIL, status: 'complete', paid: true, createdAt: '2026-10-21T10:00:00Z', report: Object.assign({}, base, { id }) };
  }));
  ['www.hotelestequendama.com.co', 'www.movichhotels.com', 'www.ghlhoteles.com', 'www.universidadcatolicadecolombia.edu.co', 'ciedi.edu.co', 'montessori.edu.co']
    .forEach((host, index) => { records[index].report = Object.assign({}, records[index].report, { host }); });
  return records;
}

test('Fix first stays inside its boxes in narrow columns, one bounded box per finding with its chips above the title, five in print (#1602)', async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 900 });
  await signIn(page, sixSites(), '/qa-review.html?comparison=cmp1', { saved: [], deleted: [], pdf: [] });
  const cells = page.locator('#multi-overlay .multi-sec[data-sec="fix"] .multi-cell');
  await expect(cells).toHaveCount(6, { timeout: 20000 });
  await expect(cells.first().locator('.fix-list > li').first()).toBeVisible();
  await expect(cells.first().locator('.fix-list > li.print-more')).toBeHidden();
  const level = async (media) => {
    const report = await cells.evaluateAll((list) => list.map((cell) => {
      const card = cell.querySelector('[data-slot="fix-first"]');
      const box = card.getBoundingClientRect();
      const spill = [...card.querySelectorAll('*')].filter((el) => {
        const r = el.getBoundingClientRect();
        if (!r.width) return false;
        return r.left < box.left - 0.5 || r.right > box.right + 0.5 || (el.clientWidth && el.scrollWidth > el.clientWidth + 1);
      }).map((el) => el.tagName + '.' + el.className + ': ' + el.textContent.slice(0, 40));
      const items = [...card.querySelectorAll('.fix-list > li:not(.print-more)')].filter((li) => li.offsetHeight).map((li) => {
        const r = li.getBoundingClientRect();
        return { top: r.top, bottom: r.bottom, border: parseFloat(getComputedStyle(li).borderTopWidth), rank: li.querySelector('.fix-rank').getBoundingClientRect().bottom, title: li.querySelector('strong').getBoundingClientRect().top };
      });
      return { host: cell.dataset.host, over: card.scrollWidth - card.clientWidth, spill, items };
    }));
    for (const col of report) {
      expect(col.over, media + ' ' + col.host).toBeLessThanOrEqual(0);
      expect(col.spill, media + ' ' + col.host).toEqual([]);
      col.items.forEach((item, index) => {
        expect(item.border, col.host).toBeGreaterThanOrEqual(1);
        expect(item.title, col.host).toBeGreaterThanOrEqual(item.rank - 1);
        if (index) expect(item.top, col.host).toBeGreaterThan(col.items[index - 1].bottom);
      });
    }
  };
  await level('screen');
  const first = cells.first().locator('.fix-list > li:visible');
  const total = await first.count();
  expect(total).toBeGreaterThan(5);
  await page.evaluate(() => document.body.classList.add('printing-multi'));
  await page.emulateMedia({ media: 'print' });
  await expect(first).toHaveCount(6);
  await expect(first.last()).toHaveText('…and ' + (total - 5) + ' more, in the report on the page.');
  await level('print');
  await page.emulateMedia({ media: 'screen' });
});

test('the host bar keeps a domain suffix on the line of the name it ends (#1611)', async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 900 });
  await signIn(page, sixSites(), '/qa-review.html?comparison=cmp1', { saved: [], deleted: [], pdf: [] });
  const heads = page.locator('#multi-overlay .multi-hosts .multi-host');
  await expect(heads).toHaveCount(6, { timeout: 20000 });
  const lines = await heads.evaluateAll((list) => list.map((el) => {
    const out = [];
    const range = document.createRange();
    const walk = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    let top = null;
    for (let node = walk.nextNode(); node; node = walk.nextNode()) {
      for (let i = 0; i < node.length; i += 1) {
        range.setStart(node, i);
        range.setEnd(node, i + 1);
        const at = range.getBoundingClientRect().top;
        if (top === null || at > top + 4) { out.push(''); top = at; }
        out[out.length - 1] += node.data[i];
      }
    }
    return out;
  }));
  for (const shown of lines) {
    expect(shown[shown.length - 1], shown.join(' / ')).not.toMatch(/^\.?((com|org|net|edu|gov|gob|ac|co|or|ne)\.)?[a-z]{2,}$/i);
    expect(shown[0], shown.join(' / ')).not.toBe('www.');
  }
  const hotel = page.locator('#multi-overlay .multi-hosts .multi-host[title="www.hotelestequendama.com.co"]');
  await expect(hotel).toHaveText('hotelestequendama.com.co');
});

test('the public marks of At a glance fit their tiles and line up across six sites, and the response times keep their bars and numbers, on screen and in print (#1612)', async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 900 });
  const records = recordsWith(true).concat(['gh78', 'ij90', 'kl12'].map((id, index) => {
    const base = [own, rival, sample.report][index];
    return { id, email: EMAIL, status: 'complete', paid: true, createdAt: '2026-10-21T10:00:00Z', report: Object.assign({}, base, { id, host: 'site' + (index + 4) + '.example', pages: (base.pages || []).slice(0, 2 + index) }) };
  }));
  await signIn(page, records, '/qa-review.html?comparison=cmp1', { saved: [], deleted: [], pdf: [] });
  const glance = page.locator('#multi-overlay .multi-sec[data-sec="glance"]');
  await expect(glance.locator('.ticks')).toHaveCount(6, { timeout: 20000 });
  const marks = () => glance.locator('.ticks').evaluateAll((lists) => lists.map((list) => [...list.querySelectorAll('.tick')].map((tick) => ({
    mark: tick.dataset.mark,
    top: Math.round(tick.getBoundingClientRect().top),
    over: Math.max(tick.scrollWidth - tick.clientWidth, ...[...tick.children].map((part) => part.scrollWidth - part.clientWidth))
  }))));
  const check = (cols, where) => {
    expect(cols[0].map((tick) => tick.mark), where).toEqual(['https', 'hsts', 'csp', 'nosniff', 'frame', 'referrer', 'lang', 'viewport']);
    for (const col of cols) {
      col.forEach((tick, index) => {
        expect(tick.over, where + ' ' + tick.mark).toBeLessThanOrEqual(0);
        expect(tick.top, where + ' ' + tick.mark).toBe(cols[0][index].top);
      });
    }
  };
  const meters = async (where) => {
    const rows = await glance.locator('.meter').evaluateAll((list) => list.map((row) => ({ text: row.textContent, over: row.lastElementChild.scrollWidth - row.lastElementChild.clientWidth, track: row.querySelector('.track').clientWidth })));
    for (const row of rows) {
      expect(row.over, where + ' ' + row.text).toBeLessThanOrEqual(0);
      expect(row.track, where + ' ' + row.text).toBeGreaterThan(20);
    }
  };
  check(await marks(), 'screen');
  await meters('screen');
  await page.evaluate(() => document.body.classList.add('printing-multi'));
  await page.emulateMedia({ media: 'print' });
  check(await marks(), 'print');
  await meters('print');
});

test('in a six-column print the response-time bars keep at least half of their row, so they read as bars and not dots (#1650)', async ({ page }) => {
  await page.setViewportSize({ width: 1060, height: 760 });
  const records = recordsWith(true).concat(['gh78', 'ij90', 'kl12'].map((id, index) => {
    const base = [own, rival, sample.report][index];
    return { id, email: EMAIL, status: 'complete', paid: true, createdAt: '2026-10-21T10:00:00Z', report: Object.assign({}, base, { id, host: 'site' + (index + 4) + '.example' }) };
  }));
  await signIn(page, records, '/qa-review.html?comparison=cmp1', { saved: [], deleted: [], pdf: [] });
  const speed = page.locator('#multi-overlay .multi-sec[data-sec="glance"] [data-card="speed"]');
  await expect(speed).toHaveCount(6, { timeout: 20000 });
  await page.evaluate(() => document.body.classList.add('printing-multi'));
  await page.emulateMedia({ media: 'print' });
  const rows = await speed.locator('.meter').evaluateAll((list) => list.map((row) => ({ text: row.textContent, row: row.clientWidth, track: row.querySelector('.track').clientWidth })));
  expect(rows.length).toBeGreaterThan(6);
  for (const row of rows) expect(row.track, row.text).toBeGreaterThanOrEqual(row.row / 2);
});

test('the At a glance cards line up across the columns, and a long address in a practice wraps inside its card (#1613)', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const records = recordsWith(true).concat(['gh78', 'ij90', 'kl12'].map((id, index) => {
    const base = [own, rival, sample.report][index];
    return { id, email: EMAIL, status: 'complete', paid: true, createdAt: '2026-10-21T10:00:00Z', report: Object.assign({}, base, { id }) };
  }));
  const groups = ['CMS', 'Analytics', 'CDN', 'Server', 'Fonts', 'Library', 'Marketing'];
  const url = 'https://dequeuniversity.com/rules/axe/4.10/aria-allowed-attr?application=axeAPI&lang=en';
  [7, 2, 5, 3, 6, 1].forEach((n, index) => {
    const report = records[index].report;
    report.technologies = groups.slice(0, n).map((group) => ({ name: group + ' tool', group }));
    const extra = { key: 'long-url', rank: 1, area: 'Accessibility', verdict: 'fail', title: 'Elements must only use supported attributes', fix: 'Follow the rule guide at ' + url };
    if (index === 3) report.insights = Object.assign({}, report.insights, { findings: [extra].concat((report.insights && report.insights.findings) || []) });
  });
  await signIn(page, records, '/qa-review.html?comparison=cmp1', { saved: [], deleted: [], pdf: [] });
  const glance = page.locator('#multi-overlay .multi-sec[data-sec="glance"]');
  await expect(glance.locator('.multi-cell')).toHaveCount(6, { timeout: 20000 });
  if (process.env.MULTI_SHOT) {
    test.setTimeout(240000);
    const theme = (on) => { if (document.documentElement.classList.contains('dark-mode') !== on) SiteTheme.toggle(); };
    for (const width of [1024, 1440]) {
      for (const dark of [false, true]) {
        await page.setViewportSize({ width, height: 1500 });
        await page.evaluate(theme, dark);
        await glance.locator('> h2').evaluate((el) => el.scrollIntoView({ block: 'start' }));
        await page.waitForTimeout(600);
        await page.screenshot({ path: process.env.MULTI_SHOT + '/glance-' + width + (dark ? '-dark' : '-light') + '.png' });
      }
    }
    await page.evaluate(theme, false);
  }
  const rows = () => glance.evaluate((sec) => ['speed', 'marks', 'tech', 'practices'].map((key) => {
    const boxes = [...sec.querySelectorAll('[data-card="' + key + '"]')].map((card) => card.getBoundingClientRect());
    return { key, count: boxes.length, tops: boxes.map((box) => box.top), heights: boxes.map((box) => box.height) };
  }));
  const level = (list) => {
    for (const row of list) {
      expect(row.count, row.key).toBe(6);
      expect(Math.max(...row.tops) - Math.min(...row.tops), row.key + ' tops').toBeLessThanOrEqual(1);
      expect(Math.max(...row.heights) - Math.min(...row.heights), row.key + ' heights').toBeLessThanOrEqual(1);
    }
  };
  level(await rows());
  const spill = await glance.locator('[data-card="practices"] .advice article').evaluateAll((list) => list.map((item) => {
    const card = item.closest('.card').getBoundingClientRect();
    return { text: item.textContent.slice(0, 40), over: item.scrollWidth - item.clientWidth, right: item.getBoundingClientRect().right - card.right };
  }));
  expect(spill.some((row) => row.text.startsWith('Elements must only'))).toBe(true);
  for (const row of spill) {
    expect(row.over, row.text).toBeLessThanOrEqual(0);
    expect(row.right, row.text).toBeLessThanOrEqual(0);
  }
  const snaps = await glance.locator('[data-advice="snapshot"]').evaluateAll((list) => list.map((item) => item.getBoundingClientRect().bottom));
  expect(Math.max(...snaps) - Math.min(...snaps)).toBeLessThanOrEqual(1);

  await page.evaluate(() => document.body.classList.add('printing-multi'));
  await page.emulateMedia({ media: 'print' });
  level(await rows());
  if (process.env.MULTI_SHOT) await page.pdf({ path: process.env.MULTI_SHOT + '/glance-print.pdf', preferCSSPageSize: true, printBackground: true });
  await page.emulateMedia({ media: 'screen' });
  await page.evaluate(() => document.body.classList.remove('printing-multi'));
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
        await sec.locator('.multi-cell[data-col="0"]').locator('[data-part="crawlers"]').evaluate((el) => el.scrollIntoView({ block: 'end' }));
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
  await expect(sec.locator('.multi-cell[data-col="2"]').locator('[data-part="crawlers"] .bot-group').first()).toHaveText(/✓ \d+ ✕ \d+$/);

  await page.evaluate(() => document.body.classList.add('printing-multi'));
  await page.emulateMedia({ media: 'print' });
  const outline = sec.locator('.multi-cell[data-col="2"]').locator('.ai-outline li:visible');
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

// Six sites, the first with evidence, fixes and paths that hold no place to break, as axe selectors and long URLs do.
function sixWithLongEvidence() {
  const records = recordsWith(true).concat(['gh78', 'ij90', 'kl12'].map((id, index) => {
    const base = [own, rival, sample.report][index];
    return { id, email: EMAIL, status: 'complete', paid: true, createdAt: '2026-10-21T10:00:00Z', report: Object.assign({}, base, { id, host: 'site' + (index + 4) + '.example' }) };
  }));
  const selector = '.elementor-element-d12c70c.elementor-sticky--active.elementor-section--handles-inside.elementor-column-gap-default.elementor-section-boxed'.replace(/-/g, '_');
  const report = records[0].report;
  records[0].report = Object.assign({}, report, { host: 'www.hotelestequendama.com.co', insights: Object.assign({}, report.insights, {
    findings: report.insights.findings.map((item, index) => index % 3 ? item : Object.assign({}, item, {
      verdict: index % 2 ? 'fail' : 'risk',
      evidence: 'axe-core found 20 elements on /, for example ' + selector + selector + ' and https://www.hotelestequendama.com.co/es/convenios.html?sectionContent=politica_de_privacidad_y_tratamiento_de_datos_personales_' + 'x'.repeat(120),
      fix: 'Follow https://dequeuniversity.com/rules/axe/4.14/aria_allowed_attr?application=axeAPI&' + 'y'.repeat(120),
      pages: ['/es/?sectionContent=politica_de_privacidad_' + 'z'.repeat(150), '/en/']
    }))
  }) });
  return records;
}

test('one filter bar above the findings filters every column, and each column groups its findings by area in the same order (#1609)', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await signIn(page, sixWithLongEvidence(), '/qa-review.html?comparison=cmp1', { saved: [], deleted: [], pdf: [] });
  const sec = page.locator('#multi-overlay .multi-sec[data-sec="findings"]');
  const cells = sec.locator('.multi-cell');
  await expect(cells).toHaveCount(6, { timeout: 20000 });
  await expect(sec.locator('.multi-filters')).toHaveCount(1);
  await expect(cells.locator('[data-slot="finding-filters"] button')).toHaveCount(0);
  const order = ['SEO', 'GEO', 'Analytics', 'Security', 'Accessibility', 'Performance'];
  const groups = await cells.evaluateAll((list) => list.map((cell) => [...cell.querySelectorAll('[data-group]')].map((group) => group.getAttribute('data-group'))));
  for (const list of groups) expect(list).toEqual(order);
  for (const name of order) await cells.first().locator('[data-group="' + name + '"] .group-toggle').click();
  const counted = (verdict) => cells.evaluateAll((list, wanted) => list.map((cell) => [...cell.querySelectorAll('.finding')].filter((item) => item.offsetParent).every((item) => wanted.includes(item.getAttribute('data-verdict')))), verdict);
  expect(await counted(['fail', 'risk'])).toEqual([true, true, true, true, true, true]);

  await sec.locator('.multi-filters [data-verdict="pass"]').click();
  await expect(sec.locator('.multi-filters [data-verdict="pass"]')).toHaveClass('on');
  expect(await counted(['pass'])).toEqual([true, true, true, true, true, true]);
  for (const index of [0, 1, 2]) expect(await cells.nth(index).locator('.finding[data-verdict="pass"]:visible').count()).toBeGreaterThan(0);

  await sec.locator('.multi-filters [data-area="Security"]').click();
  const shown = await cells.evaluateAll((list) => list.map((cell) => [...cell.querySelectorAll('[data-group]')].filter((group) => !group.hidden).map((group) => group.getAttribute('data-group'))));
  for (const list of shown) expect(list).toEqual(['Security']);
  const tops = await cells.evaluateAll((list) => list.map((cell) => Math.round(cell.querySelector('[data-group="Security"]').getBoundingClientRect().top)));
  expect(new Set(tops).size).toBe(1);

  await sec.locator('.multi-filters [data-area="All"]').click();
  await cells.first().locator('[data-group="SEO"] .group-toggle').click();
  for (const index of [0, 1, 2, 3, 4, 5]) {
    await expect(cells.nth(index).locator('[data-group="SEO"] .group-toggle')).toHaveAttribute('aria-expanded', 'false');
    await expect(cells.nth(index).locator('[data-group="SEO"] .finding:visible')).toHaveCount(0);
  }
  const groupTops = await cells.evaluateAll((list) => list.map((cell) => Math.round(cell.querySelector('[data-group="GEO"]').getBoundingClientRect().top)));
  expect(new Set(groupTops).size).toBe(1);

  await page.locator('#multi-overlay .multi-sec[data-sec="health"] .multi-cell').nth(1).locator('.area[data-area="Performance"]').click();
  await expect(sec.locator('.multi-filters [data-area="Performance"]')).toHaveClass('on');
  await expect(sec.locator('.multi-filters [data-verdict="all"]')).toHaveClass('on');
  for (const index of [0, 1, 2]) await expect(cells.nth(index).locator('[data-group]:visible')).toHaveAttribute('data-group', 'Performance');
});

test('Every check and Cases start folded, one line per area or layer with its count, level across the columns, and an area picked on the health card opens (#1657)', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await signIn(page, sixWithLongEvidence(), '/qa-review.html?comparison=cmp1', { saved: [], deleted: [], pdf: [] });
  for (const [key, group, toggle, count] of [['findings', '.finding-group', '.group-toggle', '.group-count'], ['cases', '.cases-group', '.cases-toggle', '.cases-n']]) {
    const cells = page.locator('#multi-overlay .multi-sec[data-sec="' + key + '"] .multi-cell');
    await expect(cells).toHaveCount(6, { timeout: 20000 });
    await expect(cells.locator('.finding:visible, .case:visible')).toHaveCount(0);
    const heads = await cells.evaluateAll((list, [g, b, n]) => list.map((cell) => [...cell.querySelectorAll(g)].map((item) => ({
      name: item.dataset.group,
      open: item.querySelector(b).getAttribute('aria-expanded'),
      count: item.querySelector(n).textContent.trim(),
      top: Math.round(item.getBoundingClientRect().top)
    }))), [group, toggle, count]);
    expect(heads[0].length, key).toBeGreaterThan(3);
    for (const column of heads) {
      expect(column.map((item) => item.name), key).toEqual(heads[0].map((item) => item.name));
      column.forEach((item, i) => {
        expect(item.open, key + ' ' + item.name).toBe('false');
        expect(item.count, key + ' ' + item.name).toMatch(/^\d+$/);
        expect(item.top, key + ' ' + item.name).toBe(heads[0][i].top);
      });
    }
  }
  const findings = page.locator('#multi-overlay .multi-sec[data-sec="findings"] .multi-cell');
  await findings.nth(2).locator('[data-group="Security"] .group-toggle').click();
  for (const index of [0, 1, 2, 3, 4, 5]) await expect(findings.nth(index).locator('[data-group="Security"] .group-toggle')).toHaveAttribute('aria-expanded', 'true');
  await expect(findings.locator('[data-group="SEO"] .finding:visible')).toHaveCount(0);
  await page.locator('#multi-overlay .multi-sec[data-sec="health"] .multi-cell').nth(1).locator('.area[data-area="Performance"]').click();
  for (const index of [0, 1, 2]) await expect(findings.nth(index).locator('[data-group="Performance"] .group-toggle')).toHaveAttribute('aria-expanded', 'true');
  expect(await findings.locator('[data-group="Performance"] .finding:visible').count()).toBeGreaterThan(0);
});

test('in print each area of the findings opens its first three under the filter, counts the rest, and the PDF prints them open without JavaScript (#1609)', async ({ page }) => {
  const seen = { saved: [], deleted: [], pdf: [] };
  await signIn(page, recordsWith(true), '/qa-review.html?comparison=cmp1', seen);
  const sec = page.locator('#multi-overlay .multi-sec[data-sec="findings"]');
  await expect(sec.locator('.multi-cell')).toHaveCount(3, { timeout: 20000 });
  await sec.locator('.multi-filters [data-verdict="all"]').click();
  const group = sec.locator('.multi-cell').first().locator('[data-group="Security"]');
  const total = await group.locator('.finding').count();
  expect(total).toBeGreaterThan(3);
  await expect(group.locator('.group-toggle')).toHaveAttribute('aria-expanded', 'false');
  await page.evaluate(() => window.dispatchEvent(new Event('beforeprint')));
  await page.emulateMedia({ media: 'print' });
  await expect(sec.locator('.multi-filters')).toBeHidden();
  await expect(sec.locator('.multi-filter-say')).toHaveText('All · Everything');
  await expect(group.locator('.finding:visible')).toHaveCount(3);
  await expect(group.locator('.finding:visible').first()).toHaveAttribute('open', '');
  await expect(group.locator('.finding:visible').first().locator('.muted')).toBeVisible();
  await expect(group.locator('.print-more')).toHaveText('…and ' + (total - 3) + ' more, in the report on the page.');
  if (process.env.MULTI_SHOT) {
    await page.setViewportSize({ width: 1123, height: 794 });
    await sec.screenshot({ path: process.env.MULTI_SHOT + '/findings-print.png' });
    await page.pdf({ path: process.env.MULTI_SHOT + '/findings-print.pdf', preferCSSPageSize: true, printBackground: true });
  }
  await page.emulateMedia({ media: 'screen' });
  await page.evaluate(() => window.dispatchEvent(new Event('afterprint')));
  await expect(sec.locator('.multi-cell').first().locator('details.finding[open]')).toHaveCount(0);

  await page.locator('#multi-overlay').getByRole('button', { name: 'Download PDF' }).click();
  await expect(page.locator('#multi-status')).toHaveText('The PDF is downloaded.');
  expect(seen.pdf[0]).not.toContain('class="group-toggle"');
  expect(seen.pdf[0]).toMatch(/<details class="finding"[^>]* open=""/);
  const printed = await page.context().newPage();
  await printed.route(/^https?:/, (route) => route.abort());
  await printed.emulateMedia({ media: 'print' });
  await printed.setContent(seen.pdf[0], { waitUntil: 'load', javaScriptEnabled: false });
  const copy = printed.locator('.multi-sec[data-sec="findings"] .multi-cell').first().locator('[data-group="Security"]');
  await expect(copy.locator('.finding:visible')).toHaveCount(3);
  await expect(copy.locator('.finding:visible').first().locator('.muted')).toBeVisible();
  await expect(printed.locator('.multi-filters')).toHaveCount(0);
  await printed.close();
});

test('a column whose evidence holds long selectors and paths keeps its findings in view and never scrolls sideways (#1609)', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  if (process.env.MULTI_DARK) await page.addInitScript(() => localStorage.setItem('theme', 'dark'));
  await signIn(page, sixWithLongEvidence(), '/qa-review.html?comparison=cmp1', { saved: [], deleted: [], pdf: [] });
  const sec = page.locator('#multi-overlay .multi-sec[data-sec="findings"]');
  await expect(sec.locator('.multi-cell')).toHaveCount(6, { timeout: 20000 });
  await page.waitForLoadState('networkidle');
  for (const toggle of await sec.locator('.multi-cell').first().locator('.group-toggle').all()) await toggle.click();
  await sec.locator('.multi-cell').first().locator('details.finding').evaluateAll((list) => list.forEach((item) => { item.open = true; }));
  if (process.env.MULTI_SHOT) {
    for (const width of [1440, 1024]) {
      await page.setViewportSize({ width, height: 900 });
      await sec.evaluate((el) => { el.scrollIntoView({ block: 'start' }); let box = el.parentElement; while (box && !(/(auto|scroll)/.test(getComputedStyle(box).overflowY) && box.scrollHeight > box.clientHeight)) box = box.parentElement; if (box) box.scrollTop -= 150; });
      await page.screenshot({ path: process.env.MULTI_SHOT + '/findings-' + width + (process.env.MULTI_DARK ? '-dark' : '') + '.png' });
    }
    await page.setViewportSize({ width: 1440, height: 900 });
  }
  const spill = await sec.locator('.multi-cell').evaluateAll((list) => list.map((cell) => {
    const box = cell.getBoundingClientRect();
    const wide = [cell, ...cell.querySelectorAll('*')].filter((el) => el.scrollWidth > el.clientWidth + 1 && getComputedStyle(el).overflowX !== 'visible').length;
    const out = [...cell.querySelectorAll('.finding *')].filter((el) => el.offsetParent && el.getBoundingClientRect().right > box.right + 1).length;
    return { host: cell.getAttribute('data-host'), wide, out };
  }));
  for (const row of spill) expect(row, row.host).toEqual({ host: row.host, wide: 0, out: 0 });
  await sec.locator('.multi-cell').first().locator('.finding').first().scrollIntoViewIfNeeded();
  const title = sec.locator('.multi-cell').first().locator('.finding strong').first();
  await expect(title).toBeVisible();
  await expect(title).toBeInViewport();
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

test('the fix-kit files sit level across the columns however each kit differs, on screen and in print (#1610)', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const kits = [
    { hosting: 'Firebase Hosting', mtaSts: 'v=STSv1; id=1', libraries: [{ name: 'jQuery UI', version: '1.12.1', fixed: '1.13.2' }], accessibilityStatement: true },
    { hosting: 'Apache', libraries: [{ name: 'Moment.js', version: '2.30.1', fixed: '2.31.0' }, { name: 'Select2', version: '4.0.6-rc.1', fixed: '4.0.6' }], privacyNotice: true, accessibilityStatement: true },
    { hosting: '', libraries: [{ name: 'Bootstrap', version: '3.2.0', ended: true }] },
    { hosting: 'nginx', mtaSts: 'v=STSv1; id=1' }
  ];
  const records = [own, rival, sample.report, own].map((base, index) => {
    const report = JSON.parse(JSON.stringify(base));
    report.id = ['ab12', 'cd34', 'ef56', 'gh78'][index];
    if (index === 3) report.host = 'site4.example';
    report.insights.fixkit = Object.assign(report.insights.fixkit, kits[index]);
    return { id: report.id, email: EMAIL, status: 'complete', paid: index !== 2, createdAt: '2026-10-2' + (4 - index) + 'T10:00:00Z', report };
  });
  await signIn(page, records, '/qa-review.html?comparison=cmp1', { saved: [], deleted: [], pdf: [] });
  const sec = page.locator('#multi-overlay .multi-sec[data-sec="fixkit"]');
  await expect(sec.locator('.multi-cell')).toHaveCount(4, { timeout: 20000 });
  if (process.env.MULTI_SHOT) {
    for (const dark of [false, true]) {
      if (dark) await page.evaluate(() => document.getElementById('theme-toggle').click());
      for (const width of [1024, 1440]) {
        await page.setViewportSize({ width, height: 2200 });
        await sec.scrollIntoViewIfNeeded();
        await sec.screenshot({ path: process.env.MULTI_SHOT + '/fixkit-' + width + (dark ? '-dark' : '') + '.png' });
      }
    }
    await page.evaluate(() => { document.getElementById('theme-toggle').click(); document.body.classList.add('printing-multi'); });
    await page.emulateMedia({ media: 'print' });
    await page.setViewportSize({ width: 1047, height: 2200 });
    await sec.screenshot({ path: process.env.MULTI_SHOT + '/fixkit-print.png' });
    await page.emulateMedia({ media: 'screen' });
    await page.evaluate(() => document.body.classList.remove('printing-multi'));
    await page.setViewportSize({ width: 1440, height: 900 });
  }
  await expect(sec.locator('[data-kit="chat"]')).toHaveCount(0);
  await expect(sec.locator('[data-kit="libs"]')).toHaveCount(4);
  await expect(sec.locator('.multi-cell[data-col="3"]').locator('[data-kit="libs"]')).toHaveText('Library upgradesNothing to upgrade.');
  await expect(sec.locator('.multi-cell[data-col="2"]').locator('[data-kit="libs"]')).toHaveText('Library upgradesIn the full report.');
  await expect(sec.locator('.multi-cell[data-col="3"]').locator('[data-kit="legal"]')).toHaveClass('is-none');
  const rows = () => sec.locator('.multi-cell').evaluateAll((cells) => cells.map((cell) => Object.fromEntries([...cell.querySelectorAll('[data-slot="fixkit"] > p, [data-kit], .code-peek')].map((el) => {
    const box = el.getBoundingClientRect();
    return [el.dataset.kit || el.className || 'intro', { top: box.top, height: box.height }];
  }))));
  const level = (columns, label) => {
    expect(Object.keys(columns[0]).length, label).toBe(12);
    const stack = Object.values(columns[0]);
    stack.slice(1).forEach((box, index) => expect(box.top, label + ' stacked').toBeGreaterThanOrEqual(stack[index].top + stack[index].height));
    for (const key of Object.keys(columns[0])) {
      for (const column of columns.slice(1)) {
        expect(Math.abs(column[key].top - columns[0][key].top), label + ' ' + key + ' top').toBeLessThanOrEqual(1);
        expect(Math.abs(column[key].height - columns[0][key].height), label + ' ' + key + ' height').toBeLessThanOrEqual(1);
      }
    }
  };
  level(await rows(), 'screen');
  const peek = await sec.locator('.code-peek').evaluateAll((els) => els.map((el) => ({ height: el.offsetHeight, over: el.scrollWidth - el.clientWidth })));
  for (const box of peek) expect(box).toEqual({ height: 200, over: 0 });
  await page.evaluate(() => document.body.classList.add('printing-multi'));
  await page.emulateMedia({ media: 'print' });
  level(await rows(), 'print');
  await page.emulateMedia({ media: 'screen' });
  await page.evaluate(() => document.body.classList.remove('printing-multi'));
});

const LONG_CASE = {
  id: 'AXE-01', layer: 'Accessibility', priority: 'P1', verdict: 'fail', severity: 'critical', fw: ['Playwright'],
  title: 'Buttons on www.universidadcatolicadecolombia.edu.co/estudiantes/servicios-academicos/ have an accessible name',
  why: '49 button elements were counted on https://www.universidadcatolicadecolombia.edu.co/estudiantes/servicios-academicos/calendario-academico-2026/. axe-core 4.14.0 found 26 elements breaking button-name (critical), for example .main_slider_wrapper>.owl-nav>.owl-prev[role="presentation"][type="button"]>span.elementor-icon-list-item:nth-child(2)>a[href="tel:+57(601)4824466"]. Rule: https://dequeuniversity.com/rules/axe/4.14/button-name?application=axeAPI'
};

function sixWithLongCase() {
  const records = recordsWith(true).concat(['gh78', 'ij90', 'kl12'].map((id, index) => {
    const base = [own, rival, sample.report][index];
    return { id, email: EMAIL, status: 'complete', paid: true, createdAt: '2026-10-21T10:00:00Z', report: Object.assign({}, base, { id }) };
  }));
  ['www.universidadcatolicadecolombia.edu.co', 'www.movichhotels.com', 'www.ghlhoteles.com', 'www.hotelestequendama.com', 'ciedi.edu.co', 'montessori.edu.co']
    .forEach((host, index) => { records[index].report.host = host; });
  records[0].report.cases = [LONG_CASE].concat(records[0].report.cases);
  records[4].report.cases = records[4].report.cases.filter((item) => item.layer !== 'Privacy');
  return records;
}

test('the cases sit in the same layer groups, in the same order and at the same height in every column, with their counts, and a long case wraps (#1615)', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const records = sixWithLongCase();
  await signIn(page, records, '/qa-review.html?comparison=cmp1', { saved: [], deleted: [], pdf: [] });
  const box = page.locator('#multi-overlay');
  const sec = box.locator('.multi-sec[data-sec="cases"]');
  await expect(sec.locator('.multi-cell')).toHaveCount(6, { timeout: 20000 });
  const order = JSON.parse(require('fs').readFileSync(require('path').join(__dirname, '../js/qa-review.js'), 'utf8').match(/CASE_LAYERS = (\[[^\]]+\])/)[1]);
  const union = order.filter((name) => records.some((row) => row.report.cases.some((item) => item.layer === name)));
  const cells = sec.locator('.multi-cell');
  for (let index = 0; index < 6; index += 1) {
    const groups = await sec.locator('.multi-cell[data-col="' + index + '"]').locator('.cases-group').evaluateAll((els) => els.map((el) => [el.dataset.group, el.querySelector('.cases-n').textContent, el.querySelectorAll('.case').length]));
    expect(groups.map((row) => row[0]), records[index].report.host).toEqual(union);
    for (const [name, shown, items] of groups) {
      const count = records[index].report.cases.filter((item) => item.layer === name).length;
      expect([name, shown, items]).toEqual([name, String(count), count]);
    }
  }
  await expect(cells.and(page.locator('[data-col="4"]')).locator('.cases-group[data-group="Privacy"]')).toHaveClass(/is-none/);
  await expect(cells.and(page.locator('[data-col="0"]')).locator('.cases-sum')).toContainText('P1 1');
  const tops = (selector) => cells.evaluateAll((els, sel) => els.map((el) => Math.round(el.querySelector(sel).getBoundingClientRect().top)), selector);
  expect(new Set(await tops('.cases-sum')).size).toBe(1);
  expect(new Set(await tops('.cases-group[data-group="Security"] h3')).size).toBe(1);
  expect(await sec.locator('[data-slot="cases"]').first().evaluate((el) => [getComputedStyle(el).maxHeight, el.scrollHeight <= el.clientHeight])).toEqual(['none', true]);

  const toggle = cells.and(page.locator('[data-col="1"]')).locator('.cases-group[data-group="Accessibility"] .cases-toggle');
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await expect(cells.and(page.locator('[data-col="0"]')).locator('.case').first()).toBeHidden();
  await toggle.click();
  for (let index = 0; index < 6; index += 1) await expect(cells.nth(index).locator('.cases-group[data-group="Accessibility"] .cases-toggle')).toHaveAttribute('aria-expanded', 'true');
  expect(new Set(await tops('.cases-group[data-group="Security"] h3')).size).toBe(1);
  const long = cells.and(page.locator('[data-col="0"]')).locator('.case[data-id="AXE-01"]');
  await expect(long).toBeVisible();
  await expect(cells.and(page.locator('[data-col="0"]')).locator('.cases-group[data-group="Accessibility"] .case').first()).toHaveAttribute('data-id', 'AXE-01');
  await expect(long.locator('code').first()).toBeVisible();
  const spill = () => cells.and(page.locator('[data-col="0"]')).evaluate((cell) => {
    const edge = cell.getBoundingClientRect().right;
    return [...cell.querySelectorAll('.case, .case *')].filter((el) => el.getBoundingClientRect().right > edge + 1 || el.scrollWidth > el.clientWidth + 1 && getComputedStyle(el).overflowX !== 'visible').map((el) => el.className || el.tagName);
  });
  expect(await spill()).toEqual([]);
  const more = long.locator('.cases-more');
  const clamped = await long.locator('.cases-why').evaluate((el) => el.offsetHeight);
  await more.click();
  await expect(more).toHaveAttribute('aria-expanded', 'true');
  expect(await long.locator('.cases-why').evaluate((el) => el.offsetHeight)).toBeGreaterThan(clamped);
  expect(await spill()).toEqual([]);
  const all = box.locator('.cases-all');
  await expect(all).toHaveText('Collapse all');
  await all.click();
  await expect(sec.locator('.cases-toggle[aria-expanded="true"]')).toHaveCount(0);
  await expect(all).toHaveText('Expand all');
  await all.click();
  await expect(sec.locator('.cases-toggle[aria-expanded="false"]:not([disabled])')).toHaveCount(0);
  expect(new Set(await tops('.cases-group[data-group="SEO"] h3')).size).toBe(1);
  await all.click();

  if (process.env.MULTI_SHOT) {
    await cells.and(page.locator('[data-col="1"]')).locator('.cases-group[data-group="Accessibility"] .cases-toggle').click();
    for (const [width, height] of [[1440, 900], [1024, 768]]) {
      await page.setViewportSize({ width, height });
      for (const dark of [false, true]) {
        await page.evaluate((on) => { if (document.documentElement.classList.contains('dark-mode') !== on) document.getElementById('theme-toggle').click(); }, dark);
        await sec.locator('> h2').evaluate((el) => { el.scrollIntoView(); el.closest('#multi-overlay').scrollTop -= 110; });
        await page.screenshot({ path: process.env.MULTI_SHOT + '/cases-' + width + (dark ? '-dark' : '-light') + '.png' });
      }
    }
    await page.evaluate(() => { if (document.documentElement.classList.contains('dark-mode')) document.getElementById('theme-toggle').click(); document.body.classList.add('printing-multi'); });
    await page.emulateMedia({ media: 'print' });
    await page.setViewportSize({ width: 1123, height: 794 });
    const top = await sec.evaluate((el) => el.getBoundingClientRect().top + window.scrollY);
    await page.screenshot({ path: process.env.MULTI_SHOT + '/cases-print.png', fullPage: true, clip: { x: 0, y: top, width: 1123, height: 1300 } });
    await page.pdf({ path: process.env.MULTI_SHOT + '/cases-print.pdf', preferCSSPageSize: true, printBackground: true });
  }
});

test('in print the case groups open, each stops after a few cases with a line counting the rest, and the PDF keeps the group names (#1615)', async ({ page }) => {
  const seen = { saved: [], deleted: [], pdf: [] };
  await signIn(page, recordsWith(true), '/qa-review.html?comparison=cmp1', seen);
  const box = page.locator('#multi-overlay');
  const cell = box.locator('.multi-sec[data-sec="cases"] .multi-cell[data-col="0"]');
  const functional = cell.locator('.cases-group[data-group="Functional"]');
  await expect(functional.locator('.cases-n')).toHaveText(String(own.cases.filter((item) => item.layer === 'Functional').length), { timeout: 20000 });
  await expect(functional.locator('.case:visible')).toHaveCount(0);
  await page.evaluate(() => document.body.classList.add('printing-multi'));
  await page.emulateMedia({ media: 'print' });
  await expect(functional.locator('.case:visible')).toHaveCount(3);
  await expect(functional.locator('.print-more')).toHaveText('…and ' + (own.cases.filter((item) => item.layer === 'Functional').length - 3) + ' more, in the report on the page.');
  await expect(cell.locator('.cases-group[data-group="Content"] .case:visible')).toHaveCount(3);
  expect(await functional.locator('.cases-why').first().evaluate((el) => getComputedStyle(el).webkitLineClamp)).toBe('2');
  await page.emulateMedia({ media: 'screen' });
  await page.evaluate(() => document.body.classList.remove('printing-multi'));
  const download = page.waitForEvent('download');
  await box.getByRole('button', { name: 'Download PDF' }).click();
  await download;
  expect(seen.pdf[0]).toMatch(/<h3><span class="cases-name">Functional<\/span><span class="cases-n">18<\/span><\/h3>/);
  expect(seen.pdf[0]).not.toMatch(/<ol class="cases-list"[^>]*\shidden/);
  expect(seen.pdf[0]).not.toMatch(/<button[^>]*cases-/);
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
  expect(await box.locator('.multi-sec[data-sec="pages"] .multi-cell > .card').first().evaluate((card) => getComputedStyle(card, '::after').display)).toBe('none');
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
  expect(checks[0].length).toBeGreaterThan(10);
  for (const column of checks) expect(column.map(([key]) => key)).toEqual(checks[0].map(([key]) => key));
  checks[0].forEach(([key], i) => expect(Math.max(...checks.map((column) => column[i][1])) - Math.min(...checks.map((column) => column[i][1])), key).toBeLessThanOrEqual(1));

  const [ownCell, rivalCell, sampleCell] = [0, 1, 2].map((i) => sec.locator('.multi-cell[data-col="' + i + '"]'));
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

test('the security checks leave out the headers the coverage rows already show, page by page (#1657)', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await signIn(page, recordsWithHeaders(), '/qa-review.html?comparison=cmp1', { saved: [], deleted: [], pdf: [] });
  const cells = page.locator('#multi-overlay .multi-sec[data-sec="security"] .multi-cell');
  await expect(cells.locator('[data-header]')).toHaveCount(21, { timeout: 20000 });
  const checks = await cells.evaluateAll((list) => list.map((cell) => [...cell.querySelectorAll('[data-check]')].map((row) => row.dataset.check)));
  for (const column of checks) {
    for (const covered of ['hsts', 'content-security-policy', 'frame-protection', 'x-content-type-options', 'referrer-policy', 'permissions-policy']) expect(column).not.toContain(covered);
    expect(column).toEqual(expect.arrayContaining(['https-redirect', 'cross-origin-opener-policy', 'tls-certificate', 'security-txt', 'spf', 'dmarc', 'caa']));
  }
});

test('a site with many pages lists only the first pages that differ, with a line counting the rest, on the page, in print and in the PDF (#1607)', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const seen = { saved: [], deleted: [], pdf: [] };
  await signIn(page, recordsWithHeaders(), '/qa-review.html?comparison=cmp1', seen);
  const cells = page.locator('#multi-overlay .multi-sec[data-sec="security"] .multi-cell');
  const diff = cells.and(page.locator('[data-col="0"]')).locator('.sec-diff');
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
  expect(await box.locator('.multi-table thead th[translate="no"]').evaluateAll((els) => els.map((el) => el.title))).toEqual(bare);
  expect(await texts('.multi-table tbody tr:first-child td')).toEqual(ranked.map((item) => String(item.score)));
  expect(await texts('.multi-hosts .multi-host')).toEqual(bare);
  for (const sec of await box.locator('.multi-sec').all()) {
    expect(await sec.locator('.multi-cell').evaluateAll((els) => els.map((el) => el.dataset.host))).toEqual(bare);
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

test('the case layers and the Proposed tag of the comparison read in the page language (#1647)', async ({ page }) => {
  await signIn(page, recordsWith(true), '/qa-review-fr.html?comparison=cmp1', { saved: [], deleted: [], pdf: [] });
  const cases = page.locator('#multi-overlay .multi-sec[data-sec="cases"]');
  await expect(cases.locator('.cases-group').first()).toBeAttached({ timeout: 20000 });
  const names = await cases.locator('.multi-cell[data-col="2"] .cases-name').allTextContents();
  expect(names).toEqual(expect.arrayContaining(['Accessibilité', 'Sécurité', 'Confidentialité', 'Fonctionnel']));
  expect(names).not.toContain('Accessibility');
  await expect(cases.locator('.multi-cell[data-col="2"] .cases-group[data-group="Security"] .cases-name')).toHaveText('Sécurité');
  const tags = await cases.locator('.case .tag').allTextContents();
  expect(tags).toContain('Proposé');
  expect(tags).not.toContain('Proposed');
});

test('printing the comparison from dark mode prints light cards and gives dark mode back after (#1637)', async ({ page }) => {
  await signIn(page, recordsWith(true), '/qa-review.html?comparison=cmp1', { saved: [], deleted: [], pdf: [] });
  const box = page.locator('#multi-overlay');
  await expect(box.locator('.multi-sec[data-sec="health"] .multi-cell').first()).toBeVisible({ timeout: 20000 });
  await page.evaluate(() => window.SiteTheme.apply(true, false));
  const light = () => page.evaluate(() => {
    const card = document.querySelector('#multi-overlay .multi-sec[data-sec="security"] .multi-cell .card');
    const [r, g, b] = getComputedStyle(card).color.match(/\d+/g).map(Number);
    return { dark: document.documentElement.classList.contains('dark-mode'), ink: (r + g + b) / 3 };
  });
  expect((await light()).ink).toBeGreaterThan(150);

  await page.evaluate(() => { window.print = () => { window.printedDark = document.documentElement.classList.contains('dark-mode'); }; });
  await box.getByRole('button', { name: 'Print', exact: true }).click();
  expect(await page.evaluate(() => window.printedDark)).toBe(false);
  await page.emulateMedia({ media: 'print' });
  const printed = await light();
  expect(printed.dark).toBe(false);
  expect(printed.ink).toBeLessThan(100);
  await page.emulateMedia({ media: 'screen' });
  await page.evaluate(() => window.dispatchEvent(new Event('afterprint')));
  expect((await light()).dark).toBe(true);

  await page.evaluate(() => window.dispatchEvent(new Event('beforeprint')));
  expect((await light()).dark).toBe(false);
  await page.evaluate(() => window.dispatchEvent(new Event('afterprint')));
  expect((await light()).dark).toBe(true);
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
  const frostCases = box.locator('.multi-sec[data-sec="cases"] .multi-cell[data-col="2"]');
  await expect(frostCases.locator('.case strong .fade-line').first()).toBeAttached();
  await expect(frostCases.locator('.cases-sum .fade-line, .cases-group h3 .fade-line')).toHaveCount(0);
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
  const filters = box.locator('.multi-sec[data-sec="findings"] .multi-filters button');
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
  const card = page.locator('#multi-overlay .multi-sec[data-sec="exec"] .multi-cell[data-col="0"]').locator('[data-slot="exec"]');
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
