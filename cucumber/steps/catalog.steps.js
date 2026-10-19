const assert = require('node:assert/strict');
const { Given, When, Then, BeforeAll, AfterAll, After, setDefaultTimeout } = require('@cucumber/cucumber');
const { launch, openPage, runCheckOn, failure } = require('../../tests/native/pw-library');
const { recordCase, reset } = require('../../tests/native/summary');

setDefaultTimeout(120000);

let browser;

BeforeAll(async function () {
  reset('Cucumber');
  browser = await launch();
});

AfterAll(async function () {
  if (browser) await browser.close();
});

After(async function ({ pickle, result }) {
  if (this.context) await this.context.close();
  if (!result || result.status === 'SKIPPED') return;
  const ms = result.duration ? Math.round(Number(result.duration.seconds || 0) * 1000 + Number(result.duration.nanos || 0) / 1e6) : 0;
  const ok = result.status === 'PASSED';
  recordCase('Cucumber', pickle.name, ok, ms, ok ? '' : String(result.message || result.status).split('\n')[0]);
});

Given('the page {string} is open on a {word} screen', async function (file, screen) {
  const opened = await openPage(browser, file, screen === 'phone');
  this.context = opened.context;
  this.page = opened.page;
});

When('the catalog check {string} runs', async function (id) {
  this.message = await runCheckOn(this.page, id);
});

Then('the check passes', function () {
  assert.equal(failure(this.message), '', this.message);
});
