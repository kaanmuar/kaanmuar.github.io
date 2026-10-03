const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const { root, startLoadServer } = require('./load-server');

async function main() {
  let started;
  try {
    started = await startLoadServer(Number(process.env.TEST_PORT || 8767));
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }
  const outDir = path.join(root, 'k6-results');
  fs.mkdirSync(outDir, { recursive: true });
  const child = spawn('k6', ['run', '--summary-export', path.join(outDir, 'summary.json'), 'k6/load.js'], {
    cwd: root,
    stdio: 'inherit',
    env: Object.assign({}, process.env, { BASE_URL: started.base })
  });
  const code = await new Promise((resolve) => {
    child.on('error', (err) => {
      if (err.code === 'ENOENT') console.error('k6 is not installed. Install it from https://k6.io and rerun npm run test:k6.');
      else console.error(err.message);
      resolve(1);
    });
    child.on('close', (status) => resolve(status == null ? 1 : status));
  });
  started.server.close();
  process.exit(code);
}

main();
