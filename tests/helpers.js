const fs = require('fs');
const path = require('path');

function skipSiteTours(page) {
  return page.addInitScript(() => {
    try {
      sessionStorage.setItem('hasSeenTour', 'true');
      sessionStorage.setItem('hasSeenLabTour', 'true');
      sessionStorage.setItem('hasSeenStudioTour', 'true');
      sessionStorage.setItem('qa-lab-fw-asked', '1');
    } catch (e) { /* ignore */ }
  });
}

async function prepareCV(page, { tour = false, theme = 'light' } = {}) {
  await page.addInitScript(({ tour, theme }) => {
    try {
      if (tour) sessionStorage.removeItem('hasSeenTour');
      else sessionStorage.setItem('hasSeenTour', 'true');
      sessionStorage.setItem('hasSeenLabTour', 'true');
      sessionStorage.setItem('hasSeenStudioTour', 'true');
      if (!localStorage.getItem('theme')) localStorage.setItem('theme', theme);
      localStorage.setItem('cv-preferred-lang', 'en');
    } catch (e) { /* ignore */ }
  }, { tour, theme });
}

async function waitForCVApp(page) {
  await page.locator('.main-container').waitFor({ state: 'visible' });
  await page.waitForFunction(() => !!(window.CarlosMunozCV && window.CarlosMunozCV.tourSteps));
}

async function openCV(page, options = {}) {
  await prepareCV(page, options);
  await page.goto('/index.html');
  await waitForCVApp(page);
}

async function openAdmin(page) {
  await page.goto('/admin.html');
}

async function forceGlancePair(page, index = 0) {
  await page.evaluate((i) => {
    if (window.CarlosMunozCV && typeof window.CarlosMunozCV._showGlancePair === 'function') {
      window.CarlosMunozCV._showGlancePair(i, false);
    }
  }, index);
}

async function runAxe(page, { exclude = [], include = '', contrast = false } = {}) {
  const axePath = require.resolve('axe-core/axe.min.js');
  await page.addScriptTag({ path: axePath });
  return page.evaluate(async ({ excludeSelectors, include, contrast }) => {
    const context = {};
    if (include) context.include = [[include]];
    if (excludeSelectors.length) context.exclude = excludeSelectors.map((sel) => [sel]);
    const target = include || excludeSelectors.length ? context : document;
    return window.axe.run(target, {
      runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa'] },
      rules: { 'color-contrast': { enabled: contrast } }
    });
  }, { excludeSelectors: exclude, include, contrast });
}

function axeSourceExists() {
  return fs.existsSync(path.join(__dirname, '../node_modules/axe-core/axe.min.js'));
}

module.exports = { prepareCV, waitForCVApp, skipSiteTours, openCV, openAdmin, forceGlancePair, runAxe, axeSourceExists };
