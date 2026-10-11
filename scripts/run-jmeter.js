const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const { root, startLoadServer } = require('./load-server');
const { selectedPages, casesFromSamples, writeSummary } = require('./load-summary');

function parseCsv(text) {
  return text.trim().split(/\n/).filter(Boolean).map((line) => {
    const cells = [];
    let cur = '';
    let quoted = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') quoted = !quoted;
      else if (ch === ',' && !quoted) {
        cells.push(cur);
        cur = '';
      } else cur += ch;
    }
    cells.push(cur);
    return cells;
  });
}

function samplesFromJtl(file) {
  const rows = parseCsv(fs.readFileSync(file, 'utf8'));
  const header = rows[0] || [];
  const elapsedAt = header.indexOf('elapsed');
  const successAt = header.indexOf('success');
  const labelAt = header.indexOf('label');
  return rows.slice(1).map((row) => ({
    id: labelAt >= 0 ? row[labelAt] : '',
    ms: Number(row[elapsedAt]),
    ok: row[successAt] === 'true'
  })).filter((sample) => sample.id);
}

async function main() {
  const pages = selectedPages();
  console.log('JMeter · 8 virtual users · 20 seconds · ' + pages.length + ' requests in the plan');
  if (!pages.length) {
    console.log('No performance cases in this selection.');
    writeSummary('JMeter', []);
    return;
  }
  let started;
  try {
    started = await startLoadServer(Number(process.env.TEST_PORT || 8767));
  } catch (err) {
    console.error(err.message);
    writeSummary('JMeter', [{ title: 'JMeter', ok: false, ms: 0, error: err.message }]);
    process.exit(1);
  }
  const outDir = path.join(root, 'jmeter-results');
  fs.mkdirSync(outDir, { recursive: true });
  const results = path.join(outDir, 'results.jtl');
  if (fs.existsSync(results)) fs.unlinkSync(results);
  const csv = path.join(outDir, 'pages.csv');
  fs.writeFileSync(csv, 'path,marker,id\n' + pages.map((page) => '"' + page.path + '","' + page.marker + '","' + page.id + '"').join('\n') + '\n');
  const url = new URL(started.base);
  const code = await new Promise((resolve) => {
    const child = spawn('jmeter', [
      '-n',
      '-t', 'jmeter/load.jmx',
      '-l', results,
      '-j', path.join(outDir, 'jmeter.log'),
      '-JHOST=' + url.hostname,
      '-JPORT=' + url.port,
      '-JCSV=' + csv,
      '-Jjmeter.save.saveservice.output_format=csv',
      '-Jjmeter.save.saveservice.print_field_names=true'
    ], { cwd: root, stdio: 'inherit' });
    child.on('error', (err) => {
      const message = err.code === 'ENOENT'
        ? 'JMeter is not installed. Install Java and JMeter, then rerun npm run test:jmeter.'
        : err.message;
      console.error(message);
      writeSummary('JMeter', [{ title: 'JMeter', ok: false, ms: 0, error: message }]);
      resolve(1);
    });
    child.on('close', (status) => resolve(status == null ? 1 : status));
  });
  if (!started.reused) started.server.close();
  if (!fs.existsSync(results)) {
    if (code === 0) writeSummary('JMeter', [{ title: 'JMeter', ok: false, ms: 0, error: 'JMeter did not record samples.' }]);
    process.exit(code || 1);
  }
  const cases = casesFromSamples(samplesFromJtl(results));
  writeSummary('JMeter', cases);
  cases.forEach((row) => console.log((row.ok ? 'PASS' : 'FAIL') + ' ' + row.title + ' · p95 ' + row.ms + ' ms' + (row.error ? ' · ' + row.error : '')));
  const failed = cases.filter((row) => !row.ok).length;
  process.exit(code !== 0 || failed ? 1 : 0);
}

main();
