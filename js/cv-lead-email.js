(function (root) {
	'use strict';
	/** Browser twin of functions/cv-lead-email.js (#4356). Keep rules in sync. */

	const OWNED = [
		'carlosandmunoz.com',
		'qalabreview.com',
		'getqalabreview.com',
		'tryqalabreview.com',
		'qa-lab.co',
		'qalaburlreview.onmicrosoft.com',
	];
	const TEST_KEYS = ['kaanmuar@gmail.com', 'ana@gmail.com', 'bob@gmail.com'].map(normalKey);
	const DISPOSABLE = {
		'mailinator.com': 1,
		'guerrillamail.com': 1,
		'guerrillamail.net': 1,
		'10minutemail.com': 1,
		'tempmail.com': 1,
		'temp-mail.org': 1,
		'yopmail.com': 1,
		'trashmail.com': 1,
		'discard.email': 1,
		'mailnesia.com': 1,
		'sharklasers.com': 1,
		'getnada.com': 1,
		'emailondeck.com': 1,
	};

	function normalize(email) {
		return String(email || '')
			.trim()
			.toLowerCase();
	}

	function normalKey(email) {
		const value = normalize(email);
		const at = value.lastIndexOf('@');
		if (at < 1) return value;
		let local = value.slice(0, at).split('+')[0];
		let domain = value.slice(at + 1);
		if (domain === 'googlemail.com') domain = 'gmail.com';
		if (domain === 'gmail.com') local = local.replace(/\./g, '');
		return local + '@' + domain;
	}

	function parts(email) {
		const value = normalize(email);
		const at = value.lastIndexOf('@');
		if (at < 1 || at === value.length - 1) return null;
		return { local: value.slice(0, at), domain: value.slice(at + 1), value };
	}

	function isTestEmail(email) {
		const p = parts(email);
		if (!p) return true;
		if (/^(example\.(com|org|net)|test\.com|mailinator\.com|localhost|invalid)$/.test(p.domain)) return true;
		if (/\.(test|example|invalid)$/.test(p.domain)) return true;
		if (/(^|[.+_-])(playwright|cypress|selenium|appium|webdriver|robotframework|qa-?lab)([.+_-]|$)/.test(p.local))
			return true;
		if (/^(pw|cy|e2e|test)[_-]/.test(p.local)) return true;
		const key = normalKey(p.value);
		const domain = key.slice(key.lastIndexOf('@') + 1);
		if (TEST_KEYS.indexOf(key) !== -1) return true;
		return OWNED.some(function (owned) {
			return domain === owned || domain.slice(-(owned.length + 1)) === '.' + owned;
		});
	}

	function looksLikeEmail(email) {
		const p = parts(email);
		if (!p) return false;
		if (p.local.length > 64 || p.domain.length > 253) return false;
		if (!/^[a-z0-9](?:[a-z0-9._+-]*[a-z0-9])?$/i.test(p.local)) return false;
		if (!/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/i.test(p.domain)) return false;
		return p.domain.slice(p.domain.lastIndexOf('.') + 1).length >= 2;
	}

	function isJunkEmail(email) {
		const p = parts(email);
		if (!p) return true;
		if (DISPOSABLE[p.domain]) return true;
		if (/^(test|asdf|qwer|noemail|none|null|user|email|fake|xxx|abc|aaa|bbb|ccc|sample|demo)$/.test(p.local))
			return true;
		const root = p.domain.split('.')[0];
		if (p.local.length <= 2 && root === p.local) return true;
		if (p.local.length <= 3 && root === p.local && p.domain.split('.').length === 2) return true;
		return false;
	}

	function isAcceptableLeadEmail(email) {
		const value = normalize(email);
		if (!looksLikeEmail(value)) return { ok: false, reason: 'format' };
		if (isJunkEmail(value)) return { ok: false, reason: 'junk' };
		if (isTestEmail(value)) return { ok: false, reason: 'test' };
		return { ok: true, email: value };
	}

	root.CvLeadEmail = {
		normalize: normalize,
		looksLikeEmail: looksLikeEmail,
		isJunkEmail: isJunkEmail,
		isAcceptableLeadEmail: isAcceptableLeadEmail,
		isTestEmail: isTestEmail,
	};
})(typeof window !== 'undefined' ? window : globalThis);
