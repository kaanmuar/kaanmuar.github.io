require('./scripts/playwright-sandbox');
const { defineConfig, devices } = require('@playwright/test');

const port = process.env.TEST_PORT || '8765';
const baseURL = process.env.PLAYWRIGHT_BASE_URL || `http://127.0.0.1:${port}`;
const requested = process.env.PW_BROWSER;
const channel = process.env.PW_CHANNEL;

// Opt-in local tree-grid report (#3832): PW_REPORTER=monocart writes
// monocart-report/index.html (virtualized tree grid with filters). Needs
// `npm i --no-save monocart-reporter` (MIT, not a project dependency). When it is
// missing we warn and keep the default reporters, so pass/fail never changes.
function pickReporter() {
  const defaults = [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]];
  if (process.env.PW_REPORTER !== 'monocart') return defaults;
  try {
    require.resolve('monocart-reporter');
  } catch {
    console.warn('PW_REPORTER=monocart set but monocart-reporter is not installed; using default reporters.');
    return defaults;
  }
  return [
    ['list'],
    ['monocart-reporter', { name: 'Playwright tree-grid report', outputFile: './monocart-report/index.html' }]
  ];
}

module.exports = defineConfig({
  testDir: './tests',
  testIgnore: ['**/unit/**'],
  globalSetup: require.resolve('./tests/global-setup.js'),
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  timeout: 45000,
  expect: { timeout: 10000 },
  reporter: pickReporter(),
  use: {
    baseURL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    ...(process.env.PW_CHANNEL ? { channel: process.env.PW_CHANNEL } : {})
  },
  webServer: process.env.PLAYWRIGHT_BASE_URL ? undefined : {
    command: `python3 scripts/static-server.py ${port}`,
    url: baseURL,
    reuseExistingServer: true,
    timeout: 15000
  },
  projects: [
    requested
      ? { name: requested, use: { browserName: requested, viewport: { width: 1280, height: 800 }, ...(channel ? { channel } : {}) } }
      : { name: 'chromium', use: { ...devices['Desktop Chrome'], ...(channel ? { channel } : {}) } }
  ]
});
