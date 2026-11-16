const path = require('path');
const { ensureServer, BASE } = require('../tests/native/server');
const { recordCase, reset } = require('../tests/native/summary');

exports.config = {
  name: 'cv-regression-lab',
  tests: './catalog_test.js',
  output: path.join(__dirname, '..', 'codeceptjs-results'),
  helpers: {
    Playwright: {
      url: BASE,
      browser: process.env.PW_BROWSER || 'chromium',
      show: false,
      windowSize: '1280x800',
      locale: 'en-US',
      waitForTimeout: 15000,
      ...(process.env.PW_CHANNEL ? { chromium: { channel: process.env.PW_CHANNEL } } : {})
    }
  },
  async bootstrap() {
    await ensureServer();
    reset('CodeceptJS');
    const { event } = require('codeceptjs');
    event.dispatcher.on(event.test.passed, (test) => recordCase('CodeceptJS', test.title, true, test.duration || 0, ''));
    event.dispatcher.on(event.test.failed, (test, err) => recordCase('CodeceptJS', test.title, false, test.duration || 0, String((err && err.message) || 'failed')));
  }
};
