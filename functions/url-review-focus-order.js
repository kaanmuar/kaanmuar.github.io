'use strict';

/* Keyboard focus-order smells that show in the start page's HTML as delivered (#3831). Written from the W3C text of
   WCAG 2.2 SC 2.1.1 Keyboard, 2.1.2 No Keyboard Trap, 2.4.3 Focus Order, 3.2.1 On Focus and 4.1.2 Name, Role, Value,
   and from the HTML Standard's rules for tabindex, autofocus, inert and aria-hidden, not from any tool's code. The
   idea (look for things a keyboard user cannot reach, cannot leave, or reaches in a surprising order) comes from the
   equal-access family of checkers; the rules, thresholds and wording are our own.
   Passive: it reads the HTML the review already fetched, never runs it, never requests anything and needs no browser,
   so Cloud Functions can run it. That is also its limit: it sees attributes, not CSS or scripts. A page that hides a
   menu with a class, adds a close button with JavaScript or moves focus in a handler can look wrong here and be fine
   (and the other way round), so the findings say "in the HTML" and ask a person to confirm.
   The scan is by hand with indexOf and a bounded element stack, so a hostile page cannot make it slow. */

const { say, some } = require('./url-review-findings-en');
const focusTrap = require('./url-review-focus-trap');

const SCAN_LIMIT = 400000;
const MAX_ELEMENTS = 20000;
const MAX_DEPTH = 256;
const MAX_SAMPLES = 6;
const NAME_CHAR = /[a-z0-9-]/;

const VOID = new Set([
	'area',
	'base',
	'br',
	'col',
	'embed',
	'hr',
	'img',
	'input',
	'link',
	'meta',
	'param',
	'source',
	'track',
	'wbr',
	'keygen',
]);
// Their content is text or a template, never page structure.
const RAW = new Set(['script', 'style', 'textarea', 'noscript', 'template', 'iframe']);
const COMPOSITE = new Set([
	'tablist',
	'tree',
	'treegrid',
	'grid',
	'menu',
	'menubar',
	'listbox',
	'radiogroup',
	'toolbar',
	'combobox',
]);
const ROVING = new Set([
	'tab',
	'menuitem',
	'menuitemcheckbox',
	'menuitemradio',
	'option',
	'radio',
	'treeitem',
	'gridcell',
	'row',
]);
// Roles a person expects to reach with Tab when nothing else in the widget manages focus.
const WIDGET = new Set(['button', 'link', 'checkbox', 'switch', 'textbox', 'searchbox', 'combobox', 'slider', 'spinbutton']);
const MOUSE = ['onclick', 'ondblclick', 'onmousedown', 'onmouseup'];
const COVER = /backdrop|overlay|scrim|mask/i;

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', times: '×', hellip: '…', raquo: '»' };

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

