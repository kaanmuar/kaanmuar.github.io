'use strict';

/* Link-purpose check (#3831), written from the W3C text of WCAG 2.2 SC 2.4.4 "Link Purpose (In Context)" and its
   failure F84 / technique H30 (a link whose name is only "click here" or "read more" says nothing about where it
   goes), not from any tool's code. The wording lists are our own, in the six review languages.
   axe-core's default rules flag only links with no name at all, so this fills the gap.
   Passive: it reads the start page's HTML the review already fetched, never runs it, and never requests anything.
   The scan is by hand with indexOf, so a hostile page cannot make it slow (linear in the HTML). */

const { say, some } = require('./url-review-findings-en');

const SCAN_LIMIT = 300000;
const MAX_LINKS = 600;
const MAX_LISTED = 40;
const NAME_CHAR = /[a-z0-9-]/;

// Names that say nothing about the destination, in en, es, pt, de, fr and it. Compared after normalising.
const GENERIC = new Set([
	'click here',
	'click',
	'here',
	'this link',
	'link',
	'more',
	'read more',
	'learn more',
	'see more',
	'view more',
	'more info',
	'more information',
	'details',
	'continue',
	'continue reading',
	'go',
	'this',
	'this page',
	'find out more',
	'tap here',
	'haz clic aqui',
	'clic aqui',
	'pulsa aqui',
	'aqui',
	'este enlace',
	'enlace',
	'mas',
	'leer mas',
	'ver mas',
	'mas informacion',
	'mas info',
	'saber mas',
	'conoce mas',
	'detalles',
	'continuar',
	'continuar leyendo',
	'ir',
	'clique aqui',
	'clica aqui',
	'clique',
	'este link',
	'saiba mais',
	'leia mais',
	'ler mais',
	'ver mais',
	'mais',
	'mais informacoes',
	'mais info',
	'detalhes',
	'continuar lendo',
	'continuar a ler',
	'saber mais',
	'descubra mais',
	'hier klicken',
	'hier',
	'klicken sie hier',
	'dieser link',
	'mehr',
	'mehr lesen',
	'mehr erfahren',
	'mehr anzeigen',
	'weiterlesen',
	'weiter',
	'weitere informationen',
	'mehr infos',
	'details ansehen',
	'zum artikel',
	'lesen',
	'cliquez ici',
	'cliquer ici',
	'ici',
	'ce lien',
	'lien',
	'plus',
	'en savoir plus',
	'lire la suite',
	'lire plus',
	'voir plus',
	'plus d infos',
	'plus d informations',
	'details',
	'suite',
	'continuer',
	'decouvrir',
	'clicca qui',
	'clicca',
	'fai clic qui',
	'qui',
	'questo link',
	'altro',
	'di piu',
	'leggi di piu',
	'scopri di piu',
	'maggiori informazioni',
	'piu informazioni',
	'continua',
	'continua a leggere',
	'dettagli',
	'vai',
	'leggi tutto',
	'scopri',
]);

const ENTITIES = {
	amp: '&',
	lt: '<',
	gt: '>',
	quot: '"',
	apos: "'",
	nbsp: ' ',
	hellip: '…',
	raquo: '»',
	laquo: '«',
	rarr: '→',
	rsaquo: '›',
};

function decode(text) {
	return String(text).replace(/&(#x[0-9a-f]{1,6}|#\d{1,7}|[a-z]{2,8});/gi, (match, code) => {
		if (code.charAt(0) === '#') {
			const value = code.charAt(1).toLowerCase() === 'x' ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
			return value > 0 && value < 0x110000 ? String.fromCodePoint(value) : ' ';
		}
		const hit = ENTITIES[code.toLowerCase()];
		return hit == null ? match : hit;
	});
}

// "Read more »" / "READ MORE…" / "Más información" → "read more" / "mas informacion".
function normalize(text) {
	return decode(text)
		.toLowerCase()
		.normalize('NFD')
		.replace(/[\u0300-\u036f]/g, '')
		.replace(/[^a-z0-9]+/g, ' ')
		.trim();
}

function isGeneric(name) {
	return GENERIC.has(normalize(name));
}

