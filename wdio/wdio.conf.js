const path = require('path');
const fs = require('fs');
const { chromeCaps } = require('./session');

function caps() {
  const name = String(process.env.TARGET_BROWSER || 'chrome').toLowerCase();
  if (name === 'firefox') {
    return { browserName: 'firefox', 'moz:firefoxOptions': { args: ['-headless'] } };
  }
  if (name === 'safari') return { browserName: 'safari' };
  if (name === 'edge') {
    return { browserName: 'MicrosoftEdge', 'ms:edgeOptions': { args: ['--headless=new', '--window-size=1280,800'] } };
  }
  return chromeCaps(1280, 800);
}

exports.config = {
  runner: 'local',
  specs: [path.join(__dirname, '*.spec.js')],
  maxInstances: 1,
  capabilities: [caps()],
  logLevel: 'info',
  framework: 'mocha',
  reporters: [
    'spec',
    ['junit', {
      outputDir: path.join(__dirname, '..', 'wdio-results'),
      outputFileFormat: () => 'results.xml'
    }]
  ],
  mochaOpts: { timeout: 120000 },
  waitforTimeout: 8000,
  onPrepare() {
    fs.rmSync(path.join(__dirname, '..', 'runner-results', 'WebDriverIO.json'), { force: true });
  }
};
