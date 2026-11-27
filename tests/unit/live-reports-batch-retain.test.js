const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const queue = require('../../scripts/live-reports-social-queue');

const post = (id) => ({ id, host: id + '.com', kind: 'requested' });

function tmpDir() {
	return fs.mkdtempSync(path.join(os.tmpdir(), 'lr-retain-'));
}

test('retainBatch writes tracked copy under data/live-reports-batches (#1853)', () => {
	const dir = tmpDir();
	const tracked = queue.buildTrackedBatch('auto-2026-11-27', [post('a')]);
	queue.retainBatch(tracked, { dir, keepDays: 14 });
	assert.ok(fs.existsSync(queue.retainedBatchPath('auto-2026-11-27', dir)));
	assert.deepEqual(queue.readRetainedBatch('auto-2026-11-27', dir).posts[0].id, 'a');
	fs.rmSync(dir, { recursive: true, force: true });
});

test('pruneRetainedBatches drops batches older than keepDays', () => {
	const dir = tmpDir();
	queue.retainBatch(queue.buildTrackedBatch('auto-2026-01-01', [post('old')]), { dir, keepDays: 14 });
	const { removed } = queue.retainBatch(queue.buildTrackedBatch('auto-2026-11-27', [post('new')]), {
		dir,
		keepDays: 14,
	});
	assert.ok(removed.includes('auto-2026-01-01'));
	assert.ok(fs.existsSync(queue.retainedBatchPath('auto-2026-11-27', dir)));
	assert.ok(!fs.existsSync(queue.retainedBatchPath('auto-2026-01-01', dir)));
	fs.rmSync(dir, { recursive: true, force: true });
});

test('restoreRetainedBatch fills preview and tracked paths', () => {
	const dir = tmpDir();
	const batches = path.join(dir, 'batches');
	const previews = path.join(dir, 'previews/batch.json');
	const trackedFile = path.join(dir, 'tracked.json');
	queue.retainBatch(queue.buildTrackedBatch('auto-2026-11-20', [post('x')]), { dir: batches });
	const r = queue.restoreRetainedBatch('auto-2026-11-20', { dir: batches, previewsFile: previews, trackedFile });
	assert.equal(r.posts, 1);
	assert.deepEqual(JSON.parse(fs.readFileSync(previews, 'utf8'))[0].status, 'pending');
	assert.equal(queue.readBatch(trackedFile).batch, 'auto-2026-11-20');
	fs.rmSync(dir, { recursive: true, force: true });
});