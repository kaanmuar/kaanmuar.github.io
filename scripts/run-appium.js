const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const { findChromedriver } = require('../tests/native/chrome');

const root = path.join(__dirname, '..');
const home = path.join(root, '.appium');
const driverDir = path.join(home, 'node_modules', 'appium-chromium-driver');
const xcode = '/Applications/Xcode.app/Contents/Developer';

function run(cmd, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, {
      cwd: root,
      env: {
        ...process.env,
        APPIUM_HOME: home,
        ...(fs.existsSync(xcode) ? { DEVELOPER_DIR: xcode } : {})
      },
      stdio: 'inherit'
    });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code) reject(new Error(cmd + ' exited ' + code));
      else resolve();
    });
  });
}

async function main() {
  fs.mkdirSync(home, { recursive: true });
  const appium = path.join(root, 'node_modules', '.bin', 'appium');
  const device = process.env.APPIUM_DEVICE ? JSON.parse(process.env.APPIUM_DEVICE) : null;
  if (device && device.platform === 'ios') {
    const xcuitest = path.join(home, 'node_modules', 'appium-xcuitest-driver');
    if (!fs.existsSync(xcuitest)) {
      await run(appium, ['driver', 'install', '--source', 'npm', 'appium-xcuitest-driver']);
    }
  } else if (device && device.platform === 'android') {
    const uia2 = path.join(home, 'node_modules', 'appium-uiautomator2-driver');
    if (!fs.existsSync(uia2)) {
      await run(appium, ['driver', 'install', '--source', 'npm', 'appium-uiautomator2-driver']);
    }
  } else if (!fs.existsSync(driverDir)) {
    await run(appium, ['driver', 'install', '--source', 'npm', 'appium-chromium-driver@1.5.1']);
  }
  if (!device) {
    const driverBin = findChromedriver();
    const expected = path.join(driverDir, 'node_modules', 'appium-chromedriver', 'chromedriver', 'mac', 'chromedriver');
    if (driverBin && fs.existsSync(driverDir) && !fs.existsSync(expected)) {
      fs.mkdirSync(path.dirname(expected), { recursive: true });
      fs.symlinkSync(driverBin, expected);
    }
  }
  const wdio = path.join(root, 'node_modules', '@wdio', 'cli', 'bin', 'wdio.js');
  const specArgs = process.argv.slice(2);
  await run(process.execPath, [wdio, 'run', 'appium/wdio.conf.js', ...specArgs]);
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
