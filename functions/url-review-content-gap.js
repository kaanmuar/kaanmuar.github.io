'use strict';

/* Audit-only content gap matrix (#4363): keep / merge / redirect / write-manually from crawl fields only.
   Briefs for operators; no draft generation or CMS publish. */

const { say, some } = require('./url-review-findings-en');
const { similarity, DUPLICATE_AT } = require('./url-review-page-graph');

const THIN_WORDS = 150;
const TITLE_NEAR = 0.85;

function normal(url) {
	try {
		const u = new URL(url);
		u.hash = '';
		if (u.pathname !== '/' && u.pathname.endsWith('/')) u.pathname = u.pathname.slice(0, -1);
		return u.href;
	} catch (error) {
		return String(url || '');
	}
}

function pathOf(url) {
	try {
		return new URL(url).pathname || '/';
	} catch (error) {
		return '/';
	}
}

function normTitle(value) {
	return String(value || '')
		.toLowerCase()
		.replace(/[\s\u00a0]+/g, ' ')
		.replace(/[^\p{L}\p{N}\s]/gu, '')
		.trim();
}

function titleNear(a, b) {
	if (!a || !b) return false;
	if (a === b) return true;
	const wa = a.split(' ').filter(Boolean);
	const wb = b.split(' ').filter(Boolean);
	if (!wa.length || !wb.length) return false;
	const set = new Set(wb);
	let inter = 0;
	wa.forEach((w) => {
		if (set.has(w)) inter += 1;
	});
	return inter / (wa.length + wb.length - inter) >= TITLE_NEAR;
}

function rowFrom(page) {
	const inspect = page.inspect || {};
	return {
		path: page.path || pathOf(page.url),
		title: inspect.title || page.title || '',
		h1: (inspect.h1 && inspect.h1[0]) || '',
		words: inspect.words || 0,
		sig: inspect.minhash || page.sig || '',
		depth: page.depth || 0,
		links: (inspect.links || []).map(normal),
	};
}

function pickCanonical(paths, meta, inbound) {
	return paths
		.slice()
		.sort(
			(a, b) =>
				(meta.get(a).depth || 0) - (meta.get(b).depth || 0) ||
				(inbound.get(b) || 0) - (inbound.get(a) || 0) ||
				a.localeCompare(b)
		)[0];
}

function bodyDuplicateGroups(rows, threshold) {
	const limit = threshold != null ? threshold : DUPLICATE_AT;
	const list = rows.filter((row) => row.sig);
	const parent = list.map((_, index) => index);
	const find = (i) => (parent[i] === i ? i : (parent[i] = find(parent[i])));
	for (let i = 0; i < list.length; i++) {
		for (let j = i + 1; j < list.length; j++) {
			if (similarity(list[i].sig, list[j].sig) >= limit) parent[find(j)] = find(i);
		}
	}
	const groups = new Map();
	list.forEach((row, index) => {
		const root = find(index);
		if (!groups.has(root)) groups.set(root, []);
		groups.get(root).push(row.path);
	});
	return [...groups.values()].filter((group) => group.length > 1);
}

