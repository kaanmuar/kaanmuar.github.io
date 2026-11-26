'use strict';

/* Customer Search Console outcomes for URL Review (#4361 decay, #4362 cannibalization).
   Pure helpers: pass GSC rows in; no OAuth here. Opt-in when extras.gsc is present.
   Not a content autopilot — findings only. */

const { say } = require('./url-review-findings-en');

const DEFAULT_CLICK_DROP = 0.3; // 30% fewer clicks vs prior window
const DEFAULT_POS_SLIP = 3; // average position worse by this many places
const DEFAULT_MIN_IMPRESSIONS = 50;

function trimSlashes(path) {
	let out = String(path || '');
	while (out.length > 1 && out.endsWith('/')) out = out.slice(0, -1);
	while (out.startsWith('//')) out = out.slice(1);
	return out || '/';
}

function pageKey(urlOrPath) {
	if (!urlOrPath) return '';
	try {
		if (/^https?:\/\//i.test(urlOrPath)) {
			const u = new URL(urlOrPath);
			let path = u.pathname.replace(/\/index\.html$|\.html$/, '');
			path = trimSlashes(path);
			return path + (u.search || '');
		}
	} catch (_) {
		/* fall through */
	}
	let s = String(urlOrPath);
	if (!s.startsWith('/')) s = '/' + s.replace(/^\/+/, '');
	return trimSlashes(s);
}

function num(v) {
	const n = Number(v);
	return Number.isFinite(n) ? n : 0;
}

/**
 * @param {object} opts
 * @param {Array<{page?:string,path?:string,clicks?:number,impressions?:number,position?:number}>} opts.current
 * @param {Array<{page?:string,path?:string,clicks?:number,impressions?:number,position?:number}>} opts.prior
 * @param {string[]} [opts.pages] reviewed paths (optional filter)
 * @param {number} [opts.clickDrop]
 * @param {number} [opts.posSlip]
 * @param {number} [opts.minImpressions]
 */
function gscDecayFindings(opts) {
	const current = (opts && opts.current) || [];
	const prior = (opts && opts.prior) || [];
	const clickDrop = opts && opts.clickDrop != null ? opts.clickDrop : DEFAULT_CLICK_DROP;
	const posSlip = opts && opts.posSlip != null ? opts.posSlip : DEFAULT_POS_SLIP;
	const minImpressions = opts && opts.minImpressions != null ? opts.minImpressions : DEFAULT_MIN_IMPRESSIONS;
	const allow = opts && Array.isArray(opts.pages) && opts.pages.length
		? new Set(opts.pages.map(pageKey))
		: null;

	const priorMap = new Map();
	for (const row of prior) {
		const key = pageKey(row.page || row.path);
		if (!key) continue;
		priorMap.set(key, row);
	}

	const findings = [];
	for (const row of current) {
		const key = pageKey(row.page || row.path);
		if (!key) continue;
		if (allow && !allow.has(key)) continue;
		const prev = priorMap.get(key);
		if (!prev) continue;
		const impressions = num(row.impressions);
		if (impressions < minImpressions && num(prev.impressions) < minImpressions) continue;

		const clicks = num(row.clicks);
		const prevClicks = num(prev.clicks);
		const position = num(row.position);
		const prevPos = num(prev.position);

		const clickRatio = prevClicks > 0 ? clicks / prevClicks : 1;
		const droppedClicks = prevClicks >= minImpressions / 5 && clickRatio <= 1 - clickDrop;
		const slippedPos =
			prevPos > 0 && position > 0 && impressions >= minImpressions && position - prevPos >= posSlip;

		if (!droppedClicks && !slippedPos) continue;

		const reasons = [];
		if (droppedClicks) {
			reasons.push({
				kind: 'clicks',
				from: prevClicks,
				to: clicks,
				dropPct: Math.round((1 - clickRatio) * 100),
			});
		}
		if (slippedPos) {
			reasons.push({
				kind: 'position',
				from: Math.round(prevPos * 10) / 10,
				to: Math.round(position * 10) / 10,
				slip: Math.round((position - prevPos) * 10) / 10,
			});
		}
		findings.push({
			path: key,
			clicks,
			impressions,
			position: position || null,
			priorClicks: prevClicks,
			priorPosition: prevPos || null,
			reasons,
		});
	}
	findings.sort((a, b) => b.priorClicks - a.priorClicks || b.impressions - a.impressions);
	return findings;
}

/**
 * Group GSC query×page rows where one query has 2+ landing URLs.
 * @param {Array<{query:string,page?:string,path?:string,clicks?:number,impressions?:number,position?:number}>} gscRows
 * @param {{minImpressions?:number}} [opts]
 */
