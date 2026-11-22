const test = require('node:test');
const assert = require('node:assert/strict');
const { legalLinks } = require('../../functions/url-review-legal');

const SITE = 'https://www.gov.uk/';

test('explicit statement wording under /help/ is still the accessibility statement (#2282)', () => {
	const hit = legalLinks(
		[{ href: '/help/accessibility-statement', text: 'Accessibility statement' }],
		SITE
	).accessibility;
	assert.deepEqual(hit, {
		href: 'https://www.gov.uk/help/accessibility-statement',
		text: 'Accessibility statement',
	});
});

test('generic accessibility wording under /help/ or /forum/ is still turned away', () => {
	assert.equal(
		legalLinks([{ href: '/help/accessibility', text: 'Accessibility' }], SITE).accessibility,
		null
	);
	assert.equal(
		legalLinks([{ href: '/forum/accessibility/', text: 'Accessibility' }], SITE).accessibility,
		null
	);
	assert.equal(
		legalLinks(
			[
				{
					href: '/support/forum/accessibility/',
					text: 'Accessibility Inquiries concerning assistive technology',
					label: 'Accessibility',
				},
			],
			SITE
		).accessibility,
		null
	);
});

test('statement wording under /help/ beats an earlier generic link on an away path', () => {
	const found = legalLinks(
		[
			{ href: '/blog/accessibility', text: 'Accessibility' },
			{ href: '/help/accessibility-statement', text: 'Accessibility statement' },
		],
		SITE
	).accessibility;
	assert.equal(found.href, 'https://www.gov.uk/help/accessibility-statement');
	assert.equal(found.text, 'Accessibility statement');
});

test('address-only match under /help/ without statement wording is still turned away', () => {
	assert.equal(
		legalLinks([{ href: '/help/accessibility-statement', text: 'More about this service' }], SITE).accessibility,
		null
	);
});