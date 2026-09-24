const fs = require('fs');
const path = require('path');

function skipSiteTours(page) {
  return page.addInitScript(() => {
    try {
      sessionStorage.setItem('hasSeenTour', 'true');
      sessionStorage.setItem('hasSeenLabTour', 'true');
      sessionStorage.setItem('hasSeenStudioTour', 'true');
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

async function runAxe(page, { exclude = [] } = {}) {
  const axePath = require.resolve('axe-core/axe.min.js');
  await page.addScriptTag({ path: axePath });
  return page.evaluate(async (excludeSelectors) => {
    const context = excludeSelectors.length ? { exclude: excludeSelectors.map((sel) => [sel]) } : document;
    return window.axe.run(context, {
      runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa'] },
      rules: { 'color-contrast': { enabled: false } }
    });
  }, exclude);
}

function axeSourceExists() {
  return fs.existsSync(path.join(__dirname, '../node_modules/axe-core/axe.min.js'));
}

module.exports = { prepareCV, waitForCVApp, skipSiteTours, openCV, openAdmin, forceGlancePair, runAxe, axeSourceExists };
