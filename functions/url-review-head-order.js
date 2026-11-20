'use strict';

/* <head> order check (#3830), following the rules of rviscomi/capo.js (Apache-2.0) in plain code: the browser reads the
   head top to bottom, so charset, viewport and title come first, then preconnects, async scripts, @import styles,
   blocking scripts, stylesheets, preloads, deferred scripts, prefetches and everything else. It reads the start page's
   HTML the review already fetched, never runs it, and never requests anything. */

const { say, some } = require('./url-review-findings-en');

const KINDS = [
	['meta', 10],
	['preconnect', 9],
	['asyncScript', 8],
	['importStyles', 7],
	['syncScript', 6],
	['syncStyles', 5],
	['preload', 4],
	['deferScript', 3],
	['prefetch', 2],
	['other', 1],
];
const WEIGHT = {};
KINDS.forEach(([kind, weight]) => {
	WEIGHT[kind] = weight;
});

const SCAN_LIMIT = 300000;
const MAX_LISTED = 40;
const META_EQUIV =
	/^(accept-ch|content-security-policy|content-type|default-style|delegate-ch|origin-trial|x-dns-prefetch-control|refresh)$/i;
const DATA_SCRIPT = /^(application\/(ld\+)?json|importmap|speculationrules)\b|json$/i;
const PAIRED = new Set(['script', 'style', 'title', 'noscript', 'template']);
const VOID = new Set(['meta', 'link', 'base']);

function attr(source, name) {
	const match = new RegExp('(?:^|\\s)' + name + '\\s*=\\s*(?:"([^"]*)"|\'([^\']*)\'|([^\\s"\'>]+))', 'i').exec(source);
	return match ? (match[1] != null ? match[1] : match[2] != null ? match[2] : match[3]) : '';
}

function has(source, name) {
	return new RegExp('(?:^|\\s)' + name + '(?=[\\s=/]|$)', 'i').test(source);
}

function classify(name, attrs, body) {
	const tag = name.toLowerCase();
	if (tag === 'title' || tag === 'base') return 'meta';
	if (tag === 'meta') {
		if (has(attrs, 'charset') || /^viewport$/i.test(attr(attrs, 'name')) || META_EQUIV.test(attr(attrs, 'http-equiv')))
			return 'meta';
		return 'other';
	}
	if (tag === 'link') {
		const rels = attr(attrs, 'rel').toLowerCase().split(/\s+/);
		if (rels.indexOf('preconnect') !== -1) return 'preconnect';
		if (rels.indexOf('stylesheet') !== -1) return 'syncStyles';
		if (rels.indexOf('preload') !== -1 || rels.indexOf('modulepreload') !== -1) return 'preload';
		if (rels.some((rel) => rel === 'prefetch' || rel === 'dns-prefetch' || rel === 'prerender')) return 'prefetch';
		return 'other';
	}
	if (tag === 'style') return /@import\b/i.test(body) ? 'importStyles' : 'syncStyles';
	if (tag === 'script') {
		const type = attr(attrs, 'type').trim();
		if (type && DATA_SCRIPT.test(type)) return 'other';
		const src = has(attrs, 'src');
		if (src && has(attrs, 'async')) return 'asyncScript';
		if (has(attrs, 'defer') || /^module$/i.test(type))
			return src && has(attrs, 'async') ? 'asyncScript' : 'deferScript';
		return 'syncScript';
	}
	return 'other';
}

// The address without its query string, which can carry tokens, and cut short.
function safeOpenTag(tag) {
	return dropQueries(tag).replace(/\s+/g, ' ').slice(0, 140);
}

