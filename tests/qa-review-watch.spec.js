const fs = require('fs');
const path = require('path');
const { test, expect } = require('./net-guard');
const watchCases = require('../functions/url-review-watch');
const sample = { frameworks: require('../functions/url-review-core').FRAMEWORKS, report: require('./unit/fixtures/review-carlosandmunoz.json') };

const TERMS = fs.readFileSync(path.join(__dirname, '../js/qa-review.js'), 'utf8').match(/TERMS_VERSION = "([^"]+)"/)[1];
const ID = 'ab12cd34ef56';
// Phone and desktop screenshots for review: WATCH_SHOTS=<dir> npx playwright test tests/qa-review-watch.spec.js
const SHOTS = process.env.WATCH_SHOTS || '';
const PHONE = { width: 390, height: 844 };
const DESKTOP = { width: 1280, height: 800 };

const HOST = 'carlosandmunoz.com';
let seq = 0;
const finding = (key, verdict, extra) => Object.assign({ id: 'F-' + String(++seq).padStart(2, '0'), key, area: 'Security', verdict, severity: verdict === 'fail' ? 'high' : 'medium', title: key }, extra);
const FINDINGS = [
  finding('sec-threatlists', 'fail'),
  finding('sec-lookalike', 'fail'),
  finding('sec-exposed-env', 'fail', { pages: ['/.env'] }),
  finding('sec-dmarc', 'risk'),
  finding('sec-blocklist-0', 'fail'),
  finding('sec-csp', 'risk'),
  finding('sec-tls', 'risk'),
  finding('a11y-contrast', 'fail', { area: 'Accessibility', pages: ['/contact'] })
];
const EXTRAS = {
  threatLists: { host: HOST, sources: [{ source: 'urlhaus', ok: true, listed: true, delist: 'https://urlhaus.abuse.ch/host/carlosandmunoz.com/' }] },
  lookalikes: { domain: HOST, checked: 120, found: 1, rows: [{ domain: 'carlosandmunos.com', web: true, mx: false }] },
  dns: { domain: HOST, mailAuth: { spfRecords: 1, lookups: 4 }, blocklists: { domain: HOST, targets: [{ ip: '192.0.2.10', hosts: ['mx1.improvmx.com'], web: false }], listed: [{ list: 'spamcop', target: '192.0.2.10', codes: ['127.0.0.2'] }] } },
  tls: { validTo: '2026-11-25', daysLeft: 15 }
};
const WATCH = Object.assign(watchCases.build(FINDINGS, EXTRAS, { host: HOST, base: 'https://' + HOST, browser: null }), {
  regressions: [{ id: 'RG-01', key: 'sec-hsts', title: 'HSTS is sent', before: 'fail', after: 'pass', cases: [], kind: 'headers', tools: ['OWASP ZAP'], data: { keys: ['sec-hsts'] } }]
});

async function open(page, { lang = 'en', paid = true, viewport = PHONE } = {}) {
  await page.setViewportSize(viewport);
  const report = Object.assign({}, sample.report, { id: ID, watch: paid ? WATCH : watchCases.preview(WATCH) });
  await page.addInitScript(({ version, lang }) => {
    try {
      sessionStorage.setItem('qa-review-terms', version);
      localStorage.setItem('hasSeenReviewTour', 'true');
      localStorage.setItem('qa-review-analytics', 'necessary');
      localStorage.setItem('cv-preferred-lang', lang);
    } catch (e) { /* storage is optional */ }
  }, { version: TERMS, lang });
  await page.route(/ipwho\.is/, (route) => route.fulfill({ contentType: 'application/json', body: '{"success":false}' }));
  await page.route('http://127.0.0.1:8768/**', async (route) => {
    const req = route.request();
    const where = new URL(req.url()).pathname;
    const cors = { 'access-control-allow-origin': req.headers().origin || '*', 'access-control-allow-credentials': 'true', 'access-control-allow-headers': 'content-type' };
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: Object.assign({ 'access-control-allow-methods': 'GET,POST' }, cors) });
    const json = (data) => route.fulfill({ status: 200, contentType: 'application/json', headers: cors, body: JSON.stringify(data) });
    if (where === '/review/open') return json({ report, frameworks: sample.frameworks, paid });
    return json(where === '/auth/providers' ? { providers: [{ id: 'email' }] } : { items: [] });
  });
  await page.goto((lang === 'en' ? '/qa-review.html' : '/qa-review-' + lang + '.html') + '?report=' + ID);
  const section = page.locator('#watch-cases');
  await expect(section).toBeVisible();
  return section;
}

