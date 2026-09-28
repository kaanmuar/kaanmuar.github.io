const fs = require('fs');
const path = require('path');

const dir = path.join(__dirname, '..', '..', 'runner-results');

function reset(framework) {
  fs.mkdirSync(dir, { recursive: true });
  fs.rmSync(path.join(dir, framework + '.json'), { force: true });
}

function record(framework, test) {
  if (!test) return;
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, framework + '.json');
  let data = { framework, cases: [] };
  if (fs.existsSync(file)) {
    try { data = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (err) { data = { framework, cases: [] }; }
  }
  data.framework = framework;
  data.cases = data.cases || [];
  const browser = process.env.APPIUM_DEVICE_LABEL || process.env.TARGET_BROWSER || 'chrome';
  data.cases.push({
    title: browser + ' · ' + (test.title || ''),
    ok: test.state === 'passed',
    ms: test.duration || 0,
    error: test.state === 'passed' ? '' : String((test.err && test.err.message) || 'failed').slice(0, 300)
  });
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

module.exports = { record, reset };
