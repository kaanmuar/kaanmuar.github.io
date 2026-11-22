const test = require('node:test');
const assert = require('node:assert/strict');
const live = require('../../js/qa-live-tab-walk.js');
const trap = require('../../functions/url-review-focus-trap');

function memStorage(seed) {
	const map = new Map(Object.entries(seed || {}));
	return {
		getItem: (k) => (map.has(k) ? map.get(k) : null),
		setItem: (k, v) => map.set(k, String(v)),
		removeItem: (k) => map.delete(k),
		_map: map,
	};
}

/** Minimal focusable element for jsdom-like Tab walks (no real layout). */
function el(tag, attrs, text) {
	const store = Object.assign({}, attrs || {});
	const kids = [];
	const node = {
		tagName: String(tag || 'div').toUpperCase(),
		nodeType: 1,
		textContent: text || '',
		disabled: !!store.disabled,
		hidden: store.hidden === true || store.hidden === '',
		inert: !!store.inert,
		tabIndex: store.tabindex != null ? Number(store.tabindex) : -1,
		offsetParent: store._hidden ? null : {},
		_visible: store._hidden ? false : true,
		parentElement: null,
		parentNode: null,
		childNodes: kids,
		attrs: store,
		getAttribute(name) {
			const key = String(name).toLowerCase();
			if (!(key in store)) return null;
			const v = store[key];
			return v === true ? '' : v == null ? null : String(v);
		},
		setAttribute(name, value) {
			store[String(name).toLowerCase()] = String(value);
		},
		contains(other) {
			if (other === node) return true;
			let cur = other;
			while (cur) {
				if (cur === node) return true;
				cur = cur.parentElement || cur.parentNode;
			}
			return false;
		},
		appendChild(child) {
			kids.push(child);
			child.parentElement = node;
			child.parentNode = node;
			return child;
		},
		focus() {
			const doc = node.ownerDocument;
			if (doc) doc.activeElement = node;
		},
		addEventListener() {},
		removeEventListener() {},
		dispatchEvent() {
			return true;
		},
		querySelectorAll(selector) {
			return collect(node, selector);
		},
	};
	if (store.tabindex != null) node.tabIndex = Number(store.tabindex);
	else if (/^(A|BUTTON|INPUT|SELECT|TEXTAREA|SUMMARY)$/.test(node.tagName)) node.tabIndex = 0;
	return node;
}

function matchSel(node, selector) {
	const parts = selector.split(',').map((s) => s.trim());
	return parts.some((sel) => {
		if (sel === '[aria-modal="true"]') return node.getAttribute('aria-modal') === 'true';
		if (sel === '[role="dialog"]') return node.getAttribute('role') === 'dialog';
		if (sel === 'dialog') return node.tagName === 'DIALOG';
		if (sel === 'a[href]') return node.tagName === 'A' && !!node.getAttribute('href');
		if (sel.startsWith('button')) return node.tagName === 'BUTTON' && !node.disabled;
		if (sel.startsWith('input')) {
			if (node.tagName !== 'INPUT' || node.disabled) return false;
			if (sel.includes('[type="hidden"]')) return true;
			return (node.getAttribute('type') || 'text') !== 'hidden';
		}
		if (sel.startsWith('select')) return node.tagName === 'SELECT' && !node.disabled;
		if (sel.startsWith('textarea')) return node.tagName === 'TEXTAREA' && !node.disabled;
		if (sel === 'summary') return node.tagName === 'SUMMARY';
		if (sel.includes('contenteditable')) return node.getAttribute('contenteditable') === 'true';
		if (sel.includes('tabindex')) {
			const t = node.getAttribute('tabindex');
			return t != null && t !== '-1';
		}
		return false;
	});
}

