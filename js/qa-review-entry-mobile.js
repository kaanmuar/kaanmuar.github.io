/* Mobile soft-gate hero-first entry (#4462 / design #4439).
   Additive — no changes to soft-gate submit, OAuth, or qa-review.js. */
(function (global) {
	'use strict';

	const MQ = '(max-width: 800px)';
	const MARK = 'assets/qa-review-mark.svg?v=20261027a';

	function isMobile() {
		return typeof matchMedia === 'function' && matchMedia(MQ).matches;
	}

	function ensureBrandRow(copy, doc) {
		const eyebrow = copy.querySelector(':scope > .eyebrow');
		if (!eyebrow || copy.querySelector('.entry-brand-row')) return;
		const row = doc.createElement('div');
		row.className = 'entry-brand-row';
		const mark = doc.createElement('img');
		mark.className = 'entry-brand-mark';
		mark.src = MARK;
		mark.alt = '';
		mark.width = 36;
		mark.height = 36;
		mark.decoding = 'async';
		row.append(mark, eyebrow);
		copy.insertBefore(row, copy.firstChild);
	}

	function boot(root) {
		const doc = root || global.document;
		if (!doc || !isMobile()) return null;
		const stage = doc.querySelector('section.stage');
		const form = doc.getElementById('stage-start');
		const gate = doc.getElementById('gate');
		if (!stage || !form) return null;

		doc.documentElement.classList.add('entry-mobile');
		stage.classList.add('entry-mobile-stage');

		const copy = stage.querySelector('.stage-copy');
		if (copy) ensureBrandRow(copy, doc);

		/* Gate stays hidden until unlock — only reinforce if markup already hid it. */
		if (gate && gate.hasAttribute('hidden')) gate.hidden = true;

		return { mq: MQ, stage: stage };
	}

	const api = { MQ: MQ, boot: boot, isMobile: isMobile };
	global.QAReviewEntryMobile = api;

	function docReady(d) {
		return d && (d.readyState === 'interactive' || d.readyState === 'complete');
	}

	if (docReady(global.document)) boot();
	else
		global.document.addEventListener('DOMContentLoaded', function () {
			boot();
		});

	if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);