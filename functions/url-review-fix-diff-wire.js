'use strict';

/* Enqueue surgical fix-diff desk packs from selected SEO findings (#4391 / epic #4360).
   Builds git/CMS bodies via url-review-fix-diff-desk; never auto-approves or publishes. Off by default. */

const fixDiffDesk = require('./url-review-fix-diff-desk');

const ENV_KEY = 'URL_REVIEW_FIX_DIFF_ENQUEUE';

/** Finding keys we can turn into desk-ready surgical packs today (seo-meta slice). */
const DEFAULT_SEO_KEYS = ['geo-llms', 'seo-title-missing'];

function truthy(value) {
	if (value === true || value === 1) return true;
	const text = String(value == null ? '' : value)
		.trim()
		.toLowerCase();
	return text === '1' || text === 'true' || text === 'yes' || text === 'on';
}

function fixDiffOpts(hooks) {
	const h = hooks || {};
	if (h.fixDiffEnqueue && typeof h.fixDiffEnqueue === 'object') return h.fixDiffEnqueue;
	if (h.fixDiffEnqueue === true) return { enabled: true };
	return null;
}

/** True when env or hooks opt in. Explicit enabled:false on hooks or env wins. */
function enabled(options) {
	const opts = options || {};
	if (opts.enabled === false) return false;
	const env = opts.env || process.env;
	if (Object.prototype.hasOwnProperty.call(env, ENV_KEY) && !truthy(env[ENV_KEY])) return false;
	if (opts.enabled === true || opts.force === true) return true;
	return truthy(env[ENV_KEY]);
}

function wireEligible(hooks, env) {
	const h = hooks || {};
	if (h.softPreview === true || h.passive === true) return false;
	const opts = fixDiffOpts(h);
	if (opts && opts.enabled === false) return false;
	return enabled({
		env: env || process.env,
		enabled: opts && opts.enabled === true ? true : undefined,
	});
}

function selectedKeys(hooks) {
	const opts = fixDiffOpts(hooks) || {};
	const list = Array.isArray(opts.keys) ? opts.keys : DEFAULT_SEO_KEYS;
	return list.map((key) => String(key || '').trim()).filter(Boolean);
}

function findingKey(finding) {
	if (!finding || typeof finding !== 'object') return '';
	return String(finding.key || finding.id || '').trim();
}

function isOpen(finding) {
	return finding && (finding.verdict === 'fail' || finding.verdict === 'risk');
}

function clipHost(value) {
	return String(value || '')
		.replace(/\s+/g, ' ')
		.trim()
		.slice(0, 120);
}

function escapeHtml(text) {
	return String(text || '')
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;');
}

function packForGeoLlms(finding, ctx) {
	const after = String((ctx.fixkit && ctx.fixkit.llmsTxt) || '').trim();
	if (!after) return null;
	const llms = (ctx.extras && ctx.extras.llms) || {};
	const before = llms.html ? '' : String(llms.body || '');
	return {
		kind: 'git',
		findingId: findingKey(finding) || 'geo-llms',
		path: 'llms.txt',
		before,
		after,
		host: ctx.host,
		reportId: ctx.reportId,
		url: ctx.origin,
		note: 'Queued from review finding geo-llms (#4391).',
	};
}

function packForTitleMissing(finding, ctx) {
	const pages = Array.isArray(finding.pages) ? finding.pages.filter(Boolean) : [];
	if (!pages.length) return null;
	const items = pages
		.slice(0, 40)
		.map((path) => '<li><code>' + escapeHtml(path) + '</code></li>')
		.join('');
	const bodyHtml =
		'<p>These indexable pages had no &lt;title&gt; in the crawl:</p><ul>' +
		items +
		'</ul><p>Give each page a unique title aligned with its H1 or main heading.</p>';
	return {
		kind: 'cms',
		findingId: findingKey(finding) || 'seo-title-missing',
		title: 'Add missing page titles',
		bodyHtml,
		host: ctx.host,
		reportId: ctx.reportId,
		url: ctx.origin,
		note: 'Queued from review finding seo-title-missing (#4391).',
	};
}

const PACK_BUILDERS = {
	'geo-llms': packForGeoLlms,
	'seo-title-missing': packForTitleMissing,
};

