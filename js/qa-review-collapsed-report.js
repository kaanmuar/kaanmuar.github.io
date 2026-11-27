/* Unpaid/preview report: collapsed sections by default (#4463 / #4425).
   Runs after StatusCard.sync — keeps glance, health scores, fix-first, and cases readable (#3506). */
(function () {
	'use strict';

	const ROOT_CLASS = 'report-collapsed-teaser';

	function shouldKeepOpen(item) {
		if (!item || !item.panel || !item.button) return false;
		const head = item.button.closest('h2, .fold-head, .alarm-head');
		const group = (head && head.dataset.indexGroup) || item.group || '';
		const face = head && head.dataset.face;
		if (group === 'glance' || group === 'cases') return true;
		if (face === 'health' || face === 'fixfirst') return true;
		const panel = item.panel;
		return !!panel.querySelector('#health, #fix-first, #report-visuals, #cases, #watch-cases');
	}

	function sync(opts) {
		opts = opts || {};
		const unpaid = !!opts.unpaid;
		document.body.classList.toggle(ROOT_CLASS, unpaid);
		if (!unpaid) return;
		const folds = opts.folds || [];
		folds.forEach((item) => {
			const open = shouldKeepOpen(item);
			// Direct DOM only — avoid setFold side effects on unpaid sync (#4478).
			item.panel.hidden = !open;
			item.button.setAttribute('aria-expanded', String(open));
		});
		if (typeof opts.paintFoldAll === 'function') opts.paintFoldAll();
	}

	window.QAReviewCollapsedReport = { sync: sync, shouldKeepOpen: shouldKeepOpen };
})();