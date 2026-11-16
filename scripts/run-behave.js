const fs = require('fs');
const path = require('path');
const { root, clearSummary, wantedIds, run, finish, missing } = require('./native-tool');

async function main() {
  clearSummary('Behave');
  const venv = path.join(root, '.venv-behave');
  const behave = path.join(venv, 'bin', 'behave');
  if (!fs.existsSync(behave)) {
    const made = await run('python3', ['-m', 'venv', venv]);
    if (made.missing) missing('Behave', 'Python 3 is not installed. Install Python 3.9 or later, then rerun npm run test:behave.');
    const pip = await run(path.join(venv, 'bin', 'pip'), ['install', '-q', '-r', 'behave/requirements.txt']);
    if (pip.code) missing('Behave', 'pip could not install behave/requirements.txt.');
  }
  const args = ['behave/features', '--no-capture', '--no-color', '--no-skipped', '--format', 'plain'];
  const ids = wantedIds();
  if (ids.length) args.push('--tags', ids.map((id) => '@' + id).join(' or '));
  const result = await run(behave, args);
  finish('Behave', result.code);
}

main();
