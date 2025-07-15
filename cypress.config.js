// cypress.config.js.
const { defineConfig } = require('cypress');

module.exports = defineConfig({
  projectId: 'y95dgu',
  reporter: 'cypress-mochawesome-reporter',
  reporterOptions: {
    charts: true,
    reportPageTitle: 'Interactive CV - Test Report',
    embeddedScreenshots: true,
    inlineAssets: true,
    saveAllAttempts: false,
  },
  e2e: {
    setupNodeEvents(on, config) {
      require('cypress-grep/plugin')(on);
      require('cypress-mochawesome-reporter/plugin')(on);
      return config;
    },
  },
});