function contentGapMatrix(pages, opts) {
	const options = opts || {};
	const thinAt = options.thinWords != null ? options.thinWords : THIN_WORDS;
	const indexable = options.indexablePaths;
	const list = (pages || []).filter((page) => page && (page.inspect || page.title != null));
	const crawled = list.map(rowFrom);
	const rows = indexable ? crawled.filter((row) => indexable.has(row.path)) : crawled;
	const meta = new Map(rows.map((row) => [row.path, row]));

	const urlToPath = new Map();
	list.forEach((page) => {
		const path = page.path || pathOf(page.url);
		urlToPath.set(normal(page.url), path);
	});

	const inbound = new Map(rows.map((row) => [row.path, 0]));
	rows.forEach((row) => {
		row.links.forEach((link) => {
			const target = urlToPath.get(link);
			if (target && inbound.has(target) && target !== row.path) inbound.set(target, inbound.get(target) + 1);
		});
	});

	const mergeTarget = new Map();
	const mergeReason = new Map();

	const titleByPath = new Map();
	rows.forEach((row) => {
		const key = normTitle(row.title);
		if (key) titleByPath.set(row.path, key);
	});

	const titleBuckets = new Map();
	titleByPath.forEach((key, path) => {
		if (!titleBuckets.has(key)) titleBuckets.set(key, []);
		titleBuckets.get(key).push(path);
	});
	titleBuckets.forEach((paths) => {
		if (paths.length < 2) return;
		const keep = pickCanonical(paths, meta, inbound);
		paths.forEach((path) => {
			if (path === keep) return;
			mergeTarget.set(path, keep);
			mergeReason.set(path, 'Duplicate title with ' + keep);
		});
	});

	const titleKeys = [...new Set(titleByPath.values())];
	const nearParent = titleKeys.map((_, i) => i);
	const nearFind = (i) => (nearParent[i] === i ? i : (nearParent[i] = nearFind(nearParent[i])));
	for (let i = 0; i < titleKeys.length; i++) {
		for (let j = i + 1; j < titleKeys.length; j++) {
			if (titleKeys[i] !== titleKeys[j] && titleNear(titleKeys[i], titleKeys[j])) nearParent[nearFind(j)] = nearFind(i);
		}
	}
	const nearGroups = new Map();
	titleKeys.forEach((key, index) => {
		const root = nearFind(index);
		if (!nearGroups.has(root)) nearGroups.set(root, new Set());
		nearGroups.get(root).add(key);
	});
	nearGroups.forEach((keys) => {
		if (keys.size < 2) return;
		const paths = rows.map((row) => row.path).filter((path) => keys.has(titleByPath.get(path)));
		if (paths.length < 2) return;
		const keep = pickCanonical(paths, meta, inbound);
		paths.forEach((path) => {
			if (path === keep || mergeTarget.has(path)) return;
			mergeTarget.set(path, keep);
			mergeReason.set(path, 'Near-duplicate title with ' + keep);
		});
	});

	bodyDuplicateGroups(rows).forEach((paths) => {
		const keep = pickCanonical(paths, meta, inbound);
		paths.forEach((path) => {
			if (path === keep) return;
			if (!mergeTarget.has(path)) {
				mergeTarget.set(path, keep);
				mergeReason.set(path, 'Near-duplicate body with ' + keep);
			}
		});
	});

	const out = rows.map((row) => {
		const noH1 = !row.h1;
		const thin = row.words < thinAt;
		const orphan = row.depth > 0 && (inbound.get(row.path) || 0) <= 1;

		if (mergeTarget.has(row.path)) {
			return {
				path: row.path,
				title: row.title,
				h1: row.h1,
				action: 'merge',
				reason: mergeReason.get(row.path) || 'Merge into a stronger page',
			};
		}
		if (orphan && thin) {
			return {
				path: row.path,
				title: row.title,
				h1: row.h1,
				action: 'redirect',
				reason: 'Orphan path with thin content (' + row.words + ' words)',
			};
		}
		if (thin || noH1) {
			const bits = [];
			if (thin) bits.push('thin content (' + row.words + ' words)');
			if (noH1) bits.push('no H1');
			return {
				path: row.path,
				title: row.title,
				h1: row.h1,
				action: 'write-manually',
				reason: bits.join('; '),
			};
		}
		return {
			path: row.path,
			title: row.title,
			h1: row.h1,
			action: 'keep',
			reason: 'No content-gap action from crawl heuristics',
		};
	});

	const summary = { pages: out.length, keep: 0, merge: 0, redirect: 0, 'write-manually': 0 };
	out.forEach((row) => {
		summary[row.action] += 1;
	});

	return { rows: out, summary };
}

function findings(pages, add, opts) {
	const matrix = contentGapMatrix(pages, opts);
	if (!matrix.summary.pages) return null;
	const actionable = matrix.rows.filter((row) => row.action !== 'keep');
	const pagesList = actionable.map((row) => row.path);
	if (!actionable.length) {
		add(
			'SEO',
			'pass',
			'info',
			'seo-content-gap',
			say('seo-content-gap.pass.title'),
			say('seo-content-gap.pass.evidence', { n: matrix.summary.pages }),
			'',
			{ effort: 'hours' }
		);
	} else {
		const merge = matrix.summary.merge;
		const redirect = matrix.summary.redirect;
		const write = matrix.summary['write-manually'];
		add(
			'SEO',
			'pass',
			'info',
			'seo-content-gap',
			say('seo-content-gap.title', { merge, redirect, write }),
			say('seo-content-gap.evidence', {
				list: some(
					actionable.map((row) => say('seo-content-gap.row', { path: row.path, action: row.action, reason: row.reason })),
					5
				),
				n: matrix.summary.pages,
			}),
			say('seo-content-gap.fix'),
			{ pages: pagesList, effort: 'days', matrix: matrix.summary }
		);
	}
	return matrix;
}

module.exports = { contentGapMatrix, findings, THIN_WORDS, TITLE_NEAR, normTitle, titleNear };