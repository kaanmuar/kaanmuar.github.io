const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const XCODE = '/Applications/Xcode.app/Contents/Developer';

function exists(file) {
  try { return fs.existsSync(file); } catch (err) { return false; }
}

const BROWSERS = [
  { id: 'chrome', label: 'Chrome' },
  { id: 'firefox', label: 'Firefox' },
  { id: 'edge', label: 'Edge' },
  { id: 'safari', label: 'Safari' }
];

const PROFILES = require('../js/lab-devices.json');

const SKIN_CSS = {
  galaxy_nexus: [360, 640],
  nexus_4: [384, 640],
  nexus_5: [360, 640],
  nexus_5x: [412, 732],
  nexus_6: [412, 732],
  nexus_6p: [412, 732],
  nexus_10: [800, 1280]
};

function browsers() {
  return BROWSERS.map((item) => Object.assign({}, item));
}

function iosDevices() {
  const simctl = path.join(XCODE, 'usr', 'bin', 'simctl');
  if (!exists(simctl)) return [];
  try {
    const out = execFileSync(simctl, ['list', 'devices', 'available', '-j'], {
      encoding: 'utf8',
      env: { ...process.env, DEVELOPER_DIR: XCODE }
    });
    const data = JSON.parse(out);
    const devices = [];
    Object.entries(data.devices || {}).forEach(([runtime, list]) => {
      const match = String(runtime).match(/iOS-(\d+(?:-\d+)*)/);
      if (!match) return;
      const version = match[1].replace(/-/g, '.');
      (list || []).filter((item) => item.isAvailable).forEach((item) => {
        devices.push({
          platform: 'ios',
          id: item.udid,
          name: item.name,
          version,
          udid: item.udid,
          label: item.name + ' · iOS ' + version
        });
      });
    });
    return devices;
  } catch (err) {
    return [];
  }
}

function sdkRoot() {
  if (process.env.ANDROID_HOME) return process.env.ANDROID_HOME;
  if (process.env.ANDROID_SDK_ROOT) return process.env.ANDROID_SDK_ROOT;
  const home = process.env.HOME || process.env.USERPROFILE || '';
  const local = process.env.LOCALAPPDATA || '';
  const candidates = [
    path.join(home, 'Library', 'Android', 'sdk'),
    path.join(local, 'Android', 'Sdk'),
    path.join(home, 'AppData', 'Local', 'Android', 'Sdk')
  ];
  return candidates.find((dir) => exists(dir)) || candidates[0];
}

function skinDevices(sdk) {
  const dir = path.join(sdk, 'skins');
  if (!exists(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).filter((entry) => entry.isDirectory() && !/^(tv_|wearos_|automotive_)/.test(entry.name)).map((entry) => {
    const known = SKIN_CSS[entry.name];
    const layout = path.join(dir, entry.name, 'layout');
    let width = known ? known[0] : 0;
    let height = known ? known[1] : 0;
    if (!width && exists(layout)) {
      const text = fs.readFileSync(layout, 'utf8');
      const foundWidth = text.match(/display\s*\{[^}]*width\s+(\d+)/);
      const foundHeight = text.match(/display\s*\{[^}]*height\s+(\d+)/);
      const rawWidth = foundWidth ? Number(foundWidth[1]) : 1080;
      const rawHeight = foundHeight ? Number(foundHeight[1]) : 1920;
      width = rawWidth > 900 ? Math.round(rawWidth / 3) : rawWidth;
      height = rawHeight > 900 ? Math.round(rawHeight / 3) : rawHeight;
    }
    const pretty = entry.name.replace(/_/g, ' ');
    return {
      platform: 'profile',
      id: 'skin:' + entry.name,
      label: pretty + ' · Android',
      width: width || 360,
      height: height || 640
    };
  });
}

function androidDevices() {
  const sdk = sdkRoot();
  const emulator = path.join(sdk, 'emulator', process.platform === 'win32' ? 'emulator.exe' : 'emulator');
  const skins = skinDevices(sdk);
  if (!exists(emulator)) {
    return {
      devices: skins,
      note: 'Phone, tablet, and Pixel sizes run in the browser on a Mac, Windows, or a mobile device. An Android emulator is not required for that.'
    };
  }
  try {
    const out = execFileSync(emulator, ['-list-avds'], { encoding: 'utf8' });
    const avds = out.split(/\r?\n/).map((name) => name.trim()).filter(Boolean).map((name) => ({
      platform: 'android',
      id: 'avd:' + name,
      name,
      avd: name,
      label: name + ' · Android emulator'
    }));
    const note = avds.length
      ? 'Android emulators come from Device Manager. The other phones are screen sizes and run without an emulator.'
      : 'Current phones are Android 15 (API 35) and Android 16 (API 36). This computer’s SDK platform is API 37. Those phones run at their screen size in the browser. An emulator boots only after a virtual device exists.';
    return { devices: avds.concat(skins), note };
  } catch (err) {
    return { devices: skins, note: 'Android screen sizes are available. Listing virtual devices failed.' };
  }
}

function listTargets() {
  const android = androidDevices();
  const seen = new Set();
  const devices = PROFILES.concat(iosDevices(), android.devices).filter((item) => {
    if (seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
  return {
    browsers: browsers(),
    devices,
    androidNote: android.note
  };
}

module.exports = { listTargets, XCODE };