function cannibalizationFindings(gscRows, opts) {
	const minImpressions = opts && opts.minImpressions != null ? opts.minImpressions : DEFAULT_MIN_IMPRESSIONS;
	const byQuery = new Map();
	for (const row of gscRows || []) {
		const query = String(row.query || '')
			.trim()
			.toLowerCase();
		const path = pageKey(row.page || row.path);
		if (!query || !path) continue;
		if (!byQuery.has(query)) byQuery.set(query, []);
		byQuery.get(query).push({
			path,
			clicks: num(row.clicks),
			impressions: num(row.impressions),
			position: num(row.position) || null,
		});
	}

	const findings = [];
	for (const [query, rows] of byQuery) {
		const byPath = new Map();
		for (const r of rows) {
			const cur = byPath.get(r.path);
			if (!cur) byPath.set(r.path, { ...r });
			else {
				cur.clicks += r.clicks;
				cur.impressions += r.impressions;
				if (r.position != null) {
					cur.position =
						cur.position == null
							? r.position
							: (cur.position * cur.impressions + r.position * r.impressions) /
								(cur.impressions + r.impressions || 1);
				}
			}
		}
		const pages = [...byPath.values()].filter((p) => p.impressions >= minImpressions || p.clicks > 0);
		if (pages.length < 2) continue;
		pages.sort((a, b) => b.clicks - a.clicks || b.impressions - a.impressions);
		const owner = pages[0];
		const rivals = pages.slice(1);
		findings.push({
			query,
			owner: owner.path,
			rivals: rivals.map((r) => r.path),
			pages: pages.map((p) => ({
				path: p.path,
				clicks: p.clicks,
				impressions: p.impressions,
				position: p.position == null ? null : Math.round(p.position * 10) / 10,
			})),
			action: 'merge', // keep owner; merge or redirect rivals — editorial choice
		});
	}
	findings.sort((a, b) => {
		const ai = a.pages.reduce((s, p) => s + p.impressions, 0);
		const bi = b.pages.reduce((s, p) => s + p.impressions, 0);
		return bi - ai;
	});
	return findings;
}

function findings(gsc, add) {
	if (!gsc || !add) return null;
	const decay = Array.isArray(gsc.decay)
		? gsc.decay
		: gscDecayFindings({
				current: gsc.current || gsc.pages || [],
				prior: gsc.prior || [],
				pages: gsc.reviewedPaths,
				clickDrop: gsc.clickDrop,
				posSlip: gsc.posSlip,
				minImpressions: gsc.minImpressions,
			});
	const cannibal = Array.isArray(gsc.cannibalization)
		? gsc.cannibalization
		: cannibalizationFindings(gsc.queryPages || [], { minImpressions: gsc.minImpressions });

	let emitted = 0;
	if (decay.length) {
		const top = decay.slice(0, 8);
		const list = top
			.map((d) => {
				const why = d.reasons
					.map((r) =>
						r.kind === 'clicks'
							? `${d.path}: clicks ${r.from}→${r.to} (−${r.dropPct}%)`
							: `${d.path}: position ${r.from}→${r.to}`
					)
					.join('; ');
				return why;
			})
			.join('. ');
		add(
			'SEO',
			'fail',
			'tip',
			'seo-gsc-decay',
			say('seo-gsc-decay.title', { n: decay.length }),
			say('seo-gsc-decay.evidence', { list: list.slice(0, 900) }),
			say('seo-gsc-decay.fix'),
			{ effort: 'days', count: decay.length, pages: top.map((d) => d.path) }
		);
		emitted += 1;
	} else if (gsc.ok || gsc.current || gsc.prior) {
		add(
			'SEO',
			'pass',
			'info',
			'seo-gsc-decay',
			say('seo-gsc-decay.pass.title'),
			say('seo-gsc-decay.pass.evidence'),
			'',
			{ effort: 'minutes' }
		);
		emitted += 1;
	}

	if (cannibal.length) {
		const top = cannibal.slice(0, 6);
		const list = top
			.map((c) => `"${c.query}": keep ${c.owner}, rivals ${c.rivals.slice(0, 3).join(', ')}`)
			.join('. ');
		add(
			'SEO',
			'fail',
			'tip',
			'seo-gsc-cannibal',
			say('seo-gsc-cannibal.title', { n: cannibal.length }),
			say('seo-gsc-cannibal.evidence', { list: list.slice(0, 900) }),
			say('seo-gsc-cannibal.fix'),
			{ effort: 'days', count: cannibal.length }
		);
		emitted += 1;
	}

	return emitted ? { decay: decay.length, cannibalization: cannibal.length } : null;
}

module.exports = {
	pageKey,
	gscDecayFindings,
	cannibalizationFindings,
	findings,
	DEFAULT_CLICK_DROP,
	DEFAULT_POS_SLIP,
	DEFAULT_MIN_IMPRESSIONS,
};
