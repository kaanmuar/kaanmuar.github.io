'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
// Built at runtime so no literal key sits in the source (gitleaks aws-access-token).
const FAKE_AWS = ['AKIA', 'ABCDEFGHIJKLMNOP'].join('');
const heads = require('../../functions/url-review-heads-up');

const NOW = Date.parse('2026-11-20T00:00:00Z');
const DAY = 864e5;
const SENDER = {
	name: 'Carlos A. Muñoz',
	postalAddress: 'Example postal address, City, Country',
	website: 'https://carlosandmunoz.com/qa-review.html',
};
const SECURITY_FOUND = [
	{
		email: 'security@northwind-shop.io',
		source: 'security.txt',
		url: 'https://northwind-shop.io/.well-known/security.txt',
	},
];

function threat(over) {
	return Object.assign(
		{
			kind: 'hacked-spam',
			level: 'critical',
			subject_type: 'host',
			subject: 'shop.northwind-shop.io',
			host: 'shop.northwind-shop.io',
			role: 'site_hit',
			source: 'Own scan',
			first_seen: new Date(NOW - 3 * DAY).toISOString(),
			last_seen: new Date(NOW - DAY).toISOString(),
			observed_at: new Date(NOW - DAY).toISOString(),
			evidence: 'Hidden casino links in footer <script>',
			confidence: 'observed',
			delist_status: 'none',
			company_country: 'US',
		},
		over || {}
	);
}

// The clean context: fresh history, nobody opted out, no notice in the last 182 days.
function ctx(over) {
	return Object.assign({ now: NOW, found: SECURITY_FOUND, stopped: new Set(), lastNoticeAt: null }, over || {});
}

test('a fresh, observed compromise with a security contact on the domain is drafted', () => {
	const out = heads.evaluate(threat(), ctx());
	assert.equal(out.decision, 'draft');
	assert.deepEqual(out.reasons, []);
	assert.equal(out.contact, 'security@northwind-shop.io');
});

test('third-party only signals are held until a person confirms them on the site', () => {
	const out = heads.evaluate(threat({ confidence: 'third_party', source: 'Google Web Risk' }), ctx());
	assert.equal(out.decision, 'hold');
	assert.ok(out.reasons.includes('confidence'));
});

test('breach news, vulnerability catalogues and lookalikes never get a heads-up', () => {
	for (const kind of [
		'breach-news',
		'known-exploit-software',
		'lookalike',
		'ddos-trend',
		'mail-blocklist',
		'c2-indicator',
	]) {
		const out = heads.evaluate(threat({ kind: kind }), ctx());
		assert.equal(out.decision, 'hold', kind);
		assert.ok(out.reasons.includes('kind'), kind);
	}
});

test('a signal that is only a company or context match is held by role', () => {
	for (const role of ['company_hit', 'context']) {
		assert.ok(heads.evaluate(threat({ role: role }), ctx()).reasons.includes('role'), role);
	}
});

test('watch and info levels are held; high and critical pass', () => {
	assert.ok(heads.evaluate(threat({ level: 'watch' }), ctx()).reasons.includes('level'));
	assert.equal(heads.evaluate(threat({ level: 'high' }), ctx()).decision, 'draft');
});

test('a signal not seen in the last 7 days, or dated in the future, is held as stale', () => {
	const old = new Date(NOW - 10 * DAY).toISOString();
	assert.ok(heads.evaluate(threat({ last_seen: old, observed_at: old }), ctx()).reasons.includes('stale'));
	const future = new Date(NOW + 2 * 3600e3).toISOString();
	assert.ok(heads.evaluate(threat({ last_seen: future, observed_at: future }), ctx()).reasons.includes('stale'));
});

test('a false positive is never messaged', () => {
	assert.ok(heads.evaluate(threat({ delist_status: 'false_positive' }), ctx()).reasons.includes('false-positive'));
});

test('sales, info, marketing and generic admin addresses are never used', () => {
	const generic = [
		{ email: 'sales@northwind-shop.io', source: 'contact-page', url: '' },
		{ email: 'info@northwind-shop.io', source: 'page', url: '' },
		{ email: 'marketing@northwind-shop.io', source: 'schema', url: '' },
		{ email: 'webmaster@northwind-shop.io', source: 'security.txt', url: '' },
		{ email: 'privacy@northwind-shop.io', source: 'security.txt', url: '' },
		{ email: 'it-sales@northwind-shop.io', source: 'security.txt', url: '' },
	];
	const out = heads.evaluate(threat(), ctx({ found: generic }));
	assert.equal(out.decision, 'hold');
	assert.ok(out.reasons.includes('no-security-contact'));
	assert.equal(out.contact, null);
});

test('abuse, security and CSIRT mailboxes are accepted, with plus-addressing', () => {
	const rdap = [{ email: 'abuse@northwind-shop.io', source: 'rdap', url: '' }];
	assert.equal(heads.evaluate(threat(), ctx({ found: rdap })).contact, 'abuse@northwind-shop.io');
	const csirt = [{ email: 'security+ops@northwind-shop.io', source: 'security.txt', url: '' }];
	assert.equal(heads.evaluate(threat(), ctx({ found: csirt })).contact, 'security+ops@northwind-shop.io');
});

