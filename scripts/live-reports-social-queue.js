/* Per-clip status for the tracked Live Reports social batch (#4459).
   pending → rendered (tips-studio) → posted (Buffer / open-social). */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const BATCH_FILE = path.join(ROOT, 'data/live-reports-social-batch.json');
const PREVIEWS_BATCH = path.join(ROOT, 'previews/auto-live-reports/batch.json');
const BATCHES_DIR = path.join(ROOT, 'data/live-reports-batches');
const RETAIN_DAYS = 14;
const STATUSES = new Set(['pending', 'rendered', 'posted']);
const BATCH_ID = /^auto-\d{4}-\d{2}-\d{2}$/;

function readBatch(file = BATCH_FILE) {
	const text = fs.readFileSync(file, 'utf8');
	const data = JSON.parse(text);
	if (!data || !Array.isArray(data.posts)) throw new Error('social batch missing posts[] in ' + file);
	return data;
}

function writeBatch(data, file = BATCH_FILE) {
	fs.mkdirSync(path.dirname(file), { recursive: true });
	fs.writeFileSync(file, JSON.stringify(data, null, 1) + '\n');
}

function assertBatchId(batchId) {
	if (!BATCH_ID.test(batchId)) throw new Error('invalid batch id: ' + batchId);
	return batchId;
}

function retainedBatchPath(batchId, dir = BATCHES_DIR) {
	return path.join(dir, assertBatchId(batchId) + '.json');
}

function batchIdMs(batchId) {
	return Date.parse(assertBatchId(batchId).slice(5) + 'T12:00:00Z');
}

/** Commit a copy of the tracked batch so a past day can be re-rendered (#1853). */
function retainBatch(data, opts = {}) {
	const batchId = data.batch;
	if (!batchId) throw new Error('retainBatch needs data.batch');
	const dir = opts.dir || BATCHES_DIR;
	fs.mkdirSync(dir, { recursive: true });
	fs.writeFileSync(retainedBatchPath(batchId, dir), JSON.stringify(data, null, 1) + '\n');
	return pruneRetainedBatches(Object.assign({ dir, except: batchId }, opts));
}

function readRetainedBatch(batchId, dir = BATCHES_DIR) {
	const file = retainedBatchPath(batchId, dir);
	if (!fs.existsSync(file)) throw new Error('retained batch missing: ' + batchId);
	return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function pruneRetainedBatches(opts = {}) {
	const keepDays = opts.keepDays ?? RETAIN_DAYS;
	const dir = opts.dir || BATCHES_DIR;
	const cutoff = Date.now() - keepDays * 864e5;
	const removed = [];
	if (!fs.existsSync(dir)) return { removed, keepDays };
	for (const name of fs.readdirSync(dir)) {
		if (!name.endsWith('.json')) continue;
		const id = name.slice(0, -5);
		if (opts.except && id === opts.except) continue;
		let drop = false;
		try {
			drop = batchIdMs(id) < cutoff;
		} catch {
			drop = true;
		}
		if (!drop) continue;
		fs.unlinkSync(path.join(dir, name));
		removed.push(id);
	}
	return { removed, keepDays };
}

/** Copy a retained batch into previews + data/live-reports-social-batch.json for tips-studio (#1853). */
function restoreRetainedBatch(batchId, opts = {}) {
	const data = readRetainedBatch(batchId, opts.dir);
	let posts = withPendingStatus(data.posts || []);
	if (!opts.keepStatus) posts = posts.map((p) => Object.assign({}, p, { status: 'pending' }));
	const tracked = Object.assign({}, data, { batch: batchId, posts });
	syncPreviewsBatch(posts, opts.previewsFile);
	if (opts.writeTracked !== false) writeBatch(tracked, opts.trackedFile || BATCH_FILE);
	return { batch: batchId, posts: posts.length, path: retainedBatchPath(batchId, opts.dir) };
}

function withPendingStatus(posts) {
	return posts.map((post) => {
		const p = Object.assign({}, post);
		if (!p.status) p.status = 'pending';
		else if (!STATUSES.has(p.status)) throw new Error('invalid post status: ' + p.status);
		return p;
	});
}

function buildTrackedBatch(batchId, posts, at) {
	return {
		batch: batchId,
		at: at || new Date().toISOString(),
		posts: withPendingStatus(posts),
	};
}

function countsByStatus(posts) {
	const out = { pending: 0, rendered: 0, posted: 0 };
	for (const post of posts) {
		const s = post.status || 'pending';
		if (out[s] !== undefined) out[s] += 1;
	}
	return out;
}

function canTransition(from, to) {
	if (from === to) return false;
	if (to === 'rendered') return from === 'pending';
	if (to === 'posted') return from === 'rendered';
	return false;
}

function applyStatusTransition(data, toStatus, opts = {}) {
	const batchId = opts.batch;
	if (batchId && data.batch !== batchId) {
		throw new Error('batch mismatch: file has ' + data.batch + ', asked for ' + batchId);
	}
	const ids = opts.ids && opts.ids.length ? new Set(opts.ids) : null;
	let changed = 0;
	const posts = data.posts.map((post) => {
		if (ids && !ids.has(post.id)) return post;
		const from = post.status || 'pending';
		if (!canTransition(from, toStatus)) return post;
		changed += 1;
		return Object.assign({}, post, { status: toStatus });
	});
	const normalized = withPendingStatus(posts);
	return {
		data: Object.assign({}, data, { posts: normalized }),
		changed,
		counts: countsByStatus(normalized),
	};
}

function syncPreviewsBatch(posts, file = PREVIEWS_BATCH) {
	fs.mkdirSync(path.dirname(file), { recursive: true });
	fs.writeFileSync(file, JSON.stringify(posts, null, 1) + '\n');
}

function transitionBatchFile(toStatus, opts = {}) {
	const file = opts.file || BATCH_FILE;
	const result = applyStatusTransition(readBatch(file), toStatus, opts);
	if (result.changed) writeBatch(result.data, file);
	syncPreviewsBatch(result.data.posts);
	return result;
}

module.exports = {
	BATCH_FILE,
	PREVIEWS_BATCH,
	BATCHES_DIR,
	RETAIN_DAYS,
	STATUSES,
	readBatch,
	writeBatch,
	withPendingStatus,
	buildTrackedBatch,
	countsByStatus,
	canTransition,
	applyStatusTransition,
	transitionBatchFile,
	syncPreviewsBatch,
	assertBatchId,
	retainedBatchPath,
	retainBatch,
	readRetainedBatch,
	pruneRetainedBatches,
	restoreRetainedBatch,
};