/**
 * Call-your-shot chips on the soft gate, wager chip during Lab Tries, "Nailed it" on report paint (#4472).
 */
(function (root) {
	'use strict';

	const STORAGE_KEY = 'qa-review-prediction-wager';
	const CHIPS = [
		{ id: 'speed-trap', label: 'Speed Trap', area: 'Performance', focus: ['perf', 'performance', 'speed', 'lighthouse', 'cwv'] },
		{ id: 'seo-leaks', label: 'SEO Leaks', area: 'SEO', focus: ['seo', 'schema', 'canonical', 'hreflang', 'geo'] },
		{ id: 'trust-gaps', label: 'Trust Gaps', area: 'Security', focus: ['security', 'dmarc', 'hsts', 'tls', 'headers'] },
		{ id: 'ux-friction', label: 'UX Friction', area: 'Accessibility', focus: ['a11y', 'accessibility', 'axe', 'contrast', 'forms'] },
	];

	function chipOf(id) {
		return CHIPS.find(function (row) {
			return row.id === id;
		});
	}

	function readWager() {
		try {
			const raw = sessionStorage.getItem(STORAGE_KEY);
			if (!raw) return null;
			const parsed = JSON.parse(raw);
			if (!parsed || !parsed.id) return null;
			const chip = chipOf(parsed.id);
			return chip ? { id: chip.id, label: chip.label, area: chip.area, focus: chip.focus } : null;
		} catch (e) {
			return null;
		}
	}

	function writeWager(id) {
		const chip = chipOf(id);
		if (!chip) return null;
		const value = { id: chip.id, label: chip.label, at: Date.now() };
		try {
			sessionStorage.setItem(STORAGE_KEY, JSON.stringify(value));
		} catch (e2) {
			/* optional */
		}
		root.dispatchEvent(new CustomEvent('qa-review-prediction-changed', { detail: value }));
		return value;
	}

	function clearWager() {
		try {
			sessionStorage.removeItem(STORAGE_KEY);
		} catch (e) {
			/* optional */
		}
		root.dispatchEvent(new CustomEvent('qa-review-prediction-changed', { detail: null }));
	}

	function focusKeys(report) {
		const out = [];
		[].concat(report && report.focus ? report.focus : []).forEach(function (k) {
			if (k) out.push(String(k).toLowerCase());
		});
		((report && report.tags) || []).forEach(function (tag) {
			if (tag && tag.g === 'focus' && tag.k) out.push(String(tag.k).toLowerCase());
		});
		return out;
	}

	function weakestArea(areas) {
		let name = '';
		let score = 101;
		Object.keys(areas || {}).forEach(function (key) {
			const row = areas[key] || {};
			const value = Number(row.score);
			if (!Number.isFinite(value)) return;
			if (value < score) {
				score = value;
				name = key;
			}
		});
		return name;
	}

	function evaluate(ins, report, wager) {
		const target = wager || readWager();
		if (!target || !ins) return { nailed: false, area: target && target.area };
		const chip = chipOf(target.id);
		if (!chip) return { nailed: false };
		const top = (ins.findings || []).find(function (row) {
			return row.rank === 1;
		});
		if (top && top.area === chip.area) {
			return { nailed: true, area: chip.area, why: 'top' };
		}
		const areas = (ins.score && ins.score.areas) || {};
		if (weakestArea(areas) === chip.area) {
			return { nailed: true, area: chip.area, why: 'weakest' };
		}
		const keys = focusKeys(report || {});
		if (keys.some(function (k) { return chip.focus.indexOf(k) !== -1; })) {
			return { nailed: true, area: chip.area, why: 'focus' };
		}
		return { nailed: false, area: chip.area };
	}

	function ensureWagerChip(host) {
		if (!host) return null;
		let chip = host.querySelector('.qa-pred-wager');
		if (!chip) {
			chip = document.createElement('span');
			chip.className = 'qa-pred-wager';
			chip.setAttribute('translate', 'no');
			chip.hidden = true;
			host.appendChild(chip);
		}
		return chip;
	}

	function syncProgressWager() {
		const row = document.querySelector('#run-panel .rp-beat');
		const chip = ensureWagerChip(row);
		const wager = readWager();
		if (!chip) return;
		if (!wager || !row) {
			chip.hidden = true;
			return;
		}
		chip.textContent = wager.label;
		chip.title = 'Your call: ' + wager.label;
		chip.hidden = false;
	}

	function clearNailed() {
		document.querySelectorAll('.qa-pred-nailed').forEach(function (node) {
			node.remove();
		});
		document.querySelectorAll('.area.is-pred-nailed').forEach(function (node) {
			node.classList.remove('is-pred-nailed');
		});
	}

	function badgeHtml(label) {
		return (
			'<span class="qa-pred-nailed" translate="no" title="Your call matched this part of the report">' +
			esc(label) +
			'</span>'
		);
	}

	function esc(value) {
		return String(value == null ? '' : value)
			.replace(/&/g, '&amp;')
			.replace(/</g, '&lt;')
			.replace(/>/g, '&gt;')
			.replace(/"/g, '&quot;');
	}

	function paintNailed(ins, report) {
		clearNailed();
		const wager = readWager();
		if (!wager) return;
		const match = evaluate(ins, report, wager);
		const health = document.getElementById('health');
		if (health) {
			const chip = ensureWagerChip(health.querySelector('.health') || health);
			chip.textContent = wager.label;
			chip.title = 'Your call: ' + wager.label;
			chip.hidden = false;
		}
		if (!match.nailed) return;
		const nailed = badgeHtml('Nailed it');
		const ringWrap = health && health.querySelector('.health');
		if (ringWrap) {
			const ring = ringWrap.querySelector('.ring');
			if (ring && !ring.querySelector('.qa-pred-nailed')) {
				ring.insertAdjacentHTML('beforeend', nailed);
			}
		}
		const areaBtn = health && health.querySelector('.area[data-area="' + match.area + '"]');
		if (areaBtn) areaBtn.classList.add('is-pred-nailed');
		const fix = document.getElementById('fix-first');
		const prime = fix && fix.querySelector('ol li');
		if (prime && !prime.querySelector('.qa-pred-nailed')) {
			const title = prime.querySelector('strong');
			if (title) title.insertAdjacentHTML('afterend', ' ' + nailed);
			else prime.insertAdjacentHTML('afterbegin', nailed);
		}
	}

	function mountEntry() {
		const form = document.getElementById('stage-start');
		if (!form || form.querySelector('.qa-pred-entry')) return;
		const block = document.createElement('div');
		block.className = 'qa-pred-entry';
		block.innerHTML =
			'<p class="qa-pred-prompt" translate="no">Call the flaw before we run it</p>' +
			'<div class="qa-pred-chips" role="group" aria-label="Optional prediction">' +
			CHIPS.map(function (chip) {
				return (
					'<button type="button" class="qa-pred-chip" data-pred="' +
					esc(chip.id) +
					'" translate="no">' +
					esc(chip.label) +
					'</button>'
				);
			}).join('') +
			'</div>';
		const note = form.querySelector('.stage-start-note');
		form.insertBefore(block, note || null);
		const saved = readWager();
		block.addEventListener('click', function (event) {
			const button = event.target.closest('.qa-pred-chip');
			if (!button) return;
			const id = button.getAttribute('data-pred');
			const on = button.classList.contains('is-on');
			block.querySelectorAll('.qa-pred-chip').forEach(function (node) {
				node.classList.remove('is-on');
				node.setAttribute('aria-pressed', 'false');
			});
			if (on) {
				clearWager();
				return;
			}
			button.classList.add('is-on');
			button.setAttribute('aria-pressed', 'true');
			writeWager(id);
			syncProgressWager();
		});
		if (saved) {
			const active = block.querySelector('.qa-pred-chip[data-pred="' + saved.id + '"]');
			if (active) {
				active.classList.add('is-on');
				active.setAttribute('aria-pressed', 'true');
			}
		}
	}

	function hookProgress() {
		const prog = root.ReviewProgress;
		if (!prog || prog.__predHooked) return;
		const orig = {
			start: prog.start,
			reset: prog.reset,
		};
		prog.start = function (options) {
			const out = orig.start(options);
			syncProgressWager();
			return out;
		};
		prog.reset = function () {
			const out = orig.reset();
			syncProgressWager();
			clearNailed();
			return out;
		};
		prog.__predHooked = true;
	}

	function boot() {
		mountEntry();
		hookProgress();
		syncProgressWager();
		root.addEventListener('qa-review-prediction-changed', syncProgressWager);
	}

	root.QAReviewPrediction = {
		STORAGE_KEY: STORAGE_KEY,
		CHIPS: CHIPS,
		readWager: readWager,
		writeWager: writeWager,
		clearWager: clearWager,
		evaluate: evaluate,
		onReport: function (payload) {
			const report = payload && payload.report;
			const ins = (payload && payload.ins) || (report && report.insights);
			paintNailed(ins, report);
		},
	};

	if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
	else boot();
	if (!root.ReviewProgress) {
		document.addEventListener('DOMContentLoaded', hookProgress);
		root.setTimeout(hookProgress, 0);
	}
})(window);