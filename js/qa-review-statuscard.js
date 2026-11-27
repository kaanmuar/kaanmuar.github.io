/* StatusCard glass chrome for unpaid/preview fold heads (#4430 / #4422).
   Collapsed: 2 rings + 2 bars. Expanded: 3rd bar + extra rings/icons + ≤3 lines. */
(function () {
	'use strict';

	const COLOR = {
		fail: '#ff5a4a',
		risk: '#f0c85a',
		pass: '#5dff9a',
		cyan: '#5ec8d4',
	};

	function clamp(n) {
		return Math.max(0, Math.min(100, Math.round(Number(n) || 0)));
	}

	function ringEl(pct, color, label) {
		const el = document.createElement('div');
		el.className = 'scard-ring';
		el.style.setProperty('--pct', String(clamp(pct)));
		el.style.setProperty('--ring', color || COLOR.cyan);
		const b = document.createElement('b');
		b.textContent = label != null ? String(label) : String(clamp(pct));
		el.appendChild(b);
		return el;
	}

	function barEl(label, value, pct, color, extraClass) {
		const row = document.createElement('div');
		row.className = 'scard-bar' + (extraClass ? ' ' + extraClass : '');
		const lab = document.createElement('div');
		lab.className = 'scard-lab';
		lab.innerHTML = '<span></span><span></span>';
		lab.children[0].textContent = label;
		lab.children[1].textContent = String(value);
		const track = document.createElement('div');
		track.className = 'scard-track';
		const fill = document.createElement('i');
		fill.style.setProperty('--w', clamp(pct) + '%');
		fill.style.setProperty('--bar', color || COLOR.cyan);
		track.appendChild(fill);
		row.append(lab, track);
		return row;
	}

	function countsFromPanel(panel) {
		const findings = panel ? panel.querySelectorAll('.finding, details.finding, [data-severity]') : [];
		let fail = 0;
		let risk = 0;
		let pass = 0;
		const lines = [];
		const tags = new Map();
		findings.forEach((node) => {
			const sev = (node.getAttribute('data-severity') || node.dataset.severity || '').toLowerCase();
			const title =
				(node.querySelector('summary, .finding-title, h3, h4, strong') || {}).textContent ||
				node.getAttribute('data-key') ||
				'';
			const t = String(title).trim().replace(/\s+/g, ' ');
			if (sev === 'critical' || sev === 'high' || sev === 'fail') {
				fail += 1;
				if (t && lines.length < 3) lines.push(t.slice(0, 90));
				if (t) tags.set(t.split(/\s+/)[0].toLowerCase().slice(0, 12), 'bad');
			} else if (sev === 'medium' || sev === 'risk' || sev === 'low') {
				risk += 1;
				if (t && lines.length < 3) lines.push(t.slice(0, 90));
				if (t) tags.set(t.split(/\s+/)[0].toLowerCase().slice(0, 12), 'warn');
			} else if (sev === 'info' || sev === 'pass' || sev === 'ok') {
				pass += 1;
			} else {
				risk += 1;
			}
		});
		const locked = panel ? panel.querySelectorAll('.fade-line, [data-frost], .frost').length : 0;
		return { fail, risk, pass, lines, tags, locked, total: fail + risk + pass };
	}

	function scoreForHeading(heading, report) {
		const areas = (report && report.insights && report.insights.score && report.insights.score.areas) || {};
		const text = (heading.textContent || '').toLowerCase();
		const keys = Object.keys(areas);
		for (let i = 0; i < keys.length; i++) {
			const key = keys[i];
			if (text.indexOf(String(key).toLowerCase()) !== -1) {
				const a = areas[key];
				return typeof a === 'number' ? a : a && a.score != null ? a.score : null;
			}
		}
		const overall = report && report.insights && report.insights.score && report.insights.score.overall;
		return overall != null ? overall : null;
	}

	function clearCard(button) {
		button.querySelectorAll('.scard-body, .scard-extra, .scard-icons, .scard-lines, .scard-lock').forEach((n) => n.remove());
		const head = button.closest('.fold-head, h2, .alarm-head');
		if (head) head.classList.remove('scard-fold');
	}

	function paintButton(item, report, unpaid) {
		const button = item.button;
		const panel = item.panel;
		clearCard(button);
		if (!unpaid) {
			if (panel) panel.removeAttribute('data-scard-frost');
			return;
		}
		const head = button.closest('.fold-head, h2, .alarm-head') || button.parentElement;
		if (head) head.classList.add('scard-fold');

		const c = countsFromPanel(panel);
		const score = scoreForHeading(head, report);
		const health = score != null ? clamp(score) : clamp(100 - c.fail * 12 - c.risk * 6);
		const pressure = clamp(c.fail * 18 + c.risk * 10);

		const body = document.createElement('div');
		body.className = 'scard-body';
		const rings = document.createElement('div');
		rings.className = 'scard-rings';
		rings.append(ringEl(health, health < 60 ? COLOR.fail : health < 80 ? COLOR.risk : COLOR.pass, health));
		rings.append(ringEl(pressure || 8, c.fail ? COLOR.fail : COLOR.risk, c.fail || c.risk || '·'));

		const bars = document.createElement('div');
		bars.className = 'scard-bars';
		const failMax = Math.max(1, c.fail + c.risk + c.pass);
		bars.append(barEl('Fails', c.fail, (c.fail / failMax) * 100, COLOR.fail));
		bars.append(barEl('Risks', c.risk, (c.risk / failMax) * 100, COLOR.risk));
		bars.append(barEl('Pass', c.pass, (c.pass / failMax) * 100, COLOR.pass, 'scard-bar3'));
		body.append(rings, bars);

		const lock = document.createElement('span');
		lock.className = 'scard-lock';
		lock.textContent = c.total ? '🔒 ' + c.total : '🔒';
		const titleRow = button.querySelector('span');
		if (titleRow && !titleRow.querySelector('.scard-lock')) titleRow.appendChild(lock);

		const extra = document.createElement('div');
		extra.className = 'scard-extra';
		extra.append(
			ringEl(c.fail ? 20 : 80, c.fail ? COLOR.fail : COLOR.pass, 'Fail'),
			ringEl(c.risk ? 40 : 80, c.risk ? COLOR.risk : COLOR.pass, 'Risk'),
			ringEl(c.pass ? 70 : 30, COLOR.cyan, 'OK')
		);

		const icons = document.createElement('div');
		icons.className = 'scard-icons';
		let n = 0;
		c.tags.forEach((kind, name) => {
			if (n >= 5) return;
			const span = document.createElement('span');
			span.className = kind;
			span.textContent = name;
			icons.appendChild(span);
			n += 1;
		});
		if (!n) {
			['fail', 'risk', 'pass'].forEach((name, i) => {
				const span = document.createElement('span');
				span.className = i === 0 ? 'bad' : i === 1 ? 'warn' : 'ok';
				span.textContent = name;
				icons.appendChild(span);
			});
		}

		const lines = document.createElement('div');
		lines.className = 'scard-lines';
		(c.lines.length ? c.lines : ['Open this section for the lab notes.', 'Unlock to print, share, and export.', 'Top finding stays clear above.'])
			.slice(0, 3)
			.forEach((line) => {
				const p = document.createElement('div');
				p.textContent = line;
				lines.appendChild(p);
			});

		button.append(body, extra, icons, lines);
		if (panel) panel.setAttribute('data-scard-frost', '1');
	}

	function sync(opts) {
		opts = opts || {};
		const unpaid = !!opts.unpaid;
		document.body.classList.toggle('scard-mode', unpaid);
		const folds = opts.folds || [];
		folds.forEach((item) => paintButton(item, opts.report || null, unpaid));
		const narrow =
			typeof window !== 'undefined' &&
			typeof window.matchMedia === 'function' &&
			window.matchMedia('(max-width: 699px)').matches;
		if (unpaid && narrow) {
			// Mobile spearhead: collapsed fold heads; glance/teaser sections stay readable (#4422).
			folds.forEach((item) => {
				if (!item || !item.panel || !item.button) return;
				const head = item.button.closest('h2, .fold-head');
				const keep =
					head &&
					(/health|prime|glance|exec/i.test(head.textContent || '') || head.dataset.indexGroup === 'glance');
				if (!keep && typeof opts.setFold === 'function') opts.setFold(item, false);
				else if (!keep) {
					item.panel.hidden = true;
					item.button.setAttribute('aria-expanded', 'false');
				}
			});
		}
	}

	window.QAReviewStatusCard = { sync: sync };
})();
