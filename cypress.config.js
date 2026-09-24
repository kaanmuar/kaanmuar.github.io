const { defineConfig } = require('cypress');
const { spawn } = require('child_process');
const net = require('net');
const { beforeRunHook, afterRunHook } = require('cypress-mochawesome-reporter/lib');

const PORT = Number(process.env.TEST_PORT || 8765);
const baseUrl = process.env.CYPRESS_BASE_URL || `http://127.0.0.1:${PORT}`;

function isPortOpen(port) {
  return new Promise((resolve) => {
    const socket = net.connect({ port, host: '127.0.0.1' }, () => {
      socket.end();
      resolve(true);
    });
    socket.on('error', () => resolve(false));
  });
}

function waitForPort(port, timeoutMs = 10000) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const retry = () => {
      isPortOpen(port).then((open) => {
        if (open) return resolve();
        if (Date.now() - start > timeoutMs) return reject(new Error(`Timed out waiting for port ${port}`));
        setTimeout(retry, 200);
      });
    };
    retry();
  });
}

module.exports = defineConfig({
  reporter: 'cypress-mochawesome-reporter',
  projectId: '5p3wz5',
  reporterOptions: {
    charts: true,
    reportPageTitle: "KaanMuar's E2E Test Report",
    embeddedScreenshots: true,
    inlineAssets: true,
    saveAllAttempts: false
  },
  e2e: {
    baseUrl,
    specPattern: 'cypress/e2e/**/*.cy.js',
    supportFile: 'cypress/support/e2e.js',
    viewportWidth: 1280,
    viewportHeight: 720,
    defaultCommandTimeout: 10000,
    setupNodeEvents(on, config) {
      require('@cypress/grep/src/plugin')(config);
      let serverProc;
      on('before:run', async (details) => {
        if (!(await isPortOpen(PORT))) {
          serverProc = spawn('python3', ['-m', 'http.server', String(PORT)], {
            cwd: config.projectRoot || process.cwd(),
            stdio: 'ignore'
          });
          await waitForPort(PORT);
        }
        await beforeRunHook(details);
      });
      on('after:run', async () => {
        if (serverProc) serverProc.kill();
        await afterRunHook();
      });
      return config;
    }
  }
});