function collect(root, selector) {
	const out = [];
	function walk(n) {
		if (!n || n.nodeType !== 1) return;
		if (matchSel(n, selector)) out.push(n);
		(n.childNodes || []).forEach(walk);
	}
	(root.childNodes || []).forEach(walk);
	if (root.documentElement) walk(root.documentElement);
	return out;
}

function fakeDoc(bodyKids) {
	const listeners = { focusin: [], keydown: [] };
	const body = el('body', {});
	(bodyKids || []).forEach((c) => body.appendChild(c));
	const html = el('html', {});
	html.appendChild(body);
	const doc = {
		nodeType: 9,
		documentElement: html,
		body,
		activeElement: body,
		defaultView: { KeyboardEvent: null },
		ownerDocument: null,
		addEventListener(type, fn, capture) {
			const key = type + (capture ? ':c' : '');
			if (!listeners[key]) listeners[key] = [];
			listeners[key].push(fn);
			if (!listeners[type]) listeners[type] = [];
			listeners[type].push(fn);
		},
		removeEventListener(type, fn, capture) {
			const key = type + (capture ? ':c' : '');
			[key, type].forEach((k) => {
				if (!listeners[k]) return;
				listeners[k] = listeners[k].filter((f) => f !== fn);
			});
		},
		dispatchEvent(event) {
			const list = listeners[event.type + ':c'] || listeners[event.type] || [];
			list.forEach((fn) => fn(event));
			return true;
		},
		querySelectorAll(selector) {
			return collect(html, selector);
		},
		createElement: (tag) => el(tag, {}),
	};
	doc.ownerDocument = doc;
	function stamp(n) {
		n.ownerDocument = doc;
		(n.childNodes || []).forEach(stamp);
	}
	stamp(html);
	doc._emit = (type, target, extra) => {
		const event = Object.assign({ type, target, preventDefault() {}, stopPropagation() {} }, extra || {});
		doc.dispatchEvent(event);
	};
	return doc;
}

test('mirrors focus-trap orderTabStops / nextTrapIndex / inspectFocusTrap', () => {
	const stops = [
		{ id: 'a', tabIndex: null },
		{ id: 'b', tabIndex: 3 },
		{ id: 'c', tabIndex: 0 },
		{ id: 'd', tabIndex: 1 },
	];
	assert.deepEqual(
		live.orderTabStops(stops).map((s) => s.id),
		trap.orderTabStops(stops).map((s) => s.id)
	);
	assert.equal(live.nextTrapIndex(3, 2, false), trap.nextTrapIndex(3, 2, false));
	assert.equal(live.nextTrapIndex(3, 0, true), trap.nextTrapIndex(3, 0, true));
	const verdict = { inside: [1], outside: [2], hasDismiss: true };
	assert.deepEqual(live.inspectFocusTrap(verdict), trap.inspectFocusTrap(verdict));
});

test('flagFromSearch and isEnabled persist tabwalk opt-in', () => {
	assert.equal(live.flagFromSearch('?tabwalk=1'), 'on');
	assert.equal(live.flagFromSearch('?tabwalk=off'), 'off');
	const storage = memStorage();
	assert.equal(live.isEnabled({ search: '?tabwalk=1', storage }), true);
	assert.equal(storage.getItem(live.STORAGE_KEY), '1');
	assert.equal(live.isEnabled({ search: '', storage }), true);
	assert.equal(live.isEnabled({ search: '?tabwalk=0', storage }), false);
	assert.equal(storage.getItem(live.STORAGE_KEY), null);
});

test('collectStops orders positive tabindex then document order', () => {
	const a = el('a', { href: '/a', id: 'a' }, 'A');
	const b = el('button', { id: 'b', tabindex: '2' }, 'B');
	const c = el('input', { id: 'c', type: 'text' });
	const d = el('button', { id: 'd', tabindex: '1' }, 'D');
	const doc = fakeDoc([a, b, c, d]);
	assert.deepEqual(
		live.collectStops(doc).map((s) => s.id),
		['d', 'b', 'a', 'c']
	);
});

