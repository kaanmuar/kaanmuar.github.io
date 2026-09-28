const net = require('net');
const { spawn } = require('child_process');

const PORT = Number(process.env.TEST_PORT || 8765);

function portOpen(port) {
  return new Promise((resolve) => {
    const socket = net.connect({ port, host: '127.0.0.1' }, () => {
      socket.end();
      resolve(true);
    });
    socket.on('error', () => resolve(false));
  });
}

async function ensureServer() {
  if (await portOpen(PORT)) return;
  const child = spawn('python3', ['-m', 'http.server', String(PORT)], {
    cwd: require('path').join(__dirname, '..', '..'),
    stdio: 'ignore',
    detached: true
  });
  child.unref();
  const start = Date.now();
  while (Date.now() - start < 8000) {
    if (await portOpen(PORT)) return;
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  throw new Error('Static server did not open on ' + PORT);
}

module.exports = { ensureServer, PORT, BASE: process.env.BASE_URL || ('http://127.0.0.1:' + PORT) };
