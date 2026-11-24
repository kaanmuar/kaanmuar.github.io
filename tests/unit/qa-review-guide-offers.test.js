const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '../..');
const guide = fs.readFileSync(path.join(ROOT, 'qa-review-guide.html'), 'utf8');

test('the EN guide names soft preview, unlock ladder, Full Stack, plans, and specialist tools (#3729)', () => {
	for (const needle of [
		'id="price"',
		'Soft preview',
		'<strong>$5</strong><span>Fix list</span>',
		'Full report · +$5 each extra',
		'Starter Full Stack',
		'Complete Full Stack',
		'Freelancer',
		'Team',
		'Pro',
		'Axe-core',
		'Lighthouse',
		'BrowserStack',
		'Ask us to fix it',
	]) assert.match(guide, new RegExp(needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'), needle);
});

test('the guide chatbot demo does not quote a monthly subscription (#3729)', () => {
	assert.doesNotMatch(guide, /19 dollars a month/i);
	assert.doesNotMatch(guide, /basic plan cost/i);
});

test('the guide FAQ and tour mention the 48-hour inconclusive promise (#3365)', () => {
	assert.match(guide, /48 hours/i);
	assert.match(guide, /20% off your next review/i);
});