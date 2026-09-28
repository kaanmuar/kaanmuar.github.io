const { defineConfig, devices } = require('@playwright/test');

const port = process.env.TEST_PORT || '8765';
const baseURL = process.env.PLAYWRIGHT_BASE_URL || `http://127.0.0.1:${port}`;
const requested = process.env.PW_BROWSER;
const channel = process.env.PW_CHANNEL;

module.exports = defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  timeout: 45000,
  expect: { timeout: 10000 },
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]],
  use: {
    baseURL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    ...(process.env.PW_CHANNEL ? { channel: process.env.PW_CHANNEL } : {})
  },
  webServer: process.env.PLAYWRIGHT_BASE_URL ? undefined : {
    command: `python3 -m http.server ${port}`,
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
