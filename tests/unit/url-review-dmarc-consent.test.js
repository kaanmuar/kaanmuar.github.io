const test = require('node:test');
const assert = require('node:assert/strict');
const consent = require('../../functions/url-review-dmarc-consent');

test('the privacy notice names the same mailbox the account page shows for rua= (#3777)', () => {
	assert.equal(consent.RUA_MAILBOX, 'dmarc@carlosandmunoz.com');
	assert.equal(consent.NOTICE.mailbox, consent.RUA_MAILBOX);
	assert.ok(consent.NOTICE.lines.some((line) => line.includes(consent.RUA_MAILBOX)));
	assert.ok(consent.NOTICE.lines.length > 0 && consent.NOTICE.version === consent.NOTICE_VERSION);
});
