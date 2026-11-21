'use strict';
/* Webhook idempotency and checkout reconciliation (#3837).

   Payment providers deliver at least once: PayPal retries a non-2xx answer for three days, Stripe for up to
   three days too, and both can send the same event twice at once. This module makes a handler safe under that:

     eventKey(provider, mode, event, headers)   a stable key for one provider event
     runOnce(store, key, apply)                 claim, apply, then mark done; a duplicate is a no-op
     reconcile(local, provider)                 two-way compare of our payment rows and the provider's captures

   Lifecycle of one event, stored under its key ("webhook_events" in Firestore):
     processing  claimed by one delivery; another delivery inside the lease answers "busy" (HTTP 409)
     done        applied; every later delivery is a duplicate and applies nothing
     failed      apply threw; the provider's retry claims it again (attempts counts the tries)
   A "processing" claim older than the lease was left by a call that died part way, so the next delivery takes it.

   Only ids, status and timestamps are stored: never the event body, the payer or an amount.

   The pattern (a claim record per event id with a lease, a done marker, replay as a no-op) is the one svix-webhooks
   (MIT) and hyperswitch (Apache-2.0) document for webhook consumers and payment reconciliation. Written for this repo
   from those descriptions; no code is copied and no dependency is added. */

const crypto = require('node:crypto');

const COLLECTION = 'webhook_events';
const LEASE_MS = 120000;
const KEEP_DAYS = 90;

function sha(text, size) {
	return crypto
		.createHash('sha256')
		.update(String(text))
		.digest('hex')
		.slice(0, size || 32);
}

// One key per provider event. PayPal events carry "id" (WH-...), Stripe events carry "id" (evt_...). An event with no
// usable id falls back to the delivery id header, then to a hash of the body, so a delivery always gets a key.
function eventKey(provider, mode, event, headers) {
	const p = String(provider || '')
		.toLowerCase()
		.replace(/[^a-z]/g, '')
		.slice(0, 12);
	const m = mode === 'sandbox' || mode === 'test' ? 'test' : 'live';
	if (!p) return null;
	const body = event && typeof event === 'object' ? event : {};
	const id = String(body.id || '')
		.replace(/[^A-Za-z0-9_.:-]/g, '')
		.slice(0, 80);
	const h = headers || {};
	const delivery = String(h['paypal-transmission-id'] || '')
		.replace(/[^A-Za-z0-9_.:-]/g, '')
		.slice(0, 80);
	let source = 'id';
	let basis = id;
	if (!basis && delivery) {
		source = 'delivery';
		basis = delivery;
	}
	if (!basis) {
		source = 'body';
		basis = JSON.stringify(body);
	}
	return {
		provider: p,
		mode: m,
		source,
		eventId: source === 'body' ? '' : basis,
		type: String(body.event_type || body.type || '').slice(0, 80),
		docId: p + '-' + m + '-' + sha(source + ':' + basis),
	};
}

const iso = (ms) => new Date(ms).toISOString();

// Decide what a delivery does, given the stored record (or null). Pure: the store may run it again on contention.
function decide(doc, key, now, leaseMs) {
	if (!doc) {
		return {
			result: { state: 'new', attempts: 1 },
			write: {
				provider: key.provider,
				mode: key.mode,
				source: key.source,
				eventId: key.eventId,
				type: key.type,
				status: 'processing',
				attempts: 1,
				duplicates: 0,
				claimedAt: iso(now),
				firstSeenAt: iso(now),
				expireAt: new Date(now + KEEP_DAYS * 86400000),
			},
		};
	}
	if (doc.status === 'done') {
		return {
			result: { state: 'duplicate', attempts: Number(doc.attempts || 1) },
			write: Object.assign({}, doc, { duplicates: Number(doc.duplicates || 0) + 1, lastSeenAt: iso(now) }),
		};
	}
	const claimedAt = Date.parse(doc.claimedAt || '') || 0;
	if (doc.status === 'processing' && now - claimedAt < leaseMs) {
		return { result: { state: 'busy', attempts: Number(doc.attempts || 1) }, write: null };
	}
	const attempts = Number(doc.attempts || 1) + 1;
	return {
		result: { state: 'retry', attempts },
		write: Object.assign({}, doc, { status: 'processing', attempts, claimedAt: iso(now), lastSeenAt: iso(now) }),
	};
}

async function claim(store, key, opts) {
	const now = (opts && opts.now) || Date.now();
	const leaseMs = (opts && opts.leaseMs) || LEASE_MS;
	return store.transact(key.docId, (doc) => decide(doc, key, now, leaseMs));
}