// Text a screen reader could voice: no spaces, zero-width marks or private-use icon-font glyphs.
function spoken(text) {
	return decode(text)
		.replace(/[\s\u00a0\u200b-\u200d\u2060\ufeff\u00ad\ue000-\uf8ff]+/g, ' ')
		.trim();
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

function parseAttrs(source) {
	const out = Object.create(null);
	let i = 0;
	const n = source.length;
	while (i < n) {
		while (i < n && /[\s/]/.test(source.charAt(i))) i++;
		let start = i;
		while (i < n && !/[\s=/>]/.test(source.charAt(i))) i++;
		if (i === start) {
			i++;
			continue;
		}
		const name = source.slice(start, i).toLowerCase();
		while (i < n && /\s/.test(source.charAt(i))) i++;
		let value = '';
		if (source.charAt(i) === '=') {
			i++;
			while (i < n && /\s/.test(source.charAt(i))) i++;
			const quote = source.charAt(i);
			if (quote === '"' || quote === "'") {
				const end = source.indexOf(quote, i + 1);
				value = end === -1 ? source.slice(i + 1) : source.slice(i + 1, end);
				i = end === -1 ? n : end + 1;
			} else {
				start = i;
				while (i < n && !/[\s>]/.test(source.charAt(i))) i++;
				value = source.slice(start, i);
			}
		}
		if (!(name in out)) out[name] = value;
	}
	return out;
}

function lowerAttr(el, name) {
	const value = el.attrs[name];
	return value == null ? '' : String(value).trim().toLowerCase();
}

function hidesByStyle(style) {
	return /(^|;)\s*(display\s*:\s*none|visibility\s*:\s*hidden)\b/i.test(style || '');
}

// A light tree: tag, attributes, parent, children, the text written directly inside, and the nearest ancestor (or
// self) that hides it (hiddenBy), makes it inert (inertBy) or aria-hides it (ariaBy).
function parse(html) {
	const source = String(html || '').slice(0, SCAN_LIMIT);
	const lower = source.toLowerCase();
	const root = { tag: '#root', attrs: Object.create(null), parent: null, children: [], text: '', depth: 0 };
	const els = [];
	const ids = new Map();
	const stack = [root];
	let truncated = false;
	let pos = 0;

	function addText(el, raw) {
		if (el.text.length > 400) return;
		const text = spoken(raw);
		if (text) el.text = (el.text ? el.text + ' ' : '') + text.slice(0, 200);
	}

	function make(tag, attrs, parent) {
		const el = { tag, attrs, parent, children: [], text: '', depth: parent.depth + 1, idx: els.length };
		let hiddenBy = parent.hiddenBy || null;
		if (!hiddenBy) {
			const closedDetails = parent.tag === 'details' && !('open' in parent.attrs);
			const firstSummary = tag === 'summary' && !parent.summarySeen;
			if (
				'hidden' in attrs ||
				hidesByStyle(attrs.style) ||
				(tag === 'input' && lowerAttr({ attrs }, 'type') === 'hidden') ||
				(tag === 'dialog' && !('open' in attrs)) ||
				(closedDetails && !firstSummary)
			)
				hiddenBy = el;
		}
		if (tag === 'summary' && parent.tag === 'details') parent.summarySeen = true;
		el.hiddenBy = hiddenBy;
		el.inertBy = parent.inertBy || ('inert' in attrs ? el : null);
		el.ariaBy = parent.ariaBy || (lowerAttr({ attrs }, 'aria-hidden') === 'true' ? el : null);
		els.push(el);
		parent.children.push(el);
		if (attrs.id && !ids.has(attrs.id)) ids.set(attrs.id, el);
		return el;
	}

	while (pos < source.length) {
		const open = source.indexOf('<', pos);
		const top = stack[stack.length - 1];
		if (open === -1) {
			addText(top, source.slice(pos));
			break;
		}
		if (open > pos) addText(top, source.slice(pos, open));
		const next = lower.charAt(open + 1);
		if (next === '!' || next === '?') {
			if (lower.startsWith('<!--', open)) {
				const end = lower.indexOf('-->', open + 4);
				if (end === -1) break;
				pos = end + 3;
			} else {
				const end = source.indexOf('>', open);
				if (end === -1) break;
				pos = end + 1;
			}
			continue;
		}
		if (next === '/') {
			let end = open + 2;
			while (end < lower.length && NAME_CHAR.test(lower.charAt(end))) end++;
			const name = lower.slice(open + 2, end);
			const close = source.indexOf('>', end);
			if (close === -1) break;
			pos = close + 1;
			if (!name) continue;
			for (let i = stack.length - 1, steps = 0; i > 0 && steps < 64; i--, steps++) {
				if (stack[i].tag === name) {
					stack.length = i;
					break;
				}
			}
			continue;
		}
		if (!/[a-z]/.test(next)) {
			addText(top, '<');
			pos = open + 1;
			continue;
		}
		let nameEnd = open + 1;
		while (nameEnd < lower.length && NAME_CHAR.test(lower.charAt(nameEnd))) nameEnd++;
		const tag = lower.slice(open + 1, nameEnd);
		const close = tagEnd(source, open);
		if (close === -1) break;
		pos = close + 1;
		if (els.length >= MAX_ELEMENTS) {
			truncated = true;
			break;
		}
		const el = make(tag, parseAttrs(source.slice(nameEnd, close)), top);
		if (RAW.has(tag)) {
			const end = lower.indexOf('</' + tag, pos);
			if (end === -1) break;
			const done = tagEnd(source, end);
			if (done === -1) break;
			pos = done + 1;
			continue;
		}
		const selfClosing = source.charAt(close - 1) === '/';
		if (!VOID.has(tag) && !selfClosing && stack.length < MAX_DEPTH) stack.push(el);
	}
	return { els, ids, truncated };
}

function tabindexOf(el) {
	const raw = el.attrs.tabindex;
	if (raw == null) return null;
	const match = /^\s*([+-]?\d+)/.exec(raw);
	return match ? parseInt(match[1], 10) : null;
}

function roleOf(el) {
	return lowerAttr(el, 'role').split(/\s+/)[0];
}

function isDisabled(el) {
	return 'disabled' in el.attrs && /^(button|input|select|textarea)$/.test(el.tag);
}

// Focusable by the browser with no tabindex at all.
function isNative(el) {
	switch (el.tag) {
		case 'a':
		case 'area':
			return 'href' in el.attrs;
		case 'button':
		case 'select':
		case 'textarea':
			return true;
		case 'input':
			return lowerAttr(el, 'type') !== 'hidden';
		case 'summary':
			return !!el.parent && el.parent.tag === 'details';
		case 'audio':
		case 'video':
			return 'controls' in el.attrs;
		default:
			return 'contenteditable' in el.attrs && lowerAttr(el, 'contenteditable') !== 'false';
	}
}

// Rendered and not inert, as far as the attributes say.
function isLive(el) {
	return !el.hiddenBy && !el.inertBy;
}

function isTabbable(el) {
	if (!isLive(el) || isDisabled(el)) return false;
	const index = tabindexOf(el);
	return index == null ? isNative(el) : index >= 0;
}

function describe(el) {
	let out = el.tag;
	if (el.attrs.id) out += '#' + el.attrs.id;
	else {
		const first = String(el.attrs.class || '')
			.trim()
			.split(/\s+/)[0];
		if (first) out += '.' + first;
	}
	const role = roleOf(el);
	if (role) out += '[role=' + role + ']';
	return out.replace(/[^\w#.[\]=:-]/g, '').slice(0, 40);
}

function walk(root, visit) {
	const pending = root.children.slice().reverse();
	while (pending.length) {
		const el = pending.pop();
		visit(el);
		for (let i = el.children.length - 1; i >= 0; i--) pending.push(el.children[i]);
	}
}

function isWithin(el, root) {
	for (let cur = el, steps = 0; cur && steps <= MAX_DEPTH; cur = cur.parent, steps++) if (cur === root) return true;
	return false;
}

function inComposite(el) {
	for (let cur = el, steps = 0; cur && steps <= MAX_DEPTH; cur = cur.parent, steps++) {
		if (ROVING.has(roleOf(cur)) || COMPOSITE.has(roleOf(cur)) || 'aria-activedescendant' in cur.attrs) return true;
	}
	return false;
}

// What an element's content gives a screen reader: its text, the alt of images and the title or label of an svg.
function contentName(el, budget) {
	let out = el.text;
	for (let i = 0; i < el.children.length && budget.left > 0; i++) {
		const child = el.children[i];
		budget.left--;
		if ('hidden' in child.attrs || lowerAttr(child, 'aria-hidden') === 'true') continue;
		if (child.tag === 'img') out += ' ' + (child.attrs.alt || '');
		else if (child.tag === 'input') out += ' ' + (child.attrs.alt || '') + ' ' + (child.attrs.value || '');
		else {
			out += ' ' + (child.attrs['aria-label'] || '');
			if (child.tag === 'svg' && child.attrs.title) out += ' ' + child.attrs.title;
			out += ' ' + contentName(child, budget);
		}
	}
	return out;
}

function nameOf(el, ids) {
	if (spoken(el.attrs['aria-label'] || '')) return true;
	if (el.attrs['aria-labelledby']) {
		const refs = String(el.attrs['aria-labelledby']).split(/\s+/).filter(Boolean);
		for (let i = 0; i < refs.length && i < 8; i++) {
			const target = ids.get(refs[i]);
			if (target && spoken(target.text + ' ' + contentName(target, { left: 100 }))) return true;
		}
		return false;
	}
	if (el.tag === 'input') {
		const type = lowerAttr(el, 'type');
		if (type === 'submit' || type === 'reset') return true;
		if (spoken(el.attrs.value || '') || spoken(el.attrs.alt || '')) return true;
		return !!spoken(el.attrs.title || '');
	}
	if (spoken(contentName(el, { left: 200 }))) return true;
	return !!spoken(el.attrs.title || '');
}

const CLOSE_PHRASES = [
	'no thanks',
	'not now',
	'got it',
	'no gracias',
	'ahora no',
	'agora nao',
	'nao obrigado',
	'nein danke',
	'non merci',
	'plus tard',
	'no grazie',
];
const CLOSE_WORDS = new Set([
	'close',
	'dismiss',
	'cancel',
	'ok',
	'okay',
	'done',
	'back',
	'skip',
	'later',
	'accept',
	'reject',
	'decline',
	'agree',
	'deny',
	'cerrar',
	'cancelar',
	'aceptar',
	'rechazar',
	'entendido',
	'listo',
	'volver',
	'omitir',
	'fechar',
	'aceitar',
	'rejeitar',
	'recusar',
	'concordo',
	'voltar',
	'pular',
	'entendi',
	'schliessen',
	'abbrechen',
	'fertig',
	'zuruck',
	'akzeptieren',
	'ablehnen',
	'zustimmen',
	'verstanden',
	'uberspringen',
	'spater',
	'fermer',
	'annuler',
	'terminer',
	'retour',
	'accepter',
	'refuser',
	'compris',
	'passer',
	'chiudi',
	'annulla',
	'fatto',
	'indietro',
	'accetta',
	'rifiuta',
	'capito',
	'salta',
	'dopo',
]);

function closeWords(text) {
	const raw = spoken(text);
	if (/^[×x✕✖⨯]$/i.test(raw)) return true;
	const flat = ' ' + raw.toLowerCase().replace(/ß/g, 'ss').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim() + ' ';
	if (CLOSE_PHRASES.some((phrase) => flat.includes(' ' + phrase + ' '))) return true;
	return flat.split(' ').some((word) => CLOSE_WORDS.has(word));
}

function isCloseControl(el) {
	const a = el.attrs;
	if (a['data-dismiss'] != null || a['data-bs-dismiss'] != null || a['data-close'] != null) return true;
	if (/(^|[\s_-])(close|dismiss|cancel)($|[\s_-])/i.test(String(a.class || '') + ' ' + String(a.id || ''))) return true;
	for (let cur = el.parent, steps = 0; cur && steps <= MAX_DEPTH; cur = cur.parent, steps++)
		if (cur.tag === 'form' && lowerAttr(cur, 'method') === 'dialog') return true;
	const text = (a['aria-label'] || '') + ' ' + (a.title || '') + ' ' + (a.value || '') + ' ' + contentName(el, { left: 100 });
	return closeWords(text);
}

function analyze(html) {
	const { els, ids, truncated } = parse(html);
	const stops = els.filter(isTabbable);
	const report = {
		elements: els.length,
		stops: stops.length,
		positive: { count: 0, values: [], moved: 0 },
		skipped: { count: 0, samples: [], control: false },
		mouseOnly: { count: 0, samples: [] },
		autofocus: { count: 0, samples: [] },
		modal: { count: 0, trapped: 0, noClose: 0, samples: [] },
		// Incomplete traps: aria-modal dialogs whose Tab order still reaches the page behind them.
		trap: { count: 0, leaky: 0, outside: 0, samples: [] },
		inert: { count: 0, wide: 0, dialog: 0, autofocus: 0, samples: [] },
		hidden: { count: 0, samples: [], root: false },
		noname: { count: 0, samples: [] },
		truncated,
	};
	const keep = (list, el) => {
		if (list.length < MAX_SAMPLES) list.push(describe(el));
	};

	// Tab order: tabindex above 0 first, ascending (ties in page order), then the rest in page order.
	const positives = stops.filter((el) => tabindexOf(el) > 0);
	if (positives.length) {
		const ranked = stops.map((el, docIndex) => ({ el, tabIndex: tabindexOf(el), docIndex }));
		const order = focusTrap.orderTabStops(ranked).map((row) => row.el);
		report.positive.count = positives.length;
		report.positive.values = Array.from(new Set(positives.map(tabindexOf)))
			.sort((a, b) => a - b)
			.slice(0, 8);
		report.positive.moved = focusTrap.countMoved(stops, order);
	}

	// A control taken out of the tab order with tabindex="-1" and nothing else offered.
	const tabbableHrefs = new Set();
	const tabbableNames = new Set();
	stops.forEach((el) => {
		if (el.tag === 'a' && el.attrs.href) tabbableHrefs.add(String(el.attrs.href).trim());
		else tabbableNames.add(el.tag + '|' + spoken(contentName(el, { left: 50 })).toLowerCase());
	});
	els.forEach((el) => {
		const index = tabindexOf(el);
		if (index == null || index >= 0 || !isNative(el) || isDisabled(el) || !isLive(el) || el.ariaBy) return;
		if (el.tag === 'summary' || inComposite(el) || lowerAttr(el, 'type') === 'radio') return;
		if (el.tag === 'a' && tabbableHrefs.has(String(el.attrs.href).trim())) return;
		const label = spoken(contentName(el, { left: 50 })).toLowerCase();
		if (label && el.tag !== 'a' && tabbableNames.has(el.tag + '|' + label)) return;
		report.skipped.count++;
		if (el.tag !== 'a') report.skipped.control = true;
		keep(report.skipped.samples, el);
	});

	// Mouse-only controls: a click handler or a widget role on something the keyboard cannot reach.
	const hasTabbableInside = (el) => {
		let found = false;
		walk(el, (child) => {
			if (!found && isTabbable(child)) found = true;
		});
		return found;
	};
	const insideReachable = (el) => {
		for (let cur = el.parent, steps = 0; cur && steps <= MAX_DEPTH; cur = cur.parent, steps++) {
			if (isTabbable(cur) || WIDGET.has(roleOf(cur))) return true;
		}
		return false;
	};
	els.forEach((el) => {
		if (!isLive(el) || el.ariaBy) return;
		if (/^(html|body|head|label|option|form)$/.test(el.tag) || isNative(el)) return;
		if (tabindexOf(el) != null || lowerAttr(el, 'aria-disabled') === 'true') return;
		const handler = MOUSE.some((name) => name in el.attrs);
		const widget = WIDGET.has(roleOf(el));
		if (!handler && !widget) return;
		if (handler && !widget && COVER.test(String(el.attrs.class || '') + ' ' + String(el.attrs.id || ''))) return;
		if (widget && inComposite(el)) return;
		if (hasTabbableInside(el) || insideReachable(el)) return;
		report.mouseOnly.count++;
		keep(report.mouseOnly.samples, el);
	});

	// Autofocus: more than one element asks, so the others never get it.
	els.forEach((el) => {
		if ('autofocus' in el.attrs && isLive(el)) {
			report.autofocus.count++;
			keep(report.autofocus.samples, el);
		}
	});

	// aria-modal dialogs that a keyboard user cannot work or leave.
	els.forEach((el) => {
		if (lowerAttr(el, 'aria-modal') !== 'true') return;
		const inside = [];
		walk(el, (child) => {
			const cut = (by) => by && by !== el && isWithin(by, el);
			if (cut(child.hiddenBy) || cut(child.inertBy)) return;
			if (isDisabled(child)) return;
			const index = tabindexOf(child);
			if (index == null ? isNative(child) : index >= 0) inside.push(child);
		});
		report.modal.count++;
		keep(report.modal.samples, el);
		if (!inside.length) report.modal.trapped++;
		else if (!inside.some(isCloseControl)) report.modal.noClose++;
		// Deep trap check: Tab can still reach the page behind the dialog (incomplete trap).
		const outside = stops.filter((stop) => !isWithin(stop, el));
		const verdict = focusTrap.inspectFocusTrap({
			inside,
			outside,
			hasDismiss: inside.some(isCloseControl),
		});
		if (verdict.leaky && outside.length >= 2) {
			report.trap.count++;
			report.trap.leaky++;
			if (outside.length > report.trap.outside) report.trap.outside = outside.length;
			keep(report.trap.samples, el);
		}
	});

	// inert switched on in the markup in a way that cuts off the page or the dialog meant to be used.
	const liveStops = els.filter((el) => {
		if (el.hiddenBy || isDisabled(el)) return false;
		const index = tabindexOf(el);
		return index == null ? isNative(el) : index >= 0;
	});
	els.forEach((el) => {
		if (!('inert' in el.attrs) || el.hiddenBy || (el.parent && el.parent.inertBy)) return;
		let reason = '';
		if (/^(html|body|main)$/.test(el.tag)) reason = 'wide';
		if (!reason && liveStops.length >= 3) {
			let held = 0;
			liveStops.forEach((stop) => {
				if (isWithin(stop, el)) held++;
			});
			if (held / liveStops.length >= 0.9) reason = 'wide';
		}
		if (!reason) {
			let dialog = false;
			let focus = false;
			walk(el, (child) => {
				if (child.hiddenBy) return;
				if (lowerAttr(child, 'aria-modal') === 'true') dialog = true;
				if ('autofocus' in child.attrs) focus = true;
			});
			reason = dialog ? 'dialog' : focus ? 'autofocus' : '';
		}
		if (!reason) return;
		report.inert.count++;
		report.inert[reason]++;
		keep(report.inert.samples, el);
	});

	// Tab stops the page hides from assistive technology: the control itself, or the whole page.
	els.forEach((el) => {
		if (!el.ariaBy || !isTabbable(el)) return;
		const wide = /^(html|body|main)$/.test(el.ariaBy.tag);
		if (el.ariaBy !== el && !wide) return;
		if (Object.keys(el.attrs).some((name) => /^data-focus/.test(name)) || /sentinel/i.test(el.attrs['data-testid'] || ''))
			return;
		report.hidden.count++;
		if (wide) report.hidden.root = true;
		keep(report.hidden.samples, el);
	});

	// Tab stops with no name: the keyboard lands on them and the screen reader has nothing to say.
	stops.forEach((el) => {
		if (el.ariaBy) return;
		const role = roleOf(el);
		const type = lowerAttr(el, 'type');
		const control =
			(el.tag === 'a' && 'href' in el.attrs) ||
			el.tag === 'button' ||
			el.tag === 'summary' ||
			(el.tag === 'input' && /^(button|image)$/.test(type)) ||
			role === 'button' ||
			role === 'link';
		if (!control || nameOf(el, ids)) return;
		report.noname.count++;
		keep(report.noname.samples, el);
	});

	return report;
}

function findings(report, add) {
	if (!report || !(report.elements >= 10)) return null;
	const raised = [];
	const item = (key, severity, evidence, vars, count) => {
		raised.push(key);
		add('Accessibility', 'risk', severity, key, say(key + '.title'), say(evidence || key + '.evidence', vars), say(key + '.fix'), {
			effort: 'minutes',
			count,
		});
	};
	const p = report.positive;
	if (p.count) {
		item(
			'a11y-focus-order',
			p.moved >= 5 || p.count >= 3 ? 'medium' : 'low',
			null,
			{
				n: p.count,
				values: some(p.values.map(String), 8),
				moved: p.moved,
				total: report.stops,
			},
			p.count
		);
	}
	const s = report.skipped;
	if (s.count)
		item(
			'a11y-focus-skipped',
			s.control ? 'medium' : 'low',
			null,
			{ n: s.count, examples: some(s.samples, 3) },
			s.count
		);
	const m = report.mouseOnly;
	if (m.count) item('a11y-focus-mouse-only', m.count >= 3 ? 'medium' : 'low', null, { n: m.count, examples: some(m.samples, 3) }, m.count);
	const a = report.autofocus;
	if (a.count >= 2) item('a11y-focus-autofocus', 'low', null, { n: a.count, examples: some(a.samples, 3) }, a.count);
	const d = report.modal;
	if (d.trapped || d.noClose) {
		if (d.trapped)
			item('a11y-focus-modal', 'medium', null, { n: d.trapped, total: d.count, examples: some(d.samples, 3) }, d.trapped);
		else
			item(
				'a11y-focus-modal',
				'low',
				'a11y-focus-modal.evidence.noclose',
				{ n: d.noClose, total: d.count, examples: some(d.samples, 3) },
				d.noClose
			);
	}
	const t = report.trap;
	if (t.leaky)
		item(
			'a11y-focus-trap',
			t.leaky >= 2 || t.outside >= 8 ? 'medium' : 'low',
			null,
			{ n: t.leaky, total: d.count, outside: t.outside, examples: some(t.samples, 3) },
			t.leaky
		);
	const i = report.inert;
	if (i.count) {
		const evidence = i.wide
			? 'a11y-focus-inert.evidence.wide'
			: i.dialog
				? 'a11y-focus-inert.evidence.dialog'
				: 'a11y-focus-inert.evidence.autofocus';
		item('a11y-focus-inert', i.wide || i.dialog ? 'medium' : 'low', evidence, { n: i.count, examples: some(i.samples, 3) }, i.count);
	}
	const h = report.hidden;
	if (h.count) item('a11y-focus-hidden', h.root ? 'medium' : 'low', null, { n: h.count, examples: some(h.samples, 3) }, h.count);
	const x = report.noname;
	if (x.count) item('a11y-focus-noname', x.count >= 3 ? 'medium' : 'low', null, { n: x.count, examples: some(x.samples, 3) }, x.count);
	if (!raised.length && report.stops >= 3)
		add(
			'Accessibility',
			'pass',
			'info',
			'a11y-focus',
			say('a11y-focus.pass.title'),
			say('a11y-focus.pass.evidence', { n: report.stops }),
			'',
			{ effort: 'minutes' }
		);
	return report;
}

module.exports = { analyze, findings, parse, isTabbable, tabindexOf, closeWords };
