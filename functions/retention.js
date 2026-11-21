'use strict';
/*
 * Retention (#3823, #4026): deletes what has outlived its period, so the Retention paragraphs of
 * qa-review-legal.html are true.
 *
 *   outreach_people   12 months after its last contact (the latest thread, DM, offer, history entry, next step or update).
 *                     A person who declined or is blocked keeps a stub only: address, handle, domain, network, stage.
 *                     That stub is the do-not-contact record, so nobody is written to after asking not to be.
 *   engagement_posts  12 months after the latest of seenAt, decidedAt, postedAt, updatedAt.
 *   messages          24 months after createdAt (contact-form and CV messages).
 *   ratings           24 months after createdAt.
 *   bookings          24 months after the latest of createdAt, start and end (the call and its follow-up).
 *   url_review_fix_requests  unpaid: 12 months after the last change; paid: until January 1 of the sixth year
 *                     after the payment (same tax period as the payment record), unless taxHold is set.
 *   url_reviews       payment rows only (report payments, credits, passes): until expireAt, or January 1 of the
 *                     sixth year after the payment when expireAt is missing; taxHold keeps the row. Review runs
 *                     themselves stay on Firestore TTL (12 months).
 *   url_review_redemptions  coupon redemptions: same tax period as payment rows.
 *
 * A row with no readable date is kept and counted as "undated". A taxHold flag keeps a payment-related row past
 * its date while the income-tax return it supports is not final (legal page). sweep() is a dry run unless apply
 * is true; the scheduled job (functions/index.js, retentionSweep) applies only when RETENTION_APPLY=on. Each run
 * writes its counts, never a person's name or text, to retention_runs/<time>.
 */

const { paymentExpireAt } = require('./url-review-core');

const STOPPED = ['declined', 'blocked'];
const STUB_FIELDS = ['id', 'kind', 'network', 'handle', 'domain', 'email', 'stage'];
const PAGE = 300; // documents read per page; a page's deletes fit one batch (limit 500)
const MAX_WRITES = 5000; // deletes or stubs per run; the rest wait for the next run

// Payment records in url_reviews (not a paid run's report doc, which keeps paid:true with a 12-month retain).
const PAYMENT_STATUSES = new Set([
	'paid-report',
	'paid-addon',
	'run-credit',
	'run-credit-used',
	'run-credit-returned',
	'run-credit-refunded',
	'monthly-pass',
]);

const toMs = (v) => {
	if (v == null || v === '') return NaN;
	if (typeof v.toDate === 'function') return v.toDate().getTime();
	if (v instanceof Date) return v.getTime();
	if (typeof v === 'number') return v;
	return Date.parse(String(v));
};

/** The latest readable date among values, or NaN. */
function latest(values) {
	const ms = values.map(toMs).filter(Number.isFinite);
	return ms.length ? Math.max(...ms) : NaN;
}

/** `ms` plus whole months, in UTC. */
function addMonths(ms, months) {
	const d = new Date(ms);
	d.setUTCMonth(d.getUTCMonth() + months);
	return d.getTime();
}

/** January 1 of the sixth year after the payment, or the row's expireAt when already set (#4026). */
function taxUntil(data, at) {
	const fromExpire = toMs(data && data.expireAt);
	if (Number.isFinite(fromExpire)) return fromExpire;
	return paymentExpireAt(at).getTime();
}

const entries = (list, key) =>
	(Array.isArray(list) ? list : []).map((x) => (x && typeof x === 'object' ? x[key] : null));

/** Every date that counts as contact with a person in the ledger. */
function personDates(d) {
	return [d.updatedAt, d.createdAt, d.nextAt].concat(
		entries(d.threads, 'lastAt'),
		entries(d.dms, 'at'),
		entries(d.offers, 'at'),
		entries(d.history, 'at')
	);
}

