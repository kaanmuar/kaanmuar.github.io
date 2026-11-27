/* Per-clip status for the tracked Live Reports social batch (#4459).
   pending → rendered (tips-studio) → posted (Buffer / open-social). */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const BATCH_FILE = path.join(ROOT, 'data/live-reports-social-batch.json');
const PREVIEWS_BATCH = path.join(ROOT, 'previews/auto-live-reports/batch.json');
const STATUSES = new Set(['pending', 'rendered', 'posted']);

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

function syncPreviewsBatch(posts) {
	fs.mkdirSync(path.dirname(PREVIEWS_BATCH), { recursive: true });
	fs.writeFileSync(PREVIEWS_BATCH, JSON.stringify(posts, null, 1) + '\n');
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
};