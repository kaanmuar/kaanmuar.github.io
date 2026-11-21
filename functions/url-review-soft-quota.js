/**
 * Soft-gate free preview quotas (#3478): 5 / IP / day anonymous, 20 / email / day signed-in.
 * Firestore docs are keyed by a hash of the identity; the raw IP is never stored.
 */
const crypto = require('crypto');

const SOFT_ANON_CAP = 5;
const SOFT_SIGNED_CAP = 20;
const COLLECTION = 'soft_preview_limits';
const DAY_MS = 24 * 60 * 60 * 1000;

function dayKey(now = Date.now()) {
	return new Date(now).toISOString().slice(0, 10);
}

function softKey(kind, id) {
	return crypto
		.createHash('sha256')
		.update('soft-preview:' + kind + ':' + String(id || 'unknown'))
		.digest('hex')
		.slice(0, 40);
}

function capFor(email) {
	return email ? SOFT_SIGNED_CAP : SOFT_ANON_CAP;
}

function identityOf({ ip, email }) {
	const address = String(email || '')
		.trim()
		.toLowerCase();
	if (address) return { kind: 'email', id: address, cap: SOFT_SIGNED_CAP };
	return { kind: 'ip', id: String(ip || 'unknown').slice(0, 80), cap: SOFT_ANON_CAP };
}

function leftOf(count, cap) {
	return Math.max(0, cap - (Number(count) || 0));
}

// Firestore transaction: peek or take one slot for today's UTC day.
async function softQuotaTx(db, identity, { take, now = Date.now() } = {}) {
	const day = dayKey(now);
	const ref = db.collection(COLLECTION).doc(softKey(identity.kind, identity.id));
	return db.runTransaction(async (tx) => {
		const snap = await tx.get(ref);
		const prev = snap.exists ? snap.data() || {} : {};
		const sameDay = String(prev.day || '') === day;
		const count = sameDay ? Number(prev.count) || 0 : 0;
		const cap = identity.cap;
		const left = leftOf(count, cap);
		if (!take) {
			return { ok: left > 0, left, cap, count, day, signedIn: identity.kind === 'email' };
		}
		if (count >= cap) {
			return { ok: false, left: 0, cap, count, day, signedIn: identity.kind === 'email', code: 'soft-quota' };
		}
		const next = count + 1;
		tx.set(ref, {
			day,
			count: next,
			kind: identity.kind,
			expiresAt: new Date(Date.parse(day + 'T00:00:00.000Z') + DAY_MS),
		});
		return { ok: true, left: leftOf(next, cap), cap, count: next, day, signedIn: identity.kind === 'email' };
	});
}

async function peekSoftQuota(db, { ip, email, now } = {}) {
	return softQuotaTx(db, identityOf({ ip, email }), { take: false, now });
}

async function takeSoftQuota(db, { ip, email, now } = {}) {
	return softQuotaTx(db, identityOf({ ip, email }), { take: true, now });
}

// In-memory twin for scripts/url-review-server.js (no Firestore).
function memoryStore(map = new Map()) {
	return {
		async peek({ ip, email, now = Date.now() } = {}) {
			const identity = identityOf({ ip, email });
			const day = dayKey(now);
			const key = softKey(identity.kind, identity.id);
			const prev = map.get(key) || {};
			const count = String(prev.day || '') === day ? Number(prev.count) || 0 : 0;
			return {
				ok: count < identity.cap,
				left: leftOf(count, identity.cap),
				cap: identity.cap,
				count,
				day,
				signedIn: identity.kind === 'email',
			};
		},
		async take({ ip, email, now = Date.now() } = {}) {
			const identity = identityOf({ ip, email });
			const day = dayKey(now);
			const key = softKey(identity.kind, identity.id);
			const prev = map.get(key) || {};
			const count = String(prev.day || '') === day ? Number(prev.count) || 0 : 0;
			if (count >= identity.cap) {
				return {
					ok: false,
					left: 0,
					cap: identity.cap,
					count,
					day,
					signedIn: identity.kind === 'email',
					code: 'soft-quota',
				};
			}
			const next = count + 1;
			map.set(key, { day, count: next, kind: identity.kind });
			return {
				ok: true,
				left: leftOf(next, identity.cap),
				cap: identity.cap,
				count: next,
				day,
				signedIn: identity.kind === 'email',
			};
		},
	};
}

function quotaMessage(result) {
	if (result && result.signedIn) {
		return "You've used today's " + SOFT_SIGNED_CAP + ' signed-in previews. Talk to us for more.';
	}
	return "You've used today's " + SOFT_ANON_CAP + ' free previews. Sign in for more.';
}

module.exports = {
	SOFT_ANON_CAP,
	SOFT_SIGNED_CAP,
	COLLECTION,
	dayKey,
	softKey,
	identityOf,
	peekSoftQuota,
	takeSoftQuota,
	memoryStore,
	quotaMessage,
	capFor,
};
