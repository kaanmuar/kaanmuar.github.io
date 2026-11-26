const test = require('node:test');
const assert = require('node:assert/strict');
const lead = require('../../functions/cv-lead-email');
const traffic = require('../../functions/cv-traffic');

test('accepts a normal work email', () => {
	assert.equal(lead.isAcceptableLeadEmail('recruiter@acme.com').ok, true);
	assert.equal(lead.isAcceptableLeadEmail('jane.doe@company.co.uk').email, 'jane.doe@company.co.uk');
});

test('rejects junk and placeholders like cc@cc.com', () => {
	assert.equal(lead.isAcceptableLeadEmail('cc@cc.com').ok, false);
	assert.equal(lead.isAcceptableLeadEmail('ab@ab.com').reason, 'junk');
	assert.equal(lead.isAcceptableLeadEmail('test@test.com').ok, false);
	assert.equal(lead.isAcceptableLeadEmail('not-an-email').ok, false);
	assert.equal(lead.isAcceptableLeadEmail('a@b.c').ok, false);
	assert.equal(lead.isAcceptableLeadEmail('user@mailinator.com').reason, 'junk');
});

test('rejects owned and test addresses', () => {
	assert.equal(lead.isAcceptableLeadEmail('kaanmuar@gmail.com').reason, 'test');
	assert.equal(lead.isAcceptableLeadEmail('qa@carlosandmunoz.com').reason, 'test');
	assert.equal(lead.isAcceptableLeadEmail('pw-bot@example.com').ok, false);
});

test('tags Lighthouse and headless as testing traffic', () => {
	assert.equal(traffic.isTestTraffic({ userAgent: 'Mozilla/5.0 Chrome-Lighthouse' }), true);
	assert.equal(traffic.isTestTraffic({ userAgent: 'HeadlessChrome' }), true);
	assert.equal(traffic.isTestTraffic({ test: true }), true);
	assert.equal(
		traffic.isTestTraffic({
			userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/158.0.0.0 Safari/537.36',
			city: 'pimpri-chinchwad',
			country: 'IN',
		}),
		false
	);
});

test('splitTraffic separates real and testing rows', () => {
	const split = traffic.splitTraffic([
		{ kind: 'visit', userAgent: 'Chrome-Lighthouse' },
		{ kind: 'visit', userAgent: 'Mozilla/5.0', country: 'CO' },
	]);
	assert.equal(split.testing.length, 1);
	assert.equal(split.real.length, 1);
});
