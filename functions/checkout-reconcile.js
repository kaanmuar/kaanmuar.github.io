'use strict';
/* Scheduled two-way checkout reconciliation (#3837).

   Loads recent PayPal payment rows from url_reviews, fetches the matching captures (and optional
   transaction-search extras) from PayPal when credentials exist, then calls webhook-idempotency
   reconcile(). Records counts only in checkout_reconcile_runs — no payer email, no event body.

   Pattern from hyperswitch payment reconciliation + svix delivery safety (same ticket as
   webhook-idempotency.js); no new dependency. */

const { reconcile } = require('./webhook-idempotency');

const COLLECTION = 'checkout_reconcile_runs';
const WINDOW_DAYS = 7;
const LIMIT = 200;

// Payment rows the PayPal webhook creates or updates (see fulfillPayment / reversePayment).
const PAYMENT_STATUSES = new Set([
	'paid-report',
	'paid-addon',
	'run-credit',
	'run-credit-used',
	'run-credit-returned',
	'run-credit-refunded',
	'monthly-pass',
]);

function isPayPalRow(row) {
	if (!row) return false;
	if (row.provider === 'paypal' || row.method === 'paypal') return true;
	if (row.captureId && !/^cs_/.test(String(row.sessionId || ''))) return true;
	return false;
}

function localStatus(row) {
	if (
		row.refunded === true ||
		row.status === 'run-credit-refunded' ||
		/refund/i.test(String(row.status || ''))
	)
		return 'refunded';
	return 'paid';
}

function mapLocal(row) {
	const orderId = String(row.sessionId || '')
		.replace(/[^A-Z0-9]/g, '')
		.slice(0, 22);
	if (!/^[A-Z0-9]{10,22}$/.test(orderId)) return null;
	return {
		ref: String(row.id || '').slice(0, 40),
		orderId,
		captureId: String(row.captureId || '')
			.replace(/[^A-Z0-9]/g, '')
			.slice(0, 22),
		amount: Number(row.priceUsd) || 0,
		currency: String(row.currency || 'USD').toUpperCase() || 'USD',
		status: localStatus(row),
	};
}

function providerStatus(raw) {
	const s = String(raw || '').toUpperCase();
	if (s === 'COMPLETED') return 'completed';
	if (s === 'REFUNDED' || s === 'PARTIALLY_REFUNDED') return 'refunded';
	return String(raw || '').toLowerCase();
}

/** Capture / order body → reconcile provider row. */
function fromCapture(body, fallbackOrderId) {
	if (!body || typeof body !== 'object') return null;
	const related = (body.supplementary_data && body.supplementary_data.related_ids) || {};
	const orderId = String(related.order_id || fallbackOrderId || '')
		.replace(/[^A-Z0-9]/g, '')
		.slice(0, 22);
	const captureId = String(body.id || '')
		.replace(/[^A-Z0-9]/g, '')
		.slice(0, 22);
	if (!/^[A-Z0-9]{10,22}$/.test(orderId)) return null;
	const amount = body.amount || {};
	return {
		orderId,
		captureId: /^[A-Z0-9]{10,22}$/.test(captureId) ? captureId : '',
		amount: Number(amount.value) || 0,
		currency: String(amount.currency_code || 'USD').toUpperCase(),
		status: providerStatus(body.status),
	};
}

function fromOrder(body) {
	if (!body || typeof body !== 'object') return null;
	const orderId = String(body.id || '')
		.replace(/[^A-Z0-9]/g, '')
		.slice(0, 22);
	const unit = (body.purchase_units || [])[0] || {};
	const capture = ((unit.payments && unit.payments.captures) || [])[0] || null;
	if (!capture) return null;
	return fromCapture(capture, orderId);
}

function countsOf(diff) {
	return {
		matched: (diff.matched || []).length,
		missingLocal: (diff.missingLocal || []).length,
		missingProvider: (diff.missingProvider || []).length,
		amountMismatch: (diff.amountMismatch || []).length,
		statusMismatch: (diff.statusMismatch || []).length,
	};
}

function emptySummary(extra) {
	return Object.assign(
		{
			skipped: '',
			localCount: 0,
			providerCount: 0,
			matched: 0,
			missingLocal: 0,
			missingProvider: 0,
			amountMismatch: 0,
			statusMismatch: 0,
		},
		extra || {}
	);
}

