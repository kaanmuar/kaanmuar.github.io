#!/usr/bin/env node
// Writes the Gherkin catalog for Cucumber, Behave, and Reqnroll, and one Maestro flow per phone case,
// from tests/native/catalog.json. Run with --check to fail when a written file is stale.
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const catalog = require('../tests/native/catalog.json');

const NOTE = 'Generated from tests/native/catalog.json by scripts/build-catalog-suites.js. Edit the catalog, then rerun the script.';

function gherkinText(value) {
  return String(value).replace(/\s+/g, ' ').trim();
}

function feature() {
  const lines = [
    '# ' + NOTE,
    'Feature: CV regression lab catalog',
    '  Each scenario opens one page, loads js/catalog-checks.js, and runs the lab check with the same id.',
    '  The Performance rows belong to JMeter, Gatling, and k6.',
    ''
  ];
  catalog.filter((row) => row.layer !== 'Performance').forEach((row) => {
    lines.push(
      '  @' + row.id + ' @' + row.layer,
      '  Scenario: ' + row.id + ' ' + gherkinText(row.title),
      '    Given the page "' + row.path + '" is open on a ' + (row.phone ? 'phone' : 'desktop') + ' screen',
      '    When the catalog check "' + row.id + '" runs',
      '    Then the check passes',
      ''
    );
  });
  return lines.join('\n');
}

function yamlString(value) {
  return JSON.stringify(String(value));
}

function maestroFlow(row) {
  return [
    '# ' + NOTE,
    '# Maestro drives Chromium at its preset desktop size, so the harness page frames ' + row.path + ' at 390 x 844 and prints the verdict of the lab check.',
    '# npm run test:maestro passes -e LAB_BASE=http://127.0.0.1:8765.',
    'url: http://127.0.0.1:8765/tests/native/phone-harness.html',
    'name: ' + yamlString(row.id + ' ' + gherkinText(row.title)),
    'tags:',
    '  - ' + row.layer,
    '  - ' + row.id,
    '---',
    '- openLink: ${LAB_BASE}/tests/native/phone-harness.html?case=' + row.id + '&page=' + encodeURIComponent(row.path),
    '- extendedWaitUntil:',
    '    visible: ' + yamlString('(PASS|FAIL) ' + row.id + '.*'),
    '    timeout: 120000',
    '- assertVisible: ' + yamlString('PASS ' + row.id + '.*'),
    ''
  ].join('\n');
}

function outputs() {
  const text = feature();
  const files = [
    { file: 'cucumber/features/catalog.feature', content: text },
    { file: 'behave/features/catalog.feature', content: text },
    { file: 'reqnroll/Features/Catalog.feature', content: text }
  ];
  catalog.filter((row) => row.phone).forEach((row) => {
    files.push({ file: 'maestro/flows/' + row.id.toLowerCase() + '.yaml', content: maestroFlow(row) });
  });
  return files;
}

function main() {
  const check = process.argv.includes('--check');
  const files = outputs();
  const flowDir = path.join(root, 'maestro', 'flows');
  const wanted = new Set(files.map((item) => path.join(root, item.file)));
  const stale = [];
  if (fs.existsSync(flowDir)) {
    fs.readdirSync(flowDir).filter((name) => name.endsWith('.yaml')).forEach((name) => {
      const full = path.join(flowDir, name);
      if (!wanted.has(full)) {
        if (check) stale.push('maestro/flows/' + name + ' (no longer in the catalog)');
        else fs.rmSync(full);
      }
    });
  }
  files.forEach((item) => {
    const full = path.join(root, item.file);
    const current = fs.existsSync(full) ? fs.readFileSync(full, 'utf8') : null;
    if (current === item.content) return;
    if (check) {
      stale.push(item.file);
      return;
    }
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, item.content);
    console.log('wrote ' + item.file);
  });
  if (check && stale.length) {
    console.error('Stale catalog suites. Run node scripts/build-catalog-suites.js:\n  ' + stale.join('\n  '));
    process.exit(1);
  }
}

if (require.main === module) main();

module.exports = { outputs };
