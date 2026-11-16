const { BROWSER_CASES } = require('../tests/native/cases');
const { launch, runCheck, failure } = require('../tests/native/pw-library');
const { recordCase, reset } = require('../tests/native/summary');

jest.setTimeout(120000);

describe('Jest · CV regression lab catalog', () => {
  let browser;

  beforeAll(async () => {
    reset('Jest');
    browser = await launch();
  });

  afterAll(async () => {
    if (browser) await browser.close();
  });

  test.each(BROWSER_CASES.map((row) => [row.id + ' ' + row.title, row]))('%s', async (title, row) => {
    const started = Date.now();
    let message;
    try {
      message = await runCheck(browser, row);
    } catch (err) {
      message = 'FAIL: ' + (err && err.message ? err.message : err);
    }
    const reason = failure(message);
    recordCase('Jest', title, !reason, Date.now() - started, reason);
    expect(reason).toBe('');
  });
});
