const assert = require('node:assert/strict');
const { BROWSER_CASES } = require('../tests/native/cases');
const { prime, failure, BASE } = require('../tests/native/pw-library');

Feature('CodeceptJS · CV regression lab catalog');

async function runInPage({ id, src }) {
  const started = Date.now();
  const ready = () => document.readyState === 'complete' && (!!window.CarlosMunozCV || !!document.getElementById('login-overlay') || !!document.getElementById('runBtn') || !!document.querySelector('h1'));
  while (!ready()) {
    if (Date.now() - started > 15000) return 'FAIL: the page did not finish loading';
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  if (!window.CatalogChecks) {
    const loaded = await new Promise((resolve) => {
      const script = document.createElement('script');
      script.src = src;
      script.onload = () => resolve(true);
      script.onerror = () => resolve(false);
      document.head.appendChild(script);
    });
    if (!loaded) return 'FAIL: catalog-checks.js did not load';
  }
  const check = window.CatalogChecks && window.CatalogChecks[id];
  if (!check) return 'FAIL: missing ' + id;
  try { return String(await check() || 'ok'); } catch (err) { return 'FAIL: ' + (err && err.message ? err.message : err); }
}

BROWSER_CASES.forEach((row) => {
  Scenario(row.id + ' ' + row.title, async ({ I }) => {
    if (row.phone) I.resizeWindow(390, 844);
    else I.resizeWindow(1280, 800);
    I.amOnPage('/' + row.path);
    I.executeScript(prime);
    I.refreshPage();
    const message = String(await I.executeScript(runInPage, { id: row.id, src: BASE + '/js/catalog-checks.js' }));
    assert.equal(failure(message), '', message);
  });
});
