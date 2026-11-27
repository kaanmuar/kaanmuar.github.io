const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const queue = require('../../scripts/live-reports-social-queue');

const post = (id, status) => ({ id, host: id + '.com', kind: 'requested', ...(status ? { status } : {}) });

test('buildTrackedBatch marks every post pending (#4459)', () => {
	const batch = queue.buildTrackedBatch('auto-2026-11-27', [post('a'), post('b', 'pending')]);
	assert.equal(batch.batch, 'auto-2026-11-27');
	assert.deepEqual(batch.posts.map((p) => p.status), ['pending', 'pending']);
});

test('status transitions: pending → rendered → posted', () => {
	let data = { batch: 'auto-2026-11-27', posts: [post('a'), post('b')] };
	let r = queue.applyStatusTransition(data, 'rendered', { batch: 'auto-2026-11-27' });
	assert.equal(r.changed, 2);
	assert.deepEqual(r.counts, { pending: 0, rendered: 2, posted: 0 });

	data = r.data;
	r = queue.applyStatusTransition(data, 'posted', { batch: 'auto-2026-11-27' });
	assert.equal(r.changed, 2);
	assert.deepEqual(r.counts, { pending: 0, rendered: 0, posted: 2 });
});

test('per-id transition leaves other clips unchanged', () => {
	const data = { batch: 'auto-2026-11-27', posts: [post('a'), post('b')] };
	const r = queue.applyStatusTransition(data, 'rendered', { batch: 'auto-2026-11-27', ids: ['b'] });
	assert.equal(r.changed, 1);
	assert.equal(r.data.posts[0].status, 'pending');
	assert.equal(r.data.posts[1].status, 'rendered');
});

test('transitionBatchFile persists status on disk', () => {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lr-queue-'));
	const file = path.join(dir, 'live-reports-social-batch.json');
	queue.writeBatch(queue.buildTrackedBatch('auto-test', [post('x')]), file);
	const r = queue.transitionBatchFile('rendered', { file, batch: 'auto-test' });
	assert.equal(r.changed, 1);
	assert.equal(queue.readBatch(file).posts[0].status, 'rendered');
	fs.rmSync(dir, { recursive: true, force: true });
});

test('cannot skip rendered on the way to posted', () => {
	const data = { batch: 'auto-2026-11-27', posts: [post('a')] };
	const r = queue.applyStatusTransition(data, 'posted', { batch: 'auto-2026-11-27' });
	assert.equal(r.changed, 0);
	assert.equal(r.data.posts[0].status, 'pending');
});