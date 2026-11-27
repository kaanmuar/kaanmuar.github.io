'use strict';

/* Immutable GSC+GEO baselines at fix-diff approval; 7/14/28d deltas vs later pulls (#4399 / epic #4360).
   Pure helpers + optional Firestore wire. Off by default — pattern from url-review-fix-diff-wire. */

const { diffSnapshots, signDelta } = require('./url-review-watch-delta');
const { scoreShareOfVoice } = require('./url-review-geo-citation');

const ENV_KEY = 'URL_REVIEW_OUTCOMES_SNAPSHOT';
const COLLECTION = 'url_review_outcomes_baselines';
const DELTA_WINDOWS = [7, 14, 28];
const MS_DAY = 86400000;

function truthy(value) {
	if (value === true || value === 1) return true;
	const text = String(value == null ? '' : value)
		.trim()
		.toLowerCase();
	return text === '1' || text === 'true' || text === 'yes' || text === 'on';
}

function snapOpts(hooks) {
	const h = hooks || {};
	if (h.outcomesSnapshot && typeof h.outcomesSnapshot === 'object') return h.outcomesSnapshot;
	if (h.outcomesSnapshot === true) return { enabled: true };
	return null;
}

function wireEligible(hooks, env) {
	const h = hooks || {};
	if (h.softPreview === true || h.passive === true) return false;
	const opts = snapOpts(h);
	if (opts && opts.enabled === false) return false;
	const runEnv = env || process.env;
	if (Object.prototype.hasOwnProperty.call(runEnv, ENV_KEY) && !truthy(runEnv[ENV_KEY])) return false;
	if (opts && opts.enabled === true) return true;
	return truthy(runEnv[ENV_KEY]);
}

function num(v) {
	const n = Number(v);
	return Number.isFinite(n) ? n : null;
}

function clip(value, max) {
	const text = String(value == null ? '' : value)
		.replace(/\s+/g, ' ')
		.trim();
	if (!text) return '';
	return text.length > max ? text.slice(0, max - 1) + '…' : text;
}

function parseAt(value, fallbackMs) {
	if (value == null || value === '') return Number.isFinite(fallbackMs) ? fallbackMs : null;
	const n = Number(value);
	if (Number.isFinite(n)) return n;
	const t = Date.parse(String(value));
	return Number.isFinite(t) ? t : Number.isFinite(fallbackMs) ? fallbackMs : null;
}

function isoAt(ms) {
	return new Date(Number.isFinite(ms) ? ms : Date.now()).toISOString();
}

/** Aggregate Search Console page rows into baseline-friendly totals. */
function gscTotals(rows) {
	let clicks = 0;
	let impressions = 0;
	let posWeighted = 0;
	let posWeight = 0;
	for (const row of rows || []) {
		const c = num(row.clicks);
		const imp = num(row.impressions);
		const pos = num(row.position);
		clicks += c == null ? 0 : c;
		impressions += imp == null ? 0 : imp;
		if (imp != null && imp > 0 && pos != null && pos > 0) {
			posWeighted += pos * imp;
			posWeight += imp;
		}
	}
	return {
		clicks,
		impressions,
		position: posWeight > 0 ? Math.round((posWeighted / posWeight) * 10) / 10 : null,
		pageCount: (rows || []).length,
	};
}

/** Normalize GEO citation payload from review extras. */
function geoFromExtra(extra) {
	const raw = extra || {};
	const citations = Array.isArray(raw.citations) ? raw.citations : [];
	const host = raw.brandHost || raw.host || '';
	const voice = citations.length && host ? scoreShareOfVoice(citations, host) : { share: num(raw.share) || 0, cited: !!raw.cited, total: citations.length || num(raw.total) || 0 };
	return {
		share: num(voice.share) != null ? voice.share : num(raw.share),
		cited: voice.cited != null ? !!voice.cited : !!raw.cited,
		total: num(voice.total) != null ? voice.total : citations.length,
	};
}

function scoresFromReport(report) {
	const score = (report && report.insights && report.insights.score) || (report && report.score) || null;
	if (!score || typeof score !== 'object') return null;
	const areas = {};
	if (score.areas && typeof score.areas === 'object') {
		Object.keys(score.areas).forEach((name) => {
			const row = score.areas[name];
			if (row && typeof row.score === 'number') areas[name] = row.score;
		});
	}
	return {
		overall: typeof score.overall === 'number' ? score.overall : null,
		areas: Object.keys(areas).length ? areas : undefined,
	};
}