function attr(source, name) {
	const lower = source.toLowerCase();
	let from = 0;
	for (;;) {
		const at = lower.indexOf(name, from);
		if (at === -1) return null;
		from = at + name.length;
		const before = at === 0 ? ' ' : lower.charAt(at - 1);
		if (!/[\s"'/]/.test(before)) continue;
		let i = from;
		while (i < source.length && /\s/.test(source.charAt(i))) i++;
		if (source.charAt(i) !== '=') {
			if (!NAME_CHAR.test(lower.charAt(from))) return '';
			continue;
		}
		i++;
		while (i < source.length && /\s/.test(source.charAt(i))) i++;
		const quote = source.charAt(i);
		if (quote === '"' || quote === "'") {
			const end = source.indexOf(quote, i + 1);
			return end === -1 ? source.slice(i + 1) : source.slice(i + 1, end);
		}
		let end = i;
		while (end < source.length && !/[\s>]/.test(source.charAt(end))) end++;
		return source.slice(i, end);
	}
}

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

// The text of the first <title> inside an <svg>, found with indexOf (no pattern to backtrack).
function svgTitle(svg) {
	const lower = svg.toLowerCase();
	const open = lower.indexOf('<title');
	if (open === -1 || NAME_CHAR.test(lower.charAt(open + 6))) return '';
	const start = tagEnd(svg, open);
	if (start === -1) return '';
	const end = lower.indexOf('<', start + 1);
	return end === -1 ? svg.slice(start + 1) : svg.slice(start + 1, end);
}

// What a link's inner HTML offers a screen reader: its text, plus the alt of any image inside it.
function innerName(inner) {
	const lower = inner.toLowerCase();
	let out = '';
	let pos = 0;
	while (pos < inner.length) {
		const open = lower.indexOf('<', pos);
		if (open === -1) {
			out += inner.slice(pos);
			break;
		}
		out += inner.slice(pos, open) + ' ';
		const close = tagEnd(inner, open);
		if (close === -1) break;
		const tag = inner.slice(open, close + 1);
		if (/^<img[\s/>]/i.test(tag)) out += ' ' + (attr(tag, 'alt') || '') + ' ';
		else if (/^<svg[\s/>]/i.test(tag)) {
			const end = lower.indexOf('</svg', close);
			if (end === -1) break;
			const title = svgTitle(inner.slice(close, end));
			if (title) out += ' ' + title + ' ';
			pos = end;
			const next = tagEnd(inner, end);
			if (next === -1) break;
			pos = next + 1;
			continue;
		} else if (/^<(script|style)[\s/>]/i.test(tag)) {
			const name = /^<(script|style)/i.exec(tag)[1].toLowerCase();
			const end = lower.indexOf('</' + name, close);
			if (end === -1) break;
			const next = tagEnd(inner, end);
			if (next === -1) break;
			pos = next + 1;
			continue;
		}
		pos = close + 1;
	}
	return out;
}

function hrefKey(href) {
	return String(href || '')
		.split('#')[0]
		.split('?')[0]
		.trim()
		.toLowerCase()
		.slice(0, 200);
}

function links(html) {
	const source = String(html || '').slice(0, SCAN_LIMIT);
	const lower = source.toLowerCase();
	const found = [];
	let pos = 0;
	while (pos < source.length && found.length < MAX_LINKS) {
		const open = lower.indexOf('<a', pos);
		if (open === -1) break;
		pos = open + 2;
		if (!/[\s>]/.test(lower.charAt(open + 2))) continue;
		const close = tagEnd(source, open);
		if (close === -1) break;
		pos = close + 1;
		const attrs = source.slice(open + 2, close);
		const href = attr(attrs, 'href');
		if (href == null) continue;
		const end = lower.indexOf('</a', pos);
		if (end === -1) break;
		const inner = source.slice(pos, end);
		pos = end + 3;
		if (/^true$/i.test(attr(attrs, 'aria-hidden') || '') || /^(presentation|none)$/i.test(attr(attrs, 'role') || ''))
			continue;
		if (attr(attrs, 'aria-labelledby')) {
			found.push({ name: '', href, resolved: false });
			continue;
		}
		const label = (attr(attrs, 'aria-label') || '').trim();
		const text = (label || innerName(inner)).replace(/\s+/g, ' ').trim() || (attr(attrs, 'title') || '').trim();
		found.push({ name: text, href, resolved: true });
	}
	return found;
}

function analyze(html) {
	const list = links(html).filter((link) => link.resolved && link.name);
	const groups = new Map();
	list.forEach((link) => {
		if (!isGeneric(link.name)) return;
		const key = normalize(link.name);
		const row = groups.get(key) || {
			text: decode(link.name).replace(/\s+/g, ' ').trim().slice(0, 40),
			count: 0,
			hrefs: new Set(),
		};
		row.count++;
		row.hrefs.add(hrefKey(link.href));
		groups.set(key, row);
	});
	const generic = Array.from(groups.values())
		.sort((a, b) => b.count - a.count)
		.slice(0, MAX_LISTED)
		.map((row) => ({ text: row.text, count: row.count, targets: row.hrefs.size }));
	return { total: list.length, generic: generic.reduce((sum, row) => sum + row.count, 0), names: generic };
}

function findings(report, add) {
	if (!report || report.total < 3) return null;
	if (!report.generic) {
		add(
			'Accessibility',
			'pass',
			'info',
			'a11y-linktext',
			say('a11y-linktext.pass.title'),
			say('a11y-linktext.pass.evidence', { n: report.total }),
			'',
			{ effort: 'minutes' }
		);
		return report;
	}
	const names = report.names.map((row) =>
		say(row.targets > 1 ? 'a11y-linktext.name.many' : 'a11y-linktext.name', {
			text: row.text,
			count: row.count,
			targets: row.targets,
		})
	);
	add(
		'Accessibility',
		'risk',
		report.names.some((row) => row.targets > 2) ? 'medium' : 'low',
		'a11y-linktext',
		say('a11y-linktext.title'),
		say('a11y-linktext.evidence', { n: report.generic, total: report.total, names: some(names, 3) }),
		say('a11y-linktext.fix'),
		{ effort: 'minutes' }
	);
	return report;
}

module.exports = { analyze, links, findings, isGeneric, normalize, GENERIC };
