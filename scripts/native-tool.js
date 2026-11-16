const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const resultsDir = path.join(root, 'runner-results');

function summaryFile(framework) {
  return path.join(resultsDir, framework + '.json');
}

function clearSummary(framework) {
  fs.mkdirSync(resultsDir, { recursive: true });
  fs.rmSync(summaryFile(framework), { force: true });
}

function writeSummary(framework, cases) {
  fs.mkdirSync(resultsDir, { recursive: true });
  fs.writeFileSync(summaryFile(framework), JSON.stringify({ framework, cases: cases || [] }, null, 2));
}

function writeFailure(framework, message) {
  writeSummary(framework, [{ title: framework, ok: false, ms: 0, error: message }]);
}

function wantedIds() {
  return String(process.env.CATALOG_IDS || '').split(',').map((item) => item.trim()).filter(Boolean);
}

function run(cmd, args, options) {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, Object.assign({ cwd: root, stdio: 'inherit', env: process.env }, options || {}));
    child.on('error', (err) => resolve({ code: 1, missing: err.code === 'ENOENT', error: err.message }));
    child.on('close', (code) => resolve({ code: code == null ? 1 : code, missing: false }));
  });
}

function capture(cmd, args) {
  return new Promise((resolve) => {
    let out = '';
    const child = spawn(cmd, args, { cwd: root, env: process.env });
    child.stdout.on('data', (buf) => { out += buf; });
    child.stderr.on('data', (buf) => { out += buf; });
    child.on('error', () => resolve(null));
    child.on('close', (code) => resolve(code === 0 ? out.trim() : null));
  });
}

function finish(framework, code) {
  if (!fs.existsSync(summaryFile(framework))) {
    writeFailure(framework, framework + ' stopped before it wrote results (exit ' + code + ').');
  }
  process.exit(code);
}

function missing(framework, message) {
  console.error(message);
  writeFailure(framework, message);
  process.exit(1);
}

module.exports = { root, resultsDir, summaryFile, clearSummary, writeSummary, writeFailure, wantedIds, run, capture, finish, missing };
