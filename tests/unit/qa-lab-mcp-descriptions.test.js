const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const serverSrc = fs.readFileSync(
	path.join(__dirname, '../../packages/qa-lab-mcp/src/server.js'),
	'utf8'
);

test('qa-lab MCP tool descriptions name attack-source checks and paid-only results (#3927)', () => {
	assert.match(serverSrc, /CISA KEV/);
	assert.match(serverSrc, /OSV\.dev/);
	assert.match(serverSrc, /FIRST EPSS/);
	assert.match(serverSrc, /Feodo/);
	assert.match(serverSrc, /GDELT/);
	assert.match(serverSrc, /CertSpotter/);
	assert.match(serverSrc, /Was it targeted/);
	assert.match(serverSrc, /sec-kev/);
	assert.match(serverSrc, /opted out of attack-source checks/);
	assert.match(serverSrc, /Soft preview does not run attack and exploit source checks/);
});