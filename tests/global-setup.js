const { assertStaticServer } = require('../scripts/static-server-check');

module.exports = async () => {
  if (!process.env.PLAYWRIGHT_BASE_URL) await assertStaticServer(process.env.TEST_PORT || '8765');
};
