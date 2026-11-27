'use strict';

/* Desk-facing outcomes baseline + verify path after fix-diff approve (#4455 / #4360). */

const outcomesSnapshot = require('./url-review-outcomes-snapshot');
const fixRereview = require('./url-review-fix-rereview');
const fixOffers = require('./url-review-fix-offers');

const REPORT_BASE = 'https://carlosandmunoz.com/qa-review.html?report=';

function cleanPackId(id) {
	return String(id || '')
		.replace(/[^A-Za-z0-9_-]/g, '')
		.slice(0, 60);
}

function cleanReportId(id) {
	return String(id || '')
		.replace(/[^a-f0-9]/g, '')
		.slice(0, 32);
}

/** Honest desk copy — never implies a baseline exists when snapshot wire is off. */
function outcomesView(options) {
	const opts = options || {};
	const enabled = outcomesSnapshot.wireEligible(opts.hooks, opts.env);
	if (!enabled) {
		return {
			enabled: false,
			state: 'off',
			label: 'Outcomes snapshot off',
			detail: 'Baselines are not recorded until URL_REVIEW_OUTCOMES_SNAPSHOT is enabled on the server.',
			tone: 'neutral',
		};
	}
	const capture = opts.captureResult;
	if (capture === null) {
		return {
			enabled: true,
			state: 'off',
			label: 'Outcomes snapshot off',
			detail: 'The server skipped capture (env off when this pack was approved).',
			tone: 'neutral',
		};
	}
	if (capture && capture.ok) {
		const baseline = opts.baseline;
		const clicks = baseline && baseline.gsc ? baseline.gsc.clicks : null;
		const detail =
			outcomesSnapshot.logLine(Object.assign({ enabled: true }, capture)) +
			(clicks != null ? ' GSC clicks at anchor: ' + clicks + '.' : '');
		return {
			enabled: true,
			state: 'saved',
			label: 'Baseline saved',
			detail,
			tone: 'good',
			baselineId: capture.id || (baseline && baseline.packId) || '',
			anchoredAt: (baseline && baseline.anchoredAt) || '',
		};
	}
	if (capture && capture.reason === 'duplicate') {
		return {
			enabled: true,
			state: 'duplicate',
			label: 'Baseline already on file',
			detail: outcomesSnapshot.logLine({ enabled: true, ok: false, reason: 'duplicate' }),
			tone: 'neutral',
			baselineId: opts.baselineId || '',
		};
	}
	if (capture && capture.reason === 'not-approved') {
		return {
			enabled: true,
			state: 'skipped',
			label: 'Not approved',
			detail: 'Only approved packs get a baseline.',
			tone: 'neutral',
		};
	}
	const baseline = opts.baseline;
	if (baseline) {
		const clicks = baseline.gsc ? baseline.gsc.clicks : null;
		return {
			enabled: true,
			state: 'saved',
			label: 'Baseline on file',
			detail:
				'Anchored ' +
				(baseline.anchoredAt || '—') +
				(clicks != null ? '; GSC clicks ' + clicks + '.' : '.'),
			tone: 'good',
			baselineId: baseline.packId || '',
			anchoredAt: baseline.anchoredAt || '',
		};
	}
	if (opts.packStatus === 'approved') {
		return {
			enabled: true,
			state: 'pending',
			label: 'Baseline pending',
			detail: 'No Firestore baseline for this pack yet (approved before capture or metrics were unavailable).',
			tone: 'warn',
		};
	}
	return {
		enabled: true,
		state: 'idle',
		label: 'Approve to anchor',
		detail: 'Approving freezes GSC+GEO metrics for 7/14/28-day deltas.',
		tone: 'neutral',
	};
}

