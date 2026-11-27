/**
 * Unpaid report: Print, Share, Export and similar actions open the checkout sheet (#4432 / #4422).
 * One optional fold-expand nudge per report; reuse #pay / openReportPay (#3523).
 */
(function (root) {
	'use strict';

	const GATED = ['print', 'share', 'json', 'text', 'link', 'case-export'];
	const EMAIL_KEY = 'qa-review-unlock-email';

	function mount(deps) {
		const foldNudged = {};

		function current() {
			return deps.getCurrent && deps.getCurrent();
		}

		function unpaid() {
			const c = current();
			return !!(c && c.report && !c.paid && !c.free && !c.sample);
		}

		function ensurePayEmailRow() {
			const payCard = document.querySelector('#pay .pay-card');
			const actions = payCard && payCard.querySelector('.actions');
			if (!actions) return null;
			let row = document.getElementById('pay-email-row');
			if (!row) {
				row = document.createElement('p');
				row.className = 'pay-email-row';
				row.id = 'pay-email-row';
				row.innerHTML =
					'<label for="pay-email">Email for your receipt <span class="muted">(optional)</span></label>' +
					'<input id="pay-email" type="email" name="pay-email" autocomplete="email" inputmode="email" />';
				actions.parentNode.insertBefore(row, actions);
			}
			return row;
		}

		function prefillPayEmail() {
			const input = document.getElementById('pay-email');
			if (!input || input.value.trim()) return;
			const signIn = document.getElementById('sign-in-email');
			const client = document.getElementById('client-email');
			const fromEl =
				(signIn && signIn.value.trim() && signIn) || (client && client.value.trim() && client) || null;
			if (fromEl) input.value = fromEl.value.trim();
			try {
				const saved = sessionStorage.getItem(EMAIL_KEY);
				if (saved && !input.value.trim()) input.value = saved;
			} catch (error) {
				/* storage optional */
			}
		}

		function wirePayEmail() {
			const row = ensurePayEmailRow();
			const input = document.getElementById('pay-email');
			const payBtn = document.getElementById('pay-btn');
			if (!row || !input || !payBtn) return;
			row.hidden = false;
			prefillPayEmail();
			const sync = () => {
				const email = input.value.trim();
				try {
					if (email) sessionStorage.setItem(EMAIL_KEY, email);
					else sessionStorage.removeItem(EMAIL_KEY);
				} catch (error) {
					/* storage optional */
				}
			};
			input.removeEventListener('change', input.__qaUnlockSync || (() => {}));
			input.__qaUnlockSync = sync;
			input.addEventListener('change', sync);
		}

		function hidePayEmail() {
			const row = document.getElementById('pay-email-row');
			if (row) row.hidden = true;
		}

		function openSheet(source) {
			if (!unpaid()) return false;
			if (root.SiteAnalytics)
				SiteAnalytics.trackEvent('qa_review_unlock_gate', 'URL Review', source || 'gate');
			wirePayEmail();
			deps.openReportPay();
			return true;
		}

		function spend(kind, action) {
			const c = current();
			if (!c || !c.report) return;
			if (c.paid) {
				action();
				return;
			}
			if (GATED.indexOf(kind) !== -1) {
				openSheet(kind);
				return;
			}
			const id = c.report.id;
			deps.fileUses[id] = deps.fileUses[id] || {};
			if (deps.fileUses[id][kind]) {
				openSheet(kind);
				return;
			}
			deps.fileUses[id][kind] = true;
			action();
		}

		function onFoldExpanded(reportId) {
			if (!reportId || foldNudged[reportId] || !unpaid()) return;
			foldNudged[reportId] = true;
			openSheet('fold');
		}

		function interceptToolbarClick(event) {
			if (!unpaid()) return;
			event.preventDefault();
			event.stopImmediatePropagation();
			openSheet(event.currentTarget.id || 'toolbar');
		}

		function bindToolbar() {
			['export-toggle', 'share-toggle', 'share-open'].forEach((id) => {
				const el = document.getElementById(id);
				if (el) el.addEventListener('click', interceptToolbarClick, true);
			});
			const caseExportOpen = document.getElementById('case-export-open');
			if (caseExportOpen) caseExportOpen.addEventListener('click', interceptToolbarClick, true);
			const payClose = document.getElementById('pay-close');
			if (payClose) payClose.addEventListener('click', hidePayEmail);
		}

		return { spend, openSheet, onFoldExpanded, bindToolbar, unpaid, hidePayEmail };
	}

	root.QAReviewUnlockGate = { mount };
})(typeof window !== 'undefined' ? window : globalThis);