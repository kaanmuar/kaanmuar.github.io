'use strict';
/* Stripe webhook HTTP stub (#3837).

   Stripe retries a non-2xx answer for up to three days and may deliver the same evt_ id twice.
   This stub:
     1. Verifies Stripe-Signature with HMAC-SHA256 when STRIPE_WEBHOOK_SECRET is set
        (Stripe's documented scheme; the `stripe` npm package is not a dependency here —
        TODO: switch to stripe.webhooks.constructEvent if we add that package).
     2. Answers 503 when the secret is missing so Stripe retries after secrets are wired.
     3. Claims each verified ack-type event once via webhook-idempotency.runOnce (store claim only;
        no payment fulfillment / reverse logic yet).

   Routes (wired from reviewUrl): POST …/stripe-webhook/live and …/stripe-webhook/test. */

const crypto = require('node:crypto');
const webhookIdem = require('./webhook-idempotency');

const TOLERANCE_SEC = 300;
const ACK_TYPES = new Set([
	'checkout.session.completed',
	'checkout.session.expired',
	'payment_intent.succeeded',
]);

function webhookSecret(mode, env) {
	const e = env || process.env;
	if (mode === 'test' || mode === 'sandbox') {
		return String(e.STRIPE_TEST_WEBHOOK_SECRET || e.STRIPE_WEBHOOK_SECRET || '');
	}
	return String(e.STRIPE_WEBHOOK_SECRET || '');
}

function parseSignatureHeader(header) {
	const out = { t: '', v1: [] };
	for (const part of String(header || '').split(',')) {
		const i = part.indexOf('=');
		if (i < 1) continue;
		const k = part.slice(0, i).trim();
		const v = part.slice(i + 1).trim();
		if (k === 't') out.t = v;
		else if (k === 'v1' && v) out.v1.push(v);
	}
	return out;
}

function rawAsBuffer(rawBody) {
	if (Buffer.isBuffer(rawBody)) return rawBody;
	if (rawBody == null) return null;
	if (typeof rawBody === 'string') return Buffer.from(rawBody);
	if (rawBody instanceof Uint8Array) return Buffer.from(rawBody);
	return null;
}

/* Stripe docs: signed_payload = `${t}.${rawBody}`; expected = HMAC_SHA256(secret, signed_payload);
   compare to each v1 signature; reject when |now - t| > tolerance. Clean-room from that description. */
function verifySignature(rawBody, header, secret, opts) {
	if (!secret) return { ok: false, reason: 'missing-secret' };
	const raw = rawAsBuffer(rawBody);
	if (!raw) return { ok: false, reason: 'missing-body' };
	const parsed = parseSignatureHeader(header);
	const t = Number(parsed.t);
	if (!Number.isFinite(t) || t <= 0 || !parsed.v1.length) return { ok: false, reason: 'malformed' };
	const nowSec = Math.floor(((opts && opts.now) || Date.now()) / 1000);
	const tolerance = (opts && opts.toleranceSec) != null ? opts.toleranceSec : TOLERANCE_SEC;
	if (Math.abs(nowSec - t) > tolerance) return { ok: false, reason: 'stale' };
	const signed = Buffer.concat([Buffer.from(String(Math.trunc(t)) + '.', 'utf8'), raw]);
	const expect = crypto.createHmac('sha256', String(secret)).update(signed).digest('hex');
	const want = Buffer.from(expect, 'utf8');
	for (const sig of parsed.v1) {
		const got = Buffer.from(String(sig), 'utf8');
		if (want.length === got.length && crypto.timingSafeEqual(want, got)) return { ok: true };
	}
	return { ok: false, reason: 'bad-signature' };
}

function parseEvent(req, raw) {
	if (req && req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) return req.body;
	try {
		return JSON.parse(String(rawAsBuffer(raw) || ''));
	} catch (error) {
		return null;
	}
}

function mockRes() {
	return {
		statusCode: 0,
		body: null,
		status(code) {
			this.statusCode = code;
			return this;
		},
		json(payload) {
			this.body = payload;
			return this;
		},
	};
}

/* Handle one Stripe delivery. opts: { mode, store, env, now, rawBody, apply }.
   apply defaults to a no-op for ACK_TYPES (claim only). Non-ack types verify then 200 without claiming. */
async function handle(req, res, opts) {
	const options = opts || {};
	const mode = options.mode === 'test' || options.mode === 'sandbox' ? 'test' : 'live';
	const secret = webhookSecret(mode, options.env);
	if (!secret) {
		res.status(503).json({ error: 'Stripe webhook secret is not configured.' });
		return { status: 503, reason: 'missing-secret' };
	}
	const raw = options.rawBody != null ? options.rawBody : req && req.rawBody;
	const headers = (req && req.headers) || {};
	const header = headers['stripe-signature'] || headers['Stripe-Signature'] || '';
	const verified = verifySignature(raw, header, secret, { now: options.now, toleranceSec: options.toleranceSec });
	if (!verified.ok) {
		res.status(400).json({ error: 'The event signature did not verify.' });
		return { status: 400, reason: verified.reason };
	}
	const event = parseEvent(req, raw);
	if (!event || typeof event !== 'object') {
		res.status(400).json({ error: 'The event body is not JSON.' });
		return { status: 400, reason: 'bad-json' };
	}
	const type = String(event.type || '');
	if (!ACK_TYPES.has(type)) {
		res.status(200).json({ ok: true, ignored: true });
		return { status: 200, ignored: true, type };
	}
	const store = options.store;
	if (!store) {
		res.status(503).json({ error: 'Webhook claim store is unavailable.' });
		return { status: 503, reason: 'missing-store' };
	}
	const apply = typeof options.apply === 'function' ? options.apply : async () => ({ acked: type });
	try {
		const outcome = await webhookIdem.runOnce(
			store,
			webhookIdem.eventKey('stripe', mode, event, headers),
			apply,
			{ clock: () => options.now || Date.now() }
		);
		if (outcome.state === 'busy') {
			res.status(409).json({ error: 'This event is being applied.' });
			return { status: 409, state: 'busy', type };
		}
		res.status(200).json({ ok: true, state: outcome.state });
		return { status: 200, state: outcome.state, type };
	} catch (error) {
		console.error('Stripe webhook ' + type + ' failed:', error);
		res.status(500).json({ error: 'The event could not be applied.' });
		return { status: 500, type };
	}
}

module.exports = {
	TOLERANCE_SEC,
	ACK_TYPES,
	webhookSecret,
	parseSignatureHeader,
	verifySignature,
	handle,
	mockRes,
};
