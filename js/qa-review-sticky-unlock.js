/**
 * Mobile sticky Unlock CTA on unpaid frosted reports (#4464 / #4432).
 * Reuses QAReviewUnlockGate.openSheet / #pay — no separate checkout.
 */
(function (root) {
	'use strict';

	const MQ = '(max-width: 699px)';
	const GATED = [
		{ kind: 'print', label: 'Print' },
		{ kind: 'share', label: 'Share' },
		{ kind: 'json', label: 'Export' },
	];

	function mount(deps) {
		deps = deps || {};
		let bar = null;
		let mq = null;
		let payObs = null;
		let dashObs = null;
		let lastUnpaid = false;

		function current() {
			return deps.getCurrent && deps.getCurrent();
		}

		function unpaidPayload() {
			const c = current();
			return !!(c && c.report && !c.paid && !c.free && !c.sample);
		}

		function dashOpen() {
			const el = deps.dashEl || document.getElementById('dash-overlay');
			return !!(el && el.classList.contains('open'));
		}

		function payOpen() {
			const pay = deps.payEl || document.getElementById('pay');
			return !!(pay && !pay.hidden);
		}

		function narrow() {
			return mq && mq.matches;
		}

		function shouldShow() {
			return lastUnpaid && unpaidPayload() && narrow() && dashOpen() && !payOpen();
		}

		function formatPrice() {
			const usd = typeof deps.priceUsd === 'function' ? deps.priceUsd() : 5;
			const fmt = typeof deps.formatUsd === 'function' ? deps.formatUsd(usd) : String(usd);
			return fmt;
		}

		function ensureBar() {
			if (bar) return bar;
			bar = document.createElement('aside');
			bar.id = 'qa-sticky-unlock';
			bar.className = 'qa-sticky-unlock no-print';
			bar.setAttribute('role', 'region');
			bar.setAttribute('aria-label', 'Unlock report');
			bar.hidden = true;

			const acts = document.createElement('div');
			acts.className = 'qa-sticky-unlock-acts';
			GATED.forEach((item) => {
				const btn = document.createElement('button');
				btn.type = 'button';
				btn.className = 'qa-sticky-unlock-gated';
				btn.setAttribute('data-kind', item.kind);
				btn.textContent = item.label;
				btn.addEventListener('click', (event) => {
					event.preventDefault();
					if (deps.openSheet) deps.openSheet('sticky-' + item.kind);
				});
				acts.appendChild(btn);
			});

			const main = document.createElement('button');
			main.type = 'button';
			main.className = 'qa-sticky-unlock-main';
			const title = document.createElement('span');
			title.className = 'qa-sticky-unlock-title';
			const sub = document.createElement('small');
			sub.className = 'qa-sticky-unlock-sub';
			sub.textContent =
				(typeof deps.subline === 'function' && deps.subline()) ||
				'One-time · full findings, PDF, share, print';
			main.append(title, sub);
			main.addEventListener('click', (event) => {
				event.preventDefault();
				if (deps.openSheet) deps.openSheet('sticky');
			});

			bar.append(acts, main);
			document.body.appendChild(bar);
			return bar;
		}

		function paint() {
			if (!shouldShow()) {
				if (bar) bar.hidden = true;
				document.body.classList.remove('sticky-unlock-on');
				return;
			}
			const node = ensureBar();
			const price = formatPrice();
			const title = node.querySelector('.qa-sticky-unlock-title');
			if (title) {
				title.textContent =
					(typeof deps.title === 'function' && deps.title(price)) ||
					'Unlock full lab report — ' + price + ' USD';
			}
			node.hidden = false;
			document.body.classList.add('sticky-unlock-on');
		}

		function sync(opts) {
			opts = opts || {};
			lastUnpaid = !!opts.unpaid;
			if (opts.sample) lastUnpaid = false;
			paint();
		}

		function bindObservers() {
			if (typeof root.matchMedia === 'function') {
				mq = root.matchMedia(MQ);
				const onMq = () => paint();
				if (mq.addEventListener) mq.addEventListener('change', onMq);
				else if (mq.addListener) mq.addListener(onMq);
			}
			const pay = deps.payEl || document.getElementById('pay');
			if (pay && typeof MutationObserver !== 'undefined') {
				payObs = new MutationObserver(paint);
				payObs.observe(pay, { attributes: true, attributeFilter: ['hidden'] });
			}
			const dash = deps.dashEl || document.getElementById('dash-overlay');
			if (dash && typeof MutationObserver !== 'undefined') {
				dashObs = new MutationObserver(paint);
				dashObs.observe(dash, { attributes: true, attributeFilter: ['class'] });
			}
		}

		bindObservers();

		return { sync, paint, shouldShow, unpaidPayload, MQ };
	}

	root.QAReviewStickyUnlock = { mount, MQ };
})(typeof window !== 'undefined' ? window : globalThis);