function verifyView(pack, extra) {
	const row = pack || {};
	const more = extra || {};
	const reportId = cleanReportId(row.reportId);
	const steps = [];
	if (reportId) {
		const reportHref = REPORT_BASE + encodeURIComponent(reportId);
		steps.push({
			id: 'report',
			label: 'Open report',
			detail: 'Original audit the pack came from.',
			href: reportHref,
		});
		steps.push({
			id: 'customer-recheck',
			label: 'Customer free re-check',
			detail: 'Paid owners run Fix → free re-check once per report (before/after mail).',
			href: reportHref + '#fix-outcomes',
		});
	}
	steps.push({
		id: 'operator-rereview',
		label: 'Queue desk re-review',
		detail: 'Runs fixRereview on this finding and mails before/after (same as marking a fix request done).',
	});
	const rereview = more.rereview;
	return {
		title: 'Verify fix → outcomes',
		canQueue: !!(reportId && row.findingId),
		packId: row.id || '',
		findingId: row.findingId || '',
		reportId,
		rereview: rereview || null,
		steps,
	};
}

async function loadBaseline(db, packId) {
	if (!db || typeof db.collection !== 'function' || !packId) return null;
	try {
		const ref = db.collection(outcomesSnapshot.COLLECTION).doc(cleanPackId(packId));
		const snap = await ref.get();
		return snap.exists ? snap.data() || null : null;
	} catch (error) {
		return null;
	}
}

async function loadReportRow(db, reportId) {
	const id = cleanReportId(reportId);
	if (!db || !id) return null;
	const snap = await db.collection('url_reviews').doc(id).get();
	if (!snap.exists) return null;
	const row = snap.data() || {};
	if (row.report && !row.report.id) row.report = Object.assign({ id }, row.report);
	return row;
}

async function enrichPackRow(db, pack, deps) {
	const row = pack || {};
	const env = (deps && deps.env) || process.env;
	const hooks = (deps && deps.hooks) || {};
	let baseline = null;
	if (row.status === 'approved' && db) baseline = await loadBaseline(db, row.id);
	const outcomes = outcomesView({
		env,
		hooks,
		baseline,
		packStatus: row.status,
		baselineId: row.id,
	});
	let rereview = null;
	if (deps && deps.fixRequestForPack) {
		rereview = await deps.fixRequestForPack(db, row.id);
	}
	const verify = verifyView(row, { rereview });
	return Object.assign({}, row, { outcomes, verify });
}

async function queueOperatorRereview(db, pack, operator, deps) {
	const row = pack || {};
	const reportId = cleanReportId(row.reportId);
	if (!reportId) return { error: 'This pack has no report id.' };
	if (!row.findingId) return { error: 'This pack has no finding id.' };
	const original = await loadReportRow(db, reportId);
	if (!original) return { error: 'The report this pack belongs to is not saved.' };
	const email = String(original.email || (original.report && original.report.email) || '')
		.trim()
		.toLowerCase();
	if (!email) return { error: 'The report has no owner email for the before/after mail.' };
	const now = (deps && deps.nowMs) || Date.now();
	const record = fixOffers.requestRecord({ findings: [row.findingId], lang: original.lang || 'en' }, original, email, now);
	if (record.error) return record;
	const docId = 'pack-' + cleanPackId(row.id);
	const ref = db.collection(fixRereview.COLLECTION).doc(docId);
	const existing = await ref.get();
	if (existing.exists) {
		const prior = existing.data() || {};
		const run = prior.rereview;
		if (run && run.status !== 'failed') {
			return {
				error: 'A re-review is already queued or finished for this pack.',
				rereview: run,
				id: docId,
			};
		}
		const patch = fixRereview.queuePatch(prior, { status: 'done' }, { rereview: true }, now);
		if (!patch.rereview) return { error: 'Could not queue another re-review for this pack.' };
		await ref.update(
			Object.assign(patch, {
				status: 'done',
				updatedAt: new Date(now).toISOString(),
				fixDiffPackId: row.id,
			})
		);
		return { ok: true, id: docId, rereview: patch.rereview, retried: true };
	}
	const full = Object.assign(record, {
		kind: 'self',
		status: 'done',
		fixDiffPackId: row.id,
		history: [{ status: 'done', at: record.createdAt, by: operator || 'desk' }],
		rereview: fixRereview.queued(now),
	});
	await ref.create(full);
	return { ok: true, id: docId, rereview: full.rereview };
}

module.exports = {
	REPORT_BASE,
	outcomesView,
	verifyView,
	loadBaseline,
	loadReportRow,
	enrichPackRow,
	queueOperatorRereview,
};