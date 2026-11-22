#!/usr/bin/env node
// Release APKs must not ship Sentry Gradle bytecode instrumentation (#4232).
// 2.1.727 enabled AppStart/Database/FileIO/Logcat transforms; R8 + DatabaseInstrumentation
// crashed on launch (NoSuchFieldError SQLiteStatement.mDelegate). Mapping upload stays on;
// tracingInstrumentation must stay off in android/*/build.gradle.kts.
// Usage: node scripts/check-jarvis-apk-no-sentry-instrumentation.js <apk> [apk...]
'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const os = require('os');

// Only the four transforms the plugin weaves into classes.dex. Do not use
// "gradle-plugin-integrations" — binary manifests / SDK bits can match it on
// healthy builds (2.1.726 was fine without AppStart* markers).
const MARKERS = [
  'AppStartInstrumentation',
  'DatabaseInstrumentation',
  'FileIOInstrumentation',
  'LogcatInstrumentation',
];

function checkApk(apkPath) {
  const abs = path.resolve(apkPath);
  if (!fs.existsSync(abs)) throw new Error(`APK not found: ${abs}`);
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'jarvis-apk-'));
  try {
    execFileSync('unzip', ['-qo', abs, 'classes.dex', 'AndroidManifest.xml', '-d', tmp], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const dex = fs.readFileSync(path.join(tmp, 'classes.dex'));
    const manPath = path.join(tmp, 'AndroidManifest.xml');
    const man = fs.existsSync(manPath) ? fs.readFileSync(manPath) : Buffer.alloc(0);
    const blob = Buffer.concat([dex, man]);
    const hits = MARKERS.filter((m) => blob.includes(Buffer.from(m, 'utf8')));
    return { apk: abs, hits };
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

function main(argv) {
  const apks = argv.slice(2);
  if (!apks.length) {
    console.error('Usage: node scripts/check-jarvis-apk-no-sentry-instrumentation.js <apk> [apk...]');
    process.exit(2);
  }
  let failed = false;
  for (const apk of apks) {
    const { hits } = checkApk(apk);
    if (hits.length) {
      failed = true;
      console.error(`FAIL ${apk}: Sentry instrumentation markers: ${hits.join(', ')}`);
    } else {
      console.log(`OK ${apk}: no Sentry bytecode instrumentation markers`);
    }
  }
  process.exit(failed ? 1 : 0);
}

main(process.argv);
