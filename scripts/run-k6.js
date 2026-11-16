const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const { root, startLoadServer } = require('./load-server');
const { selectedPages, casesFromSamples, writeSummary } = require('./load-summary');

function samplesFromPoints(file) {
  const durations = [];
  const failed = [];
  fs.readFileSync(file, 'utf8').split('\n').forEach((line) => {
    if (!line) return;
    let row;
    try { row = JSON.parse(line); } catch (err) { return; }
    if (row.type !== 'Point' || !row.data || !row.data.tags || !row.data.tags.case) return;
    if (row.metric === 'http_req_duration') durations.push({ id: row.data.tags.case, ms: Number(row.data.value) });
    if (row.metric === 'http_req_failed') failed.push(Number(row.data.value) === 1);
  });
  return durations.map((sample, index) => ({ id: sample.id, ms: Math.round(sample.ms), ok: !failed[index] }));
}

async function main() {
  const pages = selectedPages();
  console.log('k6 · 8 virtual users · 20 seconds · ' + pages.length + ' requests in the plan');
  if (!pages.length) {
    console.log('No performance cases in this selection.');
    writeSummary('k6', []);
    return;
  }
  let started;
  try {
    started = await startLoadServer(Number(process.env.TEST_PORT || 8767));
  } catch (err) {
    console.error(err.message);
    writeSummary('k6', [{ title: 'k6', ok: false, ms: 0, error: err.message }]);
    process.exit(1);
  }
  const outDir = path.join(root, 'k6-results');
  fs.mkdirSync(outDir, { recursive: true });
  const points = path.join(outDir, 'points.json');
  fs.rmSync(points, { force: true });
  const code = await new Promise((resolve) => {
    const child = spawn('k6', ['run', '--summary-export', path.join(outDir, 'summary.json'), '--out', 'json=' + points, 'k6/load.js'], {
      cwd: root,
      stdio: 'inherit',
      env: Object.assign({}, process.env, { BASE_URL: started.base })
    });
    child.on('error', (err) => {
      const message = err.code === 'ENOENT'
        ? 'k6 is not installed. Install it from https://k6.io and rerun npm run test:k6.'
        : err.message;
      console.error(message);
      writeSummary('k6', [{ title: 'k6', ok: false, ms: 0, error: message }]);
      resolve(1);
    });
    child.on('close', (status) => resolve(status == null ? 1 : status));
  });
  if (!started.reused) started.server.close();
  if (!fs.existsSync(points)) {
    if (code === 0) writeSummary('k6', [{ title: 'k6', ok: false, ms: 0, error: 'k6 did not record samples.' }]);
    process.exit(code || 1);
  }
  const cases = casesFromSamples(samplesFromPoints(points));
  writeSummary('k6', cases);
  cases.forEach((row) => console.log((row.ok ? 'PASS' : 'FAIL') + ' ' + row.title + ' · p95 ' + row.ms + ' ms' + (row.error ? ' · ' + row.error : '')));
  const failedCases = cases.filter((row) => !row.ok).length;
  process.exit(code !== 0 || failedCases ? 1 : 0);
}

main();
