const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const gateJs = fs.readFileSync(path.join(__dirname, '../../js/qa-review-unlock-gate.js'), 'utf8');
const reviewJs = fs.readFileSync(path.join(__dirname, '../../js/qa-review.js'), 'utf8');
const html = fs.readFileSync(path.join(__dirname, '../../qa-review.html'), 'utf8');

test('qa-review-unlock-gate is loaded before qa-review.js (#4432)', () => {
	const gateAt = html.indexOf('qa-review-unlock-gate.js');
	const reviewAt = html.indexOf('js/qa-review.js');
	assert.ok(gateAt > -1 && reviewAt > gateAt);
});

test('gated kinds open checkout via unlockGate.spend, not a free first export (#4432)', () => {
	assert.match(gateJs, /const GATED = \['print', 'share', 'json', 'text', 'link'/);
	assert.match(gateJs, /openSheet\(kind\)/);
	assert.match(reviewJs, /unlockGate\.spend\(kind, action\)/);
	assert.match(reviewJs, /unlockGate\.onFoldExpanded/);
	assert.match(reviewJs, /unlockGate\.bindToolbar/);
});

test('unpaid Ctrl+P routes to unlock sheet (#4432)', () => {
	assert.match(reviewJs, /unlockGate\.openSheet\('print-key'\)/);
});