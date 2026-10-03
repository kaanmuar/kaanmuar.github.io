const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const { root, startLoadServer } = require('./load-server');

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

function assertResults(file) {
  const rows = parseCsv(fs.readFileSync(file, 'utf8'));
  const header = rows[0];
  const elapsedAt = header.indexOf('elapsed');
  const successAt = header.indexOf('success');
  const samples = rows.slice(1);
  if (elapsedAt < 0 || successAt < 0 || !samples.length) {
    console.error('JMeter did not record samples.');
    return 1;
  }
  const elapsed = samples.map((row) => Number(row[elapsedAt])).filter((n) => !Number.isNaN(n)).sort((a, b) => a - b);
  const failed = samples.filter((row) => row[successAt] !== 'true').length;
  const p95 = elapsed[Math.min(elapsed.length - 1, Math.ceil(elapsed.length * 0.95) - 1)];
  const failRate = failed / samples.length;
  console.log('JMeter samples ' + samples.length + ', failed ' + failed + ', p95 ' + p95 + ' ms');
  if (failRate >= 0.01 || p95 > 2500) {
    console.error('JMeter thresholds failed: failed requests must stay under 1% and p95 must stay under 2500 ms.');
    return 1;
  }
  return 0;
}

async function main() {
  let started;
  try {
    started = await startLoadServer(Number(process.env.TEST_PORT || 8767));
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }
  const outDir = path.join(root, 'jmeter-results');
  fs.mkdirSync(outDir, { recursive: true });
  const results = path.join(outDir, 'results.jtl');
  if (fs.existsSync(results)) fs.unlinkSync(results);
  const url = new URL(started.base);
  const child = spawn('jmeter', [
    '-n',
    '-t', 'jmeter/load.jmx',
    '-l', results,
    '-j', path.join(outDir, 'jmeter.log'),
    '-JHOST=' + url.hostname,
    '-JPORT=' + url.port,
    '-JCSV=' + path.join(root, 'jmeter', 'pages.csv'),
    '-Jjmeter.save.saveservice.output_format=csv',
    '-Jjmeter.save.saveservice.print_field_names=true'
  ], { cwd: root, stdio: 'inherit' });
  const code = await new Promise((resolve) => {
    child.on('error', (err) => {
      if (err.code === 'ENOENT') console.error('JMeter is not installed. Install Java and JMeter, then rerun npm run test:jmeter.');
      else console.error(err.message);
      resolve(1);
    });
    child.on('close', (status) => resolve(status == null ? 1 : status));
  });
  started.server.close();
  if (code !== 0) process.exit(code);
  process.exit(assertResults(results));
}

main();
