const path = require('path');
const { chromeCaps } = require('../wdio/session');
const { findChromedriver } = require('../tests/native/chrome');

function caps() {
  if (process.env.APPIUM_DEVICE) {
    const device = JSON.parse(process.env.APPIUM_DEVICE);
    if (device.platform === 'ios') {
      return {
        platformName: 'iOS',
        browserName: 'Safari',
        'appium:automationName': 'XCUITest',
        'appium:deviceName': device.name,
        'appium:platformVersion': String(device.version || ''),
        'appium:udid': device.udid,
        'appium:noReset': true,
        'appium:wdaLaunchTimeout': 180000,
        'appium:wdaConnectionTimeout': 180000
      };
    }
    if (device.platform === 'android') {
      return {
        platformName: 'Android',
        browserName: 'Chrome',
        'appium:automationName': 'UiAutomator2',
        'appium:deviceName': device.name,
        ...(device.avd ? { 'appium:avd': device.avd } : {}),
        'appium:noReset': true
      };
    }
  }
  const viewport = String(process.env.APPIUM_VIEWPORT || '390x844').split('x').map((n) => Number(n) || 0);
  const chrome = chromeCaps(viewport[0] || 390, viewport[1] || 844);
  return {
    platformName: process.platform === 'darwin' ? 'mac' : (process.platform === 'win32' ? 'windows' : 'linux'),
    browserName: 'chrome',
    'appium:automationName': 'Chromium',
    'appium:chromedriverExecutable': findChromedriver(),
    'goog:chromeOptions': chrome['goog:chromeOptions']
  };
}

exports.config = {
  runner: 'local',
  specs: [path.join(__dirname, '*.spec.js')],
  maxInstances: 1,
  hostname: '127.0.0.1',
  port: 4723,
  path: '/',
  services: [
    ['appium', {
      command: path.join(__dirname, '..', 'node_modules', '.bin', 'appium'),
      args: { basePath: '/', allowCors: true }
    }]
  ],
  capabilities: [caps()],
  logLevel: 'info',
  framework: 'mocha',
  reporters: [
    'spec',
    ['junit', {
      outputDir: path.join(__dirname, '..', 'appium-results'),
      outputFileFormat: () => 'results.xml'
    }]
  ],
  mochaOpts: { timeout: 180000 },
  waitforTimeout: 8000,
  onPrepare() {
    const fs = require('fs');
    fs.rmSync(path.join(__dirname, '..', 'runner-results', 'Appium.json'), { force: true });
  }
};