/** Pull GSC+GEO+scores from a review or extras bag for baseline / later pulls. */
function metricsFromReview(report, pulledAt) {
	const extras = (report && report.insights && report.insights.extras) || (report && report.extras) || {};
	const gsc = extras.gsc || {};
	const rows = gsc.current || gsc.pages || gsc.rows || [];
	const geo = geoFromExtra(extras.geoCitation || extras.geo || {});
	const at = parseAt(pulledAt || (report && report.fetchedAt) || (report && report.createdAt), Date.now());
	return {
		pulledAt: isoAt(at),
		gsc: gscTotals(rows),
		geo,
		scores: scoresFromReport(report),
	};
}

function metricDelta(before, after, lowerIsBetter) {
	const b = num(before);
	const a = num(after);
	if (b == null && a == null) return null;
	if (b == null || a == null) return { before: b, after: a, delta: null, improved: null };
	const delta = a - b;
	let improved = null;
	if (delta !== 0) {
		improved = lowerIsBetter ? delta < 0 : delta > 0;
	} else {
		improved = true;
	}
	return { before: b, after: a, delta, improved };
}

function diffGsc(before, after) {
	const b = before || {};
	const a = after || {};
	return {
		clicks: metricDelta(b.clicks, a.clicks, false),
		impressions: metricDelta(b.impressions, a.impressions, false),
		position: metricDelta(b.position, a.position, true),
	};
}

function diffGeo(before, after) {
	const b = before || {};
	const a = after || {};
	return {
		share: metricDelta(b.share, a.share, false),
		total: metricDelta(b.total, a.total, false),
		cited: {
			before: !!b.cited,
			after: !!a.cited,
			improved: !b.cited && a.cited,
		},
	};
}

function daysSinceAnchor(anchoredAt, pullAt) {
	const anchor = parseAt(anchoredAt);
	const at = parseAt(pullAt);
	if (!Number.isFinite(anchor) || !Number.isFinite(at) || at < anchor) return null;
	return Math.floor((at - anchor) / MS_DAY);
}

/**
 * Immutable baseline row stored at fix approval / IndexNow anchor (#4399).
 * @param {object} pack approved fix-diff desk pack
 * @param {object} metrics output of metricsFromReview at anchor time
 */
function baselineRecord(pack, metrics, options) {
	const opts = options || {};
	const packRow = pack || {};
	const anchoredMs =
		parseAt(opts.anchoredAt) ||
		parseAt(packRow.indexNowAt) ||
		parseAt(packRow.decidedAt) ||
		parseAt(packRow.updatedAt) ||
		Date.now();
	const metricsAt = metrics || metricsFromReview(opts.report, anchoredMs);
	return {
		kind: 'outcomes-baseline',
		host: clip(packRow.host, 120),
		reportId: String(packRow.reportId || '')
			.replace(/[^a-f0-9]/g, '')
			.slice(0, 32),
		packId: clip(packRow.id, 64),
		findingId: clip(packRow.findingId, 80),
		anchoredAt: isoAt(anchoredMs),
		immutable: true,
		gsc: Object.assign({}, metricsAt.gsc),
		geo: Object.assign({}, metricsAt.geo),
		scores: metricsAt.scores ? JSON.parse(JSON.stringify(metricsAt.scores)) : null,
		pulledAt: metricsAt.pulledAt,
	};
}

/** For each window where enough days elapsed, compare later pull to frozen baseline. */
function deltasByWindow(baseline, pull) {
	if (!baseline || !pull) return {};
	const days = daysSinceAnchor(baseline.anchoredAt, pull.pulledAt);
	if (days == null) return {};
	const out = {};
	for (const windowDays of DELTA_WINDOWS) {
		if (days < windowDays) continue;
		const scores =
			baseline.scores && pull.scores
				? diffSnapshots(
						{ overall: baseline.scores.overall, areas: baseline.scores.areas },
						{ overall: pull.scores.overall, areas: pull.scores.areas }
					)
				: null;
		out[windowDays] = {
			windowDays,
			daysSinceFix: days,
			ready: true,
			gsc: diffGsc(baseline.gsc, pull.gsc),
			geo: diffGeo(baseline.geo, pull.geo),
			scores,
		};
	}
	return out;
}

function toneForDelta(row) {
	if (!row || row.delta == null) return 'neutral';
	if (row.improved === true) return 'good';
	if (row.improved === false) return 'warn';
	return 'neutral';
}

