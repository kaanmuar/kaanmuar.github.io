// The suites reuse whatever already listens on the test port. A plain `python3 -m http.server`
// left there resets parallel requests, so pages hang instead of failing; refuse it up front.
async function assertStaticServer(port) {
  const url = 'http://127.0.0.1:' + port + '/';
  let res;
  try {
    res = await fetch(url, { method: 'HEAD' });
  } catch (e) {
    return;
  }
  if (res.headers.get('x-static-server') === 'lab') return;
  throw new Error(
    'Port ' + port + ' is held by a server other than scripts/static-server.py, and the tests would reuse it. ' +
    'Stop it (lsof -iTCP:' + port + ' -sTCP:LISTEN) or pick a free port with TEST_PORT.'
  );
}

module.exports = { assertStaticServer };
