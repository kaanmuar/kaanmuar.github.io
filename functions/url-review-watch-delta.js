'use strict';

/**
 * Score and area deltas between two review snapshots (#4366 / epic #4360).
 * Pure helper — no I/O. Wire in a follow-on PR (watch mail, PDF, account UI).
 */

const AREAS = ['SEO', 'GEO', 'Analytics', 'Security', 'Accessibility', 'Performance'];

function num(value) {
	return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function overallOf(snap) {
	if (!snap) return null;
	if (typeof snap.overall === 'number') return snap.overall;
	const score =
		(snap.insights && snap.insights.score) ||
		(snap.report && snap.report.insights && snap.report.insights.score) ||
		snap.score;
	return score && typeof score.overall === 'number' ? score.overall : null;
}

function areaScoresOf(snap) {
	if (!snap) return {};
	const flat = snap.areas;
	if (flat && typeof flat === 'object') {
		const keys = Object.keys(flat);
		if (keys.length && typeof flat[keys[0]] === 'number') return flat;
		if (keys.length && flat[keys[0]] && typeof flat[keys[0]].score === 'number') {
			const out = {};
			keys.forEach((name) => {
				const row = flat[name];
				if (row && typeof row.score === 'number') out[name] = row.score;
			});
			return out;
		}
	}
	const score =
		(snap.insights && snap.insights.score) ||
		(snap.report && snap.report.insights && snap.report.insights.score) ||
		snap.score;
	const nested = (score && score.areas) || {};
	const out = {};
	Object.keys(nested).forEach((name) => {
		const row = nested[name];
		if (row && typeof row.score === 'number') out[name] = row.score;
	});
	return out;
}

/**
 * @param {object} a earlier snapshot
 * @param {object} b later snapshot
 * @returns {{ before: number|null, now: number|null, overall: number|null, areas: Record<string, { before: number|null, now: number|null, delta: number|null }> }}
 */
function diffSnapshots(a, b) {
	const beforeOverall = overallOf(a);
	const nowOverall = overallOf(b);
	const aAreas = areaScoresOf(a);
	const bAreas = areaScoresOf(b);
	const names = new Set([...Object.keys(aAreas), ...Object.keys(bAreas), ...AREAS]);
	const areas = {};
	names.forEach((name) => {
		const before = num(aAreas[name]);
		const now = num(bAreas[name]);
		if (before == null && now == null) return;
		areas[name] = {
			before,
			now,
			delta: before != null && now != null ? now - before : null,
		};
	});
	return {
		before: beforeOverall,
		now: nowOverall,
		overall: beforeOverall != null && nowOverall != null ? nowOverall - beforeOverall : null,
		areas,
	};
}

module.exports = { diffSnapshots, AREAS };