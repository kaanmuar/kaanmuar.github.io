'use strict';

/* Security heads-up (#3992): one factual warning per domain when our own scan observed a compromise
   on a site, sent to its security or abuse contact. It is a warning, not a sales sequence: no price,
   no urgency, no upsell, no login links, and no second message about the same finding.

   This module is pure. `evaluate` decides whether a threat record may get a heads-up and to which address,
   and `draft` writes the message. NOTHING IN THIS FILE SENDS MAIL. The caller loads the opt-out set
   (url_review_owner_stops), the domain's last notice and the site's contacts, and a person reviews each draft
   before any sender exists. Owner notices (url-review-owner-notice.js) stay a separate flow. */

const ownerNotice = require('./url-review-owner-notice');

// Only signals that show the site itself is compromised, seen by our own scan.
// Breach news, vulnerability catalogues, DDoS trends, lookalike domains and blocklists are not included.
const SITE_KINDS = ['hacked-spam', 'defacement', 'phishing-host', 'malware-host', 'exposed-secret'];
const LEVELS = ['high', 'critical'];
const ROLES = ['site_hit', 'host_used'];
const FRESH_MS = 7 * 864e5;
// The same contact sources the owner notice ranks, minus marketing and sales pages.
const SECURITY_SOURCES = ['security.txt', 'rdap', 'dmarc', 'soa'];
// Abuse and security mailboxes only. Generic roles (info, admin, webmaster, it) are left out on purpose.
const SECURITY_ROLE = /^(security|abuse|csirt|cert|soc|noc|infosec)(\+[a-z0-9._-]*)?$/;
const HOST = /^(?=.{4,253}$)([a-z0-9]([a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,63}$/;
// §7 UWG (Germany) and Austria need prior consent for advertising mail, even between businesses.
const CONSENT_TLDS = /\.(de|at)$/i;
const CONSENT_COUNTRIES = ['DE', 'AT'];

const REASONS = {
	kind: 'Not a compromise signal we send about.',
	role: 'The host is not the one the signal was seen on.',
	level: 'Below high severity.',
	confidence: 'Only seen in a third-party list; a person must confirm it on the site first.',
	stale: 'Last seen more than 7 days ago, or dated in the future.',
	'false-positive': 'Marked as a false positive.',
	'recently-notified': 'This domain got a heads-up or owner notice in the last 182 days.',
	stopped: 'This address or domain asked for no messages.',
	'needs-consent': 'Germany or Austria: advertising mail needs prior consent.',
	'no-security-contact':
		"No security or abuse address on the site's own domain; nothing goes to sales or marketing inboxes.",
	'bad-host': 'The host is not a plain domain name.',
	'unknown-history': 'No opt-out list or last-notice record was given; a person must check first.',
};

const PLAIN = {
	'hacked-spam': 'spam or hidden links injected into pages',
	defacement: 'pages that changed without authorization',
	'phishing-host': 'a page that looks like a login or payment form used to trick visitors',
	'malware-host': 'a page that serves malicious code to visitors',
	'exposed-secret': 'a key-like string visible in public page code',
};

// Anything that looks like a credential, token, key or address is removed from the evidence before it is quoted.
// Each pattern is linear: no nested or overlapping quantifiers, so hostile page text cannot make the scrub slow.
const SECRET_PATTERNS = [
	/AKIA[0-9A-Z]{12,64}/g,
	/eyJ[A-Za-z0-9_.-]{4,400}/g,
	/\b(?:sk|pk|rk|ghp|gho|xox[bpas])[_-][A-Za-z0-9_-]{8,200}/g,
	/(?:key|token|secret|pass(?:word)?)=[^\s&]{1,200}/gi,
	/[A-Za-z0-9+/_-]{24,200}={0,2}/g,
	/[a-f0-9]{32,200}/gi,
	/[A-Za-z0-9._%+-]{1,64}@[A-Za-z0-9-]{1,63}(?:\.[A-Za-z0-9-]{1,63})+/gi,
];

function scrub(value) {
	let text = String(value == null ? '' : value)
		.replace(/<[^>]*>/g, ' ')
		.replace(/https?:\/\/\S+/gi, '[link removed]')
		.replace(/\s+/g, ' ')
		.trim();
	SECRET_PATTERNS.forEach((pattern) => {
		text = text.replace(pattern, '[removed]');
	});
	return text.length > 200 ? text.slice(0, 199) + '…' : text;
}

function reasonsFor(threat, ctx) {
	const row = threat || {};
	const opts = ctx || {};
	const now = opts.now || Date.now();
	const out = [];
	const host = String(row.host || '')
		.toLowerCase()
		.replace(/\.$/, '');
	if (!HOST.test(host)) out.push('bad-host');
	if (SITE_KINDS.indexOf(row.kind) === -1) out.push('kind');
	if (ROLES.indexOf(row.role) === -1) out.push('role');
	if (LEVELS.indexOf(row.level) === -1) out.push('level');
	if (row.confidence !== 'observed') out.push('confidence');
	if (row.delist_status === 'false_positive') out.push('false-positive');
	const seen = Date.parse(row.last_seen || row.observed_at || '') || 0;
	if (!seen || now - seen > FRESH_MS || seen > now + 3600e3) out.push('stale');

	const domain = host ? ownerNotice.domainOf(host) : '';
	if (!(opts.stopped instanceof Set) || opts.lastNoticeAt === undefined) out.push('unknown-history');
	const stopped = opts.stopped instanceof Set ? opts.stopped : new Set();
	if (stopped.has('@' + domain) || (opts.contact && stopped.has(String(opts.contact).toLowerCase())))
		out.push('stopped');
	if (CONSENT_TLDS.test(host) || CONSENT_COUNTRIES.indexOf(String(row.company_country || '').toUpperCase()) !== -1) {
		out.push('needs-consent');
	}
	if (opts.lastNoticeAt) {
		const at = Date.parse(opts.lastNoticeAt) || 0;
		if (!at || now - at < ownerNotice.QUIET_MS) out.push('recently-notified');
	}
	return out;
}

// The best security or abuse address on the site's own domain, or null.
function securityContact(host, found) {
	const ranked = ownerNotice.rankContacts(found || [], host);
	const hit = ranked.find(
		(row) =>
			row.onDomain &&
			row.sources.some((source) => SECURITY_SOURCES.indexOf(source) !== -1) &&
			SECURITY_ROLE.test(row.email.split('@')[0])
	);
	return hit ? hit.email : null;
}

/* threat: a url_review_threats record. ctx: { now, found: contact rows [{email, source, url}], stopped: Set of
   emails and "@domain" keys, lastNoticeAt: ISO time of the domain's last heads-up or owner notice, or null when
   it has none }. Returns { decision: "draft" | "hold", reasons: [code], contact: email | null }. */
function evaluate(threat, ctx) {
	const opts = ctx || {};
	const contact = securityContact(
		String((threat && threat.host) || '')
			.toLowerCase()
			.replace(/\.$/, ''),
		opts.found
	);
	const reasons = reasonsFor(threat, Object.assign({}, opts, { contact: contact }));
	if (!contact) reasons.push('no-security-contact');
	return { decision: reasons.length ? 'hold' : 'draft', reasons: reasons, contact: contact };
}

function day(iso) {
	const ms = Date.parse(iso || '');
	return Number.isFinite(ms) ? new Date(ms).toISOString().slice(0, 10) : 'an unknown date';
}

/* Writes the heads-up for a threat. The gate is always re-run here; a caller cannot pass a stale result.
   ctx: as evaluate, plus sender: { name, postalAddress, website } (postalAddress is required before any send).
   Only English for now; other languages are a follow-up ticket.
   Returns { to, subject, text }. Throws when the threat does not pass the gate, so no draft skips it. */
function draft(threat, ctx) {
	const opts = ctx || {};
	const result = evaluate(threat, opts);
	if (result.decision !== 'draft' || !result.contact) throw new Error('heads-up: threat did not pass the gate');
	const sender = opts.sender || {};
	if (!sender.name || !sender.postalAddress || !sender.website)
		throw new Error('heads-up: sender name, postal address and website are required');
	const host = String(threat.host).toLowerCase().replace(/\.$/, '');
	const what = PLAIN[threat.kind];
	const evidence =
		threat.kind === 'exposed-secret'
			? 'A key-like string appears in public page code. We have withheld the value.'
			: 'What we saw: ' + (scrub(threat.evidence) || 'see the page source') + '.';
	const subject = 'Possible compromise seen on ' + host;
	const text = [
		'Hello,',
		'',
		'Our scanner, QA-lab URL Review, looked at ' +
			host +
			' on ' +
			day(threat.last_seen || threat.observed_at) +
			' and saw ' +
			what +
			'.',
		'We are writing once so your team can check it. It may be a false positive; if so, reply with the word FALSE POSITIVE and we will confirm and stop.',
		'',
		evidence,
		'',
		'How to check (about 10 minutes):',
		'1. Open the page in a private window and view the source for scripts, hidden frames or redirects you do not recognise.',
		'2. Search Google for site:' + host + ' and look for pages you did not publish.',
		'3. Check your hosting control panel and recent file changes, including plugins and themes.',
		'4. Use your usual hosting or Search Console login to review any security warning. This message contains no login links.',
		'',
		'If it is real: change hosting, admin and API passwords; remove unknown files; update the CMS and plugins; then ask your host or an incident responder for help.',
		'',
		'We will not write to you again about this finding. To stop all messages from us, reply with the word STOP.',
		'',
		sender.name,
		sender.postalAddress,
		sender.website,
	].join('\n');
	return { to: result.contact, subject: subject, text: text };
}

module.exports = {
	SITE_KINDS,
	LEVELS,
	ROLES,
	SECURITY_SOURCES,
	REASONS,
	evaluate,
	draft,
	securityContact,
	reasonsFor,
	scrub,
};