// tag.replace(/((?:href|src)\s*=\s*["']?[^"'\s>?]*)\?[^"'\s>]*/gi, "$1") without rescanning a value for each "src=" inside it.
function dropQueries(tag) {
	const attr = /(?:href|src)\s*=\s*["']?/gi;
	const path = /[^"'\s>?]*/y;
	const query = /[^"'\s>]*/y;
	let out = '';
	let kept = 0;
	for (let m; (m = attr.exec(tag)); ) {
		path.lastIndex = m.index + m[0].length;
		const mark = path.lastIndex + path.exec(tag)[0].length;
		if (tag[mark] === '?') {
			query.lastIndex = mark + 1;
			const end = query.lastIndex + query.exec(tag)[0].length;
			out += tag.slice(kept, mark);
			kept = end;
			attr.lastIndex = end;
		} else {
			// An attribute name starting before mark - 5 has the same value, which has no "?"; nearer ones can reach past mark.
			attr.lastIndex = Math.max(m.index + 1, mark - 5);
		}
	}
	return out + tag.slice(kept);
}

// The index of the ">" that closes the tag opened at `from`, skipping any ">" inside a quoted value; -1 when it never closes.
function tagEnd(source, from) {
	let quote = '';
	for (let i = from + 1; i < source.length; i++) {
		const char = source.charAt(i);
		if (quote) {
			if (char === quote) quote = '';
		} else if (char === '"' || char === "'") quote = char;
		else if (char === '>') return i;
	}
	return -1;
}

const NAME_CHAR = /[a-z0-9-]/;

// Scans by hand, not with one big pattern, so a hostile page cannot make it slow (linear in the HTML).
function elements(html) {
	const source = String(html || '').slice(0, SCAN_LIMIT);
	const lower = source.toLowerCase();
	let pos = 0;
	const headAt = lower.indexOf('<head');
	if (headAt !== -1 && !NAME_CHAR.test(lower.charAt(headAt + 5))) {
		const close = tagEnd(source, headAt);
		if (close !== -1) pos = close + 1;
	}
	const found = [];
	while (pos < source.length) {
		const open = lower.indexOf('<', pos);
		if (open === -1) break;
		if (lower.startsWith('<!--', open)) {
			const end = lower.indexOf('-->', open + 4);
			if (end === -1) break;
			pos = end + 3;
			continue;
		}
		let nameEnd = open + 1;
		if (lower.charAt(nameEnd) === '/') nameEnd++;
		const nameStart = nameEnd;
		while (nameEnd < lower.length && NAME_CHAR.test(lower.charAt(nameEnd))) nameEnd++;
		const name = lower.slice(nameStart, nameEnd);
		const closing = nameStart > open + 1;
		if (closing && name === 'head') break;
		if (!closing && name === 'body') break;
		const close = tagEnd(source, open);
		if (close === -1) break;
		pos = close + 1;
		if (closing || (!PAIRED.has(name) && !VOID.has(name))) continue;
		const attrs = source.slice(nameEnd, close).replace(/\/$/, '');
		let body = '';
		let text = source.slice(open, close + 1);
		if (PAIRED.has(name)) {
			const end = lower.indexOf('</' + name, pos);
			if (end === -1) break;
			body = source.slice(pos, end);
			const endClose = lower.indexOf('>', end);
			pos = endClose === -1 ? source.length : endClose + 1;
			text = source.slice(open, pos);
		}
		if (name === 'noscript' || name === 'template') continue;
		const kind = classify(name, attrs, body);
		let snippet;
		if (PAIRED.has(name) && name !== 'title' && !has(attrs, 'src')) {
			const size = Buffer.byteLength(body);
			snippet =
				'<' +
				name +
				(attrs.trim() ? ' ' + safeOpenTag(attrs.trim()) : '') +
				'>…</' +
				name +
				'> (' +
				(size >= 1000 ? Math.round(size / 100) / 10 + ' kB' : size + ' B') +
				' inline)';
		} else if (name === 'title') snippet = '<title>…</title>';
		else if (PAIRED.has(name)) snippet = safeOpenTag('<' + name + attrs + '>') + '</' + name + '>';
		else snippet = safeOpenTag('<' + name + attrs + '>');
		found.push({ kind, weight: WEIGHT[kind], snippet, bytes: Buffer.byteLength(text) });
	}
	return found;
}

function analyze(html, options) {
	const list = elements(html);
	const total = list.length;
	let pairs = 0;
	let inversions = 0;
	const late = list.map(() => 0);
	const earlierLower = list.map(() => '');
	for (let j = 0; j < total; j++) {
		for (let i = 0; i < j; i++) {
			if (list[i].weight === list[j].weight) continue;
			pairs++;
			if (list[i].weight < list[j].weight) {
				inversions++;
				late[i]++;
				if (!earlierLower[j]) earlierLower[j] = list[i].kind;
			}
		}
	}
	const score = pairs ? Math.round(100 * (1 - inversions / pairs)) : 100;
	// Which kind of element sits ahead of which: each element placed before a heavier one names the pair.
	const moves = [];
	list.forEach((item, index) => {
		if (!late[index]) return;
		const heavier = list.slice(index + 1).find((later) => later.weight > item.weight);
		if (heavier && !moves.some((move) => move.early === heavier.kind && move.late === item.kind))
			moves.push({ early: item.kind, late: heavier.kind, count: late[index] });
	});
	moves.sort((a, b) => b.count - a.count);
	const report = {
		total,
		inversions,
		score,
		headBytes: list.reduce((sum, item) => sum + item.bytes, 0),
		moves: moves.slice(0, 3).map((move) => ({ early: move.early, late: move.late })),
	};
	if (options && options.detail && inversions) {
		const indexed = list.map((item, index) => ({ item, from: index + 1 }));
		const ordered = indexed.slice().sort((a, b) => b.item.weight - a.item.weight || a.from - b.from);
		report.ordered = ordered
			.slice(0, MAX_LISTED)
			.map((row, index) => ({ snippet: row.item.snippet, kind: row.item.kind, from: row.from, to: index + 1 }));
	}
	return report;
}

function findings(report, add) {
	if (!report || report.total < 3) return null;
	if (!report.inversions) {
		add(
			'Performance',
			'pass',
			'info',
			'perf-head-order',
			say('perf-head-order.pass.title'),
			say('perf-head-order.pass.evidence', { n: report.total, score: report.score }),
			'',
			{ effort: 'minutes' }
		);
		return report;
	}
	const moves = report.moves.map((move) =>
		say('perf-head-order.late', {
			late: say('perf-head-order.kind.' + move.late),
			early: say('perf-head-order.kind.' + move.early),
		})
	);
	add(
		'Performance',
		'risk',
		'low',
		'perf-head-order',
		say('perf-head-order.title', { score: report.score }),
		say('perf-head-order.evidence', { moves: some(moves, 3), n: report.total, inversions: report.inversions }),
		say('perf-head-order.fix'),
		{ effort: 'minutes' }
	);
	return report;
}

module.exports = { analyze, elements, classify, findings, KINDS };
