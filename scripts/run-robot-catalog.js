const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');

function run(cmd, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { cwd: root, stdio: 'inherit', env: process.env });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code) reject(new Error(cmd + ' exited ' + code));
      else resolve();
    });
  });
}

async function main() {
  const robot = path.join(root, '.venv-robot', 'bin', 'robot');
  if (!fs.existsSync(robot)) {
    await run('python3', ['-m', 'venv', path.join(root, '.venv-robot')]);
    await run(path.join(root, '.venv-robot', 'bin', 'pip'), ['install', '-q', '-r', 'requirements-robot.txt']);
  }
  const browser = process.env.ROBOT_BROWSER || 'chrome';
  const ids = String(process.env.ROBOT_IDS || process.env.CATALOG_IDS || '').split(',').map((item) => item.trim()).filter(Boolean);
  const args = [
    '--outputdir', path.join(root, 'robot-results'),
    '--variable', 'BROWSER:' + browser,
    '--variable', 'BASE:' + (process.env.BASE_URL || 'http://127.0.0.1:8765')
  ];
  if (ids.length) args.push('--include', ids.join('OR'));
  args.push(path.join(root, 'tests', 'robot', 'catalog.robot'));
  await run(robot, args);
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
