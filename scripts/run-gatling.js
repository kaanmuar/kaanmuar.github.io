const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const { startLoadServer } = require('./load-server');
const { root, selectedPages, casesFromSamples, writeSummary } = require('./load-summary');

function latestSimulationLog() {
  const dir = path.join(root, 'gatling', 'target', 'gatling');
  if (!fs.existsSync(dir)) return '';
  const files = [];
  fs.readdirSync(dir).forEach((name) => {
    const file = path.join(dir, name, 'simulation.log');
    if (fs.existsSync(file)) files.push(file);
  });
  files.sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
  return files[0] || '';
}

function samplesFromLog(file) {
  return fs.readFileSync(file, 'utf8').split(/\n/).map((line) => line.split('\t')).filter((parts) => parts[0] === 'REQUEST' && parts.length >= 7).map((parts) => ({
    id: parts[3],
    ms: Number(parts[5]) - Number(parts[4]),
    ok: parts[6] === 'OK'
  }));
}

async function main() {
  const pages = selectedPages();
  console.log('Gatling · 8 virtual users · 20 seconds · ' + pages.length + ' requests in the plan');
  if (!pages.length) {
    console.log('No performance cases in this selection.');
    writeSummary('Gatling', []);
    return;
  }
  let started;
  try {
    started = await startLoadServer(Number(process.env.TEST_PORT || 8767));
  } catch (err) {
    console.error(err.message);
    writeSummary('Gatling', [{ title: 'Gatling', ok: false, ms: 0, error: err.message }]);
    process.exit(1);
  }
  const ids = [...new Set(pages.map((page) => page.id))].join(',');
  let toolError = '';
  const code = await new Promise((resolve) => {
    const child = spawn('mvn', [
      '-B',
      '-f', 'gatling/pom.xml',
      'gatling:test',
      '-Dgatling.simulationClass=CvLoad',
      '-DbaseUrl=' + started.base,
      '-DcatalogIds=' + ids
    ], { cwd: root, stdio: 'inherit' });
    child.on('error', (err) => {
      const message = err.code === 'ENOENT'
        ? 'Maven is not installed. Install Java and Maven, then rerun npm run test:gatling.'
        : err.message;
      console.error(message);
      toolError = message;
      writeSummary('Gatling', [{ title: 'Gatling', ok: false, ms: 0, error: message }]);
      resolve(1);
    });
    child.on('close', (status) => resolve(status == null ? 1 : status));
  });
  if (!started.reused) started.server.close();
  if (toolError) process.exit(1);
  const log = latestSimulationLog();
  const cases = log ? casesFromSamples(samplesFromLog(log)) : [];
  if (!cases.length && code !== 0) {
    writeSummary('Gatling', [{ title: 'Gatling', ok: false, ms: 0, error: 'Gatling did not record requests.' }]);
    process.exit(code);
  }
  writeSummary('Gatling', cases);
  cases.forEach((row) => console.log((row.ok ? 'PASS' : 'FAIL') + ' ' + row.title + ' · p95 ' + row.ms + ' ms' + (row.error ? ' · ' + row.error : '')));
  const failed = cases.filter((row) => !row.ok).length;
  process.exit(code !== 0 || failed ? 1 : 0);
}

main();
