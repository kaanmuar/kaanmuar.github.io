/* Dev-only landmark announcement panel (#3832). Opt-in via ?landmarks=1 (persists to
   localStorage key qa-landmarks) or localStorage alone; ?landmarks=0 clears and hides.
   Not customer-facing: pages load this file, but it no-ops unless the flag is on.
   When enabled it pulls js/landmark-announce.js and css/landmark-preview.css (self-hosted). */
(function (root, factory) {
	const api = factory(root);
	if (typeof module === 'object' && module.exports) module.exports = api;
	if (root) root.LandmarkPreviewUI = api;
})(typeof window !== 'undefined' ? window : globalThis, (root) => {
	'use strict';

	const STORAGE_KEY = 'qa-landmarks';
	const PANEL_ID = 'landmark-preview-panel';
	const CSS_HREF = 'css/landmark-preview.css?v=20261121-3832';
	const ANNOUNCE_SRC = 'js/landmark-announce.js?v=20261121-3832';

	function flagFromSearch(search) {
		const q = new URLSearchParams(search || '').get('landmarks');
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

	function ensureCss() {
		if (typeof document === 'undefined') return;
		if (document.querySelector('link[data-landmark-preview-css]')) return;
		const link = document.createElement('link');
		link.rel = 'stylesheet';
		link.href = CSS_HREF;
		link.setAttribute('data-landmark-preview-css', '1');
		document.head.appendChild(link);
	}

	function loadAnnounce() {
		return new Promise((resolve, reject) => {
			if (root && root.LandmarkAnnounce) {
				resolve(root.LandmarkAnnounce);
				return;
			}
			if (typeof document === 'undefined') {
				reject(new Error('no document'));
				return;
			}
			const existing = document.querySelector('script[data-landmark-announce]');
			if (existing) {
				existing.addEventListener('load', () => resolve(root.LandmarkAnnounce));
				existing.addEventListener('error', () => reject(new Error('landmark-announce load failed')));
				return;
			}
			const s = document.createElement('script');
			s.src = ANNOUNCE_SRC;
			s.async = true;
			s.setAttribute('data-landmark-announce', '1');
			s.onload = () => resolve(root.LandmarkAnnounce);
			s.onerror = () => reject(new Error('landmark-announce load failed'));
			document.head.appendChild(s);
		});
	}

	function render(api) {
		if (typeof document === 'undefined' || !api) return null;
		const prior = document.getElementById(PANEL_ID);
		if (prior) prior.remove();

		const result = api.announce(api.fromElement(document.documentElement));
		const panel = document.createElement('aside');
		panel.id = PANEL_ID;
		panel.className = 'landmark-preview';
		// Keep the overlay out of the next announce() walk (helper honours aria-hidden).
		panel.setAttribute('aria-hidden', 'true');

		const head = document.createElement('div');
		head.className = 'landmark-preview__head';
		const title = document.createElement('strong');
		title.textContent = 'Landmark preview';
		const note = document.createElement('span');
		note.className = 'landmark-preview__note';
		note.textContent = 'dev · ?landmarks=0 to hide';
		head.appendChild(title);
		head.appendChild(note);

		const actions = document.createElement('div');
		actions.className = 'landmark-preview__actions';
		const speakBtn = document.createElement('button');
		speakBtn.type = 'button';
		speakBtn.className = 'landmark-preview__btn';
		speakBtn.textContent = 'Speak';
		speakBtn.addEventListener('click', () => {
			if (typeof api.speak === 'function') api.speak(document);
		});
		const refreshBtn = document.createElement('button');
		refreshBtn.type = 'button';
		refreshBtn.className = 'landmark-preview__btn';
		refreshBtn.textContent = 'Refresh';
		refreshBtn.addEventListener('click', () => render(api));
		const closeBtn = document.createElement('button');
		closeBtn.type = 'button';
		closeBtn.className = 'landmark-preview__btn landmark-preview__btn--ghost';
		closeBtn.textContent = 'Close';
		closeBtn.addEventListener('click', () => {
			try {
				localStorage.removeItem(STORAGE_KEY);
			} catch (_) {
				/* ignore */
			}
			panel.remove();
		});
		actions.appendChild(speakBtn);
		actions.appendChild(refreshBtn);
		actions.appendChild(closeBtn);

		panel.appendChild(head);
		panel.appendChild(actions);
		if (result.warnings && result.warnings.length) {
			const warns = document.createElement('ul');
			warns.className = 'landmark-preview__warnings';
			for (const w of result.warnings) {
				const li = document.createElement('li');
				li.textContent = w.message || w.id;
				warns.appendChild(li);
			}
			panel.appendChild(warns);
		}

		if (result.lines && result.lines.length) {
			const list = document.createElement('ol');
			list.className = 'landmark-preview__lines';
			for (const line of result.lines) {
				const li = document.createElement('li');
				li.textContent = line;
				list.appendChild(li);
			}
			panel.appendChild(list);
		} else {
			const empty = document.createElement('p');
			empty.className = 'landmark-preview__empty';
			empty.textContent = 'No landmarks or H1 found.';
			panel.appendChild(empty);
		}

		document.body.appendChild(panel);
		return panel;
	}

	function boot(opts) {
		if (typeof document === 'undefined') return false;
		if (!isEnabled(opts)) return false;
		ensureCss();
		const start = () => {
			loadAnnounce()
				.then((api) => {
					if (api) render(api);
				})
				.catch(() => {
					/* leave silent when the helper fails to load */
				});
		};
		if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
		else start();
		return true;
	}

	if (typeof document !== 'undefined') boot();

	return { STORAGE_KEY, PANEL_ID, isEnabled, flagFromSearch, boot, render, ensureCss, loadAnnounce };
});
