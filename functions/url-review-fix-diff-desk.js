'use strict';

/**
 * Desk queue for surgical fix packs (#4364 / #4376). Preview Git diffs or CMS drafts;
 * Approve/Reject records the operator choice — never auto-merge or publish.
 */

const fixDiff = require('./url-review-fix-diff');
const outcomesSnapshot = require('./url-review-outcomes-snapshot');

const COLLECTION = 'url_review_fix_diff_packs';
const STATUSES = ['pending', 'approved', 'rejected'];
const KINDS = ['git', 'cms'];

function clip(value, max) {
	const text = String(value == null ? '' : value)
		.replace(/\s+/g, ' ')
		.trim();
	if (!text) return '';
	return text.length > max ? text.slice(0, max - 1) + '…' : text;
}

function cleanId(value) {
	return String(value || '')
		.replace(/[^A-Za-z0-9_-]/g, '')
		.slice(0, 60);
}

function hostFrom(value) {
	try {
		return new URL(String(value || '')).hostname;
	} catch (error) {
		return '';
	}
}

/** Build a stored row and embedded preview from operator or automation input. */
function recordFromBody(body, nowMs) {
	const kind = String((body && body.kind) || '')
		.trim()
		.toLowerCase();
	if (!KINDS.includes(kind)) return { error: 'Pick git or cms.' };
	const findingId = clip(body.findingId, 80);
	const reportId = String(body.reportId || '')
		.replace(/[^a-f0-9]/g, '')
		.slice(0, 32);
	const host = clip(body.host || hostFrom(body.url), 120);
	const at = new Date(Number.isFinite(nowMs) ? nowMs : Date.now()).toISOString();
	const base = {
		kind,
		findingId,
		reportId,
		host,
		status: 'pending',
		createdAt: at,
		updatedAt: at,
		decidedAt: '',
		decidedBy: '',
		note: clip(body.note, 240),
	};
	if (kind === 'git') {
		const filePath = clip(body.path, 200);
		const before = String(body.before ?? '');
		const after = String(body.after ?? '');
		if (!filePath) return { error: 'Git packs need a file path.' };
		if (!after.trim()) return { error: 'Git packs need after text.' };
		const patch = fixDiff.buildFixPatch({ findingId, path: filePath, before, after });
		return Object.assign(base, { path: filePath, patch });
	}
	const title = String(body.title || '').trim();
	const bodyHtml = String(body.bodyHtml ?? '');
	if (!title) return { error: 'CMS packs need a title.' };
	const cmsPayload = fixDiff.buildCmsDraftPayload({ title, bodyHtml, status: body.status });
	return Object.assign(base, { title, bodyHtml, cmsPayload });
}

function deskRow(id, data) {
	const row = data || {};
	return {
		id,
		kind: row.kind || '',
		findingId: row.findingId || '',
		reportId: row.reportId || '',
		host: row.host || '',
		status: row.status || '',
		createdAt: row.createdAt || '',
		updatedAt: row.updatedAt || '',
		decidedAt: row.decidedAt || '',
		decidedBy: row.decidedBy || '',
		note: row.note || '',
		path: row.path || '',
		patch: row.patch || '',
		title: row.title || '',
		cmsPayload: row.cmsPayload && typeof row.cmsPayload === 'object' ? row.cmsPayload : null,
	};
}

function summarize(items) {
	const counts = { pending: 0, approved: 0, rejected: 0 };
	for (const item of items || []) {
		if (item && Object.prototype.hasOwnProperty.call(counts, item.status)) counts[item.status]++;
	}
	return { total: (items || []).length, byStatus: counts };
}

async function deskRows(db) {
	if (!db || typeof db.collection !== 'function') return [];
	const snap = await db.collection(COLLECTION).orderBy('createdAt', 'desc').limit(100).get();
	return snap.docs.map((doc) => deskRow(doc.id, doc.data()));
}

function decisionPatch(before, body, operator, nowMs) {
	const action = String((body && body.decision) || (body && body.status) || '')
		.trim()
		.toLowerCase();
	const at = new Date(Number.isFinite(nowMs) ? nowMs : Date.now()).toISOString();
	if (action === 'approve' || action === 'approved') {
		if (before.status !== 'pending') return { error: 'Only pending packs can be approved.' };
		return {
			status: 'approved',
			decidedAt: at,
			decidedBy: clip(operator, 160),
			updatedAt: at,
			note: body.note !== undefined ? clip(body.note, 240) : before.note,
		};
	}
	if (action === 'reject' || action === 'rejected') {
		if (before.status !== 'pending') return { error: 'Only pending packs can be rejected.' };
		return {
			status: 'rejected',
			decidedAt: at,
			decidedBy: clip(operator, 160),
			updatedAt: at,
			note: body.note !== undefined ? clip(body.note, 240) : before.note,
		};
	}
	return { error: 'Use approve or reject.' };
}

function fail(res, status, error) {
	res.status(status).json({ error });
}

async function deskDecide(req, res, operator, deps) {
	const body = req.body || {};
	const id = cleanId(body.id);
	if (!id) return fail(res, 400, 'Which fix pack?');
	const ref = deps.db.collection(COLLECTION).doc(id);
	const snap = await ref.get();
	if (!snap.exists) return fail(res, 404, 'That fix pack is not saved.');
	const before = snap.data() || {};
	const patch = decisionPatch(before, body, operator, deps.nowMs);
	if (patch.error) return fail(res, 400, patch.error);
	await ref.update(patch);
	const merged = Object.assign({}, before, patch);
	try {
		await outcomesSnapshot.captureOnPackApproved(deps.db, Object.assign({ id }, merged), {
			env: (deps && deps.env) || process.env,
			hooks: (deps && deps.hooks) || {},
			report: deps && deps.report,
		});
	} catch (error) {
		console.error('Outcomes snapshot baseline failed:', error);
	}
	res.status(200).json({ ok: true, pack: deskRow(id, merged) });
}

async function enqueue(db, body, nowMs) {
	const record = recordFromBody(body, nowMs);
	if (record.error) return record;
	const ref = await db.collection(COLLECTION).add(record);
	return { ok: true, id: ref.id, pack: deskRow(ref.id, record) };
}

module.exports = {
	COLLECTION,
	STATUSES,
	KINDS,
	recordFromBody,
	deskRow,
	summarize,
	deskRows,
	decisionPatch,
	deskDecide,
	enqueue,
};