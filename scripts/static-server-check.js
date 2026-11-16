const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

function same(a, b) {
  try {
    return fs.realpathSync(a) === fs.realpathSync(b);
  } catch (e) {
    return false;
  }
}

// The suites reuse whatever already listens on the test port. A plain `python3 -m http.server`
// left there resets parallel requests, so pages hang instead of failing; refuse it up front.
// Worktrees under .worktrees/ share the port, so a lab server must also serve this checkout.
async function assertStaticServer(port, root = ROOT) {
  const url = 'http://127.0.0.1:' + port + '/';
  let res;
  try {
    res = await fetch(url, { method: 'HEAD' });
  } catch (e) {
    return;
  }
  const lab = res.headers.get('x-static-server') === 'lab';
  const served = decodeURIComponent(res.headers.get('x-static-root') || '');
  if (lab && served && same(served, root)) return;
  let held = 'a server other than scripts/static-server.py';
  if (lab) held = served ? 'scripts/static-server.py for another checkout (' + served + ')' : 'an older scripts/static-server.py that does not say which checkout it serves';
  throw new Error(
    'Port ' + port + ' is held by ' + held + ', and the tests would reuse it. ' +
    'Stop it (lsof -iTCP:' + port + ' -sTCP:LISTEN) or pick a free port with TEST_PORT.'
  );
}

module.exports = { assertStaticServer };