/** Load recent PayPal payment rows. store.listPayments(sinceIso) returns raw docs with id. */
async function loadLocal(store, sinceIso, limit) {
	const rows = await store.listPayments(sinceIso, limit || LIMIT);
	const out = [];
	const seen = new Set();
	for (const row of rows || []) {
		if (!isPayPalRow(row)) continue;
		if (row.status && !PAYMENT_STATUSES.has(row.status) && row.paid !== true && row.refunded !== true)
			continue;
		const mapped = mapLocal(row);
		if (!mapped || seen.has(mapped.orderId)) continue;
		seen.add(mapped.orderId);
		out.push(mapped);
	}
	return out;
}

/** Fetch provider captures for local order ids; merge optional extras (e.g. transaction search). */
async function loadProvider(local, provider) {
	const byOrder = new Map();
	const put = (row) => {
		if (!row || !row.orderId) return;
		if (!byOrder.has(row.orderId)) byOrder.set(row.orderId, row);
	};
	for (const row of local || []) {
		let remote = null;
		if (row.captureId && provider.getCapture) {
			try {
				remote = fromCapture(await provider.getCapture(row.captureId), row.orderId);
			} catch (error) {
				remote = null;
			}
		}
		if (!remote && provider.getOrder) {
			try {
				remote = fromOrder(await provider.getOrder(row.orderId));
			} catch (error) {
				remote = null;
			}
		}
		put(remote);
	}
	if (provider.listExtra) {
		try {
			const extra = await provider.listExtra();
			for (const row of extra || []) put(fromCapture(row) || row);
		} catch (error) {
			/* transaction search is optional (NOT_AUTHORIZED on many apps) */
		}
	}
	return Array.from(byOrder.values());
}

async function run({ store, provider, now, windowDays, limit, log }) {
	const clock = now || Date.now();
	const days = windowDays || WINDOW_DAYS;
	const sinceIso = new Date(clock - days * 86400000).toISOString();
	const write = async (summary) => {
		const doc = Object.assign(
			{
				at: new Date(clock).toISOString(),
				windowDays: days,
			},
			summary
		);
		if (store && store.saveRun) await store.saveRun(doc);
		return doc;
	};

	if (!provider || !provider.ready) {
		const note = 'checkoutReconcile: PayPal credentials missing; no-op';
		(log || console.log)(note);
		return write(emptySummary({ skipped: 'no-credentials', note }));
	}

	const local = await loadLocal(store, sinceIso, limit);
	const remote = await loadProvider(local, provider);
	const diff = reconcile(local, remote);
	const counts = countsOf(diff);
	const summary = emptySummary(
		Object.assign(
			{
				skipped: '',
				localCount: local.length,
				providerCount: remote.length,
			},
			counts
		)
	);
	(log || console.log)(
		'checkoutReconcile: local=' +
			summary.localCount +
			' provider=' +
			summary.providerCount +
			' matched=' +
			summary.matched +
			' missingLocal=' +
			summary.missingLocal +
			' missingProvider=' +
			summary.missingProvider +
			' amountMismatch=' +
			summary.amountMismatch +
			' statusMismatch=' +
			summary.statusMismatch
	);
	return write(summary);
}

/** Firestore-backed store used by the scheduled job. */
function firestoreStore(db) {
	return {
		async listPayments(sinceIso, limit) {
			const fields = [
				'createdAt',
				'paid',
				'refunded',
				'priceUsd',
				'currency',
				'provider',
				'method',
				'status',
				'sessionId',
				'captureId',
				'test',
				'paypalMode',
			];
			// Same paid+createdAt window Jarvis money() uses (existing composite index).
			const snap = await db
				.collection('url_reviews')
				.where('paid', '==', true)
				.where('createdAt', '>=', sinceIso)
				.select(...fields)
				.limit(limit || LIMIT)
				.get();
			return snap.docs.map((doc) => Object.assign({ id: doc.id }, doc.data()));
		},
		async saveRun(doc) {
			const id = String(doc.at || new Date().toISOString()).replace(/[^0-9T]/g, '').slice(0, 20);
			await db.collection(COLLECTION).doc(id || 'run').set(doc);
		},
	};
}

module.exports = {
	COLLECTION,
	WINDOW_DAYS,
	LIMIT,
	PAYMENT_STATUSES,
	isPayPalRow,
	mapLocal,
	localStatus,
	fromCapture,
	fromOrder,
	providerStatus,
	countsOf,
	loadLocal,
	loadProvider,
	run,
	firestoreStore,
};
