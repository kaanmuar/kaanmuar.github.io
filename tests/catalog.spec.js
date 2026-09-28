const { test, expect } = require('@playwright/test');
const { catalog } = require('./native/cases');
const { record, reset } = require('./native/summary');

const wanted = new Set(String(process.env.CATALOG_IDS || '').split(',').map((item) => item.trim()).filter(Boolean));
const rows = catalog.filter((row) => !wanted.size || wanted.has(row.id));

test.use({ locale: 'en-US' });
test.describe.configure({ mode: 'serial' });
test.beforeAll(() => { reset('Playwright'); });

for (const row of rows) {
  test(row.id + ' ' + row.title, async ({ page }, testInfo) => {
    test.setTimeout(120000);
    await page.setViewportSize(row.phone ? { width: 390, height: 844 } : { width: 1280, height: 800 });
    await page.goto('/' + row.path);
    await page.evaluate(() => {
      sessionStorage.setItem('hasSeenTour', 'true');
      sessionStorage.setItem('hasSeenStudioTour', 'true');
      sessionStorage.setItem('hasSeenLabTour', 'true');
      localStorage.setItem('qa-lab-fw-asked', '1');
      localStorage.setItem('theme', 'light');
    });
    await page.reload();
    await page.addScriptTag({ path: 'js/catalog-checks.js' });
    const message = await page.evaluate(async (id) => {
      const check = window.CatalogChecks && window.CatalogChecks[id];
      if (!check) return 'FAIL: missing ' + id;
      try { return String(await check() || 'ok'); }
      catch (err) { return 'FAIL: ' + (err && err.message ? err.message : err); }
    }, row.id);
    const ok = !String(message).startsWith('FAIL:');
    record('Playwright', {
      title: row.id + ' ' + row.title,
      state: ok ? 'passed' : 'failed',
      duration: testInfo.duration,
      err: ok ? null : { message: String(message) }
    });
    expect(ok, String(message)).toBeTruthy();
  });
}
