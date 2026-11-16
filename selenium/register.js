const { CASES } = require('../tests/native/cases');
const { openSession, closeSession, session } = require('./session');
const { record, reset } = require('../tests/native/summary');
let cleared = false;

function register(layer) {
  const items = CASES.filter((item) => item.layer === layer);
  if (!items.length) return;
  describe('Selenium WebDriver ' + layer, function () {
    this.timeout(120000);
    before(async function () {
      if (!cleared) {
        reset('Selenium');
        cleared = true;
      }
      await openSession();
    });
    after(async function () {
      await closeSession();
    });
    afterEach(function () {
      record('Selenium', this.currentTest);
    });
    items.forEach((item) => {
      it(item.id + ' ' + item.title, async function () {
        await item.run(session());
      });
    });
  });
}

module.exports = { register };