test('a security address on another domain is not used', () => {
	const vendor = [{ email: 'security@vendor-mail.net', source: 'security.txt', url: '' }];
	assert.equal(heads.evaluate(threat(), ctx({ found: vendor })).decision, 'hold');
});

test('a DMARC or SOA address on another domain belongs to a vendor and is ignored', () => {
	const found = [{ email: 'postmaster@dmarc-vendor.net', source: 'dmarc', url: '' }];
	assert.equal(heads.evaluate(threat(), ctx({ found: found })).contact, null);
});

test('opted-out addresses and domains are held', () => {
	const byEmail = heads.evaluate(threat(), ctx({ stopped: new Set(['security@northwind-shop.io']) }));
	assert.ok(byEmail.reasons.includes('stopped'));
	const byDomain = heads.evaluate(threat(), ctx({ stopped: new Set(['@northwind-shop.io']) }));
	assert.ok(byDomain.reasons.includes('stopped'));
});

test('Germany and Austria are held for consent, by domain or by company country', () => {
	const de = [{ email: 'security@northwind-shop.de', source: 'security.txt', url: '' }];
	const deHost = threat({ host: 'shop.northwind-shop.de', company_country: 'US' });
	assert.ok(heads.evaluate(deHost, ctx({ found: de })).reasons.includes('needs-consent'));
	const deCompany = threat({ company_country: 'de' });
	assert.ok(heads.evaluate(deCompany, ctx()).reasons.includes('needs-consent'));
});

test('a domain notified in the last 182 days gets no second message', () => {
	const recent = new Date(NOW - 30 * DAY).toISOString();
	assert.ok(heads.evaluate(threat(), ctx({ lastNoticeAt: recent })).reasons.includes('recently-notified'));
	const old = new Date(NOW - 200 * DAY).toISOString();
	assert.equal(heads.evaluate(threat(), ctx({ lastNoticeAt: old })).decision, 'draft');
});

test('missing opt-out or notice history fails closed', () => {
	assert.ok(heads.evaluate(threat(), { now: NOW, found: SECURITY_FOUND }).reasons.includes('unknown-history'));
	assert.ok(heads.evaluate(threat(), ctx({ stopped: ['x@y.z'] })).reasons.includes('unknown-history'));
});

test('a host that is not a plain domain name is held', () => {
	assert.ok(
		heads.evaluate(threat({ host: 'shop.northwind-shop.io\r\nBcc: x@y.z' }), ctx()).reasons.includes('bad-host')
	);
	assert.equal(heads.evaluate(threat({ host: 'Shop.Northwind-Shop.io.' }), ctx()).decision, 'draft');
});

test('draft is factual, single-send, has a sender identity and an opt-out', () => {
	const mail = heads.draft(threat(), Object.assign(ctx(), { sender: SENDER }));
	assert.equal(mail.to, 'security@northwind-shop.io');
	assert.equal(mail.subject, 'Possible compromise seen on shop.northwind-shop.io');
	assert.match(mail.text, /only once|writing once/);
	assert.match(mail.text, /We will not write to you again/);
	assert.match(mail.text, /reply with the word STOP/);
	assert.match(mail.text, /site:shop\.northwind-shop\.io/);
	assert.match(mail.text, /Hidden casino links in footer/);
	assert.match(mail.text, /Example postal address/);
	assert.match(mail.text, /This message contains no login links/);
	assert.equal(mail.text.includes('<'), false, 'no markup survives in plain text');
});

test('draft never sells: no price, discount, plan, urgency or upsell words', () => {
	const mail = heads.draft(threat(), Object.assign(ctx(), { sender: SENDER }));
	const text = mail.subject + '\n' + mail.text;
	assert.doesNotMatch(
		text,
		/\b(buy|price|pricing|discount|subscribe|upgrade|offer|plan|free|limited|urgent|act now|click|sign ?up)\b|\$\d|€\d/i
	);
});

test('evidence is scrubbed of links, keys, tokens and addresses', () => {
	const dirty = threat({
		evidence:
			'Injected https://evil.example/x?id=1 and ' +
			FAKE_AWS +
			', token=abc123 ' +
			'eyJhbGciOi.eyJzdWIiOi.sig sk_live_abcdefgh12 user@private.org 0123456789abcdef0123456789abcdef ' +
			'QWxhZGRpbjpvcGVuIHNlc2FtZVFXRVJUWVVJT1BfYXNkZmdo',
	});
	const mail = heads.draft(dirty, Object.assign(ctx(), { sender: SENDER }));
	assert.doesNotMatch(mail.text, /evil\.example|AKIA|abc123|eyJ|sk_live|user@private|0123456789abcdef|QWxhZGRp/);
	assert.match(mail.text, /\[link removed\]/);
	assert.match(mail.text, /\[removed\]/);
});

