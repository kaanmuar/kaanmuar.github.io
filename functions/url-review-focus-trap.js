'use strict';

/* Focus-trap and tab-order helpers for URL Review / qa-lab (#3831).
   Clean-room from WCAG 2.2 SC 2.1.1 Keyboard, 2.1.2 No Keyboard Trap, 2.4.3 Focus Order
   and the HTML Standard's tabindex sorting rules. The equal-access family is the idea
   only (go deeper than axe on keyboard order and traps); no upstream code is copied.
   Stops are plain objects so the same helpers work on static HTML parses and on lists
   a browser walk can hand in — see js/qa-live-tab-walk.js for live Tab/focusin attach. No DOM APIs here. */

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

/** How many positions differ between document order and Tab order (same-length lists). */
function countMoved(documentOrder, tabOrder) {
	const a = Array.isArray(documentOrder) ? documentOrder : [];
	const b = Array.isArray(tabOrder) ? tabOrder : [];
	let moved = Math.abs(a.length - b.length);
	const n = Math.min(a.length, b.length);
	for (let i = 0; i < n; i++) if (a[i] !== b[i]) moved++;
	return moved;
}

/** Next index when Tab / Shift+Tab cycles inside a trap of `length` stops. */
function nextTrapIndex(length, index, shiftKey) {
	if (!(length > 0)) return -1;
	const i = ((index % length) + length) % length;
	if (shiftKey) return i === 0 ? length - 1 : i - 1;
	return i === length - 1 ? 0 : i + 1;
}

/**
 * Whether a modal/dialog focus trap looks complete.
 * `inside` / `outside`: tabbable stops (any items); `hasDismiss`: close/cancel control present.
 * - empty: nothing inside to focus (WCAG 2.1.2)
 * - leaky: Tab can leave the dialog because outside stops remain reachable (incomplete trap)
 * - no-dismiss: inside has stops but none look like a close control
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

module.exports = {
	tabIndexOf,
	orderTabStops,
	countMoved,
	nextTrapIndex,
	inspectFocusTrap,
};