async function finish(store, key, status, note, now) {
	await store.transact(key.docId, (doc) => {
		const base = doc || { provider: key.provider, mode: key.mode, source: key.source, eventId: key.eventId };
		const write = Object.assign({}, base, { status, finishedAt: iso(now) });
		if (status === 'failed') write.error = String(note || '').slice(0, 120);
		else delete write.error;
		if (!write.expireAt) write.expireAt = new Date(now + KEEP_DAYS * 86400000);
		return { result: null, write };
	});
}

/* Claim the event, run apply() once, record the outcome. Resolves { state, value }:
     new / retry  apply ran; value is what it returned
     duplicate    apply did not run (already applied)
     busy         apply did not run (another delivery holds the claim)
   If apply throws the claim is marked failed (so the provider's retry runs it again) and the error is rethrown. */
async function runOnce(store, key, apply, opts) {
	const clock = (opts && opts.clock) || Date.now;
	const claimed = await claim(store, key, { now: clock(), leaseMs: opts && opts.leaseMs });
	if (claimed.state === 'duplicate' || claimed.state === 'busy') return { state: claimed.state, value: undefined };
	let value;
	try {
		value = await apply();
	} catch (error) {
		await finish(store, key, 'failed', (error && error.message) || 'error', clock()).catch(() => {});
		throw error;
	}
	await finish(store, key, 'done', '', clock());
	return { state: claimed.state, value };
}

// Firestore store: one transaction per call. db is a Firestore instance, passed in so tests need none.
function firestoreStore(db, collection) {
	const name = collection || COLLECTION;
	return {
		async transact(id, fn) {
			const ref = db.collection(name).doc(id);
			return db.runTransaction(async (tx) => {
				const snap = await tx.get(ref);
				const out = fn(snap.exists ? snap.data() || {} : null);
				if (out.write) tx.set(ref, out.write);
				return out.result;
			});
		},
	};
}

// In-memory store with the same contract. transact never awaits between read and write, so it is atomic.
function memoryStore() {
	const rows = new Map();
	return {
		rows,
		async transact(id, fn) {
			const out = fn(rows.has(id) ? Object.assign({}, rows.get(id)) : null);
			if (out.write) rows.set(id, Object.assign({}, out.write));
			return out.result;
		},
	};
}

/* Two-way reconciliation of our payment rows against the provider's captures for the same window.
     local     [{ ref, orderId, amount, currency, status }]  status: "paid" | "refunded" | other
     provider  [{ orderId, captureId, amount, currency, status }]  status: "completed" | "refunded" | other
   Rows pair up by orderId. Returns arrays of the order ids (and what differs); nothing is changed here.
     missingLocal     the provider captured it and we have no paid row (a lost webhook, or a payment we never matched)
     missingProvider  we show it paid and the provider has no completed capture
     amountMismatch   both agree it is paid but amount or currency differ
     statusMismatch   the provider refunded it and we still show paid, or the reverse
   Amounts compare in cents so 9.9 and "9.90" agree. */
function cents(value) {
	const n = Number(value);
	return Number.isFinite(n) ? Math.round(n * 100) : NaN;
}

function reconcile(local, provider) {
	const mine = new Map();
	const theirs = new Map();
	for (const row of local || []) if (row && row.orderId) mine.set(String(row.orderId), row);
	for (const row of provider || []) if (row && row.orderId) theirs.set(String(row.orderId), row);
	const out = { matched: [], missingLocal: [], missingProvider: [], amountMismatch: [], statusMismatch: [] };
	const live = (status) => status === 'paid' || status === 'completed';
	for (const [orderId, remote] of theirs) {
		const row = mine.get(orderId);
		const remoteStatus = String(remote.status || '').toLowerCase();
		if (!row) {
			if (live(remoteStatus)) out.missingLocal.push({ orderId, captureId: remote.captureId || '' });
			continue;
		}
		const localStatus = String(row.status || '').toLowerCase();
		const refunded = (status) => status === 'refunded';
		if (refunded(remoteStatus) !== refunded(localStatus)) {
			out.statusMismatch.push({ orderId, ref: row.ref || '', local: localStatus, provider: remoteStatus });
		} else if (
			cents(row.amount) !== cents(remote.amount) ||
			String(row.currency || '').toUpperCase() !== String(remote.currency || '').toUpperCase()
		) {
			out.amountMismatch.push({
				orderId,
				ref: row.ref || '',
				local: { amount: row.amount, currency: row.currency },
				provider: { amount: remote.amount, currency: remote.currency },
			});
		} else {
			out.matched.push(orderId);
		}
	}
	for (const [orderId, row] of mine) {
		if (theirs.has(orderId)) continue;
		if (live(String(row.status || '').toLowerCase())) out.missingProvider.push({ orderId, ref: row.ref || '' });
	}
	return out;
}

module.exports = {
	COLLECTION,
	LEASE_MS,
	eventKey,
	claim,
	runOnce,
	firestoreStore,
	memoryStore,
	reconcile,
};
