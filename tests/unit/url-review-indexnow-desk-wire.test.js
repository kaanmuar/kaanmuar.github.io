const test = require('node:test');
const assert = require('node:assert/strict');
const wire = require('../../functions/url-review-indexnow-desk-wire');
const desk = require('../../functions/url-review-indexnow-desk');

test('wire re-exports enabled and ENV_KEY alignment', () => {
	assert.equal(desk.ENV_KEY, 'URL_REVIEW_INDEXNOW_DESK');
	assert.equal(wire.enabled({ env: { URL_REVIEW_INDEXNOW_DESK: '1' } }), true);
	assert.equal(typeof wire.handleFixDiffIndexNow, 'function');
});