'use strict';
/**
 * CV download / export / share lead email (#4356).
 * Format + junk + test/owned checks only — no MX probe (arsenal check-if-email-exists stays deferred).
 */

const reviewTest = require('./url-review-test-accounts');

const DISPOSABLE = new Set([
	'mailinator.com',
	'guerrillamail.com',
	'guerrillamail.net',
	'10minutemail.com',
	'tempmail.com',
	'temp-mail.org',
	'yopmail.com',
	'trashmail.com',
	'discard.email',
	'mailnesia.com',
	'sharklasers.com',
	'getnada.com',
	'emailondeck.com',
]);

function normalize(email) {
	return String(email || '')
		.trim()
		.toLowerCase();
}

function parts(email) {
	const value = normalize(email);
	const at = value.lastIndexOf('@');
	if (at < 1 || at === value.length - 1) return null;
	return { local: value.slice(0, at), domain: value.slice(at + 1), value };
}

function looksLikeEmail(email) {
	const p = parts(email);
	if (!p) return false;
	if (p.local.length > 64 || p.domain.length > 253) return false;
	if (!/^[a-z0-9](?:[a-z0-9._+-]*[a-z0-9])?$/i.test(p.local)) return false;
	if (!/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/i.test(p.domain)) return false;
	const tld = p.domain.slice(p.domain.lastIndexOf('.') + 1);
	return tld.length >= 2;
}

function isJunkEmail(email) {
	const p = parts(email);
	if (!p) return true;
	const host = p.domain;
	const root = host.split('.')[0];
	if (DISPOSABLE.has(host)) return true;
	if (/^(test|asdf|qwer|noemail|none|null|user|email|fake|xxx|abc|aaa|bbb|ccc|sample|demo)$/.test(p.local)) return true;
	// Placeholders like cc@cc.com / ab@ab.co
	if (p.local.length <= 2 && root === p.local) return true;
	if (p.local.length <= 3 && root === p.local && host.split('.').length === 2) return true;
	return false;
}

/** True when the address is good enough to store as a real CV lead. */
function isAcceptableLeadEmail(email) {
	const value = normalize(email);
	if (!looksLikeEmail(value)) return { ok: false, reason: 'format' };
	if (isJunkEmail(value)) return { ok: false, reason: 'junk' };
	if (reviewTest.isTestAccount(value)) return { ok: false, reason: 'test' };
	return { ok: true, email: value };
}

module.exports = {
	normalize,
	looksLikeEmail,
	isJunkEmail,
	isAcceptableLeadEmail,
	DISPOSABLE,
};