const POLICY = [
	{ collection: 'outreach_people', months: 12, dates: personDates, stopped: true },
	{ collection: 'engagement_posts', months: 12, dates: (d) => [d.seenAt, d.decidedAt, d.postedAt, d.updatedAt] },
	{ collection: 'messages', months: 24, dates: (d) => [d.createdAt] },
	{ collection: 'ratings', months: 24, dates: (d) => [d.createdAt] },
	{ collection: 'bookings', months: 24, dates: (d) => [d.createdAt, d.start, d.end] },
	{
		collection: 'url_review_fix_requests',
		dates: (d) => (d.paid || d.paidAt ? [d.paidAt, d.createdAt] : [d.createdAt, d.updatedAt]),
		until: (d, at) => (d.paid || d.paidAt ? taxUntil(d, at) : addMonths(at, 12)),
		keep: (d) => !!d.taxHold,
	},
	{
		collection: 'url_reviews',
		only: (d) => PAYMENT_STATUSES.has(d && d.status),
		dates: (d) => [d.createdAt, d.at],
		until: taxUntil,
		keep: (d) => !!d.taxHold,
	},
	{
		collection: 'url_review_redemptions',
		dates: (d) => [d.at, d.createdAt],
		until: taxUntil,
		keep: (d) => !!d.taxHold,
	},
];

/** What happens to one document: keep, delete, trim (stop-list stub), or undated (kept). */
function decide(policy, data, now) {
	if (policy.stopped && data.trimmed) return 'keep';
	if (policy.keep && policy.keep(data)) return 'keep';
	if (policy.only && !policy.only(data)) return 'keep';
	const at = latest(policy.dates(data));
	if (!Number.isFinite(at)) return 'undated';
	const until = typeof policy.until === 'function' ? policy.until(data, at) : addMonths(at, policy.months);
	if (!Number.isFinite(until) || until > now) return 'keep';
	return policy.stopped && STOPPED.includes(data.stage) ? 'trim' : 'delete';
}

/** The stop-list stub kept in place of a declined or blocked person's row. */
function stubOf(data, now) {
	const stub = { trimmed: true, trimmedAt: new Date(now).toISOString() };
	STUB_FIELDS.forEach((k) => {
		if (data[k] != null && data[k] !== '') stub[k] = data[k];
	});
	return stub;
}

/**
 * Walks every policy collection and plans (or, with apply, makes) the deletes and stubs. Returns counts per
 * collection: seen, keep, delete, trim, undated, deferred (over the per-run cap).
 */
async function sweep(db, { now = Date.now(), apply = false, maxWrites = MAX_WRITES } = {}) {
	const report = { at: new Date(now).toISOString(), apply: apply === true, writes: 0, collections: {} };
	for (const policy of POLICY) {
		const counts = { seen: 0, keep: 0, delete: 0, trim: 0, undated: 0, deferred: 0 };
		let last = null;
		for (;;) {
			let query = db.collection(policy.collection).orderBy('__name__').limit(PAGE);
			if (last) query = query.startAfter(last);
			const snap = await query.get();
			if (snap.empty) break;
			const batch = db.batch();
			let staged = 0;
			for (const doc of snap.docs) {
				counts.seen++;
				const data = doc.data();
				const verdict = decide(policy, data, now);
				if (verdict === 'delete' || verdict === 'trim') {
					if (report.writes >= maxWrites) {
						counts.deferred++;
						continue;
					}
					report.writes++;
					counts[verdict]++;
					if (apply) {
						if (verdict === 'delete') batch.delete(doc.ref);
						else batch.set(doc.ref, stubOf(data, now));
						staged++;
					}
				} else {
					counts[verdict]++;
				}
			}
			if (apply && staged) await batch.commit();
			last = snap.docs[snap.docs.length - 1];
			if (snap.size < PAGE) break;
		}
		report.collections[policy.collection] = counts;
	}
	await db.collection('retention_runs').doc(report.at).set(report);
	return report;
}

module.exports = {
	POLICY,
	STOPPED,
	PAYMENT_STATUSES,
	decide,
	stubOf,
	latest,
	addMonths,
	taxUntil,
	sweep,
	MAX_WRITES,
};
