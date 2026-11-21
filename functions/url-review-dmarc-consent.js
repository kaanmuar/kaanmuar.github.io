'use strict';

/* Consent for reading an owner's DMARC aggregate and TLS-RPT data (#3777). One row per (account email, host) the owner has
   proved (functions/url-review-owner-proof.js), in Firestore url_review_dmarc_consent (store + endpoints in url-review-dmarc-store.js):
   { email, host, on, noticeVersion, at, expireAt }. The row holds the choice and the notice version the owner saw, never report data.

   The review shows owner-report data only when ALL hold: the row is on, its noticeVersion is the current NOTICE_VERSION (a changed
   notice needs a fresh yes), it has not expired, and the owner proof for the same account and host is still valid. Otherwise the
   review keeps today's public-policy-only text. */
const proof = require('./url-review-owner-proof');
const reports = require('./url-review-dmarc-reports');

const COLLECTION = 'url_review_dmarc_consent';
const CONSENT_MS = 365 * 24 * 60 * 60 * 1000;
// Bump when the notice text changes in substance; every earlier yes then stops counting.
const NOTICE_VERSION = '2026-11-20';
// ImprovMX alias on carlosandmunoz.com (mailbox/DNS deploy is a later #3777 step; the UI only shows this address).
const RUA_MAILBOX = 'dmarc@carlosandmunoz.com';

// The privacy notice shown beside the opt-in. English is the source; ES, PT, DE, FR and IT show it in English until native review (#3952).
const NOTICE = {
	version: NOTICE_VERSION,
	title: 'Read my DMARC and TLS-RPT reports',
	mailbox: RUA_MAILBOX,
	lines: [
		'If you turn this on, you point the rua address of your DMARC record and of your TLS-RPT record at ' +
			RUA_MAILBOX +
			'. QA Lab reads the reports that arrive there for this domain only.',
		'Each report is cut down on arrival to counts: messages per sending server (IP address) per day, how many passed or failed DMARC, what the receiver did with the failures, and which kind of failure it was.',
		'QA Lab does not keep message-level data: no subject, no sender or recipient address, no message ID, no report text. The raw report is discarded after it is counted.',
		'The counts are used for one thing: telling you in the review whether legitimate senders would fail and whether p=reject is safe to reach. They are not shared and not used for anything else.',
		'You can turn this off at any time and the counts are deleted. Without a yes from you, the review only states your public DMARC policy.',
	],
};

// The owner's answer as a row, or null. Turning on needs the current notice version echoed back, an owner proof that is valid
// (proofKind from proof.validFor) and accept === true; turning off needs neither, so an owner can always withdraw.
function consentRecord(input, proofKind, now) {
	const at = now || Date.now();
	const email = proof.emailOf(input && input.email);
	const host = proof.hostOf(input && input.host);
	if (!email || !host) return null;
	const on = !!input && input.accept === true;
	if (on && (!proofKind || input.noticeVersion !== NOTICE_VERSION)) return null;
	return {
		email,
		host,
		on,
		noticeVersion: on ? NOTICE_VERSION : String((input && input.noticeVersion) || ''),
		at: new Date(at).toISOString(),
		expireAt: new Date(at + CONSENT_MS),
	};
}

function docId(email, host) {
	return proof.docId('dmarc-consent', email, host);
}

function expiry(row) {
	const value = row && row.expireAt;
	if (!value) return 0;
	if (typeof value.toDate === 'function') return value.toDate().getTime();
	return new Date(value).getTime() || 0;
}

// True when this row lets the review read the owner's report data.
function consentOn(row, proofKind, now) {
	return !!(
		row &&
		row.on === true &&
		row.noticeVersion === NOTICE_VERSION &&
		expiry(row) > (now || Date.now()) &&
		proofKind
	);
}

// What the review gets: null (consent off, no data: public-policy-only text) or { dmarc, tls } with the verdicts.
// dmarcList and tlsList are the stored reduced aggregates (functions/url-review-dmarc-reports.js), merged here.
function ownerReportView(row, proofKind, dmarcList, tlsList, now) {
	if (!consentOn(row, proofKind, now)) return null;
	const dmarcAgg = reports.merge(dmarcList, 'dmarc');
	const tlsAgg = reports.merge(tlsList, 'tlsrpt');
	const dmarc = reports.totals(dmarcAgg).messages ? reports.tightenVerdict(dmarcAgg) : null;
	const tls = reports.totals(tlsAgg).messages ? reports.tlsVerdict(tlsAgg) : null;
	return dmarc || tls ? { dmarc, tls } : null;
}

module.exports = {
	COLLECTION,
	CONSENT_MS,
	NOTICE_VERSION,
	NOTICE,
	RUA_MAILBOX,
	consentRecord,
	docId,
	consentOn,
	ownerReportView,
};
