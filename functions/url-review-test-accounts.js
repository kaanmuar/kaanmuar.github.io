/* Test accounts: the addresses testing signs in with, the owner's own, and their aliases (#3799).
   Review mail goes out only for a real user. isTestAccount(email) is true for an address that testing uses, for an alias
   of one (a plus tag, or Gmail's dots and googlemail.com), for any address on the owner's domains, and for the
   test-address rules of the admin's Real / Tests switch (jarvis-core isTestEmail). isTestRecord(record) adds the
   sandbox runs (record.test, from QA_TEST_KEY). */

const core = require('./jarvis-core');

// Addresses the review tests and the owner's own runs have signed in with.
const TEST_ACCOUNTS = ['kaanmuar@gmail.com', 'ana@gmail.com', 'bob@gmail.com'];
// Every address at these domains is the owner's, a QA-lab mailbox or one of their aliases.
const OWNED_DOMAINS = [
	'carlosandmunoz.com',
	'qalabreview.com',
	'getqalabreview.com',
	'tryqalabreview.com',
	'qa-lab.co',
	'qalaburlreview.onmicrosoft.com',
];

// One key per mailbox: lower case, no plus tag, and for Gmail no dots and googlemail.com read as gmail.com.
function normal(email) {
	const value = String(email || '')
		.trim()
		.toLowerCase();
	const at = value.lastIndexOf('@');
	if (at < 1) return value;
	let local = value.slice(0, at).split('+')[0];
	let domain = value.slice(at + 1);
	if (domain === 'googlemail.com') domain = 'gmail.com';
	if (domain === 'gmail.com') local = local.replace(/\./g, '');
	return local + '@' + domain;
}

const KEYS = TEST_ACCOUNTS.map(normal);

function isTestAccount(email) {
	const value = String(email || '')
		.trim()
		.toLowerCase();
	if (!value) return false;
	if (core.isTestEmail(value)) return true;
	const key = normal(value);
	const domain = key.slice(key.lastIndexOf('@') + 1);
	return KEYS.includes(key) || OWNED_DOMAINS.some((owned) => domain === owned || domain.endsWith('.' + owned));
}

// Payment mail (the receipt, the pass renewal note) is not review mail: a test purchase still gets its receipt.
const PAYMENT_MAIL = ['url-review-receipt', 'url-review-pass-renewal'];

// True when a review mail of this category must not go to this address.
function skipsMail(email, category) {
	return !PAYMENT_MAIL.includes(category) && isTestAccount(email);
}

function isTestRecord(record) {
	return !!record && (record.test === true || isTestAccount(record.email));
}

module.exports = { isTestAccount, skipsMail, PAYMENT_MAIL, isTestRecord, normal, TEST_ACCOUNTS, OWNED_DOMAINS };
