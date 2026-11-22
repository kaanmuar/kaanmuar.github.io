'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');

const R = require('../../functions/checkout-reconcile');
const ops = require('../../functions/ops-schedule');

describe('checkout-reconcile', () => {
	it('mapLocal: PayPal order id and refunded flag', () => {
		assert.deepEqual(
			R.mapLocal({
				id: 'paid-report-abc',
				sessionId: '5O190127TN364715T',
				captureId: '3C679366HH908993F',
				priceUsd: 49,
				status: 'paid-report',
			}),
			{
				ref: 'paid-report-abc',
				orderId: '5O190127TN364715T',
				captureId: '3C679366HH908993F',
				amount: 49,
				currency: 'USD',
				status: 'paid',
			}
		);
		assert.equal(
			R.mapLocal({
				id: 'x',
				sessionId: '5O190127TN364715T',
				priceUsd: 9,
				status: 'run-credit-refunded',
				refunded: true,
			}).status,
			'refunded'
		);
		assert.equal(R.mapLocal({ id: 'x', sessionId: 'cs_test_xxx', priceUsd: 1 }), null);
	});

	it('fromCapture / fromOrder: amounts and statuses', () => {
		assert.deepEqual(
			R.fromCapture({
				id: '3C679366HH908993F',
				status: 'COMPLETED',
				amount: { value: '49.00', currency_code: 'USD' },
				supplementary_data: { related_ids: { order_id: '5O190127TN364715T' } },
			}),
			{
				orderId: '5O190127TN364715T',
				captureId: '3C679366HH908993F',
				amount: 49,
				currency: 'USD',
				status: 'completed',
			}
		);
		assert.equal(
			R.fromOrder({
				id: '5O190127TN364715T',
				purchase_units: [
					{
						payments: {
							captures: [{ id: '3C679366HH908993F', status: 'REFUNDED', amount: { value: '9.90', currency_code: 'USD' } }],
						},
					},
				],
			}).status,
			'refunded'
		);
		assert.equal(R.fromCapture(null), null);
	});

	it('run: no credentials → skipped no-op, exit summary ok', async () => {
		const saved = [];
		const logs = [];
		const out = await R.run({
			store: {
				listPayments: async () => {
					throw new Error('should not load payments');
				},
				saveRun: async (doc) => saved.push(doc),
			},
			provider: null,
			now: Date.parse('2026-11-21T12:00:00Z'),
			log: (t) => logs.push(t),
		});
		assert.equal(out.skipped, 'no-credentials');
		assert.equal(out.matched, 0);
		assert.equal(saved.length, 1);
		assert.equal(saved[0].skipped, 'no-credentials');
		assert.match(logs[0], /credentials missing/);
	});

	it('run: compares store rows to mocked provider captures', async () => {
		const saved = [];
		const captures = {
			CAP1AAAAAAAAAAAAA: {
				id: 'CAP1AAAAAAAAAAAAA',
				status: 'COMPLETED',
				amount: { value: '49.00', currency_code: 'USD' },
				supplementary_data: { related_ids: { order_id: 'ORD1AAAAAAAAAAAAA' } },
			},
			CAP2AAAAAAAAAAAAA: {
				id: 'CAP2AAAAAAAAAAAAA',
				status: 'COMPLETED',
				amount: { value: '39.00', currency_code: 'USD' },
				supplementary_data: { related_ids: { order_id: 'ORD2AAAAAAAAAAAAA' } },
			},
			CAP3AAAAAAAAAAAAA: {
				id: 'CAP3AAAAAAAAAAAAA',
				status: 'REFUNDED',
				amount: { value: '9.00', currency_code: 'USD' },
				supplementary_data: { related_ids: { order_id: 'ORD3AAAAAAAAAAAAA' } },
			},
		};
		const out = await R.run({
			store: {
				listPayments: async () => [
					{
						id: 'p1',
						provider: 'paypal',
						status: 'paid-report',
						paid: true,
						sessionId: 'ORD1AAAAAAAAAAAAA',
						captureId: 'CAP1AAAAAAAAAAAAA',
						priceUsd: 49,
					},
					{
						id: 'p2',
						provider: 'paypal',
						status: 'paid-report',
						paid: true,
						sessionId: 'ORD2AAAAAAAAAAAAA',
						captureId: 'CAP2AAAAAAAAAAAAA',
						priceUsd: 49,
					},
					{
						id: 'p3',
						provider: 'paypal',
						status: 'paid-report',
						paid: true,
						sessionId: 'ORD3AAAAAAAAAAAAA',
						captureId: 'CAP3AAAAAAAAAAAAA',
						priceUsd: 9,
					},
					{
						id: 'p4',
						provider: 'paypal',
						status: 'paid-report',
						paid: true,
						sessionId: 'ORD4AAAAAAAAAAAAA',
						captureId: 'CAP4AAAAAAAAAAAAA',
						priceUsd: 5,
					},
					{
						id: 'stripe',
						provider: 'stripe',
						status: 'paid-report',
						paid: true,
						sessionId: 'cs_live_xxx',
						priceUsd: 49,
					},
				],
				saveRun: async (doc) => saved.push(doc),
			},
			provider: {
				ready: true,
				getCapture: async (id) => captures[id] || null,
				getOrder: async () => null,
				listExtra: async () => [
					{
						id: 'CAP7AAAAAAAAAAAAA',
						status: 'COMPLETED',
						amount: { value: '12.00', currency_code: 'USD' },
						supplementary_data: { related_ids: { order_id: 'ORD7AAAAAAAAAAAAA' } },
					},
				],
			},
			now: Date.parse('2026-11-21T12:00:00Z'),
			log: () => {},
		});
		assert.equal(out.skipped, '');
		assert.equal(out.localCount, 4);
		assert.equal(out.providerCount, 4); // 3 fetched + 1 extra
		assert.equal(out.matched, 1);
		assert.equal(out.amountMismatch, 1);
		assert.equal(out.statusMismatch, 1);
		assert.equal(out.missingProvider, 1);
		assert.equal(out.missingLocal, 1);
		assert.equal(saved[0].amountMismatch, 1);
		assert.ok(!('payerEmail' in saved[0]));
		assert.ok(!('event' in saved[0]));
	});

	it('ops schedule + index export name checkoutReconcile', () => {
		const row = ops.JOBS.find((j) => j.job === 'checkoutReconcile');
		assert.ok(row, 'ops JOBS lists checkoutReconcile');
		assert.match(row.cron, /^\d+ \d+ /);
		assert.match(row.what, /3837/);
		const index = fs.readFileSync(path.join(__dirname, '../../functions/index.js'), 'utf8');
		assert.match(
			index,
			/exports\.checkoutReconcile\s*=\s*require\(["']firebase-functions\/v2\/scheduler["']\)\s*\.onSchedule\(/
		);
		assert.match(index, /checkout-reconcile/);
	});
});