test('exposed secrets are described without repeating any value', () => {
	const secret = threat({ kind: 'exposed-secret', evidence: '' + FAKE_AWS + ' in app.js' });
	const mail = heads.draft(secret, Object.assign(ctx(), { sender: SENDER }));
	assert.match(mail.text, /We have withheld the value/);
	assert.doesNotMatch(mail.text, /AKIA/);
});

test('draft re-runs the gate and refuses a threat that does not pass it', () => {
	const withSender = Object.assign(ctx(), { sender: SENDER });
	assert.throws(() => heads.draft(threat({ confidence: 'third_party' }), withSender));
	assert.throws(() => heads.draft(threat(), Object.assign(ctx({ found: [] }), { sender: SENDER })));
	// A caller-supplied "draft" result cannot bypass the gate.
	const fake = {
		now: NOW,
		found: SECURITY_FOUND,
		stopped: new Set(),
		lastNoticeAt: null,
		sender: SENDER,
		result: { decision: 'draft', contact: 'security@northwind-shop.io' },
	};
	assert.throws(() => heads.draft(threat({ confidence: 'third_party' }), fake), /did not pass/);
});

test('draft refuses to go out without a sender name, postal address and website', () => {
	assert.throws(() => heads.draft(threat(), ctx()), /sender/);
	assert.throws(
		() => heads.draft(threat(), Object.assign(ctx(), { sender: { name: 'x', website: 'https://x' } })),
		/sender/
	);
});

const LANG_STOP = { en: 'STOP', es: 'STOP', pt: 'STOP', de: 'STOP', fr: 'STOP', it: 'STOP' };

test('each language carries the same parts: subject, host, check list, false-positive and STOP reply', () => {
	const withSender = Object.assign(ctx(), { sender: SENDER });
	for (const lang of heads.LANGS) {
		const mail = heads.draft(threat(), Object.assign({}, withSender, { lang: lang }));
		assert.equal(mail.lang, lang);
		assert.equal(mail.text.split('\n')[0], heads.COPY[lang].hello, lang);
		assert.match(mail.subject, /shop\.northwind-shop\.io/, lang);
		assert.equal(mail.text.split('\n').filter((line) => /^[1-4]\. /.test(line)).length, 4, lang);
		assert.match(mail.text, new RegExp('\\b' + LANG_STOP[lang] + '\\b'), lang);
		assert.match(mail.text, /site:shop\.northwind-shop\.io/, lang);
		assert.match(mail.text, /Example postal address/, lang);
		assert.doesNotMatch(mail.text, /\{(host|day|what|ev)\}/, lang);
		assert.equal(mail.text.includes('<'), false, lang);
	}
});

test('non-English drafts do not open with the English Hello', () => {
	const withSender = Object.assign(ctx(), { sender: SENDER });
	for (const lang of heads.LANGS) {
		if (lang === 'en') continue;
		const mail = heads.draft(threat(), Object.assign({}, withSender, { lang: lang }));
		assert.equal(mail.text.startsWith('Hello,'), false, lang);
		assert.equal(mail.text.startsWith(heads.COPY[lang].hello + '\n'), true, lang);
	}
});

test('each language reads as a warning, not a sales message', () => {
	const withSender = Object.assign(ctx(), { sender: SENDER });
	const sales =
		/\b(precio|oferta|descuento|preço|desconto|prix|remise|offre|prezzo|sconto|offerta|angebot|rabatt|preis|kaufen|comprar|acheter|comprare|upgrade|mise à niveau|aggiornamento premium)\b/i;
	for (const lang of heads.LANGS) {
		const mail = heads.draft(threat(), Object.assign({}, withSender, { lang: lang }));
		assert.doesNotMatch(mail.subject + '\n' + mail.text, sales, lang);
	}
});

test('an unknown or missing language falls back to English', () => {
	const withSender = Object.assign(ctx(), { sender: SENDER });
	assert.equal(heads.draft(threat(), Object.assign({}, withSender, { lang: 'xx' })).lang, 'en');
	assert.equal(heads.draft(threat(), withSender).subject, 'Possible compromise seen on shop.northwind-shop.io');
});

test('the English copy is unchanged from the reviewed version', () => {
	const mail = heads.draft(threat(), Object.assign(ctx(), { sender: SENDER }));
	assert.match(
		mail.text,
		/^Hello,\n\nOur scanner, QA-lab URL Review, looked at shop\.northwind-shop\.io on 2026-11-19 and saw spam or hidden links injected into pages\./
	);
});

test('exposed secrets are withheld in every language', () => {
	const secret = threat({ kind: 'exposed-secret', evidence: FAKE_AWS + ' in app.js' });
	for (const lang of heads.LANGS) {
		const mail = heads.draft(secret, Object.assign(ctx(), { sender: SENDER, lang: lang }));
		assert.doesNotMatch(mail.text, /AKIA/, lang);
	}
});
