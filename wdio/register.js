const { CASES } = require('../tests/native/cases');
const { ensureServer } = require('../tests/native/server');
const { record } = require('../tests/native/summary');
const { wdioSession } = require('./session');

function register(layer, framework) {
  const items = CASES.filter((item) => item.layer === layer);
  if (!items.length) return;
  describe(framework + ' ' + layer, function () {
    before(async function () {
      await ensureServer();
    });
    afterEach(function () {
      record(framework, this.currentTest);
    });
    items.forEach((item) => {
      it(item.id + ' ' + item.title, async function () {
        await item.run(wdioSession());
      });
    });
  });
}

module.exports = { register };