/** Desk / insights badge for one window (#4399). */
function badgeForWindow(windowDelta) {
	if (!windowDelta || !windowDelta.ready) return { key: 'outcomes-pending', label: 'Outcomes pending', tone: 'neutral' };
	const w = windowDelta.windowDays;
	const parts = [];
	const gClick = windowDelta.gsc && windowDelta.gsc.clicks;
	if (gClick && gClick.delta != null) parts.push('GSC clicks ' + signDelta(gClick.delta));
	const gPos = windowDelta.gsc && windowDelta.gsc.position;
	if (gPos && gPos.delta != null) parts.push('avg pos ' + signDelta(-gPos.delta));
	const geo = windowDelta.geo && windowDelta.geo.share;
	if (geo && geo.delta != null) parts.push('GEO share ' + signDelta(geo.delta) + 'pp');
	const cited = windowDelta.geo && windowDelta.geo.cited;
	if (cited && cited.improved) parts.push('now cited');
	const overall = windowDelta.scores && windowDelta.scores.overall;
	if (overall != null) parts.push('score ' + signDelta(overall));
	const detail = parts.length ? parts.join(' · ') : 'Measuring';
	let tone = 'neutral';
	if (gClick && gClick.improved === true) tone = 'good';
	else if (gClick && gClick.improved === false) tone = 'warn';
	else if (cited && cited.improved) tone = 'good';
	return {
		key: 'outcomes-' + w + 'd',
		label: w + 'd outcomes',
		detail,
		tone,
		windowDays: w,
	};
}

function badgesFromPull(baseline, pull) {
	return DELTA_WINDOWS.map((w) => badgeForWindow(deltasByWindow(baseline, pull)[w])).filter((row) => row && row.key !== 'outcomes-pending');
}

function logLine(out) {
	if (!out || !out.enabled) return 'Outcomes snapshot: skipped (opt-in off).';
	if (out.reason === 'no-db') return 'Outcomes snapshot: skipped (no Firestore).';
	if (out.reason === 'not-approved') return 'Outcomes snapshot: skipped (pack not approved).';
	if (out.ok && out.id) return 'Outcomes snapshot: saved baseline ' + out.id + ' for ' + (out.host || 'host') + '.';
	if (out.reason === 'duplicate') return 'Outcomes snapshot: baseline already stored for this pack.';
	return 'Outcomes snapshot: finished.';
}

async function saveBaseline(db, record) {
	if (!db || typeof db.collection !== 'function') return { enabled: true, ok: false, reason: 'no-db' };
	const row = record || {};
	if (!row.packId) return { enabled: true, ok: false, reason: 'missing-pack' };
	const ref = db.collection(COLLECTION).doc(String(row.packId).replace(/[^A-Za-z0-9_-]/g, '').slice(0, 60));
	try {
		if (typeof ref.create === 'function') {
			await ref.create(row);
		} else {
			const snap = await ref.get();
			if (snap.exists) return { enabled: true, ok: false, reason: 'duplicate' };
			await ref.set(row);
		}
		return { enabled: true, ok: true, id: ref.id, host: row.host };
	} catch (error) {
		if (error && error.code === 6) return { enabled: true, ok: false, reason: 'duplicate' };
		throw error;
	}
}

/**
 * After desk approves a fix pack, freeze pre-outcome metrics (optional).
 * @returns {Promise<object|null>}
 */
async function captureOnPackApproved(db, pack, options) {
	const opts = options || {};
	const hooks = opts.hooks || {};
	const env = opts.env || process.env;
	if (!wireEligible(hooks, env)) return null;
	if (!pack || pack.status !== 'approved') return { enabled: true, reason: 'not-approved', ok: false };
	const metrics = opts.metrics || metricsFromReview(opts.report, pack.decidedAt || pack.updatedAt);
	const record = baselineRecord(pack, metrics, { anchoredAt: opts.anchoredAt || pack.decidedAt });
	const out = await saveBaseline(db, record);
	if (opts.note) opts.note(logLine(Object.assign({ enabled: true }, out)));
	return out;
}

module.exports = {
	ENV_KEY,
	COLLECTION,
	DELTA_WINDOWS,
	wireEligible,
	gscTotals,
	geoFromExtra,
	metricsFromReview,
	metricsFromReport: metricsFromReview,
	baselineRecord,
	daysSinceAnchor,
	deltasByWindow,
	diffGsc,
	diffGeo,
	badgeForWindow,
	badgesFromPull,
	toneForDelta,
	saveBaseline,
	captureOnPackApproved,
	logLine,
	signDelta,
};