const { chromeBinary, chromeArgs } = require('../tests/native/chrome');
const { BASE } = require('../tests/native/server');

async function applyViewport(width, height, mobile) {
  if (process.env.APPIUM_DEVICE) return;
  const name = String(process.env.TARGET_BROWSER || 'chrome').toLowerCase();
  if (name === 'chrome' || name === 'edge' || name === 'chromium') {
    try {
      if (mobile) await browser.cdp('Emulation', 'setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: true });
      else await browser.cdp('Emulation', 'clearDeviceMetricsOverride');
    } catch (err) { /* non-chrome drivers use the window size */ }
  }
  try { await browser.setWindowSize(width, height); } catch (err) { /* device viewport */ }
}

function wdioSession() {
  return {
    async open(file) {
      await browser.url(BASE + '/' + file);
      await browser.execute(() => {
        sessionStorage.setItem('hasSeenTour', 'true');
        sessionStorage.setItem('hasSeenStudioTour', 'true');
        sessionStorage.setItem('hasSeenLabTour', 'true');
        localStorage.setItem('qa-lab-fw-asked', '1');
        localStorage.setItem('theme', 'light');
      });
      await browser.url(BASE + '/' + file);
    },
    async reload() {
      await browser.refresh();
    },
    async title() {
      return browser.getTitle();
    },
    async text(selector) {
      const el = await $(selector);
      await el.waitForExist({ timeout: 8000 });
      return el.getText();
    },
    async attr(selector, name) {
      return $(selector).getAttribute(name);
    },
    async click(selector) {
      await browser.execute((sel) => document.querySelector(sel).click(), selector);
    },
    async count(selector) {
      return (await $$(selector)).length;
    },
    async displayed(selector) {
      const found = await $$(selector);
      if (!found.length) return false;
      return found[0].isDisplayed();
    },
    async execute(script) {
      return browser.execute((body) => {
        (0, eval)(body);
        return true;
      }, script);
    },
    async setPhone() {
      await applyViewport(390, 844, true);
    },
    async setDesktop() {
      await applyViewport(1280, 800, false);
    },
    async runCatalog(id) {
      await browser.waitUntil(async () => browser.execute(
        () => document.readyState === 'complete' && (!!window.CarlosMunozCV || !!document.getElementById('login-overlay') || !!document.getElementById('runBtn') || !!document.querySelector('h1'))
      ), { timeout: 15000 });
      const loaded = await browser.executeAsync((src, done) => {
        if (window.CatalogChecks) { done(true); return; }
        const script = document.createElement('script');
        script.src = src;
        script.onload = () => done(!!window.CatalogChecks);
        script.onerror = () => done(false);
        document.head.appendChild(script);
      }, BASE + '/js/catalog-checks.js');
      if (!loaded) throw new Error('catalog-checks.js did not load');
      const message = await browser.executeAsync((caseId, done) => {
        const check = window.CatalogChecks && window.CatalogChecks[caseId];
        if (!check) { done('FAIL: missing ' + caseId); return; }
        Promise.resolve(check()).then((msg) => done(String(msg || 'ok'))).catch((err) => {
          done('FAIL: ' + (err && err.message ? err.message : err));
        });
      }, id);
      if (String(message).indexOf('FAIL:') === 0) throw new Error(String(message).slice(5).trim());
    }
  };
}

function chromeCaps(width, height) {
  const binary = chromeBinary();
  const options = { args: chromeArgs(width, height) };
  if (binary) options.binary = binary;
  return {
    browserName: 'chrome',
    'goog:chromeOptions': options
  };
}

module.exports = { wdioSession, chromeCaps, BASE };