/** Pure: bodies ready for fixDiffDesk.enqueue / recordFromBody. */
function packBodiesFromReport(report, hooks) {
	const insights = (report && report.insights) || {};
	const findings = Array.isArray(insights.findings) ? insights.findings : [];
	const keys = new Set(selectedKeys(hooks));
	const host = clipHost(report.host || (report.observed && report.observed.host));
	let origin = '';
	try {
		origin = new URL(report.finalUrl || '').origin;
	} catch (error) {
		origin = host ? 'https://' + host : '';
	}
	const ctx = {
		host,
		origin,
		reportId: String(report.id || '').replace(/[^a-f0-9]/g, '').slice(0, 32),
		fixkit: insights.fixkit || null,
		extras: insights.extras || report.extras || {},
	};
	const bodies = [];
	for (const finding of findings) {
		const key = findingKey(finding);
		if (!keys.has(key) || !isOpen(finding)) continue;
		const build = PACK_BUILDERS[key];
		if (!build) continue;
		const body = build(finding, ctx);
		if (body) bodies.push(body);
	}
	return bodies;
}

function logLine(out) {
	if (!out || !out.enabled) return 'Fix-diff desk: skipped (opt-in off).';
	if (out.reason === 'no-db') return 'Fix-diff desk: skipped (no Firestore).';
	if (out.reason === 'not-complete') return 'Fix-diff desk: skipped (review not complete).';
	if (out.reason === 'no-matching-findings') return 'Fix-diff desk: no matching open SEO findings.';
	if (out.ok && out.enqueued && out.enqueued.length)
		return (
			'Fix-diff desk: queued ' +
			out.enqueued.length +
			' pack' +
			(out.enqueued.length === 1 ? '' : 's') +
			' (' +
			out.enqueued.map((row) => row.findingId + '/' + row.kind).join(', ') +
			').'
		);
	if (out.skipped && out.skipped.length)
		return 'Fix-diff desk: ' + out.skipped.length + ' finding(s) had nothing to enqueue.';
	return 'Fix-diff desk: finished.';
}

async function enqueueBodies(db, bodies, nowMs) {
	const enqueued = [];
	const failed = [];
	for (const body of bodies || []) {
		const out = await fixDiffDesk.enqueue(db, body, nowMs);
		if (out.ok) enqueued.push({ id: out.id, findingId: body.findingId, kind: body.kind });
		else failed.push({ findingId: body.findingId, error: out.error || 'enqueue failed' });
	}
	return { enqueued, failed };
}

/**
 * After a completed review is saved, optionally queue surgical packs for the desk.
 * @returns {Promise<object|null>} summary, or null when gated off
 */
async function enqueueFromReport(db, report, options) {
	const opts = options || {};
	const hooks = opts.hooks || {};
	const env = opts.env || process.env;
	if (!wireEligible(hooks, env)) return null;
	if (!db || typeof db.collection !== 'function') return { enabled: true, reason: 'no-db', ok: false };
	if (!report || (report.status && report.status !== 'complete')) {
		return { enabled: true, reason: 'not-complete', ok: false };
	}
	const merged = opts.reportId ? Object.assign({}, report, { id: opts.reportId }) : report;
	const list = packBodiesFromReport(merged, hooks);
	if (!list.length) return { enabled: true, reason: 'no-matching-findings', ok: true, enqueued: [], skipped: [] };
	const { enqueued, failed } = await enqueueBodies(db, list, opts.nowMs);
	const out = { enabled: true, ok: failed.length === 0, enqueued, failed, skipped: [] };
	if (opts.note) opts.note(logLine(out));
	return out;
}

/** record wrapper used from Firebase after saveReviewThreats */
async function enqueueFromRecord(db, record, hooks) {
	if (!record || record.status !== 'complete' || !record.report) return null;
	return enqueueFromReport(db, record.report, {
		hooks,
		env: process.env,
		reportId: record.id,
	});
}

module.exports = {
	ENV_KEY,
	DEFAULT_SEO_KEYS,
	PACK_BUILDERS,
	wireEligible,
	selectedKeys,
	packBodiesFromReport,
	enqueueBodies,
	enqueueFromReport,
	enqueueFromRecord,
	logLine,
};