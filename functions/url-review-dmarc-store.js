'use strict';

/* Firestore store for owner DMARC / TLS-RPT consent and aggregate counts (#3777 slice 2).
   Consent rows: url_review_dmarc_consent (shape from url-review-dmarc-consent.js).
   Counts: url_review_dmarc_counts — one reduced aggregate per (email, host, kind). No message-level fields.
   Withdraw writes consent off and deletes every counts doc for that email+host. */
const proof = require('./url-review-owner-proof');
const consent = require('./url-review-dmarc-consent');
const reports = require('./url-review-dmarc-reports');

const COUNTS_COLLECTION = 'url_review_dmarc_counts';

function countsDocId(email, host, kind) {
	return proof.docId('dmarc-counts-' + (kind === 'tlsrpt' ? 'tlsrpt' : 'dmarc'), email, host);
}

function untilOf(row) {
	const value = row && row.expireAt;
	if (!value) return '';
	if (typeof value.toDate === 'function') return value.toDate().toISOString();
	const ms = new Date(value).getTime();
	return Number.isFinite(ms) && ms > 0 ? new Date(ms).toISOString() : '';
}

function publicConsent(row) {
	if (!row) return null;
	return {
		email: proof.emailOf(row.email),
		host: proof.hostOf(row.host),
		on: row.on === true,
		noticeVersion: String(row.noticeVersion || ''),
		at: row.at || '',
		until: untilOf(row),
	};
}

function proofKindOf(rows, email, host, now) {
	return proof.validFor(rows || [], email, host, now);
}

// Turn consent on or off for a signed-in owner. Turning on needs a live owner proof and the current notice version.
async function setConsent(store, input, proofRows, now) {
	const at = now || Date.now();
	const email = proof.emailOf(input && input.email);
	const host = proof.hostOf(input && input.host);
	if (!email || !host) return { ok: false, status: 400, error: 'Enter a public host name, such as shop.example.com.' };
	const kind = proofKindOf(proofRows, email, host, at);
	const row = consent.consentRecord(
		{
			email,
			host,
			accept: !!(input && input.accept === true),
			noticeVersion: input && input.noticeVersion,
		},
		kind,
		at
	);
	if (!row) {
		if (input && input.accept === true && !kind)
			return { ok: false, status: 403, error: 'Prove you own this domain before turning report reading on.' };
		return {
			ok: false,
			status: 400,
			error: 'To turn this on, accept the current privacy notice (version ' + consent.NOTICE_VERSION + ').',
		};
	}
	const id = consent.docId(email, host);
	await store.replace(consent.COLLECTION, id, row);
	let deleted = 0;
	if (!row.on) deleted = await deleteCounts(store, email, host);
	return { ok: true, consent: publicConsent(row), proofKind: kind || '', deleted };
}

async function getConsent(store, email, host) {
	const who = proof.emailOf(email);
	const where = proof.hostOf(host);
	if (!who || !where) return null;
	return store.get(consent.COLLECTION, consent.docId(who, where));
}

async function deleteCounts(store, email, host) {
	const who = proof.emailOf(email);
	const where = proof.hostOf(host);
	if (!who || !where) return 0;
	let n = 0;
	for (const kind of ['dmarc', 'tlsrpt']) {
		const id = countsDocId(who, where, kind);
		if (await store.get(COUNTS_COLLECTION, id)) {
			await store.remove(COUNTS_COLLECTION, id);
			n += 1;
		}
	}
	return n;
}

async function loadAggregates(store, email, host) {
	const who = proof.emailOf(email);
	const where = proof.hostOf(host);
	if (!who || !where) return { dmarc: [], tls: [] };
	const dmarc = await store.get(COUNTS_COLLECTION, countsDocId(who, where, 'dmarc'));
	const tls = await store.get(COUNTS_COLLECTION, countsDocId(who, where, 'tlsrpt'));
	return {
		dmarc: dmarc && dmarc.kind === 'dmarc' ? [stripMeta(dmarc)] : [],
		tls: tls && tls.kind === 'tlsrpt' ? [stripMeta(tls)] : [],
	};
}

function stripMeta(row) {
	return {
		kind: row.kind,
		domain: row.domain || '',
		policy: row.policy || { p: '', pct: 100 },
		days: row.days || {},
		sources: row.sources || {},
	};
}

// Fold a freshly reduced aggregate into the stored one for that owner+host+kind.
async function saveAggregate(store, email, host, agg, now) {
	const who = proof.emailOf(email);
	const where = proof.hostOf(host);
	if (!who || !where || !agg || (agg.kind !== 'dmarc' && agg.kind !== 'tlsrpt')) return null;
	const id = countsDocId(who, where, agg.kind);
	const prev = await store.get(COUNTS_COLLECTION, id);
	const merged = reports.merge([prev && prev.kind === agg.kind ? stripMeta(prev) : null, stripMeta(agg)].filter(Boolean), agg.kind);
	const at = now || Date.now();
	const row = Object.assign({}, merged, {
		email: who,
		host: where,
		at: new Date(at).toISOString(),
		expireAt: new Date(at + consent.CONSENT_MS),
	});
	await store.replace(COUNTS_COLLECTION, id, row);
	return stripMeta(row);
}

// Consent rows for a reported domain that are still on (notice current, unexpired). Caller supplies proof rows per email.
async function consentsForHost(store, host, now) {
	const where = proof.hostOf(host);
	if (!where) return [];
	const rows = await store.where(consent.COLLECTION, 'host', where, 50);
	return rows.filter((row) => row && row.on === true && row.noticeVersion === consent.NOTICE_VERSION && expiry(row) > (now || Date.now()));
}

function expiry(row) {
	const value = row && row.expireAt;
	if (!value) return 0;
	if (typeof value.toDate === 'function') return value.toDate().getTime();
	return new Date(value).getTime() || 0;
}

module.exports = {
	COUNTS_COLLECTION,
	countsDocId,
	publicConsent,
	setConsent,
	getConsent,
	deleteCounts,
	loadAggregates,
	saveAggregate,
	consentsForHost,
	proofKindOf,
};