test('reportTrap flags leaky aria-modal when page chrome stays reachable', () => {
	const nav = el('a', { href: '/', id: 'home' }, 'Home');
	const price = el('a', { href: '/p', id: 'price' }, 'Pricing');
	const close = el('button', { id: 'close', 'aria-label': 'Close' }, 'Close');
	const email = el('input', { id: 'email', type: 'email', 'aria-label': 'Email' });
	const dialog = el('div', { role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Subscribe' });
	dialog.appendChild(close);
	dialog.appendChild(email);
	const doc = fakeDoc([nav, price, dialog]);
	const verdict = live.reportTrap(dialog, doc);
	assert.equal(verdict.leaky, true);
	assert.ok(verdict.outsideCount >= 2);
	assert.deepEqual(verdict.issues, ['leaky']);
	assert.equal(verdict.hasDismiss, true);
});

test('reportTrap is clean when only dialog stops remain', () => {
	const close = el('button', { id: 'close', 'aria-label': 'Close' }, '×');
	const field = el('input', { id: 'name', type: 'text' });
	const dialog = el('div', { role: 'dialog', 'aria-modal': 'true' });
	dialog.appendChild(close);
	dialog.appendChild(field);
	const doc = fakeDoc([dialog]);
	const verdict = live.reportTrap(dialog, doc);
	assert.equal(verdict.leaky, false);
	assert.deepEqual(verdict.issues, []);
	assert.equal(verdict.canCycle, true);
});

test('predictWalk cycles Tab and Shift+Tab inside ordered stops', () => {
	const stops = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
	const forward = live.predictWalk(stops, { steps: 4, from: 0 });
	assert.deepEqual(
		forward.sequence.map((s) => s.id),
		['a', 'b', 'c', 'a']
	);
	const back = live.predictWalk(stops, { steps: 3, from: 0, shiftKey: true });
	assert.deepEqual(
		back.sequence.map((s) => s.id),
		['a', 'c', 'b']
	);
});

test('walk records sequence and leak list for a leaky dialog', () => {
	const outside = el('a', { href: '/x', id: 'out' }, 'Out');
	const close = el('button', { id: 'close', 'aria-label': 'Close' }, 'Close');
	const field = el('input', { id: 'in', type: 'text' });
	const dialog = el('div', { role: 'dialog', 'aria-modal': 'true', id: 'dlg' });
	dialog.appendChild(close);
	dialog.appendChild(field);
	const doc = fakeDoc([outside, dialog]);
	const result = live.walk(doc, { container: dialog, maxSteps: 3 });
	assert.ok(result.stops.length >= 2);
	assert.ok(result.trap && result.trap.leaky);
	assert.ok(result.leaks.length >= 1);
	assert.ok(['outside-container', 'reachable-outside'].includes(result.leaks[0].reason));
});

test('attach tracks focusin escape from a modal and scan finds leaks', () => {
	const outside = el('a', { href: '/x', id: 'out' }, 'Out');
	const close = el('button', { id: 'close', 'aria-label': 'Close' }, 'Close');
	const dialog = el('div', { role: 'dialog', 'aria-modal': 'true', id: 'dlg' });
	dialog.appendChild(close);
	const doc = fakeDoc([outside, dialog]);
	const seen = [];
	const session = live.attach(doc, {
		onReport: (row) => seen.push(row),
		scan: true,
	});
	assert.ok(session.initial.some((r) => r.type === 'trap' && r.verdict.leaky));
	doc._emit('focusin', close);
	doc._emit('keydown', close, { key: 'Tab', shiftKey: false });
	doc._emit('focusin', outside);
	assert.ok(session.getTrace().some((e) => e.type === 'focusin'));
	assert.ok(session.getTrace().some((e) => e.type === 'tab'));
	assert.ok(session.getReports().some((r) => r.type === 'escape'));
	session.detach();
});
