const { defineConfig } = require('cypress');
const path = require('path');
const webpack = require('@cypress/webpack-preprocessor');
const { beforeRunHook, afterRunHook } = require('cypress-mochawesome-reporter/lib');

module.exports = defineConfig({
  reporter: 'cypress-mochawesome-reporter',
  projectId: '5p3wz5',
  reporterOptions: {
    charts: true,
    reportPageTitle: 'KaanMuar\'s E2E Test Report',
    embeddedScreenshots: true,
    inlineAssets: true,
    saveAllAttempts: false,
  },
  e2e: {
    baseUrl: 'https://kaanmuar.github.io',
    setupNodeEvents(on, config) {
      // Grep plugin
      require('@cypress/grep/src/plugin')(config);
      // Mochawesome reporter
      on('before:run', async (details) => {
        await beforeRunHook(details);
      });
      on('after:run', async () => {
        await afterRunHook();
      });

      // ** FIX: Add Webpack preprocessor with path alias **
      const options = {
        webpackOptions: {
          resolve: {
            alias: {
              '@': path.resolve(__dirname, './cypress'),
            },
          },
        },
      };
      on('file:preprocessor', webpack(options));

      return config;
    },
  },
});