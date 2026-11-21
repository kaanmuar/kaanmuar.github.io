'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

const stripeWebhook = require('../../functions/stripe-webhook');
const webhookIdem = require('../../functions/webhook-idempotency');

function sign(raw, secret, t) {
	const body = Buffer.isBuffer(raw) ? raw : Buffer.from(String(raw));
	const signed = Buffer.concat([Buffer.from(String(t) + '.', 'utf8'), body]);
	const v1 = crypto.createHmac('sha256', secret).update(signed).digest('hex');
	return 't=' + t + ',v1=' + v1;
}

describe('stripe-webhook', () => {
	const secret = 'whsec_test_stub_secret';
	const now = Date.parse('2026-11-21T19:00:00Z');
	const t = Math.floor(now / 1000);

	it('verifySignature: accepts a valid HMAC and rejects bad/stale/missing', () => {
		const raw = Buffer.from('{"id":"evt_1","type":"checkout.session.completed"}');
		assert.equal(stripeWebhook.verifySignature(raw, sign(raw, secret, t), secret, { now }).ok, true);
		assert.equal(stripeWebhook.verifySignature(raw, sign(raw, 'other', t), secret, { now }).reason, 'bad-signature');
		assert.equal(stripeWebhook.verifySignature(raw, sign(raw, secret, t - 1000), secret, { now }).reason, 'stale');
		assert.equal(stripeWebhook.verifySignature(raw, 't=' + t, secret, { now }).reason, 'malformed');
		assert.equal(stripeWebhook.verifySignature(raw, sign(raw, secret, t), '', { now }).reason, 'missing-secret');
	});

	it('handle: 503 when STRIPE_WEBHOOK_SECRET is missing', async () => {
		const res = stripeWebhook.mockRes();
		const out = await stripeWebhook.handle(
			{ headers: {}, body: { id: 'evt_x', type: 'checkout.session.completed' }, rawBody: Buffer.from('{}') },
			res,
			{ mode: 'live', env: {}, store: webhookIdem.memoryStore(), now }
		);
		assert.equal(out.status, 503);
		assert.equal(res.statusCode, 503);
		assert.match(res.body.error, /secret is not configured/i);
	});

	it('handle: claim-once no-op for checkout.session.completed; duplicate is 200', async () => {
		const event = { id: 'evt_test_claim_1', type: 'checkout.session.completed', livemode: false };
		const raw = Buffer.from(JSON.stringify(event));
		const header = sign(raw, secret, t);
		const store = webhookIdem.memoryStore();
		const applies = [];
		const opts = {
			mode: 'test',
			env: { STRIPE_WEBHOOK_SECRET: secret },
			store,
			now,
			rawBody: raw,
			apply: async () => {
				applies.push(1);
				return { acked: true };
			},
		};
		const req = { headers: { 'stripe-signature': header }, body: event, rawBody: raw };

		const res1 = stripeWebhook.mockRes();
		const first = await stripeWebhook.handle(req, res1, opts);
		assert.equal(first.status, 200);
		assert.equal(first.state, 'new');
		assert.equal(res1.statusCode, 200);
		assert.equal(applies.length, 1);
		assert.equal(store.rows.size, 1);
		const row = [...store.rows.values()][0];
		assert.equal(row.status, 'done');
		assert.equal(row.provider, 'stripe');
		assert.equal(row.eventId, 'evt_test_claim_1');
		assert.equal(row.type, 'checkout.session.completed');
		assert.equal('amount' in row, false);
		assert.equal('payer' in row, false);

		const res2 = stripeWebhook.mockRes();
		const second = await stripeWebhook.handle(req, res2, opts);
		assert.equal(second.status, 200);
		assert.equal(second.state, 'duplicate');
		assert.equal(applies.length, 1);
	});

	it('handle: busy claim returns 409', async () => {
		const event = { id: 'evt_test_busy_1', type: 'payment_intent.succeeded' };
		const raw = Buffer.from(JSON.stringify(event));
		const header = sign(raw, secret, t);
		const store = webhookIdem.memoryStore();
		const key = webhookIdem.eventKey('stripe', 'live', event, {});
		await store.transact(key.docId, () => ({
			result: null,
			write: {
				provider: 'stripe',
				mode: 'live',
				source: 'id',
				eventId: event.id,
				type: event.type,
				status: 'processing',
				attempts: 1,
				duplicates: 0,
				claimedAt: new Date(now).toISOString(),
				firstSeenAt: new Date(now).toISOString(),
			},
		}));
		const res = stripeWebhook.mockRes();
		const out = await stripeWebhook.handle(
			{ headers: { 'stripe-signature': header }, body: event, rawBody: raw },
			res,
			{ mode: 'live', env: { STRIPE_WEBHOOK_SECRET: secret }, store, now, rawBody: raw }
		);
		assert.equal(out.status, 409);
		assert.equal(res.statusCode, 409);
	});

	it('handle: unknown type verifies then 200 ignored without claim', async () => {
		const event = { id: 'evt_test_other_1', type: 'customer.created' };
		const raw = Buffer.from(JSON.stringify(event));
		const header = sign(raw, secret, t);
		const store = webhookIdem.memoryStore();
		const res = stripeWebhook.mockRes();
		const out = await stripeWebhook.handle(
			{ headers: { 'stripe-signature': header }, body: event, rawBody: raw },
			res,
			{ mode: 'live', env: { STRIPE_WEBHOOK_SECRET: secret }, store, now, rawBody: raw }
		);
		assert.equal(out.status, 200);
		assert.equal(out.ignored, true);
		assert.equal(store.rows.size, 0);
		assert.equal(res.body.ignored, true);
	});

	it('handle: bad signature returns 400', async () => {
		const event = { id: 'evt_bad', type: 'checkout.session.completed' };
		const raw = Buffer.from(JSON.stringify(event));
		const res = stripeWebhook.mockRes();
		const out = await stripeWebhook.handle(
			{ headers: { 'stripe-signature': sign(raw, 'wrong', t) }, body: event, rawBody: raw },
			res,
			{
				mode: 'live',
				env: { STRIPE_WEBHOOK_SECRET: secret },
				store: webhookIdem.memoryStore(),
				now,
				rawBody: raw,
			}
		);
		assert.equal(out.status, 400);
		assert.equal(res.statusCode, 400);
	});
});
