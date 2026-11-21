const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '../..');

test('the Cypress catalog spec cuts off Firestore before the long polls stack up (#932)', () => {
	const spec = fs.readFileSync(path.join(ROOT, 'cypress/e2e/catalog_spec.cy.js'), 'utf8');
	assert.match(spec, /firestore\.googleapis\.com/);
	assert.match(spec, /forceNetworkError:\s*true/);
});