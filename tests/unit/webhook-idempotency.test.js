const test = require('node:test');
const assert = require('node:assert/strict');
const W = require('../../functions/webhook-idempotency');

// Fixtures are made up: no real order, capture or payer ids.
const paypalEvent = (id, type) => ({
	id,
	event_type: type || 'PAYMENT.CAPTURE.COMPLETED',
	resource: { id: 'CAP1234567890', supplementary_data: { related_ids: { order_id: 'ORDER12345678' } } },
});
const stripeEvent = (id) => ({ id, type: 'checkout.session.completed', data: { object: { id: 'cs_test_x' } } });

test('eventKey: same event id gives the same key, different ids or modes differ', () => {
	const a = W.eventKey('paypal', 'live', paypalEvent('WH-AAA'), {});
	const b = W.eventKey('paypal', 'live', paypalEvent('WH-AAA'), { 'paypal-transmission-id': 'other' });
	const c = W.eventKey('paypal', 'live', paypalEvent('WH-BBB'), {});
	const d = W.eventKey('paypal', 'sandbox', paypalEvent('WH-AAA'), {});
	assert.equal(a.docId, b.docId);
	assert.notEqual(a.docId, c.docId);
	assert.notEqual(a.docId, d.docId);
	assert.equal(a.source, 'id');
	assert.equal(a.type, 'PAYMENT.CAPTURE.COMPLETED');
	assert.equal(d.mode, 'test');
});

test('eventKey: Stripe event ids key the same way', () => {
	const a = W.eventKey('stripe', 'live', stripeEvent('evt_1AbC'), {});
	const b = W.eventKey('stripe', 'live', stripeEvent('evt_1AbC'), {});
	assert.equal(a.docId, b.docId);
	assert.ok(a.docId.startsWith('stripe-live-'));
	assert.equal(a.type, 'checkout.session.completed');
	assert.notEqual(a.docId, W.eventKey('paypal', 'live', { id: 'evt_1AbC' }, {}).docId);
});

test('eventKey: falls back to the delivery header, then to a body hash; ids are sanitised', () => {
	const viaHeader = W.eventKey('paypal', 'live', { event_type: 'X' }, { 'paypal-transmission-id': 'T-1' });
	assert.equal(viaHeader.source, 'delivery');
	const body = { event_type: 'X', resource: { n: 1 } };
	const viaBody = W.eventKey('paypal', 'live', body, {});
	assert.equal(viaBody.source, 'body');
	assert.equal(viaBody.eventId, '');
	assert.equal(viaBody.docId, W.eventKey('paypal', 'live', { event_type: 'X', resource: { n: 1 } }, {}).docId);
	const dirty = W.eventKey('paypal', 'live', { id: 'WH/../x y' }, {});
	assert.match(dirty.docId, /^paypal-live-[a-f0-9]{32}$/);
	assert.equal(W.eventKey('', 'live', {}, {}), null);
});

test('runOnce: a duplicate delivery applies nothing and a repeat after done is a no-op', async () => {
	const store = W.memoryStore();
	const key = W.eventKey('paypal', 'live', paypalEvent('WH-1'), {});
	let applied = 0;
	const apply = async () => ++applied;
	const first = await W.runOnce(store, key, apply);
	const second = await W.runOnce(store, key, apply);
	const third = await W.runOnce(store, key, apply);
	assert.deepEqual([first.state, first.value], ['new', 1]);
	assert.equal(second.state, 'duplicate');
	assert.equal(third.state, 'duplicate');
	assert.equal(applied, 1);
	const row = store.rows.get(key.docId);
	assert.equal(row.status, 'done');
	assert.equal(row.duplicates, 2);
	assert.equal(row.attempts, 1);
});

test('runOnce: two simultaneous deliveries apply once; the other answers busy', async () => {
	const store = W.memoryStore();
	const key = W.eventKey('paypal', 'live', paypalEvent('WH-2'), {});
	let applied = 0;
	let release;
	const gate = new Promise((resolve) => (release = resolve));
	const apply = async () => {
		applied++;
		await gate;
	};
	const one = W.runOnce(store, key, apply);
	const two = await W.runOnce(store, key, apply);
	assert.equal(two.state, 'busy');
	release();
	assert.equal((await one).state, 'new');
	assert.equal(applied, 1);
	assert.equal((await W.runOnce(store, key, apply)).state, 'duplicate');
});

test('runOnce: a failed apply is marked failed, rethrown, and the provider retry applies it again', async () => {
	const store = W.memoryStore();
	const key = W.eventKey('paypal', 'live', paypalEvent('WH-3'), {});
	let calls = 0;
	const apply = async () => {
		calls++;
		if (calls === 1) throw new Error('firestore unavailable');
		return 'ok';
	};
	await assert.rejects(W.runOnce(store, key, apply), /firestore unavailable/);
	assert.equal(store.rows.get(key.docId).status, 'failed');
	assert.equal(store.rows.get(key.docId).error, 'firestore unavailable');
	const retry = await W.runOnce(store, key, apply);
	assert.deepEqual([retry.state, retry.value], ['retry', 'ok']);
	assert.equal(store.rows.get(key.docId).status, 'done');
	assert.equal(store.rows.get(key.docId).attempts, 2);
	assert.equal('error' in store.rows.get(key.docId), false);
	assert.equal((await W.runOnce(store, key, apply)).state, 'duplicate');
	assert.equal(calls, 2);
});

