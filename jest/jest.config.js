const path = require('path');

module.exports = {
  rootDir: path.join(__dirname, '..'),
  roots: ['<rootDir>/jest'],
  testMatch: ['**/catalog.test.js'],
  testEnvironment: 'node',
  verbose: true
};
