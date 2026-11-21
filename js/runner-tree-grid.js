/* Runner Tree-Grid (#3832): a filterable, virtualized tree-grid view of the native runner logs in qa-lab.html,
   so a 100-page / 20-framework run (thousands of case and log rows) stays readable and fast.

   Clean-room and dependency-free. The idea (a virtualized tree-grid with filters over a test run) comes from
   cenfun/monocart-reporter (MIT, tool-arsenal wave 1); none of its code is used and it is not a page dependency.

   Opt-in: qa-lab.js loads this file only when the runner drawer is open and the "Tree grid" toggle is on
   (or `?treegrid=1`). No other page loads it.
   Layers (the first three are pure and unit-tested without a DOM):
     buildTree(groups)            groups [{ name, label, running, rows: [{ title, ok }], log: [string] }] -> framework nodes
     filterTree(tree, filter)     filter { framework, status, text } -> pruned tree
     flatten(tree, collapsed, forceOpen) -> visible rows in order; windowRows(opts) -> slice to render
     mount(container, opts)       DOM: toolbar + role="treegrid" viewport that only renders the visible window */
(function (root, factory) {
	const api = factory();
	if (typeof module === 'object' && module.exports) module.exports = api;
	if (root) root.RunnerTreeGrid = api;
})(typeof window !== 'undefined' ? window : globalThis, () => {
	'use strict';

	const STATUSES = ['fail', 'pass', 'run'];
	const STATUS_LABEL = { fail: 'Fail', pass: 'Pass', run: 'Running' };
	const ROW_HEIGHT = 24;

	// Same reading qa-lab.js gives a native log line: fail wins over pass, anything else is still running/info.
	function lineStatus(line) {
		const s = String(line == null ? '' : line);
		if (/fail|error|exit [1-9]/i.test(s)) return 'fail';
		if (/passing|✓|passed/i.test(s)) return 'pass';
		return 'run';
	}

	function rowStatus(row) {
		if (row && row.ok === true) return 'pass';
		if (row && row.ok === false) return 'fail';
		return 'run';
	}

	function foldStatus(counts, running) {
		if (counts.fail) return 'fail';
		if (running) return 'run';
		return counts.pass ? 'pass' : 'run';
	}

	function buildTree(groups) {
		return (Array.isArray(groups) ? groups : []).map((g) => {
			const name = String(g && g.name != null ? g.name : '');
			const children = [];
			const counts = { fail: 0, pass: 0, run: 0 };
			(g && Array.isArray(g.rows) ? g.rows : []).forEach((row, i) => {
				const status = rowStatus(row);
				counts[status] += 1;
				children.push({ id: name + ':case:' + i, kind: 'case', label: String((row && row.title) || ''), status });
			});
			(g && Array.isArray(g.log) ? g.log : []).forEach((line, i) => {
				const status = lineStatus(line);
				counts[status] += 1;
				children.push({ id: name + ':log:' + i, kind: 'log', label: String(line == null ? '' : line), status });
			});
			return {
				id: name,
				kind: 'framework',
				name,
				label: String((g && g.label) || name),
				status: foldStatus(counts, !!(g && g.running)),
				counts,
				children,
			};
		});
	}

	function wanted(set) {
		if (!set) return null;
		const arr = set instanceof Set ? [...set] : Array.isArray(set) ? set : [set];
		const clean = arr.filter((v) => v !== '' && v != null);
		return clean.length ? new Set(clean) : null;
	}

	// filter: { framework: name | [names] | Set, status: 'fail' | [..] | Set, text: string }. Empty means "all".
	function filterTree(tree, filter) {
		const f = filter || {};
		const fw = wanted(f.framework);
		const st = wanted(f.status);
		const text = String(f.text || '').trim().toLowerCase();
		const narrowing = !!(st || text);
		const out = [];
		for (const node of tree) {
			if (fw && !fw.has(node.name)) continue;
			const nameHit = !!text && (node.label.toLowerCase().includes(text) || node.name.toLowerCase().includes(text));
			const children = node.children.filter(
				(c) => (!st || st.has(c.status)) && (!text || nameHit || c.label.toLowerCase().includes(text))
			);
			if (narrowing && !children.length) continue;
			out.push(Object.assign({}, node, { children, total: node.children.length }));
		}
		return out;
	}

	// Visible rows in display order. `collapsed` is a Set of framework ids; `forceOpen` (a filter is active)
	// ignores it so a match is never hidden behind a collapsed parent.
	function flatten(tree, collapsed, forceOpen) {
		const rows = [];
		const shut = collapsed || new Set();
		for (const node of tree) {
			const open = !!forceOpen || !shut.has(node.id);
			rows.push({ id: node.id, depth: 0, node, expandable: node.children.length > 0, open });
			if (!open) continue;
			for (const child of node.children) rows.push({ id: child.id, depth: 1, node: child, expandable: false, open: false });
		}
		return rows;
	}

	// Which slice of `total` rows to render for the scroll position. All values are plain numbers.
	function windowRows(o) {
		const total = Math.max(0, o.total | 0);
		const h = o.rowHeight > 0 ? o.rowHeight : ROW_HEIGHT;
		const view = Math.max(0, o.viewportHeight || 0);
		const over = o.overscan == null ? 6 : Math.max(0, o.overscan | 0);
		const maxTop = Math.max(0, total * h - view);
		const top = Math.min(Math.max(0, o.scrollTop || 0), maxTop);
		const first = Math.floor(top / h);
		const visible = Math.ceil(view / h) + 1;
		const start = Math.max(0, first - over);
		const end = Math.min(total, first + visible + over);
		return { start, end, offsetTop: start * h, totalHeight: total * h };
	}

	function summary(tree) {
		const s = { frameworks: tree.length, rows: 0, fail: 0, pass: 0, run: 0 };
		for (const node of tree) {
			for (const c of node.children) {
				s.rows += 1;
				s[c.status] += 1;
			}
		}
		return s;
	}

	/* ---------- DOM layer ---------- */

	const CSS =
		'.rtg{display:flex;flex-direction:column;min-height:0;flex:1;font:12px ui-monospace,monospace}' +
		'.rtg-bar{display:flex;flex-wrap:wrap;gap:6px;align-items:center;padding:8px 12px;border-bottom:1px solid rgba(127,140,152,.35)}' +
		'.rtg-bar select,.rtg-bar input{font:inherit;padding:3px 6px;min-height:28px;border:1px solid rgba(127,140,152,.5);border-radius:6px;background:transparent;color:inherit}' +
		'.rtg-bar input{flex:1;min-width:120px}' +
		'.rtg-chip{font:inherit;padding:3px 8px;min-height:28px;border:1px solid rgba(127,140,152,.5);border-radius:999px;background:transparent;color:inherit;cursor:pointer}' +
		'.rtg-chip[aria-pressed="true"]{background:var(--cyan,#0d6e76);color:var(--on-cyan,#fff);border-color:var(--cyan,#0d6e76)}' +
		'.rtg-count{margin-left:auto;opacity:.8}' +
		'.rtg-view{position:relative;flex:1;min-height:120px;overflow:auto;outline-offset:-2px}' +
		'.rtg-space{position:relative;width:100%}' +
		'.rtg-row{position:absolute;left:0;right:0;display:flex;gap:6px;align-items:center;padding:0 12px;white-space:nowrap;overflow:hidden;cursor:default}' +
		'.rtg-row.d1{padding-left:34px}' +
		'.rtg-row.fw{font-weight:700;background:rgba(127,140,152,.12);cursor:pointer}' +
		'.rtg-row.focus{outline:2px solid var(--cyan,#0d6e76);outline-offset:-2px}' +
		'.rtg-row .st{width:1.2em;text-align:center}' +
		'.rtg-row.fail .st,.rtg-row.fail .tx{color:var(--red,#c0392b)}' +
		'.rtg-row.pass .st{color:var(--green,#1e8e3e)}' +
		'.rtg-row .tx{overflow:hidden;text-overflow:ellipsis}' +
		'.rtg-row .meta{margin-left:auto;opacity:.75;font-weight:400}' +
		'.rtg-empty{padding:12px;opacity:.8}';

	function injectCss(doc) {
		if (doc.getElementById('rtg-css')) return;
		const style = doc.createElement('style');
		style.id = 'rtg-css';
		style.textContent = CSS;
		doc.head.appendChild(style);
	}

	function el(doc, tag, attrs, text) {
		const n = doc.createElement(tag);
		for (const k of Object.keys(attrs || {})) n.setAttribute(k, attrs[k]);
		if (text != null) n.textContent = text;
		return n;
	}

	const MARK = { fail: '✗', pass: '✓', run: '·' };

	// opts: { groups, rowHeight, overscan, onState }. Returns { update(groups), state(), destroy() }.
	// All text goes in through textContent, never innerHTML, so log lines cannot inject markup.
	function mount(container, opts) {
		const doc = container.ownerDocument;
		const o = opts || {};
		const rowH = o.rowHeight > 0 ? o.rowHeight : ROW_HEIGHT;
		injectCss(doc);
		const st = Object.assign({ framework: '', status: new Set(), text: '' }, o.state || {});
		st.status = new Set(st.status || []);
		const collapsed = new Set();
		let tree = buildTree(o.groups);
		let rows = [];
		let focus = 0;

		container.textContent = '';
		const wrap = el(doc, 'div', { class: 'rtg' });
		const bar = el(doc, 'div', { class: 'rtg-bar', role: 'search' });
		const fwSel = el(doc, 'select', { 'aria-label': 'Filter by framework' });
		const txt = el(doc, 'input', { type: 'search', placeholder: 'Filter text', 'aria-label': 'Filter rows by text' });
		txt.value = st.text;
		const chips = STATUSES.map((s) => {
			const b = el(doc, 'button', { type: 'button', class: 'rtg-chip', 'data-status': s, 'aria-pressed': 'false' }, STATUS_LABEL[s]);
			b.addEventListener('click', () => {
				if (st.status.has(s)) st.status.delete(s);
				else st.status.add(s);
				focus = 0;
				view.scrollTop = 0;
				render();
			});
			return b;
		});
		const count = el(doc, 'span', { class: 'rtg-count', 'aria-live': 'polite' });
		const view = el(doc, 'div', { class: 'rtg-view', role: 'treegrid', tabindex: '0', 'aria-label': 'Runner results' });
		const space = el(doc, 'div', { class: 'rtg-space' });
		view.appendChild(space);
		bar.append(fwSel, ...chips, txt, count);
		wrap.append(bar, view);
		container.appendChild(wrap);

		function fillFrameworks() {
			const keep = st.framework;
			fwSel.textContent = '';
			fwSel.appendChild(el(doc, 'option', { value: '' }, 'All frameworks'));
			for (const node of tree) fwSel.appendChild(el(doc, 'option', { value: node.name }, node.label));
			if (tree.some((n) => n.name === keep)) fwSel.value = keep;
			else {
				st.framework = '';
				fwSel.value = '';
			}
		}

		function filtered() {
			return filterTree(tree, { framework: st.framework, status: st.status, text: st.text });
		}

		function paint() {
			const w = windowRows({ total: rows.length, rowHeight: rowH, viewportHeight: view.clientHeight || 360, scrollTop: view.scrollTop, overscan: o.overscan });
			space.style.height = w.totalHeight + 'px';
			space.textContent = '';
			if (!rows.length) {
				space.style.height = 'auto';
				space.appendChild(el(doc, 'div', { class: 'rtg-empty' }, 'No rows match this filter.'));
				return;
			}
			for (let i = w.start; i < w.end; i++) {
				const r = rows[i];
				const n = r.node;
				const isFw = r.depth === 0;
				const row = el(doc, 'div', {
					class: 'rtg-row ' + (isFw ? 'fw ' : 'd1 ') + n.status + (i === focus ? ' focus' : ''),
					role: 'row',
					'aria-level': String(r.depth + 1),
					'aria-rowindex': String(i + 1),
					'data-id': r.id,
					'data-kind': n.kind,
				});
				row.style.top = i * rowH + 'px';
				row.style.height = rowH + 'px';
				if (isFw && r.expandable) row.setAttribute('aria-expanded', r.open ? 'true' : 'false');
				const cell = el(doc, 'div', { role: 'gridcell', style: 'display:contents' });
				cell.appendChild(el(doc, 'span', { class: 'st', 'aria-hidden': 'true' }, isFw ? (r.open ? '▾' : '▸') : MARK[n.status]));
				cell.appendChild(el(doc, 'span', { class: 'tx', title: n.label }, n.label));
				if (isFw) {
					const c = n.counts;
					const shown = n.children.length === n.total ? '' : n.children.length + ' of ';
					cell.appendChild(el(doc, 'span', { class: 'meta' }, shown + n.total + ' rows' + (c.fail ? ' · ' + c.fail + ' fail' : '')));
				}
				row.appendChild(cell);
				row.addEventListener('click', () => {
					focus = i;
					if (isFw) toggle(n.id);
					else paint();
				});
				space.appendChild(row);
			}
		}

		function toggle(id) {
			if (collapsed.has(id)) collapsed.delete(id);
			else collapsed.add(id);
			render();
		}

		function render() {
			const vis = filtered();
			const narrowing = !!(st.status.size || st.text.trim());
			rows = flatten(vis, collapsed, narrowing);
			if (focus >= rows.length) focus = Math.max(0, rows.length - 1);
			chips.forEach((b) => b.setAttribute('aria-pressed', st.status.has(b.dataset.status) ? 'true' : 'false'));
			const s = summary(vis);
			count.textContent = s.rows + ' rows · ' + s.frameworks + ' frameworks' + (s.fail ? ' · ' + s.fail + ' fail' : '');
			paint();
			if (typeof o.onState === 'function') o.onState({ framework: st.framework, status: [...st.status], text: st.text });
		}

		function reveal(i) {
			const top = i * rowH;
			const h = view.clientHeight || 360;
			if (top < view.scrollTop) view.scrollTop = top;
			else if (top + rowH > view.scrollTop + h) view.scrollTop = top + rowH - h;
		}

		fwSel.addEventListener('change', () => {
			st.framework = fwSel.value;
			focus = 0;
			view.scrollTop = 0;
			render();
		});
		txt.addEventListener('input', () => {
			st.text = txt.value;
			focus = 0;
			view.scrollTop = 0;
			render();
		});
		view.addEventListener('scroll', paint, { passive: true });
		view.addEventListener('keydown', (e) => {
			if (!rows.length) return;
			const r = rows[focus];
			let next = focus;
			if (e.key === 'ArrowDown') next = Math.min(rows.length - 1, focus + 1);
			else if (e.key === 'ArrowUp') next = Math.max(0, focus - 1);
			else if (e.key === 'Home') next = 0;
			else if (e.key === 'End') next = rows.length - 1;
			else if (e.key === 'PageDown') next = Math.min(rows.length - 1, focus + Math.max(1, Math.floor((view.clientHeight || 360) / rowH) - 1));
			else if (e.key === 'PageUp') next = Math.max(0, focus - Math.max(1, Math.floor((view.clientHeight || 360) / rowH) - 1));
			else if (e.key === 'ArrowRight' && r.depth === 0 && !r.open) {
				toggle(r.id);
				e.preventDefault();
				return;
			} else if (e.key === 'ArrowLeft' && r.depth === 0 && r.open && !(st.status.size || st.text.trim())) {
				toggle(r.id);
				e.preventDefault();
				return;
			} else return;
			e.preventDefault();
			focus = next;
			reveal(next);
			paint();
		});

		fillFrameworks();
		render();

		return {
			// Live logs stream in: swap the data, keep filter, collapse state, focus and scroll.
			update(groups) {
				tree = buildTree(groups);
				fillFrameworks();
				render();
			},
			state() {
				return { framework: st.framework, status: [...st.status], text: st.text };
			},
			destroy() {
				container.textContent = '';
			},
		};
	}

	return { lineStatus, rowStatus, buildTree, filterTree, flatten, windowRows, summary, mount, ROW_HEIGHT };
});