test('claim: a processing claim inside the lease is busy, an older one is taken over', async () => {
	const store = W.memoryStore();
	const key = W.eventKey('stripe', 'live', stripeEvent('evt_9'), {});
	const t0 = Date.parse('2026-11-21T12:00:00Z');
	assert.equal((await W.claim(store, key, { now: t0 })).state, 'new');
	assert.equal((await W.claim(store, key, { now: t0 + 60000 })).state, 'busy');
	const taken = await W.claim(store, key, { now: t0 + W.LEASE_MS + 1 });
	assert.deepEqual(taken, { state: 'retry', attempts: 2 });
	assert.equal(store.rows.get(key.docId).attempts, 2);
});

test('the stored record holds ids and times only, never the event body', async () => {
	const store = W.memoryStore();
	const event = paypalEvent('WH-4');
	event.resource.payer = { email_address: 'payer@example.com' };
	const key = W.eventKey('paypal', 'live', event, {});
	await W.runOnce(store, key, async () => {});
	const row = store.rows.get(key.docId);
	const blob = JSON.stringify(row);
	assert.equal(blob.includes('payer@'), false);
	assert.equal(blob.includes('email_address'), false);
	assert.equal(row.eventId, 'WH-4');
	assert.ok(row.expireAt instanceof Date);
});

test('firestoreStore runs each call in one transaction on webhook_events', async () => {
	const docs = new Map();
	const db = {
		collection(name) {
			return { doc: (id) => ({ name, id, path: name + '/' + id }) };
		},
		async runTransaction(fn) {
			return fn({
				async get(ref) {
					return { exists: docs.has(ref.path), data: () => docs.get(ref.path) };
				},
				set(ref, value) {
					docs.set(ref.path, value);
				},
			});
		},
	};
	const store = W.firestoreStore(db);
	const key = W.eventKey('paypal', 'live', paypalEvent('WH-5'), {});
	let applied = 0;
	await W.runOnce(store, key, async () => applied++);
	assert.equal((await W.runOnce(store, key, async () => applied++)).state, 'duplicate');
	assert.equal(applied, 1);
	assert.equal(docs.get('webhook_events/' + key.docId).status, 'done');
});

test('reconcile: pairs by order id and names each kind of difference', () => {
	const local = [
		{ ref: 'r1', orderId: 'O1', amount: 49, currency: 'USD', status: 'paid' },
		{ ref: 'r2', orderId: 'O2', amount: 9.9, currency: 'usd', status: 'paid' },
		{ ref: 'r3', orderId: 'O3', amount: 49, currency: 'USD', status: 'paid' },
		{ ref: 'r4', orderId: 'O4', amount: 49, currency: 'USD', status: 'paid' },
		{ ref: 'r5', orderId: 'O5', amount: 49, currency: 'USD', status: 'refunded' },
		{ ref: 'r6', orderId: 'O6', amount: 49, currency: 'USD', status: 'pending' },
	];
	const provider = [
		{ orderId: 'O1', captureId: 'C1', amount: '49.00', currency: 'USD', status: 'COMPLETED' },
		{ orderId: 'O2', captureId: 'C2', amount: '9.90', currency: 'USD', status: 'COMPLETED' },
		{ orderId: 'O3', captureId: 'C3', amount: '39.00', currency: 'USD', status: 'COMPLETED' },
		{ orderId: 'O4', captureId: 'C4', amount: '49.00', currency: 'USD', status: 'REFUNDED' },
		{ orderId: 'O5', captureId: 'C5', amount: '49.00', currency: 'USD', status: 'REFUNDED' },
		{ orderId: 'O7', captureId: 'C7', amount: '49.00', currency: 'USD', status: 'COMPLETED' },
		{ orderId: 'O8', captureId: 'C8', amount: '49.00', currency: 'USD', status: 'DECLINED' },
	];
	const out = W.reconcile(local, provider);
	assert.deepEqual(out.matched.sort(), ['O1', 'O2', 'O5']);
	assert.deepEqual(out.amountMismatch.map((x) => x.orderId), ['O3']);
	assert.deepEqual(out.statusMismatch.map((x) => x.orderId), ['O4']);
	assert.deepEqual(out.missingLocal, [{ orderId: 'O7', captureId: 'C7' }]);
	assert.deepEqual(out.missingProvider, []);
});

test('reconcile: a paid local row with no provider capture is reported, bad input is ignored', () => {
	const out = W.reconcile(
		[
			{ ref: 'a', orderId: 'X1', amount: 5, currency: 'USD', status: 'paid' },
			{ ref: 'b', orderId: 'X2', amount: 5, currency: 'USD', status: 'refunded' },
			null,
			{ ref: 'c' },
		],
		[null, {}, undefined]
	);
	assert.deepEqual(out.missingProvider, [{ orderId: 'X1', ref: 'a' }]);
	assert.deepEqual(out.matched.concat(out.missingLocal, out.amountMismatch, out.statusMismatch), []);
	assert.deepEqual(W.reconcile(null, null).matched, []);
});
