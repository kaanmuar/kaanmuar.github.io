const assert = require('node:assert/strict');
const { BROWSER_CASES } = require('../tests/native/cases');
const { launch, runCheck, failure } = require('../tests/native/pw-library');
const { record, reset } = require('../tests/native/summary');

describe('Mocha · CV regression lab catalog', function () {
  this.timeout(120000);
  let browser;

  before(async function () {
    reset('Mocha');
    browser = await launch();
  });

  after(async function () {
    if (browser) await browser.close();
  });

  afterEach(function () {
    record('Mocha', this.currentTest);
  });

  BROWSER_CASES.forEach((row) => {
    it(row.id + ' ' + row.title, async function () {
      const message = await runCheck(browser, row);
      assert.equal(failure(message), '', message);
    });
  });
});
