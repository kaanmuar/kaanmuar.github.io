const fs = require('fs');
const path = require('path');
const { root, clearSummary, writeSummary, wantedIds, run, finish, missing } = require('./native-tool');
const { ensureServer, BASE } = require('../tests/native/server');
const catalog = require('../tests/native/catalog.json');

function decode(value) {
  return String(value || '').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
}

function casesFromJunit(file, label) {
  const xml = fs.readFileSync(file, 'utf8');
  const cases = [];
  const pattern = /<testcase\b([^>]*?)(\/>|>([\s\S]*?)<\/testcase>)/g;
  let match;
  while ((match = pattern.exec(xml))) {
    const attrs = match[1];
    const body = match[3] || '';
    const name = decode((attrs.match(/\bname="([^"]*)"/) || [])[1]);
    const time = Number((attrs.match(/\btime="([^"]*)"/) || [])[1]) || 0;
    const failure = body.match(/<(failure|error)\b([^>]*)>?/);
    const message = failure ? decode((failure[2].match(/\bmessage="([^"]*)"/) || [])[1] || failure[1]) : '';
    if (/<skipped\b/.test(body)) continue;
    cases.push({ title: label + ' · ' + name, ok: !failure, ms: Math.round(time * 1000), error: message.slice(0, 300) });
  }
  return cases;
}

async function main() {
  clearSummary('Maestro');
  const ids = wantedIds();
  const phone = catalog.filter((row) => row.phone && (!ids.length || ids.includes(row.id)));
  console.log('Maestro · ' + phone.length + ' phone case(s) in Chromium through tests/native/phone-harness.html');
  if (!phone.length) {
    writeSummary('Maestro', []);
    return;
  }
  await ensureServer();
  const outDir = path.join(root, 'maestro-results');
  fs.mkdirSync(outDir, { recursive: true });
  const report = path.join(outDir, 'report.xml');
  fs.rmSync(report, { force: true });
  const args = ['test', 'maestro/flows', '--headless', '--format', 'junit', '--output', report, '-e', 'LAB_BASE=' + BASE];
  if (ids.length) args.push('--include-tags', phone.map((row) => row.id).join(','));
  const result = await run('maestro', args, {
    env: Object.assign({}, process.env, { MAESTRO_CLI_NO_ANALYTICS: '1', MAESTRO_CLI_ANALYSIS_NOTIFICATION_DISABLED: 'true' })
  });
  if (result.missing) missing('Maestro', 'Maestro is not installed. Install Java 17 or later and the Maestro CLI (https://docs.maestro.dev), then rerun npm run test:maestro.');
  if (fs.existsSync(report)) {
    const label = process.env.TARGET_BROWSER && process.env.TARGET_BROWSER !== 'chrome' ? process.env.TARGET_BROWSER : 'Chromium 390x844';
    writeSummary('Maestro', casesFromJunit(report, label));
  }
  finish('Maestro', result.code);
}

main();
