'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');

test('Android scaffold declares URL Review applicationId', () => {
  const gradle = fs.readFileSync(path.join(root, 'android', 'app', 'build.gradle'), 'utf8');
  assert.match(gradle, /applicationId\s+"com\.carlosandmunoz\.urlreview"/);
  assert.match(gradle, /applicationIdSuffix\s+"\.debug"/);
});

test('capacitor.config uses shared bundle id and production server', () => {
  const src = fs.readFileSync(path.join(root, 'capacitor.config.ts'), 'utf8');
  assert.match(src, /appId:\s*'com\.carlosandmunoz\.urlreview'/);
  assert.match(src, /carlosandmunoz\.com\/qa-review\.html/);
});