async function shot(page, section, name) {
  if (!SHOTS) return;
  await section.evaluate((el) => { el.scrollIntoView({ block: 'start' }); const over = document.getElementById('dash-overlay'); if (over) over.scrollBy(0, -(window.innerWidth < 700 ? 84 : 52)); });
  await page.screenshot({ path: path.join(SHOTS, name) });
}

test.describe('Keep it clean: watch cases in the Cases card (#3391)', () => {
  test('a paid report lists one retest per open finding, the tool groups, the fixed pin and the scripts', async ({ page }) => {
    const section = await open(page);
    await expect(section.locator('#watch-title')).toHaveText(/^Keep it clean: retests/);
    const kinds = await section.locator('.watch-case').evaluateAll((rows) => rows.map((row) => row.dataset.kind));
    expect(kinds).toEqual(WATCH.cases.map((c) => c.kind).concat('regression'));
    await expect(section.locator('.watch-tools .fw-logo')).toHaveCount(8);
    await expect(section.locator('[data-kind="lists"] a[href="https://urlhaus.abuse.ch/host/carlosandmunoz.com/"]')).toBeVisible();
    await expect(section.locator('[data-kind="lookalike"]')).toContainText('carlosandmunos.com');
    await expect(section.locator('[data-kind="exposed"]')).toContainText('/.env');
    await expect(section.locator('.watch-pin')).toContainText('HSTS is sent');
    const [download] = await Promise.all([page.waitForEvent('download'), section.locator('#watch-download').click()]);
    expect(download.suggestedFilename()).toBe('qa-lab-watch-' + ID + '.zip');
    const zip = fs.readFileSync(await download.path()).toString('latin1');
    ['dig/qa-lab-dns.sh', 'zap/zap-baseline.sh', 'nuclei/nuclei.sh', 'axe/qa-lab-axe.spec.js', 'pa11y/.pa11yci.json', '.github/workflows/qa-lab-watch.yml'].forEach((file) => expect(zip).toContain(file));
  });

  test('an unpaid preview names the retests but shows no hosts, links or scripts', async ({ page }) => {
    const section = await open(page, { paid: false });
    await expect(section.locator('.watch-case').first()).toBeVisible();
    await expect(section.locator('a[href*="urlhaus"]')).toHaveCount(0);
    await expect(section).not.toContainText('carlosandmunos.com');
    await expect(section.locator('#watch-download')).toHaveCount(0);
  });

  test('on a phone the subsection fits the screen, in the page language', async ({ page }) => {
    const section = await open(page, { lang: 'es' });
    await expect(section.locator('#watch-title')).toHaveText(/^Mantenerlo limpio: repruebas/);
    expect(await section.evaluate((el) => el.scrollWidth > el.clientWidth + 1)).toBe(false);
    const box = await section.boundingBox();
    expect(box.x + box.width).toBeLessThanOrEqual(PHONE.width);
    await shot(page, section, 'watch-cases-phone-es.png');
    const en = await open(page, { lang: 'en' });
    await shot(page, en, 'watch-cases-phone-en.png');
    await en.locator('.watch-pin').evaluate((el) => el.scrollIntoView({ block: 'center' }));
    if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'watch-cases-phone-pins-en.png') });
  });

  test('on a desktop the subsection fits the Cases card', async ({ page }) => {
    const section = await open(page, { viewport: DESKTOP });
    expect(await section.evaluate((el) => el.scrollWidth > el.clientWidth + 1)).toBe(false);
    await shot(page, section, 'watch-cases-desktop-en.png');
  });
});
