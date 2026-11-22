/* Live Tab-walk attach for qa-lab / qa-review (#3831).
   Walks real (or stub) tab stops with Tab keydown simulation and/or focusin
   tracking, then reports focus-trap leaks — the browser half of equal-access
   deep keyboard checks. Static HTML already uses functions/url-review-focus-trap.js;
   this file mirrors those helpers for the live DOM (orderTabStops / nextTrapIndex /
   inspectFocusTrap semantics; no upstream equal-access code).

   Opt-in: ?tabwalk=1 (persists qa-tabwalk=1) or console:
       QaLiveTabWalk.attach(document)
       QaLiveTabWalk.walk(document, { container })
       QaLiveTabWalk.reportTrap(dialog)
*/
(function (root, factory) {
	const api = factory();
	if (typeof module === 'object' && module.exports) module.exports = api;
	if (root) root.QaLiveTabWalk = api;
})(typeof window !== 'undefined' ? window : globalThis, () => {
	'use strict';

	const STORAGE_KEY = 'qa-tabwalk';
	const TABBABLE =
		'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), ' +
		'select:not([disabled]), textarea:not([disabled]), summary, [contenteditable="true"], ' +
		'[tabindex]:not([tabindex="-1"])';
	const MAX_STEPS_DEFAULT = 64;

	function tabIndexOf(value) {
		if (value == null || value === '') return null;
		const n = Number.parseInt(String(value).trim(), 10);
		return Number.isFinite(n) ? n : null;
	}

	/** Tab order for abstract stops: positive tabindex ascending, then the rest in document order. */
	function orderTabStops(stops) {
		const list = Array.isArray(stops) ? stops : [];
		const positives = list
			.map((stop, i) => ({ stop, i, tab: tabIndexOf(stop && stop.tabIndex) }))
			.filter((row) => row.tab != null && row.tab > 0)
			.sort((a, b) => a.tab - b.tab || a.i - b.i)
			.map((row) => row.stop);
		const rest = list.filter((stop) => {
			const tab = tabIndexOf(stop && stop.tabIndex);
			return !(tab != null && tab > 0);
		});
		return positives.concat(rest);
	}

	/** Next index when Tab / Shift+Tab cycles inside a trap of `length` stops. */
	function nextTrapIndex(length, index, shiftKey) {
		if (!(length > 0)) return -1;
		const i = ((index % length) + length) % length;
		if (shiftKey) return i === 0 ? length - 1 : i - 1;
		return i === length - 1 ? 0 : i + 1;
	}

	/**
	 * Whether a modal/dialog focus trap looks complete (same verdict shape as
	 * functions/url-review-focus-trap.js inspectFocusTrap).
	 */
	function inspectFocusTrap({ inside, outside, hasDismiss } = {}) {
		const inStops = Array.isArray(inside) ? inside : [];
		const outStops = Array.isArray(outside) ? outside : [];
		const issues = [];
		if (!inStops.length) issues.push('empty');
		else if (outStops.length) issues.push('leaky');
		if (inStops.length && !hasDismiss) issues.push('no-dismiss');
		return {
			insideCount: inStops.length,
			outsideCount: outStops.length,
			empty: !inStops.length,
			leaky: inStops.length > 0 && outStops.length > 0,
			canCycle: inStops.length > 0,
			hasDismiss: !!hasDismiss,
			issues,
		};
	}

	function flagFromSearch(search) {
		const q = new URLSearchParams(search || '').get('tabwalk');
		if (q === '1' || q === 'true' || q === 'on') return 'on';
		if (q === '0' || q === 'false' || q === 'off') return 'off';
		return '';
	}

	function isEnabled(opts) {
		const o = opts || {};
		const search = o.search != null ? o.search : typeof location !== 'undefined' ? location.search : '';
		const storage = o.storage !== undefined ? o.storage : typeof localStorage !== 'undefined' ? localStorage : null;
		const flag = flagFromSearch(search);
		if (flag === 'on') {
			try {
				if (storage) storage.setItem(STORAGE_KEY, '1');
			} catch (_) {
				/* private mode */
			}
			return true;
		}
		if (flag === 'off') {
			try {
				if (storage) storage.removeItem(STORAGE_KEY);
			} catch (_) {
				/* private mode */
			}
			return false;
		}
		try {
			return !!(storage && storage.getItem(STORAGE_KEY) === '1');
		} catch (_) {
			return false;
		}
	}

	function attr(el, name) {
		if (!el) return '';
		if (typeof el.getAttribute === 'function') {
			const v = el.getAttribute(name);
			return v == null ? '' : String(v);
		}
		const store = el.attrs || el.attributes;
		if (store && store[name] != null) return String(store[name]);
		return '';
	}

	function isHidden(el) {
		if (!el) return true;
		if (el.hidden) return true;
		if (attr(el, 'hidden') !== '' && attr(el, 'hidden') !== 'false') return true;
		if (attr(el, 'aria-hidden') === 'true') return true;
		if (el.inert) return true;
		let node = el;
		while (node) {
			if (node.inert || attr(node, 'aria-hidden') === 'true') return true;
			node = node.parentElement || node.parentNode;
			if (node && node.nodeType === 9) break;
		}
		return false;
	}

	function isShown(el) {
		if (!el || isHidden(el)) return false;
		if (el._visible === false) return false;
		if (el._visible === true) return true;
		if (typeof el.offsetParent !== 'undefined') {
			if (el.offsetParent !== null) return true;
			const tag = String(el.tagName || '').toLowerCase();
			return tag === 'body' || tag === 'html';
		}
		return true;
	}

	function readTabIndex(el) {
		const raw = attr(el, 'tabindex');
		if (raw !== '') return tabIndexOf(raw);
		if (typeof el.tabIndex === 'number' && el.tabIndex >= 0) return el.tabIndex;
		return null;
	}

	function isNativeTabbable(el) {
		const tag = String(el.tagName || '').toLowerCase();
		if (tag === 'a') return !!attr(el, 'href');
		if (tag === 'button' || tag === 'select' || tag === 'textarea' || tag === 'summary') return true;
		if (tag === 'input') {
			const type = (attr(el, 'type') || 'text').toLowerCase();
			return type !== 'hidden';
		}
		if (attr(el, 'contenteditable') === 'true') return true;
		return false;
	}

	function isDisabled(el) {
		if (!el) return true;
		if (el.disabled) return true;
		const d = attr(el, 'disabled');
		return d !== '' && d !== 'false';
	}

	function stopId(el, i) {
		return attr(el, 'id') || attr(el, 'data-testid') || attr(el, 'name') || attr(el, 'aria-label') || '#' + i;
	}

	function toStop(el, i) {
		const tab = readTabIndex(el);
		return {
			el,
			tabIndex: tab == null ? (isNativeTabbable(el) ? 0 : null) : tab,
			id: stopId(el, i),
			docIndex: i,
		};
	}

	function queryAll(root, selector) {
		if (!root) return [];
		if (typeof root.querySelectorAll === 'function') {
			try {
				return Array.prototype.slice.call(root.querySelectorAll(selector));
			} catch (_) {
				return [];
			}
		}
		return [];
	}

	/** Collect ordered tab stops under `root` (document or element). */
	function collectStops(root) {
		const scope = root && root.documentElement ? root.documentElement : root;
		const doc = root && root.nodeType === 9 ? root : root && root.ownerDocument;
		const nodes = queryAll(scope || doc, TABBABLE);
		const raw = [];
		nodes.forEach((el, i) => {
			if (isDisabled(el) || !isShown(el)) return;
			const tab = readTabIndex(el);
			if (tab != null && tab < 0) return;
			if (tab == null && !isNativeTabbable(el)) return;
			raw.push(toStop(el, i));
		});
		return orderTabStops(raw);
	}

	function looksLikeDismiss(stop) {
		const el = stop && stop.el;
		if (!el) return false;
		const label = (
			attr(el, 'aria-label') +
			' ' +
			attr(el, 'title') +
			' ' +
			(el.textContent || '') +
			' ' +
			attr(el, 'class') +
			' ' +
			attr(el, 'id')
		).toLowerCase();
		return /\b(close|dismiss|cancel|cerrar|fechar|fermer|chiudi|schließen)\b/.test(label);
	}

	function findModals(root) {
		const scope = root && root.documentElement ? root : root;
		const nodes = queryAll(scope, '[aria-modal="true"], [role="dialog"], dialog');
		return nodes.filter((el) => attr(el, 'aria-modal') === 'true' || String(el.tagName || '').toLowerCase() === 'dialog' || attr(el, 'role') === 'dialog');
	}

	/** Static trap verdict from live tabbables (mirrors url-review-focus-order deep check). */
	function reportTrap(container, root) {
		if (!container) {
			return inspectFocusTrap({ inside: [], outside: [], hasDismiss: false });
		}
		const scope = root || container.ownerDocument || container;
		const all = collectStops(scope);
		const inside = all.filter((s) => container === s.el || (typeof container.contains === 'function' && container.contains(s.el)));
		const outside = all.filter((s) => inside.indexOf(s) === -1);
		return Object.assign(
			inspectFocusTrap({
				inside,
				outside,
				hasDismiss: inside.some(looksLikeDismiss),
			}),
			{ inside, outside, container }
		);
	}

	/** Predicted Tab cycle from ordered stops (no DOM focus required). */
	function predictWalk(stops, opts) {
		const list = Array.isArray(stops) ? stops : [];
		const o = opts || {};
		const steps = Math.min(Math.max(0, o.steps == null ? list.length : o.steps), MAX_STEPS_DEFAULT * 2);
		const shiftKey = !!o.shiftKey;
		let index = o.from == null ? 0 : o.from;
		if (index < 0 || index >= list.length) index = 0;
		const sequence = [];
		if (!list.length) return { sequence, leaks: [], cycled: false };
		for (let n = 0; n < steps; n++) {
			sequence.push({ index, id: list[index].id, stop: list[index] });
			index = nextTrapIndex(list.length, index, shiftKey);
		}
		const cycled = sequence.length > 1 && sequence[sequence.length - 1].index === (o.from == null ? 0 : o.from);
		return { sequence, leaks: [], cycled };
	}

	function makeTabEvent(doc, shiftKey) {
		const Win = (doc && doc.defaultView) || (typeof window !== 'undefined' ? window : null);
		const KE = (Win && Win.KeyboardEvent) || (typeof KeyboardEvent !== 'undefined' ? KeyboardEvent : null);
		if (KE) {
			try {
				return new KE('keydown', { key: 'Tab', code: 'Tab', keyCode: 9, which: 9, bubbles: true, cancelable: true, shiftKey: !!shiftKey });
			} catch (_) {
				/* fall through */
			}
		}
		return { type: 'keydown', key: 'Tab', code: 'Tab', keyCode: 9, which: 9, bubbles: true, cancelable: true, shiftKey: !!shiftKey, preventDefault() {}, stopPropagation() {} };
	}

	/**
	 * Live walk: focus first stop (or activeElement), dispatch Tab, record where
	 * focus lands. When `container` is set, any stop outside it is a leak.
	 */
	function walk(root, opts) {
		const o = opts || {};
		const doc = root && root.nodeType === 9 ? root : (root && root.ownerDocument) || root;
		const container = o.container || null;
		const shiftKey = !!o.shiftKey;
		const maxSteps = Math.min(Math.max(1, o.maxSteps || MAX_STEPS_DEFAULT), MAX_STEPS_DEFAULT * 2);
		const stops = collectStops(container || root || doc);
		const all = collectStops(doc);
		const sequence = [];
		const leaks = [];

		if (!stops.length) {
			return { sequence, leaks, stops, trap: container ? reportTrap(container, doc) : null };
		}

		let current = o.start || (doc && doc.activeElement) || stops[0].el;
		if (typeof current.focus === 'function') {
			try {
				current.focus();
			} catch (_) {
				/* stub may no-op */
			}
		}
		if (doc) doc.activeElement = current;

		for (let step = 0; step < maxSteps; step++) {
			const active = (doc && doc.activeElement) || current;
			const hit = all.find((s) => s.el === active) || stops.find((s) => s.el === active) || { el: active, id: stopId(active, step), tabIndex: readTabIndex(active) };
			sequence.push({ step, id: hit.id, el: active });
			if (container && active && typeof container.contains === 'function' && !container.contains(active) && active !== container) {
				leaks.push({ step, id: hit.id, el: active, reason: 'outside-container' });
			}

			const idx = stops.findIndex((s) => s.el === active);
			const nextIdx = nextTrapIndex(stops.length, idx >= 0 ? idx : 0, shiftKey);
			const next = stops[nextIdx];
			if (!next) break;

			const target = container || doc || root;
			const ev = makeTabEvent(doc, shiftKey);
			if (target && typeof target.dispatchEvent === 'function') {
				try {
					target.dispatchEvent(ev);
				} catch (_) {
					/* stubs may ignore */
				}
			}

			if (o.advance !== false) {
				current = next.el;
				if (typeof current.focus === 'function') {
					try {
						current.focus();
					} catch (_) {
						/* ignore */
					}
				}
				if (doc) doc.activeElement = current;
			} else if (doc && doc.activeElement) {
				current = doc.activeElement;
			}

			if (step > 0 && sequence[0].el === current && !leaks.length) break;
		}

		const trap = container ? reportTrap(container, doc) : null;
		if (trap && trap.leaky && !leaks.length) {
			(trap.outside || []).slice(0, 8).forEach((s, i) => {
				leaks.push({ step: -1, id: s.id, el: s.el, reason: 'reachable-outside', index: i });
			});
		}
		return { sequence, leaks, stops, trap };
	}

	/**
	 * Attach live observers: focusin trace + Tab keydown. Reports trap leaks for
	 * aria-modal / dialog containers when focus escapes or outside stops remain.
	 * Returns { detach, getTrace, scan }.
	 */
	function attach(doc, opts) {
		const o = opts || {};
		const documentRef = doc || (typeof document !== 'undefined' ? document : null);
		if (!documentRef) throw new Error('QaLiveTabWalk.attach needs a document');
		const trace = [];
		const reports = [];
		const maxEvents = Math.min(Math.max(1, o.maxEvents || 200), 500);
		const onReport = typeof o.onReport === 'function' ? o.onReport : null;

		function containers() {
			if (o.containers && o.containers.length) return o.containers;
			return findModals(documentRef);
		}

		function scan() {
			const found = [];
			containers().forEach((modal) => {
				const verdict = reportTrap(modal, documentRef);
				if (verdict.leaky || verdict.empty || verdict.issues.indexOf('no-dismiss') >= 0) {
					const row = { type: 'trap', container: modal, verdict };
					found.push(row);
					reports.push(row);
					if (onReport) onReport(row);
				}
			});
			return found;
		}

		function onFocusIn(event) {
			if (trace.length >= maxEvents) return;
			const target = event && event.target;
			trace.push({ type: 'focusin', id: stopId(target, trace.length), el: target, t: Date.now() });
			containers().forEach((modal) => {
				if (!modal || typeof modal.contains !== 'function') return;
				const inside = modal.contains(target) || modal === target;
				if (inside) return;
				// Leak only when focus previously sat inside this modal (skip Tab key rows).
				let prior = null;
				for (let i = trace.length - 2; i >= 0; i--) {
					if (trace[i].type === 'focusin' && trace[i].el) {
						prior = trace[i];
						break;
					}
				}
				if (prior && prior.el && (modal.contains(prior.el) || modal === prior.el)) {
					const row = {
						type: 'escape',
						container: modal,
						from: prior.el,
						to: target,
						verdict: reportTrap(modal, documentRef),
					};
					reports.push(row);
					if (onReport) onReport(row);
				}
			});
		}

		function onKeyDown(event) {
			if (!event || event.key !== 'Tab') return;
			if (trace.length >= maxEvents) return;
			trace.push({ type: 'tab', shiftKey: !!event.shiftKey, t: Date.now() });
		}

		if (typeof documentRef.addEventListener === 'function') {
			documentRef.addEventListener('focusin', onFocusIn, true);
			documentRef.addEventListener('keydown', onKeyDown, true);
		}

		const initial = o.scan !== false ? scan() : [];

		return {
			detach() {
				if (typeof documentRef.removeEventListener === 'function') {
					documentRef.removeEventListener('focusin', onFocusIn, true);
					documentRef.removeEventListener('keydown', onKeyDown, true);
				}
			},
			getTrace() {
				return trace.slice();
			},
			getReports() {
				return reports.slice();
			},
			scan,
			initial,
		};
	}

	/** Boot opt-in attach when ?tabwalk=1 / localStorage is set. */
	function boot(opts) {
		const o = opts || {};
		if (!isEnabled(o)) return null;
		const doc = o.document || (typeof document !== 'undefined' ? document : null);
		if (!doc) return null;
		const session = attach(doc, o);
		if (root) root.__qaLiveTabWalk = session;
		return session;
	}

	if (typeof document !== 'undefined') {
		const start = () => {
			try {
				boot();
			} catch (_) {
				/* ignore */
			}
		};
		if (document.readyState === 'loading' && typeof document.addEventListener === 'function') {
			document.addEventListener('DOMContentLoaded', start);
		} else {
			start();
		}
	}

	return {
		STORAGE_KEY,
		TABBABLE,
		tabIndexOf,
		orderTabStops,
		nextTrapIndex,
		inspectFocusTrap,
		flagFromSearch,
		isEnabled,
		collectStops,
		reportTrap,
		predictWalk,
		walk,
		attach,
		boot,
		findModals,
	};
});
